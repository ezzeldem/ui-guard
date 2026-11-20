# STYLE — SCSS architecture, classes, theme

ui-guard applies the team's **AXIS** SCSS standard (ITCSS + SMACSS + Atomic Design + BEM) exactly as the ui-code-review AXIS
reviewer reads it, adapted only where Angular needs it (see "Angular adaptation"). Rule IDs are ui-guard's own; the **AXIS**
column names the AXIS rules each one implements (`R-xx`, `R-<SEGMENT>-n`; `A11Y-CSS-n` = AXIS accessibility.md stylesheet rule
n; `PERF-BUDGET` = performance.md; `R-SEG-STRUCTURE` = the segment tree and fixed names). Severity follows the AXIS priority:
Critical → error, High → warning, Medium → info.

## The 13 segments (authoring order)

`<root>` is the project's SCSS root (Angular: `src/assets/scss`). Names are kebab-case: `<name>` = `[a-z0-9]+(-[a-z0-9]+)*`.

| Segment | Prefix | Files (exact AXIS names) | Notes |
|---|---|---|---|
| settings | — | `settings/_<name>.settings.scss`; fixed: `_breakpoints.settings.scss`, `_colors.settings.scss` | No CSS output. **No `_index.scss`**: a file `@use`s the settings file it reads directly (`@use "<path-to-root>/settings/breakpoints.settings" as *;`). `_colors.settings.scss` holds one map per colour family that only references palette tokens (`"main-500": var(--main-500)`). Every map has a comment: what it holds, what reads it. |
| tools | — | `tools/_index.scss` (`@forward "./functions"; @forward "./mixins";`), `tools/functions/_index.scss` + `_<name>.function.scss`, `tools/mixins/_index.scss` + `_<name>.mixin.scss` | No CSS output. **One file per tool**, named after it; each folder `_index.scss` `@forward`s its files. Every tool: doc comment (signature, each parameter with its default, output, one example), every parameter validated with `@error`, no hard-coded component/page/client value. |
| generic | — | `generic/_index.scss` (`@use "./reset.generic" as *;`), `generic/_reset.generic.scss` | The reset (box-sizing, form controls inherit the font, responsive media) and the ONE `@media (prefers-reduced-motion: reduce)` block — the only place `!important` is allowed. Element, universal and attribute selectors; never a class or ID. |
| elements | — | `elements/_index.scss` (one file, holds the rules itself) | Bare HTML elements only: body (base background), links, typography, form elements, `::selection`, `:focus-visible`. Base typography on `html`/`body` reads `var(--ff)`, `var(--fs-…)`, `var(--lh-…)`. A per-theme background lives only in `custom.theme.css`. |
| common | — | entry `common/common.scss`; `_objects.common.scss`, `_components.common.scss`, `_modules.common.scss`; optional `_attributes.common.scss`, `_classes.common.scss` | No `_index.scss`. `common.scss` = `@use "../generic" as *; @use "../elements" as *;` then the optional `./attributes.common`, `./classes.common`, then `./objects.common`, `./components.common`, `./modules.common`. `_attributes` = attribute selectors for vendor markup; `_classes` = global classes the project does not own and vendor markup the vendor's JS generates outside the project's markup. |
| objects | `o-` | `objects/_<name>.object.scss` | Undecorated, fixed patterns. |
| components | `c-` | `components/_<name>.component.scss` | Self-contained; styles only its own block. |
| layout | `l-` | `layout/<layout>/<layout>.layout.scss` (entry) + `layout/<layout>/_<part>.<layout>.layout.scss`; sub-folders with an `_index.scss` each; `layout/shared/_<part>.layout.scss` | What surrounds page content. A layout's parts are BEM elements of its root block (`.l-app__header`); only a `shared/` part is its own block (`.l-footer`). No `_index.scss` beside an entry. |
| modules | `m-`, `ctrl-` | `_<name>.module.scss`, library module `_<vendor-component>.<library>.module.scss`, control module `_<name>.control.module.scss` | No `_index.scss`. A plain module composes the project's components and holds no vendor selector. A library module overrides one vendor component on `.m-<vendor-component>`, vendor parts nested inside it. A control module is isolated in its `ctrl-` block (`.ctrl-<name>-popup` for its popup). |
| pages | `p-` | `pages/standalone/<page>/<page>.page.scss`, `pages/state/<page>/<page>.page.scss`, `pages/<main-program>/<sub-program>/<page>/<page>.page.scss` | One entry per page folder, no partials; `standalone/` and `state/` are reserved. |
| packages | — | `packages/<library><version>/<library><major>.<locale>.min.css` | Vendor CSS: never compiled, `@use`d, `@import`ed or modified. Angular loads vendor CSS from `node_modules` in `angular.json` `styles`, first. |
| utilities | `u-` | entry `utilities/utils.scss` + the five fixed categories `accessibility/ interaction/ layout/ typography/ visual/`, each with `_index.scss`, files `_<name>.utility.scss` | `utils.scss` holds exactly the five `@use "./<category>" as *;` lines. One property per utility (exceptions `u-container`, `u-sr-only`, `u-not-sr-only`). `u-sr-only` lives in `accessibility/`, the icon filters in `visual/`. Colour utilities (`u-text-*`, `u-bg-*`) are generated with `@each` over the settings maps in `visual/colors/` and `visual/backgrounds/`. |
| theme | — | `theme/colors/colors.base.theme.css`, `theme/colors/colors.palette.theme.css`, `theme/fonts/fonts.theme.css`, `theme/custom.theme.css` — only these four, fixed names | Plain CSS, never compiled, `<link>`ed from `index.html`. |

