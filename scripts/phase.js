#!/usr/bin/env node
'use strict';
// /ui-guard:fix <domain> helper — read the domain's plan, guard the file set, verify, record success/failure, and write the
// one end-of-run summary. Never touches git state. Every command needs --domain scss|access|lang|safe.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const fpLib = require('./lib/fingerprint');
const domains = require('./lib/domains');
const runChecks = require('./run-checks');
const merge = require('./merge-findings');

const HELP = `phase.js — /ui-guard:fix helper (read-only git). Every command needs --domain scss|access|lang|safe; all accept --root <dir>.
  node phase.js list                       phase ids, kinds, titles, status, file counts
  node phase.js render                     re-render .ui-guard/<domain>/plan.md from plan.json
  node phase.js next                       print the id of the next phase to run (first one not done) · exit 10 = all done
  node phase.js show <id> [--verification static|visual]
                                           phase + its findings → .ui-guard/tmp/<domain>/fix/phase-<id>.json
                                           exit 1 unknown id (lists valid ids) · 3 already done · 4 earlier phases not done (a warning only)
  node phase.js gitcheck                   exit 0 if git works; exit 5 when the project is not a git repo (no undo — fix makes a backup)
  node phase.js backup [--made-by-me]      copy the project to <project>-backup-<date> (no node_modules/dist/.angular/.git)
  node phase.js dirty <id>                 phase files that already have uncommitted changes (listed in the summary; never a question)
  node phase.js snapshot <id>              remember changed files before the fix runs
  node phase.js outside <id>               files changed OUTSIDE the phase (exit 1 if any). Foundation phases may touch the scss root,
                                           angular.json and index.html; script fixes may touch the extra files they report.
  node phase.js diff <id>                  diff of the phase → .ui-guard/tmp/<domain>/fix/phase-<id>.diff (the reviewer's only input)
  node phase.js verify <id>                lint + scripts of the domain on the phase files: phase findings still present + new errors (exit 1)
  node phase.js complete <id> --verdict "<text>" [--retries n] [--review skipped|run]
                                           status done, findings → fixed, fingerprints removed from the domain baseline, log written
  node phase.js fail <id> --reason "<text>" [--retries n]   status failed, failure log (changes stay in the working tree)
  node phase.js summary [--stopped "<why>"] [--at <id>]
        the ONE end-of-run summary: phases done, files changed, remaining findings, skipped (unsure) items, the access
        needs-decision list, the plan.md and report.md paths → .ui-guard/<domain>/fix-summary.md`;

let DOMAIN = null;
const dp = (root) => domains.paths(root, DOMAIN);

function readPlan(root, domain = DOMAIN) {
  const data = u.readJSON(domains.paths(root, domain).planJson, null);
  return data && Array.isArray(data.phases) ? { data } : null;
}
function writePlan(root, plan, domain = DOMAIN) {
  u.writeJSON(domains.paths(root, domain).planJson, plan.data);
  require('./plan').renderOnly(root, domain);
}

const cmpId = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };

function getPhase(root, id) {
  const plan = readPlan(root);
  if (!plan) { console.error(`No .ui-guard/${DOMAIN}/plan.json. Run /ui-guard:scan ${DOMAIN} first (fix runs it for you).`); process.exit(1); }
  const ph = plan.data.phases.find((p) => String(p.id) === String(id));
  return { plan, ph };
}

const fixDir = (root) => dp(root).fix;
function workingChanged(root) { return [...new Set([...(git.git(root, ['diff', '--name-only', 'HEAD']) || '').split(/\r?\n/), ...(git.git(root, ['ls-files', '--others', '--exclude-standard']) || '').split(/\r?\n/)].map((s) => s.trim()).filter(Boolean))].sort(); }

// ---------- projects that are not a git repo ----------
const hasGit = (root) => git.isRepo(root);
const NO_GIT_WARNING = 'WARNING: this project is not a git repository, so there is NO way to undo a fix with git. /ui-guard:fix copies the project to a backup folder first.';
const backupFile = (root) => path.join(project.paths(root).tmp, 'backup.json');
const backupInfo = (root) => u.readJSON(backupFile(root), null);

/** Copy the project to <project>-backup-<date> without node_modules, dist, .angular, .git. */
function makeBackup(root) {
  const date = new Date().toISOString().slice(0, 10);
  let dest = `${root}-backup-${date}`;
  for (let i = 2; fs.existsSync(dest); i++) dest = `${root}-backup-${date}-${i}`;
  const skip = new Set(['node_modules', 'dist', '.angular', '.git']);
  fs.cpSync(root, dest, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !(src.includes(path.join('.ui-guard', 'tmp'))) });
  u.writeJSON(backupFile(root), { path: dest, by: 'ui-guard', date });
  return dest;
}

