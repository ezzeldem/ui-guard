# ACCESS — accessibility (5 areas)

Based on the UI team's accessibility review rules. Rule IDs are ui-guard's own.

**Scope:** these five areas, **not a full WCAG audit**, aiming for the highest support within them. Each
attribute has one owner area (below). CSS (focus styles, contrast) belongs to no ACCESS rule: it is reported
under STYLE-40/41/44 and is never restyled by an accessibility fix.

## ACCESS-00 — general Angular rules for every ACCESS fix (error, ai)

- Use `[attr.aria-*]`, never `[aria-*]`.
- Bind `null` (not `''`) to remove an attribute.
- No positive `tabindex`.
- No hard-coded user-visible text: use translation keys (LANG).
- Never mix `@if` and `*ngIf` styles inside one template.
- Never add a dependency (including `@angular/cdk`) without asking.
- Never hand-roll a focus trap.
- Before changing a shared component, count its consumers and list them in the finding (blast radius).

## Rules

| ID | Area (owner of) | Severity | Checked by | Applies to | Detects | How to fix |
|---|---|---|---|---|---|---|
| ACCESS-00 | General | error | ai | ACCESS fixes | A fix that breaks one of the general rules above. | Redo the fix following ACCESS-00. |
| ACCESS-01 | **Labels** — a form field's accessible name, group name text | warning | eslint + ai | `*.html`, CVA `*.ts` | `<label>` without `for` or pointing to a missing `id`; inputs/selects/textareas with no id+label, no wrapping label, no `aria-label(ledby)` (`formControlName` is not a name); placeholder-only fields; visible text beside a field but not associated; leftover UI-kit names ("Default select example"); duplicate ids inside `@for`/`*ngFor`; two competing names; `aria-label` on a non-semantic component host; radio/checkbox groups without a group name; hard-coded unlocalized names; custom `ControlValueAccessor` controls whose name never reaches the inner native control or that have no `@Input` to receive one; static ids on shared controls. | Associate a visible `<label for>`; make loop ids unique (`'field-' + i`); add an `@Input() ariaLabel` / `labelId` to custom controls and bind it to the inner native control. |
| ACCESS-02 | **Alt** — `alt`, icon text alternatives, `aria-hidden` on decorative graphics, the name of icon-only controls | warning | eslint + ai | `*.html`, `*.ts` | `<img>` without `alt`; `alt=""` on a meaningful image; filename/placeholder alt ("icon", "image", "logo.svg"); alt describing looks instead of purpose; unlocalized alt; inline `<svg>` without `role="img"` + name (meaningful) or not hidden (decorative); icon fonts/sprites/icon components without `aria-hidden` (check the library default first); icon-only buttons with no accessible name; a decorative icon inside a named control not hidden; an image inside a link/button whose alt is not the action; meaning only in a CSS `background-image` (report); images created from TS with the same gaps; icon config objects with a path but no way to describe it. | Meaningful: translated `alt` describing purpose. Decorative: `alt=""` / `aria-hidden="true"`. Icon-only button: `[attr.aria-label]` with a key. |
| ACCESS-03 | **ARIA** — `role` on custom widgets, ARIA state, validation ARIA, live regions, invalid/redundant ARIA, id references | warning | eslint + ai | `*.html`, `*.ts` | Custom div-built dropdown/listbox/combobox/tablist/menu/tree/dialog with no role; toggles without `aria-expanded` (or `aria-controls`); active nav item without `aria-current`; sortable header without `aria-sort`; loading region without `aria-busy`; dialog without a name or `aria-modal` (never claim `aria-modal` without a real focus trap); redundant ARIA on native elements; disallowed/misspelled/invalid ARIA; broken id references (missing, duplicated in loops, inside a false `@if`); static state that lies; `[aria-x]` instead of `[attr.aria-x]`; stale ARIA set once from TS; `aria-hidden="true"` on a subtree with focusable content; a role on a wrapper whose interaction comes from a native child; fields with validation but no `aria-invalid`; errors not linked with `aria-describedby`; `Validators.required` with no `required`/`aria-required`; error containers/toasts with no `role="alert"`/live region (check whether the toast library announces already). | Bind state with `[attr.aria-expanded]="open"` etc.; link errors with `[attr.aria-describedby]`; add `role="alert"` to error containers. |
| ACCESS-04 | **Semantics** — element choice, landmarks, headings, tables, lists, component-host wrappers, `lang`/`dir` | warning | eslint + ai | `*.html`, `index.html` | No `<main>`, nav in a `<div>`, several `<nav>`s without names (layout shell); no `<h1>`, skipped levels, fake headings, headings for emphasis (never renumber a shared component's heading blindly — check usages); `<div (click)>`/`<span (click)>`/`<a (click)>` without `href` used as buttons; `href="javascript:void(0)"`; navigation by click handler instead of `routerLink`; div-lists, div-tables, radio/checkbox groups without `<fieldset>`; `<button>` in a form without `type="button"`; duplicate attributes (report if fixing changes behavior); nested `<form>`; `<th>` without `scope`, tables without caption/`thead`/`tbody`; a component host between `<ul>` and `<li>` or `<tbody>` and `<tr>` (check `display: contents` first); foreign-language runs without `lang`; hard-coded `dir` in an app that switches direction. | Use the native element. **Supersession:** when a fake control becomes a native element, its `role` (ACCESS-03) and `tabindex`/key handlers (ACCESS-05) are dropped. |
| ACCESS-05 | **Keyboard** — `tabindex`, focus order, key handlers, focus management, roving tabindex | warning | eslint + ai | `*.html`, `*.ts` | Positive `tabindex`; click-only elements not focusable or not operable with Enter/Space; dead or double focus stops; hidden-but-focusable content (class-hidden instead of `@if` — verify first); focus order different from visual order (CSS `order`, `row-reverse`, RTL); overlays/modals: focus not moved in, Tab escapes, Escape does nothing, focus not restored (check for an existing `document:keydown.escape` before adding one); Escape unreachable when the panel is a sibling of the trigger; focus lost when the focused element is destroyed; composite widgets without arrow-key navigation / roving `tabindex`; redundant key handlers on native buttons; fake-disabled controls still focusable; route-change focus, missing skip link, `autofocus`; missing focus indicator → report only (CSS, STYLE-40). | Use native controls; `tabindex="0"` / `-1` only; move and restore focus in overlays; roving tabindex for composites. |

## How agents use this file

- Read only the area you were given. One attribute belongs to one area (ownership column) — do not report the same attribute under two areas.
- Check library defaults before reporting (e.g. Angular Material icons already set `aria-hidden`; some toast libraries already use live regions).
- For shared components, count consumers (Grep the selector) and put the count in the message.
- Focus styling and contrast are **never** ACCESS findings (STYLE-40/41/44).
- When unsure, report `info` with `unverified` in the message.
