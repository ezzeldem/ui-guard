# report.md — structure (written by scripts/write-report.js, one per domain)

`.ui-guard/<domain>/report.md` (scss, access, lang, safe). A summary page, at most ~150 lines. Full details stay in
`.ui-guard/<domain>/findings.json`; `write-report.js --domain <d> --details` writes `.ui-guard/<d>/details.md` on request.

1. Header: domain, date, commit, files in the project, scan type (scripts + lint, then AI on the files that need judgment), findings by severity.
2. What was checked, and by what: the domain's linter, its ui-guard scripts, the AI pass (files that needed judgment, batches done).
3. NOT checked: tools missing or crashed (with the reason — never sent to the AI), skipped or unfinished AI batches, runtime-only STYLE-45.
4. Findings: one row per rule. ACCESS: High / Medium / Low by user impact (the counts add up), repeats from one shared
   source collapsed into one "×N" row with 2–3 examples, and a "fix these first" list (shared sources first).
5. Honesty note: scripts and lint are deterministic; one AI pass can miss things.
6. Token log: AI agent runs and tokens — a silent log, never a question or an estimate before the run.
