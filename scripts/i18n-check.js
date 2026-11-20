#!/usr/bin/env node
'use strict';
// LANG-04 (used key missing), LANG-05 (key in one language only), LANG-06 (duplicate key), LANG-08 (empty / key-equal / wrong language).
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const ARABIC = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{2,}/;

/** Parse JSON keeping key order, lines and duplicates. Returns { entries:[{key,value,line}], dups:[{key,line}] } or { error }. */
function parseJsonKeys(text) {
  let i = 0;
  const n = text.length;
  const idx = u.lineIndexer(text);
  const entries = [], dups = [];
  const ws = () => { while (i < n && /\s/.test(text[i])) i++; };
  const str = () => {
    if (text[i] !== '"') throw new Error('expected string at line ' + idx(i));
    let j = i + 1, out = '';
    while (j < n && text[j] !== '"') { if (text[j] === '\\') { out += JSON.parse('"' + text.slice(j, j + (text[j + 1] === 'u' ? 6 : 2)) + '"'); j += text[j + 1] === 'u' ? 6 : 2; continue; } out += text[j++]; }
    i = j + 1;
    return out;
  };
  const value = (prefix) => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; const seen = new Set();
      ws(); if (text[i] === '}') { i++; return; }
      for (;;) {
        ws(); const kpos = i; const k = str(); ws(); if (text[i] !== ':') throw new Error('expected : at line ' + idx(i)); i++;
        const full = prefix ? prefix + '.' + k : k;
        if (seen.has(k)) dups.push({ key: full, line: idx(kpos) });
        seen.add(k);
        ws();
        if (text[i] === '{') value(full);
        else { const vpos = i; const v = value(null); entries.push({ key: full, value: v, line: idx(vpos) }); }
        ws(); if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return; }
        throw new Error('expected , or } at line ' + idx(i));
      }
    }
    if (c === '[') { const s = i; let d = 0; for (; i < n; i++) { if (text[i] === '[') d++; else if (text[i] === ']') { d--; if (!d) { i++; break; } } else if (text[i] === '"') { str(); i--; } } return JSON.parse(text.slice(s, i)); }
    if (c === '"') return str();
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) throw new Error('unexpected token at line ' + idx(i));
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  try { value(''); } catch (e) { return { error: e.message }; }
  return { entries, dups };
}

