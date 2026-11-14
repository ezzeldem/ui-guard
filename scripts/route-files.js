#!/usr/bin/env node
'use strict';
// Which AI rule groups a file needs (grep signals only). Used by ai-scan.js (stages) and changes.js (/ui-guard:check).
// Rules owned by Stylelint/ESLint/scripts are NEVER routed to the AI — not even when a tool is missing or crashed
// (those rules are reported as NOT CHECKED instead). Images and assets are never routed (out of the scan).
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');

const SIGNALS = {
  'style-ai': { kinds: ['scss', 'css'], text: /\bclass\s*=|ngClass|\[class[.\]]|classList|addClass|removeClass|querySelector|@HostBinding\(\s*['"]class/ },
  lang: { text: />\s*[^<{\s][^<{]*[A-Za-z؀-ۿ][^<]*</, ts: /\b(toast|toastr|snack|alert|confirm|dialog|title|setTitle|Validators|message|notify|swal|error)\b[^\n]*['"`][^'"`\n]*[A-Za-z؀-ۿ]{2,}|\?\s*['"`][^'"`]+['"`]\s*:\s*['"`]|lang\s*===?/i, html: /\s(placeholder|title|alt|aria-label|aria-placeholder|label)\s*=\s*"[^"{]*[A-Za-z؀-ۿ]/ },
  safe: { text: /innerHTML|outerHTML|bypassSecurityTrust|\beval\s*\(|Function\s*\(|localStorage|sessionStorage|document\.cookie|console\.|insertAdjacentHTML|document\.write|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]|javascript:|\b(key|secret|token|password|passwd|apikey)\b/i, kinds: ['config'] },
  'access-labels': { text: /<input|<select|<textarea|formControlName|ngModel|ControlValueAccessor|<label|<button[^>]*>\s*<(i|img|svg|mat-icon|fa-icon)/i },
  'access-alt': { text: /<img|<svg|<i\s+class=|<mat-icon|<fa-icon|background-image|icon/i },
  'access-aria': { text: /aria-|role\s*=|dropdown|tab|dialog|modal|menu|combobox|listbox|tree|Validators|toast|@HostBinding|\[attr\./i },
  'access-semantics': { text: /\(click\)|<table|<ul|<ol|<h[1-6]|<nav|<main|<form|\slang\s*=|\sdir\s*=|<header|<footer|<section|routerLink/i, kinds: ['index'] },
  'access-keyboard': { text: /tabindex|\(keydown|\(keyup|@HostListener|\.focus\(|modal|overlay|dropdown|tabs|\(click\)|autofocus/i },
};

/** AI groups for one file. f = { path, kind }; unparsed = Set of translation files the i18n script could not parse. */
function groupsFor(root, f, unparsed = new Set()) {
  const groups = new Set();
  const isText = ['html', 'ts', 'scss', 'css', 'index', 'config', 'translation'].includes(f.kind);
  const text = isText ? (u.readText(u.fromPosix(root, f.path)) || '') : '';
  if (f.kind === 'translation') { if (unparsed.has(f.path)) groups.add('lang'); return [...groups]; }
  for (const [g, s] of Object.entries(SIGNALS)) {
    if (s.kinds && s.kinds.includes(f.kind)) groups.add(g);
    if (!text) continue;
    if (g === 'lang') {
      if ((f.kind === 'html' || f.kind === 'index') && (s.text.test(text) || s.html.test(text))) groups.add(g);
      if (f.kind === 'ts' && s.ts.test(text)) groups.add(g);
      continue;
    }
    if (['scss', 'css'].includes(f.kind) && g.startsWith('access-')) continue;
    if (s.text && s.text.test(text)) groups.add(g);
  }
  if (/\/packages\//.test(f.path) || f.path === 'angular.json') groups.clear();
  return [...groups].sort();
}

/**
 * Component/route-file directories → route paths, read from the app's routes files (static string paths only).
 * Each `path: '…'` is paired with the next `loadComponent: import('…')` / `component: Name` / `loadChildren: import('…')`
 * that appears before the following `path:`.
 */
function routeMap(root) {
  const app = path.join(root, 'src', 'app');
  const entries = []; // { route, dir }
  const files = u.isDir(app) ? u.walk(app).filter((f) => /(routes?|routing)(\.module)?\.ts$/.test(f)) : [];
  for (const f of files) {
    const text = u.readText(f) || '';
    const imports = {};
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) for (const n of m[1].split(',')) imports[n.trim().split(/\s+as\s+/).pop()] = m[2];
    const marks = [...text.matchAll(/\bpath\s*:\s*['"]([^'"]*)['"]/g)];
    marks.forEach((m, i) => {
      const body = text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length);
      const route = '/' + m[1];
      if (/[:*]/.test(route)) return;
      let spec = (/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(body) || [])[1];
      if (!spec) { const c = /\bcomponent\s*:\s*(\w+)/.exec(body); if (c) spec = imports[c[1]]; }
      if (!spec || !spec.startsWith('.')) return;
      entries.push({ route, dir: path.dirname(path.resolve(path.dirname(f), spec)) });
    });
  }
  return entries;
}

/** Routes whose component folder contains any of the files (forward-slash, project-relative). */
function routesFor(root, files, entries = routeMap(root)) {
  const out = new Set();
  for (const file of files) {
    const abs = path.join(root, ...file.split('/'));
    for (const e of entries) if (abs === e.dir || abs.startsWith(e.dir + path.sep)) out.add(e.route);
  }
  return [...out].sort();
}

module.exports = { groupsFor, routeMap, routesFor, SIGNALS };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, `route-files.js — print the AI rule groups each inventory file would need (debug aid; the scan uses ai-scan.js).
Usage: node route-files.js [--root <dir>]`);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const inv = require('./inventory').load(root);
  if (!inv) { console.error('No inventory. Run inventory.js build first.'); process.exit(1); }
  for (const f of inv.files) { const g = groupsFor(root, f); if (g.length) console.log(`${f.path}\t${g.join(', ')}`); }
}
