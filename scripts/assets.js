#!/usr/bin/env node
'use strict';
// /ui-guard:assets — zero tokens, no agent. For every image/font/video path referenced in HTML, SCSS, CSS and TS
// (src=, href=, ngSrc, srcset, url(), string literals, theme --img-* variables) check the file exists.
// It never opens or judges an image. Self-contained (Node built-ins only) so .ui-guard/bin/ can carry a copy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HELP = `assets.js — check that every referenced image/font/video file exists (zero tokens).
Usage: node assets.js [--root <project>] [--new-only] [--baseline] [--json]
  --new-only   report (and fail on) only problems not in .ui-guard/assets-baseline.json
  --baseline   save the current problems as .ui-guard/assets-baseline.json (known, not fixed yet)
  --json       print JSON instead of text
Output: "<file>:<line> -> missing <path>" (one per problem). Exit 1 when a problem is reported, else 0.`;

const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|ogg|mov|mp3|wav|pdf)(?=$|[?#])/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', 'coverage', '.ui-guard', '.git', '.githooks']);

function args(argv) { const a = { _: [] }; for (let i = 0; i < argv.length; i++) { const x = argv[i]; if (x.startsWith('--')) { const k = x.slice(2); if (['root'].includes(k)) a[k] = argv[++i]; else a[k] = true; } else a._.push(x); } return a; }
function findRoot(start) { let d = path.resolve(start); for (;;) { if (fs.existsSync(path.join(d, 'angular.json'))) return d; const up = path.dirname(d); if (up === d) return null; d = up; } }
function walk(dir, out = []) {
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list.sort((x, y) => (x.name < y.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, out); } else out.push(full);
  }
  return out;
}
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Every asset reference in one file: [{ ref, line }] (dynamic ones counted separately). */
function references(text, kind) {
  const refs = [];
  let dynamic = 0;
  const add = (ref, idx) => {
    ref = ref.trim();
    if (!ref || /^(data:|blob:|#|mailto:|tel:)/i.test(ref)) return;
    if (/^(https?:)?\/\//i.test(ref) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(ref)) return; // remote
    if (/\{\{|\$\{|#\{|\+|\$[a-z]/i.test(ref)) { dynamic++; return; }
    if (!ASSET_EXT.test(ref)) return;
    refs.push({ ref: ref.split(/[?#]/)[0], line: lineOf(text, idx) });
  };
  const code = kind === 'css' || kind === 'scss' ? text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')) : text;
  if (kind === 'html') {
    for (const m of code.matchAll(/\s(?:src|href|ngSrc|poster|data-src)\s*=\s*"([^"]*)"/gi)) add(m[1], m.index);
    for (const m of code.matchAll(/\s(?:src|href|ngSrc|poster|data-src)\s*=\s*'([^']*)'/gi)) add(m[1], m.index);
    for (const m of code.matchAll(/\ssrcset\s*=\s*["']([^"']*)["']/gi)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0], m.index);
    for (const m of code.matchAll(/\[(?:src|ngSrc)\]\s*=\s*"'([^']*)'"/g)) add(m[1], m.index);
    for (const m of code.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1], m.index);
  } else if (kind === 'css' || kind === 'scss') {
    for (const m of code.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1], m.index);
  } else if (kind === 'ts') {
    for (const m of code.matchAll(/(["'`])((?:(?!\1)[^\n\\])*)\1/g)) if (ASSET_EXT.test(m[2]) && /[/.]/.test(m[2])) add(m[2], m.index);
  }
  return { refs, dynamic };
}

