#!/usr/bin/env node
'use strict';
// SAFE-06 (noopener), SAFE-07 (plain http / CDN without integrity), STYLE-46 (CSS size budget from dist/).
// Images and assets are NOT checked here (they are out of the scan; /ui-guard:assets checks referenced files exist).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const u = require('./lib/util');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const KB = 1024;

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile).filter((x) => x.kind === 'html' || x.kind === 'index' || x.kind === 'ts');
  for (const f of files) {
    const text = u.readText(f.abs) || '';
    const idx = u.lineIndexer(text);
    if (f.kind !== 'ts') {
      for (const m of text.matchAll(/<iframe\b[^>]*>/gi)) {
        if (/src\s*=\s*["']http:\/\//i.test(m[0])) findings.push(mk(root, 'SAFE-07', f.rel, idx(m.index), 'iframe loaded over plain http://.', 'Use https://.'));
      }
      for (const m of text.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
        const tag = m[0];
        const href = (/\shref\s*=\s*["']([^"']*)["']/.exec(tag) || [])[1] || '';
        const external = /^(https?:)?\/\//.test(href) || /\[href\]|\[attr\.href\]/.test(tag);
        if (external && !/rel\s*=\s*["'][^"']*(noopener|noreferrer)/i.test(tag)) findings.push(mk(root, 'SAFE-06', f.rel, idx(m.index), '`target="_blank"` link to another site without `rel="noopener"`.', 'Add rel="noopener noreferrer".'));
      }
      for (const m of text.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const tag = m[0];
        const url = (/\s(?:src|href)\s*=\s*["']([^"']+)["']/.exec(tag) || [])[1] || '';
        if (/^http:\/\//.test(url) && !/localhost/.test(url)) findings.push(mk(root, 'SAFE-07', f.rel, idx(m.index), `${m[1]} loaded over plain http:// (\`${u.clip(url, 60)}\`).`, 'Use https://.'));
        const isCdn = /^(https?:)?\/\//.test(url) && (m[1].toLowerCase() === 'script' || /rel\s*=\s*["']stylesheet/i.test(tag));
        if (isCdn && !/\sintegrity\s*=/.test(tag)) findings.push(mk(root, 'SAFE-07', f.rel, idx(m.index), `CDN ${m[1]} without \`integrity\` (\`${u.clip(url, 60)}\`).`, 'Add integrity + crossorigin="anonymous" (or self-host it).'));
      }
    } else {
      for (const m of text.matchAll(/window\.open\(([^)]*)\)/g)) {
        if (/https?:/.test(m[1]) && !/noopener|noreferrer/.test(m[1])) findings.push(mk(root, 'SAFE-06', f.rel, idx(m.index), '`window.open` to another site without `noopener`.', "Pass 'noopener,noreferrer' as the features argument."));
      }
      for (const m of text.matchAll(/(["'`])(http:\/\/[^"'`\s]+)\1/g)) {
        if (/localhost|127\.0\.0\.1|www\.w3\.org/.test(m[2])) continue;
        findings.push(mk(root, 'SAFE-07', f.rel, idx(m.index), `URL over plain http:// (\`${u.clip(m[2], 60)}\`).`, 'Use https://.'));
      }
    }
  }

  // STYLE-46 CSS budget from the build output (when it exists)
  const dist = path.join(root, 'dist');
  if (u.isDir(dist)) {
    let themeTotal = 0;
    for (const f of u.walk(dist).filter((x) => x.endsWith('.css'))) {
      const rel = u.relPosix(root, f);
      const gz = zlib.gzipSync(fs.readFileSync(f)).length;
      if (/\/assets\/scss\/theme\//.test(rel)) { themeTotal += gz; continue; }
      if (/\/assets\/themes\//.test(rel)) continue;
      const isGlobal = /(^|\/)styles(-[A-Z0-9]+)?\.css$/i.test(rel);
      const limit = isGlobal ? 60 * KB : 12 * KB;
      if (gz > limit) findings.push(mk(root, 'STYLE-46', rel, 1, `${isGlobal ? 'Global styles bundle' : 'Style chunk'} is ${(gz / KB).toFixed(1)} KB gzip (budget ${(limit / KB).toFixed(0)} KB).`, 'Move page-only styles out of the global entry; remove dead CSS.'));
    }
    if (themeTotal > 3 * KB) findings.push(mk(root, 'STYLE-46', 'dist', 1, `Theme files together are ${(themeTotal / KB).toFixed(1)} KB gzip (budget 3 KB).`, 'Keep theme files to tokens only.'));
  }
  return findings;
}

module.exports = { run };
if (require.main === module) cli('web-check', 'web-check.js — SAFE-06 (noopener), SAFE-07 (plain http, CDN without integrity), STYLE-46 (CSS size budget from dist/). Images/assets are not checked here.', run);
