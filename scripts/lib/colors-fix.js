'use strict';
// Colour literals → our hue/saturation format (hsl), with a proof for every single value (0 tokens).
//   parseLiteral   hex (#rgb #rgba #rrggbb #rrggbbaa) and rgb()/rgba() with plain numbers → { r, g, b, a } (a in 0..1)
//   toHsl          the shortest hsl(H, S%, L%[, A]) whose round trip gives EXACTLY the same 8-bit channels (up to 4 decimals), else null
//   canonical      one comparable text for any hex / rgb / hsl literal (the browser's 8-bit result) — used by the CSS compare
//   palette        the colours of the project's palette tokens (theme/colors/*.css), for "equals a palette colour → the token"
//   convert        the whole step for one file: definitions ($var, --var) → hsl; component values equal to a palette colour → var(--token)
// Named colours (white, red, …) and anything with a variable, calc or interpolation are never touched.
const path = require('path');
const u = require('./util');
const color = require('./color');
const project = require('./project');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (n) => String(Math.round(n * 1e4) / 1e4);
const HEX = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const FN = /(?<![\w-])(rgba?|hsla?)\(\s*([^()]*?)\s*\)/gi;
const PLAIN = /^[\d.\s,%/+-]+(deg)?[\d.\s,%/+-]*$/;

function parseHex(s) {
  let h = s.slice(1);
  if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  const a = h.length === 8 ? n(6) : 255;
  return { r: n(0), g: n(2), b: n(4), a: a / 255, aByte: a, fromHex: true };
}
/** { r,g,b,a,aText } for rgb()/rgba() with plain numbers; { error } when a channel is not a whole number or uses percentages. */
function parseRgbFn(args) {
  if (!PLAIN.test(args)) return null;
  const parts = args.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  if (parts.slice(0, 3).some((p) => /%/.test(p))) return { error: 'the channels are percentages (the browser rounds them its own way)' };
  const ch = parts.slice(0, 3).map(Number);
  if (ch.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return { error: 'a channel is not a whole number from 0 to 255' };
  let a = 1, aText = null;
  if (parts[3] !== undefined) { a = /%$/.test(parts[3]) ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]); aText = /%$/.test(parts[3]) ? fmt(a) : parts[3]; if (!(a >= 0 && a <= 1)) return { error: 'the alpha is outside 0..1' }; }
  return { r: ch[0], g: ch[1], b: ch[2], a, aText, aByte: Math.round(a * 255) };
}
function parseHslFn(args) {
  if (!PLAIN.test(args)) return null;
  const parts = args.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const [h, s, l] = [parts[0].replace(/deg$/, ''), parts[1], parts[2]].map((p) => Number(p.replace(/%$/, '')));
  if ([h, s, l].some((v) => Number.isNaN(v))) return null;
  const [r, g, b] = color.hslToRgb(h, s, l).map((v) => Math.round(v));
  const a = parts[3] !== undefined ? (/%$/.test(parts[3]) ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3])) : 1;
  return { r, g, b, a, aByte: Math.round(a * 255) };
}
/** Parse one literal text (hex, rgb(), rgba(), hsl(), hsla()) → { r,g,b,a,aByte,kind } | { error } | null (not a plain literal). */
function parseLiteral(text) {
  const s = String(text).trim();
  if (/^#/.test(s)) return /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.test(s) ? { ...parseHex(s), kind: 'hex' } : null;
  const m = /^(rgba?|hsla?)\(\s*([^()]*?)\s*\)$/i.exec(s);
  if (!m) return null;
  const r = /^rgb/i.test(m[1]) ? parseRgbFn(m[2]) : parseHslFn(m[2]);
  return r ? { ...r, kind: /^rgb/i.test(m[1]) ? 'rgb' : 'hsl' } : null;
}

/** hsl(H, S%, L%[, A]) with EXACT round trip, or null. Tries 0..4 decimals (the STYLE-14 limit). */
function toHsl(c, maxDecimals = 4) {
  if (c.error || c.kind === 'hsl') return null;
  const [h, s, l] = color.rgbToHsl([c.r, c.g, c.b]);
  for (let d = 0; d <= maxDecimals; d++) {
    const k = 10 ** d, H = Math.round(h * k) / k, S = Math.round(s * k) / k, L = Math.round(l * k) / k;
    const back = color.hslToRgb(H, S, L).map((v) => Math.round(v));
    if (back[0] === c.r && back[1] === c.g && back[2] === c.b) {
      let alpha = null;
      if (c.a !== 1) {
        if (c.aText) alpha = c.aText; // as written (0.08 stays 0.08)
        else { // from a hex alpha byte: the shortest decimal that gives the same byte
          for (let ad = 0; ad <= 4 && alpha === null; ad++) { const a2 = Math.round(c.a * 10 ** ad) / 10 ** ad; if (Math.round(a2 * 255) === c.aByte) alpha = String(a2); }
        }
        if (alpha === null || clamp(Math.round(Number(alpha) * 255), 0, 255) !== c.aByte) return null;
      }
      return `hsl(${fmt(H)}, ${fmt(S)}%, ${fmt(L)}%${alpha !== null ? `, ${alpha}` : ''})`;
    }
  }
  return null;
}

const key = (c) => `${c.r},${c.g},${c.b},${c.aByte === 255 ? '' : c.aByte}`;
/** The browser's 8-bit result of any plain colour literal inside a value, as `rgb(r,g,b)` / `rgba(r,g,b,byte)`; tokens: name → canonical text. */
function canonicalValue(value, tokens) {
  let v = String(value).replace(HEX, (m) => { const c = parseLiteral(m); return c ? `rgb(${key(c)})`.replace(/,\)/, ')') : m; });
  v = v.replace(FN, (m) => { const c = parseLiteral(m); return c && !c.error ? `rgb(${key(c)})`.replace(/,\)/, ')') : m; });
  if (tokens) v = v.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, name) => (tokens[name] || m));
  return v;
}

