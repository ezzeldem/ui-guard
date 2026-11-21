// ui-guard custom Stylelint rules (ESM — Stylelint 17+ is ESM-only). Every message starts with its ui-guard ID.
// Copied into <project>/.ui-guard/lint/ so linting works outside Claude (VS Code, git hook).
import stylelint from 'stylelint';

const { createPlugin, utils: { report, ruleMessages, validateOptions } } = stylelint;
const NS = 'ui-guard';
const filePath = (root) => String((root.source && root.source.input && root.source.input.file) || '').split('\\').join('/');

function make(name, id, check, extraMsgs = {}) {
  const ruleName = `${NS}/${name}`;
  const messages = ruleMessages(ruleName, { rejected: (m) => (/^\[[A-Z]+-\d{2}\]/.test(m) ? m : `[${id}] ${m}`), ...extraMsgs });
  const rule = (primary, secondary) => (root, result) => {
    if (!validateOptions(result, ruleName, { actual: primary, possible: [true, false] })) return;
    if (primary === false) return;
    const opts = secondary || {};
    const r = (node, msg, extra = {}) => report({ ruleName, result, node, message: messages.rejected(msg), ...extra });
    check(root, r, opts, result);
  };
  rule.ruleName = ruleName;
  rule.messages = messages;
  rule.meta = { url: 'https://github.com/ (ui-guard rules/style.md)' };
  return createPlugin(ruleName, rule);
}

const inMixinOrFunction = (node) => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && (p.name === 'mixin' || p.name === 'function')) return true; return false; };
const stripStrings = (s) => String(s).replace(/"[^"]*"|'[^']*'/g, '""');

