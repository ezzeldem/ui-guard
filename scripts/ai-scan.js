#!/usr/bin/env node
'use strict';
// Opt-in AI part of /ui-guard:scan --ai. ONE pass, ONE agent at a time, fixed order, stop on any problem.
//   Stage 1: SCSS/CSS            → STYLE rules the free tools cannot check
//   Stage 2: templates + TS      → STYLE (class prefixes/state in templates), LANG, SAFE
//   Stage 3: templates           → ACCESS
// Progress lives in .ui-guard/tmp/scan/ai/state.json, so `/ui-guard:scan --resume` continues from the exact batch.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const inventory = require('./inventory');
const route = require('./route-files');
const merge = require('./merge-findings');

const HELP = `ai-scan.js — one-pass, one-agent-at-a-time AI scan with estimate and token cap.
Usage (all accept --root <dir>):
  node ai-scan.js estimate [--stages 1,2,3] [--max-tokens 1500000] [--window-tokens N] [--rebuild]
        plan the batches (or reuse the saved plan) and print the token estimate per stage and in total.
  node ai-scan.js next      print the next batch as JSON (exit 0) · exit 10 = all done · exit 3 = token cap reached
  node ai-scan.js record <batch> --tokens <n>
        validate the agent's output (.ui-guard/tmp/scan/ai/<batch>.jsonl + .done.json) and save it.
        exit 2 = STOP (invalid/unreadable output, file missing from the result, rule outside the batch) · exit 3 = cap reached after this batch
  node ai-scan.js stop <batch> --reason "<text>"   record an agent error / usage limit (progress kept for --resume)
  node ai-scan.js status    where the scan is, tokens used, what is left`;

const STAGES = [
  { id: 1, name: 'SCSS/CSS — STYLE', kinds: ['scss', 'css'], groups: ['style-ai'], rulesFiles: ['rules/style.md'],
    rules: ['STYLE-09', 'STYLE-17', 'STYLE-18', 'STYLE-19', 'STYLE-20', 'STYLE-25', 'STYLE-28', 'STYLE-37', 'STYLE-38', 'STYLE-39', 'STYLE-43'] },
  { id: 2, name: 'Templates + Angular TS — STYLE, LANG, SAFE', kinds: ['html', 'index', 'ts', 'config', 'translation'], groups: ['style-ai', 'lang', 'safe'], rulesFiles: ['rules/style.md', 'rules/lang.md', 'rules/safe.md'],
    rules: ['STYLE-02', 'STYLE-03', 'STYLE-37', 'STYLE-39', 'STYLE-43', 'LANG-01', 'LANG-02', 'LANG-03', 'LANG-07', 'LANG-08', 'SAFE-01', 'SAFE-02', 'SAFE-03', 'SAFE-04', 'SAFE-05', 'SAFE-08'] },
  { id: 3, name: 'Templates — ACCESS', kinds: ['html', 'index'], groups: ['access-labels', 'access-alt', 'access-aria', 'access-semantics', 'access-keyboard'], rulesFiles: ['rules/access.md'],
    rules: ['ACCESS-00', 'ACCESS-01', 'ACCESS-02', 'ACCESS-03', 'ACCESS-04', 'ACCESS-05'] },
];
const BATCH_FILES = 12, BATCH_BYTES = 80 * 1024;
const OVERHEAD = 6000; // agent system prompt + task prompt + output, per batch (tokens)

const dir = (root) => path.join(project.paths(root).scan, 'ai');
const stateFile = (root) => path.join(dir(root), 'state.json');
const load = (root) => u.readJSON(stateFile(root), null);
const save = (root, s) => u.writeJSON(stateFile(root), s);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));

