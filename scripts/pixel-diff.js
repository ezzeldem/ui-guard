#!/usr/bin/env node
'use strict';
// §8.4 Pixel diff with the PROJECT's pixelmatch + pngjs. threshold 0, includeAA true. Must be 0.
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const u = require('./lib/util');
const project = require('./lib/project');

const HELP = `pixel-diff.js — §8.4 compare two screenshot sets.
Usage: node pixel-diff.js --phase <id> [--a before] [--b after] [--root <dir>]
  Compares .ui-guard/tmp/screens/phase-<id>/<a>/*.png with <b>/*.png using pixelmatch
  (threshold 0, includeAA true). Writes diff PNGs to .../diff/ and results.json.
  Exit 0 when every pair has 0 differing pixels; exit 1 otherwise; exit 4 when tools are missing.
  Noise mode: --a before --b before2 also prints the bounding boxes of differing regions (dynamic areas → masks).`;

async function load(root) {
  const req = createRequire(path.join(root, 'package.json'));
  let PNG, pixelmatch;
  try { PNG = req('pngjs').PNG; } catch { return null; }
  let pmPath = null;
  try { pmPath = req.resolve('pixelmatch'); } catch {
    const guess = path.join(root, 'node_modules', 'pixelmatch', 'index.js');
    if (u.exists(guess)) pmPath = guess;
  }
  if (!pmPath) return null;
  try { pixelmatch = req('pixelmatch'); } catch { pixelmatch = (await import(pathToFileURL(pmPath).href)).default; }
  if (pixelmatch && pixelmatch.default) pixelmatch = pixelmatch.default;
  return { PNG, pixelmatch };
}

function bbox(diff, w, h) {
  // coarse 32px grid of differing cells
  const cells = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (diff[i] === 255 && diff[i + 1] === 0 && diff[i + 2] === 0) cells.add(`${Math.floor(x / 32)},${Math.floor(y / 32)}`);
  }
  if (!cells.size) return [];
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (const c of cells) { const [x, y] = c.split(',').map(Number); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [{ x: minX * 32, y: minY * 32, width: (maxX - minX + 1) * 32, height: (maxY - minY + 1) * 32, cells: cells.size }];
}

async function run(root, phase, a, b) {
  const tools = await load(root);
  if (!tools) { console.log('pixelmatch/pngjs are not installed — the zero-pixel proof is not possible.'); process.exit(4); }
  const base = path.join(project.paths(root).tmp, 'screens', `phase-${phase}`);
  const dirA = path.join(base, a), dirB = path.join(base, b), dirD = path.join(base, a === 'before' && b === 'before2' ? 'noise' : 'diff');
  u.mkdirp(dirD);
  const names = u.isDir(dirA) ? fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort() : [];
  const results = [];
  for (const n of names) {
    const fa = path.join(dirA, n), fb = path.join(dirB, n);
    if (!u.exists(fb)) { results.push({ shot: n, error: `missing in ${b}` }); continue; }
    const A = tools.PNG.sync.read(fs.readFileSync(fa)), B = tools.PNG.sync.read(fs.readFileSync(fb));
    if (A.width !== B.width || A.height !== B.height) { results.push({ shot: n, sizeChanged: true, a: `${A.width}x${A.height}`, b: `${B.width}x${B.height}`, diffPixels: Math.abs(A.width * A.height - B.width * B.height) || 1 }); continue; }
    const D = new tools.PNG({ width: A.width, height: A.height });
    const diffPixels = tools.pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0, includeAA: true });
    const df = path.join(dirD, n);
    fs.writeFileSync(df, tools.PNG.sync.write(D));
    results.push({ shot: n, diffPixels, diff: u.relPosix(root, df), regions: diffPixels ? bbox(D.data, A.width, A.height) : [] });
  }
  u.writeJSON(path.join(dirD, 'results.json'), results);
  const bad = results.filter((r) => r.error || r.diffPixels > 0);
  for (const r of results) console.log(`  ${r.shot}: ${r.error ? r.error : r.sizeChanged ? `size ${r.a} → ${r.b}` : `${r.diffPixels} px`}${r.regions && r.regions.length ? ` region ${JSON.stringify(r.regions[0])}` : ''}`);
  console.log(`${names.length} pair(s), ${bad.length} with differences → ${u.relPosix(root, dirD)}/results.json`);
  if (!names.length) { console.log('No screenshots to compare.'); process.exit(1); }
  process.exit(bad.length ? 1 : 0);
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root || !args.phase) { console.error('Need an Angular project and --phase. See --help.'); process.exit(1); }
  run(root, args.phase, args.a || 'before', args.b || 'after').catch((e) => { console.error(e.message); process.exit(1); });
}