**Folders with an `_index.scss`:** `tools/`, `tools/functions/`, `tools/mixins/`, `generic/`, `elements/`, every utility category
and sub-folder, every sub-folder inside a layout folder. **None:** settings, common, objects, components, modules, pages,
packages, theme. An `_index.scss` holds only `@charset` and `@use`/`@forward` lines (Elements is the one exception: it holds
the element rules).

**Entries (Angular `angular.json` `styles`, in this order):** vendor CSS (`node_modules`) → the legacy stylesheet of a migrating
project (frozen, see Foundation B) → `<root>/common/common.scss` → `<root>/utilities/utils.scss` (utilities last, so they win by
load order). Layout and page styles are Angular component styles. There is no `style.scss`.

**Theme links (`src/index.html`, in this order):** `colors/colors.base.theme.css`, `colors/colors.palette.theme.css`,
`fonts/fonts.theme.css`, then `custom.theme.css` as the **last** stylesheet link.

**State prefixes.** `is-` / `has-`: set in markup at first render and never changed by code. `js-`: changed or queried by code.

**Variants.** A variant uses the block name plus the variant, with the same prefix: `c-button c-button-secondary` (AXIS leaves the
variant prefix to the project). The BEM `--modifier` syntax is never used.

**Writing BEM in SCSS.** One block per rule: its elements and variants are nested inside it with `&__element` and `&-variant` (STYLE-47).

```scss
@charset "UTF-8";

// @dependencies: tools/functions/_px.function.scss

@use "../tools" as *;

.c-button {
  display: flex;

  &__icon { max-block-size: px(14); }   // → .c-button__icon
  &-secondary { background-color: var(--secondary-500); }   // → .c-button-secondary
}
```

**`@dependencies`.** Right after `@charset`, a file that reads settings or tools lists each file it reads, one per line:
`// @dependencies: tools/mixins/_mq.mixin.scss`. Then `@use "<path-to-root>/tools" as *;` (a file under the SCSS root uses the
relative path; a component style uses `"tools"` through `includePaths`).

## Tools (one file each, `templates/scss/tools/`)

| Tool | File | Signature | Output |
|---|---|---|---|
| `px()` | `functions/_px.function.scss` | `px($px, $root: 16)` | rem: `px(24)` → `1.5rem` |
| `mq()` | `mixins/_mq.mixin.scss` | `mq($type: min, $dimension: w, $breakpoint-name: md)` | `@media (width >= v)` / `(width < v)` from `$breakpoints` |
| `dir()` | `mixins/_dir.mixin.scss` | `dir($dir)` (rtl / ltr) | `&:dir(<dir>) { … }` — no attribute selector, no `::ng-deep` |
| `after()` / `before()` | `mixins/_after.mixin.scss`, `_before.mixin.scss` | `after($content: "", $layer: 1)` | `position: relative; z-index` + positioned `::after` / `::before` |
| `hover()` | `mixins/_hover.mixin.scss` | `hover($trans: null)` | `@media (hover: hover) { &:hover }` + the same `&:focus-visible`; a transition only when `$trans` is given |
| `scroll()` | `mixins/_scroll.mixin.scss` | `scroll($size: 0.35rem, $track-radius, $thumb-radius, $fallback-radius, $track-color: var(--neutral-50), $thumb-color: var(--neutral-400), $fallback-track-color: var(--neutral-200))` | thin scrollbars |

## Theme tokens

