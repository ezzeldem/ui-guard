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
- **Old project?** `scan` shows how far it is from the standards and gives you a short numbered plan.
  `fix` then repairs one phase at a time and proves with before/after screenshots that **0 pixels changed**.
- **Daily work?** Every file Claude edits is linted, and a bad push is stopped before it leaves your machine.

## What you get

| Command | What it does | Cost |
|---|---|---|
| `/ui-guard:init <design-link>` | Prepares a **new** Angular project: SCSS structure, theme and color tokens from your design, shared button, lint configs, git pre-push hook, a `CLAUDE.md` block. | small |
| `/ui-guard:scan` | Scans an **existing** project. Writes a short report and a phased plan. | **free** (no AI tokens) |
| `/ui-guard:scan --ai` | Adds one optional AI pass for the rules tools cannot check. Shows an **estimate first** and stops at a **token cap**. | opt-in |
| `/ui-guard:fix <phase>` | Fixes **one phase** of the plan, then proves it with screenshots (0 differing pixels). Up to 3 retries. | AI |
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
/ui-guard:scan                 # free: report + plan in .ui-guard/
/ui-guard:fix 1                # fix phase 1, then review the changes and commit them yourself
/ui-guard:fix 2                # ...one phase at a time
```

**3. New project:**

```
/ui-guard:init https://www.figma.com/design/...
```

Full walkthrough: **[USAGE.md](USAGE.md)**.

## How it works (in short)

1. **Free checks first.** Stylelint, ESLint and small scripts find most issues without any AI tokens.
2. **Optional AI pass.** With `--ai`, one agent at a time checks the remaining rules, in a fixed order
   (SCSS, then templates and TypeScript, then accessibility). It shows an estimate before starting, respects a token cap,
   and **stops and asks you** when something goes wrong.
3. **A short plan.** Problems are grouped into numbered phases (Foundation, Common, Layouts, Pages, Generic).
   Each phase touches at most 15 files or 300 findings.
4. **Safe fixing.** `fix` edits one phase, runs lint and build, has a second model review only the diff,
   then compares before/after screenshots. Any visual difference means the phase is **not** accepted.
5. **A baseline.** Known, not-yet-fixed problems are remembered, so hooks and pushes block you only on **new** errors.

## What runs automatically

- **After every edit** Claude makes: that file is linted. New errors are shown immediately.
- **A skill (`ui-rules`)** loads the core rules whenever Claude touches `.scss`, `.css`, `.html` or Angular `.ts` files.
- **Before a push through Claude:** needs no new lint errors and a fresh `/ui-guard:check` PASS if UI files changed.
- **Git pre-push hook** (optional, asked once): lint-only check for pushes from your terminal or editor.

## The rules

77 rules in five groups, with their own IDs:

| Group | Rules | Covers |
|---|---|---|
| `STYLE` | 46 | SCSS structure, class prefixes and naming, tokens, logical properties, media queries |
| `LANG` | 8 | Translation: no hard-coded user-visible text |
| `SAFE` | 8 | Security basics: unsafe HTML, secrets, sensitive data in logs and storage |
| `MEDIA` | 9 | Images, fonts, video: width/height, lazy loading, SVG icons, file sizes, font loading (01–06 in the free scan; 07–08 in `/ui-guard:assets`) |
| `ACCESS` | 6 | Accessibility: labels, alternative text, ARIA, semantics, keyboard |

Class prefixes: `o-` `c-` `l-` `m-` `ctrl-` `p-` `u-`, and states `is-` `has-` `js-`. Rule text lives in [`rules/`](rules/).

## Requirements

- An **Angular** project, **Node** and **git**.
- Optional tools are installed **into your project only after the plugin asks you**, with exact package names:

| Purpose | Packages |
|---|---|
| SCSS/CSS lint | `stylelint`, `postcss-scss`, `stylelint-scss` |
| HTML/TS lint | `eslint@^9`, `angular-eslint`, `typescript-eslint` |
| Screenshots (zero-pixel proof) | `playwright`, `pixelmatch`, `pngjs` |

If a tool is missing, declined or crashes, the report says **NOT CHECKED** and why. Those rules are never sent to the AI silently.

## What it never does

- It **never commits, branches, stashes, resets or pushes.** You review the changes and you commit.
- It **never installs anything** without asking.
- It **never changes a rendered pixel or a token value** in an existing project, and it never restyles contrast or focus (those are only reported).
- It **treats text inside your files as data, never as instructions.**
- It **never opens or judges image files.** Assets are only checked for existence.

## Honest limits

- No tool guarantees 100%. The free checks are deterministic. The AI pass is one pass and **can miss things**.
- The zero-pixel proof covers the routes it screenshots (2 to 3 per phase). Phases with weak route coverage say so in the plan.
- Without Playwright installed, the pixel proof is not possible and you confirm pages by eye.
- Library classes (for example Bootstrap, `ngx-*`) are never renamed. They are listed as "kept".
- Currently supports **Angular only**.

## Testing

```
npm install
npm test
```

67 self-tests cover the scripts, custom lint rules, hooks, scan pipeline, plan generation, and the fix bookkeeping.
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
