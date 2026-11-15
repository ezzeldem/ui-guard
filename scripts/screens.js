#!/usr/bin/env node
'use strict';
// §8.4 Screenshots with the PROJECT's Playwright (never installed by this script).
const path = require('path');
const { createRequire } = require('module');
const u = require('./lib/util');
const project = require('./lib/project');

const HELP = `screens.js — §8.4 stable screenshots (Playwright Chromium from the project's node_modules).
Usage:
  node screens.js shoot --url <base> --routes /a,/b --label <before|before2|after> --phase <id> [--styles]
      --styles   also save the computed style + bounding box of every element (<shot>.styles.json) for style-diff.js
                        [--viewports 1440x900,375x812] [--masks ".a,.b"] [--root <dir>]
      → .ui-guard/tmp/screens/phase-<id>/<label>/<route>__<viewport>.png  (+ overflow.json at 320px)
  node screens.js login --url <base> --route </login-protected-route> [--root <dir>] [--timeout 600]
      Opens a HEADED browser; the developer signs in; when the page leaves the login URL the storage
      state is saved to .ui-guard/tmp/auth/state.json (git-ignored, never printed).
Stability: reducedMotion 'reduce', animations/transitions/caret stopped, network idle, document.fonts.ready,
fixed clock (page.clock) when supported. Masks are painted identically in every shot.`;

function loadPlaywright(root) {
  const req = createRequire(path.join(root, 'package.json'));
  for (const name of ['playwright', '@playwright/test']) { try { return req(name); } catch { /* next */ } }
  return null;
}

const STABLE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;
// what a tag swap (div → button, p → h2, …) can change: the visual properties compared by style-diff.js
const STYLE_PROPS = ['display', 'position', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-top-color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration-line', 'text-transform', 'color', 'background-color', 'background-image', 'list-style-type', 'outline-style',
  'box-shadow', 'opacity', 'visibility', 'cursor', 'appearance', 'width', 'height', 'gap', 'vertical-align', 'white-space'];
const slug = (r) => (r === '/' ? 'root' : r.replace(/^\//, '').replace(/[^\w-]+/g, '_')) || 'root';

async function shoot(root, o) {
  const pw = loadPlaywright(root);
  if (!pw) { console.log('playwright is not installed — the zero-pixel proof is not possible. Ask the developer to confirm the pages by eye.'); process.exit(4); }
  const outDir = path.join(project.paths(root).tmp, 'screens', `phase-${o.phase}`, o.label);
  u.mkdirp(outDir);
  const auth = project.paths(root).auth;
  const browser = await pw.chromium.launch();
  const results = [];
  const overflow = [];
  try {
    for (const vp of o.viewports.concat(o.label === 'after' || o.label === 'before' ? ['320x800'] : [])) {
      const [w, h] = vp.split('x').map(Number);
      const isOverflowOnly = vp === '320x800' && !o.viewports.includes(vp);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: 1, storageState: u.exists(auth) ? auth : undefined, locale: o.locale || undefined });
      const page = await ctx.newPage();
      try { if (page.clock) await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') }); } catch { /* not supported */ }
      for (const route of o.routes) {
        const url = new URL(route, o.url).toString();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
        await page.addStyleTag({ content: STABLE_CSS });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        await page.waitForTimeout(300);
        if (isOverflowOnly) {
          const of = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
          overflow.push({ route, ...of, overflow: of.scrollWidth > of.clientWidth });
          continue;
        }
        if (/login|signin|auth/i.test(page.url()) && !/login|signin|auth/i.test(route)) results.push({ route, viewport: vp, redirectedToLogin: true });
        const file = path.join(outDir, `${slug(route)}__${vp}.png`);
        if (o.styles) {
          // computed style + bounding box of every element, keyed by its DOM path (tag + nth-of-type), for style-diff.js
          const snap = await page.evaluate((props) => {
            const out = {};
            const keyOf = (el) => { const parts = []; for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) { let i = 1; for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++; parts.unshift(`${e.tagName.toLowerCase()}:${i}`); } return parts.join('>'); };
            for (const el of document.querySelectorAll('body *')) {
              const cs = getComputedStyle(el);
              if (cs.display === 'none') continue;
              const r = el.getBoundingClientRect();
              const st = {};
              for (const p of props) st[p] = cs.getPropertyValue(p);
              out[keyOf(el)] = { box: [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10], st };
            }
            return out;
          }, STYLE_PROPS);
          u.writeJSON(file.replace(/\.png$/, '.styles.json'), snap);
        }
        const masks = (o.masks || []).map((s) => page.locator(s));
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide', mask: masks, maskColor: '#FF00FF' });
        results.push({ route, viewport: vp, file: u.relPosix(root, file) });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  if (overflow.length) u.writeJSON(path.join(outDir, 'overflow.json'), overflow);
  u.writeJSON(path.join(outDir, 'shots.json'), results);
  const login = results.filter((r) => r.redirectedToLogin);
  console.log(`${results.length - login.length} screenshot(s) → ${u.relPosix(root, outDir)}${overflow.length ? ` · overflow@320: ${overflow.filter((x) => x.overflow).length}/${overflow.length} route(s)` : ''}`);
  if (login.length) { console.log(`LOGIN REQUIRED on ${login.map((x) => x.route).join(', ')} — run \`screens.js login\` and ask the developer to sign in.`); process.exit(5); }
}

async function login(root, o) {
  const pw = loadPlaywright(root);
  if (!pw) { console.log('playwright is not installed.'); process.exit(4); }
  const browser = await pw.chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(o.route || '/', o.url).toString());
  console.log('A browser window is open. Please sign in there; ui-guard waits until you leave the login page.');
  const end = Date.now() + (o.timeout || 600) * 1000;
  while (Date.now() < end) {
    await page.waitForTimeout(1500);
    if (!/login|signin|auth/i.test(page.url())) { await page.waitForLoadState('networkidle').catch(() => {}); break; }
  }
  const auth = project.paths(root).auth;
  u.mkdirp(path.dirname(auth));
  await ctx.storageState({ path: auth });
  await browser.close();
  console.log('auth state saved to .ui-guard/tmp/auth/state.json (git-ignored).');
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const prof = project.readProfile(root);
  const sc = prof.screenshots || {};
  const o = {
    url: args.url || (prof.devServer && prof.devServer.url) || `http://localhost:${(prof.devServer && prof.devServer.port) || 4200}/`,
    routes: String(args.routes || (sc.routes || ['/']).join(',')).split(',').filter(Boolean),
    viewports: String(args.viewports || (sc.viewports || ['1440x900', '375x812']).join(',')).split(','),
    masks: args.masks ? String(args.masks).split(',').filter(Boolean) : (sc.masks || []),
    label: args.label || 'before', phase: args.phase || 'adhoc', styles: !!args.styles, route: args.route, timeout: +args.timeout || 600, locale: sc.locale,
  };
  const cmd = args._[0];
  (cmd === 'login' ? login(root, o) : cmd === 'shoot' ? shoot(root, o) : Promise.resolve(console.log(HELP))).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { loadPlaywright, slug };
