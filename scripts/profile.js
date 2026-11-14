#!/usr/bin/env node
'use strict';
// Build / refresh .ui-guard/profile.md (§3.1). Detection only — answers to questions are merged from --answers.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');
const ng = require('./lib/angular');
const classUsage = require('./class-usage');

function detectRoleMap(root) {
  const app = path.join(root, 'src', 'app');
  const out = [];
  if (!u.isDir(app)) return project.DEFAULT_ROLE_MAP;
  const dirs = u.walk(app, (name) => ['node_modules'].includes(name)).map((f) => u.relPosix(root, path.dirname(f)));
  const uniq = [...new Set(dirs)];
  const pick = (re, prefixes, role) => {
    const hit = uniq.map((d) => (re.exec(d) || [])[0]).filter(Boolean).sort((a, b) => a.length - b.length)[0];
    if (hit && !out.some((o) => o.glob === hit + '/**')) out.push({ glob: hit + '/**', prefixes, role });
  };
  pick(/^src\/app\/(.*\/)?(layout|layouts|shell)(?=\/|$)/, ['l-'], 'layout');
  pick(/^src\/app\/(.*\/)?(pages|features|views|routes)(?=\/|$)/, ['p-'], 'page');
  pick(/^src\/app\/(.*\/)?shared\/components(?=\/|$)/, ['c-'], 'component');
  pick(/^src\/app\/(.*\/)?(components)(?=\/|$)/, ['c-'], 'component');
  pick(/^src\/app\/(.*\/)?(widgets|controls)(?=\/|$)/, ['m-', 'ctrl-'], 'module');
  pick(/^src\/app\/(.*\/)?shared\/(modules)(?=\/|$)/, ['m-', 'ctrl-'], 'module');
  return out.length ? out : project.DEFAULT_ROLE_MAP;
}

function detectRoutes(root) {
  const routes = [];
  for (const f of u.walk(path.join(root, 'src', 'app')).filter((x) => /routes?\.ts$|routing(\.module)?\.ts$/.test(x))) {
    const t = u.readText(f) || '';
    for (const m of t.matchAll(/path\s*:\s*['"]([^'"]*)['"]/g)) if (!/[:*]/.test(m[1]) && !routes.includes('/' + m[1])) routes.push('/' + m[1]);
  }
  return routes.slice(0, 20);
}

function detectI18n(root, pkg) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  let library = 'none';
  if (deps['@ngx-translate/core']) library = 'ngx-translate';
  else if (deps['@jsverse/transloco'] || deps['@ngneat/transloco']) library = 'transloco';
  else if (deps['@angular/localize']) library = 'angular-i18n';
  const files = project.listUiFiles(root, {}).filter((f) => f.kind === 'translation').map((f) => f.rel);
  if (library === 'none' && files.some((f) => f.endsWith('.i18n.ts'))) library = 'ts-dictionaries';
  const dirs = [...new Set(files.map((f) => f.replace(/\/[^/]+$/, '')))];
  const langs = [...new Set(files.map((f) => require('./i18n-check').langOf(f).lang))].filter((l) => l !== 'source').sort();
  return { library, paths: dirs, files, languages: langs };
}

function detectTheme(root, sr) {
  const active = path.join(root, ...sr.split('/'), 'theme');
  const activeFiles = u.isDir(active) ? u.walk(active).map((f) => u.relPosix(root, f)) : [];
  const sources = [];
  const themesRoot = path.join(root, 'src', 'assets', 'themes');
  if (u.isDir(themesRoot)) for (const n of fs.readdirSync(themesRoot).sort()) if (u.isDir(path.join(themesRoot, n))) sources.push(n);
  let matches = 'none';
  for (const n of sources) {
    const td = path.join(themesRoot, n, 'theme');
    if (!u.isDir(td) || !u.isDir(active)) continue;
    const a = u.walk(active).map((f) => u.relPosix(active, f)).sort();
    const b = u.walk(td).map((f) => u.relPosix(td, f)).sort();
    if (a.join('|') === b.join('|') && a.every((r) => u.sha1(fs.readFileSync(path.join(active, ...r.split('/')))) === u.sha1(fs.readFileSync(path.join(td, ...r.split('/')))))) { matches = n; break; }
  }
  const families = {};
  const hslParts = [], filterTokens = [];
  for (const f of activeFiles.filter((x) => x.endsWith('.css'))) {
    for (const p of css.customProps(css.parse(u.readText(path.join(root, ...f.split('/'))) || ''))) {
      const m = /^--([a-z]+)-(\d+)$/.exec(p.name);
      if (m) (families[m[1]] = families[m[1]] || []).push(+m[2]);
      if (/^--([\w-]*-)?(hue|saturation|lightness)$/.test(p.name)) hslParts.push(p.name);
      if (/-img$/.test(p.name)) filterTokens.push(p.name);
    }
  }
  for (const k of Object.keys(families)) families[k] = [...new Set(families[k])].sort((a, b) => a - b);
  return { activeFolder: u.relPosix(root, active), activeFiles, sources, activeMatches: matches, families, hslParts, filterTokens };
}

