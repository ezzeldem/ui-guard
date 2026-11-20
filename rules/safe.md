# SAFE — security

The UI team's UI security rules, exactly as ui-code-review applies them (its SEC-01..10). Rule IDs are ui-guard's own;
the **UCR** column gives the matching ui-code-review ID. They cover what can be seen in UI code — Angular templates and
TypeScript, ASP.NET MVC Razor views (`.cshtml`) and plain scripts (`.js`). Server-side checks (authorization, input
validation on the API, SQL) are out of scope.

| ID | UCR | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|---|
| SAFE-01 | SEC-01 | error | ai | `*.html`, `*.ts`, `*.cshtml`, `*.js` | HTML built from data that is not a constant written in the code: `[innerHTML]` / `[outerHTML]` bound to API, route, user or translated-with-parameters data that the code also builds into HTML; `element.innerHTML =`, `outerHTML =`, `insertAdjacentHTML(...)`, `document.write(...)`, `Renderer2.setProperty(..., 'innerHTML', ...)`; jQuery `.html(x)`, `.append(x)`, `.prepend(x)`, `.before(x)`, `.after(x)`, `.replaceWith(x)`, `$(x)` where `x` is a string with markup and data in it. **Trace the data's origin before reporting.** | Render the data as text (interpolation, `textContent`, `.text()`), or build the elements with the framework. Keep `[innerHTML]` only for HTML the app itself owns. |
| SAFE-02 | SEC-02 | error | ai | `*.ts` | Angular sanitization switched off: `bypassSecurityTrustHtml / Script / Style / Url / ResourceUrl(...)` on a value that is not a constant written in the code. Trace the origin first. | Remove the bypass and let Angular sanitize; for a URL, check it against an allow-list before trusting it. |
| SAFE-03 | SEC-04 | error | eslint + ai | `*.ts`, `*.html`, `*.cshtml`, `*.js` | Code run from a string: `eval(...)`, `new Function(...)`, `setTimeout('...')` / `setInterval('...')` with a string, `javascript:` URLs built from data. | Call the function directly; parse data with `JSON.parse`; build URLs through the router. |
| SAFE-04 | SEC-05 | error | script + ai | `environment*.ts`, `assets/**/*.json`, `wwwroot/**/*.json`, all TS / JS, `*.html`, `*.cshtml` | A secret in front-end code or a file the browser downloads: API keys, client secrets, passwords, connection strings, private tokens, in `environment*.ts`, config JSON under `assets/` / `wwwroot/`, scripts or views. Public identifiers that are meant to be public (a map's public key the provider documents as browser-safe, an OAuth client id) are not defects — say why when dismissing. | Move it to the server and fetch what the browser needs through the API; rotate the leaked value. |
| SAFE-05 | SEC-06 | warning | ai | `*.ts`, `*.js`, `*.cshtml` | A token, password or personal data stored in `localStorage` / `sessionStorage` / a cookie set from script (`document.cookie`). | Keep tokens in memory or in an `HttpOnly` cookie set by the server; don't store passwords or personal data in the browser. |
| SAFE-06 | SEC-07 | warning | script | `*.html`, `*.ts`, `*.cshtml`, `*.js` | `target="_blank"` on a link to another site without `rel="noopener"` (or `noreferrer`); `window.open(url)` on another site without `noopener`. | Add `rel="noopener noreferrer"` / pass `'noopener'` to `window.open`. |
| SAFE-07 | SEC-08 | warning | script | `index.html`, `*.html`, `*.ts`, `*.cshtml`, `*.js`, configs | A script, style, API or iframe URL over plain `http://`; a script or stylesheet from a CDN with no `integrity` attribute. | Use `https://`; add `integrity` and `crossorigin="anonymous"` to CDN tags, or serve the file from the app. |
| SAFE-08 | SEC-10 | warning | eslint + ai | `*.ts`, `*.html`, `*.cshtml`, `*.js` | Sensitive data written to the console or shown in an error message: tokens, passwords, full API responses with personal data, stack traces shown to the user. | Remove the log, or log only what's needed without the sensitive fields; show a translated, generic message. |
| SAFE-09 | SEC-03 | error | script + ai | `*.cshtml` | Razor output not encoded: `@Html.Raw(...)`, `new HtmlString(...)`, `MvcHtmlString.Create(...)` on model, ViewBag, ViewData, query or resource values that can hold user data; a value written into a `<script>` block without JSON encoding (`var x = '@Model.Name';`). | Let Razor encode (`@Model.Name`); in a script use `@Json.Serialize(...)` / `@Html.Raw(Json.Encode(...))` on the whole value. |
| SAFE-10 | SEC-09 | error | script + ai | `*.cshtml`, `*.js` | A Razor form that posts without an antiforgery token: `Html.BeginForm` / `Ajax.BeginForm` with POST and no `@Html.AntiForgeryToken()` in it (ASP.NET MVC 5); an AJAX POST, PUT or DELETE from a view's script that sends no antiforgery token. The ASP.NET Core `<form method="post">` tag helper adds the token by itself: not this. | Add `@Html.AntiForgeryToken()` to the form, and send the token in a header for AJAX. |

## How agents use this file

- Report only when you can point to the exact code. In `/ui-guard:check`, report on the changed lines (a defect next to them is "existing near your change").
- **Follow the data.** SAFE-01, -02, -03 and -09 apply only when the value can come from outside the code (API, route, query,
  form input, storage, a translation with parameters). Read back to where the value is set before reporting. A constant
  string written in the code, or a value the code builds only from constants, is safe. A translation with no parameters is safe.
- If deciding a finding needs a file you can't open (the service that fills a value, the server action), don't report it.
- **Is not a defect:** Firebase web config, Google Maps browser keys restricted by referrer, public OAuth client IDs, Sentry
  DSNs and similar values that are public by design — dismiss and give the reason. The ASP.NET Core form tag helper (SAFE-10).
- `secrets-check.js` produces SAFE-04 **candidates**; confirm or reject each with a one-line reason.
  `web-check.js` reports the clear SAFE-09 (`'@Model.X'` inside `<script>`) and SAFE-10 (`BeginForm` / `<form method="post">`
  without a token) cases; the AI judges `@Html.Raw` / `HtmlString` and AJAX calls.
- Never print a secret value in a finding. Quote at most the variable name and the first 4 characters followed by `…`.
- Not in scope: `.spec.ts` and test files, code that is commented out, mock data, and sample values in documentation comments.
- One finding per rule per line.
