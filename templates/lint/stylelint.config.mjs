// ui-guard Stylelint config (generated settings in ./lint-settings.json, written from .ui-guard/profile.md).
// Lives in <project>/.ui-guard/lint/. The project root has `stylelint.config.mjs` re-exporting this file,
// so VS Code, the git hook and Claude all use the same rules. Every rule follows the team's AXIS standard.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(fs.readFileSync(path.join(here, 'lint-settings.json'), 'utf8'));
const S = settings.scssRoot || 'src/assets/scss';
const ACTIVE_THEME = `${S}/theme`;
const THEMES = settings.themesRoot || 'src/assets/themes';

const STATE = ['is-', 'has-', 'js-'];
const ALL = ['o-', 'c-', 'l-', 'm-', 'ctrl-', 'p-', 'u-'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const classPattern = (prefixes) => `^(?:${[...prefixes, ...STATE].map(esc).join('|')})[a-zA-Z0-9_-]+$`;
const msg = (id, prefixes) => (name) => `[${id}] Class "${name}" needs the prefix ${prefixes.join(' / ')} (or is-/has-/js-) for this file's segment/role.`;
const COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'];

// The config may be loaded from .ui-guard/lint/ (CLI --config) or re-exported from the project root.
// Override globs are relative to the loading config file, so each glob is given for both locations.
const at = (...globs) => globs.flatMap((g) => [g, `../../${g}`]);

const segmentPrefix = { objects: ['o-'], components: ['c-'], layout: ['l-'], pages: ['p-'], utilities: ['u-'] };

const overrides = [
  // Generic + elements (R-ELEM-1, R-GEN-1, R-26): element, universal and attribute selectors; never a class or an ID.
  { files: at(`${S}/generic/**/*.scss`, `${S}/elements/**/*.scss`), rules: { 'selector-max-type': null, 'selector-max-universal': null, 'ui-guard/attribute-selector': null, 'selector-max-class': [0, { message: '[STYLE-49] Generic and Elements style HTML elements only — no class selector (R-ELEM-1).' }] } },
  // Generic: the one `@media (prefers-reduced-motion: reduce)` block is the only place !important is allowed (R-20).
  { files: at(`${S}/generic/**/*.scss`), rules: { 'declaration-no-important': null, 'ui-guard/no-important': [true, { reducedMotion: true }] } },
  // Settings + tools: no CSS output (R-13); the mq() mixin writes the raw @media.
  { files: at(`${S}/settings/**/*.scss`, `${S}/tools/**/*.scss`), rules: { 'ui-guard/no-output': true, 'ui-guard/mq-only': null } },
  // A breakpoint value may be px only here (R-08).
  { files: at(`${S}/settings/_breakpoints.settings.scss`), rules: { 'ui-guard/px-only-1px': null } },
  // Vendor markup that cannot take a project class (R-26).
  { files: at(`${S}/common/_attributes.common.scss`), rules: { 'ui-guard/attribute-selector': null } },
  // Global classes the project does not own, and vendor markup generated outside the project's markup (R-01, R-30).
  { files: at(`${S}/common/_classes.common.scss`), rules: { 'selector-class-pattern': null } },
  // Utilities: one property each, AXIS names (R-24, R-UTIL-5).
  { files: at(`${S}/utilities/**/*.scss`), rules: { 'ui-guard/utility-one-property': true } },
  // Theme files (active copy + every theme source): logical properties, no duplicate selectors, px only 1px (fonts in rem).
  // Colour literals and the colour functions only in the colour token files (R-10, R-11), where :root blocks may repeat.
  { files: at(`${ACTIVE_THEME}/colors/*.css`, `${THEMES}/*/theme/colors/*.css`), rules: { 'ui-guard/token-file-root-only': true, 'no-duplicate-selectors': null, 'color-no-hex': null, 'color-named': null, 'function-disallowed-list': null, 'selector-pseudo-class-disallowed-list': [['host', 'host-context'], { message: '[STYLE-06] `:host` is not a class selector — style the component root BEM class (R-06).' }] } },
  { files: at(`${ACTIVE_THEME}/fonts/*.css`, `${THEMES}/*/theme/fonts/*.css`), rules: { 'ui-guard/token-file-root-only': [true, { fonts: true }], 'selector-pseudo-class-disallowed-list': [['host', 'host-context'], { message: '[STYLE-06] `:host` is not a class selector — style the component root BEM class (R-06).' }] } },
  // custom.theme.css: classes + body, no custom properties, no !important (R-20, R-34, R-35).
  { files: at(`${ACTIVE_THEME}/custom.theme.css`, `${THEMES}/*/theme/custom.theme.css`), rules: { 'ui-guard/custom-theme': true, 'selector-max-type': [0, { ignoreTypes: ['body'], message: '[STYLE-33] custom.theme.css allows class selectors and `body` only (R-34).' }] } },
  // Global segments: prefix by segment (R-01).
  ...Object.entries(segmentPrefix).map(([seg, prefixes]) => ({ files: at(`${S}/${seg}/**/*.scss`), rules: { 'selector-class-pattern': [classPattern(prefixes), { resolveNestedSelectors: true, message: msg('STYLE-01', prefixes) }] } })),
  // Modules: m- / ctrl- blocks; a library module nests the vendor classes it overrides inside its m- block (R-30, R-36).
  { files: at(`${S}/modules/**/*.scss`), rules: { 'selector-class-pattern': null, 'ui-guard/module-classes': true } },
  // Angular component styles: @use only settings/tools; then the folder → role map (later overrides win): the prefix,
  // and a routed page may also @use the page-local objects, components and modules it uses (R-28).
  { files: at('src/app/**/*.scss'), rules: { 'ui-guard/use-tools-only': true } },
  ...(settings.roleMap || []).map((r) => ({ files: at(`${r.glob.replace(/\/?\*\*$/, '')}/**/*.scss`), rules: { 'selector-class-pattern': [classPattern(r.prefixes), { resolveNestedSelectors: true, message: msg('STYLE-01', r.prefixes) }], 'ui-guard/use-tools-only': r.role === 'page' ? [true, { page: true }] : true } })),
];

export default {
  customSyntax: 'postcss-scss',
  plugins: ['stylelint-scss', path.join(here, 'stylelint-ui-guard.mjs')],
  ignoreFiles: [`**/${S}/packages/**`, '**/node_modules/**', '**/dist/**', '**/.angular/**', '**/*.min.css'],
  rules: {
    // STYLE-01 (definitions) — any valid prefix by default; segment/role overrides narrow it.
    'selector-class-pattern': [classPattern(ALL), { resolveNestedSelectors: true, message: msg('STYLE-01', ALL) }],
    'ui-guard/bem': [true, { severity: 'warning' }], // STYLE-04 (R-04, High)
    'ui-guard/nest-block-parts': true, // STYLE-47 (error)
    'ui-guard/nesting-depth': [true, { max: 4 }], // STYLE-05 (AXIS R-05: root = level 1, only @media not counted)
    'selector-max-type': 0, // STYLE-06 (R-06)
    'selector-max-universal': [0, { message: '[STYLE-06] Universal selector outside Generic/Elements — use a class (R-06).' }], // STYLE-06
    'selector-pseudo-class-disallowed-list': [['root', 'host', 'host-context'], { message: '[STYLE-06] `:root` belongs only to the theme token files and `:host` is not a class — style a class (R-06).' }], // STYLE-06
    'selector-max-id': 0, // STYLE-07
    'ui-guard/attribute-selector': true, // STYLE-08
    'ui-guard/px-only-1px': true, // STYLE-10
    'ui-guard/logical-properties': true, // STYLE-11
    'color-no-hex': true, // STYLE-12
    'color-named': 'never', // STYLE-12
    'function-disallowed-list': [COLOR_FUNCTIONS], // STYLE-12
    'ui-guard/no-literal-color-fallback': true, // STYLE-12
    'number-max-precision': 4, // STYLE-14
    'ui-guard/mq-only': true, // STYLE-15
    'declaration-no-important': true, // STYLE-21
    'scss/at-extend-no-missing-placeholder': true, // STYLE-22
    'no-duplicate-selectors': true, // STYLE-23
    'declaration-block-no-duplicate-properties': true, // STYLE-23
    'ui-guard/duplicate-media-include': true, // STYLE-23
    'block-no-empty': true, // STYLE-24
    'comment-no-empty': true, // STYLE-24
    'scss/comment-no-empty': true, // STYLE-24
    'ui-guard/charset-first': true, // STYLE-26
    'at-rule-disallowed-list': ['import'], // STYLE-30
    'selector-pseudo-element-disallowed-list': [['ng-deep']], // STYLE-31
    'ui-guard/no-literal-filter': true, // STYLE-37
    'ui-guard/focus-visible': [true, { severity: 'warning' }], // STYLE-40 (accessibility 1, High)
    'ui-guard/hover-media': [true, { severity: 'warning' }], // STYLE-41 (accessibility 2, High)
  },
  overrides,
};
