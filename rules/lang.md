# LANG — translation

Based on the UI team's localization review rules. Rule IDs are ui-guard's own.

Supported setups: ngx-translate, transloco, Angular built-in i18n (`.xlf`), TS dictionaries (`*.i18n.ts`).
The script handles JSON and XLF fully. TS dictionaries are parsed with a tolerant key extractor; anything it
cannot parse is handed to the AI scanner, never skipped.

| ID | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|
| LANG-01 | warning | ai | `*.html` | User-visible text written literally in a template: text nodes and `placeholder`, `title`, `alt`, `aria-label`, `aria-placeholder`, `label`, button and option text. | Add a key to **every** language file and use it. Incorrect: `<button>Save</button>`. Correct: `<button>{{ 'common.save' \| translate }}</button>`. |
| LANG-02 | warning | ai | `*.ts`, `*.html` | A literal chosen by language in code: `lang === 'ar' ? 'بحث' : 'Search'`. | Replace with one key. |
| LANG-03 | warning | ai | `*.ts` | User-visible text written literally in TypeScript: toasts, alerts, confirms, dialog messages, page titles, validation messages, text bound into a template. | Use the translate service / key. |
| LANG-04 | error | script | code, templates, translation files | A key used in code or templates is missing from a language's translation files. The user sees the raw key. | Add the key to every language file. |
| LANG-05 | error | script | translation files | A key exists in one language and not in another for the same area (e.g. `common/en.json` vs `common/ar.json`). | Add the missing key with a real translation. |
| LANG-06 | error | script | translation files | The same key twice in one JSON/TS object, or one `<trans-unit id>` twice in an `.xlf`. | Keep one; the later value is what the app uses today. |
| LANG-07 | warning | ai | `*.html`, `*.ts` | A sentence built by joining translated pieces, or pieces and variables, so word order cannot change per language. | One key with parameters: `'cart.count' \| translate: { n: count }`. |
| LANG-08 | warning | script + ai | translation files | A value is empty, equals its key, or is in the wrong language (an `ar` value with no Arabic letters where the `en` value is a normal word, or the reverse). | Write the proper translation. |

## How agents use this file

- **Is a defect:** text a user can see or hear (including screen-reader text like `aria-label`, `alt`) written as a literal.
- **Is not a defect:** numbers, punctuation-only strings, icons, CSS class names, route paths, keys themselves, `data-*` and test ids, console messages (those are SAFE-08), brand names the team keeps untranslated (say so in the message), text inside `<code>`.
- Find the i18n library and translation paths in `.ui-guard/profile.md` before reporting.
- LANG-04/05/06 belong to `i18n-check.js`; do not report them unless the scan says the script could not parse a file.
- When fixing, add the key to **every** language file.
