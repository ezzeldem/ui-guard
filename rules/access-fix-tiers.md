# ACCESS fixes that keep the design — tiers by visual risk

Read by `ui-fixer` in every `/ui-guard:fix access` phase, together with `rules/access.md` (ACCESS-00 always applies).
The aim: every accessibility fix leaves the page looking exactly as it did. Fixes are sorted by how likely they are to
change what is drawn. A phase applies them **tier by tier, A → B → C → D**, and checks before each tier.

## Tier A — attributes only (no visual risk)

Adding or correcting an attribute that the browser does not style:
`alt`, `aria-label` / `aria-labelledby` / `aria-describedby`, `lang`, `title` on an `<iframe>`, `scope` on a `<th>`,
`for` + `id` pairs, `autocomplete`, removing redundant ARIA (`role="button"` on a `<button>`), removing a positive `tabindex`.

Two attributes look harmless but can be styled:
- `required` — the project may style `:required` or `:invalid`.
- `type` (e.g. adding `type="button"`) — the project may style `[type=…]`, `button[type=submit]`, …
Before adding or changing them, search the project stylesheets for `:invalid`, `:required`, `:optional`, `[required` and
`[type=`. If any rule could match the element, treat the change as **Tier C** (needs a neutralization or a decision).

Never invent text. Alt text, labels and names come from visible text, translation keys that already exist, or the
developer (→ needs-decision). `alt="image"`, `alt="icon"` or a file name is worse than nothing.

## Tier B — a `div` becomes a landmark (low risk)

`div` → `header`, `nav`, `main`, `section`, `aside`, `footer`, `figure` when the block clearly plays that role.
These elements have almost no default style, but check first:
1. The generic/elements layer and every stylesheet for bare selectors of the **new** tag (`header {`, `nav ul`, `main > *`, …)
   and for bare `div` selectors that the element would stop matching (`div + div`, `.c-x > div`).
2. `figure` has a default margin in every browser: add `margin: 0;` to the element's own class in the component's file
   (or to a new class on it), unless a rule already sets the margin.
3. A landmark must be unique or named: two `<nav>`s get different `aria-label`s (translation keys).

## Tier C — a tag swap that brings browser default styles (medium risk)

| Swap | Neutralization added in the component's own SCSS, on the element's class |
|---|---|
| `div`/`span` → `button` | `appearance: none; background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; text-align: inherit; line-height: inherit; cursor: pointer;` and the **original** `display` (`display: block` for a div, `inline` for a span) unless the class sets one |
| `a` ↔ `button` | the same button reset, or for a new `a`: `color: inherit; text-decoration: none;` when the class does not set them |
| `p`/`div` → `h1`–`h6` | `margin: 0; font: inherit;` when the class does not set margin / font itself |
| div list → `ul`/`ol` + `li` | `list-style: none; margin: 0; padding: 0;` on the list, `display` of the original on the items |
| group → `fieldset` + `legend` | `border: 0; padding: 0; margin: 0; min-inline-size: 0;` on the fieldset; the legend gets `padding: 0;` and the visually-hidden utility when it was not visible before |
| `td` → `th` | `font-weight: inherit; text-align: inherit;` when the class does not set them |

Rules for every Tier C change:
- The neutralization goes **in the same change**, in the component's own SCSS file, on a class of the element
  (add a BEM element class if it has none). Never in a global reset.
- Prefer the smallest swap: when a class already carries the look, change the **heading level**, not the element type;
  prefer `role` + keyboard on a custom data grid over rebuilding it as `<table>`.
- Keep the project's existing modal (add `role="dialog"`, `aria-modal="true"`, a name, and the project's own focus handling)
  instead of switching to `<dialog>`, unless the developer asked for it.
- With the swap, the old `role`, `tabindex="0"` and Enter/Space handlers become redundant and are removed (ACCESS-04 supersession).

## Tier D — structure (high risk)

Moving nodes, adding or removing wrappers. Only after the selector-impact check below, and only when the impact is fully
handled in the same change. A wrapper added only for styling reasons may use `display: contents`; never use it on an element
that carries a role or must be focusable.

## Selector-impact check (before every Tier B, C or D change)

The fixer does not run scripts. `phase.js show` precomputes the check (`scripts/selector-impact.js`) and writes it into the
phase file `.ui-guard/tmp/access/fix/phase-<id>.json` under **`selectorImpact`**:
`{ "<template>": { "<class>": { "tag": "div", "hits": [{ "file", "line", "selector", "why" }] } } }` — one entry per class on a
swappable element (`div`, `span`, `p`, `a`, `button`, `td`, `li`, `ul`, `ol`, `section`, `img`, `table`).
A hit is a rule that touches the block and could stop (or start) matching after the change: structural pseudo-classes
(`:first-child`, `:last-child`, `:nth-child`, `:nth-of-type`, `:only-child`, `:empty`, `:has(`), combinators (`>`, `+`, `~`),
bare tag selectors next to the block's classes, bare selectors of the old tag, and `:required` / `:invalid` / `[type=…]` rules.
**Read the entry of the element's class before every Tier B/C/D change.** No entry or an empty `hits` list → no selector risk.
Hits → either adjust each listed selector in the same change so it matches exactly what it matched before, or leave the change
out and write it to the skipped file (`what`: the change, `reason`: the hit). A bare selector of the NEW tag is not in the list:
search the stylesheets for it yourself (Grep) before a swap.

## Fix map for ACCESS-06..22

Every finding from `access-check.js` carries `tier` and `impact`; the fixer follows the tier and still runs the selector-impact
read for B/C/D. One line per rule (the rule text is in `rules/access.md`):

