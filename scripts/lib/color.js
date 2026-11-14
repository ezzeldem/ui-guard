'use strict';
// Color math shared by tokens-check, color-ramp and icon-filter. Node built-ins only.

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); }

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/** Tiny arithmetic evaluator for calc(): numbers, + - * /, parentheses. Units are stripped by the caller. */
function evalArith(expr) {
  const s = expr.replace(/\s+/g, '');
  let i = 0;
  const num = () => {
    if (s[i] === '(') { i++; const v = add(); i++; return v; }
    if (s[i] === '-') { i++; return -num(); }
    if (s[i] === '+') { i++; return num(); }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('bad number at ' + s.slice(i));
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const mul = () => { let v = num(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = num(); v = op === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; } return v; };
  const v = add();
  if (i !== s.length) throw new Error('trailing input');
  return v;
}

/** Evaluate one CSS numeric component: "45", "45%", "calc(10 + 5%)", "45deg". */
function evalComponent(c) {
  let t = String(c).trim().replace(/deg\b/g, '').replace(/%/g, '');
  t = t.replace(/calc\(/g, '(');
  return evalArith(t);
}

/** Split function args on commas / spaces at depth 0 (handles `hsl(0 0% 4% / 0.08)`). */
function splitArgs(inner) {
  const parts = [];
  let depth = 0, cur = '';
  const hasComma = (() => { let d = 0; for (const ch of inner) { if (ch === '(') d++; else if (ch === ')') d--; else if (ch === ',' && d === 0) return true; } return false; })();
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (hasComma ? ch === ',' : (ch === ' ' || ch === '/'))) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Parse a resolved CSS color (hex, rgb[a], hsl[a]) → [r,g,b] or null. */
function parseColor(value) {
  const v = String(value).trim();
  if (v[0] === '#') return hexToRgb(v);
  const m = /^(rgba?|hsla?)\(([\s\S]*)\)$/i.exec(v);
  if (!m) {
    const named = { white: [255, 255, 255], black: [0, 0, 0], transparent: null };
    return named[v.toLowerCase()] || null;
  }
  const args = splitArgs(m[2]);
  try {
    if (/^rgb/i.test(m[1])) return args.slice(0, 3).map((a) => (/%$/.test(a) ? evalComponent(a) * 2.55 : evalComponent(a)));
    return hslToRgb(evalComponent(args[0]), evalComponent(args[1]), evalComponent(args[2]));
  } catch { return null; }
}

/** Substitute var(--x) recursively from a token map. Returns null when something is unresolved. */
function resolveVars(value, tokens, depth = 0) {
  if (depth > 20) return null;
  let unresolved = false;
  const out = String(value).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (all, name, fb) => {
    if (tokens[name] !== undefined) { const r = resolveVars(tokens[name], tokens, depth + 1); if (r == null) unresolved = true; return r || ''; }
    if (fb) return fb;
    unresolved = true; return '';
  });
  if (unresolved) return null;
  return /var\(/.test(out) ? resolveVars(out, tokens, depth + 1) : out;
}

function luminance([r, g, b]) {
  const ch = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

// --- CIE Lab + ΔE2000 ---
function rgbToLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE2000(rgb1, rgb2) {
  const [L1, a1, b1] = rgbToLab(rgb1), [L2, a2, b2] = rgbToLab(rgb2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2; else hbp = (h1p + h2p) / 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

module.exports = { clamp, hexToRgb, rgbToHex, hslToRgb, rgbToHsl, evalArith, evalComponent, parseColor, resolveVars, luminance, contrast, rgbToLab, deltaE2000 };
