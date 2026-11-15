'use strict';
// Text helpers for SCSS/CSS used by the zero-token fixers (foundation.js, scss-fix.js):
//   splitTop(text)       top-level statements with their exact source text (comments travel with the next statement)
//   compile(root, file)  compile with the PROJECT's own sass (never installs anything); null when sass is not available
//   normalize(css, opts) a comparable form of compiled CSS: ordered statements + order-free sets (tokens, @font-face, @keyframes)
//   sameRender(a, b)     true when two normalized forms render the same (ordered part identical, order-free sets identical)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL, fileURLToPath } = require('url');
const u = require('./util');

/** Skip a string / comment / interpolation starting at i. Returns the index after it, or -1 when none starts there. */
function skipToken(t, i, scss) {
  const c = t[i];
  if (c === '"' || c === "'") { let j = i + 1; while (j < t.length && t[j] !== c) { if (t[j] === '\\') j++; j++; } return j + 1; }
  if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); return e < 0 ? t.length : e + 2; }
  if (scss && c === '/' && t[i + 1] === '/' && t[i - 1] !== ':') { const e = t.indexOf('\n', i); return e < 0 ? t.length : e; }
  return -1;
}

/**
 * Split SCSS/CSS text into top-level statements. Each item: { lead, body, text, start, end, block, head }.
 * lead = comments/whitespace before it; body = the statement itself (`…;` or `head { … }`); head = text before `{` (trimmed).
 * A trailing remainder (comments only) is returned as { trailing }.
 */
function splitTop(text, { scss = true } = {}) {
  const out = [];
  let i = 0, stmtStart = 0, bodyStart = -1, depth = 0, paren = 0, braceOpen = -1;
  const n = text.length;
  const push = (end) => {
    const raw = text.slice(stmtStart, end);
    const lead = text.slice(stmtStart, bodyStart);
    const body = text.slice(bodyStart, end);
    const head = braceOpen >= 0 ? text.slice(bodyStart, braceOpen).trim() : body.replace(/;\s*$/, '').trim();
    out.push({ lead, body, text: raw, start: stmtStart, end, block: braceOpen >= 0, head });
    stmtStart = end; bodyStart = -1; braceOpen = -1;
  };
  while (i < n) {
    const sk = skipToken(text, i, scss);
    if (sk >= 0) {
      // comments before a statement belong to its lead; strings start the body
      if ((text[i] === '"' || text[i] === "'") && bodyStart < 0) bodyStart = i;
      i = sk; continue;
    }
    const c = text[i];
    if (bodyStart < 0) { if (/\s/.test(c)) { i++; continue; } bodyStart = i; }
    if (c === '#' && text[i + 1] === '{') { let d = 1, j = i + 2; while (j < n && d) { if (text[j] === '{') d++; else if (text[j] === '}') d--; j++; } i = j; continue; }
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '{') { if (depth === 0) braceOpen = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0) { i++; push(i); continue; } if (depth < 0) depth = 0; }
    else if (c === ';' && depth === 0 && paren === 0) { i++; push(i); continue; }
    i++;
  }
  const rest = text.slice(stmtStart);
  if (rest.trim()) {
    if (bodyStart >= 0) { braceOpen = -1; push(n); } else out.push({ trailing: true, lead: rest, body: '', text: rest, start: stmtStart, end: n, head: '' });
  }
  return out;
}

/** Declarations directly inside a block body text (not nested rules). */
function blockInner(stmt) {
  const b = stmt.body;
  const o = b.indexOf('{');
  return o < 0 ? '' : b.slice(o + 1, b.lastIndexOf('}'));
}

// ---------- compile with the project's sass ----------
function loadSass(root) {
  try { return createRequire(path.join(root, 'package.json'))('sass'); } catch { return null; }
}

/** Compile one SCSS/CSS file. Returns { css } or { error } — or null when sass is not available. */
function compile(root, file, { loadPaths = [] } = {}) {
  if (/\.css$/.test(file)) { const t = u.readText(file); return t == null ? { error: 'cannot read ' + file } : { css: t }; }
  const sass = loadSass(root);
  if (!sass) return null;
  const nm = path.join(root, 'node_modules');
  const tilde = { findFileUrl(url) { if (!url.startsWith('~')) return null; return pathToFileURL(path.join(nm, url.slice(1))); } };
  try {
    const r = sass.compile(file, { loadPaths: [path.dirname(file), ...loadPaths.map((p) => path.resolve(root, p)), root, nm], importers: [tilde], style: 'expanded', silenceDeprecations: ['import', 'global-builtin', 'mixed-decls', 'slash-div', 'color-functions'], logger: { warn() {}, debug() {} } });
    return { css: r.css, loaded: (r.loadedUrls || []).filter((x) => x.protocol === 'file:').map((x) => fileURLToPath(x)) };
  } catch (e) { return { error: u.clip(e.message || String(e), 300) }; }
}

