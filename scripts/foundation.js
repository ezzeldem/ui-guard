#!/usr/bin/env node
'use strict';
// STYLE-48 "architecture gap" + the two Foundation phases of `/ui-guard:fix scss` (scripts only, 0 tokens).
//   check      compare the project with OUR structure (templates/scss + the four theme files): what is missing, what is misplaced
//   structure  Foundation A — create the missing segments, tools, settings, theme and entry files; wire angular.json + index.html.
//              Files with CSS output that would change the page (resets, element rules) are created as empty segment files.
//   move       Foundation B — the AXIS migration (guides/migration.md): the existing global stylesheets stay linked and frozen
//              right after the vendor CSS (the "legacy stylesheet"); only what lands AXIS-compliant moves into the segments —
//              tokens → theme files, @font-face → fonts.theme.css, $variables → settings, mixins/functions → one tool file each,
//              element rules → elements/_index.scss, resets → generic/_reset.generic.scss, u- rules → their utility category,
//              vendor overrides already scoped by an m- class → their library module. Everything else stays in the legacy file
//              ("legacy — migrate page by page"). Proof: the compiled CSS before and after renders the same (a rule may only
//              move past rules it can never conflict with, lib/cascade.js); otherwise everything is rolled back.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const ng = require('./lib/angular');
const st = require('./lib/scss-text');
const css = require('./lib/css');
const cascade = require('./lib/cascade');
const libs = require('./lib/libclasses');
const { mk } = require('./lib/findings');

const HELP = `foundation.js — STYLE-48 architecture gap + Foundation A/B of /ui-guard:fix scss (scripts only, 0 tokens).
Usage (all accept --root <dir>):
  node foundation.js check [--json]     list what is missing, what is misplaced and what is legacy (also part of run-checks)
  node foundation.js structure [--apply]
        Foundation A: create the missing segment/tools/settings/theme/entry files from templates/, add the scss root to
        includePaths, common/common.scss + utilities/utils.scss to angular.json styles (after the vendor CSS and the project's
        own global stylesheets) and the four theme <link>s to index.html (base, palette, fonts before custom.theme.css).
        No value changes; resets/element rules are created as empty segment files (nothing that changes the page).
  node foundation.js sr-only [--apply]
        before /ui-guard:fix access: make sure .u-sr-only exists in utilities/accessibility/ (created alone when missing; a
        project sr-only / visually-hidden class is never reused). Exit 8 = STOP: utilities/utils.scss is not loaded or the
        tools are missing (run /ui-guard:fix scss first).
  node foundation.js move [--apply]
        Foundation B (AXIS migration): move what lands AXIS-compliant out of the global stylesheets into the segments; the
        rest stays in them, frozen, linked right after the vendor CSS. Verified by compiling before/after with the project's sass.
        Exit 0 = proven (what stayed is listed as legacy) · 6 = rolled back (see .ui-guard/scss/foundation-move.json)
        · 7 = sass cannot be loaded (no node_modules): STOP — nothing moved; run npm install first.`;

