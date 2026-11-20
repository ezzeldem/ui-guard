'use strict';
// Run the TARGET project's Stylelint / ESLint (never the plugin's) with JSON output, mapped to ui-guard IDs.
// Equivalent to `npx --no-install`: only binaries already in the project's node_modules are used; nothing is installed.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const u = require('./util');
const { paths, loadRulesIndex } = require('./project');
const fp = require('./fingerprint');

/** Resolve a package's CLI entry inside the project's node_modules (walking up). */
function resolveBin(root, pkg, binName) {
  let dir = root;
  for (;;) {
    const pj = path.join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
    const meta = u.readJSON(pj);
    if (meta) {
      const bin = typeof meta.bin === 'string' ? meta.bin : (meta.bin && (meta.bin[binName || pkg] || Object.values(meta.bin)[0]));
      if (bin) return path.join(path.dirname(pj), bin);
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function stylelintConfig(root) {
  const p = paths(root);
  for (const c of [path.join(p.lint, 'stylelint.config.mjs'), path.join(root, 'stylelint.config.mjs')]) if (u.exists(c)) return c;
  return null;
}
function eslintConfig(root) {
  const p = paths(root);
  for (const c of [path.join(p.lint, 'eslint.config.mjs'), path.join(p.lint, 'eslint.config.js')]) if (u.exists(c)) return c;
  return null;
}

function runNode(root, bin, args, timeoutMs) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: timeoutMs, windowsHide: true });
}

function severityFor(ruleId, fallback) {
  const r = loadRulesIndex().rules.find((x) => x.id === ruleId);
  return r ? r.severity : fallback;
}

