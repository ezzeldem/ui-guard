# packages/

Vendor CSS kept as delivered: `packages/<lib><ver>/<lib><major>.<locale>.min.css`.

- Never compiled, `@use`d, `@import`ed or modified (STYLE-27).
- Prefer loading vendor CSS from `node_modules` in `angular.json` `styles`, listed **before** `src/assets/scss/style.scss`.
- Overrides of vendor styles live in one library module per vendor component (`modules/_<comp>.<lib>.module.scss`, `m-` class).
