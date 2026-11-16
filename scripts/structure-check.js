#!/usr/bin/env node
'use strict';
// Script parts of STYLE-17 (folder + file suffix), STYLE-28 (shared blocks through common/), STYLE-38 (tools), STYLE-42 (one reduced-motion block, one u-sr-only).
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');
const ng = require('./lib/angular');
const graph = require('./lib/sass-graph');
const classUsage = require('./class-usage');
const { mk, cli } = require('./lib/findings');

const SUFFIX = {
  settings: /^_[\w-]+\.settings\.scss$|^_index\.scss$/,
  tools: /^_[\w-]+\.tools\.scss$|^_index\.scss$/,
  generic: /^_[\w-]+\.generic\.scss$|^_index\.scss$/,
  elements: /^_[\w-]+\.element\.scss$|^_index\.scss$/,
  common: /^_[\w-]+\.common\.scss$|^common\.scss$|^_index\.scss$/,
  objects: /^_[\w-]+\.object\.scss$|^_index\.scss$/,
  components: /^_[\w-]+\.component\.scss$|^_index\.scss$/,
  layout: /^_[\w-]+\.[\w-]+\.layout\.scss$|^[\w-]+\.layout\.scss$|^_[\w-]+\.layout\.scss$|^_index\.scss$/,
  modules: /^_[\w-]+(\.[\w-]+)?\.module\.scss$|^_[\w-]+\.control\.module\.scss$|^_index\.scss$/,
  pages: /^[\w-]+\.page\.scss$|^_[\w-]+\.page\.scss$/,
  utilities: /^_[\w-]+\.utility\.scss$|^utils\.scss$|^_index\.scss$/,
  theme: /\.theme\.css$/,
};
const TOOLS = ['px', 'mq', 'dir', 'after', 'before', 'hover', 'scroll'];

