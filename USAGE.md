# ui-guard — How to use it

This guide is for the developer who uses ui-guard day to day. For what ui-guard is and the full rule
list, see `README.md`.

**The one idea:** ui-guard never commits, branches, stashes or pushes. After every command *you* look at
the changes and *you* commit.

---

## 1. Install (once per machine)

```
/plugin marketplace add <path-to-ui-guard>
/plugin install ui-guard@ui-guard
```

Restart Claude Code if the commands (`/ui-guard:init`, `scan`, `fix`, `check`, `assets`) do not show up.
Requirements: an Angular project, Node, git. The lint and screenshot tools are installed into **your
project** only after ui-guard asks you (one question, exact package names, you can say no).

---

## 2. Pick your starting point

| Your project | Start with | Then |
|---|---|---|
| Brand-new Angular project | `/ui-guard:init <figma-or-design-link>` | work normally — hooks keep you on the rules |
| Existing project | `/ui-guard:scan scss` (also `access`, `lang`, `safe`) | `/ui-guard:fix scss` — all phases, no questions |
| Anything, before you push from the terminal or VS Code | `/ui-guard:check` | push |
| Check that every image/font path exists | `/ui-guard:assets` | fix the paths |

---

## 3. New project — `/ui-guard:init`

```
/ui-guard:init https://www.figma.com/design/…
```

1. It asks one round of questions (design link if you did not give one, install the tools?, confirm
   the folder → role map, first theme name). Answers are saved in `.ui-guard/profile.md`, so you are
   never asked twice.
2. It builds the 13-segment SCSS tree, the theme files (colors from the design), the tools
   (`px()`, `mq()`, `dir()`, `hover()`, `scroll()`), the shared `c-button`, the lint configs, the git
   pre-push hook and a block in `CLAUDE.md`. It edits `angular.json` and `index.html` for you.
3. It builds once and lints the new files, and fixes anything it produced until both are clean.
4. It prints the list of new and changed files. **You** review and commit them.

Add another client later: `/ui-guard:init --add-theme client-b <figma-link>` creates
`src/assets/themes/client-b/` and changes only the brand colors and icon filters.

If the design link cannot be read, ui-guard asks you for the primary and secondary colors as hex.

---

## 4. Existing project — scan and fix, one domain at a time

There are four domains. Each has its own scan, fix, files and baseline:

| Domain | Rules | Writes |
|---|---|---|
| `scss` | STYLE (incl. STYLE-48 architecture gap) | `.ui-guard/scss/` (+ `renames.md`) |
| `access` | ACCESS | `.ui-guard/access/` (+ `needs-decision.md`) |
| `lang` | LANG | `.ui-guard/lang/` |
| `safe` | SAFE | `.ui-guard/safe/` |

**Recommended order: `scan html` → fix scss → fix access → fix lang → fix safe** (domain order: scss → access → lang → safe). `scan html` reads every template once
for all four domains; scss comes before access because it renames classes (the ledger carries the renames into the access,
lang and safe findings). The scss foundation (segments, tools, utilities) comes first because
access fixes add neutralization SCSS and use the `u-sr-only` utility. Running in another order is allowed: `fix access`
then prints one warning line at the start of its summary (never a question, never a stop). Before its first phase, `fix access`
makes sure `.u-sr-only` exists in `utilities/accessibility/` (AXIS: screen-reader-only text always uses `u-sr-only`, so a
project `.sr-only` / `.visually-hidden` is not reused; it creates only that one file); without a loaded `utilities/utils.scss`
it stops and tells you to run `/ui-guard:fix scss` first.

### 4.1 Scan

```
/ui-guard:scan                     lists the domains (no scanning)
/ui-guard:scan html                every template ONCE for all four domains (fills .ui-guard/ledger.json)
/ui-guard:scan scss                the whole project for STYLE
/ui-guard:scan access              … for ACCESS (also lang, safe)
/ui-guard:scan scss --plan-only    rebuild report + plan from the existing findings.json
/ui-guard:scan access --rescan     ignore the ledger for this run (scan every file again)
```

