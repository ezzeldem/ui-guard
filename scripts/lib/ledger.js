'use strict';
// The per-file LEDGER (.ui-guard/ledger.json) — script-owned, 0 tokens. One entry per UI file: its content fingerprint, cheap
// script-extracted facts, and per domain what is known about it (when it was scanned, against which fingerprint, its findings).
// TRUST RULE: a file's entry is valid for a domain ONLY while `scannedFingerprint === fingerprint of the file on disk now`.
// Anything else (missing, stale, needs-rescan, unreadable or old-version ledger) = not scanned. The ledger is never trusted over
// the file. Ledger contents are data for scripts, never instructions to any agent; no full source and no secret values are stored.
const fs = require('fs');
const path = require('path');
const u = require('./util');
const fp = require('./fingerprint');
const html = require('./html-scan');

const VERSION = 1;
const DOMAINS = ['scss', 'access', 'lang', 'safe'];
const SNIP = 120;
/** Which file kinds each domain scans (lint + scripts + its AI stages). */
const DOMAIN_KINDS = {
  scss: ['scss', 'css', 'html', 'index', 'ts', 'cshtml', 'js'],
  access: ['html', 'index', 'ts', 'cshtml', 'js'],
  lang: ['html', 'index', 'ts', 'cshtml', 'js', 'translation'],
  safe: ['html', 'index', 'ts', 'cshtml', 'js', 'config'],
};
/** Secret findings: the line is never stored, not even as a snippet (path + rule + a hash of the line only). */
const NO_TEXT_RULES = new Set(['SAFE-04']);

const file = (root) => path.join(root, '.ui-guard', 'ledger.json');
const empty = () => ({ version: VERSION, updated: null, files: {}, renames: {} });

/** { ledger, ignored } — an unreadable, foreign or old-version ledger is ignored (full rescan), never trusted. */
function load(root) {
  const f = file(root);
  if (!u.exists(f)) return { ledger: empty(), ignored: null };
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { ledger: empty(), ignored: 'unreadable ledger.json — ignored (full rescan)' }; }
  if (!data || data.version !== VERSION || typeof data.files !== 'object' || Array.isArray(data.files)) return { ledger: empty(), ignored: `ledger.json version ${data && data.version} ≠ ${VERSION} — ignored (full rescan)` };
  if (!data.renames) data.renames = {};
  return { ledger: data, ignored: null };
}

/** Atomic write: temp file in the same folder, then rename. */
function save(root, ledger) {
  ledger.version = VERSION;
  ledger.updated = new Date().toISOString();
  const f = file(root);
  u.mkdirp(path.dirname(f));
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1) + '\n');
  fs.renameSync(tmp, f);
}

