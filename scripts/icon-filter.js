#!/usr/bin/env node
'use strict';
// §9.3 hex → CSS filter that turns a BLACK icon into the target color.
// The known SPSA search over invert/sepia/saturate/hue-rotate/brightness/contrast, verified with ΔE2000.
const path = require('path');
const { createRequire } = require('module');
const u = require('./lib/util');
const color = require('./lib/color');

class Px {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  clampAll() { this.r = Math.min(255, Math.max(0, this.r)); this.g = Math.min(255, Math.max(0, this.g)); this.b = Math.min(255, Math.max(0, this.b)); }
  multiply(m) {
    const r = this.r * m[0] + this.g * m[1] + this.b * m[2];
    const g = this.r * m[3] + this.g * m[4] + this.b * m[5];
    const b = this.r * m[6] + this.g * m[7] + this.b * m[8];
    this.r = r; this.g = g; this.b = b; this.clampAll();
  }
  hueRotate(deg) {
    const a = (deg / 180) * Math.PI, s = Math.sin(a), c = Math.cos(a);
    this.multiply([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]);
  }
  sepia(v) {
    this.multiply([0.393 + 0.607 * (1 - v), 0.769 - 0.769 * (1 - v), 0.189 - 0.189 * (1 - v),
      0.349 - 0.349 * (1 - v), 0.686 + 0.314 * (1 - v), 0.168 - 0.168 * (1 - v),
      0.272 - 0.272 * (1 - v), 0.534 - 0.534 * (1 - v), 0.131 + 0.869 * (1 - v)]);
  }
  saturate(v) {
    this.multiply([0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
      0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
      0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]);
  }
  linear(slope, intercept = 0) { this.r = this.r * slope + intercept * 255; this.g = this.g * slope + intercept * 255; this.b = this.b * slope + intercept * 255; this.clampAll(); }
  brightness(v) { this.linear(v); }
  contrast(v) { this.linear(v, -(0.5 * v) + 0.5); }
  invert(v) { this.r = (v + (this.r / 255) * (1 - 2 * v)) * 255; this.g = (v + (this.g / 255) * (1 - 2 * v)) * 255; this.b = (v + (this.b / 255) * (1 - 2 * v)) * 255; this.clampAll(); }
}

/** Apply filter values [invert%, sepia%, saturate%, hueRotateDeg, brightness%, contrast%] to black. */
function apply(f) {
  const c = new Px(0, 0, 0);
  c.invert(f[0] / 100); c.sepia(f[1] / 100); c.saturate(f[2] / 100); c.hueRotate(f[3]); c.brightness(f[4] / 100); c.contrast(f[5] / 100);
  return [c.r, c.g, c.b];
}

function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function solver(target, rand) {
  const tHsl = color.rgbToHsl(target);
  const lossOf = (v) => {
    const rgb = apply([v[0], v[1], v[2], v[3] * 3.6, v[4], v[5]]);
    const h = color.rgbToHsl(rgb);
    return Math.abs(rgb[0] - target[0]) + Math.abs(rgb[1] - target[1]) + Math.abs(rgb[2] - target[2]) + Math.abs((h[0] - tHsl[0]) / 3.6) + Math.abs(h[1] - tHsl[1]) + Math.abs(h[2] - tHsl[2]);
  };
  const fix = (value, i) => {
    let max = 100;
    if (i === 2) max = 7500; else if (i === 4 || i === 5) max = 200;
    if (i === 3) { if (value > max) value %= max; else if (value < 0) value = max + (value % max); }
    else if (value < 0) value = 0; else if (value > max) value = max;
    return value;
  };
  const spsa = (A, a, c, values, iters) => {
    let best = null, bestLoss = Infinity;
    const deltas = new Array(6), hi = new Array(6), lo = new Array(6);
    for (let k = 0; k < iters; k++) {
      const ck = c / Math.pow(k + 1, 0.16666666666666666);
      for (let i = 0; i < 6; i++) { deltas[i] = rand() > 0.5 ? 1 : -1; hi[i] = values[i] + ck * deltas[i]; lo[i] = values[i] - ck * deltas[i]; }
      const diff = lossOf(hi) - lossOf(lo);
      for (let i = 0; i < 6; i++) { const g = (diff / (2 * ck)) * deltas[i]; const ak = a[i] / Math.pow(A + k + 1, 1); values[i] = fix(values[i] - ak * g, i); }
      const l = lossOf(values);
      if (l < bestLoss) { best = values.slice(0); bestLoss = l; }
    }
    return { values: best, loss: bestLoss };
  };
  const wide = () => {
    let best = { loss: Infinity };
    for (let i = 0; best.loss > 25 && i < 3; i++) {
      const r = spsa(5, [60, 180, 18000, 600, 1.2, 1.2], 15, [50, 20, 3750, 50, 100, 100], 1000);
      if (r.loss < best.loss) best = r;
    }
    return best;
  };
  const w = wide();
  const A1 = w.loss + 1;
  return spsa(w.loss, [0.25 * A1, 0.25 * A1, A1, 0.25 * A1, 0.2 * A1, 0.2 * A1], 2, w.values.slice(0), 500);
}

