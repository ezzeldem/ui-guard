'use strict';
// Proposes the AXIS name of a project class that has no role/state prefix (STYLE-01), with no question to the developer.
//   prefix  : from the file that defines the class (SCSS segment, else the folder → role map of .ui-guard/profile.md, else the app folder)
//   shape   : lower-case kebab-case; `__` marks a BEM element; camelCase / snake_case / `--modifier` are normalised
//   element : a class styled only inside another block's rule is that block's element (R-04): .p-block__x
//   state   : STATE-named classes → js- when code sets them ([class.x], [ngClass], classList…), else is-
//   unique  : never equal to a class that already exists or was already proposed (suffix -2, -3 …)
const u = require('./util');
const project = require('./project');

const PREFIX_RE = /^(o|c|l|m|ctrl|p|u|is|has|js)-/;
const SEGMENT_PREFIX = { components: 'c-', objects: 'o-', modules: 'm-', layout: 'l-', pages: 'p-', utilities: 'u-', common: 'c-' };
const CODE_SET = new Set(['[class.x]', '[ngClass]', '[class]', 'classList', 'Renderer2', '@HostBinding', 'querySelector', 'host class']);

/** Lower-case kebab-case; keeps `__` (BEM element), turns camelCase, snake_case and `--` into single hyphens. */
function kebab(name) {
  return String(name).split('__').map((part) => part
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/_+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').toLowerCase()).filter(Boolean).join('__');
}

/** The role prefix ("c-", "l-", "p-", …) for the file that defines a class. */
function prefixFor(file, profile) {
  const sr = project.scssRoot(profile);
  if (file.startsWith(sr + '/')) {
    const seg = file.slice(sr.length + 1).split('/')[0];
    if (SEGMENT_PREFIX[seg]) return SEGMENT_PREFIX[seg];
  }
  const hit = project.roleMap(profile).find((r) => u.globMatch(r.glob, file));
  if (hit) return ((hit.prefixes || []).find((p) => /^(o|c|l|m|ctrl|p|u)-$/.test(p))) || { layout: 'l-', page: 'p-', component: 'c-' }[hit.role] || 'c-';
  if (/^src\/app\/(shared|core|common)\//.test(file)) return 'c-';
  if (/(^|\/)(layout|layouts|shell)[^/]*\//.test(file)) return 'l-';
  if (/^src\/app\//.test(file) && /\.component\.s?css$/.test(file) && !/\/pages?\//.test(file)) return 'c-';
  return 'p-';
}

/**
 * @param {string} cls            the old class name (no dot)
 * @param {object} ctx            { profile, defs:[{file}], uses:[{how}], outer:string|null, taken:Set<string>, isState:boolean }
 * @returns {{ name: string, reason: string }}
 */
function propose(cls, ctx) {
  const defs = (ctx.defs || []).filter((d) => !/(^|\/)theme\//.test(d.file));
  const file = (defs[0] || (ctx.defs || [])[0] || {}).file || '';
  const prefix = prefixFor(file, ctx.profile);
  const base = kebab(cls);
  let name, reason;
  if (ctx.isState) {
    const code = (ctx.uses || []).some((x) => CODE_SET.has(x.how));
    name = (code ? 'js-' : 'is-') + base;
    reason = `STYLE-03 — state class: ${code ? 'js- (set by code: ' + [...new Set((ctx.uses || []).filter((x) => CODE_SET.has(x.how)).map((x) => x.how))].join(', ') + ')' : 'is- (fixed in markup)'}`;
  } else if (base.includes('__')) {
    const [blk, ...els] = base.split('__');
    const block = PREFIX_RE.test(blk) ? blk : prefix + blk;
    name = `${block}__${els.join('-')}`;
    reason = `STYLE-01 — element of block \`${block}\`, prefix ${prefix} from ${file || 'the role map'}`;
  } else if (ctx.outer) {
    const ob = kebab(ctx.outer);
    const block = PREFIX_RE.test(ob) ? ob : prefix + ob;
    // the element does not repeat the block's words: .footer-title inside .app-footer → __title (not __footer-title)
    const blockWords = new Set(ob.replace(PREFIX_RE, '').split(/[-_]+/));
    const words = base.split('-');
    while (words.length > 1 && blockWords.has(words[0])) words.shift();
    name = `${block}__${words.join('-')}`;
    reason = `STYLE-01/STYLE-04 — element of .${ctx.outer} (styled only inside it), prefix ${prefix}`;
  } else {
    name = prefix + base;
    reason = `STYLE-01 — prefix ${prefix} for ${file || 'its role'}${base !== cls ? '; name normalised to kebab-case' : ''}`;
  }
  const taken = ctx.taken || new Set();
  if (taken.has(name)) { let i = 2; while (taken.has(`${name}-${i}`)) i++; name = `${name}-${i}`; reason += ' (suffix: the name was already taken)'; }
  taken.add(name);
  return { name, reason };
}

/** A class that code or a template binding switches on and off ([class.x], [ngClass], classList…) is a state class (js-). */
const isCodeToggled = (uses) => (uses || []).some((x) => CODE_SET.has(x.how));

module.exports = { propose, kebab, prefixFor, isCodeToggled, PREFIX_RE };
