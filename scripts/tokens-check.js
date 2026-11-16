#!/usr/bin/env node
'use strict';
// STYLE-09 (token names, typos, undefined tokens), STYLE-13 (HSL in token files), STYLE-34 (single source of shades), STYLE-44 (contrast, info).
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const color = require('./lib/color');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const APPEARANCE = ['blue', 'red', 'green', 'yellow', 'orange', 'purple', 'violet', 'pink', 'gray', 'grey', 'black', 'white', 'brown', 'cyan', 'teal', 'navy', 'magenta', 'lime', 'olive', 'maroon', 'silver', 'gold', 'beige'];
const FILTER_TOKENS = new Set(['--color-img', '--secondary-color-img', '--light-img', '--gray-img']);
const VOCAB = ['main', 'secondary', 'neutral', 'success', 'warning', 'danger', 'primary', 'error', 'info', 'hue', 'saturation', 'lightness', 'color', 'gradient', 'shadow', 'font', 'size', 'radius', 'space', 'spacing', 'border', 'text', 'background', 'surface', 'overlay', 'focus', 'link', 'title', 'heading', 'weight', 'transition', 'duration', 'container', 'width', 'height', 'fluid', 'icon', 'logo', 'image', 'light', 'disabled', 'hover', 'active', 'outline'];
const VENDOR_PREFIX = /^--(bs|mat|mdc|p|swiper|ng|ngx|cdk|ion|tw|fa|ql|apex|plyr|toastify|sb|ck)-/;

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function nameProblem(name) {
  if (FILTER_TOKENS.has(name) || /-img$/.test(name)) return null;
  const parts = name.replace(/^--/, '').split('-');
  for (const p of parts) if (APPEARANCE.includes(p.toLowerCase())) return `named by appearance (\`${p}\`) — name it by role or \`--family-step\``;
  if (/^(light|dark)$/.test(parts[0]) && parts.length > 1) return `named by appearance (\`${parts[0]}\`)`;
  for (const p of parts) {
    const w = p.toLowerCase();
    if (w.length < 4 || /\d/.test(w) || VOCAB.includes(w)) continue;
    const near = VOCAB.find((v) => v.length >= 5 && lev(w, v) <= (v.length >= 7 ? 2 : 1));
    if (near) return `looks like a typo of \`${near}\``;
  }
  return null;
}

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss' || f.kind === 'css');
  const defined = new Map(); // name → {file,line}
  const parsed = files.map((f) => ({ ...f, text: u.readText(f.abs) || '' })).map((f) => ({ ...f, tree: css.parse(f.text) }));
  const isPalette = (rel) => /colors\/[^/]*\.css$/.test(rel) && /theme/.test(rel);
  for (const f of parsed) for (const p of css.customProps(f.tree)) if (!defined.has(p.name)) defined.set(p.name, { file: f.rel, line: p.line });

  for (const f of parsed) {
    const tokenFile = project.isThemeTokenFile(f.rel);
    // STYLE-09 names (definitions in token files and anywhere else)
    for (const p of css.customProps(f.tree)) {
      if (VENDOR_PREFIX.test(p.name)) continue;
      const prob = nameProblem(p.name);
      if (prob) findings.push(mk(root, 'STYLE-09', f.rel, p.line, `Token \`${p.name}\` ${prob}.`, 'Rename it (a row in renames.md); values never change.'));
      // STYLE-13 palette shades are HSL
      if (isPalette(f.rel) && /#[0-9a-f]{3,8}\b|\brgba?\(/i.test(p.value)) findings.push(mk(root, 'STYLE-13', f.rel, p.line, `Shade \`${p.name}\` is not HSL (\`${u.clip(p.value, 40)}\`).`, 'Write the identical value as hsl().'));
      // STYLE-34 single source of shades
      if (!isPalette(f.rel)) {
        const isShade = /^--(main|secondary|neutral|success|warning|danger|info|primary)-\d+$/.test(p.name) || /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(p.value);
        if (isShade && !tokenFile) findings.push(mk(root, 'STYLE-34', f.rel, p.line, `Color token \`${p.name}\` is defined outside the palette.`, 'Define shades only in colors.palette.theme.css.'));
        if (/clamp\(/.test(p.value) && p.selector && p.selector.trim() !== ':root' && p.selector.trim() !== ':host') findings.push(mk(root, 'STYLE-34', f.rel, p.line, `Fluid token \`${p.name}\` re-declared by \`${u.clip(p.selector, 40)}\`.`, 'Declare fluid tokens once in the theme.'));
      }
    }
    // STYLE-34 no .scss file defines colours: `$name: <hex | rgb() | hsl()>` belongs in colors.palette.theme.css (/ui-guard:fix scss moves it)
    if (/\.scss$/.test(f.rel)) {
      const plain = f.text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
      const at = u.lineIndexer(f.text);
      for (const d of plain.matchAll(/(^|[;{}\s])\$([\w-]+)\s*:\s*([^;{}]+);/g)) {
        if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(d[3])) findings.push(mk(root, 'STYLE-34', f.rel, at(d.index + d[1].length), `Colour \`$${d[2]}\` is defined in SCSS (\`${u.clip(d[3].trim(), 40)}\`).`, 'Colours live only in colors.palette.theme.css — /ui-guard:fix scss moves it there as an hsl token (exact round trip) and the variable becomes var(--token).'));
      }
    }
    // STYLE-09 undefined tokens (likely typos)
    const re = /var\(\s*(--[\w-]+)/g;
    let m;
    const idx = u.lineIndexer(f.text);
    // blank out comments (keep offsets so line numbers stay right)
    let code = f.text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
    // a tool's mixin body emits nothing until it is included: its tokens are checked where the mixin is used
    if (/(^|\/)tools\//.test(f.rel)) code = code.replace(/var\(/g, 'v__(');
    while ((m = re.exec(code))) {
      const name = m[1];
      if (defined.has(name) || VENDOR_PREFIX.test(name)) continue;
      findings.push(mk(root, 'STYLE-09', f.rel, idx(m.index), `Token \`${name}\` is used but never defined (typo?).`, 'Fix the name or define the token in the theme.'));
    }
  }

  // STYLE-44 contrast (info, report only) from the active palette
  const active = project.themeDirs(root, profile).find((t) => t.active) || project.themeDirs(root, profile)[0];
  if (active) {
    const tokens = {};
    for (const f of u.walk(active.themeDir).filter((x) => x.endsWith('.css'))) for (const p of css.customProps(css.parse(u.readText(f) || ''))) tokens[p.name] = p.value;
    const seen = new Set();
    for (const f of parsed) {
      if (project.isThemeTokenFile(f.rel)) continue;
      css.walk(f.tree, (node) => {
        if (node.type !== 'rule') return;
        const decls = (node.nodes || []).filter((d) => d.type === 'decl');
        const fg = decls.find((d) => d.prop === 'color');
        const bg = decls.find((d) => d.prop === 'background-color' || d.prop === 'background');
        if (!fg || !bg || !/var\(/.test(fg.value) || !/var\(/.test(bg.value)) return;
        const key = fg.value + '|' + bg.value;
        const fv = color.resolveVars(fg.value, tokens), bv = color.resolveVars(bg.value, tokens);
        const fc = fv && color.parseColor(fv), bc = bv && color.parseColor(bv);
        if (!fc || !bc) {
          if (!seen.has('u' + key)) { seen.add('u' + key); findings.push(mk(root, 'STYLE-44', f.rel, node.line, `unverified: could not compute contrast of \`${u.clip(fg.value, 30)}\` on \`${u.clip(bg.value, 30)}\`.`, 'Check by hand.', { severity: 'info' })); }
          return;
        }
        const ratio = color.contrast(fc, bc);
        if (ratio < 4.5) findings.push(mk(root, 'STYLE-44', f.rel, fg.line, `Contrast ${ratio.toFixed(2)}:1 for \`${u.clip(fg.value, 30)}\` on \`${u.clip(bg.value, 30)}\` is below AA 4.5:1.`, 'Report only — never restyled by ui-guard.', { severity: 'info' }));
      });
    }
  }
  void path;
  return findings;
}

module.exports = { run, nameProblem };
if (require.main === module) cli('tokens-check', `tokens-check.js — STYLE-09 (token names by role, typos, undefined tokens), STYLE-13 (HSL shades in token files),
STYLE-34 (palette is the single source of shades; fluid tokens not re-declared), STYLE-44 (AA contrast of token pairs, info).`, run);
