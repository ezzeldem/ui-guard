#!/usr/bin/env node
'use strict';
// Zero-token mechanical image fixes, run by /ui-guard:fix access (images have no domain of their own). Only the two
// changes that cannot alter what the page shows:
//   MEDIA-07  an Angular template path `src/assets/…` → `assets/…` (the build serves assets/, so the old path was broken)
//   MEDIA-02  loading="lazy" on an <img> inside a repeated block (@for, *ngFor, Razor @foreach) that has no loading or
//             loading="eager" — never an icon, never a priority / fetchpriority="high" image
// Everything else (width/height, raster → svg, a data-bound image outside a loop) needs the real file or a judgment: it
// is listed, never guessed. Usage: node media-fix.js [--root <dir>] [--apply] [--files a,b]
const fs = require('fs');
const u = require('./lib/util');
const project = require('./lib/project');
const mc = require('./media-check');

function fixText(rel, kind, text) {
  const changes = [];
  let out = text;
  // MEDIA-07 (Angular templates and inline templates only; Razor uses ~/)
  if (kind !== 'cshtml') {
    out = out.replace(/(\s(?:src|ngSrc|href)\s*=\s*["'])\.?\/?src\/assets\//g, (m, pre) => { changes.push('MEDIA-07 src/assets/ → assets/'); return pre + 'assets/'; });
  }
  // MEDIA-02
  const scan = kind === 'ts' ? mc.inlineTemplates(out) : out;
  const edits = [];
  for (const m of scan.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0], a = mc.attrsOf(tag);
    const inLoop = '*ngFor' in a || mc.insideFor(scan, m.index) || (kind === 'cshtml' && mc.insideRazorLoop(scan, m.index));
    if (!inLoop || a.loading === 'lazy') continue;
    if ('priority' in a || '[priority]' in a || a.fetchpriority === 'high') continue;
    const src = String(a.src ?? a.ngSrc ?? a['[src]'] ?? a['[ngSrc]'] ?? '');
    if (/\.svg(\?|$)/i.test(src) || /(^|[/_.-])icons?([/_.-]|$)/i.test(src)) continue;
    const next = /\sloading\s*=\s*["'][^"']*["']/i.test(tag) ? tag.replace(/(\sloading\s*=\s*["'])[^"']*(["'])/i, '$1lazy$2') : tag.replace(/^<img\b/i, '<img loading="lazy"');
    edits.push({ at: m.index, len: tag.length, next });
  }
  for (const e of edits.sort((x, y) => y.at - x.at)) { out = out.slice(0, e.at) + e.next + out.slice(e.at + e.len); changes.push('MEDIA-02 loading="lazy"'); }
  return { out, changes };
}

function run(root, { apply, files }) {
  const profile = project.readProfile(root);
  const list = project.listUiFiles(root, profile).filter((f) => ['html', 'cshtml', 'ts'].includes(f.kind) && (!files || files.includes(f.rel)));
  const report = [];
  for (const f of list) {
    const text = u.readText(f.abs) || '';
    const { out, changes } = fixText(f.rel, f.kind, text);
    if (!changes.length) continue;
    if (apply) fs.writeFileSync(f.abs, out);
    report.push({ file: f.rel, changes });
  }
  return report;
}

module.exports = { run, fixText };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('media-fix.js — MEDIA-07 src/assets/ paths and MEDIA-02 loading="lazy" in repeated blocks (0 tokens). [--root <dir>] [--apply] [--files a,b]'); process.exit(0); }
  const ri = args.indexOf('--root'), fi = args.indexOf('--files');
  const root = ri >= 0 ? args[ri + 1] : process.cwd();
  const report = run(root, { apply: args.includes('--apply'), files: fi >= 0 ? args[fi + 1].split(',') : null });
  for (const r of report) console.log(`${r.file}: ${r.changes.join(', ')}`);
  console.log(`media-fix: ${report.length} file(s) ${args.includes('--apply') ? 'changed' : 'would change'} (0 tokens). Width/height, raster → svg and data-bound images outside a loop are decisions.`);
}
