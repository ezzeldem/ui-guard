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

const SCRIPTS = ['theme-check', 'tokens-check', 'angular-config-check', 'i18n-check', 'web-check', 'class-usage', 'secrets-check', 'structure-check', 'media-check'];

function runAll(root, { files = null, skipLint = false } = {}) {
  const profile = project.readProfile(root);
  const all = [];
  const notes = [];
  const scriptFailures = {};
  for (const name of SCRIPTS) {
    try { all.push(...require('./' + name).run(root, profile)); } catch (e) { notes.push(`${name} failed: ${e.message}`); scriptFailures[name] = e.message; }
  }
  let lintRes = { findings: [], notices: [], stylelint: false, eslint: false, notChecked: {} };
  if (!skipLint) {
    const inv = inventory.load(root);
    const targets = files || (inv ? inv.files.filter((f) => f.status.lint !== 'n/a').map((f) => f.path) : project.listUiFiles(root, profile).filter((f) => ['scss', 'css', 'html', 'ts', 'index'].includes(f.kind)).map((f) => f.rel));
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
  return { findings: filtered, notes, stylelint: lintRes.stylelint, eslint: lintRes.eslint, notChecked: { ...lintRes.notChecked, ...Object.fromEntries(Object.entries(scriptFailures).map(([k, v]) => [k, `${k} failed: ${v}`])) } };
}

module.exports = { runAll, SCRIPTS };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['no-lint']);
  u.helpExit(args, `run-checks.js — Stage 0 (free): Stylelint, ESLint, ${SCRIPTS.join(', ')}.
Usage: node run-checks.js [--root <dir>] [--files a,b] [--no-lint] [--out <file.jsonl>]
Default output: .ui-guard/tmp/scan/deterministic.jsonl + lint-status.json. Marks inventory lint/script statuses.`);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const files = args.files ? String(args.files).split(',') : null;
  const res = runAll(root, { files, skipLint: !!args['no-lint'] });
  const out = args.out ? path.resolve(args.out) : path.join(project.paths(root).scan, 'deterministic.jsonl');
  u.writeJSONL(out, res.findings);
  const inv = inventory.load(root);
  if (inv && !files) {
    inventory.mark(root, 'script', 'done', true);
    // lint status: done when the tool ran; n/a when it is missing or failed (reported as NOT CHECKED in the report)
    const ran = inv.files.filter((f) => f.status.lint !== 'n/a').filter((f) => (/\.s?css$/.test(f.path) ? res.stylelint : res.eslint)).map((f) => f.path);
    inventory.mark(root, 'lint', 'done', ran);
    const notRun = inv.files.filter((f) => f.status.lint === 'pending' && !ran.includes(f.path)).map((f) => f.path);
    if (notRun.length) inventory.mark(root, 'lint', 'n/a', notRun);
    u.writeJSON(path.join(project.paths(root).scan, 'lint-status.json'), { stylelint: res.stylelint, eslint: res.eslint, notChecked: res.notChecked, notes: res.notes });
  }
  for (const n of res.notes) console.log('note: ' + n);
  for (const [tool, reason] of Object.entries(res.notChecked)) console.log(`NOT CHECKED: ${tool} rules (${reason})`);
  console.log(`stage 0 (free): ${res.findings.length} finding(s) [${summarize(res.findings)}] → ${u.relPosix(root, out)}`);
}
