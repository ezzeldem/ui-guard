#!/usr/bin/env node
'use strict';
// /ui-guard:scan html — ONE pass over every template (*.html, index.html and inline `template:` of component .ts files) that
// records the HTML-side findings of ALL four domains in the ledger, so each template is read once:
//   scripts + lint first (0 tokens, one run for every domain), then the AI ONLY for files with items a script cannot decide —
//   ONE agent read per file covering every domain still pending for it (batches ≤ 12 files, one agent at a time, Sonnet).
// Afterwards `/ui-guard:scan <domain>` reuses these entries while the file's fingerprint is unchanged.
// State: .ui-guard/tmp/html/scan/ (the same command continues from the exact batch after a usage limit).
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const domains = require('./lib/domains');
const L = require('./lib/ledger');
const inventory = require('./inventory');
const route = require('./route-files');
const merge = require('./merge-findings');
const runChecks = require('./run-checks');

const HELP = `html-pass.js — /ui-guard:scan html: every template read once for all domains (scripts first, then one agent read per file).
Usage (all accept --root <dir>):
  node html-pass.js prepare [--rescan]   templates + the domains still pending for each (ledger trust rule; --rescan = all)
  node html-pass.js checks               scripts + lint once for every domain, on the pending templates (0 tokens)
  node html-pass.js plan                 AI batches: only files with judgment items; each file appears in ONE batch with all its
                                         pending domains (≤ 12 files per batch)
  node html-pass.js next                 the next batch as JSON (exit 0) · exit 10 = all done
  node html-pass.js record <batch> [--tokens <n>]   validate + save the agent's output, split by domain. exit 2 = invalid →
                                         run the batch once more with the error; a second invalid result → skip
  node html-pass.js skip <batch> --reason "<text>"  · stop <batch> --reason "<text>" (usage limit: the same command resumes)
  node html-pass.js status
  node html-pass.js finalize [--keep-tmp] [--keep-screens]
        write each domain's findings of these templates into .ui-guard/ledger.json (the last script of the flow: runs cleanup)`;

const BATCH_FILES = 12, BATCH_BYTES = 80 * 1024, OVERHEAD = 6000;
const base = (root) => domains.paths(root, 'html').scan;
const aiDir = (root) => path.join(base(root), 'ai');
const stateFile = (root) => path.join(aiDir(root), 'state.json');
const planFile = (root) => path.join(base(root), 'plan.json');

/** The template stage of each domain (its AI rules + rule groups for templates). */
function templateStages() {
  const { STAGES } = require('./ai-scan');
  const out = {};
  for (const d of domains.NAMES) { const sg = STAGES[d].find((s) => s.kinds.includes('html')); if (sg) out[d] = sg; }
  return out;
}

function templates(root, ledger, inv) {
  return inv.files.filter((f) => f.kind === 'html' || f.kind === 'index' || f.kind === 'cshtml' || (f.kind === 'ts' && ledger.files[f.path] && ledger.files[f.path].facts && ledger.files[f.path].facts.inlineTemplate));
}

function prepare(root, { rescan = false } = {}) {
  const inv = inventory.load(root) || inventory.build(root);
  const { ledger, ignored } = L.load(root);
  L.sync(root, ledger, inv.files);
  L.save(root, ledger);
  // pending = not valid, or produced under another lint context / other rules (global invalidation)
  const ctx = L.contexts(root);
  const files = templates(root, ledger, inv).map((f) => ({ path: f.path, kind: f.kind, sizeBytes: f.sizeBytes, pending: domains.NAMES.filter((d) => { if (rescan) return true; const r = L.reusable(ledger, f.path, d, ctx); return !(r.lint && r.ai); }) })).filter((f) => f.pending.length);
  const p = { created: new Date().toISOString(), rescan: !!rescan, ignored, templates: templates(root, ledger, inv).length, files };
  u.writeJSON(planFile(root), p);
  return p;
}

function checks(root) {
  const p = u.readJSON(planFile(root), null);
  if (!p) throw new Error('Run `html-pass.js prepare` first.');
  const files = p.files.map((f) => f.path);
  // ONE run of every ui-guard script and the linters for all domains; split by owner afterwards
  const res = files.length ? runChecks.runAll(root, { files }) : { findings: [], notes: [], eslint: true, stylelint: true, notChecked: {} };
  for (const d of domains.NAMES) u.writeJSONL(path.join(base(root), `det-${d}.jsonl`), res.findings.filter((f) => domains.owns(d, f)));
  u.writeJSON(path.join(base(root), 'lint-status.json'), { eslint: res.eslint, stylelint: res.stylelint, notChecked: res.notChecked, notes: res.notes });
  return res;
}

