#!/usr/bin/env node
'use strict';
// MEDIA-01..06 — images, video, iframes, fonts and asset sizes. Deterministic: free, zero AI tokens.
// Image files are never opened or judged: only their path, extension and size on disk are read.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const RASTER = /\.(png|jpe?g|gif|bmp|webp|avif)$/i;
const SIZE_LIMITS = [
  { re: /\.(png|jpe?g|gif|bmp|webp|avif)$/i, max: 200 * 1024, label: 'raster image', fix: 'Compress or resize it, or convert it to webp/avif.' },
  { re: /\.svg$/i, max: 100 * 1024, label: 'SVG', fix: 'Optimize the SVG (SVGO) or export a simpler one.' },
  { re: /\.(woff2?|ttf|otf|eot)$/i, max: 150 * 1024, label: 'font file', fix: 'Subset the font and ship woff2.' },
  { re: /\.(mp4|webm|ogg|mov)$/i, max: 2 * 1024 * 1024, label: 'video', fix: 'Compress the video or stream it instead of bundling it.' },
];
const ICON_NAME = /(^|[-_.])(icon|ico|logo|arrow|symbol|glyph|chevron|caret)([-_.]|$)/i;
const kb = (n) => Math.round(n / 1024) + ' KB';

/** Attributes of one tag: name → value ('' for a bare attribute). */
function attrsOf(tag) {
  const out = {};
  const re = /([@\[\(\*#]?[\w:.\-\)\]]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const inner = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(inner))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
const has = (a, ...names) => names.some((n) => n in a || ('[' + n + ']') in a || ('[attr.' + n + ']') in a);

/** class name → does any SCSS rule give it a fixed box (inline-size + block-size, width + height, or aspect-ratio)? */
function boxInfoClasses(root, profile) {
  const blocks = [];
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    const text = u.readText(f.abs) || '';
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text))) blocks.push({ sel: m[1], body: m[2] });
  }
  const fixed = (body) => /aspect-ratio\s*:/.test(body) || (/(inline-size|width)\s*:/.test(body) && /(block-size|height)\s*:/.test(body)) || /(^|[;\s])(inline-size|width)\s*:[^;]*;?[^}]*aspect/.test(body);
  const widthOnly = (body) => /(inline-size|width|max-inline-size|max-width)s*:/.test(body) && !fixed(body);
  const owns = (b, cls) => { const tail = cls.includes('__') ? '&__' + cls.split('__').pop() : null; return b.sel.includes('.' + cls) || (tail && b.sel.includes(tail)); };
  /** 'fixed' (a rule fixes the whole box) | 'width-only' (a rule sets only the width: the height still depends on the file) | null */
  return (cls) => (blocks.some((b) => fixed(b.body) && owns(b, cls)) ? 'fixed' : blocks.some((b) => widthOnly(b.body) && owns(b, cls)) ? 'width-only' : null);
}
function boxFixedClasses(root, profile) { const info = boxInfoClasses(root, profile); return (cls) => info(cls) === 'fixed'; }

