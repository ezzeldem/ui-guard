# STYLE — SCSS architecture, classes, theme

Based on the team's AXIS SCSS architecture, adapted for Angular by ui-guard. Rule IDs are ui-guard's own.

## The 13 segments

| Segment | Prefix | File naming | Notes |
|---|---|---|---|
| settings | — | `_<name>.settings.scss` | No CSS output. Config maps only (breakpoints…). |
| tools | — | `functions/_<name>.tools.scss`, `mixins/_<name>.tools.scss`, `_index.scss` forwards all | No CSS output. |
| generic | — | `_<name>.generic.scss` | Resets, box-sizing, the one reduced-motion block. Type selectors allowed. |
| elements | — | `elements/_index.scss` + `_<element>.element.scss` | Bare HTML elements only. Type selectors allowed. |
| common | — | `_<name>.common.scss`, entry `common/common.scss` | Aggregators that `@use` shared objects/components/modules. Optional `_attributes.common.scss`, `_classes.common.scss`. |
| objects | `o-` | `_<name>.object.scss` | Undecorated layout patterns. |
| components | `c-` | `_<name>.component.scss` | Self-contained UI pieces. |
| layout | `l-` | `layout/<name>/_<part>.<name>.layout.scss` + entry `<name>.layout.scss`, `layout/shared/` | What surrounds page content. |
| modules | `m-`, `ctrl-` | `_<name>.module.scss`, `_<vendor-comp>.<library>.module.scss`, `_<name>.control.module.scss` | Composites, vendor overrides, isolated JS widgets. |
| pages | `p-` | `pages/<group>/<page>/<page>.page.scss` | Page-only styles. |
| packages | — | `packages/<lib><ver>/<lib><major>.<locale>.min.css` | Vendor CSS. Never compiled, imported or modified. |
| utilities | `u-` | `utilities/<group>/_<name>.utility.scss`, entry `utilities/utils.scss` | One property each. |
| theme | — | plain CSS: `colors/colors.palette.theme.css`, `fonts/fonts.theme.css`, `custom.theme.css` | Swappable after the build. |

**State prefixes.** `is-` / `has-`: set in markup at first render and never changed by code. `js-`: changed or queried by code.

**Variants.** A variant uses the block name plus the variant, with the same prefix: `c-button c-button-secondary`. The BEM `--modifier` syntax is never used.

**Writing BEM in SCSS.** One block per rule: its elements and variants are nested inside it with `&__element` and `&-variant` (STYLE-47).

```scss
.c-button {
  display: flex;

  &__icon { max-block-size: px(14); }   // → .c-button__icon
  &-secondary { background-color: var(--secondary-500); }   // → .c-button-secondary
}
```

**Token files.** In `colors.palette.theme.css` each section has its own `:root { }` block (per-client values + icon filters, main, secondary, each fixed family, effects).

## Angular adaptation

- Global SCSS (`src/assets/scss`) holds settings, tools, generic, elements, common, objects, shared components/modules and utilities. It compiles through **one global entry** (`style.scss`) listed in `angular.json` `styles`. Vendor CSS stays in `angular.json` `styles` (from `node_modules`), listed **before** the project entry.
- A component's own `.scss` follows exactly the same rules as global SCSS. Its class prefix comes from the folder → role map in `.ui-guard/profile.md` (`l-` layout components, `p-` routed pages, `c-` shared components, `m-`/`ctrl-` composites and widgets).
- A component style `@use`s only settings and tools. Using a file that outputs CSS would duplicate that CSS in every component and scope it wrongly. `:host` is allowed.
- Prefixes apply to class names in **templates and TypeScript** too: `class=""`, `[class.x]`, `[ngClass]`, `classList`, `Renderer2.addClass`. Vendor classes (Bootstrap etc.) are not authored classes and are left alone.

## Rules

