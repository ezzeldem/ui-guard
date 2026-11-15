#!/usr/bin/env node
'use strict';
// STYLE-48 "architecture gap" + the two Foundation phases of `/ui-guard:fix scss` (scripts only, 0 tokens).
//   check      compare the project with OUR structure (templates/scss + the four theme files): what is missing, what is misplaced
//   structure  Foundation A — create the missing segments, tools, settings, theme and entry files; wire angular.json + index.html.
//              Files with CSS output that would change the page (resets, element rules) are created as empty segment files.
//   move       Foundation B — move the rules of the existing global stylesheets (styles.scss, general.scss, …) into the segment
//              files, in the same cascade order. Proof: the compiled global CSS before and after must render the same
//              (scss-text.normalize). Anything that cannot be proven neutral is rolled back and left for the fixer agent.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const ng = require('./lib/angular');
const st = require('./lib/scss-text');
const libs = require('./lib/libclasses');
const { mk } = require('./lib/findings');

const HELP = `foundation.js — STYLE-48 architecture gap + Foundation A/B of /ui-guard:fix scss (scripts only, 0 tokens).
Usage (all accept --root <dir>):
  node foundation.js check [--json]     list what is missing and what is misplaced (also part of run-checks --domain scss)
  node foundation.js structure [--apply]
        Foundation A: create the missing segment/tools/settings/theme/entry files from templates/, add the scss root to
        includePaths, the entry to angular.json styles (when nothing loads it yet) and the theme <link>s to index.html.
        No value changes; resets/element rules are created as empty segment files (nothing that changes the page).
  node foundation.js sr-only [--apply]
        before /ui-guard:fix access: reuse the project's visually-hidden class, or create ONLY .u-sr-only in the utilities layer
        (loaded from the global entry). Exit 8 = STOP: no utility and the global entry is not loaded (run /ui-guard:fix scss first).
  node foundation.js move [--apply]
        Foundation B: move the rules of the existing global stylesheets into the segment files in cascade order, update the
        entry and angular.json styles, delete emptied old files. Verified by compiling before/after with the project's sass.
        Exit 0 = everything moved and proven · 6 = something left for the fixer agent (see .ui-guard/scss/foundation-move.json)
        · 7 = sass cannot be loaded (no node_modules): STOP — nothing moved; run npm install first.`;

const T = path.join(project.PLUGIN_ROOT, 'templates');
const THEME_FILES = ['theme/colors/colors.palette.theme.css', 'theme/fonts/fonts.theme.css', 'theme/images/images.theme.css', 'theme/custom.theme.css'];
const ENTRY = 'style.scss';

