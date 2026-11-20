# ACCESS — ASP.NET MVC / Razor

The Razor / script part of the ACCESS rules in `rules/access.md` (same IDs, same severities). Read it together with
`rules/access.md` **only when the batch or phase has a `.cshtml` or `.js` file**; an Angular-only batch never loads it.

## Rules (part of ACCESS-00..20)

Applies to `**/*.cshtml` (Views/**, Areas/*/Views/**, Pages/**, `_Layout*.cshtml`, partials, EditorTemplates,
DisplayTemplates, View Component views; not `_ViewImports` / `_ViewStart`), the project's own scripts (`**/*.js`, not
`wwwroot/lib`, minified files or bundles) and, read as context, Tag Helper / HTML Helper / View Component classes and view
models (`*.cs`).

**ACCESS-00 (MVC).** No Angular syntax in `.cshtml` / `.js`. `aria-*` values are strings, never a C# `bool` (`aria-x="@flag"`
renders `aria-x="aria-x"` or nothing — write `@(flag ? "true" : "false")`). Omit an attribute with `null` / `removeAttribute`.
Never change a generated `name` or `id`. Never `@Html.Raw` accessibility markup. Never edit `bin`, `obj`, `wwwroot/lib`,
`packages`, `*.Designer.cs`, `*.min.js` or bundles; no NuGet / npm / LibMan package and no bundle config change. Keep every
`asp-*`, `data-*` and `js-*` hook. Fix the generator (partial, EditorTemplate, Tag / HTML Helper, View Component), not each
view; count its consumers (`partial name=`, `Html.Partial(`, `RenderPartial(`, `PartialAsync(`, `Component.InvokeAsync(`,
`<vc:`, `EditorFor`). User-visible text comes from the project's localizer (LANG).

- **ACCESS-01 (MVC):** a hand-written `<label for>` that does not match the generated id (`Address.City` → `Address_City`,
  case-sensitive), or a label with neither `asp-for` nor `for`; `<label asp-for>` / `Html.LabelFor` whose property has no
  `[Display(Name = …)]` (it shows the raw property name) or a literal `[Display(Name = "…")]` that bypasses localization; an HTML
  Helper control with a custom `id` in `htmlAttributes` that no longer matches its `LabelFor`; `asp-items` /
  `Html.DropDownListFor` with no name; radio / checkbox lists with no group name; EditorTemplates rendering inputs without label
  linkage; static ids repeated by a loop or a per-row partial (fix with `Html.IdFor(...)`); script-created fields with no name.
- **ACCESS-02 (MVC):** `<img src="~/…">` without `alt`; `alt="@Model.FileName"` or a path as alt; icon fonts (`fa`, `bi`,
  `glyphicon`) and sprite `<span>`s without `aria-hidden="true"`; icon-only `<a asp-action="Edit|Delete|Details"><i…></i></a>`
  in scaffolded tables — the name includes the row item (`@Localizer["Delete {0}", item.Name]`); images or icons emitted by a
  Tag Helper, HTML Helper, View Component or script (fix the generator); DB / uploaded images whose model has no description
  field (report: contract change).
- **ACCESS-03 (MVC):** `aria-*="@boolExpr"` (see ACCESS-00); a script that changes visual state (`.toggleClass`, `.slideToggle`,
  `.show()` / `.hide()`, `hidden`) without setting `aria-expanded/selected/pressed`, or a static `aria-expanded="false"` never
  updated; Bootstrap / other widgets missing their documented ARIA (modal `aria-labelledby`, toggles `aria-controls`) —
  version-aware (BS3/4 `data-toggle`, BS5 `data-bs-toggle`), and never duplicate what the library manages; validation:
  `[Required]` without `aria-required`, a server re-render (`input-validation-error`) without `aria-invalid` and
  `aria-describedby` to the `asp-validation-for` / `Html.ValidationMessageFor` span (give the span an id), a validation summary
  never announced (focus it or use a persistent live region; do **not** put `role="alert"` on every field message), never create
  an id jQuery Validation generates (`<id>-error`), never reference both a container and its child; `aria-*` ids that a partial
  renders only in some states or repeats per row; initial ARIA written by a `document.ready` script (put it in the Razor markup).
- **ACCESS-14 (MVC):** AJAX (`.load`, `$.ajax` + `.html`, `data-ajax-update`, `fetch` + `innerHTML`) inserting results with no
  persistent polite live region in the layout; a live region created in the same update; no `aria-busy` while loading;
  TempData / flash messages without `role="status"` / `"alert"`; an AJAX-inserted form not re-parsed for validation (report).
- **ACCESS-04 / 09 / 10 / 12 / 20 (MVC):** `_Layout*.cshtml` without `<main>` around `@RenderBody()`, nav in a `<div>`, several
  unnamed `<nav>`s, no `<header>` / `<footer>` (check every layout and each folder's `_ViewStart`); `<html lang dir>` missing or
  hard-coded when the culture switches (use `CultureInfo.CurrentUICulture`); the viewport zoom lock and an empty `<title>`
  (`ViewData["Title"]`) in the layout; a layout that hard-codes an `<h1>` while views render their own; headings in shared
  partials at varying depths (`_*.cshtml` partials, EditorTemplates and Components are fragments; `Views/<Ctrl>/<Action>.cshtml`
  are pages); `<a href="#">` / `javascript:void(0)` with a script handler; `div` / `span` / `tr` made clickable by `onclick` or
  `$(…).on('click')`; `<button>` in a form without `type="button"`; scaffolded tables with `<th>` lacking `scope`, no `<caption>`,
  mixed header and data cells; a per-row partial or helper emitting a `<div>` between `ul/li` or `tbody/tr`; nested forms (a
  partial with `<form>` / `Html.BeginForm` inside a view's form).
- **ACCESS-05 / 16 (MVC):** script click handlers (`onclick`, `.on('click')`, `addEventListener('click')`) on `div/span/tr/li` with
  no `tabindex` or key handler; positive `tabindex` in views and in `htmlAttributes` (`new { tabindex = 1 }`); collapsed panels
  hidden by a class that is not `display:none`; a custom modal that does not move focus in, close on Escape or restore focus
  (a Bootstrap modal with its documented markup already does — don't duplicate); `.html()`, `.load()` or `innerHTML` replacing
  a region that had focus, and handlers bound directly to replaced content (use delegation:
  `$(container).on('keydown', '.js-x', …)`); after an AJAX swap focus goes to the new heading (`tabindex="-1"`) or back to the
  trigger; `autofocus`; no skip link in the layout (target `<main id tabindex="-1">`); `<a class="disabled">` still focusable.
