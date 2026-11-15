#!/usr/bin/env node
'use strict';
// Stage 0 — deterministic checks (free, zero AI tokens): Stylelint + ESLint + every ui-guard script, mapped to ui-guard IDs.
// Writes .ui-guard/tmp/scan/deterministic.jsonl + lint-status.json and marks inventory lint/script statuses.
// A tool that is missing or crashes is recorded as NOT CHECKED (with the reason). Its rules are never routed to the AI.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const lint = require('./lib/lint');
const inventory = require('./inventory');
const { summarize } = require('./lib/findings');
const domains = require('./lib/domains');

const SCRIPTS = ['foundation', 'theme-check', 'tokens-check', 'angular-config-check', 'i18n-check', 'web-check', 'class-usage', 'secrets-check', 'structure-check', 'media-check'];

/** domain (optional): only that domain's scripts, its linter(s) and its rule family. */
function runAll(root, { files = null, skipLint = false, domain = null } = {}) {
  const dom = domain ? (typeof domain === 'string' ? domains.get(domain) : domain) : null;
  const profile = project.readProfile(root);
  const all = [];
  const notes = [];
  const scriptFailures = {};
  for (const name of (dom ? dom.scripts : SCRIPTS)) {
    try { all.push(...require('./' + name).run(root, profile)); } catch (e) { notes.push(`${name} failed: ${e.message}`); scriptFailures[name] = e.message; }
  }
  let lintRes = { findings: [], notices: [], stylelint: false, eslint: false, notChecked: {} };
  if (!skipLint) {
    const inv = inventory.load(root);
    // a domain scan lints every file of its kinds again (an earlier failure must not hide files from it)
    let targets = files || (inv ? inv.files.filter((f) => (dom ? ['scss', 'css', 'html', 'ts', 'index'].includes(f.kind) : f.status.lint !== 'n/a')).map((f) => f.path) : project.listUiFiles(root, profile).filter((f) => ['scss', 'css', 'html', 'ts', 'index'].includes(f.kind)).map((f) => f.rel));
    if (dom) targets = targets.filter((f) => (/.s?css$/.test(f) ? dom.lint.stylelint : dom.lint.eslint));
    lintRes = lint.lintFiles(root, targets);
    all.push(...lintRes.findings);
    notes.push(...lintRes.notices);
  }
  let filtered = all;
  // STYLE-01 on a LIBRARY class (Bootstrap, ngx-*, …) is never raised: such classes are used, not authored.
  const libs = require('./lib/libclasses');
  const split = libs.splitFindings(filtered, libs.context(root, profile));
  filtered = split.rest;
  if (files) { const set = new Set(files); filtered = filtered.filter((f) => set.has(f.file)); }
  if (dom) filtered = filtered.filter((f) => domains.owns(dom, f));
  return { findings: filtered, notes, stylelint: lintRes.stylelint, eslint: lintRes.eslint, notChecked: { ...lintRes.notChecked, ...Object.fromEntries(Object.entries(scriptFailures).map(([k, v]) => [k, `${k} failed: ${v}`])) } };
}

module.exports = { runAll, SCRIPTS };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['no-lint']);
  u.helpExit(args, `run-checks.js — Stage 0 (free): Stylelint, ESLint, ${SCRIPTS.join(', ')}.
Usage: node run-checks.js [--root <dir>] [--domain scss|access|lang|safe] [--files a,b] [--no-lint] [--out <file.jsonl>]
  --domain   only that domain's scripts, linter and rule family → .ui-guard/tmp/<domain>/scan/deterministic.jsonl + lint-status.json
Default output (no domain, used by /ui-guard:check and the hooks): .ui-guard/tmp/scan/deterministic.jsonl + lint-status.json.`);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const files = args.files ? String(args.files).split(',') : null;
  const dom = domains.fromArgs(args, { required: false });
  const scanDir = dom ? domains.paths(root, dom.name).scan : project.paths(root).scan;
  const res = runAll(root, { files, skipLint: !!args['no-lint'], domain: dom });
  const out = args.out ? path.resolve(args.out) : path.join(scanDir, 'deterministic.jsonl');
  u.writeJSONL(out, res.findings);
  const inv = inventory.load(root);
  if (inv && !files && !dom) {
    inventory.mark(root, 'script', 'done', true);
    // lint status: done when the tool ran; n/a when it is missing or failed (reported as NOT CHECKED in the report)
    const ran = inv.files.filter((f) => f.status.lint !== 'n/a').filter((f) => (/\.s?css$/.test(f.path) ? res.stylelint : res.eslint)).map((f) => f.path);
    inventory.mark(root, 'lint', 'done', ran);
    const notRun = inv.files.filter((f) => f.status.lint === 'pending' && !ran.includes(f.path)).map((f) => f.path);
    if (notRun.length) inventory.mark(root, 'lint', 'n/a', notRun);
    u.writeJSON(path.join(project.paths(root).scan, 'lint-status.json'), { stylelint: res.stylelint, eslint: res.eslint, notChecked: res.notChecked, notes: res.notes });
  }
  if (dom && !files) u.writeJSON(path.join(scanDir, 'lint-status.json'), { domain: dom.name, stylelint: dom.lint.stylelint ? res.stylelint : null, eslint: dom.lint.eslint ? res.eslint : null, notChecked: res.notChecked, notes: res.notes });
  for (const n of res.notes) console.log('note: ' + n);
  for (const [tool, reason] of Object.entries(res.notChecked)) console.log(`NOT CHECKED: ${tool} rules (${reason})`);
  console.log(`${dom ? dom.name + ' · ' : ''}scripts + lint (0 tokens): ${res.findings.length} finding(s) [${summarize(res.findings)}] → ${u.relPosix(root, out)}`);
}
