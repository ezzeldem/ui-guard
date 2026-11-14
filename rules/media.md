# MEDIA — images, icons, fonts, assets

Based on the UI team's images/assets review rules. Rule IDs are ui-guard's own.

## Status: MEDIA-01..06 are part of `/ui-guard:scan` (free, 0 AI tokens)

`scripts/media-check.js` checks them with plain text rules. It never opens an image, font or binary: it reads only the tag, the path, the extension and the file size on disk. It never judges image colors.

| ID | Where it runs | What the script does |
|---|---|---|
| MEDIA-01 | scan | `<img>` with no `width`+`height`, no `fill`, and no class (in any SCSS) that fixes its box |
| MEDIA-02 | scan | data-bound (`[src]`, `[ngSrc]`, `{{ }}`) or looped (`@for`, `*ngFor`) `<img>` without `loading`; never SVG, never `priority` / `fetchpriority="high"` |
| MEDIA-03 | scan | file size of `src/assets/**` and `public/**` against the limits |
| MEDIA-04 | scan | a `png/jpg/gif` `<img>` whose same-name `.svg` exists, or a small raster named like an icon / logo / arrow |
| MEDIA-05 | scan | `@font-face` rules and `@import` of fonts in SCSS/CSS |
| MEDIA-06 | scan | `<video autoplay>` / `preload="auto"`, `<iframe>` without `loading="lazy"` |
| MEDIA-07 | `/ui-guard:assets` | a referenced path that does not exist (or uses `src/`, `localhost`) |
| MEDIA-08 | `/ui-guard:assets` (existence part) | every file a theme's `url()` / `--img-*` points to must exist in that theme |
| MEDIA-09 | guidance only | needs judging an icon's color — not checked |

| ID | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|
| MEDIA-01 | warning | script | `*.html` | An `<img>` (or `ngSrc`) with neither `width`+`height` nor a class/style that fixes its box (`aspect-ratio`, fixed inline/block size). | Add `width` and `height` attributes with the intrinsic size. |
| MEDIA-02 | warning | script | `*.html` | A content image not on screen at first paint without `loading="lazy"` (photos, illustrations, avatars, data-bound `[src]`). Never for icons or above-the-fold images. | Add `loading="lazy"`. |
| MEDIA-03 | warning | script | asset files | An asset that is too big: raster (`png jpg gif bmp webp avif`) > 200 KB, `svg` > 100 KB, font > 150 KB, video > 2 MB. | Compress, resize, or convert (webp/avif, woff2). |
| MEDIA-04 | warning | script | templates | A `png/jpg/gif` used for an icon or flat graphic (logo, arrow, symbol) where an `svg` exists or could be used. | Use the SVG. |
| MEDIA-05 | warning | script | styles | `@font-face` without `font-display`; a web font loaded with CSS `@import url(...)`; a font in `ttf/otf/eot` where `woff2` is available; `@font-face` wrapped in a selector. | Add `font-display: swap`; list `woff2` first; move `@font-face` to the top level of `fonts.theme.css`. |
| MEDIA-06 | warning | script | `*.html` | An autoplaying `<video>` or `preload="auto"` that is not the page's main content; an off-screen `<iframe>` without `loading="lazy"`. | Remove autoplay / use `preload="metadata"`; add `loading="lazy"` to the iframe. |
| MEDIA-07 | error | script | templates, styles, TS | An asset path the build will not find or rewrite: `http://localhost…`, `src/assets/…` instead of `assets/…`, a path to a file that does not exist. | Use `assets/…` and fix the file name. |
| MEDIA-08 | error | script | theme folders | Every theme source folder has the same image file names in `project-images/` (and the active `src/assets/project-images/`). Every file an `--img-*` token or `url()` points to exists in every theme. | Add the missing image to the theme that lacks it. |
| MEDIA-09 | warning | script + ai | SVG icons | A single-color icon exported from the design is saved **black** and colored with a filter utility (STYLE-37). Multi-color icons stay as exported. A single-color icon saved in a brand color is a finding (it breaks theming). | Re-save the icon black; add `u-filter-*` in the template. |

## Best practice for images

- Always give an `<img>` `width` and `height` (the intrinsic size) so the page does not jump; or fix the box in its class with `aspect-ratio` / `inline-size` + `block-size`.
- Content images below the first screen get `loading="lazy"`. The hero / first-screen image is the opposite: no lazy, add `fetchpriority="high"`.
- Icons and logos are SVG, not png/jpg. Single-color icons are saved black and colored with a filter utility (STYLE-37).
- Keep files small: raster ≤ 200 KB (prefer webp/avif), SVG ≤ 100 KB, font ≤ 150 KB (woff2), video ≤ 2 MB.
- Fonts: local `@font-face` with `font-display: swap` and `woff2` first; never `@import` a web font in CSS.
- Video: no `autoplay`, `preload="metadata"` or `none`, add a `poster`. Iframes: `loading="lazy"`.
- Every `<img>` needs `alt` (ACCESS-02 checks it).

## How agents use this file

- MEDIA-01..06 are reported by `media-check.js`; the AI does not re-report them.
- MEDIA-09: decide single- vs multi-color by reading the SVG's `fill`/`stroke` values (ignore `none`, `transparent`, `currentColor`) — only when asked, it is not part of the scan.