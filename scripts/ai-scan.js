#!/usr/bin/env node
'use strict';
// AI part of `/ui-guard:scan <domain>` — ONE agent at a time, fixed order, no questions, no estimate.
// The scripts (Stylelint, ESLint, ui-guard scripts) run first. The agent only gets the files where a script signal says
// "this needs judgment" (a rule only the AI can decide, or an `unverified` script finding), and only its own domain's rules.
// Token use is logged silently (report footer); there is no cap and no prompt.
// Progress lives in .ui-guard/tmp/<domain>/scan/ai/state.json: the same command continues from the exact batch after a usage limit.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const domains = require('./lib/domains');
const inventory = require('./inventory');
const route = require('./route-files');
const merge = require('./merge-findings');

const HELP = `ai-scan.js — one-agent-at-a-time AI pass of one domain (no estimate, no cap, no questions).
Usage (all need --domain scss|access|lang|safe and accept --root <dir>):
  node ai-scan.js plan [--rebuild]   pick the files that need judgment and make the batches (silent; reuses a saved plan)
  node ai-scan.js next               print the next batch as JSON (exit 0) · exit 10 = all done
  node ai-scan.js record <batch> [--tokens <n>]
        validate the agent's output (<batch>.jsonl + .done.json) and save it. exit 2 = invalid output → run the batch once
        more with the error; if it is still invalid: skip <batch> (its files are listed as NOT checked by AI)
  node ai-scan.js skip <batch> --reason "<text>"   list the batch's files as NOT checked by AI and go on
  node ai-scan.js stop <batch> --reason "<text>"   a usage limit / agent error: progress kept, the same command resumes here
  node ai-scan.js status             where the pass is, agent runs, tokens logged`;

const STAGES = {
  scss: [
    { id: 1, name: 'SCSS/CSS — STYLE', kinds: ['scss', 'css'], groups: ['style-ai'],
      rules: ['STYLE-09', 'STYLE-17', 'STYLE-18', 'STYLE-19', 'STYLE-20', 'STYLE-25', 'STYLE-28', 'STYLE-37', 'STYLE-38', 'STYLE-39', 'STYLE-43'] },
    { id: 2, name: 'Templates + Angular TS — STYLE classes', kinds: ['html', 'index', 'ts'], groups: ['style-ai'],
      rules: ['STYLE-02', 'STYLE-03', 'STYLE-37', 'STYLE-39', 'STYLE-43'] },
  ],
  access: [
    { id: 1, name: 'Templates + CVA TS — ACCESS', kinds: ['html', 'index', 'ts'], groups: ['access-labels', 'access-alt', 'access-aria', 'access-semantics', 'access-keyboard', 'access-motion'],
      // the AI rules of the domain: ACCESS-01..05 (ESLint + ai) and the ai part of ACCESS-08..20 (see rules.json: checker contains ai)
      rules: ['ACCESS-00', 'ACCESS-01', 'ACCESS-02', 'ACCESS-03', 'ACCESS-04', 'ACCESS-05', 'ACCESS-08', 'ACCESS-09', 'ACCESS-12', 'ACCESS-14', 'ACCESS-15', 'ACCESS-16', 'ACCESS-17', 'ACCESS-18', 'ACCESS-19', 'ACCESS-20'] },
  ],
  lang: [
    { id: 1, name: 'Templates + TS + translations — LANG', kinds: ['html', 'index', 'ts', 'translation'], groups: ['lang'],
      rules: ['LANG-01', 'LANG-02', 'LANG-03', 'LANG-07', 'LANG-08'] },
  ],
  safe: [
    { id: 1, name: 'Templates + TS + config — SAFE', kinds: ['html', 'index', 'ts', 'config'], groups: ['safe'],
      rules: ['SAFE-01', 'SAFE-02', 'SAFE-03', 'SAFE-04', 'SAFE-05', 'SAFE-08'] },
  ],
};
const BATCH_FILES = 12, BATCH_BYTES = 80 * 1024;
const OVERHEAD = 6000; // per batch, for the silent log only

const dir = (root, d) => path.join(domains.paths(root, d).scan, 'ai');
const stateFile = (root, d) => path.join(dir(root, d), 'state.json');
const load = (root, d) => u.readJSON(stateFile(root, d), null);
const save = (root, d, s) => u.writeJSON(stateFile(root, d), s);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));

