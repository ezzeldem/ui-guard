#!/usr/bin/env node
'use strict';
// SAFE-06 (noopener), SAFE-07 (plain http / CDN without integrity), SAFE-09/10 (Razor encoding / antiforgery, clear cases),
// STYLE-46 (CSS size budget from dist/). Templates, Razor views, TS and plain JS.
// Images and assets are NOT checked here (they are out of the scan; /ui-guard:assets checks referenced files exist).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const u = require('./lib/util');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

const KB = 1024;

/**
 * SAFE-09 (Razor output not encoded) and SAFE-10 (POST without an antiforgery token) — the clear cases.
 * Whether an @Html.Raw value can hold user data is judged by the AI (the script reports constants as nothing).
 */
function razorChecks(root, f, text, idx, findings) {
  // SAFE-10: Html.BeginForm / Ajax.BeginForm with POST and no AntiForgeryToken inside the using block.
  for (const m of text.matchAll(/@using\s*\(\s*(Html|Ajax)\.BeginForm\(([^)]*)\)\s*\)\s*\{/g)) {
    const args = m[2];
    const isGet = /FormMethod\.Get/.test(args);
    if (isGet) continue;
    let depth = 1, i = m.index + m[0].length;
    for (; i < text.length && depth; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
    const body = text.slice(m.index, i);
    if (!/AntiForgeryToken\s*\(/.test(body)) findings.push(mk(root, 'SAFE-10', f.rel, idx(m.index), `${m[1]}.BeginForm posts without @Html.AntiForgeryToken().`, 'Add @Html.AntiForgeryToken() inside the form.'));
  }
  // SAFE-10: a plain <form method="post"> in an MVC 5 view (no asp-* tag helper attributes) without a token.
  for (const m of text.matchAll(/<form\b[^>]*\bmethod\s*=\s*["']?post["']?[^>]*>/gi)) {
    if (/\basp-[\w-]+\s*=/.test(m[0])) continue; // ASP.NET Core form tag helper adds the token by itself
    const end = text.indexOf('</form>', m.index);
    const body = text.slice(m.index, end < 0 ? text.length : end);
    if (!/AntiForgeryToken|__RequestVerificationToken/.test(body) && !/@addTagHelper/.test(text)) findings.push(mk(root, 'SAFE-10', f.rel, idx(m.index), '<form method="post"> without an antiforgery token.', 'Add @Html.AntiForgeryToken() (MVC 5) or use the ASP.NET Core form tag helper.'));
  }
  // SAFE-09: a model / ViewBag value written into a <script> block without JSON encoding.
  for (const s of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const start = s.index + s[0].indexOf('>') + 1;
    for (const m of s[1].matchAll(/(["'])\s*@(Model|ViewBag|ViewData|TempData)\b[^"'\n]*\1/g)) {
      findings.push(mk(root, 'SAFE-09', f.rel, idx(start + m.index), `\`${u.clip(m[0], 40)}\` writes a server value into a script string without JSON encoding.`, 'Use @Json.Serialize(...) (Core) / @Html.Raw(Json.Encode(...)) (MVC 5) on the whole value.'));
    }
  }
}

function run(root, profile) {
  const findings = [];
  const files = project.listUiFiles(root, profile).filter((x) => ['html', 'index', 'ts', 'cshtml', 'js'].includes(x.kind));
  for (const f of files) {
    const text = u.readText(f.abs) || '';
    const idx = u.lineIndexer(text);
    if (f.kind !== 'ts' && f.kind !== 'js') {
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
    }
    if (f.kind === 'ts' || f.kind === 'js' || f.kind === 'cshtml') {
      for (const m of text.matchAll(/window\.open\(([^)]*)\)/g)) {
        if (/https?:/.test(m[1]) && !/noopener|noreferrer/.test(m[1])) findings.push(mk(root, 'SAFE-06', f.rel, idx(m.index), '`window.open` to another site without `noopener`.', "Pass 'noopener,noreferrer' as the features argument."));
      }
      for (const m of text.matchAll(/(["'`])(http:\/\/[^"'`\s]+)\1/g)) {
        if (/localhost|127\.0\.0\.1|www\.w3\.org/.test(m[2])) continue;
        if (f.kind === 'cshtml' && /<(?:script|link|iframe|a)\b[^>]*$/i.test(text.slice(Math.max(0, m.index - 200), m.index))) continue; // a tag attribute: checked above
        findings.push(mk(root, 'SAFE-07', f.rel, idx(m.index), `URL over plain http:// (\`${u.clip(m[2], 60)}\`).`, 'Use https://.'));
      }
    }
    if (f.kind === 'cshtml') razorChecks(root, f, text, idx, findings);
  }

  // STYLE-46 CSS budget (AXIS performance.md, gzip): common 20 KB, utils 8 KB, the four theme files together 3 KB,
  // each page bundle 12 KB, each layout bundle 8 KB, 60 KB per page in all; vendor CSS is measured, never budgeted.
  // Exceeding a budget warns, it never fails anything.
  const sr = project.scssRoot(profile);
  const gzKB = (buf) => zlib.gzipSync(buf).length;
  const st = require('./lib/scss-text');
  for (const [entry, limit] of [['common/common.scss', 20], ['utilities/utils.scss', 8]]) {
    const abs = u.fromPosix(root, `${sr}/${entry}`);
    if (!u.exists(abs) || !st.loadSass(root)) continue;
    let out = null;
    try { out = st.loadSass(root).compile(abs, { loadPaths: [path.join(root, ...sr.split('/')), path.join(root, 'node_modules')], style: 'compressed', logger: { warn() {}, debug() {} } }).css; } catch { out = null; }
    if (out == null) continue;
    const gz = gzKB(Buffer.from(out));
    if (gz > limit * KB) findings.push(mk(root, 'STYLE-46', `${sr}/${entry}`, 1, `${path.posix.basename(entry)} compiles to ${(gz / KB).toFixed(1)} KB gzip (budget ${limit} KB).`, entry.startsWith('common') ? 'Look for something only a few pages use that was put in common anyway (R-28).' : 'Look for hand-written utilities nothing uses, or a colour family the settings maps no longer need.'));
  }
  const active = project.themeDirs(root, profile).find((t) => t.active);
  if (active) {
    const total = project.THEME_FILES.map((f) => path.join(active.themeDir, ...f.split('/'))).filter((f) => u.exists(f)).reduce((s, f) => s + gzKB(fs.readFileSync(f)), 0);
    if (total > 3 * KB) findings.push(mk(root, 'STYLE-46', `${sr}/theme`, 1, `The four theme files together are ${(total / KB).toFixed(1)} KB gzip (budget 3 KB).`, 'Keep theme files to tokens, @font-face and theme customizations only.'));
  }
  const dist = path.join(root, 'dist');
  if (u.isDir(dist)) {
    for (const f of u.walk(dist).filter((x) => x.endsWith('.css'))) {
      const rel = u.relPosix(root, f);
      if (/\/assets\//.test(rel)) continue; // theme files: measured from the source above
      const gz = gzKB(fs.readFileSync(f));
      const isGlobal = /(^|\/)styles(-[A-Z0-9]+)?\.css$/i.test(rel);
      const limit = isGlobal ? 60 * KB : 12 * KB;
      if (gz > limit) findings.push(mk(root, 'STYLE-46', rel, 1, `${isGlobal ? 'Global styles bundle (common + utils + any legacy and vendor CSS bundled with them)' : 'Page style bundle'} is ${(gz / KB).toFixed(1)} KB gzip (${isGlobal ? 'per-page ceiling' : 'page budget'} ${(limit / KB).toFixed(0)} KB).`, isGlobal ? 'Measure vendor CSS apart (it is not budgeted); check common and utils against their own budgets.' : 'Check which components or modules several pages import directly instead of through common.'));
    }
  }
  return findings;
}

module.exports = { run, razorChecks };
if (require.main === module) cli('web-check', 'web-check.js — SAFE-06 (noopener), SAFE-07 (plain http, CDN without integrity), STYLE-46 (CSS size budget from dist/). Images/assets are not checked here.', run);
