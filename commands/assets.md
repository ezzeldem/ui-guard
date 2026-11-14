---
description: Check that every image/font/video path referenced in HTML, SCSS, CSS and TS (src=, url(), string literals, theme --img-* variables) exists. Script only — 0 tokens, no agent. Images are never opened or judged.
argument-hint: "[--new-only] [--baseline]"
allowed-tools: Bash, PowerShell, Read
---

# /ui-guard:assets

Arguments: `$ARGUMENTS`

Reply in the developer's language. **Plugin root:** `PLUGIN` = `${CLAUDE_PLUGIN_ROOT}` (if not replaced, Glob `**/ui-guard/scripts/assets.js` under `~/.claude/plugins`).
Do not start any agent. Do not open image files.

1. Run `node "PLUGIN/scripts/assets.js" --root "<project root>" $ARGUMENTS`.
   - `--new-only` lists only problems not in `.ui-guard/assets-baseline.json` (known ones never block).
   - `--baseline` saves the current problems as known.
2. Show the output as is: one line per problem `file:line -> missing <path>` (or "uses src/…", "points to localhost"), then the summary line.
3. Exit 1 means something is missing. Offer to fix the paths; never move, create or delete image files on your own.
