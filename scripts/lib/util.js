'use strict';
// Small shared helpers. Node built-ins only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Parse argv into { _: [positional], flag: value|true }. Supports --a=b, --a b, --flag. */
function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!booleans.includes(key) && next !== undefined && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

/** Print help and exit when --help is present. */
function helpExit(args, text) {
  if (args.help || args.h) { process.stdout.write(text.trim() + '\n'); process.exit(0); }
}

function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function readJSON(file, fallback = null) {
  const t = readText(file);
  if (t == null) return fallback;
  try { return JSON.parse(t.replace(/^﻿/, '')); } catch { return fallback; }
}
function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeText(file, text) { mkdirp(path.dirname(file)); fs.writeFileSync(file, text); }
function writeJSON(file, data) { writeText(file, JSON.stringify(data, null, 2) + '\n'); }
function readJSONL(file) {
  const t = readText(file);
  if (!t) return [];
  const out = [];
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* malformed line: reported by caller via count */ out.push({ __malformed: s.slice(0, 120) }); }
  }
  return out;
}
function writeJSONL(file, rows) { writeText(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

/** Forward-slash relative path (used in findings, fingerprints and reports — stable across OSes). */
function relPosix(root, p) { return path.relative(root, p).split(path.sep).join('/'); }
/** Turn a forward-slash relative path back into an OS path under root. */
function fromPosix(root, rel) { return path.join(root, ...rel.split('/')); }

/** Recursive file walk. skipDir(nameOrRel) → true to skip. */
function walk(dir, skipDir = () => false, out = [], root = dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDir(e.name, relPosix(root, full))) continue;
      walk(full, skipDir, out, root);
    } else if (e.isFile()) out.push(full);
  }
  return out;
}

/** Minimal glob → RegExp for forward-slash paths. Supports **, *, ?, {a,b}. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')';
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function globMatch(glob, rel) { return globToRegExp(glob).test(rel); }

/** Line number (1-based) of a character index. */
function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
/** Precomputed line index for many lookups. */
function lineIndexer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}
function lineText(text, line) { const lines = text.split(/\r?\n/); return lines[line - 1] || ''; }
function clip(s, n = 120) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function today() { return new Date().toISOString().slice(0, 10); }

module.exports = {
  parseArgs, helpExit, readText, readJSON, writeText, writeJSON, readJSONL, writeJSONL, mkdirp, exists, isDir,
  sha1, relPosix, fromPosix, walk, globToRegExp, globMatch, lineAt, lineIndexer, lineText, clip, today,
};