function detectTools(root, sr) {
  const out = {};
  const toolsDir = path.join(root, ...sr.split('/'));
  if (!u.isDir(toolsDir)) return out;
  for (const f of u.walk(toolsDir, (n) => n === 'packages').filter((x) => x.endsWith('.scss'))) {
    const t = u.readText(f) || '';
    for (const m of t.matchAll(/@(?:mixin|function)\s+(px|mq|dir|after|before|hover|scroll)\b/g)) if (!out[m[1]]) out[m[1]] = u.relPosix(root, f);
  }
  return out;
}

function detectRootFontSize(root, sr) {
  const dir = path.join(root, ...sr.split('/'));
  const files = u.isDir(dir) ? u.walk(dir, (n) => n === 'packages').filter((x) => /\.s?css$/.test(x)) : [];
  files.push(path.join(root, 'src', 'styles.scss'), path.join(root, 'src', 'styles.css'));
  for (const f of files) {
    const t = u.readText(f);
    if (!t) continue;
    const m = /(^|[\s,}])html\s*\{[^}]*?font-size\s*:\s*([\d.]+)(px|%)/.exec(t);
    if (m) return m[3] === '%' ? (16 * parseFloat(m[2])) / 100 : parseFloat(m[2]);
  }
  return 16;
}

function detectButton(root, profile) {
  const counts = {};
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'html')) {
    for (const us of classUsage.usages(u.readText(f.abs) || '', true)) if (/btn|button/i.test(us.cls)) counts[us.cls] = (counts[us.cls] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const defs = classUsage.definitions(root, profile);
  const top = ranked.find(([c]) => defs.has(c));
  return { candidates: ranked.slice(0, 8).map(([c, n]) => ({ class: c, uses: n, definedIn: defs.has(c) ? defs.get(c)[0].file : null })), chosen: top ? { class: top[0], file: defs.get(top[0])[0].file } : null, decision: null };
}

function detectInstalled(root) {
  const has = (p) => u.exists(path.join(root, 'node_modules', ...p.split('/'), 'package.json'));
  return {
    stylelint: has('stylelint') && has('postcss-scss') && has('stylelint-scss'),
    eslint: has('eslint') && (has('angular-eslint') || has('@angular-eslint/eslint-plugin-template')),
    playwright: has('playwright') || has('@playwright/test'),
    pixelmatch: has('pixelmatch') && has('pngjs'),
  };
}

function build(root, previous = {}) {
  const pkg = u.readJSON(path.join(root, 'package.json'), {});
  const ngc = ng.readAngular(root, previous) || {};
  const sr = (previous.scss && previous.scss.root) || 'src/assets/scss';
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const idx = u.readText(path.join(root, 'src', 'index.html')) || '';
  const htmlTag = /<html\b[^>]*>/i.exec(idx);
  const attr = (tag, name) => (tag && (new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag) || [])[1]) || null;
  const links = require('./angular-config-check').stylesheetLinks(idx).links.map((l) => l.href);
  const favicon = (/<link[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(idx) || [])[1] || null;
  const opts = ngc.options || {};
  const segments = {};
  for (const s of project.SEGMENTS) segments[s] = u.isDir(path.join(root, ...sr.split('/'), s));
  const detected = {
    angular: {
      version: (deps['@angular/core'] || '').replace(/^[^\d]*/, '') || null,
      major: parseInt((deps['@angular/core'] || '').replace(/^[^\d]*/, ''), 10) || null,
      builder: /application/.test(ngc.builder || '') ? 'application' : /browser/.test(ngc.builder || '') ? 'browser' : (ngc.builder || null),
      project: ngc.name || null,
      styles: (ngc.styles || []).map((s) => s.raw),
      includePaths: (opts.stylePreprocessorOptions && opts.stylePreprocessorOptions.includePaths) || [],
      externalDependencies: opts.externalDependencies || [],
    },
    index: { lang: attr(htmlTag && htmlTag[0], 'lang'), dir: attr(htmlTag && htmlTag[0], 'dir'), baseHref: (/<base\s+href\s*=\s*["']([^"']*)["']/i.exec(idx) || [])[1] || null, stylesheets: links, favicon },
    rootFontSize: detectRootFontSize(root, sr),
    scss: { root: sr, segments },
    tools: detectTools(root, sr),
    theme: detectTheme(root, sr),
    roleMapDetected: detectRoleMap(root),
    i18n: detectI18n(root, pkg),
    devServer: { port: ngc.port || 4200 },
    routesDetected: detectRoutes(root),
    installed: detectInstalled(root),
  };
  detected.button = detectButton(root, { ...previous, ...detected });
  // Merge: previous answers win (ask once, remember — P9)
  const merged = { ...detected, ...pick(previous, ['projectType', 'answers', 'roleMap', 'screenshots', 'devServerChoice', 'toolsDeclined', 'designLink', 'themeName', 'colorSources', 'buttonDecision']) };
  merged.roleMap = previous.roleMap || detected.roleMapDetected;
  merged.devServer = { ...detected.devServer, ...(previous.devServer || {}) };
  merged.button = { ...detected.button, decision: (previous.button && previous.button.decision) || null };
  merged.i18n = { ...detected.i18n, ...(previous.i18n && previous.i18n.paths && previous.i18n.confirmed ? { paths: previous.i18n.paths, confirmed: true } : {}) };
  merged.generatedAt = new Date().toISOString();
  return merged;
}
function pick(o, keys) { const r = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r; }

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a || {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
}

function render(p) {
  const yes = (b) => (b ? 'yes' : 'no');
  const L = [];
  L.push('# ui-guard project profile', '', 'Written by ui-guard. Reused by every command. Rebuild with `/ui-guard:scan --refresh-profile`.', 'Answers given once are kept (section "Answers"). The JSON block at the end is what scripts read.', '');
  L.push('## Project', `- Project type: **${p.projectType || 'unknown'}**`, `- Angular: ${p.angular.version || '?'} · builder \`${p.angular.builder || '?'}\` · project \`${p.angular.project || '?'}\``);
  L.push(`- Global styles (in order): ${p.angular.styles.length ? p.angular.styles.map((s) => '`' + (typeof s === 'string' ? s : s.input) + '`').join(' → ') : '(none)'}`);
  L.push(`- includePaths: ${p.angular.includePaths.map((s) => '`' + s + '`').join(', ') || '(none)'} · externalDependencies: ${p.angular.externalDependencies.map((s) => '`' + s + '`').join(', ') || '(none)'}`);
  L.push(`- index.html: lang \`${p.index.lang}\` · dir \`${p.index.dir}\` · base \`${p.index.baseHref}\` · favicon \`${p.index.favicon}\``);
  L.push(`- Stylesheet links in <head>: ${p.index.stylesheets.map((s) => '`' + s + '`').join(' → ') || '(none)'}`);
  L.push(`- Root font size: ${p.rootFontSize}px (px() and rem conversions use it)`, '');
  L.push('## SCSS', `- Root: \`${p.scss.root}\``, `- Segments present: ${Object.entries(p.scss.segments).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ')}`);
  L.push(`- Tools found: ${Object.entries(p.tools).map(([k, v]) => `\`${k}\` (${v})`).join(', ') || '(none)'}`, '');
  L.push('## Theme', `- Active folder: \`${p.theme.activeFolder}\` (${p.theme.activeFiles.length} files)`, `- Theme sources: ${p.theme.sources.join(', ') || '(none)'} · active copy matches: **${p.theme.activeMatches}**`);
  L.push(`- Color families: ${Object.entries(p.theme.families).map(([k, v]) => `${k} (${v.join(', ')})`).join('; ') || '(none)'}`, `- HSL parts: ${p.theme.hslParts.join(', ') || '(none)'} · filter tokens: ${p.theme.filterTokens.join(', ') || '(none)'}`, '');
  L.push('## Folder → role map (Angular component styles)', '| Folder | Prefix | Role |', '|---|---|---|');
  for (const r of p.roleMap) L.push(`| \`${r.glob}\` | ${r.prefixes.map((x) => '`' + x + '`').join(' ')} | ${r.role} |`);
  L.push(`- Confirmed by the developer: ${yes(p.answers && p.answers.roleMapConfirmed)}`, '');
  L.push('## Translation', `- Library: ${p.i18n.library} · languages: ${p.i18n.languages.join(', ') || '(none)'}`, `- Paths: ${p.i18n.paths.map((x) => '`' + x + '`').join(', ') || '(none)'}`, '');
  L.push('## Button', `- Candidates: ${p.button.candidates.map((c) => `\`${c.class}\`×${c.uses}`).join(', ') || '(none)'}`, `- Decision (§5.7): ${p.button.decision || 'not decided yet'}`, '');
  L.push('## Dev server and screenshots', `- Port: ${p.devServer.port} · how: ${p.devServer.mode || 'ask'}${p.devServer.url ? ' · URL ' + p.devServer.url : ''}`);
  const sc = p.screenshots || {};
  L.push(`- Routes: ${(sc.routes || []).join(', ') || '(not confirmed yet)'} · detected: ${p.routesDetected.join(', ') || '(none)'}`, `- Viewports: ${(sc.viewports || ['1440x900', '375x812']).join(', ')} · masks: ${(sc.masks || []).join(', ') || '(none)'} · auth state: \`.ui-guard/tmp/auth/state.json\` (git-ignored)`, '');
  L.push('## Tools', `- Installed: ${Object.entries(p.installed).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ')}`, `- Declined: ${(p.toolsDeclined || []).join(', ') || '(none)'}`, '');
  L.push('## Answers', ...(p.answers && Object.keys(p.answers).length ? Object.entries(p.answers).map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`) : ['- (none yet)']), '');
  L.push('## Machine-readable', '', '```json', JSON.stringify(p, null, 2), '```', '');
  return L.join('\n');
}

module.exports = { build, render, detectRoleMap, detectInstalled };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['refresh', 'print']);
  u.helpExit(args, `profile.js — build or refresh .ui-guard/profile.md (§3.1).
Usage: node profile.js [--root <dir>] [--refresh] [--answers <json-file-or-inline-json>] [--set key=value] [--print]
  --refresh        recompute detection (keeps every saved answer)
  --answers <x>    deep-merge a JSON object of answers/decisions into the profile (e.g. {"projectType":"existing","roleMap":[...]})
  --set k=v        set one top-level JSON key (value parsed as JSON when possible)
  --print          print the profile JSON`);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('This is not an Angular project (no angular.json).'); process.exit(1); }
  const p = project.paths(root);
  const previous = project.readProfile(root);
  let prof = (args.refresh || !Object.keys(previous).length) ? build(root, previous) : previous;
  if (args.answers) {
    const raw = u.exists(args.answers) ? u.readText(args.answers) : args.answers;
    prof = deepMerge(prof, JSON.parse(raw));
  }
  if (args.set) { const [k, ...rest] = String(args.set).split('='); let v = rest.join('='); try { v = JSON.parse(v); } catch { /* string */ } prof[k] = v; }
  u.writeText(p.profile, render(prof));
  console.log(`profile written → ${u.relPosix(root, p.profile)} (type: ${prof.projectType || 'unknown'}, ${prof.roleMap.length} role-map rows, tools: ${Object.entries(prof.installed).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'})`);
  if (args.print) console.log(JSON.stringify(prof, null, 2));
}
