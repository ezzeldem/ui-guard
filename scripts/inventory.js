#!/usr/bin/env node
'use strict';
// §6.3 Inventory — every UI file is accounted for. Subcommands: build | mark | gate | summary
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');

const HELP = `inventory.js — §6.3 inventory of every UI file (.ui-guard/tmp/scan/inventory.json).
Usage:
  node inventory.js build  [--root <dir>]
      List every UI file with { path, kind, sizeBytes, sha1, status:{lint,script,ai} }  (images/fonts/binaries are never listed).
  node inventory.js mark   --field <lint|script|ai> --value <done|n/a|pending> (--files <a,b,...> | --from <file.done.json|routing.json> | --all | --kinds <html,scss,...>)
      Update statuses. --from accepts a JSON file with {"files":[...]}.
  node inventory.js gate   [--root <dir>]
      Completeness gate: print every file whose required status is still pending; exit 1 if any.
  node inventory.js summary`;

function invPath(root) { return path.join(project.paths(root).scan, 'inventory.json'); }
function load(root) { return u.readJSON(invPath(root), null); }
function save(root, inv) { u.writeJSON(invPath(root), inv); }

function build(root) {
  const profile = project.readProfile(root);
  const files = project.listUiFiles(root, profile).map((f) => {
    const buf = fs.readFileSync(f.abs);
    const lintable = ['scss', 'css', 'html', 'ts', 'index'].includes(f.kind);
    return { path: f.rel, kind: f.kind, sizeBytes: buf.length, sha1: u.sha1(buf), status: { lint: lintable ? 'pending' : 'n/a', script: 'pending', ai: 'n/a' } };
  });
  const inv = { created: new Date().toISOString(), root: '.', files };
  save(root, inv);
  // the ledger reads each file only when its content changed (facts are kept between runs)
  try { const L = require('./lib/ledger'); const { ledger } = L.load(root); L.sync(root, ledger, files); L.save(root, ledger); } catch { /* the ledger is an optimisation; never fail the inventory */ }
  return inv;
}

function mark(root, field, value, list) {
  const inv = load(root);
  if (!inv) throw new Error('No inventory. Run `inventory.js build` first.');
  const set = list === true ? null : new Set(list);
  let n = 0;
  for (const f of inv.files) if (!set || set.has(f.path)) { f.status[field] = value; n++; }
  save(root, inv);
  return n;
}

function pending(inv) {
  return inv.files.filter((f) => Object.values(f.status).includes('pending')).map((f) => ({ path: f.path, pending: Object.entries(f.status).filter(([, v]) => v === 'pending').map(([k]) => k) }));
}

module.exports = { build, mark, load, pending, invPath };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['all']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const cmd = args._[0] || 'summary';
  if (cmd === 'build') {
    const inv = build(root);
    const kinds = {};
    for (const f of inv.files) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    console.log(`inventory: ${inv.files.length} UI files (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) → ${u.relPosix(root, invPath(root))}`);
  } else if (cmd === 'mark') {
    let list = [];
    if (args.all) list = true;
    else if (args.files) list = String(args.files).split(',').map((s) => s.trim()).filter(Boolean);
    else if (args.kinds) { const k = String(args.kinds).split(','); list = load(root).files.filter((f) => k.includes(f.kind)).map((f) => f.path); }
    else if (args.from) {
      const data = u.readJSON(path.resolve(args.from), {});
      if (Array.isArray(data.files)) list = data.files;
      else list = Object.entries(data).filter(([, g]) => Array.isArray(g) && g.length === 0).map(([f]) => f);
    }
    const n = mark(root, args.field, args.value || 'done', list);
    console.log(`marked ${n} file(s): ${args.field} = ${args.value || 'done'}`);
  } else if (cmd === 'gate') {
    const inv = load(root);
    if (!inv) { console.error('No inventory.'); process.exit(1); }
    const p = pending(inv);
    if (!p.length) { console.log(`gate: complete — all ${inv.files.length} files accounted for.`); process.exit(0); }
    const out = path.join(project.paths(root).scan, 'pending.json');
    u.writeJSON(out, p);
    console.log(`gate: ${p.length} file(s) still pending → ${u.relPosix(root, out)}`);
    for (const x of p) console.log(`  ${x.path}: ${x.pending.join(', ')}`);
    process.exit(1);
  } else {
    const inv = load(root);
    if (!inv) { console.log('No inventory yet.'); process.exit(0); }
    const counts = {};
    for (const f of inv.files) for (const [k, v] of Object.entries(f.status)) counts[`${k}:${v}`] = (counts[`${k}:${v}`] || 0) + 1;
    console.log(`${inv.files.length} files · ` + Object.entries(counts).sort().map(([k, v]) => `${k} ${v}`).join(' · '));
  }
}