/** Palette tokens of the project: { byKey: Map(key → [names]), canon: { '--name': 'rgb(…)' } } from theme/colors/*.css (active theme). */
function palette(root, profile) {
  const raw = {};
  const dirs = project.themeDirs(root, profile).filter((d) => d.active);
  for (const d of dirs) {
    const cdir = path.join(d.themeDir, 'colors');
    for (const f of u.isDir(cdir) ? u.walk(cdir).filter((x) => /\.css$/.test(x)) : []) {
      const text = (u.readText(f) || '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) raw[m[1]] = m[2].trim();
    }
  }
  const byKey = new Map(), canon = {};
  for (const [name, value] of Object.entries(raw)) {
    if (/-img$/.test(name) || /gradient|shadow/.test(name)) continue;
    const resolved = color.resolveVars(value, raw);
    if (resolved == null) continue;
    const c = parseLiteral(resolved.replace(/\bdeg\b/g, '').replace(/\s+/g, ' '));
    if (!c || c.error) continue;
    canon[name] = `rgb(${key(c)})`.replace(/,\)/, ')');
    const k = key(c);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(name);
  }
  return { byKey, canon };
}

/** Same-length copy of the text with comments, strings and url() contents blanked (offsets stay valid). */
function mask(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/[^\n]/g, ' '))
    .replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, (m) => m.replace(/[^\n]/g, ' '));
}

/** Sass variables that a Sass colour function reads: converting their colour could change the computed result. */
function colourFnVars(scssTexts) {
  const out = new Set();
  for (const t of scssTexts) {
    for (const m of t.matchAll(/\b(?:color\.)?(?:darken|lighten|saturate|desaturate|mix|rgba?|hsla?|adjust-hue|adjust-color|scale-color|change-color|transparentize|opacify|fade-in|fade-out|adjust|scale|change|invert|complement|grayscale|alpha|red|green|blue|hue|saturation|lightness)\(([^()]*)\)/g)) {
      for (const v of m[1].matchAll(/\$([\w-]+)/g)) out.add(v[1]);
    }
  }
  return out;
}

/**
 * The step for one file's text. ctx: { palette, fnVars, rel }. Returns { text, skipped:[{what,reason}], decisions:[{…}], converted, tokenized }.
 *  - a definition ($var: …, --var: …) with a hex / rgb() literal → hsl(…) when the round trip is exact
 *  - a normal property value with a literal that equals a palette colour → var(--token); otherwise listed (decision), left as written
 */
