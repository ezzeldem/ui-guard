#!/usr/bin/env node
'use strict';
// Which AI rule groups a file needs (grep signals only). Used by ai-scan.js (stages) and changes.js (/ui-guard:check).
// Rules owned by Stylelint/ESLint/scripts are NEVER routed to the AI — not even when a tool is missing or crashed
// (those rules are reported as NOT CHECKED instead). Images and assets are never routed (out of the scan).
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');

const SIGNALS = {
  // style files: only when something in them needs judgment (segment purity, vendor overrides, icons, buttons, tokens)
  'style-ai': { style: /::ng-deep|filter\s*:|\b(btn|button)\b|@extend|--[\w-]+\s*:|\.(o|m|ctrl|u|l|p)-[\w-]/, segments: /\/(layout|modules|objects|utilities|pages|components|common)\//, text: /\bclass\s*=|ngClass|\[class[.\]]|classList|addClass|removeClass|querySelector|@HostBinding\(\s*['"]class/ },
  lang: { text: />\s*[^<{\s@][^<{]*[A-Za-z؀-ۿ][^<]*</, ts: /\b(toast|toastr|snack|alert|confirm|dialog|title|setTitle|Validators|message|notify|swal|error|ViewBag\.Title|ViewData\["Title"\]|ErrorMessage|Display\s*\(\s*Name)\b[^\n]*['"`][^'"`\n]*[A-Za-z؀-ۿ]{2,}|\?\s*['"`][^'"`]+['"`]\s*:\s*['"`]|lang\s*===?/i, html: /\s(placeholder|title|alt|aria-label|aria-placeholder|label)\s*=\s*"[^"{]*[A-Za-z؀-ۿ]/ },
  safe: { text: /innerHTML|outerHTML|bypassSecurityTrust|\beval\s*\(|\bnew\s+Function\s*\(|localStorage|sessionStorage|document\.cookie|console\.|insertAdjacentHTML|document\.write|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]|javascript:|\b(key|secret|token|password|passwd|apikey)\b|Html\.Raw|HtmlString|MvcHtmlString|BeginForm|AntiForgery|method\s*=\s*["']?post|\.(html|append|prepend|before|after|replaceWith)\(|\$\(\s*['"`]\s*<|\$\.(ajax|post)\b|type\s*:\s*['"](POST|PUT|DELETE)|<script[^>]*>[\s\S]*@Model/i, kinds: ['config'] },
  'access-labels': { js: /createElement\(\s*['"](input|select|textarea)|<(input|select|textarea|label)\b/i, text: /<input|<select|<textarea|formControlName|ngModel|ControlValueAccessor|<label|asp-for|Html\.(TextBox|Password|DropDownList|ListBox|TextArea|CheckBox|RadioButton|Editor|Label)|EditorFor|LabelFor|<button[^>]*>\s*<(i|img|svg|mat-icon|fa-icon)/i },
  'access-alt': { js: /<img\b|<svg\b|createElement\(\s*['"](img|svg)/i, text: /<img|<svg|<i\s+class=|<mat-icon|<fa-icon|background-image|icon|<video|<audio|<iframe|<canvas|<object|<embed/i },
  'access-aria': { js: /aria-|setAttribute\(\s*['"]role|\.attr\(\s*['"](aria-|role)|\.(load|html)\(|\$\.(ajax|get|post)\b|toggleClass|slideToggle|\.(show|hide)\(/i, text: /aria-|role\s*=|dropdown|tab|dialog|modal|menu|combobox|listbox|tree|Validators|toast|@HostBinding|\[attr\.|asp-validation|ValidationMessage|ValidationSummary|data-val|\.(load|html)\(|\$\.(ajax|get|post)\b/i },
  'access-semantics': { js: /\.on\(\s*['"]click|onclick|addEventListener\(\s*['"]click|<(table|ul|ol|h[1-6]|nav|form)\b/i, text: /\(click\)|<table|<ul|<ol|<h[1-6]|<nav|<main|<form|\slang\s*=|\sdir\s*=|<header|<footer|<section|routerLink|onclick|BeginForm|@RenderBody|@RenderSection|asp-action|ActionLink|\.on\(\s*['"]click/i, kinds: ['index'] },
  // MEDIA-02 off-screen containers (modal, closed tab/accordion/dropdown, table row, footer) — /ui-guard:check only
  media: { text: /<img\b[^>]*>/i, js: /<img\b/i },
  'access-motion': { js: /autoplay|carousel|swiper|slick|marquee|setInterval/i, text: /autoplay|carousel|swiper|slick|marquee|setTimeout|setInterval|timeout|toast|snack|animation|@keyframes/i },
  'access-keyboard': { js: /\.focus\(|tabindex|keydown|keyup|\.on\(\s*['"]key|addEventListener\(\s*['"]key/i, text: /tabindex|\(keydown|\(keyup|@HostListener|\.focus\(|modal|overlay|dropdown|tabs|\(click\)|autofocus|onclick|onkey|\.on\(\s*['"](click|key)|keydown|keyup|addEventListener/i },
};

const CONFIG_JS = /(^|\/)[^/]*\.(config|conf)\.[cm]?js$|(^|\/)(karma|protractor|webpack|gulpfile|gruntfile|babel|jest|eslint|prettier|tailwind|postcss|vite|rollup|bundleconfig)[\w.-]*\.[cm]?js$/i;

/** AI groups for one file. f = { path, kind }; unparsed = Set of translation files the i18n script could not parse. */
function groupsFor(root, f, unparsed = new Set()) {
  const groups = new Set();
  const isText = ['html', 'ts', 'scss', 'css', 'index', 'config', 'translation', 'cshtml', 'js'].includes(f.kind);
  const text = isText ? (u.readText(u.fromPosix(root, f.path)) || '') : '';
  if (f.kind === 'translation') { if (unparsed.has(f.path)) groups.add('lang'); return [...groups]; }
  // Tool / build config scripts never go to the AI (secrets in them are still found by secrets-check.js, 0 tokens).
  if (f.kind === 'js' && CONFIG_JS.test(f.path)) return [];
  for (const [g, s] of Object.entries(SIGNALS)) {
    if (s.kinds && s.kinds.includes(f.kind)) groups.add(g);
    if (!text) continue;
    if (g === 'lang') {
      if ((f.kind === 'html' || f.kind === 'index' || f.kind === 'cshtml') && (s.text.test(text) || s.html.test(text))) groups.add(g);
      if ((f.kind === 'ts' || f.kind === 'js' || f.kind === 'cshtml') && s.ts.test(text)) groups.add(g);
      continue;
    }
    if (['scss', 'css'].includes(f.kind) && g.startsWith('access-')) continue;
    if (g === 'style-ai' && ['scss', 'css'].includes(f.kind)) { if (s.style.test(text) || s.segments.test(f.path)) groups.add(g); continue; }
    // .js: the stricter js signal where a group has one (generic words like tab/menu/icon/timeout do not route a script)
    const re = f.kind === 'js' && s.js ? s.js : s.text;
    if (re && re.test(text)) groups.add(g);
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
  const raw = []; // { file, path, dir, children: target routes file or null, redirect }
  const files = u.isDir(app) ? u.walk(app).filter((f) => /(routes?|routing)(\.module)?\.ts$/.test(f)).map((f) => path.resolve(f)) : [];
  const resolveTs = (from, spec) => { const base = path.resolve(path.dirname(from), spec); for (const c of [base + '.ts', path.join(base, 'index.ts'), base]) if (u.exists(c) && !u.isDir(c)) return c; return base + '.ts'; };
  for (const f of files) {
    const text = u.readText(f) || '';
    const imports = {};
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) for (const n of m[1].split(',')) imports[n.trim().split(/\s+as\s+/).pop()] = m[2];
    const marks = [...text.matchAll(/\bpath\s*:\s*['"]([^'"]*)['"]/g)];
    marks.forEach((m, i) => {
      const body = text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length);
      const redirect = /\bredirectTo\s*:/.test(body);
      const lazyChildren = (/\bloadChildren\s*:[\s\S]{0,80}?import\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(body) || [])[1];
      let spec = lazyChildren ? null : (/\bloadComponent\s*:[\s\S]{0,80}?import\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(body) || /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(body) || [])[1];
      if (!spec) { const c = /\bcomponent\s*:\s*(\w+)/.exec(body); if (c) spec = imports[c[1]]; }
      raw.push({ file: f, path: m[1], redirect, dir: spec && spec.startsWith('.') ? path.dirname(path.resolve(path.dirname(f), spec)) : null, children: lazyChildren && lazyChildren.startsWith('.') ? resolveTs(f, lazyChildren) : null });
    });
  }
  // lazy children: the routes inside the loaded file (or the routing file next to a loaded module) get the parent's prefix
  const prefixOf = new Map();
  for (const r of raw) if (r.children) {
    const dirOf = path.dirname(r.children);
    for (const f of files) if (f === r.children || (path.dirname(f) === dirOf && f !== r.file)) prefixOf.set(f, r.path);
  }
  const fullPrefix = (f, seen = new Set()) => {
    if (!prefixOf.has(f) || seen.has(f)) return '';
    seen.add(f);
    const parent = raw.find((r) => r.children && (r.children === f || path.dirname(r.children) === path.dirname(f)));
    const up = parent ? fullPrefix(parent.file, seen) : '';
    return [up, prefixOf.get(f)].filter(Boolean).join('/');
  };
  const entries = [];
  for (const r of raw) {
    if (!r.dir || r.redirect) continue;
    const route = '/' + [fullPrefix(r.file), r.path].filter(Boolean).join('/');
    if (/[:*]/.test(route)) continue;
    entries.push({ route: route.replace(/\/+$/, '') || '/', dir: r.dir });
  }
  return entries;
}

// Utility pages are not good screenshot routes for a global change: they show almost nothing of the shared styles.
const UTILITY_ROUTE = /(^|\/)(no-?connection|offline|not-?found|404|500|error|errors|unauthori[sz]ed|forbidden|403|access-denied|maintenance|logout|sign-?out|redirect|callback|silent-refresh)(\/|$)/i;

/** Real content routes of the app (component routes from the routes files, utility pages last), unique. */
function realRoutes(root, entries = routeMap(root)) {
  const seen = new Set(), good = [], weak = [];
  for (const e of entries) { if (seen.has(e.route)) continue; seen.add(e.route); (UTILITY_ROUTE.test(e.route) ? weak : good).push(e.route); }
  // spread over different top-level sections first
  const byTop = new Map();
  for (const r of good) { const top = r.split('/')[1] || ''; if (!byTop.has(top)) byTop.set(top, []); byTop.get(top).push(r); }
  const spread = [];
  for (let i = 0; spread.length < good.length; i++) for (const list of byTop.values()) if (list[i]) spread.push(list[i]);
  return spread.concat(weak);
}

/** Routes whose component folder contains any of the files (forward-slash, project-relative). */
function routesFor(root, files, entries = routeMap(root)) {
  const out = new Set();
  for (const file of files) {
    const abs = path.resolve(root, ...file.split('/'));
    for (const e of entries) if (abs === e.dir || abs.startsWith(e.dir + path.sep)) out.add(e.route);
  }
  return [...out].sort();
}

module.exports = { CONFIG_JS, groupsFor, routeMap, routesFor, realRoutes, UTILITY_ROUTE, SIGNALS };
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
