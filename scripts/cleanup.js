#!/usr/bin/env node
'use strict';
// ui-guard cleanup — the last step of EVERY command (scan, fix, init, check, assets) (0 tokens, no questions).
// Whitelist: deletes ONLY scratch that ui-guard's own scripts create under <root>/.ui-guard/tmp/, never anything else,
// never anything outside .ui-guard/. Results (findings, reports, plans, baselines, summaries, lint configs, profile,
// the backup pointer, the pre-push marker, auth state) are not on the whitelist, so they are never touched.
// A cleanup problem never fails the run: exit code is always 0 (except a bad --root, which deletes nothing, also 0).
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const domains = require('./lib/domains');

const HELP = `cleanup.js — remove ui-guard's own scratch files after a finished scan or fix.
  node cleanup.js --root <project> [--domain scss|access|lang|safe] [--dry-run] [--keep-tmp] [--keep-screens]
  --domain    clean only that domain's scratch (default: every domain)
  --dry-run   list what would be deleted, delete nothing
  --keep-tmp  skip the cleanup completely (debugging)
  --keep-screens  clean everything except screenshots and diff images (debugging)
Deleted (inside .ui-guard/tmp/ only): <domain>/scan, <domain>/fix, <domain>/screens, screens/phase-<domain>-*, scan/ (shared
inventory, usage index), check/ (batches, reviewer output; only once the check finished), notice-<old date>, dev-server.json/.log (only when that process is gone), stylelint-*.json, eslint-*.json, *.pid.
Kept: findings.json, report.md, plan.md, plan.json, baseline.json, fix-summary.md, needs-decision.md, renames.md,
foundation-move.json, profile.md, lint/, tmp/backup.json, tmp/auth/, tmp/check-pass.json (the push marker the hooks read), checks/ (check reports), assets-baseline.json, ledger.json (what is known per file — never deleted). Also kept: a stopped scan's resume state
(tmp/<domain>/scan while a batch is not done, tmp/check until changes.js finish ran) and a failed fix phase's files + screenshots. Unknown files are never deleted.`;

const KEEP_ORDER = ['findings.json', 'report.md', 'plan.md', 'plan.json', 'baseline.json', 'fix-summary.md', 'needs-decision.md', 'renames.md', 'foundation-move.json', 'profile.md', 'lint/', 'checks/', 'assets-baseline.json', 'ledger.json'];

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