/** sha1 of every file under src/ plus angular.json (the non-git replacement for `git diff --name-only`). */
function hashSrc(root) {
  const out = {};
  for (const f of u.walk(path.join(root, 'src'), (name) => name === 'node_modules')) out[u.relPosix(root, f)] = u.sha1(fs.readFileSync(f));
  if (u.exists(path.join(root, 'angular.json'))) out['angular.json'] = u.sha1(fs.readFileSync(path.join(root, 'angular.json')));
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

/** Extra files a phase may touch: script reports (renamed-class usages, breakpoints), foundation files. */
function scriptReports(root, ph) {
  const d = fixDir(root);
  const mech = u.readJSON(path.join(d, `mechanical-${ph.id}.json`), null);
  const fa = u.readJSON(path.join(root, '.ui-guard', 'scss', 'foundation-move.json'), null);
  return { mech, foundationMove: ph.kind === 'foundation-move' ? fa : null };
}
function allowedFiles(root, ph) {
  const set = new Set([...(ph.files || []), ...(ph.extraFiles || [])]);
  const { mech } = scriptReports(root, ph);
  for (const f of (mech && mech.extraFiles) || []) set.add(f);
  return set;
}
function isAllowed(root, ph, f, set) {
  if (set.has(f) || f.startsWith('.ui-guard/')) return true;
  if (ph.kind === 'foundation-structure' || ph.kind === 'foundation-move') {
    const sr = project.scssRoot(project.readProfile(root));
    if (f.startsWith(sr + '/') || f === 'angular.json' || f === 'src/index.html') return true;
  }
  return false;
}

function undoHint(root, ph) {
  if (hasGit(root)) return `To discard them yourself: \`git restore -- ${(ph.files || []).join(' ')}\` (and remove the new files it created).`;
  const b = backupInfo(root);
  return `This project has no git. To undo, copy the files back from the backup: ${b ? b.path || 'the backup you made yourself' : 'the backup you made yourself'}`;
}

function writeLog(root, ph, { ok, verdict, reason, retries, review }) {
  const base = path.join(project.paths(root).tmp, 'screens', `phase-${DOMAIN}-${ph.id}`);
  const pix = u.readJSON(path.join(base, 'diff', 'results.json'), null);
  const overflow = u.readJSON(path.join(base, 'after', 'overflow.json'), u.readJSON(path.join(base, 'before', 'overflow.json'), null));
  const { mech, foundationMove } = scriptReports(root, ph);
  const L = [`# ${DOMAIN} phase ${ph.id} — ${ph.title}`, '', `- Result: **${ok ? 'done' : 'failed'}**`, `- Date: ${new Date().toISOString()}`, `- Retries used: ${retries || 0} of 3`, `- Review (opus, diff only): ${review === 'skipped' ? 'not needed — script-only phase, proven by compiling before/after' : verdict || '—'}`];
  if (!ok) L.push(`- Failure: ${reason}`, `- The changes are still in the working tree. ${undoHint(root, ph)}`);
  L.push('', '## Files changed', '', ...(ph.files || []).map((f) => `- \`${f}\``));
  if (mech && mech.extraFiles && mech.extraFiles.length) L.push(...mech.extraFiles.map((f) => `- \`${f}\` (usage update by script)`));
  if (foundationMove) L.push(...(foundationMove.created || []).map((f) => `- \`${f}\` (created)`), ...(foundationMove.deleted || []).map((f) => `- \`${f}\` (deleted — its rules moved)`));
  L.push('', '## Findings fixed', '', ...(ok ? (ph.findings || []).map((x) => `- ${x}`) : ['(none recorded — phase failed)']));
  L.push('', '## Pixel diff (threshold 0, includeAA)', '');
  if (pix) L.push('| Shot | Differing pixels | Diff image |', '|---|---|---|', ...pix.map((r) => `| ${r.shot} | ${r.error || (r.sizeChanged ? `size ${r.a} → ${r.b}` : r.diffPixels)} | ${r.diff ? '`' + r.diff + '`' : '—'} |`));
  else L.push('Not run (Playwright/pixelmatch not installed). Proof was static only: compile before/after (scss), lint, scripts and the build.');
  L.push('', '## Overflow at 320px (STYLE-45, info)', '', overflow ? overflow.map((o) => `- ${o.route}: ${o.overflow ? `overflow (scrollWidth ${o.scrollWidth} > ${o.clientWidth})` : 'no overflow'}`).join('\n') : 'Not measured.', '');
  const out = path.join(dp(root).fixes, `phase-${ph.id}.md`);
  u.writeText(out, L.join('\n'));
  return out;
}

// elements a Tier B/C/D access fix may swap or move (rules/access-fix-tiers.md)
const SWAP_TAGS = ['div', 'span', 'p', 'a', 'button', 'td', 'li', 'ul', 'ol', 'section', 'img', 'table'];
/**
 * { "<template>": { "<class>": { tag, hits: [{ file, line, selector, why }] } } } for every class on a swappable element of the
 * phase's templates (html files, and the inline template of a component .ts). The fixer reads this; it cannot run scripts.
 */
function selectorImpactFor(root, files) {
  const si = require('./selector-impact');
  const out = {};
  const cache = new Map();
  for (const rel of files) {
    if (!/\.(html|ts)$/.test(rel)) continue;
    let t = u.readText(u.fromPosix(root, rel)) || '';
    if (/\.ts$/.test(rel)) t = ((/template\s*:\s*(`[\s\S]*?`|'[^']*'|"[^"]*")/.exec(t) || [])[1]) || '';
    const res = {};
    for (const m of t.matchAll(/<([a-z][\w-]*)\b[^>]*?\sclass\s*=\s*["']([^"']+)["']/gi)) {
      const tag = m[1].toLowerCase();
      if (!SWAP_TAGS.includes(tag)) continue;
      for (const cls of m[2].replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/).filter((c) => /^-?[_a-zA-Z][\w-]*$/.test(c))) {
        if (res[cls]) continue;
        const key = `${cls}|${tag}`;
        if (!cache.has(key)) cache.set(key, si.check(root, { cls, tag }));
        res[cls] = { tag, hits: cache.get(key) };
      }
    }
    if (Object.keys(res).length) out[rel] = res;
  }
  return out;
}

/** skipped (unsure) items of every source (scripts + fixer) and the access decisions, collected for the summary. */
function collect(root) {
  const d = fixDir(root);
  const skipped = [], decisions = [];
  if (!u.isDir(d)) return { skipped, decisions };
  for (const f of fs.readdirSync(d).sort()) {
    const full = path.join(d, f);
    if (/^mechanical-.*\.json$/.test(f)) for (const s of (u.readJSON(full, {}).skipped || [])) skipped.push(`${s.file} · ${s.what} — ${s.reason}`);
    if (/^skipped-.*\.jsonl$/.test(f)) for (const s of u.readJSONL(full)) if (!s.__malformed) skipped.push(`${s.file || ''}${s.line ? ':' + s.line : ''} · ${s.what || s.ruleId || ''} — ${s.reason || ''}`);
    if (/^decisions-.*\.jsonl$/.test(f)) for (const s of u.readJSONL(full)) if (!s.__malformed) decisions.push(s);
  }
  if (DOMAIN === 'scss') {
    const fm = u.readJSON(path.join(root, '.ui-guard', 'scss', 'foundation-move.json'), null);
    if (fm) { for (const k of fm.kept || []) skipped.push(k); for (const j of fm.judge || []) skipped.push('Foundation B needs judgment: ' + j); }
  }
  return { skipped: [...new Set(skipped)], decisions };
}

/** .ui-guard/access/needs-decision.md — ONE list, grouped, each with 2–3 concrete options. */
function writeDecisions(root, decisions) {
  const file = dp(root).needsDecision;
  const L = [`# Needs your decision (${DOMAIN === 'scss' ? 'colours' : 'accessibility'})`, '', 'These changes would change what the page looks like, or need content only you know. Nothing here was changed.',
    'Pick an option per item (or write your own), then run `/ui-guard:fix access` again.', ''];
  const by = {};
  for (const x of decisions) (by[x.topic || 'Other'] = by[x.topic || 'Other'] || []).push(x);
  let n = 0;
  for (const topic of Object.keys(by).sort()) {
    L.push(`## ${topic}`, '');
    for (const x of by[topic]) {
      n++;
      L.push(`${n}. \`${x.file}${x.line ? ':' + x.line : ''}\` — ${x.issue}${x.reason ? ` (${x.reason})` : ''}`);
      for (const [i, o] of (x.options || []).slice(0, 3).entries()) L.push(`   - ${String.fromCharCode(65 + i)}. ${o}`);
    }
    L.push('');
  }
  if (!n) L.push('Nothing needs a decision.');
  u.writeText(file, L.join('\n') + '\n');
  return n;
}

/** One warning line (never a question, never a stop) when access runs before the scss structure is clean. */
function orderWarning(root) {
  if (DOMAIN !== 'access') return [];
  const sf = u.readJSON(domains.paths(root, 'scss').findings, null);
  if (!sf) return ['> Warning: `/ui-guard:scan scss` has not run — recommended order is scss → access → lang → safe.'];
  const open = sf.filter((f) => f.status === 'confirmed' && /^STYLE-/.test(f.ruleId));
  if (!open.length) return [];
  const s48 = open.filter((f) => f.ruleId === 'STYLE-48').length;
  return [`> Warning: scss is not done (${s48 ? `STYLE-48 ×${s48}, ` : ''}${open.length} open STYLE finding(s)) — recommended order is scss → access → lang → safe.`];
}

function summary(root, args) {
  const plan = readPlan(root);
  const p = dp(root);
  const phases = plan ? plan.data.phases : [];
  const done = phases.filter((x) => x.status === 'done');
  const findings = u.readJSON(p.findings, []) || [];
  const remaining = findings.filter((f) => f.status === 'confirmed');
  const changed = new Set();
  for (const ph of done) {
    for (const f of ph.files || []) changed.add(f);
    const { mech, foundationMove } = scriptReports(root, ph);
    for (const f of (mech && mech.extraFiles) || []) changed.add(f);
    if (foundationMove) for (const f of [...(foundationMove.created || []), ...(foundationMove.deleted || [])]) changed.add(f);
  }
  const { skipped, decisions } = collect(root);
  const nDecide = DOMAIN === 'access' || DOMAIN === 'scss' ? writeDecisions(root, decisions) : 0;
  const shots = phases.some((x) => u.exists(path.join(project.paths(root).tmp, 'screens', `phase-${DOMAIN}-${x.id}`, 'diff', 'results.json')));
  const L = [`# /ui-guard:fix ${DOMAIN} — summary`, '', ...orderWarning(root), '',
    args.stopped ? `**Stopped** at phase ${args.at || '?'}: ${args.stopped}` : (done.length === phases.length ? '**Finished**: every phase ran.' : `**Partial**: ${done.length} of ${phases.length} phases done.`), '',
    `- Phases done: ${done.length} of ${phases.length}${done.length ? ` (${done.map((x) => x.id).join(', ')})` : ''}`,
    `- Files changed: ${changed.size}`,
    `- Remaining findings: ${remaining.length} (${['error', 'warning', 'info'].map((s) => `${remaining.filter((f) => f.severity === s).length} ${s}`).join(', ')})`,
    `- Skipped (unsure — not proven neutral, left as they are): ${skipped.length}`,
    ...(DOMAIN === 'access' || DOMAIN === 'scss' ? [`- Needs your decision: ${nDecide} → \`.ui-guard/${DOMAIN}/needs-decision.md\``] : []),
    `- Visual proof: ${shots ? 'screenshots with 0-pixel diff per phase (see .ui-guard/' + DOMAIN + '/fixes/)' : 'static only (compile/lint/build) — Playwright is not installed, no screenshot was compared'}`,
    `- Plan: \`.ui-guard/${DOMAIN}/plan.md\` · Report: \`.ui-guard/${DOMAIN}/report.md\``,
    '- Recommended order of domains: scss → access → lang → safe', ''];
  if (skipped.length) L.push('## Skipped (unsure)', '', ...skipped.slice(0, 60).map((s) => `- ${s}`), ...(skipped.length > 60 ? [`- … ${skipped.length - 60} more`] : []), '');
  L.push('Nothing was committed.');
  u.writeText(p.summary, L.join('\n') + '\n');
  return L.join('\n');
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
    if (b) console.log(`A backup exists: ${b.path || '(made by the developer)'} (${b.by}, ${b.date}).`);
    process.exit(5);
  }
  if (cmd === 'backup') {
    if (args['made-by-me']) { u.writeJSON(backupFile(root), { path: null, by: 'developer', date: new Date().toISOString().slice(0, 10) }); console.log('Noted: you made a backup yourself.'); process.exit(0); }
    const dest = makeBackup(root);
    console.log(`backup written → ${dest} (without node_modules, dist, .angular)`);
    process.exit(0);
  }
  DOMAIN = domains.fromArgs(args).name;
  if (cmd === 'summary') { console.log(summary(root, args)); process.exit(0); }
  if (cmd === 'list' || cmd === 'render' || cmd === 'next') {
    const plan = readPlan(root);
    if (!plan) { console.error(`No .ui-guard/${DOMAIN}/plan.json.`); process.exit(1); }
    if (cmd === 'next') {
      const nx = plan.data.phases.find((x) => x.status !== 'done');
      if (!nx) { console.log('ALL DONE'); process.exit(10); }
      console.log(nx.id); process.exit(0);
    }
    if (cmd === 'render') { writePlan(root, plan); console.log('plan.md re-rendered.'); }
    for (const ph of plan.data.phases) console.log(`${ph.id}\t${ph.status}\t${ph.kind || 'fix'}\t${(ph.files || []).length} files\t${ph.title}`);
    process.exit(0);
  }
  const { plan, ph } = getPhase(root, id);
  if (!ph) { console.error(`Unknown phase "${id}". Valid ids: ${plan.data.phases.map((x) => x.id).join(', ')}`); process.exit(1); }
  if (cmd === 'show') {
    const findings = (u.readJSON(dp(root).findings, []) || []).filter((f) => (ph.findings || []).includes(f.id));
    // verification: 'visual' (Playwright installed → screenshots + style compare) or 'static' (no Playwright: access stays Tier A/B)
    const out = { domain: DOMAIN, verification: args.verification === 'static' ? 'static' : 'visual', phase: ph, findings };
    // the fixer has no shell: the selector-impact check of every block a Tier B/C/D change may touch is precomputed here
    if (DOMAIN === 'access') out.selectorImpact = selectorImpactFor(root, ph.files || []);
    u.writeJSON(path.join(fixDir(root), `phase-${ph.id}.json`), out);
    console.log(`${DOMAIN} phase ${ph.id} "${ph.title}" (${ph.kind || 'fix'}) — status ${ph.status}, ${(ph.files || []).length} files, ${findings.length} findings, routes ${(ph.routes || []).join(', ') || '(none)'} → ${u.relPosix(root, path.join(fixDir(root), `phase-${ph.id}.json`))}`);
    if (!hasGit(root)) console.log(NO_GIT_WARNING);
    if (ph.status === 'done') { console.log('Already done.'); process.exit(3); }
    const earlier = plan.data.phases.filter((x) => cmpId(x.id, ph.id) < 0 && x.status !== 'done');
    if (earlier.length) { console.log(`Note: earlier phases not done: ${earlier.map((x) => x.id).join(', ')} (order matters).`); process.exit(4); }
    process.exit(0);
  }
  if (cmd === 'dirty') {
    if (!hasGit(root)) { console.log('No git: the dirty-files check is skipped (there is no commit to compare with).'); process.exit(0); }
    const d = git.dirtyFiles(root, ph.files || []);
    console.log(d.length ? `Already changed before the fix (their diff includes your own edits): ${d.join(', ')}` : 'No phase file has uncommitted changes.');
    process.exit(d.length ? 1 : 0);
  }
  if (cmd === 'snapshot') {
    const snap = path.join(fixDir(root), `phase-${ph.id}-before.json`);
    if (hasGit(root)) u.writeJSON(snap, { changed: workingChanged(root) });
    else {
      // no git: remember a hash of every src file and a copy of the phase files (for `diff`)
      u.writeJSON(snap, { hashes: hashSrc(root) });
      for (const f of ph.files || []) { const src = u.fromPosix(root, f); if (u.exists(src)) { const dest = path.join(fixDir(root), `phase-${ph.id}-before`, ...f.split('/')); u.mkdirp(path.dirname(dest)); fs.copyFileSync(src, dest); } }
    }
    console.log(hasGit(root) ? 'snapshot saved.' : 'snapshot saved (no git: file hashes + a copy of the phase files).');
    process.exit(0);
  }
  if (cmd === 'outside') {
    const snapData = u.readJSON(path.join(fixDir(root), `phase-${ph.id}-before.json`), { changed: [] });
    const before = new Set(snapData.changed || []);
    const allowed = allowedFiles(root, ph);
    const changed = hasGit(root) ? workingChanged(root) : changedSince(root, snapData.hashes || {});
    const out = changed.filter((f) => !before.has(f) && !isAllowed(root, ph, f, allowed));
    console.log(out.length ? `Edited outside the phase: ${out.join(', ')}` : 'No edits outside the phase.');
    process.exit(out.length ? 1 : 0);
  }
  if (cmd === 'diff') {
    const out = path.join(fixDir(root), `phase-${ph.id}.diff`);
    const files = [...allowedFiles(root, ph)];
    // the diff is the reviewer's ONLY input: a short header with the phase's findings, then the changes
    const fl = (u.readJSON(dp(root).findings, []) || []).filter((f) => (ph.findings || []).includes(f.id));
    const verify = u.readJSON(path.join(fixDir(root), `phase-${ph.id}-verify.json`), null);
    const header = [`# ui-guard ${DOMAIN} phase ${ph.id} — ${ph.title} (${ph.kind || 'fix'})`, `# files: ${(ph.files || []).length} · findings: ${fl.length}`,
      ...fl.slice(0, 400).map((f) => `# ${f.id} ${f.ruleId} ${f.file}:${f.line} ${u.clip(f.message, 140)}`),
      ...(verify ? [`# verify: ${verify.notFixed.length} not fixed, ${verify.newErrors.length} new error(s)`, ...verify.notFixed.map((x) => `#   not fixed: ${x}`), ...verify.newErrors.map((x) => `#   new error: ${x}`)] : []), ''].join('\n');
    if (hasGit(root)) u.writeText(out, header + git.workingDiff(root, files));
    else {
      const parts = [header];
      for (const f of files) {
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
    const files = [...allowedFiles(root, ph)].filter((f) => u.exists(u.fromPosix(root, f)) || f === 'angular.json');
    const res = runChecks.runAll(root, { files: files.length ? files : null, domain: DOMAIN });
    const now = res.findings.map((f) => merge.normalize(root, f)).filter(Boolean);
    const nowFp = new Set(now.map((f) => f.fingerprint));
    const phaseFindings = (u.readJSON(dp(root).findings, []) || []).filter((f) => (ph.findings || []).includes(f.id) && (f.sources || []).some((s) => s === 'lint' || s === 'script'));
    const notFixed = phaseFindings.filter((f) => nowFp.has(f.fingerprint));
    const baseline = fpLib.loadBaseline(root);
    const newErrors = now.filter((f) => f.severity === 'error' && !baseline.has(f.fingerprint) && (files.includes(f.file)));
    const report = { notFixed: notFixed.map((f) => `${f.id} ${f.ruleId} ${f.file}:${f.line}`), newErrors: newErrors.map((f) => `${f.ruleId} ${f.file}:${f.line} ${f.message}`), notes: res.notes };
    u.writeJSON(path.join(fixDir(root), `phase-${ph.id}-verify.json`), report);
    for (const n of res.notes) console.log('note: ' + n);
    console.log(`verify: ${notFixed.length} script/lint finding(s) not fixed, ${newErrors.length} new error(s)`);
    for (const x of report.notFixed) console.log('  not fixed: ' + x);
    for (const x of report.newErrors) console.log('  new error: ' + x);
    process.exit(notFixed.length || newErrors.length ? 1 : 0);
  }
  if (cmd === 'complete') {
    const p = dp(root);
    const findings = u.readJSON(p.findings, []) || [];
    const fixedFps = [];
    for (const f of findings) if ((ph.findings || []).includes(f.id) && f.status === 'confirmed') { f.status = 'fixed'; fixedFps.push(f.fingerprint); }
    u.writeJSON(p.findings, findings);
    const left = fpLib.removeFromBaseline(root, fixedFps, DOMAIN);
    ph.status = 'done'; ph.doneAt = new Date().toISOString();
    writePlan(root, plan);
    const log = writeLog(root, ph, { ok: true, verdict: args.verdict, retries: args.retries, review: args.review });
    console.log(`${DOMAIN} phase ${ph.id} done · ${fixedFps.length} finding(s) fixed · baseline now ${left} · log ${u.relPosix(root, log)}`);
    process.exit(0);
  }
  if (cmd === 'fail') {
    ph.status = 'failed'; ph.failedAt = new Date().toISOString(); ph.failReason = args.reason || 'see review';
    writePlan(root, plan);
    const log = writeLog(root, ph, { ok: false, reason: args.reason || 'see review', verdict: args.verdict, retries: args.retries });
    console.log(`${DOMAIN} phase ${ph.id} marked failed · changes left in the working tree · log ${u.relPosix(root, log)}`);
    process.exit(0);
  }
  console.log(HELP);
}
module.exports = { readPlan, writePlan, udiff, summary };