| File | Holds | Token names |
|---|---|---|
| `colors.base.theme.css` | the per-client identity values — the ONLY colour values that change between clients — and the icon filters | `--hue`, `--saturation`, `--lightness` (brand); `--hue-2`, `--saturation-2`, `--lightness-2` (second brand); `--filter-primary`, `--filter-secondary`, `--filter-neutral-25`, `--filter-neutral-400` |
| `colors.palette.theme.css` | every shade, one `:root` per family, all HSL; does not change between clients | `--<family>-<step>`. Brand ramps shift only the lightness: `--main-500: hsl(var(--hue) var(--saturation) var(--lightness))`, other steps `hsl(var(--hue) var(--saturation) calc(var(--lightness) ± n%))`; `--secondary-*` from the `-2` values. Status families and neutrals are fixed HSL. Effects too: `--shadow-100`. |
| `fonts.theme.css` | `@font-face` rules and `:root` blocks only | `--ff` (one family; with more than one `--ff-1`, `--ff-2` …), `--fs-<size>`, `--fw-<weight>`, `--lh-<step>`; a fluid step is a `clamp()` here, never re-declared by a class |
| `custom.theme.css` | theme customizations (backgrounds, brand-asset positioning) | defines no custom property; class selectors and `body` only |

Single-colour icons are saved black and coloured with `u-filter-primary`, `u-filter-secondary`, `u-filter-neutral-25`,
`u-filter-neutral-400` (each reads its `--filter-*` token).

## Angular adaptation

- The global SCSS (`src/assets/scss`) compiles through the two entries `common/common.scss` and `utilities/utils.scss` in
  `angular.json` `styles`, after the vendor CSS. Theme files are `<link>`ed from `index.html` so they can be swapped after the build.
- A component's own `.scss` follows exactly the same rules. Its class prefix comes from the folder → role map in
  `.ui-guard/profile.md` (`l-` layout components, `p-` routed pages, `c-` shared components, `m-`/`ctrl-` composites and widgets).
- A component style `@use`s only settings and tools (`@use "tools" as *;` through `includePaths`, right after `@charset`).
  A **routed page** style is the AXIS page entry: it may also `@use "<root>/objects|components|modules/<name>…" as *;` for the
  page-local blocks it uses (1–4 pages, no layout — R-28). Objects, components and modules never move out of their folder.
- **No `:host`** (R-06 has no such exemption) and **no `::ng-deep`**: style the component's root BEM class; direction-specific
  styles use `dir()` (`:dir()`).
- Prefixes apply to class names in **templates and TypeScript** too: `class=""`, `[class.x]`, `[ngClass]`, `classList`,
  `Renderer2.addClass`. Vendor classes (Bootstrap etc.) are not authored classes and are left alone in templates; their overrides
  live in library modules.

## Rules