/** A scan that stopped: some batch of tmp/<domain>/scan/ai/state.json is not done. */
function scanIncomplete(scanDir) {
  const s = u.readJSON(path.join(scanDir, 'ai', 'state.json'), null);
  if (!s) return false;
  return (s.stages || []).some((sg) => (sg.batches || []).some((b) => b.status !== 'done'));
}
function failedIds(root, d) {
  const j = u.readJSON(domains.paths(root, d).planJson, null);
  const phases = (j && (j.phases || (j.data && j.data.phases))) || [];
  return phases.filter((p) => p && p.status === 'failed').map((p) => String(p.id));
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** fix scratch files (skipped / decisions / mechanical) with an item NOT yet in fix-summary.md / needs-decision.md: never deleted. */
function unrecorded(root, d, fixDir) {
  const p = domains.paths(root, d);
  const sum = u.readText(p.summary) || '', dec = u.readText(p.needsDecision) || '';
  const out = new Set();
  let names = [];
  try { names = fs.readdirSync(fixDir); } catch { return out; }
  for (const f of names) {
    const full = path.join(fixDir, f);
    try {
      if (/^mechanical-.*\.json$/.test(f)) { for (const x of (u.readJSON(full, {}).skipped || [])) if (!sum.includes(`${x.file} · ${x.what} — ${x.reason}`)) out.add(full); }
      else if (/^skipped-.*\.jsonl$/.test(f)) { for (const x of u.readJSONL(full)) if (!x.__malformed && !sum.includes(`${x.file || ''}${x.line ? ':' + x.line : ''} · ${x.what || x.ruleId || ''} — ${x.reason || ''}`)) out.add(full); }
      else if (/^decisions-.*\.jsonl$/.test(f)) { for (const x of u.readJSONL(full)) if (!x.__malformed && !dec.includes('`' + x.file + (x.line ? ':' + x.line : '') + '` — ' + x.issue)) out.add(full); }
    } catch { out.add(full); }
  }
  return out;
}

function cleanup(root, opts = {}) {
  const res = { files: 0, bytes: 0, failed: [], refused: [], kept: [], notes: [], dryRun: !!opts.dryRun, skipped: false };
  const keepScreens = !!opts.keepScreens;
  if (opts.keepTmp) { res.skipped = true; res.notes.push('--keep-tmp: cleanup skipped'); return res; }
  root = path.resolve(root);
  const ug = path.join(root, '.ui-guard');
  let ugReal;
  try { ugReal = fs.realpathSync(ug); } catch { return res; } // no .ui-guard: nothing to clean
  const tmp = path.join(ug, 'tmp');
  let tmpReal = null;
  try { tmpReal = fs.realpathSync(tmp); } catch { /* no tmp */ }
  // 'html' = the scratch of /ui-guard:scan html (tmp/html/scan), cleaned like a domain scan (kept while its AI pass is not done)
  const names = opts.domain ? [opts.domain] : [...domains.NAMES, 'html'];

  const refuse = (p, why) => res.refused.push(`${path.relative(root, p).split(path.sep).join('/')} (${why})`);
  /** the real parent directory must be inside .ui-guard/ (never .ui-guard itself as a target) */
  function safe(p) {
    let parent;
    try { parent = fs.realpathSync(path.dirname(p)); } catch { return false; }
    return parent === ugReal || inside(ugReal, parent);
  }
  function drop(p, isDir) {
    try { fs.rmdirSync(p); } catch (e) { if (isDir && e.code !== 'ENOTEMPTY' && e.code !== 'ENOENT') res.failed.push(path.relative(root, p).split(path.sep).join('/')); }
  }
  /** delete one tree; never follows symlinks; `keep(abs)` protects entries (evidence). Returns true when anything was kept. */
  function sweep(p, keep) {
    let st;
    try { st = fs.lstatSync(p); } catch { return false; }
    if (keep && keep(p)) return true;
    if (!safe(p)) { refuse(p, 'outside .ui-guard'); return true; }
    if (st.isSymbolicLink()) {
      let real = null;
      try { real = fs.realpathSync(p); } catch { /* broken link */ }
      if (!real || !inside(ugReal, real)) { refuse(p, 'symlink leaves .ui-guard'); return true; }
      if (!res.dryRun) { try { fs.unlinkSync(p); } catch { res.failed.push(path.relative(root, p).split(path.sep).join('/')); return true; } }
      res.files++;
      return false;
    }
    if (st.isDirectory()) {
      let kept = false;
      for (const n of fs.readdirSync(p)) kept = sweep(path.join(p, n), keep) || kept;
      if (!kept && !res.dryRun) drop(p, true);
      return kept;
    }
    if (!res.dryRun) {
      try { fs.unlinkSync(p); } catch { res.failed.push(path.relative(root, p).split(path.sep).join('/')); return true; }
    }
    res.files++; res.bytes += st.size;
    return false;
  }

  if (tmpReal && inside(ugReal, tmpReal)) {
    const incomplete = names.filter((d) => scanIncomplete(domains.paths(root, d).scan));
    for (const d of names) {
      const p = domains.paths(root, d);
      const failed = failedIds(root, d);
      if (incomplete.includes(d)) res.notes.push(`${d}: scan not finished — kept tmp/${d}/scan (resume with /ui-guard:scan ${d})`);
      else sweep(p.scan);
      // a failed phase keeps its fix files and screenshots (before/after/diff) as evidence
      const fixKeep = failed.length ? (abs) => failed.some((id) => new RegExp(`(^|-)${esc(id)}(?=[.\\-]|$)`).test(path.basename(abs)) && path.dirname(abs) === p.fix) : null;
      const pending = unrecorded(root, d, p.fix);
      for (const f of pending) res.notes.push(`${d}: kept ${path.relative(root, f).split(path.sep).join('/')} — its items are not in fix-summary.md / needs-decision.md yet`);
      sweep(p.fix, (abs) => pending.has(abs) || (fixKeep && fixKeep(abs)));
      if (!keepScreens) sweep(p.screens);
      drop(p.tmp, true);
      const shots = path.join(tmp, 'screens');
      if (!keepScreens && fs.existsSync(shots)) {
        const keepShots = (abs) => failed.some((id) => path.basename(abs) === `phase-${d}-${id}`);
        for (const n of fs.readdirSync(shots)) if (n.startsWith(`phase-${d}-`)) sweep(path.join(shots, n), keepShots);
      }
      if (failed.length) res.notes.push(`${d}: failed phase ${failed.join(', ')} — evidence kept`);
    }
    drop(path.join(tmp, 'screens'), true);
    // /ui-guard:check scratch: only after finish wrote tmp/check/done.json (a stopped check keeps its batches to continue)
    const chk = path.join(tmp, 'check');
    if (fs.existsSync(chk)) {
      if (fs.existsSync(path.join(chk, 'done.json'))) sweep(chk);
      else res.notes.push('check not finished — kept tmp/check (continue /ui-guard:check)');
    }
    try { for (const n of fs.readdirSync(tmp)) if (/^notice-\d{4}-\d{2}-\d{2}$/.test(n) && n !== 'notice-' + u.today()) sweep(path.join(tmp, n)); } catch { /* ignore */ }
    // shared scratch
    if (!incomplete.length) sweep(path.join(tmp, 'scan'));
    const ds = path.join(tmp, 'dev-server.json');
    const dst = u.readJSON(ds, null);
    if (fs.existsSync(ds)) {
      if (dst && dst.pid && pidAlive(dst.pid)) res.notes.push(`dev server PID ${dst.pid} still running — its state file was kept`);
      else { sweep(ds); sweep(path.join(tmp, 'dev-server.log')); }
    } else sweep(path.join(tmp, 'dev-server.log'));
    try { for (const n of fs.readdirSync(tmp)) if (/^(stylelint|eslint)-\d+\.json$/.test(n) || /\.pid$/.test(n)) sweep(path.join(tmp, n)); } catch { /* ignore */ }
  } else if (tmpReal) refuse(tmp, 'tmp resolves outside .ui-guard');

  for (const k of KEEP_ORDER) {
    const found = [ug, ...names.map((d) => domains.paths(root, d).dir)].some((b) => fs.existsSync(path.join(b, k.replace(/\/$/, ''))));
    if (found) res.kept.push(k);
  }
  return res;
}

function format(res) {
  if (res.skipped) return 'cleanup skipped (--keep-tmp)';
  const mb = (res.bytes / 1048576).toFixed(res.bytes && res.bytes < 10485.76 ? 2 : 1);
  const lines = [`${res.dryRun ? '[dry-run] would clean' : 'cleaned'} ${res.files} files (${mb} MB) · kept: ${res.kept.join(', ') || '(none yet)'}`];
  for (const n of res.notes) lines.push(`note: ${n}`);
  if (res.failed.length) lines.push(`not deleted (locked or in use): ${res.failed.join(', ')}`);
  if (res.refused.length) lines.push(`refused (not safe to delete): ${res.refused.join(', ')}`);
  return lines.join('\n');
}

/** Called by the LAST script of every flow (plan.js, phase.js summary, fingerprint.js --empty-baseline, changes.js finish, assets.js).
 *  Prints nothing itself; returns the one line to show. Same rules and keep list as the CLI. Never throws. `a` = parsed CLI args of the caller. */
function finish(root, a = {}) {
  try {
    const dom = a.domain && (domains.get(a.domain) || a.domain === 'html') ? a.domain : null;
    return format(cleanup(root, { domain: dom, keepTmp: !!a['keep-tmp'], keepScreens: !!a['keep-screens'] }));
  } catch (e) { return `cleanup: skipped (${e && e.message}) — results are untouched`; }
}

module.exports = { cleanup, format, finish };

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['dry-run', 'keep-tmp', 'keep-screens', 'help']);
  u.helpExit(args, HELP);
  try {
    if (args.domain && !domains.get(args.domain) && args.domain !== 'html') { console.log(`cleanup: unknown domain "${args.domain}" — nothing cleaned`); process.exit(0); }
    const res = cleanup(args.root || process.cwd(), { domain: args.domain || null, dryRun: !!args['dry-run'], keepTmp: !!args['keep-tmp'], keepScreens: !!args['keep-screens'] });
    console.log(format(res));
  } catch (e) { console.log(`cleanup: skipped (${e && e.message}) — results are untouched`); }
  process.exit(0);
}
