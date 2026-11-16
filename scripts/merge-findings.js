#!/usr/bin/env node
'use strict';
// Combine the free findings (Stage 0) and the AI findings (stages 1-3) into .ui-guard/findings.json.
// Deterministic: same input → same output and IDs.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const fp = require('./lib/fingerprint');
const domains = require('./lib/domains');

const HELP = `merge-findings.js — build .ui-guard/<domain>/findings.json (stable IDs).
Usage:
  node merge-findings.js finalize --domain scss|access|lang|safe [--root <dir>]
      .ui-guard/tmp/<domain>/scan/deterministic.jsonl (scripts + lint) + ai/findings.jsonl (AI pass)
      → .ui-guard/<domain>/findings.json (only the domain's own rule family).`;

const SEV = new Set(['error', 'warning', 'info']);
const sourceOf = (f) => (f.checker === 'stylelint' || f.checker === 'eslint' ? 'lint' : f.checker === 'script' ? 'script' : null);

function normalize(root, raw, defaultSource) {
  if (!raw || raw.__malformed || !raw.ruleId || !raw.file) return null;
  const f = { ...raw };
  f.ruleId = String(f.ruleId).toUpperCase().trim();
  f.file = String(f.file).split('\\').join('/').replace(/^\.\//, '');
  if (path.isAbsolute(f.file)) f.file = u.relPosix(root, f.file);
  f.line = Math.max(1, parseInt(f.line, 10) || 1);
  f.endLine = Math.max(f.line, parseInt(f.endLine, 10) || f.line);
  if (!SEV.has(f.severity)) { const r = project.ruleById(f.ruleId); f.severity = r ? r.severity : 'warning'; }
  f.checker = f.checker || 'ai';
  f.sources = [...new Set((f.sources && f.sources.length ? f.sources : [defaultSource || sourceOf(f) || 'ai']))].sort();
  f.message = u.clip(f.message || '', 300);
  // The fingerprint is always recomputed from the file on disk. Evidence is kept only from ui-guard's own
  // scripts/lint (secrets-check masks secret values there); AI text is never trusted as evidence.
  delete f.fingerprint;
  if (f.checker === 'ai') delete f.evidence;
  fp.complete(root, f);
  f.status = f.status === 'rejected' ? 'rejected' : 'confirmed';
  f.rejectReason = f.rejectReason || null;
  return f;
}

const sortKey = (f) => `${f.file}\u0000${String(f.line).padStart(7, '0')}\u0000${f.ruleId}\u0000${f.fingerprint}`;
const byKey = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);

/**
 * Deterministic (lint/script) findings are grouped only by fingerprint (same rule, file and line text) — two real
 * findings on neighboring lines stay two findings. AI findings join the nearest group of the same rule+file within ±2 lines.
 */
function cluster(findings) {
  const isDet = (f) => f.sources.includes('lint') || f.sources.includes('script');
  const sorted = [...findings].sort(byKey);
  const groups = [];
  const byFp = new Map();
  for (const f of sorted.filter(isDet)) {
    const g = byFp.get(f.fingerprint);
    if (g) { g.items.push(f); continue; }
    const ng = { key: f.ruleId + '|' + f.file, line: f.line, items: [f] };
    groups.push(ng); byFp.set(f.fingerprint, ng);
  }
  for (const f of sorted.filter((x) => !isDet(x))) {
    const k = f.ruleId + '|' + f.file;
    let best = null;
    for (const g of groups) if (g.key === k && Math.abs(g.line - f.line) <= 2 && (!best || Math.abs(g.line - f.line) < Math.abs(best.line - f.line))) best = g;
    if (best) { best.items.push(f); continue; }
    groups.push({ key: k, line: f.line, items: [f] });
  }
  return groups.map((g) => {
    const det = g.items.find(isDet);
    const rep = { ...(det || g.items[0]) };
    rep.sources = [...new Set(g.items.flatMap((x) => x.sources))].sort();
    const sev = ['error', 'warning', 'info'];
    rep.severity = g.items.map((x) => x.severity).sort((a, b) => sev.indexOf(a) - sev.indexOf(b))[0];
    if (!rep.fix) rep.fix = (g.items.find((x) => x.fix) || {}).fix || null;
    // distinct deterministic messages on the same line are kept (never silently dropped)
    const detMsgs = [...new Set(g.items.filter(isDet).map((x) => x.message))];
    if (detMsgs.length > 1) rep.message = u.clip(detMsgs.join(' · '), 400);
    return rep;
  }).sort(byKey);
}

/** Files of a domain the AI must still judge (needs) and the ones a finished, not-skipped batch covered. */
function aiCoverage(root, dom) {
  const ai = require('./ai-scan');
  const st = ai.load(root, dom.name) || ai.plan(root, dom);
  const needs = new Set(), covered = new Set();
  for (const sg of st.stages || []) for (const b of sg.batches || []) for (const f of b.files) { needs.add(f); if (b.status === 'done' && !b.skipped && ai.load(root, dom.name)) covered.add(f); }
  return { needs, covered };
}

