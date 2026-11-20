#!/usr/bin/env node
'use strict';
// §5 /ui-guard:init scaffolding for a NEW project: SCSS tree, theme (active + source), angular.json, index.html.
// Never overwrites an existing file (it reports it instead). Never touches git.
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const ramp = require('./color-ramp');
const iconFilter = require('./icon-filter');

const T = path.join(project.PLUGIN_ROOT, 'templates');
const HELP = `scaffold.js — /ui-guard:init building blocks (new projects only; existing files are never overwritten).
Usage (all accept --root <dir>):
  node scaffold.js scss                       copy the 13-segment SCSS tree + the standard button into src/assets/scss/
  node scaffold.js theme --name <theme> --primary <color> --secondary <color> [--primary-ramp <json>] [--secondary-ramp <json>]
        compute identity values, ramps and icon filters; write the ACTIVE theme (colors.base/palette, fonts, custom) (src/assets/scss/theme/) and the source
        (src/assets/themes/<theme>/theme/ + project-images/), plus shared asset folders that do not exist yet.
  node scaffold.js add-theme --name <new> --primary <color> --secondary <color> [--from <theme>]
        copy the original theme and change ONLY colors.base.theme.css (the six identity values and the four filters).
  node scaffold.js angular-json               styles (vendor first, then common/common.scss and utilities/utils.scss), includePaths, assets, externalDependencies, scss schematic
  node scaffold.js index-html [--lang ar] [--dir rtl]
        <html lang dir>, theme <link>s in <head> (custom.theme.css LAST), favicon from assets/project-images/`;

const created = [], skipped = [];
function put(root, dest, content) {
  if (u.exists(dest)) { skipped.push(u.relPosix(root, dest)); return false; }
  u.writeText(dest, content); created.push(u.relPosix(root, dest)); return true;
}
function copyTree(root, src, dest) {
  for (const f of u.walk(src)) put(root, path.join(dest, path.relative(src, f)), fs.readFileSync(f));
}

function scss(root) {
  const sr = path.join(root, 'src', 'assets', 'scss');
  copyTree(root, path.join(T, 'scss'), sr);
  put(root, path.join(sr, 'components', '_button.component.scss'), fs.readFileSync(path.join(T, 'components', '_button.component.scss')));
}

/** The four per-client icon filters (theme/colors/colors.base.theme.css): brand, second brand, neutral-25, neutral-400. */
function filters(primary, secondary) {
  const f = (c) => iconFilter.solve(c);
  const p = f(primary), s = f(secondary), l = f('hsl(0 0% 100%)'), g = f('hsl(215 9% 65%)'); // neutral-25, neutral-400
  return { values: { '--filter-primary': p, '--filter-secondary': s, '--filter-neutral-25': l, '--filter-neutral-400': g } };
}

/** colors.base.theme.css (identity values + filters, per client) and colors.palette.theme.css (shades, the same for every client). */
function palette(primary, secondary, opts = {}) {
  const pb = ramp.parseInput(primary), sb = ramp.parseInput(secondary);
  const pd = opts.primaryRamp ? ramp.rampFromDesign(pb, opts.primaryRamp) : ramp.defaultRamp(pb);
  const sd = opts.secondaryRamp ? ramp.rampFromDesign(sb, opts.secondaryRamp) : ramp.defaultRamp(sb);
  const fl = filters(primary, secondary);
  const lf = (t) => t.replace(/\r\n/g, '\n');
  const base = lf(u.readText(path.join(T, 'theme', 'colors.base.theme.css')))
    .replace('__IDENTITY__', [...ramp.partLines('', pb), ...ramp.partLines('-2', sb)].join('\n'))
    .replace('__FILTERS__', Object.entries(fl.values).map(([k, v]) => `  ${k}: ${v.css};`).join('\n'));
  const css = lf(u.readText(path.join(T, 'theme', 'colors.palette.theme.css')))
    .replace('__MAIN_STEPS__', ramp.cssLines('main', '', pd).join('\n'))
    .replace('__SECONDARY_STEPS__', ramp.cssLines('secondary', '-2', sd).join('\n'));
  const report = Object.entries(fl.values).map(([k, v]) => `${k}: ΔE ${v.deltaE.toFixed(2)}${v.ok ? '' : ' (≥ 2, best found)'} — not verified in a browser`);
  for (const d of [...ramp.designDrift(pb, opts.primaryRamp), ...ramp.designDrift(sb, opts.secondaryRamp)]) report.push(`design ramp step ${d}`);
  return { css, base, report, identity: { primary: pb, secondary: sb } };
}

