#!/usr/bin/env node
'use strict';
// §10.1 PostToolUse hook (Edit|Write|MultiEdit): lint the ONE edited UI file; block (exit 2) only on NEW errors.
const path = require('path');
const fs = require('fs');

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function main() {
  if (process.argv.includes('--help')) { console.log('post-edit-lint.js — Claude Code PostToolUse hook. Reads hook JSON on stdin; lints tool_input.file_path; exit 2 + stderr list on new errors.'); return 0; }
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch { return 0; }
  const ti = input.tool_input || {};
  const file = ti.file_path || ti.path || ti.notebook_path;
  if (!file || !/\.(scss|css|html|ts)$/i.test(file)) return 0;
  const project = require('./lib/project');
  const abs = path.resolve(input.cwd || process.cwd(), file);
  const root = project.findRoot(abs);
  if (!root || !project.hasProfile(root)) return 0; // not a ui-guard project: silent
  const u = require('./lib/util');
  const profile = project.readProfile(root);
  const rel = u.relPosix(root, abs);
  const kind = project.classify(rel, profile);
  if (!kind || !['scss', 'css', 'html', 'ts', 'index'].includes(kind)) return 0;
  const lint = require('./lib/lint');
  const fp = require('./lib/fingerprint');
  const res = lint.lintFiles(root, [rel]);
  if (res.notices.length) {
    const marker = path.join(project.paths(root).tmp, 'notice-' + u.today());
    if (!u.exists(marker)) { u.writeText(marker, ''); process.stdout.write(`ui-guard: ${res.notices[0]} — edit lint skipped (one notice per day).\n`); }
  }
  const { fresh } = fp.filterNew(res.findings, fp.loadBaseline(root));
  const errors = fresh.filter((f) => f.severity === 'error');
  const warnings = fresh.filter((f) => f.severity !== 'error');
  if (errors.length) {
    process.stderr.write(`ui-guard: ${errors.length} new error(s) in ${rel} — fix them now:\n` + errors.map((f) => `${f.ruleId} line ${f.line}: ${f.message}`).join('\n') + '\nFull rules: ' + path.join(project.PLUGIN_ROOT, 'rules') + '\n');
    return 2;
  }
  if (warnings.length) process.stdout.write(`ui-guard: ${warnings.length} warning(s) in ${rel} (${[...new Set(warnings.map((w) => w.ruleId))].join(', ')}) — not blocking.\n`);
  return 0;
}

try { process.exitCode = main(); } catch (e) { process.stdout.write('ui-guard: post-edit lint skipped (' + e.message + ')\n'); process.exitCode = 0; }