/** Resolve `&` nesting into full selectors (good enough for class checks). */
function resolveSelector(rule) {
  const chain = [];
  for (let n = rule; n && n.type !== 'root'; n = n.parent) if (n.type === 'rule') chain.unshift(n.selector);
  let cur = [''];
  for (const sel of chain) {
    const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [];
    for (const base of cur) for (const part of parts) next.push(part.includes('&') ? part.replace(/&/g, base) : (base ? base + ' ' : '') + part);
    cur = next;
  }
  return cur;
}
const classesOf = (sel) => [...stripStrings(sel).replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

// ---------- STYLE-26 charset-first ----------
const charsetFirst = make('charset-first', 'STYLE-26', (root, r) => {
  const first = root.first;
  const css = root.source && root.source.input && root.source.input.css || '';
  const ok = first && first.type === 'atrule' && first.name === 'charset' && /^"UTF-8"$/i.test(first.params.trim()) && /^@charset "UTF-8";/i.test(css.replace(/^\uFEFF/, ''));
  if (!ok) r(first || root, '`@charset "UTF-8";` must be the first line of the file.');
});

// ---------- STYLE-10 px-only-1px ----------
// $variables are lengths too (R-08): only settings/_breakpoints.settings.scss may hold px (the config turns the rule off there).
const pxOnly1px = make('px-only-1px', 'STYLE-10', (root, r) => {
  root.walkDecls((d) => {
    const v = stripStrings(d.value).replace(/url\([^)]*\)/g, '');
    for (const m of v.matchAll(/\bpx\(\s*([^)]*?)\s*\)/g)) if (/[a-z%]$/i.test(m[1]) && !/^\$/.test(m[1])) r(d, `\`px(${m[1]})\`: the px() argument is unitless — write \`px(${parseFloat(m[1])})\`.`, { word: m[0] });
    for (const m of v.replace(/\bpx\([^)]*\)/g, '').matchAll(/(^|[^\w.#-])(-?\d*\.?\d+)px\b/g)) {
      const n = Math.abs(parseFloat(m[2]));
      if (n === 1) continue;
      r(d, `\`${m[2]}px\`: use \`px(${parseFloat(m[2])})\` (rem). Raw px is only for 1px.`, { word: `${m[2]}px` });
    }
  });
});

// ---------- STYLE-05 nesting-depth (AXIS R-05) ----------
// Max 4 levels, the root selector is level 1. Only @media is not counted (and @include mq(), which IS an @media);
// every other nested rule counts — &__el, &.state, descendants, @supports, @container, @layer, and an @include with a
// content block (hover(), dir()… emit a nested selector). Sass control flow (@if/@else/@each/@for/@while) and
// @mixin/@function bodies are not CSS nesting and are skipped.
const NOT_COUNTED_AT = new Set(['media', 'if', 'else', 'each', 'for', 'while', 'mixin', 'function']);
const counts = (n) => n.type === 'rule' || (n.type === 'atrule' && !NOT_COUNTED_AT.has(n.name) && !(n.name === 'include' && (!n.nodes || /^mq\b/.test(n.params))));
const nestingDepth = make('nesting-depth', 'STYLE-05', (root, r, opts) => {
  const max = Number(opts.max || 4);
  root.walk((n) => {
    if (!counts(n) || inMixinOrFunction(n)) return;
    let depth = 1;
    for (let p = n.parent; p && p.type !== 'root'; p = p.parent) if (counts(p)) depth++;
    if (depth === max + 1) r(n, `Nesting depth ${depth} (max ${max}, the root selector is level 1; only @media is not counted). Flatten it with BEM element classes.`);
  });
});

// ---------- STYLE-11 logical-properties (AXIS R-09: logical properties only — width/height included) ----------
const PHYS = {
  'margin-left': 'margin-inline-start', 'margin-right': 'margin-inline-end', 'margin-top': 'margin-block-start', 'margin-bottom': 'margin-block-end',
  'padding-left': 'padding-inline-start', 'padding-right': 'padding-inline-end', 'padding-top': 'padding-block-start', 'padding-bottom': 'padding-block-end',
  'border-left': 'border-inline-start', 'border-right': 'border-inline-end', 'border-top': 'border-block-start', 'border-bottom': 'border-block-end',
  'border-left-width': 'border-inline-start-width', 'border-right-width': 'border-inline-end-width', 'border-top-width': 'border-block-start-width', 'border-bottom-width': 'border-block-end-width',
  'border-left-color': 'border-inline-start-color', 'border-right-color': 'border-inline-end-color', 'border-top-color': 'border-block-start-color', 'border-bottom-color': 'border-block-end-color',
  'border-left-style': 'border-inline-start-style', 'border-right-style': 'border-inline-end-style', 'border-top-style': 'border-block-start-style', 'border-bottom-style': 'border-block-end-style',
  'border-top-left-radius': 'border-start-start-radius', 'border-top-right-radius': 'border-start-end-radius', 'border-bottom-left-radius': 'border-end-start-radius', 'border-bottom-right-radius': 'border-end-end-radius',
  left: 'inset-inline-start', right: 'inset-inline-end', top: 'inset-block-start', bottom: 'inset-block-end',
  width: 'inline-size', height: 'block-size', 'min-width': 'min-inline-size', 'max-width': 'max-inline-size', 'min-height': 'min-block-size', 'max-height': 'max-block-size',
  'scroll-margin-left': 'scroll-margin-inline-start', 'scroll-margin-right': 'scroll-margin-inline-end', 'scroll-margin-top': 'scroll-margin-block-start', 'scroll-margin-bottom': 'scroll-margin-block-end',
  'scroll-padding-left': 'scroll-padding-inline-start', 'scroll-padding-right': 'scroll-padding-inline-end', 'scroll-padding-top': 'scroll-padding-block-start', 'scroll-padding-bottom': 'scroll-padding-block-end',
  // reported, never converted by scss-fix (incomplete browser support → decision)
  'overflow-x': 'overflow-inline', 'overflow-y': 'overflow-block', 'overscroll-behavior-x': 'overscroll-behavior-inline', 'overscroll-behavior-y': 'overscroll-behavior-block',
  'contain-intrinsic-width': 'contain-intrinsic-inline-size', 'contain-intrinsic-height': 'contain-intrinsic-block-size',
};
const PHYS_VALUES = { 'text-align': { left: 'start', right: 'end' }, float: { left: 'inline-start', right: 'inline-end' }, clear: { left: 'inline-start', right: 'inline-end' }, resize: { horizontal: 'inline', vertical: 'block' } };
const logicalProperties = make('logical-properties', 'STYLE-11', (root, r) => {
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase();
    if (prop.startsWith('$') || prop.startsWith('--')) return;
    const bare = prop.replace(/^-(webkit|moz|ms)-/, '');
    if (PHYS[bare]) r(d, `Physical property \`${prop}\` — use \`${PHYS[bare]}\`.`, { word: d.prop });
    const vmap = PHYS_VALUES[bare];
    const val = String(d.value).trim().toLowerCase();
    if (vmap && vmap[val]) r(d, `\`${prop}: ${val}\` — use \`${prop}: ${vmap[val]}\`.`, { word: d.value });
  });
});

