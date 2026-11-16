#!/usr/bin/env node
'use strict';
// §10.3 /ui-guard:check support: collect changed UI files + line ranges, run lint/scripts, batch for the reviewer,
// then classify findings (new vs existing near the change), write the check report and the PASS marker.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const fpLib = require('./lib/fingerprint');
const runChecks = require('./run-checks');
const route = require('./route-files');
const merge = require('./merge-findings');

const HELP = `changes.js — §10.3 change review support (read-only git).
Usage:
  node changes.js collect [--ref <git-ref>] [--root <dir>]
      Changed UI files (commits not on upstream + uncommitted + untracked; no upstream → merge-base with
      origin/HEAD, main, master, develop), changed line ranges (git diff -U0), lint + scripts on them,
      reviewer batches (≤12 files with routed groups + ranges) → .ui-guard/tmp/check/
      Exit 2 when no base can be found (ask the developer for --ref).
  node changes.js finish [--root <dir>]
      Reads tmp/check/deterministic.jsonl + tmp/check/R-*.jsonl, classifies findings, writes
      .ui-guard/checks/<date>-<sha>.md, prints PASS/FAIL. On PASS writes .ui-guard/tmp/check-pass.json.
  node changes.js marker-ok [--root <dir>]   exit 0 if the PASS marker matches the current HEAD + diff`;

/** Hash of what would be pushed: HEAD + committed diff against the base. */
function pushState(root, ref) {
  const base = git.defaultBase(root, ref);
  const head = git.head(root);
  return { base, head, diffHash: u.sha1((head || '') + '\n' + git.diffText(root, base)) };
}

function inRanges(line, endLine, ranges) { return (ranges || []).some(([a, b]) => line <= b && (endLine || line) >= a); }

function collect(root, ref) {
  const p = project.paths(root);
  const profile = project.readProfile(root);
  const base = git.defaultBase(root, ref);
  if (!base && !ref) { console.log('No upstream and no default branch (origin/HEAD, main, master, develop) found — ask the developer which ref to compare with, then run with --ref <ref>.'); process.exit(2); }
  const all = git.changedFiles(root, base);
  const files = all.filter((f) => project.classify(f, profile) && u.exists(u.fromPosix(root, f)));
  const ranges = git.changedRanges(root, base, files);
  const det = runChecks.runAll(root, { files });
  const dir = p.checkTmp;
  try { require('fs').unlinkSync(path.join(dir, 'done.json')); } catch { /* none */ }
  u.writeJSONL(path.join(dir, 'deterministic.jsonl'), det.findings);
  const status = { stylelint: det.stylelint, eslint: det.eslint };
  const routed = files.map((f) => ({ file: f, groups: route.groupsFor(root, { path: f, kind: project.classify(f, profile) }), ranges: ranges[f] || [] })).filter((x) => x.groups.length);
  const batches = [];
  for (let i = 0; i < routed.length; i += 12) batches.push({ batch: String(batches.length + 1).padStart(3, '0'), files: routed.slice(i, i + 12) });
  // /ui-guard:assets as a step: only problems NOT in .ui-guard/assets-baseline.json count (fast, never blocks on known items)
  const assets = require('./assets').check(root);
  const abl = new Set((u.readJSON(path.join(p.ug, 'assets-baseline.json'), { fingerprints: [] }).fingerprints) || []);
  const newAssets = assets.problems.filter((x) => !abl.has(x.fingerprint));
  void status;
  u.writeJSON(path.join(dir, 'changes.json'), { base, head: git.head(root), ref: ref || null, files, ranges, notes: det.notes, notChecked: det.notChecked, newAssets });
  u.writeJSON(path.join(dir, 'batches.json'), batches);
  console.log(`check: ${files.length} changed UI file(s) vs ${base ? base.slice(0, 10) : ref} · ${det.findings.length} lint/script finding(s) · ${batches.length} reviewer batch(es) · ${newAssets.length} new missing asset(s) → .ui-guard/tmp/check/`);
  for (const [tool, reason] of Object.entries(det.notChecked)) console.log(`NOT CHECKED: ${tool} rules (${reason})`);
  for (const n of det.notes) console.log('note: ' + n);
}

