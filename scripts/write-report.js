#!/usr/bin/env node
'use strict';
// .ui-guard/<domain>/report.md — a SUMMARY page (≤ ~150 lines) for ONE domain: what was checked by which tool, what was
// NOT checked, one row per rule (ACCESS: per user-impact level, repeats collapsed, a "fix these first" list).
// Token use of the AI pass is a silent log in the footer — never a question. Also rewrites .ui-guard/<domain>/baseline.json.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const fpLib = require('./lib/fingerprint');
const domains = require('./lib/domains');
const inventory = require('./inventory');

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));

/** Current findings of a domain without STYLE-01 on library classes (Bootstrap, ngx-*, …: used, not authored). */
function loadFindings(root, domain) {
  const raw = u.readJSON(domains.paths(root, domain).findings, []) || [];
  if (domain !== 'scss') return raw;
  const libs = require('./lib/libclasses');
  return libs.splitFindings(raw, libs.context(root, project.readProfile(root))).rest;
}

/** The known ESLint 10 crash gets a precise message and the exact fix (the developer installs it). */
function eslintAdvice(root, reason) {
  if (!/eslint-scope|TypeError|__addVariables/i.test(reason || '')) return '';
  const pj = u.readJSON(path.join(root, 'node_modules', 'eslint', 'package.json'), null);
  const major = (project.readProfile(root).angular || {}).major || '<Angular major>';
  return ` ESLint ${pj ? pj.version : '10'} crashes in eslint-scope (known ESLint 10 problem). Fix: \`npm install -D eslint@^9 angular-eslint@^${major} typescript-eslint\`.`;
}

