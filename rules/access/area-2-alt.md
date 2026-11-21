# Area 2 — text alternatives for images and icons

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

## Detect

- `<img>` with **no** `alt` (announced as its filename).
- `<img alt="">` on a **meaningful** image — silently hides real information.
- Placeholder/filename `alt`: `alt="Icon"`, `alt="image"`, `alt="error"`, `alt="logo.svg"`.
- `alt` describing appearance instead of purpose, or starting with "image of" / "icon of".
- Hardcoded, unlocalized `alt` on a meaningful image.
- **Inline `<svg>`** with no `role="img"` + name (meaningful), or not hidden (decorative).
- **Icon fonts** (`<i class="fa...">`, `<span class="icon-...">`) with no `aria-hidden="true"`.
- **Sprite icons** and **library icon components** (`<fa-icon>`, `<mat-icon>`, `<i class="pi pi-...">`)
  with no `aria-hidden` / no name. **Check the library default first** — many already emit
  `aria-hidden="true"`; do not propose an attribute that is already there.
- A control whose **only** content is an icon and therefore has **no accessible name** (icon-only
  close/delete/sort/edit/expand buttons — the most common instance of this defect).
- A decorative icon **inside** an already-named control, not hidden — pollutes the announcement.
- `<img>` inside a link/button where the alt should be the **action**, not the picture.
- Meaning conveyed only by a CSS `background-image` — impossible to fix in markup, so **report**.
- Images created from TypeScript (`Renderer2`, `createComponent`, `[innerHTML]`) with the same gaps.
- **Config objects that carry an icon path but no way to describe it** (e.g. an `IconConfig` with only
  `path`) — the shared component can then only ever render a decorative image. That missing optional
  field is the finding.

## Fix guidance

| Case | Fix |
|---|---|
| Meaningful `<img>` | localized `alt` describing **purpose** |
| Decorative `<img>` | `alt=""` — **never localized**, never omitted |
| Decorative inline `<svg>` | `aria-hidden="true"` + `focusable="false"` |
| Meaningful inline `<svg>` | `role="img"` + localized name |
| Decorative icon font / component | `aria-hidden="true"` (or the library's own input) |
| **Icon-only control** | hide the icon **and** put a localized name on the **control** — one paired fix |
| Decorative icon in a named control | hide the icon only |
| Image in a link/button with no other text | `alt` = destination or action |
| Third-party icon component | its documented hidden/label input, at the call site |
| CSS background-image carrying meaning | **report** with file + selector — never restyle |

**Judgment:** if removing the graphic loses information the user needs, it is meaningful. If adjacent
text already says it, it is decorative — hide it. State your classification and why. When you genuinely
cannot tell, say so and give both options.

## ASP.NET MVC / Razor targets

**Detect** (in addition to the stack-independent checks above):
- `<img src="~/…">` with no `alt`; `alt="@Model.FileName"` or a path used as alt; hardcoded `alt` text in a
  localized view.
- Icon fonts (`<i class="fa …">`, `bi`, `glyphicon`, sprite `<span>`s) with no `aria-hidden="true"`.
- **Icon-only links and buttons in scaffolded list/table views** (`<a asp-action="Edit"><i …></i></a>`,
  Delete/Details) — the most common MVC instance; each row's name should say which item it acts on.
- Images or icons produced by a custom Tag Helper, HTML Helper, View Component, or script with the same gaps.
- User-uploaded or database images whose model has **no description field** — the view can only render a
  decorative image; that missing field is the finding (report; adding a model field is a contract change).

**Fix guidance**

| Case | Fix |
|---|---|
| Meaningful `<img>` | `alt` in the profile's attribute idiom, describing **purpose** |
| Decorative `<img>` | `alt=""` — never localized, never omitted |
| Decorative icon font / sprite | `aria-hidden="true"` |
| Icon-only link/button | icon `aria-hidden="true"` **and** a localized name on the control, with the item when it varies per row (e.g. a localizer format argument: `@Localizer["Delete {0}", item.Name]`) |
| Generator-produced image/icon | fix in the Tag Helper / HTML Helper / View Component / script that emits it |
| CSS background-image carrying meaning | **report** with file + selector — never restyle |

## Not yours

A form field's name -> labels area. `role`/state ARIA -> aria area. Element choice -> semantics area.
`tabindex`/keys -> keyboard area. Any stylesheet change, and icon contrast -> report only.

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