// ---------- comparable form of compiled CSS ----------
const LOGICAL = {
  'margin-inline-start': ['margin-left', 'margin-right'], 'margin-inline-end': ['margin-right', 'margin-left'], 'margin-block-start': ['margin-top', 'margin-top'], 'margin-block-end': ['margin-bottom', 'margin-bottom'],
  'padding-inline-start': ['padding-left', 'padding-right'], 'padding-inline-end': ['padding-right', 'padding-left'], 'padding-block-start': ['padding-top', 'padding-top'], 'padding-block-end': ['padding-bottom', 'padding-bottom'],
  'inset-inline-start': ['left', 'right'], 'inset-inline-end': ['right', 'left'], 'inset-block-start': ['top', 'top'], 'inset-block-end': ['bottom', 'bottom'],
  'border-inline-start': ['border-left', 'border-right'], 'border-inline-end': ['border-right', 'border-left'], 'border-block-start': ['border-top', 'border-top'], 'border-block-end': ['border-bottom', 'border-bottom'],
  'border-inline-start-width': ['border-left-width', 'border-right-width'], 'border-inline-end-width': ['border-right-width', 'border-left-width'],
  'border-inline-start-color': ['border-left-color', 'border-right-color'], 'border-inline-end-color': ['border-right-color', 'border-left-color'],
  'border-inline-start-style': ['border-left-style', 'border-right-style'], 'border-inline-end-style': ['border-right-style', 'border-left-style'],
  'border-block-start-width': ['border-top-width', 'border-top-width'], 'border-block-end-width': ['border-bottom-width', 'border-bottom-width'],
  'border-block-start-color': ['border-top-color', 'border-top-color'], 'border-block-end-color': ['border-bottom-color', 'border-bottom-color'],
  'border-block-start-style': ['border-top-style', 'border-top-style'], 'border-block-end-style': ['border-bottom-style', 'border-bottom-style'],
  'border-start-start-radius': ['border-top-left-radius', 'border-top-right-radius'], 'border-start-end-radius': ['border-top-right-radius', 'border-top-left-radius'],
  'border-end-start-radius': ['border-bottom-left-radius', 'border-bottom-right-radius'], 'border-end-end-radius': ['border-bottom-right-radius', 'border-bottom-left-radius'],
  'scroll-margin-inline-start': ['scroll-margin-left', 'scroll-margin-right'], 'scroll-margin-inline-end': ['scroll-margin-right', 'scroll-margin-left'],
  'scroll-padding-inline-start': ['scroll-padding-left', 'scroll-padding-right'], 'scroll-padding-inline-end': ['scroll-padding-right', 'scroll-padding-left'],
};
const LOGICAL_VALUES = { 'text-align': { start: ['left', 'right'], end: ['right', 'left'] }, float: { 'inline-start': ['left', 'right'], 'inline-end': ['right', 'left'] }, clear: { 'inline-start': ['left', 'right'], 'inline-end': ['right', 'left'] } };

const num = (x) => String(Math.round(x * 10000) / 10000);
function remToPx(s, rootPx) { return s.replace(/(-?\d*\.?\d+)rem\b/g, (m, v) => num(parseFloat(v) * rootPx) + 'px'); }
/** Media query text → canonical form: width/height ranges in px with explicit comparison. */
function normMedia(params) {
  let p = remToPx(params.toLowerCase().replace(/\s+/g, ' ').trim(), 16);
  p = p.replace(/\(\s*min-(width|height)\s*:\s*([\d.]+)px\s*\)/g, (m, f, v) => `(${f} >= ${num(+v)}px)`);
  // max-width: X ≡ width < X + 1 at whole-pixel viewports (the mq() mixin uses `<`)
  p = p.replace(/\(\s*max-(width|height)\s*:\s*([\d.]+)px\s*\)/g, (m, f, v) => `(${f} < ${num(Math.floor(+v) + 1)}px)`);
  p = p.replace(/\(\s*(width|height)\s*<\s*([\d.]+)px\s*\)/g, (m, f, v) => `(${f} < ${num(Math.ceil(+v - 1e-9) === +v ? +v : Math.ceil(+v))}px)`);
  p = p.replace(/\(\s*(width|height)\s*>=\s*([\d.]+)px\s*\)/g, (m, f, v) => `(${f} >= ${num(+v)}px)`);
  return p.split(' and ').map((x) => x.trim()).sort().join(' and ');
}

