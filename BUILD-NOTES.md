# BUILD-NOTES — ui-guard 1.0.0

## Differences from SPEC.md (and why)
1. **Stylelint/ESLint configs are ESM (`.mjs`)**, not `.cjs`: Stylelint 17+ is ESM-only. Files: `.ui-guard/lint/stylelint.config.mjs`, `stylelint-ui-guard.mjs`, `eslint.config.mjs`; root re-exports `stylelint.config.mjs` / `eslint.config.mjs`.
2. **Stylelint version**: current is 18.0.0 (needs Node ≥22.22.2/24.15). This machine has Node 24.12, so tests use **17.16.0**; commands pick 17 or 18 by Node version.
3. **Hooks**: PreToolUse matcher is `Bash|PowerShell` (this environment also has a PowerShell tool). Hooks use the official `{"hooks":{…}}` wrapper.
4. **`${CLAUDE_PLUGIN_ROOT}` in markdown**: commands fall back to Globbing the plugin root if it is not substituted, and pass the absolute path to agents.
5. **Lint runner** resolves the project's own CLI from `node_modules` (walking up) and runs it with `node` — same effect as `npx --no-install`, no shell needed on Windows.
6. **Extra scripts** (not in §11, for determinism): `run-checks.js`, `structure-check.js` (script parts of STYLE-17/28/38/42), `write-report.js`, `changes.js` (check + marker), `phase.js` (fix bookkeeping), `setup-project.js`, `scaffold.js`, `lib/{util,css,color,angular,sass-graph,findings}.js`. Extra custom Stylelint rule `ui-guard/bem` (STYLE-04).
7. **`images.theme.css` paths** use `../../../project-images/` (the spec's `../../` would resolve to `assets/scss/project-images`). Theme-source `url()`s are resolved as if swapped into the active folder.
8. **`mq()`**: `if()` replaced by `@if` (Sass 1.108 deprecates `if()`); output identical. **`hover()`** got an `@error` check for `$trans` (STYLE-38 asks for validation); output identical.
9. **Color ramp** for colors with L < 10% or > 97%: ramps toward 0%/100% so steps stay monotonic (the spec formula would invert).
10. **Merge clustering**: deterministic findings cluster only by fingerprint (two real findings on neighboring lines stay two); AI findings join within ±2 lines. Same-line distinct deterministic messages are joined, never dropped. Binary assets / `dist/` fingerprint on rule+file only.
11. **init** deletes Angular's comment-only default `src/styles.scss` after removing it from `styles` (one global entry).
12. `externalDependencies: ["assets/*"]` is written as specified; whether the Angular builder honors it for CSS `url()` was **not verified** (no Angular CLI here).
13. **Added after the build (developer's decision):** BEM written nested — elements and variants inside the block (`&__icon`, `&-secondary`); new rule **STYLE-47** (warning, `ui-guard/nest-block-parts`). Variants stay `-variant`, `--modifier` stays forbidden (STYLE-04). The palette template has one `:root` block per section; `no-duplicate-selectors` is off for theme token files.
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
5. **STYLE-48 + Foundation A/B** (`scripts/foundation.js`, `lib/scss-text.js`): structure gap check; Foundation A creates the missing tree from the
   templates (generic/elements as empty files, no button, the icon-filter utility only when the palette has filter tokens); Foundation B moves the
   global stylesheets into segment files in cascade order (fine-grained rank per segment + index position; out-of-order rules stay with the previous
   target and are listed), rebases `url()`s, and proves it by compiling every injected global + theme `<link>` with the project's sass before/after
   (rules in order; tokens, @font-face, @keyframes as sets). Any difference → full rollback, exit 6 → the fixer.
6. **Mechanical scss fixes** (`scripts/scss-fix.js`): charset, `@use "tools" as *`, px → px() (root font size aware, custom properties untouched),
   logical properties (not for bidirectional apps), `@media` min/max width/height → `mq()` (missing breakpoint keys added; `max-width: X` ≡ `width < X+1`
   at whole pixels), BEM nesting of contiguous top-level parts, prefix renames (SCSS + templates + TS, all-or-nothing per class). Each step is kept
   only when the compiled CSS of the file is unchanged.
7. **STYLE-11** no longer covers width/height/min-/max-* (rule text, rules.json, Stylelint plugin, fixer, skill, tests).
8. **ACCESS**: `rules/access-fix-tiers.md`, `selector-impact.js`, `screens.js --styles` + `style-diff.js` (computed style + box), impact levels in
   `lib/access-impact.js` (High/Medium/Low, non-problems rejected, repeats collapsed, fix-first list), `needs-decision.md` collected by `phase.js summary`.
9. Plan fixes: global stylesheets are Foundation B, never Pages (`*.component.scss` counts as a component); screenshot routes come from real routes
   (`route-files.realRoutes`: lazy children get their parent prefix, utility pages like `/no-connection` last). `tokens-check` ignores `var()` inside tools.
10. **Not done:** MEDIA-01..06 belong to no domain (still in `/ui-guard:check` and the hooks). Hex → HSL token conversion (STYLE-13) is not mechanical yet.
    The fixer/reviewer agents, `ng build`, screenshots and style-diff were not executed here (no Claude agents, Angular CLI or Playwright in the test env).
    Lazy bundles (`inject: false`) are listed as a decision, not moved.

## Package versions verified (npm, 2026-11-13)
stylelint 18.0.0 (17.16.0 used), stylelint-scss 7.5.0 (peer ^16.8.2‖^17‖^18), postcss-scss 4.0.9, eslint 10.15.0 (9.39.5 used — see Review fixes), angular-eslint 22.6.0 (eslint ^9‖^10), typescript-eslint 8.72.2 (TS <6.1 → 5.9.3), sass 1.108.2, playwright 1.65.1, pixelmatch 8.0.0 (ESM, loaded via dynamic import), pngjs 7.0.0.

## Self-test summary (`npm test`)
```
77/77 tests passed.
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
