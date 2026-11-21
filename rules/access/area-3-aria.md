# Area 3 — appropriate ARIA

> ui-guard rule text for this accessibility area. It is read by the scan (every finding of the area), by the fixer (the `Fix guidance`,
> the stack section and the `Hard rules` bind every edit) and by `/ui-guard:check`. Findings use the ui-guard format and rule IDs
> (ACCESS-01..05, ...), never the headings of this file. Stack idioms: `rules/access/core/stacks/<angular|mvc-dotnet>/idioms.md`.

## Stack — decide before auditing

Your area is the same on every UI stack; the syntax of a fix is not. The invocation states the stack of
each target (`Stack: Angular` / `Stack: ASP.NET MVC`); otherwise read `UI Stack` in the profile (a profile
with no `UI Stack` line but an `Angular:` line is Angular). In a Hybrid repo: `*.component.html` / `*.ts`
under the Angular surface -> Angular; `*.cshtml`, Tag Helper / HTML Helper / View Component `.cs`, and MVC
project scripts -> ASP.NET MVC. If still unclear, say so under `OutOfScope` rather than guessing.

`Detect` and `Fix guidance` below are written in Angular syntax where syntax matters and apply as-is to
**Angular** targets. For an **ASP.NET MVC** target, run the same defect checks through the "ASP.NET MVC /
Razor targets" section and write every `fix` in Razor, C#, or the project's own JavaScript style — never
`[attr.*]`, `(event)` bindings, `@if`/`*ngIf`, pipes, or `@Input()`. Never propose Razor, Tag Helper, or
jQuery syntax for an Angular target.

ARIA adds no behavior. It changes what is **announced** — so it must be true, and must **stay** true as
state changes.

## Detect

**Missing where a custom widget needs it**
- A `<div>`-built dropdown, listbox, combobox, tablist, menu, tree, or dialog with **no `role`**.
- A toggle/disclosure with no `aria-expanded`, or `aria-expanded` with no `aria-controls`.
- Active nav/breadcrumb item with no `aria-current="page"`.
- Sortable header with no `aria-sort`; loading region with no `aria-busy`.
- A dialog with no accessible name and no `aria-modal`. Do **not** claim `aria-modal="true"` when
  nothing traps focus — that is worse than omitting it.

**Wrong, redundant, or broken**
- Redundant ARIA on a semantic element: `role="button"` on `<button>`, `role="list"` on `<ul>`,
  `aria-required` alongside `required`.
- An attribute not allowed on its element/role; a misspelling; an invalid value.
- **Broken id references** — pointing at an id that does not exist, is duplicated across `@for`
  iterations, or lives inside a currently-false `@if`.
- **Static state that lies** — hardcoded `aria-expanded="false"` on a toggle that opens.
- **Wrong binding form** — `[aria-label]` instead of `[attr.aria-label]`; an empty-string binding
  rendering an empty attribute where it should be absent (bind `null`).
- **Stale ARIA from TypeScript** — a one-time `setAttribute` never updated, or a value driven by a field
  that `OnPush`/zoneless never re-checks. Prefer host metadata / `@HostBinding` / a `computed()`.
- `aria-hidden="true"` on a subtree that **contains focusable content** — serious defect.
- A role on an element whose interaction is genuinely provided by a **native child** (e.g.
  `role="button"` on a row wrapping a real checkbox) — removing the role is the fix.

**Validation and status — usually the highest-value ARIA work in an Angular repo**
- A field with validation but no `[attr.aria-invalid]`.
- An error message not linked to its field via `[attr.aria-describedby]`.
- `Validators.required` with no `required`/`aria-required` (Angular emits neither automatically).
- An error container that appears with no `role="alert"`/`aria-live` — nothing is announced.
- A toast/status region with no live region (check whether the toast library already announces).

## Fix guidance

- Bind state, never hardcode it.
- Use `[attr.aria-*]`; bind `null` to omit a reference attribute.
- Point references at ids that exist in that rendered state; build per-row ids from the iteration key or
  an instance-scoped prefix.
- **Removing redundant/invalid ARIA is a legitimate fix.**
- Prefer a library's documented ARIA inputs over raw attributes on a wrapper host.
- If the correct fix is a **native element** instead of a role, hand it to the semantics area and do not
  patch the role.
- If a value needs state that does not exist, propose the **trivial** derived value (a `computed()` or
  one-line getter). Anything larger -> `OutOfScope`.
- **CVA caution:** injecting `NgControl` into a component that also provides `NG_VALUE_ACCESSOR` is a
  circular dependency. The safe form drops the provider and self-injects — that is a **contract change**,
  so report it rather than proposing something that will not boot.

