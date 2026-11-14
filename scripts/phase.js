#!/usr/bin/env node
'use strict';
// §8.1 helper for /ui-guard:fix — read the plan, guard the file set, verify, record success/failure. Never touches git state.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const fpLib = require('./lib/fingerprint');
const runChecks = require('./run-checks');
const merge = require('./merge-findings');

const HELP = `phase.js — /ui-guard:fix helper (read-only git).
Usage (all accept --root <dir>):
  node phase.js list                       phase ids, titles, status, file counts
  node phase.js render                     re-render plan.md from plan.json
  node phase.js show <id>                  phase + its findings → .ui-guard/tmp/fix/phase-<id>.json
                                           exit 1 unknown id (lists valid ids) · 3 already done · 4 earlier phases not done
  node phase.js gitcheck                   exit 0 if git works; exit 5 + a plain warning when the project is not a git repo (no way to undo)
  node phase.js backup [--made-by-me]      copy the project to <project>-backup-<date> (no node_modules/dist/.angular) — only after the developer chose it
  node phase.js dirty <id>                 phase files that already have uncommitted changes (exit 1 if any; skipped without git)
  node phase.js snapshot <id>              remember changed files before the fixer runs
  node phase.js outside <id>               files changed by the fix OUTSIDE the phase (exit 1 if any)
  node phase.js diff <id>                  git diff -- <phase files> → .ui-guard/tmp/fix/phase-<id>.diff
  node phase.js verify <id>                lint + scripts on phase files: phase findings still present + new errors (exit 1 on problems)
  node phase.js complete <id> --verdict "<text>" [--retries n]
                                           status done, findings → fixed, fingerprints removed from baseline, writes .ui-guard/fixes/phase-<id>.md
  node phase.js fail <id> --reason "<text>" [--retries n]
                                           status failed, writes the failure log (changes stay in the working tree)`;

// The plan's machine part is .ui-guard/plan.json (written by plan.js); plan.md is re-rendered from it.
function readPlan(root) {
  const data = u.readJSON(path.join(project.paths(root).ug, 'plan.json'), null);
  return data && Array.isArray(data.phases) ? { data } : null;
}

function writePlan(root, plan) {
  u.writeJSON(path.join(project.paths(root).ug, 'plan.json'), plan.data);
  require('./plan').renderOnly(root);
}

const cmpId = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };

function getPhase(root, id) {
  const plan = readPlan(root);
  if (!plan) { console.error('No .ui-guard/plan.json. Run /ui-guard:scan (or --plan-only) first.'); process.exit(1); }
  const ph = plan.data.phases.find((p) => String(p.id) === String(id));
  return { plan, ph };
}

function fixDir(root) { return path.join(project.paths(root).tmp, 'fix'); }
function workingChanged(root) { return [...new Set([...(git.git(root, ['diff', '--name-only', 'HEAD']) || '').split(/\r?\n/), ...(git.git(root, ['ls-files', '--others', '--exclude-standard']) || '').split(/\r?\n/)].map((s) => s.trim()).filter(Boolean))].sort(); }

// ---------- projects that are not a git repo ----------
const hasGit = (root) => git.isRepo(root);
const NO_GIT_WARNING = 'WARNING: this project is not a git repository, so there is NO way to undo a fix (no `git restore`, no diff against a commit). Make a backup before the fix runs.';
const backupFile = (root) => path.join(project.paths(root).tmp, 'backup.json');
const backupInfo = (root) => u.readJSON(backupFile(root), null);

/** Copy the project to <project>-backup-<date> without node_modules, dist, .angular, .git. Only after the developer chose it. */
function makeBackup(root) {
  const fs = require('fs');
  const date = new Date().toISOString().slice(0, 10);
  let dest = `${root}-backup-${date}`;
  for (let i = 2; fs.existsSync(dest); i++) dest = `${root}-backup-${date}-${i}`;
  const skip = new Set(['node_modules', 'dist', '.angular', '.git']);
  fs.cpSync(root, dest, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !(src.includes(path.join('.ui-guard', 'tmp'))) });
  u.writeJSON(backupFile(root), { path: dest, by: 'ui-guard', date });
  return dest;
}