// ---------- STYLE-12 no-literal-color-fallback ----------
const NAMED = /\b(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta|gold|beige|ivory|khaki|coral|salmon|tomato|crimson|indigo|violet)\b/i;
const noLiteralColorFallback = make('no-literal-color-fallback', 'STYLE-12', (root, r) => {
  root.walkDecls((d) => {
    const v = String(d.value);
    let i = 0;
    while ((i = v.indexOf('var(', i)) >= 0) {
      let depth = 0, j = i + 3, comma = -1;
      for (; j < v.length; j++) { if (v[j] === '(') depth++; else if (v[j] === ')') { depth--; if (!depth) break; } else if (v[j] === ',' && depth === 1 && comma < 0) comma = j; }
      if (comma > 0) {
        const fb = v.slice(comma + 1, j).trim();
        if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(fb) || NAMED.test(fb)) r(d, `Literal color fallback \`${fb}\` inside var() — use the token only.`, { word: fb });
      }
      i = j;
    }
  });
});

// ---------- STYLE-15 mq-only ----------
const mqOnly = make('mq-only', 'STYLE-15', (root, r) => {
  root.walkAtRules('media', (a) => {
    if (inMixinOrFunction(a)) return;
    const p = a.params.replace(/\s+/g, ' ').trim();
    if (/^\(\s*hover\s*:\s*hover\s*\)$/.test(p)) return;
    if (/prefers-reduced-motion/.test(p)) return;
    r(a, `Raw \`@media ${p}\` — write media queries with \`@include mq(min|max, w|h, <breakpoint>)\`.`);
  });
});

// ---------- STYLE-16 no-output ----------
const noOutput = make('no-output', 'STYLE-16', (root, r) => {
  root.each(function visit(node) {
    if (node.type === 'comment') return;
    if (node.type === 'decl') { if (!node.prop.startsWith('$')) r(node, `Declaration \`${node.prop}\` outputs CSS — settings/tools output nothing.`); return; }
    if (node.type === 'atrule') {
      if (['charset', 'use', 'forward', 'mixin', 'function', 'debug', 'warn', 'error'].includes(node.name)) return;
      if (['if', 'else', 'each', 'for', 'while'].includes(node.name)) { if (node.nodes) node.each(visit); return; }
      r(node, `\`@${node.name}\` outputs CSS — settings/tools output nothing (only variables, maps, functions, mixins).`);
      return;
    }
    if (node.type === 'rule') r(node, `Rule \`${node.selector}\` outputs CSS — settings/tools output nothing.`);
  });
});

