'use strict';
// Finding constructor + a shared CLI wrapper for the deterministic check scripts.
const path = require('path');
const u = require('./util');
const project = require('./project');
const fp = require('./fingerprint');

function severityOf(ruleId) { const r = project.ruleById(ruleId); return r ? r.severity : 'warning'; }

/** Build a complete finding (schema §3.4) from a script check. */
function mk(root, ruleId, file, line, message, fix = null, extra = {}) {
  return fp.complete(root, {
    ruleId, severity: extra.severity || severityOf(ruleId), file, line: line || 1, endLine: extra.endLine || line || 1,
    message, evidence: extra.evidence, fix, checker: extra.checker || 'script', sources: extra.sources || ['script'],
    status: 'confirmed', rejectReason: null,
    ...(extra.impact ? { impact: extra.impact } : {}), ...(extra.tier ? { tier: extra.tier } : {}),
  });
}

function summarize(findings) {
  const by = {};
  for (const f of findings) by[f.ruleId] = (by[f.ruleId] || 0) + 1;
  return Object.keys(by).sort().map((k) => `${k}×${by[k]}`).join(', ') || 'none';
}

/**
 * Standard CLI for check scripts: --root, --out, --help.
 * run(root, profile, args) → findings[]
 */
function cli(name, helpText, run) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, helpText + `
Options:
  --root <dir>   project root (default: nearest folder with angular.json)
  --out <file>   JSON-lines output (default: .ui-guard/tmp/scan/script-${name}.jsonl)
  --print        also print every finding`);
  const root = args.root ? path.resolve(args.root) : project.findRoot(process.cwd());
  if (!root) { console.error('ui-guard: no angular.json found (not an Angular project).'); process.exit(1); }
  const profile = project.readProfile(root);
  const findings = run(root, profile, args);
  const out = args.out ? path.resolve(args.out) : path.join(project.paths(root).scan, `script-${name}.jsonl`);
  u.writeJSONL(out, findings);
  console.log(`${name}: ${findings.length} finding(s) [${summarize(findings)}] → ${u.relPosix(root, out)}`);
  if (args.print) for (const f of findings) console.log(`  ${f.file}:${f.line} ${f.ruleId} ${f.message}`);
  return findings;
}

module.exports = { mk, cli, summarize, severityOf };
