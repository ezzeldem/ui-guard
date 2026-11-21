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

**ACCESS-00 (MVC), continued.** In C# and JavaScript too, `aria-*` values are strings (`SetAttribute("aria-expanded", "true")`,
`setAttribute('aria-expanded', 'true')`). Extra attributes go through Tag Helper passthrough (`<input asp-for="X" aria-describedby="…">`)
or `htmlAttributes` (`aria_describedby` renders `aria-describedby`). Script text comes from the server — a `data-*` attribute
rendered with the localizer, or a localized strings object the project already renders — never a literal in a `.js` file and never
a new global strings mechanism (report the gap). A Tag Helper localizes through an injected localizer or takes the text from its
caller, never a literal. New keys in a strongly-typed `.resx` whose `*.Designer.cs` is not regenerated at build: report the
regeneration step, never hand-edit it. When `wwwroot/js` is compiled or bundled output, fix the source file. Caller-specific values
reach a partial / View Component / helper through what it already receives (model, `ViewData`, invocation argument) or an additive
option (an optional `ViewData` key read with a fallback, an optional View Component parameter with a default, an optional Tag Helper
property or helper parameter); anything else — a required parameter, a changed signature, a view-model contract, controller /
action logic, routing, model binding — is reported, never changed. Third-party widgets: their documented options for the installed
version, at the call site or in the init script; when configuration cannot make them accessible, report the library, version and
gap. Where the fix goes: AJAX-inserted markup → the partial the endpoint returns, its focus / announcement → the inserting script;
built-in helper output → what is passed to it (attributes, `[Display]` metadata, label expression); state changed by a script → the
script function that changes the visual state.

**ACCESS-00 (MVC), vendor and keys.** Never patch `Scripts/` files installed by NuGet (MVC 5) or any `*.min.css` either. A missing
localizer key fails quietly (`IStringLocalizer` returns the key itself, so an English-looking key renders in English and untranslated
elsewhere): add every new key to **every** culture's `.resx` (or the project's equivalent store) and check a non-default culture.
Custom Tag Helper / HTML Helper blast radius: count usages of the element name (`<my-tag`), the attribute it targets, or the helper
method name, and put the count in the finding.

- **ACCESS-01 (MVC):** a hand-written `<label for>` that does not match the generated id (`Address.City` → `Address_City`,
  case-sensitive), or a label with neither `asp-for` nor `for`; `<label asp-for>` / `Html.LabelFor` whose property has no
  `[Display(Name = …)]` (it shows the raw property name) or a literal `[Display(Name = "…")]` that bypasses localization; an HTML
  Helper control with a custom `id` in `htmlAttributes` that no longer matches its `LabelFor`; `asp-items` /
  `Html.DropDownListFor` with no name; radio / checkbox lists with no group name; EditorTemplates rendering inputs without label
  linkage; static ids repeated by a loop or a per-row partial (fix with `Html.IdFor(...)`); script-created fields with no name; a
  hard-coded `aria-label="Search"` in a localized view, a C# ternary between literals (`@(open ? "Hide" : "Show")`) or a script
  literal (`setAttribute('aria-label', 'Close')`). Fixes: visible label → `<label asp-for="X">` with the control's `asp-for="X"` (or
  `Html.LabelFor` of the same expression); label text → localized `[Display]` through the project's DataAnnotations localization,
  never label text hard-coded in the view; no visible label → `aria-label` in the profile's idiom (`aria-label="@Localizer["Search"]"`);
  visible pseudo-label → `aria-labelledby`; custom id on a helper control → keep it and point the label's `for` (or
  `aria-labelledby`) at it; EditorTemplate / shared partial → inside when the name is caller-invariant, else through the model /
  `ViewData` it receives; script-created field → name set in the same script, text from the server; radio / checkbox group →
  `<fieldset>` + localized `<legend>`.
- **ACCESS-02 (MVC):** `<img src="~/…">` without `alt`; `alt="@Model.FileName"` or a path as alt; icon fonts (`fa`, `bi`,
  `glyphicon`) and sprite `<span>`s without `aria-hidden="true"`; icon-only `<a asp-action="Edit|Delete|Details"><i…></i></a>`
  in scaffolded tables — the name includes the row item (`@Localizer["Delete {0}", item.Name]`); images or icons emitted by a
  Tag Helper, HTML Helper, View Component or script (fix the generator); DB / uploaded images whose model has no description
  field (report: contract change); hard-coded `alt` text in a localized view. Fixes: meaningful → `alt` in the localizer idiom
  describing purpose; decorative → `alt=""` (never localized, never omitted); decorative icon font / sprite → `aria-hidden="true"`.
