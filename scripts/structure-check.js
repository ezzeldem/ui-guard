#!/usr/bin/env node
'use strict';
// Script parts of the AXIS structure rules:
//   STYLE-17  every file in its segment folder with the AXIS file name (fixed names, kebab-case, suffix per segment)
//   STYLE-28  import routes (R-28, R-COM-3..7): shared blocks through common/, page-local ones from each page entry, files
//             never move; only a module @uses a component; objects/components @use no object/component/module;
//             a layout entry @uses none of them
//   STYLE-38  tools: one file per tool, named after it, documented (signature, @param with defaults, output, example)
//   STYLE-42  one reduced-motion block (in generic/_reset.generic.scss); u-sr-only declared once, in utilities/accessibility/
//   STYLE-50  Elements: the base body background only (a per-theme one only in custom.theme.css); base typography reads the font tokens
//   STYLE-51  every tool parameter is validated with @error
//   STYLE-52  a tool hard-codes no component/page/client value (no var(--…) and no project class in its body)
//   STYLE-53  colour utilities are generated with @each over settings/_colors.settings.scss, under visual/colors|backgrounds/
//   STYLE-54  vendor overrides: only in a library module on its m- block (or common/_classes.common.scss for markup the vendor's
//             JS generates); a plain module holds no vendor selector and never takes a library component's name
//   STYLE-55  every settings map has a comment saying what it holds and what reads it
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');
const ng = require('./lib/angular');
const graph = require('./lib/sass-graph');
const libs = require('./lib/libclasses');
const classUsage = require('./class-usage');
const { mk, cli } = require('./lib/findings');

const N = '[a-z0-9]+(?:-[a-z0-9]+)*'; // kebab-case
const CATS = ['accessibility', 'interaction', 'layout', 'typography', 'visual'];
const NO_INDEX = ['settings', 'common', 'objects', 'components', 'modules', 'pages', 'theme'];
const THEME_FIXED = project.THEME_FILES;
const TOOLS = ['px', 'mq', 'dir', 'after', 'before', 'hover', 'scroll'];

