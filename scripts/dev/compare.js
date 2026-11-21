// Compare ui-code-review comments (ucr-out/findings.json) with ui-guard check findings (deterministic + reviewer rows).
// A ucr comment is "caught" when ui-guard has a finding of the matching family on the same file within ±1 line
// with severity error or warning (those block /ui-guard:check).
const fs = require('fs');
const path = require('path');
const P = 'D:/plugin/ucr-compare/proj/.ui-guard/tmp/check';
const readJL = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const ucrRaw = JSON.parse(fs.readFileSync('D:/plugin/ucr-compare/ucr-out/findings.json', 'utf8'));
const ucr = Array.isArray(ucrRaw) ? ucrRaw : ucrRaw.findings;
const ug = [...readJL(path.join(P, 'deterministic.jsonl')), ...fs.readdirSync(P).filter((n) => /^R-.*\.jsonl$/.test(n)).flatMap((n) => readJL(path.join(P, n)))];
// /ui-guard:check's asset step (blocks the push): MEDIA-07
const ch = JSON.parse(fs.readFileSync(path.join(P, 'changes.json'), 'utf8'));
for (const a of ch.newAssets || []) ug.push({ ruleId: 'MEDIA-07', severity: 'warning', file: a.file, line: a.line, message: a.problem });
for (const a of ch.bigAssets || []) ug.push(a);
const rules = JSON.parse(fs.readFileSync('D:/plugin/ui-guard/rules/rules.json', 'utf8')).rules;
const sevOf = (id) => (rules.find((r) => r.id === id) || {}).severity;
const fam = (id) => /^R-|^A11Y-CSS/.test(id) ? 'STYLE' : /^I18N/.test(id) ? 'LANG' : /^SEC/.test(id) ? 'SAFE' : /^PERF/.test(id) ? 'MEDIA' : /^A11Y/.test(id) ? 'ACCESS' : id.split('-')[0];
const ugFam = (id) => { const f = id.split('-')[0]; return f === 'MEDIA' && false ? f : f; };
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^.*?proj\//, '');
const blocking = (f) => { const s = (f.severity || sevOf(f.ruleId) || '').toLowerCase(); return s === 'error' || s === 'warning'; };
const A = { 'A11Y-LABELS': [1, 6, 7, 22], 'A11Y-ALT': [2, 7, 19], 'A11Y-ARIA': [3, 13, 14, 15], 'A11Y-SEMANTICS': [4, 9, 10, 12, 20], 'A11Y-KEYBOARD': [5, 16] };
const SEC = { 1: 1, 2: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 10: 8, 3: 9, 9: 10 };
const pad = (n) => String(n).padStart(2, '0');
function MAP(id) {
  if (A[id]) return (g) => A[id].map((n) => 'ACCESS-' + pad(n)).includes(g);
  let m;
  if ((m = /^I18N-(\d+)/.exec(id))) return (g) => g === 'LANG-' + pad(+m[1]);
  if ((m = /^SEC-(\d+)/.exec(id))) return (g) => g === 'SAFE-' + pad(SEC[+m[1]]);
  if ((m = /^PERF-(\d+)/.exec(id))) return (g) => g === 'MEDIA-' + pad(+m[1]) || (+m[1] === 1 && g === 'ACCESS-21') || (+m[1] === 2 && g === 'MEDIA-02');
  return (g) => g.startsWith('STYLE-');
}
let caught = 0; const missed = [], weak = [];
for (const c of ucr) {
  const file = norm(c.file || c.path), line = +c.line, want = fam(c.ruleId);
  // ACCESS-21 is the fix-rule twin of MEDIA-01; images' alt is ACCESS too
  const ok = MAP(c.ruleId); const hits = ug.filter((g) => norm(g.file) === file && Math.abs((+g.line) - line) <= 1 && ok(g.ruleId));
  if (!hits.length) missed.push(c);
  else if (!hits.some(blocking)) weak.push([c, hits]);
  else caught++;
}
console.log(`ui-code-review comments: ${ucr.length} · caught by ui-guard (blocking): ${caught} · caught but info only: ${weak.length} · missed: ${missed.length}`);
console.log(`ui-guard findings on the change: ${ug.length}`);
for (const c of missed) console.log(`  MISSED ${c.ruleId} ${norm(c.file || c.path)}:${c.line} — ${String(c.message || c.issue).slice(0, 140)}`);
for (const [c, h] of weak) console.log(`  INFO-ONLY ${c.ruleId} ${norm(c.file || c.path)}:${c.line} ← ${h.map((x) => x.ruleId + ':' + (x.severity || sevOf(x.ruleId))).join(',')}`);
// ui-guard extra (no ucr comment within ±1 on same file+family)
const extra = ug.filter((g) => blocking(g) && !ucr.some((c) => norm(c.file || c.path) === norm(g.file) && Math.abs(+c.line - +g.line) <= 1 && fam(c.ruleId) === ugFam(g.ruleId)));
console.log(`ui-guard blocking findings with no matching ucr comment (stricter): ${extra.length}`);
for (const g of extra) console.log(`  EXTRA ${g.ruleId} ${norm(g.file)}:${g.line} — ${String(g.message).slice(0, 110)}`);
