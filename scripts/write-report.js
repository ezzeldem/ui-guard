#!/usr/bin/env node
'use strict';
// .ui-guard/report.md — a SUMMARY page (≤ ~150 lines): what was checked by which tool, what was NOT checked,
// one table row per rule (id, severity, count, files). Details stay in findings.json; per-area detail pages
// (.ui-guard/details/<area>.md) are written only on request (--details <area>). Also rewrites baseline.json.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const fpLib = require('./lib/fingerprint');
const inventory = require('./inventory');

const AREAS = { style: 'STYLE', lang: 'LANG', safe: 'SAFE', access: 'ACCESS' };
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));

/** Current findings without MEDIA (images/assets are out of the scan). */
/** Current findings without MEDIA and without STYLE-01 on library classes (Bootstrap, ngx-*, …: used, not authored). */
function loadFindings(root) {
  const raw = (u.readJSON(project.paths(root).findings, []) || []).filter((f) => !/^MEDIA-/.test(f.ruleId));
  const libs = require('./lib/libclasses');
  return libs.splitFindings(raw, libs.context(root, project.readProfile(root))).rest;
}

/** The known ESLint 10 crash gets a precise message and the exact fix (ask first). */
function eslintAdvice(root, reason) {
  if (!/eslint-scope|TypeError|__addVariables/i.test(reason || '')) return '';
  const pj = u.readJSON(path.join(root, 'node_modules', 'eslint', 'package.json'), null);
  const major = (project.readProfile(root).angular || {}).major || '<Angular major>';
  return ` ESLint ${pj ? pj.version : '10'} crashes in eslint-scope (known ESLint 10 problem). Fix, after you agree: \`npm install -D eslint@^9 angular-eslint@^${major} typescript-eslint\`.`;
}