| Rule | What the fixer does | Tier |
|---|---|---|
| ACCESS-06 | `autocomplete` values from the field's meaning; `type="email"/"tel"/"url"`; `required` where a star promises it (selector check for `:required`, `:invalid`, `[type=…]` first → else Tier C) | A |
| ACCESS-07 | `alt` / `value` on image and button inputs (existing text or a key only); visually-hidden label instead of a hidden one; legend first (check child-order selectors) | A / D |
| ACCESS-09 | one `<main>`; distinct `aria-label` on repeated landmarks; `datetime` on `<time>`; `figure` gets `margin: 0` | A / B / C |
| ACCESS-10 | a second `<h1>` becomes `<h2>` and the class keeps the look; an empty heading is a decision (what should it say?) | C / needs-decision |
| ACCESS-11 | `aria-label` with the destination while the visible text stays; hidden "opens in a new tab" text | A |
| ACCESS-12 | `lang` / `dir` on `<html>`; remove the zoom lock; route titles are a decision (wording) | A / needs-decision |
| ACCESS-13 | drop the wrong role or move it inward; bind `[disabled]` to the class condition | A / D |
| ACCESS-14 | keep the live container in the DOM, put the `@if` inside it | D |
| ACCESS-15 | `aria-activedescendant` binding; tooltip id + `aria-describedby` | A |
| ACCESS-16 | remove the stray `tabindex` | A |
| ACCESS-18, 17, 08 | always a decision with options (captions file, transcript, pause control, timer length, error wording) | needs-decision |
| ACCESS-19 | `title` / `aria-label` on frames and objects; canvas: decision | A / needs-decision |
| ACCESS-20 | `<th scope>` with the table-cell neutralization (bold and centred by default), hidden `<caption>`, `headers` pairing | A / C |
| ACCESS-21 | see "Image box" below | C / needs-decision |
| ACCESS-22 | start the `aria-label` with the visible text, or remove it | A |

### Image box (ACCESS-21)

The box of an image is reserved when the page knows its size before the file loads.
- **Never guess an intrinsic size.** The plugin does not open images, and a wrong `width`/`height` is worse than none.
- If the component CSS **already fixes the size** of the box (a class with a fixed inline size and block size, or an `aspect-ratio`),
  there is nothing to fix: the rule does not fire.
- If the class fixes only the width (the height depends on the file) or nothing at all: add `aspect-ratio: <w> / <h>` in that
  component's own SCSS **only** when both numbers are already written in the project for this very image (for example a ratio
  token, or the `width` and `height` of the same image in its design) and the rendered box therefore stays identical.
- Adding `width` / `height` **attributes** can change the rendered size whenever the CSS does not fix it (they act as presentation
  hints). That is Tier C: only with the before/after visual proof (Playwright). Without Playwright it goes to the decisions file with the
  options: (A) give me the ratio and I add `aspect-ratio`, (B) add width/height attributes after a visual check, (C) keep as is.

## Visually-hidden toolkit

For hidden labels, legends, captions, skip links and status text use `.u-sr-only` — the one visually-hidden utility (AXIS
accessibility rule 5: declared once in `utilities/accessibility/`, never re-implemented, so a project `.sr-only` /
`.visually-hidden` is not reused). `foundation.js sr-only --apply` creates it when it is missing (absolute position, 1px size,
`clip-path: inset(50%)`, overflow hidden, no wrapping). Never hide text that must be announced with `display: none` or `visibility: hidden`.

## Needs a decision (never changed by a fix)

Anything that needs a visible change, or content only the developer knows, goes to the decisions file of the phase
(`.ui-guard/tmp/access/fix/decisions-<phase>.jsonl`, one JSON object per line:
`{"topic":"…","file":"…","line":12,"issue":"…","reason":"…","options":["…","…","…"]}`) with 2–3 concrete options.
Typical topics:
- **Focus outline removed** — A: add a `:focus-visible` outline in the brand color · B: a 2px inset box-shadow · C: keep (document why).
- **Menu only on hover** — A: also open on focus/click with `aria-expanded` · B: make the items always reachable from a toggle button.
- **Carousel plays by itself** — A: add a pause button · B: stop autoplay when reduced motion is on · C: no autoplay.
- **Video without captions** — A: add a captions track (file needed) · B: a transcript link.
- **Color is the only signal of an error** — A: add an icon + text · B: add the error text under the field.
- **Image purpose unknown** (meaning not clear from the code) — A: decorative (`alt=""`) · B: alt text you provide (a translation key).
- **Icon-only control with an unclear name** — A: name you provide · B: show a visible text label.
- **Heading level of a standalone component** — A: a `headingLevel` input · B: fixed level chosen by you.
- **Image box not reserved** — A: you give the ratio, I add `aspect-ratio` in the component SCSS · B: width/height attributes after a visual check · C: keep.
- **Route page titles** — A: a title per route from translation keys (you give the wording) · B: one shared title.
- **Timers, carousels, flashing content** — A: pause control · B: longer timer / keep until dismissed · C: leave as is, documented.
The run never stops for these; they are collected into one list at the end (`.ui-guard/access/needs-decision.md`).

## Verification

- **Playwright installed:** before/after screenshots with a 0-pixel diff, **and** a computed-style + bounding-box compare
  of every element on each screenshot route (`screens.js shoot --styles`, `style-diff.js`). Both must be clean.
- **Playwright not installed:** the access fix is limited to **Tier A**, and **Tier B only where the elements layer has no rule
  for the new tag**. Every Tier C/D item goes to needs-decision with the reason "needs visual verification", and the summary
  says plainly that the proof was static only. Never claim a verification that did not run.