function convert(text, ctx) {
  const masked = mask(text);
  const out = { text, skipped: [], decisions: [], converted: 0, tokenized: 0, moved: [] };
  const edits = [];
  const re = /(^|[;{}\s])([$\w-][\w-]*)(\s*:\s*)([^;{}]+)(?=[;}])/g;
  let m;
  while ((m = re.exec(masked))) {
    const prop = m[2];
    if (/^@/.test(prop) || /#\{/.test(m[4])) continue;
    const valStart = m.index + m[1].length + prop.length + m[3].length;
    const isDef = prop.startsWith('$') || prop.startsWith('--');
    const val = masked.slice(valStart, valStart + m[4].length);
    const lits = [];
    for (const lm of val.matchAll(HEX)) lits.push({ at: lm.index, text: lm[0] });
    for (const lm of val.matchAll(FN)) if (/^(rgba?|hsla?)$/i.test(lm[1])) lits.push({ at: lm.index, text: lm[0] });
    for (const lit of lits.sort((a, b) => a.at - b.at)) {
      const line = u.lineAt(text, valStart + lit.at);
      const c = parseLiteral(lit.text);
      if (!c) continue;
      if (c.error) { out.skipped.push({ line, what: `colour ${lit.text}`, reason: `kept as written — ${c.error}` }); continue; }
      const pos = valStart + lit.at;
      if (isDef && ctx.move && prop.startsWith('$') && val.replace(/!(default|global)\b/g, '').trim() === lit.text) {
        // STYLE-34: no .scss file defines colours — `$name: <colour>` moves to the palette as --name: hsl(…), the Sass variable
        // becomes var(--token). Only when the exact round trip holds (proof recorded) and no Sass colour function reads it.
        if (ctx.fnVars.has(prop.slice(1))) { out.skipped.push({ line, what: `colour ${lit.text} in ${prop}`, reason: 'kept as written — a Sass colour function reads this variable; a var() there would not compile' }); continue; }
        const hsl = c.kind === 'hsl' ? lit.text : toHsl(c, ctx.maxDecimals === undefined ? 4 : ctx.maxDecimals);
        const back = hsl && parseLiteral(hsl);
        if (!back || back.error || key(back) !== key(c)) { out.skipped.push({ line, what: `colour ${lit.text} in ${prop}`, reason: 'kept as written — hsl with up to 4 decimals does not give exactly the same colour' }); continue; }
        const names = ctx.palette.byKey.get(key(c)) || [];
        let token;
        if (names.length === 1) token = names[0];
        else if (names.length > 1) { out.decisions.push({ topic: 'Colour matches several palette tokens', file: ctx.rel, line, issue: `${lit.text} in \`${prop}\` equals ${names.join(', ')}`, options: names.slice(0, 3).map((n) => `use var(${n})`) }); continue; }
        else {
          token = '--' + prop.slice(1);
          if (ctx.palette.canon[token]) { out.decisions.push({ topic: 'Colour name already used in the palette', file: ctx.rel, line, issue: `${prop}: ${lit.text} — the palette already has ${token} with another colour`, options: [`rename ${prop}`, `use var(${token}) and accept its colour`] }); continue; }
          const canon = `rgb(${key(c)})`.replace(/,\)/, ')');
          ctx.palette.canon[token] = canon;
          ctx.palette.byKey.set(key(c), [token]);
          if (ctx.newTokens) ctx.newTokens.set(token, hsl);
          out.moved.push({ line, token, value: hsl, from: lit.text, proof: `${lit.text} → ${hsl}: both rgb(${key(c)}) (8-bit round trip exact)` });
        }
        edits.push({ pos, len: lit.text.length, to: `var(${token})`, kind: 'moved' });
        continue;
      }
      if (isDef) {
        if (c.kind === 'hsl') continue; // already in our format
        if (prop.startsWith('$') && ctx.fnVars.has(prop.slice(1))) { out.skipped.push({ line, what: `colour ${lit.text} in ${prop}`, reason: 'kept as written — a Sass colour function reads this variable; converting could change its result' }); continue; }
        const hsl = toHsl(c, ctx.maxDecimals === undefined ? 4 : ctx.maxDecimals);
        if (!hsl) { out.skipped.push({ line, what: `colour ${lit.text} in ${prop}`, reason: 'kept as written — hsl with up to 4 decimals does not give exactly the same colour' }); continue; }
        edits.push({ pos, len: lit.text.length, to: hsl, kind: 'hsl' });
      } else {
        const names = ctx.palette.byKey.get(key(c));
        if (names && names.length === 1) edits.push({ pos, len: lit.text.length, to: `var(${names[0]})`, kind: 'token' });
        else if (names && names.length > 1) out.decisions.push({ topic: 'Colour matches several palette tokens', file: ctx.rel, line, issue: `${lit.text} in \`${prop}\` equals ${names.join(', ')}`, options: names.slice(0, 3).map((n) => `use var(${n})`) });
        else out.decisions.push({ topic: 'Colour not in the palette', file: ctx.rel, line, issue: `${lit.text} in \`${prop}\` matches no palette colour (no token is invented)`, options: ['add it to colors.palette.theme.css as a token (you choose the name), then it becomes var(--…)', 'keep the literal as it is'] });
      }
    }
  }
  let t = text;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) { t = t.slice(0, e.pos) + e.to + t.slice(e.pos + e.len); if (e.kind === 'hsl') out.converted++; else out.tokenized++; }
  out.text = t;
  return out;
}

module.exports = { parseLiteral, toHsl, canonicalValue, palette, convert, colourFnVars, key, HEX, FN };