function plan(root, stageIds, cap, windowTokens) {
  const inv = inventory.load(root);
  if (!inv) throw new Error('No inventory — run the free scan first (inventory.js build + run-checks.js).');
  const det = u.readJSONL(path.join(project.paths(root).scan, 'deterministic.jsonl'));
  const unparsed = new Set(det.filter((f) => /unverified: could not parse/.test(f.message || '')).map((f) => f.file));
  const profileTokens = Math.ceil((u.readText(project.paths(root).profile) || '').length / 4);
  const stages = [];
  for (const st of STAGES.filter((s) => stageIds.includes(s.id))) {
    const rulesTokens = st.rulesFiles.reduce((n, f) => n + Math.ceil((u.readText(path.join(project.PLUGIN_ROOT, f)) || '').length / 4), 0);
    const files = inv.files.filter((f) => st.kinds.includes(f.kind)).filter((f) => {
      const g = route.groupsFor(root, f, unparsed);
      return g.some((x) => st.groups.includes(x));
    });
    const batches = [];
    let cur = [], bytes = 0;
    const flush = () => {
      if (!cur.length) return;
      const chars = cur.reduce((n, f) => n + f.sizeBytes, 0);
      batches.push({ id: `${st.id}-${String(batches.length + 1).padStart(3, '0')}`, files: cur.map((f) => f.path), estTokens: Math.ceil(chars / 4) + rulesTokens + profileTokens + OVERHEAD, status: 'pending', tokens: 0, findings: 0 });
      cur = []; bytes = 0;
    };
    for (const f of files) { if (cur.length && (cur.length >= BATCH_FILES || bytes + f.sizeBytes > BATCH_BYTES)) flush(); cur.push(f); bytes += f.sizeBytes; }
    flush();
    stages.push({ id: st.id, name: st.name, rules: st.rules, rulesFiles: st.rulesFiles, files: files.length, estTokens: batches.reduce((n, b) => n + b.estTokens, 0), batches });
  }
  const s = { created: new Date().toISOString(), cap, windowTokens: windowTokens || null, used: 0, agents: 0, stop: null, stages };
  const planned = stages.flatMap((st) => st.batches.flatMap((b) => b.files));
  if (planned.length) inventory.mark(root, 'ai', 'pending', [...new Set(planned)]);
  return s;
}

function printEstimate(s) {
  const total = s.stages.reduce((n, st) => n + st.estTokens, 0);
  console.log('AI scan estimate (before any AI work — one agent at a time, Sonnet):');
  // The estimate counts input (files + rules + profile + overhead) but not the agent's output or its re-reads,
  // so real usage is higher: show a realistic range.
  const up = (n) => fmt(Math.round(n * 1.5));
  for (const st of s.stages) console.log(`  Stage ${st.id} · ${st.name}: ${st.files} file(s), ${st.batches.length} batch(es), about ${fmt(st.estTokens)} tokens (up to ${up(st.estTokens)} in practice)`);
  console.log(`  Total: about ${fmt(total)} tokens (up to ${up(total)} in practice) for ${s.stages.reduce((n, st) => n + st.batches.length, 0)} agent run(s). Cap: ${fmt(s.cap)} tokens.`);
  if (s.windowTokens) console.log(`  That is about ${Math.round((100 * total) / s.windowTokens)}% of a Pro 5-hour window, up to ${Math.round((150 * total) / s.windowTokens)}% in practice (${fmt(s.windowTokens)} tokens, as set in the profile/flag).`);
  else console.log('  Share of a Pro 5-hour window: not known (Anthropic does not publish a token number; set --window-tokens N to see a %).');
  if (total > s.cap) console.log(`  The estimate is above the cap: the scan will stop at the cap and can be resumed later with --resume.`);
  return total;
}

function nextBatch(s) {
  for (const st of s.stages) for (const b of st.batches) if (b.status !== 'done') return { st, b };
  return null;
}

