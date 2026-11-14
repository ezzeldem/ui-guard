# report.md — structure (written by scripts/write-report.js)

A summary page, at most ~150 lines. Full details stay in `.ui-guard/findings.json`.

1. Header: date, commit, files in the scan, scan type (free / free + AI stages / rebuilt with --plan-only), findings by severity.
2. What was checked, and by what: Stylelint, ESLint, ui-guard scripts, each AI stage, and that images/assets are out of the scan.
3. NOT checked: tools missing or crashed (with the reason — never sent to the AI), AI-only rules when --ai was not used,
   skipped or unfinished AI batches, runtime-only STYLE-45.
4. Findings per rule: one row per rule — id, severity, count, files, what.
5. Honesty note: the free checks are deterministic; one AI pass can miss things.
6. Cost of this scan: AI agent runs and tokens per stage (0 for the free scan).

Per-area detail pages are written only on request: `/ui-guard:scan --details style|lang|safe|access` → `.ui-guard/details/<area>.md`.
