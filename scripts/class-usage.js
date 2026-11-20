#!/usr/bin/env node
'use strict';
// STYLE-01 usages in templates/TS: authored classes (defined in project SCSS) used without a valid prefix.
// Also builds the full class usage index (for renames): .ui-guard/tmp/scan/class-usage.json
// `--class <name>` prints every usage of one class.
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');
const ng = require('./lib/angular');
const { mk } = require('./lib/findings');
const lib = require('./lib/libclasses');

const PREFIXES = ['o-', 'c-', 'l-', 'm-', 'ctrl-', 'p-', 'u-', 'is-', 'has-', 'js-'];
const hasPrefix = (c) => PREFIXES.some((p) => c.startsWith(p));

/** Classes defined in project styles: name → [{file,line}] */
function definitions(root, profile) {
  const defs = new Map();
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    const tree = css.parse(u.readText(f.abs) || '');
    css.walk(tree, (node, parents) => {
      if (node.type !== 'rule' || parents.some((p) => p.type === 'atrule' && /^(mixin|function)$/.test(p.name))) return;
      for (const sel of css.resolveSelectors(parents, node)) for (const c of css.classesIn(sel)) {
        if (!defs.has(c)) defs.set(c, []);
        defs.get(c).push({ file: f.rel, line: node.line });
      }
    });
  }
  return defs;
}

/** Vendor classes from angular.json node_modules CSS and scss/packages (so they are never flagged). */
function vendorClasses(root, profile) { return new Set(lib.vendorMap(root, profile).keys()); }

/** Class usages in one template/TS text: [{cls, line, how}] */
function usages(text, isHtml) {
  const out = [];
  const idx = u.lineIndexer(text);
  const add = (s, at, how) => { for (const c of s.split(/\s+/)) if (/^-?[_a-zA-Z][\w-]*$/.test(c)) out.push({ cls: c, line: idx(at), how }); };
  if (isHtml) {
    for (const m of text.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) add(m[1].replace(/\{\{[^}]*\}\}/g, ' '), m.index, 'class');
    for (const m of text.matchAll(/\[class\.([\w-]+)\]/g)) add(m[1], m.index, '[class.x]');
    for (const m of text.matchAll(/\[ngClass\]\s*=\s*"([^"]*)"/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) add(q[1], m.index, '[ngClass]');
    for (const m of text.matchAll(/\[class\]\s*=\s*"([^"]*)"/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) add(q[1], m.index, '[class]');
  } else {
    for (const m of text.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/["'`]([\w\s-]+)["'`]/g)) add(q[1], m.index, 'classList');
    for (const m of text.matchAll(/\.(?:addClass|removeClass)\([^,]+,\s*["'`]([\w-]+)["'`]/g)) add(m[1], m.index, 'Renderer2');
    for (const m of text.matchAll(/querySelector(?:All)?\(\s*["'`]([^"'`]+)["'`]/g)) for (const q of m[1].matchAll(/\.([\w-]+)/g)) add(q[1], m.index, 'querySelector');
    for (const m of text.matchAll(/(?:host\s*:\s*\{[^}]*?)?['"]?class['"]?\s*:\s*["'`]([\w\s-]+)["'`]/g)) add(m[1], m.index, 'host class');
    for (const m of text.matchAll(/template\s*:\s*`([\s\S]*?)`/g)) for (const x of usages(m[1], true)) out.push({ ...x, line: x.line + idx(m.index) - 1 });
    for (const m of text.matchAll(/@HostBinding\(\s*['"]class\.([\w-]+)['"]/g)) add(m[1], m.index, '@HostBinding');
  }
  return out;
}

function run(root, profile) {
  const findings = [];
  const defs = definitions(root, profile);
  const ctx = lib.context(root, profile); // library classes (Bootstrap, ngx-*, node_modules CSS, ::ng-deep) are never flagged
  const index = {};
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'html' || x.kind === 'ts' || x.kind === 'index' || x.kind === 'cshtml' || x.kind === 'js')) {
    const text = u.readText(f.abs) || '';
    for (const us of usages(text, f.kind !== 'ts')) {
      (index[us.cls] = index[us.cls] || []).push({ file: f.rel, line: us.line, how: us.how });
      if (hasPrefix(us.cls) || lib.libraryReason(us.cls, ctx) || !defs.has(us.cls)) continue;
      findings.push(mk(root, 'STYLE-01', f.rel, us.line, `Class \`${us.cls}\` (authored in ${defs.get(us.cls)[0].file}) has no role/state prefix (${us.how}).`, 'Rename with the right prefix in SCSS and in every usage (see class-usage.json).'));
    }
  }
  for (const [c, list] of defs) (index[c] = index[c] || []).push(...list.map((d) => ({ ...d, how: 'definition' })));
  u.writeJSON(path.join(project.paths(root).scan, 'class-usage.json'), index);
  return findings;
}

module.exports = { run, usages, definitions, vendorClasses, hasPrefix };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  if (args.class && !args.help) {
    const root = args.root ? path.resolve(args.root) : project.findRoot();
    const profile = project.readProfile(root);
    run(root, profile);
    const idx = u.readJSON(path.join(project.paths(root).scan, 'class-usage.json'), {});
    const list = idx[args.class] || [];
    console.log(`${args.class}: ${list.length} usage(s)`);
    for (const l of list) console.log(`  ${l.file}:${l.line} (${l.how})`);
    process.exit(0);
  }
  require('./lib/findings').cli('class-usage', `class-usage.js — STYLE-01 usages: authored classes used in templates/TS without a prefix.
Writes the usage index to .ui-guard/tmp/scan/class-usage.json.
  --class <name>   print every usage (definitions + templates + TS) of one class, for renames`, run);
}