| ID | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|
| **Naming & selectors** ||||||
| STYLE-01 | error | stylelint (defs) + script (usages) | `*.scss`, `*.css`, `*.html`, `*.ts` | Every class the project authors has its segment prefix (`o- c- l- m- ctrl- p- u-`) or a state prefix (`is- has- js-`). The prefix matches the file's segment or Angular role. | Rename the class with the right prefix. Update every usage in SCSS, templates and TS (`class-usage.js` lists them). Correct: `.c-card`. Incorrect: `.card`. |
| STYLE-02 | error | ai | `*.scss`, `*.html`, `*.ts` | A `js-*` class used only as a hook for code has no styles. | Move the styles to a prefixed block class; keep `js-*` for code only. |
| STYLE-03 | error | ai | `*.html`, `*.ts` | Who sets the class decides the prefix. Fixed in markup at first render → `is-`/`has-`. Changed by code at runtime (`[class.x]`, `[ngClass]`, `classList`, `Renderer2`) → `js-`. Code only touches `js-*` classes. | Rename runtime-toggled classes to `js-…`; rename static state classes to `is-…`/`has-…`. |
| STYLE-04 | error | stylelint | `*.scss`, `*.css` | BEM: `block__element`, one element level only, no `--modifier`. | Incorrect: `.c-card__body__title`, `.c-card--big`. Correct: `.c-card__title`, `.c-card-big`. |
| STYLE-05 | error | stylelint | `*.scss` | Nesting depth is at most 4. At-rules (`@media`, `@include`) are not counted. | Flatten: use BEM element classes instead of deep nesting. |
| STYLE-06 | error | stylelint | `*.scss`, `*.css` outside generic/elements | Class selectors only. No type selectors. Exceptions: `body` in `custom.theme.css`, `:root` in token files, `:host` in component styles. | Give the element a BEM class. Incorrect: `.c-card p {}`. Correct: `.c-card__text {}`. |
| STYLE-07 | error | stylelint | all styles | No ID selectors anywhere. | Use a class. |
| STYLE-08 | error | stylelint (custom) | all styles | No attribute selectors. Exceptions: generic, elements, tools (the `dir` mixin), `common/_attributes.common.scss` (vendor markup only), and `[aria-*]` or `:is([dir="rtl"])` chained on a project class. Use pseudo-classes where they exist. | Incorrect: `[disabled]`. Correct: `:disabled`. Use an `is-`/`js-` class for other states. |
| STYLE-09 | error | script + ai | token files, all styles | Tokens are named by role or `--family-step` (`--main-500`, `--neutral-200`). Never by appearance (`--blue`, `--light-gray`). Typos in token names (`--waring`) are errors. | Rename the token (a row in `renames.md`); values never change. |
| **Units & values** ||||||
| STYLE-10 | error | stylelint (custom) | `*.scss` | Absolute lengths in `rem`, written with `px(N)` when the project has the `px()` tool. Raw `px` only for `1px`. Other units where they fit (`%`, `vw/vh/dvh/svh`, `fr`, `ch`, unitless ratios, `em`, `ms/s`). A `px()` argument is unitless. | `padding: 16px` → `padding: px(16)`. `px(16px)` → `px(16)`. |
| STYLE-11 | error | stylelint (custom) | `*.scss`, `*.css` | Logical properties for margins, paddings, borders, radii, insets, `text-align`, `float`, `clear`. **Exception: `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height` stay as written** (never converted, never reported). | `margin-right` → `margin-inline-end`, `left` → `inset-inline-start`, `text-align: left` → `text-align: start`. Keep the same `dir`: in an RTL-only app `margin-left` → `margin-inline-end`. In an app that switches direction a conversion flips in the other direction, so it is a decision, not a mechanical fix. |
| STYLE-12 | error | stylelint | all styles outside theme token files | Colors come only from custom properties. No hex, no `rgb()/rgba()/hsl()/hsla()` literal, no named colors, no literal fallback inside `var()`. Allowed keywords: `transparent`, `currentColor`, `inherit`. | `color: #333` → `color: var(--neutral-800)`. `var(--x, #fff)` → `var(--x)`. |
| STYLE-13 | error | script | token files | Every shade in token files is HSL, neutrals included. No hex. | Convert the hex value to the identical `hsl()` value. |
| STYLE-14 | error | stylelint | all styles | Numbers have at most 4 decimals. | Round to 4 decimals. |
| STYLE-15 | error | stylelint (custom) | `*.scss` | Media queries only through the `mq()` mixin. Raw `@media` is allowed only inside tools, the generic reduced-motion block, and `@media (hover: hover)` from `hover()`. | `@media (max-width: 991px)` → `@include mq(max, w, md)`. |
| **Architecture** ||||||
| STYLE-16 | error | stylelint (custom) | settings, tools | Settings and tools output no CSS. Only variables, maps, functions, mixins. | Move rule sets into the right output segment. |
| STYLE-17 | error | script + ai | all styles | Segment purity. A file lives in its segment folder, has the segment's file suffix, and styles only its own prefixed block. A component file never styles another component's classes. | Move or rename the file; move foreign rules into the owner's file or a module. |
| STYLE-18 | error | ai | layout, pages | Layout holds only what surrounds page content (header, navbar, side menu, footer, shell). Pages hold only their own content, never page chrome. A page style is never `@use`d by anything else. | Move chrome to layout; move shared parts to components/common. |
| STYLE-19 | error | ai | modules | A module styles two or more components together, or is a library module (vendor override, `m-`) or a control module (`ctrl-`). Every vendor override lives in **one** library module per vendor component, on an `m-` class placed beside the vendor class, with vendor inner parts nested inside it. No other file styles a `ctrl-` block. | Collect vendor overrides into `_<vendor-comp>.<library>.module.scss` under one `m-` class. |
| STYLE-20 | error | ai | objects | Objects are undecorated, fixed patterns. No parameters, no overrides from consumers, colors only via tokens. A utility is never reclassified as an object. | Remove decoration; move it to a component. |
| STYLE-21 | error | stylelint | all styles | No `!important`. Exceptions: the one generic `@media (prefers-reduced-motion: reduce)` block, and `custom.theme.css`. | Remove it and give the selector its proper place in the cascade (load order or one more class). Prove zero pixel change. |
| STYLE-22 | error | stylelint | `*.scss` | No `@extend`, except of a `%placeholder`. | Use a mixin or a `%placeholder`. |
| STYLE-23 | error | stylelint (+custom) | all styles | No duplicate selectors, duplicate properties, or duplicate identical `@include mq(...)` blocks in one rule. | Merge them. Keep the **later** values (what the browser renders today). |
| STYLE-24 | error | stylelint | all styles | No empty blocks, no empty comments. | Delete them. |
| STYLE-25 | error | stylelint (custom) + ai | utilities | `u-` prefix. Exactly one property (exceptions: `u-container`, `u-sr-only`, `u-not-sr-only`). Named `u-{property}-{value}` for a scale step. Never a breakpoint in the name (fluid values read a `clamp()` token). Never raised specificity. Used to add to a block, not replace it. | Split multi-property utilities; move the rest into a component. |
| STYLE-26 | error | stylelint (custom) | every `.scss`/`.css` except `packages/` | `@charset "UTF-8";` is the first line. | Add it as line 1. |
| STYLE-27 | error | script | `packages/`, `angular.json` | `packages/` files are never compiled, `@use`d, `@import`ed or modified. Vendor CSS is listed before project styles in `angular.json` `styles`. | Load vendor CSS from `angular.json` `styles`, before `style.scss`. |
| **Imports & placement** ||||||
| STYLE-28 | error | script + ai | common, components, objects, modules | Shared objects/components/modules (used by 5+ pages or by any layout) reach the app through a `common/` aggregator in the global entry. Used by 1–4 pages and no layout → they live with those pages. A 5th page promotes it to `common/`. | Move the `@use` into `common/`, or move the file next to its pages. |
| STYLE-29 | error | script | all `*.scss` | No double import. A file reached through `common/` is never `@use`d again elsewhere. | Delete the extra `@use`. |
| STYLE-30 | error | stylelint (custom) | component styles, all `*.scss` | Angular component styles `@use` only settings/tools (`@use "tools" as *;` right after `@charset`). No `@import` anywhere. | Replace `@import` with `@use`/`@forward`; move CSS-output files into the global entry. |
| STYLE-31 | warning | stylelint | all styles outside tools | `::ng-deep` only inside tools (the `dir` mixin). | Use the `dir()` mixin, a global module, or a component input. |
| **Theme** ||||||
| STYLE-32 | error | stylelint (custom) + script | `colors.palette.theme.css`, `fonts.theme.css` | The palette file contains only `:root` blocks (an at-rule may wrap a `:root` block). `fonts.theme.css` holds only `@font-face` and one `:root` block of font tokens. | Move other selectors to utilities/components/elements. |
| STYLE-33 | error | stylelint (custom) | `custom.theme.css` | Class selectors and `body` only. No custom property definitions. `!important` is allowed here. | Move tokens to the palette; use class selectors. |
| STYLE-34 | error | script | all styles | The palette is the single source of colour values. No other file defines a colour: no shade token outside the palette and no `.scss` file with `$name: <hex/rgb/hsl>` (checked by `tokens-check.js`; `/ui-guard:fix scss` moves it to every `colors.palette.theme.css` as an hsl token with an exact 8-bit round trip, and the variable becomes `var(--token)`; a variable read by a Sass colour function is listed, never moved). Fluid (`clamp()`) tokens are declared in the theme, never re-declared by a class. | Move the token into `colors.palette.theme.css`. |
| STYLE-35 | error | script | theme folders | Every theme source folder (`src/assets/themes/<name>/theme/`) defines exactly the same custom property names, in the same files, as every other theme and as the active copy (`src/assets/scss/theme/`). | Add the missing token to the theme(s) that lack it. |
| STYLE-36 | error | script | `index.html`, `angular.json`, `*.scss` | Swappable theme files (colors, fonts, images, custom) load with `<link>` from `assets/` in `index.html`. Never `@use`d, never in `angular.json` `styles`. `custom.theme.css` is the **last** stylesheet link in `<head>`. | Move the file into a `<link>` in `index.html`; move `custom.theme.css` last. |
| STYLE-37 | error | stylelint (custom) + ai | all styles, templates | Single-color icons are colored with a filter utility class (`u-filter-primary`, `u-filter-secondary`, `u-filter-light`, `u-filter-gray`) that reads a filter token. No literal `filter: invert(...)/sepia(...)` in SCSS. No `[data-img]` selectors. | Replace the literal filter with the utility class on the `<img>`. |
| **Tools & shared pieces** ||||||
| STYLE-38 | error | script + ai | tools | The tools are the shared set: `px()`, `mq()`, `dir()`, `after()`, `before()`, `hover()`, `scroll()`. Never duplicated. Every tool validates parameters with `@error`, takes values as parameters, and has a doc comment. Every settings map has a comment saying what it holds and what reads it. | Normalize to the ui-guard tool versions (templates/scss). Remove duplicates. |
| STYLE-39 | warning | ai | templates, styles | One shared button component (`c-button` + variants) is used for every button-looking element. A second button implementation is a finding. | Replace with `c-button` (+ variant), keeping the current look. |
| **Stylesheet accessibility (report only — never restyled by AI fixes)** ||||||
| STYLE-40 | error | stylelint (custom) | all styles | Visible focus. No `outline: none/0` unless the same rule set has a `:focus-visible` replacement. | Report to the team. Do not restyle in a fix phase. |
| STYLE-41 | warning | stylelint (custom) | all styles | `:hover` styles sit inside `@media (hover: hover)` with a matching `:focus-visible` style. The `hover()` mixin does both. | Use `@include hover { … }`. |
| STYLE-42 | error | script | generic, utilities | Exactly one `prefers-reduced-motion` block, in generic. `u-sr-only` is declared once. | Merge into the generic block. |
| STYLE-43 | info | ai | styles, templates | Interactive targets are at least 1.5rem (24px). | Report only. |
| STYLE-44 | info | script | token pairs | Text/background token pairs used together meet WCAG AA contrast. | Report only. |
| STYLE-45 | info | runtime | screenshot routes | No horizontal overflow from 320px wide up. | Report only (measured during `fix`). |
| STYLE-47 | warning | stylelint (custom) | `*.scss` | BEM in SCSS: a block's elements and variants are written **inside** the block rule with `&__element` and `&-variant`, not as separate top-level rules in the same file, and not nested with the full block name (`.l-header { .l-header__toggle {} }` → `&__toggle`). Elements sit side by side under the block. | Incorrect: `.c-button {}` then `.c-button__icon {}`, `.c-button-secondary {}`; `.c-button { .c-button__icon {} }`. Correct: `.c-button { … &__icon { … } &-secondary { … } }` (same compiled CSS). |
| STYLE-46 | warning | script | build output | CSS size budget (gzip): global styles ≤ 60 KB, each lazy component style chunk ≤ 12 KB, theme files together ≤ 3 KB. | Report; never blocks. |
| STYLE-48 | error | script | `angular.json`, `index.html`, every stylesheet | **Architecture gap.** The project has our structure exactly: the 13 segment folders with their index/entry files, the tools (`px()`, `mq()`, …), the settings, the four theme files, the one global entry `style.scss` in `angular.json` `styles`, the scss root in `includePaths`, and the theme `<link>`s in `index.html`. No global stylesheet lives outside it (`styles.scss`, `general.scss`, `app.scss`, vendor overrides, …). `foundation.js check` lists what is missing and what is misplaced. | `/ui-guard:fix scss` runs Foundation A (create the missing files from the templates — no value changes, resets as empty files) and Foundation B (move the global rules into the segment files in the same cascade order, proven by compiling before/after). A lazy bundle (`inject: false`) is listed as a decision. |

