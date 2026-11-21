# AXIS rule parity: ui-code-review → ui-guard (STYLE)

Source: `D:\plugin\ui-code-review` (read-only). Paths in the Source column are relative to it; `G/` =
`skills/axis-scss/docs/guides/`, `S/` = `skills/axis-scss/docs/segments/`. The ui-guard column cites `rules/style.md` (line
numbers **after** the parity edit), `rules/access.md`, or the lint config. **Status is the state before the parity edit**;
the Note says what was changed in `rules/style.md` ("Fixed: …") or why it was left open.

Severity check: AXIS Critical → error, High → warning, Medium → info (`rules/axis.md:20`).

Not inventoried (state no rule): history and explanations (`G/architecture.md`, `G/glossary.md` definitions, `G/environments.md`
`~/` paths, `G/onboarding.md` reading path), worked examples (`G/walkthrough.md` code, the segment "Usage Examples"), the
"Object or utility" test (`S/objects.md:103` calls itself "a recommended test, not a settled rule"), and the instruction to read
the AXIS docs in their repository rather than copy them (`docs/README.md:39`, `G/onboarding.md:30`) — not a code rule.
`SKILL.md:27-47` restates rules from `rules.md`; those are counted once, under their R-ID.

| # | Source (file:line) | Rule item (short, faithful) | ui-guard (file:line / lint rule) | Status | Note |
|---|---|---|---|---|---|
| **Review scope** ||||||
| 1 | rules/axis.md:17-18; agents/reviewer-axis.md:36-37 | Class-name rules (R-01, R-02, R-03, R-04, R-27) apply to `.html`, `.cshtml`, `.ts`, `.js`; stylesheet rules to `.scss`/`.css` | style.md:120-123 (STYLE-01..04 "Applies to") | PARTIAL | STYLE-01/02/03 lacked `*.js`, `*.cshtml`; STYLE-04 covered stylesheets only. Fixed: Applies to extended; STYLE-04 also checks class names in markup/code. |
| 2 | rules/axis.md:18; reviewer-axis.md:38 | Skip `packages/` and minified or compiled CSS | style.md:222 ("Is not a defect"); stylelint.config.mjs:61 `ignoreFiles` | PRESENT | |
| 3 | rules/axis.md:20; reviewer-axis.md:47 | Severity: Critical → error, High → warning, Medium → info | style.md:6-7 | PRESENT | |
| 4 | reviewer-axis.md:31-33 | Work out the file's segment from its path before applying a segment exception | style.md:100-101 (folder → role map); stylelint.config.mjs:27-56 overrides | PRESENT | |
| **rules.md — Naming and Structure** ||||||
| 5 | G/rules.md:21 | R-01 (Critical): every authored class has a segment prefix or `is-`/`has-`/`js-`; variant prefix is the project's; vendor/global classes keep their names; vendor overrides on an `m-` class; vendor-generated / global non-vendor classes in `common/_classes.common.scss` | style.md:120 (STYLE-01, error); style.md:43-44; lint `selector-class-pattern` | PRESENT | ui-guard's chosen variant prefix = the block's own. Applies-to gap: row 1. |
| 6 | G/rules.md:22 | R-02 (Critical): a state `js-*` is styled like any state; a lookup-only `js-*` carries no styles | style.md:121 (STYLE-02, error, ai) | PRESENT | |
| 7 | G/rules.md:23 | R-03 (Critical): JS adds, removes and **queries** `js-*` only — never `c- m- ctrl- l- p- u- is- has-` | style.md:122 (STYLE-03, error, ai) | PARTIAL | Queries were not named ("code only touches"), `.js`/`.cshtml` not in scope. Fixed: STYLE-03 names queries (`querySelector`, `closest`, `classList.contains`, jQuery) and the full prefix list. |
| 8 | G/rules.md:24 | R-04 (High): BEM block/element for objects, components, modules, layouts, pages; no `--` modifier | style.md:123 (STYLE-04, warning); lint `ui-guard/bem` | PARTIAL | Stylesheets only; class names written in templates/code not covered. Fixed (scope). STYLE-47 (error) also cites R-04 but is ui-guard's own stricter `&__` rule — see report. |
| 9 | G/rules.md:25 | R-05 (Critical): max nesting 4, root = 1, only `@media` not counted | style.md:124 (STYLE-05); lint `ui-guard/nesting-depth` | PRESENT | |
| 10 | G/rules.md:26 | R-06 (Critical): class selectors only outside Generic/Elements; exceptions `body` in custom.theme, `:root` in token files, R-26 attributes | style.md:125 (STYLE-06), 153 (STYLE-31); lint `selector-max-type`, `selector-max-universal`, `selector-pseudo-class-disallowed-list` | PRESENT | |
| 11 | G/rules.md:27 | R-07 (Critical): tokens named by role or family+step, never by appearance | style.md:128 (STYLE-09) | PRESENT | |
| **rules.md — Units and Values** ||||||
| 12 | G/rules.md:32 | R-08 (Critical): absolute lengths in `rem`; `%`, viewport units, `fr`, `ch`, unitless where they express a ratio/viewport; `em` only relative to the element's own font size; `ms/s`; raw px only `1px` and px breakpoints in the breakpoints file; use `px()` where shipped; breakpoints in rem with px comment; range syntax preferred, min/max-width allowed | style.md:130 (STYLE-10), 135 (STYLE-15); lint `ui-guard/px-only-1px`, `ui-guard/mq-only` | PARTIAL | `em` qualifier, ratio/viewport qualifier, rem-with-px-comment breakpoints and range-syntax preference were missing. Fixed in STYLE-10. |
| 13 | G/rules.md:33 | R-09 (Critical): logical properties only | style.md:131 (STYLE-11); lint `ui-guard/logical-properties` | PARTIAL | Text was a closed list (scroll-margin/padding only in lint; `overscroll-behavior-x/-y`, `contain-intrinsic-width/-height` nowhere). Fixed text: "every physical property or keyword that has a logical equivalent" + those names. Lint map still lacks overscroll/contain-intrinsic. `overflow-x/-y` and `resize` values left open (report). |
| 14 | G/rules.md:34 | R-10 (Critical): colours from custom properties outside the two token files; `transparent`, `currentColor` allowed | style.md:132 (STYLE-12); lint `color-no-hex`, `color-named`, `function-disallowed-list` | PRESENT | |
| 15 | G/rules.md:35 | R-11 (Critical): every shade in HSL, neutrals included | style.md:133 (STYLE-13) | PRESENT | |
| 16 | G/rules.md:36 | R-12 (Critical): max 4 decimals | style.md:134 (STYLE-14); lint `number-max-precision` | PRESENT | |
| **rules.md — Architecture** ||||||
| 17 | G/rules.md:41 | R-13 (Critical): Settings/Tools output no CSS | style.md:137 (STYLE-16); lint `ui-guard/no-output` | PRESENT | |
| 18 | G/rules.md:42 | R-14 (Critical): Components self-contained, `c-` | style.md:120, 138 (STYLE-01, STYLE-17) | PRESENT | |
| 19 | G/rules.md:43 | R-15 (Critical): Modules composite, `m-`; library module `m-`; control module `ctrl-` | style.md:120, 140 (STYLE-01, STYLE-19) | PRESENT | |
| 20 | G/rules.md:44 | R-16 (Critical): Layout = what surrounds page content, `l-` | style.md:139 (STYLE-18) | PRESENT | |
| 21 | G/rules.md:45 | R-17 (Critical): Pages minimal, `p-` | style.md:120, 139 (STYLE-01, STYLE-18) | PRESENT | "Only unique styles": row 145. |
| 22 | G/rules.md:46 | R-18 (Critical): Utilities single-purpose, `u-` | style.md:146 (STYLE-25) | PRESENT | |
| 23 | G/rules.md:47 | R-19 (Critical): `:root` only in the two colour token files (at-rule wrap allowed); fonts file `@font-face` + `:root` only | style.md:155 (STYLE-32); lint `ui-guard/token-file-root-only` | PRESENT | |
| **rules.md — Code Quality** ||||||
| 24 | G/rules.md:52 | R-20 (Critical): no `!important` except the one Generic reduced-motion block | style.md:142 (STYLE-21); lint `declaration-no-important`, `ui-guard/no-important` | PRESENT | |
| 25 | G/rules.md:53 | R-21 (Critical): no `@extend` except of a `%placeholder` | style.md:143 (STYLE-22); lint `scss/at-extend-no-missing-placeholder` | PRESENT | |
| 26 | G/rules.md:54 | R-22 (Critical): no duplicate selectors or properties | style.md:144 (STYLE-23); lint `no-duplicate-selectors`, `declaration-block-no-duplicate-properties` | PRESENT | Repeated `:root` in the palette is mandated by theme.md:64. |
| 27 | G/rules.md:55 | R-23 (Critical): no empty blocks or empty comments | style.md:145 (STYLE-24); lint `block-no-empty`, `comment-no-empty` | PRESENT | |
| 28 | G/rules.md:56 | R-24 (Critical): a utility sets exactly one property; named exceptions `u-container`, `u-sr-only`, `u-not-sr-only` | style.md:146 (STYLE-25); lint `ui-guard/utility-one-property` | PRESENT | |
| 29 | G/rules.md:57 | R-25 (Critical): no ID selectors anywhere | style.md:126 (STYLE-07); lint `selector-max-id` | PRESENT | |
| 30 | G/rules.md:58 | R-26 (Critical): attribute selectors only in Generic, Elements, `_attributes.common.scss` (vendor markup), and `[aria-*]` / `:is([dir="rtl"])` on a project class | style.md:127 (STYLE-08); lint `ui-guard/attribute-selector` | PRESENT | |
| **rules.md — State Management** ||||||
| 31 | G/rules.md:61-65 | `is-*`/`has-*` fixed at first load, never changed by script; `js-*` anything JS changes or queries | style.md:41, 122 (STYLE-03) | PRESENT | |
| 32 | G/rules.md:69 | R-27 (Critical): markup-set and never changed → `is-`/`has-`; changed by JS → `js-` | style.md:122 (STYLE-03) | PRESENT | |
| 33 | G/rules.md:73-85 | Sorting table; a state rendered at first load **and** later changed by a script is `js-*` | style.md:122 (STYLE-03) | PARTIAL | The "both → `js-`" case was not stated. Fixed in STYLE-03. |
| 34 | G/rules.md:87 | Variants are not state; prefix chosen by the project; no variant named by the standard | style.md:43-44 | PRESENT | |
| **rules.md — Imports, Isolation and Theme** ||||||
| 35 | G/rules.md:92 | R-28 (Critical): 5+ pages or any layout → `common/` aggregator; 1–4 pages, no layout → each page entry; layout entry never `@use`s o/c/m; only a module `@use`s a component; o/c `@use` none | style.md:150 (STYLE-28), 152 (STYLE-30) | PRESENT | |
| 36 | G/rules.md:93 | R-29 (Critical): a file reached through `common/` is not also `@use`d by a page or layout entry | style.md:151 (STYLE-29) | PRESENT | |
| 37 | G/rules.md:94 | R-30 (High): vendor override on an `m-` class beside the vendor class, vendor parts nested; owned `m-` wrapper only when the element cannot take a class or the vendor selector out-specifies; vendor JS-generated markup in `_classes.common.scss`; no bare top-level vendor selector | style.md:179 (STYLE-54, warning); lint `ui-guard/module-classes` | PARTIAL | The wrapper exception was missing (ui-guard was narrower and would report a legal wrapper); "vendor state repeated on the `m-` class" (S/modules.md:94) missing. Fixed in STYLE-54. |
| 38 | G/rules.md:95 | R-31 (Critical): control module isolated in its own file and `ctrl-` block; widget CSS converted into SCSS there, not `packages/`; popup on `.ctrl-<name>-popup` in the same file; no other file styles a `ctrl-` block | style.md:140 (STYLE-19), 23 | PARTIAL | Widget-CSS conversion and "never in packages/" missing; "a vendor override never nests in a control module" (S/modules.md:142, G/recipes.md:86) missing. Fixed in STYLE-19. |
| 39 | G/rules.md:96 | R-32 (Critical): `@charset "UTF-8";` first line of every SCSS/CSS file except `packages/` | style.md:147 (STYLE-26); lint `ui-guard/charset-first` | PRESENT | |
| 40 | G/rules.md:97 | R-33 (Critical): `packages/` never compiled, `@use`d/`@import`ed or modified; renamed `<library><major>.<locale>.min.css` in `packages/<library><version>/` | style.md:148 (STYLE-27), 25 | PRESENT | |
| 41 | G/rules.md:98 | R-34 (Critical): `custom.theme.css` — any class selector, `body` the only element | style.md:156 (STYLE-33); lint `ui-guard/custom-theme`, `selector-max-type` override | PRESENT | |
| 42 | G/rules.md:99 | R-35 (Critical): `custom.theme.css` defines no custom property | style.md:156 (STYLE-33) | PRESENT | |
| 43 | G/rules.md:100 | R-36 (High): every vendor override in its own `_<vendor-component>.<library>.module.scss` (`<library>` lowercase, no version); plain module holds no vendor selector; an own module's context style targets the library module's `m-` class; `m-` class declared once | style.md:179 (STYLE-54, warning) | PARTIAL | `<library>` lowercase/no version and "own module targets the `m-` class, never the vendor class" were missing. Fixed in STYLE-54. |
| **review-checklist.md — Before you open the pull request** ||||||
| 44 | G/review-checklist.md:19 | Q1 every added class has its segment prefix | style.md:120 (STYLE-01) | PRESENT | |
| 45 | G/review-checklist.md:20 | Q2 `js-*` state styled; lookup-only `js-*` unstyled | style.md:121 (STYLE-02) | PRESENT | |
| 46 | G/review-checklist.md:21 | Q3 JS adds/removes/queries only `js-*` | style.md:122 (STYLE-03) | PARTIAL | Same gap as row 7. Fixed. |
| 47 | G/review-checklist.md:22 | Q4 BEM, no `--` | style.md:123 (STYLE-04) | PARTIAL | Same gap as row 8. Fixed. |
| 48 | G/review-checklist.md:23 | Q5 `is-`/`has-` when markup sets it, `js-` when a script changes it | style.md:122 (STYLE-03) | PRESENT | |
| 49 | G/review-checklist.md:24 | Q6 nesting ≤ 4 | style.md:124 (STYLE-05) | PRESENT | |
| 50 | G/review-checklist.md:25 | Q7 class selectors outside Generic/Elements (+ exceptions) | style.md:125 (STYLE-06) | PRESENT | |
| 51 | G/review-checklist.md:26 | Q8 custom properties named by role or family+step | style.md:128 (STYLE-09) | PRESENT | |
| 52 | G/review-checklist.md:27 | Q9 rem; other units only where R-08 allows | style.md:130 (STYLE-10) | PARTIAL | Same gap as row 12. Fixed. |
| 53 | G/review-checklist.md:28 | Q10 logical properties only | style.md:131 (STYLE-11) | PARTIAL | Same gap as row 13. Fixed (text). |
| 54 | G/review-checklist.md:29 | Q11 colours from custom properties | style.md:132 (STYLE-12) | PRESENT | |
| 55 | G/review-checklist.md:30 | Q12 shades in HSL | style.md:133 (STYLE-13) | PRESENT | |
| 56 | G/review-checklist.md:31 | Q13 ≤ 4 decimals | style.md:134 (STYLE-14) | PRESENT | |
| 57 | G/review-checklist.md:32 | Q14 no `!important` except Generic reduced-motion | style.md:142 (STYLE-21) | PRESENT | |
| 58 | G/review-checklist.md:33 | Q15 no `@extend` on an arbitrary selector | style.md:143 (STYLE-22) | PRESENT | |
| 59 | G/review-checklist.md:34 | Q16 no duplicate selectors / properties | style.md:144 (STYLE-23) | PRESENT | |
| 60 | G/review-checklist.md:35 | Q17 no empty blocks / comments | style.md:145 (STYLE-24) | PRESENT | |
| 61 | G/review-checklist.md:36 | Q18 no ID selectors | style.md:126 (STYLE-07) | PRESENT | |
| 62 | G/review-checklist.md:37 | Q19 attribute selectors only where R-26 permits | style.md:127 (STYLE-08) | PRESENT | |
| 63 | G/review-checklist.md:38 | Q20 `@charset` first line | style.md:147 (STYLE-26) | PRESENT | |
| 64 | G/review-checklist.md:39 | Q21 new file in the segment the Decision Guide gives | style.md:138 (STYLE-17) | PRESENT | |
| 65 | G/review-checklist.md:40 | Q22 colour token files: `:root` only | style.md:155 (STYLE-32) | PRESENT | |
| 66 | G/review-checklist.md:41 | Q23 placement rule; component `@use`d only by a module | style.md:150-152 (STYLE-28/29/30) | PRESENT | |
| 67 | G/review-checklist.md:42 | Q24 vendor override on `m-` beside vendor class, wrapper only in the two cases, JS-generated markup in `_classes.common.scss` | style.md:179 (STYLE-54) | PARTIAL | Same gap as row 37. Fixed. |
| 68 | G/review-checklist.md:43 | Q25 vendor override in its own library module; none in a plain module | style.md:179 (STYLE-54) | PRESENT | |
| 69 | G/review-checklist.md:44 | Q26 control module styles only in its own file and `ctrl-` block | style.md:140 (STYLE-19) | PRESENT | |
| 70 | G/review-checklist.md:45 | Q27 `packages/` content untouched, never `@use`d/`@import`ed | style.md:148 (STYLE-27) | PRESENT | |
| 71 | G/review-checklist.md:46 | Q28 a new entry file is in the build | style.md:34-36, 173 (STYLE-48) | PRESENT | Angular: the build entry list is `angular.json` `styles`; layouts/pages are component styles. |
| 72 | G/review-checklist.md:47 | Q29 new file kebab-case, segment suffix, leading `_` if partial | style.md:138 (STYLE-17) | PRESENT | |
| **review-checklist.md — What the reviewer checks** ||||||
| 73 | G/review-checklist.md:55 | RC1 `custom.theme.css`: classes and `body` only, no custom property | style.md:156 (STYLE-33) | PRESENT | |
| 74 | G/review-checklist.md:56 | RC2 compiled CSS committed and matching a fresh compile (G/build.md:127-147) | style.md:110-113 (Angular adaptation) | MISSING | Build-route requirement with no Angular counterpart (the CLI compiles at build time). Fixed: Angular adaptation now states how the AXIS build-route items map. |
| 75 | G/review-checklist.md:57 | RC3 at a release, bundle sizes measured and recorded against the budget | style.md:171 (STYLE-46) | PARTIAL | "Measured and recorded at release" was not stated. Fixed in STYLE-46. |
| 76 | G/review-checklist.md:58 | RC4 utility sets one property (named exceptions) and is a specific override, not a primary way of styling | style.md:146 (STYLE-25), 183 (STYLE-58) | PARTIAL | "Not a primary way of styling" (R-UTIL-4, High) was inside error-level STYLE-25. Fixed: moved to new STYLE-58 (warning). |
| 77 | G/review-checklist.md:59 | RC5 change meets Accessibility; R-LAY-2 | style.md:165-170 (STYLE-40..45), 139 (STYLE-18), 234-236; access.md:45-58 | PARTIAL | R-LAY-2 cited by STYLE-18 but its text said nothing about semantic HTML; markup rules mapping unstated. Fixed (STYLE-18 + mapping bullet). |
| **review-checklist.md — Segment rules** ||||||
| 78 | G/review-checklist.md:69 | SR1 Settings/Tools generate no CSS | style.md:137 (STYLE-16) | PRESENT | |
| 79 | G/review-checklist.md:70 | SR2 configuration in Settings; colour values in Theme, referenced from Settings maps | style.md:157 (STYLE-34), 184 (STYLE-59) | PARTIAL | Only the colour half existed. Fixed: new STYLE-59. |
| 80 | G/review-checklist.md:71 | SR3 tools take values as parameters, no hard-coded component/page/client value | style.md:177 (STYLE-52) | PRESENT | |
| 81 | G/review-checklist.md:72 | SR4 every tool parameter checked, `@error` on invalid | style.md:176 (STYLE-51) | PRESENT | |
| 82 | G/review-checklist.md:73 | SR5 tool documented (signature, params+defaults, output, example) in one place | style.md:162 (STYLE-38) | PRESENT | |
| 83 | G/review-checklist.md:74 | SR6 Elements selectors target elements, never class/ID | style.md:174 (STYLE-49) | PRESENT | |
| 84 | G/review-checklist.md:75 | SR7 Elements: base body background only; per-theme in custom.theme; never both | style.md:175 (STYLE-50) | PRESENT | |
| 85 | G/review-checklist.md:76 | SR8 object = pattern, no meaning | style.md:141 (STYLE-20) | PRESENT | |
| 86 | G/review-checklist.md:77 | SR9 object fixed: no parameters, no consumer overrides | style.md:141 (STYLE-20) | PRESENT | Allowance for variants/states: row 175. |
| 87 | G/review-checklist.md:78 | SR10 no utility reclassified as an object | style.md:141 (STYLE-20) | PRESENT | |
| 88 | G/review-checklist.md:79 | SR11 o/c/m files never move; only the `@use` route changes | style.md:150 (STYLE-28) | PRESENT | |
| 89 | G/review-checklist.md:80 | SR12 a component styles only its own `c-` block | style.md:138 (STYLE-17) | PRESENT | |
| 90 | G/review-checklist.md:81 | SR13 no horizontal overflow from 320px at every breakpoint | style.md:170 (STYLE-45) | PRESENT | |
| 91 | G/review-checklist.md:82 | SR14 page holds only its unique styles; page entry never `@use`d | style.md:139 (STYLE-18) | PARTIAL | "Only styles unique to this page" missing. Fixed in STYLE-18. |
| 92 | G/review-checklist.md:83 | SR15 page holds its own content; chrome in Layout | style.md:139 (STYLE-18) | PRESENT | |
| 93 | G/review-checklist.md:84 | SR16 module = 2+ components together, library or control module, nothing else | style.md:140 (STYLE-19) | PRESENT | |
| 94 | G/review-checklist.md:85 | SR17 scale/numeric utilities `u-{property}-{value}`, others a clear expected name | style.md:146 (STYLE-25) | PARTIAL | ui-guard required `u-{property}-{value}` for every utility (narrower). Fixed. |
| 95 | G/review-checklist.md:86 | SR18 no breakpoint in a utility name; viewport-dependent value reads a scaling token | style.md:146 (STYLE-25) | PARTIAL | Scaling-token half missing. Fixed. |
| 96 | G/review-checklist.md:87 | SR19 vendor stylesheet before the project's own | style.md:148 (STYLE-27), 159 (STYLE-36) | PRESENT | |
| 97 | G/review-checklist.md:88 | SR20 every theme value uses a custom property | style.md:132, 155, 157 (STYLE-12/32/34) | PRESENT | |
| 98 | G/review-checklist.md:89 | SR21 Theme files plain hand-authored CSS, not compiled, minified or renamed | style.md:181 (STYLE-56) | PARTIAL | "Not minified, not renamed" missing. Fixed in STYLE-56. |
| 99 | G/review-checklist.md:90 | SR22 only the palette defines a shade | style.md:157 (STYLE-34) | PRESENT | |
| 100 | G/review-checklist.md:91 | SR23 viewport-dependent token = `clamp()` in Theme, never re-declared by a class | style.md:157 (STYLE-34) | PRESENT | |
| **accessibility.md — Stylesheet rules** ||||||
| 101 | G/accessibility.md:18 | A11Y-CSS-1 (High): no outline removal without a `:focus-visible` replacement in the same rule; base `:focus-visible` in Elements | style.md:165 (STYLE-40, warning), 18; lint `ui-guard/focus-visible` | PRESENT | |
| 102 | G/accessibility.md:19 | A11Y-CSS-2 (High): `:hover` inside `@media (hover: hover)` with matching `:focus-visible` | style.md:166 (STYLE-41, warning); lint `ui-guard/hover-media` | PRESENT | |
| 103 | G/accessibility.md:20 | A11Y-CSS-3 (High): one reduced-motion block in Generic for the whole page; no later rule reintroduces motion | style.md:167 (STYLE-42, warning) | PARTIAL | "No later rule reintroduces motion" missing. Fixed (checker now script + ai). |
| 104 | G/accessibility.md:21 | A11Y-CSS-4 (High): text/background token pairs AA in each client theme (4.5:1, 3:1 large text and control borders) | style.md:169 (STYLE-44, warning) | PRESENT | |
| 105 | G/accessibility.md:22 | A11Y-CSS-5 (High): `u-sr-only` **and `u-not-sr-only`** each declared once in `utilities/accessibility/`, never re-implemented | style.md:167 (STYLE-42) | PARTIAL | `u-not-sr-only` missing. Fixed. |
| 106 | G/accessibility.md:23 | A11Y-CSS-6 (Medium): targets ≥ 24×24 px (`1.5rem`/`px(24)`), `min-inline-size` + `min-block-size` or `padding-block` | style.md:168 (STYLE-43, info) | PRESENT | |
| **accessibility.md — Markup rules (checked in the views)** ||||||
| 107 | G/accessibility.md:35 | 7 Semantic HTML (Medium) | access.md:46 (ACCESS-04, warning); style.md:139 (STYLE-18 for the layout shell) | PARTIAL | Mapping unstated; ACCESS severity is warning, AXIS Medium → info. Fixed: mapping bullet style.md:234-236. Severity left (access.md out of scope). |
| 108 | G/accessibility.md:36 | 8 Heading hierarchy (Medium) | access.md:46, 52 (ACCESS-04/10, warning) | PARTIAL | As row 107. |
| 109 | G/accessibility.md:37 | 9 Logical tab order; `tabindex` only `0`/`-1` (Medium) | access.md:47, 58 (ACCESS-05/16, warning) | PARTIAL | As row 107. |
| 110 | G/accessibility.md:38 | 10 ARIA only where no native element does it (Medium) | access.md:45, 55 (ACCESS-03/13, warning) | PARTIAL | As row 107. |
| 111 | G/accessibility.md:39 | 11 Keyboard operability, no trap (Medium) | access.md:47, 58 (ACCESS-05/16, warning) | PARTIAL | As row 107. |
| 112 | G/accessibility.md:40 | 12 Focus management on show/hide/route change (Medium) | access.md:47 (ACCESS-05, warning) | PARTIAL | As row 107. |
| **naming-conventions.md** ||||||
| 113 | G/naming-conventions.md:17-18 | kebab-case file names with the segment suffix | style.md:11, 138 (STYLE-17) | PRESENT | |
| 114 | G/naming-conventions.md:27-46 | suffix per segment (layout scope, `.<library>.module`, `.control.module`, packages, `.theme.css`) | style.md:15-27 | PRESENT | |
| 115 | G/naming-conventions.md:46 | entry files have no `_` and are the only files in the build; everything else is a `_` partial | style.md:34-36, 138 (STYLE-17), 110-113 | PRESENT | |
| 116 | G/naming-conventions.md:49-59 | class prefix per category | style.md:120 (STYLE-01) | PRESENT | |
| 117 | G/naming-conventions.md:88 | BEM blocks and elements only, one element level | style.md:123 (STYLE-04) | PRESENT | |
| 118 | G/naming-conventions.md:89 | `--modifier` never used anywhere | style.md:123 (STYLE-04), 44 | PRESENT | |
| 119 | G/naming-conventions.md:90 | `is-*`/`has-*` chained onto a block or element | style.md:229 | PRESENT | |
| 120 | G/naming-conventions.md:91-92 | `js-*` for anything JS changes, including a class it only queries; who sets it decides | style.md:122 (STYLE-03) | PARTIAL | Queries: row 7. Fixed. |
| **best-practices.md** ||||||
| 121 | G/best-practices.md:22-29 | `@use "<path-to-root>/tools" as *;` at the top, depth-relative path | style.md:64-66, 102 | PRESENT | |
| 122 | G/best-practices.md:31 | a tool with parameters validates them and throws `@error` | style.md:176 (STYLE-51) | PRESENT | |
| 123 | G/best-practices.md:31 | all maps, lists and variables live in `settings` | style.md:184 (STYLE-59) | MISSING | Only Foundation B moved `$variables`; no rule. Fixed: new STYLE-59. |
| 124 | G/best-practices.md:33 | a settings file is `@use`d directly (no settings `_index.scss`) | style.md:15 | PRESENT | |
| 125 | G/best-practices.md:37, 41-69 | page entry `@use` order: tools → objects → components → modules (control, library, own) → `p-` rules; a page entry never imports a layout | style.md:152 (STYLE-30) | MISSING | Fixed in STYLE-30 (checker now stylelint (custom) + ai). |
| 126 | G/best-practices.md:78-84 | `_index.scss`: always a partial, only `@charset` + `@use`/`@forward` (Tools `@forward`), never beside an entry, Elements holds rules, none in o/c/m | style.md:29-32, 22 | PRESENT | |
| 127 | G/best-practices.md:90 | media queries as plain `@media`, or the project's own mixin where shipped | style.md:135 (STYLE-15) | PRESENT | ui-guard ships `mq()`, so it is required. |
| **decision-guide.md** ||||||
| 128 | G/decision-guide.md:23-25 | component vs module test (stands alone vs exists because of composition / library / control) | style.md:140 (STYLE-19), 21-23 | PRESENT | |
| 129 | G/decision-guide.md:35 | every Layout rule on an `l-` class; anything inside a region is `c-`/`m-` | style.md:120 (STYLE-01 layout prefix), 139 | PRESENT | |
| 130 | G/decision-guide.md:45; S/layout.md:147 | a new layout only when what surrounds the content differs | style.md:139 (STYLE-18) | MISSING | Fixed in STYLE-18. |
| 131 | G/decision-guide.md:55 | object: a second shape is a second object; it may carry variants and `is-`/`has-` states | style.md:141 (STYLE-20) | PARTIAL | Allowance missing (ui-guard could flag a legal variant). Fixed. |
| 132 | G/decision-guide.md:73 | utility: ordinary single-class selector, never raise its specificity | style.md:146 → 183 (STYLE-58) | PARTIAL | Was inside error-level STYLE-25; R-UTIL-3 is High. Fixed: STYLE-58 (warning). |
| 133 | G/decision-guide.md:83-85 | never both page-local and common; a line left behind is review-blocking | style.md:150-151 (STYLE-28/29) | PRESENT | |
| 134 | G/decision-guide.md:93; S/generic.md:79; S/modules.md:144; S/packages.md:69 | reset/element-level vendor corrections go in Generic with element selectors only, never vendor classes; component-level in the library module | style.md:179 (STYLE-54) | MISSING | Fixed in STYLE-54. |
| 135 | G/decision-guide.md:95 | a control module is never overridden from outside and is not a vendor-override route | style.md:140 (STYLE-19) | PARTIAL | Fixed (row 38). |
| 136 | G/decision-guide.md:105 | base background in Elements, per-theme in custom.theme, never both | style.md:175 (STYLE-50) | PRESENT | |
| **performance.md** ||||||
| 137 | G/performance.md:29-32 | sizes measured gzip; raw and brotli not the basis | style.md:171 (STYLE-46) | PRESENT | Now explicit. |
| 138 | G/performance.md:46, 58 | per-page ceiling 60 KB = common + 4 theme files + one layout + one page + utils | style.md:171 (STYLE-46) | PARTIAL | ui-guard applied 60 KB to Angular's `styles.css` (which also holds vendor and legacy CSS) — a different total. Fixed to the AXIS sum. |
| 139 | G/performance.md:48-54 | common 20, theme 3, layout 8 each, page 12 each, utils 8 KB | style.md:171 (STYLE-46) | PRESENT | |
| 140 | G/performance.md:60-64 | vendor CSS measured once per locale build and recorded, not budgeted | style.md:171 (STYLE-46) | PARTIAL | "Once per locale, recorded" missing. Fixed. |
| 141 | G/performance.md:66-68 | source maps outside the budget | style.md:171 (STYLE-46) | MISSING | Fixed. |
| 142 | G/performance.md:74-76 | exceeding warns, never fails a build; measured at release | style.md:171 (STYLE-46, warning) | PRESENT | Release wording: row 75. |
| 143 | G/performance.md:80-85 | what to check when over (page / common / utils / layout) | style.md:171 (STYLE-46 "How to fix") | PARTIAL | Utils and layout cases missing. Fixed. |
| **build.md, output.md, quick-start.md, README.md** ||||||
| 144 | G/build.md:51; G/quick-start.md:18 | Dart Sass 1.23+ (LibSass cannot compile `@use`) | style.md:110-113 | MISSING | Fixed (Angular adaptation). |
| 145 | G/build.md:110-121; G/quick-start.md:119 | entry set: common, one per layout, one per page, utils; never a `_` file; every entry is in the build | style.md:34-36, 173 (STYLE-48) | PRESENT | |
| 146 | G/build.md:153-155; docs/README.md:36 | browser baseline: 4 latest Chrome, Edge, Firefox, Safari (desktop, iOS); vendor prefixes hand-authored, no Autoprefixer | style.md:110-113 | MISSING | Fixed: baseline stated. Prefix half left open (Angular CLI runs Autoprefixer) — report. |
| 147 | G/output.md:16; S/packages.md:49 | vendor CSS never included in any SCSS file; linked | style.md:148 (STYLE-27) | PRESENT | Angular: `angular.json` `styles`. |
| 148 | G/output.md:17; G/migration.md:22 | legacy stylesheet linked right after vendor, before common | style.md:34-35 | PRESENT | |
| 149 | G/output.md:55-91 | canonical order: vendor → legacy → common → base → palette → fonts → layout → page → utils → `custom.theme.css` last | style.md:34-39, 159 (STYLE-36) | PRESENT | Unverified: Angular inserts the `styles` bundle link itself; check that `custom.theme.css` still loads after it. |
| 150 | G/output.md:36 | a utility is not applied to an element whose page needs a different value; set it in the page stylesheet | style.md:183 (STYLE-58) | MISSING | Fixed: new STYLE-58. |
| 151 | G/output.md:40; G/quick-start.md:115-116 | compiled output ships minified; the four theme files ship unminified and unrenamed | style.md:181 (STYLE-56) | PARTIAL | Theme half fixed (row 98); minified compiled output = Angular production build. |
| 152 | G/output.md:57; G/recipes.md:121-122; G/walkthrough.md:319; S/packages.md:41, 71 | one vendor build per locale (even identical), each carrying its locale; the locale build linked and `dir` on `<html>` come from one decision and never disagree | style.md:148 (STYLE-27) | MISSING | Fixed in STYLE-27 (checker now script + ai). |
| 153 | G/output.md:55-61; S/packages.md:59 | the component framework is linked first among the packages; others in no fixed order | style.md:148 (STYLE-27) | MISSING | Fixed. |
| 154 | docs/README.md:49 | keep path/file casing consistent everywhere | style.md:11 (kebab-case), 138 (STYLE-17) | PRESENT | |
| 155 | docs/README.md:143-160 | fixed file, folder and prefix names | style.md:15-27 | PRESENT | |
| **migration.md** ||||||
| 156 | G/migration.md:23 | legacy stylesheet frozen; a change that would have gone into it goes to its segment (global class → `_classes.common.scss`, vendor → library module) | style.md:200, 213-216, 222 | PARTIAL | Frozen was stated; the routing of would-be legacy changes was not. Fixed (Foundation B paragraph). |
| 157 | G/migration.md:24, 53 | legacy shrinks: when a page moves, the legacy rules only it used are deleted; rules other unmoved pages use stay | style.md:213-216 | MISSING | Fixed (Foundation B paragraph). |
| 158 | G/migration.md:33 | a module that already holds vendor selectors becomes a library module, rules on an `m-` class | style.md:179 (STYLE-54), 207-208 | PRESENT | |
| 159 | G/migration.md:30-36 | migration order; Generic and Elements last | style.md:189-213 (Foundation A/B) | PRESENT | Process differs by design: Foundation B moves element/reset rules only when the compiled CSS renders the same. |
| 160 | G/migration.md:42-45 | done = legacy empty, unlinked, deleted; all classes prefixed; checklist passes | style.md:212-213, 173 (STYLE-48) | PRESENT | |
| **segments/settings.md** ||||||
| 161 | S/settings.md:28, 91 | R-SET-1 (Critical): no CSS output | style.md:137 (STYLE-16) | PRESENT | |
| 162 | S/settings.md:40, 52 | fixed `_breakpoints`/`_colors` names; colour maps reference palette tokens, hold no colour value; more settings files allowed | style.md:15, 157, 178 (STYLE-34/53) | PRESENT | |
| 163 | S/settings.md:69 | a breakpoint key is added to the map before any query uses it | style.md:130 (STYLE-10) | MISSING | Fixed in STYLE-10. |
| 164 | S/settings.md:70 | both axes (width, height) may be defined | style.md:73 (`mq($dimension)`) | PRESENT | |
| 165 | S/settings.md:71-72 | breakpoint values `rem` with px comment; px only in this map; range syntax preferred | style.md:130 (STYLE-10) | PARTIAL | Same as row 12. Fixed. |
| 166 | S/settings.md:82 | kebab-case, descriptive variable names | style.md:184 (STYLE-59) | MISSING | Fixed in STYLE-59. |
| 167 | S/settings.md:83 | `@dependencies` comments; document complex maps | style.md:64-65, 180 (STYLE-55) | PRESENT | |
| 168 | S/settings.md:92 | R-SET-2 (Critical): configuration SCSS reads lives here; colour values in Theme | style.md:157 (STYLE-34), 184 (STYLE-59) | PARTIAL | Fixed: STYLE-59. |
| 169 | S/settings.md:93 | R-SET-3 (Critical) = R-07 | style.md:128 (STYLE-09) | PRESENT | |
| 170 | S/settings.md:94 | R-SET-4 (High): each map has a comment (holds / read by) | style.md:180 (STYLE-55, warning) | PRESENT | |
| **segments/tools.md** ||||||
| 171 | S/tools.md:45, 51 | two folders, one file per tool, suffixes, `_index.scss` `@forward`s; documented once in one place | style.md:16, 162 (STYLE-38) | PRESENT | |
| 172 | S/tools.md:55 | `@dependencies` right after `@charset`, one per line | style.md:64-65 | PRESENT | |
| 173 | S/tools.md:95-96 | descriptive tool names (what a function returns / a mixin emits) | style.md:162 (STYLE-38) | MISSING | Fixed in STYLE-38. |
| 174 | S/tools.md:98 | meaningful `@error` messages | style.md:176 (STYLE-51) | PARTIAL | Fixed. |
| 175 | S/tools.md:107-110 | R-TOOL-1 (Critical), R-TOOL-2 (Critical), R-TOOL-3 (High), R-TOOL-4 (Critical) | style.md:137, 177, 176, 162 (STYLE-16/52/51/38) | PRESENT | Severities match. |
| 176 | S/tools.md:111 | R-TOOL-5 (High): each tool's documented example compiled once in an uncommitted scratch entry and compared; invalid argument raises `@error`; scratch deleted | style.md:185 (STYLE-60) | MISSING | Fixed: new STYLE-60 (warning, ai). BUILD-NOTES (j) called it a process rule. |
| **segments/generic.md, elements.md** ||||||
| 177 | S/generic.md:40; S/elements.md:40; S/common.md:67 | Generic and Elements reach the build only through `common.scss`; no page or layout entry imports them | style.md:151-152 (STYLE-29/30) | PRESENT | |
| 178 | S/generic.md:54-70 | `_index.scss` content; reset holds the one reduced-motion block | style.md:17, 167 (STYLE-42) | PRESENT | |
| 179 | S/generic.md:80-81; S/elements.md:71 | responsive media; form normalization: Generic sets no font values, only makes controls inherit them | style.md:17, 175 (STYLE-50) | PARTIAL | "Sets no font values" missing. Fixed in STYLE-50. |
| 180 | S/generic.md:100 | R-GEN-1 (Critical): selector rule; IDs banned everywhere | style.md:125, 126, 174 (STYLE-06/07/49) | PRESENT | |
| 181 | S/elements.md:51-56, 69 | Elements holds selection, `:focus-visible`, base body background, forms, media, base typography | style.md:18 | PRESENT | |
| 182 | S/elements.md:66 | shell grid not on `body`: on each layout's root `l-` class; `body` keeps base background + typography | style.md:139 (STYLE-18) | MISSING | Fixed in STYLE-18. |
| 183 | S/elements.md:68, 79 | bare form controls styled here (elements), not in a component | style.md:18, 125 (STYLE-06) | PRESENT | |
| 184 | S/elements.md:90-92 | R-ELEM-1, R-ELEM-2, R-ELEM-3 (Critical) | style.md:174, 125, 175 (STYLE-49/06/50) | PRESENT | |
| **segments/common.md** ||||||
| 185 | S/common.md:46-53, 71-86 | file roles, optional `_attributes`/`_classes`, `common.scss` `@use` order | style.md:19 | PRESENT | |
| 186 | S/common.md:110-111 | R-COM-1, R-COM-2 (Critical): no own prefix; aggregated files keep their prefixes | style.md:120 (STYLE-01) | PRESENT | Now stated in STYLE-01 text. |
| 187 | S/common.md:93-100, 112-114, 116 | R-COM-3, -4, -5, -7 (Critical): never moves; thresholds; mandatory promotion | style.md:150 (STYLE-28) | PRESENT | |
| 188 | S/common.md:115 | R-COM-6 (Critical): no double import | style.md:151 (STYLE-29) | PRESENT | |
| **segments/objects.md** ||||||
| 189 | S/objects.md:40, 47, 118 | `_<name>.object.scss`; R-OBJ-1 `o-` prefix | style.md:20, 120 (STYLE-01) | PRESENT | |
| 190 | S/objects.md:69-71, 119-120 | R-OBJ-2, R-OBJ-3 (Critical): no meaning; fixed pattern, no params/overrides; **may carry variants and `is-`/`has-` states** | style.md:141 (STYLE-20) | PARTIAL | Fixed (row 131). |
| 191 | S/objects.md:121-123 | R-OBJ-4, -5, -6 (Critical): colour via custom properties; not a utility; never moves | style.md:132, 141, 150 (STYLE-12/20/28) | PRESENT | |
| **segments/components.md** ||||||
| 192 | S/components.md:95, 128 | states chained with `&`; `:hover` in hover media with `:focus-visible`; disabled via `:disabled` or `js-disabled` | style.md:229, 166 (STYLE-41), 127 (STYLE-08) | PRESENT | |
| 193 | S/components.md:134 | a component is authored narrow viewport first, then adjusted upward; continuous values use `clamp()` | — | MISSING | Not fixed — see report (R-08 keeps `max-width` allowed). |
| 194 | S/components.md:171, 209 | colours/type from theme custom properties; self-contained, no dependency on another component | style.md:132, 128, 150, 138 | PRESENT | |
| 195 | S/components.md:221-224, 226 | R-COMP-1 (Crit), R-COMP-2 (High), R-COMP-3 (Crit), R-COMP-4 (Crit), R-COMP-6 (Crit) | style.md:120, 123 (warning), 138, 170, 150 | PRESENT | STYLE-39 also cites R-COMP-3 but states a different rule — report. |
| 196 | S/components.md:225 | R-COMP-5 (Medium): meets the Accessibility rules | style.md:165-169 (STYLE-40..44), 234-236 | MISSING | Fixed: added to the AXIS column of STYLE-40..44; markup side mapped to ACCESS. Severities follow each A11Y-CSS rule. |
| **segments/layout.md** ||||||
| 197 | S/layout.md:44, 70-72, 108, 115-116 | folder per layout, entry, scoped partials, `shared/` unscoped, sub-folder `_index`, none beside entry; parts are BEM elements, a shared part its own block | style.md:22 | PRESENT | |
| 198 | S/layout.md:106, 164-166 | `shared/` only for a part identical in every layout; shared or per-layout, never both | style.md:139 (STYLE-18) | MISSING | Fixed in STYLE-18. |
| 199 | S/layout.md:145 | root `l-` class owns the shell grid, `__main` owns the height; a page never sets either | style.md:139 (STYLE-18) | MISSING | Fixed in STYLE-18. |
| 200 | S/layout.md:149 | layout entry `@use`s only its partials and `shared/` parts; o/c/m through common | style.md:150 (STYLE-28) | PRESENT | |
| 201 | S/layout.md:174 | never style the page's content in Layout | style.md:139 (STYLE-18) | PARTIAL | Implied only. Fixed. |
| 202 | S/layout.md:186, 188 | R-LAY-1, R-LAY-3 (Critical) | style.md:120, 170 | PRESENT | |
| 203 | S/layout.md:187 | R-LAY-2 (Critical): semantic HTML elements | style.md:139 (STYLE-18, error) | PARTIAL | Cited in the AXIS column, absent from the rule text. Fixed (STYLE-18 applies to layout templates too). |
| 204 | S/layout.md:189 | R-LAY-4 (Medium): meets the Accessibility rules | style.md:165-169, 234-236 | MISSING | Fixed as row 196. |
| **segments/modules.md** ||||||
| 205 | S/modules.md:43-49, 56 | file kinds and their prefixes (R-MOD-1) | style.md:23, 120 | PRESENT | |
| 206 | S/modules.md:73-86 | popup on `.ctrl-<name>-popup` in the control module file | style.md:23, 140 (STYLE-19) | PRESENT | |
| 207 | S/modules.md:142 | `_classes.common.scss` is not a general vendor route | style.md:19, 179 | PRESENT | |
| 208 | S/modules.md:152; S/pages.md:99 | modules and pages never duplicate component styles | style.md:140, 139 (STYLE-19/18) | MISSING | Fixed in both rows. |
| 209 | S/modules.md:165, 167 | R-MOD-2, R-MOD-4 (Critical) | style.md:140, 150 | PRESENT | |
| 210 | S/modules.md:166 | R-MOD-3 (High): every vendor override in its library module | style.md:179 (STYLE-54, warning) | PARTIAL | Gaps of rows 37/43. Fixed. |
| 211 | S/modules.md:168 | R-MOD-5 (Medium): meets the Accessibility rules | style.md:165-169, 234-236 | MISSING | Fixed as row 196. |
| **segments/pages.md** ||||||
| 212 | S/pages.md:51, 60-68 | reserved `standalone/`, `state/`; one entry per page folder; kebab-case `.page.scss`; `p-`; BEM | style.md:24, 120, 123, 138 | PRESENT | |
| 213 | S/pages.md:111 | R-PAGE-1 (Critical): only styles unique to the page; entry never `@use`d | style.md:139 (STYLE-18) | PARTIAL | Fixed (row 91). |
| 214 | S/pages.md:112-114 | R-PAGE-2, -3, -4 (Critical) | style.md:139, 150, 170 | PRESENT | |
| 215 | S/pages.md:115 | R-PAGE-5 (Medium): meets the Accessibility rules | style.md:165-169, 234-236 | MISSING | Fixed as row 196. |
| **segments/packages.md** ||||||
| 216 | S/packages.md:39-43 | naming `<library><version>/<library><major>.<locale>.min.css`; only external libraries; content (incl. `sourceMappingURL`) unchanged | style.md:25, 148 (STYLE-27) | PRESENT | |
| 217 | S/packages.md:70 | no prefix; library class names used as published | style.md:222 | PRESENT | |
| 218 | S/packages.md:81-84 | R-PKG-1..4 (Critical) | style.md:148, 159 (STYLE-27/36) | PRESENT | |
| **segments/utilities.md** ||||||
| 219 | S/utilities.md:57, 65-75 | five fixed categories, `_<name>.utility.scss`, sub-folders allowed; `utils.scss` = the five `@use` lines only | style.md:26 | PRESENT | |
| 220 | S/utilities.md:93-102, 108-126 | short property names (`text` = color); text/background colour utilities generated with `@each` from the settings maps | style.md:146, 178 (STYLE-25/53) | PRESENT | |
| 221 | S/utilities.md:134-138 | `u-sr-only` in `accessibility/`; `u-container` exception is not a pattern; a typography utility names an existing font step | style.md:26, 146, 128 | PRESENT | |
| 222 | S/utilities.md:158-159 | R-UTIL-1, R-UTIL-2 (Critical) | style.md:146 (STYLE-25) | PRESENT | |
| 223 | S/utilities.md:5, 160 | R-UTIL-3 (High): wins by load order; never raise specificity | style.md:183 (STYLE-58, warning) | PARTIAL | Was error in STYLE-25. Fixed: moved to STYLE-58. |
| 224 | S/utilities.md:161 | R-UTIL-4 (High): adds to an element's own styling, never replaces it | style.md:183 (STYLE-58, warning) | PARTIAL | Was error in STYLE-25. Fixed: moved to STYLE-58. |
| 225 | S/utilities.md:88, 162 | R-UTIL-5 (Critical): `u-{property}-{value}` for scale/numeric values; others a clear, expected name | style.md:146 (STYLE-25) | PARTIAL | Fixed (row 94). |
| 226 | S/utilities.md:89, 163 | R-UTIL-6 (Critical): no breakpoint name; viewport-dependent value reads a `clamp()` token | style.md:146 (STYLE-25) | PARTIAL | Fixed (row 95). |
| **segments/theme.md** ||||||
| 227 | S/theme.md:28 | a theme is not light/dark; if ever needed, `:root` wrapped in an at-rule | style.md:155 (STYLE-32) | PRESENT | |
| 228 | S/theme.md:51-64 | base = identity values; palette: one `:root` per family, all HSL, brand ramps from identity values (500 as is, others ± lightness), status and neutrals fixed, `-2` for a second brand | style.md:83-84, 133, 157 | PRESENT | |
| 229 | S/theme.md:86 | the font-file path is in `@font-face`, never a custom property | style.md:155 (STYLE-32) | MISSING | Fixed in STYLE-32. |
| 230 | S/theme.md:111-116 | custom.theme.css: body/shell backgrounds and brand-asset positioning; reject any custom property | style.md:86, 156 (STYLE-33) | PRESENT | |
| 231 | S/theme.md:135, 160, 162 | token-name shape `--<family>-<step>`, `--ff`/`--fs-*`/`--fw-*`/`--lh-*`; utility steps exist here; fluid steps `clamp()` here | style.md:84-85, 128, 157 | PRESENT | |
| 232 | S/theme.md:170-173, 175-178 | R-THEME-1, -2, -3, -6, -7, -8, -9 (Critical); R-THEME-4 (Medium) | style.md:132, 155, 128, 156, 157, 169 | PRESENT | |
| 233 | S/theme.md:44, 174 | R-THEME-5 (Critical): plain hand-authored CSS; never compiled, minified or renamed | style.md:181 (STYLE-56), 159, 27 | PARTIAL | Fixed (row 98). |
| **Segment best-practice guidelines** ||||||
| 234 | S/tools.md:99; S/generic.md:89-92; S/elements.md:80-82; S/components.md:211-213; S/layout.md:175-178; S/modules.md:155-156; S/pages.md:101-103 | keep styles lightweight, efficient selectors, minimal output, avoid complex calculations in loops, document complex styles, test across all breakpoints | — | MISSING | Not fixed: no checkable requirement and no priority — see report. |

## Counts (state before the parity edit)

| Status | Rows |
|---|---|
| PRESENT | 154 |
| PARTIAL | 53 |
| MISSING | 27 |
| **Total** | **234** |

After the edit every PARTIAL/MISSING row is fixed in `rules/style.md` except: rows 107–112 (ACCESS severity, `access.md` not
edited), 146 (Autoprefixer half), 151 (compiled-minified half = Angular build), 193 (narrow-viewport-first), 234
(unmeasurable guidelines), and the lint gap in row 13.

## Decided on 2026-11-21

Rows 107–112: ACCESS severity stays `warning` (stricter). Row 13: `overflow-x/-y`, `resize`, `overscroll-behavior-x/-y`,
`contain-intrinsic-*` added to the STYLE-11 lint (never auto-converted). Row 193: STYLE-61 (info, AI, report only). Row 195:
STYLE-39 no longer cites R-COMP-3. Row 149: `custom.theme.css` is linked at the start of `<body>` (STYLE-36, scaffold, foundation).