function finalize(root, domain, { record = true } = {}) {
  const dom = domain ? domains.get(domain) : null;
  const scan = dom ? domains.paths(root, dom.name).scan : project.paths(root).scan;
  const rows = [];
  for (const raw of u.readJSONL(path.join(scan, 'deterministic.jsonl'))) { const f = normalize(root, raw); if (f) rows.push(f); }
  for (const raw of u.readJSONL(path.join(scan, 'ai', 'findings.jsonl'))) { const f = normalize(root, { ...raw, checker: 'ai', sources: ['ai'] }, 'ai'); if (f) rows.push(f); }
  // ledger: a file that is still valid for this domain keeps its lint + AI rows from the ledger (it was not linted or sent to an
  // agent this time). Script rows are always fresh (scripts run project-wide; some rules are cross-file).
  const L = dom ? require('./lib/ledger') : null;
  const lp = dom ? require('./ledger').loadPlan(root, dom.name) : null;
  const led = dom ? L.load(root).ledger : null;
  const reused = new Set();
  if (dom && lp && !lp.rescan) {
    const lintOk = new Set(lp.lintReuse || []), aiOk = new Set(lp.aiReuse || []);
    for (const rel of lp.valid) {
      if (!L.valid(led, rel, dom.name)) continue;
      // lint rows only under the same lint context (else the file was linted again above); AI rows only under the same rules
      const keep = L.reuseRows(led, rel, dom.name).filter((r) => ((r.sources || []).includes('ai') ? aiOk.has(rel) : lintOk.has(rel)));
      if (lintOk.has(rel) && aiOk.has(rel)) reused.add(rel);
      for (const raw of keep) { const f = normalize(root, raw); if (f) rows.push(f); }
    }
  }
  const own = dom ? rows.filter((f) => domains.owns(dom, f)) : rows;
  const out = cluster(own).map((f) => ({
    id: '', ruleId: f.ruleId, severity: f.severity, file: f.file, line: f.line, endLine: f.endLine, message: f.message, evidence: f.evidence,
    fix: f.fix || null, checker: f.checker, sources: f.sources, status: f.status, rejectReason: f.rejectReason || null, fingerprint: f.fingerprint,
    ...(f.impact ? { impact: f.impact } : {}), ...(f.tier ? { tier: f.tier } : {}),
  }));
  out.forEach((f, i) => { f.id = 'F-' + String(i + 1).padStart(6, '0'); });
  if (dom && dom.name === 'access') {
    // ACCESS: rank by user impact; findings that are not real problems are kept as rejected (with the reason), never reported
    const ai = require('./lib/access-impact');
    const pageDirs = ai.pageDirsOf(root);
    for (const f of out) {
      f.impact = ai.impactOf(f);
      const why = ai.notAProblem(root, f, pageDirs);
      if (why) { f.status = 'rejected'; f.rejectReason = why; }
    }
  }
  u.writeJSON(dom ? domains.paths(root, dom.name).findings : project.paths(root).findings, out);
  if (dom && record) recordLedger(root, dom, { rows: own, out, reused, scan });
  return out;
}

/**
 * Write what this scan learned into the ledger. A file is marked scanned (valid) for the domain only when everything the domain
 * checks on it really ran: its linter was available, and the AI covered it when it needed judgment (a skipped or stopped batch,
 * or a free scan without the AI part, leaves those files not scanned so the next scan judges them).
 */
function recordLedger(root, dom, { rows, out, reused, scan }) {
  const L = require('./lib/ledger');
  const inventory = require('./inventory');
  const inv = inventory.load(root) || inventory.build(root);
  const { ledger } = L.load(root);
  L.sync(root, ledger, inv.files);
  const ls = u.readJSON(path.join(scan, 'lint-status.json'), null) || {};
  const { needs, covered } = aiCoverage(root, dom);
  const lintOk = (rel) => (/\.s?css$/.test(rel) ? !(dom.lint.stylelint && ls.stylelint === false) : /\.(html|ts)$/.test(rel) ? !(dom.lint.eslint && ls.eslint === false) : true);
  const scanned = inv.files.filter((f) => L.DOMAIN_KINDS[dom.name].includes(f.kind)).map((f) => f.path)
    .filter((rel) => reused.has(rel) || (lintOk(rel) && (!needs.has(rel) || covered.has(rel))));
  const rowsByFile = new Map(), findingsByFile = new Map();
  for (const r of rows) if (r.sources.includes('lint') || r.sources.includes('ai')) { if (!rowsByFile.has(r.file)) rowsByFile.set(r.file, []); rowsByFile.get(r.file).push(r); }
  for (const f of out) { if (!findingsByFile.has(f.file)) findingsByFile.set(f.file, []); findingsByFile.get(f.file).push(f); }
  const lp = require('./ledger').loadPlan(root, dom.name);
  L.recordScan(root, ledger, dom.name, { scanned, rowsByFile, findingsByFile, reset: !!(lp && lp.rescan), ctx: L.contexts(root) });
  L.save(root, ledger);
}

module.exports = { normalize, cluster, finalize, recordLedger };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  if (args._[0] === 'finalize') {
    const dom = domains.fromArgs(args, { required: false });
    const out = finalize(root, dom && dom.name);
    console.log(`${dom ? `.ui-guard/${dom.name}/` : ''}findings.json: ${out.length} finding(s)`);
  }
  else console.log(HELP);
}