function theme(root, args) {
  const name = args.name || project.DEFAULT_THEME;
  const bad = project.themeNameProblem(name);
  if (bad) throw new Error(bad);
  const pal = palette(args.primary, args.secondary, { primaryRamp: args['primary-ramp'] && JSON.parse(u.exists(args['primary-ramp']) ? u.readText(args['primary-ramp']) : args['primary-ramp']), secondaryRamp: args['secondary-ramp'] && JSON.parse(u.exists(args['secondary-ramp']) ? u.readText(args['secondary-ramp']) : args['secondary-ramp']) });
  const files = {
    'colors/colors.base.theme.css': pal.base,
    'colors/colors.palette.theme.css': pal.css,
    'fonts/fonts.theme.css': u.readText(path.join(T, 'theme', 'fonts.theme.css')),
    'custom.theme.css': u.readText(path.join(T, 'theme', 'custom.theme.css')),
  };
  const active = path.join(root, 'src', 'assets', 'scss', 'theme');
  const source = path.join(root, 'src', 'assets', 'themes', name, 'theme');
  for (const [rel, content] of Object.entries(files)) { put(root, path.join(active, ...rel.split('/')), content); put(root, path.join(source, ...rel.split('/')), content); }
  const logo = fs.readFileSync(path.join(T, 'theme', 'logo.svg'));
  const favSrc = ['public/favicon.ico', 'src/favicon.ico'].map((f) => path.join(root, ...f.split('/'))).find((f) => u.exists(f));
  for (const imgDir of [path.join(root, 'src', 'assets', 'project-images'), path.join(root, 'src', 'assets', 'themes', name, 'project-images')]) {
    put(root, path.join(imgDir, 'logo.svg'), logo);
    if (favSrc) put(root, path.join(imgDir, 'favicon.ico'), fs.readFileSync(favSrc));
  }
  for (const d of ['images/icons', 'fonts', 'i18n', 'config']) { const dir = path.join(root, 'src', 'assets', ...d.split('/')); if (!u.isDir(dir)) put(root, path.join(dir, '.gitkeep'), ''); }
  console.log('icon filters:\n  ' + pal.report.join('\n  '));
  return { base: pal.identity };
}

function addTheme(root, args) {
  const bad = project.themeNameProblem(args.name);
  if (bad) throw new Error(bad);
  const from = args.from || (project.readProfile(root).themeName) || project.DEFAULT_THEME;
  const src = path.join(root, 'src', 'assets', 'themes', from);
  const dest = path.join(root, 'src', 'assets', 'themes', args.name);
  if (!u.isDir(src)) throw new Error(`Theme "${from}" not found at ${u.relPosix(root, src)}.`);
  if (u.exists(dest)) throw new Error(`Theme "${args.name}" already exists.`);
  copyTree(root, src, dest);
  // a client's identity lives only in colors.base.theme.css: the palette resolves from it and stays as it is
  const baseFile = path.join(dest, 'theme', 'colors', 'colors.base.theme.css');
  let css = u.readText(baseFile);
  if (css == null) throw new Error(`Theme "${from}" has no theme/colors/colors.base.theme.css — run /ui-guard:fix scss first (Foundation A).`);
  const pb = ramp.parseInput(args.primary), sb = ramp.parseInput(args.secondary);
  const fl = filters(args.primary, args.secondary).values;
  const set = (name, value) => { css = css.replace(new RegExp(`(\\n\\s*${name}\\s*:)[^;]*;`), `$1 ${value};`); };
  set('--hue', pb.h); set('--saturation', pb.s + '%'); set('--lightness', pb.l + '%');
  set('--hue-2', sb.h); set('--saturation-2', sb.s + '%'); set('--lightness-2', sb.l + '%');
  for (const [k, v] of Object.entries(fl)) set(k, v.css);
  fs.writeFileSync(baseFile, css);
  console.log(`theme ${args.name}: copied from ${from}; changed only colors.base.theme.css (the six identity values and the four icon filters).`);
}

