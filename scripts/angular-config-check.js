#!/usr/bin/env node
'use strict';
// STYLE-27 (packages/ + vendor order), STYLE-29 (double import), STYLE-36 (theme files via <link>, custom.theme.css last),
// STYLE-57 (nothing from themes/ or project-images/ in angular.json styles).
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const ng = require('./lib/angular');
const graph = require('./lib/sass-graph');
const { mk, cli } = require('./lib/findings');

const THEME_RE = /(^|\/)theme\/.*\.s?css$|\.theme\.s?css$|custom[._]theme\.s?css$|(^|\/)fonts?\/[^/]*\.css$|(^|\/)(themes|project-images)\//;

function stylesheetLinks(html) {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const headEnd = head ? head.index + head[0].length : 0;
  const links = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  // <head> and <body>: custom.theme.css is linked at the start of <body> (after the styles bundle Angular adds to <head>)
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = (/href\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || '';
    links.push({ href, tag, line: u.lineAt(html, m.index), inBody: !!head && m.index >= headEnd });
  }
  return { links, headEndLine: head ? u.lineAt(html, head.index + head[0].length) : 1 };
}

function run(root, profile) {
  const findings = [];
  const ngc = ng.readAngular(root, profile);
  const sr = project.scssRoot(profile);
  if (ngc && !ngc.error) {
    let projectIdx = -1;
    ngc.styles.forEach((s, i) => {
      const inp = s.input || '';
      const line = ng.lineOf(ngc.text, inp);
      if (THEME_RE.test(inp)) findings.push(mk(root, /(^|\/)(themes|project-images)\//.test(inp) ? 'STYLE-57' : 'STYLE-36', 'angular.json', line, `Swappable theme file \`${inp}\` is in angular.json \`styles\` — it is bundled and cannot be swapped after the build.`, 'Remove it from styles; link it from index.html (assets/…).'));
      else if (inp.includes(sr + '/packages/') || /(^|\/)packages\//.test(inp) && inp.startsWith('src/')) findings.push(mk(root, 'STYLE-27', 'angular.json', line, `\`${inp}\` from packages/ is compiled through angular.json.`, 'Load vendor CSS from node_modules in styles; packages/ is never compiled.'));
      else if (/^(\.\/)?node_modules\//.test(inp)) {
        if (projectIdx >= 0 && s.inject) findings.push(mk(root, 'STYLE-27', 'angular.json', line, `Vendor CSS \`${inp}\` is listed after the project entry \`${ngc.styles[projectIdx].input}\`.`, 'List vendor CSS before the project styles entry.'));
      } else if (/^src\//.test(inp) && projectIdx < 0) projectIdx = i;
    });
  } else if (ngc && ngc.error) findings.push(mk(root, 'STYLE-27', 'angular.json', 1, ngc.error, null, { severity: 'warning' }));

  // index.html links
  const html = u.readText(path.join(root, 'src', 'index.html'));
  if (html != null) {
    const { links, headEndLine } = stylesheetLinks(html);
    const active = project.themeDirs(root, profile).find((t) => t.active);
    const themeFiles = active ? u.walk(active.themeDir).filter((f) => f.endsWith('.css')).map((f) => u.relPosix(path.join(root, 'src'), f)) : [];
    for (const tf of themeFiles) {
      const link = links.find((l) => l.href.replace(/^\.?\//, '') === tf || l.href.endsWith(tf.replace(/^assets\//, '')));
      if (!link) findings.push(mk(root, 'STYLE-36', 'src/index.html', headEndLine, `Theme file \`${tf}\` is not loaded with <link> in index.html.`, `Add <link rel="stylesheet" href="${tf}"> in <head>.`));
      else if (!/^(\.\/)?assets\//.test(link.href)) findings.push(mk(root, 'STYLE-36', 'src/index.html', link.line, `Theme link \`${link.href}\` is not loaded from assets/.`, `Use href="${tf}".`));
    }
    // AXIS output.md: colors.base, colors.palette, fonts — in that order — and custom.theme.css last
    const order = project.THEME_FILES.map((tf) => links.findIndex((l) => l.href.replace(/^\.?\//, '').endsWith('theme/' + tf)));
    for (let k = 1; k < order.length - 1; k++) {
      const prev = order.slice(0, k).filter((x) => x >= 0).pop();
      if (order[k] >= 0 && prev !== undefined && order[k] < prev) findings.push(mk(root, 'STYLE-36', 'src/index.html', links[order[k]].line, `${project.THEME_FILES[k].split('/').pop()} is linked before ${links[prev].href.split('/').pop()} — the theme token files are linked colors.base, colors.palette, fonts.`, 'Reorder the theme <link>s: colors.base, colors.palette, fonts, then custom.theme.css last.'));
    }
    const customIdx = links.findIndex((l) => /custom[._]theme\.css$/.test(l.href));
    if (customIdx >= 0 && (customIdx !== links.length - 1 || !links[customIdx].inBody)) {
      const why = customIdx !== links.length - 1 ? `\`${links[links.length - 1].href}\` comes after it` : 'it is in <head>, and Angular adds the global styles bundle at the end of <head>, after it';
      findings.push(mk(root, 'STYLE-36', 'src/index.html', links[customIdx].line, `custom.theme.css is not the last stylesheet loaded (${why}).`, 'Move the custom.theme.css <link> to the start of <body>, after every other stylesheet link (phase 1, checked with the pixel diff).'));
    }
  }

  // STYLE-27 (@use of packages) and STYLE-29 (double import)
  const scss = project.listUiFiles(root, profile).filter((f) => f.kind === 'scss');
  const inc = ngc && !ngc.error ? graph.includePaths(root, ngc) : [];
  const g = graph.build(scss.map((f) => f.abs), inc);
  for (const [file, deps] of g) for (const d of deps) {
    if (/(^|\/)packages\//.test(d.target)) findings.push(mk(root, 'STYLE-27', u.relPosix(root, file), d.line, `\`@${d.kind} "${d.target}"\` — packages/ files are never compiled or imported.`, 'Load vendor CSS from angular.json styles (node_modules).'));
  }
  const commonDir = path.join(root, ...sr.split('/'), 'common');
  const viaCommon = new Map(); // resolved file → common aggregator that reaches it
  for (const f of scss.filter((x) => x.abs.startsWith(commonDir + path.sep))) {
    for (const r of graph.reachable(g, f.abs)) if (!r.startsWith(commonDir + path.sep) && !viaCommon.has(r)) viaCommon.set(r, f.rel);
  }
  // R-29: the importer is a page entry, a layout entry or a component style — never a file that is itself reached through common/
  const reachedByCommon = new Set(viaCommon.keys());
  for (const [file, deps] of g) {
    if (file.startsWith(commonDir + path.sep) || reachedByCommon.has(file)) continue;
    for (const d of deps) {
      if (!d.resolved || !viaCommon.has(d.resolved)) continue;
      if (/(^|\/)(tools|settings)(\/|$)/.test(u.relPosix(root, d.resolved))) continue;
      findings.push(mk(root, 'STYLE-29', u.relPosix(root, file), d.line, `\`${u.relPosix(root, d.resolved)}\` is already reached through \`${viaCommon.get(d.resolved)}\` — imported twice.`, 'Remove this @use.'));
    }
  }
  return findings;
}

module.exports = { run, stylesheetLinks };
if (require.main === module) cli('angular-config-check', `angular-config-check.js — angular.json + index.html: STYLE-27 (packages/ never compiled, vendor CSS before project styles),
STYLE-29 (no double import of files reached through common/), STYLE-36 (theme files via <link> from assets/, custom.theme.css last).`, run);
