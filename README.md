# ui-guard

**A Claude Code plugin that keeps Angular UI code on your team's UI standards.**
It sets up new projects correctly, finds and fixes problems in old projects one safe phase at a time
(with a screenshot proof that nothing changed visually), and checks every edit and every push.

> Status: **beta**. The self-tests pass (see [Testing](#testing)). The full "fix a phase with a zero-pixel proof"
> flow has not yet been validated on a large real-world project, so try it on a copy of your project first.

---

## What problem does it solve?

Teams agree on UI standards (SCSS structure, class naming, translation, security, accessibility), and then the standards
slowly drift. ui-guard turns those standards into rules that are **checked automatically**:

- **New project?** `init` builds the correct structure, theme and tooling from day one.
- **Old project?** `scan <domain>` shows how far it is from the standards and gives you a short numbered plan per domain.
  `fix <domain>` then runs every phase to the end (no questions) and proves each one: compiled CSS compared before/after,
  lint, build, and — when Playwright is installed — before/after screenshots with **0 changed pixels**.
  For SCSS it first builds **our structure** around the existing styles (segments, tools, theme, one entry) without a visual change.
- **Daily work?** Every file Claude edits is linted, and a bad push is stopped before it leaves your machine.

## What you get

| Command | What it does | Cost |
|---|---|---|
| `/ui-guard:init <design-link>` | Prepares a **new** Angular project: SCSS structure, theme and color tokens from your design, shared button, lint configs, git pre-push hook, a `CLAUDE.md` block. | small |
| `/ui-guard:scan scss|access|lang|safe` | Scans the **whole** project for one domain (STYLE, ACCESS, LANG or SAFE). Scripts and lint first; the AI only on files a script flagged as needing judgment. No questions, no estimate. Writes `.ui-guard/<domain>/findings.json`, `report.md`, `plan.md`. Without a domain it lists the four. | scripts free; AI only where needed |
| `/ui-guard:fix scss|access|lang|safe [n]` | Runs **all** phases of the domain back to back (or only phase `n`). Scripts do the mechanical work; the fixer agent gets only what needs judgment; one diff review per phase. Stops only on a real problem, then prints one summary. | scripts free; AI where needed |
| `/ui-guard:check` | Reviews what you are about to push. PASS lets a Claude-made `git push` through. | small |
| `/ui-guard:assets` | Checks that every image or font referenced in your code really exists. Script only. | **free** |

## Quick start

**1. Install** (inside Claude Code):

```
/plugin marketplace add <owner>/ui-guard
/plugin install ui-guard@ui-guard
```

If you cloned the repository, use its folder path instead of `<owner>/ui-guard`. Restart Claude Code if the commands do not appear.

**2. Existing project** (the common case):

```
/ui-guard:scan scss           # report + plan in .ui-guard/scss/ (also: access, lang, safe)
/ui-guard:fix scss            # runs every phase: Foundation A (structure), Foundation B (move globals), then the rest
/ui-guard:fix access          # design-preserving accessibility fixes; decisions collected in .ui-guard/access/needs-decision.md
```

Recommended order of domains: **scss → access → lang → safe** (access fixes use the scss structure, tools and the visually-hidden
utility). It is advice, not a gate: `fix access` prints one warning line in its summary when scss is not clean yet.

**3. New project:**

```
/ui-guard:init https://www.figma.com/design/...
```

Full walkthrough: **[USAGE.md](USAGE.md)**.

## How it works (in short)

1. **Domains.** `scss` (STYLE), `access` (ACCESS), `lang` (LANG), `safe` (SAFE). Each scan loads only its own rules and writes only its own files.
2. **Scripts first.** Stylelint, ESLint and small scripts find most issues with zero tokens. The AI agent (one at a time) only looks at
   files a script flagged as needing judgment. Tokens are logged silently in the report — never a question, never a cap.
3. **SCSS foundation first.** The scss plan always starts with *Foundation A* (create the missing segments, tools, settings, theme and
   entry from the templates — no value changes) and *Foundation B* (move `styles.scss`, `general.scss`, … into the segments in the
   same cascade order, proven by compiling before/after; anything unproven is rolled back). Rule STYLE-48 reports the gap.
4. **Mechanical work by scripts.** `@charset`, `@use` of the tools, px → `px()`, physical → logical (width/height stay as written),
   `@media` → `mq()`, BEM nesting and class prefix renames (SCSS + templates + TS) — each proven neutral by compiling the file before
   and after. What cannot be proven is listed as "skipped (unsure)".
5. **Design-preserving accessibility.** Fixes go tier by tier (attributes → landmarks → tag swaps with a neutralization → structure),
   each after a selector-impact check; anything visible goes to one "needs decision" list with options. Report by High/Medium/Low impact.
6. **Run to the end.** `fix` does not ask between phases. It stops only when the build fails, a phase still fails after 3 retries,
   a file cannot be read or written, or a usage limit is hit — and says exactly why and where.
7. **Cleans up after itself.** The LAST script of every flow calls `scripts/cleanup.js` itself, so it never depends on the agent: `plan.js` (scan),
   `phase.js summary` (fix), `lib/fingerprint.js --empty-baseline` (init), `changes.js finish` (check) and `assets.js` (assets). 0 tokens, no question; it prints
   one line: `cleaned N files (X MB) · kept: …`. It deletes only ui-guard's own scratch under `.ui-guard/tmp/` (scan batches, screenshots, diffs,
   computed-style snapshots, dev-server log/pid, lint temp, check batches) and never anything outside `.ui-guard/` (real paths are resolved, symlinks
   are not followed, a locked file is listed and skipped). Project files, the SCSS tree and the non-git backup copy are never touched.
   - **Kept, results:** per domain `report.md`, `plan.md`, `fix-summary.md`, `access/needs-decision.md`; `checks/*.md`.
   - **Kept, needed to work** (found by reading the hooks and commands): per domain `plan.json` (fix resumes from it), `findings.json` and `baseline.json`
     (hooks, pre-push, `check`), `profile.md`, `scss/renames.md`, `scss/foundation-move.json`, `assets-baseline.json`, `ledger.json` (what is known per file;
     every scan and fix reads it), `lint/` (the post-edit hook and `check` run these configs), `tmp/check-pass.json` (the pre-push marker), `tmp/backup.json` (backup pointer), `tmp/auth/` (login state). Nothing else is kept.
   - **Not cleaned when it would lose something:** a scan stopped before all batches are done keeps `tmp/<domain>/scan/`; a check that did not reach
     `changes.js finish` keeps `tmp/check/`; a failed fix phase keeps its tmp files and before/after/diff images (finished phases are cleaned).
   - **Flags:** `--keep-tmp` (on any command) skips the cleanup; `--keep-screens` (cleanup.js) keeps only screenshots; `--dry-run` deletes nothing.
     Manual: `node scripts/cleanup.js --root <project> [--domain D] [--dry-run]`.
8. **The ledger — each file is read once.** `.ui-guard/ledger.json` (script-owned, 0 tokens) keeps one entry per UI file: its content
   fingerprint, cheap facts (classes, tags, ids, inputs, images, aria/role, defined classes, imports — short snippets only) and per domain
   the findings with a stable key (rule + normalized snippet, not the line), a status (open / fixed / skipped / needs-decision /
   needs-rescan) and `fixedAt`. **Trust rule:** an entry counts for a domain only while the file's fingerprint is unchanged; anything
   else (edited by hand, `git pull`, unreadable or old-version ledger) is scanned again. **Global invalidation:** reused lint rows also
   need the same *lint context* (`.ui-guard/lint/`, SCSS tools/settings/theme/utilities, theme sources, root lint configs, `angular.json`,
   linter versions) and reused AI rows the same *domain rules* (`rules/<domain>.md`, its `rules.json` entries, its AI rule list); a change
   re-lints / re-judges the unchanged files for that run. `/ui-guard:scan html` reads every template
   ONCE for all four domains (one agent read per file with every pending domain's rules); later `scan <domain>` runs reuse valid
   files — not linted, never sent to an agent. `fix <domain>` changes only its own findings, records the class renames, and carries
   the other domains' findings across its edits (re-located by stable key; not found → needs-rescan, never dropped). An edit the
   phase cannot explain marks every domain of that file needs-rescan. `node scripts/ledger.js status` shows valid/stale and open/fixed
   counts; `--rescan` ignores the ledger for one run. No full source and no secret values (SAFE-04: path + rule only) are stored.
9. **A baseline per domain.** Known, not-yet-fixed problems are remembered, so hooks and pushes block you only on **new** errors.

## What runs automatically

- **After every edit** Claude makes: that file is linted. New errors are shown immediately.
- **A skill (`ui-rules`)** loads the core rules whenever Claude touches `.scss`, `.css`, `.html` or Angular `.ts` files.
- **Before a push through Claude:** needs no new lint errors and a fresh `/ui-guard:check` PASS if UI files changed.
- **Git pre-push hook** (optional, asked once): lint-only check for pushes from your terminal or editor.

## The rules

96 rules in five groups, with their own IDs:

| Group | Rules | Covers |
|---|---|---|
| `STYLE` | 48 | SCSS structure (incl. STYLE-48 architecture gap), class prefixes and naming, tokens, logical properties (width/height excepted), media queries |
| `LANG` | 8 | Translation: no hard-coded user-visible text |
| `SAFE` | 8 | Security basics: unsafe HTML, secrets, sensitive data in logs and storage |
| `MEDIA` | 9 | Images, fonts, video (01–06 in `/ui-guard:check` and the hooks — no scan domain; 07–08 in `/ui-guard:assets`) |
| `ACCESS` | 23 | Accessibility: labels, alternative text, ARIA, semantics, keyboard, forms, links, document, live regions, widgets, media, embeds, tables, image box, motion. Every finding has an impact (High/Medium/Low) and a fix tier (A–D or needs-decision) |

Class prefixes: `o-` `c-` `l-` `m-` `ctrl-` `p-` `u-`, and states `is-` `has-` `js-`. Rule text lives in [`rules/`](rules/).

## Requirements

- An **Angular** project, **Node** and **git**.
- Optional tools are **never installed by the plugin**. Install them yourself with these exact packages (the scan prints the command):

| Purpose | Packages |
|---|---|
| SCSS/CSS lint | `stylelint`, `postcss-scss`, `stylelint-scss` |
| HTML/TS lint | `eslint@^9`, `angular-eslint`, `typescript-eslint` |
| Screenshots (zero-pixel proof) | `playwright`, `pixelmatch`, `pngjs` |

If a tool is missing, declined or crashes, the report says **NOT CHECKED** and why. Those rules are never sent to the AI silently.

## What it never does

- It **never commits, branches, stashes, resets or pushes.** You review the changes and you commit.
- It **never installs anything.**
- It **never changes a rendered pixel or a token value** in an existing project, and it never restyles contrast or focus (those are only reported).
- It **treats text inside your files as data, never as instructions.**
- It **never opens or judges image files.** Assets are only checked for existence.

## Honest limits

- No tool guarantees 100%. The free checks are deterministic. The AI pass is one pass and **can miss things**.
- The zero-pixel proof covers the routes it screenshots (2 to 3 per phase). Phases with weak route coverage say so in the plan.
- Without Playwright installed, the proof is static only (compile, lint, build); the summary says so, and access fixes stay at the attribute/landmark tiers.
- Library classes (for example Bootstrap, `ngx-*`) are never renamed. They are listed as "kept".
- Currently supports **Angular only**.

## Testing

```
npm install
npm test
```

94 self-tests cover the scripts, custom lint rules, hooks, scan pipeline, plan generation, and the fix bookkeeping.
The AI agents themselves are tested with simulated output only.

## Repository layout

```
.claude-plugin/   plugin and marketplace manifests
commands/         the 5 slash commands
agents/           scan, fix, and review agents
hooks/            post-edit lint and pre-push guard
skills/           ui-rules skill
rules/            rule text and rules.json
scripts/          deterministic checks (Node built-ins only)
templates/        SCSS tree, theme, button, lint configs, git hook
tests/            self-tests and fixtures
```

## Credits

The rules are based on the team's UI standards (the AXIS SCSS architecture and the UI team's review rules for
localization, security, images/assets and accessibility). ui-guard re-expresses them for Angular with its own rule IDs
and automation.

Built by Ezz Elden Mohamed.

## License

Not yet licensed: all rights reserved. Please ask the author before reusing the code.