## ASP.NET MVC / Razor targets

**Detect** (in addition to the stack-independent checks above — missing widget roles, redundant or
invalid ARIA, broken id references, `aria-hidden` over focusable content):
- **`aria-*` rendered from a C# `bool`** (`aria-expanded="@Model.IsOpen"`) — Razor renders
  `aria-expanded="aria-expanded"` for `true` and drops the attribute for `false`.
- **State that scripts never update** — a script toggles the visual state (`.toggleClass`, `.slideToggle`,
  `hidden`, `.show()`/`.hide()`) but never sets `aria-expanded`/`aria-selected`/`aria-pressed`; or a static
  `aria-expanded="false"` the script never changes.
- **UI-library widgets missing their documented ARIA markup** (e.g. a Bootstrap modal with no
  `aria-labelledby`, toggles with no `aria-controls`) — check the library version in the profile. When the
  library manages a state itself, do **not** propose script that duplicates it.
- **Validation** — confirm first what the installed client-validation library already emits (read its
  version in `wwwroot/lib`/`Scripts/`); then: `[Required]` fields with no `aria-required`; server-rendered
  errors (POST re-render) with no `aria-invalid` and no `aria-describedby` to the message; a validation
  summary that is never announced. Flag any proposal that would create an id the library also generates
  (e.g. `<field-id>-error`) or reference both a container and an element nested in it (double reading).
- **AJAX / status messages** — result or status text inserted with no live region; a live region created
  in the same update as its content (not announced); no `aria-busy` on a region while it loads;
  TempData/flash messages in the layout with no `role="status"`/`role="alert"`.
- Ids referenced by `aria-*` that a partial renders only in some states, or repeats per row.

**Fix guidance**
- `aria-*` values are **strings** — Razor `@(open ? "true" : "false")`, C# `SetAttribute(..., "true")`,
  JS `setAttribute('aria-expanded', 'true')`; `null` / `removeAttribute` to omit a reference attribute.
- Update state **in the same script function** that changes the visual state.
- Validation: one description source per field, covering both the server-rendered and the client path;
  the repeated logic belongs in the shared EditorTemplate / Tag Helper / HTML Helper, not in every view.
  Changing validation-library configuration -> `OutOfScope`.
- Announcements: a **persistent** live region in the layout, text from the profile's localization idiom.
- Prefer the UI library's documented attributes/options over hand-written ARIA on its widgets.

## Not yours

Field names -> labels area. Decorative-icon hiding and image naming -> alt area. Element choice ->
semantics area. `tabindex`, key handling, focus management -> keyboard area. Also out: rewriting
component logic to produce state that does not exist, and inventing a role for a widget you cannot
identify.

## Hard rules

- Evidence or it does not exist: `file:line` from a file you actually opened.
- **No hardcoded user-visible text.** Announced strings go through the project's localization mechanism
  in the idiom from the profile. Report the key + locale values under `translationKey`; **you never add
  keys**. A binding wrapping a literal (`cond ? 'A' : 'B'`) is still hardcoded. `alt=""` and ARIA state
  values (`true`, `page`, `dialog`) are **not** text — never translate them.
- **Reuse an existing key** when one fits (grep the locale files first) and say so.
- Preserve every binding, directive, `id`, `#ref`, and class (MVC: every `asp-*` attribute, generated
  `name`, and `data-*`/`js-*` script hook). If a fix would change an `id` referenced by code, scripts,
  CSS or tests, keep the old id and add your hook alongside.
- **Shared components: grep every usage form, count consumers, put the count in `sharedImpact`.**
  Angular: the selector. MVC: `partial name=`/`Html.Partial(`/`Component.InvokeAsync(`/`<vc:`/helper
  calls/`EditorFor` of the template's type. Decide caller-invariant (fix inside) vs caller-specific
  (Angular: additive `@Input()`; MVC: optional `ViewData` key or optional parameter with a default — or a
  call-site fix).
- **Never add a dependency** (including `@angular/cdk`, or any NuGet/npm/LibMan package) — report the
  gap. Never hand-roll a focus trap or roving-tabindex manager as a substitute.
- Never `node_modules`, `dist`, `.angular`, `bin`, `obj`, `wwwroot/lib`, generated `*.Designer.cs`,
  minified/bundled or other generated files. Fix third-party widgets at the call site.
- **Semantic HTML first; no ARIA beats bad ARIA; never a positive `tabindex`; RTL respected.**
- If unsure, **say so**. A confident wrong fix ships a bug; a reported gap does not.
