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
| ACCESS-02 | **Alt** — `alt`, icon text alternatives, `aria-hidden` on decorative graphics, the name of icon-only controls | warning | eslint + ai | `*.html`, `*.ts` | `<img>` without `alt`; `alt=""` on a meaningful image; filename/placeholder alt ("icon", "image", "logo.svg") or alt that starts with "image of" / "picture of" (the role is already announced); alt describing looks instead of purpose; unlocalized alt; inline `<svg>` without `role="img"` + name (meaningful) or not hidden (decorative); icon fonts/sprites/icon components without `aria-hidden` (check the library default first); icon-only buttons with no accessible name; a decorative icon inside a named control not hidden; an image inside a link/button whose alt is not the action; meaning only in a CSS `background-image` (report); images created from TS with the same gaps; icon config objects with a path but no way to describe it. | Meaningful: translated `alt` describing purpose. Decorative: `alt=""` / `aria-hidden="true"`. Icon-only button: `[attr.aria-label]` with a key. |
| ACCESS-03 | **ARIA** — `role` on custom widgets, ARIA state, validation ARIA, live regions, invalid/redundant ARIA, id references | warning | eslint + ai | `*.html`, `*.ts` | Custom div-built dropdown/listbox/combobox/tablist/menu/tree/dialog with no role; toggles without `aria-expanded` (or `aria-controls`); `aria-checked` / `aria-pressed` / `aria-selected` / `aria-current` fixed in markup instead of bound to the real state; active nav item without `aria-current`; sortable header without `aria-sort`; loading region without `aria-busy`; dialog without a name or `aria-modal` (never claim `aria-modal` without a real focus trap); redundant ARIA on native elements; disallowed/misspelled/invalid ARIA; broken id references (missing, duplicated in loops, inside a false `@if`); static state that lies; `[aria-x]` instead of `[attr.aria-x]`; stale ARIA set once from TS; `aria-hidden="true"` on a subtree with focusable content; a role on a wrapper whose interaction comes from a native child; fields with validation but no `aria-invalid`; errors not linked with `aria-describedby`; `Validators.required` with no `required`/`aria-required`; error containers/toasts with no `role="alert"`/live region (check whether the toast library announces already). | Bind state with `[attr.aria-expanded]="open"` etc.; link errors with `[attr.aria-describedby]`; add `role="alert"` to error containers. |
| ACCESS-04 | **Semantics** — element choice, landmarks, headings, tables, lists, component-host wrappers, `lang`/`dir` | warning | eslint + ai | `*.html`, `index.html` | No `<main>`, nav in a `<div>`, several `<nav>`s without names (layout shell); no `<h1>`, skipped levels, fake headings, headings for emphasis (never renumber a shared component's heading blindly — check usages); `<div (click)>`/`<span (click)>`/`<a (click)>` without `href` used as buttons; `href="javascript:void(0)"`; navigation by click handler instead of `routerLink`; div-lists, div-tables, radio/checkbox groups without `<fieldset>`; `<button>` in a form without `type="button"`; duplicate attributes (report if fixing changes behavior); nested `<form>`; `<th>` without `scope`, tables without caption/`thead`/`tbody`; a component host between `<ul>` and `<li>` or `<tbody>` and `<tr>` (check `display: contents` first); foreign-language runs without `lang`; hard-coded `dir` in an app that switches direction. | Use the native element. **Supersession:** when a fake control becomes a native element, its `role` (ACCESS-03) and `tabindex`/key handlers (ACCESS-05) are dropped. |
| ACCESS-05 | **Keyboard** — `tabindex`, focus order, key handlers, focus management, roving tabindex | warning | eslint + ai | `*.html`, `*.ts` | Positive `tabindex`; click-only elements not focusable or not operable with Enter/Space; dead or double focus stops; hidden-but-focusable content (class-hidden instead of `@if` — verify first); focus order different from visual order (CSS `order`, `row-reverse`, RTL); overlays/modals: focus not moved in, Tab escapes, Escape does nothing, focus not restored (check for an existing `document:keydown.escape` before adding one); Escape unreachable when the panel is a sibling of the trigger; focus lost when the focused element is destroyed; composite widgets without arrow-key navigation / roving `tabindex`; redundant key handlers on native buttons; fake-disabled controls still focusable; route-change focus, missing skip link, `autofocus`; missing focus indicator → report only (CSS, STYLE-40). | Use native controls; `tabindex="0"` / `-1` only; move and restore focus in overlays; roving tabindex for composites. |
| ACCESS-06 | **Forms: types and autofill** | warning | script | `*.html`, `index.html`, `*.ts` | A field that looks like an email, phone or web address without the matching `type`; identity, address, sign-in or card fields without `autocomplete`; a password field without `current-password` / `new-password`; `type="number"` on an identifier (phone, card, code); a label ending in `*` whose control has no `required` / `aria-required`. | Set `type="email"`, `"tel"`, `"url"`; add `autocomplete="given-name"` and friends; use `type="tel"` for identifiers; add `required` and keep the star `aria-hidden`. If a stylesheet styles `:required`, `:invalid` or `[type=…]`, the change is Tier C. |
| ACCESS-07 | **Forms: structure** | warning | script | `*.html`, `index.html`, `*.ts` | `<input type="image">` without `alt`; `<input type="button">` without `value`; a `<legend>` that is not the first child of its `<fieldset>`; a label hidden with `display:none` / `hidden`; a control whose only name is `title`; a `<select>` that navigates on `(change)`. | Add `alt` / `value`; move the legend first; use the visually-hidden utility instead of `display:none`; add a real label; give the select a button that applies the choice (visible change → decision). |
| ACCESS-08 | **Forms: errors, hints, steps** | warning | ai | `*.html`, `index.html`, `*.ts` | Format hints ("at least 8 characters") that float next to a field instead of being tied to it; a field corrected but still `aria-invalid="true"`; an error that is shown by colour alone; a multi-step form whose heading/focus does not move when the step changes; an error summary after submit that is neither focused nor in a live region. | Link hints with `[attr.aria-describedby]`; reset `aria-invalid`; add error text or an icon beside the colour (decision); move focus to the new step heading; focus the summary. |
| ACCESS-09 | **Landmarks and sections** | warning | script + ai | `*.html`, `index.html`, `*.ts` | More than one `<main>` in a template; several `<nav>` or `<aside>` landmarks without distinct names; a `<section>` with neither heading nor name; a `<figure>` without `<figcaption>` or name; a `<time>` without `datetime`; (ai) an `<article>` used as a plain wrapper or an `<aside>` that holds the main content. | Keep one `<main>`; add a different `aria-label` (translation key) to each repeated landmark; name the section or use a `div`; add a `figcaption` and `margin: 0` on the figure; add `datetime`. |
| ACCESS-10 | **Headings** | warning | script | `*.html`, `index.html`, `*.ts` | A second `<h1>` in one template; an empty heading, or one that holds only an unnamed image. | Make the extra `<h1>` an `<h2>` (keep the look with a class, or let a shared component take the level as an input); give the empty heading text or remove it. |
| ACCESS-11 | **Links** | warning | script | `*.html`, `index.html`, `*.ts` | Link text that means nothing out of context ("click here", "more"); several links with the same text that go to different places; a `target="_blank"` link that does not say it opens a new tab. | Keep the visible text and add an `aria-label` with the destination (translation key), or reword; add visually-hidden "opens in a new tab". |
| ACCESS-12 | **Document** | warning | script + ai | `*.html`, `index.html`, `*.ts` | `<html>` without `lang`; a viewport that blocks zoom (`user-scalable=no`, `maximum-scale=1`); an empty `<title>`; routes that all share one page title with no `title` or Title service; (ai) text that exists only inside an image. | Set `lang` (and `dir`); remove the zoom lock; give every route a `title` through a title strategy (decision for the wording); put the image text in its `alt`. |
| ACCESS-13 | **ARIA: role misuse** | warning | script | `*.html`, `index.html`, `*.ts` | `role="presentation"` / `"none"` on a focusable control; `role="application"`; `role="button"` on a real link; an interactive role on a heading; `role="menu"` on a list of links; a `tablist` / `listbox` / `menu` / `radiogroup` with no matching children; a control that looks disabled through a class but has no `disabled` / `aria-disabled`. | Remove the role, or move it to an inner element; give each child its role; bind `[disabled]` (or `[attr.aria-disabled]`) to the same condition as the class. |
| ACCESS-14 | **Live regions** | warning | script + ai | `*.html`, `index.html`, `*.ts` | A live region (`role="status"`, `"alert"`, `aria-live`) that is created at the same moment as its message; `aria-live="assertive"` on routine status text; (ai) loading, result-count, cart-count or filter changes that update the page with no live region at all. | Keep the region in the DOM and change only its text; use `polite` for routine text; add `role="status"` to a container that already exists. |
| ACCESS-15 | **ARIA: widget patterns** | warning | script + ai | `*.html`, `index.html`, `*.ts` | A `combobox` without `aria-activedescendant`; a `role="tooltip"` that no element references with `aria-describedby`; (ai) a tooltip reachable by hover only; a carousel without names, working previous/next buttons or a pause control. | Bind `aria-activedescendant` to the highlighted option; give the tooltip an id and reference it; add the missing controls (visible change → decision). |
| ACCESS-16 | **Keyboard: tab stops** | warning | script + ai | `*.html`, `index.html`, `*.ts` | A literal `tabindex="-1"` on a native control outside a composite widget; `tabindex="0"` on plain content; (ai) content revealed on hover only with no keyboard path; a trap the user cannot leave; an open modal whose background is not `inert`. | Remove the `tabindex`; keep `tabindex="0"` only on a scrollable region that has a name; also reveal on `:focus-within`; leave the trap with Escape; mark the background `inert` (a project helper first, no new dependency). |
| ACCESS-17 | **Motion and timing** | warning | ai | `*.html`, `index.html`, `*.ts` | A carousel or slideshow that moves on its own with no pause; a message that disappears by timer before it can be read; a session timeout with no warning; content that flashes more than three times a second. | Add a pause control; keep messages until dismissed or lengthen the timer; warn before the timeout; remove the flash. All of these change what people see → decision. |
| ACCESS-18 | **Audio and video** | warning | script + ai | `*.html`, `index.html`, `*.ts` | A `<video>` without a captions track; an `<audio>` with no transcript nearby; media that autoplays with sound; media with no controls; a video with no name; (ai) a visual-only video with no description or transcript. | Add `<track kind="captions">` (needs the file); link a transcript; remove `autoplay` or add `muted`; add `controls`; add `aria-label`. |
| ACCESS-19 | **Embeds and canvas** | warning | script + ai | `*.html`, `index.html`, `*.ts` | An `<iframe>` without a meaningful `title` (empty, "iframe", "frame"); an `<object>` / `<embed>` with no name or fallback; a `<canvas>` with no text alternative, or an interactive one with no keyboard equivalent; (ai) a chart without a text summary or table. | Add `title` / `aria-label`; add fallback text inside the element; provide the same actions as real controls; add a summary or table beside the chart. |
| ACCESS-20 | **Tables** | warning | script + ai | `*.html`, `index.html`, `*.ts` | A table with no header cells; an empty `<th>`; merged cells (`colspan` / `rowspan`) with no `headers` pairing; a table with no caption or name; (ai) a layout table that should be grid/flex or `role="presentation"`. | Use `<th scope="col">` / `scope="row"`; put visually-hidden text in the empty header; pair cells with `headers`; add a `<caption>` (hidden if the design has none). Header cells have browser styles: neutralize in the component SCSS (Tier C). |
| ACCESS-21 | **Image box reserved** | warning | script | `*.html`, `index.html`, `*.ts` | An `<img>` (or `ngSrc`) with neither `width` + `height` attributes, nor `fill`, nor a class that fixes the whole box (`aspect-ratio`, or a fixed inline and block size), so the page jumps when the image loads. `MEDIA-01` reports the same condition for `/ui-guard:check` and the hooks; here it carries the fix rule. | When the component CSS already fixes the size, add `aspect-ratio` in that component's SCSS only if it provably keeps the same box. Width/height attributes can change the rendered size when the CSS does not fix it: that is Tier C (needs the visual proof) or a decision. Never guess an intrinsic size. |
| ACCESS-22 | **Name matches visible text** | warning | script | `*.html`, `index.html`, `*.ts` | A button or link whose `aria-label` does not contain its visible text (voice control cannot select it); an `aria-label` that only repeats the visible text. | Start the `aria-label` with the visible text, or remove it; prefer visually-hidden extra text over an override. |

## Impact and fix tier of ACCESS-06..22

A script finding carries its own impact (High / Medium / Low, as defined below) and its fix tier (A–D, or "needs-decision" when the fix is visible or needs content only the developer has; see `rules/access-fix-tiers.md`). "script + ai" means a script decides the clear cases and the AI pass judges the rest.

| ID | Impact | Fix tier | Checked by |
|---|---|---|---|
| ACCESS-06 | Medium | A | script |
| ACCESS-07 | Medium | A | script |
| ACCESS-08 | Medium | needs-decision | ai |
| ACCESS-09 | Medium | B | script + ai |
| ACCESS-10 | Medium | C | script |
| ACCESS-11 | Medium | A | script |
| ACCESS-12 | High | A | script + ai |
| ACCESS-13 | Medium | A | script |
| ACCESS-14 | Medium | D | script + ai |
| ACCESS-15 | High | A | script + ai |
| ACCESS-16 | High | A | script + ai |
| ACCESS-17 | Medium | needs-decision | ai |
| ACCESS-18 | High | needs-decision | script + ai |
| ACCESS-19 | Medium | A | script + ai |
| ACCESS-20 | Medium | C | script + ai |
| ACCESS-21 | Low | C | script |
| ACCESS-22 | Medium | A | script |

## Impact levels (the report ranks ACCESS by user impact, not one "warning" for all)

| Impact | Examples |
|---|---|
| **High** — blocks a task | meaningful image without `alt`; form control or icon-only button without a name; clickable `div`/`span` without role and keyboard; `<html>` without `lang`; positive `tabindex`; focus outline removed with no replacement; ARIA state that contradicts the real state (`aria-expanded="false"` on an open panel, `aria-hidden` on focusable content) |
| **Medium** — makes it harder | skipped heading level; `div` where a landmark belongs; `a` used as a button or `button` used as a link; data table without `th`; `iframe` without `title`; vague link text ("click here", "more") |
| **Low** — polish | everything else |

An agent may add `"impact": "high" | "medium" | "low"` to a finding; otherwise `lib/access-impact.js` decides from the message.
The report counts add up (High + Medium + Low = total). The same issue from one shared source more than 3 times is one row
"×N" with 2–3 examples, and the report starts with a short "fix these first" list (shared sources first).

**Never reported** (they are not problems): a native element "without an explicit role" (`button`, `a[href]`, `input`,
`nav`… have an implicit role); a correct `alt=""` on a decorative image; a missing `<h1>` in a component that is clearly a
fragment (not a routed page, not the shell).

## Fixing without changing the design

`/ui-guard:fix access` follows `rules/access-fix-tiers.md`: Tier A (attributes) → B (landmarks) → C (tag swaps with a
neutralization in the component's own SCSS) → D (structure), each after the selector-impact check. Anything that needs a
visible change or content only the developer knows goes to `.ui-guard/access/needs-decision.md` with 2–3 options.

## How agents use this file

- Read only the area you were given. One attribute belongs to one area (ownership column) — do not report the same attribute under two areas.
- Check library defaults before reporting (e.g. Angular Material icons already set `aria-hidden`; some toast libraries already use live regions).
- For shared components, count consumers (Grep the selector) and put the count in the message.
- Focus styling and contrast are **never** ACCESS findings (STYLE-40/41/44).
- Do not report native elements without an explicit role, a correct `alt=""` on a decorative image, or a missing `<h1>` in an obvious fragment.
- When unsure, report `info` with `unverified` in the message.