// ---------- STYLE-08 attribute-selector (AXIS R-26) ----------
// Allowed only as `[aria-*]` or `:is([dir="rtl"])` chained onto a project class (a class with a segment or state prefix in
// the same compound selector). Generic, Elements and common/_attributes.common.scss turn the rule off. Mixin bodies are
// checked too: whatever a tool writes lands in the file that includes it.
const PROJECT_CLASS = /\.(o|c|l|m|ctrl|p|u|is|has|js)-[\w-]/;
function compounds(sel) {
  const out = [];
  let cur = '', depth = 0, q = '';
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const attributeSelector = make('attribute-selector', 'STYLE-08', (root, r) => {
  root.walkRules((rule) => {
    const reported = new Set();
    for (const full of resolveSelector(rule)) {
      for (const comp of compounds(full)) {
        const owned = PROJECT_CLASS.test(comp.replace(/\[[^\]]*\]/g, ''));
        for (const m of comp.matchAll(/(:is\(\s*)?\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(["']?)([^"'\]]*)\4)?\s*\]/g)) {
          const [, inIs, name, , , value] = m;
          if (owned && !inIs && /^aria-/.test(name)) continue;
          if (owned && inIs && name === 'dir' && value === 'rtl' && /^:is\(\s*\[[^\]]*\]\s*\)/.test(comp.slice(m.index))) continue;
          if (reported.has(name)) continue;
          reported.add(name);
          r(rule, `Attribute selector \`[${name}…]\` — use a class or a pseudo-class (e.g. \`:disabled\` not \`[disabled]\`); only \`[aria-*]\` or \`:is([dir="rtl"])\` chained onto a project class is allowed (R-26).`, { word: '[' + name });
        }
      }
    }
  });
});

// ---------- STYLE-23 duplicate-media-include ----------
const duplicateMediaInclude = make('duplicate-media-include', 'STYLE-23', (root, r) => {
  const check = (container) => {
    const seen = new Map();
    container.each((n) => {
      if (n.type === 'atrule' && n.name === 'include' && /^mq\s*\(/.test(n.params.trim()) && n.nodes) {
        const key = n.params.replace(/\s+/g, '');
        if (seen.has(key)) r(n, `Duplicate \`@include ${n.params}\` block in this rule — merge it into the first one (keep the later values).`);
        else seen.set(key, n);
      }
    });
  };
  check(root);
  root.walkRules(check);
  root.walkAtRules((a) => { if (a.nodes && a.name !== 'include') check(a); });
});

// ---------- STYLE-25 utility-one-property ----------
const UTIL_EXCEPT = new Set(['u-container', 'u-sr-only', 'u-not-sr-only']);
// AXIS utilities.md — short property names
const SHORT = { 'font-family': 'ff', 'font-size': 'fs', 'font-weight': 'fw', 'background-color': 'bg', color: 'text', 'text-align': 'text-align' };
const BP = /-(mob-min|mob-wide|mob|xs|sm-tab|sm-wide|sm|tablet|compact-h|md-max|md-wide|md|lg|xl-max|xl|xxl|mobile|desktop)$/;
const utilityOneProperty = make('utility-one-property', 'STYLE-25', (root, r) => {
  root.walkRules((rule) => {
    if (inMixinOrFunction(rule)) return;
    for (const sel of resolveSelector(rule)) {
      const cls = classesOf(sel);
      const util = cls.find((c) => c.startsWith('u-'));
      if (!util) continue;
      // a u-<short>-<step> utility names a token step (u-fs-sm = var(--fs-sm)), not a breakpoint
      const tokenStep = Object.values(SHORT).some((s) => util.startsWith(`u-${s}-`));
      if (BP.test(util) && !tokenStep) r(rule, `Utility \`.${util}\` has a breakpoint in its name — fluid values read a clamp() token instead (R-UTIL-6).`);
      const compound = sel.trim();
      if (cls.length > 1 || /\s|>|\+|~|#/.test(compound.replace(/::?[\w-]+(\([^)]*\))?/g, ''))) r(rule, `Utility selector \`${compound}\` raises specificity — utilities win by load order only.`);
      if (UTIL_EXCEPT.has(util)) continue;
      const props = new Set();
      rule.each((n) => { if (n.type === 'decl' && !n.prop.startsWith('$') && !n.prop.startsWith('--')) props.add(n.prop.toLowerCase()); });
      if (props.size > 1) r(rule, `Utility \`.${util}\` sets ${props.size} properties (${[...props].join(', ')}) — a utility sets exactly one.`);
      if (props.size !== 1) continue;
      // R-UTIL-5: u-{property}-{value} with the short property names (text alone always means color)
      const p = [...props][0];
      if (SHORT[p] && !util.startsWith(`u-${SHORT[p]}-`)) r(rule, `Utility \`.${util}\` sets \`${p}\` — name it \`u-${SHORT[p]}-<value>\` (R-UTIL-5 short names).`);
      else {
        const named = Object.entries(SHORT).sort((a, b) => b[1].length - a[1].length).find(([, s]) => util.startsWith(`u-${s}-`));
        if (named && named[0] !== p) r(rule, `Utility \`.${util}\` is named \`u-${named[1]}-…\`, which means \`${named[0]}\`, but sets \`${p}\` (R-UTIL-5 short names).`);
      }
    }
  });
});

// ---------- STYLE-30 use-tools-only ----------
// A component style @uses settings and tools only. A routed page's style (option `page`) is the page entry of AXIS: it may
// also @use the page-local objects, components and modules it needs (R-28: used by one to four pages, needed by no layout).
const PAGE_LOCAL = /(^|\/)(objects\/_?[\w-]+\.object|components\/_?[\w-]+\.component|modules\/_?[\w-]+(\.[\w-]+)?\.module)$/;
const useToolsOnly = make('use-tools-only', 'STYLE-30', (root, r, opts) => {
  let index = 0, toolsAt = -1;
  root.each((n) => {
    if (n.type === 'comment') return;
    index++;
    if (n.type === 'atrule' && (n.name === 'use' || n.name === 'forward')) {
      const target = (/["']([^"']+)["']/.exec(n.params) || [])[1] || '';
      if (/^sass:/.test(target)) return;
      if (opts.page && n.name === 'use' && PAGE_LOCAL.test(target)) return;
      if (!/(^|\/)_?(tools|settings)(\/|$|\.)|\.tools$|\.settings$/.test(target)) r(n, `Component style \`@${n.name} "${target}"\` — component styles @use only settings/tools${opts.page ? ' (a page may also @use its page-local objects, components and modules)' : ''}; anything else would be compiled into every component.`);
      if (/(^|\/)tools$/.test(target)) toolsAt = index;
    }
  });
  if (toolsAt > 2) r(root.first, '`@use "tools" as *;` must come right after `@charset`.');
});

// ---------- STYLE-32 token-file-root-only ----------
const tokenFileRootOnly = make('token-file-root-only', 'STYLE-32', (root, r, opts) => {
  const fontsFile = opts.fonts || /fonts\.theme\.css$|\/fonts\/[^/]+\.css$/.test(filePath(root));
  const visit = (container, insideAt) => container.each((n) => {
    if (n.type === 'comment') return;
    if (n.type === 'rule') { if (n.selector.trim() !== ':root') r(n, `Selector \`${n.selector}\` in a token file — only \`:root\` blocks are allowed.`); return; }
    if (n.type === 'atrule') {
      if (n.name === 'charset') return;
      if (n.name === 'font-face' && fontsFile && !insideAt) return;
      if (n.nodes) return visit(n, true);
      r(n, `\`@${n.name}\` in a token file.`);
      return;
    }
    if (n.type === 'decl') r(n, `Declaration \`${n.prop}\` outside \`:root\`.`);
  });
  visit(root, false);
});

// ---------- STYLE-33 custom-theme ----------
const customTheme = make('custom-theme', 'STYLE-33', (root, r) => {
  root.walkRules((rule) => {
    for (const sel of rule.selector.split(',')) {
      // `*`, `:root`, `html` and any other element are not class selectors (R-34)
      const rest = stripStrings(sel).replace(/\.[\w-]+/g, '').replace(/:root\b/g, 'ROOT').replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\bbody\b/g, '').replace(/[\s>+~&]/g, '');
      if (rest) r(rule, `Selector \`${sel.trim()}\` in custom.theme.css — only class selectors and \`body\` are allowed (no \`*\`, \`:root\`, \`html\` or other element).`);
    }
  });
  root.walkDecls((d) => { if (d.prop.startsWith('--')) r(d, `custom.theme.css defines custom property \`${d.prop}\` — tokens live in the palette/fonts/images files.`); });
});

// ---------- STYLE-37 no-literal-filter ----------
const noLiteralFilter = make('no-literal-filter', 'STYLE-37', (root, r) => {
  root.walkDecls((d) => {
    if (!/^(-webkit-)?filter$/i.test(d.prop)) return;
    if (/\b(invert|sepia|saturate|hue-rotate|brightness|contrast|grayscale)\(/i.test(d.value)) r(d, 'Literal icon filter — use a filter utility class (u-filter-primary|secondary|neutral-25|neutral-400) that reads a --filter-* token.');
  });
  root.walkRules((rule) => { if (/\[\s*data-img/.test(rule.selector)) r(rule, '`[data-img]` selector — color icons with the u-filter-* utilities.'); });
});

// ---------- STYLE-40 focus-visible ----------
const focusVisible = make('focus-visible', 'STYLE-40', (root, r) => {
  root.walkDecls((d) => {
    const p = d.prop.toLowerCase(), v = String(d.value).trim().toLowerCase();
    const removes = (p === 'outline' && /^(none|0|0px|0rem)$/.test(v)) || (p === 'outline-style' && v === 'none') || (p === 'outline-width' && /^0(px|rem)?$/.test(v));
    if (!removes) return;
    const rule = d.parent && d.parent.type === 'rule' ? d.parent : null;
    if (!rule) return;
    if (/:focus-visible/.test(rule.selector)) return; // inside a focus-visible rule it is part of a replacement
    let has = false;
    rule.walkRules((x) => { if (/:focus-visible/.test(x.selector)) has = true; });
    rule.walkAtRules('include', (a) => { if (/^hover\b/.test(a.params)) has = true; });
    const classes = new Set(classesOf(resolveSelector(rule).join(',')));
    if (!has && rule.parent) rule.parent.walkRules((x) => { if (/:focus-visible/.test(x.selector) && classesOf(resolveSelector(x).join(',')).some((c) => classes.has(c))) has = true; });
    if (!has) r(d, '`outline` removed without a `:focus-visible` replacement in the same rule set — keyboard users lose focus. (Report only: never restyled by ui-guard fixes.)');
  });
});

// ---------- STYLE-41 hover-media ----------
const hoverMedia = make('hover-media', 'STYLE-41', (root, r) => {
  root.walkRules((rule) => {
    if (inMixinOrFunction(rule) || !/:hover/.test(rule.selector)) return;
    let media = null;
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && /hover\s*:\s*hover/.test(p.params)) { media = p; break; }
    if (!media) { r(rule, '`:hover` outside `@media (hover: hover)` — use `@include hover { … }` (adds the :focus-visible style too).'); return; }
    let focus = false;
    const scope = media.parent || root;
    scope.walkRules((x) => { if (/:focus-visible/.test(x.selector)) focus = true; });
    if (!focus) r(rule, '`:hover` style without a matching `:focus-visible` style — use `@include hover { … }`.');
  });
});

// ---------- STYLE-04 bem ----------
const bem = make('bem', 'STYLE-04', (root, r) => {
  root.walkRules((rule) => {
    if (inMixinOrFunction(rule)) return;
    const reported = new Set();
    for (const sel of resolveSelector(rule)) for (const c of classesOf(sel)) {
      if (reported.has(c)) continue;
      if (/--/.test(c)) { reported.add(c); r(rule, `\`.${c}\` uses a BEM --modifier — write the variant as \`.${c.replace(/--/, '-')}\` (block name + variant).`); }
      else if ((c.match(/__/g) || []).length > 1) { reported.add(c); r(rule, `\`.${c}\` has more than one BEM element level — use one: \`block__element\`. A nested \`&__a { &__b {} }\` compiles to this: write \`&__a {}\` and \`&__b {}\` as siblings directly under the block.`); }
    }
  });
});

// ---------- STYLE-47 nest-block-parts ----------
// Elements and variants of a block defined in the same file are written inside it: `&__icon`, `&-secondary`.
// Also: a rule nested in its block that repeats the full block name (`.l-header { .l-header__toggle {} }`) is written `&__toggle`.
const nestBlockParts = make('nest-block-parts', 'STYLE-47', (root, r) => {
  const single = (sel) => (/^\.(-?[_a-zA-Z][\w-]*)(?::[\w-]+(?:\([^)]*\))?)*$/.exec(sel.trim()) || [])[1];
  const blocks = new Set();
  root.each((n) => { if (n.type === 'rule') for (const s of n.selector.split(',')) { const c = single(s); if (c && !c.includes('__')) blocks.add(c); } });
  root.each((n) => {
    if (n.type !== 'rule') return;
    for (const s of n.selector.split(',')) {
      const c = single(s);
      if (!c || c.includes('--')) continue; // `--modifier` is STYLE-04's job (never suggest `&--x`)
      const el = c.indexOf('__');
      if (el > 0 && blocks.has(c.slice(0, el))) { r(n, `\`.${c}\` is an element of \`.${c.slice(0, el)}\` — write it inside the block as \`&${c.slice(el)}\`.`); continue; }
      const parent = [...blocks].filter((b) => b !== c && c.startsWith(b + '-')).sort((a, b) => b.length - a.length)[0];
      if (parent) r(n, `\`.${c}\` is a variant of \`.${parent}\` — write it inside the block as \`&${c.slice(parent.length)}\`.`);
    }
  });
  // nested rules that repeat the full block name. A real descendant context (`.l-header .other-block`) is not a single class: never flagged.
  root.walkRules((n) => {
    if (!n.parent || n.parent.type === 'root' || inMixinOrFunction(n)) return;
    let outer = null, depth = 0;
    for (let p = n.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'rule') { outer = p; depth++; }
    if (!outer || outer.selector.includes(',')) return;
    const b = single(outer.selector);
    if (!b || b.includes('__')) return;
    for (const s of n.selector.split(',')) {
      const c = single(s);
      if (!c || c.includes('--')) continue;
      const where = depth > 1 ? ' as a sibling directly under the block, not inside another element' : ' inside the block';
      if (c.startsWith(b + '__')) r(n, `\`.${c}\` repeats the block name inside \`.${b}\` — write it as \`&${c.slice(b.length)}\`${where}.`);
      else if (c.startsWith(b + '-') && !c.includes('__')) r(n, `\`.${c}\` repeats the block name inside \`.${b}\` — write the variant as \`&${c.slice(b.length)}\`${where}.`);
    }
  });
});

// ---------- STYLE-21 no-important (AXIS R-20) ----------
// Used in Generic only (declaration-no-important everywhere else): the one `@media (prefers-reduced-motion: reduce)` block may.
const noImportant = make('no-important', 'STYLE-21', (root, r, opts) => {
  root.walkDecls((d) => {
    if (!d.important) return;
    if (opts.reducedMotion) for (let p = d.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && /prefers-reduced-motion\s*:\s*reduce/.test(p.params)) return;
    r(d, '`!important` — only the one Generic `@media (prefers-reduced-motion: reduce)` block may use it (R-20).', { word: '!important' });
  });
});

// ---------- STYLE-01 / STYLE-54 module-classes (AXIS R-01, R-15, R-30, R-31, R-36) ----------
// _<name>.module.scss: m- (or ctrl-) blocks and state classes only — no vendor selector.
// _<name>.control.module.scss: ctrl- blocks only. _<vendor-component>.<library>.module.scss: one m-<vendor-component> block;
// the vendor classes it overrides sit inside it (a vendor class at the top level is not allowed).
const moduleClasses = make('module-classes', 'STYLE-01', (root, r) => {
  const base = filePath(root).split('/').pop() || '';
  const control = /\.control\.module\.scss$/.test(base);
  const libM = /^_([\w-]+)\.([\w-]+)\.module\.scss$/.exec(base);
  const library = !control && libM && libM[2] !== 'control';
  const state = /^(is|has|js)-/;
  root.walkRules((rule) => {
    if (inMixinOrFunction(rule)) return;
    const reported = new Set();
    for (const sel of resolveSelector(rule)) {
      const cls = classesOf(sel);
      cls.forEach((c, i) => {
        if (reported.has(c) || state.test(c)) return;
        const own = control ? /^ctrl-/.test(c) : /^(m|ctrl)-/.test(c);
        if (own) {
          if (library && i === 0 && /^m-/.test(c) && c.split('__')[0] !== `m-${libM[1]}` && !rule.parent.type.startsWith('rule')) { reported.add(c); r(rule, `[STYLE-54] Library module \`${base}\` overrides \`${libM[1]}\`: its block is \`.m-${libM[1]}\`, not \`.${c}\` (R-36).`); }
          return;
        }
        reported.add(c);
        if (library) {
          if (i > 0 && /^m-/.test(cls[0])) return; // a vendor part nested inside the m- block (R-30)
          r(rule, `[STYLE-54] Vendor class \`.${c}\` at the top level of a library module — nest it inside the \`.m-${libM[1]}\` block (R-30).`);
        } else r(rule, `[STYLE-01] Class "${c}" needs the prefix ${control ? 'ctrl-' : 'm- / ctrl-'} (or is-/has-/js-) for this file's segment/role.${control ? '' : ' A vendor override belongs in its library module `_<vendor-component>.<library>.module.scss` (R-36).'}`);
      });
    }
  });
});

export default [nestingDepth, nestBlockParts, charsetFirst, pxOnly1px, logicalProperties, noLiteralColorFallback, mqOnly, noOutput, attributeSelector, duplicateMediaInclude,
  utilityOneProperty, useToolsOnly, tokenFileRootOnly, customTheme, noLiteralFilter, focusVisible, hoverMedia, bem, noImportant, moduleClasses];
