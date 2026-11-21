---
name: ui-rules
description: Use whenever creating or editing .scss, .css, .html or Angular .ts UI files in a project that has .ui-guard/profile.md — the team UI rules (ui-guard, the AXIS SCSS standard) for SCSS architecture, class prefixes, theme tokens, translation, security, images and accessibility.
---

# UI rules (ui-guard) — the musts

1. Every SCSS/CSS file starts with `@charset "UTF-8";`. A file that reads settings or tools lists them next
   (`// @dependencies: tools/mixins/_mq.mixin.scss`), then `@use "<path-to-root>/tools" as *;` (`@use "tools" as *;` in a
   component style). Settings have no index: `@use "<path-to-root>/settings/<name>.settings" as *;`.
2. Sizes with `px(N)` (rem). Raw `px` only for `1px` (`$variables` too). Media queries only with `@include mq(min|max, w|h, <bp>)`.
3. Colors only with `var(--token)` — no hex/rgb/hsl/named colors, no literal fallbacks inside `var()`. Shades live only in
   `theme/colors/colors.palette.theme.css`; per-client identity values (`--hue`, `--saturation`, `--lightness`, `-2` for the second
   brand) and `--filter-*` in `colors.base.theme.css`; font tokens `--ff`, `--fs-*`, `--fw-*`, `--lh-*` in `fonts.theme.css`.
4. Logical properties only: `margin-inline-end`, `inset-inline-start`, `text-align: start`, sizes `inline-size` / `block-size` /
   `min-/max-inline-size` / `min-/max-block-size` (never `width`/`height`).
5. No `!important` (only the one generic reduced-motion block). No IDs. No type or `*` selectors outside generic/elements.
   No attribute selectors except `[aria-*]` or `:is([dir="rtl"])` chained onto a project class. No `:host`, no `::ng-deep`
   (direction: `@include dir(rtl)`, which writes `:dir(rtl)`). No `@extend` (except `%placeholder`). No `@import`.
6. Every authored class has its role prefix — in SCSS **and** in templates/TS: `o- c- l- m- ctrl- p- u-`, state `is- has- js-`.
   The prefix follows the folder → role map in `.ui-guard/profile.md`. Vendor overrides only in `modules/_<component>.<library>.module.scss`
   on `.m-<component>`, vendor parts nested inside it.
7. BEM `block__element`, one level, never `--modifier`; variants are `c-button c-button-secondary`. **Always** write elements
   and variants inside their block with `&` — never as separate top-level rules and never repeating the block name:
   `.c-card { &__title { … } &__body { … } &-featured { … } }`, not `.c-card {}` + `.c-card__title {}` (STYLE-47, error).
   Elements sit side by side directly under the block (never `&__a { &__b {} }`).
8. A class changed by code (`[class.x]`, `[ngClass]`, `classList`, `Renderer2`) is `js-…`; a static state is `is-`/`has-`.
9. Angular component styles `@use` only settings/tools; a routed page style may also `@use` its page-local objects, components
   and modules. Files never move out of their segment folder. Nesting depth ≤ 4.
10. `:hover` only through `@include hover { … }` (adds the same `:focus-visible`). Screen-reader-only text uses `u-sr-only`
    (never a re-implementation). Utilities: one property, `u-{property}-{value}` with `ff fs fw bg text text-align`.
10b. Theme files are **plain `.css` only** — never a `.scss`/`.sass` file in `theme/` or `src/assets/themes/` (STYLE-56). Theme
    files and client images in `project-images/` are swapped after the build, so compiled code never points at them: no
    `url(…project-images/…)` in `.scss` or component styles, no TS `import` of them, nothing from `themes/` in `angular.json`
    `styles` (STYLE-57). A client image is used from `custom.theme.css` or as `<img src="assets/project-images/<file>">`.
11. Single-color icons are saved black and colored with `u-filter-primary|secondary|neutral-25|neutral-400`.
12. Buttons use the shared `c-button` (+ variant). Do not build another button.
13. Every user-visible text (text nodes, `placeholder`, `title`, `alt`, `aria-label`, toasts, titles) is a translation key added to **every** language file.
14. Bind ARIA with `[attr.aria-*]` (bind `null` to remove); no positive `tabindex`; native elements over `div (click)`.
15. No HTML from untrusted data (`innerHTML`, `bypassSecurityTrust*`), no secrets in front-end code.
16. Never commit, branch, stash or push unless the developer asks. Do not edit the `.ui-guard/<domain>/baseline.json` files.

For the full rules read `${CLAUDE_PLUGIN_ROOT}/rules/<file>.md` for the prefix you are touching
(`style.md`, `lang.md`, `safe.md`, `access.md` + `access-fix-tiers.md` (+ `access-mvc.md` for Razor views and scripts); images/assets: `media.md` (01–06 are checked by the free scan; `/ui-guard:assets` checks referenced files exist)).
Read `.ui-guard/profile.md` for this project's role map, tokens, i18n setup and button.
The post-edit hook lints every file you write; fix any `STYLE-xx line N` error it reports before moving on.