function plan(root) {
  const p = u.readJSON(planFile(root), null);
  if (!p) throw new Error('Run `html-pass.js prepare` first.');
  const stages = templateStages();
  const unverified = {};
  for (const d of domains.NAMES) for (const f of u.readJSONL(path.join(base(root), `det-${d}.jsonl`))) if (/unverified/.test(f.message || '')) (unverified[f.file] = unverified[f.file] || new Set()).add(d);
  const rulesTokens = Object.fromEntries(domains.NAMES.map((d) => [d, Math.ceil((u.readText(path.join(project.PLUGIN_ROOT, domains.get(d).rulesFile)) || '').length / 4)]));
  const work = [];
  for (const f of p.files) {
    const groups = route.groupsFor(root, f);
    const ai = f.pending.filter((d) => stages[d] && ((unverified[f.path] && unverified[f.path].has(d)) || groups.some((g) => stages[d].groups.includes(g))));
    if (ai.length) work.push({ ...f, ai });
  }
  const batches = [];
  let cur = [], bytes = 0;
  const flush = () => {
    if (!cur.length) return;
    const ds = [...new Set(cur.flatMap((f) => f.ai))];
    batches.push({ id: `html-${String(batches.length + 1).padStart(3, '0')}`, files: cur.map((f) => f.path), perFile: Object.fromEntries(cur.map((f) => [f.path, f.ai])), estTokens: Math.ceil(bytes / 4) + ds.reduce((n, d) => n + rulesTokens[d], 0) + OVERHEAD, status: 'pending', tokens: 0, findings: 0 });
    cur = []; bytes = 0;
  };
  for (const f of work) { if (cur.length && (cur.length >= BATCH_FILES || bytes + f.sizeBytes > BATCH_BYTES)) flush(); cur.push(f); bytes += f.sizeBytes; }
  flush();
  return { domain: 'html', created: new Date().toISOString(), used: 0, agents: 0, stop: null, stages: [{ id: 1, name: 'Templates — every pending domain in one read', files: work.length, batches }] };
}

const load = (root) => u.readJSON(stateFile(root), null);
const save = (root, s) => u.writeJSON(stateFile(root), s);
const allBatches = (s) => s.stages.flatMap((sg) => sg.batches);

function validate(root, b) {
  const out = path.join(aiDir(root), `${b.id}.jsonl`), done = path.join(aiDir(root), `${b.id}.done.json`);
  if (!u.exists(out)) return { error: `the agent wrote no result file (${u.relPosix(root, out)})` };
  const d = u.readJSON(done, null);
  if (!d || !Array.isArray(d.files)) return { error: `the agent's .done.json is missing or unreadable (${u.relPosix(root, done)})` };
  const missing = b.files.filter((f) => !d.files.includes(f));
  if (missing.length) return { error: `the agent did not check ${missing.length} file(s) of the batch: ${missing.slice(0, 5).join(', ')}` };
  const rows = u.readJSONL(out);
  const bad = rows.filter((r) => r.__malformed);
  if (bad.length) return { error: `${bad.length} unreadable line(s) in the result, e.g. ${u.clip(bad[0].__malformed, 80)}` };
  const stages = templateStages();
  const findings = [];
  for (const r of rows) {
    if (!r.ruleId || !r.file || !(parseInt(r.line, 10) >= 1)) return { error: `invalid finding (needs ruleId, file, line ≥ 1): ${u.clip(JSON.stringify(r), 100)}` };
    const rule = String(r.ruleId).toUpperCase();
    const file = String(r.file).split('\\').join('/');
    if (!b.perFile[file]) return { error: `the agent reported a file outside its batch: ${r.file}` };
    const dom = domains.ofRule(rule);
    if (!dom || !b.perFile[file].includes(dom) || !stages[dom].rules.includes(rule)) return { error: `the agent reported ${rule} for ${file}, which is not an AI rule of a domain pending for that file (${b.perFile[file].join(', ')})` };
    const n = merge.normalize(root, { ...r, ruleId: rule, file, checker: 'ai', sources: ['ai'] }, 'ai');
    if (n.line > (u.readText(u.fromPosix(root, n.file)) || '').split('\n').length) return { error: `line ${n.line} does not exist in ${n.file}` };
    findings.push({ ...n, domain: dom });
  }
  return { findings };
}