/** sha1 of every file under src/ (the non-git replacement for `git diff --name-only`). */
function hashSrc(root) {
  const out = {};
  for (const f of u.walk(path.join(root, 'src'), (name) => name === 'node_modules')) out[u.relPosix(root, f)] = u.sha1(require('fs').readFileSync(f));
  return out;
}
const changedSince = (root, before) => { const now = hashSrc(root); return Object.keys(now).filter((f) => before[f] !== now[f]).concat(Object.keys(before).filter((f) => !(f in now))).sort(); };

/** Minimal unified-style diff (no context) for the non-git case: common prefix/suffix trimmed, LCS in the middle. */
function udiff(name, a, b) {
  const A = a.split('\n'), B = b.split('\n');
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const X = A.slice(s, ea), Y = B.slice(s, eb);
  const out = [`--- a/${name}`, `+++ b/${name}`];
  if (X.length * Y.length > 4e6) { out.push(`@@ -${s + 1},${X.length} +${s + 1},${Y.length} @@`, ...X.map((l) => '-' + l), ...Y.map((l) => '+' + l)); return out.join('\n') + '\n'; }
  const L = Array.from({ length: X.length + 1 }, () => new Uint32Array(Y.length + 1));
  for (let i = X.length - 1; i >= 0; i--) for (let j = Y.length - 1; j >= 0; j--) L[i][j] = X[i] === Y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, hunk = null;
  const flush = () => { if (hunk) { out.push(`@@ -${hunk.a},${hunk.da} +${hunk.b},${hunk.db} @@`, ...hunk.lines); hunk = null; } };
  while (i < X.length || j < Y.length) {
    if (i < X.length && j < Y.length && X[i] === Y[j]) { flush(); i++; j++; continue; }
    if (!hunk) hunk = { a: s + i + 1, b: s + j + 1, da: 0, db: 0, lines: [] };
    if (j < Y.length && (i >= X.length || L[i][j + 1] >= L[i + 1][j])) { hunk.lines.push('+' + Y[j]); hunk.db++; j++; } else { hunk.lines.push('-' + X[i]); hunk.da++; i++; }
  }
  flush();
  return out.join('\n') + '\n';
}

function undoHint(root, ph) {
  if (hasGit(root)) return `To discard them yourself: \`git restore -- ${(ph.files || []).join(' ')}\``;
  const b = backupInfo(root);
  return `This project has no git. To undo, copy the files back from your backup: ${b ? b.path : 'the backup you made yourself'}`;
}

