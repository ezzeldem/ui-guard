#!/usr/bin/env node
'use strict';
// SAFE-04 candidates — every candidate must be confirmed or rejected (with reason) by the AI. Values are never printed in full.
const u = require('./lib/util');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const PATTERNS = [
  { re: /\b([A-Za-z_]*(?:api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|private[_-]?key|access[_-]?token|auth[_-]?token|bearer|connection[_-]?string)[A-Za-z_]*)["']?\s*[:=]\s*(["'`])([^"'`\s]{6,})\2/gi, name: 1, value: 3 },
  { re: /\b(AKIA[0-9A-Z]{16})\b/g, value: 1, label: 'AWS access key id' },
  { re: /\b(AIza[0-9A-Za-z_-]{35})\b/g, value: 1, label: 'Google API key' },
  { re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, value: 1, label: 'JWT' },
  { re: /(-----BEGIN [A-Z ]*PRIVATE KEY-----)/g, value: 1, label: 'private key block' },
  { re: /((?:Server|Data Source)=[^;"']+;[^"']*(?:Password|Pwd)=[^;"']+)/gi, value: 1, label: 'connection string' },
  { re: /\b(sk_live_[0-9A-Za-z]{10,}|ghp_[0-9A-Za-z]{30,}|xox[baprs]-[0-9A-Za-z-]{10,})/g, value: 1, label: 'service token' },
];

function mask(v) { return String(v).slice(0, 4) + '…'; }

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile).filter((f) => ['ts', 'config', 'html', 'index', 'cshtml', 'js'].includes(f.kind));
  for (const f of files) {
    if (f.rel === 'angular.json') continue;
    const text = u.readText(f.abs) || '';
    const idx = u.lineIndexer(text);
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const value = m[p.value];
        if (/^(\$\{|\{\{|environment\.|process\.env|<|your|xxx|changeme|example|placeholder|\*+$)/i.test(value)) continue;
        if (p.name && /^(password|confirmPassword|newPassword|oldPassword)$/i.test(m[p.name]) && /^[A-Za-z.]+$/.test(value) && value.length < 12 && /(form|control|field|label|key)/i.test(value)) continue;
        const label = p.label || `\`${m[p.name]}\``;
        findings.push(mk(root, 'SAFE-04', f.rel, idx(m.index), `Candidate secret: ${label} = \`${mask(value)}\` — confirm by hand (or with --ai stage 2); public-by-design values are not defects.`, 'If real: move the secret to the server and rotate it.', { severity: 'warning', evidence: `${p.name ? m[p.name] : label}: ${mask(value)}` }));
      }
    }
  }
  return findings;
}

module.exports = { run, mask };
if (require.main === module) cli('secrets-check', 'secrets-check.js — SAFE-04 candidates (API keys, secrets, passwords, tokens, connection strings) in TS, configs and HTML. Values are masked.', run);
