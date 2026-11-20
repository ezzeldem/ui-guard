# MEDIA — images, icons, fonts, assets

The UI team's images/assets rules, exactly as ui-code-review applies them (its PERF-01..07). Rule IDs are ui-guard's own;
the **UCR** column gives the matching ui-code-review ID. CSS bundle size is STYLE-46, not this.

## Where each rule runs (free, 0 AI tokens)

`scripts/media-check.js` checks MEDIA-01..06 with plain text rules on templates, Razor views (`.cshtml`) and stylesheets.
It never opens an image, font or binary: it reads only the tag, the path, the extension and the file size on disk. It never
judges image colors.

| ID | Where it runs | What the script does |
|---|---|---|
| MEDIA-01 | scan, check | `<img>` with no `width`+`height`, no `fill`, and no class (in any SCSS) that fixes its box |
| MEDIA-02 | scan, check | data-bound (`[src]`, `[ngSrc]`, `{{ }}`, `@Model…`) or looped (`@for`, `*ngFor`, Razor `@foreach`) `<img>` without `loading`; never SVG, never `priority` / `fetchpriority="high"`; the AI adds images in a modal, closed tab/accordion/dropdown, table row or the footer |
| MEDIA-03 | scan, check | file size of `src/assets/**`, `public/**` and `wwwroot/**` against the limits |
| MEDIA-04 | scan, check | a `png/jpg/gif` `<img>` whose same-name `.svg` exists, or a small raster named like an icon / logo / arrow |
| MEDIA-05 | scan, check | `@font-face` rules and `@import` of fonts in SCSS/CSS |
| MEDIA-06 | scan, check | `<video autoplay>` / `preload="auto"`, `<iframe>` without `loading="lazy"` |
| MEDIA-07 | `/ui-guard:assets`, check | a referenced path that does not exist, uses `src/`, `localhost`, or `~/` outside a Razor view |
| MEDIA-08 | `/ui-guard:assets` (existence part) | every file a theme's `url()` points to must exist in that theme |
| MEDIA-09 | guidance only | needs judging an icon's color — not checked |

| ID | UCR | Severity | Checked by | Applies to | Rule | How to fix |
|---|---|---|---|---|---|---|
| MEDIA-01 | PERF-01 | warning | script | `*.html`, `*.cshtml` | An `<img>` (or Angular `ngSrc` image) with neither `width` and `height` attributes nor a class or style that fixes its box (`aspect-ratio`, fixed `inline-size` and `block-size`). The page jumps when it loads. Icons sized by a class, and images with `fill` in `ngSrc`, are not this. | Add the image's real `width` and `height` attributes, or a class with `aspect-ratio`. |
| MEDIA-02 | PERF-02 | warning | script + ai | `*.html`, `*.cshtml` | A content image that isn't on screen when the page opens, without `loading="lazy"`: a photo, illustration, avatar or an image whose `src` comes from data (`[src]="item.photo"`, `src="@Model.ImageUrl"`), inside a repeated block (`*ngFor`, `@for`, Razor `foreach`), a table or grid row, a modal or dialog, a closed tab, accordion or dropdown, or the page footer. Never for icons or above-the-fold images. | Add `loading="lazy"` (and `decoding="async"`). |
| MEDIA-03 | PERF-03 | warning | script | asset files | An image, font or video that is too big: a raster image (`png`, `jpg`, `gif`, `bmp`, `webp`, `avif`) over 200 KB, an `svg` over 100 KB, a font file over 150 KB, a video over 2 MB. | Compress or resize it (export at the size shown, use `webp`/`avif` for photos, subset the font to the scripts used), or load the video on demand. |
| MEDIA-04 | PERF-04 | warning | script | templates, views | A `png`, `jpg` or `gif` used for an icon or a flat graphic (logo, arrow, symbol) where the project has, or could use, an `svg`. | Use the `svg` version. |
| MEDIA-05 | PERF-05 | warning | script | styles | An `@font-face` without `font-display`; a web font loaded with CSS `@import url(...)` (it blocks rendering); a font file in `ttf`, `otf` or `eot` where `woff2` is available; `@font-face` wrapped in a selector. | Add `font-display: swap`; load the font with a `<link>` in the page head or self-host it; use `woff2` (listed first); move `@font-face` to the top level of `fonts.theme.css`. |
| MEDIA-06 | PERF-06 | warning | script | `*.html`, `*.cshtml` | A `<video>` that autoplays or has `preload="auto"` without being the page's main content; an `<iframe>` (map, video, embed) off screen without `loading="lazy"`. | Use `preload="none"` or `metadata` and a poster image; add `loading="lazy"` to the iframe. |
| MEDIA-07 | PERF-07 | error | script | templates, views, styles, TS, JS | An asset path the build won't find or rewrite: an absolute path to the dev server (`http://localhost`), a path to `src/assets/...` instead of `assets/...` in Angular, `~/` used outside a Razor view, or a path to a file that does not exist. The image breaks in production. | Use the project's asset path (`assets/...` in Angular, `~/...` in a Razor view) and fix the file name. |
| MEDIA-08 | — | error | script | theme folders | Every theme source folder has the same image file names in `project-images/` (and the active `src/assets/project-images/`). Every file a `url()` points to exists in every theme. | Add the missing image to the theme that lacks it. |
| MEDIA-09 | — | warning | script + ai | SVG icons | A single-color icon exported from the design is saved **black** and colored with a filter utility (STYLE-37). Multi-color icons stay as exported. A single-color icon saved in a brand color is a finding (it breaks theming). | Re-save the icon black; add `u-filter-*` in the template. |

## Best practice for images

- Always give an `<img>` `width` and `height` (the intrinsic size) so the page does not jump; or fix the box in its class with `aspect-ratio` / `inline-size` + `block-size`.
- Content images below the first screen get `loading="lazy"`. The hero / first-screen image is the opposite: no lazy, add `fetchpriority="high"`.
- Icons and logos are SVG, not png/jpg. Single-color icons are saved black and colored with a filter utility (STYLE-37).
- Keep files small: raster ≤ 200 KB (prefer webp/avif), SVG ≤ 100 KB, font ≤ 150 KB (woff2), video ≤ 2 MB.
- Fonts: local `@font-face` with `font-display: swap` and `woff2` first; never `@import` a web font in CSS.
- Video: no `autoplay`, `preload="metadata"` or `none`, add a `poster`. Iframes: `loading="lazy"`.
- Every `<img>` needs `alt` (ACCESS-02 checks it).

## How agents use this file

- MEDIA-01, 03..06 are reported by `media-check.js` and MEDIA-07 by `assets.js`; the AI does not re-report them.
- MEDIA-02: the script reports data-bound and looped images; the AI reports only when the code shows the image is off screen
  (one of the listed containers). Don't guess from position in the file. Never report it for an icon: an `svg`, an image whose
  path has `icon` / `icons` in it, or a small UI image (arrow, bin, search, dots, close, check) used in a button, link, label or
  menu item. One finding per image element, not one per repeated copy.
- MEDIA-03 needs the file's size: a file whose size is not known is not reported.
- MEDIA-04: report only for an image whose name or use makes clear it is an icon or flat graphic (`icon-`, `arrow`, `logo`,
  inside a button next to text). Photos and illustrations are not this.
- MEDIA-09: decide single- vs multi-color by reading the SVG's `fill`/`stroke` values (ignore `none`, `transparent`, `currentColor`) — only when asked, it is not part of the scan.
- Not in scope: commented-out code, `.spec.ts` and test files, images set by a CSS framework you weren't given.
- One finding per rule per line.