function declNorm(decl, { rootPx, dir }) {
  const k = decl.indexOf(':');
  if (k < 0) return decl.trim();
  let prop = decl.slice(0, k).trim().toLowerCase();
  let val = decl.slice(k + 1).trim().replace(/\s+/g, ' ');
  const side = dir === 'rtl' ? 1 : 0;
  if (LOGICAL[prop]) prop = LOGICAL[prop][side];
  if (LOGICAL_VALUES[prop] && LOGICAL_VALUES[prop][val]) val = LOGICAL_VALUES[prop][val][side];
  if (!prop.startsWith('--')) val = remToPx(val, rootPx);
  val = val.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, p) => `url(${path.posix.basename(p.split('?')[0].split('#')[0])})`);
  val = val.replace(/\b0px\b/g, '0');
  return `${prop}:${val}`;
}

function splitDecls(inner) {
  const parts = [];
  let cur = '', depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const sk = skipToken(inner, i, false);
    if (sk >= 0) { if (inner[i] !== '/') cur += inner.slice(i, sk); i = sk - 1; continue; }
    const c = inner[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ';' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Normalize compiled CSS into { ordered: [...], free: { tokens, fontFaces, keyframes } }. */
function normalize(css, { rootPx = 16, dir = 'ltr' } = {}) {
  const ordered = [];
  const tokens = {}, fontFaces = [], keyframes = [];
  const walk = (text, ctx) => {
    for (const s of splitTop(text, { scss: false })) {
      if (s.trailing) continue;
      const head = s.head.replace(/\s+/g, ' ');
      if (/^@charset/i.test(head)) continue;
      if (!s.block) { ordered.push(ctx + head); continue; }
      const inner = blockInner(s);
      if (/^@font-face/i.test(head) && !ctx) { fontFaces.push(splitDecls(inner).map((d) => declNorm(d, { rootPx, dir })).sort().join(';')); continue; }
      if (/^@(-webkit-)?keyframes/i.test(head) && !ctx) { keyframes.push(head + '{' + inner.replace(/\s+/g, ' ').trim() + '}'); continue; }
      if (/^@media/i.test(head)) { walk(inner, ctx + '@media ' + normMedia(head.slice(6)) + '|'); continue; }
      if (/^@(supports|layer|container|document)/i.test(head)) { walk(inner, ctx + head + '|'); continue; }
      const decls = splitDecls(inner);
      if (/^:root$/.test(head) && !ctx && decls.length && decls.every((d) => d.startsWith('--'))) {
        for (const d of decls) { const k = d.indexOf(':'); const name = d.slice(0, k).trim(); (tokens[name] = tokens[name] || []).push(d.slice(k + 1).trim().replace(/\s+/g, ' ')); }
        continue;
      }
      const sel = head.split(',').map((x) => x.trim()).join(',');
      ordered.push(ctx + sel + '{' + decls.map((d) => declNorm(d, { rootPx, dir })).join(';') + '}');
    }
  };
  walk(css, '');
  // a token declared twice is NOT order-free: keep both in the ordered part
  for (const [k, v] of Object.entries(tokens)) if (v.length > 1) { for (const x of v) ordered.push(`:root{${k}:${x}}`); delete tokens[k]; }
  return { ordered, free: { tokens: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v[0]]).sort()), fontFaces: fontFaces.sort(), keyframes: keyframes.sort() } };
}

/** Compare two normalized forms. Returns { same, reason }. */
function sameRender(a, b) {
  if (a.ordered.length !== b.ordered.length) return { same: false, reason: `different number of rules (${a.ordered.length} → ${b.ordered.length})` };
  for (let i = 0; i < a.ordered.length; i++) if (a.ordered[i] !== b.ordered[i]) return { same: false, reason: `rule ${i + 1} differs: ${u.clip(a.ordered[i], 90)} → ${u.clip(b.ordered[i], 90)}` };
  const ja = JSON.stringify(a.free), jb = JSON.stringify(b.free);
  if (ja !== jb) {
    const ta = a.free.tokens, tb = b.free.tokens;
    const diff = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].filter((k) => ta[k] !== tb[k]);
    return { same: false, reason: diff.length ? `token(s) differ: ${diff.slice(0, 5).join(', ')}` : '@font-face / @keyframes differ' };
  }
  return { same: true };
}

function writeIfChanged(file, text) { if (u.readText(file) !== text) { u.mkdirp(path.dirname(file)); fs.writeFileSync(file, text); return true; } return false; }

module.exports = { splitTop, blockInner, splitDecls, skipToken, loadSass, compile, normalize, sameRender, normMedia, declNorm, LOGICAL, writeIfChanged };
