'use strict';
// Fingerprints and the baseline (§3.4).
const path = require('path');
const u = require('./util');
const { paths } = require('./project');

function normalizeLine(text) { return String(text || '').trim().replace(/\s+/g, ' '); }

/** sha1(ruleId | file | trimmed, whitespace-collapsed line text). Survives line shifts. */
function fingerprint(ruleId, file, lineText) { return u.sha1(`${ruleId}|${file}|${normalizeLine(lineText)}`); }

const lineCache = new Map();
const NO_TEXT = /\.(png|jpe?g|gif|bmp|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|ogg|mov|pdf)$/i;
function fileLine(root, rel, line) {
  // binary assets and build output have no stable line text: fingerprint = rule + file only
  if (NO_TEXT.test(rel) || /^dist\//.test(rel)) return '';
  const key = root + '|' + rel;
  if (!lineCache.has(key)) {
    const t = u.readText(u.fromPosix(root, rel));
    lineCache.set(key, t == null ? null : t.split(/\r?\n/));
  }
  const lines = lineCache.get(key);
  return lines ? (lines[(line || 1) - 1] || '') : '';
}
function clearCache() { lineCache.clear(); }

/** Make sure a finding has evidence + fingerprint, computed from the file on disk. */
function complete(root, f) {
  const lt = fileLine(root, f.file, f.line || 1);
  if (!f.evidence) f.evidence = u.clip(lt);
  else f.evidence = u.clip(f.evidence);
  if (!f.fingerprint) f.fingerprint = fingerprint(f.ruleId, f.file, lt);
  if (!f.endLine) f.endLine = f.line || 1;
  if (!f.line) f.line = 1;
  return f;
}

// Baselines are kept per domain (.ui-guard/<domain>/baseline.json). Hooks and /ui-guard:check read the UNION of every
// domain baseline (plus an older single .ui-guard/baseline.json, if one is still there), so a known issue never blocks.
const DOMAIN_NAMES = ['scss', 'access', 'lang', 'safe'];
const baselineFile = (root, domain) => (domain ? path.join(paths(root).ug, domain, 'baseline.json') : paths(root).baseline);
function readList(file) {
  const b = u.readJSON(file, null);
  if (!b) return [];
  return Array.isArray(b) ? b : (b.fingerprints || []);
}
function loadBaseline(root, domain) {
  if (domain) return new Set(readList(baselineFile(root, domain)));
  const all = new Set(readList(baselineFile(root)));
  for (const d of DOMAIN_NAMES) for (const f of readList(baselineFile(root, d))) all.add(f);
  return all;
}
function saveBaseline(root, fps, meta = {}, domain) {
  u.writeJSON(baselineFile(root, domain), { note: 'Fingerprints of confirmed, not-yet-fixed findings. Written by ui-guard. Do not edit by hand.', updated: new Date().toISOString(), ...(domain ? { domain } : {}), ...meta, fingerprints: [...new Set(fps)].sort() });
}
/** Split findings into those already in the baseline and new ones. */
function filterNew(findings, baseline) {
  const fresh = [], known = [];
  for (const f of findings) (baseline.has(f.fingerprint) ? known : fresh).push(f);
  return { fresh, known };
}
function removeFromBaseline(root, fps, domain) {
  const b = loadBaseline(root, domain);
  for (const fp of fps) b.delete(fp);
  saveBaseline(root, [...b], {}, domain);
  return b.size;
}

module.exports = { normalizeLine, fingerprint, fileLine, clearCache, complete, loadBaseline, saveBaseline, filterNew, removeFromBaseline, baselineFile, DOMAIN_NAMES };
// Allow `node fingerprint.js --help`
if (require.main === module) {
  const a = u.parseArgs(process.argv.slice(2));
  u.helpExit(a, `fingerprint.js — library (fingerprints + baseline). Usage from CLI:
  node fingerprint.js <ruleId> <file> "<line text>"   prints the fingerprint
  node fingerprint.js --empty-baseline --root <dir>    writes empty .ui-guard/<domain>/baseline.json files (new projects)`);
  if (a['empty-baseline']) { const root = require('path').resolve(a.root || process.cwd()); for (const d of DOMAIN_NAMES) saveBaseline(root, [], {}, d); console.log('empty baselines written → .ui-guard/<domain>/baseline.json (scss, access, lang, safe)'); }
  else if (a._.length >= 3) console.log(fingerprint(a._[0], a._[1], a._[2]));
  else console.log('Library module. Run with --help.');
  void path;
}