## Foundation (STYLE-48) — always the first two phases of `/ui-guard:fix scss`

- **Foundation A — Structure** (script `foundation.js structure --apply`): creates every missing file of our tree from `templates/scss` and the four theme files. Settings, tools, utilities and aggregators are copied as they are (they output nothing, or classes nobody uses yet); generic/elements files are created **empty** (a reset would change the page); the standard button is not added to an existing project. Wires `includePaths`, the entry in `angular.json` `styles` (right after the project's own global stylesheets, so the order stays) and the theme `<link>`s. Never changes a value.
- **Foundation B — Move** (script `foundation.js move --apply`): every top-level statement of the global stylesheets (and the local partials only they import) goes to its segment file — `$variables` → `settings/_project.settings.scss`, mixins/functions → `tools/mixins/_project.tools.scss`, `@font-face`/`@keyframes` → generic, `:root` tokens → `colors.palette.theme.css`, element rules → generic/elements, `u-` → utilities, library overrides → modules, other classes → components — **in the same cascade order**: a rule that would jump ahead of an earlier one stays with the earlier target and is listed as skipped (unsure). `url()`s are rebased. The compiled CSS before and after must render the same; otherwise everything is rolled back and the fixer moves the rest by hand.

## How agents use this file

- **Is a defect:** a selector, declaration, file placement or class usage that breaks a rule above, in a file the project authors.
- **Is not a defect:** vendor classes (Bootstrap, Material, PrimeNG…) used in templates; files under `packages/`; `node_modules`; anything the "Exceptions" column allows; `!important` in `custom.theme.css`.
- Rules checked by **stylelint** or **script** are not yours unless the scan tells you the tool was declined.
- STYLE-40/41/43/44/45 are **report-only**. Never propose restyling focus or contrast.
- **Writing SCSS (new or rewritten):** follow "Writing BEM in SCSS" above. One block rule; every element is `&__name` directly under the block, **side by side** (never inside another element); variants are `&-variant`; states like `&.js-closed` go inside their element. Never write `&__a { &__b {} }` (compiles to `.block__a__b`, STYLE-04) and never `.block { .block__x {} }` (STYLE-47). Never rename a class beyond its prefix or the planned renames: `.l-header__btn` stays `.l-header__btn`.
- **Converting `.block { .block__x {} }` to `&__x`** turns a descendant selector into a plain class (lower specificity, compiled CSS changes). Do it only with pixel proof (Playwright installed and before/after screenshots taken) or when a script confirms `.block__x` is defined once in the project and used only in the block's own template. Otherwise leave it and report it as skipped (unsure) with the reason.
- Before reporting STYLE-03 or STYLE-02, check who sets the class: grep the TS and the template for the class name.
- Before reporting STYLE-28, count the pages and layouts that use the block (`class-usage.js` output or Grep).
- When unsure, report `info` with `unverified` in the message.