/** Each domain's findings of the pending templates → ledger (rows + clustered findings, marked scanned when everything ran). */
function finalize(root) {
  const p = u.readJSON(planFile(root), null);
  if (!p) throw new Error('Run `html-pass.js prepare` first.');
  const st = load(root);
  const ls = u.readJSON(path.join(base(root), 'lint-status.json'), null) || {};
  const aiRows = u.readJSONL(path.join(aiDir(root), 'findings.jsonl'));
  const needs = new Map(), covered = new Set();
  for (const b of st ? allBatches(st) : []) for (const f of b.files) { needs.set(f, b.perFile[f]); if (b.status === 'done' && !b.skipped) covered.add(f); }
  const inv = inventory.load(root) || inventory.build(root);
  const { ledger } = L.load(root);
  L.sync(root, ledger, inv.files);
  const summary = {};
  const ctx = L.contexts(root);
  const pageDirs = require('./lib/access-impact').pageDirsOf(root);
  for (const d of domains.NAMES) {
    const dom = domains.get(d);
    const files = p.files.filter((f) => f.pending.includes(d)).map((f) => f.path);
    const set = new Set(files);
    const rows = [];
    for (const raw of u.readJSONL(path.join(base(root), `det-${d}.jsonl`))) if (set.has(raw.file)) { const f = merge.normalize(root, raw); if (f) rows.push(f); }
    for (const raw of aiRows.filter((r) => r.domain === d)) { const { domain: _x, batch: _b, ...rest } = raw; const f = merge.normalize(root, { ...rest, checker: 'ai', sources: ['ai'] }, 'ai'); if (f && set.has(f.file)) rows.push(f); }
    const out = merge.cluster(rows);
    if (d === 'access') { const ai = require('./lib/access-impact'); for (const f of out) { f.impact = ai.impactOf(f); const why = ai.notAProblem(root, f, pageDirs); if (why) { f.status = 'rejected'; f.rejectReason = why; } } }
    // AI needed for d on this file and not covered (no batch yet, skipped, stopped) → not scanned; eslint domains need ESLint
    const aiOk = (rel) => !(needs.get(rel) || []).includes(d) || covered.has(rel) || !st;
    const lintOk = !dom.lint.eslint || ls.eslint !== false;
    const scanned = files.filter((rel) => lintOk && aiOk(rel) && !(st === null && planNeeds(root, rel, d)));
    const rowsByFile = new Map(), findingsByFile = new Map();
    for (const r of rows) if (r.sources.includes('lint') || r.sources.includes('ai')) { if (!rowsByFile.has(r.file)) rowsByFile.set(r.file, []); rowsByFile.get(r.file).push(r); }
    for (const f of out) { if (!findingsByFile.has(f.file)) findingsByFile.set(f.file, []); findingsByFile.get(f.file).push(f); }
    L.recordScan(root, ledger, d, { scanned, rowsByFile, findingsByFile, ctx });
    summary[d] = { files: files.length, scanned: scanned.length, findings: out.filter((f) => f.status !== 'rejected').length };
  }
  L.save(root, ledger);
  return { summary, templates: p.templates, aiFiles: needs.size, agentReads: st ? allBatches(st).reduce((n, b) => n + (b.status === 'done' && !b.skipped ? b.files.length : 0), 0) : 0, st };
}
/** Without an AI state (the plan was never made) a file that would need judgment for d is not marked scanned. */
function planNeeds(root, rel, d) {
  const sg = templateStages()[d];
  return !!sg && route.groupsFor(root, { path: rel, kind: /\.ts$/.test(rel) ? 'ts' : 'html' }).some((g) => sg.groups.includes(g));
}