/** Move the domain's report/findings/plan to .ui-guard/<domain>/history/<stamp>/*.old.* */
function archive(root, domain) {
  const p = domains.paths(root, domain);
  if (!u.exists(p.report) && !u.exists(p.findings)) return null;
  const dir = path.join(p.history, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  u.mkdirp(dir);
  if (u.exists(p.report)) fs.copyFileSync(p.report, path.join(dir, 'report.old.md'));
  if (u.exists(p.findings)) fs.copyFileSync(p.findings, path.join(dir, 'findings.old.json'));
  if (u.exists(p.plan)) fs.copyFileSync(p.plan, path.join(dir, 'plan.old.md'));
  return dir;
}

function accessSection(root, confirmed, L) {
  const ai = require('./lib/access-impact');
  const lvl = { high: [], medium: [], low: [] };
  for (const f of confirmed) lvl[f.impact || ai.impactOf(f)].push(f);
  const total = confirmed.length;
  L.push('## Findings by user impact', '', '| Impact | Count | What it means |', '|---|---|---|',
    `| High | ${lvl.high.length} | blocks a task: image without alt, unnamed control, clickable div, missing lang, positive tabindex, outline removed, ARIA that lies |`,
    `| Medium | ${lvl.medium.length} | harder to use: skipped heading, div instead of landmark, a/button misuse, table without th, iframe without title, vague link text |`,
    `| Low | ${lvl.low.length} | polish |`, `| **Total** | **${total}** | ${lvl.high.length} + ${lvl.medium.length} + ${lvl.low.length} = ${total} |`, '');
  const gs = ai.groups(confirmed);
  const first = gs.filter((g) => g.count > 1 || g.impact === 'high').sort((a, b) => (b.shared - a.shared) || ({ high: 0, medium: 1, low: 2 }[a.impact] - { high: 0, medium: 1, low: 2 }[b.impact]) || b.count - a.count).slice(0, 8);
  L.push('## Fix these first', '', 'Shared sources first: one fix there removes every repeat.', '');
  if (first.length) first.forEach((g, i) => L.push(`${i + 1}. **${g.impact}** · ${g.ruleId} · ${esc(u.clip(g.message, 90))}${g.count > 1 ? ` — ×${g.count}${g.shared ? ' (shared source)' : ''}` : ''} · e.g. ${g.examples.slice(0, 2).map((e) => '`' + e + '`').join(', ')}`));
  else L.push('Nothing.');
  L.push('', '## All findings (repeats collapsed)', '', '| Impact | Rule | Count | Issue | Examples |', '|---|---|---|---|---|');
  const MAXROWS = 50;
  for (const g of gs.slice(0, MAXROWS)) L.push(`| ${g.impact} | ${g.ruleId} | ${g.count > 1 ? '×' + g.count : 1} | ${esc(u.clip(g.message, 80))} | ${g.examples.slice(0, 3).map((e) => '`' + e + '`').join(' ')} |`);
  if (gs.length > MAXROWS) L.push(`| … | | ${gs.slice(MAXROWS).reduce((n, g) => n + g.count, 0)} | ${gs.length - MAXROWS} more row(s) | see findings.json |`);
  if (!gs.length) L.push('| — | | 0 | no findings | |');
  const counted = gs.reduce((n, g) => n + g.count, 0);
  if (counted !== total) throw new Error(`ACCESS report counts do not add up (${counted} ≠ ${total})`);
  L.push('');
}

function build(root, domain, { mode = 'scan' } = {}) {
  const dom = domains.get(domain);
  const p = domains.paths(root, domain);
  const profile = project.readProfile(root);
  const idx = project.loadRulesIndex();
  const all = loadFindings(root, domain);
  const confirmed = all.filter((f) => f.status === 'confirmed');
  const rejected = all.filter((f) => f.status === 'rejected');
  const inv = inventory.load(root);
  const lintStatus = u.readJSON(path.join(p.scan, 'lint-status.json'), null);
  const ai = u.readJSON(path.join(p.scan, 'ai', 'state.json'), null);
  const L = [];
  const files = inv ? inv.files.length : new Set(all.map((f) => f.file)).size;
  L.push(`# ui-guard ${domain} report — ${(profile.angular && profile.angular.project) || path.basename(root)}`, '');
  L.push('| | |', '|---|---|', `| Domain | \`${domain}\` — ${dom.title} (${dom.prefix} rules only) |`, '| Recommended order | scss → access → lang → safe |', `| Date | ${u.today()} |`, `| Commit | ${git.head(root) || 'not a git repo'} |`,
    `| Files in the project | ${files} (whole project: components, pages, layouts, global stylesheets, assets references) |`,
    `| Scan | ${mode === 'plan-only' ? 'rebuilt from the existing findings.json (no rescan)' : ai ? 'scripts + lint, then AI on the files that need judgment' : 'scripts + lint'} |`,
    `| Findings | ${confirmed.length} (${['error', 'warning', 'info'].map((s) => `${confirmed.filter((f) => f.severity === s).length} ${s}`).join(', ')}) — full list in \`.ui-guard/${domain}/findings.json\` |`, '');

  L.push('## What was checked, and by what', '');
  if (lintStatus) {
    if (dom.lint.stylelint) L.push(`- **Stylelint:** ${lintStatus.stylelint ? 'ran' : `NOT CHECKED (${(lintStatus.notChecked || {}).stylelint || 'not installed or not configured'})`}`);
    if (dom.lint.eslint) L.push(`- **ESLint:** ${lintStatus.eslint ? 'ran' : `NOT CHECKED (${(lintStatus.notChecked || {}).eslint || 'not installed or not configured'})`}`);
    const sf = Object.entries(lintStatus.notChecked || {}).filter(([k]) => !['stylelint', 'eslint'].includes(k));
    if (dom.scripts.length) L.push(`- **ui-guard scripts** (${dom.scripts.join(', ')}): ${sf.length ? `ran, except ${sf.map(([, v]) => v).join('; ')}` : 'ran'}`);
  } else L.push('- **Scripts + lint:** results come from an earlier scan (which tools ran then is not recorded here).');
  if (ai) for (const sg of ai.stages) L.push(`- **AI · ${sg.name}:** ${sg.files} file(s) needed judgment · ${sg.batches.filter((b) => b.status === 'done' && !b.skipped).length}/${sg.batches.length} batch(es) done`);
  else L.push('- **AI:** not run in this scan.');
  L.push('');

  L.push('## NOT checked', '');
  const nc = [];
  if (lintStatus) for (const [k, v] of Object.entries(lintStatus.notChecked || {})) nc.push(`- ${k} rules — ${v}.${k === 'eslint' ? eslintAdvice(root, v) : ''} They were not sent to the AI.`);
  if (ai) {
    const bs = ai.stages.flatMap((s) => s.batches);
    const skipped = bs.filter((b) => b.skipped);
    const left = bs.filter((b) => b.status !== 'done');
    if (skipped.length) nc.push(`- AI batches skipped (${skipped.map((b) => `${b.id}: ${b.skipped}`).join('; ')}) — ${skipped.reduce((n, b) => n + b.files.length, 0)} file(s) not checked by AI.`);
    if (left.length) nc.push(`- AI pass stopped${ai.stop ? ` at batch ${ai.stop.batch}: ${ai.stop.reason}` : ''} — ${left.length} batch(es) not done. \`/ui-guard:scan ${domain}\` continues from there.`);
  }
  if (domain === 'scss') nc.push('- STYLE-45 (overflow at 320px) is measured only during `/ui-guard:fix scss` screenshots.');
  L.push(...(nc.length ? nc : ['Nothing.']), '');

  if (domain === 'access') accessSection(root, confirmed, L);
  else {
    L.push('## Findings per rule', '', '| Rule | Severity | Count | Files | What |', '|---|---|---|---|---|');
    const byRule = {};
    for (const f of confirmed) (byRule[f.ruleId] = byRule[f.ruleId] || []).push(f);
    const ids = Object.keys(byRule).sort((a, b) => byRule[b].length - byRule[a].length || (a < b ? -1 : 1));
    const MAXROWS = 70;
    for (const id of ids.slice(0, MAXROWS)) {
      const r = idx.rules.find((x) => x.id === id);
      const list = byRule[id];
      L.push(`| ${id} | ${list[0].severity} | ${list.length} | ${new Set(list.map((f) => f.file)).size} | ${esc(r ? r.title : list[0].message.slice(0, 60))} |`);
    }
    if (ids.length > MAXROWS) L.push(`| … | | ${ids.slice(MAXROWS).reduce((n, id) => n + byRule[id].length, 0)} | | ${ids.length - MAXROWS} more rule(s) — see findings.json |`);
    if (!ids.length) L.push('| — | | 0 | | no findings |');
    L.push('');
  }
  if (rejected.length) L.push(`Not reported (kept in findings.json with the reason): ${rejected.length} — ${[...new Set(rejected.map((f) => f.rejectReason))].slice(0, 3).join('; ')}.`, '');
  L.push(`Details on request: \`node <plugin>/scripts/write-report.js --domain ${domain} --details\` → \`.ui-guard/${domain}/details.md\`.`, '');

  L.push('## Honesty note', '', 'Scripts and lint are deterministic. The AI pass looks only at files a script flagged as needing judgment, one agent at a time; it can miss things. No tool guarantees 100%.', '');
  L.push('## Token log (silent — never a question)', '');
  if (ai) {
    const bs = ai.stages.flatMap((s) => s.batches);
    const m = bs.reduce((n, b) => n + (b.measuredTokens || 0), 0), e = bs.reduce((n, b) => n + (b.estimatedTokens || 0), 0);
    L.push(`- AI: ${ai.agents} agent run(s), ${fmt(ai.used)} tokens (${m && e ? 'measured + estimated' : e ? 'estimated' : 'measured'}). Scripts + lint: 0 tokens.`);
  } else L.push('- Scripts + lint only: 0 agents, 0 AI tokens.');
  return L.join('\n') + '\n';
}

function details(root, domain) {
  const dom = domains.get(domain);
  const list = loadFindings(root, domain).filter((f) => f.status === 'confirmed');
  const byFile = {};
  for (const f of list) (byFile[f.file] = byFile[f.file] || []).push(f);
  const L = [`# ${dom.prefix} findings — details`, '', `${list.length} finding(s) in ${Object.keys(byFile).length} file(s). Format: ID · rule · line · message.`, ''];
  for (const file of Object.keys(byFile).sort()) {
    L.push(`## \`${file}\``, '');
    for (const f of byFile[file].sort((a, b) => a.line - b.line)) L.push(`- \`${f.id}\` · ${f.ruleId}${f.impact ? ' · ' + f.impact : ''} · line ${f.line} · ${esc(f.message)}`);
    L.push('');
  }
  const out = domains.paths(root, domain).details;
  u.writeText(out, L.join('\n'));
  return { out, count: list.length };
}

function writeAll(root, domain, opts = {}) {
  const p = domains.paths(root, domain);
  u.writeText(p.report, build(root, domain, opts));
  const confirmed = loadFindings(root, domain).filter((f) => f.status === 'confirmed');
  fpLib.saveBaseline(root, confirmed.map((f) => f.fingerprint), { fromScan: u.today() }, domain);
  return { confirmed: confirmed.length, lines: u.readText(p.report).split('\n').length };
}

module.exports = { build, writeAll, archive, details, loadFindings };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['archive', 'plan-only', 'details']);
  u.helpExit(args, `write-report.js — one domain's summary report (≤ ~150 lines) + its baseline.
Usage (all need --domain scss|access|lang|safe):
  node write-report.js --domain <d> --archive      copy report.md / findings.json / plan.md to .ui-guard/<d>/history/<date>/*.old.*
  node write-report.js --domain <d> [--plan-only]  write .ui-guard/<d>/report.md + .ui-guard/<d>/baseline.json
  node write-report.js --domain <d> --details      write .ui-guard/<d>/details.md (every finding by file)`);
  const root = args.root ? path.resolve(args.root) : (project.findRoot() || process.cwd());
  const dom = domains.fromArgs(args);
  if (args.archive) { const a = archive(root, dom.name); console.log(a ? `previous files kept in ${u.relPosix(root, a)}` : 'nothing to archive'); process.exit(0); }
  if (args.details) { const d = details(root, dom.name); console.log(`${d.count} finding(s) → ${u.relPosix(root, d.out)}`); process.exit(0); }
  const r = writeAll(root, dom.name, { mode: args['plan-only'] ? 'plan-only' : 'scan' });
  console.log(`report → .ui-guard/${dom.name}/report.md (${r.lines} lines) · baseline → .ui-guard/${dom.name}/baseline.json (${r.confirmed} fingerprints)`);
}
