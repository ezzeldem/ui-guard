'use strict';
// @use / @forward / @import graph of the project's SCSS (resolution like Sass, without compiling).
const path = require('path');
const u = require('./util');

function includePaths(root, angular) {
  const out = [];
  const proj = angular && angular.projectConfig;
  const opts = proj && proj.architect && proj.architect.build && proj.architect.build.options;
  const ip = opts && opts.stylePreprocessorOptions && opts.stylePreprocessorOptions.includePaths;
  for (const p of ip || []) out.push(path.join(root, ...p.split('/')));
  return out;
}

function resolve(fromFile, target, incPaths) {
  if (/^sass:/.test(target) || /^(https?:|url\()/.test(target)) return null;
  const t = target.replace(/^~/, '');
  const dirs = [path.dirname(fromFile), ...incPaths];
  const base = t.split('/');
  const name = base.pop();
  const cands = [];
  for (const d of dirs) {
    const dir = path.join(d, ...base);
    for (const n of [`_${name}.scss`, `${name}.scss`, `_${name}.css`, `${name}.css`, `_${name}`, name]) cands.push(path.join(dir, n));
    cands.push(path.join(dir, name, '_index.scss'), path.join(dir, name, 'index.scss'));
  }
  for (const c of cands) if (u.exists(c) && !u.isDir(c)) return c;
  return null;
}

/** Map absFile → [{ kind, target, resolved, line }] for the given scss files. */
function build(files, incPaths) {
  const graph = new Map();
  for (const f of files) {
    const text = u.readText(f) || '';
    const deps = [];
    const re = /@(use|forward|import)\s+((?:["'][^"']+["']\s*,?\s*)+)/g;
    let m;
    while ((m = re.exec(text))) {
      const line = u.lineAt(text, m.index);
      for (const q of m[2].matchAll(/["']([^"']+)["']/g)) deps.push({ kind: m[1], target: q[1], resolved: resolve(f, q[1], incPaths), line });
    }
    graph.set(f, deps);
  }
  return graph;
}

/** Every file reachable from start (not including start), following resolved deps. */
function reachable(graph, start, filesForMissing = (f) => build([f], [])) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    let deps = graph.get(cur);
    if (!deps) { deps = filesForMissing(cur).get(cur) || []; graph.set(cur, deps); }
    for (const d of deps) if (d.resolved && !seen.has(d.resolved)) { seen.add(d.resolved); stack.push(d.resolved); }
  }
  return seen;
}

module.exports = { includePaths, resolve, build, reachable };
