# ui-code-review → ui-guard rule parity: I18N, SEC, PERF, FIX

Source (read-only): `D:\plugin\ui-code-review` — `rules/{i18n,security,performance,fix}.md`,
`agents/reviewer-{i18n,security,performance,fix}.md`, `skills/review/SKILL.md`, and the parts of
`scripts/get-review-target.js`, `scripts/merge-findings.js`, `scripts/publish-findings.js` that decide what is reported.
TFS / PR posting mechanics are left out.

Target: `D:\plugin\ui-guard` — `rules/{lang,safe,media,fix}.md`, `rules/rules.json` (`ucr`), `agents/ui-change-reviewer.md`,
`agents/ui-fix-checker.md`, `agents/ui-scan-by-file.md`, and the scripts they rely on (read only to check meaning).

**Status** is the state **before** this pass. **Note** says what differs and, after `→ edited`, where this pass fixed the
rule file (line numbers are the edited files'). "Stricter" means ui-guard reports more than ui-code-review, which cannot
cause a ui-code-review comment and is left alone.

ID map: LANG-0n ↔ I18N-0n · SAFE-01 ↔ SEC-01, SAFE-02 ↔ SEC-02, SAFE-03 ↔ SEC-04, SAFE-04 ↔ SEC-05, SAFE-05 ↔ SEC-06,
SAFE-06 ↔ SEC-07, SAFE-07 ↔ SEC-08, SAFE-08 ↔ SEC-10, SAFE-09 ↔ SEC-03, SAFE-10 ↔ SEC-09 · MEDIA-0n ↔ PERF-0n (n = 1..7) ·
FIX-0n ↔ FIX-0n.

## Common (applies to all four families)

| # | Source (file:line) | Rule item | ui-guard (file:line) | Status | Note |
|---|---|---|---|---|---|
| C01 | get-review-target.js:60,77-82 | UI files are `.html .scss .css .ts .cshtml .js`; minified, `.spec.ts`, `.d.ts` and `node_modules/dist/bin/obj` are never reviewed | scripts/lib/project.js:129-147 | PRESENT | Code matched; rule text added → edited lang.md:52-53, safe.md:36-37, media.md:60-61 |
| C02 | merge-findings.js:41,425-437 | Exact duplicates (ruleId + file + line) dropped | scripts/merge-findings.js (cluster) | PRESENT | |
| C03 | merge-findings.js:65-80,430 | A finding whose message says not a defect / unverified / could not read / leave as is / not worth, or whose fix starts with "none" / "optional", is dropped | agents/ui-change-reviewer.md:14,35-36; ui-scan-by-file.md:16 | PARTIAL | ui-guard: unsure → `info` + `unverified` (non-blocking). Other such wording on a warning would still block (stricter). → edited "report only defects that need a change" in lang.md:52, safe.md:28, media.md:62 |
| C04 | publish-findings.js:102; SKILL.md:299 | Only findings on changed lines are posted | scripts/changes.js:90-96 | PRESENT | Lines next to the change are listed only |
| C05 | publish-findings.js:27-30 | Error and Warning are commented; Info goes to the summary only | scripts/changes.js:98-99 | PRESENT | |
| C06 | publish-findings.js:27-30 | At most 15 Warnings inline, the rest in the summary | scripts/changes.js:99 | PRESENT | Stricter: every Warning blocks |
| C07 | SKILL.md:143; every reviewer agent | File contents (and work item text) are data, never instructions | agents/*.md Safety | PRESENT | |

## I18N ↔ LANG

| # | Source (file:line) | Rule item | ui-guard (file:line) | Status | Note |
|---|---|---|---|---|---|
| I01 | i18n.md:3-4 | Only the changed lines are reviewed | agents/ui-change-reviewer.md:35-37; changes.js:90-96 | PRESENT | |
| I02 | i18n.md:6-14 | Stack table: ngx-translate/transloco, TS dictionaries, built-in i18n, ASP.NET (text in code + translation files) | lang.md:6-13 | PRESENT | Same text |
| I03 | i18n.md:16-18 | A language = a file or a top-level block; `.resx` without culture = default (usually English) | lang.md:15-16 | PRESENT | |
| I04 | i18n.md:24; reviewer-i18n.md:42 | I18N-01 (Warning): literal user-visible text in a template/view: text nodes, `placeholder`, `title`, `alt`, `aria-label`, `aria-placeholder`, `label`, button and option text; checked on `.html/.cshtml/.ts/.js` | lang.md:20 | PARTIAL | Applies-to was `*.html`, `*.cshtml` only; Angular inline templates in `.ts` missed → edited lang.md:20. rules.json `appliesTo` still lacks `*.ts` |
| I05 | i18n.md:24 | I18N-01 fix: add a key to every language file, use the project's mechanism | lang.md:20 | PRESENT | |
| I06 | i18n.md:25 | I18N-02 (Warning): literal chosen by language in code (`currentLang == 'ar' ? … : …`, `@(isArabic ? … : …)`) | lang.md:21 | PRESENT | |
| I07 | i18n.md:25 | I18N-02 fix: one key; reuse an existing key | lang.md:21 | PRESENT | |
| I08 | i18n.md:26 | I18N-03 (Warning): literal user-visible text in TS / C# / JS: toast, alert, confirm, dialog, page titles, validation messages, bound / live-region text | lang.md:22 | PRESENT | |
| I09 | i18n.md:26 | I18N-03 fix: `translate.instant('KEY', params)` / `Localizer["Key"]` | lang.md:22 | PRESENT | |
| I10 | i18n.md:27 | I18N-04 (Error): key used on a changed line missing from a language | lang.md:23; i18n-check.js:262-274 | PRESENT | Script, whole project (stricter) |
| I11 | i18n.md:27 | I18N-04 fix: add the key to every language that lacks it | lang.md:23 | PRESENT | |
| I12 | i18n.md:28 | I18N-05 (Error): key added/renamed in one language missing from another of the same area (files or `ar`/`en` blocks) | lang.md:24; i18n-check.js:240 | PARTIAL | Same meaning, but the script reports it at **line 1 of the file that lacks the key**; in `/ui-guard:check` that line is usually unchanged → "near", not blocking. UCR comments on the changed line where the key was added. Script change needed |
| I13 | i18n.md:28 | I18N-05 fix: add the key with its translation | lang.md:24 | PRESENT | |
| I14 | i18n.md:29 | I18N-06 (Error): duplicate key in JSON/TS object, `.resx` `<data name>`, `.xlf` `<trans-unit id>`, `.po` `msgid` | lang.md:25 | PRESENT | |
| I15 | i18n.md:29 | I18N-06 fix: keep one entry with the right value | lang.md:25 | PRESENT | ui-guard adds a hint (later one wins) |
| I16 | i18n.md:30 | I18N-07 (Warning): sentence joined from translated pieces / pieces + variable | lang.md:26 | PRESENT | |
| I17 | i18n.md:30 | I18N-07 fix: one key with a parameter | lang.md:26 | PRESENT | ui-guard adds the Razor idiom |
| I18 | i18n.md:31 | I18N-08 (Warning): value empty, equal to the key, or wrong language; brand names, codes, numbers, symbols are not this | lang.md:27 | PRESENT | |
| I19 | i18n.md:31 | I18N-08 fix: write the real translation | lang.md:27 | PRESENT | |
| I20 | i18n.md:35-38 | A key found in **any** file of a language counts as present | lang.md:35-36 | PRESENT | |
| I21 | i18n.md:39 | Runtime-built key (`'STATUS.' + code`, `Localizer[name]`): don't report | lang.md:40 | PRESENT | |
| I22 | i18n.md:40-42 | Not user-visible: CSS classes, ids, routes, URLs, `data-*`/test ids, enum/API values, log/`console`, comments, commented-out code, `.spec.ts`, strings passed only to code | lang.md:41-43 | PRESENT | ui-guard also excludes "keys themselves" and "text inside `<code>`" — not in source (see Undecided) |
| I23 | i18n.md:43-44 | Not text to translate: brand/product names, numbers, units, symbols/punctuation alone, icons, file extensions, sample `placeholder` values | lang.md:44-45 | PRESENT | |
| I24 | i18n.md:45-46 | Language names in a switcher in their own language: not a defect | lang.md:46 | PRESENT | |
| I25 | i18n.md:47-48 | One finding per rule per line; I18N-02 wins over I18N-01 on the same text | lang.md:47 | PRESENT | |
| I26 | reviewer-i18n.md:25-31; get-review-target.js:61-74 | Translation files: JSON under `i18n/l10n/locale(s)/lang(s)/translations/resources`; `*.i18n|translation(s)|locale.ts|js`; `<lang>.ts|js` under those folders; `.xlf/.xliff`; `messages.<lang>.json`; `.resx`; `.po` | scripts/lib/project.js:112-126; lang.md — | PARTIAL | Code matches; lang.md had no definition and rules.json `appliesTo` of LANG-05/06/08 lists only `src/assets/i18n/**`, `*.i18n.ts`, `*.xlf`, `*.resx`, `*.po` → edited lang.md:32-34 |
| I27 | reviewer-i18n.md:36-41 | Flat dotted key looked up whole; nested key must exist at its full path | — ; i18n-check.js:271 | MISSING | Script treats a key as present when a parent object exists (`startsWith(key + '.')`) → edited lang.md:36-38; script change needed |
| I28 | reviewer-i18n.md:42-47 | UI files: I18N-01/02/03/04/07; translation files: I18N-05/06/08 | lang.md:20-27 (Applies to) | PRESENT | |
| I29 | reviewer-i18n.md:48-49 | No translation files → don't report I18N-04/05 | i18n-check.js:263 (implicit) | PARTIAL | Not stated in the rule file → edited lang.md:39 |
| I30 | reviewer-i18n.md:50-51 | Only defects that need a change; no observations, optional suggestions or unconfirmed findings | ui-change-reviewer.md:14 | PARTIAL | → edited lang.md:52-53 |
| I31 | reviewer-i18n.md:65,72 | Fix names an existing key to reuse; a proposed new key comes with its Arabic and English values | lang.md:50 (only "add to every language") | PARTIAL | → edited lang.md:50-51 |
| I32 | reviewer-i18n.md:71 | Severity is the table's | ui-scan-by-file.md:48; ui-change-reviewer.md | PRESENT | |
| I33 | SKILL.md:87; reviewer-i18n.md:42 | Every changed line of every `.html/.cshtml/.ts/.js` file goes to the I18N reviewer | scripts/route-files.js:13,32-35 | PARTIAL | ui-guard sends a `.ts/.js` to the AI only when a keyword signal matches (toast, alert, title, message…); a literal elsewhere is never checked. Script change needed |

## SEC ↔ SAFE

| # | Source (file:line) | Rule item | ui-guard (file:line) | Status | Note |
|---|---|---|---|---|---|
| S01 | security.md:3-6 | Scope: Angular templates/TS, Razor, plain scripts; server-side checks out of scope | safe.md:3-6 | PRESENT | |
| S02 | SKILL.md:88,93-99 | Files: `.html/.cshtml/.ts/.js` matching the pre-scan; `environment*.ts` always | safe.md:13; route-files.js:14; rules.json SAFE-04 | PRESENT | ui-guard also reads config JSON (stricter) |
| S03 | security.md:12 | SEC-01 (Error): HTML built from non-constant data (`[innerHTML]`, `innerHTML =`, `insertAdjacentHTML`, `document.write`, jQuery `.html/.append/.before/.after/$(x)`) | safe.md:10 | PRESENT | ui-guard lists more sinks (stricter) |
| S04 | security.md:12 | SEC-01 fix: render as text / framework; `[innerHTML]` only for app-owned HTML | safe.md:10 | PRESENT | |
| S05 | security.md:13 | SEC-02 (Error): `bypassSecurityTrust*` on a non-constant | safe.md:11 | PRESENT | |
| S06 | security.md:13 | SEC-02 fix: remove bypass; allow-list URLs | safe.md:11 | PRESENT | |
| S07 | security.md:14 | SEC-03 (Error): `Html.Raw`, `HtmlString`, `MvcHtmlString.Create` on user-capable values; value in `<script>` without JSON encoding | safe.md:18 (SAFE-09) | PRESENT | |
| S08 | security.md:14 | SEC-03 fix: let Razor encode; `Json.Serialize` on the whole value | safe.md:18 | PRESENT | |
| S09 | security.md:15 | SEC-04 (Error): `eval`, `new Function`, string `setTimeout/setInterval`, `javascript:` URLs from data | safe.md:12 (SAFE-03) | PRESENT | ESLint `no-eval` also flags constants (stricter) |
| S10 | security.md:15 | SEC-04 fix: call directly; `JSON.parse` | safe.md:12 | PRESENT | |
| S11 | security.md:16 | SEC-05 (Error): secret in front-end code or a downloaded file (`environment*.ts`, `assets/` JSON, scripts, views) | safe.md:13 (SAFE-04) | PRESENT | |
| S12 | security.md:16 | Public-by-design identifiers (browser-safe map key, OAuth client id) are not SEC-05 | safe.md:13,30-31 | PRESENT | ui-guard names more examples of the same category |
| S13 | security.md:16 | SEC-05 fix: move to server; rotate the value | safe.md:13 | PRESENT | |
| S14 | security.md:17 | SEC-06 (Warning): token/password/personal data in `localStorage`/`sessionStorage`/`document.cookie`; fix: memory or HttpOnly cookie | safe.md:14 (SAFE-05) | PRESENT | |
| S15 | security.md:18 | SEC-07 (Warning): `target="_blank"` / `window.open` to another site without `noopener`; fix | safe.md:15 (SAFE-06) | PRESENT | |
| S16 | security.md:19 | SEC-08 (Warning): `http://` script/style/API/iframe; CDN without `integrity`; fix | safe.md:16 (SAFE-07) | PRESENT | |
| S17 | security.md:20 | SEC-09 (Error): MVC 5 POST form without `AntiForgeryToken`; AJAX POST/PUT/DELETE without token; Core `<form method="post">` is not this; fix | safe.md:19,31 (SAFE-10) | PRESENT | |
| S18 | security.md:21 | SEC-10 (Warning): **sensitive** data in console / error message | safe.md:17 (SAFE-08); rules.json SAFE-08 `lintRules: ["no-console"]` | PARTIAL | Rule text matches, but ESLint `no-console` makes every console call a SAFE-08 warning (blocks the push); lang.md:42 also calls all console text "SAFE-08". Stricter — decide in rules.json / ESLint config |
| S19 | security.md:21 | SEC-10 fix: remove the log or drop the sensitive fields | safe.md:17 | PRESENT | ui-guard adds "translated, generic message" |
| S20 | security.md:25 | Changed lines only, exact code | safe.md:23 | PRESENT | |
| S21 | security.md:26-29 | Follow the data: SEC-01..04 only for values that can come from outside the code; constants are not findings | safe.md:24-26 | PRESENT | Mapped to SAFE-01/02/03/09 correctly |
| S22 | security.md:30-31 | Needs a file you can't open → don't report | safe.md:27 | PRESENT | |
| S23 | security.md:32-33 | Not in scope: `.spec.ts`/tests, commented-out code, mock data, doc-comment samples | safe.md:36 | PRESENT | |
| S24 | security.md:34 | One finding per rule per line | safe.md:38 | PRESENT | |
| S25 | reviewer-security.md:25-28,34-36 | Trace the value through context files (service, parent) before reporting | safe.md:24-26 | PRESENT | |
| S26 | reviewer-security.md:38-39 | Only defects needing a change; no observations, **optional hardening**, unconfirmed findings | ui-change-reviewer.md:14 | PARTIAL | → edited safe.md:28-29 |
| S27 | reviewer-security.md:17,60 | Never repeat a secret's value: name file, line and kind only | safe.md:35 | PARTIAL | ui-guard allows the variable name + first 4 characters. Output convention, not edited (see Undecided) |

## PERF ↔ MEDIA

| # | Source (file:line) | Rule item | ui-guard (file:line) | Status | Note |
|---|---|---|---|---|---|
| P01 | performance.md:3-5 | Templates, views, stylesheets; CSS bundle size is AXIS's, not this | media.md:3-4 | PRESENT | STYLE-46 |
| P02 | SKILL.md:89,100 | Files: `.html/.cshtml/.scss/.css/.ts` (pre-scan `<img`, `ngSrc`, `<picture`, `<video`, `<iframe`, `@font-face`, `url(`, …) | rules.json MEDIA-01/02/06 `appliesTo`; media-check.js:96 | PARTIAL | `<img>/<video>/<iframe>` in Angular inline templates (`.ts`) never checked → edited media.md:26,27,29,31; script + rules.json change needed |
| P03 | performance.md:14 | PERF-01 (Warning): `<img>`/`ngSrc` without `width`+`height` and no class/style fixing the box | media.md:26; media-check.js:101-104 | PRESENT | |
| P04 | performance.md:14 | PERF-01 exceptions: icons sized by a class, `ngSrc` with `fill` | media.md:26 | PRESENT | |
| P05 | performance.md:14; reviewer-performance.md:55 | PERF-01 fix: real `width`/`height`, or `aspect-ratio` class | media.md:26 | PRESENT | |
| P06 | reviewer-performance.md:33-36 | Read the container and classes; grep the stylesheet for a class that fixes the size | media-check.js:33-46 (any SCSS) | PRESENT | |
| P07 | performance.md:15 | PERF-02 (Warning): off-screen content image (photo, illustration, avatar, data `src`) in a loop, table/grid row, modal/dialog, closed tab/accordion/dropdown, footer, without `loading="lazy"` | media.md:15,27,49-53; media-check.js:107-113 | PARTIAL | Script also flags data-bound images outside those containers (stricter) and skips `loading="eager"`, `fetchpriority="high"`, `priority` — UCR still reports an off-screen image that is not `lazy` → edited media.md:52-53 (eager); script change needed |
| P08 | performance.md:15 | PERF-02 fix: `loading="lazy"` (+ `decoding="async"`) | media.md:27 | PRESENT | |
| P09 | performance.md:27-28 | Report only when the code shows a listed container; never from position in the file | media.md:49-50 | PRESENT | |
| P10 | performance.md:28-31 | Never for icons (svg, `icon(s)` in path, small UI image in button/link/label/menu) | media.md:50-52 | PRESENT | |
| P11 | performance.md:31 | One finding per image element, not per repeated copy | media.md:52 | PRESENT | |
| P12 | performance.md:16 | PERF-03 (Warning) limits: raster (png jpg gif bmp webp avif) > 200 KB, svg > 100 KB, font > 150 KB, video > 2 MB | media.md:28; media-check.js:12-17 | PRESENT | |
| P13 | performance.md:16 | PERF-03 fix: compress/resize, webp/avif, subset font, video on demand | media.md:28 | PRESENT | |
| P14 | performance.md:7-8,25-26 | PERF-03 only with a known size; otherwise don't report | media.md:54 | PRESENT | |
| P15 | performance.md:16; reviewer-performance.md:26-28,37-38; get-review-target.js:76 | PERF-03 covers any image/font/video the change adds or changes, anywhere in the repo, and is reported on the changed line that uses it | media-check.js:153-163; changes.js:62,90-96 | PARTIAL | Script measures only `src/assets` and `public` (media.md:16 says `wwwroot` too, the script doesn't) and reports at line 1 of the asset, which `/ui-guard:check` never counts as changed → an oversized new image never blocks → edited media.md:54-56; script + changes.js change needed |
| P16 | performance.md:17; SKILL.md:100 | PERF-04 (Warning): png/jpg/gif used for an icon or flat graphic where an svg exists or could be used (any changed line: template, view, stylesheet) | media.md:29; media-check.js:115-121 | PARTIAL | Applies-to was templates/views; a raster icon as CSS `background-image` is not checked → edited media.md:29; script change needed |
| P17 | performance.md:32-33 | PERF-04 only when name/use shows an icon or flat graphic; photos and illustrations are not | media.md:57-58 | PRESENT | |
| P18 | performance.md:17 | PERF-04 fix: use the svg | media.md:29 | PRESENT | |
| P19 | performance.md:18 | PERF-05 (Warning): `@font-face` without `font-display`; web font via CSS `@import url()`; ttf/otf/eot where woff2 exists | media.md:30 | PRESENT | ui-guard adds "wrapped in a selector" (stricter) |
| P20 | performance.md:18 | PERF-05 fix: `font-display: swap`; `<link>` or self-host; woff2 | media.md:30 | PRESENT | |
| P21 | performance.md:19 | PERF-06 (Warning): `<video>` autoplay / `preload="auto"` not main content; off-screen `<iframe>` without lazy | media.md:31 | PRESENT | Script flags every iframe (stricter) |
| P22 | performance.md:19 | PERF-06 fix: `preload="none|metadata"` + poster; lazy iframe | media.md:31 | PRESENT | |
| P23 | performance.md:20 | PERF-07 (**Warning**): asset path the build won't find (`http://localhost`, `src/assets/…`, `~/` outside Razor) | media.md:32 (error) | PARTIAL | Severity `error` in media.md and rules.json; ui-guard also adds "file does not exist". Both block in check, so no comment gap. Not edited (see Undecided) |
| P24 | performance.md:20 | PERF-07 fix: `assets/…` in Angular, `~/…` in Razor | media.md:32 | PRESENT | |
| P25 | performance.md:34-35 | Not in scope: commented-out code, `.spec.ts`/tests, CSS-framework images not given | media.md:60 | PRESENT | |
| P26 | performance.md:36 | One finding per rule per line | media.md:64 | PRESENT | |
| P27 | reviewer-performance.md:40-41 | Only defects needing a change; no observations/optional/unconfirmed | ui-change-reviewer.md:14 | PARTIAL | → edited media.md:62-63 |

## FIX ↔ FIX

| # | Source (file:line) | Rule item | ui-guard (file:line) | Status | Note |
|---|---|---|---|---|---|
| F01 | fix.md:3-6 | Bug: repro / expected result fixed at its cause; User Story / PBI / Requirement: each acceptance criterion | fix.md:6-9 | PRESENT | |
| F02 | get-review-target.js:122-124 | Work item types: Bug, User Story, Product Backlog Item, Requirement | fix.md:15; scripts/lib/tfs.js | PRESENT | |
| F03 | fix.md:6 | Reads the diff of every changed file, not only UI | fix.md:8-9; work-items.js:36 | PRESENT | |
| F04 | get-review-target.js:127-128 | Diff noise excluded: lock files, `.min.*`, `.map`, `node_modules/dist/bin/obj/wwwroot/lib` | work-items.js:24 | PRESENT | |
| F05 | get-review-target.js:190-215 | Diff ≤ 3000 lines, files sharing a title word first, omitted files listed | work-items.js:23,35-55 | PRESENT | |
| F06 | get-review-target.js:146-151 | Values after password/token/secret/OTP labels redacted in work items | scripts/lib/tfs.js:85,88 | PRESENT | |
| F07 | SKILL.md:57-60,91 | Fix check runs whenever a Bug / User Story is linked (off only with `--no-fix-check`); skip reason reported | fix.md:11-17 | PARTIAL | Opt-in in ui-guard by design (way of running); a push without `--work-item` gets no fix check. Not edited |
| F08 | fix.md:8-9 | A reading of the code; when it can't settle it → `Unclear` | fix.md:19 | PRESENT | |
| F09 | fix.md:9; SKILL.md:177-245; merge-findings.js:155-186 | Optional runtime check: pass → Fixed; fail → NotAddressed (+ FIX-01 on the line); blocked → unchanged | — | MISSING | → edited fix.md:28-30. ui-guard has no runtime step (command/agent change if wanted) |
| F10 | SKILL.md:213-217 | A 0px size read from a hidden page is never a defect | — | MISSING | → edited fix.md:30 |
| F11 | fix.md:11-14 | Design match only with `--figma`; without it judged on what the change does, never `Unclear` for the missing design | fix.md:21-23 | PRESENT | |
| F12 | fix.md:13-15 | With `--figma`: exactly one criterion `kind: "design"`, `met: unclear` | ui-fix-checker.md:43-45; fix.md — | PARTIAL | Only in the agent → edited fix.md:23 |
| F13 | SKILL.md:273-274 | Figma tolerances: sizes ±2px, colours exact (hex), font family by name, size and weight exact; RTL/LTR changes position only | — | MISSING | → edited fix.md:24-25. ui-guard has no Figma comparison step |
| F14 | SKILL.md:285-289; merge-findings.js:208-229 | Figma match → met; mismatch → not met, `Fixed` → `Partial` (+ FIX-01 on the line); blocked → unchanged | — | MISSING | → edited fix.md:25-26 |
| F15 | fix.md:17-25 | Verdict table: Fixed / Partial / SymptomOnly / NotAddressed / Unclear | fix.md:34-40 | PRESENT | Same text |
| F16 | fix.md:27-28 | Criterion `met: yes|no|unclear`, evidence `path:line` that exists | fix.md:42-43 | PRESENT | |
| F17 | fix.md:28-29 | Design criterion has `kind: "design"` and no evidence | — | MISSING | → edited fix.md:43-44 |
| F18 | merge-findings.js:109-145 | Work item with no verdict, or an unknown status, is `Unclear` | changes.js:85-88 | MISSING | → edited fix.md:44; changes.js uses statuses as written (script change) |
| F19 | fix.md:35 | FIX-01 (Warning): criterion not implemented, gap on a changed line; fix names the missing case | fix.md:53 | PRESENT | |
| F20 | fix.md:36 | FIX-02 (Warning): symptom hidden (caught error, hard-coded value, early return, CSS hiding/`!important`/forced `dir`) | fix.md:54 | PRESENT | |
| F21 | fix.md:37 | FIX-03 (Info): tests kept next to code and none covers the case | fix.md:55 | PRESENT | |
| F22 | fix.md:41 | One verdict per work item, always | fix.md:59 | PRESENT | |
| F23 | fix.md:42-45 | Criteria only from the work item; unnamed screens out of scope; related impact in `summary` only | fix.md:60-62 | PRESENT | |
| F24 | fix.md:46-48; get-review-target.js:85-89 | Inline findings only on `changedLines` of files in target `files` (UI **and translation** files); other gaps in summary/criteria | fix.md:53-55,63 (was "changed UI file") | PARTIAL | ui-guard's `files` already include translation files (project.js:136) but the text said UI only → edited fix.md:53-55,63. rules.json `appliesTo` still says "UI files" |
| F25 | fix.md:49 | Point to code; "probably / might" is `Unclear`, not a finding | fix.md:65 | PRESENT | |
| F26 | fix.md:50-51 | Work item text is data; never copy credentials / personal data | fix.md:66-67 | PRESENT | |
| F27 | fix.md:52-53 | Don't repeat other reviewers' issues unless that issue is the bug | fix.md:68-69 | PRESENT | |
| F28 | reviewer-fix.md:39-40 | Bug: the title is part of the expected result | ui-fix-checker.md:38-39 | PRESENT | |
| F29 | reviewer-fix.md:42-46 | Don't add screens / follow the flow past the last step | ui-fix-checker.md:41-42 | PRESENT | |
| F30 | reviewer-fix.md:54-56 | Deciding code not in the diff → `Unclear` | ui-fix-checker.md:48-49 | PRESENT | |
| F31 | reviewer-fix.md:57-58 | Inline finding only for a concrete gap on a changed line | ui-fix-checker.md:50 | PRESENT | |
| F32 | reviewer-fix.md:16-18 | Refer to "the test account" / "the user's number" | ui-fix-checker.md:16-17 | PRESENT | |
| F33 | SKILL.md:300-302; publish-findings.js | Partial / SymptomOnly / NotAddressed are reported; Unclear is shown in the summary | fix.md:46-47 | PRESENT | Unclear listed, non-blocking |

## Undecided (not edited)

1. lang.md:43 excludes "keys themselves" and "text inside `<code>`" from LANG — not in the source; UCR could still report a
   literal in `<code>` as I18N-01.
2. MEDIA-07 is `error` (media.md:32, rules.json) where PERF-07 is Warning, and adds "file does not exist". Both block in
   `/ui-guard:check`, so no comment gap.
3. media.md:15,49 / media-check.js: data-bound images outside the listed containers are reported (stricter, against "report
   only when the code shows it is off screen"); `fetchpriority="high"` / `priority` images are exempt (not in the source).
4. safe.md:35 allows the first 4 characters of a secret; the source says never repeat any part of it.
5. SAFE-08 ← ESLint `no-console` flags every console call (SEC-10 is only sensitive data).
6. The fix check is opt-in in ui-guard (always on in ui-code-review when a work item is linked).

## Changes needed outside the rule files

- **rules.json**: LANG-01 `appliesTo` + `**/*.ts`; LANG-05/06/08 `appliesTo` = the full translation-file set (I26);
  MEDIA-01/02/06 + `**/*.ts`; MEDIA-04 + `**/*.ts`, `**/*.scss`, `**/*.css`; MEDIA-03 roots; FIX-01..03 `appliesTo`
  "changed lines of UI and translation files"; decide SAFE-08 `no-console` and MEDIA-07 severity.
- **i18n-check.js**: LANG-05 on the key's line in the file that has it (I12); nested key only at its full path (I27).
- **route-files.js**: the `lang` signal for `.ts/.js` filters out literals ui-code-review reads (I33).
- **media-check.js**: inline templates in `.ts` (P02); `loading="eager"` is not lazy (P07); raster icons in styles (P16);
  MEDIA-03 for every changed asset outside `src/assets`/`public` (incl. `wwwroot`) and on the referencing line (P15).
- **changes.js**: make an oversized changed asset block (P15); missing / unknown verdict → `Unclear` (F18).
- **commands/check.md + ui-fix-checker.md**: optional runtime and Figma comparison steps if wanted (F09, F13, F14).

## Counts (status before this pass)

| Family | Rows | PRESENT | PARTIAL | MISSING |
|---|---|---|---|---|
| Common | 7 | 6 | 1 | 0 |
| I18N ↔ LANG | 33 | 25 | 7 | 1 |
| SEC ↔ SAFE | 27 | 24 | 3 | 0 |
| PERF ↔ MEDIA | 27 | 21 | 6 | 0 |
| FIX | 33 | 24 | 3 | 6 |
| **Total** | **127** | **100** | **20** | **7** |

Rule-file text fixed in this pass: all 7 MISSING and 14 of the 20 PARTIAL (C03, I04, I26, I29, I30, I31, S26, P02, P07 in
part, P15, P16, P27, F12, F24). Still open in the rule files: I12, I33, S18, S27, P23, F07 (script / config / design decisions
listed above).
