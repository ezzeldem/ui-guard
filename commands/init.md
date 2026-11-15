---
description: Set up a NEW Angular project on the team UI standards — 13-segment SCSS tree, theme and colors (from a Figma / Claude Design link), tools, shared button, lint, git hook, CLAUDE.md. Also --add-theme <name> <link>.
argument-hint: "[figma-or-design-link] | --add-theme <name> <link>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, PowerShell, AskUserQuestion
---

# /ui-guard:init

Arguments: `$ARGUMENTS`

You are setting up ui-guard on a **new** Angular project. Follow these steps in order. Reply to the developer in the
language they write in (Arabic or English); every file you write is English. Keep replies short: a summary + file paths.

**Plugin root.** Below, `PLUGIN` means `${CLAUDE_PLUGIN_ROOT}`. If that text was not replaced by a real path, find the
plugin root with Glob (`**/ui-guard/scripts/scaffold.js` under `~/.claude/plugins`) and use that folder. Run scripts as
`node "PLUGIN/scripts/<name>.js" --root "<project root>"`.

**Never** run git write commands (commit, branch, checkout, stash, reset, rebase, tag, push). Never install anything without the question in step 2.

## 0. `--add-theme <name> <link>`
If the arguments start with `--add-theme`: read the profile, read the brand colors from the link (§ step 3 rules), then run
`node PLUGIN/scripts/scaffold.js add-theme --name <name> --primary <hex> --secondary <hex>` (it copies the original theme and changes
**only** the six HSL parts and the four filter values). Then run `node PLUGIN/scripts/theme-check.js --print` (STYLE-35 must be clean) and `node PLUGIN/scripts/assets.js` (every referenced theme image must exist)
(if the new theme needs its own client images, tell the developer which file names must exist in `src/assets/themes/<name>/project-images/`).
Record the color sources in the profile (`profile.js --answers`). Stop here.

