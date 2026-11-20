'use strict';
// Project root, profile, paths and UI-file classification (§3.1, §3.6).
const fs = require('fs');
const path = require('path');
const u = require('./util');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
// bin/obj: .NET build output (ui-code-review skips them too).
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.angular', 'coverage', '.ui-guard', '.git', '.githooks', '.vscode', '.idea', 'bin', 'obj']);
const ASSET_EXT = new Set(['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp4', 'webm', 'ogg', 'mov']);

/**
 * Nearest folder (walking up) that contains angular.json. When there is none, the nearest folder with a .sln
 * (else a .csproj) — an ASP.NET MVC / Razor project, reviewed with the same rules as ui-code-review.
 */
function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  try { if (fs.statSync(dir).isFile()) dir = path.dirname(dir); } catch { /* not a path on disk yet */ dir = path.dirname(dir); }
  const first = dir;
  for (;;) {
    if (u.exists(path.join(dir, 'angular.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  for (const ext of ['.sln', '.csproj']) {
    dir = first;
    for (;;) {
      let names = [];
      try { names = fs.readdirSync(dir); } catch { /* unreadable */ }
      if (names.some((n) => n.toLowerCase().endsWith(ext))) return dir;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

/** 'angular' when the root has angular.json, else 'mvc' (ASP.NET MVC / Razor). */
function stackOf(root) { return root && u.exists(path.join(root, 'angular.json')) ? 'angular' : 'mvc'; }

function paths(root) {
  const ug = path.join(root, '.ui-guard');
  return {
    root, ug,
    profile: path.join(ug, 'profile.md'),
    report: path.join(ug, 'report.md'),
    findings: path.join(ug, 'findings.json'),
    plan: path.join(ug, 'plan.md'),
    baseline: path.join(ug, 'baseline.json'),
    renames: path.join(ug, 'renames.md'),
    history: path.join(ug, 'history'),
    fixes: path.join(ug, 'fixes'),
    checks: path.join(ug, 'checks'),
    lint: path.join(ug, 'lint'),
    bin: path.join(ug, 'bin'),
    tmp: path.join(ug, 'tmp'),
    scan: path.join(ug, 'tmp', 'scan'),
    checkTmp: path.join(ug, 'tmp', 'check'),
    marker: path.join(ug, 'tmp', 'check-pass.json'),
    auth: path.join(ug, 'tmp', 'auth', 'state.json'),
  };
}

function hasProfile(root) { return !!root && u.exists(paths(root).profile); }

/** Read the fenced ```json block at the end of profile.md. Returns {} if none. */
function readProfile(root) {
  const t = u.readText(paths(root).profile);
  if (!t) return {};
  const blocks = [...t.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (!blocks.length) return {};
  try { return JSON.parse(blocks[blocks.length - 1][1]); } catch { return {}; }
}

function scssRoot(profile) { return (profile && profile.scss && profile.scss.root) || 'src/assets/scss'; }

/** Default folder → role map for Angular component styles (§3.1). */
const DEFAULT_ROLE_MAP = [
  { glob: 'src/app/layout/**', prefixes: ['l-'], role: 'layout' },
  { glob: 'src/app/layouts/**', prefixes: ['l-'], role: 'layout' },
  { glob: 'src/app/pages/**', prefixes: ['p-'], role: 'page' },
  { glob: 'src/app/features/**', prefixes: ['p-'], role: 'page' },
  { glob: 'src/app/shared/components/**', prefixes: ['c-'], role: 'component' },
  { glob: 'src/app/shared/modules/**', prefixes: ['m-', 'ctrl-'], role: 'module' },
  { glob: 'src/app/shared/widgets/**', prefixes: ['m-', 'ctrl-'], role: 'module' },
  { glob: 'src/app/components/**', prefixes: ['c-'], role: 'component' },
];
function roleMap(profile) { return (profile && Array.isArray(profile.roleMap) && profile.roleMap.length) ? profile.roleMap : DEFAULT_ROLE_MAP; }

const SEGMENTS = ['settings', 'tools', 'generic', 'elements', 'common', 'objects', 'components', 'layout', 'modules', 'pages', 'packages', 'utilities', 'theme'];
const SEGMENT_PREFIX = { objects: ['o-'], components: ['c-'], layout: ['l-'], modules: ['m-', 'ctrl-'], pages: ['p-'], utilities: ['u-'] };
const STATE_PREFIXES = ['is-', 'has-', 'js-'];

/** Segment of a global SCSS file, or the Angular role of a component style. */
function segmentOf(rel, profile) {
  const sr = scssRoot(profile) + '/';
  if (rel.startsWith(sr)) {
    const seg = rel.slice(sr.length).split('/')[0];
    if (SEGMENTS.includes(seg)) return { segment: seg, prefixes: SEGMENT_PREFIX[seg] || [] };
    return { segment: 'entry', prefixes: [] };
  }
  if (/^src\/assets\/themes\/[^/]+\/theme\//.test(rel)) return { segment: 'theme', prefixes: [] };
  for (const r of roleMap(profile)) if (u.globMatch(r.glob, rel)) return { segment: 'angular-' + (r.role || 'component'), prefixes: r.prefixes };
  if (rel.startsWith('src/app/')) return { segment: 'angular-component', prefixes: ['c-'] };
  return { segment: 'other', prefixes: [] };
}

// Same translation-file patterns as ui-code-review (scripts/get-review-target.js): Angular JSON / TS / JS dictionaries,
// Angular built-in i18n (.xlf, messages.<lang>.json), .NET .resx, .po and JSON under Resources.
const TRANSLATION_FOLDERS = '(i18n|l10n|locale|locales|lang|langs|translations|resources)';
const TRANSLATION_RE = new RegExp([
  `((^|/)${TRANSLATION_FOLDERS}/.+\\.json$)`,
  '(\\.(i18n|translations?|locale)\\.(ts|js)$)',
  `((^|/)${TRANSLATION_FOLDERS}/(.+/)?[a-z]{2}([-_][A-Za-z]{2,4})?\\.(ts|js)$)`,
  '(\\.(xlf|xliff)$)',
  '((^|/)messages(\\.[A-Za-z-]+)?\\.json$)',
  '(\\.(resx|po)$)',
].join('|'), 'i');
function isTranslationPath(rel, profile) {
  if (TRANSLATION_RE.test(rel)) return true;
  if (!/\.json$/.test(rel)) return false;
  const i18nPaths = (profile && profile.i18n && profile.i18n.paths) || [];
  return i18nPaths.some((p) => rel.startsWith(p.replace(/\/?$/, '/')));
}

/** Classify a forward-slash relative path. Returns kind or null when excluded / not a UI file. */
function classify(rel, profile) {
  const parts = rel.split('/');
  if (parts.some((p) => EXCLUDED_DIRS.has(p))) return null;
  const sr = scssRoot(profile);
  if (rel.startsWith(sr + '/packages/')) return null;
  const base = parts[parts.length - 1];
  if (/\.spec\.ts$/.test(base) || /\.d\.ts$/.test(base) || /\.min\./.test(base)) return null;
  if (isTranslationPath(rel, profile)) return 'translation'; // before UI files (§3.6)
  if (rel === 'angular.json') return 'config';
  if (rel === 'src/index.html') return 'index';
  const ext = (base.split('.').pop() || '').toLowerCase();
  // The UI files ui-code-review reviews: html, scss, css, ts, cshtml, js (minified, spec and .d.ts files excluded).
  if (ext === 'html') return 'html';
  if (ext === 'scss') return 'scss';
  if (ext === 'css') return 'css';
  if (ext === 'ts') return 'ts';
  if (ext === 'cshtml') return 'cshtml';
  if (ext === 'js') return 'js';
  if (ext === 'json' && /^src\/(assets|environments)\//.test(rel)) return 'config';
  if (ext === 'json' && /(^|\/)(wwwroot|Scripts|scripts|Content)\//.test(rel)) return 'config';
  // Images, fonts, video and any binary are OUT of the scan (checked only by /ui-guard:assets for missing paths).
  return null;
}

/** All UI files of the project (absolute paths), sorted. */
function listUiFiles(root, profile) {
  const files = u.walk(root, (name) => EXCLUDED_DIRS.has(name));
  const out = [];
  for (const f of files) {
    const rel = u.relPosix(root, f);
    const kind = classify(rel, profile);
    if (kind) out.push({ abs: f, rel, kind });
  }
  return out;
}

function loadRulesIndex() { return u.readJSON(path.join(PLUGIN_ROOT, 'rules', 'rules.json'), { rules: [], lintMap: {}, aiGroups: {} }); }
function ruleById(id) { const idx = loadRulesIndex(); return idx.rules.find((r) => r.id === id); }

/** Theme folders: active copy + every source theme. */
/** Theme folder names are lower-case kebab-case (default `original-theme`): a-z, 0-9, single hyphens. Returns an error text or null. */
const DEFAULT_THEME = 'original-theme';
function themeNameProblem(name) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return `Theme name "${name}" is not valid: use lower-case letters, digits and single hyphens (e.g. ${DEFAULT_THEME}).`;
  return null;
}

function themeDirs(root, profile) {
  const out = [];
  const active = path.join(root, ...scssRoot(profile).split('/'), 'theme');
  if (u.isDir(active)) out.push({ name: '(active)', themeDir: active, imagesDir: path.join(root, 'src', 'assets', 'project-images'), active: true });
  const themesRoot = path.join(root, 'src', 'assets', 'themes');
  if (u.isDir(themesRoot)) {
    for (const name of fs.readdirSync(themesRoot).sort()) {
      const td = path.join(themesRoot, name, 'theme');
      if (u.isDir(td)) out.push({ name, themeDir: td, imagesDir: path.join(themesRoot, name, 'project-images'), active: false });
    }
  }
  return out;
}

// The four theme files, fixed names in fixed folders (AXIS theme.md). Link order in index.html: base, palette, fonts, custom (last).
const THEME_FILES = ['colors/colors.base.theme.css', 'colors/colors.palette.theme.css', 'fonts/fonts.theme.css', 'custom.theme.css'];
function isThemeTokenFile(rel) { return /(^|\/)theme\/(colors|fonts)\/[^/]+\.css$/.test(rel) || /(^|\/)theme\/custom\.theme\.css$/.test(rel); }

module.exports = {
  PLUGIN_ROOT, EXCLUDED_DIRS, findRoot, stackOf, TRANSLATION_RE, paths, hasProfile, readProfile, scssRoot, roleMap, DEFAULT_ROLE_MAP, SEGMENTS,
  SEGMENT_PREFIX, STATE_PREFIXES, segmentOf, classify, listUiFiles, isTranslationPath, loadRulesIndex, ruleById,
  themeDirs, THEME_FILES, isThemeTokenFile, themeNameProblem, DEFAULT_THEME,
};
