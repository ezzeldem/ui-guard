# packages/

Vendor CSS kept exactly as the library published it: `packages/<library><version>/<library><major>.<locale>.min.css`.

- Never compiled, `@use`d, `@import`ed or modified (STYLE-27, AXIS R-33).
- In an Angular project vendor CSS is loaded from `node_modules` in `angular.json` `styles`, listed **first**, before
  `common/common.scss` and `utilities/utils.scss`.
- An override of a vendor component lives in its library module, `modules/_<vendor-component>.<library>.module.scss`,
  on an `m-` class (R-30, R-36).
