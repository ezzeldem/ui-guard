#!/usr/bin/env node
'use strict';
// STYLE-09 (token names by role or family-step, the four font keys, renamed legacy names, typos, undefined tokens),
// STYLE-13 (HSL shades in the palette), STYLE-34 (the palette is the single source of shades; fluid tokens not re-declared),
// STYLE-44 (WCAG AA contrast of the token pairs used together, in EVERY theme: 4.5:1 text, 3:1 large text and control borders).
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const color = require('./lib/color');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const APPEARANCE = ['blue', 'red', 'green', 'yellow', 'orange', 'purple', 'violet', 'pink', 'gray', 'grey', 'black', 'white', 'brown', 'cyan', 'teal', 'navy', 'magenta', 'lime', 'olive', 'maroon', 'silver', 'gold', 'beige'];
const VOCAB = ['main', 'secondary', 'neutral', 'success', 'warning', 'danger', 'primary', 'error', 'info', 'hue', 'saturation', 'lightness', 'color', 'gradient', 'shadow', 'font', 'size', 'radius', 'space', 'spacing', 'border', 'text', 'background', 'surface', 'overlay', 'focus', 'link', 'title', 'heading', 'weight', 'transition', 'duration', 'container', 'width', 'height', 'fluid', 'icon', 'logo', 'image', 'light', 'disabled', 'hover', 'active', 'outline', 'filter'];
const VENDOR_PREFIX = /^--(bs|mat|mdc|p|swiper|ng|ngx|cdk|ion|tw|fa|ql|apex|plyr|toastify|sb|ck)-/;
// names ui-guard used before the AXIS parity (rename rows: values never change)
const RENAMED = { '--color-img': '--filter-primary', '--secondary-color-img': '--filter-secondary', '--light-img': '--filter-neutral-25', '--gray-img': '--filter-neutral-400', '--div-shadow': '--shadow-100', '--fb': '--ff-2 (and --ff → --ff-1: with more than one family the keys are --ff-1, --ff-2)', '--secondary-hue': '--hue-2', '--secondary-saturation': '--saturation-2', '--secondary-lightness': '--lightness-2' };
const FONT_KEY = /^--(ff(-\d+)?|fs-[\w-]+|fw-[\w-]+|lh-[\w-]+)$/;

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function nameProblem(name) {
  if (RENAMED[name]) return `is a pre-AXIS name — the AXIS name is \`${RENAMED[name]}\``;
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

const isPalette = (rel) => /(^|\/)theme\/colors\/colors\.palette\.theme\.css$/.test(rel);
const isBase = (rel) => /(^|\/)theme\/colors\/colors\.base\.theme\.css$/.test(rel);
const isFonts = (rel) => /(^|\/)theme\/fonts\/fonts\.theme\.css$/.test(rel);
const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

/** Token values of one theme folder (base + palette + fonts). */
function themeTokens(themeDir) {
  const tokens = {};
  for (const f of u.walk(themeDir).filter((x) => x.endsWith('.css'))) for (const p of css.customProps(css.parse(u.readText(f) || ''))) tokens[p.name] = p.value;
  return tokens;
}

/** px size of a font-size value (rem/px/var resolved), or null. */
function fontPx(value, tokens) {
  const v = color.resolveVars(value, tokens) || value;
  const m = /^(-?[\d.]+)(rem|px|em)$/.exec(String(v).trim());
  if (!m) return null;
  return m[2] === 'px' ? +m[1] : +m[1] * 16;
}
const CONTROL = /\b(input|select|textarea|button)\b|\.(c-button|ctrl-)[\w-]*|(-input|-field|-control|-select|-checkbox|-radio|-toggle|-switch)\b/;

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss' || f.kind === 'css');
  const defined = new Map(); // name → {file,line}
  const parsed = files.map((f) => ({ ...f, text: u.readText(f.abs) || '' })).map((f) => ({ ...f, tree: css.parse(f.text) }));
  for (const f of parsed) for (const p of css.customProps(f.tree)) if (!defined.has(p.name)) defined.set(p.name, { file: f.rel, line: p.line });

  for (const f of parsed) {
    const tokenFile = project.isThemeTokenFile(f.rel);
    const props = css.customProps(f.tree);
    // STYLE-09 names (definitions in token files and anywhere else)
    for (const p of props) {
      if (VENDOR_PREFIX.test(p.name)) continue;
      const prob = nameProblem(p.name);
      if (prob) findings.push(mk(root, 'STYLE-09', f.rel, p.line, `Token \`${p.name}\` ${prob}.`, 'Rename it (a row in renames.md); values never change.'));
      else if (isFonts(f.rel) && !FONT_KEY.test(p.name)) findings.push(mk(root, 'STYLE-09', f.rel, p.line, `Font token \`${p.name}\` does not take one of the four keys: \`--ff\` (or \`--ff-1\`, \`--ff-2\` …), \`--fs-<size>\`, \`--fw-<weight>\`, \`--lh-<step>\`.`, 'Rename it (a row in renames.md); values never change.'));
      // STYLE-13 palette shades are HSL
      if (isPalette(f.rel) && /#[0-9a-f]{3,8}\b|\brgba?\(/i.test(p.value)) findings.push(mk(root, 'STYLE-13', f.rel, p.line, `Shade \`${p.name}\` is not HSL (\`${u.clip(p.value, 40)}\`).`, 'Write the identical value as hsl().'));
      // STYLE-34 single source of shades: only the palette defines one (R-THEME-8); colors.base holds identity values and filters
      if (!isPalette(f.rel)) {
        const isShade = /^--(main|secondary|neutral|success|warning|danger|info|primary)-\d+$/.test(p.name) || COLOUR.test(p.value);
        if (isShade && (!tokenFile || isBase(f.rel) || isFonts(f.rel))) findings.push(mk(root, 'STYLE-34', f.rel, p.line, `Colour token \`${p.name}\` is defined outside colors.palette.theme.css.`, 'Define shades only in theme/colors/colors.palette.theme.css (colors.base.theme.css holds the identity values and filters).'));
        if (/clamp\(/.test(p.value) && p.selector && p.selector.trim() !== ':root') findings.push(mk(root, 'STYLE-34', f.rel, p.line, `Fluid token \`${p.name}\` re-declared by \`${u.clip(p.selector, 40)}\` (R-THEME-9).`, 'Declare a fluid token once, as a clamp() in the theme.'));
      }
    }
    // more than one font family: --ff-1, --ff-2 … (theme.md), never --ff beside --ff-N
    if (isFonts(f.rel)) {
      const fams = props.map((p) => p.name).filter((n) => /^--ff(-\d+)?$/.test(n));
      if (fams.includes('--ff') && fams.some((n) => n !== '--ff')) findings.push(mk(root, 'STYLE-09', f.rel, props.find((p) => p.name === '--ff').line, `\`--ff\` sits beside ${fams.filter((n) => n !== '--ff').map((n) => `\`${n}\``).join(', ')} — with more than one font family the keys are \`--ff-1\`, \`--ff-2\` and so on.`, 'Rename --ff to --ff-1 (a row in renames.md).'));
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

  // STYLE-44 contrast (accessibility rule 4, High): every theme — the active copy and each theme source
  const themes = project.themeDirs(root, profile).map((t) => ({ name: t.active ? 'active' : t.name, tokens: themeTokens(t.themeDir) }));
  if (themes.length) {
    const seen = new Set();
    for (const f of parsed) {
      if (project.isThemeTokenFile(f.rel)) continue;
      css.walk(f.tree, (node, parents) => {
        if (node.type !== 'rule') return;
        const decls = (node.nodes || []).filter((d) => d.type === 'decl');
        const get = (...names) => decls.find((d) => names.includes(d.prop));
        const bg = get('background-color', 'background');
        if (!bg || !/var\(/.test(bg.value)) return;
        const sel = css.resolveSelectors(parents, node).join(', ');
        const pairs = [];
        const fg = get('color');
        if (fg && /var\(/.test(fg.value)) pairs.push({ d: fg, what: 'text', size: get('font-size'), weight: get('font-weight') });
        const border = get('border-color', 'border');
        if (border && /var\(/.test(border.value) && CONTROL.test(sel)) pairs.push({ d: border, what: 'control border', min: 3 });
        for (const pr of pairs) {
          const key = `${f.rel}:${pr.d.line}`;
          if (seen.has(key)) continue;
          const bad = [], unknown = [];
          for (const th of themes) {
            const fv = color.resolveVars((/var\([^)]*\)/.exec(pr.d.value) || [pr.d.value])[0], th.tokens), bv = color.resolveVars((/var\([^)]*\)/.exec(bg.value) || [bg.value])[0], th.tokens);
            const fc = fv && color.parseColor(fv), bc = bv && color.parseColor(bv);
            if (!fc || !bc) { unknown.push(th.name); continue; }
            let min = pr.min || 4.5, large = false;
            if (pr.what === 'text') {
              const px = pr.size ? fontPx(pr.size.value, th.tokens) : null;
              const bold = pr.weight && (/bold/.test(pr.weight.value) || +(color.resolveVars(pr.weight.value, th.tokens) || pr.weight.value) >= 700);
              if (px != null && (px >= 24 || (bold && px >= 18.66))) { min = 3; large = true; }
            }
            const ratio = color.contrast(fc, bc);
            if (ratio < min) bad.push(`${th.name} ${ratio.toFixed(2)}:1${large ? ' (large text)' : ''}`);
          }
          seen.add(key);
          const need = pr.min ? '3:1 (WCAG 1.4.11)' : 'AA (4.5:1 text, 3:1 large text)';
          if (bad.length) findings.push(mk(root, 'STYLE-44', f.rel, pr.d.line, `Contrast of \`${u.clip(pr.d.value, 30)}\` (${pr.what}) on \`${u.clip(bg.value, 30)}\` is below ${need} in theme ${bad.join(', ')}.`, 'Report only — the client values in Theme are changed by the team, never restyled by ui-guard.'));
          else if (unknown.length === themes.length) findings.push(mk(root, 'STYLE-44', f.rel, pr.d.line, `unverified: could not compute the contrast of \`${u.clip(pr.d.value, 30)}\` on \`${u.clip(bg.value, 30)}\`.`, 'Check by hand.', { severity: 'info' }));
        }
      });
    }
  }
  void path;
  return findings;
}

module.exports = { run, nameProblem };
if (require.main === module) cli('tokens-check', `tokens-check.js — STYLE-09 (token names by role or family-step, the four font keys, pre-AXIS names, typos, undefined tokens),
STYLE-13 (HSL shades in the palette), STYLE-34 (the palette is the single source of shades; fluid tokens not re-declared),
STYLE-44 (contrast of token pairs in every theme: 4.5:1 text, 3:1 large text and control borders).`, run);