function validate(root, s, st, b) {
  const out = path.join(dir(root), `${b.id}.jsonl`), done = path.join(dir(root), `${b.id}.done.json`);
  if (!u.exists(out)) return { error: `the agent wrote no result file (${u.relPosix(root, out)})` };
  const d = u.readJSON(done, null);
  if (!d || !Array.isArray(d.files)) return { error: `the agent's .done.json is missing or unreadable (${u.relPosix(root, done)})` };
  const missing = b.files.filter((f) => !d.files.includes(f));
  if (missing.length) return { error: `the agent did not check ${missing.length} file(s) of the batch: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` };
  const rows = u.readJSONL(out);
  const bad = rows.filter((r) => r.__malformed);
  if (bad.length) return { error: `${bad.length} unreadable line(s) in the result, e.g. ${u.clip(bad[0].__malformed, 80)}` };
  const allowed = new Set(st.rules), inBatch = new Set(b.files);
  const findings = [];
  for (const r of rows) {
    if (!r.ruleId || !r.file || !(parseInt(r.line, 10) >= 1)) return { error: `invalid finding (needs ruleId, file, line ≥ 1): ${u.clip(JSON.stringify(r), 100)}` };
    const rule = String(r.ruleId).toUpperCase();
    if (!allowed.has(rule)) return { error: `the agent reported ${rule}, which is not an AI rule of stage ${st.id} — it contradicts the free checks' ownership (e.g. a lint/script rule) — at ${r.file}:${r.line}` };
    if (!inBatch.has(String(r.file).split('\\').join('/'))) return { error: `the agent reported a file outside its batch: ${r.file}` };
    const n = merge.normalize(root, { ...r, checker: 'ai', sources: ['ai'] }, 'ai');
    if (n.line > (u.readText(u.fromPosix(root, n.file)) || '').split('\n').length) return { error: `line ${n.line} does not exist in ${n.file}` };
    findings.push(n);
  }
  return { findings };
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['rebuild']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const [cmd, id] = args._;
  if (cmd === 'estimate') {
    let s = load(root);
    const prof = project.readProfile(root);
    const cap = +args['max-tokens'] || (s && s.cap) || 1500000;
    const windowTokens = +args['window-tokens'] || (prof.aiBudget && prof.aiBudget.windowTokens) || (s && s.windowTokens) || null;
    if (!s || args.rebuild) { s = plan(root, String(args.stages || '1,2,3').split(',').map(Number), cap, windowTokens); save(root, s); }
    else { s.cap = cap; s.windowTokens = windowTokens; save(root, s); console.log('(reusing the saved plan — progress kept; use --rebuild to start over)'); }
    printEstimate(s);
    const left = s.stages.flatMap((st) => st.batches).filter((b) => b.status !== 'done');
    console.log(`  Progress: ${s.stages.flatMap((st) => st.batches).length - left.length} batch(es) done, ${left.length} left, ${fmt(s.used)} tokens used so far.`);
    process.exit(0);
  }
  const s = load(root);
  if (!s) { console.error('No AI scan planned. Run `ai-scan.js estimate` first.'); process.exit(1); }
  if (cmd === 'next') {
    const nb = nextBatch(s);
    if (!nb) { console.log('ALL DONE'); process.exit(10); }
    if (s.used + nb.b.estTokens > s.cap) {
      s.stop = { batch: nb.b.id, reason: `token cap reached (${fmt(s.used)} used, next batch ~${fmt(nb.b.estTokens)}, cap ${fmt(s.cap)})`, at: new Date().toISOString() };
      save(root, s);
      console.log(`CAP: ${s.stop.reason}. Stopped before stage ${nb.st.id}, batch ${nb.b.id}. Resume with /ui-guard:scan --ai --resume (raise --max-tokens if you want).`);
      process.exit(3);
    }
    s.stop = null; save(root, s);
    const d = dir(root);
    console.log(JSON.stringify({
      batch: nb.b.id, stage: nb.st.id, stageName: nb.st.name, rules: nb.st.rules, files: nb.b.files, estTokens: nb.b.estTokens,
      rulesFiles: nb.st.rulesFiles.map((f) => path.join(project.PLUGIN_ROOT, f)), profile: project.paths(root).profile,
      out: path.join(d, `${nb.b.id}.jsonl`), done: path.join(d, `${nb.b.id}.done.json`),
    }, null, 2));
    process.exit(0);
  }
  if (cmd === 'record' || cmd === 'stop') {
    const st = s.stages.find((x) => x.batches.some((b) => b.id === id));
    const b = st && st.batches.find((x) => x.id === id);
    if (!b) { console.error(`Unknown batch "${id}".`); process.exit(1); }
    if (cmd === 'stop') {
      b.status = 'stopped'; s.stop = { batch: id, reason: args.reason || 'stopped', at: new Date().toISOString() };
      if (+args.tokens) { s.used += +args.tokens; b.tokens += +args.tokens; b.measuredTokens = (b.measuredTokens || 0) + +args.tokens; }
      s.agents++; b.runs = (b.runs || 0) + 1;
      save(root, s);
      console.log(`STOPPED at stage ${st.id}, batch ${id}: ${s.stop.reason}. Progress saved — resume with /ui-guard:scan --ai --resume.`);
      process.exit(0);
    }
    // The cap must never stay at 0 usage: when the agent's measured tokens are not passed (or are 0), count the batch's estimate.
    const measured = +args.tokens > 0;
    const tokens = measured ? +args.tokens : b.estTokens;
    s.used += tokens; b.tokens += tokens; s.agents++; b.runs = (b.runs || 0) + 1;
    if (measured) b.measuredTokens = (b.measuredTokens || 0) + tokens; else b.estimatedTokens = (b.estimatedTokens || 0) + tokens;
    const basis = measured ? 'measured' : 'estimated — no measured tokens were passed';
    const v = validate(root, s, st, b);
    if (v.error) {
      b.status = 'stopped'; s.stop = { batch: id, reason: v.error, at: new Date().toISOString() };
      save(root, s);
      console.log(`(${fmt(tokens)} tokens counted for this run, ${basis})`);
      console.log(`STOP: batch ${id} (stage ${st.id}): ${v.error}. Nothing from this batch was saved. Ask the developer what to do (retry this batch / skip it and list it as NOT scanned / stop).`);
      process.exit(2);
    }
    const all = path.join(dir(root), 'findings.jsonl');
    const prev = u.readJSONL(all).filter((f) => f.batch !== id);
    u.writeJSONL(all, prev.concat(v.findings.map((f) => ({ ...f, batch: id }))));
    b.status = 'done'; b.findings = v.findings.length;
    save(root, s);
    inventory.mark(root, 'ai', 'done', b.files);
    console.log(`batch ${id} saved: ${v.findings.length} finding(s), ${fmt(tokens)} tokens (${basis}) · total used ${fmt(s.used)} of cap ${fmt(s.cap)}`);
    if (s.used >= s.cap) { s.stop = { batch: id, reason: `token cap reached (${fmt(s.used)} of ${fmt(s.cap)})`, at: new Date().toISOString() }; save(root, s); console.log(`CAP: ${s.stop.reason}. Resume with --resume.`); process.exit(3); }
    process.exit(0);
  }
  if (cmd === 'skip') {
    // explicit developer decision only: list the batch's files as NOT scanned by AI
    const st = s.stages.find((x) => x.batches.some((b) => b.id === id));
    const b = st && st.batches.find((x) => x.id === id);
    if (!b) { console.error(`Unknown batch "${id}".`); process.exit(1); }
    b.status = 'done'; b.skipped = args.reason || 'skipped by the developer'; save(root, s);
    inventory.mark(root, 'ai', 'n/a', b.files);
    console.log(`batch ${id} skipped by decision — its ${b.files.length} file(s) are listed as NOT scanned by AI in the report.`);
    process.exit(0);
  }
  if (cmd === 'status') {
    for (const st of s.stages) {
      const done = st.batches.filter((b) => b.status === 'done').length;
      console.log(`Stage ${st.id} · ${st.name}: ${done}/${st.batches.length} batch(es), ${fmt(st.batches.reduce((n, b) => n + b.tokens, 0))} tokens`);
    }
    console.log(`Used ${fmt(s.used)} of cap ${fmt(s.cap)} · ${s.agents} agent run(s)${s.stop ? ` · STOPPED at ${s.stop.batch}: ${s.stop.reason}` : ''}`);
    process.exit(0);
  }
  console.log(HELP);
}
module.exports = { STAGES, plan, load };
void fs;