/** Files that need judgment: a domain signal (script grep) or an `unverified` script finding. */
function plan(root, dom) {
  const inv = inventory.load(root) || inventory.build(root);
  const det = u.readJSONL(path.join(domains.paths(root, dom.name).scan, 'deterministic.jsonl'));
  const unverified = new Set(det.filter((f) => /unverified/.test(f.message || '')).map((f) => f.file));
  const unparsed = new Set(det.filter((f) => /unverified: could not parse/.test(f.message || '')).map((f) => f.file));
  const rulesFile = path.join(project.PLUGIN_ROOT, dom.rulesFile);
  const rulesTokens = Math.ceil((u.readText(rulesFile) || '').length / 4);
  // ledger: a file still valid for this domain (its fingerprint did not change since it was judged — by this domain's scan or by
  // `/ui-guard:scan html`) is never sent to an agent again
  const lp = require('./ledger').loadPlan(root, dom.name);
  const known = lp && !lp.rescan ? new Set(lp.aiReuse || []) : new Set(); // same file AND same domain rules since it was judged
  const stages = [];
  for (const sg of STAGES[dom.name]) {
    const files = inv.files.filter((f) => sg.kinds.includes(f.kind) && !known.has(f.path)).filter((f) => unverified.has(f.path) || route.groupsFor(root, f, unparsed).some((g) => sg.groups.includes(g)));
    const batches = [];
    let cur = [], bytes = 0;
    const flush = () => {
      if (!cur.length) return;
      const chars = cur.reduce((n, f) => n + f.sizeBytes, 0);
      batches.push({ id: `${dom.name}-${sg.id}-${String(batches.length + 1).padStart(3, '0')}`, files: cur.map((f) => f.path), estTokens: Math.ceil(chars / 4) + rulesTokens + OVERHEAD, status: 'pending', tokens: 0, findings: 0 });
      cur = []; bytes = 0;
    };
    for (const f of files) { if (cur.length && (cur.length >= BATCH_FILES || bytes + f.sizeBytes > BATCH_BYTES)) flush(); cur.push(f); bytes += f.sizeBytes; }
    flush();
    stages.push({ id: sg.id, name: sg.name, rules: sg.rules, files: files.length, batches });
  }
  return { domain: dom.name, created: new Date().toISOString(), used: 0, agents: 0, stop: null, stages };
}

function nextBatch(s) {
  for (const sg of s.stages) for (const b of sg.batches) if (b.status !== 'done') return { sg, b };
  return null;
}

function validate(root, dom, sg, b) {
  const out = path.join(dir(root, dom.name), `${b.id}.jsonl`), done = path.join(dir(root, dom.name), `${b.id}.done.json`);
  if (!u.exists(out)) return { error: `the agent wrote no result file (${u.relPosix(root, out)})` };
  const d = u.readJSON(done, null);
  if (!d || !Array.isArray(d.files)) return { error: `the agent's .done.json is missing or unreadable (${u.relPosix(root, done)})` };
  const missing = b.files.filter((f) => !d.files.includes(f));
  if (missing.length) return { error: `the agent did not check ${missing.length} file(s) of the batch: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` };
  const rows = u.readJSONL(out);
  const bad = rows.filter((r) => r.__malformed);
  if (bad.length) return { error: `${bad.length} unreadable line(s) in the result, e.g. ${u.clip(bad[0].__malformed, 80)}` };
  const allowed = new Set(sg.rules), inBatch = new Set(b.files);
  const findings = [];
  for (const r of rows) {
    if (!r.ruleId || !r.file || !(parseInt(r.line, 10) >= 1)) return { error: `invalid finding (needs ruleId, file, line ≥ 1): ${u.clip(JSON.stringify(r), 100)}` };
    const rule = String(r.ruleId).toUpperCase();
    if (!allowed.has(rule)) return { error: `the agent reported ${rule}, which is not an AI rule of this ${dom.name} stage — it belongs to the scripts/lint or another domain — at ${r.file}:${r.line}` };
    if (!inBatch.has(String(r.file).split('\\').join('/'))) return { error: `the agent reported a file outside its batch: ${r.file}` };
    const n = merge.normalize(root, { ...r, checker: 'ai', sources: ['ai'] }, 'ai');
    if (n.line > (u.readText(u.fromPosix(root, n.file)) || '').split('\n').length) return { error: `line ${n.line} does not exist in ${n.file}` };
    findings.push(n);
  }
  return { findings };
}