- **ACCESS-03 (MVC):** `aria-*="@boolExpr"` (see ACCESS-00); a script that changes visual state (`.toggleClass`, `.slideToggle`,
  `.show()` / `.hide()`, `hidden`) without setting `aria-expanded/selected/pressed`, or a static `aria-expanded="false"` never
  updated; Bootstrap / other widgets missing their documented ARIA (modal `aria-labelledby`, toggles `aria-controls`) —
  version-aware (BS3/4 `data-toggle`, BS5 `data-bs-toggle`), and never duplicate what the library manages; validation:
  `[Required]` without `aria-required`, a server re-render (`input-validation-error`) without `aria-invalid` and
  `aria-describedby` to the `asp-validation-for` / `Html.ValidationMessageFor` span (give the span an id), a validation summary
  never announced (focus it or use a persistent live region; do **not** put `role="alert"` on every field message), never create
  an id jQuery Validation generates (`<id>-error`), never reference both a container and its child; `aria-*` ids that a partial
  renders only in some states or repeats per row; initial ARIA written by a `document.ready` script (put it in the Razor markup).
  Before any validation finding, read the installed client-validation version (`wwwroot/lib`, `Scripts/`): recent jQuery Validation
  already sets `aria-invalid` and appends its own error id to `aria-describedby` — never duplicate that. One description source per
  field, covering both the server-rendered path (POST re-render, or client validation off) and the client path; a fix for one must
  not break the other. The server-rendered linkage is conditional, so nothing points at an empty or absent message:
  `aria-invalid="@(hasError ? "true" : null)"`, `aria-describedby="@(hasError ? msgId : null)"`, the message span `id="@msgId"` built
  from `Html.IdFor(...)` plus a suffix the client library never generates (`-validation`) — in the shared EditorTemplate / Tag
  Helper / HTML Helper, not in every view. The validation summary gets a localized heading. A change to validation-library
  configuration is reported, never made. Scripts update `aria-*` state in the same function that changes the visual state.
- **ACCESS-14 (MVC):** AJAX (`.load`, `$.ajax` + `.html`, `data-ajax-update`, `fetch` + `innerHTML`) inserting results with no
  persistent polite live region in the layout (text localized, supplied by the server); a live region created in the same update;
  no `aria-busy` while loading (set it during the load, remove it after); TempData / flash messages without `role="status"` /
  `"alert"`; an AJAX-inserted form not re-parsed for validation (report).
- **ACCESS-04 / 09 / 10 / 12 / 20 (MVC):** `_Layout*.cshtml` without `<main>` around `@RenderBody()`, nav in a `<div>`, several
  unnamed `<nav>`s, no `<header>` / `<footer>` (check every layout and each folder's `_ViewStart`); `<html lang dir>` missing or
  hard-coded when the culture switches (use `lang="@CultureInfo.CurrentUICulture.Name"` and
  `dir="@(CultureInfo.CurrentUICulture.TextInfo.IsRightToLeft ? "rtl" : "ltr")"`, matching the project's existing mechanism); the viewport zoom lock and an empty `<title>`
  (`ViewData["Title"]`) in the layout; a layout that hard-codes an `<h1>` while views render their own; headings in shared
  partials at varying depths (`_*.cshtml` partials, EditorTemplates and Components are fragments; `Views/<Ctrl>/<Action>.cshtml`
  are pages); `<a href="#">` / `javascript:void(0)` with a script handler; `div` / `span` / `tr` made clickable by `onclick` or
  `$(…).on('click')`; `<button>` in a form without `type="button"`; scaffolded tables with `<th>` lacking `scope`, no `<caption>`,
  mixed header and data cells; a per-row partial or helper emitting a `<div>` between `ul/li` or `tbody/tr`; nested forms (a
  partial with `<form>` / `Html.BeginForm` inside a view's form). Landmarks are added in the layout only when purely additive (wrap
  `@RenderBody()`, never reorder); several `<nav>`s get distinct localized names. Fixes: fake button → `<button type="button">`
  carrying every class, `id` and `data-*` / `js-*` hook; fake link → `<a asp-action=…>` or a real `href`; table headers → `scope`
  and a localized `<caption>`; a wrapper break → the partial / helper emits the required element itself (a contract change when
  callers depend on the wrapper → report). Before a swap, grep the project scripts for selectors of the old element (`$('div.x')`,
  tag-based `querySelector`) and report instead of changing when any exist.
- **ACCESS-05 / 16 (MVC):** script click handlers (`onclick`, `.on('click')`, `addEventListener('click')`) on `div/span/tr/li` with
  no `tabindex` or key handler; positive `tabindex` in views and in `htmlAttributes` (`new { tabindex = 1 }`); collapsed panels
  hidden by a class that is not `display:none`; a custom modal that does not move focus in, close on Escape or restore focus
  (a Bootstrap modal with its documented markup already does — don't duplicate); `.html()`, `.load()` or `innerHTML` replacing
  a region that had focus, and handlers bound directly to replaced content (use delegation:
  `$(container).on('keydown', '.js-x', …)`); after an AJAX swap focus goes to the new heading (`tabindex="-1"`) or back to the
  trigger; `autofocus`; no skip link in the layout (target `<main id tabindex="-1">`); `<a class="disabled">` still focusable.
  Fixes: a native element first; otherwise `tabindex="0"` plus a `keydown` handler in the project's script style that calls the
  same function as the click handler — Enter + Space for buttons (Space with `preventDefault()`), Enter only for links; Escape calls
  the existing close function; capture the trigger and restore focus on close; a positive `tabindex` is removed from views and
  `htmlAttributes` only when DOM order already matches visual order. The skip link is the first focusable element in `<body>`, with
  localized text, hidden until focused by a visually-hidden-focusable class the project already has (`u-sr-only` first, else the
  existing one — Bootstrap 4 `sr-only sr-only-focusable`, Bootstrap 5 `visually-hidden-focusable`); when none exists, adding CSS is
  reported, not done. Collapsed content is hidden with `hidden` / `display: none` (a class that maps to `display: none` is fine;
  `visibility`, opacity or off-screen classes are not). Every validation finding is `runtimeCheck: needed`, to be confirmed after
  both a client-side and a server-side failure; keyboard findings say what a Tab walk must confirm.