let ARGS = {};
function finish(root) {
  const p = project.paths(root);
  const ch = u.readJSON(path.join(p.checkTmp, 'changes.json'));
  if (!ch) { console.error('Run `changes.js collect` first.'); process.exit(1); }
  const rows = [];
  for (const raw of u.readJSONL(path.join(p.checkTmp, 'deterministic.jsonl'))) { const f = merge.normalize(root, raw); if (f) rows.push(f); }
  const fs = require('fs');
  for (const name of (u.isDir(p.checkTmp) ? fs.readdirSync(p.checkTmp) : []).filter((n) => /^R-.*\.jsonl$/.test(n)).sort()) {
    for (const raw of u.readJSONL(path.join(p.checkTmp, name))) { const f = merge.normalize(root, { ...raw, checker: 'ai', sources: ['reviewer'] }, 'reviewer'); if (f) rows.push(f); }
  }
  const findings = merge.cluster(rows);
  const baseline = fpLib.loadBaseline(root);
  const fresh = [], near = [];
  for (const f of findings) {
    if (f.status === 'rejected') continue;
    const onChange = inRanges(f.line, f.endLine, ch.ranges[f.file]);
    (onChange && !baseline.has(f.fingerprint) ? fresh : near).push(f);
  }
  const newErrors = fresh.filter((f) => f.severity === 'error');
  const newAssets = ch.newAssets || [];
  const verdict = newErrors.length || newAssets.length ? 'FAIL' : 'PASS';
  const sha = git.shortHead(root);
  const L = [`# ui-guard change check — ${verdict}`, '', `| | |`, `|---|---|`, `| Date | ${new Date().toISOString()} |`, `| HEAD | ${ch.head || 'none'} |`, `| Compared with | ${ch.base || ch.ref} |`, `| Changed UI files | ${ch.files.length} |`, `| New errors | ${newErrors.length} |`, `| New warnings/info | ${fresh.length - newErrors.length} |`, `| Existing near your change | ${near.length} |`, `| New missing assets | ${newAssets.length} |`, ''];
  for (const [tool, reason] of Object.entries(ch.notChecked || {})) L.push(`> **NOT CHECKED:** ${tool} rules (${reason})`);
  for (const n of ch.notes || []) L.push(`> Note: ${n}`);
  L.push('## New findings (on changed lines, not in the baseline)', '');
  L.push(fresh.length ? fresh.map((f) => `- **${f.ruleId}** (${f.severity}) \`${f.file}:${f.line}\` — ${f.message}${f.fix ? ` · _fix:_ ${f.fix}` : ''}`).join('\n') : 'None.');
  L.push('', '## Missing assets (new, not in the assets baseline)', '', newAssets.length ? newAssets.map((x) => `- \`${x.file}:${x.line}\` -> ${x.problem}`).join('\n') : 'None.');
  L.push('', '## Existing near your change (info)', '');
  L.push(near.length ? near.map((f) => `- ${f.ruleId} (${f.severity}) \`${f.file}:${f.line}\` — ${f.message}`).join('\n') : 'None.');
  L.push('', '## Changed files', '', ...ch.files.map((f) => `- \`${f}\` lines ${(ch.ranges[f] || []).map(([a, b]) => (b >= Number.MAX_SAFE_INTEGER ? `${a}–end (new file)` : `${a}–${b}`)).join(', ') || '—'}`), '');
  const out = path.join(p.checks, `${u.today()}-${sha}.md`);
  u.writeText(out, L.join('\n'));
  if (verdict === 'PASS') {
    const st = pushState(root); // same base as the pre-push guard uses
    u.writeJSON(p.marker, { head: st.head, diffHash: st.diffHash, time: new Date().toISOString() });
  }
  u.writeJSON(path.join(p.checkTmp, 'done.json'), { verdict, time: new Date().toISOString() }); // lets cleanup.js delete tmp/check
  const cleanLine = require('./cleanup').finish(root, ARGS);
  console.log(`${verdict}: ${newErrors.length} new error(s), ${newAssets.length} new missing asset(s), ${fresh.length - newErrors.length} new warning/info, ${near.length} existing near the change → ${u.relPosix(root, out)}`);
  console.log(cleanLine);
  process.exit(verdict === 'PASS' ? 0 : 1);
}

function markerOk(root) {
  const m = u.readJSON(project.paths(root).marker);
  if (!m) return false;
  const st = pushState(root);
  return m.head === st.head && m.diffHash === st.diffHash;
}

module.exports = { pushState, markerOk, inRanges };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  ARGS = args;
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const cmd = args._[0];
  if (cmd === 'collect') collect(root, args.ref);
  else if (cmd === 'finish') finish(root);
  else if (cmd === 'marker-ok') { const ok = markerOk(root); console.log(ok ? 'marker matches' : 'no fresh marker'); process.exit(ok ? 0 : 1); }
  else console.log(HELP);
}