module.exports = { prepare, checks, plan, finalize, templateStages };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['rescan', 'keep-tmp', 'keep-screens']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const [cmd, id] = args._;
  try {
    if (cmd === 'prepare') {
      const p = prepare(root, { rescan: !!args.rescan });
      if (p.ignored) console.log('note: ' + p.ignored);
      const per = Object.fromEntries(domains.NAMES.map((d) => [d, p.files.filter((f) => f.pending.includes(d)).length]));
      console.log(`html pass: ${p.templates} template(s) · pending per domain: ${domains.NAMES.map((d) => `${d} ${per[d]}`).join(', ')}${p.rescan ? ' · --rescan' : ''}`);
      process.exit(0);
    }
    if (cmd === 'checks') {
      const res = checks(root);
      for (const n of res.notes) console.log('note: ' + n);
      for (const [tool, reason] of Object.entries(res.notChecked)) console.log(`NOT CHECKED: ${tool} rules (${reason})`);
      console.log(`html pass · scripts + lint once for all domains (0 tokens): ${domains.NAMES.map((d) => `${d} ${res.findings.filter((f) => domains.owns(d, f)).length}`).join(', ')}`);
      process.exit(0);
    }
    if (cmd === 'plan') {
      let s = load(root);
      if (!s || args.rebuild) { s = plan(root); save(root, s); }
      const all = allBatches(s);
      console.log(`html AI pass: ${s.stages[0].files} template(s) need judgment, ${all.length} batch(es) — one agent read per file for all its pending domains${all.some((b) => b.status === 'done') ? ` · ${all.filter((b) => b.status === 'done').length} batch(es) already done` : ''}`);
      process.exit(0);
    }
    const s = load(root);
    if (cmd === 'finalize') {
      const r = finalize(root);
      console.log(`html pass → ledger: ${r.templates} template(s); ${domains.NAMES.map((d) => `${d} ${r.summary[d].scanned}/${r.summary[d].files} recorded (${r.summary[d].findings} finding(s))`).join(' · ')} · agent reads: ${r.agentReads} (each file at most once)`);
      console.log('Next: /ui-guard:fix scss → /ui-guard:fix access → /ui-guard:fix lang → /ui-guard:fix safe (each `scan <domain>` reuses this pass).');
      console.log(require('./cleanup').finish(root, { ...args, domain: 'html' }));
      process.exit(0);
    }
    if (!s) { console.error('No html AI pass planned. Run `html-pass.js plan` first.'); process.exit(1); }
    if (cmd === 'next') {
      const b = allBatches(s).find((x) => x.status !== 'done');
      if (!b) { console.log('ALL DONE'); process.exit(10); }
      s.stop = null; save(root, s);
      const ds = [...new Set(Object.values(b.perFile).flat())].sort();
      const st = templateStages();
      console.log(JSON.stringify({
        domain: 'html', batch: b.id, stage: 1, stageName: s.stages[0].name, files: b.files, perFile: b.perFile,
        rules: Object.fromEntries(ds.map((d) => [d, st[d].rules])), retry: b.lastError || null,
        rulesFiles: ds.map((d) => path.join(project.PLUGIN_ROOT, domains.get(d).rulesFile)), profile: project.paths(root).profile,
        out: path.join(aiDir(root), `${b.id}.jsonl`), done: path.join(aiDir(root), `${b.id}.done.json`),
      }, null, 2));
      process.exit(0);
    }
    if (cmd === 'record' || cmd === 'stop' || cmd === 'skip') {
      const b = allBatches(s).find((x) => x.id === id);
      if (!b) { console.error(`Unknown batch "${id}".`); process.exit(1); }
      if (cmd === 'stop') {
        b.status = 'stopped'; s.stop = { batch: id, reason: args.reason || 'stopped', at: new Date().toISOString() };
        if (+args.tokens) { s.used += +args.tokens; b.tokens += +args.tokens; }
        s.agents++; b.runs = (b.runs || 0) + 1; save(root, s);
        console.log(`STOPPED at html batch ${id}: ${s.stop.reason}. Progress saved — the same command (/ui-guard:scan html) continues from this batch.`);
        process.exit(0);
      }
      if (cmd === 'skip') { b.status = 'done'; b.skipped = args.reason || 'skipped'; save(root, s); console.log(`batch ${id} skipped — its ${b.files.length} file(s) stay not scanned for their AI domains.`); process.exit(0); }
      const tokens = +args.tokens > 0 ? +args.tokens : b.estTokens;
      s.used += tokens; b.tokens += tokens; s.agents++; b.runs = (b.runs || 0) + 1;
      const v = validate(root, b);
      if (v.error) {
        b.lastError = v.error; save(root, s);
        console.log(`INVALID: batch ${id}: ${v.error}. Nothing from this run was saved. ${(b.runs || 0) < 2 ? 'Run this batch once more with this error in the prompt.' : `Second invalid result — skip it: html-pass.js skip ${id} --reason "invalid agent output twice"`}`);
        process.exit(2);
      }
      const all = path.join(aiDir(root), 'findings.jsonl');
      u.writeJSONL(all, u.readJSONL(all).filter((f) => f.batch !== id).concat(v.findings.map((f) => ({ ...f, batch: id }))));
      b.status = 'done'; b.findings = v.findings.length; delete b.lastError; save(root, s);
      const by = {}; for (const f of v.findings) by[f.domain] = (by[f.domain] || 0) + 1;
      console.log(`batch ${id} saved: ${v.findings.length} finding(s)${v.findings.length ? ' (' + Object.entries(by).map(([d, n]) => `${d} ${n}`).join(', ') + ')' : ''}`);
      process.exit(0);
    }
    if (cmd === 'status') {
      const all = allBatches(s);
      console.log(`html pass: ${all.filter((b) => b.status === 'done').length}/${all.length} batch(es) · ${s.agents} agent run(s) · ${s.used} tokens logged${s.stop ? ` · STOPPED at ${s.stop.batch}: ${s.stop.reason}` : ''}`);
      process.exit(0);
    }
    console.log(HELP);
  } catch (e) { console.error(e.message); process.exit(1); }
  void fs;
}