/** Tolerant TS dictionary extractor: `key: 'value'` with nesting by braces. Returns null when unsure. */
function parseTsDict(text) {
  const start = text.search(/=\s*\{|export\s+default\s+\{/);
  if (start < 0) return null;
  let i = text.indexOf('{', start);
  const idx = u.lineIndexer(text);
  const entries = [], dups = [];
  const stack = [{ prefix: '', seen: new Set() }];
  i++;
  try {
    while (i < text.length && stack.length) {
      const rest = text.slice(i);
      let m;
      if ((m = /^\s+/.exec(rest)) || (m = /^\/\/[^\n]*/.exec(rest)) || (m = /^\/\*[\s\S]*?\*\//.exec(rest)) || (m = /^,/.exec(rest))) { i += m[0].length; continue; }
      if (rest[0] === '}') { stack.pop(); i++; continue; }
      m = /^(?:(["'`])((?:\\.|(?!\1).)*)\1|([A-Za-z_$][\w$]*))\s*:\s*/.exec(rest);
      if (!m) return null;
      const key = m[2] !== undefined ? m[2] : m[3];
      const top = stack[stack.length - 1];
      const full = top.prefix ? top.prefix + '.' + key : key;
      if (top.seen.has(key)) dups.push({ key: full, line: idx(i) });
      top.seen.add(key);
      i += m[0].length;
      const r2 = text.slice(i);
      if (r2[0] === '{') { stack.push({ prefix: full, seen: new Set() }); i++; continue; }
      const v = /^(["'`])((?:\\.|(?!\1)[\s\S])*)\1/.exec(r2);
      if (!v || (v[1] === '`' && /\$\{/.test(v[2]))) return null;
      entries.push({ key: full, value: v[2], line: idx(i) });
      i += v[0].length;
    }
  } catch { return null; }
  return { entries, dups };
}

function parseXlf(text) {
  const entries = [], dups = [], seen = new Set();
  const re = /<trans-unit\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = re.exec(text))) {
    const line = u.lineAt(text, m.index);
    if (seen.has(m[1])) dups.push({ key: m[1], line });
    seen.add(m[1]);
    const target = /<target[^>]*>([\s\S]*?)<\/target>/.exec(m[2]);
    const source = /<source[^>]*>([\s\S]*?)<\/source>/.exec(m[2]);
    entries.push({ key: m[1], value: (target || source || [])[1] || '', line });
  }
  return { entries, dups };
}

/** .NET .resx: <data name="Key"><value>…</value></data>. */
function parseResx(text) {
  const entries = [], dups = [], seen = new Set();
  const re = /<data\b([^>]*)\bname\s*=\s*"([^"]+)"([^>]*?)(\/>|>([\s\S]*?)<\/data>)/g;
  let m;
  while ((m = re.exec(text))) {
    if (/\b(type|mimetype)\s*=/.test(m[1] + m[3])) continue; // embedded files / images, not text
    const line = u.lineAt(text, m.index);
    if (seen.has(m[2])) dups.push({ key: m[2], line });
    seen.add(m[2]);
    const v = /<value>([\s\S]*?)<\/value>/.exec(m[5] || '');
    entries.push({ key: m[2], value: v ? v[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '', line });
  }
  return { entries, dups };
}

/** gettext .po: msgid "…" / msgstr "…" (multi-line strings joined; the header entry msgid "" is skipped). */
function parsePo(text) {
  const entries = [], dups = [], seen = new Set();
  const lines = text.split(/\r?\n/);
  const unq = (s) => { try { return JSON.parse(s); } catch { return s.replace(/^"|"$/g, ''); } };
  let cur = null, field = null, ctx = '';
  const flush = () => {
    if (cur && cur.id !== '') {
      const key = (cur.ctx ? cur.ctx + '\u0004' : '') + cur.id;
      if (seen.has(key)) dups.push({ key: cur.id, line: cur.line });
      seen.add(key);
      entries.push({ key: cur.id, value: cur.str, line: cur.strLine || cur.line });
    }
    cur = null; field = null;
  };
  lines.forEach((l, i) => {
    const t = l.trim();
    let m;
    if (!t || t.startsWith('#')) { if (!t && cur && cur.str !== undefined) flush(); return; }
    if ((m = /^msgctxt\s+(".*")$/.exec(t))) { if (cur && cur.str !== undefined) flush(); ctx = unq(m[1]); field = 'ctx'; return; }
    if ((m = /^msgid\s+(".*")$/.exec(t))) { if (cur && cur.str !== undefined) flush(); cur = { id: unq(m[1]), ctx, line: i + 1 }; ctx = ''; field = 'id'; return; }
    if (/^msgid_plural\s/.test(t)) { field = 'plural'; return; }
    if ((m = /^msgstr(?:\[0\])?\s+(".*")$/.exec(t))) { if (cur) { cur.str = unq(m[1]); cur.strLine = i + 1; } field = 'str'; return; }
    if (/^msgstr\[\d+\]/.test(t)) { field = 'other'; return; }
    if ((m = /^(".*")$/.exec(t)) && cur) { if (field === 'id') cur.id += unq(m[1]); else if (field === 'str') cur.str += unq(m[1]); }
  });
  if (cur && cur.str !== undefined) flush();
  return { entries, dups };
}

const LANG_CODE = /^[a-z]{2}([-_][A-Za-z]{2,4})?$/;
/** One dictionary file that holds every language: top-level blocks { ar: {…}, en: {…} } → one virtual file per language. */
function splitLanguageBlocks(r) {
  const tops = new Set(r.entries.map((e) => e.key.split('.')[0]));
  if (tops.size < 2 || ![...tops].every((t) => LANG_CODE.test(t))) return null;
  const strip = (lang) => (e) => ({ ...e, key: e.key.slice(lang.length + 1) });
  return [...tops].map((lang) => ({
    lang,
    entries: r.entries.filter((e) => e.key.split('.')[0] === lang).map(strip(lang)),
    dups: r.dups.filter((d) => d.key.split('.')[0] === lang).map(strip(lang)),
  }));
}

/** Language + area of a translation file path. */
function langOf(rel) {
  const parts = rel.split('/');
  if (parts.length >= 3 && parts[parts.length - 2] === 'LC_MESSAGES') parts.splice(parts.length - 2, 1); // ar/LC_MESSAGES/app.po
  const base = parts[parts.length - 1].replace(/\.(json|i18n\.ts|i18n\.js|translations?\.(ts|js)|locale\.(ts|js)|ts|js|xlf|xliff|resx|po)$/i, '');
  if (/\.resx$/i.test(rel) && !/[._-][a-z]{2}([-_][A-Za-z]{2,4})?$/.test(base)) return { lang: 'default', area: parts.slice(0, -1).join('/') + '/' + base };
  const dir = parts.slice(0, -1).join('/');
  const LANG = /^[a-z]{2}([-_][A-Za-z]{2,4})?$/;
  let m;
  if (LANG.test(base)) return { lang: base, area: dir };
  if ((m = /^(.*)[._-]([a-z]{2}(?:[-_][A-Za-z]{2,4})?)$/.exec(base))) return { lang: m[2], area: dir + '/' + m[1] };
  const parent = parts[parts.length - 2] || '';
  if (LANG.test(parent)) return { lang: parent, area: parts.slice(0, -2).join('/') + '/' + base };
  if (/^messages$/.test(base)) return { lang: 'source', area: dir + '/messages' };
  return { lang: base, area: dir };
}

/** Keys used in templates / TS. */
function usedKeys(text, isHtml) {
  const out = [];
  const idx = u.lineIndexer(text);
  const pats = [
    /(["'])([A-Za-z0-9_.-]+)\1\s*\|\s*(?:translate|transloco)\b/g,
    /\b(?:instant|get|stream|translate|selectTranslate)\(\s*(["'])([A-Za-z0-9_.-]+)\1/g,
    /\bmarker\(\s*(["'])([A-Za-z0-9_.-]+)\1/g,
  ];
  if (isHtml) pats.push(/\btranslate\s*=\s*(["'])([A-Za-z0-9_.-]+)\1/g, /\[translate\]\s*=\s*"'([A-Za-z0-9_.-]+)'"/g, /\btransloco\s*=\s*(["'])([A-Za-z0-9_.-]+)\1/g, /(["'])([A-Za-z0-9_.-]+)\1\s*\|\s*t\b/g);
  pats.push(/\b(?:i18n\.)?t\(\s*(["'])([A-Za-z0-9_.-]+)\1/g); // project dictionaries: t('sidebar.home'), i18n.t('KEY')
  for (const re of pats) {
    let m;
    while ((m = re.exec(text))) {
      const key = m[2] !== undefined ? m[2] : m[1];
      if (!key || !/[A-Za-z]/.test(key) || /^\d/.test(key)) continue;
      out.push({ key, line: idx(m.index) });
    }
  }
  // ASP.NET: Localizer["Key"], SharedLocalizer["Key"], _localizer["Key"] — always a key.
  for (const m of text.matchAll(/\b\w*[Ll]ocalizer\s*\[\s*"([^"]+)"/g)) out.push({ key: m[1], line: idx(m.index), certain: true });
  return out;
}

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile);
  const tfiles = files.filter((f) => f.kind === 'translation');
  const parsed = [];
  for (const f of tfiles) {
    const text = u.readText(f.abs) || '';
    let r;
    if (f.rel.endsWith('.json')) r = parseJsonKeys(text);
    else if (/\.xliff?$/.test(f.rel)) r = parseXlf(text);
    else if (/\.resx$/i.test(f.rel)) r = parseResx(text);
    else if (/\.po$/i.test(f.rel)) r = parsePo(text);
    else r = parseTsDict(text);
    if (!r || r.error) {
      findings.push(mk(root, 'LANG-05', f.rel, 1, `unverified: could not parse this translation file${r && r.error ? ' (' + r.error + ')' : ''} — handed to the AI scanner.`, 'AI scanner must check LANG-04/05/06/08 here.', { severity: 'info' }));
      continue;
    }
    const what = /\.resx$/i.test(f.rel) ? 'two <data name> entries with this name' : /\.po$/i.test(f.rel) ? 'this msgid twice' : /\.xliff?$/.test(f.rel) ? 'two <trans-unit> with this id' : 'defined twice in one object';
    for (const d of r.dups) findings.push(mk(root, 'LANG-06', f.rel, d.line, `Key \`${d.key}\`: ${what} — only one of them is used.`, 'Keep one entry with the right value (the later one is what the app uses today).'));
    const blocks = !/\.(json|xlf|xliff|resx|po)$/i.test(f.rel) ? splitLanguageBlocks(r) : null;
    if (blocks) { for (const b of blocks) parsed.push({ ...f, entries: b.entries, dups: b.dups, lang: b.lang, area: f.rel + '#languages' }); continue; }
    const { lang, area } = langOf(f.rel);
    parsed.push({ ...f, ...r, lang, area });
  }
  // A .resx without a culture in its name is the default language (usually English): call it en when its area has no en file.
  for (const p of parsed) if (p.lang === 'default' && !parsed.some((q) => q.area === p.area && /^en\b/.test(q.lang))) p.lang = 'en';
  // LANG-05 per area
  const areas = {};
  for (const p of parsed) (areas[p.area] = areas[p.area] || []).push(p);
  for (const area of Object.keys(areas).sort()) {
    const group = areas[area].filter((p) => p.lang !== 'source' || areas[area].length === 1);
    if (group.length < 2) continue;
    const keySets = group.map((p) => new Set(p.entries.map((e) => e.key)));
    group.forEach((p, i) => {
      for (let j = 0; j < group.length; j++) {
        if (j === i) continue;
        for (const e of group[j].entries) if (!keySets[i].has(e.key)) findings.push(mk(root, 'LANG-05', p.rel, 1, `Key \`${e.key}\` exists in \`${group[j].lang}\` but not in \`${p.lang}\`.`, `Add ${e.key} to ${p.rel} with a real translation.`));
      }
    });
  }
  // LANG-08 values
  const byLangKey = {};
  for (const p of parsed) for (const e of p.entries) (byLangKey[p.lang] = byLangKey[p.lang] || {})[e.key] = e.value;
  for (const p of parsed) {
    for (const e of p.entries) {
      if (typeof e.value !== 'string') continue;
      const v = e.value.trim();
      const last = e.key.split('.').pop();
      if (!v) { findings.push(mk(root, 'LANG-08', p.rel, e.line, `Key \`${e.key}\` has an empty value.`, 'Write the translation.')); continue; }
      if (v === e.key || v === last && /[._]/.test(e.key) && v.length > 3 && /^[A-Z0-9_]+$|^[a-z]+[A-Z_]/.test(v)) { findings.push(mk(root, 'LANG-08', p.rel, e.line, `Key \`${e.key}\` has its own key as value.`, 'Write the translation.')); continue; }
      const plain = v.replace(/\{\{[^}]*\}\}|\{[^}]*\}|<[^>]+>/g, '');
      if (/^ar\b/.test(p.lang) && !ARABIC.test(plain) && LATIN_WORD.test(plain)) {
        const en = byLangKey.en && byLangKey.en[e.key];
        if (!en || LATIN_WORD.test(String(en))) findings.push(mk(root, 'LANG-08', p.rel, e.line, `Arabic value for \`${e.key}\` has no Arabic letters (\`${u.clip(v, 40)}\`).`, 'Translate it to Arabic (brand names: keep, and note it).'));
      }
      if (/^en\b/.test(p.lang) && ARABIC.test(plain)) findings.push(mk(root, 'LANG-08', p.rel, e.line, `English value for \`${e.key}\` contains Arabic letters.`, 'Write the English text.'));
    }
  }
  // LANG-04 used keys present in every language
  const langs = [...new Set(parsed.filter((p) => p.lang !== 'source').map((p) => p.lang))].sort();
  const keysByLang = {};
  for (const p of parsed) for (const e of p.entries) (keysByLang[p.lang] = keysByLang[p.lang] || new Set()).add(e.key);
  if (langs.length) {
    for (const f of files.filter((x) => ['html', 'index', 'ts', 'cshtml', 'js'].includes(x.kind))) {
      const text = u.readText(f.abs) || '';
      for (const k of usedKeys(text, f.kind === 'html' || f.kind === 'index' || f.kind === 'cshtml')) {
        const missing = langs.filter((l) => !keysByLang[l].has(k.key) && ![...keysByLang[l]].some((x) => x.startsWith(k.key + '.')));
        if (!missing.length) continue;
        if (!k.certain && !k.key.includes('.') && missing.length === langs.length) continue; // bare word: probably not a key
        findings.push(mk(root, 'LANG-04', f.rel, k.line, `Key \`${k.key}\` is missing in: ${missing.join(', ')} — the user sees the raw key.`, `Add ${k.key} to every language file.`));
      }
    }
  }
  void path;
  return findings;
}

module.exports = { run, parseJsonKeys, parseTsDict, parseXlf, parseResx, parsePo, splitLanguageBlocks, langOf, usedKeys };
if (require.main === module) cli('i18n-check', `i18n-check.js — LANG-04 (key used but missing in a language), LANG-05 (key in one language only),
LANG-06 (duplicate key / trans-unit id), LANG-08 (empty, key-equal or wrong-language values).
Unparseable TS dictionaries are reported as info "unverified" and handed to the AI scanner.`, run);
