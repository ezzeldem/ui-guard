#!/usr/bin/env node
'use strict';
// Zero-token mechanical SCSS fixes for /ui-guard:fix scss — run BEFORE the fixer agent, on the phase's files only.
//   charset   @charset "UTF-8"; on line 1
//   use-tools @use "<path-to-root>/tools" as *; right after it (every component SCSS: "tools" through includePaths; segment
//             files when they use a tool: the relative path, AXIS best-practices.md)
//   deps      // @dependencies: <tool file> lines after @charset for every tool the file reads (AXIS tools.md)
//   px        16px → px(16) (root font size from the profile; 1px stays; custom properties untouched)
//   logical   physical → logical properties (STYLE-11 = AXIS R-09). Sizes (width/height, min-/max-) → inline-size/block-size
//             always (the same in both directions); sides (margin-left, left, text-align: left…) by the app's base direction.
//             A bidirectional app (rtl + ltr) is a mirror by default: the sides convert as authored for the base direction
//             (proven in that direction) and flip in the other one; a file with direction-specific code ([dir=rtl],
//             :dir(rtl), @include dir(…)) keeps its physical sides and is listed as "decide".
//   mq        @media (min-width/max-width …) → @include mq(…) with the project's breakpoints (missing keys are added)
//   bem       top-level .block__x / .block-variant rules right after .block → nested &__x / &-variant (same compiled CSS)
//   colors    hex / rgb() / rgba() in variables and tokens → hsl(H, S%, L%[, A]) when the round trip is exact; a colour in a component that
//             equals a palette colour → var(--token); anything else is listed (needs-decision), never invented
//   rename    class prefix renames from renames.md (rows without "decide"), in SCSS + templates + TS
// Every file is proven: compiled with the project's sass before and after, the normalized CSS must render the same.
// A transform that cannot be proven is undone for that file and listed under "skipped (unsure)".
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const ng = require('./lib/angular');
const st = require('./lib/scss-text');
const domains = require('./lib/domains');
const classUsage = require('./class-usage');
const cf = require('./lib/colors-fix');

const HELP = `scss-fix.js — mechanical, proven SCSS fixes (0 tokens) for /ui-guard:fix scss.
Usage (all accept --root <dir>):
  node scss-fix.js apply --phase <id>        the phase's SCSS files (from .ui-guard/scss/plan.json) + its rename rows
  node scss-fix.js apply --files a.scss,b.scss [--renames]
  node scss-fix.js dry --files …             show what would change, write nothing
Writes .ui-guard/tmp/scss/fix/mechanical-<phase|files>.json: applied transforms per file, skipped (unsure) items with the
reason, and extra files touched (template/TS usages of renamed classes, the breakpoints settings file).
Exit 0 always when it ran; 7 when sass cannot be loaded: nothing is changed, every file is listed as "skipped (unsure: cannot compile)".`;

const TOOL_NAMES = ['px', 'mq', 'dir', 'after', 'before', 'hover', 'scroll'];
const PHYS = {
  'margin-left': 'margin-inline-start', 'margin-right': 'margin-inline-end', 'margin-top': 'margin-block-start', 'margin-bottom': 'margin-block-end',
  'padding-left': 'padding-inline-start', 'padding-right': 'padding-inline-end', 'padding-top': 'padding-block-start', 'padding-bottom': 'padding-block-end',
  'border-left': 'border-inline-start', 'border-right': 'border-inline-end', 'border-top': 'border-block-start', 'border-bottom': 'border-block-end',
  'border-left-width': 'border-inline-start-width', 'border-right-width': 'border-inline-end-width', 'border-top-width': 'border-block-start-width', 'border-bottom-width': 'border-block-end-width',
  'border-left-color': 'border-inline-start-color', 'border-right-color': 'border-inline-end-color', 'border-top-color': 'border-block-start-color', 'border-bottom-color': 'border-block-end-color',
  'border-left-style': 'border-inline-start-style', 'border-right-style': 'border-inline-end-style', 'border-top-style': 'border-block-start-style', 'border-bottom-style': 'border-block-end-style',
  'border-top-left-radius': 'border-start-start-radius', 'border-top-right-radius': 'border-start-end-radius', 'border-bottom-left-radius': 'border-end-start-radius', 'border-bottom-right-radius': 'border-end-end-radius',
  left: 'inset-inline-start', right: 'inset-inline-end', top: 'inset-block-start', bottom: 'inset-block-end',
  'scroll-margin-left': 'scroll-margin-inline-start', 'scroll-margin-right': 'scroll-margin-inline-end', 'scroll-padding-left': 'scroll-padding-inline-start', 'scroll-padding-right': 'scroll-padding-inline-end',
  'scroll-margin-top': 'scroll-margin-block-start', 'scroll-margin-bottom': 'scroll-margin-block-end', 'scroll-padding-top': 'scroll-padding-block-start', 'scroll-padding-bottom': 'scroll-padding-block-end',
};
/** Sizes: the same box in LTR and RTL (horizontal writing mode), so they convert in a bidirectional app too. */
const SIZE = { width: 'inline-size', height: 'block-size', 'min-width': 'min-inline-size', 'max-width': 'max-inline-size', 'min-height': 'min-block-size', 'max-height': 'max-block-size' };
function tSize(t) {
  return mapCode(t, (code) => code.replace(/(^|[;{}\s])([a-z-]+)(\s*:\s*)([^;{}]+)(?=[;}])/g, (m, pre, prop, colon, val) => (SIZE[prop] ? pre + SIZE[prop] + colon + val : m)));
}
const SWAP_RTL = { 'inline-start': 'inline-end', 'inline-end': 'inline-start', 'start-start': 'start-end', 'start-end': 'start-start', 'end-start': 'end-end', 'end-end': 'end-start' };
const PHYS_VALUES = { 'text-align': { left: 'start', right: 'end' }, float: { left: 'inline-start', right: 'inline-end' }, clear: { left: 'inline-start', right: 'inline-end' } };