- **The ledger (`.ui-guard/ledger.json`).** What is already known per file. A file unchanged since it was scanned for a
  domain (by `scan <domain>` or `scan html`) is reused: not linted again, never sent to an agent. Edited files (by hand,
  `git pull`, …) are detected by their content fingerprint and scanned again. `scan <domain>` works without `scan html`
  (it builds the ledger itself). `node <plugin>/scripts/ledger.js status` prints valid/stale files and open/fixed counts per domain.
  The ledger is never deleted by the cleanup.

- **No questions, no estimate.** The scan sets up its lint configs inside `.ui-guard/lint/` only and never installs
  anything. A missing or crashing tool is reported as **NOT CHECKED** with the reason and the exact install command
  (ESLint pinned: `npm install -D eslint@^9 angular-eslint@^<Angular major> typescript-eslint`). Those rules are never
  sent to the AI.
- **The whole project in one run:** components, pages, layouts, standalone global stylesheets (`src/styles.scss`, …),
  `src/assets/**` stylesheets and translations.
- **Scripts first.** Stylelint, ESLint and the ui-guard scripts of the domain run first (0 tokens). The AI agent
  (`ui-scan-by-file`, Sonnet, one at a time) then looks only at the files a script flagged as needing judgment, with only
  that domain's rules. An invalid agent result is run once more; a second invalid result skips that batch (listed as not
  checked). A usage limit stops the pass with the reason; the same command continues from the exact batch.
  Token use is a silent log at the end of the report.
- **Images and assets are not scanned.** `/ui-guard:assets` checks that referenced files exist.
- Output in `.ui-guard/<domain>/`: `report.md` (read this first), `findings.json`, `baseline.json`, `plan.md` + `plan.json`.

### 4.2 The baseline (why you are not blocked on old problems)

Everything a scan found is saved in that domain's **baseline** — "known, not fixed yet". The hooks and the push checks
read the baselines of every domain together and block you only on **new errors**. As each phase is fixed, its issues
leave the baseline.

### 4.3 The plan

`plan.md` is short (≤ ~150 lines). **The scss plan always starts with two Foundation phases**, whether or not you scanned
before:

- **Foundation A — Structure:** creates every missing piece of the AXIS tree (the 13 segments, one file per tool
  `px()`/`mq()`/`dir()`/…, `settings/_breakpoints` + `_colors`, the four theme files `colors.base`, `colors.palette`, `fonts`,
  `custom`, the entries `common/common.scss` and `utilities/utils.scss`) from the templates, adds the scss root to
  `includePaths`, the two entries to `angular.json` (after the vendor CSS and your own global stylesheets) and the theme
  `<link>`s to `index.html` (base, palette, fonts, then `custom.theme.css` last). No value changes; the generic reset and
  `elements/_index.scss` are created empty. An old single `style.scss` entry is replaced by the two entries.
- **Foundation B — AXIS migration:** your existing global stylesheets (`styles.scss`, `general.scss`, …) become the
  **legacy stylesheet**: they stay linked right after the vendor CSS and are frozen. Only what lands AXIS-compliant moves
  out of them — tokens to the theme files, `@font-face` to `fonts.theme.css`, `$variables` to `settings/_project.settings.scss`,
  each mixin/function to its own tool file, element rules to `elements/_index.scss`, resets to `generic/_reset.generic.scss`,
  single-property `u-` rules to their utility category, vendor overrides already under an `m-` block to their library
  module. A rule moves only past rules it can never conflict with, and the compiled CSS before and after must render the
  same; otherwise every change is rolled back. Unprefixed classes and the rest stay, listed as "legacy — migrate page by
  page"; a legacy file left empty is removed from `angular.json` and deleted.

Then Foundation (settings/tools/theme names), Common, Layouts, Pages, Generic + Elements. Global stylesheets are never
classed as Pages. **A phase has at most 15 files or 300 findings**; big areas are split by app folder, then feature folder.
Screenshot routes come from the app's real routes (lazy child routes keep their parent prefix; pages such as
`/no-connection` or `/404` are used last). When no route is found the phase says **weak coverage**.