/** Move the current report/findings to history/<stamp>/report.old.md + findings.old.json. */
function archive(root) {
  const p = project.paths(root);
  if (!u.exists(p.report) && !u.exists(p.findings)) return null;
  const dir = path.join(p.history, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  u.mkdirp(dir);
  if (u.exists(p.report)) fs.copyFileSync(p.report, path.join(dir, 'report.old.md'));
  if (u.exists(p.findings)) fs.copyFileSync(p.findings, path.join(dir, 'findings.old.json'));
  if (u.exists(p.plan)) fs.copyFileSync(p.plan, path.join(dir, 'plan.old.md'));
  return dir;
}

function build(root, { mode = 'free' } = {}) {
  const p = project.paths(root);
  const profile = project.readProfile(root);
  const idx = project.loadRulesIndex();
  const all = loadFindings(root);
  const confirmed = all.filter((f) => f.status === 'confirmed');
  const rejected = all.filter((f) => f.status === 'rejected');
  const inv = inventory.load(root);
  const lintStatus = u.readJSON(path.join(p.scan, 'lint-status.json'), null);
  // older lint-status files (before 2026-11-14) only had the failure text in notes[]
  if (lintStatus && !lintStatus.notChecked) {
    lintStatus.notChecked = {};
    for (const tl of ['stylelint', 'eslint']) {
      const n = (lintStatus.notes || []).find((x) => new RegExp('^' + tl + ' failed', 'i').test(x));
      if (!lintStatus[tl] && n) lintStatus.notChecked[tl] = (tl === 'eslint' ? 'ESLint' : 'Stylelint') + ' failed: ' + u.clip(n.replace(/^\w+ failed:\s*(Oops! Something went wrong! :\(\s*)?/i, '').replace(/\s+at .*$/, ''), 140);
    }
  }
  const aiInOldFindings = all.filter((f) => (f.sources || []).some((s) => ['A', 'B', 'ai', 'resolver'].includes(s))).length;
  const ai = u.readJSON(path.join(p.scan, 'ai', 'state.json'), null);
  const L = [];
  const files = inv ? inv.files.filter((f) => f.kind !== 'asset').length : new Set(all.map((f) => f.file)).size; // images never count
  L.push(`# ui-guard report — ${(profile.angular && profile.angular.project) || path.basename(root)}`, '');
  L.push('| | |', '|---|---|', `| Date | ${u.today()} |`, `| Commit | ${git.head(root) || 'not a git repo'} |`,
    `| Files in the scan | ${files}${inv ? '' : ' (with findings — no inventory: rebuilt from an earlier findings.json)'} |`,
    `| Scan | ${mode === 'plan-only' ? 'rebuilt from the existing findings.json (no rescan, 0 tokens)' : ai ? `free checks + AI stages ${ai.stages.map((s) => s.id).join(', ')}` : 'free checks only (0 AI tokens)'} |`,
    `| Findings | ${confirmed.length} (${['error', 'warning', 'info'].map((s) => `${confirmed.filter((f) => f.severity === s).length} ${s}`).join(', ')}) — full list in \`findings.json\` |`, '');

  L.push('## What was checked, and by what', '');
  const tool = (name, ok, reason) => L.push(`- **${name}:** ${ok ? 'ran' : `NOT CHECKED${reason ? ` (${reason})` : ''}`}`);
  if (lintStatus) {
    tool('Stylelint (STYLE rules marked stylelint)', lintStatus.stylelint, (lintStatus.notChecked || {}).stylelint || 'not installed or not configured');
    tool('ESLint (template accessibility, SAFE-03/08)', lintStatus.eslint, (lintStatus.notChecked || {}).eslint || 'not installed or not configured');
    const sf = Object.entries(lintStatus.notChecked || {}).filter(([k]) => !['stylelint', 'eslint'].includes(k));
    L.push(`- **ui-guard scripts** (theme, tokens, angular.json/index.html, i18n, web links, class usage, secrets, structure): ${sf.length ? `ran, except ${sf.map(([, v]) => v).join('; ')}` : 'ran'}`);
  } else L.push('- **Free checks:** results come from an earlier scan (which tools ran then is not recorded here).');
  if (ai) {
    for (const st of ai.stages) {
      const done = st.batches.filter((b) => b.status === 'done' && !b.skipped).length;
      L.push(`- **AI stage ${st.id} · ${st.name}:** ${done}/${st.batches.length} batch(es) done`);
    }
  } else if (aiInOldFindings) L.push(`- **AI:** no AI work in this run. ${aiInOldFindings} finding(s) came from the AI of the earlier scan and are kept as they were.`);
  else L.push('- **AI:** not run. Rules only the AI can judge were not checked (run `/ui-guard:scan --ai` to add them, with an estimate first).');
  L.push('- **Images, icons, fonts and other assets:** out of the scan. `/ui-guard:assets` checks that referenced files exist (0 tokens).', '');

  L.push('## NOT checked', '');
  const nc = [];
  if (lintStatus) for (const [k, v] of Object.entries(lintStatus.notChecked || {})) nc.push(`- ${k} rules — ${v}.${k === 'eslint' ? eslintAdvice(root, v) : ''} They were NOT sent to the AI. Fix the tool, or run \`/ui-guard:scan --ai\` (estimate shown first).`);
  if (lintStatus && !lintStatus.stylelint && !(lintStatus.notChecked || {}).stylelint) nc.push('- Stylelint rules — Stylelint is not installed/configured.');
  if (lintStatus && !lintStatus.eslint && !(lintStatus.notChecked || {}).eslint) nc.push('- ESLint rules — ESLint is not installed/configured.');
  const aiRules = idx.rules.filter((r) => r.inScan !== false && r.checker.length === 1 && r.checker[0] === 'ai').map((r) => r.id);
  if (!ai && !aiInOldFindings) nc.push(`- AI-only rules (${aiRules.length}): ${aiRules.join(', ')}.`);
  else if (ai) {
    const skipped = ai.stages.flatMap((s) => s.batches).filter((b) => b.skipped);
    const left = ai.stages.flatMap((s) => s.batches).filter((b) => b.status !== 'done');
    if (skipped.length) nc.push(`- AI batches skipped by decision: ${skipped.map((b) => `${b.id} (${b.files.length} files)`).join(', ')}.`);
    if (left.length) nc.push(`- AI scan stopped${ai.stop ? ` at batch ${ai.stop.batch}: ${ai.stop.reason}` : ''} — ${left.length} batch(es) / ${left.reduce((n, b) => n + b.files.length, 0)} file(s) not done. Resume: \`/ui-guard:scan --ai --resume\`.`);
  }
  nc.push('- STYLE-45 (overflow at 320px) is measured only during `/ui-guard:fix` screenshots.');
  L.push(...nc, '');

  L.push('## Findings per rule', '', '| Rule | Severity | Count | Files | What |', '|---|---|---|---|---|');
  const byRule = {};
  for (const f of confirmed) (byRule[f.ruleId] = byRule[f.ruleId] || []).push(f);
  const fam = ['STYLE', 'LANG', 'SAFE', 'ACCESS', 'LINT'];
  const ids = Object.keys(byRule).sort((a, b) => fam.indexOf(a.split(/[-:]/)[0]) - fam.indexOf(b.split(/[-:]/)[0]) || byRule[b].length - byRule[a].length || (a < b ? -1 : 1));
  const MAXROWS = 70;
  for (const id of ids.slice(0, MAXROWS)) {
    const r = idx.rules.find((x) => x.id === id);
    const list = byRule[id];
    L.push(`| ${id} | ${list[0].severity} | ${list.length} | ${new Set(list.map((f) => f.file)).size} | ${esc(r ? r.title : list[0].message.slice(0, 60))} |`);
  }
  if (ids.length > MAXROWS) L.push(`| … | | ${ids.slice(MAXROWS).reduce((n, id) => n + byRule[id].length, 0)} | | ${ids.length - MAXROWS} more rule(s) with few findings — see findings.json |`);
  if (!ids.length) L.push('| — | | 0 | | no findings |');
  L.push('');
  if (rejected.length) L.push(`Rejected/disputed in an earlier scan (kept in findings.json with reasons): ${rejected.length}.`, '');
  L.push('Details per area on request: `/ui-guard:scan --details style|lang|safe|access` → `.ui-guard/details/<area>.md`.', '');

  L.push('## Honesty note', '', 'The free checks are deterministic. The AI part is ONE pass, one agent at a time, and can miss things; it never replaces the free checks. No tool guarantees 100%.', '');
  L.push('## Cost of this scan', '');
  if (ai) {
    const basis = (bs) => {
      const m = bs.reduce((n, b) => n + (b.measuredTokens || 0), 0), e = bs.reduce((n, b) => n + (b.estimatedTokens || 0), 0);
      return m && e ? 'measured + estimated' : e ? 'estimated' : 'measured';
    };
    for (const st of ai.stages) L.push(`- AI stage ${st.id}: ${st.batches.reduce((n, b) => n + (b.runs || 0), 0)} agent run(s), ${fmt(st.batches.reduce((n, b) => n + b.tokens, 0))} tokens (${basis(st.batches)})`);
    L.push(`- Total AI: ${ai.agents} agent run(s), ${fmt(ai.used)} tokens (${basis(ai.stages.flatMap((s) => s.batches))}; cap ${fmt(ai.cap)}). Free checks: 0 tokens.`);
  } else L.push('- Free checks only: 0 agents, 0 AI tokens.');
  return L.join('\n') + '\n';
}

function details(root, area) {
  const prefix = AREAS[area];
  if (!prefix) throw new Error(`Unknown area "${area}". Use: ${Object.keys(AREAS).join(', ')}`);
  const list = loadFindings(root).filter((f) => f.status === 'confirmed' && f.ruleId.startsWith(prefix + '-'));
  const byFile = {};
  for (const f of list) (byFile[f.file] = byFile[f.file] || []).push(f);
  const L = [`# ${prefix} findings — details`, '', `${list.length} finding(s) in ${Object.keys(byFile).length} file(s). Format: ID · rule · line · message.`, ''];
  for (const file of Object.keys(byFile).sort()) {
    L.push(`## \`${file}\``, '');
    for (const f of byFile[file].sort((a, b) => a.line - b.line)) L.push(`- \`${f.id}\` · ${f.ruleId} · line ${f.line} · ${esc(f.message)}`);
    L.push('');
  }
  const out = path.join(project.paths(root).ug, 'details', `${area}.md`);
  u.writeText(out, L.join('\n'));
  return { out, count: list.length };
}

function writeAll(root, opts = {}) {
  const p = project.paths(root);
  u.writeText(p.report, build(root, opts));
  const confirmed = loadFindings(root).filter((f) => f.status === 'confirmed');
  fpLib.saveBaseline(root, confirmed.map((f) => f.fingerprint), { fromScan: u.today() });
  return { confirmed: confirmed.length, lines: u.readText(p.report).split('\n').length };
}

module.exports = { build, writeAll, archive, details, loadFindings };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['archive', 'plan-only']);
  u.helpExit(args, `write-report.js — summary report (≤ ~150 lines) + baseline.json from .ui-guard/findings.json (MEDIA findings are never counted).
Usage:
  node write-report.js --archive            copy report.md / findings.json / plan.md to .ui-guard/history/<date>/*.old.*
  node write-report.js [--plan-only]        write report.md + baseline.json
  node write-report.js --details <area>     write .ui-guard/details/<area>.md (style|lang|safe|access)`);
  const root = args.root ? path.resolve(args.root) : (project.findRoot() || process.cwd());
  if (args.archive) { const a = archive(root); console.log(a ? `previous files kept in ${u.relPosix(root, a)}` : 'nothing to archive'); process.exit(0); }
  if (args.details) { const d = details(root, String(args.details)); console.log(`${d.count} finding(s) → ${u.relPosix(root, d.out)}`); process.exit(0); }
  const r = writeAll(root, { mode: args['plan-only'] ? 'plan-only' : 'scan' });
  console.log(`report → .ui-guard/report.md (${r.lines} lines) · baseline → .ui-guard/baseline.json (${r.confirmed} fingerprints, MEDIA excluded)`);
}
