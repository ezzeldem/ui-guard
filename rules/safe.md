# SAFE — security

Based on the UI team's UI security review rules. Rule IDs are ui-guard's own.

| ID | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|
| SAFE-01 | error | ai | `*.html`, `*.ts` | HTML built from data that is not a constant written in the code: `[innerHTML]`/`[outerHTML]` bound to API, route, user or parameterized translated data; `insertAdjacentHTML`; `document.write`; `Renderer2.setProperty(..., 'innerHTML', ...)`. **Trace the data's origin before reporting.** | Bind text with interpolation, or sanitize on a trusted path. |
| SAFE-02 | error | ai | `*.ts` | `bypassSecurityTrustHtml/Script/Style/Url/ResourceUrl` on a value that is not a constant written in the code. Trace the origin first. | Remove the bypass or restrict it to constants / an allow-list. |
| SAFE-03 | error | eslint + ai | `*.ts`, `*.html` | Code run from a string: `eval`, `new Function`, `setTimeout/setInterval` with a string, `javascript:` URLs built from data. | Pass a function; build URLs through the router. |
| SAFE-04 | error | script + ai | `environment*.ts`, `assets/**/*.json`, all TS | A secret in front-end code or a file the browser downloads: API keys, client secrets, passwords, connection strings, private tokens. Public identifiers meant to be public are not defects — say why when dismissing. | Move the secret to the server. Rotate it: it is already exposed. |
| SAFE-05 | warning | ai | `*.ts` | A token, password or personal data stored in `localStorage`, `sessionStorage` or a script-set cookie. | Prefer an `HttpOnly` cookie set by the server; keep only what is needed. |
| SAFE-06 | warning | script | `*.html`, `*.ts` | `target="_blank"` to another site without `rel="noopener"` (or `noreferrer`); `window.open` to another site without `noopener`. | Add `rel="noopener noreferrer"` / the `noopener` feature. |
| SAFE-07 | warning | script | `index.html`, `*.html`, `*.ts`, configs | A script, style, API or iframe URL over plain `http://`; a CDN script/stylesheet without `integrity`. | Use `https://`; add `integrity` + `crossorigin`. |
| SAFE-08 | warning | eslint + ai | `*.ts`, `*.html` | Sensitive data written to the console or shown in an error message: tokens, passwords, full API responses with personal data, stack traces shown to users. | Remove the log; show a translated, generic message. |

## How agents use this file

- **Trace before you report.** For SAFE-01/02 follow the bound value back to where it is assigned. A constant string literal written in the code is safe. A translation with no parameters is safe. Anything from HTTP, route params, query params, user input, storage or a parameterized translation is not.
- **Is not a defect:** Firebase web config, Google Maps browser keys restricted by referrer, public OAuth client IDs, Sentry DSNs and similar values that are public by design — dismiss and give the reason.
- `secrets-check.js` produces SAFE-04 **candidates**; confirm or reject each with a one-line reason.
- Never print a secret value in a finding. Quote at most the variable name and the first 4 characters followed by `…`.