function run(root, profile) {
  const findings = [];
  const sr = project.scssRoot(profile);
  const files = project.listUiFiles(root, profile);
  const styleFiles = files.filter((f) => f.kind === 'scss' || f.kind === 'css');

  // STYLE-17 folder + suffix
  for (const f of styleFiles) {
    if (!f.rel.startsWith(sr + '/')) continue;
    const sub = f.rel.slice(sr.length + 1);
    const seg = sub.split('/')[0];
    const base = path.posix.basename(f.rel);
    if (!sub.includes('/')) { if (base !== 'style.scss') findings.push(mk(root, 'STYLE-17', f.rel, 1, `\`${base}\` sits in the SCSS root — only the global entry style.scss belongs there.`, 'Move it into its segment folder.')); continue; }
    if (!project.SEGMENTS.includes(seg)) { findings.push(mk(root, 'STYLE-17', f.rel, 1, `Folder \`${seg}/\` is not one of the 13 segments.`, 'Move the file into its segment folder.')); continue; }
    if (seg === 'packages') continue;
    if (seg === 'theme' && /\.css$/.test(base)) {
      const ok = project.THEME_FILES.some((t) => sub.endsWith(t.split('/').pop())) || /\.theme\.css$/.test(base);
      if (!ok) findings.push(mk(root, 'STYLE-17', f.rel, 1, `Theme file \`${base}\` does not use the standard names (colors.palette.theme.css, fonts.theme.css, custom.theme.css).`, 'Rename it (phase 1).'));
      continue;
    }
    if (SUFFIX[seg] && !SUFFIX[seg].test(base)) findings.push(mk(root, 'STYLE-17', f.rel, 1, `\`${base}\` does not follow the ${seg} file naming.`, `Rename to the ${seg} pattern (see rules/style.md segment table).`));
  }

  // STYLE-38 tools: duplicated tools, missing @error, missing doc comments
  const mixinDefs = {};
  for (const f of styleFiles.filter((x) => x.kind === 'scss')) {
    const text = u.readText(f.abs) || '';
    for (const m of text.matchAll(/@(mixin|function)\s+([\w-]+)\s*(\(([^)]*)\))?/g)) {
      const name = m[2];
      (mixinDefs[name] = mixinDefs[name] || []).push({ file: f.rel, line: u.lineAt(text, m.index) });
      const inTools = f.rel.startsWith(sr + '/tools/');
      if (!inTools && TOOLS.includes(name)) findings.push(mk(root, 'STYLE-38', f.rel, u.lineAt(text, m.index), `Tool \`${name}\` is re-implemented outside tools/.`, 'Remove it and @use "tools" as *.'));
      if (inTools) {
        const before = text.slice(Math.max(0, m.index - 400), m.index);
        if (!/\/\/\/[^\n]*\n\s*$|\*\/\s*$/.test(before)) findings.push(mk(root, 'STYLE-38', f.rel, u.lineAt(text, m.index), `Tool \`${name}\` has no doc comment (signature, params, output, example).`, 'Add a /// doc comment above it.'));
        const params = (m[4] || '').trim();
        if (params && !['after', 'before', 'scroll'].includes(name)) {
          let depth = 0, i = text.indexOf('{', m.index), end = i;
          for (; end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') { depth--; if (!depth) break; } }
          if (!/@error/.test(text.slice(i, end))) findings.push(mk(root, 'STYLE-38', f.rel, u.lineAt(text, m.index), `Tool \`${name}\` does not validate its parameters with @error.`, 'Add @error checks for wrong values.'));
        }
      }
    }
    if (f.rel.startsWith(sr + '/settings/')) {
      for (const m of text.matchAll(/^\s*(\$[\w-]+)\s*:\s*\(/gm)) {
        const before = text.slice(Math.max(0, m.index - 300), m.index);
        if (!/\/\/[^\n]*\n\s*$|\*\/\s*$/.test(before)) findings.push(mk(root, 'STYLE-38', f.rel, u.lineAt(text, m.index), `Settings map \`${m[1]}\` has no comment saying what it holds and what reads it.`, 'Add a // comment above the map.'));
      }
    }
  }
  for (const [name, list] of Object.entries(mixinDefs)) {
    if (TOOLS.includes(name) && list.filter((d) => d.file.startsWith(sr + '/tools/')).length > 1) {
      for (const d of list.slice(1)) findings.push(mk(root, 'STYLE-38', d.file, d.line, `Tool \`${name}\` is defined more than once (first: ${list[0].file}).`, 'Keep one definition.'));
    }
  }

  // STYLE-42 one reduced-motion block (in generic), u-sr-only declared once
  const rm = [], sro = [];
  for (const f of styleFiles) {
    const tree = css.parse(u.readText(f.abs) || '');
    css.walk(tree, (node, parents) => {
      if (node.type === 'atrule' && node.name === 'media' && /prefers-reduced-motion/.test(node.params) && !parents.some((p) => p.type === 'atrule' && p.name === 'mixin')) rm.push({ file: f.rel, line: node.line });
      if (node.type === 'rule' && css.resolveSelectors(parents, node).some((s) => /^\.u-sr-only$/.test(s.trim()))) sro.push({ file: f.rel, line: node.line });
    });
  }
  rm.sort((a, b) => (/_reduced-motion\.generic\.scss$/.test(b.file) ? 1 : 0) - (/_reduced-motion\.generic\.scss$/.test(a.file) ? 1 : 0));
  for (const r of rm) if (!r.file.startsWith(sr + '/generic/')) findings.push(mk(root, 'STYLE-42', r.file, r.line, 'prefers-reduced-motion block outside generic.', 'Merge it into the one generic reduced-motion block.'));
  if (rm.filter((r) => r.file.startsWith(sr + '/generic/')).length > 1) for (const r of rm.filter((x) => x.file.startsWith(sr + '/generic/')).slice(1)) findings.push(mk(root, 'STYLE-42', r.file, r.line, 'More than one reduced-motion block in generic.', 'Keep exactly one.'));
  if (sro.length > 1) for (const s of sro.slice(1)) findings.push(mk(root, 'STYLE-42', s.file, s.line, `\`.u-sr-only\` declared more than once (first: ${sro[0].file}:${sro[0].line}).`, 'Keep one declaration.'));

  // STYLE-28 shared blocks: used by a layout or 5+ pages → must be reached through common/
  const ngc = ng.readAngular(root, profile);
  const scss = styleFiles.filter((x) => x.kind === 'scss').map((x) => x.abs);
  const g = graph.build(scss, ngc && !ngc.error ? graph.includePaths(root, ngc) : []);
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
    if (shared && !viaCommon.has(f.abs)) findings.push(mk(root, 'STYLE-28', f.rel, 1, `Shared block (${layout ? 'used by a layout' : `used by ${pages} pages`}) is not reached through a common/ aggregator.`, 'Add it to the matching common/ aggregator.'));
    if (!shared && pages > 0 && viaCommon.has(f.abs)) findings.push(mk(root, 'STYLE-28', f.rel, 1, `unverified: block used by only ${pages} page(s) and no layout is loaded globally through common/.`, 'Move it next to those pages (planner decides).', { severity: 'info' }));
  }
  return findings;
}

module.exports = { run };
if (require.main === module) cli('structure-check', `structure-check.js — script parts of STYLE-17 (segment folder + file suffix), STYLE-28 (shared blocks through common/),
STYLE-38 (one tool set, @error validation, doc comments), STYLE-42 (one reduced-motion block in generic, one u-sr-only).`, run);