// ---------- the expected structure ----------
/** Every file of OUR structure (relative to the scss root) with how Foundation A creates it. */
function expected() {
  const out = [];
  const tpl = path.join(T, 'scss');
  for (const f of u.walk(tpl)) {
    const rel = u.relPosix(tpl, f);
    if (rel === 'packages/README.md') continue; // vendor CSS folder only when there is vendor CSS
    const seg = rel.split('/')[0];
    let mode = 'copy';
    if (/\.gitkeep$/.test(rel)) mode = 'keep';
    else if ((seg === 'generic' || seg === 'elements') && !/_index\.scss$/.test(rel)) mode = 'stub';
    else if (rel === 'common/_components.common.scss') mode = 'no-button';
    out.push({ rel, mode, src: f });
  }
  for (const rel of THEME_FILES) out.push({ rel, mode: 'theme' });
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

function stubText(rel) {
  const seg = rel.split('/')[0];
  const what = seg === 'generic' ? 'resets of this project' : 'bare element rules of this project';
  return `@charset "UTF-8";\n// ${seg} segment — holds the ${what}. Empty until Foundation B moves the existing rules here.\n`;
}
function themeText(rel) {
  const name = path.posix.basename(rel);
  return `@charset "UTF-8";\n/* ${name} — theme file of this project (plain CSS, <link>ed from index.html). Tokens move here in Foundation B. */\n`;
}

function hasFilterTokens(root, sr) {
  const pal = u.readText(u.fromPosix(root, `${sr}/theme/colors/colors.palette.theme.css`)) || '';
  return /--color-img\s*:/.test(pal) && /--light-img\s*:/.test(pal);
}

/** Class names the project already defines (to avoid a second u-sr-only / u-filter-*). */
function definedClasses(root, profile) {
  const out = new Set();
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    for (const m of (u.readText(f.abs) || '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]);
  }
  return out;
}

function contentFor(e, ctx) {
  if (e.mode === 'keep') return '';
  if (e.mode === 'stub') return stubText(e.rel);
  if (e.mode === 'theme') return themeText(e.rel);
  let t = u.readText(e.src);
  if (e.mode === 'no-button') t = t.replace(/@use "\.\.\/components\/button\.component";\n?/, '').replace(/\n*$/, '\n');
  if (e.rel === 'utilities/utils.scss') for (const skip of ctx.skipUtilities) t = t.replace(new RegExp(`@use "${skip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}";\\n?`), '');
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

// ---------- check (STYLE-48) ----------
function gaps(root, profile) {
  const sr = project.scssRoot(profile);
  const a = readNg(root, profile);
  const missing = [], misplaced = [], wiring = [];
  const filters = hasFilterTokens(root, sr);
  for (const e of expected()) {
    // the icon-filter utility only makes sense with the filter tokens of our palette (init creates both)
    if (e.rel === 'utilities/visual/_filter.utility.scss' && !filters) continue;
    const abs = u.fromPosix(root, `${sr}/${e.rel}`);
    if (e.mode === 'keep') { if (!u.isDir(path.dirname(abs))) missing.push({ rel: `${sr}/${e.rel}`, mode: e.mode, what: `folder ${path.posix.dirname(e.rel)}/` }); continue; }
    if (!u.exists(abs)) missing.push({ rel: `${sr}/${e.rel}`, mode: e.mode, what: e.rel });
  }
  if (a) {
    const inc = loadPathsOf(root, a).map((p) => p.replace(/\/$/, ''));
    if (!inc.includes(sr)) wiring.push({ file: 'angular.json', what: `stylePreprocessorOptions.includePaths has no \`${sr}\` (needed for \`@use "tools" as *\`)` });
    const styles = a.options.styles || [];
    const entry = `${sr}/${ENTRY}`;
    if (!styles.some((s) => inputOf(s) === entry)) wiring.push({ file: 'angular.json', what: `\`${entry}\` is not the global entry in angular.json styles` });
    const assets = a.options.assets || [];
    if (!assets.some((x) => { const i = typeof x === 'string' ? x : x.input; return i === 'src/assets' || (i || '').replace(/\/$/, '') === 'src/assets'; })) wiring.push({ file: 'angular.json', what: 'assets does not copy `src/assets` (theme files are <link>ed from there)' });
    for (const s of styles) {
      const inp = inputOf(s);
      if (isVendor(s) || inp === entry) continue;
      if (/^src\/assets\/themes\//.test(inp) || inp.startsWith(`${sr}/theme/`)) continue;
      if (!isInjected(s)) { misplaced.push({ rel: inp, lazy: true, what: `lazy bundle \`${s.bundleName || inp}\` (inject: false) outside the structure — loaded by name at runtime` }); continue; }
      misplaced.push({ rel: inp, what: 'global stylesheet outside the structure — its rules move into the segments (Foundation B)' });
    }
  }
  const idx = u.readText(path.join(root, 'src', 'index.html')) || '';
  const links = [...idx.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const wantLinks = THEME_FILES.map((f) => `assets/${sr.replace(/^src\/assets\//, '')}/${f}`);
  const miss = wantLinks.filter((h) => !links.some((l) => l.replace(/^\//, '') === h));
  if (miss.length && sr.startsWith('src/assets/')) wiring.push({ file: 'src/index.html', what: `theme <link>s missing: ${miss.map((m) => path.posix.basename(m)).join(', ')}` });
  // stray stylesheets: not in the scss root, not a component style, not a theme source, not vendor
  const comps = componentStyles(root);
  const listed = new Set(misplaced.map((m) => m.rel));
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    if (f.rel.startsWith(sr + '/') || comps.has(f.rel) || listed.has(f.rel)) continue;
    if (/^src\/assets\/themes\//.test(f.rel)) continue;
    misplaced.push({ rel: f.rel, stray: true, what: 'stylesheet outside the structure (not a component style, not loaded as a segment)' });
  }
  return { sr, missing, misplaced, wiring };
}

function run(root, profile) {
  const g = gaps(root, profile);
  const out = [];
  for (const m of g.missing) out.push(mk(root, 'STYLE-48', m.rel, 1, `Missing from our structure: \`${m.what}\` — Foundation A creates it from the template (no value changes).`, 'Run /ui-guard:fix scss (Foundation A).'));
  for (const w of g.wiring) out.push(mk(root, 'STYLE-48', w.file, 1, `Wiring: ${w.what}.`, 'Foundation A sets it.'));
  for (const m of g.misplaced) out.push(mk(root, 'STYLE-48', m.rel, 1, `Misplaced: ${m.what}.`, m.lazy ? 'Decide: keep it as a lazy bundle (move the file into its segment, same bundleName) or load it eagerly.' : 'Foundation B moves its rules into the segment files in the same cascade order.', m.lazy ? { severity: 'info' } : {}));
  return out;
}

// ---------- Foundation A ----------
function structure(root, profile, { apply }) {
  const g = gaps(root, profile);
  const sr = g.sr;
  const defined = definedClasses(root, profile);
  const ctx = { skipUtilities: [] };
  if (defined.has('u-sr-only')) ctx.skipUtilities.push('accessibility/sr-only.utility');
  if ([...defined].some((c) => /^u-filter-/.test(c)) || !hasFilterTokens(root, sr)) ctx.skipUtilities.push('visual/filter.utility');
  const created = [], changed = [], skipped = [];
  for (const m of g.missing) {
    const e = expected().find((x) => `${sr}/${x.rel}` === m.rel);
    if (!e) continue;
    if (e.rel === 'utilities/accessibility/_sr-only.utility.scss' && ctx.skipUtilities.includes('accessibility/sr-only.utility')) { skipped.push(`${m.rel} — the project already defines .u-sr-only (reused)`); continue; }
    if (e.rel === 'utilities/visual/_filter.utility.scss' && ctx.skipUtilities.includes('visual/filter.utility')) { skipped.push(`${m.rel} — the project already defines u-filter-* (reused)`); continue; }
    if (apply) u.writeText(u.fromPosix(root, m.rel), contentFor(e, ctx));
    created.push(m.rel);
  }
  const a = readNg(root, profile);
  if (a) {
    const json = a.json;
    const opts = a.options;
    let touched = false;
    opts.stylePreprocessorOptions = opts.stylePreprocessorOptions || {};
    const inc = opts.stylePreprocessorOptions.includePaths || [];
    if (!inc.map((p) => p.replace(/\/$/, '')).includes(sr)) { opts.stylePreprocessorOptions.includePaths = [...inc, sr]; touched = true; changed.push(`angular.json: includePaths + ${sr}`); }
    const entry = `${sr}/${ENTRY}`;
    const styles = opts.styles || [];
    if (!styles.some((s) => inputOf(s) === entry)) {
      // only when no other global stylesheet already reaches the entry (it would load twice)
      const reached = reachedFromGlobals(root, a, styles).has(path.resolve(u.fromPosix(root, entry)));
      if (reached) skipped.push(`angular.json styles: \`${entry}\` is already reached from another global stylesheet — Foundation B makes it the one entry`);
      else {
        // right AFTER the first run of project stylesheets: the entry's utilities stay last (the final order is
        // generic → elements → common → utilities) and vendor CSS keeps its place
        const firstProject = styles.findIndex((s) => !isVendor(s) && isInjected(s));
        let at = firstProject < 0 ? styles.length : firstProject;
        while (at < styles.length && !isVendor(styles[at]) && isInjected(styles[at])) at++;
        opts.styles = [...styles.slice(0, at), entry, ...styles.slice(at)];
        touched = true; changed.push(`angular.json: styles + ${entry}`);
      }
    }
    const assets = opts.assets || [];
    if (!assets.some((x) => ((typeof x === 'string' ? x : x.input) || '').replace(/\/$/, '') === 'src/assets')) {
      opts.assets = [...assets, { glob: '**/*', input: 'src/assets', output: 'assets' }];
      touched = true; changed.push('angular.json: assets + src/assets');
    }
    if (touched && apply) {
      const indent = (/\n( +|\t)"/.exec(a.text) || [])[1] || 2;
      fs.writeFileSync(path.join(root, 'angular.json'), JSON.stringify(json, null, indent) + '\n');
    }
  }
  // index.html theme links (empty theme files → no visual change); custom.theme.css stays last
  const idxFile = path.join(root, 'src', 'index.html');
  const idx = u.readText(idxFile);
  if (idx && sr.startsWith('src/assets/')) {
    const base = `assets/${sr.replace(/^src\/assets\//, '')}`;
    const have = [...idx.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1].replace(/^\//, ''));
    const add = THEME_FILES.map((f) => `${base}/${f}`).filter((h) => !have.includes(h));
    if (add.length) {
      const block = add.map((h) => `  <link rel="stylesheet" href="${h}">`).join('\n');
      const next = idx.replace(/(\s*)<\/head>/i, `\n${block}\n</head>`);
      if (apply) fs.writeFileSync(idxFile, next);
      changed.push(`src/index.html: theme <link>s ${add.map((h) => path.posix.basename(h)).join(', ')}`);
    }
  }
  return { created, changed, skipped };
}

function reachedFromGlobals(root, a, styles) {
  const graph = require('./lib/sass-graph');
  const inc = loadPathsOf(root, a).map((p) => path.join(root, ...p.split('/')));
  const out = new Set();
  for (const s of styles) {
    if (isVendor(s) || !/\.scss$/.test(inputOf(s))) continue;
    const abs = path.resolve(u.fromPosix(root, inputOf(s)));
    for (const r of graph.reachable(graph.build([abs], inc), abs, (f) => graph.build([f], inc))) out.add(path.resolve(r));
  }
  return out;
}

// ---------- Foundation B ----------
const ELEMENT_FILES = [
  [/^(html|:root|\*|\*::?before|\*::?after|::?selection|::?backdrop|\[hidden\])$/, 'generic', 'reset'],
  [/^body$/, 'elements', 'body'],
  [/^a(:[\w-]+)?$/, 'elements', 'links'],
  [/^(h[1-6]|p|strong|b|em|i|small|blockquote|pre|code|hr|span|abbr|mark|sub|sup)(:[\w-]+)?$/, 'elements', 'typography'],
  [/^(input|button|select|textarea|label|fieldset|legend|form|optgroup|option)(:[\w-()]+)?(::?[\w-]+)?$/, 'elements', 'forms'],
  [/^(img|svg|video|picture|iframe|canvas|audio|figure|figcaption)$/, 'elements', 'media'],
  [/^(table|thead|tbody|tfoot|tr|th|td|caption|col|colgroup)$/, 'elements', 'tables'],
  [/^(ul|ol|li|dl|dt|dd|menu)$/, 'elements', 'lists'],
  [/^:focus(-visible)?$|^[\w-]+:focus(-visible)?$/, 'elements', 'focus'],
];
const RANK = { settings: -1, tools: -1, generic: 0, elements: 1, objects: 2.0, components: 2.1, modules: 2.2, utilities: 3 };

/** Where a top-level statement belongs: { seg, name, free } (free = order does not matter), or { judge: reason }. */
function classify(stmt, srcBase, ctx) {
  const h = stmt.head;
  if (/^@charset/i.test(h)) return { drop: true };
  if (/^\$[\w-]+/.test(h) && !stmt.block) return { seg: 'settings', name: 'project', free: true, noOutput: true };
  if (/^@(mixin|function)\b/.test(h)) return { seg: 'tools', name: 'project', free: true, noOutput: true };
  if (/^%/.test(h)) return { judge: 'placeholder selector (@extend) — needs judgment' };
  if (/^@(use|forward|import)\b/.test(h)) return { judge: `\`${u.clip(h, 60)}\` — an import that is not a local partial (vendor Sass, CSS @import or a namespaced @use)` };
  if (/^@font-face/i.test(h)) return { seg: 'generic', name: 'fonts', free: true };
  if (/^@(-webkit-)?keyframes/i.test(h)) return { seg: 'generic', name: 'keyframes', free: true };
  if (/^:root$/.test(h) && stmt.block) {
    const decls = st.splitDecls(st.blockInner(stmt));
    if (decls.length && decls.every((d) => /^--[\w-]+\s*:/.test(d) && !/\$|#\{|@|!important/.test(d.slice(d.indexOf(':') + 1)))) return { seg: 'theme', name: 'palette', free: true, tokens: decls };
  }
  // rules (also @media / @include / @supports wrappers): look at the first selector found inside
  const sel = firstSelector(stmt);
  if (sel == null) return { inherit: true };
  const parts = sel.split(',').map((x) => x.trim()).filter(Boolean);
  const bare = parts.every((p) => !/[.#]/.test(p) && !/\[(?!hidden\])/.test(p));
  if (bare) {
    for (const [re, seg, name] of ELEMENT_FILES) if (parts.every((p) => re.test(p))) return { seg, name };
    return { seg: 'elements', name: 'base' };
  }
  const cls = (/\.(-?[_a-zA-Z][\w-]*)/.exec(sel) || [])[1];
  if (!cls) return { seg: 'components', name: srcBase };
  if (/^u-/.test(cls)) return { seg: 'utilities', name: srcBase };
  if (/^o-/.test(cls)) return { seg: 'objects', name: srcBase };
  const lib = libs.libraryReason(cls, ctx.libCtx);
  if (lib) { const libName = (/`([\w-]+)-?`/.exec(lib) || [])[1] || (/Bootstrap/.test(lib) ? 'bootstrap' : 'vendor'); return { seg: 'modules', name: `${srcBase}.${libName.replace(/-$/, '')}` }; }
  return { seg: 'components', name: srcBase };
}

function firstSelector(stmt) {
  if (!stmt.block) return null;
  const h = stmt.head;
  if (!/^@/.test(h)) return h;
  if (!/^@(media|include|supports|at-root|if|each|for|layer|container)\b/.test(h)) return null;
  for (const inner of st.splitTop(st.blockInner(stmt))) {
    if (inner.trailing || !inner.block) continue;
    const s = firstSelector(inner);
    if (s != null) return s;
  }
  return null;
}

/** Index/aggregator that loads the files of a segment, and the line that loads one file. */
const INDEX = {
  generic: ['generic/_index.scss', (n) => `@use "${n}";`],
  elements: ['elements/_index.scss', (n) => `@use "${n}";`],
  objects: ['common/_objects.common.scss', (n) => `@use "../objects/${n}";`],
  components: ['common/_components.common.scss', (n) => `@use "../components/${n}";`],
  modules: ['common/_modules.common.scss', (n) => `@use "../modules/${n}";`],
  utilities: ['utilities/utils.scss', (n, rel) => `@use "${rel.slice('utilities/'.length).replace(/\/_/, '/').replace(/\.scss$/, '')}";`],
  settings: ['settings/_index.scss', () => '@forward "project.settings";'],
  tools: ['tools/_index.scss', () => '@forward "mixins/project.tools";'],
};
const loadLine = (seg, rel) => INDEX[seg] && INDEX[seg][1](path.posix.basename(rel).replace(/^_/, '').replace(/\.scss$/, ''), rel);

const SEG_FILE = {
  settings: () => 'settings/_project.settings.scss',
  tools: () => 'tools/mixins/_project.tools.scss',
  generic: (n) => `generic/_${n}.generic.scss`,
  elements: (n) => `elements/_${n}.element.scss`,
  objects: (n) => `objects/_${n}.object.scss`,
  components: (n) => `components/_${n}.component.scss`,
  modules: (n) => `modules/_${n}.module.scss`,
  utilities: (n) => `utilities/project/_${n}.utility.scss`,
  theme: () => 'theme/colors/colors.palette.theme.css',
};

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

/** Expand local @import/@use partials (only when nothing outside the global stylesheets uses them). */
function flatten(root, file, ctx, seen = new Set(), depth = 0) {
  const abs = path.resolve(file);
  if (seen.has(abs) || depth > 20) return { judge: `import cycle at ${u.relPosix(root, abs)}` };
  seen.add(abs);
  const text = u.readText(abs);
  if (text == null) return { judge: `cannot read ${u.relPosix(root, abs)}` };
  const out = [];
  const graph = require('./lib/sass-graph');
  for (const s of st.splitTop(text, { scss: /\.scss$/.test(abs) })) {
    if (s.trailing) continue;
    s.origin = abs;
    const m = /^@(import|use)\s+(.+)$/.exec(s.head);
    if (m && !s.block) {
      const targets = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
      const hasAs = /\bas\s+[\w*-]+|\bwith\s*\(/.test(m[2]);
      if (!targets.length || (m[1] === 'use' && /\bwith\s*\(/.test(m[2])) || (m[1] === 'use' && hasAs && !/\bas\s+\*/.test(m[2]))) return { judge: `\`${u.clip(s.head, 60)}\` in ${u.relPosix(root, abs)} — needs judgment` };
      for (const t of targets) {
        if (/^sass:/.test(t)) { out.push({ ...s, sassModule: true }); continue; }
        const r = graph.resolve(abs, t, ctx.inc);
        if (!r || /node_modules/.test(r)) return { judge: `\`${u.clip(s.head, 60)}\` in ${u.relPosix(root, abs)} loads vendor Sass/CSS — needs judgment (keep vendor CSS in angular.json styles, before the entry)` };
        const rel = u.relPosix(root, r);
        if (ctx.sharedWithComponents.has(path.resolve(r))) return { judge: `\`${rel}\` is also used by component styles — move it by hand (settings/tools) so they keep compiling` };
        if (rel.startsWith(ctx.sr + '/') && ctx.ours.has(rel)) continue; // already one of our files (reached through the entry)
        const sub = flatten(root, r, ctx, seen, depth + 1);
        if (sub.judge) return sub;
        ctx.partials.add(path.resolve(r));
        out.push(...sub.stmts);
      }
      continue;
    }
    out.push(s);
  }
  return { stmts: out };
}

function headerFor(text, seg) {
  const lines = ['@charset "UTF-8";'];
  if (seg === 'tools' && /\$/.test(text)) lines.push('@use "../../settings" as *;');
  else if (!['settings', 'tools', 'theme'].includes(seg)) {
    if (/\$[\w-]/.test(text)) lines.push('@use "settings" as *;');
    if (/@include\s|\b(px|mq|dir|after|before|hover|scroll)\(/.test(text)) lines.push('@use "tools" as *;');
  }
  return lines.join('\n') + '\n';
}

function ensureLine(file, line, { after = null } = {}) {
  let t = u.readText(file) || '@charset "UTF-8";\n';
  if (t.includes(line)) return t;
  if (!t.endsWith('\n')) t += '\n';
  if (after && t.includes(after)) return t.replace(after, after + '\n' + line);
  return t + line + '\n';
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

function move(root, profile, { apply }) {
  const sr = project.scssRoot(profile);
  const a = readNg(root, profile);
  const report = { moved: [], kept: [], judge: [], created: [], changed: [], deleted: [], proof: null };
  if (!a) { report.judge.push('angular.json is missing or invalid'); return { report, code: 6 }; }
  const before = snapshot(root, profile);
  // no proof possible → nothing is moved (not by script, not by hand)
  if (before.noSass) { report.proof = 'not possible: sass cannot be loaded from the project (no node_modules?)'; report.judge.push('STOPPED: Foundation B needs the compile proof — run `npm install` in the project first, then `/ui-guard:fix scss` again. Nothing was moved.'); return { report, code: 7 }; }
  if (before.error) { report.judge.push('the project does not compile before the move: ' + before.error); return { report, code: 6 }; }
  const styles = a.options.styles || [];
  const entry = `${sr}/${ENTRY}`;
  // the globals to merge: injected project stylesheets that sit next to each other (no vendor CSS in between)
  const idxs = styles.map((s, i) => ({ s, i })).filter(({ s }) => !isVendor(s) && isInjected(s) && inputOf(s) !== entry && !inputOf(s).startsWith(`${sr}/theme/`) && !/^src\/assets\/themes\//.test(inputOf(s)));
  if (!idxs.length) { report.proof = 'nothing to move'; return { report, code: 0 }; }
  const firstAt = idxs[0].i;
  const entryAt = styles.findIndex((s) => inputOf(s) === entry);
  const contiguous = [];
  for (const x of idxs) {
    const between = styles.slice(Math.min(firstAt, x.i), x.i).filter((s) => isVendor(s));
    if (between.length) report.judge.push(`\`${inputOf(x.s)}\` comes after vendor CSS in angular.json styles — merging it into the entry would change the order; decide`);
    else contiguous.push(x);
  }
  if (entryAt >= 0 && styles.slice(Math.min(entryAt, firstAt), Math.max(entryAt, firstAt)).some(isVendor)) {
    report.judge.push(`vendor CSS sits between \`${entry}\` and \`${inputOf(idxs[0].s)}\` in angular.json styles — decide the order`);
    return { report, code: 6 };
  }
  const comps = componentStyles(root);
  const inc = loadPathsOf(root, a).map((p) => path.join(root, ...p.split('/')));
  const graph = require('./lib/sass-graph');
  const sharedWithComponents = new Set();
  for (const c of comps) { const abs = u.fromPosix(root, c); if (!u.exists(abs)) continue; for (const r of graph.reachable(graph.build([abs], inc), abs, (f) => graph.build([f], inc))) sharedWithComponents.add(path.resolve(r)); }
  const ours = new Set(expected().map((e) => `${sr}/${e.rel}`));
  const ctx = { sr, inc, sharedWithComponents, partials: new Set(), ours, libCtx: libs.context(root, profile) };
  const sources = [];
  for (const x of contiguous) {
    const abs = u.fromPosix(root, inputOf(x.s));
    const f = flatten(root, abs, ctx);
    if (f.judge) { report.judge.push(f.judge); continue; }
    sources.push({ input: inputOf(x.s), abs, stmts: f.stmts });
  }
  if (!sources.length) return { report, code: report.judge.length ? 6 : 0 };
  // original contents of every file we may touch → rollback
  const backup = new Map();
  const remember = (abs) => { if (!backup.has(abs)) backup.set(abs, u.exists(abs) ? fs.readFileSync(abs) : null); };
  const targets = new Map(); // rel → { seg, text }
  const order = [];
  let rank = -Infinity, current = null;
  // a file's place in the cascade = its segment, then its position in the segment's index
  // (existing @use lines first, new files in order of first use)
  const positions = {};
  const fineRank = (seg, rel) => {
    if (!INDEX[seg] || seg === 'settings' || seg === 'tools') return RANK[seg];
    if (!positions[seg]) positions[seg] = (u.readText(u.fromPosix(root, `${sr}/${INDEX[seg][0]}`)) || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^@(use|forward)\b/.test(l));
    const line = loadLine(seg, rel);
    let i = positions[seg].indexOf(line);
    if (i < 0) {
      // the project's stylesheets loaded BEFORE the entry, so its utilities go before our template utilities
      if (seg === 'utilities') { newUtil.push(line); positions[seg].splice(newUtil.length - 1, 0, line); } else positions[seg].push(line);
      i = positions[seg].indexOf(line);
    }
    return RANK[seg] + i / 1000;
  };
  const newUtil = [];
  for (const src of sources) {
    // target file names come from the file each statement was written in (general.scss → _general.component.scss)
    const baseOf = (file) => path.basename(file).replace(/^_/, '').replace(/\.(s?css)$/, '').replace(/[^\w-]/g, '-').toLowerCase() || 'global';
    for (const s of src.stmts) {
      if (s.sassModule) continue;
      const c = classify(s, baseOf(s.origin), ctx);
      if (c.drop) continue;
      if (c.judge) { report.judge.push(`${u.relPosix(root, s.origin)}: ${c.judge}`); continue; }
      let seg = c.seg, rel = c.seg && SEG_FILE[c.seg](c.name);
      const r = c.inherit || c.free ? null : fineRank(seg, rel);
      if (c.inherit || (!c.free && r < rank)) {
        if (!current) { seg = 'generic'; rel = SEG_FILE.generic('reset'); } else ({ seg, rel } = current);
        if (!c.inherit) report.kept.push(`${u.relPosix(root, s.origin)}: \`${u.clip(s.head, 50)}\` kept in ${rel} to keep the cascade order (it belongs to ${c.seg})`);
      }
      if (!c.free) { rank = Math.max(rank, fineRank(seg, rel)); current = { seg, rel }; }
      const full = `${sr}/${rel}`;
      const tDir = path.dirname(u.fromPosix(root, full));
      let body = (s.lead.replace(/^\s*\n/, '') + s.body).replace(/^\s+/, '');
      body = rebaseUrls(body, path.dirname(s.origin), tDir);
      if (seg === 'theme') body = `:root {\n${c.tokens.map((d) => `  ${d.trim()};`).join('\n')}\n}`;
      if (!targets.has(full)) { targets.set(full, { seg, parts: [] }); order.push(full); }
      targets.get(full).parts.push(body);
      report.moved.push(`${u.relPosix(root, s.origin)}: \`${u.clip(s.head, 50)}\` → ${rel}`);
    }
  }
  if (report.judge.length) {
    // a source with a statement that needs judgment is not moved at all (partial moves are harder to review)
    return { report, code: 6 };
  }
  if (!apply) return { report, code: 0 };
  try {
    for (const full of order) {
      const abs = u.fromPosix(root, full);
      remember(abs);
      const t = targets.get(full);
      const add = t.parts.join('\n\n') + '\n';
      const existing = u.readText(abs);
      if (t.seg === 'theme') {
        u.writeText(abs, (existing || '').replace(/\n*$/, '\n') + add);
      } else if (existing == null || /Empty until Foundation B/.test(existing)) {
        u.writeText(abs, headerFor(add, t.seg) + add);
        if (existing == null) report.created.push(full);
      } else {
        // an existing segment file: keep its header, append
        const head = headerFor(add, t.seg).split('\n').filter((l) => l && !existing.includes(l));
        let next = existing;
        if (head.length) { const lines = next.split('\n'); const at = lines[0].startsWith('@charset') ? 1 : 0; lines.splice(at, 0, ...head.filter((l) => !l.startsWith('@charset'))); next = lines.join('\n'); }
        u.writeText(abs, next.replace(/\n*$/, '\n') + '\n' + add);
      }
      report.changed.push(full);
      // wire the new file into its index / aggregator in order of first appearance
      const rel = full.slice(sr.length + 1);
      if (INDEX[t.seg]) {
        const f = u.fromPosix(root, `${sr}/${INDEX[t.seg][0]}`);
        remember(f);
        const line = loadLine(t.seg, rel);
        if (t.seg === 'utilities' && !(u.readText(f) || '').includes(line)) {
          // before our template utilities, after the project utilities added earlier in this move
          const lines = (u.readText(f) || '@charset "UTF-8";\n').split('\n');
          let at = lines.findIndex((l) => /^@use\b/.test(l.trim()) && !newUtil.includes(l.trim()));
          if (at < 0) at = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
          lines.splice(at, 0, line);
          u.writeText(f, lines.join('\n'));
        } else u.writeText(f, ensureLine(f, line));
      }
    }
    // angular.json: the entry takes the place of the first merged global; merged globals leave the list
    const merged = new Set(sources.map((s) => s.input));
    const json = a.json;
    const list = (a.options.styles || []).filter((s) => !merged.has(inputOf(s)));
    if (!list.some((s) => inputOf(s) === entry)) list.splice(Math.min(firstAt, list.length), 0, entry); // the entry takes the first global's place
    remember(path.join(root, 'angular.json'));
    a.options.styles = list;
    const indent = (/\n( +|\t)"/.exec(a.text) || [])[1] || 2;
    fs.writeFileSync(path.join(root, 'angular.json'), JSON.stringify(json, null, indent) + '\n');
    report.changed.push('angular.json');
    // the entry must load generic → elements → common → utilities
    const entryAbs = u.fromPosix(root, entry);
    remember(entryAbs);
    if (!u.exists(entryAbs)) u.writeText(entryAbs, u.readText(path.join(T, 'scss', 'style.scss')));
    // delete the emptied old files (sources + partials only they used)
    for (const s of sources) { remember(s.abs); fs.unlinkSync(s.abs); report.deleted.push(s.input); }
    for (const p of ctx.partials) if (u.exists(p) && !sharedWithComponents.has(p)) { remember(p); fs.unlinkSync(p); report.deleted.push(u.relPosix(root, p)); }
    const after = snapshot(root, profile);
    const cmp = after.error ? { same: false, reason: after.error } : st.sameRender(before.norm, after.norm);
    if (!cmp.same) throw new Error('the compiled CSS would change: ' + cmp.reason);
    report.proof = 'compiled global CSS before and after renders the same (same rules in the same order; tokens, @font-face and @keyframes unchanged)';
    return { report, code: 0 };
  } catch (e) {
    for (const [abs, data] of backup) { if (data == null) { try { fs.unlinkSync(abs); } catch { /* not created */ } } else { u.mkdirp(path.dirname(abs)); fs.writeFileSync(abs, data); } }
    report.judge.push(`rolled back: ${e.message}`);
    report.created = []; report.changed = []; report.deleted = [];
    return { report, code: 6 };
  }
}

// ---------- visually-hidden utility (before /ui-guard:fix access) ----------
const VH_CLASSES = ['u-sr-only', 'sr-only', 'visually-hidden', 'cdk-visually-hidden'];
/**
 * Make sure a visually-hidden utility exists. Reuse the project's own (or a dependency's) class; otherwise create ONLY
 * utilities/accessibility/_sr-only.utility.scss and load it through utilities/utils.scss from the global entry. Nothing else
 * is created or moved. Returns { status: 'exists'|'created'|'missing'|'stop', className, reason, created[] }.
 */
function srOnly(root, profile, { apply }) {
  const sr = project.scssRoot(profile);
  const own = definedClasses(root, profile);
  const vendor = libs.vendorMap(root, profile);
  const found = VH_CLASSES.find((c) => own.has(c) || vendor.has(c));
  if (found) return { status: 'exists', className: found, created: [] };
  const a = readNg(root, profile);
  const entry = `${sr}/${ENTRY}`;
  if (!a || !(a.options.styles || []).some((s) => inputOf(s) === entry && isInjected(s))) {
    return { status: 'stop', reason: `no visually-hidden utility, and the global entry \`${entry}\` is not loaded — run \`/ui-guard:fix scss\` first (Foundation A creates the utilities layer), then \`/ui-guard:fix access\`` };
  }
  if (!apply) return { status: 'missing', created: [] };
  const created = [];
  const file = u.fromPosix(root, `${sr}/utilities/accessibility/_sr-only.utility.scss`);
  u.writeText(file, u.readText(path.join(T, 'scss', 'utilities', 'accessibility', '_sr-only.utility.scss')));
  created.push(u.relPosix(root, file));
  const utils = u.fromPosix(root, `${sr}/utilities/utils.scss`);
  if (!u.exists(utils)) { u.writeText(utils, '@charset "UTF-8";\n// Utilities entry — loaded last in style.scss so utilities win by load order (never by specificity).\n'); created.push(u.relPosix(root, utils)); }
  u.writeText(utils, ensureLine(utils, '@use "accessibility/sr-only.utility";'));
  const entryAbs = u.fromPosix(root, entry);
  if (!/@use\s+["']utilities\/utils["']/.test(u.readText(entryAbs) || '')) u.writeText(entryAbs, ensureLine(entryAbs, '@use "utilities/utils";'));
  return { status: 'created', className: 'u-sr-only', created };
}

module.exports = { run, gaps, expected, structure, move, snapshot, componentStyles, srOnly, THEME_FILES };
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
    console.log(`STYLE-48 architecture gap: ${g.missing.length} missing, ${g.wiring.length} wiring, ${g.misplaced.length} misplaced`);
    for (const m of g.missing) console.log(`  missing   ${m.rel}`);
    for (const w of g.wiring) console.log(`  wiring    ${w.file}: ${w.what}`);
    for (const m of g.misplaced) console.log(`  misplaced ${m.rel}: ${m.what}`);
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
    if (r.status === 'exists') console.log(`visually-hidden utility: the project already has \`.${r.className}\` — reused, nothing created.`);
    else if (r.status === 'created') console.log(`visually-hidden utility: created \`.u-sr-only\` (utilities layer only): ${r.created.join(', ')}`);
    else if (r.status === 'missing') console.log('visually-hidden utility: missing — run with --apply to create .u-sr-only in the utilities layer.');
    else console.log(`STOP: ${r.reason}`);
    process.exit(r.status === 'stop' ? 8 : 0);
  }
  if (cmd === 'move') {
    const { report, code } = move(root, profile, { apply: !!args.apply });
    const out = path.join(root, '.ui-guard', 'scss', 'foundation-move.json');
    u.writeJSON(out, report);
    console.log(`Foundation B${args.apply ? '' : ' (dry run)'}: ${report.moved.length} statement(s) ${args.apply && code === 0 ? 'moved' : 'to move'}, ${report.kept.length} kept in place for the cascade order, ${report.judge.length} need judgment`);
    for (const d of report.deleted) console.log('  - ' + d);
    for (const k of report.kept) console.log('  skipped (unsure): ' + k);
    for (const j of report.judge) console.log('  needs judgment: ' + j);
    if (report.proof) console.log('  proof: ' + report.proof);
    console.log(`  details → ${u.relPosix(root, out)}`);
    process.exit(code);
  }
  console.log(HELP);
}