| ID | Severity | Checked by | AXIS | Applies to | Rule | How to fix |
|---|---|---|---|---|---|---|
| **Naming & selectors** |||||||
| STYLE-01 | error | stylelint (defs) + script (usages) | R-01, R-14–R-18, R-OBJ-1, R-COMP-1, R-LAY-1, R-MOD-1, R-UTIL-1, R-COM-1, R-COM-2 | `*.scss`, `*.css`, `*.html`, `*.ts` | Every class the project authors has its segment prefix (`o- c- l- m- ctrl- p- u-`) or a state prefix (`is- has- js-`), matching the file's segment or Angular role. Exceptions: vendor classes nested inside the `m-` block of a library module, and anything in `common/_classes.common.scss`. | Rename the class with the right prefix; update every usage in SCSS, templates and TS (`class-usage.js` lists them). Correct: `.c-card`. Incorrect: `.card`. |
| STYLE-02 | error | ai | R-02 | `*.scss`, `*.html`, `*.ts` | A `js-*` class used only as a hook for code has no styles (a `js-*` state is styled like any state). | Move the styles to a prefixed block class; keep `js-*` for code only. |
| STYLE-03 | error | ai | R-03, R-27 | `*.html`, `*.ts` | Who sets the class decides the prefix. Fixed in markup at first render → `is-`/`has-`. Changed by code at runtime (`[class.x]`, `[ngClass]`, `classList`, `Renderer2`) → `js-`. Code only touches `js-*` classes. | Rename runtime-toggled classes to `js-…`; static state classes to `is-…`/`has-…`. |
| STYLE-04 | warning | stylelint | R-04, R-COMP-2 | `*.scss`, `*.css` | BEM: `block__element`, one element level only, no `--modifier`. | Incorrect: `.c-card__body__title`, `.c-card--big`. Correct: `.c-card__title`, `.c-card-big`. |
| STYLE-05 | error | stylelint (custom) | R-05 | `*.scss` | Nesting depth at most 4, the root selector is level 1. Only `@media` (and `@include mq()`) is not counted; `&__el`, `&.state`, descendants, `@supports`, `@container`, `@layer` and an `@include` with a content block (`hover()`, `dir()`) are. | Flatten with BEM element classes. |
| STYLE-06 | error | stylelint | R-06, R-GEN-1, R-ELEM-2 | `*.scss`, `*.css` outside generic/elements | Class selectors only: no type selector, no universal `*`, no `:host`, and `:root` only in the theme token files. Exception: `body` in `custom.theme.css`. | Give the element a BEM class. Incorrect: `.c-card p {}`, `:host {}`. Correct: `.c-card__text {}`, `.c-card {}`. |
| STYLE-07 | error | stylelint | R-25 | all styles | No ID selectors anywhere. | Use a class. |
| STYLE-08 | error | stylelint (custom) | R-26 | all styles | No attribute selectors. Allowed: in generic, elements and `common/_attributes.common.scss` (vendor markup), and `[aria-*]` or `:is([dir="rtl"])` chained onto a project class (`.c-tab[aria-selected="true"]`). Mixin bodies are checked too. | Incorrect: `[disabled]`, `.card[aria-x]`. Correct: `:disabled`, an `is-`/`js-` class, `@include dir(rtl)`. |
| STYLE-09 | error | script + ai | R-07, R-SET-3, R-THEME-3 | token files, all styles | Tokens are named by role or `--family-step` (`--main-500`, `--neutral-200`), never by appearance. Font tokens take the four keys (`--ff`/`--ff-1…`, `--fs-*`, `--fw-*`, `--lh-*`). Pre-AXIS names are reported with their AXIS name (`--color-img` → `--filter-primary`, `--light-img` → `--filter-neutral-25`, `--gray-img` → `--filter-neutral-400`, `--secondary-color-img` → `--filter-secondary`, `--div-shadow` → `--shadow-100`, `--secondary-hue` → `--hue-2`, `--fb` → `--ff-2`). Typos and undefined tokens are errors. | Rename the token (a row in `renames.md`); values never change. |
| **Units & values** |||||||
| STYLE-10 | error | stylelint (custom) | R-08 | `*.scss`, theme CSS | Absolute lengths in `rem`, written with `px(N)`. Raw `px` only for `1px`, `$variables` included; a breakpoint may be px only in `settings/_breakpoints.settings.scss`. Theme files too (font sizes in rem). Other units where they fit (`%`, `vw/vh/dvh/svh`, `fr`, `ch`, unitless, `em`, `ms/s`). | `padding: 16px` → `padding: px(16)`; `px(16px)` → `px(16)`. |
| STYLE-11 | error | stylelint (custom) | R-09 | `*.scss`, `*.css` | Logical properties only: margins, paddings, borders, radii, insets, `text-align`, `float`, `clear` and sizes (`width` → `inline-size`, `height` → `block-size`, `min-/max-` likewise). | `margin-right` → `margin-inline-end`; sizes convert in every direction (mechanical); sides flip in an app that switches direction, so there they are a decision. |
| STYLE-12 | error | stylelint | R-10, R-OBJ-4 | all styles outside `theme/colors/*.css` | Colours only from custom properties: no hex, no `rgb() rgba() hsl() hsla() hwb() lab() lch() oklab() oklch() color()`, no named colours, no literal fallback inside `var()`. Allowed keywords: `transparent`, `currentColor`, `inherit`. | `color: #333` → `color: var(--neutral-800)`. |
| STYLE-13 | error | script | R-11 | `colors.palette.theme.css` | Every shade is HSL, neutrals included. | Convert to the identical `hsl()`. |
| STYLE-14 | error | stylelint | R-12 | all styles | At most 4 decimals. | Round to 4 decimals. |
| STYLE-15 | error | stylelint (custom) | R-08 | `*.scss` | The project ships `mq()`, so media queries go through it. Raw `@media` only inside tools, the generic reduced-motion block and `(hover: hover)` from `hover()`. | `@media (max-width: 991px)` → `@include mq(max, w, md)`. |
| **Architecture** |||||||
| STYLE-16 | error | stylelint (custom) | R-13, R-SET-1, R-TOOL-1 | settings, tools | Settings and tools output no CSS. | Move rule sets into the right output segment. |
| STYLE-17 | error | script + ai | R-13–R-18, R-COMP-3 | all styles | Each file sits in its segment folder with its AXIS file name (segment table above: fixed names, kebab-case, suffix, no `_index.scss` where AXIS has none, an `_index.scss` in every utility and layout sub-folder) and styles only its own prefixed block. | Rename or move the file; move foreign rules to their owner. |
| STYLE-18 | error | ai | R-16, R-17, R-PAGE-1, R-PAGE-2, R-LAY-2 | layout, pages | Layout holds what surrounds page content (header, navbar, side menu, footer, shell); pages hold their own content only. A page entry is never `@use`d by anything. | Move chrome to layout; shared parts to components/common. |
| STYLE-19 | error | ai | R-15, R-31, R-MOD-1, R-MOD-2 | modules | A module styles two or more components together, or is a library module (`m-`) or a control module (`ctrl-`). No other file styles a `ctrl-` block. | Split the module; move overrides of a `ctrl-` block into its control module. |
| STYLE-20 | error | ai | R-OBJ-2–R-OBJ-5 | objects | Objects are undecorated, fixed patterns: no parameters, no overrides from consumers, colours only via tokens; a utility is never reclassified as an object. | Remove decoration; move it to a component. |
| STYLE-21 | error | stylelint | R-20 | all styles | No `!important`. Only exception: the one `@media (prefers-reduced-motion: reduce)` block in Generic. | Remove it and give the selector its place in the cascade. Prove zero pixel change; in `custom.theme.css` a rule that only won through `!important` is a decision. |
| STYLE-22 | error | stylelint | R-21 | `*.scss` | No `@extend`, except of a `%placeholder`. | Use a mixin or a `%placeholder`. |
| STYLE-23 | error | stylelint (+custom) | R-22 | all styles | No duplicate selectors, duplicate properties (also with different syntaxes) or duplicate `@include mq(...)` blocks. Duplicate `:root` blocks only in the colour token files. | Merge them; keep the later values. |
| STYLE-24 | error | stylelint | R-23 | all styles | No empty blocks, no empty comments. | Delete them. |
| STYLE-25 | error | stylelint (custom) + ai | R-18, R-24, R-UTIL-1–R-UTIL-6 | utilities | `u-` prefix, exactly one property (exceptions `u-container`, `u-sr-only`, `u-not-sr-only`), named `u-{property}-{value}` with the short names `ff` (font-family), `fs` (font-size), `fw` (font-weight), `bg` (background-color), `text` (color), `text-align`; no breakpoint in the name (a `u-<short>-<step>` names a token step); never raised specificity; adds to a block, never replaces it. | Split multi-property utilities; rename (`u-text-center` → `u-text-align-center`). |
| STYLE-26 | error | stylelint (custom) | R-32 | every `.scss`/`.css` except `packages/` | `@charset "UTF-8";` is the first line. | Add it as line 1. |
| STYLE-27 | error | script | R-33, R-PKG-1–R-PKG-4 | `packages/`, `angular.json` | `packages/` files are never compiled, `@use`d, `@import`ed or modified. Vendor CSS is listed before the project's stylesheets in `angular.json` `styles`. | Load vendor CSS from `node_modules` first in `styles`. |
| **Imports & placement** |||||||
| STYLE-28 | error | script + ai | R-28, R-COM-3–R-COM-5, R-COM-7, R-OBJ-6, R-COMP-6, R-MOD-4, R-PAGE-3 | common, components, objects, modules, layout, pages | An object, component or module never moves out of its folder; only the `@use` line moves. Used by 5+ pages or needed by any layout → `@use`d from its `common/` aggregator. Used by 1–4 pages and no layout → `@use`d by each of those page entries (Angular: the routed page component style). Only a module `@use`s a component (and only components); objects and components `@use` no object, component or module; a layout entry `@use`s none of them. | Move the `@use` line into the `common/` aggregator, or from it into each page entry; remove forbidden `@use`s. |
| STYLE-29 | error | script | R-29, R-COM-6 | all `*.scss` | No double import: a file reached through `common/` is never `@use`d again by a page or layout entry or a component style. | Delete the extra `@use`. |
| STYLE-30 | error | stylelint (custom) | R-28 | component styles, all `*.scss` | Angular component styles `@use` only settings/tools (`@use "tools" as *;` right after `@charset`); a routed page style may also `@use` its page-local objects, components and modules. No `@import` anywhere. | Replace `@import` with `@use`/`@forward`; move CSS-output files into the entries or the page. |
| STYLE-31 | error | stylelint | R-06 | all styles | No `::ng-deep`. | Use `dir()` (`:dir()`), the component's own class, a library module or an input. |
| **Theme** |||||||
| STYLE-32 | error | stylelint (custom) + script | R-19, R-THEME-2 | theme token files | `colors.base.theme.css` and `colors.palette.theme.css` contain only `:root` blocks (an at-rule may wrap one). `fonts.theme.css` holds only `@font-face` rules and `:root` blocks. | Move other selectors to utilities/components/elements. |
| STYLE-33 | error | stylelint (custom) + script | R-34, R-35, R-THEME-6, R-THEME-7 | `custom.theme.css` | Class selectors and `body` only (no `*`, `:root`, `html` or other element). No custom property definitions. No `!important`. | Move tokens to their theme file; use class selectors. |
| STYLE-34 | error | script | R-10, R-SET-2, R-THEME-1, R-THEME-8, R-THEME-9 | all styles | `colors.palette.theme.css` is the single source of colour values: no shade in `colors.base`, `fonts` or any other file, no `.scss` with `$name: <hex/rgb/hsl>` (`/ui-guard:fix scss` moves it to every palette as an hsl token with an exact 8-bit round trip; a variable read by a Sass colour function is listed, never moved). A fluid (`clamp()`) token is declared once in the theme, never re-declared by a class. | Move the token into the palette. |
| STYLE-35 | error | script | R-THEME-1 | theme folders | Every theme source folder (`src/assets/themes/<name>/theme/`) defines the same custom property names, in the same files, as every other theme and the active copy. | Add the missing token to the theme(s) that lack it. |
| STYLE-36 | error | script | R-THEME-5, R-PKG-4 | `index.html`, `angular.json`, `*.scss` | Theme files load with `<link>` from `assets/` in `index.html`, in the order `colors.base`, `colors.palette`, `fonts`; `custom.theme.css` is the **last** stylesheet link. Never `@use`d, never in `angular.json` `styles`. | Move the file into a `<link>`; reorder the links. |
| STYLE-37 | error | stylelint (custom) + ai | R-10 | all styles, templates | Single-colour icons are coloured with a filter utility (`u-filter-primary`, `u-filter-secondary`, `u-filter-neutral-25`, `u-filter-neutral-400`) reading a `--filter-*` token. No literal `filter: invert(...)` in SCSS, no `[data-img]`. | Replace the literal filter with the utility class on the `<img>`. |
| **Tools & shared pieces** |||||||
| STYLE-38 | error | script + ai | R-TOOL-4 | tools | The shared tool set (`px()`, `mq()`, `dir()`, `after()`, `before()`, `hover()`, `scroll()`), never duplicated or re-implemented elsewhere; one file per tool named after it (`_<name>.mixin.scss` / `_<name>.function.scss`); each documented with its signature, every parameter with its default, its output/return and one example. | Normalize to the ui-guard tool files (`templates/scss/tools`); split; complete the `///` comment. |
| STYLE-39 | warning | ai | R-COMP-3 | templates, styles | One shared button component (`c-button` + variants) for every button-looking element. | Replace with `c-button` (+ variant), keeping the current look. |
| **Stylesheet accessibility** |||||||
| STYLE-40 | warning | stylelint (custom) | A11Y-CSS-1 | all styles | Visible focus: no `outline: none/0` unless the same rule set has a `:focus-visible` replacement. | Report to the team; never restyled in a fix phase. |
| STYLE-41 | warning | stylelint (custom) | A11Y-CSS-2 | all styles | `:hover` styles sit inside `@media (hover: hover)` with the same `:focus-visible` style. **Fixable:** the fixer wraps the hover styles in `@include hover { … }` (no transition, nothing else changes). | `.c-x:hover { … }` → `.c-x { @include hover { … } }`. |
| STYLE-42 | warning | script | A11Y-CSS-3, A11Y-CSS-5, R-20 | generic, utilities | Exactly one `prefers-reduced-motion` block, in `generic/_reset.generic.scss`. `u-sr-only` is declared once, in `utilities/accessibility/`, and never re-implemented (`.sr-only`, `.visually-hidden` … are findings). | Merge into the generic block; use `u-sr-only`. |
| STYLE-43 | info | ai | A11Y-CSS-6 | styles, templates | Interactive targets at least 1.5rem (24px): `min-inline-size` and `min-block-size` or `padding-block`. | Report only. |
| STYLE-44 | warning | script | A11Y-CSS-4, R-THEME-4 | token pairs, every theme | The text/background token pairs used together meet WCAG AA in **every** theme (active copy and each source): 4.5:1 text, 3:1 large text (≥ 24px, or ≥ 18.66px bold) and control borders. | Report only — client values are changed by the team. |
| STYLE-45 | error | runtime | R-COMP-4, R-LAY-3, R-PAGE-4 | screenshot routes | No horizontal overflow from 320px wide up, at every breakpoint. | Report (measured during `fix`). |
| STYLE-46 | warning | script | PERF-BUDGET | build output, entries | CSS size budget (gzip, AXIS performance.md): `common` 20 KB, `utils` 8 KB (both compiled from their entries), the four theme files together 3 KB, each page bundle 12 KB, each layout bundle 8 KB, 60 KB per page in all (applied to Angular's global `styles.css`). Vendor CSS is measured, never budgeted. Exceeding warns, never blocks. | Common too big: something few pages use went into common. A page too big: blocks imported directly by several pages. |
| STYLE-47 | warning | stylelint (custom) | R-04 | `*.scss` | BEM in SCSS: a block's elements and variants are written **inside** the block with `&__element` and `&-variant`, not as separate top-level rules, and not nested with the full block name (`.l-header { .l-header__toggle {} }` → `&__toggle`). | `.c-button {}` + `.c-button__icon {}` → `.c-button { … &__icon { … } }` (same compiled CSS). |
| STYLE-48 | error | script | R-13–R-18, R-SEG-STRUCTURE | `angular.json`, `index.html`, every stylesheet | **Architecture gap.** The project has the AXIS structure: the 13 segment folders with their index/entry files, the tools, the settings, the four theme files, `common/common.scss` + `utilities/utils.scss` in `angular.json` `styles` (utilities after common), the scss root in `includePaths`, the four theme `<link>`s. A global stylesheet outside it is misplaced until Foundation B has run; after it, what stayed is the **legacy stylesheet** (frozen, migrate page by page) and no longer a finding. `foundation.js check` lists missing, wiring, misplaced and legacy. | `/ui-guard:fix scss` runs Foundation A and Foundation B (below). A lazy bundle (`inject: false`) is a decision. |
| STYLE-49 | error | stylelint | R-ELEM-1, R-GEN-1, R-ELEM-2 | generic, elements | Generic and Elements style HTML elements only: no class selector (and no ID, STYLE-07). | Move class rules to their segment. |
| STYLE-50 | error | script | R-ELEM-3 | `elements/_index.scss`, `custom.theme.css` | Elements declares the base body background only; a per-theme background lives only in `custom.theme.css` — never the same background in both. Base typography on `html`/`body` reads the font tokens (`var(--ff)`, `var(--fs-…)`, `var(--lh-…)`). | Keep one background per place; read the tokens. |
| STYLE-51 | warning | script | R-TOOL-3 | tools | Every tool parameter is validated: an `@if`/`@each` check that raises `@error`. | Add a check per parameter. |
| STYLE-52 | error | script + ai | R-TOOL-2 | tools | A tool takes the values it needs as parameters: no `var(--…)` token and no project class hard-coded in its body (a token may be a parameter default). | Make each value a parameter. |
| STYLE-53 | error | script | R-SET-2, R-UTIL-5 | utilities | Text-colour and background utilities (`u-text-<family>-<step>`, `u-bg-…`) are generated with `@each` over the family maps of `settings/_colors.settings.scss`, in `utilities/visual/colors/` and `visual/backgrounds/`; never written by hand. | Replace the hand-written rules with the generated file. |
| STYLE-54 | warning | script + stylelint | R-30, R-36, R-MOD-3 | all styles | A vendor override lives only in its library module `modules/_<vendor-component>.<library>.module.scss`, on `.m-<vendor-component>` placed beside the vendor class, vendor parts nested inside (no top-level vendor selector). Markup the vendor's JS generates outside the project goes in `common/_classes.common.scss`. A plain module holds no vendor selector and never takes a library component's name; an `m-` block is declared once. | Move the rule into the library module on its `m-` class. |
| STYLE-55 | warning | script | R-SET-4 | settings | Every settings map has a comment above it: what it holds and what reads it. | Add the `//` comment. |

## Foundation (STYLE-48) — always the first two phases of `/ui-guard:fix scss`

- **Foundation A — Structure** (`foundation.js structure --apply`): creates every missing file of the tree from
  `templates/scss` and the four theme files. Settings, tools, indexes, aggregators and utilities are copied as they are (they
  output nothing, or classes nobody uses yet); `generic/_reset.generic.scss` and `elements/_index.scss` are created **empty**
  (a reset would change the page); `settings/_colors.settings.scss` is generated from the palette's `--<family>-<step>`
  shades; `u-sr-only` is not created when the project already declares it (Foundation B moves it), the filter utility only
  when `colors.base` has the `--filter-*` tokens; the standard button is not added. It adds the scss root to `includePaths`,
  `common/common.scss` + `utilities/utils.scss` to `angular.json` `styles` right after the project's own global stylesheets,
  `src/assets` to `assets`, and the four theme `<link>`s (base, palette, fonts before `custom.theme.css`). An old single
  `style.scss` entry that only `@use`s our segments is replaced by the two entries (same output order). Never changes a value.
- **Foundation B — Move** (`foundation.js move --apply`) follows the AXIS migration guide. The existing global
  stylesheets (and the local partials they import) are the **legacy stylesheet**: they stay linked right after the vendor CSS,
  before `common.scss`, and are frozen. Only what lands AXIS-compliant moves out of them:
  `:root` tokens → `colors.base` (identity values, `--filter-*`), `colors.palette` (colours) or `fonts` (font tokens) of every
  theme; `@font-face` → `fonts.theme.css` of every theme (`url()` rebased); `$variables` → `settings/_project.settings.scss`;
  mixins/functions → one tool file each (`tools/mixins/_<name>.mixin.scss`, `tools/functions/_<name>.function.scss`, forwarded);
  element rules → `elements/_index.scss`; resets (`*`, `[hidden]`, the reduced-motion block) → `generic/_reset.generic.scss`;
  single-property `u-` rules → their utility category by property (font/text → typography, colour/background/filter → visual,
  display/position/sizing/spacing → layout, cursor/pointer-events/scroll/user-select → interaction, `u-sr-only` →
  accessibility); vendor overrides already scoped by an existing `m-` block → its library module (`@use`d from
  `_modules.common.scss`). Unprefixed classes, `c-`/`o-`/`p-`/`l-` rules, colour utilities, multi-property utilities,
  `@keyframes`, `:root` rules that are not tokens, anything with `@include`/`@extend`/interpolation, and definitions the
  remaining legacy rules still read **stay** — the report lists them as "legacy — migrate page by page". A rule moves only past
  rules it can never conflict with (no shared property at the same specificity and importance, `lib/cascade.js`); the compiled
  CSS before and after must render the same, otherwise everything is rolled back. A legacy file left empty leaves `angular.json`
  and is deleted; otherwise it stays, and STYLE-48 does not require it to be gone.

## How agents use this file

- **Is a defect:** a selector, declaration, file placement, import or class usage that breaks a rule above, in a file the project authors.
- **Is not a defect:** vendor classes (Bootstrap, Material, PrimeNG…) used in templates; vendor classes nested inside the `m-`
  block of a library module or in `common/_classes.common.scss`; files under `packages/`; `node_modules`; anything a rule's
  exceptions allow; the frozen legacy stylesheet's rules are migration items (report them, never extend the file).
- Rules checked by **stylelint** or **script** are not yours unless the scan tells you the tool was declined.
- STYLE-40/43/44/45 are **report-only**: never restyle focus or contrast. STYLE-41 is fixable only by wrapping the hover
  styles in `@include hover { … }`.
- **Writing SCSS (new or rewritten):** `@charset`, the `@dependencies` lines, `@use "<path-to-root>/tools" as *;` (`"tools"`
  in a component style), then one block rule: every element is `&__name` directly under the block, **side by side**; variants
  are `&-variant`; states like `&.js-closed` go inside their element. Never `&__a { &__b {} }` (STYLE-04), never
  `.block { .block__x {} }` (STYLE-47), never `:host` or `::ng-deep`. Never rename a class beyond its prefix or the planned renames.
- **`:host` styles** move onto the component's root BEM class (template + style) only with pixel proof; otherwise it is a decision.
- **Converting `.block { .block__x {} }` to `&__x`** lowers specificity: do it only with pixel proof or when a script confirms
  `.block__x` is defined once and used only in the block's own template; otherwise skip it (unsure) with the reason.
- **Placement (STYLE-28):** files never move between segments; only `@use` lines move (common aggregator ↔ page entries).
  Count the pages and layouts that use the block (`class-usage.js` output or Grep) before reporting.
- Before reporting STYLE-03 or STYLE-02, check who sets the class: grep the TS and the template for the class name.
- When unsure, report `info` with `unverified` in the message.