/** Problem with the file name/place of a file under the scss root (sub = path below the root), or null. */
function namingProblem(sub) {
  const parts = sub.split('/');
  const seg = parts[0];
  const base = parts[parts.length - 1];
  const re = (s) => new RegExp(`^${s}$`).test(base);
  if (parts.length === 1) return `\`${base}\` sits in the SCSS root — only the thirteen segment folders belong there (the entries are common/common.scss and utilities/utils.scss)`;
  if (!project.SEGMENTS.includes(seg)) return `folder \`${seg}/\` is not one of the thirteen segments`;
  if (seg === 'packages') return null;
  if (base === '_index.scss' && NO_INDEX.includes(seg)) return `\`${seg}/\` has no \`_index.scss\` in AXIS (its files are reached one by one${seg === 'settings' ? ': `@use "<path-to-root>/settings/<name>.settings" as *;`' : ''})`;
  switch (seg) {
    case 'settings': return parts.length === 2 && re(`_${N}\\.settings\\.scss`) ? null : 'settings files are `settings/_<name>.settings.scss`';
    case 'tools':
      if (parts.length === 2) return base === '_index.scss' ? null : 'tools/ holds only `_index.scss`, `functions/` and `mixins/`';
      if (parts.length === 3 && parts[1] === 'functions') return base === '_index.scss' || re(`_${N}\\.function\\.scss`) ? null : 'a function file is `tools/functions/_<name>.function.scss` (one per function)';
      if (parts.length === 3 && parts[1] === 'mixins') return base === '_index.scss' || re(`_${N}\\.mixin\\.scss`) ? null : 'a mixin file is `tools/mixins/_<name>.mixin.scss` (one per mixin)';
      return 'tools/ has two folders only: `functions/` and `mixins/`';
    case 'generic': return parts.length === 2 && (base === '_index.scss' || re(`_${N}\\.generic\\.scss`)) ? null : 'generic files are `generic/_index.scss` and `generic/_reset.generic.scss`';
    case 'elements': return sub === 'elements/_index.scss' ? null : 'Elements is one file: `elements/_index.scss`';
    case 'common': return parts.length === 2 && ['common.scss', '_objects.common.scss', '_components.common.scss', '_modules.common.scss', '_attributes.common.scss', '_classes.common.scss'].includes(base) ? null : 'common/ holds only common.scss, _objects/_components/_modules.common.scss and the optional _attributes/_classes.common.scss';
    case 'objects': return parts.length === 2 && re(`_${N}\\.object\\.scss`) ? null : 'object files are `objects/_<name>.object.scss`';
    case 'components': return parts.length === 2 && re(`_${N}\\.component\\.scss`) ? null : 'component files are `components/_<name>.component.scss`';
    case 'modules': return parts.length === 2 && (re(`_${N}\\.module\\.scss`) || re(`_${N}\\.control\\.module\\.scss`) || re(`_${N}\\.[a-z0-9-]+\\.module\\.scss`)) ? null : 'module files are `_<name>.module.scss`, `_<vendor-component>.<library>.module.scss` or `_<name>.control.module.scss`';
    case 'layout': {
      if (parts.length < 3) return 'a layout file sits in `layout/<layout>/` or `layout/shared/`';
      const L = parts[1];
      if (!new RegExp(`^${N}$`).test(L)) return `layout folder \`${L}\` is not kebab-case`;
      if (L === 'shared') return parts.length === 3 && re(`_${N}\\.layout\\.scss`) ? null : 'a shared part is `layout/shared/_<part>.layout.scss` (it is its own l- block)';
      if (parts.length === 3) {
        if (base === '_index.scss') return 'a layout folder never holds an `_index.scss` beside its entry file';
        return base === `${L}.layout.scss` || re(`_${N}\\.${L}\\.layout\\.scss`) ? null : `the entry is \`layout/${L}/${L}.layout.scss\` and a part is \`layout/${L}/_<part>.${L}.layout.scss\``;
      }
      return base === '_index.scss' || re(`_${N}\\.${L}\\.layout\\.scss`) ? null : `a part in a sub-folder is \`_<part>.${L}.layout.scss\` (with an \`_index.scss\` per sub-folder)`;
    }
    case 'pages': {
      const p = parts.slice(1);
      if (/^_/.test(base)) return 'pages have no partials: each page folder holds one entry, `<page>.page.scss`';
      if ((p[0] === 'standalone' || p[0] === 'state') && p.length === 3) return p[1] === base.replace(/\.page\.scss$/, '') && re(`${N}\\.page\\.scss`) ? null : `the entry is \`pages/${p[0]}/<page>/<page>.page.scss\``;
      if (p[0] !== 'standalone' && p[0] !== 'state' && p.length === 4) return [p[0], p[1], p[2]].every((x) => new RegExp(`^${N}$`).test(x)) && p[2] === base.replace(/\.page\.scss$/, '') && re(`${N}\\.page\\.scss`) ? null : 'the entry is `pages/<main-program>/<sub-program>/<page>/<page>.page.scss`';
      return 'a page entry is `pages/standalone/<page>/<page>.page.scss`, `pages/state/<page>/<page>.page.scss` or `pages/<main-program>/<sub-program>/<page>/<page>.page.scss`';
    }
    case 'utilities': {
      if (parts.length === 2) return base === 'utils.scss' ? null : 'utilities/ holds only the entry `utils.scss` and the five category folders';
      if (!CATS.includes(parts[1])) return `\`utilities/${parts[1]}/\` is not one of the five categories (${CATS.join(', ')})`;
      if (parts.slice(2, -1).some((x) => !new RegExp(`^${N}$`).test(x))) return 'utility sub-folders are kebab-case';
      return base === '_index.scss' || re(`_${N}\\.utility\\.scss`) ? null : 'utility files are `_<name>.utility.scss`';
    }
    case 'theme': return THEME_FIXED.includes(parts.slice(1).join('/')) ? null : `theme/ holds only the four fixed files (${THEME_FIXED.join(', ')})`;
    default: return null;
  }
}

