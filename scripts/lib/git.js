'use strict';
// Read-only git helpers (P1). Only status, diff, log, rev-parse, merge-base, ls-files and `config --get` are run.
const { spawnSync } = require('child_process');

const ALLOWED = new Set(['status', 'diff', 'log', 'rev-parse', 'merge-base', 'ls-files', 'config', 'show-ref', 'symbolic-ref']);

function git(root, args, { allowFail = true } = {}) {
  if (!ALLOWED.has(args[0])) throw new Error(`ui-guard refuses to run git ${args[0]} (read-only policy)`);
  if (args[0] === 'config' && !args.includes('--get')) throw new Error('ui-guard only reads git config (--get)');
  if (args[0] === 'symbolic-ref' && args.length > 2 && !args.includes('-q')) throw new Error('ui-guard only reads symbolic refs');
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}`);
  }
  return r.stdout;
}
const lines = (s) => (s ? s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);

function isRepo(root) { return (git(root, ['rev-parse', '--is-inside-work-tree']) || '').trim() === 'true'; }
function head(root) { return (git(root, ['rev-parse', 'HEAD']) || '').trim() || null; }
function shortHead(root) { return (git(root, ['rev-parse', '--short', 'HEAD']) || '').trim() || 'nohead'; }
function upstream(root) { return (git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || '').trim() || null; }
function refExists(root, ref) { return !!git(root, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); }

/** Base to compare against: upstream, else merge-base with origin/HEAD, main, master, develop. */
function defaultBase(root, explicitRef) {
  if (explicitRef) {
    const mb = (git(root, ['merge-base', explicitRef, 'HEAD']) || '').trim();
    return mb || explicitRef;
  }
  const up = upstream(root);
  if (up) {
    const mb = (git(root, ['merge-base', up, 'HEAD']) || '').trim();
    if (mb) return mb;
  }
  const originHead = (git(root, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']) || '').trim();
  const candidates = [originHead, 'origin/main', 'origin/master', 'origin/develop', 'main', 'master', 'develop'].filter(Boolean);
  for (const c of candidates) {
    if (!refExists(root, c)) continue;
    const mb = (git(root, ['merge-base', c, 'HEAD']) || '').trim();
    if (mb) return mb;
  }
  return null;
}

/** Files changed between base and HEAD, plus uncommitted and untracked files. */
function changedFiles(root, base, { includeWorking = true } = {}) {
  const set = new Set();
  if (base) lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`])).forEach((f) => set.add(f));
  if (includeWorking) {
    lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])).forEach((f) => set.add(f));
    lines(git(root, ['ls-files', '--others', '--exclude-standard'])).forEach((f) => set.add(f));
  }
  return [...set].sort();
}

/** Files changed between two commits (pre-push). */
function filesBetween(root, from, to) { return lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', `${from}..${to}`])); }

/** Changed line ranges per file from `git diff -U0` (new side). Untracked files → whole file. */
function changedRanges(root, base, files) {
  const out = {};
  const args = ['diff', '-U0', '--no-color'];
  if (base) args.push(base); else args.push('HEAD');
  args.push('--', ...files);
  const diff = git(root, args) || '';
  let cur = null;
  for (const line of diff.split(/\r?\n/)) {
    const m = /^\+\+\+ b\/(.*)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = out[cur] || []; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (h && cur) {
      const start = +h[1], count = h[2] === undefined ? 1 : +h[2];
      if (count > 0) out[cur].push([start, start + count - 1]);
    }
  }
  const untracked = new Set(lines(git(root, ['ls-files', '--others', '--exclude-standard'])));
  for (const f of files) if (untracked.has(f)) out[f] = [[1, Number.MAX_SAFE_INTEGER]];
  return out;
}

function diffText(root, base) { return git(root, ['diff', '--no-color', base ? `${base}..HEAD` : 'HEAD']) || ''; }
function workingDiff(root, files) { return git(root, ['diff', '--no-color', 'HEAD', '--', ...files]) || ''; }
function dirtyFiles(root, files) { return lines(git(root, ['status', '--porcelain', '--', ...files])).map((l) => l.slice(3)); }
function getConfig(root, key) { return (git(root, ['config', '--get', key]) || '').trim() || null; }

module.exports = { git, isRepo, head, shortHead, upstream, refExists, defaultBase, changedFiles, filesBetween, changedRanges, diffText, workingDiff, dirtyFiles, getConfig };
if (require.main === module) {
  console.log('git.js — read-only git helpers library. Allowed: status, diff, log, rev-parse, merge-base, ls-files, config --get.');
}
