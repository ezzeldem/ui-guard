'use strict';
// Which classes belong to a LIBRARY (Bootstrap, PrimeNG, ngx-*, …) or are STATE classes, so ui-guard never
// proposes renaming them and never raises STYLE-01 for merely using them.
//   a) known Bootstrap names/patterns   b) library prefixes (ngx- mat- ng- swiper- ngb- cdk-, p- only with PrimeNG)
//   c) classes defined in the CSS of node_modules styles listed in angular.json   d) classes the project styles only
//   under a library selector or ::ng-deep.
const path = require('path');
const u = require('./util');
const css = require('./css');
const project = require('./project');
const ng = require('./angular');

const BOOTSTRAP = [
  /^form-(control|check|check-input|check-label|check-inline|select|label|text|floating|range|switch)(-[\w-]+)?$/, /^input-group(-[\w-]+)?$/,
  /^btn(-[\w-]+)?$/, /^modal(-[\w-]+)?$/, /^pagination(-[\w-]+)?$/, /^page-(item|link)$/, /^breadcrumb(-[\w-]+)?$/, /^dropdown(-[\w-]+)?$/,
  /^nav(-[\w-]+)?$/, /^navbar(-[\w-]+)?$/, /^card(-[\w-]+)?$/, /^table(-[\w-]+)?$/, /^row(-cols-\d+)?$/, /^col(-[\w-]+)?$/, /^container(-[\w-]+)?$/,
  /^d-[\w-]+$/, /^text-[\w-]+$/, /^bg-[\w-]+$/, /^border(-[\w-]+)?$/, /^rounded(-[\w-]+)?$/, /^shadow(-[\w-]+)?$/, /^flex-[\w-]+$/,
  /^justify-content-[\w-]+$/, /^align-(items|self|content)-[\w-]+$/, /^g[xy]?-\d$/, /^gap-\d$/, /^float-[\w-]+$/, /^position-[\w-]+$/, /^(fw|fs|lh)-[\w-]+$/,
  /^w-\d+$/, /^h-\d+$/, /^(badge|alert|toast|tooltip|popover|spinner-border|spinner-grow|progress|list-group|accordion|carousel|offcanvas)(-[\w-]+)?$/,
  /^(valid|invalid)-feedback$/, /^(is-valid|is-invalid)$/, /^(visually-hidden|sr-only|invisible|visible|clearfix|ratio)(-[\w-]+)?$/,
  /^[mp][trblxy]?-(auto|n?[0-5])$/, /^[mp][trblxy]?-(sm|md|lg|xl|xxl)-(auto|n?[0-5])$/, /^(ms|me|ps|pe)-(auto|n?[0-5])$/,
  /^(show|active|disabled|fade|collapse|collapsing|collapsed)$/,
];
const LIB_PREFIXES = ['ngx-', 'mat-', 'mdc-', 'ng-', 'swiper-', 'ngb-', 'cdk-'];
// project-owned STATE classes (when not set by a library): target is-/has-/js- (STYLE-03), never c-
const STATE = new Set(['show', 'active', 'open', 'opened', 'close', 'closed', 'selected', 'disabled', 'error', 'loading', 'loaded', 'keyboard-focused', 'on-drag', 'expanded', 'collapsed', 'checked',
  'invalid', 'valid', 'dirty', 'touched', 'hidden', 'visible', 'focused', 'hover', 'current', 'done', 'success', 'warning', 'sticky', 'fixed', 'scrolled', 'dragging', 'drag-over', 'empty', 'readonly', 'required']);
const OWN_PREFIX = /^(o|c|l|m|ctrl|p|u|is|has|js)-/;

function patternReason(name, hasPrime) {
  if (BOOTSTRAP.some((re) => re.test(name))) return 'Bootstrap class';
  for (const p of LIB_PREFIXES) if (name.startsWith(p)) return `library prefix \`${p}\``;
  if (hasPrime && name.startsWith('p-')) return 'PrimeNG class (`p-` prefix)';
  return null;
}

/** class → css file name (basename) for every class in node_modules styles listed in angular.json (and scss/packages). */
function vendorMap(root, profile) {
  const map = new Map();
  const files = [];
  const ngc = ng.readAngular(root, profile);
  if (ngc && !ngc.error) for (const s of ngc.styles) if (/node_modules\//.test(s.input || '')) files.push(path.join(root, ...s.input.replace(/^\.\//, '').split('/')));
  const pk = path.join(root, ...project.scssRoot(profile).split('/'), 'packages');
  if (u.isDir(pk)) files.push(...u.walk(pk).filter((f) => f.endsWith('.css')));
  for (const f of files) {
    const t = u.readText(f);
    if (!t) continue;
    for (const m of t.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!map.has(m[1])) map.set(m[1], path.basename(f));
  }
  return map;
}

/** Classes the project styles only under a library selector or ::ng-deep (unprefixed ones only). */
function scopedClasses(root, profile, hasPrime, vendor) {
  const defs = new Map(); // class → [bool scoped]
  const isLib = (c) => !!patternReason(c, hasPrime) || vendor.has(c);
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    if (project.isThemeTokenFile(f.rel)) continue;
    const tree = css.parse(u.readText(f.abs) || '');
    css.walk(tree, (node, parents) => {
      if (node.type !== 'rule' || parents.some((p) => p.type === 'atrule' && /^(mixin|function)$/.test(p.name))) return;
      for (const sel of css.resolveSelectors(parents, node)) {
        const ng_ = /::ng-deep/.test(sel);
        const classes = css.classesIn(sel);
        classes.forEach((c, i) => {
          if (OWN_PREFIX.test(c)) return;
          const underLib = ng_ || classes.slice(0, i).some((o) => o !== c && isLib(o));
          (defs.get(c) || defs.set(c, []).get(c)).push(underLib);
        });
      }
    });
  }
  const out = new Set();
  for (const [c, flags] of defs) if (flags.length && flags.every(Boolean)) out.add(c);
  return out;
}

function context(root, profile) {
  const pkg = u.readJSON(path.join(root, 'package.json'), {});
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasPrime = !!deps.primeng;
  const vendor = vendorMap(root, profile);
  return { hasPrime, vendor, scoped: scopedClasses(root, profile, hasPrime, vendor) };
}

/** Reason a class is a library class (never renamed), or null. */
function libraryReason(name, ctx) {
  const p = patternReason(name, ctx.hasPrime);
  if (p) return p;
  if (ctx.vendor.has(name)) return `defined in \`${ctx.vendor.get(name)}\` (a declared dependency)`;
  if (ctx.scoped.has(name)) return 'the project styles it only under a library selector or ::ng-deep';
  return null;
}
const isStateClass = (name) => STATE.has(name);

/** The class named by a STYLE-01 finding (stylelint or class-usage wording), or null. */
function style01Class(f) {
  if (!f || f.ruleId !== 'STYLE-01') return null;
  const m = /Class "\.?([\w-]+)"/.exec(f.message || '') || /Class `\.?([\w-]+)`/.exec(f.message || '');
  return m ? m[1] : null;
}

/** Split findings: STYLE-01 on library classes → kept (with reason); everything else → rest. */
function splitFindings(findings, ctx) {
  const kept = [], rest = [];
  for (const f of findings) {
    const c = style01Class(f);
    const why = c && libraryReason(c, ctx);
    if (why) kept.push({ finding: f, cls: c, reason: why }); else rest.push(f);
  }
  return { kept, rest };
}

module.exports = { BOOTSTRAP, LIB_PREFIXES, STATE, patternReason, vendorMap, context, libraryReason, isStateClass, style01Class, splitFindings };