/** Map a lint rule name (+message) to a ui-guard ID. Custom rules carry the ID in the message: "[STYLE-21] ...". */
function mapRule(lintRule, text) {
  const m = /\[([A-Z]+-\d{2})\]/.exec(text || '');
  if (m) return m[1];
  const idx = loadRulesIndex();
  return idx.lintMap[lintRule] || null;
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

/**
 * Stylelint over files (relative posix). Returns { available, reason, findings }.
 */
function stylelint(root, files, { timeoutMs = 600000 } = {}) {
  if (!files.length) return { available: true, findings: [] };
  const bin = resolveBin(root, 'stylelint', 'stylelint');
  if (!bin) return { available: false, reason: 'stylelint is not installed in this project', findings: [] };
  const cfg = stylelintConfig(root);
  if (!cfg) return { available: false, reason: 'no ui-guard Stylelint config (.ui-guard/lint/stylelint.config.cjs)', findings: [] };
  const findings = [];
  const tmpOut = path.join(paths(root).tmp, `stylelint-${process.pid}.json`);
  u.mkdirp(path.dirname(tmpOut));
  for (const part of chunk(files, 200)) {
    const r = runNode(root, bin, ['--config', cfg, '--formatter', 'json', '--output-file', tmpOut, '--allow-empty-input', '--no-color', ...part.map((f) => u.fromPosix(root, f))], timeoutMs);
    let data = u.readJSON(tmpOut);
    if (!data) { try { data = JSON.parse(r.stdout || r.stderr || 'null'); } catch { data = null; } }
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
    if (!Array.isArray(data)) return { available: false, reason: 'stylelint failed: ' + u.clip((r.stderr || r.stdout || (r.error && r.error.message) || 'unknown error'), 300), findings };
    for (const res of data) {
      const rel = u.relPosix(root, res.source);
      for (const w of res.warnings || []) {
        const id = mapRule(w.rule, w.text);
        const ruleId = id || ('LINT:' + w.rule);
        const text = String(w.text || '').replace(/\s*\([^()]*\)\s*$/, '').replace(/^\[[A-Z]+-\d{2}\]\s*/, '');
        findings.push(fp.complete(root, {
          ruleId, severity: id ? severityFor(id, w.severity) : (w.severity === 'error' ? 'warning' : 'info'),
          file: rel, line: w.line || 1, endLine: w.endLine || w.line || 1,
          message: `${text}${w.rule && !w.rule.startsWith('ui-guard/') ? ` (${w.rule})` : ''}`,
          fix: null, checker: 'stylelint', sources: ['lint'], status: 'confirmed', rejectReason: null,
        }));
      }
      for (const pe of res.parseErrors || []) {
        findings.push(fp.complete(root, { ruleId: 'LINT:parse', severity: 'warning', file: rel, line: pe.line || 1, message: 'Stylelint could not parse: ' + pe.text, checker: 'stylelint', sources: ['lint'], status: 'confirmed', rejectReason: null }));
      }
    }
  }
  return { available: true, findings };
}

/** ESLint over html/ts files. */
function eslint(root, files, { timeoutMs = 600000 } = {}) {
  if (!files.length) return { available: true, findings: [] };
  const bin = resolveBin(root, 'eslint', 'eslint');
  if (!bin) return { available: false, reason: 'eslint is not installed in this project', findings: [] };
  const cfg = eslintConfig(root);
  if (!cfg) return { available: false, reason: 'no ui-guard ESLint config (.ui-guard/lint/eslint.config.*)', findings: [] };
  const findings = [];
  const tmpOut = path.join(paths(root).tmp, `eslint-${process.pid}.json`);
  u.mkdirp(path.dirname(tmpOut));
  const once = (part) => {
    const r = runNode(root, bin, ['--config', cfg, '--format', 'json', '--output-file', tmpOut, '--no-error-on-unmatched-pattern', ...part.map((f) => u.fromPosix(root, f))], timeoutMs);
    let data = u.readJSON(tmpOut);
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
    if (!Array.isArray(data)) { try { data = JSON.parse(r.stdout || 'null'); } catch { data = null; } }
    const err = String(r.stderr || r.stdout || (r.error && r.error.message) || 'unknown error');
    return { data, reason: (err.split(/\r?\n/).find((l) => /Error|error/.test(l)) || err.split(/\r?\n/)[0] || 'unknown error').trim() };
  };
  for (const part of chunk(files, 200)) {
    // ESLint can crash (e.g. eslint-scope TypeError on ESLint 10.15): retry once with the project's own ESLint,
    // then give up and report the ESLint rules as NOT CHECKED. They are never routed to the AI silently.
    let res = once(part);
    if (!Array.isArray(res.data)) res = once(part);
    const data = res.data;
    if (!Array.isArray(data)) return { available: false, failed: true, reason: 'ESLint failed: ' + u.clip(res.reason, 200), findings: [] };
    for (const res of data) {
      const rel = u.relPosix(root, res.filePath);
      for (const m of res.messages || []) {
        const id = m.ruleId ? mapRule(m.ruleId, m.message) : null;
        const ruleId = id || (m.ruleId ? 'LINT:' + m.ruleId : 'LINT:parse');
        findings.push(fp.complete(root, {
          ruleId, severity: id ? severityFor(id, 'warning') : (m.fatal ? 'warning' : 'info'),
          file: rel, line: m.line || 1, endLine: m.endLine || m.line || 1,
          message: `${m.message}${m.ruleId ? ` (${m.ruleId})` : ''}`, fix: null, checker: 'eslint', sources: ['lint'], status: 'confirmed', rejectReason: null,
        }));
      }
    }
  }
  return { available: true, findings };
}

/** Lint any mix of files: routes scss/css to Stylelint, html/ts/js to ESLint (Razor .cshtml has no linter: scripts + AI). */
function lintFiles(root, files) {
  const style = files.filter((f) => /\.(s?css)$/.test(f) && !/\/packages\//.test(f));
  const code = files.filter((f) => /\.(html|ts|js)$/.test(f) && !/\.(spec|d)\.ts$/.test(f) && !/\.min\.js$/.test(f));
  const s = stylelint(root, style);
  const e = eslint(root, code);
  return {
    findings: [...s.findings, ...e.findings], notices: [s, e].filter((x) => !x.available).map((x) => x.reason),
    stylelint: s.available, eslint: e.available,
    notChecked: { ...(s.available || !style.length ? {} : { stylelint: s.reason }), ...(e.available || !code.length ? {} : { eslint: e.reason }) },
  };
}

module.exports = { resolveBin, stylelint, eslint, lintFiles, mapRule, stylelintConfig, eslintConfig };
if (require.main === module) {
  const a = u.parseArgs(process.argv.slice(2));
  u.helpExit(a, `lint.js — run the project's Stylelint/ESLint on files and print ui-guard findings.
Usage: node lint.js --root <project> <file...>     (files relative to the project root)
       --out <file.jsonl>   write findings as JSON lines instead of printing a summary`);
  const root = path.resolve(a.root || process.cwd());
  const res = lintFiles(root, a._.map((f) => f.split(path.sep).join('/')));
  if (a.out) u.writeJSONL(path.resolve(a.out), res.findings);
  for (const n of res.notices) console.log('ui-guard: ' + n);
  console.log(`${res.findings.length} lint finding(s)` + (a.out ? ` → ${a.out}` : ''));
  if (!a.out) for (const f of res.findings) console.log(`${f.file}:${f.line} ${f.ruleId} ${f.message}`);
}
