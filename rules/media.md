# MEDIA — images, icons, fonts, assets

Based on the UI team's images/assets review rules. Rule IDs are ui-guard's own.

## Status: NOT part of `/ui-guard:scan`

Images and assets are out of the scan: the scan never opens an image, font or binary, never judges image colors or sizes,
and never counts MEDIA findings in reports, baselines or plans. The rules below stay as **guidance** for people writing code.

| ID | Decision | Why |
|---|---|---|
| MEDIA-01 | kept as info in docs | needs judging whether a class fixes the image box — not worth AI cost; guidance only |
| MEDIA-02 | kept as info in docs | needs judging what is "above the fold" — guidance only |
| MEDIA-03 | removed from the scan | needs reading asset file sizes |
| MEDIA-04 | removed from the scan | needs judging whether an image is an icon / flat graphic |
| MEDIA-05 | kept as info in docs | font loading advice; not an image check |
| MEDIA-06 | kept as info in docs | video/iframe loading advice — guidance only |
| MEDIA-07 | moved to `/ui-guard:assets` | a referenced path that does not exist (or uses `src/`, `localhost`) |
| MEDIA-08 | moved to `/ui-guard:assets` (existence part) | every file a theme's `url()` / `--img-*` points to must exist in that theme |
| MEDIA-09 | removed from the scan | needs judging an icon's color |

| ID | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|
| MEDIA-01 | warning | script + ai | `*.html` | An `<img>` (or `ngSrc`) with neither `width`+`height` nor a class/style that fixes its box (`aspect-ratio`, fixed inline/block size). | Add `width` and `height` attributes with the intrinsic size. |
| MEDIA-02 | warning | ai | `*.html` | A content image not on screen at first paint without `loading="lazy"` (photos, illustrations, avatars, data-bound `[src]`). Never for icons or above-the-fold images. | Add `loading="lazy"`. |
| MEDIA-03 | warning | script | asset files | An asset that is too big: raster (`png jpg gif bmp webp avif`) > 200 KB, `svg` > 100 KB, font > 150 KB, video > 2 MB. | Compress, resize, or convert (webp/avif, woff2). |
| MEDIA-04 | warning | script + ai | asset files, templates | A `png/jpg/gif` used for an icon or flat graphic (logo, arrow, symbol) where an `svg` exists or could be used. | Use the SVG. |
| MEDIA-05 | warning | script | styles | `@font-face` without `font-display`; a web font loaded with CSS `@import url(...)`; a font in `ttf/otf/eot` where `woff2` is available; `@font-face` wrapped in a selector. | Add `font-display: swap`; list `woff2` first; move `@font-face` to the top level of `fonts.theme.css`. |
| MEDIA-06 | warning | script | `*.html` | An autoplaying `<video>` or `preload="auto"` that is not the page's main content; an off-screen `<iframe>` without `loading="lazy"`. | Remove autoplay / use `preload="metadata"`; add `loading="lazy"` to the iframe. |
| MEDIA-07 | error | script | templates, styles, TS | An asset path the build will not find or rewrite: `http://localhost…`, `src/assets/…` instead of `assets/…`, a path to a file that does not exist. | Use `assets/…` and fix the file name. |
| MEDIA-08 | error | script | theme folders | Every theme source folder has the same image file names in `project-images/` (and the active `src/assets/project-images/`). Every file an `--img-*` token or `url()` points to exists in every theme. | Add the missing image to the theme that lacks it. |
| MEDIA-09 | warning | script + ai | SVG icons | A single-color icon exported from the design is saved **black** and colored with a filter utility (STYLE-37). Multi-color icons stay as exported. A single-color icon saved in a brand color is a finding (it breaks theming). | Re-save the icon black; add `u-filter-*` in the template. |

## How agents use this file

- MEDIA-01: an `<img>` inside a component whose SCSS fixes its box (`inline-size` + `block-size`, or `aspect-ratio`) is fine — check the class first.
- MEDIA-02: icons, logos and anything in the header or the first screen of the page are **not** defects.
- MEDIA-04 and MEDIA-09: decide single- vs multi-color by reading the SVG's `fill`/`stroke` values (ignore `none`, `transparent`, `currentColor`).
- MEDIA-03/05/06/07/08 belong to scripts; do not report them unless the scan says the script was skipped.