const T = path.join(project.PLUGIN_ROOT, 'templates');
const THEME_FILES = project.THEME_FILES.map((f) => `theme/${f}`);
const COMMON = 'common/common.scss';
const UTILS = 'utilities/utils.scss';
const ENTRIES = [COMMON, UTILS];
const OLD_ENTRY = 'style.scss';
const UTIL_CATEGORIES = ['accessibility', 'interaction', 'layout', 'typography', 'visual'];
const SR_ONLY = 'utilities/accessibility/_sr-only.utility.scss';
const FILTER = 'utilities/visual/_filter.utility.scss';
const RESET = 'generic/_reset.generic.scss';
const ELEMENTS = 'elements/_index.scss';
const SETTINGS = 'settings/_project.settings.scss';
const MOVE_REPORT = (root) => path.join(root, '.ui-guard', 'scss', 'foundation-move.json');
const lf = (t) => (t == null ? t : String(t).replace(/\r\n/g, '\n'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- the expected structure ----------
/** Every file of OUR structure (relative to the scss root) with how Foundation A creates it. */
function expected() {
  const out = [];
  const tpl = path.join(T, 'scss');
  for (const f of u.walk(tpl)) {
    const rel = u.relPosix(tpl, f);
    if (rel === 'packages/README.md') continue; // vendor CSS folder only when there is vendor CSS
    let mode = 'copy';
    if (/\.gitkeep$/.test(rel)) mode = 'keep';
    else if (rel === RESET || rel === ELEMENTS) mode = 'stub';
    else if (rel === 'common/_components.common.scss') mode = 'no-button';
    else if (rel === 'settings/_colors.settings.scss') mode = 'colors';
    out.push({ rel, mode, src: f });
  }
  for (const rel of THEME_FILES) out.push({ rel, mode: 'theme' });
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

function stubText(rel) {
  return rel === RESET
    ? '@charset "UTF-8";\n\n// Generic reset of this project: resets and the one reduced-motion block. Empty until Foundation B moves the existing resets here.\n'
    : '@charset "UTF-8";\n\n// Elements of this project: bare HTML element rules only (no class, no ID). Empty until Foundation B moves the existing element rules here.\n';
}
function themeText(rel) {
  return `@charset "UTF-8";\n/* ${path.posix.basename(rel)}: theme file of this project (plain CSS, <link>ed from index.html). Tokens move here in Foundation B. */\n`;
}

/** settings/_colors.settings.scss from the --<family>-<step> shades of the active palette (no colour value of its own). */
function colorsSettings(root, sr) {
  const pal = u.readText(u.fromPosix(root, `${sr}/theme/colors/colors.palette.theme.css`)) || '';
  const fams = new Map();
  for (const m of pal.matchAll(/--([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-(\d+)\s*:\s*([^;]+);/g)) {
    if (!/^(hsla?|rgba?|hwb|lab|lch|oklab|oklch|var)\(|^#[0-9a-f]{3,8}$/i.test(m[3].trim())) continue; // a shade, not a shadow or a size
    if (!fams.has(m[1])) fams.set(m[1], new Set());
    fams.get(m[1]).add(+m[2]);
  }
  const L = ['@charset "UTF-8";', '', '// Colour maps, one per family. Every value references a shade of theme/colors/colors.palette.theme.css, which is the',
    '// single source of truth for colour values: no colour value is defined here. Keys carry the family and the step.',
    '// Read by the colour utilities when a project adds them: each family\'s file under utilities/visual/colors/ (u-text-*)',
    '// and utilities/visual/backgrounds/ (u-bg-*) loops over its map with @each.'];
  for (const [fam, steps] of fams) {
    const list = [...steps].sort((a, b) => a - b).map((s) => `  "${fam}-${s}": var(--${fam}-${s})`);
    L.push('', `// $${fam}-colors: the ${fam} family, "${fam}-<step>" → var(--${fam}-<step>). Read by the ${fam} files under utilities/visual/.`, `$${fam}-colors: (`, list.join(',\n'), ');');
  }
  return L.join('\n') + '\n';
}

function hasFilterTokens(root, sr) {
  const base = u.readText(u.fromPosix(root, `${sr}/theme/colors/colors.base.theme.css`)) || '';
  return /--filter-primary\s*:/.test(base) && /--filter-neutral-25\s*:/.test(base);
}

/** Class name → files (scss root relative) that define it. */
function definedClasses(root, profile) {
  const out = new Map();
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    for (const m of (u.readText(f.abs) || '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) { if (!out.has(m[1])) out.set(m[1], new Set()); out.get(m[1]).add(f.rel); }
  }
  return out;
}

function optionalSkips(root, profile, sr) {
  const defined = definedClasses(root, profile);
  const own = (cls, rel) => [...(defined.get(cls) || [])].some((f) => f !== `${sr}/${rel}`);
  return {
    srOnly: own('u-sr-only', SR_ONLY), // the project declares u-sr-only already: Foundation B moves it to accessibility/
    filter: !hasFilterTokens(root, sr) || [...defined.keys()].some((c) => /^u-filter-/.test(c) && own(c, FILTER)),
  };
}

function contentFor(e, ctx) {
  if (e.mode === 'keep') return '';
  if (e.mode === 'stub') return stubText(e.rel);
  if (e.mode === 'theme') return themeText(e.rel);
  if (e.mode === 'colors') return colorsSettings(ctx.root, ctx.sr);
  let t = lf(u.readText(e.src));
  if (e.mode === 'no-button') t = t.replace(/\n?\/\/ Shared components[^\n]*\n@use "\.\.\/components\/button\.component" as \*;\n?/, '\n// Shared components (c-): used by five or more page entries or needed by any layout. One line per component:\n// @use "../components/<name>.component" as *;\n');
  if (e.rel === 'utilities/accessibility/_index.scss' && ctx.skip.srOnly) t = t.replace(/\n?@use "\.\/sr-only\.utility" as \*;\n/, '\n').replace(/\n\n$/, '\n');
  if (e.rel === 'utilities/visual/_index.scss' && ctx.skip.filter) t = t.replace(/\n?@use "\.\/filter\.utility" as \*;\n/, '\n').replace(/\n\n$/, '\n');
  return t;
}

// ---------- angular.json helpers ----------
function readNg(root, profile) { const a = ng.readAngular(root, profile); return a && !a.error ? a : null; }
const inputOf = (s) => (typeof s === 'string' ? s : s.input);
const isVendor = (s) => /(^|\/)node_modules\//.test(inputOf(s));
const isInjected = (s) => typeof s === 'string' || s.inject !== false;

/** Component style files (referenced by styleUrl/styleUrls in a .ts file). */
function componentStyles(root) {
  const out = new Set();
  const app = path.join(root, 'src');
  for (const f of u.walk(app, (n) => project.EXCLUDED_DIRS.has(n)).filter((x) => /\.ts$/.test(x) && !/\.spec\.ts$/.test(x))) {
    const t = u.readText(f) || '';
    if (!/styleUrls?\s*:/.test(t)) continue;
    for (const m of t.matchAll(/styleUrls?\s*:\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g)) for (const q of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) out.add(u.relPosix(root, path.resolve(path.dirname(f), q[1])));
  }
  // Angular's naming is enough: x.component.scss next to the app code is a component style even without a styleUrl found
  for (const f of u.walk(path.join(root, 'src', 'app'), (n) => project.EXCLUDED_DIRS.has(n))) if (/\.component\.s?css$/.test(f)) out.add(u.relPosix(root, f));
  return out;
}

function loadPathsOf(root, a) { return ((a && a.options.stylePreprocessorOptions && a.options.stylePreprocessorOptions.includePaths) || []).slice(); }
function writeNg(root, a) { const indent = (/\n( +|\t)"/.exec(a.text) || [])[1] || 2; fs.writeFileSync(path.join(root, 'angular.json'), JSON.stringify(a.json, null, indent) + '\n'); }

/** Files Foundation B froze as the legacy stylesheet (and the partials only they import). */
function legacyList(root) { const r = u.readJSON(MOVE_REPORT(root), null); return new Set((r && r.legacy) || []); }

/** Global stylesheets: injected, project (not vendor), not our entries, not theme files. */
function globalStyles(a, sr) {
  return (a.options.styles || []).filter((s) => !isVendor(s) && !ENTRIES.includes(inputOf(s).slice(sr.length + 1)) && !inputOf(s).startsWith(`${sr}/theme/`) && !/^src\/assets\/themes\//.test(inputOf(s)));
}

function reachedFrom(root, a, files) {
  const graph = require('./lib/sass-graph');
  const inc = loadPathsOf(root, a).map((p) => path.join(root, ...p.split('/')));
  const out = new Set();
  for (const f of files) {
    if (!/\.scss$/.test(f)) continue;
    const abs = path.resolve(u.fromPosix(root, f));
    if (!u.exists(abs)) continue;
    for (const r of graph.reachable(graph.build([abs], inc), abs, (x) => graph.build([x], inc))) out.add(path.resolve(r));
  }
  return out;
}

// ---------- check (STYLE-48) ----------
function themeLinksMissing(root, sr) {
  const idx = u.readText(path.join(root, 'src', 'index.html'));
  if (idx == null || !sr.startsWith('src/assets/')) return [];
  const links = [...idx.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1].replace(/^\.?\//, ''));
  return THEME_FILES.map((f) => `assets/${sr.replace(/^src\/assets\//, '')}/${f}`).filter((h) => !links.includes(h));
}

function gaps(root, profile) {
  const sr = project.scssRoot(profile);
  const a = readNg(root, profile);
  const missing = [], misplaced = [], wiring = [], legacy = [];
  const skip = optionalSkips(root, profile, sr);
  for (const e of expected()) {
    if (e.rel === FILTER && skip.filter) continue;
    if (e.rel === SR_ONLY && skip.srOnly) continue;
    const abs = u.fromPosix(root, `${sr}/${e.rel}`);
    if (e.mode === 'keep') { if (!u.isDir(path.dirname(abs))) missing.push({ rel: `${sr}/${e.rel}`, mode: e.mode, what: `folder ${path.posix.dirname(e.rel)}/` }); continue; }
    if (!u.exists(abs)) missing.push({ rel: `${sr}/${e.rel}`, mode: e.mode, what: e.rel });
  }
  const frozen = legacyList(root);
  const comps = componentStyles(root);
  if (a) {
    const inc = loadPathsOf(root, a).map((p) => p.replace(/\/$/, ''));
    if (!inc.includes(sr)) wiring.push({ file: 'angular.json', what: `stylePreprocessorOptions.includePaths has no \`${sr}\` (needed for \`@use "tools" as *\` in component styles)` });
    const styles = a.options.styles || [];
    const at = (rel) => styles.findIndex((s) => inputOf(s) === `${sr}/${rel}`);
    for (const e of ENTRIES) if (at(e) < 0) wiring.push({ file: 'angular.json', what: `\`${sr}/${e}\` is not an entry in angular.json styles` });
    if (at(COMMON) >= 0 && at(UTILS) >= 0 && at(UTILS) < at(COMMON)) wiring.push({ file: 'angular.json', what: `\`${sr}/${UTILS}\` is listed before \`${sr}/${COMMON}\` — utilities are the last compiled stylesheet` });
    if (at(OLD_ENTRY) >= 0) wiring.push({ file: 'angular.json', what: `\`${sr}/${OLD_ENTRY}\` (the old single entry) is in angular.json styles — the entries are \`${COMMON}\` and \`${UTILS}\`` });
    const assets = a.options.assets || [];
    if (!assets.some((x) => ((typeof x === 'string' ? x : x.input) || '').replace(/\/$/, '') === 'src/assets')) wiring.push({ file: 'angular.json', what: 'assets does not copy `src/assets` (theme files are <link>ed from there)' });
    for (const s of globalStyles(a, sr)) {
      const inp = inputOf(s);
      if (inp === `${sr}/${OLD_ENTRY}`) continue;
      if (!isInjected(s)) { misplaced.push({ rel: inp, lazy: true, what: `lazy bundle \`${s.bundleName || inp}\` (inject: false) outside the structure — loaded by name at runtime` }); continue; }
      if (frozen.has(inp)) { legacy.push(inp); continue; }
      misplaced.push({ rel: inp, what: 'global stylesheet outside the structure — Foundation B moves what lands AXIS-compliant into the segments, the rest stays frozen as the legacy stylesheet' });
    }
  }
  const miss = themeLinksMissing(root, sr);
  if (miss.length) wiring.push({ file: 'src/index.html', what: `theme <link>s missing: ${miss.map((m) => path.posix.basename(m)).join(', ')}` });
  // stray stylesheets: not in the scss root, not a component style, not a theme source, not a global (or its partial)
  const listed = new Set([...misplaced.map((m) => m.rel), ...legacy]);
  const legacyPartials = a ? reachedFrom(root, a, legacy) : new Set();
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    if (f.rel.startsWith(sr + '/') || comps.has(f.rel) || listed.has(f.rel)) continue;
    if (/^src\/assets\/themes\//.test(f.rel)) continue;
    if (frozen.has(f.rel) || legacyPartials.has(path.resolve(f.abs))) { legacy.push(f.rel); continue; }
    misplaced.push({ rel: f.rel, stray: true, what: 'stylesheet outside the structure (not a component style, not loaded as a segment)' });
  }
  return { sr, missing, misplaced, wiring, legacy: [...new Set(legacy)].sort() };
}

function run(root, profile) {
  const g = gaps(root, profile);
  const out = [];
  for (const m of g.missing) out.push(mk(root, 'STYLE-48', m.rel, 1, `Missing from our structure: \`${m.what}\` — Foundation A creates it from the template (no value changes).`, 'Run /ui-guard:fix scss (Foundation A).'));
  for (const w of g.wiring) out.push(mk(root, 'STYLE-48', w.file, 1, `Wiring: ${w.what}.`, 'Foundation A sets it.'));
  for (const m of g.misplaced) out.push(mk(root, 'STYLE-48', m.rel, 1, `Misplaced: ${m.what}.`, m.lazy ? 'Decide: keep it as a lazy bundle (move the file into its segment, same bundleName) or load it eagerly.' : 'Foundation B moves what lands AXIS-compliant; the rest stays frozen as the legacy stylesheet (migrate page by page).', m.lazy ? { severity: 'info' } : {}));
  return out;
}

// ---------- Foundation A ----------
/** The old single entry style.scss (@use lines of our segments only) → common.scss + utils.scss, same output order. */
function upgradeOldEntry(root, sr, a, { apply }, changed, skipped) {
  const rel = `${sr}/${OLD_ENTRY}`;
  const abs = u.fromPosix(root, rel);
  const text = lf(u.readText(abs));
  if (text == null || !a) return;
  const styles = a.options.styles || [];
  const i = styles.findIndex((s) => inputOf(s) === rel);
  if (i < 0) return;
  const lines = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
  const uses = lines.filter((l) => !/^@charset/.test(l)).map((l) => (/^@use\s+["']([^"']+)["']/.exec(l) || [])[1]);
  const want = ['generic', 'elements', 'common/common', 'utilities/utils'];
  if (uses.some((x) => !x) || uses.join('|') !== want.filter((w) => uses.includes(w)).join('|')) { skipped.push(`\`${rel}\` holds more than the @use lines of our segments — Foundation B treats it as a global stylesheet`); return; }
  const commonAbs = u.fromPosix(root, `${sr}/${COMMON}`);
  let common = lf(u.readText(commonAbs)) || '@charset "UTF-8";\n';
  const add = [];
  if (uses.includes('generic') && !/@use\s+["']\.\.\/generic["']/.test(common)) add.push('@use "../generic" as *;');
  if (uses.includes('elements') && !/@use\s+["']\.\.\/elements["']/.test(common)) add.push('@use "../elements" as *;');
  if (add.length) { const ls = common.split('\n'); const at = /^@charset/.test(ls[0]) ? 1 : 0; ls.splice(at, 0, ...(at ? [''] : []), ...add); common = ls.join('\n').replace(/\n{3,}/g, '\n\n'); }
  const next = styles.slice(0, i).concat(uses.includes('common/common') || add.length ? [`${sr}/${COMMON}`] : [], uses.includes('utilities/utils') ? [`${sr}/${UTILS}`] : [], styles.slice(i + 1)).filter((s, k, arr) => arr.findIndex((x) => inputOf(x) === inputOf(s)) === k);
  if (apply) { u.writeText(commonAbs, common); a.options.styles = next; writeNg(root, a); fs.unlinkSync(abs); }
  changed.push(`${rel} (old single entry) → angular.json styles ${sr}/${COMMON} + ${sr}/${UTILS}; deleted`);
}

function structure(root, profile, { apply }) {
  const sr = project.scssRoot(profile);
  const created = [], changed = [], skipped = [];
  upgradeOldEntry(root, sr, readNg(root, profile), { apply }, changed, skipped);
  const g = gaps(root, profile);
  const ctx = { root, sr, skip: optionalSkips(root, profile, sr) };
  if (ctx.skip.srOnly) skipped.push(`${sr}/${SR_ONLY} — the project already declares .u-sr-only (Foundation B moves it to utilities/accessibility/)`);
  // theme files first: settings/_colors.settings.scss is generated from the palette
  const order = [...g.missing].sort((x, y) => (/\/theme\//.test(y.rel) ? 1 : 0) - (/\/theme\//.test(x.rel) ? 1 : 0));
  for (const m of order) {
    const e = expected().find((x) => `${sr}/${x.rel}` === m.rel);
    if (!e) continue;
    if (apply) u.writeText(u.fromPosix(root, m.rel), contentFor(e, ctx));
    created.push(m.rel);
  }
  const a = readNg(root, profile);
  if (a) {
    const opts = a.options;
    let touched = false;
    opts.stylePreprocessorOptions = opts.stylePreprocessorOptions || {};
    const inc = opts.stylePreprocessorOptions.includePaths || [];
    if (!inc.map((p) => p.replace(/\/$/, '')).includes(sr)) { opts.stylePreprocessorOptions.includePaths = [...inc, sr]; touched = true; changed.push(`angular.json: includePaths + ${sr}`); }
    let styles = (opts.styles || []).slice();
    const has = (rel) => styles.some((s) => inputOf(s) === `${sr}/${rel}`);
    const reached = reachedFrom(root, a, styles.filter((s) => !isVendor(s)).map(inputOf));
    for (const e of ENTRIES) {
      if (has(e)) continue;
      if (reached.has(path.resolve(u.fromPosix(root, `${sr}/${e}`)))) { skipped.push(`angular.json styles: \`${sr}/${e}\` is already reached from another global stylesheet — decide which one loads it`); continue; }
      let at;
      if (e === UTILS && has(COMMON)) at = styles.findIndex((s) => inputOf(s) === `${sr}/${COMMON}`) + 1;
      else if (e === COMMON && has(UTILS)) at = styles.findIndex((s) => inputOf(s) === `${sr}/${UTILS}`);
      else {
        // right AFTER the first run of project stylesheets (the legacy stylesheet): its rules keep winning nothing new,
        // the entries come after it and vendor CSS keeps its place
        const first = styles.findIndex((s) => !isVendor(s) && isInjected(s));
        at = first < 0 ? styles.length : first;
        while (at < styles.length && !isVendor(styles[at]) && isInjected(styles[at])) at++;
      }
      styles = [...styles.slice(0, at), `${sr}/${e}`, ...styles.slice(at)];
      touched = true; changed.push(`angular.json: styles + ${sr}/${e}`);
    }
    opts.styles = styles;
    const assets = opts.assets || [];
    if (!assets.some((x) => ((typeof x === 'string' ? x : x.input) || '').replace(/\/$/, '') === 'src/assets')) {
      opts.assets = [...assets, { glob: '**/*', input: 'src/assets', output: 'assets' }];
      touched = true; changed.push('angular.json: assets + src/assets');
    }
    if (touched && apply) writeNg(root, a);
  }
  // index.html theme links (empty theme files → no visual change): base, palette, fonts in that order, before custom.theme.css
  const idxFile = path.join(root, 'src', 'index.html');
  const idx = u.readText(idxFile);
  if (idx != null && sr.startsWith('src/assets/')) {
    const base = `assets/${sr.replace(/^src\/assets\//, '')}`;
    const want = THEME_FILES.map((f) => `${base}/${f}`);
    let next = idx;
    const linkRe = (h) => new RegExp(`<link\\b[^>]*href=["']\\.?\\/?${esc(h)}["'][^>]*>`, 'i');
    const add = [];
    want.forEach((h, k) => {
      if (linkRe(h).test(next)) return;
      const tag = `<link rel="stylesheet" href="${h}">`;
      const later = want.slice(k + 1).find((x) => linkRe(x).test(next));
      if (later) next = next.replace(linkRe(later), (m) => `${tag}\n  ${m}`);
      else next = next.replace(/(\s*)<\/head>/i, `\n  ${tag}\n</head>`);
      add.push(h);
    });
    if (add.length) {
      if (apply) fs.writeFileSync(idxFile, next);
      changed.push(`src/index.html: theme <link>s ${add.map((h) => path.posix.basename(h)).join(', ')}`);
    }
  }
  return { created, changed, skipped };
}

// ---------- Foundation B ----------
/** Rewrite relative url()s so they point at the same file from the new location. */
function rebaseUrls(text, fromDir, toDir) {
  return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, p) => {
    if (/^(\/|data:|https?:|#|~|\$|var\(|#\{)/.test(p.trim())) return m;
    const abs = path.resolve(fromDir, p.trim());
    let rel = path.relative(toDir, abs).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `url(${q}${rel}${q})`;
  });
}

/**
 * Expand local @import/@use partials of a global stylesheet into one ordered list of statements, each with the file it
 * was written in. An import Foundation B cannot follow (vendor Sass, a namespaced/configured @use, a partial component
 * styles also use) stays a statement of its own: it emits CSS nobody can read here, so it never moves and nothing moves past it.
 */
function flatten(root, file, ctx, seen = new Set(), depth = 0) {
  const abs = path.resolve(file);
  const text = u.readText(abs);
  if (text == null) return [{ origin: abs, head: `@import "${u.relPosix(root, abs)}"`, body: '', unreadable: true }];
  if (seen.has(abs) || depth > 20) return [];
  seen.add(abs);
  ctx.files.add(abs);
  const graph = require('./lib/sass-graph');
  const out = [];
  for (const s of st.splitTop(text, { scss: /\.scss$/.test(abs) })) {
    if (s.trailing) continue;
    s.origin = abs;
    const m = /^@(import|use)\s+(.+)$/.exec(s.head);
    if (m && !s.block) {
      const targets = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
      const plain = !(m[1] === 'use' && (/\bwith\s*\(/.test(m[2]) || (/\bas\s+[\w*-]+/.test(m[2]) && !/\bas\s+\*/.test(m[2]))));
      if (targets.length && targets.every((t) => /^sass:/.test(t))) { out.push({ ...s, sassModule: true }); continue; }
      const resolved = targets.map((t) => graph.resolve(abs, t, ctx.inc));
      const local = plain && resolved.every((r) => r && !/node_modules/.test(r) && !ctx.sharedWithComponents.has(path.resolve(r)));
      if (!local) { out.push({ ...s, opaque: true }); continue; }
      for (const r of resolved) {
        if (ctx.ours.has(u.relPosix(root, r))) { out.push({ ...s, opaque: true }); continue; } // one of our files: its output stays where it is
        ctx.partialOf.set(path.resolve(r), abs);
        out.push(...flatten(root, r, ctx, seen, depth + 1));
      }
      continue;
    }
    out.push(s);
  }
  return out;
}

const TYPOGRAPHY = /^(font|text-align|text-transform|text-decoration|text-overflow|letter-spacing|line-height|white-space|word-break|overflow-wrap|text-indent|vertical-align)/;
const VISUAL = /^(color|background|filter|opacity|visibility|box-shadow|border|outline|backdrop-filter|mix-blend-mode)/;
const INTERACTION = /^(cursor|pointer-events|scroll|user-select|touch-action|resize|overscroll)/;
const LAYOUT = /^(display|position|inset|top|right|bottom|left|width|height|inline-size|block-size|min-|max-|margin|padding|gap|row-gap|column-gap|flex|grid|align|justify|place|order|overflow|z-index|box-sizing|float|clear|aspect-ratio|object)/;
const COLOUR_UTILITY = /^(color|background|background-color)$/;

/** Read the rules of one statement: [{ sels, decls }] or null when it cannot be read safely. */
function rulesOf(stmt) {
  if (/#\{|@extend|@include|@content|@at-root|@each|@for|@if|@while|%[\w-]/.test(stmt.body)) return null;
  const tree = css.parse(stmt.body);
  const rules = [];
  let ok = true;
  css.walk(tree, (node, parents) => {
    if (node.type === 'atrule' && !/^(media|supports|charset)$/.test(node.name)) ok = false;
    if (node.type === 'unknown') ok = false;
    if (node.type === 'rule' && !node.nestedProps) {
      const decls = (node.nodes || []).filter((d) => d.type === 'decl' && !d.prop.startsWith('$')).map((d) => ({ prop: d.prop, important: !!d.important, value: d.value }));
      if (decls.length) rules.push({ sels: css.resolveSelectors(parents, node), decls, media: parents.filter((p) => p.type === 'atrule').map((p) => `${p.name} ${p.params}`) });
    }
    if (node.type === 'decl' && !parents.some((p) => p.type === 'rule') && !node.prop.startsWith('$')) ok = false;
  });
  return ok ? rules : null;
}

/** Names a statement reads: $variables, mixins, functions, sass: namespaces. */
function refsOf(text, ownVar) {
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  const vars = new Set([...code.matchAll(/\$([\w-]+)/g)].map((m) => m[1]).filter((v) => v !== ownVar));
  const mixins = new Set([...code.matchAll(/@include\s+([\w-]+)/g)].map((m) => m[1]));
  const calls = new Set([...code.matchAll(/(?:^|[^\w$.-])([a-zA-Z_][\w-]*)\(/g)].map((m) => m[1]));
  const ns = new Set([...code.matchAll(/\b(math|map|list|string|meta|color|selector)\.[\w-]+/g)].map((m) => m[1]));
  return { vars, mixins, calls, ns };
}

function selectorKind(sel) {
  const s = sel.replace(/"[^"]*"|'[^']*'/g, '""');
  if (/#[\w-]/.test(s.replace(/\[[^\]]*\]/g, ''))) return 'id';
  if (/\.[\w-]/.test(s.replace(/\[[^\]]*\]/g, ''))) return 'class';
  if (/:root\b|:host/.test(s)) return 'root';
  return 'element';
}

/**
 * Where a top-level statement goes. Returns one of
 *   { kind: 'stay', why, output }  stays in the legacy stylesheet
 *   { kind: 'var', name } | { kind: 'tool', type, name } | { kind: 'fontface' } | { kind: 'tokens', routes }   no CSS output
 *   { kind: 'out', seg, rel, cat }  CSS output, moves into that segment file
 */
function classify(s, ctx) {
  const h = s.head;
  if (s.sassModule) return { kind: 'stay', why: 'sass module', output: false, keepOnly: true };
  if (s.opaque || s.unreadable) return { kind: 'stay', why: `\`${u.clip(h, 60)}\` — an import Foundation B does not follow`, output: true, unknown: true };
  if (/^@charset/i.test(h)) return { kind: 'stay', why: 'charset', output: false, keepOnly: true };
  const vm = /^\$([\w-]+)\s*:/.exec(h);
  if (vm && !s.block) return { kind: 'var', name: vm[1] };
  const tm = /^@(mixin|function)\s+([\w-]+)/.exec(h);
  if (tm) return { kind: 'tool', type: tm[1], name: tm[2] };
  if (/^%/.test(h)) return { kind: 'stay', why: 'placeholder selector (@extend)', output: false };
  if (/^@font-face/i.test(h)) return /\$|#\{/.test(s.body) ? { kind: 'stay', why: '@font-face reads a Sass value', output: false } : { kind: 'fontface' };
  if (/^@(-webkit-)?keyframes/i.test(h)) return { kind: 'stay', why: '@keyframes (moves with the component that uses it)', output: false };
  if (/^:root$/.test(h) && s.block) {
    const decls = st.splitDecls(st.blockInner(s));
    if (decls.length && decls.every((d) => /^--[\w-]+\s*:/.test(d) && !/\$|#\{|@|!important/.test(d.slice(d.indexOf(':') + 1)))) {
      const routes = [];
      for (const d of decls) {
        const name = d.slice(0, d.indexOf(':')).trim();
        const value = d.slice(d.indexOf(':') + 1).trim();
        let file = null;
        if (/^--(hue|saturation|lightness)(-\d+)?$|^--filter-/.test(name)) file = 'theme/colors/colors.base.theme.css';
        else if (/^--(ff|fs|fw|lh)(-|$)|^--font-/.test(name)) file = 'theme/fonts/fonts.theme.css';
        else if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|^var\(--[\w-]+\)$|^(transparent|currentcolor)$/i.test(value) || /^--[a-z][\w-]*-\d+$/.test(name) || require('./lib/color').parseColor(value)) file = 'theme/colors/colors.palette.theme.css';
        if (!file) return { kind: 'stay', why: `token \`${name}\` is neither a colour nor a font token (no theme file holds it)`, output: true, rules: [{ sels: [':root'], decls: decls.map((x) => ({ prop: x.slice(0, x.indexOf(':')).trim(), important: false })) }] };
        routes.push({ file, decl: `${name}: ${value}` });
      }
      return { kind: 'tokens', routes };
    }
    return { kind: 'stay', why: '`:root` rule that is not only tokens (`:root` belongs to the theme token files)', output: true };
  }
  if (!s.block) return { kind: 'stay', why: `\`${u.clip(h, 50)}\``, output: true, unknown: true };
  const rules = rulesOf(s);
  if (!rules) return { kind: 'stay', why: 'uses Sass Foundation B does not move (@include, @extend, interpolation, control flow)', output: true, unknown: true };
  if (!rules.length) return { kind: 'stay', why: 'empty rule', output: false };
  const sels = rules.flatMap((r) => r.sels);
  const kinds = new Set(sels.map(selectorKind));
  const reducedMotion = /^@media\b[^{]*prefers-reduced-motion/.test(h);
  if (kinds.size === 1 && kinds.has('element')) {
    if (reducedMotion || sels.some((x) => /\*|\[hidden\]/.test(x))) return { kind: 'out', seg: 'generic', rel: RESET, rules };
    return { kind: 'out', seg: 'elements', rel: ELEMENTS, rules };
  }
  if (kinds.has('root')) return { kind: 'stay', why: '`:root` / `:host` selector (only the theme token files use `:root`)', output: true, rules };
  if (kinds.has('id')) return { kind: 'stay', why: 'ID selector', output: true, rules };
  // utilities: a single u- class per selector, one property (sr-only exceptions)
  const utilRe = /^\.(u-[\w-]+)((?::{1,2}[\w-]+(?:\([^)]*\))?)*)$/;
  const utils = sels.map((x) => (utilRe.exec(x.trim()) || [])[1]);
  if (utils.every(Boolean) && new Set(utils).size === 1) {
    const cls = utils[0];
    const props = [...new Set(rules.flatMap((r) => r.decls.map((d) => d.prop.toLowerCase())))];
    if (/^u-(not-)?sr-only$/.test(cls)) return { kind: 'out', seg: 'utilities', rel: SR_ONLY, cat: 'accessibility', rules };
    if (props.length !== 1) return { kind: 'stay', why: `utility \`.${cls}\` sets ${props.length} properties (a utility sets one)`, output: true, rules };
    const p = props[0].replace(/^-(webkit|moz|ms)-/, '');
    if (COLOUR_UTILITY.test(p)) return { kind: 'stay', why: `colour utility \`.${cls}\` — colour utilities are generated with @each over settings/_colors.settings.scss`, output: true, rules };
    const cat = TYPOGRAPHY.test(p) ? 'typography' : VISUAL.test(p) ? 'visual' : INTERACTION.test(p) ? 'interaction' : LAYOUT.test(p) ? 'layout' : null;
    if (!cat) return { kind: 'stay', why: `utility \`.${cls}\` sets \`${p}\`, which fits no utility category for sure`, output: true, rules };
    const group = /^(font|text)-/.test(p) ? p : p.replace(/^(min|max)-/, '').split('-')[0];
    return { kind: 'out', seg: 'utilities', rel: `utilities/${cat}/_${group}.utility.scss`, cat, rules };
  }
  // vendor overrides already scoped by an existing m- block: `.m-modal .modal-header`
  const lib = libraryOverride(sels, ctx);
  if (lib) return { kind: 'out', seg: 'modules', rel: lib, rules };
  return { kind: 'stay', why: 'class rule (unprefixed or not a utility/vendor override) — migrate it page by page', output: true, rules };
}

function libraryOverride(sels, ctx) {
  let block = null, lib = null;
  for (const sel of sels) {
    const first = /^\.(m-[\w-]+)(?=[\s.:>+~[]|$)/.exec(sel.trim());
    if (!first) return null;
    if (block && block !== first[1]) return null;
    block = first[1];
    const vendor = css.classesIn(sel).filter((c) => !/^(o|c|l|m|ctrl|p|u|is|has|js)-/.test(c)).map((c) => libs.libraryName(c, ctx.libCtx));
    if (!vendor.length || vendor.some((v) => !v)) return null;
    if (lib && lib !== vendor[0]) return null;
    lib = vendor[0];
  }
  if (!block || !ctx.knownM.has(block)) return null;
  const name = block.slice(2);
  const own = ctx.moduleFiles.find((f) => new RegExp(`^_${esc(name)}\\.module\\.scss$`).test(path.posix.basename(f)));
  if (own) return null; // a plain module holds no vendor selector, and an own module never takes a library component's name (R-36)
  return `modules/_${name}.${lib}.module.scss`;
}

const RANK = { generic: 0, elements: 1, modules: 2, utilities: 3 };

function move(root, profile, { apply }) {
  const sr = project.scssRoot(profile);
  const a = readNg(root, profile);
  const report = { moved: [], kept: [], judge: [], legacy: [], created: [], changed: [], deleted: [], proof: null };
  if (!a) { report.judge.push('angular.json is missing or invalid'); return { report, code: 6 }; }
  const before = snapshot(root, profile);
  // no proof possible → nothing is moved (not by script, not by hand)
  if (before.noSass) { report.proof = 'not possible: sass cannot be loaded from the project (no node_modules?)'; report.judge.push('STOPPED: Foundation B needs the compile proof — run `npm install` in the project first, then `/ui-guard:fix scss` again. Nothing was moved.'); return { report, code: 7 }; }
  if (before.error) { report.judge.push('the project does not compile before the move: ' + before.error); return { report, code: 6 }; }
  const globals = globalStyles(a, sr).filter((s) => isInjected(s) && inputOf(s) !== `${sr}/${OLD_ENTRY}`);
  if (!globals.length) { report.proof = 'nothing to move'; return { report, code: 0 }; }
  for (const e of ENTRIES) if (!u.exists(u.fromPosix(root, `${sr}/${e}`)) || !(a.options.styles || []).some((s) => inputOf(s) === `${sr}/${e}`)) { report.judge.push(`\`${sr}/${e}\` is missing or not in angular.json styles — run Foundation A first`); return { report, code: 6 }; }
  const styles = a.options.styles || [];
  const commonAt = styles.findIndex((s) => inputOf(s) === `${sr}/${COMMON}`);
  const comps = componentStyles(root);
  const inc = loadPathsOf(root, a).map((p) => path.join(root, ...p.split('/')));
  const graph = require('./lib/sass-graph');
  const sharedWithComponents = new Set();
  for (const c of comps) { const abs = u.fromPosix(root, c); if (!u.exists(abs)) continue; for (const r of graph.reachable(graph.build([abs], inc), abs, (f) => graph.build([f], inc))) sharedWithComponents.add(path.resolve(r)); }
  const ours = new Set(expected().map((e) => `${sr}/${e.rel}`));
  const moduleFiles = u.walk(u.fromPosix(root, `${sr}/modules`)).map((f) => u.relPosix(root, f));
  // m- blocks that exist: declared in a module file or used in a template
  const knownM = new Set();
  for (const f of moduleFiles) for (const m of (u.readText(u.fromPosix(root, f)) || '').matchAll(/\.(m-[\w-]+)/g)) knownM.add(m[1].replace(/__.*/, ''));
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'html')) for (const m of (u.readText(f.abs) || '').matchAll(/\bm-[a-z][\w-]*/g)) knownM.add(m[0].replace(/__.*/, ''));
  const ctx = { sr, inc, sharedWithComponents, ours, files: new Set(), partialOf: new Map(), libCtx: libs.context(root, profile), knownM, moduleFiles };
  // statements in cascade order: every global (they sit before common.scss), in angular.json order
  const stmts = [];
  for (const s of globals) {
    const at = styles.indexOf(s);
    if (commonAt >= 0 && at > commonAt) { report.judge.push(`\`${inputOf(s)}\` is listed after \`${sr}/${COMMON}\` in angular.json styles — the legacy stylesheet is linked right after the vendor CSS, before common; decide the order`); continue; }
    // vendor CSS linked between this stylesheet and common: a moved rule would pass vendor rules nobody reads here
    const vendorAfter = styles.slice(at + 1, commonAt).some(isVendor);
    for (const x of flatten(root, u.fromPosix(root, inputOf(s)), ctx)) stmts.push(vendorAfter ? { ...x, vendorAfter: inputOf(s) } : x);
  }
  if (report.judge.length) return { report, code: 6 };
  // existing tools (name → file) so a moved statement can reach them
  const tools = new Map();
  for (const f of u.walk(u.fromPosix(root, `${sr}/tools`)).filter((x) => /\.scss$/.test(x))) for (const m of (u.readText(f) || '').matchAll(/@(mixin|function)\s+([\w-]+)/g)) tools.set(m[2], { file: u.relPosix(u.fromPosix(root, sr), f), type: m[1] });
  const list = stmts.map((s, i) => ({ s, i, c: classify(s, ctx), refs: refsOf(s.body, (/^\$([\w-]+)/.exec(s.head) || [])[1]) }));
  // a variable defined twice, or a tool defined twice / already in tools/, stays
  const defCount = {};
  for (const x of list) if (x.c.kind === 'var' || x.c.kind === 'tool') { const k = x.c.kind + ':' + x.c.name; defCount[k] = (defCount[k] || 0) + 1; }
  for (const x of list) {
    if (x.c.kind === 'var' && defCount['var:' + x.c.name] > 1) x.c = { kind: 'stay', why: `\`$${x.c.name}\` is assigned more than once (the order of the assignments matters)`, output: false };
    if (x.c.kind === 'tool' && (defCount['tool:' + x.c.name] > 1 || tools.has(x.c.name))) x.c = { kind: 'stay', why: `tool \`${x.c.name}\` is defined more than once or already exists in tools/ (STYLE-38)`, output: false };
    if (x.c.kind === 'var' && [...x.refs.calls].some((n) => tools.has(n) || list.some((y) => y.c.kind === 'tool' && y.c.name === n))) x.c = { kind: 'stay', why: `\`$${x.c.name}\` is computed by a tool (settings read no tool)`, output: false };
  }
  for (const x of list) if (x.s.vendorAfter && x.c.kind === 'out') x.c = { kind: 'stay', why: `vendor CSS is linked between \`${x.s.vendorAfter}\` and common.scss in angular.json styles`, output: true, rules: x.c.rules };
  const moving = new Set(list.filter((x) => x.c.kind !== 'stay').map((x) => x.i));
  const targetKey = (x) => {
    const c = x.c;
    let k = RANK[c.seg] * 1000;
    if (c.seg === 'utilities') k += UTIL_CATEGORIES.indexOf(c.cat) * 100 + (firstUse.get(c.rel) || 0) / 100;
    if (c.seg === 'modules') k += (firstUse.get(c.rel) || 0) / 100;
    return k;
  };
  const firstUse = new Map();
  for (const x of list) if (x.c.kind === 'out' && !firstUse.has(x.c.rel)) firstUse.set(x.c.rel, firstUse.size);
  const stay = (x, why) => { moving.delete(x.i); x.c = { kind: 'stay', why, output: x.c.kind === 'out', rules: x.c.rules, unknown: !x.c.rules && x.c.kind === 'out' }; };
  const ruleList = (x) => (x.c.rules ? x.c.rules.map((r) => ({ sels: r.sels, decls: r.decls })) : [{ unknown: true }]);
  // fixpoint: (1) cascade — a moved rule may only pass rules it can never conflict with; (2) references — a moved statement
  // reads only moved or existing settings/tools; a moved definition is read by no statement that stays
  for (let guard = 0; guard < 1000; guard++) {
    let changedAny = false;
    const outs = list.filter((x) => x.c.kind === 'out' || (x.c.kind === 'stay' && x.c.output));
    for (let p = 0; p < outs.length && !changedAny; p++) {
      const A = outs[p];
      if (!moving.has(A.i)) continue;
      for (let q = p + 1; q < outs.length; q++) {
        const B = outs[q];
        const swapped = !moving.has(B.i) || targetKey(A) > targetKey(B);
        if (!swapped) continue;
        if (cascade.conflictMany(ruleList(A), ruleList(B))) { stay(A, `it would move past \`${u.clip(B.s.head, 40)}\`, which it can conflict with (cascade order)`); changedAny = true; break; }
      }
    }
    if (changedAny) continue;
    const movedVar = new Set(list.filter((x) => moving.has(x.i) && x.c.kind === 'var').map((x) => x.c.name));
    const legacyVar = new Set(list.filter((x) => !moving.has(x.i) && /^\$[\w-]+\s*:/.test(x.s.head) && !x.s.block).map((x) => (/^\$([\w-]+)/.exec(x.s.head) || [])[1]));
    const legacyTool = new Set(list.filter((x) => !moving.has(x.i) && /^@(mixin|function)\b/.test(x.s.head)).map((x) => (/^@(?:mixin|function)\s+([\w-]+)/.exec(x.s.head) || [])[1]));
    for (const x of list) {
      if (!moving.has(x.i)) continue;
      const k = x.c.kind;
      // a rule or a settings value reads only moved variables; a tool body may also read its own parameters/locals
      const badVar = [...x.refs.vars].find((v) => (k === 'tool' ? legacyVar.has(v) : !movedVar.has(v)));
      const badTool = [...x.refs.mixins, ...x.refs.calls].find((n) => legacyTool.has(n) && n !== x.c.name);
      if (badVar) { stay(x, `reads \`$${badVar}\`, which stays in the legacy stylesheet or is not a moved variable`); changedAny = true; break; }
      if (badTool) { stay(x, `uses \`${badTool}\`, which stays in the legacy stylesheet`); changedAny = true; break; }
      if (k === 'var' || k === 'tool') {
        const reader = list.find((y) => !moving.has(y.i) && y.i !== x.i && (k === 'var' ? y.refs.vars.has(x.c.name) : (y.refs.mixins.has(x.c.name) || y.refs.calls.has(x.c.name))));
        if (reader) { stay(x, `still read by \`${u.clip(reader.s.head, 40)}\`, which stays`); changedAny = true; break; }
      }
    }
    if (!changedAny) break;
  }
  // targets
  const targets = new Map(); // rel (scss-root relative) → { seg, parts:[], uses:Set, deps:Set, ns:Set }
  const target = (rel, seg) => { if (!targets.has(rel)) targets.set(rel, { seg, parts: [], vars: new Set(), tools: new Set(), ns: new Set() }); return targets.get(rel); };
  const allTools = new Map(tools);
  for (const x of list) if (moving.has(x.i) && x.c.kind === 'tool') allTools.set(x.c.name, { file: x.c.type === 'mixin' ? `tools/mixins/_${x.c.name}.mixin.scss` : `tools/functions/_${x.c.name}.function.scss`, type: x.c.type, moved: true });
  const themeDirs = project.themeDirs(root, profile);
  const tokenAdds = new Map(); // theme file (under theme/) → [decl]
  const fontFaces = [];
  for (const x of list) {
    const s = x.s;
    const where = `${u.relPosix(root, s.origin)}: \`${u.clip(s.head, 50)}\``;
    if (!moving.has(x.i)) { if (!x.c.keepOnly) report.kept.push(`${where} stays in the legacy stylesheet — ${x.c.why}`); continue; }
    const body = (s.lead.replace(/^\s*\n/, '') + s.body).replace(/^\s+/, '');
    if (x.c.kind === 'var') {
      const t = target(SETTINGS, 'settings');
      const readers = list.filter((y) => y.i !== x.i && y.refs.vars.has(x.c.name)).map((y) => (y.c.kind === 'out' && moving.has(y.i) ? y.c.rel : null)).filter(Boolean);
      t.parts.push(`// $${x.c.name}: moved from ${u.relPosix(root, s.origin)} by Foundation B. Read by: ${[...new Set(readers)].join(', ') || 'no stylesheet yet'}.\n${s.body.trim()}`);
      for (const n of x.refs.ns) t.ns.add(n);
    } else if (x.c.kind === 'tool') {
      const rel = allTools.get(x.c.name).file;
      const t = target(rel, 'tools');
      const params = (/^@(?:mixin|function)\s+[\w-]+\s*\(([^)]*)\)/.exec(s.head) || [])[1] || '';
      const doc = [`/// ${x.c.name}(${params.trim()}) — moved from ${u.relPosix(root, s.origin)} by Foundation B.`];
      for (const p of params.split(',').map((q) => q.trim()).filter(Boolean)) { const [n, d] = p.split(':').map((q) => q.trim()); doc.push(`/// @param ${n}${d ? ` (default ${d})` : ''}`); }
      t.parts.push(doc.join('\n') + '\n' + s.body.trim());
      for (const v of x.refs.vars) t.vars.add(v);
      for (const n of [...x.refs.mixins, ...x.refs.calls]) if (allTools.has(n) && n !== x.c.name) t.tools.add(n);
      for (const n of x.refs.ns) t.ns.add(n);
    } else if (x.c.kind === 'fontface') {
      fontFaces.push({ body: s.body.trim(), from: path.dirname(s.origin) });
    } else if (x.c.kind === 'tokens') {
      for (const r of x.c.routes) { if (!tokenAdds.has(r.file)) tokenAdds.set(r.file, []); tokenAdds.get(r.file).push(r.decl); }
    } else {
      const t = target(x.c.rel, x.c.seg);
      t.cat = x.c.cat;
      t.parts.push(rebaseUrls(body, path.dirname(s.origin), path.dirname(u.fromPosix(root, `${sr}/${x.c.rel}`))));
      for (const v of x.refs.vars) t.vars.add(v);
      for (const n of [...x.refs.mixins, ...x.refs.calls]) if (allTools.has(n)) t.tools.add(n);
      for (const n of x.refs.ns) t.ns.add(n);
    }
    report.moved.push(`${where} → ${x.c.kind === 'out' ? x.c.rel : x.c.kind === 'var' ? SETTINGS : x.c.kind === 'tool' ? allTools.get(x.c.name).file : x.c.kind === 'fontface' ? 'theme/fonts/fonts.theme.css' : [...new Set(x.c.routes.map((r) => r.file))].join(', ')}`);
  }
  const removed = new Map(); // origin file → [{start,end}]
  for (const x of list) if (moving.has(x.i)) { if (!removed.has(x.s.origin)) removed.set(x.s.origin, []); removed.get(x.s.origin).push({ start: x.s.start, end: x.s.end }); }
  if (!apply) { report.legacy = legacyAfter(root, ctx, globals, removed, true); return { report, code: 0 }; }
  // original contents of every file we may touch → rollback
  const backup = new Map();
  const remember = (abs) => { if (!backup.has(abs)) backup.set(abs, u.exists(abs) ? fs.readFileSync(abs) : null); };
  try {
    const srAbs = u.fromPosix(root, sr);
    for (const [rel, t] of targets) {
      const abs = u.fromPosix(root, `${sr}/${rel}`);
      remember(abs);
      const existing = lf(u.readText(abs));
      const header = headerFor(rel, t, allTools);
      const add = t.parts.join('\n\n') + '\n';
      let next;
      if (existing == null || /Empty until Foundation B/.test(existing)) next = header + (t.seg === 'settings' ? '\n// Variables moved from the legacy stylesheet by Foundation B.\n\n' : '\n') + add;
      else next = mergeHeader(existing, header).replace(/\n*$/, '\n') + '\n' + add;
      if (existing == null) report.created.push(`${sr}/${rel}`);
      u.writeText(abs, next);
      report.changed.push(`${sr}/${rel}`);
      wire(root, sr, rel, t, remember);
    }
    // tokens and @font-face → the active theme and every theme source (STYLE-35: the same names everywhere)
    for (const th of themeDirs) {
      for (const [file, decls] of tokenAdds) {
        const abs = path.join(th.themeDir, ...file.replace(/^theme\//, '').split('/'));
        remember(abs);
        const cur = lf(u.readText(abs)) || '@charset "UTF-8";\n';
        u.writeText(abs, cur.replace(/\n*$/, '\n') + '\n:root {\n' + decls.map((d) => `  ${d};`).join('\n') + '\n}\n');
        report.changed.push(u.relPosix(root, abs));
      }
      if (fontFaces.length) {
        const abs = path.join(th.themeDir, 'fonts', 'fonts.theme.css');
        remember(abs);
        const cur = lf(u.readText(abs)) || '@charset "UTF-8";\n';
        const faces = fontFaces.map((f) => rebaseUrls(f.body, f.from, path.dirname(abs))).join('\n\n');
        // @font-face rules go before the :root blocks (order-free, kept readable)
        const firstRoot = cur.search(/^:root\b/m);
        const next = firstRoot < 0 ? cur.replace(/\n*$/, '\n') + '\n' + faces + '\n' : cur.slice(0, firstRoot) + faces + '\n\n' + cur.slice(firstRoot);
        u.writeText(abs, next);
        report.changed.push(u.relPosix(root, abs));
      }
    }
    // settings/_colors.settings.scss follows the palette — only when it is still the generated file (never a project's own maps)
    const colorsFile = u.fromPosix(root, `${sr}/settings/_colors.settings.scss`);
    if (tokenAdds.has('theme/colors/colors.palette.theme.css') && /^\/\/ Colour maps, one per family\./m.test(u.readText(colorsFile) || '')) {
      remember(colorsFile);
      u.writeText(colorsFile, colorsSettings(root, sr));
      report.changed.push(`${sr}/settings/_colors.settings.scss`);
    }
    // remove the moved statements from the files they were written in (from the end, so offsets stay right)
    for (const [file, spans] of removed) {
      remember(file);
      let text = fs.readFileSync(file, 'utf8');
      for (const sp of spans.sort((p, q) => q.start - p.start)) text = text.slice(0, sp.start) + text.slice(sp.end);
      fs.writeFileSync(file, text.replace(/\n{3,}/g, '\n\n'));
      report.changed.push(u.relPosix(root, file));
    }
    // a global stylesheet left with nothing but @charset, comments and empty partials leaves the build
    const json = a.json;
    const emptied = new Set();
    for (const g of globals) { const abs = u.fromPosix(root, inputOf(g)); if (isEmptyStylesheet(root, abs, ctx)) emptied.add(inputOf(g)); }
    if (emptied.size) {
      remember(path.join(root, 'angular.json'));
      a.options.styles = (a.options.styles || []).filter((s) => !emptied.has(inputOf(s)));
      writeNg(root, a);
      report.changed.push('angular.json');
      for (const g of emptied) {
        const abs = u.fromPosix(root, g);
        for (const p of partialsOf(abs, ctx)) if (u.exists(p) && !sharedWithComponents.has(p)) { remember(p); fs.unlinkSync(p); report.deleted.push(u.relPosix(root, p)); }
        remember(abs); fs.unlinkSync(abs); report.deleted.push(g);
      }
    }
    void json; void srAbs;
    const after = snapshot(root, profile);
    const cmp = after.error ? { same: false, reason: after.error } : st.sameRender(before.norm, after.norm, { reorder: true });
    if (!cmp.same) throw new Error('the compiled CSS would change: ' + cmp.reason);
    report.legacy = legacyAfter(root, ctx, globals.filter((g) => !emptied.has(inputOf(g))), removed, false);
    report.proof = 'compiled CSS before and after renders the same (every moved rule passes only rules it can never conflict with; tokens, @font-face and @keyframes unchanged)';
    return { report, code: 0 };
  } catch (e) {
    for (const [abs, data] of backup) { if (data == null) { try { fs.unlinkSync(abs); } catch { /* not created */ } } else { u.mkdirp(path.dirname(abs)); fs.writeFileSync(abs, data); } }
    report.judge.push(`rolled back: ${e.message}`);
    report.created = []; report.changed = []; report.deleted = []; report.moved = []; report.legacy = [];
    return { report, code: 6 };
  }
}

function partialsOf(abs, ctx) { return [...ctx.partialOf].filter(([, parent]) => parent === abs).flatMap(([p]) => [p, ...partialsOf(p, ctx)]); }

/** Nothing left but @charset, comments, sass: modules and imports of partials that are themselves empty. */
function isEmptyStylesheet(root, abs, ctx, seen = new Set()) {
  if (seen.has(abs)) return true;
  seen.add(abs);
  const text = u.readText(abs);
  if (text == null) return false;
  for (const s of st.splitTop(text, { scss: /\.scss$/.test(abs) })) {
    if (s.trailing || /^@charset/i.test(s.head)) continue;
    const m = /^@(import|use)\s+(.+)$/.exec(s.head);
    if (m && !s.block) {
      const targets = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
      if (targets.every((t) => /^sass:/.test(t))) continue;
      const kids = targets.map((t) => require('./lib/sass-graph').resolve(abs, t, ctx.inc));
      if (kids.every((k) => k && ctx.partialOf.get(path.resolve(k)) === abs && isEmptyStylesheet(root, path.resolve(k), ctx, seen))) continue;
    }
    return false;
  }
  return true;
}

/** The legacy stylesheet after the move: the globals that stay, and their partials that still hold something. */
function legacyAfter(root, ctx, globals, removed, dry) {
  const out = new Set();
  for (const g of globals) {
    const abs = u.fromPosix(root, inputOf(g));
    if (dry && removed.has(abs)) { /* dry run: still listed */ }
    out.add(inputOf(g));
    for (const p of partialsOf(path.resolve(abs), ctx)) if (u.exists(p)) out.add(u.relPosix(root, p));
  }
  return [...out].sort();
}

function depsLines(rel, t, allTools) {
  const deps = new Set();
  if (t.vars.size && t.seg !== 'settings') deps.add(SETTINGS);
  for (const n of t.tools) { const d = allTools.get(n); if (d) deps.add(`tools/${d.file.replace(/^tools\//, '')}`); }
  return [...deps].sort().map((d) => `// @dependencies: ${d}`);
}

function headerFor(rel, t, allTools) {
  const depth = rel.split('/').length - 1;
  const up = '../'.repeat(depth);
  const L = ['@charset "UTF-8";'];
  const deps = depsLines(rel, t, allTools);
  if (deps.length) L.push('', ...deps);
  const uses = [...t.ns].sort().map((n) => `@use "sass:${n}";`);
  if (t.seg === 'tools') {
    if (t.vars.size) uses.push(`@use "${up}${SETTINGS.replace(/\/_/, '/').replace(/\.scss$/, '')}" as *;`);
    for (const n of [...t.tools].sort()) { const d = allTools.get(n); const target = path.posix.relative(path.posix.dirname(rel), d.file).replace(/(^|\/)_/, '$1').replace(/\.scss$/, ''); uses.push(`@use "${target.startsWith('.') ? target : './' + target}" as *;`); }
  } else if (t.seg !== 'settings') {
    if (t.vars.size) uses.push(`@use "${up}${SETTINGS.replace(/\/_/, '/').replace(/\.scss$/, '')}" as *;`);
    if (t.tools.size) uses.push(`@use "${up}tools" as *;`);
  }
  if (uses.length) L.push('', ...uses);
  return L.join('\n') + '\n';
}

/** Add the header lines an existing file lacks, right after its @charset (and its comment block). */
function mergeHeader(existing, header) {
  const want = header.split('\n').filter((l) => l && !l.startsWith('@charset') && !existing.includes(l));
  if (!want.length) return existing;
  const lines = existing.split('\n');
  let at = /^@charset/.test(lines[0]) ? 1 : 0;
  while (at < lines.length && (lines[at].trim() === '' || /^\/\/ @dependencies:|^@use\b|^@forward\b/.test(lines[at]))) at++;
  lines.splice(at, 0, ...want, '');
  return lines.join('\n');
}

/** Wire a new segment file into its index / aggregator (in order of first use). */
function wire(root, sr, rel, t, remember) {
  const line = (file, text) => { const abs = u.fromPosix(root, `${sr}/${file}`); remember(abs); const cur = lf(u.readText(abs)) || '@charset "UTF-8";\n'; if (cur.includes(text)) return; u.writeText(abs, cur.replace(/\n*$/, '\n') + (/@(use|forward)\b/.test(cur) ? '' : '\n') + text + '\n'); };
  const base = path.posix.basename(rel).replace(/^_/, '').replace(/\.scss$/, '');
  if (t.seg === 'tools') line(rel.includes('/mixins/') ? 'tools/mixins/_index.scss' : 'tools/functions/_index.scss', `@forward "./${base}";`);
  else if (t.seg === 'utilities') {
    line(`utilities/${t.cat}/_index.scss`, `@use "./${base}" as *;`);
    line(UTILS, `@use "./${t.cat}" as *;`);
  } else if (t.seg === 'modules') line('common/_modules.common.scss', `@use "../modules/${base}" as *;`);
  else if (t.seg === 'generic') line('generic/_index.scss', '@use "./reset.generic" as *;');
}

/** Compile every injected global stylesheet in angular.json order + the theme <link> files → normalized form. */
function snapshot(root, profile) {
  const a = readNg(root, profile);
  if (!a) return { error: 'angular.json is missing or invalid' };
  const inc = loadPathsOf(root, a);
  const parts = [];
  for (const s of a.options.styles || []) {
    if (!isInjected(s)) continue;
    const abs = u.fromPosix(root, inputOf(s));
    const r = st.compile(root, abs, { loadPaths: inc });
    if (r == null) return { noSass: true };
    if (r.error) return { error: `${inputOf(s)} does not compile: ${r.error}` };
    parts.push(r.css);
  }
  const idx = u.readText(path.join(root, 'src', 'index.html')) || '';
  for (const m of idx.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi)) {
    const href = (m[1] || m[2] || '').replace(/^\//, '');
    if (/^https?:/.test(href)) continue;
    const abs = path.join(root, 'src', ...href.split('/'));
    const t = u.readText(abs);
    if (t != null) parts.push(t);
  }
  return { norm: st.normalize(parts.join('\n'), { rootPx: profile.rootFontSize || 16, dir: 'ltr' }) };
}

// ---------- u-sr-only (before /ui-guard:fix access) ----------
/**
 * Make sure .u-sr-only exists (AXIS accessibility rule 5: text for screen readers only uses u-sr-only, declared once in
 * utilities/accessibility/; it is never re-implemented, so a project sr-only / visually-hidden class is not reused).
 * Creates ONLY utilities/accessibility/_sr-only.utility.scss and its @use lines. Returns { status: 'exists'|'created'|'missing'|'stop', className, reason, created[] }.
 */
function srOnly(root, profile, { apply }) {
  const sr = project.scssRoot(profile);
  const defined = definedClasses(root, profile);
  if (defined.has('u-sr-only')) return { status: 'exists', className: 'u-sr-only', created: [] };
  const a = readNg(root, profile);
  if (!a || !(a.options.styles || []).some((s) => inputOf(s) === `${sr}/${UTILS}` && isInjected(s))) {
    return { status: 'stop', reason: `no .u-sr-only, and \`${sr}/${UTILS}\` is not loaded from angular.json styles — run \`/ui-guard:fix scss\` first (Foundation A creates the utilities segment), then \`/ui-guard:fix access\`` };
  }
  if (!u.exists(u.fromPosix(root, `${sr}/tools/_index.scss`))) return { status: 'stop', reason: `no .u-sr-only, and \`${sr}/tools/\` is missing — run \`/ui-guard:fix scss\` first (Foundation A), then \`/ui-guard:fix access\`` };
  if (!apply) return { status: 'missing', created: [] };
  const created = [];
  const file = u.fromPosix(root, `${sr}/${SR_ONLY}`);
  u.writeText(file, lf(u.readText(path.join(T, 'scss', ...SR_ONLY.split('/')))));
  created.push(u.relPosix(root, file));
  const idx = u.fromPosix(root, `${sr}/utilities/accessibility/_index.scss`);
  if (!u.exists(idx)) created.push(u.relPosix(root, idx));
  const cur = lf(u.readText(idx)) || '@charset "UTF-8";\n';
  if (!cur.includes('@use "./sr-only.utility" as *;')) u.writeText(idx, cur.replace(/\n*$/, '\n') + (/@use\b/.test(cur) ? '' : '\n') + '@use "./sr-only.utility" as *;\n');
  const utils = u.fromPosix(root, `${sr}/${UTILS}`);
  const ut = lf(u.readText(utils)) || '@charset "UTF-8";\n';
  if (!/@use\s+["']\.\/accessibility["']/.test(ut)) {
    // accessibility is the first category
    const lines = ut.split('\n');
    const first = lines.findIndex((l) => /^@use\b/.test(l));
    if (first < 0) lines.splice(lines.length - (lines[lines.length - 1] === '' ? 1 : 0), 0, '', '@use "./accessibility" as *;');
    else lines.splice(first, 0, '@use "./accessibility" as *;');
    u.writeText(utils, lines.join('\n'));
  }
  return { status: 'created', className: 'u-sr-only', created };
}

module.exports = { run, gaps, expected, structure, move, snapshot, componentStyles, srOnly, colorsSettings, classify, THEME_FILES, ENTRIES };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['apply', 'json']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const profile = project.readProfile(root);
  const cmd = args._[0];
  if (cmd === 'check') {
    const g = gaps(root, profile);
    if (args.json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
    console.log(`STYLE-48 architecture gap: ${g.missing.length} missing, ${g.wiring.length} wiring, ${g.misplaced.length} misplaced · ${g.legacy.length} legacy (frozen)`);
    for (const m of g.missing) console.log(`  missing   ${m.rel}`);
    for (const w of g.wiring) console.log(`  wiring    ${w.file}: ${w.what}`);
    for (const m of g.misplaced) console.log(`  misplaced ${m.rel}: ${m.what}`);
    for (const l of g.legacy) console.log(`  legacy    ${l} — frozen, linked right after the vendor CSS; migrate page by page`);
    process.exit(0);
  }
  if (cmd === 'structure') {
    const r = structure(root, profile, { apply: !!args.apply });
    console.log(`Foundation A${args.apply ? '' : ' (dry run)'}: ${r.created.length} file(s) ${args.apply ? 'created' : 'to create'}, ${r.changed.length} wiring change(s)`);
    for (const f of r.created) console.log('  + ' + f);
    for (const c of r.changed) console.log('  ~ ' + c);
    for (const s of r.skipped) console.log('  skipped (unsure): ' + s);
    process.exit(0);
  }
  if (cmd === 'sr-only') {
    const r = srOnly(root, profile, { apply: !!args.apply });
    if (r.status === 'exists') console.log('u-sr-only: the project already declares `.u-sr-only` — nothing created.');
    else if (r.status === 'created') console.log(`u-sr-only: created \`.u-sr-only\` (utilities/accessibility/ only): ${r.created.join(', ')}`);
    else if (r.status === 'missing') console.log('u-sr-only: missing — run with --apply to create .u-sr-only in utilities/accessibility/.');
    else console.log(`STOP: ${r.reason}`);
    process.exit(r.status === 'stop' ? 8 : 0);
  }
  if (cmd === 'move') {
    const { report, code } = move(root, profile, { apply: !!args.apply });
    const out = MOVE_REPORT(root);
    if (args.apply || !u.exists(out)) u.writeJSON(out, report);
    console.log(`Foundation B${args.apply ? '' : ' (dry run)'}: ${report.moved.length} statement(s) ${args.apply && code === 0 ? 'moved' : 'to move'}, ${report.kept.length} stay in the legacy stylesheet, ${report.judge.length} need judgment`);
    for (const d of report.deleted) console.log('  - ' + d);
    for (const l of report.legacy) console.log('  legacy (frozen, migrate page by page): ' + l);
    for (const k of report.kept) console.log('  stays: ' + k);
    for (const j of report.judge) console.log('  needs judgment: ' + j);
    if (report.proof) console.log('  proof: ' + report.proof);
    console.log(`  details → ${u.relPosix(root, out)}`);
    process.exit(code);
  }
  console.log(HELP);
}
