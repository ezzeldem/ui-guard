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

function loadBaseline(root) {
  const b = u.readJSON(paths(root).baseline, null);
  if (!b) return new Set();
  const list = Array.isArray(b) ? b : (b.fingerprints || []);
  return new Set(list);
}
function saveBaseline(root, fps, meta = {}) {
  u.writeJSON(paths(root).baseline, { note: 'Fingerprints of confirmed, not-yet-fixed findings. Written by ui-guard. Do not edit by hand.', updated: new Date().toISOString(), ...meta, fingerprints: [...new Set(fps)].sort() });
}
/** Split findings into those already in the baseline and new ones. */
function filterNew(findings, baseline) {
  const fresh = [], known = [];
  for (const f of findings) (baseline.has(f.fingerprint) ? known : fresh).push(f);
  return { fresh, known };
}
function removeFromBaseline(root, fps) {
  const b = loadBaseline(root);
  for (const fp of fps) b.delete(fp);
  saveBaseline(root, [...b]);
  return b.size;
}

module.exports = { normalizeLine, fingerprint, fileLine, clearCache, complete, loadBaseline, saveBaseline, filterNew, removeFromBaseline };
// Allow `node fingerprint.js --help`
if (require.main === module) {
  const a = u.parseArgs(process.argv.slice(2));
  u.helpExit(a, `fingerprint.js — library (fingerprints + baseline). Usage from CLI:
  node fingerprint.js <ruleId> <file> "<line text>"   prints the fingerprint
  node fingerprint.js --empty-baseline --root <dir>    writes an empty .ui-guard/baseline.json (new projects)`);
  if (a['empty-baseline']) { const root = require('path').resolve(a.root || process.cwd()); saveBaseline(root, []); console.log('empty baseline written → .ui-guard/baseline.json'); }
  else if (a._.length >= 3) console.log(fingerprint(a._[0], a._[1], a._[2]));
  else console.log('Library module. Run with --help.');
  void path;
}