function check(root) {
  const src = path.join(root, 'src');
  const pub = path.join(root, 'public');
  const activeTheme = path.join(src, 'assets', 'scss', 'theme');
  const activeImages = path.join(src, 'assets', 'project-images');
  const themesRoot = path.join(src, 'assets', 'themes');
  const problems = [];
  let checked = 0, dynamic = 0;
  for (const file of walk(src)) {
    const r = rel(root, file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const kind = ext === 'html' ? 'html' : ext === 'scss' ? 'scss' : ext === 'css' ? 'css' : ext === 'ts' && !/\.(spec|d)\.ts$/.test(file) ? 'ts' : null;
    if (!kind || /\.min\./.test(file) || /\/packages\//.test(r)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const res = references(text, kind);
    dynamic += res.dynamic;
    // A theme SOURCE file is resolved as if it were swapped into the active folder; the active project-images/
    // then means that theme's own project-images/ (what the manual swap after the build does).
    let themeName = null, baseDir = path.dirname(file);
    const tm = new RegExp('^src/assets/themes/([^/]+)/theme/').exec(r);
    if (tm) { themeName = tm[1]; baseDir = path.join(activeTheme, path.relative(path.join(themesRoot, themeName, 'theme'), path.dirname(file))); }
    for (const { ref, line } of res.refs) {
      checked++;
      let problem = null;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(ref)) problem = `points to localhost: ${ref}`;
      else if (/^\/?src\//.test(ref)) problem = `uses ${ref} — the build serves assets/, not src/`;
      else {
        const clean = ref.replace(/^\.\//, '');
        const cands = [];
        if (/^\/?assets\//.test(clean)) cands.push(path.join(src, ...clean.replace(/^\//, '').split('/')));
        else if (clean.startsWith('/')) cands.push(path.join(pub, ...clean.slice(1).split('/')), path.join(src, ...clean.slice(1).split('/')));
        else if (kind === 'css' || kind === 'scss') cands.push(path.resolve(baseDir, ...clean.split('/')));
        else cands.push(path.join(src, ...clean.split('/')), path.join(pub, ...clean.split('/')));
        const mapped = cands.map((c) => (themeName && (c + path.sep).startsWith(activeImages + path.sep) ? path.join(themesRoot, themeName, 'project-images', path.relative(activeImages, c)) : c));
        if (!mapped.some(exists)) problem = `missing ${ref}${themeName ? ` (theme ${themeName})` : ''}`;
      }
      if (problem) problems.push({ file: r, line, ref, problem, fingerprint: crypto.createHash('sha1').update(`${r}|${ref}`).digest('hex') });
    }
  }
  return { problems, checked, dynamic };
}

module.exports = { check, references };
if (require.main === module) {
  const a = args(process.argv.slice(2));
  if (a.help || a.h) { console.log(HELP); process.exit(0); }
  const root = a.root ? path.resolve(a.root) : findRoot(process.cwd());
  if (!root) { console.error('This is not an Angular project (no angular.json).'); process.exit(2); }
  const blFile = path.join(root, '.ui-guard', 'assets-baseline.json');
  const res = check(root);
  if (a.baseline) {
    fs.mkdirSync(path.dirname(blFile), { recursive: true });
    fs.writeFileSync(blFile, JSON.stringify({ note: 'Known missing asset references (ui-guard). Not blocking.', updated: new Date().toISOString(), fingerprints: res.problems.map((p) => p.fingerprint).sort() }, null, 2) + '\n');
    console.log(`assets baseline written: ${res.problems.length} known problem(s) → .ui-guard/assets-baseline.json`);
    process.exit(0);
  }
  let list = res.problems;
  let known = 0;
  if (a['new-only']) {
    let bl = new Set();
    try { bl = new Set(JSON.parse(fs.readFileSync(blFile, 'utf8')).fingerprints || []); } catch { /* no baseline */ }
    list = res.problems.filter((p) => !bl.has(p.fingerprint));
    known = res.problems.length - list.length;
  }
  if (a.json) console.log(JSON.stringify({ checked: res.checked, dynamic: res.dynamic, known, problems: list }, null, 2));
  else {
    for (const p of list) console.log(`${p.file}:${p.line} -> ${p.problem}`);
    console.log(`assets: ${res.checked} reference(s) checked, ${list.length} problem(s)${known ? `, ${known} known (baseline)` : ''}, ${res.dynamic} dynamic path(s) not checked.`);
  }
  process.exit(list.length ? 1 : 0);
}
