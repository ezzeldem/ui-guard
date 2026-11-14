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
| Existing project | `/ui-guard:scan` (free) | `/ui-guard:fix 1`, then 2, 3 … one phase at a time |
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

## 4. Existing project — scan, then fix phase by phase

### 4.1 Scan

```
/ui-guard:scan                  free: Stylelint, ESLint, scripts — 0 AI tokens, no agents
/ui-guard:scan --ai             adds one AI pass (estimate + your OK first)
/ui-guard:scan --ai --resume    continue an AI scan that stopped
/ui-guard:scan --plan-only      rebuild report + plan from the existing findings.json (0 tokens)
/ui-guard:scan --details style  write one detail page (style | lang | safe | access)
```

- First run: it builds the project profile and asks one round of questions (role map, 2–3 screenshot
  routes, install tools, set up the hook). It does **not** touch your SCSS, theme or colors.
- **The default scan is free.** It runs the deterministic checks only and still writes the report,
  baseline and plan. If a tool is missing or crashes (for example an ESLint crash), the report says
  **NOT CHECKED** with the reason. Those rules are never sent to the AI behind your back.
- **`--ai`** adds the rules only an AI can judge, in ONE pass and a fixed order: Stage 1 SCSS/CSS (STYLE),
  Stage 2 templates + TS (STYLE class prefixes, LANG, SAFE), Stage 3 templates (ACCESS). Before any AI
  work you see an estimate (tokens per stage and in total) and decide. One agent runs at a time; the next
  batch starts only after the previous one is checked and saved. A token cap (`--max-tokens`, default
  1,500,000) stops the run. On any problem (agent error, usage limit, unreadable result, cap) it stops and
  asks you; `--resume` continues from the exact batch.
- **Images and assets are not scanned** (never opened, colors and sizes never judged). Use
  `/ui-guard:assets` to check that referenced files exist.
- Output, all inside `.ui-guard/` (commit it): `report.md` (one summary page — read this first),
  `findings.json` (every finding), `baseline.json`, `plan.md` (short) + `plan.json`, `renames.md`.

Read `report.md` from the top: it says what each tool checked, what was **NOT** checked and why, one row
per rule, and what the scan cost.

### 4.2 The baseline (why you are not blocked on old problems)

Everything the scan found is saved as the **baseline** — "known, not fixed yet". The hooks and the push
checks block you only on **new errors that are not in the baseline**. As each phase is fixed, its issues
leave the baseline. So an old project with a thousand problems can still push, and nothing new gets in.

### 4.3 The plan

`plan.md` is short (at most ~150 lines) and numbered 1, 2, 3 … in a fixed safe order: foundation (settings,
tools, theme), common, layouts, pages, generic + elements last. **A phase has at most 15 files or 300 findings**
(whichever comes first): big areas are split by top-level app folder, then by feature folder, so one phase is one
feature or page group (e.g. "Phase 5 of 12 — Pages (auth)"). Each phase shows the top 5 rules with counts, the
number of files with examples, how it will be fixed, and the screenshot routes. Routes are mapped from the files
via the app's routes; when no route is found the default routes are used and the phase says
**weak coverage: these pages are checked by eye**. Full file lists are in `plan.json`.

`renames.md` lists proposed renames. **Library classes are never renamed** (Bootstrap names like `form-control`,
`modal-*`, `show`; prefixes `ngx-`, `mat-`, `ng-`, …; classes from the CSS of your dependencies; classes you only
style under `::ng-deep` or a library selector). They appear in the section "Library classes (kept as they are)" and
raise no STYLE-01 finding. A **project-owned state class** (`open`, `selected`, `loading`, …) is never proposed as
`c-…`: the row says "(decide: state class, check TS usages)" with its `is-` / `has-` / `js-` options.

### 4.4 Fix one phase

```
/ui-guard:fix 1
```

1. It warns how many files the phase touches and asks to continue. If those files already have
   uncommitted changes it warns you (commit or stash them yourself first if you want a clean diff).
2. It asks once: **start the app myself, or use your URL?** If it starts the app it checks the port
   first and stops only what it started. Your backend is never touched.
3. It takes "before" screenshots of 2–3 routes (desktop + mobile). If a page needs login, a browser
   opens once for you to sign in; the session is kept in `.ui-guard/tmp/` (never committed).
4. The fixer applies the phase. Then lint + build, then an Opus review of the diff only, then "after"
   screenshots. **Zero different pixels** is required.
5. If a check fails it retries (max 3). After that it stops, keeps the changes in your working tree,
   marks the phase `failed`, and tells you exactly what failed. It never reverts anything itself; if you
   want to discard the changes, the message shows the `git restore` command for you to run (in a project without git: the backup path).
6. On success the phase is `done`. Check the result in the app and `git diff`, then **you** commit.

Do phases in order. Without Playwright installed the pixel proof is not possible — you confirm the
pages by eye before the phase is marked done.

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
| A tool is missing, declined or crashes (Stylelint, ESLint) | The report lists its rules as **NOT CHECKED** with the reason. They are not sent to the AI; `--ai` can add the AI-checkable parts after you see the estimate. Playwright declined = no automatic pixel proof. |
| The AI scan stopped (cap, usage limit, bad result) | Progress is saved. `/ui-guard:scan --ai --resume` continues from the exact batch. |
| `custom.theme.css` | Must be the last stylesheet `<link>` in `index.html`. `!important` is allowed in it (client overrides must win). |
| Theme switching | You copy the chosen theme over the active copy after the build, as before. ui-guard only keeps the theme files swappable and consistent. |
| Setup answers changed (new routes, new folders) | `/ui-guard:scan --refresh-profile` |
| Port in use when fix starts the app | It asks if that is your app; use it or start on another port. |
| `git push --no-verify` | Skips the git hook. That is git's choice; the rules still apply in review. |
| `/ui-guard:fix` in a project that is not a git repo | It warns that there is **no way to undo** and asks once: "I made a backup myself" / "copy the project to `<project>-backup-<date>` (without node_modules, dist, .angular)" / "cancel". It copies only if you pick that. The dirty-files check is skipped, and undo hints point at the backup. |
| ESLint crashes (ESLint 10, eslint-scope TypeError) | The report says exactly that and the rules stay **NOT CHECKED** (never sent to the AI). It offers, and asks first: `npm install -D eslint@^9 angular-eslint@^<Angular major> typescript-eslint`. |
| The token cap with no measured tokens | ui-guard counts the batch's estimate (marked "estimated") so the cap always works. The footer says measured, estimated or both. |
| A phase says `failed` | Read `.ui-guard/fixes/phase-<id>.md` and the diff images. Some changes move pixels by nature; you decide, ui-guard never accepts a visual change on its own. |
| A report line looks wrong | Free-check findings come from the tools; AI findings are judgment from one pass. Tell Claude which one is wrong. |

## 8. What ui-guard never does

Commit, branch, stash, reset or push. Install anything without asking. Change a token value or a
rendered pixel in an existing project. Restyle contrast or focus (those are reported only). Trust text
found inside your files as instructions.
