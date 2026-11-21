#!/usr/bin/env node
'use strict';
// Dev check: for every ui-code-review rule ID with a severity, the ui-guard rule(s) that implement it are at least as strict.
// ui-code-review posts Error and Warning (AXIS Critical / High) as comments, so ui-guard must report them as error or warning
// (both block /ui-guard:check). A ucr Info / Medium may be anything. Usage: node scripts/dev/ucr-severity.js [--ucr <path>]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const ai = process.argv.indexOf('--ucr');
const UCR = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.resolve(ROOT, '..', 'ui-code-review');
const read = (p) => fs.readFileSync(p, 'utf8');

const ucrSev = new Map(); // id -> 'block' | 'info'
const LEVEL = { error: 'block', warning: 'block', critical: 'block', high: 'block', info: 'info', medium: 'info', low: 'info' };
// family tables: | ID | Severity | …
for (const n of ['i18n', 'security', 'performance', 'fix']) {
  for (const m of read(path.join(UCR, 'rules', n + '.md')).matchAll(/^\|\s*((?:I18N|SEC|PERF|FIX)-\d+)\s*\|\s*\**(\w+)/gm)) {
    const lv = LEVEL[m[2].toLowerCase()]; if (lv) ucrSev.set(m[1], lv);
  }
}
// AXIS rule tables: rows that hold an R-ID and a Critical / High / Medium / Low cell
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.md')) out.push(p); } return out; }
for (const f of walk(path.join(UCR, 'skills', 'axis-scss', 'docs'))) {
  for (const line of read(f).split('\n')) {
    if (!line.startsWith('|')) continue;
    const id = /\|\s*\**(R-(?:[A-Z]+-)?\d+)\**\s*\|/.exec(line);
    const sev = /\|\s*\**(Critical|High|Medium|Low)\**\s*\|?\s*$/.exec(line.trim());
    if (id && sev && !ucrSev.has(id[1])) ucrSev.set(id[1], LEVEL[sev[1].toLowerCase()]);
  }
}
for (const a of ['LABELS', 'ALT', 'ARIA', 'SEMANTICS', 'KEYBOARD']) ucrSev.set('A11Y-' + a, 'block'); // a11y.md: Warning

const rules = JSON.parse(read(path.join(ROOT, 'rules', 'rules.json'))).rules;
const implementers = (id) => rules.filter((r) => [].concat(r.axis || [], r.ucr || []).some((x) => String(x).split(/[,\s،]+/).includes(id)));
const A11Y = { 'A11Y-LABELS': 'ACCESS-01', 'A11Y-ALT': 'ACCESS-02', 'A11Y-ARIA': 'ACCESS-03', 'A11Y-SEMANTICS': 'ACCESS-04', 'A11Y-KEYBOARD': 'ACCESS-05' };
const styleText = read(path.join(ROOT, 'rules', 'style.md'));
const weak = [], noJson = [];
for (const [id, lv] of [...ucrSev].sort()) {
  let impl = A11Y[id] ? rules.filter((r) => r.id === A11Y[id]) : implementers(id);
  if (!impl.length) {
    // ranges "R-13–R-18" in rules.json / style.md
    const n = /^R-(\d+)$/.exec(id);
    if (n) impl = rules.filter((r) => [].concat(r.axis || []).some((x) => { const m = /^R-(\d+)\s*[–-]\s*R-(\d+)$/.exec(String(x)); return m && +n[1] >= +m[1] && +n[1] <= +m[2]; }));
  }
  if (!impl.length) { noJson.push(id + (styleText.includes(id) ? ' (named in style.md text)' : '')); continue; }
  if (lv === 'block' && !impl.some((r) => r.severity === 'error' || r.severity === 'warning')) weak.push(`${id} (${lv}) → ${impl.map((r) => r.id + ':' + r.severity).join(', ')}`);
}
console.log(`ui-code-review IDs with a severity: ${ucrSev.size} · weaker in ui-guard: ${weak.length} · not in rules.json axis/ucr: ${noJson.length}`);
for (const w of weak) console.log('  WEAKER ' + w);
for (const w of noJson) console.log('  TEXT-ONLY ' + w);
process.exit(weak.length ? 1 : 0);