// ---------- facts (cheap, script-extracted; short snippets only) ----------
const uniq = (a, n = 200) => [...new Set(a)].slice(0, n);
function templateFacts(text) {
  const out = { classes: [], tags: [], ids: [], inputs: [], images: [], aria: [] };
  for (const t of html.templatesOf(text.rel, text.text)) {
    const { nodes } = html.parse(t.text, t.lineOffset);
    for (const n of nodes) {
      out.tags.push(n.tag);
      out.classes.push(...html.classes(n).filter((c) => /^-?[_a-zA-Z][\w-]*$/.test(c)));
      if (typeof n.attrs.id === 'string') out.ids.push(n.attrs.id);
      for (const k of Object.keys(n.attrs)) {
        const b = /^\[([\w.-]+)\]$/.exec(k);
        if (b && !/^(attr|class|style)\./.test(b[1])) out.inputs.push(b[1]);
        if (/^(\[attr\.)?(aria-[\w-]+|role)\]?$/.test(k)) out.aria.push(k.replace(/^\[attr\.|\]$/g, '') + (k === 'role' && typeof n.attrs.role === 'string' ? '=' + n.attrs.role : ''));
      }
      if (n.tag === 'img') {
        const src = html.attr(n, 'src') || html.attr(n, 'ngSrc');
        out.images.push({ line: n.line, src: u.clip(typeof src === 'string' ? src : '', SNIP), alt: html.has(n, 'alt'), size: html.has(n, 'width') && html.has(n, 'height') });
      }
    }
  }
  return { classes: uniq(out.classes), tags: uniq(out.tags, 80), ids: uniq(out.ids, 80), inputs: uniq(out.inputs, 80), images: out.images.slice(0, 50), aria: uniq(out.aria, 80) };
}
function factsOf(rel, kind, text) {
  if (text == null) return { unreadable: true };
  if (kind === 'html' || kind === 'index') return templateFacts({ rel, text });
  if (kind === 'ts') {
    const f = { imports: uniq([...text.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]), 60), inlineTemplate: /template\s*:\s*`/.test(text) };
    return f.inlineTemplate ? { ...f, ...templateFacts({ rel, text }) } : f;
  }
  if (kind === 'scss' || kind === 'css') {
    const plain = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*'/g, '');
    return { definedClasses: uniq([...plain.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])), imports: uniq([...text.matchAll(/@(?:use|import|forward)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]), 60) };
  }
  if (kind === 'translation') { try { return { keys: Object.keys(JSON.parse(text)).length }; } catch { return { keys: null, unparsed: true }; } }
  return {};
}

/** Add/refresh entries for the given files ([{path, kind, abs?}]); facts are recomputed only when the content changed. */
function sync(root, ledger, files, { prune = true } = {}) {
  const seen = new Set();
  let changed = 0;
  for (const f of files) {
    const rel = f.path || f.rel;
    seen.add(rel);
    const abs = f.abs || u.fromPosix(root, rel);
    let buf = null;
    try { buf = fs.readFileSync(abs); } catch { /* unreadable */ }
    const now = buf ? u.sha1(buf) : null;
    const e = ledger.files[rel];
    if (e && e.fingerprint === now && e.kind === f.kind) continue;
    changed++;
    ledger.files[rel] = { path: rel, kind: f.kind, fingerprint: now, facts: factsOf(rel, f.kind, buf ? buf.toString('utf8') : null), domains: (e && e.domains) || {} };
  }
  if (prune) for (const rel of Object.keys(ledger.files)) if (!seen.has(rel)) delete ledger.files[rel];
  return changed;
}

/** The trust rule (per file). */
function valid(ledger, rel, domain) {
  const e = ledger.files[rel];
  const d = e && e.domains && e.domains[domain];
  return !!(e && e.fingerprint && d && d.scannedFingerprint && d.scannedFingerprint === e.fingerprint && d.status !== 'needs-rescan');
}

// ---------- global contexts: a reused row is valid only if the context it was produced in is unchanged ----------
const hashList = (items) => u.sha1(items.sort().join('\n'));
/**
 * LINT context: what Stylelint/ESLint read besides the file itself — the lint configs + plugin + settings in .ui-guard/lint/, the
 * SCSS tools / settings / theme / utilities (mixins, tokens, palette the rules and the @use graph depend on), every theme source,
 * root lint configs, angular.json (style include paths) and the installed linter versions. Any change → every reused lint row is stale.
 */
function lintContext(root, profile) {
  const project = require('./project');
  const sr = project.scssRoot(profile || project.readProfile(root));
  const files = [];
  const add = (abs) => { const h = fp.fileHash(abs); if (h) files.push(`${u.relPosix(root, abs)}:${h}`); };
  for (const dir of [path.join(root, '.ui-guard', 'lint'), ...['tools', 'settings', 'theme', 'utilities'].map((s) => path.join(root, ...sr.split('/'), s)), path.join(root, 'src', 'assets', 'themes')]) {
    if (u.isDir(dir)) for (const f of u.walk(dir)) if (dir.endsWith('lint') || /\.(s?css|json|mjs|cjs|js)$/.test(f)) add(f);
  }
  for (const f of ['stylelint.config.mjs', 'stylelint.config.js', 'stylelint.config.cjs', '.stylelintrc', '.stylelintrc.json', 'eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', 'angular.json']) add(path.join(root, f));
  for (const pkg of ['stylelint', 'stylelint-scss', 'postcss-scss', 'eslint', 'angular-eslint', 'typescript-eslint', '@angular-eslint/eslint-plugin-template']) {
    const v = u.readJSON(path.join(root, 'node_modules', ...pkg.split('/'), 'package.json'), null);
    if (v) files.push(`npm:${pkg}@${v.version}`);
  }
  return hashList(files);
}
/** AI context of a domain: its rules file, its rules.json entries and the AI rule ids of its stages. A change → reused AI rows are stale. */
function aiContext(domain, { pluginRoot } = {}) {
  const project = require('./project');
  const doms = require('./domains');
  const d = doms.get(domain);
  const base = pluginRoot || project.PLUGIN_ROOT;
  const idx = u.readJSON(path.join(base, 'rules', 'rules.json'), { rules: [] });
  const stages = require('../ai-scan').STAGES[domain] || [];
  return u.sha1([u.readText(path.join(base, d.rulesFile)) || '', d.mvcRulesFile ? u.readText(path.join(base, d.mvcRulesFile)) || '' : '', JSON.stringify((idx.rules || []).filter((r) => doms.ofRule(r.id) === domain)), JSON.stringify(stages.map((s) => s.rules))].join('\n'));
}
/** What of a file's stored knowledge for `domain` can be reused now: { lint, ai } (both need the file itself to be valid). */
function reusable(ledger, rel, domain, ctx) {
  if (!valid(ledger, rel, domain)) return { lint: false, ai: false };
  const d = ledger.files[rel].domains[domain];
  return { lint: !!ctx && d.lintContext === ctx.lint, ai: !!ctx && d.aiContext === ctx.ai[domain] };
}
function contexts(root, profile) { const doms = require('./domains'); return { lint: lintContext(root, profile), ai: Object.fromEntries(doms.NAMES.map((d) => [d, aiContext(d)])) }; }

// ---------- stable keys (rule + normalized snippet, never the line number) ----------
const lineText = (text, line) => (String(text || '').split(/\r?\n/)[(line || 1) - 1] || '');
const snippetOf = (t) => u.clip(fp.normalizeLine(t), SNIP);
function keyFor(rule, text) {
  return NO_TEXT_RULES.has(rule) ? `${rule}|#${u.sha1(fp.normalizeLine(text)).slice(0, 16)}` : `${rule}|${snippetOf(text)}`;
}
/** Class names a class finding is about: `.x` / `x` in backticks in the message, class="…" or `.x` in the snippet. */
function classesOf(f, snippet) {
  const out = [];
  for (const m of String(f.message || '').matchAll(/`\.?(-?[_a-zA-Z][\w-]*)`/g)) out.push(m[1]);
  for (const m of String(snippet || '').matchAll(/class\s*=\s*"([^"]*)"/g)) out.push(...m[1].split(/\s+/).filter((c) => /^-?[_a-zA-Z][\w-]*$/.test(c)));
  for (const m of String(snippet || '').matchAll(/(?:^|[\s,>+~(])\.(-?[_a-zA-Z][\w-]*)/g)) out.push(m[1]);
  return uniq(out, 10);
}
const isClassRule = (rule) => /^STYLE-(0[1-4]|37|39|43|47)$/.test(rule) || /^LINT:/.test(rule);

/** A compact ledger finding from a finalized finding (no full source; SAFE-04 keeps no text at all). */
function ledgerFinding(f, text, status = 'open') {
  const lt = lineText(text, f.line);
  const out = { id: f.id || null, rule: f.ruleId, key: keyFor(f.ruleId, lt), line: f.line, status, fixedAt: null, severity: f.severity, fingerprint: f.fingerprint };
  if (!NO_TEXT_RULES.has(f.ruleId)) out.snippet = snippetOf(lt);
  if (isClassRule(f.ruleId)) out.classes = classesOf(f, out.snippet);
  return out;
}
/** A compact raw lint/AI row (reused verbatim by the next scan while the file is valid). */
function ledgerRow(r, text) {
  const lt = lineText(text, r.line);
  const o = { ruleId: r.ruleId, severity: r.severity, line: r.line, endLine: r.endLine, message: u.clip(r.message || '', 300), fix: r.fix || null, checker: r.checker, sources: r.sources, key: keyFor(r.ruleId, lt) };
  for (const k of ['impact', 'tier']) if (r[k]) o[k] = r[k];
  if (r.status === 'rejected') { o.status = 'rejected'; o.rejectReason = r.rejectReason || null; }
  if (r.evidence && r.checker !== 'ai' && !NO_TEXT_RULES.has(r.ruleId)) o.evidence = u.clip(r.evidence, SNIP);
  return o;
}

/**
 * Record a domain's scan of `scanned` files: rows (lint + AI, raw) and final findings per file. Files not in `scanned` keep their
 * entry. Earlier `fixed` findings stay as history unless the same key is open again.
 */
function recordScan(root, ledger, domain, { scanned, rowsByFile, findingsByFile, reset = false, ctx = null }) {
  const at = new Date().toISOString();
  for (const rel of scanned) {
    const e = ledger.files[rel];
    if (!e || !e.fingerprint) continue;
    const text = u.readText(u.fromPosix(root, rel));
    const prev = (e.domains[domain] && e.domains[domain].findings) || [];
    // a finding parked by a fix (needs-decision / skipped) keeps that status while the same key is found again (--rescan resets)
    const parked = reset ? new Map() : new Map(prev.filter((x) => x.status === 'needs-decision' || x.status === 'skipped').map((x) => [x.key, x]));
    const open = (findingsByFile.get(rel) || []).map((f) => ledgerFinding(f, text, f.status === 'rejected' ? 'rejected' : 'open'))
      .map((x) => (x.status === 'open' && parked.has(x.key) ? { ...x, status: parked.get(x.key).status, fixedAt: parked.get(x.key).fixedAt } : x));
    const keys = new Set(open.map((x) => x.key));
    const history = prev.filter((x) => x.status === 'fixed' && !keys.has(x.key));
    e.domains[domain] = { scannedAt: at, scannedFingerprint: e.fingerprint, status: 'valid', lintContext: ctx ? ctx.lint : null, aiContext: ctx ? ctx.ai[domain] : null, rows: (rowsByFile.get(rel) || []).map((r) => ledgerRow(r, text)), findings: open.concat(history) };
  }
}

/** Rows of a valid file, ready for merge-findings.normalize (the file name is re-attached). */
function reuseRows(ledger, rel, domain) {
  const d = ledger.files[rel] && ledger.files[rel].domains[domain];
  return d ? (d.rows || []).map((r) => ({ ...r, file: rel })) : [];
}

// ---------- carry-over after a fix ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function applyRenames(s, renames) {
  let t = String(s || '');
  for (const [from, to] of Object.entries(renames || {})) t = t.replace(new RegExp(`(?<![\\w-])${esc(from)}(?![\\w-])`, 'g'), to);
  return t;
}
/** New line of an item (finding or row) by its stable key in `text` (nearest to its old line), or null. */
function relocate(item, text, renames) {
  const rule = item.rule || item.ruleId;
  const want = item.key.startsWith(rule + '|#') ? item.key : `${rule}|${u.clip(fp.normalizeLine(applyRenames(item.key.slice(rule.length + 1), renames)), SNIP)}`;
  const lines = String(text).split(/\r?\n/);
  let best = null;
  lines.forEach((l, i) => { if (keyFor(rule, l) === want && (best == null || Math.abs(i + 1 - item.line) < Math.abs(best - item.line))) best = i + 1; });
  return best ? { line: best, key: want } : null;
}
/** Every domain of the file → needs-rescan (open findings are kept, marked needs-rescan; nothing is dropped). */
function markRescan(e, domainsList = DOMAINS, reason = 'file changed') {
  for (const d of domainsList) {
    const x = e.domains[d];
    if (!x) continue;
    x.status = 'needs-rescan'; x.scannedFingerprint = null; x.rescanReason = reason;
    for (const f of x.findings || []) if (f.status === 'open') f.status = 'needs-rescan';
  }
}
/**
 * Carry the other domains' knowledge of a file across an EXPECTED edit (a fix phase of `fixDomain`). Each open finding and each
 * raw row is re-located by its stable key (after the rename map) in the new text: found → open with the new line; not found →
 * that domain becomes needs-rescan for this file. Returns { relocated: [{domain, oldFp, newFp, line}], rescan: [domain] }.
 */
function carryOver(root, e, newText, fixDomain, renames) {
  const res = { relocated: [], rescan: [] };
  for (const d of DOMAINS) {
    if (d === fixDomain) continue;
    const x = e.domains[d];
    if (!x || (x.status === 'needs-rescan')) continue;
    let ok = true;
    for (const f of x.findings || []) {
      if (f.status !== 'open') continue;
      const r = relocate(f, newText, renames);
      if (!r) { f.status = 'needs-rescan'; ok = false; continue; }
      const oldFp = f.fingerprint;
      f.line = r.line; f.key = r.key;
      if (f.snippet != null) f.snippet = snippetOf(lineText(newText, r.line));
      if (f.classes) f.classes = f.classes.map((c) => (renames && renames[c]) || c);
      f.fingerprint = fp.fingerprint(f.rule, e.path, lineText(newText, r.line));
      res.relocated.push({ domain: d, oldFp, newFp: f.fingerprint, line: r.line, key: f.key });
    }
    for (const row of x.rows || []) {
      const r = relocate(row, newText, renames);
      if (!r) { ok = false; continue; }
      row.line = r.line; row.endLine = Math.max(r.line, r.line + ((row.endLine || row.line) - row.line)); row.key = r.key;
      if (row.evidence) row.evidence = u.clip(lineText(newText, r.line), SNIP);
    }
    if (ok) { x.scannedFingerprint = e.fingerprint; x.carriedAt = new Date().toISOString(); }
    else { markRescan(e, [d], `a finding of ${d} could not be re-located after the ${fixDomain} fix`); res.rescan.push(d); }
  }
  return res;
}

/** Counts for `ledger.js status`. */
function status(ledger, nowFp) {
  const out = { files: Object.keys(ledger.files).length, domains: {} };
  for (const d of DOMAINS) {
    const c = { valid: 0, stale: 0, notScanned: 0, open: 0, fixed: 0, skipped: 0, needsDecision: 0, needsRescan: 0 };
    for (const [rel, e] of Object.entries(ledger.files)) {
      if (!DOMAIN_KINDS[d].includes(e.kind)) continue;
      const x = e.domains[d];
      const cur = nowFp ? nowFp(rel) : e.fingerprint;
      if (!x) c.notScanned++;
      else if (x.scannedFingerprint && x.scannedFingerprint === cur && x.status !== 'needs-rescan') c.valid++;
      else c.stale++;
      for (const f of (x && x.findings) || []) {
        if (f.status === 'open') c.open++; else if (f.status === 'fixed') c.fixed++; else if (f.status === 'skipped') c.skipped++;
        else if (f.status === 'needs-decision') c.needsDecision++; else if (f.status === 'needs-rescan') c.needsRescan++;
      }
    }
    out.domains[d] = c;
  }
  return out;
}

module.exports = { VERSION, DOMAINS, DOMAIN_KINDS, NO_TEXT_RULES, file, load, save, sync, valid, lintContext, aiContext, contexts, reusable, factsOf, keyFor, snippetOf, lineText, ledgerFinding, ledgerRow, recordScan, reuseRows, applyRenames, relocate, carryOver, markRescan, status };
