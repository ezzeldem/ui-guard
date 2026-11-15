<!-- ui-guard:start -->
## UI rules (ui-guard)
This project follows the team UI standards, enforced by the ui-guard plugin.
- Rules: STYLE (SCSS/classes/theme), LANG (translation), SAFE (security), MEDIA (images/fonts),
  ACCESS (accessibility). Full text: the ui-guard `rules/` files.
- Every SCSS file starts with `@charset "UTF-8";` then `@use "tools" as *;` when it uses a tool.
- Sizes with `px(N)`, media queries with `mq()`, colors only with `var(--token)`, logical properties (width/height stay as written),
  no `!important` (except in `custom.theme.css`), no IDs, every class prefixed by its role (c- l- p- m- ctrl- o- u- is- has- js-).
- BEM written nested inside the block: `.c-button { &__icon { … } &-secondary { … } }` (never `--modifier`).
- Never commit, branch or push unless the developer asks.
- Scan and fix per domain: `/ui-guard:scan scss|access|lang|safe`, `/ui-guard:fix <domain>`. Plans and reports live in
  `.ui-guard/<domain>/`. Do not edit the `baseline.json` files by hand.
<!-- ui-guard:end -->