const findBatch = (s, id) => { const sg = s.stages.find((x) => x.batches.some((b) => b.id === id)); return { sg, b: sg && sg.batches.find((x) => x.id === id) }; };

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['rebuild']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const dom = domains.fromArgs(args);
  const [cmd, id] = args._;
  if (cmd === 'plan') {
    let s = load(root, dom.name);
    if (!s || args.rebuild) { s = plan(root, dom); save(root, dom.name, s); }
    const all = s.stages.flatMap((sg) => sg.batches);
    const left = all.filter((b) => b.status !== 'done');
    console.log(`${dom.name} AI pass: ${s.stages.map((sg) => `stage ${sg.id} · ${sg.name}: ${sg.files} file(s) need judgment, ${sg.batches.length} batch(es)`).join(' | ') || 'nothing'}${all.length !== left.length ? ` · ${all.length - left.length} batch(es) already done` : ''}`);
    process.exit(0);
  }
  const s = load(root, dom.name);
  if (!s) { console.error(`No AI pass planned for ${dom.name}. Run \`ai-scan.js plan --domain ${dom.name}\` first.`); process.exit(1); }
  if (cmd === 'next') {
    const nb = nextBatch(s);
    if (!nb) { console.log('ALL DONE'); process.exit(10); }
    s.stop = null; save(root, dom.name, s);
    const d = dir(root, dom.name);
    console.log(JSON.stringify({
      domain: dom.name, batch: nb.b.id, stage: nb.sg.id, stageName: nb.sg.name, rules: nb.sg.rules, files: nb.b.files, retry: nb.b.lastError || null,
      rulesFiles: [path.join(project.PLUGIN_ROOT, dom.rulesFile)], profile: project.paths(root).profile,
      out: path.join(d, `${nb.b.id}.jsonl`), done: path.join(d, `${nb.b.id}.done.json`),
    }, null, 2));
    process.exit(0);
  }
  if (cmd === 'record' || cmd === 'stop' || cmd === 'skip') {
    const { sg, b } = findBatch(s, id);
    if (!b) { console.error(`Unknown batch "${id}".`); process.exit(1); }
    if (cmd === 'stop') {
      b.status = 'stopped'; s.stop = { batch: id, reason: args.reason || 'stopped', at: new Date().toISOString() };
      if (+args.tokens) { s.used += +args.tokens; b.tokens += +args.tokens; b.measuredTokens = (b.measuredTokens || 0) + +args.tokens; }
      s.agents++; b.runs = (b.runs || 0) + 1;
      save(root, dom.name, s);
      console.log(`STOPPED at ${dom.name} batch ${id}: ${s.stop.reason}. Progress saved — the same command (/ui-guard:scan ${dom.name}) continues from this batch.`);
      process.exit(0);
    }
    if (cmd === 'skip') {
      b.status = 'done'; b.skipped = args.reason || 'skipped'; save(root, dom.name, s);
      console.log(`batch ${id} skipped — its ${b.files.length} file(s) are listed as NOT checked by AI in the report (${b.skipped}).`);
      process.exit(0);
    }
    const measured = +args.tokens > 0;
    const tokens = measured ? +args.tokens : b.estTokens;
    s.used += tokens; b.tokens += tokens; s.agents++; b.runs = (b.runs || 0) + 1;
    if (measured) b.measuredTokens = (b.measuredTokens || 0) + tokens; else b.estimatedTokens = (b.estimatedTokens || 0) + tokens;
    const v = validate(root, dom, sg, b);
    if (v.error) {
      b.lastError = v.error;
      const again = (b.runs || 0) < 2;
      save(root, dom.name, s);
      console.log(`INVALID: batch ${id}: ${v.error}. Nothing from this run was saved. ${again ? 'Run this batch once more with this error in the prompt.' : `Second invalid result — skip it: ai-scan.js skip ${id} --domain ${dom.name} --reason "invalid agent output twice"`}`);
      process.exit(2);
    }
    const all = path.join(dir(root, dom.name), 'findings.jsonl');
    const prev = u.readJSONL(all).filter((f) => f.batch !== id);
    u.writeJSONL(all, prev.concat(v.findings.map((f) => ({ ...f, batch: id }))));
    b.status = 'done'; b.findings = v.findings.length; delete b.lastError;
    save(root, dom.name, s);
    console.log(`batch ${id} saved: ${v.findings.length} finding(s)`);
    process.exit(0);
  }
  if (cmd === 'status') {
    for (const sg of s.stages) console.log(`${dom.name} stage ${sg.id} · ${sg.name}: ${sg.batches.filter((b) => b.status === 'done').length}/${sg.batches.length} batch(es)`);
    console.log(`${s.agents} agent run(s) · ${fmt(s.used)} tokens logged${s.stop ? ` · STOPPED at ${s.stop.batch}: ${s.stop.reason}` : ''}`);
    process.exit(0);
  }
  console.log(HELP);
}
module.exports = { STAGES, plan, load };
