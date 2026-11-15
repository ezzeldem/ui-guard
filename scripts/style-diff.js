#!/usr/bin/env node
'use strict';
// Computed-style + bounding-box compare (used with the pixel diff when Playwright is installed).
// Reads the <shot>.styles.json files that `screens.js shoot --styles` wrote for two labels and lists every element whose
// visual properties or box changed. A tag swap (div → button) keeps the element's DOM path apart from the tag: the compare
// pairs elements by path with the tag names removed, so a neutralized swap compares clean.
const path = require('path');
const fs = require('fs');
const u = require('./lib/util');
const project = require('./lib/project');

const HELP = `style-diff.js — compare computed styles and bounding boxes of two screenshot runs.
Usage: node style-diff.js --phase <id> [--a before] [--b after] [--root <dir>]
  Reads .ui-guard/tmp/screens/phase-<id>/<a>/*.styles.json and <b>/*.styles.json (written by screens.js shoot --styles).
  Writes .../style-diff.json. Exit 0 = no element changed · 1 = changes (listed) · 4 = no style snapshots (Playwright missing / --styles not used).`;

const tagless = (k) => k.replace(/[a-z0-9-]+:(\d+)/g, '*:$1');

function compare(a, b) {
  const changes = [];
  const bByKey = new Map(Object.entries(b).map(([k, v]) => [tagless(k), { k, v }]));
  const aKeys = new Set();
  for (const [k, va] of Object.entries(a)) {
    const tk = tagless(k);
    aKeys.add(tk);
    const hit = bByKey.get(tk);
    if (!hit) { changes.push({ element: k, what: 'missing after the change' }); continue; }
    const vb = hit.v;
    if (va.box.some((n, i) => Math.abs(n - vb.box[i]) > 0.5)) changes.push({ element: k, what: `box ${va.box.join(',')} → ${vb.box.join(',')}` });
    for (const p of Object.keys(va.st)) if (va.st[p] !== vb.st[p]) changes.push({ element: k, what: `${p}: ${va.st[p]} → ${vb.st[p]}` });
  }
  for (const [tk, { k }] of bByKey) if (!aKeys.has(tk)) changes.push({ element: k, what: 'new element after the change' });
  return changes;
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root || !args.phase) { console.error('Need an Angular project and --phase. See --help.'); process.exit(1); }
  const base = path.join(project.paths(root).tmp, 'screens', `phase-${args.phase}`);
  const A = path.join(base, args.a || 'before'), B = path.join(base, args.b || 'after');
  const files = u.isDir(A) ? fs.readdirSync(A).filter((f) => f.endsWith('.styles.json')) : [];
  if (!files.length) { console.log('No style snapshots — the computed-style compare did not run (Playwright missing or --styles not used).'); process.exit(4); }
  const results = [];
  for (const f of files) {
    const a = u.readJSON(path.join(A, f), null), b = u.readJSON(path.join(B, f), null);
    if (!b) { results.push({ shot: f, error: 'no after snapshot' }); continue; }
    results.push({ shot: f, changes: compare(a, b) });
  }
  u.writeJSON(path.join(base, 'style-diff.json'), results);
  const bad = results.filter((r) => r.error || r.changes.length);
  for (const r of bad) console.log(`${r.shot}: ${r.error || `${r.changes.length} change(s), e.g. ${r.changes.slice(0, 3).map((c) => `${c.element} ${c.what}`).join(' | ')}`}`);
  console.log(`style-diff: ${results.length} shot(s), ${bad.length} with changes`);
  process.exit(bad.length ? 1 : 0);
}
module.exports = { compare, tagless };
