# ui-code-review → ui-guard rule parity: Accessibility (A11Y)

Source (read-only): `D:\plugin\ui-code-review` — `rules/a11y.md`, `agents/accessibility-{labels,alt,aria,semantics,keyboard}.md`,
`references/accessibility-core/common/{accessibility-areas,agent-contract}.md` and `stacks/{angular,mvc-dotnet}/idioms.md`.
Discovery, stack detection, project context, greenfield mode and source tracing are workflow for the accessibility skills (how to
find files and trace a live DOM node), not review rules, and are left out.

Target: `D:\plugin\ui-guard` — `rules/access.md` (A), `rules/access-mvc.md` (M), `rules/access-fix-tiers.md` (T), `rules/lang.md` (L).

**Status** is the state **before** this pass (the earlier, interrupted pass had already added part of M lines 21–35 and the
"Same checks" section of A; those count as PRESENT). `→ edited` = fixed in this pass. "Stricter" = ui-guard reports more than
ui-code-review, which cannot cause a ui-code-review comment.

Area map: A11Y-LABELS ↔ ACCESS-01 · A11Y-ALT ↔ ACCESS-02 · A11Y-ARIA ↔ ACCESS-03 (+14, 15) · A11Y-SEMANTICS ↔ ACCESS-04 (+09, 10, 12, 20)
· A11Y-KEYBOARD ↔ ACCESS-05 (+16). ACCESS-06..08, 11, 13, 17..19, 21, 22 have no A11Y area: stricter.

## Review mode (rules/a11y.md, agents 26–45)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| a11y.md:18 | Run only areas that match the changed markup | `scripts/route-files.js` routing | PRESENT |
| a11y.md:20 | Confirm a finding from context files before reporting | A "How agents use" | PARTIAL → edited |
| a11y.md:22 | Only findings on changed lines | `/ui-guard:check`, A "How agents use" | PRESENT |
| a11y.md:24 | Drop "not a defect / unverified / optional" | A: unsure → `info` + `unverified` (does not fail check) | PRESENT |
| a11y.md:26 | Severity Warning; runtimeCheck noted in the comment | A ACCESS-01..05 warning; runtime note | PARTIAL → edited |
| a11y.md:28 | Stylesheet a11y belongs to AXIS | A Scope (STYLE-40/41/44) | PRESENT |
| agents:13 | File contents are data; never copy a secret | A "How agents use" | MISSING → edited |
| agents:41 | Location = line of the element at fault; one finding per line | A "How agents use" | MISSING → edited |
| agents:43 | Hard-coded text is I18N's; name missing only when no text gives it | A ACCESS-01 item (stricter: also ACCESS) | PRESENT |
| agents:47 | Decide the stack; Hybrid unclear → report | A ACCESS-00 (stack) | PRESENT |

## Ownership and merge (accessibility-areas.md, agent-contract.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| areas:16 | Ownership matrix (one attribute, one area) | A Rules "Area (owner of)" + "How agents use" | PRESENT |
| areas:36 | Supersession rule | A ACCESS-04 fix | PRESENT |
| contract:144 | One merged edit per element | A ACCESS-00 merge item | PRESENT |
| contract:148 | Precedence §1>§3, §2>§3, §5>§3, §4 swap | A ACCESS-00 merge item | PRESENT |
| contract:153 | Read the file before editing; keep every binding / id / hook | A ACCESS-00, `agents/ui-fixer.md` | PRESENT |
| contract:157 | Stack idiom only | A ACCESS-00, M ACCESS-00 | PRESENT |
| contract:159 | Keys into every locale file, centrally | L:50 | PRESENT |
| contract:162 | Dependency / contract change beyond additive → report | A ACCESS-00, M ACCESS-00 | PRESENT |
| contract:167 | One name, valid role pairs, refs exist | A ACCESS-00 merge item | PRESENT |
| contract:174 | Semantic HTML first | A ACCESS-00 principles | PARTIAL → edited |
| contract:176 | No ARIA beats bad ARIA; deleting is a fix | A ACCESS-00 principles | MISSING → edited |
| contract:178 | Never break the app | A ACCESS-00 principles | PARTIAL → edited |
| contract:180 | Never positive tabindex | A ACCESS-00 | PRESENT |
| contract:181 | No hard-coded text; ternary still hard-coded; `alt=""` / state not text | A ACCESS-00 | PRESENT |
| contract:184 | RTL respected | A ACCESS-00 principles, ACCESS-05 | PARTIAL → edited |
| contract:185 | No dependency; no hand-rolled trap / roving | A ACCESS-00 | PRESENT |
| contract:188 | Never generated / vendored output | A ACCESS-00, M ACCESS-00 | PRESENT |
| contract:191 | Blast radius, caller-invariant vs specific | A ACCESS-00 | PRESENT |
| contract:194 | Scanner pass ≠ keyboard accessibility | A ACCESS-05 (runtime) | MISSING → edited |
| contract:197 | Global out of scope (CSS, timing, captions, config, reorder, contracts) | A Scope, ACCESS-04, ACCESS-17/18 needs-decision | PRESENT |