/** True when `index` sits inside an unclosed `@for (...) { ... }` block or a `*ngFor` element. */
function insideFor(text, index) {
  const re = /@for\s*\([^)]*\)\s*\{/g;
  let m, open = false;
  while ((m = re.exec(text)) && m.index < index) {
    let depth = 1, i = m.index + m[0].length;
    while (i < index && depth) { const c = text[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
    if (depth) open = true;
  }
  return open;
}

/** True when the text before an `@font-face` leaves an open block that is not an at-rule (@media, @supports, @layer). */
function wrappedInSelector(outer) {
  const stack = [];
  for (let i = 0; i < outer.length; i++) { if (outer[i] === '{') stack.push(i); else if (outer[i] === '}') stack.pop(); }
  if (!stack.length) return false;
  const head = outer.slice(0, stack[stack.length - 1]).split(/[;{}]/).pop().trim();
  return !/^@(media|supports|layer)\b/.test(head);
}
/** A Razor @foreach / @for / @while block is open at this position. */
function insideRazorLoop(text, pos) {
  const before = text.slice(0, pos);
  const re = /@(foreach|for|while)\s*\([^)]*\)\s*\{/g;
  let m, open = false;
  while ((m = re.exec(before))) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < before.length; i++) { if (before[i] === '{') depth++; else if (before[i] === '}') { depth--; if (!depth) break; } }
    if (i >= before.length) open = true;
  }
  return open;
}
/** The inline `template:` literals of a component .ts; everything else becomes spaces (newlines kept → same line numbers). */
function inlineTemplates(ts) {
  const keep = new Array(ts.length).fill(false);
  const re = /\btemplate\s*:\s*`/g;
  let m;
  while ((m = re.exec(ts))) {
    let i = m.index + m[0].length;
    for (; i < ts.length && ts[i] !== '`'; i++) { if (ts[i] === '\\') { keep[i] = true; i++; } keep[i] = true; }
  }
  let out = '';
  for (let i = 0; i < ts.length; i++) out += keep[i] || ts[i] === '\n' || ts[i] === '\r' ? ts[i] : ' ';
  return out;
}
function resolveAsset(root, ref) {
  if (/^~\//.test(ref)) ref = ref.slice(2);
  const clean = ref.split(/[?#]/)[0].replace(/^[./]+/, '').replace(/^src\//, '');
  for (const c of [path.join(root, 'src', clean), path.join(root, 'public', clean.replace(/^assets\//, '')), path.join(root, 'src', 'assets', clean.replace(/^assets\//, ''))]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile);
  const boxFixed = boxFixedClasses(root, profile);

  // ----- templates: MEDIA-01, 02, 04 (img) and MEDIA-06 (video, iframe)
  for (const f of files.filter((x) => x.kind === 'html' || x.kind === 'index' || x.kind === 'cshtml' || x.kind === 'ts')) {
    const raw = u.readText(f.abs) || '';
    // a component .ts: only its inline `template:` literal is markup (the rest blanked, newlines kept so lines match)
    const text = f.kind === 'ts' ? inlineTemplates(raw) : raw;
    if (!text.trim()) continue;
    const idx = u.lineIndexer(text);
    const tagRe = /<(img|video|iframe)\b[^>]*>/gi;
    let m;
    while ((m = tagRe.exec(text))) {
      const tag = m[0], name = m[1].toLowerCase(), line = idx(m.index), a = attrsOf(tag);
      if (name === 'img') {
        const classes = String(a.class || '').split(/\s+/).filter(Boolean);
        const sized = (has(a, 'width') && has(a, 'height')) || ('fill' in a) || classes.some(boxFixed) || /\b(width|height|aspect-ratio)\s*:/.test(a.style || '');
        if (!sized) findings.push(mk(root, 'MEDIA-01', f.rel, line, 'Image has no `width` + `height` and no class that fixes its box — the page jumps when it loads.', 'Add `width` and `height` attributes with the intrinsic size (or fix the box with `aspect-ratio` / `inline-size` + `block-size` in its class).', { evidence: tag.replace(/\s+/g, ' ').slice(0, 120) }));
        // content image the code shows is repeated (a loop: one of PERF-02's off-screen containers); a data-bound image
        // elsewhere, modals, tabs, rows and the footer are judged by the AI. Icons and priority images are never flagged;
        // only loading="lazy" satisfies the rule (loading="eager" does not).
        const src = a.src ?? a.ngSrc ?? a['[src]'] ?? a['[ngSrc]'] ?? a['ngSrc'] ?? '';
        const inLoop = '*ngFor' in a || insideFor(text, m.index) || (f.kind === 'cshtml' && insideRazorLoop(text, m.index));
        const priority = 'priority' in a || '[priority]' in a || a.fetchpriority === 'high';
        const icon = /\.svg(\?|$)/i.test(String(src)) || /(^|[/_.-])icons?([/_.-]|$)/i.test(String(src));
        if (inLoop && a.loading !== 'lazy' && !priority && !icon) {
          findings.push(mk(root, 'MEDIA-02', f.rel, line, `Content image inside a repeated block without \`loading="lazy"\`${a.loading ? ` (\`loading="${a.loading}"\`)` : ''}.`, 'Add `loading="lazy"` (never on the first-screen / hero image — give that one `fetchpriority="high"`).', { evidence: tag.replace(/\s+/g, ' ').slice(0, 120) }));
        }
        const ref = String(a.src || a.ngSrc || '');
        if (RASTER.test(ref) && !/\{\{|^https?:|^data:/.test(ref)) {
          const abs = resolveAsset(root, ref);
          const svgSibling = abs ? fs.existsSync(abs.replace(RASTER, '.svg')) : false;
          if (svgSibling || (ICON_NAME.test(path.basename(ref)) && abs && fs.statSync(abs).size < 20 * 1024)) {
            findings.push(mk(root, 'MEDIA-04', f.rel, line, `\`${path.basename(ref)}\` is a raster file used as an icon / flat graphic${svgSibling ? ' and an SVG with the same name exists' : ''}.`, 'Use the SVG version.', { evidence: ref }));
          }
        }
      } else if (name === 'video') {
        if ('autoplay' in a || a.preload === 'auto') findings.push(mk(root, 'MEDIA-06', f.rel, line, 'Video autoplays or uses `preload="auto"`.', 'Remove `autoplay`; use `preload="metadata"` (or `none`) and a `poster`.', { evidence: tag.replace(/\s+/g, ' ').slice(0, 120) }));
      } else if (name === 'iframe') {
        if (a.loading !== 'lazy') findings.push(mk(root, 'MEDIA-06', f.rel, line, 'Iframe without `loading="lazy"`.', 'Add `loading="lazy"` to every iframe that is not on the first screen.', { evidence: tag.replace(/\s+/g, ' ').slice(0, 120) }));
      }
    }
  }

  // ----- styles: MEDIA-05 (fonts)
  for (const f of files.filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    const text = u.readText(f.abs) || '';
    const idx = u.lineIndexer(text);
    let m;
    const imp = /@import\s+(?:url\()?["']?([^"')\s;]+)/g;
    while ((m = imp.exec(text))) if (/fonts\.(googleapis|gstatic)|\.(woff2?|ttf|otf|eot)(\?|$)|\/fonts?\//i.test(m[1]) && /^https?:|font/i.test(m[1])) findings.push(mk(root, 'MEDIA-05', f.rel, idx(m.index), 'Web font loaded with CSS `@import` — it blocks rendering.', 'Load the font with `<link rel="preload">` / a local `@font-face` in `fonts.theme.css`.', { evidence: m[0].slice(0, 100) }));
    const ff = /@font-face\s*\{/g;
    while ((m = ff.exec(text))) {
      const line = idx(m.index);
      let depth = 1, i = m.index + m[0].length;
      while (i < text.length && depth) { const c = text[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
      const body = text.slice(m.index, i);
      const outer = text.slice(0, m.index);
      const wrapped = wrappedInSelector(outer);
      if (!/font-display\s*:/.test(body)) findings.push(mk(root, 'MEDIA-05', f.rel, line, '`@font-face` without `font-display`.', 'Add `font-display: swap;`.'));
      const srcs = (body.match(/url\(\s*["']?[^)"']+/g) || []).map((s) => s.replace(/url\(\s*["']?/, ''));
      if (srcs.length && !srcs.some((s) => /\.woff2(\?|#|$)/i.test(s)) && srcs.some((s) => /\.(ttf|otf|eot)(\?|#|$)/i.test(s))) findings.push(mk(root, 'MEDIA-05', f.rel, line, '`@font-face` ships `ttf` / `otf` / `eot` and no `woff2`.', 'Convert the font to `woff2` and list it first in `src`.'));
      if (wrapped) findings.push(mk(root, 'MEDIA-05', f.rel, line, '`@font-face` is wrapped in a selector.', 'Move `@font-face` to the top level of `fonts.theme.css`.'));
    }
  }

  // ----- asset files: MEDIA-03 (sizes). Only the size on disk is read, never the content.
  // Angular (src/assets, public, a root assets/) and ASP.NET MVC (wwwroot without its vendor lib/, MVC 5 Content/ Images/)
  const roots = ['src/assets', 'public', 'assets', 'wwwroot', 'Content', 'Images'].map((d) => path.join(root, d));
  for (const dir of roots) {
    if (!u.isDir(dir)) continue;
    for (const abs of u.walk(dir, (n) => project.EXCLUDED_DIRS.has(n) || (dir.endsWith('wwwroot') && n === 'lib'))) {
      const rule = SIZE_LIMITS.find((s) => s.re.test(abs));
      if (!rule) continue;
      const size = fs.statSync(abs).size;
      if (size > rule.max) findings.push(mk(root, 'MEDIA-03', u.relPosix(root, abs), 1, `${rule.label} is ${kb(size)} (limit ${kb(rule.max)}).`, rule.fix));
    }
  }
  return findings;
}

/** MEDIA-03 for given project-relative files (the assets a change adds or edits), wherever they live. Size on disk only. */
function oversized(root, rels) {
  const out = [];
  for (const rel of rels) {
    const rule = SIZE_LIMITS.find((s) => s.re.test(rel));
    if (!rule) continue;
    let size;
    try { size = fs.statSync(path.join(root, rel)).size; } catch { continue; }
    if (size > rule.max) out.push(mk(root, 'MEDIA-03', rel, 1, `${rule.label} is ${kb(size)} (limit ${kb(rule.max)}).`, rule.fix));
  }
  return out;
}

module.exports = { run, boxInfoClasses, attrsOf, oversized, inlineTemplates };
if (require.main === module) cli('media-check', 'media-check.js — MEDIA-01..06: image size attributes, lazy loading, raster-as-icon, fonts, video/iframe loading, asset sizes. Never opens an image.', run);