function writeLog(root, ph, { ok, verdict, reason, retries }) {
  const base = path.join(project.paths(root).tmp, 'screens', `phase-${ph.id}`);
  const pix = u.readJSON(path.join(base, 'diff', 'results.json'), null);
  const overflow = u.readJSON(path.join(base, 'after', 'overflow.json'), u.readJSON(path.join(base, 'before', 'overflow.json'), null));
  const L = [`# Phase ${ph.id} — ${ph.title}`, '', `- Result: **${ok ? 'done' : 'failed'}**`, `- Date: ${new Date().toISOString()}`, `- Retries used: ${retries || 0} of 3`, `- Review verdict: ${verdict || '—'}`];
  if (!ok) L.push(`- Failure: ${reason}`, `- The changes are still in your working tree. ${undoHint(root, ph)}`);
  L.push('', '## Files changed', '', ...(ph.files || []).map((f) => `- \`${f}\``), '', '## Findings fixed', '', ...(ok ? (ph.findings || []).map((x) => `- ${x}`) : ['(none recorded — phase failed)']));
  L.push('', '## Pixel diff (threshold 0, includeAA)', '');
  if (pix) { L.push('| Shot | Differing pixels | Diff image |', '|---|---|---|', ...pix.map((r) => `| ${r.shot} | ${r.error || (r.sizeChanged ? `size ${r.a} → ${r.b}` : r.diffPixels)} | ${r.diff ? '`' + r.diff + '`' : '—'} |`)); }
  else L.push('Not run (Playwright/pixelmatch not available) — the developer confirmed the pages by eye: ' + (ph.eyeConfirmed ? 'yes' : 'NOT YET'));
  L.push('', '## Overflow at 320px (STYLE-45, info)', '', overflow ? overflow.map((o) => `- ${o.route}: ${o.overflow ? `overflow (scrollWidth ${o.scrollWidth} > ${o.clientWidth})` : 'no overflow'}`).join('\n') : 'Not measured.', '');
  const out = path.join(project.paths(root).fixes, `phase-${ph.id}.md`);
  u.writeText(out, L.join('\n'));
  return out;
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const [cmd, id] = args._;
  if (cmd === 'gitcheck') {
    if (hasGit(root)) { console.log('git: ok'); process.exit(0); }
    console.log(NO_GIT_WARNING);
    const b = backupInfo(root);
    if (b) console.log(`A backup exists: ${b.path} (${b.by}, ${b.date}).`);
    process.exit(5);
  }
  if (cmd === 'backup') {
    // Only after the developer picked "copy" (or said they made a backup themselves with --made-by-me).
    if (args['made-by-me']) { u.writeJSON(backupFile(root), { path: null, by: 'developer', date: new Date().toISOString().slice(0, 10) }); console.log('Noted: you made a backup yourself.'); process.exit(0); }
    const dest = makeBackup(root);
    console.log(`backup written → ${dest} (without node_modules, dist, .angular)`);
    process.exit(0);
  }
  if (cmd === 'list' || cmd === 'render') {
    const plan = readPlan(root);
    if (!plan) { console.error('No plan.'); process.exit(1); }
    if (cmd === 'render') { writePlan(root, plan); console.log('plan.md re-rendered.'); }
    for (const ph of plan.data.phases) console.log(`${ph.id}\t${ph.status}\t${(ph.files || []).length} files\t${ph.title}`);
    process.exit(0);
  }
  const { plan, ph } = getPhase(root, id);
  if (!ph) { console.error(`Unknown phase "${id}". Valid ids: ${plan.data.phases.map((p) => p.id).join(', ')}`); process.exit(1); }
  if (cmd === 'show') {
    const findings = u.readJSON(project.paths(root).findings, []).filter((f) => (ph.findings || []).includes(f.id));
    u.writeJSON(path.join(fixDir(root), `phase-${ph.id}.json`), { phase: ph, findings });
    console.log(`phase ${ph.id} "${ph.title}" — status ${ph.status}, ${(ph.files || []).length} files, ${findings.length} findings, routes ${(ph.routes || []).join(', ') || '(none)'} → .ui-guard/tmp/fix/phase-${ph.id}.json`);
    if (!hasGit(root)) console.log(NO_GIT_WARNING);
    if (ph.status === 'done') { console.log('Already done.'); process.exit(3); }
    const earlier = plan.data.phases.filter((p) => cmpId(p.id, ph.id) < 0 && p.status !== 'done' && !String(ph.id).startsWith(String(p.id) + '.'));
    const deps = plan.data.phases.filter((p) => (ph.dependsOn || []).includes(p.id) && p.status !== 'done');
    const pending = [...new Set([...earlier, ...deps])];
    if (pending.length) { console.log(`Earlier phases not done: ${pending.map((p) => p.id).join(', ')} (order matters).`); process.exit(4); }
    process.exit(0);
  }
  if (cmd === 'dirty') {
    if (!hasGit(root)) { console.log('No git: the dirty-files check is skipped (there is no commit to compare with).'); process.exit(0); }
    const d = git.dirtyFiles(root, ph.files || []);
    console.log(d.length ? `Already changed: ${d.join(', ')}` : 'No phase file has uncommitted changes.');
    process.exit(d.length ? 1 : 0);
  }
  if (cmd === 'snapshot') {
    const snap = path.join(fixDir(root), `phase-${ph.id}-before.json`);
    if (hasGit(root)) u.writeJSON(snap, { changed: workingChanged(root) });
    else {
      // no git: remember a hash of every src file and a copy of the phase files (for `diff`)
      u.writeJSON(snap, { hashes: hashSrc(root) });
      for (const f of ph.files || []) { const src = u.fromPosix(root, f); if (u.exists(src)) { u.mkdirp(path.dirname(path.join(fixDir(root), `phase-${ph.id}-before`, ...f.split('/')))); require('fs').copyFileSync(src, path.join(fixDir(root), `phase-${ph.id}-before`, ...f.split('/'))); } }
    }
    console.log(hasGit(root) ? 'snapshot saved.' : 'snapshot saved (no git: file hashes + a copy of the phase files).');
    process.exit(0);
  }
  if (cmd === 'outside') {
    const snapData = u.readJSON(path.join(fixDir(root), `phase-${ph.id}-before.json`), { changed: [] });
    const before = new Set(snapData.changed || []);
    const allowed = new Set([...(ph.files || []), ...(ph.extraFiles || [])]);
    const changed = hasGit(root) ? workingChanged(root) : changedSince(root, snapData.hashes || {});
    const out = changed.filter((f) => !before.has(f) && !allowed.has(f) && !f.startsWith('.ui-guard/'));
    console.log(out.length ? `Edited outside the phase: ${out.join(', ')}` : 'No edits outside the phase.');
    process.exit(out.length ? 1 : 0);
  }
  if (cmd === 'diff') {
    const out = path.join(fixDir(root), `phase-${ph.id}.diff`);
    if (hasGit(root)) u.writeText(out, git.workingDiff(root, ph.files || []));
    else {
      const fs = require('fs');
      const parts = [];
      for (const f of ph.files || []) {
        const beforeFile = path.join(fixDir(root), `phase-${ph.id}-before`, ...f.split('/'));
        const nowFile = u.fromPosix(root, f);
        const a = u.exists(beforeFile) ? fs.readFileSync(beforeFile, 'utf8') : '', b = u.exists(nowFile) ? fs.readFileSync(nowFile, 'utf8') : '';
        if (a !== b) parts.push(udiff(f, a, b));
      }
      u.writeText(out, parts.join(''));
    }
    console.log(`diff → ${u.relPosix(root, out)}${hasGit(root) ? '' : ' (no git: built from the snapshot copies)'}`);
    process.exit(0);
  }
  if (cmd === 'verify') {
    fpLib.clearCache();
    const res = runChecks.runAll(root, { files: ph.files || [] });
    const now = res.findings.map((f) => merge.normalize(root, f)).filter(Boolean);
    const nowFp = new Set(now.map((f) => f.fingerprint));
    const phaseFindings = u.readJSON(project.paths(root).findings, []).filter((f) => (ph.findings || []).includes(f.id) && (f.sources || []).some((s) => s === 'lint' || s === 'script'));
    const notFixed = phaseFindings.filter((f) => nowFp.has(f.fingerprint));
    const baseline = fpLib.loadBaseline(root);
    const newErrors = now.filter((f) => f.severity === 'error' && !baseline.has(f.fingerprint));
    const report = { notFixed: notFixed.map((f) => `${f.id} ${f.ruleId} ${f.file}:${f.line}`), newErrors: newErrors.map((f) => `${f.ruleId} ${f.file}:${f.line} ${f.message}`), notes: res.notes };
    u.writeJSON(path.join(fixDir(root), `phase-${ph.id}-verify.json`), report);
    for (const n of res.notes) console.log('note: ' + n);
    console.log(`verify: ${notFixed.length} deterministic finding(s) not fixed, ${newErrors.length} new error(s)`);
    for (const x of report.notFixed) console.log('  not fixed: ' + x);
    for (const x of report.newErrors) console.log('  new error: ' + x);
    process.exit(notFixed.length || newErrors.length ? 1 : 0);
  }
  if (cmd === 'complete') {
    const p = project.paths(root);
    const findings = u.readJSON(p.findings, []);
    const fixedFps = [];
    for (const f of findings) if ((ph.findings || []).includes(f.id) && f.status === 'confirmed') { f.status = 'fixed'; fixedFps.push(f.fingerprint); }
    u.writeJSON(p.findings, findings);
    const left = fpLib.removeFromBaseline(root, fixedFps);
    ph.status = 'done'; ph.doneAt = new Date().toISOString();
    writePlan(root, plan);
    const log = writeLog(root, ph, { ok: true, verdict: args.verdict, retries: args.retries });
    console.log(`phase ${ph.id} done · ${fixedFps.length} finding(s) fixed · baseline now ${left} · log ${u.relPosix(root, log)}`);
    process.exit(0);
  }
  if (cmd === 'fail') {
    ph.status = 'failed'; ph.failedAt = new Date().toISOString();
    writePlan(root, plan);
    const log = writeLog(root, ph, { ok: false, reason: args.reason || 'see review', verdict: args.verdict, retries: args.retries });
    console.log(`phase ${ph.id} marked failed · changes left in the working tree · log ${u.relPosix(root, log)}`);
    process.exit(0);
  }
  console.log(HELP);
}
module.exports = { readPlan, writePlan, udiff };
