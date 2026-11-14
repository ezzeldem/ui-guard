#!/usr/bin/env node
'use strict';
// §10.4 PreToolUse hook (Bash|PowerShell): only for `git push`. Every other command exits 0 immediately.
const fs = require('fs');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
if (process.argv.includes('--help')) { console.log('pre-push-guard.js — Claude Code PreToolUse hook. Blocks `git push` (exit 2) on new lint errors or without a fresh /ui-guard:check PASS marker.'); process.exit(0); }
let input = {};
try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
const cmd = String((input.tool_input && input.tool_input.command) || '');
if (!/(^|[\s;&|(`'"])git(\s+-{1,2}[\w-]+(=\S+|\s+\S+)?)*\s+push(\s|$)/.test(cmd)) process.exit(0); // fast path

try {
  const path = require('path');
  const project = require('./lib/project');
  const root = project.findRoot(input.cwd || process.cwd());
  if (!root || !project.hasProfile(root)) process.exit(0);
  const u = require('./lib/util');
  const git = require('./lib/git');
  const lint = require('./lib/lint');
  const fp = require('./lib/fingerprint');
  const changes = require('./changes');
  const profile = project.readProfile(root);
  const base = git.defaultBase(root);
  const files = git.changedFiles(root, base, { includeWorking: false }).filter((f) => project.classify(f, profile) && u.exists(u.fromPosix(root, f)));
  const res = lint.lintFiles(root, files);
  const { fresh } = fp.filterNew(res.findings, fp.loadBaseline(root));
  const errors = fresh.filter((f) => f.severity === 'error');
  if (errors.length) {
    process.stderr.write(`ui-guard: push blocked — ${errors.length} new lint error(s):\n` + errors.slice(0, 200).map((f) => `${f.file}:${f.line} ${f.ruleId} ${f.message}`).join('\n') + (errors.length > 200 ? `\n…and ${errors.length - 200} more (run /ui-guard:check for the full list in .ui-guard/checks/)` : '') + '\nFix them, then push again.\n');
    process.exit(2);
  }
  // No changed UI files in the push → nothing for the AI review to check: the marker is not required.
  if (files.length && !changes.markerOk(root)) {
    process.stderr.write('ui-guard: Run the ui-guard change review first (`/ui-guard:check`), then push again.\n');
    process.exit(2);
  }
  void path;
  process.exit(0);
} catch (e) {
  process.stdout.write('ui-guard: pre-push guard skipped (' + e.message + ')\n');
  process.exit(0);
}