## 1. Pre-checks
1. `angular.json` must exist in the project root (nearest folder up). Otherwise stop: "This is not an Angular project."
2. If `.ui-guard/profile.md` exists → stop: "ui-guard is already set up here. Use `/ui-guard:scan <domain>` (scss, access, lang, safe)."
3. If `src/assets/scss/` already has authored files (more than Angular's defaults), ask (AskUserQuestion): "This looks like an existing project. `init` builds a fresh structure and could clash with yours. Run `/ui-guard:scan scss` + `/ui-guard:fix scss` instead (recommended: it builds our structure around the existing styles with no visual change), or continue with init?" Default → stop and tell them to run `/ui-guard:fix scss`.
4. Run `node PLUGIN/scripts/profile.js --refresh` to detect the project (it writes `.ui-guard/profile.md`; you will complete it in step 8).

## 2. Questions — ONE AskUserQuestion round, max 4 questions
Ask only what is not already known:
1. The Figma or Claude Design link (skip if given as the argument). "None" is allowed → default colors (ask for primary/secondary hex in step 3) and the standard button.
2. Install the tools (devDependencies). Show exactly (check `node -v`: Stylelint 18 needs Node ≥ 22.22.2 / 24.15; otherwise use `stylelint@^17`):
   - SCSS/CSS lint: `stylelint`, `postcss-scss`, `stylelint-scss`
   - HTML/TS lint: `eslint@^9`, `angular-eslint@^<project Angular major>`, `typescript-eslint` (ESLint is pinned to 9: ESLint 10 crashes in eslint-scope; keep an existing ESLint that works — `node PLUGIN/scripts/setup-project.js tools` prints the exact commands and tests it)
   - Screenshots: `playwright`, `pixelmatch`, `pngjs` + `npx playwright install chromium`
   Options: install all / choose / none. Say once: declined tools mean those rules are checked by AI instead (more quota).
3. Confirm the folder → role map for Angular component styles (show the detected map from the profile: `l-` layout, `p-` pages, `c-` shared components, `m-`/`ctrl-` widgets).
4. Theme name for the first theme (default `original-theme`).

Save every answer right away: `node PLUGIN/scripts/profile.js --answers '<json>'` with e.g.
`{"projectType":"new","designLink":"…","themeName":"original-theme","roleMap":[…],"toolsDeclined":[…],"answers":{"roleMapConfirmed":true,"lang":"ar","dir":"rtl"}}`.
If the developer agreed to installs, run exactly the listed `npm install -D …` (and `npx playwright install chromium`) commands, nothing else.

## 3. Colors and icons from the link (§9)
- **Figma:** use a Figma MCP/connector tool if one is in this session (variables, styles, components, image export). Otherwise use the
  Figma REST API with a token from the `FIGMA_TOKEN` environment variable (ask the developer to set it; never write the token anywhere).
  Otherwise ask for the brand colors.
- **Claude Design link:** use any available tool to read it; otherwise ask the developer to export its tokens/colors.
- If the link cannot be read, ask for the primary and secondary brand colors as hex and continue. **Never guess colors.**
- Brand = `--main-500`, secondary = `--secondary-500`. If the design defines a full ramp (e.g. `Primary/100…900`), pass it as `--primary-ramp '{"100":"#…",…}'`.
- Icons exported from the design: SVG; a **single-color** icon is saved with its color replaced by black (`#000`); multi-color icons as exported.
  Shared icons → `src/assets/images/icons/`, client-specific → each theme's `project-images/`. In templates single-color icons get `u-filter-*`.
- Record the source of every value in the profile (`colorSources`).

## 4. Build the structure
1. `node PLUGIN/scripts/scaffold.js scss` — the 13 segments, tools, settings, generic, elements, common, utilities, the standard button.
2. `node PLUGIN/scripts/scaffold.js theme --name <theme> --primary <hex> --secondary <hex> [--primary-ramp …] [--secondary-ramp …]`
   — active theme (`src/assets/scss/theme/`), theme source (`src/assets/themes/<theme>/`), project images, shared asset folders.
   It prints each filter's ΔE; if the developer installed Playwright, verify each filter with `node PLUGIN/scripts/icon-filter.js <hex> --verify --root <project>`
   and replace any value whose browser ΔE is better. Otherwise say the filters are "not verified in a browser".
3. **Button (§5.7):** (1) the design has a component/instance named like button/btn/زر → rewrite `src/assets/scss/components/_button.component.scss`
   with the design's measurements, radius, colors (mapped to tokens), typography and states; (2) no design button → the closest existing
   button component (profile `button.candidates`), keeping its measurements; (3) nothing → keep the standard button as scaffolded.
   Record the branch: `profile.js --answers '{"button":{"decision":"design|existing:<class>|standard"}}'`.
4. `node PLUGIN/scripts/scaffold.js angular-json` — vendor CSS first, then `src/assets/scss/style.scss`; includePaths; assets; externalDependencies; scss schematic.
   Vendor bundles with `inject: false` are left as they are.
5. `node PLUGIN/scripts/scaffold.js index-html --lang <lang> --dir <dir>` (default `ar` / `rtl`) — theme `<link>`s with `custom.theme.css` **last**, favicon.

## 5. Lint, hooks, .gitignore (§5.8)
1. `node PLUGIN/scripts/setup-project.js lint`. If it reports an existing Stylelint/ESLint config (exit 3), ask before replacing (Stylelint) or merging (ESLint — never overwrite; show its merge snippet), then re-run with `--root-stylelint` / `--root-eslint` or merge by hand as agreed.
2. `node PLUGIN/scripts/setup-project.js githook`. Then ask: "Set `git config core.hooksPath .githooks` so the hook runs for every push (terminal, VS Code, Claude)?" (a local git config change only; no commit).
   If `core.hooksPath` is already set to something else, show it and ask whether to chain to it (`githook --chain <path>`). Run `git config core.hooksPath .githooks` only after a yes.
3. `node PLUGIN/scripts/setup-project.js gitignore` (if it says there is no `.gitignore`, ask, then `--create`).

## 6. CLAUDE.md
`node PLUGIN/scripts/setup-project.js claude-md` (adds or replaces the block between `<!-- ui-guard:start -->` and `<!-- ui-guard:end -->`).

## 7. Build and lint what the plugin produced
1. `npx ng build --configuration development` (timeout 10 min; run it in the background if long).
2. `node PLUGIN/scripts/run-checks.js` and read `.ui-guard/tmp/scan/deterministic.jsonl`.
3. Fix anything the plugin itself produced until both are clean (never edit the developer's own pre-existing files here).

## 8. Finish
1. `node PLUGIN/scripts/profile.js --refresh --answers '{"projectType":"new"}'` and write empty baselines (one per domain):
   `node PLUGIN/scripts/lib/fingerprint.js --empty-baseline --root "<project root>"`.
2. Reply in a short summary: what was created, which questions were answered (and what was declined), filter ΔE results, and the list of
   new/changed files the developer should review and commit (`git status --short`). **Do not commit.**