/** { name, params:[{name, def}], start, open, end } for every @mixin/@function in a text. */
function toolDefs(text) {
  const out = [];
  const re = /@(mixin|function)\s+([\w-]+)\s*(\(([^)]*(?:\([^)]*\)[^)]*)*)\))?\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = open;
    for (; end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') { depth--; if (!depth) break; } }
    const params = [];
    let cur = '', d = 0;
    for (const ch of (m[4] || '')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { params.push(cur); cur = ''; continue; } cur += ch; }
    if (cur.trim()) params.push(cur);
    out.push({ type: m[1], name: m[2], params: params.map((p) => { const k = p.indexOf(':'); return { name: (k < 0 ? p : p.slice(0, k)).trim().replace(/^\$/, '').replace(/\.\.\.$/, ''), def: k < 0 ? null : p.slice(k + 1).trim() }; }).filter((p) => p.name), start: m.index, open, end });
  }
  return out;
}

function run(root, profile) {
  const findings = [];
  const sr = project.scssRoot(profile);
  const files = project.listUiFiles(root, profile);
  const styleFiles = files.filter((f) => f.kind === 'scss' || f.kind === 'css');
  const inRoot = (f) => f.rel.startsWith(sr + '/');
  const sub = (f) => f.rel.slice(sr.length + 1);

  // STYLE-17 folder + file name
  for (const f of styleFiles.filter(inRoot)) {
    const p = namingProblem(sub(f));
    if (p) findings.push(mk(root, 'STYLE-17', f.rel, 1, `\`${path.posix.basename(f.rel)}\`: ${p}.`, 'Rename or move the file to its AXIS name and folder (rules/style.md, segment table).'));
  }
  // utility and layout sub-folders need an _index.scss each
  const dirs = new Set(styleFiles.filter(inRoot).map((f) => path.posix.dirname(sub(f))));
  for (const d of dirs) {
    const parts = d.split('/');
    const needs = (parts[0] === 'utilities' && parts.length >= 2) || (parts[0] === 'layout' && parts.length >= 3 && parts[1] !== 'shared');
    if (needs && !u.exists(u.fromPosix(root, `${sr}/${d}/_index.scss`))) findings.push(mk(root, 'STYLE-17', `${sr}/${d}`, 1, `Folder \`${d}/\` has no \`_index.scss\` (a folder reached as a unit carries one).`, 'Add an _index.scss with @charset and one @use line per file.'));
  }

  // STYLE-38 / 51 / 52 tools; STYLE-55 settings maps
  const defs = {};
  for (const f of styleFiles.filter((x) => x.kind === 'scss')) {
    const text = u.readText(f.abs) || '';
    const tools = toolDefs(text);
    const inTools = f.rel.startsWith(sr + '/tools/');
    for (const t of tools) {
      (defs[t.name] = defs[t.name] || []).push({ file: f.rel, line: u.lineAt(text, t.start) });
      const line = u.lineAt(text, t.start);
      if (!inTools && TOOLS.includes(t.name)) findings.push(mk(root, 'STYLE-38', f.rel, line, `Tool \`${t.name}\` is re-implemented outside tools/.`, 'Remove it and @use "<path-to-root>/tools" as *.'));
      if (!inTools) continue;
      // one file per tool, named after it (tools.md)
      const want = t.type === 'mixin' ? `_${t.name}.mixin.scss` : `_${t.name}.function.scss`;
      if (path.posix.basename(f.rel) !== want) findings.push(mk(root, 'STYLE-38', f.rel, line, `Tool \`${t.name}\` lives in \`${path.posix.basename(f.rel)}\` — one file per tool: \`tools/${t.type === 'mixin' ? 'mixins' : 'functions'}/${want}\`.`, 'Move it to its own file and @forward it from the folder _index.scss.'));
      // documentation: signature, each parameter with its default, output/return, one example (R-TOOL-4)
      const before = text.slice(0, t.start).split('\n');
      const doc = [];
      for (let k = before.length - 2; k >= 0 && /^\s*\/\/\//.test(before[k]); k--) doc.unshift(before[k]);
      const docText = doc.join('\n');
      const missing = [];
      if (!new RegExp(`\\b${t.name}\\(`).test(docText)) missing.push('the signature');
      for (const p of t.params) if (!new RegExp(`@param[^\\n]*\\$${p.name}\\b`).test(docText)) missing.push(`@param $${p.name}`);
      for (const p of t.params) if (p.def != null && new RegExp(`@param[^\\n]*\\$${p.name}\\b`).test(docText) && !new RegExp(`@param[^\\n]*\\$${p.name}\\b[^\\n]*default`, 'i').test(docText)) missing.push(`the default of $${p.name}`);
      if (!/@(output|return)\b/.test(docText)) missing.push(t.type === 'mixin' ? '@output' : '@return');
      if (!/@example\b/.test(docText)) missing.push('@example');
      if (missing.length) findings.push(mk(root, 'STYLE-38', f.rel, line, `Tool \`${t.name}\` documentation lacks ${missing.join(', ')} (signature, parameters with defaults, output, one example — R-TOOL-4).`, 'Complete the /// doc comment above the tool.'));
      // every parameter validated with @error (R-TOOL-3)
      const body = text.slice(t.open, t.end + 1);
      const guarded = new Set();
      for (const g of body.matchAll(/@(if|else\s+if|each)\b([^{]*)\{/g)) {
        let depth = 0, e = g.index + g[0].length - 1;
        for (; e < body.length; e++) { if (body[e] === '{') depth++; else if (body[e] === '}') { depth--; if (!depth) break; } }
        if (/@error\b/.test(body.slice(g.index, e))) for (const v of g[2].matchAll(/\$([\w-]+)/g)) guarded.add(v[1]);
      }
      const unchecked = t.params.filter((p) => !guarded.has(p.name)).map((p) => '$' + p.name);
      if (unchecked.length) findings.push(mk(root, 'STYLE-51', f.rel, line, `Tool \`${t.name}\` does not validate ${unchecked.join(', ')} with @error (R-TOOL-3).`, 'Add an @if check per parameter that raises @error with a clear message.'));
      // no hard-coded component/page/client value in the body (R-TOOL-2)
      const code = body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/@error[^;]*;/g, '');
      const hard = [...new Set([...code.matchAll(/var\(--[\w-]+\)/g)].map((x) => x[0]).concat([...code.matchAll(/\.(c|p|l|m|ctrl|o|u)-[\w-]+/g)].map((x) => x[0])))];
      if (hard.length) findings.push(mk(root, 'STYLE-52', f.rel, line, `Tool \`${t.name}\` hard-codes ${hard.slice(0, 4).map((x) => `\`${x}\``).join(', ')} in its body — a tool takes the values it needs as parameters (R-TOOL-2).`, 'Make each value a parameter (a token may be its default).'));
    }
    if (f.rel.startsWith(sr + '/tools/') && !tools.length && !/_index\.scss$/.test(f.rel)) findings.push(mk(root, 'STYLE-38', f.rel, 1, 'A tools file that defines no mixin or function.', 'Remove it, or put its one tool in it.'));
    if (f.rel.startsWith(sr + '/tools/') && tools.length > 1) findings.push(mk(root, 'STYLE-38', f.rel, u.lineAt(text, tools[1].start), `${tools.length} tools in one file — one file per tool (tools.md).`, 'Split it: one `_<name>.mixin.scss` / `_<name>.function.scss` per tool.'));
    if (f.rel.startsWith(sr + '/settings/')) {
      for (const m of text.matchAll(/^[ \t]*(\$[\w-]+)\s*:\s*\(/gm)) { // [ \t]*, not \s*: with CRLF, ^ also matches after \r
        const before = text.slice(Math.max(0, m.index - 300), m.index);
        if (!/\/\/[^\n]*\n\s*$|\*\/\s*$/.test(before)) findings.push(mk(root, 'STYLE-55', f.rel, u.lineAt(text, m.index), `Settings map \`${m[1]}\` has no comment saying what it holds and what reads it (R-SET-4).`, 'Add a // comment above the map.'));
      }
    }
  }
  for (const [name, list] of Object.entries(defs)) {
    if (TOOLS.includes(name) && list.filter((d) => d.file.startsWith(sr + '/tools/')).length > 1) {
      for (const d of list.slice(1)) findings.push(mk(root, 'STYLE-38', d.file, d.line, `Tool \`${name}\` is defined more than once (first: ${list[0].file}).`, 'Keep one definition.'));
    }
  }

  // STYLE-42 one reduced-motion block (in generic), u-sr-only declared once in utilities/accessibility/, never re-implemented
  const rm = [], sro = [], vh = [];
  for (const f of styleFiles) {
    const tree = css.parse(u.readText(f.abs) || '');
    css.walk(tree, (node, parents) => {
      if (node.type === 'atrule' && node.name === 'media' && /prefers-reduced-motion/.test(node.params) && !parents.some((p) => p.type === 'atrule' && p.name === 'mixin')) rm.push({ file: f.rel, line: node.line });
      if (node.type !== 'rule') return;
      const sels = css.resolveSelectors(parents, node).map((s) => s.trim());
      if (sels.some((s) => /^\.u-sr-only$/.test(s))) sro.push({ file: f.rel, line: node.line });
      const c = sels.map((s) => (/^\.([\w-]+)$/.exec(s) || [])[1]).find((x) => x && /^(sr-only|visually-hidden|cdk-visually-hidden|screen-reader-only|u-visually-hidden)$/.test(x));
      if (c) vh.push({ file: f.rel, line: node.line, cls: c });
    });
  }
  const genericReset = `${sr}/generic/_reset.generic.scss`;
  rm.sort((a, b) => (b.file === genericReset ? 1 : 0) - (a.file === genericReset ? 1 : 0));
  for (const r of rm) if (r.file !== genericReset) findings.push(mk(root, 'STYLE-42', r.file, r.line, `prefers-reduced-motion block outside \`generic/_reset.generic.scss\`.`, 'Merge it into the one reduced-motion block of generic/_reset.generic.scss.'));
  for (const r of rm.filter((x) => x.file === genericReset).slice(1)) findings.push(mk(root, 'STYLE-42', r.file, r.line, 'More than one reduced-motion block in generic.', 'Keep exactly one.'));
  for (const s of sro.filter((x) => !x.file.startsWith(`${sr}/utilities/accessibility/`))) findings.push(mk(root, 'STYLE-42', s.file, s.line, '`.u-sr-only` declared outside `utilities/accessibility/`.', 'Declare it once, in utilities/accessibility/_sr-only.utility.scss.'));
  if (sro.length > 1) for (const s of sro.slice(1)) findings.push(mk(root, 'STYLE-42', s.file, s.line, `\`.u-sr-only\` declared more than once (first: ${sro[0].file}:${sro[0].line}).`, 'Keep one declaration.'));
  for (const v of vh) findings.push(mk(root, 'STYLE-42', v.file, v.line, `\`.${v.cls}\` re-implements the screen-reader-only utility — text for screen readers uses \`u-sr-only\` (accessibility rule 5).`, 'Use u-sr-only in the markup and remove this rule.'));

  // STYLE-50 Elements: base body background only; base typography reads the font tokens
  const elements = styleFiles.find((f) => f.rel === `${sr}/elements/_index.scss`);
  const bodyBg = (f) => { const out = []; css.walk(css.parse(u.readText(f.abs) || ''), (node, parents) => { if (node.type === 'decl' && /^background/.test(node.prop)) { const r = [...parents].reverse().find((p) => p.type === 'rule'); if (r && css.resolveSelectors(parents.slice(0, parents.indexOf(r)), r).some((s) => /^body$/.test(s.trim()))) out.push(node); } }); return out; };
  if (elements) {
    const eb = bodyBg(elements);
    const themes = styleFiles.filter((f) => /(^|\/)theme\/custom\.theme\.css$/.test(f.rel));
    if (eb.length && themes.some((t) => bodyBg(t).length)) findings.push(mk(root, 'STYLE-50', elements.rel, eb[0].line, 'The body background is declared in Elements AND in custom.theme.css — a per-theme background lives only in custom.theme.css (R-ELEM-3).', 'Keep the base background here and the per-theme one only in custom.theme.css, never the same background in both.'));
    css.walk(css.parse(u.readText(elements.abs) || ''), (node, parents) => {
      if (node.type !== 'decl') return;
      const r = [...parents].reverse().find((p) => p.type === 'rule');
      if (!r || !css.resolveSelectors(parents.slice(0, parents.indexOf(r)), r).some((s) => /^(html|body)$/.test(s.trim()))) return;
      const want = { 'font-family': '--ff', 'font-size': '--fs-', 'line-height': '--lh-' }[node.prop];
      if (want && !new RegExp(`var\\(${want.replace(/-$/, '-[\\w-]+')}`).test(node.value) && !/^(inherit|initial)$/.test(node.value)) findings.push(mk(root, 'STYLE-50', elements.rel, node.line, `Base typography \`${node.prop}: ${u.clip(node.value, 40)}\` on html/body does not read the font token (\`var(${want}…)\` from fonts.theme.css).`, `Read the token: \`${node.prop}: var(${want}${want.endsWith('-') ? '<step>' : ''})\`.`));
    });
  }

  // STYLE-53 colour utilities generated from the settings colour maps
  for (const f of styleFiles.filter((x) => x.rel.startsWith(`${sr}/utilities/`))) {
    const text = u.readText(f.abs) || '';
    const s = sub(f);
    for (const m of text.matchAll(/\.u-(text|bg)-(?!align-)([\w-]+)\s*[{,]/g)) findings.push(mk(root, 'STYLE-53', f.rel, u.lineAt(text, m.index), `Colour utility \`.u-${m[1]}-${m[2]}\` is written by hand — text-colour and background utilities are generated with @each over the family map of settings/_colors.settings.scss.`, `Generate it in utilities/visual/${m[1] === 'text' ? 'colors' : 'backgrounds'}/_<family>.utility.scss with @each over the settings map.`));
    for (const m of text.matchAll(/\.u-(text|bg)-#\{/g)) {
      const want = m[1] === 'text' ? 'utilities/visual/colors/' : 'utilities/visual/backgrounds/';
      if (!s.startsWith(want)) findings.push(mk(root, 'STYLE-53', f.rel, u.lineAt(text, m.index), `Generated \`.u-${m[1]}-*\` utilities belong under \`${want}\`.`, `Move the file to ${want}.`));
      if (!/@use\s+["'][^"']*settings\/colors\.settings["']/.test(text)) findings.push(mk(root, 'STYLE-53', f.rel, u.lineAt(text, m.index), 'A generated colour utility file does not @use settings/_colors.settings.scss.', 'Loop over the family map of settings/_colors.settings.scss.'));
    }
  }

  // STYLE-54 vendor overrides
  const libCtx = libs.context(root, profile);
  const moduleFiles = styleFiles.filter((x) => x.rel.startsWith(`${sr}/modules/`));
  const isLibraryModule = (rel) => { const m = /^_([\w-]+)\.([\w-]+)\.module\.scss$/.exec(path.posix.basename(rel)); return m && m[2] !== 'control' ? m : null; };
  const libComponents = new Map(moduleFiles.map((f) => isLibraryModule(f.rel)).filter(Boolean).map((m) => [m[1], m[0]]));
  for (const f of moduleFiles) {
    const plain = /^_([\w-]+)\.module\.scss$/.exec(path.posix.basename(f.rel));
    if (plain && libComponents.has(plain[1])) findings.push(mk(root, 'STYLE-54', f.rel, 1, `Own module \`${path.posix.basename(f.rel)}\` takes the name of the library module \`${libComponents.get(plain[1])}\` — \`.m-${plain[1]}\` must be declared once (R-36).`, 'Rename the own module.'));
  }
  const mDecl = new Map();
  for (const f of styleFiles.filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    if (project.isThemeTokenFile(f.rel) || /(^|\/)packages\//.test(f.rel)) continue;
    const isLib = !!isLibraryModule(f.rel) && f.rel.startsWith(`${sr}/modules/`);
    const isClasses = f.rel === `${sr}/common/_classes.common.scss`;
    const tree = css.parse(u.readText(f.abs) || '');
    const seen = new Set();
    css.walk(tree, (node, parents) => {
      if (node.type !== 'rule' || parents.some((p) => p.type === 'atrule' && /^(mixin|function)$/.test(p.name))) return;
      if (f.rel.startsWith(`${sr}/modules/`) && !parents.some((p) => p.type === 'rule')) for (const c of css.classesIn(node.selector)) if (/^m-[\w-]+$/.test(c) && !c.includes('__') && !node.selector.includes('&')) { if (!mDecl.has(c)) mDecl.set(c, new Set()); mDecl.get(c).add(f.rel); }
      if (isLib || isClasses) return;
      for (const sel of css.resolveSelectors(parents, node)) {
        const vendor = css.classesIn(sel).find((c) => !/^(o|c|l|m|ctrl|p|u|is|has|js)-/.test(c) && libs.libraryReason(c, libCtx));
        if (!vendor || seen.has(vendor)) continue;
        seen.add(vendor);
        findings.push(mk(root, 'STYLE-54', f.rel, node.line, `Vendor selector \`.${vendor}\` (${libs.libraryReason(vendor, libCtx)}) is overridden here — a vendor override lives only in its library module, \`modules/_<vendor-component>.<library>.module.scss\`, on an m- class placed beside the vendor class (R-30, R-36).`, 'Move the rule to the library module and target its m- class; markup the vendor\'s JS generates outside the project goes in common/_classes.common.scss.'));
      }
    });
  }
  for (const [c, set] of mDecl) if (set.size > 1) findings.push(mk(root, 'STYLE-54', [...set].sort()[1], 1, `\`.${c}\` is declared in ${set.size} module files (${[...set].sort().join(', ')}) — an m- class is declared once (R-36).`, 'Keep the block in one module file.'));

  // STYLE-28 import routes
  const ngc = ng.readAngular(root, profile);
  const scss = styleFiles.filter((x) => x.kind === 'scss').map((x) => x.abs);
  const g = graph.build(scss, ngc && !ngc.error ? graph.includePaths(root, ngc) : []);
  const segOfAbs = (abs) => { const rel = u.relPosix(root, abs); return rel.startsWith(sr + '/') ? rel.slice(sr.length + 1).split('/')[0] : null; };
  for (const [file, deps] of g) {
    const rel = u.relPosix(root, file);
    const seg = segOfAbs(file);
    for (const d of deps) {
      if (!d.resolved || d.kind === 'forward') continue;
      const ts = segOfAbs(d.resolved);
      if (!['objects', 'components', 'modules'].includes(ts)) continue;
      let why = null;
      if (seg === 'objects' || seg === 'components') why = 'objects and components never @use another object, component or module (R-28)';
      else if (seg === 'modules' && ts !== 'components') why = 'a module @uses only the components it composes (R-28)';
      else if (seg === 'layout') why = 'a layout entry never @uses an object, component or module — anything a layout needs comes through the matching common/ aggregator (R-28)';
      else if (ts === 'components' && !['modules', 'pages', 'common'].includes(seg) && rel.startsWith(sr + '/')) why = 'only a module (or a page entry / a common aggregator) may @use a component (R-28)';
      if (why) findings.push(mk(root, 'STYLE-28', rel, d.line, `\`@use "${d.target}"\` — ${why}.`, 'Remove this @use; import it from the common/ aggregator or from each page entry that needs it.'));
    }
  }
  const commonDir = path.join(root, ...sr.split('/'), 'common');
  const viaCommon = new Set();
  for (const f of scss.filter((x) => x.startsWith(commonDir + path.sep))) for (const r of graph.reachable(g, f)) viaCommon.add(r);
  const roleOf = (rel) => project.segmentOf(rel, profile).segment;
  const templates = files.filter((x) => x.kind === 'html' || x.kind === 'ts');
  const useBy = {};
  for (const t of templates) {
    const seg = roleOf(t.rel);
    const pageKey = seg === 'angular-page' ? t.rel.replace(/\/[^/]+$/, '') : null;
    for (const us of classUsage.usages(u.readText(t.abs) || '', t.kind === 'html')) {
      const e = (useBy[us.cls] = useBy[us.cls] || { pages: new Set(), layout: false });
      if (pageKey) e.pages.add(pageKey);
      if (seg === 'angular-layout') e.layout = true;
    }
  }
  for (const f of styleFiles.filter((x) => /\/(components|objects|modules)\//.test(x.rel) && x.rel.startsWith(sr + '/'))) {
    const tree = css.parse(u.readText(f.abs) || '');
    const blocks = new Set();
    css.walk(tree, (node, parents) => { if (node.type === 'rule' && !parents.some((p) => p.type === 'rule')) for (const c of css.classesIn(node.selector)) if (!c.includes('__')) blocks.add(c); });
    let pages = 0, layout = false;
    for (const b of blocks) { const e = useBy[b]; if (e) { pages = Math.max(pages, e.pages.size); layout = layout || e.layout; } }
    const shared = layout || pages >= 5;
    if (shared && !viaCommon.has(f.abs)) findings.push(mk(root, 'STYLE-28', f.rel, 1, `Shared block (${layout ? 'needed by a layout' : `used by ${pages} pages`}) is not imported through its common/ aggregator (R-28, R-COM-4).`, 'Add its @use line to the matching common/ aggregator and remove it from every page entry.'));
    if (!shared && pages > 0 && viaCommon.has(f.abs)) findings.push(mk(root, 'STYLE-28', f.rel, 1, `unverified: block used by only ${pages} page(s) and no layout is imported through common/ (R-COM-5).`, 'The file stays where it is (R-COM-3); move its @use line from the common/ aggregator to each of those page entries (Angular: the routed page component style).', { severity: 'info' }));
  }
  return findings;
}

module.exports = { run, namingProblem, toolDefs };
if (require.main === module) cli('structure-check', `structure-check.js — script parts of STYLE-17 (AXIS folder + file names), STYLE-28 (import routes, R-28),
STYLE-38 (one documented file per tool), STYLE-42 (one reduced-motion block, one u-sr-only), STYLE-50 (Elements base),
STYLE-51 (@error per tool parameter), STYLE-52 (no hard-coded value in a tool), STYLE-53 (generated colour utilities),
STYLE-54 (vendor overrides in library modules), STYLE-55 (settings map comments).`, run);