## Area 1 — Labels (accessibility-labels.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| labels:63 | `<label>` no `for` / missing target | A ACCESS-01 | PRESENT |
| labels:64 | Field with no id/label/aria; `formControlName` is not a name | A ACCESS-01 | PRESENT |
| labels:67 | Placeholder-only | A ACCESS-01 | PRESENT |
| labels:69 | Unassociated visible text | A ACCESS-01 | PRESENT |
| labels:70 | Select without name; UI-kit leftover | A ACCESS-01 | PRESENT |
| labels:71 | Duplicate ids in loops | A ACCESS-01 | PRESENT |
| labels:73 | Two competing names | A ACCESS-01, ACCESS-00 | PRESENT |
| labels:74 | `aria-label` on component host | A ACCESS-01 | PRESENT |
| labels:75 | Group without name | A ACCESS-01 | PRESENT |
| labels:76 | Hard-coded name text | A ACCESS-01 (+ LANG) | PRESENT |
| labels:78 | CVA name reaches inner control; `@Input` exists | A ACCESS-01 | PRESENT |
| labels:81 | Static id on shared control | A ACCESS-01 | PRESENT |
| labels:85 | Fix table (8 cases) | A ACCESS-01 (fix) | PRESENT |
| labels:96 | Caller-invariant vs caller-specific | A ACCESS-00 | PRESENT |
| labels:101–127 | MVC detect + fix (asp-for ids, Display, htmlAttributes id, asp-items, EditorTemplates, per-row ids, literals, script fields) | M ACCESS-01 | PRESENT |
| labels:136–157 | Hard rules (evidence, keys, reuse key, preserve, shared, deps, vendor, semantic first, unsure) | A ACCESS-00, "How agents use", L:50 | PARTIAL → edited |

## Area 2 — Alt (accessibility-alt.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| alt:63–67 | No alt; empty alt on meaningful; filename / "image of" alt; looks not purpose; unlocalized | A ACCESS-02 | PRESENT |
| alt:68 | Inline SVG meaningful / decorative | A ACCESS-02 | PRESENT |
| alt:69 | Icon fonts without `aria-hidden` | A ACCESS-02 | PRESENT |
| alt:70 | Library icon components; check library default; never propose an existing attribute | A ACCESS-02 | PARTIAL → edited |
| alt:73–77 | Icon-only control; icon in named control; img in link; CSS background | A ACCESS-02 | PRESENT |
| alt:78 | Images from TS | A ACCESS-02 | PRESENT |
| alt:79 | Icon config with no description field | A ACCESS-02 | PRESENT |
| alt:85–96 | Fix table incl. `focusable="false"`, paired fix | A ACCESS-02 (fix) | PRESENT |
| alt:95 | Third-party icon component → documented input at call site | A ACCESS-02 | PARTIAL → edited |
| alt:98 | Meaningful vs decorative judgment; both options when unsure | A ACCESS-02 | PRESENT |
| alt:104–123 | MVC detect + fix (path alt, icon fonts, scaffolded icon links with item name, generators, DB images) | M ACCESS-02 | PRESENT |