function toCss(v) {
  const r = [Math.round(v[0]), Math.round(v[1]), Math.round(v[2]), Math.round(v[3] * 3.6), Math.round(v[4]), Math.round(v[5])];
  return { rounded: r, css: `brightness(0) saturate(100%) invert(${r[0]}%) sepia(${r[1]}%) saturate(${r[2]}%) hue-rotate(${r[3]}deg) brightness(${r[4]}%) contrast(${r[5]}%)` };
}

/** Best filter for a target color: up to `attempts` searches (seeded, deterministic), stop when ΔE < 2. */
function solve(input, { attempts = 5, seed = 1 } = {}) {
  const target = color.parseColor(String(input).trim()) || null;
  if (!target) throw new Error(`Cannot read color "${input}".`);
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const res = solver(target, mulberry32(seed + a * 7919));
    const { rounded, css } = toCss(res.values);
    const got = apply(rounded);
    const dE = color.deltaE2000(target, got);
    if (!best || dE < best.deltaE) best = { css, deltaE: dE, loss: res.loss, attempt: a + 1, result: color.rgbToHex(got), target: color.rgbToHex(target) };
    if (dE < 2) break;
  }
  best.ok = best.deltaE < 2;
  return best;
}

/** Optional browser verification with the project's Playwright + pngjs. */
async function verifyInBrowser(root, css, targetHex) {
  const req = createRequire(path.join(root, 'package.json'));
  let pw, PNG;
  try { pw = req('playwright'); } catch { try { pw = req('@playwright/test'); } catch { return { verified: false, reason: 'playwright not installed' }; } }
  try { PNG = req('pngjs').PNG; } catch { return { verified: false, reason: 'pngjs not installed' }; }
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 20, height: 20 } });
    await page.setContent(`<div style="width:20px;height:20px;background:#000;filter:${css}"></div><style>body{margin:0}</style>`);
    const buf = await page.screenshot({ clip: { x: 10, y: 10, width: 1, height: 1 } });
    const png = PNG.sync.read(buf);
    const got = [png.data[0], png.data[1], png.data[2]];
    return { verified: true, rendered: color.rgbToHex(got), deltaE: color.deltaE2000(color.hexToRgb(targetHex), got) };
  } finally { await browser.close(); }
}

module.exports = { solve, apply, verifyInBrowser, toCss };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['verify', 'json']);
  u.helpExit(args, `icon-filter.js — §9.3 CSS filter that colors a BLACK single-color icon with <color>.
Usage: node icon-filter.js <#hex | "hsl(h s% l%)"> [--verify] [--root <project>] [--json]
  Accepts the result when ΔE2000 < 2 (max 5 searches). --verify renders it in Chromium (project's Playwright)
  and re-searches (max 5 attempts) until the rendered pixel has ΔE < 2; otherwise reports the best ΔE.
  Without Playwright the result is marked "not verified in a browser".`);
  (async () => {
    const input = args._[0];
    if (!input) { console.error('Give a color. See --help.'); process.exit(1); }
    let best = solve(input);
    let browser = { verified: false, reason: 'not requested (--verify)' };
    if (args.verify) {
      const root = path.resolve(args.root || process.cwd());
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = attempt === 0 ? best : solve(input, { seed: 1000 + attempt * 31 });
        const v = await verifyInBrowser(root, candidate.css, candidate.target);
        if (!v.verified) { browser = v; break; }
        if (!browser.verified || v.deltaE < browser.deltaE) { browser = v; best = candidate; }
        if (v.deltaE < 2) break;
      }
    }
    const out = { target: best.target, filter: best.css, deltaE: +best.deltaE.toFixed(3), ok: best.ok, browser };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`target ${out.target}\nfilter: ${out.filter}\nΔE2000 (model): ${out.deltaE} ${out.ok ? '✓ < 2' : '✗ ≥ 2 (best found)'}`);
      console.log(browser.verified ? `browser: rendered ${browser.rendered}, ΔE ${browser.deltaE.toFixed(3)} ${browser.deltaE < 2 ? '✓' : '✗'}` : `browser: not verified in a browser (${browser.reason})`);
    }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
