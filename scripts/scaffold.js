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
        compute HSL parts, ramps and icon filters; write the ACTIVE theme (src/assets/scss/theme/) and the source
        (src/assets/themes/<theme>/theme/ + project-images/), plus shared asset folders that do not exist yet.
  node scaffold.js add-theme --name <new> --primary <color> --secondary <color> [--from <theme>]
        copy the original theme and change ONLY the six HSL parts and the four filter values.
  node scaffold.js angular-json               styles (vendor first, then style.scss), includePaths, assets, externalDependencies, scss schematic
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

function filters(primary, secondary) {
  const f = (c) => iconFilter.solve(c);
  const p = f(primary), s = f(secondary), l = f('#ffffff'), g = f('hsl(215 9% 65%)'); // neutral-400
  return { values: { '--color-img': p, '--secondary-color-img': s, '--light-img': l, '--gray-img': g } };
}

function palette(primary, secondary, opts = {}) {
  const pb = ramp.parseInput(primary), sb = ramp.parseInput(secondary);
  const pd = opts.primaryRamp ? ramp.rampFromDesign(pb, opts.primaryRamp) : ramp.defaultRamp(pb);
  const sd = opts.secondaryRamp ? ramp.rampFromDesign(sb, opts.secondaryRamp) : ramp.defaultRamp(sb);
  const fl = filters(primary, secondary);
  const tpl = u.readText(path.join(T, 'theme', 'colors.palette.theme.css'));
  const css = tpl
    .replace('__MAIN_PARTS__', ramp.partLines('', pb).join('\n'))
    .replace('__SECONDARY_PARTS__', ramp.partLines('secondary-', sb).join('\n'))
    .replace('__FILTERS__', Object.entries(fl.values).map(([k, v]) => `  ${k}: ${v.css};`).join('\n'))
    .replace('__MAIN_STEPS__', ramp.cssLines('main', '', pd).join('\n'))
    .replace('__SECONDARY_STEPS__', ramp.cssLines('secondary', 'secondary-', sd).join('\n'));
  const report = Object.entries(fl.values).map(([k, v]) => `${k}: ΔE ${v.deltaE.toFixed(2)}${v.ok ? '' : ' (≥ 2, best found)'} — not verified in a browser`);
  return { css, report, base: { primary: pb, secondary: sb } };
}

function theme(root, args) {
  const name = args.name || 'original-theme';
  const pal = palette(args.primary, args.secondary, { primaryRamp: args['primary-ramp'] && JSON.parse(u.exists(args['primary-ramp']) ? u.readText(args['primary-ramp']) : args['primary-ramp']), secondaryRamp: args['secondary-ramp'] && JSON.parse(u.exists(args['secondary-ramp']) ? u.readText(args['secondary-ramp']) : args['secondary-ramp']) });
  const files = {
    'colors/colors.palette.theme.css': pal.css,
    'fonts/fonts.theme.css': u.readText(path.join(T, 'theme', 'fonts.theme.css')),
    'images/images.theme.css': u.readText(path.join(T, 'theme', 'images.theme.css')),
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
  return { base: pal.base };
}

function addTheme(root, args) {
  const from = args.from || (project.readProfile(root).themeName) || 'original-theme';
  const src = path.join(root, 'src', 'assets', 'themes', from);
  const dest = path.join(root, 'src', 'assets', 'themes', args.name);
  if (!u.isDir(src)) throw new Error(`Theme "${from}" not found at ${u.relPosix(root, src)}.`);
  if (u.exists(dest)) throw new Error(`Theme "${args.name}" already exists.`);
  copyTree(root, src, dest);
  const palFile = path.join(dest, 'theme', 'colors', 'colors.palette.theme.css');
  let css = u.readText(palFile);
  const pb = ramp.parseInput(args.primary), sb = ramp.parseInput(args.secondary);
  const fl = filters(args.primary, args.secondary).values;
  const set = (name, value) => { css = css.replace(new RegExp(`(\\n\\s*${name}\\s*:)[^;]*;`), `$1 ${value};`); };
  set('--hue', pb.h); set('--saturation', pb.s + '%'); set('--lightness', pb.l + '%');
  set('--secondary-hue', sb.h); set('--secondary-saturation', sb.s + '%'); set('--secondary-lightness', sb.l + '%');
  for (const [k, v] of Object.entries(fl)) set(k, v.css);
  fs.writeFileSync(palFile, css);
  console.log(`theme ${args.name}: copied from ${from}; changed only the six HSL parts and four filters.`);
}

function detectIndent(text) { const m = /\n( +|\t)"/.exec(text); return m ? m[1] : 2; }

function angularJson(root) {
  const file = path.join(root, 'angular.json');
  const text = u.readText(file);
  const json = JSON.parse(text);
  const ng = require('./lib/angular').readAngular(root, {});
  const opts = ng.projectConfig.architect.build.options;
  const entry = 'src/assets/scss/style.scss';
  const styles = (opts.styles || []).filter((s) => {
    const inp = typeof s === 'string' ? s : s.input;
    if (/^src\/styles\.(s?css)$/.test(inp)) {
      const body = (u.readText(path.join(root, ...inp.split('/'))) || '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim();
      if (!body) {
        // Angular's generated, comment-only global file: folded into the one global entry (style.scss).
        fs.unlinkSync(path.join(root, ...inp.split('/')));
        console.log(`angular.json: removed the empty default ${inp} (comments only) — the global entry is src/assets/scss/style.scss.`);
        return false;
      }
    }
    return true;
  });
  const isVendor = (s) => /node_modules\//.test(typeof s === 'string' ? s : s.input);
  const vendor = styles.filter(isVendor), others = styles.filter((s) => !isVendor(s) && (typeof s === 'string' ? s : s.input) !== entry);
  opts.styles = [...vendor, entry, ...others];
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
  const links = ['colors/colors.palette.theme.css', 'fonts/fonts.theme.css', 'images/images.theme.css', 'custom.theme.css'].map((f) => `assets/scss/theme/${f}`);
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