## Area 3 — ARIA (accessibility-aria.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| aria:67 | Div widgets without role | A ACCESS-03 | PRESENT |
| aria:68 | Toggle without `aria-expanded` / `aria-controls` | A ACCESS-03 | PRESENT |
| aria:69 | Active nav / breadcrumb `aria-current` | A ACCESS-03 | PRESENT |
| aria:70 | `aria-sort`, `aria-busy` | A ACCESS-03 | PRESENT |
| aria:71 | Dialog name / `aria-modal` only with a trap | A ACCESS-03 | PRESENT |
| aria:75 | Redundant ARIA (`role="button"` on button, `role="list"` on ul, required + aria-required) | A ACCESS-03 | PARTIAL → edited |
| aria:77–85 | Invalid ARIA; broken refs; lying state; `[aria-x]`; empty-string binding; stale TS ARIA; `aria-hidden` over focusable | A ACCESS-03 | PRESENT |
| aria:84 | OnPush / zoneless staleness (fix: signal, `computed()`, `markForCheck()`) | A ACCESS-03 | PARTIAL → edited |
| aria:86 | Role on wrapper of a native child | A ACCESS-03 | PRESENT |
| aria:90–94 | Validation ARIA, `Validators.required`, error live region, toast library | A ACCESS-03 | PRESENT |
| aria:98–110 | Fix guidance (bind state, null, per-row ids, removal is a fix, library inputs, native → semantics, trivial derived value, CVA caution) | A ACCESS-00 / ACCESS-03 | PRESENT |
| aria:116–132 | MVC detect (bool aria, script state, Bootstrap ARIA, validation, AJAX live, TempData, partial ids) | M ACCESS-03, ACCESS-14 | PRESENT |
| aria:135–142 | MVC fix (strings, same function, one source, persistent live region, library options) | M ACCESS-00, ACCESS-03 | PRESENT |
| aria:147 | Not yours: rewriting logic, inventing roles | A ACCESS-00 | PRESENT |

## Area 4 — Semantics (accessibility-semantics.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| sem:63 | Landmarks in the shell | A ACCESS-04 | PRESENT |
| sem:67 | Headings; shared component caveat | A ACCESS-04, ACCESS-10 | PRESENT |
| sem:72–80 | Fake buttons/links, `javascript:void(0)`, click navigation, div lists/tables, fieldset, `type="button"`, duplicate attributes, nested form | A ACCESS-04 | PRESENT |
| sem:82 | Tables: scope, caption, `th` for data, thead/tbody, layout table | A ACCESS-04, ACCESS-20 | PRESENT |
| sem:85 | Host wrappers; `display: contents` check | A ACCESS-04 | PRESENT |
| sem:91 | `lang`, hard-coded `dir`, `dir` vs visual | A ACCESS-04 | PRESENT |
| sem:96–105 | Fix table | A ACCESS-04 (fix) | PRESENT |
| sem:107 | No `<button>` around interactive content | A ACCESS-04 | PRESENT |
| sem:111 | Before a swap grep CSS, ViewChild, querySelector, tests; always state styling risk | A ACCESS-00, ACCESS-04; T selector-impact | PARTIAL → edited |
| sem:117–139 | MVC (layouts, `html lang dir`, layout h1, fake controls, scaffolded tables, wrapper markup, nested forms, fixes) | M ACCESS-04/09/10/12/20 | PRESENT; culture `dir` expression PARTIAL → edited |
| sem:143 | Reorder / restructure → report | A ACCESS-04 | PRESENT |

