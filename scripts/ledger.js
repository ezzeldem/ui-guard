#!/usr/bin/env node
'use strict';
// .ui-guard/ledger.json — what is already known about every UI file (script-owned, 0 tokens). See lib/ledger.js for the trust rule.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const domains = require('./lib/domains');
const L = require('./lib/ledger');
const inventory = require('./inventory');

const HELP = `ledger.js — the per-file ledger (.ui-guard/ledger.json). All commands accept --root <dir>.
  node ledger.js status                         files, valid/stale per domain, open/fixed/skipped/needs-decision/needs-rescan counts
  node ledger.js sync                           refresh fingerprints + facts of every UI file (facts only for changed files)
  node ledger.js prepare --domain D [--rescan]  first step of /ui-guard:scan D: which files of D are valid (reused: not linted,
                                                not sent to an agent) and which are stale/new → .ui-guard/tmp/D/scan/ledger-plan.json
                                                --rescan ignores the ledger for this run (every file is scanned again)
Trust rule: an entry counts for a domain only while its scannedFingerprint equals the file's content hash now.
An unreadable or old-version ledger is ignored (full rescan), never trusted.`;

const planFile = (root, d) => path.join(domains.paths(root, d).scan, 'ledger-plan.json');

/** Sync the ledger with the inventory and split the domain's files into valid / stale. */
function prepare(root, domain, { rescan = false } = {}) {
  const inv = inventory.load(root) || inventory.build(root);
  const { ledger, ignored } = L.load(root);
  L.sync(root, ledger, inv.files);
  L.save(root, ledger);
  const files = inv.files.filter((f) => L.DOMAIN_KINDS[domain].includes(f.kind)).map((f) => f.path);
  const ctx = L.contexts(root);
  const valid = rescan ? [] : files.filter((f) => L.valid(ledger, f, domain));
  const set = new Set(valid);
  // global invalidation: a valid file's lint rows are reused only under the same lint context, its AI rows only under the same
  // rules (domain rules file + rules.json + AI rule list); otherwise that part is redone for this run
  const lintReuse = valid.filter((f) => L.reusable(ledger, f, domain, ctx).lint);
  const aiReuse = valid.filter((f) => L.reusable(ledger, f, domain, ctx).ai);
  const out = { domain, rescan: !!rescan, ignored, ctx: { lint: ctx.lint, ai: ctx.ai[domain] }, valid, stale: files.filter((f) => !set.has(f)), lintReuse, aiReuse,
    lintContextChanged: valid.length > 0 && lintReuse.length < valid.length, aiContextChanged: valid.length > 0 && aiReuse.length < valid.length };
  u.writeJSON(planFile(root, domain), out);
  return out;
}
const loadPlan = (root, d) => u.readJSON(planFile(root, d), null);

module.exports = { prepare, loadPlan, planFile };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['rescan']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const cmd = args._[0] || 'status';
  if (cmd === 'prepare') {
    const dom = domains.fromArgs(args);
    const p = prepare(root, dom.name, { rescan: !!args.rescan });
    if (p.ignored) console.log('note: ' + p.ignored);
    console.log(`${dom.name} ledger: ${p.valid.length} file(s) valid · lint reused ${p.lintReuse.length} · AI reused ${p.aiReuse.length} (not linted / not sent to an agent again), ${p.stale.length} new/stale (scanned)${p.rescan ? ' · --rescan: ledger ignored for this run' : ''} → ${u.relPosix(root, planFile(root, dom.name))}`);
    if (p.lintContextChanged) console.log('note: the lint context changed (lint configs, SCSS tools/settings/theme/utilities, linter versions) — unchanged files are linted again');
    if (p.aiContextChanged) console.log(`note: the ${dom.name} rules changed since the scan — earlier AI results are stale and judged again`);
    process.exit(0);
  }
  if (cmd === 'sync') {
    const inv = inventory.load(root) || inventory.build(root);
    const { ledger, ignored } = L.load(root);
    const n = L.sync(root, ledger, inv.files);
    L.save(root, ledger);
    console.log(`${ignored ? 'note: ' + ignored + '\n' : ''}ledger: ${Object.keys(ledger.files).length} file(s), ${n} new/changed → .ui-guard/ledger.json`);
    process.exit(0);
  }
  if (cmd === 'status') {
    const { ledger, ignored } = L.load(root);
    if (ignored) console.log('note: ' + ignored);
    const fs = require('fs');
    const nowFp = (rel) => { try { return u.sha1(fs.readFileSync(u.fromPosix(root, rel))); } catch { return null; } };
    const s = L.status(ledger, nowFp);
    console.log(`ledger: ${s.files} file(s)${Object.keys(ledger.renames || {}).length ? ` · ${Object.keys(ledger.renames).length} class rename(s) recorded` : ''}`);
    for (const [d, c] of Object.entries(s.domains)) console.log(`  ${d.padEnd(6)} valid ${c.valid} · stale ${c.stale} · not scanned ${c.notScanned} · open ${c.open} · fixed ${c.fixed} · skipped ${c.skipped} · needs-decision ${c.needsDecision} · needs-rescan ${c.needsRescan}`);
    process.exit(0);
  }
  console.log(HELP);
}
