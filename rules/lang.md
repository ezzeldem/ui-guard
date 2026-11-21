# LANG — translation

The UI team's localization rules for user-visible text in Arabic / English UIs, exactly as ui-code-review applies them
(its I18N-01..08). Rule IDs are ui-guard's own; the **UCR** column gives the matching ui-code-review ID.

The project uses one of these mechanisms; work out which from the code and the translation files (`.ui-guard/profile.md`):

| Stack | Text in code | Translation files |
|---|---|---|
| Angular (ngx-translate / transloco) | `{{ 'KEY' \| translate }}`, `[attr.x]="'KEY' \| translate"`, `translate.instant('KEY')`, `translate.get('KEY')`, `marker('KEY')`, `'KEY' \| transloco` | JSON per language, e.g. `src/assets/i18n/<area>/ar.json`, `en.json`. Nested objects: `{ "A11Y": { "SEARCH": "..." } }` is key `A11Y.SEARCH`. |
| Angular (TypeScript dictionaries) | a project function or pipe, e.g. `t('sidebar.home')`, `{{ 'sidebar.home' \| t }}`, `i18n.t('KEY')` | `*.i18n.ts` / `*.translations.ts`, or `ar.ts` / `en.ts` under an `i18n` folder. One file can hold **every language**: `{ ar: { 'sidebar.home': '...' }, en: { 'sidebar.home': '...' } }`; each top-level `ar` / `en` block is that language. Keys are often flat strings with dots (`'sidebar.home'` is one key), or nested objects. |
| Angular (built-in i18n) | `i18n` / `i18n-<attr>` attributes in templates, `$localize` in TypeScript | `.xlf` / `.xliff` per language (`messages.ar.xlf`): `<trans-unit id="..."><source>` / `<target>`; or `messages.<lang>.json`. |
| ASP.NET MVC / Core | `@Localizer["Key"]`, `@SharedLocalizer["Key"]`, `@Resources.Key`, `IStringLocalizer<T>["Key"]`, `[Display(Name = "Key", ResourceType = ...)]` | `.resx` per language, e.g. `Resources/Shared.resx`, `Shared.ar.resx`: `<data name="Key"><value>...</value></data>`. Also JSON per language under `Resources` (JSON localization), or `.po` files (`msgid` / `msgstr`). |

A language is a file (`ar.json`, `Shared.ar.resx`, `messages.ar.xlf`) or a top-level block inside a file (`ar: { ... }`
in a TypeScript dictionary). A `.resx` with no culture in its name (`Shared.resx`) is the default language, usually English.

| ID | UCR | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|---|
| LANG-01 | I18N-01 | warning | script + ai | `*.html`, `*.cshtml`, Angular inline `template:` in `*.ts` | User-visible text written literally in a template or view: text nodes, and the `placeholder`, `title`, `alt`, `aria-label`, `aria-placeholder`, `label` values, button and option text. A one-word literal counts too (`alt="hero"`, `title="Edit"`); only `alt=""` and ARIA state values are not text. | Add a key to **every** language file and use it through the project's mechanism. Incorrect: `<button>Save</button>`. Correct: `<button>{{ 'common.save' \| translate }}</button>` / `<button>@Localizer["Save"]</button>`. |
| LANG-02 | I18N-02 | warning | ai | `*.ts`, `*.html`, `*.cshtml`, `*.js` | A literal chosen by language in code: `currentLang == 'ar' ? 'بحث' : 'Search'`, `lang === 'en' ? ... : ...`, `@(isArabic ? "..." : "...")`. | Replace the condition with one key. If both strings already exist as a key, reuse it. |
| LANG-03 | I18N-03 | warning | ai | `*.ts`, `*.js`, `*.cshtml` | User-visible text written literally in TypeScript / C# / JS: toast, alert, confirm and dialog messages, page titles, validation messages, text that is bound into the template or a live region. | Build it with `translate.instant('KEY', params)` / `Localizer["Key"]`. |
| LANG-04 | I18N-04 | error | script | code, templates, views, translation files | A key used in code, a template or a view is missing from a language's translation files (the user sees the raw key). | Add the key to every language file that lacks it. |
| LANG-05 | I18N-05 | error | script | translation files | A key exists in one language and not in another for the same area (e.g. in `common/en.json` but not `common/ar.json`, in the `ar` block of `shell.i18n.ts` but not its `en` block, or in `Shared.resx` but not `Shared.ar.resx`). | Add the missing key with a real translation. |
| LANG-06 | I18N-06 | error | script | translation files | The same key twice in one JSON or TypeScript object, two `<data name>` with one name in a `.resx` file, two `<trans-unit>` with one `id` in an `.xlf` file, or one `msgid` twice in a `.po` file. Only one of them is used. | Keep one entry with the right value (the later one is what the app uses today). |
| LANG-07 | I18N-07 | warning | ai | `*.html`, `*.ts`, `*.cshtml`, `*.js` | A sentence built by joining translated pieces, or a translated piece and a variable (`translate('A') + name + translate('B')`), so the word order can't change per language. | One key with a parameter: `'KEY' \| translate: { name: x }` / `{{name}}` in the value; `Localizer["Key", name]` with `{0}` in the value. |
| LANG-08 | I18N-08 | warning | script + ai | translation files | A value that is empty, is the key itself, or is in the wrong language (an `ar` value with no Arabic letters where the `en` value is a normal word, or an `en` value in Arabic). Brand names, codes, numbers and symbols are not this. | Write the real translation. |