/** 'ltr' | 'rtl' | 'both' — logical properties are neutral only when the app has one direction. */
function dirMode(profile) {
  const RTL = ['ar', 'he', 'fa', 'ur', 'ps', 'ku', 'yi', 'dv'];
  const langs = ((profile.i18n && profile.i18n.languages) || []).map((l) => String(l).toLowerCase().slice(0, 2));
  const rtl = langs.some((l) => RTL.includes(l)), ltr = langs.some((l) => l && !RTL.includes(l));
  if (rtl && ltr) return 'both';
  const d = ((profile.index && profile.index.dir) || (profile.answers && profile.answers.dir) || '').toLowerCase();
  if (d === 'rtl' || d === 'ltr') return d;
  return rtl ? 'rtl' : 'ltr';
}
/** The direction the styles are authored for: index.html `dir`, then the init answer, then the first language. */
function baseDir(profile) {
  const d = ((profile.index && profile.index.dir) || (profile.answers && profile.answers.dir) || '').toLowerCase();
  if (d === 'rtl' || d === 'ltr') return d;
  const first = String(((profile.i18n && profile.i18n.languages) || [])[0] || (profile.index && profile.index.lang) || '').toLowerCase().slice(0, 2);
  return ['ar', 'he', 'fa', 'ur', 'ps', 'ku', 'yi', 'dv'].includes(first) ? 'rtl' : 'ltr';
}
/** Code written for one direction only: mirroring would double-flip it. */
const DIR_SPECIFIC = /\[\s*dir\s*=|:dir\(|@include\s+dir\s*\(/i;

/** Replace inside the text, but never inside comments, strings or url(). fn(segmentText) → new segment text. */
function mapCode(text, fn) {
  let out = '', i = 0, chunk = '';
  while (i < text.length) {
    const sk = st.skipToken(text, i, true);
    if (sk >= 0) { out += fn(chunk) + text.slice(i, sk); chunk = ''; i = sk; continue; }
    if (/^url\(/i.test(text.slice(i, i + 4))) {
      // url("data:image/svg+xml,…rgb(…)…") — a quoted argument ends at its closing quote, not at the first ")" inside it
      let j = i + 4; while (j < text.length && /\s/.test(text[j])) j++;
      const from = text[j] === '"' || text[j] === "'" ? st.skipToken(text, j, true) : i;
      const e = text.indexOf(')', from); const end = e < 0 ? text.length : e + 1;
      out += fn(chunk) + text.slice(i, end); chunk = ''; i = end; continue;
    }
    chunk += text[i]; i++;
  }
  return out + fn(chunk);
}

// ---------- transforms (text → text) ----------
function tCharset(t) {
  if (/^@charset "UTF-8";\r?\n/.test(t)) return t; // already right: never reformat the file
  const body = t.replace(/^﻿/, '').replace(/^\s*@charset\s+["'][^"']*["']\s*;\s*\n?/i, '');
  return '@charset "UTF-8";\n' + body.replace(/^\n+/, '');
}

function definesTool(t) { return TOOL_NAMES.find((n) => new RegExp(`@(mixin|function)\\s+${n}\\b`).test(t)); }
function hasToolsUse(t) { return /@use\s+["'][^"']*tools["']\s+as\s+\*/.test(t); }
/** The tool files a text reads (AXIS @dependencies comment), in our one-file-per-tool layout. */
function toolDeps(t) {
  const code = t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const out = [];
  if (/(^|[^\w-])px\(/.test(code)) out.push('tools/functions/_px.function.scss');
  for (const n of TOOL_NAMES.filter((x) => x !== 'px')) if (new RegExp(`@include\\s+${n}\\b`).test(code)) out.push(`tools/mixins/_${n}.mixin.scss`);
  return out;
}
/**
 * `@use "<path-to-root>/tools" as *;` right after @charset (+ the `// @dependencies:` lines, tools.md). A file under the
 * scss root reaches the tools by its relative path (AXIS best-practices.md); a component style by the includePaths entry.
 * rel/sr: the file and the scss root (posix, project-relative).
 */
function tUseTools(t, rel = '', sr = '') {
  if (hasToolsUse(t)) return t;
  const lines = t.split('\n');
  const at = /^@charset/.test(lines[0]) ? 1 : 0;
  const inRoot = sr && rel.startsWith(sr + '/');
  const up = inRoot ? '../'.repeat(rel.slice(sr.length + 1).split('/').length - 1) : '';
  lines.splice(at, 0, `@use "${inRoot ? up + 'tools' : 'tools'}" as *;`);
  return lines.join('\n');
}
/** `// @dependencies: <file>` lines right after @charset for every tool the file reads (a comment: the CSS is unchanged). */
function tDeps(t) {
  const deps = toolDeps(t).filter((d) => !t.includes(`@dependencies: ${d}`));
  if (!deps.length) return t;
  const lines = t.split('\n');
  const at = /^@charset/.test(lines[0]) ? 1 : 0;
  const block = deps.map((d) => `// @dependencies: ${d}`);
  // after the existing @dependencies lines, else right after @charset with a blank line around
  let k = at;
  while (k < lines.length && (lines[k].trim() === '' || /^\/\/ @dependencies:/.test(lines[k]))) k++;
  const last = lines.slice(at, k).map((l, i) => (/^\/\/ @dependencies:/.test(l) ? at + i : -1)).filter((i) => i >= 0).pop();
  if (last !== undefined) lines.splice(last + 1, 0, ...block);
  else lines.splice(at, 0, ...(at ? [''] : []), ...block, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function tPx(t, rootPx) {
  // only in declaration values (prop: value; / }) — never in selectors, @media params or custom properties
  return mapCode(t, (code) => code.replace(/(^|[;{}\s])([\w$-][\w-]*)(\s*:\s*)([^;{}]+)(?=[;}])/g, (m, pre, prop, colon, val) => {
    if (prop.startsWith('--') || /^@/.test(prop)) return m;
    if (/#\{/.test(val)) return m;
    const nv = val.replace(/(^|[\s,(+*/-])(-?)(\d*\.?\d+)px\b/g, (mm, p, sign, n) => {
      const v = parseFloat(n);
      if (v === 0) return `${p}0`;
      if (v === 1 && rootPx === 16) return mm; // 1px stays (hairlines)
      const conv = Math.round(((v * 16) / rootPx) * 10000) / 10000;
      return `${p}px(${sign}${conv})`;
    });
    return pre + prop + colon + nv;
  }));
}

function tLogical(t, dir) {
  const flip = (name) => (dir === 'rtl' ? name.replace(/(inline-start|inline-end|start-start|start-end|end-start|end-end)/, (x) => SWAP_RTL[x]) : name);
  return mapCode(t, (code) => code.replace(/(^|[;{}\s])(-webkit-|-moz-)?([a-z-]+)(\s*:\s*)([^;{}]+)(?=[;}])/g, (m, pre, vendor, prop, colon, val) => {
    if (PHYS[prop] && !vendor) return pre + flip(PHYS[prop]) + colon + val;
    const vm = PHYS_VALUES[prop];
    const v = val.trim().toLowerCase();
    if (vm && vm[v]) return pre + (vendor || '') + prop + colon + val.replace(new RegExp(v, 'i'), flip(vm[v]));
    return m;
  }));
}

/** Read $breakpoints (key → px) from the project's breakpoints settings file. */
function readBreakpoints(file) {
  const t = u.readText(file) || '';
  const m = /\$breakpoints\s*:\s*\(([\s\S]*?)\)\s*;/.exec(t);
  const out = {};
  if (!m) return out;
  for (const x of m[1].matchAll(/([\w-]+)\s*:\s*(-?[\d.]+)(rem|px)/g)) out[x[1]] = x[3] === 'rem' ? parseFloat(x[2]) * 16 : parseFloat(x[2]);
  return out;
}
function addBreakpoint(file, key, px) {
  const t = u.readText(file);
  const m = /(\$breakpoints\s*:\s*\()([\s\S]*?)(\n?[ \t]*\)\s*;)/.exec(t);
  if (!m) return t;
  const lines = m[2].replace(/\s*$/, '').split('\n');
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  if (last >= 0) {
    // the previous last entry needs a comma (before its // comment, if it has one)
    const ci = lines[last].indexOf('//');
    const code = ci < 0 ? lines[last] : lines[last].slice(0, ci);
    const comment = ci < 0 ? '' : lines[last].slice(ci);
    if (code.trim() && !/,\s*$/.test(code)) lines[last] = code.replace(/\s*$/, ',') + (comment ? ' ' + comment : '');
  }
  lines.push(`  ${key}: ${Math.round((px / 16) * 10000) / 10000}rem // ${px}px, added by ui-guard for an existing media query`);
  return t.slice(0, m.index) + m[1] + lines.join('\n') + m[3] + t.slice(m.index + m[0].length);
}

/** @media → @include mq(...). bp = { map, add(px) → key } */
function tMq(t, bp, skipped) {
  const out = [];
  let i = 0;
  const re = /@media\s+([^{]+)\{/g;
  let m;
  const code = t;
  while ((m = re.exec(code))) {
    // never inside comments/strings: check that the match start is code
    const before = code.slice(0, m.index);
    if (/\/\/[^\n]*$/.test(before) || (before.lastIndexOf('/*') > before.lastIndexOf('*/'))) continue;
    const params = m[1].trim();
    const conds = params.split(/\s+and\s+/i).map((x) => x.trim());
    const parsed = conds.map((c) => /^\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)$/i.exec(c));
    if (!parsed.every(Boolean)) { skipped.push(`@media ${u.clip(params, 60)} — not a plain min/max width/height query (media type or other feature); left as is`); continue; }
    // find the block end
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < code.length; j++) { const sk = st.skipToken(code, j, true); if (sk >= 0) { j = sk - 1; continue; } if (code[j] === '{') depth++; else if (code[j] === '}') { depth--; if (!depth) break; } }
    if (j >= code.length) continue;
    const incl = parsed.map(([, type, feat, val]) => {
      const v = parseFloat(val);
      const target = type.toLowerCase() === 'min' ? v : Math.floor(v) + 1; // max-width: X ≡ width < X+1 (whole pixels)
      return `@include mq(${type.toLowerCase()}, ${feat.toLowerCase()[0]}, ${bp.key(target)})`;
    });
    out.push({ start: m.index, headEnd: m.index + m[0].length, end: j, incl });
  }
  if (!out.length) return t;
  let res = '', pos = 0;
  for (const o of out) {
    res += t.slice(pos, o.start) + o.incl.join(' { ') + ' {' + t.slice(o.headEnd, o.end) + '}'.repeat(o.incl.length);
    pos = o.end + 1;
  }
  return res + t.slice(pos);
}

/** Contiguous top-level .block__x / .block-variant rules right after .block → nested inside it. */
function tBem(t, skipped) {
  const stmts = st.splitTop(t);
  const res = [];
  for (let k = 0; k < stmts.length; k++) {
    const s = stmts[k];
    const blockM = s.block && /^\.([a-zA-Z][\w-]*)$/.exec(s.head);
    if (!blockM) { res.push(s.text); continue; }
    const block = blockM[1];
    const kids = [];
    let n = k + 1;
    for (; n < stmts.length; n++) {
      const x = stmts[n];
      if (!x.block) break;
      const parts = x.head.split(',').map((p) => p.trim());
      if (!parts.every((p) => p.startsWith('.' + block + '__') || p.startsWith('.' + block + '-'))) break;
      if (parts.some((p) => /\s/.test(p) && !/^\.[\w-]+(:[\w-]+(\([^)]*\))?)*$/.test(p))) break;
      kids.push(x);
    }
    if (!kids.length) { res.push(s.text); continue; }
    const inner = kids.map((x) => {
      const head = x.head.split(',').map((p) => p.trim().replace('.' + block, '&')).join(',\n  ');
      const body = st.blockInner(x).replace(/\n(?=.)/g, '\n  ').replace(/\s*$/, '');
      return `${x.lead.replace(/^\n+/, '\n').replace(/\n(?=.)/g, '\n  ')}  ${head} {${body}\n  }`;
    }).join('\n');
    const b = s.body;
    const close = b.lastIndexOf('}');
    res.push(s.lead + b.slice(0, close).replace(/\s*$/, '') + '\n' + inner + '\n}');
    k = n - 1;
  }
  const trailing = stmts.length && stmts[stmts.length - 1].trailing ? '' : t.slice(stmts.length ? stmts[stmts.length - 1].end : 0);
  void skipped;
  return res.join('') + trailing;
}

/**
 * `.block { .block__x {…} }` → `.block { &__x {…} }` (STYLE-47) for the element classes in `confirmed` only: the rule note allows it when a
 * script confirms the class is defined once and used only in the block's own template (the nested form has the higher specificity).
 * Only direct children of a top-level `.block {}` whose selector STARTS with `.block__x` are rewritten; every other selector is left alone.
 */
function tBemInline(t, confirmed) {
  if (!confirmed || !confirmed.size) return t;
  const stmts = st.splitTop(t);
  const res = stmts.map((s) => {
    const m = s.block && /^\.([a-zA-Z][\w-]*)$/.exec(s.head);
    if (!m) return s.text !== undefined ? s.text : (s.trailing || '');
    const block = m[1];
    const inner = st.blockInner(s);
    const kids = st.splitTop(inner);
    let any = false;
    const rebuilt = kids.map((k) => {
      if (!k.block) return k.text !== undefined ? k.text : (k.trailing || '');
      const parts = k.head.split(',').map((p) => p.trim());
      const ok = parts.every((p) => { const mm = new RegExp(`^\\.(${esc(block)}__[\\w-]+)(?![\\w-])`).exec(p); return !!mm && confirmed.has(mm[1]); });
      if (!ok) return k.text;
      any = true;
      const head = parts.map((p) => p.replace('.' + block + '__', '&__')).join(', ');
      return k.lead + head + k.body.slice(k.head.length);
    }).join('');
    if (!any) return s.text;
    const lastEnd = kids.length && kids[kids.length - 1].end !== undefined ? kids[kids.length - 1].end : 0;
    const b = s.body, open = b.indexOf('{'), close = b.lastIndexOf('}');
    return s.lead + b.slice(0, open + 1) + rebuilt + inner.slice(lastEnd) + b.slice(close);
  });
  const last = stmts[stmts.length - 1];
  const trailing = last && last.trailing ? '' : t.slice(last ? last.end : 0);
  return res.join('') + trailing;
}

// ---------- renames (SCSS + templates + TS) ----------
function renameRows(root, phaseId) {
  const t = u.readText(domains.paths(root, 'scss').renames) || '';
  const rows = [];
  for (const line of t.split('\n')) {
    const m = /^\|\s*`\.([\w-]+)`\s*\|\s*`\.([\w-]+)`\s*\|[^|]*\|\s*([\d—-]+)\s*\|/.exec(line);
    if (m && (!phaseId || m[3] === String(phaseId))) rows.push({ from: m[1], to: m[2] });
  }
  return rows;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function renameInScss(t, from, to) { return mapCode(t, (code) => code.replace(new RegExp(`\\.${esc(from)}(?![\\w-])`, 'g'), '.' + to)); }
function renameInHtml(t, from, to) {
  const tok = new RegExp(`(^|\\s)${esc(from)}(?=\\s|$)`, 'g');
  return t
    .replace(/(\sclass\s*=\s*")([^"]*)(")/g, (m, a, v, c) => a + v.replace(tok, `$1${to}`) + c)
    .replace(new RegExp(`\\[class\\.${esc(from)}\\]`, 'g'), `[class.${to}]`)
    .replace(/(\[(?:ngClass|class)\]\s*=\s*")([^"]*)(")/g, (m, a, v, c) => a + v.replace(new RegExp(`(['])${esc(from)}\\1`, 'g'), `$1${to}$1`).replace(new RegExp(`(^|[{,\\s])${esc(from)}(\\s*:)`, 'g'), `$1'${to}'$2`) + c);
}
function renameInTs(t, from, to) {
  const q = new RegExp(`(["'\`])${esc(from)}\\1`, 'g');
  let r = t.replace(/(classList\.(?:add|remove|toggle|contains|replace)\()([^)]*)(\))/g, (m, a, v, c) => a + v.replace(q, `$1${to}$1`) + c);
  r = r.replace(/(\.(?:addClass|removeClass)\([^,]+,\s*)(["'`])([\w-]+)\2/g, (m, a, qq, c) => (c === from ? `${a}${qq}${to}${qq}` : m));
  r = r.replace(/(querySelector(?:All)?\(\s*)(["'`])([^"'`]+)\2/g, (m, a, qq, sel) => a + qq + sel.replace(new RegExp(`\\.${esc(from)}(?![\\w-])`, 'g'), '.' + to) + qq);
  r = r.replace(new RegExp(`(@HostBinding\\(\\s*['"]class\\.)${esc(from)}(['"])`, 'g'), `$1${to}$2`);
  r = r.replace(/(template\s*:\s*`)([\s\S]*?)(`)/g, (m, a, v, c) => a + renameInHtml(v, from, to) + c);
  r = r.replace(/(['"]?class['"]?\s*:\s*)(["'`])([\w\s-]+)\2/g, (m, a, qq, v) => a + qq + v.replace(new RegExp(`(^|\\s)${esc(from)}(?=\\s|$)`, 'g'), `$1${to}`) + qq);
  return r;
}
/** A class name built by code ('tile-' + x, `tile-${…}`, [ngClass] with an expression) cannot be renamed safely. */
function dynamicUse(text, name) {
  return new RegExp(`["'\`]${esc(name)}-?["'\`]\\s*\\+|\\$\\{[^}]*\\}-?${esc(name)}\\b|\\b${esc(name)}-\\$\\{`).test(text);
}

// ---------- proof ----------
function compileText(root, file, text, loadPaths) {
  const tmp = path.join(path.dirname(file), `.ui-guard-proof-${process.pid}-${path.basename(file)}`);
  fs.writeFileSync(tmp, text);
  try { return st.compile(root, tmp, { loadPaths }); } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

function applyFile(root, rel, opts) {
  const abs = u.fromPosix(root, rel);
  const original = u.readText(abs);
  const res = { file: rel, applied: [], skipped: [] };
  if (original == null) { res.skipped.push({ what: 'file', reason: 'cannot be read' }); return res; }
  const isScss = /\.scss$/.test(rel);
  const comp = /^src\/app\//.test(rel) || opts.componentStyles.has(rel);
  const before = isScss ? compileText(root, abs, original, opts.loadPaths) : { css: original };
  if (before == null) return { ...res, noSass: true };
  if (before.error) { res.skipped.push({ what: 'all transforms', reason: `the file does not compile on its own (${u.clip(before.error, 120)})` }); return res; }
  const renameCss = (css) => { let c = css; for (const r of opts.renames) c = c.replace(new RegExp(`\\.${esc(r.from)}(?![\\w-])`, 'g'), '.' + r.to); return c; };
  const sideDir = opts.dir === 'both' ? opts.base : opts.dir;
  const nopt = { rootPx: opts.rootPx, dir: sideDir === 'rtl' ? 'rtl' : 'ltr', tokens: opts.palette.canon };
  const colorOnly = opts.colorOnly(rel);
  res.decisions = [];
  // the reference is the original CSS; once the rename step is applied, the original with the planned renames
  const refPlain = st.normalize(before.css, nopt), refRenamed = st.normalize(renameCss(before.css), nopt);
  let renamed = false;
  let cur = original;
  const steps = [];
  let lastColors = null;
  const colorStep = ['colors', (t) => { const c = cf.convert(t, { palette: opts.palette, fnVars: opts.fnVars, rel, move: isScss && !!opts.paletteFiles.length, newTokens: opts.newTokens }); lastColors = c; for (const k of c.skipped) res.skipped.push({ what: `L${k.line} ${k.what}`, reason: k.reason }); res.decisions.push(...c.decisions); return c.text; }];
  if (colorOnly) steps.push(colorStep);
  if (!colorOnly && opts.renames.length) steps.push(['rename', (t) => opts.renames.reduce((x, r) => renameInScss(x, r.from, r.to), t)]);
  // STYLE-47: `.block { .block__x }` → `&__x` for confirmed element classes; the proof reference is the renamed CSS with exactly that selector change
  const bemEls = opts.bemElements || [];
  const flatCss = (c) => bemEls.reduce((x, e) => x.replace(new RegExp(`\\.${esc(e.block)} \\.${esc(e.cls)}(?![\\w-])`, 'g'), '.' + e.cls), c);
  const refFlat = st.normalize(flatCss(renameCss(before.css)), nopt);
  let flat = false;
  if (!colorOnly && isScss && bemEls.length) steps.push(['bem-inline', (t) => tBemInline(t, new Set(bemEls.map((e) => e.cls)))]);
  if (!colorOnly) steps.push(['charset', (t) => tCharset(t)]);
  if (!colorOnly && isScss && (comp || /\b(px|mq|dir|after|before|hover|scroll)\(|@include\s+(px|mq|dir|after|before|hover|scroll)\b/.test(original) || /\d+px\b/.test(original) || /@media\s/.test(original))) {
    const own = definesTool(original);
    if (own) res.skipped.push({ what: 'use-tools', reason: `the file defines its own \`${own}\` — STYLE-38: remove it and @use the tools (judgment)` });
    else steps.push(['use-tools', (t) => tUseTools(t, rel, opts.sr)]);
  }
  if (!colorOnly) steps.push(colorStep);
  if (!colorOnly && isScss) steps.push(['px', (t) => tPx(t, opts.rootPx)]);
  if (!colorOnly) steps.push(['size', (t) => tSize(t)]);
  const hasSides = Object.keys(PHYS).some((p) => new RegExp(`(^|[;{\\s])${p}\\s*:`).test(original)) || /(text-align|float|clear)\s*:\s*(left|right)/.test(original);
  if (colorOnly) { /* settings, tools and theme files get the colour step only */ } else if (opts.dir === 'both' && DIR_SPECIFIC.test(original)) { if (hasSides) res.skipped.push({ what: 'logical', reason: 'the file has direction-specific code ([dir=…], :dir(), @include dir()) — mirroring its physical sides would double-flip them — decide per rule' }); }
  else steps.push(['logical', (t) => tLogical(t, sideDir)]);
  if (!colorOnly && isScss) steps.push(['mq', (t) => tMq(t, opts.bp, [])]);
  if (!colorOnly && isScss) steps.push(['bem', (t) => tBem(t, [])]);
  if (!colorOnly && isScss) steps.push(['deps', (t) => tDeps(t)]);
  // mq needs to report skipped items: run once for its notes
  if (!colorOnly && isScss) { const notes = []; tMq(original, { key: () => 'x' }, notes); for (const n of notes) res.skipped.push({ what: 'mq', reason: n }); }
  if (opts.renameOnly) steps.splice(0, steps.length, ...steps.filter((s) => s[0] === 'rename')); // a stylesheet of another phase: only the class rename
  for (const [name, fn] of steps) {
    let next;
    const bpBefore = opts.bp.snapshot();
    try { next = fn(cur); } catch (e) { res.skipped.push({ what: name, reason: 'transform failed: ' + e.message }); continue; }
    if (next === cur) continue;
    const after = isScss ? compileText(root, abs, next, opts.bp.loadPathsWith()) : { css: next };
    const ref = name === 'bem-inline' || flat ? refFlat : (name === 'rename' || renamed ? refRenamed : refPlain);
    const cmp = after.error ? { same: false, reason: 'does not compile: ' + u.clip(after.error, 120) } : st.sameRender(ref, st.normalize(after.css, nopt));
    if (!cmp.same) { opts.bp.restore(bpBefore); res.skipped.push({ what: name, reason: 'not proven neutral — ' + cmp.reason }); continue; }
    cur = next; res.applied.push(name);
    if (name === 'colors' && lastColors) res.colors = { converted: lastColors.converted, tokenized: lastColors.tokenized, ...(lastColors.moved.length ? { movedToPalette: lastColors.moved } : {}) };
    if (name === 'rename') renamed = true;
    if (name === 'bem-inline') flat = true;
  }
  if (cur !== original && !opts.dry) fs.writeFileSync(abs, cur);
  return res;
}

/** Files ordered so that every stylesheet comes AFTER the stylesheets it @use/@import/@forwards (matched by file name; cycles are cut). */
function orderByImports(root, rels) {
  const stem = (p) => path.basename(String(p)).replace(/\.s?css$/i, '').replace(/^_/, '');
  const byStem = new Map();
  for (const r of rels) { const k = stem(r); if (!byStem.has(k)) byStem.set(k, []); byStem.get(k).push(r); }
  const deps = new Map(rels.map((r) => {
    const t = (u.readText(u.fromPosix(root, r)) || '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const out = new Set();
    for (const m of t.matchAll(/@(?:use|import|forward)\s+(?:(?:"[^"]*"|'[^']*')\s*,\s*)*["']([^"']+)["']/g)) for (const d of byStem.get(stem(m[1])) || []) if (d !== r) out.add(d);
    return [r, out];
  }));
  const done = new Set(), order = [];
  const visit = (r, stack) => { if (done.has(r) || stack.has(r)) return; stack.add(r); for (const d of deps.get(r)) visit(d, stack); stack.delete(r); done.add(r); order.push(r); };
  for (const r of rels) visit(r, new Set());
  return order;
}

/** colors.palette.theme.css of the active theme and of every theme source (the active one first); [] when the project has no palette. */
function paletteFiles(root, profile) {
  return project.themeDirs(root, profile).map((d) => path.join(d.themeDir, 'colors', 'colors.palette.theme.css')).filter((f) => u.exists(f));
}

function run(root, { files, phaseId, dry, withRenames }) {
  const profile = project.readProfile(root);
  const sr = project.scssRoot(profile);
  const a = ng.readAngular(root, profile);
  const loadPaths = ((a && !a.error && a.options.stylePreprocessorOptions && a.options.stylePreprocessorOptions.includePaths) || []).slice();
  if (!loadPaths.includes(sr)) loadPaths.push(sr);
  if (!st.loadSass(root)) {
    // no proof possible → no mechanical change at all, every file listed as skipped
    return { noSass: true, phase: phaseId || null, files: files.map((f) => ({ file: f, applied: [] })), extraFiles: [], renames: [], skipped: files.filter((f) => /\.s?css$/.test(f)).map((f) => ({ file: f, what: 'all mechanical fixes', reason: 'skipped (unsure: cannot compile) — sass cannot be loaded; run `npm install` first' })) };
  }
  const bpFile = u.fromPosix(root, `${sr}/settings/_breakpoints.settings.scss`);
  const bpMap = readBreakpoints(bpFile);
  const added = {};
  const bp = {
    key(px) {
      const hit = Object.entries({ ...bpMap, ...added }).find(([, v]) => Math.abs(v - px) < 0.01);
      if (hit) return hit[0];
      const k = `w-${String(px).replace('.', '_')}`;
      added[k] = px;
      if (!dry && u.exists(bpFile)) fs.writeFileSync(bpFile, addBreakpoint(bpFile, k, px));
      return k;
    },
    snapshot() { return { ...added, __text: u.readText(bpFile) }; },
    restore(s) { for (const k of Object.keys(added)) if (!(k in s)) delete added[k]; if (!dry && s.__text != null) fs.writeFileSync(bpFile, s.__text); },
    loadPathsWith() { return loadPaths; },
  };
  const renames = withRenames ? renameRows(root, phaseId).filter((r) => r.from !== r.to) : [];
  const report = { phase: phaseId || null, files: [], skipped: [], decisions: [], extraFiles: [], renames: [] };
  // renames that code builds dynamically are not safe to apply mechanically
  const uiFiles = project.listUiFiles(root, profile).filter((f) => f.kind === 'html' || f.kind === 'ts' || f.kind === 'index');
  const safeRenames = [];
  const styleFiles = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss' || f.kind === 'css');
  const definers = (cls) => styleFiles.filter((f) => new RegExp(`\\.${esc(cls)}(?![\\w-])`).test(u.readText(f.abs) || '')).map((f) => f.rel);
  const inPhase = new Set(files);
  const outsideFiles = new Set();
  for (const r of renames) {
    const dyn = uiFiles.find((f) => dynamicUse(u.readText(f.abs) || '', r.from));
    const outside = definers(r.from).filter((f) => !inPhase.has(f));
    if (dyn) report.skipped.push({ file: dyn.rel, what: `rename .${r.from} → .${r.to}`, reason: 'the class name is built by code there — rename by hand (judgment)' });
    else { safeRenames.push({ ...r, definers: definers(r.from) }); for (const f of outside) outsideFiles.add(f); } // styled in other phases too: those stylesheets get ONLY this rename (proven by compiling)
  }
  // BEM elements made by the renames (`block__x`): nested as `&__x` only when the class is defined in ONE rule and used only in the template
  // of the stylesheet's own component (rule note under STYLE-47); the others stay nested (specificity) and are reported as unsure
  const bemElements = [];
  {
    const cu = require('./class-usage');
    const defs = cu.definitions(root, profile);
    const usedIn = new Map();
    for (const f of uiFiles) for (const x of cu.usages(u.readText(f.abs) || '', f.kind !== 'ts')) { if (!usedIn.has(x.cls)) usedIn.set(x.cls, new Set()); usedIn.get(x.cls).add(f.rel); }
    for (const r of safeRenames.filter((x) => x.to.includes('__'))) {
      const rules = new Map();
      for (const d of [...(defs.get(r.from) || []), ...(defs.get(r.to) || [])]) rules.set(`${d.file}:${d.line}`, d.file);
      const uses = [...(usedIn.get(r.from) || []), ...(usedIn.get(r.to) || [])];
      const defFile = [...rules.values()][0];
      const own = !!defFile && uses.every((f) => path.posix.dirname(f) === path.posix.dirname(defFile));
      if (rules.size === 1 && own) bemElements.push({ block: r.to.split('__')[0], cls: r.to, file: defFile });
      else report.skipped.push({ file: defFile || '', what: `bem-inline .${r.to.split('__')[0]} { .${r.to} } → &__${r.to.split('__').slice(1).join('__')}`, reason: `${rules.size} rule(s) style it${own ? '' : ' and it is used outside its own template'} — \`&__x\` lowers the specificity, so it stays nested (rule note under STYLE-47; unsure)` });
    }
  }
  const componentStyles = require('./foundation').componentStyles(root);
  const allScss = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss').map((f) => u.readText(f.abs) || '');
  const colorOnly = (rel) => /(^|\/)theme\//.test(rel) || rel.startsWith(`${sr}/settings/`) || rel.startsWith(`${sr}/tools/`);
  const opts = { sr, loadPaths, rootPx: profile.rootFontSize || 16, dir: dirMode(profile), base: baseDir(profile), bp, renames: safeRenames, bemElements, dry, componentStyles, palette: cf.palette(root, profile), fnVars: cf.colourFnVars(allScss), colorOnly, newTokens: new Map(), paletteFiles: paletteFiles(root, profile) };
  // one ordered pass: a stylesheet that imports another one is proven AFTER it (the compile reads the imported file from disk, so a
  // renamed class must already be renamed there); files of other phases get only the class rename
  const phaseFiles = files.filter((f) => /\.s?css$/.test(f) && !/\/packages\//.test(f));
  const outsideOnly = [...outsideFiles].filter((f) => !phaseFiles.includes(f));
  for (const rel of orderByImports(root, [...phaseFiles, ...outsideOnly])) {
    const outside = outsideOnly.includes(rel);
    const r = applyFile(root, rel, outside ? { ...opts, renameOnly: true } : opts);
    report.files.push({ file: rel, applied: r.applied, ...(outside ? { outsidePhase: true } : {}), ...(r.colors ? { colors: r.colors } : {}) });
    for (const s of r.skipped) report.skipped.push({ file: rel, ...s });
    for (const d of r.decisions || []) report.decisions.push(d);
    if (outside && r.applied.includes('rename')) report.extraFiles.push(rel);
  }
  // a confirmed element class that is STILL written with its full name (deeper than a direct child of the block: inside another element's
  // rule or a compound selector) cannot become `&__x` without changing the class name or the specificity → reported, never silent
  if (!dry || bemElements.length) {
    for (const e of bemElements) {
      const code = (u.readText(u.fromPosix(root, e.file)) || '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      if (new RegExp(`(^|[^&\\w-])\\.${esc(e.cls)}(?![\\w-])`).test(code)) report.skipped.push({ file: e.file, what: `bem-inline .${e.block} { … .${e.cls} } → &__…`, reason: 'nested deeper than a direct child of the block (inside another element\'s rule or a compound selector): `&__x` would change the selector — kept with its full name (STYLE-47; unsure)' });
    }
  }
  // STYLE-34: colours moved out of .scss → added to EVERY palette (active + each theme source) so a theme swap keeps them.
  // Only tokens that a written file really uses (var(--token)) are added; each carries its round-trip proof in the report.
  const used = [...opts.newTokens].filter(([t]) => files.some((rel) => (u.readText(u.fromPosix(root, rel)) || '').includes(`var(${t})`)) || dry);
  if (used.length) {
    report.movedToPalette = report.files.flatMap((x) => ((x.colors && x.colors.movedToPalette) || []).map((m) => ({ file: x.file, ...m })));
    for (const pf of opts.paletteFiles) {
      const t = u.readText(pf) || '';
      const add = used.filter(([tok]) => !new RegExp(`(^|[\\s;{])${esc(tok)}\\s*:`).test(t)).map(([tok, v]) => `  ${tok}: ${v};`);
      if (!add.length) continue;
      const i = t.lastIndexOf('}');
      const next = i < 0 ? t + ':root {\n' + add.join('\n') + '\n}\n' : t.slice(0, i).replace(/\s*$/, '\n') + add.join('\n') + '\n' + t.slice(i);
      if (!dry) fs.writeFileSync(pf, next);
      report.extraFiles.push(u.relPosix(root, pf));
    }
  }
  // template/TS usages: a class is renamed there only when EVERY stylesheet that defines it had its rename applied
  const appliedIn = new Set(report.files.filter((f) => f.applied.includes('rename')).map((f) => f.file));
  const done = safeRenames.filter((r) => r.definers.every((d) => appliedIn.has(d)));
  for (const r of safeRenames.filter((x) => !done.includes(x))) report.skipped.push({ file: r.definers.find((d) => !appliedIn.has(d)) || '', what: `rename .${r.from} → .${r.to}`, reason: 'PARTIAL: the stylesheet rename was not proven in every file that defines it — the fixer must finish or undo it' });
  if (done.length) {
    for (const f of uiFiles) {
      const t = u.readText(f.abs) || '';
      let n = t;
      for (const r of done) n = f.kind === 'ts' ? renameInTs(n, r.from, r.to) : renameInHtml(n, r.from, r.to);
      if (n !== t) { if (!dry) fs.writeFileSync(f.abs, n); report.extraFiles.push(f.rel); }
    }
    report.renames = done.map((r) => `.${r.from} → .${r.to}`);
  }
  if (Object.keys(added).length) report.extraFiles.push(`${sr}/settings/_breakpoints.settings.scss`);
  report.breakpointsAdded = added;
  return report;
}

module.exports = { run, tCharset, tUseTools, tDeps, tPx, tLogical, tSize, tMq, tBem, tBemInline, renameInHtml, renameInTs, renameInScss, dirMode, baseDir, DIR_SPECIFIC, readBreakpoints };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['renames']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const cmd = args._[0];
  if (cmd !== 'apply' && cmd !== 'dry') { console.log(HELP); process.exit(0); }
  let files = args.files ? String(args.files).split(',') : [];
  let phaseId = null, withRenames = !!args.renames;
  if (args.phase) {
    phaseId = String(args.phase);
    const plan = u.readJSON(domains.paths(root, 'scss').planJson, null);
    const ph = plan && plan.phases.find((p) => p.id === phaseId);
    if (!ph) { console.error(`Unknown scss phase "${phaseId}".`); process.exit(1); }
    files = ph.files || [];
    withRenames = true;
  }
  const report = run(root, { files, phaseId, dry: cmd === 'dry', withRenames });
  if (report.noSass) {
    if (cmd === 'apply') u.writeJSON(path.join(domains.paths(root, 'scss').fix, `mechanical-${phaseId || 'files'}.json`), report);
    for (const x of report.skipped) console.log(`  ${x.file}: ${x.reason}`);
    console.log('sass cannot be loaded (no node_modules?) — NO mechanical change made. Run `npm install` first.');
    process.exit(7);
  }
  const out = path.join(domains.paths(root, 'scss').fix, `mechanical-${phaseId || 'files'}.json`);
  if (cmd === 'apply') {
    u.writeJSON(out, report);
    // colours that need the developer (no palette token matches): one list at the end of the run (.ui-guard/scss/needs-decision.md)
    const dec = path.join(domains.paths(root, 'scss').fix, `decisions-${phaseId || 'files'}.jsonl`);
    const seen = new Set();
    u.writeJSONL(dec, report.decisions.filter((d) => { const k = `${d.file}:${d.line}:${d.issue}`; if (seen.has(k)) return false; seen.add(k); return true; }));
  }
  const n = report.files.filter((f) => f.applied.length).length;
  console.log(`scss-fix${cmd === 'dry' ? ' (dry run)' : ''}: ${n}/${report.files.length} file(s) changed by script (0 tokens)${report.renames.length ? ` · renames ${report.renames.join(', ')}` : ''}`);
  for (const f of report.files.filter((x) => x.applied.length)) console.log(`  ${f.file}: ${f.applied.join(', ')}`);
  for (const s of report.skipped) console.log(`  skipped (unsure): ${s.file} · ${s.what} — ${s.reason}`);
  if (report.extraFiles.length) console.log(`  extra files touched: ${report.extraFiles.join(', ')}`);
  if (cmd === 'apply') console.log(`  details → ${u.relPosix(root, out)}`);
}
