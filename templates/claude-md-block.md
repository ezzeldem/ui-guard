<!-- ui-guard:start -->
## UI rules (ui-guard)
This project follows the team UI standards (the AXIS SCSS standard), enforced by the ui-guard plugin.
- Rules: STYLE (SCSS/classes/theme), LANG (translation), SAFE (security), MEDIA (images/fonts),
  ACCESS (accessibility). Full text: the ui-guard `rules/` files.
- Every SCSS file starts with `@charset "UTF-8";`, then `// @dependencies:` lines for the settings/tools it reads, then
  `@use "<path-to-root>/tools" as *;` (`@use "tools" as *;` in an Angular component style).
- SCSS lives in the 13 AXIS segments of `src/assets/scss` (entries `common/common.scss` and `utilities/utils.scss`; theme files
  `colors/colors.base.theme.css`, `colors/colors.palette.theme.css`, `fonts/fonts.theme.css`, `custom.theme.css`).
- Sizes with `px(N)`, media queries with `mq()`, colors only with `var(--token)`, logical properties only (inline-size/block-size, never width/height),
  no `!important`, no IDs, no `:host`, no `::ng-deep`, every class prefixed by its role (c- l- p- m- ctrl- o- u- is- has- js-).
- BEM written nested inside the block: `.c-button { &__icon { … } &-secondary { … } }` (never `--modifier`).
- Never commit, branch or push unless the developer asks.
- Scan and fix per domain: `/ui-guard:scan scss|access|lang|safe`, `/ui-guard:fix <domain>`. Plans and reports live in
  `.ui-guard/<domain>/`. Do not edit the `baseline.json` files by hand.
<!-- ui-guard:end -->
