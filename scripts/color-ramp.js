#!/usr/bin/env node
'use strict';
// §9.2 Color ramp: steps 50–900 derived from HSL parts. 500 = the input color (Δ = 0).
const u = require('./lib/util');
const color = require('./lib/color');

const LIGHT = { 50: 0.9, 100: 0.78, 200: 0.6, 300: 0.42, 400: 0.22 };
const DARK = { 600: 0.18, 700: 0.36, 800: 0.54, 900: 0.72 };
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Parse "#hex", "hsl(19 74% 28%)", "hsl(19, 74%, 28%)" → {h,s,l} (whole numbers). */
function parseInput(input) {
  const s = String(input).trim();
  const m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(s);
  if (m) return { h: Math.round(+m[1]), s: Math.round(+m[2]), l: Math.round(+m[3]) };
  const rgb = color.parseColor(s);
  if (!rgb) throw new Error(`Cannot read color "${input}". Use #hex or hsl(h s% l%).`);
  const [h, sat, l] = color.rgbToHsl(rgb);
  return { h: Math.round(h), s: Math.round(sat), l: Math.round(l) };
}

/** Default ramp deltas (Δh = Δs = 0). */
function defaultRamp(base) {
  const out = {};
  for (const st of STEPS) {
    let L = base.l;
    // spec ramp: toward 97% (lighter) and 10% (darker). For colors already past those ends (L > 97 or L < 10)
    // the ramp goes toward 100% / 0% instead, so steps stay monotonic and inside 0–100%.
    if (LIGHT[st] !== undefined) L = base.l + ((base.l <= 97 ? 97 : 100) - base.l) * LIGHT[st];
    if (DARK[st] !== undefined) L = base.l - (base.l - (base.l >= 10 ? 10 : 0)) * DARK[st];
    out[st] = { dh: 0, ds: 0, dl: Math.round(L) - base.l };
  }
  return out;
}

/** Deltas from a full design ramp { "100": "#..", ... } relative to the base (500). */
function rampFromDesign(base, ramp) {
  const out = defaultRamp(base);
  for (const [k, v] of Object.entries(ramp)) {
    const st = +k;
    if (!STEPS.includes(st)) continue;
    const c = parseInput(v);
    let dh = c.h - base.h;
    if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    out[st] = { dh, ds: c.s - base.s, dl: c.l - base.l };
  }
  out[500] = { dh: 0, ds: 0, dl: 0 };
  return out;
}

const sign = (n, unit = '') => (n < 0 ? ` - ${-n}${unit}` : ` + ${n}${unit}`);

/** CSS lines for one family. family: 'main' | 'secondary'; parts prefix '' or 'secondary-'. */
function cssLines(family, partsPrefix, deltas) {
  const H = `var(--${partsPrefix}hue)`, S = `var(--${partsPrefix}saturation)`, L = `var(--${partsPrefix}lightness)`;
  return STEPS.map((st) => {
    const d = deltas[st];
    if (!d.dh && !d.ds && !d.dl) return `  --${family}-${st}: hsl(${H}, ${S}, ${L});`;
    return `  --${family}-${st}: hsl(calc(${H}${sign(d.dh)}), calc(${S}${sign(d.ds, '%')}), calc(${L}${sign(d.dl, '%')}));`;
  });
}

function partLines(partsPrefix, base) {
  return [`  --${partsPrefix}hue: ${base.h};`, `  --${partsPrefix}saturation: ${base.s}%;`, `  --${partsPrefix}lightness: ${base.l}%;`];
}

function table(base, deltas) {
  const rows = ['| step | h | s | l | hex |', '|---|---|---|---|---|'];
  for (const st of STEPS) {
    const d = deltas[st];
    const h = base.h + d.dh, s = base.s + d.ds, l = base.l + d.dl;
    rows.push(`| ${st} | ${h} | ${s}% | ${l}% | ${color.rgbToHex(color.hslToRgb(h, s, l))} |`);
  }
  return rows.join('\n');
}

module.exports = { parseInput, defaultRamp, rampFromDesign, cssLines, partLines, table, STEPS };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, `color-ramp.js — §9.2 build a 50–900 ramp from one brand color (500 = input).
Usage: node color-ramp.js <#hex | "hsl(h s% l%)"> [--family main|secondary] [--ramp <json file or inline {"100":"#..",...}>] [--css]
  default ramp: lighter L + (97 − L) × {50 .90, 100 .78, 200 .60, 300 .42, 400 .22}; darker L − (L − 10) × {600 .18, 700 .36, 800 .54, 900 .72}
  --css   print the CSS lines (HSL parts + steps) for colors.palette.theme.css`);
  if (!args._[0]) { console.error('Give a color. See --help.'); process.exit(1); }
  const base = parseInput(args._[0]);
  const family = args.family || 'main';
  const prefix = family === 'main' ? '' : family + '-';
  let deltas = defaultRamp(base);
  if (args.ramp) deltas = rampFromDesign(base, JSON.parse(u.exists(args.ramp) ? u.readText(args.ramp) : args.ramp));
  console.log(`${family}: hsl(${base.h} ${base.s}% ${base.l}%)\n` + table(base, deltas));
  if (args.css) console.log('\n' + partLines(prefix, base).concat(cssLines(family, prefix, deltas)).join('\n'));
}
