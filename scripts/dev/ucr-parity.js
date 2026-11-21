#!/usr/bin/env node
'use strict';
// Dev check (not shipped behaviour): every rule ID that ui-code-review defines must be implemented somewhere in ui-guard —
// rules.json (`axis`, `ucr`, `source`) or the text of rules/*.md.
// Usage: node scripts/dev/ucr-parity.js [--ucr <path to ui-code-review>]   exit 1 when an ID is missing.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argi = process.argv.indexOf('--ucr');
const UCR = argi > 0 ? path.resolve(process.argv[argi + 1]) : path.resolve(ROOT, '..', 'ui-code-review');
if (!fs.existsSync(UCR)) { console.error(`ui-code-review not found at ${UCR} (use --ucr <path>)`); process.exit(2); }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(md|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
// IDs as ui-code-review writes them: AXIS R-01, R-COMP-3; I18N-01, SEC-01, PERF-01, FIX-01; A11Y-LABELS …
const ID = /\b(R-(?:[A-Z]+-)?\d+|(?:I18N|SEC|PERF|FIX)-\d+|A11Y-[A-Z]+)\b/g;
const defined = new Map();
for (const f of walk(UCR)) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(ID)) if (!defined.has(m[1])) defined.set(m[1], path.relative(UCR, f));
}
// A11Y areas map to ACCESS-01..05 (rules/access.md names them).
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'rules.json'), 'utf8')).rules;
const have = new Set();
for (const r of rules) for (const k of ['axis', 'ucr']) for (const v of [].concat(r[k] || [])) for (const m of String(v).matchAll(ID)) have.add(m[1]);
const text = fs.readdirSync(path.join(ROOT, 'rules')).filter((n) => n.endsWith('.md')).map((n) => fs.readFileSync(path.join(ROOT, 'rules', n), 'utf8')).join('\n');
for (const m of text.matchAll(ID)) have.add(m[1]);
// R-01..R-36 ranges written as "R-13–R-18"
for (const m of text.matchAll(/\bR-(\d+)\s*[–-]\s*R-(\d+)\b/g)) for (let i = +m[1]; i <= +m[2]; i++) have.add('R-' + String(i).padStart(2, '0'));

const missing = [...defined.keys()].filter((id) => !have.has(id)).sort();
console.log(`ui-code-review rule IDs: ${defined.size} · found in ui-guard: ${defined.size - missing.length} · missing: ${missing.length}`);
for (const id of missing) console.log(`  MISSING ${id}  (first seen in ${defined.get(id)})`);
process.exit(missing.length ? 1 : 0);
