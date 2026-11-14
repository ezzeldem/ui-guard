---
name: ui-rules
description: Use whenever creating or editing .scss, .css, .html or Angular .ts UI files in a project that has .ui-guard/profile.md — the team UI rules (ui-guard) for SCSS architecture, class prefixes, theme tokens, translation, security, images and accessibility.
---

# UI rules (ui-guard) — the musts

1. Every SCSS/CSS file starts with `@charset "UTF-8";`, then `@use "tools" as *;` when it uses a tool.
2. Sizes with `px(N)` (rem). Raw `px` only for `1px`. Media queries only with `@include mq(min|max, w|h, <bp>)`.
3. Colors only with `var(--token)` — no hex/rgb/hsl/named colors, no literal fallbacks inside `var()`.
4. Logical properties only: `margin-inline-end`, `inset-inline-start`, `inline-size`, `text-align: start`…
5. No `!important` (only allowed in `custom.theme.css` and the one generic reduced-motion block). No IDs. No attribute selectors. No `@extend` (except `%placeholder`). No `@import`.
6. Every authored class has its role prefix — in SCSS **and** in templates/TS: `o- c- l- m- ctrl- p- u-`, state `is- has- js-`. The prefix follows the folder → role map in `.ui-guard/profile.md`.
7. BEM `block__element`, one level, never `--modifier`; variants are `c-button c-button-secondary`. Write elements and variants inside the block: `.c-button { &__icon { … } &-secondary { … } }`.
8. A class changed by code (`[class.x]`, `[ngClass]`, `classList`, `Renderer2`) is `js-…`; a static state is `is-`/`has-`.
9. Angular component styles `@use` only settings/tools; nesting depth ≤ 4; `:host` allowed; `::ng-deep` only via the `dir()` mixin.
10. Single-color icons are saved black and colored with `u-filter-primary|secondary|light|gray`.
11. Buttons use the shared `c-button` (+ variant). Do not build another button.
12. Every user-visible text (text nodes, `placeholder`, `title`, `alt`, `aria-label`, toasts, titles) is a translation key added to **every** language file.
13. Bind ARIA with `[attr.aria-*]` (bind `null` to remove); no positive `tabindex`; native elements over `div (click)`.
14. No HTML from untrusted data (`innerHTML`, `bypassSecurityTrust*`), no secrets in front-end code.
15. Never commit, branch, stash or push unless the developer asks. Do not edit `.ui-guard/baseline.json`.

For the full rules read `${CLAUDE_PLUGIN_ROOT}/rules/<file>.md` for the prefix you are touching
(`style.md`, `lang.md`, `safe.md`, `access.md`; images/assets: `media.md` (01–06 are checked by the free scan; `/ui-guard:assets` checks referenced files exist)).
Read `.ui-guard/profile.md` for this project's role map, tokens, i18n setup and button.
The post-edit hook lints every file you write; fix any `STYLE-xx line N` error it reports before moving on.
