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
- BEM always written nested inside the block with `&`: `.c-card { &__title { … } &-featured { … } }` — never a separate
  `.c-card__title {}` rule, never `--modifier`.
- Theme files are plain `.css` only (no `.scss` in `theme/` or `src/assets/themes/`). Theme files and `project-images/` are
  swapped after the build: never reference them from SCSS `url()`, TS imports or `angular.json` `styles` — use them from
  `custom.theme.css` or `<img src="assets/project-images/…">`.
- Apply the rules literally: do exactly what is asked and what the rules say — no extra exceptions, no stricter or looser
  reading, no invented names or values (they come from the rules and `.ui-guard/profile.md`), no refactor or cleanup nobody
  asked for. A case the rules do not clearly cover is reported as needing a decision, with the rule ID.
- Never commit, branch or push unless the developer asks.
- Scan and fix per domain: `/ui-guard:scan scss|access|lang|safe`, `/ui-guard:fix <domain>`. Plans and reports live in
  `.ui-guard/<domain>/`. Do not edit the `baseline.json` files by hand.
<!-- ui-guard:end -->
