#!/usr/bin/env node
'use strict';
// STYLE-32, STYLE-33, STYLE-35, STYLE-36 (SCSS @use/@import of theme files),
// STYLE-56 (theme folders hold plain .css only), STYLE-57 (project-images and theme files never go into the build).
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');
const { mk, cli } = require('./lib/findings');

function propNames(file) {
  const t = u.readText(file);
  if (t == null) return null;
  return css.customProps(css.parse(t));
}

function checkTokenFileShape(root, abs, rel, findings) {
  const t = u.readText(abs);
  if (t == null) return;
  const tree = css.parse(t);
  const isFonts = /fonts\.theme\.css$/.test(rel) || /\/fonts\/[^/]+\.css$/.test(rel);
  const isCustom = /custom\.theme\.css$/.test(rel);
  if (isCustom) {
    css.walk(tree, (node, parents) => {
      if (node.type === 'rule') {
        for (const sel of css.splitSelectors(node.selector)) {
          const stripped = sel.replace(/\.[\w-]+/g, '').replace(/:root\b/g, 'ROOT').replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '').replace(/\bbody\b/g, '').replace(/[\s>+~]/g, '');
          if (stripped) findings.push(mk(root, 'STYLE-33', rel, node.line, `Selector \`${u.clip(sel, 60)}\` in custom.theme.css — only class selectors and \`body\` are allowed.`, 'Use a class selector (or body).'));
        }
      }
      if (node.type === 'decl' && node.prop.startsWith('--')) findings.push(mk(root, 'STYLE-33', rel, node.line, `custom.theme.css defines custom property \`${node.prop}\`.`, 'Move the token to its theme file (colors.base, colors.palette or fonts).'));
      void parents;
    });
    return;
  }
  
  const visit = (nodes, insideAt) => {
    for (const node of nodes) {
      if (node.type === 'rule') {
        if (node.selector.trim() === ':root') continue;
        findings.push(mk(root, 'STYLE-32', rel, node.line, `Selector \`${u.clip(node.selector, 60)}\` in a token file — only \`:root\` blocks are allowed.`, 'Move this rule to a utility/component/element file.'));
      } else if (node.type === 'atrule') {
        if (node.name === 'charset') continue;
        if (node.name === 'font-face' && isFonts && !insideAt) continue;
        if (node.nodes) visit(node.nodes, true);
        else if (!(isFonts && node.name === 'font-face')) findings.push(mk(root, 'STYLE-32', rel, node.line, `\`@${node.name}\` in a token file.`, 'Token files hold only :root blocks (fonts: @font-face + :root).'));
      } else if (node.type === 'decl') {
        findings.push(mk(root, 'STYLE-32', rel, node.line, `Declaration \`${node.prop}\` outside \`:root\` in a token file.`, 'Put it inside :root.'));
      }
    }
  };
  visit(tree.nodes, false);
}

