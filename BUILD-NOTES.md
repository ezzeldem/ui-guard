# BUILD-NOTES — ui-guard 1.0.0

## Differences from SPEC.md (and why)
1. **Stylelint/ESLint configs are ESM (`.mjs`)**, not `.cjs`: Stylelint 17+ is ESM-only. Files: `.ui-guard/lint/stylelint.config.mjs`, `stylelint-ui-guard.mjs`, `eslint.config.mjs`; root re-exports `stylelint.config.mjs` / `eslint.config.mjs`.
2. **Stylelint version**: current is 18.0.0 (needs Node ≥22.22.2/24.15). This machine has Node 24.12, so tests use **17.16.0**; commands pick 17 or 18 by Node version.
3. **Hooks**: PreToolUse matcher is `Bash|PowerShell` (this environment also has a PowerShell tool). Hooks use the official `{"hooks":{…}}` wrapper.
4. **`${CLAUDE_PLUGIN_ROOT}` in markdown**: commands fall back to Globbing the plugin root if it is not substituted, and pass the absolute path to agents.
5. **Lint runner** resolves the project's own CLI from `node_modules` (walking up) and runs it with `node` — same effect as `npx --no-install`, no shell needed on Windows.
6. **Extra scripts** (not in §11, for determinism): `run-checks.js`, `structure-check.js` (script parts of STYLE-17/28/38/42), `write-report.js`, `changes.js` (check + marker), `phase.js` (fix bookkeeping), `setup-project.js`, `scaffold.js`, `lib/{util,css,color,angular,sass-graph,findings}.js`. Extra custom Stylelint rule `ui-guard/bem` (STYLE-04).
7. **Theme `url()` paths** resolve from the theme file to `../../../project-images/` (the spec's `../../` would resolve to `assets/scss/project-images`). Theme-source `url()`s are resolved as if swapped into the active folder.
8. **`mq()`**: `if()` replaced by `@if` (Sass 1.108 deprecates `if()`); output identical. **`hover()`** got an `@error` check for `$trans` (STYLE-38 asks for validation); output identical.
9. **Color ramp** for colors with L < 10% or > 97%: ramps toward 0%/100% so steps stay monotonic (the spec formula would invert).
10. **Merge clustering**: deterministic findings cluster only by fingerprint (two real findings on neighboring lines stay two); AI findings join within ±2 lines. Same-line distinct deterministic messages are joined, never dropped. Binary assets / `dist/` fingerprint on rule+file only.
11. **init** deletes Angular's comment-only default `src/styles.scss` after removing it from `styles` (one global entry).
12. `externalDependencies: ["assets/*"]` is written as specified; whether the Angular builder honors it for CSS `url()` was **not verified** (no Angular CLI here).
13. **Added after the build (developer's decision):** BEM written nested — elements and variants inside the block (`&__icon`, `&-secondary`); new rule **STYLE-47** (`ui-guard/nest-block-parts`; raised from warning to **error** later). Variants stay `-variant`, `--modifier` stays forbidden (STYLE-04). The palette template has one `:root` block per section; `no-duplicate-selectors` is off for theme token files.
14. Fixture's MEDIA-03 (>200 KB image) and STYLE-46 (dist CSS) files are generated at test time, not stored.

## Redesign after the first real scan (2026-11-14)
The first real scan of a large project used ~6M tokens (96 agents, 3 rounds) and produced a huge plan. Changed:
- **One agent at a time, one pass.** Scanner B, the dispute resolver, the planner agent and the 3-round loop are removed
  (agents left: `ui-scan-by-file`, `ui-fixer`, `ui-fix-reviewer`, `ui-change-reviewer`). `scripts/ai-scan.js` hands out one batch
  at a time in a fixed order — Stage 1 SCSS/CSS (STYLE), Stage 2 templates + TS (STYLE, LANG, SAFE), Stage 3 templates (ACCESS) — and
  validates each result before the next batch. It STOPS (and the command asks the developer) on: invalid/unreadable output, a file of
  the batch missing from the result, a rule outside the stage (= contradicts the free checks' ownership), agent error / usage limit
  (`ai-scan.js stop`), or the token cap. `--resume` continues from the exact batch; `skip` only by the developer's decision.
- **Free scan is the default** (`/ui-guard:scan` = Stage 0 only, 0 AI tokens). `--ai` adds the AI stages; `--ai-full` does not exist.
- **Estimate + cap:** tokens ≈ file chars / 4 + rules files + profile + 6k overhead per batch; default cap 1,500,000 (`--max-tokens`).
  The share of a Pro 5-hour window is shown only when a number is set (`--window-tokens` / profile `aiBudget.windowTokens`) — Anthropic
  publishes no fixed token number, so ui-guard does not invent one. Real usage (agent runs, tokens per stage) is in the report footer.
- **ESLint crash** (e.g. eslint-scope TypeError on ESLint 10.15): retried once, then its rules are reported as `NOT CHECKED (ESLint failed: …)`.
  Missing/declined/crashing tools are never routed to the AI any more.
- **Images/assets out of the scan:** never in the inventory, never opened, no MEDIA findings in reports, baselines or plans
  (dropped even from older findings.json). `/ui-guard:assets` (`scripts/assets.js`, self-contained, 0 tokens) checks that referenced
  image/font/video paths exist; it runs inside `/ui-guard:check` (new problems only, `assets-baseline.json`) and optionally in the git
  pre-push hook (`setup-project.js githook --with-assets`). Decisions per MEDIA rule: table at the top of `rules/media.md`.
- `assets-check.js` became `web-check.js` (SAFE-06, SAFE-07, STYLE-46 only); MEDIA-08 left `theme-check.js`.
- **Short plan by script:** `scripts/plan.js` writes `plan.md` (summary + "Phase k of N" blocks, ≤ ~150 lines), `plan.json` (files + finding IDs
  for `/ui-guard:fix`) and `renames.md` (class prefixes from STYLE-01, token typos from STYLE-09; anything ambiguous says "(decide)").
- **Short report:** `report.md` is a summary page (≤ ~150 lines). Details only on request: `--details <area>`. `--plan-only` rebuilds
  report + plan from the existing findings.json; old files go to `history/<date>/report.old.md`, `findings.old.json`, `plan.old.md`.
- SAFE-04 secret candidates are now **warnings** until confirmed (no resolver any more), so an unconfirmed candidate never blocks a push.
- `merge-findings.js` no longer trusts AI text as evidence, but keeps the masked evidence from `secrets-check.js` (before, a secret's
  line text could have been copied into findings.json).

## Review fixes (2026-11-14, second pass)
1. **Library/state classes are never renamed** (`scripts/lib/libclasses.js`): Bootstrap names/patterns, library prefixes (`ngx- mat- mdc- ng- swiper- ngb- cdk-`; `p-` only when `primeng` is a dependency, because `p-` is also ui-guard's page prefix), classes found in the CSS of `node_modules` styles listed in angular.json, and unprefixed classes the project styles only under `::ng-deep` or a library selector. `renames.md` has a section "Library classes (kept as they are)". STYLE-01 on such classes is not raised by `run-checks.js` and is dropped by `plan.js` / `write-report.js` when reading an older findings.json. Project-owned state classes (`open`, `selected`, `loading`, …) get a "(decide: state class, check TS usages)" row with `is-/has-/js-` options and the usage count — never `c-`.
2. **Phases are split by files AND findings** (`plan.js`): at most 15 files or 300 findings; `MAX_PAGE_PARTS` removed; applies to every area. Split by top-level app folder, then feature folder (adjacent small groups merge while they fit; last resort: chunk by file order — a single file with more than 300 findings stays one phase, a file cannot be split). Routes per phase come from `route-files.js` (`routeMap/routesFor`: static `path` + `loadComponent`/`component` import); no route found → default routes + "weak coverage: these pages are checked by eye" (flag set for Pages only — Foundation/Generic are global and use the default routes on purpose). plan.md stays ≤ ~150 lines (repeated why/how are shortened; above the limit it switches to one table row per phase).
3. **Token cap works without measured tokens** (`ai-scan.js record`): missing/0 `--tokens` → the batch's estimate is counted and printed "(estimated)". Estimates show "about X (up to 1.5X in practice)". Per batch `measuredTokens` / `estimatedTokens`; the report footer says measured / estimated / both. `ai-scan.js stop` still counts only tokens it is given.
4. **ESLint 9:** install commands everywhere are `eslint@^9 angular-eslint@^<major> typescript-eslint`; `setup-project.js tools` prints the exact commands and tries an installed ESLint (working → keep; crashing → reason + offer, ask first). The report names the known ESLint 10 crash. The plugin's own devDependency is eslint 9.39.5 (npm marks 9.39.5 as "no longer supported"; the request was ^9 — revisit when angular-eslint works with a fixed ESLint 10).
5. **fix without git** (`phase.js`): `gitcheck` (exit 5 + warning), `backup [--made-by-me]` (copy to `<project>-backup-<date>` without node_modules/dist/.angular/.git, only after the developer chose it), dirty-check skipped, snapshot/outside/diff work from file hashes and copies (own small diff), undo hints point at the backup path instead of `git restore`.
6. Docs: every doc says the plugin has 5 commands (init, scan, fix, check, assets).

## Domains, Foundation and design-preserving access (2026-11-15)
1. **Per-domain commands.** `/ui-guard:scan <scss|access|lang|safe>` and `/ui-guard:fix <domain> [phase]` (still 5 commands: one file each,
   the domain is the argument; no domain → the list of four). `scripts/lib/domains.js` maps scss→STYLE, access→ACCESS, lang→LANG,
   safe→SAFE, each with its scripts and linter. Files per domain: `.ui-guard/<domain>/{findings.json,report.md,plan.md,plan.json,baseline.json,history/,fixes/}`,
   temp in `.ui-guard/tmp/<domain>/`. `run-checks.js`, `merge-findings.js`, `write-report.js`, `plan.js`, `phase.js`, `ai-scan.js` take `--domain`.
   `run-checks.js` without a domain still runs everything (used by `/ui-guard:check` and the hooks).
2. **Baselines per domain**; `loadBaseline(root)` (hooks, check, git pre-push hook) reads the union of every domain baseline plus an older single file.
3. **No questions, no estimate, no cap.** `ai-scan.js estimate` and the 1.5M cap are gone; `plan` picks only files with a script signal or an
   `unverified` script finding; tokens are a silent log in the report. Invalid agent output → one rerun with the error, then skip.
   Scan sets up lint inside `.ui-guard/lint/` only (`setup-project.js lint --internal`) and never installs.
4. **Fix runs to the end** (`phase.js next` loop, `summary`), stopping only on build failure, 3 failed retries, unreadable/unwritable files or a usage limit.
   Without git it makes the backup itself (before: a question). Script-only phases skip the Opus review (proven by compile); the review runs once per
   phase the fixer touched, on the diff only (the diff file carries the phase findings in a `#` header).
5. **STYLE-48 + Foundation A/B** (`scripts/foundation.js`, `lib/scss-text.js`; Foundation B since redesigned as the AXIS migration — see "AXIS parity" below): structure gap check; Foundation A creates the missing tree from the
   templates (generic/elements as empty files, no button, the icon-filter utility only when the palette has filter tokens); Foundation B moves the
   global stylesheets into segment files in cascade order (fine-grained rank per segment + index position; out-of-order rules stay with the previous
   target and are listed), rebases `url()`s, and proves it by compiling every injected global + theme `<link>` with the project's sass before/after
   (rules in order; tokens, @font-face, @keyframes as sets). Any difference → full rollback, exit 6 → the fixer.
6. **Mechanical scss fixes** (`scripts/scss-fix.js`): charset, `@use "tools" as *`, px → px() (root font size aware, custom properties untouched),
   logical properties (not for bidirectional apps), `@media` min/max width/height → `mq()` (missing breakpoint keys added; `max-width: X` ≡ `width < X+1`
   at whole pixels), BEM nesting of contiguous top-level parts, prefix renames (SCSS + templates + TS, all-or-nothing per class). Each step is kept
   only when the compiled CSS of the file is unchanged.
7. **STYLE-11** covers width/height/min-/max-* again (AXIS R-09 literally): they become inline-size/block-size, also in bidirectional apps.
8. **ACCESS**: `rules/access-fix-tiers.md`, `selector-impact.js`, `screens.js --styles` + `style-diff.js` (computed style + box), impact levels in
   `lib/access-impact.js` (High/Medium/Low, non-problems rejected, repeats collapsed, fix-first list), `needs-decision.md` collected by `phase.js summary`.
9. Plan fixes: global stylesheets are Foundation B, never Pages (`*.component.scss` counts as a component); screenshot routes come from real routes
   (`route-files.realRoutes`: lazy children get their parent prefix, utility pages like `/no-connection` last). `tokens-check` ignores `var()` inside tools.
10. **Not done:** MEDIA-01..06 belong to no domain (still in `/ui-guard:check` and the hooks). Hex → HSL token conversion (STYLE-13) is not mechanical yet.
    The fixer/reviewer agents, `ng build`, screenshots and style-diff were not executed here (no Claude agents, Angular CLI or Playwright in the test env).
    Lazy bundles (`inject: false`) are listed as a decision, not moved.

## ACCESS-06..22, image box and colours (2026-11-16)
1. **17 new ACCESS rules** (rules.json: 96 rules; `impact` + `tier` per rule) from a coverage comparison with the team's accessibility material: forms (types/autofill, structure, errors), landmarks, headings, links,
   document (lang, zoom, titles), role misuse, live regions, widgets, tab stops, motion/timing, audio/video, iframes/objects/canvas, tables, image box, name vs visible text. Rule text is our own wording and examples.
   The comparison matrix (112 checks: 45 already covered, 55 added, 12 weaker and now fixed) is a private note in `local/access-coverage.md` — git-ignored, named in no published file (a test greps for it).
2. **`scripts/access-check.js` + `lib/html-scan.js`**: a small Angular-template reader (elements, bound attributes, text, `@if`/`*ngIf` position) and the script part of ACCESS-06, 07, 09–16, 18–22 (+ the document part of 12 on index.html and the routes).
   ACCESS-08 and 17 are AI-only (route-files signal group `access-motion`); the AI part of 09, 12, 14–16, 18–20 stays in the access AI stage. Each script finding carries `impact` and `tier` through merge-findings into the report.
3. **ACCESS-21 image box** (same condition as MEDIA-01, which stays for `/ui-guard:check` and the hooks): reports an image whose box is not reserved; a class that fixes only the width is reported separately. Fix rule: never guess an intrinsic size;
   `aspect-ratio` in the component SCSS only when the ratio is already written and the box provably stays the same; width/height attributes are Tier C (visual proof) or a decision.
4. **Colours in `fix scss`** (`lib/colors-fix.js`, step `colors` of `scss-fix.js`): hex / rgb() / rgba() in `$variables` and `--tokens` → `hsl(H, S%, L%[, A])` with up to 4 decimals — only when the round trip gives exactly the same 8-bit channels (tested on random colours);
   kept and listed when not exact (percent or fractional channels, or a variable read by a Sass colour function). A component colour equal to exactly one palette colour becomes `var(--token)`; no match or several matches → `.ui-guard/scss/needs-decision.md`
   (add to the palette / keep the literal). Named colours, url(), strings, comments, selectors and interpolation are never touched. The CSS compare now treats any plain colour literal by its 8-bit result, and `var(--token)` by the colour it stands for.
5. Settings, tools and theme files get the colour step only; every other scss file gets all steps. `phase.js summary` writes the scss needs-decision list too.

## Ledger and /ui-guard:scan html (2026-11-16)
- `.ui-guard/ledger.json` (`scripts/lib/ledger.js`, CLI `scripts/ledger.js`; `inventory.js build` syncs it; `lib/fingerprint.js` has `fileHash`).
  Version 1, atomic write (temp + rename); unreadable / other version → ignored = full rescan. Trust rule: scannedFingerprint === file hash now.
- Stable key = rule + whitespace-normalized line text (≤ 120 chars), never the line number; SAFE-04 = rule + a hash of the line (no text).
- `scan <domain>`: `ledger.js prepare` → valid files are not linted (`run-checks`) and not planned for the AI (`ai-scan plan`);
  `merge-findings finalize` re-adds their stored lint + AI rows. **Choice:** the ui-guard scripts still run project-wide (0 tokens) and
  their findings are always fresh, because several script rules are cross-file (class usage, structure, translations); reusing them
  per file could keep a finding that another file's change resolved. A file is recorded as scanned only when its linter ran and,
  if it needed judgment, a finished non-skipped AI batch covered it (a free scan leaves judgment files unscanned).
- Global invalidation (`lib/ledger.js` `lintContext` / `aiContext`, stored per file+domain at record time): lint rows need the same hash of
  `.ui-guard/lint/**`, `<scss>/{tools,settings,theme,utilities}/**`, `src/assets/themes/**`, root lint configs, `angular.json` and the linter
  package versions; AI rows need the same hash of `rules/<domain>.md` + its `rules.json` entries + its AI stage rule ids. `prepare` splits
  valid files into `lintReuse` / `aiReuse`; a mismatch re-lints or re-judges that part only.
- `scan html` (`scripts/html-pass.js`): scripts + lint once for all domains on the templates, then one batch list where each file
  appears once with all its pending domains; the agent output is split by rule family into the ledger.
- Fix: `phase.js snapshot` stores every ledger file's hash; `complete` / `fail` update the ledger (own statuses, fingerprint, facts,
  rename map, carry-over of the other domains incl. their findings.json lines and baseline fingerprints). `plan.js` leaves out
  findings the ledger parks as needs-decision / skipped (`--rescan` resets them).

## AXIS parity (2026-11-20)

ui-guard is now an exact copy of the AXIS SCSS standard the ui-code-review AXIS reviewer applies: everything ui-guard generates
(init templates, Foundation A/B, the scss fixer) and accepts follows AXIS literally (`ui-code-review/skills/axis-scss/`).
- **Structure / templates** (`templates/scss`): no `style.scss`; entries `common/common.scss` (`../generic`, `../elements`, then the
  aggregators) and `utilities/utils.scss` (the five `@use "./<category>"` lines); five fixed utility categories, each with `_index.scss`
  (`u-sr-only` in `accessibility/`, filters in `visual/`); `generic/_index.scss` + `_reset.generic.scss` (box-sizing, form controls
  inherit the font, responsive media, the one reduced-motion block); `elements/_index.scss` only (base typography reads `--ff`/`--fs-*`/
  `--lh-*`); no `settings/_index.scss`, new `settings/_colors.settings.scss` (maps referencing palette tokens); reserved
  `pages/standalone/`, `pages/state/`; `@use` with relative `<path-to-root>` paths and `// @dependencies:` comments in the scss root.
- **Tools:** one file per tool (`tools/functions/_px.function.scss`, `tools/mixins/_<name>.mixin.scss`) forwarded by folder indexes;
  every tool documented and every parameter validated with `@error` (after/before/scroll included); `dir()` writes `&:dir(<dir>)`
  (no `::ng-deep`, no attribute selector); `scroll()` takes its sizes and colours as parameters; `hover($trans: null)`.
- **Theme files and tokens:** new `colors/colors.base.theme.css` (`--hue/--saturation/--lightness`, `-2` for the second brand, the
  `--filter-primary|secondary|neutral-25|neutral-400` filters); the palette no longer changes between clients and brand ramps shift
  only the lightness (`color-ramp.js`); `add-theme` edits only the base file; `--shadow-100` replaces `--div-shadow`; font tokens
  `--ff`, `--fs-*`, `--fw-*`, `--lh-*`; utilities `u-filter-neutral-25`/`u-filter-neutral-400` replace light/gray. Links in
  `index.html`: base, palette, fonts, custom (last); `lib/project.js` `THEME_FILES` has the four files.
- **Foundation A:** creates the AXIS tree, generates `_colors.settings.scss` from the palette, wires both entries + four theme links,
  upgrades an old single `style.scss` entry. **Foundation B** follows the AXIS migration guide: the legacy stylesheet stays linked
  right after the vendor CSS and frozen; only AXIS-compliant pieces move (tokens, `@font-face` to every theme's `fonts.theme.css`,
  `$variables`, one tool file per mixin/function, element rules, resets, single-property `u-` rules by category, vendor overrides under
  an existing `m-` block). A rule passes only rules it can never conflict with (`lib/cascade.js`; `sameRender(..., { reorder: true })`
  accepts such permutations); the rest is reported as legacy and STYLE-48 no longer requires it gone (`foundation-move.json` `legacy`).
  `sr-only` always creates/uses `u-sr-only` (no reuse of `.sr-only` / `.visually-hidden`).
- **Lint:** `selector-max-class: 0` in generic/elements (STYLE-49), `selector-max-universal: 0` and `:root`/`:host` disallowed
  elsewhere (STYLE-06), attribute selectors only `[aria-*]` / `:is([dir="rtl"])` on a project class (mixins included, no tools
  exemption), `::ng-deep` an error everywhere, px rule on `$variables` and theme CSS (only `_breakpoints.settings.scss` exempt), colour
  literals and functions (`hwb lab lch oklab oklch color` added) only in `theme/colors/*.css`, logical properties and
  no-duplicate-selectors on in custom/fonts, `custom.theme.css` rejects `*`/`:root`/`html`, no
  `consecutive-duplicates-with-different-syntaxes` ignore, utility short names (`u-ff- u-fs- u-fw- u-bg- u-text- u-text-align-`),
  `ui-guard/no-important` (only the generic reduced-motion block), `ui-guard/module-classes` (library modules nest vendor classes in
  `.m-<component>`; `common/_classes.common.scss` exempt), a routed page style may `@use` page-local objects/components/modules.
- **Severities = AXIS priority** (Critical → error, High → warning, Medium → info): STYLE-04, 40, 41, 42, 44 warning; STYLE-31, 45
  error. STYLE-41 is fixable (`@include hover`); STYLE-44 checks every theme with 3:1 for large text and control borders; STYLE-46 uses
  the AXIS budgets (common 20 KB, utils 8 KB, theme 3 KB, page 12 KB, 60 KB per page; vendor not budgeted).
- **New rules STYLE-49..55:** element-only generic/elements, Elements base background + font tokens, tool parameters validated, no
  hard-coded tool values, generated colour utilities, vendor overrides in library modules, settings map comments. rules.json: 108 rules;
  every STYLE rule has an `axis` field (AXIS rule IDs); rules/style.md has an AXIS column. Still 5 commands.
- **Scripts:** `structure-check.js` (exact AXIS file-name regexes per segment, R-28 import routes, tools, STYLE-42/50..55),
  `angular-config-check.js` (theme link order; R-29 importers are only entries and component styles), `tokens-check.js` (pre-AXIS
  names, font keys, base/fonts hold no shade, `:host` no longer exempt for fluid tokens, contrast per theme), `theme-check.js`,
  `web-check.js` (budgets), `scss-fix.js` (`@use "<path-to-root>/tools"`, `deps` step), `scaffold.js`, `color-ramp.js`,
  `libclasses.libraryName`.

## AXIS parity — judgment calls

Where the AXIS text left room, the stricter reading was taken:
- (a) Font family keys: `--ff` for one family, `--ff-1`, `--ff-2` … when there is more than one (theme.md, literally). The template has
  only `--ff`; `--fb` is reported as a pre-AXIS name (rename to `--ff-2`, and `--ff` → `--ff-1`) instead of keeping `--ff` beside `--ff-2`.
- (b) A STYLE rule that implements AXIS rules of different priority takes the highest priority's severity (STYLE-19, STYLE-25,
  STYLE-28, STYLE-42). STYLE-15, 30, 35 and 37 keep ui-guard's severity (no matching AXIS rule).
- (c) A module may `@use` only components: R-28 says only a module may `@use` a component; a module `@use`-ing an object or another
  module is reported.
- (d) Foundation B moves rules whose values still need fixing (px, physical properties, colour literals): the later scss-fix phases of
  the same run fix them with their own proofs. It never moves unprefixed classes, colour utilities or `@keyframes`.
- (e) `@dependencies` is a documented best practice, not a numbered rule: generated everywhere (templates, Foundation B, the scss-fix
  `deps` step) but no STYLE rule reports a missing one.
- (f) A design ramp's hue/saturation differences are dropped (only the lightness shifts) and listed in the init report.
- (g) `hover()`'s transition is opt-in (`$trans: null`) so `@include hover` is pixel-neutral as the STYLE-41 fix; the standard button
  passes `hover(0.2)`.
- (h) Only `:is([dir="rtl"])` (not `ltr`) is allowed, chained onto a project class.
- (i) STYLE-46: Angular bundles vendor + legacy + common + utils into one `styles.css`, so the 60 KB per-page ceiling is applied to it;
  common and utils are measured separately by compiling their entries.
- (j) R-TOOL-5 (compile each tool's example once) is a process rule: ui-guard's own self-tests compile the tool examples; projects are
  not checked for it.
- (k) `u-<short>-<step>` utilities (`u-fs-sm`) name a token step and are not treated as breakpoint names (R-UTIL-6).
- (l) `_index.scss` files hold only `@charset` and `@use`/`@forward` lines (no comments).
- (m) The generic reset template adds form-control `font: inherit` and responsive media (AXIS generic key features) — new projects only.
- (n) `:host` has no AXIS exemption: lint reports it; the fixer moves its styles onto the component's root BEM class only with pixel
  proof, otherwise it is a decision.
- (o) A library module's block must be `.m-<vendor-component>` from its file name; a vendor class anywhere outside a library module
  or `common/_classes.common.scss` is a STYLE-54 finding (also when nested under a `c-`/`p-` block), since R-30 allows only an `m-` wrapper.

## ui-code-review parity — accessibility and the open decisions (2026-11-21)
- Accessibility audit redone from scratch: `docs/ucr-parity/access.md` (129 rows: 92 present, 27 partial, 10 missing, all
  fixed in `rules/access.md` and `rules/access-mvc.md`). Final ID check: `node scripts/dev/ucr-parity.js` (every rule ID that
  ui-code-review defines is named in ui-guard).
- "Apply the rules literally" is also in `skills/ui-rules/SKILL.md` and the CLAUDE.md block.
- Decisions taken by the developer:
  1. ACCESS markup rules stay `warning` (stricter than AXIS Medium = info; no ui-code-review comment can follow).
  2. `overflow-x/-y`, `resize: horizontal/vertical` (and `overscroll-behavior-x/-y`, `contain-intrinsic-width/-height`) are
     STYLE-11 lint findings; scss-fix never converts them (browser support) → decision.
  3. STYLE-61 (info, ai): narrow viewport first (AXIS components.md), report only.
  4. STYLE-39 no longer cites R-COMP-3 (a team rule; AXIS walkthrough's shared `c-button`).
  5. `custom.theme.css` is linked at the start of `<body>`: Angular adds the global styles bundle at the end of `<head>`, so a
     `<head>` link loads before it. scaffold, foundation and STYLE-36 (angular-config-check) follow this.
  6. LANG: text inside `<code>` is no longer excluded.
  7. MEDIA-02 script: only images in a repeated block (and `loading="eager"` counts as missing lazy); data-bound images
     elsewhere are left to the AI (code must show an off-screen container). Icons (`icon`/`icons` in the path) are skipped.
  8. Scripts: LANG-05 on the key's line in the file that has it; media-check reads inline `template:` literals and checks
     asset sizes in `assets/`, `wwwroot/` (not `lib/`), `Content/`, `Images/` too; `/ui-guard:check` fails on an oversized
     changed asset (MEDIA-03) and turns a missing / unknown fix verdict into `Unclear`.
- Logical properties in a bidirectional app (Arabic + English): scss-fix now mirrors by default — sides convert as authored
  for the base direction (`index.html` `dir`, else the init answer, else the first language) and are proven in that
  direction; a file with `[dir=…]`, `:dir()` or `@include dir()` keeps its sides (decision).

## Package versions verified (npm, 2026-11-13)
stylelint 18.0.0 (17.16.0 used), stylelint-scss 7.5.0 (peer ^16.8.2‖^17‖^18), postcss-scss 4.0.9, eslint 10.15.0 (9.39.5 used — see Review fixes), angular-eslint 22.6.0 (eslint ^9‖^10), typescript-eslint 8.72.2 (TS <6.1 → 5.9.3), sass 1.108.2, playwright 1.65.1, pixelmatch 8.0.0 (ESM, loaded via dynamic import), pngjs 7.0.0.

## Self-test summary (`npm test`)
```
94/94 tests passed.
```
Covers: plugin structure (5 commands, 4 agents), rules.json (78 rules), `--help` on every script, 17 custom Stylelint rules (valid + invalid), fixture expected IDs/counts, every in-scan stylelint/eslint/script rule fires, clean files clean, determinism, **no parallel agents in the scan command**, **images excluded from the inventory**, free scan (0 tokens, report/plan ≤ 150 lines), `--details`, **`--plan-only` (< 150 lines, MEDIA dropped, old files in history)**, **estimate printed before AI stages**, one-batch-at-a-time AI flow (valid result saved; rule outside the stage / missing file / unreadable output → STOP; resume), **token cap stops the run**, **ESLint crash → NOT CHECKED, retried once, not routed to AI**, **`/ui-guard:assets` finds a missing image and passes when present** (+ baseline/new-only), color-ramp, icon-filter, Sass tools, init scaffold, post-edit hook, git pre-push hook, Claude pre-push guard, check FAIL path, fix phase fail/complete, git read-only policy.

## Acceptance checklist (§15)
- [ ] Plugin loads in Claude Code — **not verified**: `claude` CLI not on PATH here; run `claude plugin validate <path-to-ui-guard>` and `/plugin install`.
- [x] All self-tests pass (51/51).
- [~] `scan` on the fixture: free scan verified end to end; AI stages verified with simulated agent output (the real agent needs Claude). `--plan-only` run on real scan data of a large project: plan.md 85 lines, report.md 82 lines.
- [~] `fix`: phase bookkeeping, verify, outside-file detection, forced failure → `failed` with changes kept, success → baseline shrinks — verified. **Fixer/reviewer agents, `ng build`, screenshots and pixel diff not executed** (no Claude agents, Angular CLI or Playwright in the test env).
- [x] Post-edit hook blocks a new `!important`, ignores a baselined one.
- [x] Pre-push git hook blocks a new error, passes a clean push (temp repo, local bare remote).
- [x] Claude pre-push guard blocks `git push` without a fresh marker, passes other commands (<3 s), passes with a matching marker.
- [x] No git writes: `lib/git.js` whitelists status/diff/log/rev-parse/merge-base/ls-files/`config --get`; test greps scripts. Hits of "commit/push/restore" are in user-facing text (e.g. "Do not commit", `git restore` shown as the developer's own option) and in `tests/run-tests.js` (temp test repo only). `git config core.hooksPath` is run by the command only after asking (spec §5.8).
- [x] No silent installs: install commands only appear in command files behind the §3.3 question; test greps scripts.
- [x] Differences listed above.

## Not done / follow-ups
- Run `claude plugin validate` and a real `/ui-guard:scan` + `/ui-guard:fix` on a real project.
- Browser verification of icon filters (`icon-filter.js --verify`) needs Playwright in a project.