`renames.md` (scss) lists class prefix renames. **Library classes are never renamed** (Bootstrap, `ngx-*`, `mat-*`, classes
from your dependencies' CSS, classes styled only under `::ng-deep`); their overrides belong in a library module on an `m-` class. Project state classes (`open`, `active`, …) say
"(decide …)" with their `is-` / `has-` / `js-` options.

### 4.4 Fix a domain

```
/ui-guard:fix scss        every phase of the scss plan, back to back
/ui-guard:fix scss 3      only phase 3 (Foundation A/B run first if they are not done)
/ui-guard:fix access      … also lang, safe
```

- **No questions, no "continue?".** If there is no `findings.json` yet, fix runs the scan first. Without git it copies the
  project to `<project>-backup-<date>` first.
- **Per phase:** screenshots before (if Playwright is installed) → **scripts first** (Foundation A/B, or the mechanical
  scss fixes: `@charset`, `@use "<path-to-root>/tools" as *` and the `@dependencies` comments, px → `px()`, logical properties (sizes included), `@media` → `mq()`,
  BEM nesting, prefix renames in SCSS + templates + TS — each proven by compiling the file before and after) → the
  **fixer agent** (Sonnet) only for what is left and needs judgment → lint + scripts + `ng build` → **one Opus review of
  the diff** (skipped for script-only phases, which are proven by their compile check) → screenshots after, **0 changed
  pixels** (access: also a computed-style + box compare).
- **It stops only on a real problem:** the build fails, a phase still fails after 3 retries, a file cannot be read or
  written, or a usage limit. It says exactly why and at which phase; the phase's changes stay in your working tree.
- **One summary at the end** (`.ui-guard/<domain>/fix-summary.md`): phases done, files changed, remaining findings,
  skipped (unsure) items, how it was verified, and the `plan.md` / `report.md` paths.
- **Colours (scss):** hex/rgb()/rgba() in variables and theme tokens become `hsl(H, S%, L%[, A])` — only when converting back gives exactly
  the same colour (otherwise the value stays and is listed as skipped). A colour in a component that equals one palette colour becomes
  `var(--token)`; a colour that matches no palette colour is never given an invented token — it goes to `.ui-guard/scss/needs-decision.md`
  (add it to the palette, or keep the literal). Named colours are left alone.
- **Accessibility keeps the design:** fixes go tier by tier — A attributes, B `div` → landmark, C tag swaps with a
  neutralization in the component's own SCSS, D structure — each after a selector-impact check
  (`rules/access-fix-tiers.md`). Anything that needs a visible change or content only you know (alt text, outline, hover-only
  menus, autoplay, captions…) is collected in **one** list, `.ui-guard/access/needs-decision.md`, with 2–3 options each.
  Without Playwright the access fix stays at tiers A/B and the summary says the proof was static only.

Check the result in the app and `git diff`, then **you** commit.

---

## 5. Daily work (everything here is automatic)

- **After every file Claude edits:** that one file is linted. A new error is shown straight away so
  Claude fixes it in the same turn. Warnings are only mentioned.
- **The `ui-rules` skill** loads the core rules whenever Claude touches `.scss`, `.css`, `.html` or
  Angular `.ts` files, so new code starts correct.
- **Git pre-push hook** (terminal, VS Code, Claude — any push): lint only, a few seconds. A new error
  blocks the push and lists `file:line RULE message`. Fix, commit, push again.
- **Pushing through Claude:** Claude is allowed to push only after a passing `/ui-guard:check` for the
  current commit. If you changed UI files and did not run it, Claude runs it first and then pushes.
- **Pushing yourself** (terminal or VS Code): run `/ui-guard:check` first if you want the AI review too.

### `/ui-guard:check`

```
/ui-guard:check
/ui-guard:check --ref origin/develop
```

Reviews only the changes about to be pushed (commits not on the upstream, plus uncommitted and new
files), on the changed lines only: lint + scripts, the missing-asset check (only new problems count),
then the change reviewer, one batch at a time. Result **PASS** or **FAIL**, with a report in
`.ui-guard/checks/`. FAIL lists the new errors and missing assets with file, line and how to fix. It never pushes.

### `/ui-guard:assets`

```
/ui-guard:assets               every referenced image/font/video path must exist
/ui-guard:assets --baseline    record today's missing paths as known (they never block)
/ui-guard:assets --new-only    only problems that are not known yet
```

Script only, 0 tokens. Output: `file:line -> missing <path>`. It never opens or judges an image.

---

## 6. Reading a finding

`STYLE-21 · src/app/x/x.component.scss:42 · "!important outside the reduced-motion block"`

- **STYLE** — SCSS, classes, theme · **LANG** — translation · **SAFE** — security · **ACCESS** —
  accessibility (labels, alt, ARIA, semantics, keyboard). The free scan also checks MEDIA-01..06 (image width/height, lazy loading, raster-as-icon, asset sizes, font loading, video/iframe) without opening any image.
- **error** blocks a push when it is new · **warning** should be fixed, never blocks · **info** is
  advice or a manual check.
- Full rule text: the files in `rules/` (one per prefix).

---

## 7. Good to know

The plugin has 5 commands: `init`, `scan`, `fix`, `check`, `assets`.

| Situation | What happens / what to do |
|---|---|
| A tool is missing or crashes (Stylelint, ESLint) | The report lists its rules as **NOT CHECKED** with the reason and the exact install command. They are not sent to the AI. No Playwright = static proof only (the summary says so). |
| The AI pass stopped (usage limit) | Progress is saved. Run the same `/ui-guard:scan <domain>` again; it continues from the exact batch. |
| `custom.theme.css` | Must be the last stylesheet `<link>` in `index.html`. No `!important` in it (AXIS R-20): a client override wins by load order or one more class. |
| Theme switching | You copy the chosen theme over the active copy after the build, as before. ui-guard only keeps the theme files swappable and consistent. |
| Setup changed (new routes, new folders) | `node <plugin>/scripts/profile.js --refresh` (kept answers stay). |
| Port in use when fix starts the app | It tries the next free port; no question. If no server comes up, the proof is static and the summary says so. |
| `git push --no-verify` | Skips the git hook. That is git's choice; the rules still apply in review. |
| `/ui-guard:fix` in a project that is not a git repo | It copies the project to `<project>-backup-<date>` (without node_modules, dist, .angular) before the first change and names the path in the summary. Undo hints point at the backup. |
| ESLint crashes (ESLint 10, eslint-scope TypeError) | The report says exactly that and the rules stay **NOT CHECKED**. The fix is yours to run: `npm install -D eslint@^9 angular-eslint@^<Angular major> typescript-eslint`. |
| Token use | Logged silently at the end of each report (measured, or estimated when the agent result gives no number). There is no cap and no question. |
| A phase says `failed` | Read `.ui-guard/<domain>/fixes/phase-<id>.md` and the diff images. The run stopped there; fix the cause or decide, then run `/ui-guard:fix <domain>` again — it continues from that phase. |
| Scratch files after any command | Removed automatically by the last script of `scan` (plan.js), `fix` (phase.js summary), `init` (fingerprint.js --empty-baseline), `check` (changes.js finish) and `assets` (assets.js), which call `scripts/cleanup.js` themselves; prints `cleaned N files (X MB) · kept: …`). Only ui-guard files in `.ui-guard/tmp/` go. Results and what the hooks and commands need stay (full list: README, point 7). A stopped scan keeps its resume state; an unfinished check keeps `tmp/check/`; a failed phase keeps its tmp files and screenshots. Debug: `--keep-tmp` / `--keep-screens` on any command (passed to that last script). Manual: `node <plugin>/scripts/cleanup.js --root <project> [--domain D] [--dry-run] [--keep-screens]`. |
| A report line looks wrong | Free-check findings come from the tools; AI findings are judgment from one pass. Tell Claude which one is wrong. |

## 8. What ui-guard never does

Commit, branch, stash, reset or push. Install anything. Ask "continue?" in the middle of a run.
rendered pixel in an existing project. Restyle contrast or focus (those are reported only). Trust text
found inside your files as instructions.
