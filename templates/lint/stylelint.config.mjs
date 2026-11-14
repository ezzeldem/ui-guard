// ui-guard Stylelint config (generated settings in ./lint-settings.json, written from .ui-guard/profile.md).
// Lives in <project>/.ui-guard/lint/. The project root has `stylelint.config.mjs` re-exporting this file,
// so VS Code, the git hook and Claude all use the same rules.
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

// The config may be loaded from .ui-guard/lint/ (CLI --config) or re-exported from the project root.
// Override globs are relative to the loading config file, so each glob is given for both locations.
const at = (...globs) => globs.flatMap((g) => [g, `../../${g}`]);

const segmentPrefix = { objects: ['o-'], components: ['c-'], layout: ['l-'], modules: ['m-', 'ctrl-'], pages: ['p-'], utilities: ['u-'] };

const overrides = [
  // Generic + elements: type and attribute selectors allowed (bare elements, resets).
  { files: at(`${S}/generic/**/*.scss`, `${S}/elements/**/*.scss`), rules: { 'selector-max-type': null, 'ui-guard/attribute-selector': null } },
  // Settings + tools: no CSS output; tools may use raw @media, ::ng-deep and the dir() attribute selector.
  { files: at(`${S}/settings/**/*.scss`, `${S}/tools/**/*.scss`), rules: { 'ui-guard/no-output': true, 'ui-guard/mq-only': null, 'selector-pseudo-element-disallowed-list': null, 'ui-guard/attribute-selector': null, 'selector-max-type': null, 'ui-guard/px-only-1px': null, 'ui-guard/hover-media': null } },
  // Vendor markup only.
  { files: at(`${S}/common/_attributes.common.scss`), rules: { 'ui-guard/attribute-selector': null } },
  // Generic reduced-motion block: the one place !important is allowed in SCSS.
  { files: at(`${S}/generic/_reduced-motion.generic.scss`), rules: { 'declaration-no-important': null } },
  // Utilities: one property each.
  { files: at(`${S}/utilities/**/*.scss`), rules: { 'ui-guard/utility-one-property': true } },
  // Theme token files (active copy + every theme source): literal colors allowed, :root only.
  { files: at(`${ACTIVE_THEME}/**/*.css`, `${THEMES}/**/*.css`), rules: { 'no-duplicate-selectors': null, 'color-no-hex': null, 'color-named': null, 'function-disallowed-list': null, 'ui-guard/px-only-1px': null, 'ui-guard/logical-properties': null, 'selector-max-type': null, 'ui-guard/no-literal-filter': null } },
  { files: at(`${ACTIVE_THEME}/colors/*.css`, `${ACTIVE_THEME}/images/*.css`, `${THEMES}/*/theme/colors/*.css`, `${THEMES}/*/theme/images/*.css`), rules: { 'ui-guard/token-file-root-only': true } },
  { files: at(`${ACTIVE_THEME}/fonts/*.css`, `${THEMES}/*/theme/fonts/*.css`), rules: { 'ui-guard/token-file-root-only': [true, { fonts: true }], 'function-disallowed-list': null } },
  // custom.theme.css: classes + body, no custom properties, !important allowed (it must beat Angular's later styles).
  { files: at(`${ACTIVE_THEME}/custom.theme.css`, `${THEMES}/*/theme/custom.theme.css`), rules: { 'ui-guard/custom-theme': true, 'declaration-no-important': null, 'selector-max-type': [0, { ignoreTypes: ['body'] }] } },
  // Global segments: prefix by segment.
  ...Object.entries(segmentPrefix).map(([seg, prefixes]) => ({ files: at(`${S}/${seg}/**/*.scss`), rules: { 'selector-class-pattern': [classPattern(prefixes), { resolveNestedSelectors: true, message: msg('STYLE-01', prefixes) }] } })),
  // Angular component styles: prefix from the folder → role map; @use only settings/tools; :host allowed.
  ...(settings.roleMap || []).map((r) => ({ files: at(`${r.glob.replace(/\/?\*\*$/, '')}/**/*.scss`), rules: { 'selector-class-pattern': [classPattern(r.prefixes), { resolveNestedSelectors: true, message: msg('STYLE-01', r.prefixes) }], 'ui-guard/use-tools-only': true } })),
  { files: at('src/app/**/*.scss'), rules: { 'ui-guard/use-tools-only': true } },
];

export default {
  customSyntax: 'postcss-scss',
  plugins: ['stylelint-scss', path.join(here, 'stylelint-ui-guard.mjs')],
  ignoreFiles: [`**/${S}/packages/**`, '**/node_modules/**', '**/dist/**', '**/.angular/**', '**/*.min.css'],
  rules: {
    // STYLE-01 (definitions) — any valid prefix by default; segment/role overrides narrow it.
    'selector-class-pattern': [classPattern(ALL), { resolveNestedSelectors: true, message: msg('STYLE-01', ALL) }],
    'ui-guard/bem': true, // STYLE-04
    'ui-guard/nest-block-parts': [true, { severity: 'warning' }], // STYLE-47
    'max-nesting-depth': [4, { ignoreAtRules: ['media', 'include', 'supports', 'container', 'layer', 'if', 'else', 'each', 'for'] }], // STYLE-05
    'selector-max-type': [0, { ignoreTypes: ['/^:host/'] }], // STYLE-06
    'selector-max-id': 0, // STYLE-07
    'ui-guard/attribute-selector': true, // STYLE-08
    'ui-guard/px-only-1px': true, // STYLE-10
    'ui-guard/logical-properties': true, // STYLE-11
    'color-no-hex': true, // STYLE-12
    'color-named': 'never', // STYLE-12
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'], // STYLE-12
    'ui-guard/no-literal-color-fallback': true, // STYLE-12
    'number-max-precision': 4, // STYLE-14
    'ui-guard/mq-only': true, // STYLE-15
    'declaration-no-important': true, // STYLE-21
    'scss/at-extend-no-missing-placeholder': true, // STYLE-22
    'no-duplicate-selectors': true, // STYLE-23
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-syntaxes'] }], // STYLE-23
    'ui-guard/duplicate-media-include': true, // STYLE-23
    'block-no-empty': true, // STYLE-24
    'comment-no-empty': true, // STYLE-24
    'scss/comment-no-empty': true, // STYLE-24
    'ui-guard/charset-first': true, // STYLE-26
    'at-rule-disallowed-list': ['import'], // STYLE-30
    'selector-pseudo-element-disallowed-list': [['ng-deep'], { severity: 'warning' }], // STYLE-31
    'ui-guard/no-literal-filter': true, // STYLE-37
    'ui-guard/focus-visible': true, // STYLE-40
    'ui-guard/hover-media': [true, { severity: 'warning' }], // STYLE-41
  },
  overrides,
};