## Area 5 — Keyboard (accessibility-keyboard.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| kbd:64 | Cannot be certified statically; runtimeCheck on every finding | A ACCESS-05 (runtime) | MISSING → edited |
| kbd:70–79 | Positive tabindex; not focusable / operable; dead / double stops; hidden-but-focusable (verify); focus order / RTL | A ACCESS-05, ACCESS-16 | PRESENT |
| kbd:80–88 | Overlays; existing Escape handler; sibling panel; focus destroyed | A ACCESS-05 | PRESENT |
| kbd:89 | Composite widgets / roving tabindex | A ACCESS-05 | PRESENT |
| kbd:91 | Redundant key handlers on native elements — delete | A ACCESS-05 | PARTIAL → edited |
| kbd:93 | Fake-disabled; early-return on disabled | A ACCESS-05, ACCESS-13 | PRESENT |
| kbd:95 | Route-change focus, skip link, `autofocus` | A ACCESS-05 | PRESENT |
| kbd:96 | Missing focus indicator → report only | A ACCESS-05 (STYLE-40) | PRESENT |
| kbd:101–111 | Fix table (positive tabindex, fallback keys, double stop, hidden, Escape, restore, `tabindex="-1"`, fake-disabled, CDK only) | A ACCESS-05 / 13 / 16 | PRESENT |
| kbd:113 | Same method as click; Space preventDefault; Enter only links; never duplicate library focus — say what was verified | A ACCESS-05 | PARTIAL → edited |
| kbd:118 | Flag every horizontal-arrow proposal for RTL verification | A ACCESS-05 | PARTIAL → edited |
| kbd:126–137 | MVC detect (script click handlers, `htmlAttributes` tabindex, class-hidden, library / custom modals, AJAX swaps, delegation, autofocus, skip link, `a.disabled`) | M ACCESS-05/16 | PRESENT |
| kbd:139–146 | MVC fix (hide with `hidden` / `display:none`, AJAX focus, delegation, library-only trap) | M ACCESS-05/16 | PARTIAL → edited |
| kbd:150 | Custom widget needs roles **and** keys — flag, do not absorb | A ACCESS-05 | MISSING → edited |

## Angular idioms (stacks/angular/idioms.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| ng:19–43 | Five attribute forms; `[attr.*]` for aria / role / tabindex | A ACCESS-00 | PRESENT |
| ng:45–62 | `null` to omit; tri-state asymmetry | A ACCESS-00 | PRESENT |
| ng:66–89 | Localization idioms; `i18n-<attr>`; language ternary; state values not text | A ACCESS-00 | PRESENT |
| ng:82 | Static `aria-label` is a finding whenever a translation mechanism exists | A ACCESS-00 (Angular) | PARTIAL → edited |
| ng:90 | `instant()` in TS during construction → template / observable | A ACCESS-00 (Angular) | PARTIAL → edited |
| ng:96–129 | Host metadata vs `@HostBinding`; Renderer2; directive; `display: contents` caveat | A ACCESS-00, ACCESS-04 | PRESENT |
| ng:133–153 | Key bindings; keydown; same method; native first | A ACCESS-05 | PRESENT |
| ng:157–184 | Host-wrapper trap, 3 fixes, contracts → report | A ACCESS-04 | PRESENT |
| ng:188–199 | Content projection → call site / `@Input()` | A ACCESS-00 | PRESENT |
| ng:203–229 | CVA; third-party input; per-instance ids (`crypto.randomUUID()`) | A ACCESS-01, ACCESS-00 | PARTIAL → edited |
| ng:233–263 | Reactive Forms ARIA; touched/dirty; required; `role="alert"` with `@if`; per-row error ids; shared error component | A ACCESS-03 | PRESENT |
| ng:265 | Template-driven forms (`#name="ngModel"`) | A ACCESS-03 | MISSING → edited |
| ng:270–280 | Signals, getters, OnPush `markForCheck()`, no `instant()` in getters | A ACCESS-00, ACCESS-03 | PARTIAL → edited |
| ng:286–300 | Dynamic components, Renderer2, no new `[innerHTML]`, move existing innerHTML markup to the template, third-party lifecycle hook | A ACCESS-00 | PARTIAL → edited |
| ng:306–317 | CDK toolkit only if present (`LiveAnnouncer` too); library focus; route-change focus in the shell | A ACCESS-00, ACCESS-05 | PARTIAL → edited |
| ng:321–332 | Never list (incl. `@for` / `*ngFor` mix) | A ACCESS-00 | PARTIAL → edited |