## How agents use this file

- **Is a defect:** text a user can see or hear (including screen-reader text like `aria-label`, `alt`) written as a literal.
- **Translation files** are: JSON under an `i18n`, `l10n`, `locale`, `locales`, `lang`, `langs`, `translations` or `Resources`
  folder; `*.i18n.ts|js`, `*.translation(s).ts|js`, `*.locale.ts|js`, and `<lang>.ts|js` (`ar.ts`, `en-US.ts`) under such a
  folder; `.xlf` / `.xliff`; `messages.<lang>.json`; `.resx`; `.po`. LANG-05/06/08 apply to all of them.
- For a key on a line you review, look it up in the translation files of every language; a key found in **any** file of a
  language counts as present for that language (you can't see which files a module loads). A flat dotted key
  (`'sidebar.home'`) is one whole key; a nested key counts as present only at its full path (`A11Y.SEARCH`), not because a
  parent object `A11Y` exists.
- When the project has no translation files, LANG-04 and LANG-05 can't be confirmed: don't report them.
- A key built at runtime (`'STATUS.' + code`, `Localizer[name]`) can't be checked: don't report it.
- **Not user-visible, so not LANG:** CSS classes, ids, routes, URLs, `data-*` and test ids, enum and API values, log and
  `console` text (that is SAFE-08), comments, code that is commented out, `.spec.ts` files, and strings passed only to code
  (keys of a map, event names), and the translation keys themselves. Text inside `<code>` that a user reads is user-visible text like any other.
- **Not text to translate:** brand and product names (say so in the message), numbers, units, symbols and punctuation alone,
  icons, file extensions, sample values in a `placeholder` such as an email or URL format.
- Language names in a language switcher are written in their own language on purpose (`English`, `العربية`): not a defect.
- One finding per rule per line. When one line has LANG-02 and the same text also breaks LANG-01, report only LANG-02.
- LANG-04/05/06 belong to `i18n-check.js` (JSON, TS/JS dictionaries incl. per-language blocks, `.xlf`, `.resx`, `.po`);
  do not report them unless the scan says the script could not parse a file.
- LANG-01 has a script part (`i18n-check.js`): literal text nodes and literal `placeholder` / `title` / `alt` / `aria-label` /
  `aria-placeholder` / `label` values in `.html` and `.cshtml`, when the project has translation files. The AI reports the rest
  (inline templates, TS, bound literals, LANG-02/03/07) and does not repeat the script's lines; a brand name the script reported
  is rejected with that reason.
- A new key follows the shape the translation file already uses — the same casing, the same nesting and the feature's
  existing namespace (`products.title` next to `products.empty`, never a second `PRODUCTS` object) — and a key the project
  already has with the same text is reused.
- When fixing, add the key to **every** language file. In a finding's fix, name an existing key to reuse when there is one;
  when you propose a new key, give it with its Arabic and English values.
- Report only defects that need a change: no observations, optional suggestions, or findings you could not confirm from the
  files you can read. Minified files, `.d.ts`, and anything under `node_modules`, `dist`, `bin`, `obj` are never reviewed.