function detectIndent(text) { const m = /\n( +|\t)"/.exec(text); return m ? m[1] : 2; }

function angularJson(root) {
  const file = path.join(root, 'angular.json');
  const text = u.readText(file);
  const json = JSON.parse(text);
  const ng = require('./lib/angular').readAngular(root, {});
  const opts = ng.projectConfig.architect.build.options;
  // AXIS entries: common/common.scss and utilities/utils.scss (utilities last of the compiled stylesheets)
  const entries = ['src/assets/scss/common/common.scss', 'src/assets/scss/utilities/utils.scss'];
  const styles = (opts.styles || []).filter((s) => {
    const inp = typeof s === 'string' ? s : s.input;
    if (/^src\/styles\.(s?css)$/.test(inp)) {
      const body = (u.readText(path.join(root, ...inp.split('/'))) || '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim();
      if (!body) {
        // Angular's generated, comment-only global file: not needed, the entries are common.scss and utils.scss.
        fs.unlinkSync(path.join(root, ...inp.split('/')));
        console.log(`angular.json: removed the empty default ${inp} (comments only) — the entries are ${entries.join(' and ')}.`);
        return false;
      }
    }
    return true;
  });
  const isVendor = (s) => /node_modules\//.test(typeof s === 'string' ? s : s.input);
  // vendor CSS first, then a non-empty global stylesheet the project already had (linked right after the vendor CSS), then the entries
  const vendor = styles.filter(isVendor), others = styles.filter((s) => !isVendor(s) && !entries.includes(typeof s === 'string' ? s : s.input));
  opts.styles = [...vendor, ...others, ...entries];
  opts.stylePreprocessorOptions = opts.stylePreprocessorOptions || {};
  const inc = new Set(opts.stylePreprocessorOptions.includePaths || []);
  inc.add('src/assets/scss');
  opts.stylePreprocessorOptions.includePaths = [...inc];
  opts.assets = opts.assets || [];
  if (!opts.assets.some((a) => (typeof a === 'string' ? a : a.input) === 'src/assets')) opts.assets.push('src/assets');
  const ext = new Set(opts.externalDependencies || []);
  ext.add('assets/*');
  opts.externalDependencies = [...ext];
  const proj = ng.projectConfig;
  proj.schematics = proj.schematics || {};
  proj.schematics['@schematics/angular:component'] = { ...(proj.schematics['@schematics/angular:component'] || {}), style: 'scss' };
  json.projects[ng.name] = proj;
  fs.writeFileSync(file, JSON.stringify(json, null, detectIndent(text)) + '\n');
  console.log('angular.json updated: styles, includePaths, assets, externalDependencies, component style scss.');
}

function indexHtml(root, args) {
  const file = path.join(root, 'src', 'index.html');
  let t = u.readText(file);
  const lang = args.lang || 'ar', dir = args.dir || 'rtl';
  t = t.replace(/<html\b([^>]*)>/i, (all, attrs) => {
    let a = attrs.replace(/\s(lang|dir)\s*=\s*["'][^"']*["']/gi, '');
    return `<html lang="${lang}" dir="${dir}"${a}>`;
  });
  const links = project.THEME_FILES.map((f) => `assets/scss/theme/${f}`); // base, palette, fonts, custom (last)
  t = t.replace(/\n?\s*<link[^>]*href=["'][^"']*theme[^"']*\.css["'][^>]*>/gi, '');
  const block = links.map((h) => `  <link rel="stylesheet" href="${h}">`).join('\n');
  t = t.replace(/(\s*)<\/head>/i, `\n${block}\n</head>`);
  if (/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i.test(t)) t = t.replace(/(<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'])[^"']*(["'])/i, '$1assets/project-images/favicon.ico$2');
  else t = t.replace(/<\/head>/i, '  <link rel="icon" type="image/x-icon" href="assets/project-images/favicon.ico">\n</head>');
  fs.writeFileSync(file, t);
  console.log(`index.html updated: lang="${lang}" dir="${dir}", theme links (custom.theme.css last), favicon.`);
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('This is not an Angular project.'); process.exit(1); }
  const cmd = args._[0];
  try {
    if (cmd === 'scss') scss(root);
    else if (cmd === 'theme') { if (!args.primary || !args.secondary) throw new Error('--primary and --secondary are required (ask for the brand colors; never guess).'); theme(root, args); }
    else if (cmd === 'add-theme') { if (!args.name || !args.primary || !args.secondary) throw new Error('--name, --primary and --secondary are required.'); addTheme(root, args); }
    else if (cmd === 'angular-json') angularJson(root);
    else if (cmd === 'index-html') indexHtml(root, args);
    else { console.log(HELP); process.exit(0); }
  } catch (e) { console.error(e.message); process.exit(1); }
  if (created.length) console.log(`created ${created.length} file(s):\n  ` + created.join('\n  '));
  if (skipped.length) console.log(`kept ${skipped.length} existing file(s) (not overwritten):\n  ` + skipped.join('\n  '));
}
module.exports = { palette };