## MVC idioms (stacks/mvc-dotnet/idioms.md)

| Source | Item | ui-guard | Status |
|---|---|---|---|
| mvc:12 | Never introduce a convention the repo does not use | A ACCESS-00 principles | MISSING → edited |
| mvc:20–56 | Attribute forms; bool aria; `null` to omit; JS strings | M ACCESS-00, ACCESS-03 | PRESENT |
| mvc:60–95 | Labels (asp-for, Display, collections `Html.IdFor`, custom id, never change name, groups) | M ACCESS-01 | PRESENT |
| mvc:99–149 | Validation (what MVC emits, jQuery Validation version, one source, both paths, conditional Razor, summary, config → report) | M ACCESS-03 | PRESENT |
| mvc:124 | Every validation finding runtime-checked after client **and** server failure | M ACCESS-05/16 tail | MISSING → edited |
| mvc:155–187 | Razor localization; ternary / JS literal; `.Designer.cs`; JS text from server; no `@Html.Raw` | M ACCESS-00, ACCESS-01 | PRESENT |
| mvc:175 | Missing keys fail quietly; every culture `.resx`; check non-default culture | M ACCESS-00 (vendor and keys) | MISSING → edited |
| mvc:195 | `<html lang dir>` from `CurrentUICulture` incl. `IsRightToLeft` | M ACCESS-04/09/10/12/20 | PARTIAL → edited |
| mvc:199 | Landmarks additive in the layout | M | PRESENT |
| mvc:202 | Skip link: first focusable, `<main tabindex="-1">`, existing visually-hidden-focusable class, none → report | M ACCESS-05/16 | PARTIAL → edited (`u-sr-only` first, per AXIS) |
| mvc:206–209 | Layout h1; multiple layouts | M | PRESENT |
| mvc:213–232 | Partials / EditorTemplates fix location; blast radius; repeated ids | M ACCESS-00 | PRESENT |
| mvc:236–257 | Generators; localize in Tag Helpers; additive property; count usages of the tag / helper | M ACCESS-00 | PARTIAL → edited |
| mvc:263–301 | Scripts (static in Razor, same function, keys, hidden, focus, delegation, AJAX, library widgets, no hand-rolled trap, compiled scripts) | M ACCESS-00, 03, 05, 14 | PRESENT |
| mvc:307 | Never patch NuGet `Scripts/`, `*.min.css` | M ACCESS-00 (vendor and keys) | PARTIAL → edited |
| mvc:309–312 | Library options for the installed version; report when impossible | M ACCESS-00 | PRESENT |
| mvc:318–331 | Never list | M ACCESS-00 | PRESENT |

## Totals

129 rows (a row may group several items of one source section): 92 PRESENT, 27 PARTIAL, 10 MISSING. All 37 PARTIAL / MISSING
items were added to `rules/access.md` ("Same checks" principles, Angular, ACCESS-02/03/04/05 and runtime items; "How agents
use this file") and `rules/access-mvc.md` (vendor and keys; `lang` / `dir`; skip link; hiding; runtime checks).
`rules/access-fix-tiers.md` needed no change.

## Differences kept on purpose

- ACCESS-06..08, 11, 13, 17..19, 21, 22 have no A11Y area in ui-code-review: stricter, kept.
- ui-code-review drops unverified findings; ui-guard keeps them as `info` + `unverified`, which never fails `/ui-guard:check`.
- Hard-coded accessible names are I18N-only in ui-code-review; ui-guard reports them under ACCESS-01/02 and LANG: stricter.
- Skip link class: ui-code-review uses the project's existing visually-hidden class; ui-guard prefers `u-sr-only` (AXIS
  accessibility rule 5) and falls back to the existing class.
- Tier C element swaps with stylesheet hits: ui-code-review reports instead of swapping; ui-guard swaps only with the
  neutralization in the component SCSS and the selector-impact proof (`rules/access-fix-tiers.md`). The diff ui-code-review
  then reviews is a correct native element, so no comment follows.