function run(root, profile) {
  const findings = [];
  const themes = project.themeDirs(root, profile);
  // STYLE-32 / STYLE-33 on every theme token file (active + sources)
  for (const th of themes) {
    for (const f of u.walk(th.themeDir).filter((x) => x.endsWith('.css'))) checkTokenFileShape(root, f, u.relPosix(root, f), findings);
  }
  // STYLE-35: same custom property names in the same files across every theme
  if (themes.length > 1) {
    const fileSet = new Set();
    const per = themes.map((th) => {
      const map = {};
      for (const f of u.walk(th.themeDir).filter((x) => x.endsWith('.css'))) {
        const sub = u.relPosix(th.themeDir, f);
        fileSet.add(sub);
        map[sub] = new Set((propNames(f) || []).map((p) => p.name));
      }
      return { th, map };
    });
    for (const sub of [...fileSet].sort()) {
      const union = new Map();
      for (const p of per) for (const name of (p.map[sub] || [])) if (!union.has(name)) union.set(name, p.th.name);
      for (const p of per) {
        const relFile = u.relPosix(root, path.join(p.th.themeDir, ...sub.split('/')));
        if (!p.map[sub]) { findings.push(mk(root, 'STYLE-35', u.relPosix(root, p.th.themeDir), 1, `Theme \`${p.th.name}\` has no \`${sub}\` (other themes do).`, `Copy ${sub} from another theme and set this client's values.`)); continue; }
        for (const [name, from] of union) {
          if (!p.map[sub].has(name)) findings.push(mk(root, 'STYLE-35', relFile, 1, `Missing \`${name}\` (defined in theme \`${from}\`) — this client breaks silently.`, `Add ${name} to ${sub} in theme ${p.th.name}.`));
        }
      }
    }
  }
  // STYLE-36: theme files are never @use'd / @import'ed from SCSS
  const scssFiles = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss');
  for (const f of scssFiles) {
    const t = u.readText(f.abs) || '';
    const re = /@(use|import|forward)\s+["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(t))) {
      if (/(^|\/)themes?\/|\.theme(\.css)?$|custom[._]theme|colors\.palette/.test(m[2])) {
        findings.push(mk(root, 'STYLE-36', f.rel, u.lineAt(t, m.index), `Theme file \`${m[2]}\` is ${m[1]}d from SCSS — it can no longer be swapped after the build.`, 'Remove it from SCSS; load it with <link> in index.html.'));
      }
    }
  }
  // STYLE-56: every stylesheet in a theme folder (active theme/ and every src/assets/themes/<name>/) is plain .css
  const sr = project.scssRoot(profile);
  const themeRoots = [path.join(root, ...sr.split('/'), 'theme'), path.join(root, 'src', 'assets', 'themes')].filter((d) => u.isDir(d));
  for (const dir of themeRoots) {
    for (const f of u.walk(dir)) {
      const ext = (path.extname(f) || '').toLowerCase();
      if (!['.scss', '.sass', '.less', '.styl'].includes(ext)) continue;
      const base = path.basename(f).replace(/^_/, '').replace(/\.(scss|sass|less|styl)$/i, '.css');
      findings.push(mk(root, 'STYLE-56', u.relPosix(root, f), 1, `\`${path.basename(f)}\` is a ${ext.slice(1)} file in a theme folder — theme files are plain CSS (<link>ed from index.html and swapped after the build, never compiled).`, `Write it as plain CSS: \`${base}\` (one of the four fixed theme files). Sass features (variables, nesting, @use, mixins) become plain CSS or move to the SCSS segments.`));
    }
  }
  // STYLE-57: compiled code never references project-images/ or a theme file — the build copies (hashed) or inlines it,
  // so the file swapped after the build is never used. Only theme CSS (<link>ed) and templates (src="assets/…") point at them.
  const SWAP_RE = /(^|[/"'(])(project-images|themes)\/|(^|\/)theme\/[^"')]*\.css\b|\.theme\.css\b/;
  for (const f of project.listUiFiles(root, profile)) {
    if (!['scss', 'css', 'ts'].includes(f.kind)) continue;
    if (project.segmentOf(f.rel, profile).segment === 'theme' || /^src\/assets\/themes\//.test(f.rel)) continue;
    const t = u.readText(f.abs) || '';
    const res = f.kind === 'ts'
      ? [/\bimport\s+(?:[\w{}*\s,]+\s+from\s+)?["']([^"']+)["']/g, /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g, /\bstyleUrls?\s*:\s*\[?\s*["']([^"']+)["']/g]
      : [/url\(\s*["']?([^"')]+)["']?\s*\)/g];
    for (const re of res) {
      let m;
      while ((m = re.exec(t))) {
        const ref = m[1];
        if (/^(data:|https?:|\/\/|#)/.test(ref) || !SWAP_RE.test(ref)) continue;
        const line = u.lineAt(t, m.index);
        if (f.kind === 'ts') findings.push(mk(root, 'STYLE-57', f.rel, line, `\`${u.clip(ref, 70)}\` is imported in code — the build bundles it, so the client file swapped after the build is never used.`, 'Never import a project image or theme file. Point at it at run time: `src="assets/project-images/<file>"` in the template, theme CSS by <link> in index.html.'));
        else findings.push(mk(root, 'STYLE-57', f.rel, line, ref.startsWith('/')
          ? `\`url(${u.clip(ref, 70)})\` in a compiled stylesheet — a client asset belongs to the theme, and a root path breaks under a non-root base href.`
          : `\`url(${u.clip(ref, 70)})\` in a compiled stylesheet — the build copies the file into the bundle (hashed name), so the client image swapped after the build is never shown.`, 'Move this brand-asset/background rule to custom.theme.css (its url() resolves at run time and swaps with the theme), or use <img src="assets/project-images/<file>"> in the template.'));
      }
    }
  }
  // Image files (MEDIA-08) are not part of the scan: /ui-guard:assets checks referenced files exist.
  void fs;
  return findings;
}

module.exports = { run };
if (require.main === module) cli('theme-check', `theme-check.js — theme files: STYLE-32 (token files :root only), STYLE-33 (custom.theme.css),
STYLE-35 (same token names in every theme), STYLE-36 (theme files never @use'd from SCSS),
STYLE-56 (theme folders hold plain .css only), STYLE-57 (project-images / theme files never referenced from compiled code). Images are not checked here (see /ui-guard:assets).`, run);
