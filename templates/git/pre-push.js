#!/usr/bin/env node
'use strict';
// ui-guard pre-push check (self-contained copy — works without Claude and without the plugin).
// Reads the pushed refs from stdin, lints the changed UI files with the project's Stylelint/ESLint,
// filters by .ui-guard/baseline.json and exits 1 on NEW errors. Read-only git only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ZERO = /^0+$/;
const root = (spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout || '').trim() || process.cwd();
const ug = path.join(root, '.ui-guard');
const git = (args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); return r.status === 0 ? r.stdout : ''; };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function defaultBase(localSha) {
  const head = (git(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']) || '').trim();
  for (const c of [head, 'origin/main', 'origin/master', 'origin/develop', 'main', 'master', 'develop'].filter(Boolean)) {
    if (!git(['rev-parse', '--verify', '--quiet', c + '^{commit}']).trim()) continue;
    const mb = git(['merge-base', c, localSha]).trim();
    if (mb && mb !== localSha) return mb;
  }
  return null;
}

function changed(lines) {
  const set = new Set();
  for (const line of lines) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha) || /^refs\/tags\//.test(localRef || '')) continue; // deletes / tags
    const base = remoteSha && !ZERO.test(remoteSha) && git(['rev-parse', '--verify', '--quiet', remoteSha + '^{commit}']).trim() ? remoteSha : defaultBase(localSha);
    const out = base ? git(['diff', '--name-only', '--diff-filter=ACMR', `${base}..${localSha}`]) : git(['ls-files']);
    for (const f of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) set.add(f);
  }
  return [...set];
}

const EXCL = /(^|\/)(node_modules|dist|\.angular|coverage|\.ui-guard)\//;
const isUi = (f) => /\.(scss|css|html|ts)$/.test(f) && !EXCL.test(f) && !/\.(spec|d)\.ts$/.test(f) && !/\.min\./.test(f) && !/\/packages\//.test(f) && fs.existsSync(path.join(root, ...f.split('/')));

function bin(pkg, name) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const pj = path.join(dir, 'node_modules', pkg, 'package.json');
    const meta = readJSON(pj, null);
    if (meta) {
      const b = typeof meta.bin === 'string' ? meta.bin : meta.bin && (meta.bin[name] || Object.values(meta.bin)[0]);
      return b ? path.join(path.dirname(pj), b) : null;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

const map = readJSON(path.join(ug, 'lint', 'lint-map.json'), { lintMap: {}, severity: {} });
const idOf = (rule, text) => { const m = /\[([A-Z]+-\d{2})\]/.exec(text || ''); return m ? m[1] : map.lintMap[rule] || null; };
const sevOf = (id, fallback) => (id && map.severity[id]) || fallback;
const fp = (ruleId, file, line) => {
  let text = '';
  try { text = fs.readFileSync(path.join(root, ...file.split('/')), 'utf8').split(/\r?\n/)[line - 1] || ''; } catch { /* ignore */ }
  return crypto.createHash('sha1').update(`${ruleId}|${file}|${text.trim().replace(/\s+/g, ' ')}`).digest('hex');
};

function run(cliBin, args, outFile) {
  spawnSync(process.execPath, [cliBin, ...args, outFile], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const data = readJSON(outFile, null);
  try { fs.unlinkSync(outFile); } catch { /* ignore */ }
  return data;
}

function main() {
  if (!fs.existsSync(path.join(ug, 'profile.md'))) return 0;
  const input = fs.readFileSync(0, 'utf8');
  const files = changed(input.split(/\r?\n/).filter(Boolean)).filter(isUi);
  if (!files.length) return 0;
  const tmp = path.join(ug, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const findings = [];
  const notes = [];
  const styles = files.filter((f) => /\.s?css$/.test(f));
  const code = files.filter((f) => /\.(html|ts)$/.test(f));
  const sl = bin('stylelint', 'stylelint');
  const slCfg = path.join(ug, 'lint', 'stylelint.config.mjs');
  if (styles.length) {
    if (!sl || !fs.existsSync(slCfg)) notes.push('Stylelint not installed/configured — SCSS not checked.');
    else {
      const data = run(sl, ['--config', slCfg, '--formatter', 'json', '--allow-empty-input', ...styles, '--output-file'], path.join(tmp, 'pp-stylelint.json'));
      for (const r of data || []) for (const w of r.warnings || []) { const id = idOf(w.rule, w.text) || 'LINT:' + w.rule; findings.push({ id, sev: sevOf(id, w.severity === 'error' ? 'warning' : 'info'), file: rel(r.source), line: w.line || 1, msg: w.text }); }
    }
  }
  const es = bin('eslint', 'eslint');
  const esCfg = ['eslint.config.mjs', 'eslint.config.js'].map((n) => path.join(ug, 'lint', n)).find((f) => fs.existsSync(f));
  if (code.length) {
    if (!es || !esCfg) notes.push('ESLint not installed/configured — templates/TS not checked.');
    else {
      const data = run(es, ['--config', esCfg, '--format', 'json', '--no-error-on-unmatched-pattern', ...code, '--output-file'], path.join(tmp, 'pp-eslint.json'));
      for (const r of data || []) for (const m of r.messages || []) { const id = idOf(m.ruleId, m.message) || 'LINT:' + (m.ruleId || 'parse'); findings.push({ id, sev: sevOf(id, 'info'), file: rel(r.filePath), line: m.line || 1, msg: m.message }); }
    }
  }
  const baseline = new Set((readJSON(path.join(ug, 'baseline.json'), { fingerprints: [] }).fingerprints) || []);
  const errors = findings.filter((f) => f.sev === 'error' && !baseline.has(fp(f.id, f.file, f.line)));
  for (const n of notes) process.stderr.write('ui-guard: ' + n + '\n');
  // Optional (installed with `setup-project.js githook --with-assets`): new missing asset references block the push.
  const assetsJs = path.join(ug, 'bin', 'assets.js');
  if (fs.existsSync(assetsJs)) {
    const a = spawnSync(process.execPath, [assetsJs, '--root', root, '--new-only'], { cwd: root, encoding: 'utf8' });
    if (a.status === 1) { process.stderr.write(`\nui-guard: push blocked — new missing asset(s):\n${a.stdout}`); return 1; }
  }
  if (errors.length) {
    process.stderr.write(`\nui-guard: push blocked — ${errors.length} new error(s):\n`);
    for (const e of errors) process.stderr.write(`  ${e.file}:${e.line}  ${e.id}  ${e.msg}\n`);
    process.stderr.write('Fix them and push again. (git push --no-verify skips this check.)\n');
    return 1;
  }
  process.stderr.write(`ui-guard: lint passed for ${files.length} changed UI file(s). AI review not run for pushes outside Claude — run /ui-guard:check when you want it.\n`);
  return 0;
}

try { process.exitCode = main(); } catch (e) { process.stderr.write('ui-guard: pre-push check skipped (' + e.message + ')\n'); process.exitCode = 0; }
