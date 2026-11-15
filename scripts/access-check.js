#!/usr/bin/env node
'use strict';
// ACCESS-06..22 — the accessibility checks a script can decide from an Angular template (0 AI tokens).
// Each finding carries its user-impact level (high | medium | low) and its fix tier (A | B | C | D | needs-decision),
// see rules/access.md and rules/access-fix-tiers.md. ACCESS-01..05 stay with ESLint + the AI pass.
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const h = require('./lib/html-scan');
const { mk, cli } = require('./lib/findings');

const { attr, has, isBound, plain, hasContent } = h;
const INTERACTIVE = (n) => ['button', 'select', 'textarea', 'summary'].includes(n.tag) || (n.tag === 'a' && has(n, 'href')) || (n.tag === 'a' && 'routerLink' in n.attrs) || (n.tag === 'a' && '[routerLink]' in n.attrs) || (n.tag === 'input' && attr(n, 'type') !== 'hidden');
const named = (n) => has(n, 'aria-label') || has(n, 'aria-labelledby') || (typeof attr(n, 'title') === 'string' && attr(n, 'title') !== '');
const descendants = (n) => n.children.flatMap((c) => [c, ...descendants(c)]);
const ancestors = (n) => { const out = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; };
const lc = (s) => String(s === true ? '' : s || '').toLowerCase();
const norm = (s) => lc(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const AUTOFILL = [
  [/e-?mail|بريد/, 'email'], [/phone|mobile|tel\b|جوال|هاتف|موبايل/, 'tel'], [/first-?name|given|الاسم الأول/, 'given-name'],
  [/last-?name|family|surname|اسم العائلة/, 'family-name'], [/full-?name|^name$|\bname\b|الاسم/, 'name'], [/user-?name|login/, 'username'],
  [/street|address-?line|\baddress\b|العنوان/, 'street-address'], [/city|town|المدينة/, 'address-level2'], [/zip|postal|post-?code/, 'postal-code'],
  [/country|الدولة/, 'country-name'], [/card-?number|cc-?num/, 'cc-number'], [/birth|dob/, 'bday'], [/organi[sz]ation|company/, 'organization'],
];
const NOT_TEXTLIKE = new Set(['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']);
const VAGUE = new Set(['click here', 'here', 'read more', 'more', 'learn more', 'details', 'link', 'this link', 'see more', 'المزيد', 'اقرأ المزيد', 'هنا', 'اضغط هنا', 'تفاصيل', 'انقر هنا', 'عرض المزيد']);
const COMPOSITE = new Set(['tablist', 'menu', 'menubar', 'listbox', 'radiogroup', 'toolbar', 'tree', 'treegrid', 'grid', 'tab']);

function checkTemplate(root, rel, tpl, add, ctx) {
  const { nodes } = h.parse(tpl.text, tpl.lineOffset);
  const E = (id, n, message, fix, extra) => add(id, rel, n.line, message, fix, extra);
  const byId = new Map(nodes.filter((n) => typeof n.attrs.id === 'string').map((n) => [n.attrs.id, n]));
  const labelFor = new Map();
  for (const n of nodes.filter((x) => x.tag === 'label' && typeof attr(x, 'for') === 'string')) labelFor.set(attr(n, 'for'), n);
  const hasLabel = (n) => has(n, 'aria-label') || has(n, 'aria-labelledby') || (typeof n.attrs.id === 'string' && labelFor.has(n.attrs.id)) || ancestors(n).some((a) => a.tag === 'label');
  const controls = nodes.filter((n) => ['input', 'select', 'textarea'].includes(n.tag));

  for (const n of nodes) {
    const type = lc(attr(n, 'type'));
    const hint = lc([attr(n, 'name'), attr(n, 'formControlName'), attr(n, 'id'), attr(n, 'placeholder'), attr(n, 'aria-label')].filter((x) => typeof x === 'string').join(' '));

    // ---------- ACCESS-06: types and autofill ----------
    if (n.tag === 'input' && !NOT_TEXTLIKE.has(type) && !isBound(n, 'type')) {
      const want = /e-?mail|بريد/.test(hint) ? 'email' : /\b(phone|mobile|tel)\b|جوال|هاتف|موبايل/.test(hint) ? 'tel' : /\b(url|website)\b/.test(hint) ? 'url' : null;
      if (want && (type === '' || type === 'text')) E('ACCESS-06', n, `The field looks like ${want === 'tel' ? 'a phone number' : want === 'url' ? 'a web address' : 'an email address'} but has no type="${want}", so phones show the wrong keyboard and autofill guesses.`, `Set type="${want}". Check the stylesheets for \`[type=…]\` / \`:invalid\` rules first (then it is Tier C).`, { impact: 'medium', tier: 'A' });
      if (!has(n, 'autocomplete')) {
        const hit = type === 'password' ? null : AUTOFILL.find(([re]) => re.test(hint));
        if (type === 'password') E('ACCESS-06', n, 'A password field without autocomplete: password managers cannot tell a sign-in from a new password.', 'Add autocomplete="current-password" (sign-in) or "new-password" (sign-up / change).', { impact: 'medium', tier: 'A' });
        else if (hit) E('ACCESS-06', n, `A personal-data field without autocomplete: people who cannot type easily have to enter it by hand.`, `Add autocomplete="${hit[1]}".`, { impact: 'medium', tier: 'A' });
      }
    }
    if (n.tag === 'input' && type === 'number' && /phone|mobile|tel|card|otp|pin|zip|postal|iban|national|code|جوال|هاتف/.test(hint)) E('ACCESS-06', n, 'type="number" on an identifier (phone, card, code): spinner buttons and number parsing get in the way.', 'Use type="tel" (or type="text" with inputmode="numeric" and a pattern).', { impact: 'low', tier: 'A' });
    if (n.tag === 'label' && /\*\s*$/.test(plain(n))) {
      const target = typeof attr(n, 'for') === 'string' ? byId.get(attr(n, 'for')) : descendants(n).find((d) => ['input', 'select', 'textarea'].includes(d.tag));
      if (target && !has(target, 'required') && !has(target, 'aria-required')) E('ACCESS-06', n, 'A star marks the field as required, but the control itself is not marked required — assistive technology never hears it.', 'Add required (or aria-required="true"); keep the star aria-hidden. Check for `:required` / `:invalid` styles first (Tier C if one exists).', { impact: 'medium', tier: 'A' });
    }

    // ---------- ACCESS-07: form structure ----------
    if (n.tag === 'input' && type === 'image' && !has(n, 'alt') && !has(n, 'aria-label')) E('ACCESS-07', n, 'An image button with no alt text has no name.', 'Add alt with the action ("Search"), as a translation key.', { impact: 'high', tier: 'A' });
    if (n.tag === 'input' && type === 'button' && !has(n, 'value') && !has(n, 'aria-label')) E('ACCESS-07', n, 'A button input with no value has no name.', 'Add value (or aria-label) with the action, as a translation key.', { impact: 'high', tier: 'A' });
    if (n.tag === 'legend' && n.parent && n.parent.tag === 'fieldset' && n.parent.children[0] !== n) E('ACCESS-07', n, 'The legend is not the first child of its fieldset, so the group name may not be announced.', 'Move the legend to be the first element inside the fieldset (check selectors that depend on child order first).', { impact: 'medium', tier: 'D' });
    if (n.tag === 'label' && (has(n, 'hidden') || /display\s*:\s*none/.test(lc(attr(n, 'style'))))) E('ACCESS-07', n, 'A label hidden with display:none / hidden is also removed from the accessibility tree, so the field loses its name.', 'Use the visually-hidden utility instead (rules/access-fix-tiers.md).', { impact: 'medium', tier: 'A' });
    if (['input', 'select', 'textarea'].includes(n.tag) && !NOT_TEXTLIKE.has(type) && typeof attr(n, 'title') === 'string' && attr(n, 'title') && !hasLabel(n)) E('ACCESS-07', n, 'The title attribute is the only name of this field; it does not show on touch screens and is read inconsistently.', 'Add a visible label (or a visually-hidden one) and keep the title only as extra help.', { impact: 'medium', tier: 'A' });
    if (n.tag === 'select' && /\(change\)/.test(Object.keys(n.attrs).join(' ')) && /navigate|location|window\.open|href/.test(String(n.attrs['(change)'] || ''))) E('ACCESS-07', n, 'Choosing an option in this select navigates at once: keyboard users trigger it just by browsing the list.', 'Add a button that applies the choice (needs a visible change → decision).', { impact: 'medium', tier: 'needs-decision' });

    // ---------- ACCESS-09: landmarks and sections ----------
    if (n.tag === 'section' && !has(n, 'aria-label') && !has(n, 'aria-labelledby') && !descendants(n).some((d) => /^h[1-6]$/.test(d.tag))) E('ACCESS-09', n, 'A section with neither a heading nor a name is not a landmark: it is a div with a longer name.', 'Name it (aria-labelledby pointing at its heading) or use a div.', { impact: 'low', tier: 'B' });
    if (n.tag === 'figure' && !n.children.some((c) => c.tag === 'figcaption') && !has(n, 'aria-label') && !has(n, 'aria-labelledby')) E('ACCESS-09', n, 'A figure without a figcaption or a name.', 'Add a figcaption (or an aria-label) and give the figure margin: 0 in its own SCSS.', { impact: 'low', tier: 'C' });
    if (n.tag === 'time' && !has(n, 'datetime') && plain(n)) E('ACCESS-09', n, 'A time element without a machine-readable datetime.', 'Add datetime="YYYY-MM-DD" (or the full timestamp).', { impact: 'low', tier: 'A' });

    // ---------- ACCESS-10: headings ----------
    if (/^h[1-6]$/.test(n.tag) && !hasContent(n) && !has(n, 'aria-label') && !has(n, 'aria-labelledby')) E('ACCESS-10', n, 'An empty heading (or one holding only an unnamed image) is announced as "heading" with nothing after it.', 'Give it text, or remove the element.', { impact: 'medium', tier: 'needs-decision' });

    // ---------- ACCESS-11: links ----------
    if (n.tag === 'a') {
      const t = norm(plain(n));
      if (t && VAGUE.has(t) && !has(n, 'aria-label') && !has(n, 'aria-labelledby')) E('ACCESS-11', n, `The link text "${plain(n)}" says nothing about where it goes when read out of context.`, 'Keep the visible text and add an aria-label with the destination (translation key), or reword it.', { impact: 'medium', tier: 'A' });
      if (lc(attr(n, 'target')) === '_blank' && !has(n, 'aria-label') && !has(n, 'title') && !/new (tab|window)|نافذة جديدة|تبويب جديد/.test(lc(plain(n)))) E('ACCESS-11', n, 'A link that opens a new tab does not say so.', 'Add visually-hidden text or an aria-label that mentions the new tab.', { impact: 'low', tier: 'A' });
    }

    // ---------- ACCESS-13: role misuse ----------
    const role = lc(attr(n, 'role'));
    if (role) {
      if ((role === 'presentation' || role === 'none') && (INTERACTIVE(n) || has(n, 'tabindex'))) E('ACCESS-13', n, `role="${role}" on a focusable control removes it from the accessibility tree while it stays operable.`, 'Remove the role.', { impact: 'high', tier: 'A' });
      if (role === 'application') E('ACCESS-13', n, 'role="application" switches off the screen reader\'s normal reading mode for everything inside.', 'Remove it unless this really is a keyboard-driven app surface.', { impact: 'medium', tier: 'A' });
      if (n.tag === 'a' && role === 'button' && (has(n, 'href') || has(n, 'routerLink'))) E('ACCESS-13', n, 'A real link announced as a button.', 'Remove role="button" (it navigates), or use a <button> if it only acts (Tier C).', { impact: 'medium', tier: 'A' });
      if (/^h[1-6]$/.test(n.tag) && ['tab', 'button', 'menuitem', 'link', 'checkbox', 'switch', 'option'].includes(role)) E('ACCESS-13', n, `The role="${role}" replaces the heading role, so the page loses a heading.`, 'Move the role to an inner element, or drop it.', { impact: 'medium', tier: 'D' });
      if ((role === 'menu' || role === 'menubar') && descendants(n).some((d) => d.tag === 'a') && !descendants(n).some((d) => /^menuitem/.test(lc(attr(d, 'role'))))) E('ACCESS-13', n, 'role="menu" is for application menus; this is a list of links.', 'Remove role="menu" and use a nav with a list.', { impact: 'medium', tier: 'A' });
      const need = { tablist: 'tab', listbox: 'option', radiogroup: 'radio', menu: 'menuitem', menubar: 'menuitem' }[role];
      if (need && !descendants(n).some((d) => lc(attr(d, 'role')).startsWith(need) || d.tag.includes('-') || (need === 'radio' && d.tag === 'input')) && descendants(n).length) E('ACCESS-13', n, `role="${role}" has no ${need} inside it, so the widget structure is broken.`, `Give each item role="${need}".`, { impact: 'medium', tier: 'A' });
    }
    if (['button', 'a', 'input', 'select', 'textarea'].includes(n.tag) && !has(n, 'disabled') && !has(n, 'aria-disabled') && (/\bdisabled\b/.test(lc(attr(n, 'class'))) || Object.keys(n.attrs).some((k) => /^\[class\.(is-)?disabled\]$/.test(k)) || /disabled/.test(String(n.attrs['[ngClass]'] || '')))) E('ACCESS-13', n, 'It looks disabled (a class) but nothing tells assistive technology or the browser, so it can still be used.', 'Bind [disabled] (or [attr.aria-disabled]) to the same condition.', { impact: 'high', tier: 'A' });

    // ---------- ACCESS-14: live regions ----------
    const live = lc(attr(n, 'aria-live'));
    if ((['alert', 'status', 'log'].includes(role) || (live && live !== 'off')) && n.flowDirect) E('ACCESS-14', n, 'The live region is created together with its message, so many screen readers announce nothing.', 'Keep the region in the DOM and change only its text (and the @if inside it).', { impact: 'medium', tier: 'D' });
    if (live === 'assertive' && (role === 'status' || /toast|count|loading|progress|result/.test(lc(attr(n, 'class') + ' ' + attr(n, 'id'))))) E('ACCESS-14', n, 'aria-live="assertive" interrupts the user; this is routine status text.', 'Use aria-live="polite" (or role="status"); keep assertive for errors.', { impact: 'medium', tier: 'A' });

    // ---------- ACCESS-15: widgets ----------
    if (role === 'combobox' && !has(n, 'aria-activedescendant')) E('ACCESS-15', n, 'A combobox that never says which option is highlighted: the user cannot tell what Enter will pick.', 'Bind aria-activedescendant to the id of the highlighted option.', { impact: 'high', tier: 'A' });
    if (role === 'tooltip') {
      const id = typeof n.attrs.id === 'string' ? n.attrs.id : null;
      if (!id || !nodes.some((o) => lc(attr(o, 'aria-describedby')).split(/\s+/).includes(lc(id)))) E('ACCESS-15', n, 'A tooltip that no element points at with aria-describedby is never announced.', 'Give it an id and add aria-describedby to the element it explains.', { impact: 'medium', tier: 'A' });
    }

    // ---------- ACCESS-16: tabindex ----------
    if ('tabindex' in n.attrs && String(n.attrs.tabindex).trim() === '-1' && INTERACTIVE(n) && !(n.tag === 'input' && type === 'hidden') && !ancestors(n).some((a) => COMPOSITE.has(lc(attr(a, 'role')))) && !COMPOSITE.has(role)) E('ACCESS-16', n, 'tabindex="-1" takes a real control out of the Tab order: keyboard users cannot reach it.', 'Remove tabindex (or bind it for a roving-tabindex widget).', { impact: 'high', tier: 'A' });
    if ('tabindex' in n.attrs && String(n.attrs.tabindex).trim() === '0' && ['div', 'span', 'p', 'section', 'li', 'ul', 'article', 'main', 'header', 'footer'].includes(n.tag) && !role && !Object.keys(n.attrs).some((k) => /^\((click|keydown|keyup|keypress)/.test(k)) && !has(n, 'contenteditable')) E('ACCESS-16', n, 'A Tab stop on plain content announces nothing (unless the box scrolls).', 'Remove tabindex, or keep it only on a scrollable region that has a name.', { impact: 'low', tier: 'A' });

    // ---------- ACCESS-18: audio and video ----------
    if (n.tag === 'video' || n.tag === 'audio') {
      const mutedLoop = has(n, 'muted') && (has(n, 'autoplay') || has(n, 'loop'));
      const tracks = n.children.filter((c) => c.tag === 'track');
      if (has(n, 'autoplay') && !has(n, 'muted')) E('ACCESS-18', n, 'Media that starts playing with sound covers a screen reader and is hard to stop.', 'Remove autoplay, or add muted (decorative video only, with playsinline and a pause control).', { impact: 'high', tier: 'A' });
      if (n.tag === 'video' && !mutedLoop && !tracks.some((t) => /captions|subtitles/.test(lc(attr(t, 'kind'))))) E('ACCESS-18', n, 'A video without a captions track.', 'Add <track kind="captions" srclang label src> (needs the caption file → decision).', { impact: 'high', tier: 'needs-decision' });
      if (n.tag === 'audio' && !tracks.length && !/transcript|نص/.test(lc(plain(n.parent || n)))) E('ACCESS-18', n, 'Audio with no transcript nearby.', 'Link a transcript next to the player (needs the text → decision).', { impact: 'high', tier: 'needs-decision' });
      if (!has(n, 'controls') && !mutedLoop) E('ACCESS-18', n, 'Media with no controls and no custom buttons the user can reach.', 'Add controls, or real <button>s with names for play/pause.', { impact: 'medium', tier: 'C' });
      if (n.tag === 'video' && !has(n, 'aria-label') && !has(n, 'aria-labelledby') && !has(n, 'title') && !(n.parent && n.parent.tag === 'figure' && n.parent.children.some((c) => c.tag === 'figcaption'))) E('ACCESS-18', n, 'A video with no name.', 'Add aria-label (or a figcaption) saying what the video shows.', { impact: 'low', tier: 'A' });
    }

    // ---------- ACCESS-19: iframe, object/embed, canvas ----------
    if (n.tag === 'iframe' && !has(n, 'hidden') && attr(n, 'aria-hidden') !== 'true') {
      const t = norm(attr(n, 'title'));
      if (!has(n, 'title') || !t || ['iframe', 'frame', 'untitled', 'embed', 'title'].includes(t)) E('ACCESS-19', n, 'An iframe without a meaningful title is announced only as "frame".', 'Add title (translation key) saying what the frame contains.', { impact: 'medium', tier: 'A' });
    }
    if ((n.tag === 'object' || n.tag === 'embed') && !named(n)) E('ACCESS-19', n, 'An embedded object with no name.', 'Add title or aria-label, and fallback content inside <object>.', { impact: 'medium', tier: 'A' });
    if (n.tag === 'canvas') {
      const interactive = Object.keys(n.attrs).some((k) => /^\((click|mouse|key|touch|pointer)/.test(k));
      if (interactive) E('ACCESS-19', n, 'An interactive canvas is invisible to assistive technology and cannot be used by keyboard.', 'Provide the same actions as real controls (or a data table) next to it.', { impact: 'high', tier: 'needs-decision' });
      else if (!has(n, 'aria-label') && !has(n, 'aria-labelledby') && !n.text.trim()) E('ACCESS-19', n, 'A canvas with no text alternative.', 'Add aria-label and fallback text inside the canvas, or a text summary next to it.', { impact: 'medium', tier: 'needs-decision' });
    }

    // ---------- ACCESS-20: tables ----------
    if (n.tag === 'th' && !hasContent(n) && !has(n, 'aria-label')) E('ACCESS-20', n, 'An empty header cell.', 'Put visually-hidden text inside it ("Actions").', { impact: 'medium', tier: 'A' });

    // ---------- ACCESS-21: image box reserved ----------
    if (n.tag === 'img' && ctx.box) {
      const sized = (has(n, 'width') && has(n, 'height')) || 'fill' in n.attrs || /\baspect-ratio\s*:/.test(String(attr(n, 'style') || '')) || (has(n, 'style') && /(width|inline-size)\s*:/.test(String(attr(n, 'style'))) && /(height|block-size)\s*:/.test(String(attr(n, 'style'))));
      const cls = String(attr(n, 'class') || '').split(/\s+/).filter(Boolean);
      const infos = cls.map((c) => ctx.box(c));
      if (!sized && !infos.includes('fixed')) E('ACCESS-21', n, infos.includes('width-only') ? 'Only the width of this image is fixed by its class: the height still depends on the file, so the content below jumps when it loads.' : 'Nothing reserves this image\'s box, so the content below jumps when it loads.', 'Add aspect-ratio in this component\'s SCSS only when the same box is provable; width/height attributes can change the rendered size (Tier C, needs the visual proof). Never guess the intrinsic size.', { impact: 'low', tier: 'C' });
    }

    // ---------- ACCESS-22: visible text vs accessible name ----------
    if ((n.tag === 'button' || n.tag === 'a' || ['button', 'link', 'tab', 'menuitem'].includes(role)) && typeof n.attrs['aria-label'] === 'string' && !isBound(n, 'aria-label')) {
      const vis = norm(plain(n)), name = norm(n.attrs['aria-label']);
      if (vis && !n.dynamic && vis !== name && !name.includes(vis)) E('ACCESS-22', n, `The accessible name "${n.attrs['aria-label']}" does not contain the visible text "${plain(n)}": voice-control users saying what they see get nothing.`, 'Make the aria-label start with the visible text, or drop the aria-label (hidden extra text is better than an override).', { impact: 'medium', tier: 'A' });
      else if (vis && vis === name) E('ACCESS-22', n, 'aria-label repeats the visible text: the same words are announced twice or the label is redundant.', 'Remove the aria-label.', { impact: 'low', tier: 'A' });
    }
  }

  // ---------- template-wide checks ----------
  const mains = nodes.filter((n) => n.tag === 'main' && !n.inFlow);
  if (mains.length > 1) E('ACCESS-09', mains[1], `${mains.length} <main> elements in one template: a page has one main landmark.`, 'Keep one <main>; use section/div for the rest.', { impact: 'medium', tier: 'B' });
  for (const tag of ['nav', 'aside']) {
    const list = nodes.filter((n) => n.tag === tag);
    if (list.length > 1) for (const n of list.filter((x) => !has(x, 'aria-label') && !has(x, 'aria-labelledby'))) E('ACCESS-09', n, `Several <${tag}> landmarks and this one has no name, so they sound identical.`, `Add a different aria-label (translation key) to each <${tag}>.`, { impact: 'medium', tier: 'A' });
  }
  const h1s = nodes.filter((n) => n.tag === 'h1');
  if (h1s.length > 1) for (const n of h1s.slice(1)) E('ACCESS-10', n, 'A second <h1> in the same template: the page has one main heading.', 'Use <h2> and move the look to a class (or change the level by input for a shared component).', { impact: 'medium', tier: 'C' });
  const links = nodes.filter((n) => n.tag === 'a' && !n.dynamic && plain(n) && !has(n, 'aria-label'));
  const dest = (n) => String(n.attrs.href || n.attrs.routerLink || n.attrs['[routerLink]'] || n.attrs['[href]'] || '');
  const byText = new Map();
  for (const n of links) (byText.get(norm(plain(n))) || byText.set(norm(plain(n)), []).get(norm(plain(n)))).push(n);
  for (const [t, list] of byText) if (list.length > 1 && !VAGUE.has(t) && new Set(list.map(dest)).size > 1) E('ACCESS-11', list[1], `${list.length} links say "${plain(list[0])}" but go to different places.`, 'Give each a different aria-label that names its destination.', { impact: 'medium', tier: 'A' });
  const tables = nodes.filter((n) => n.tag === 'table');
  for (const t of tables) {
    const ds = descendants(t);
    if (!ds.some((d) => d.tag === 'th') && !has(t, 'role')) E('ACCESS-20', t, 'A table with no header cells: values are read with no column or row names (or it is a layout table).', 'Use <th scope="col"> for the first row; for a layout table use role="presentation" or switch to grid/flex.', { impact: 'medium', tier: 'C' });
    if (ds.some((d) => (d.tag === 'td' || d.tag === 'th') && (Number(d.attrs.colspan) > 1 || Number(d.attrs.rowspan) > 1)) && !ds.some((d) => has(d, 'headers'))) E('ACCESS-20', t, 'Merged cells with no id/headers pairing: assistive technology cannot tell which header belongs to a cell.', 'Pair each td with headers="…" (or split it into two simple tables).', { impact: 'medium', tier: 'C' });
    if (!ds.some((d) => d.tag === 'caption') && !has(t, 'aria-label') && !has(t, 'aria-labelledby')) E('ACCESS-20', t, 'A table with no caption or name.', 'Add a <caption> (visually hidden if the design has no visible title).', { impact: tables.length > 1 ? 'medium' : 'low', tier: 'A' });
  }
  void controls;
}

/** Page-level checks on src/index.html and the routes. */
function checkDocument(root, profile, add) {
  const rel = 'src/index.html';
  const text = u.readText(path.join(root, 'src', 'index.html'));
  if (text == null) return;
  const htmlTag = /<html\b[^>]*>/i.exec(text);
  const line = (re) => { const m = re.exec(text); return m ? u.lineAt(text, m.index) : 1; };
  if (!htmlTag || !/\slang\s*=\s*["'][^"']+["']/i.test(htmlTag[0])) add('ACCESS-12', rel, line(/<html\b/i), 'The page has no language: screen readers pick the wrong pronunciation.', 'Set <html lang="…"> (and dir) for the app\'s language.', { impact: 'high', tier: 'A' });
  const vp = /<meta[^>]*name=["']viewport["'][^>]*>/i.exec(text);
  if (vp && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp[0])) add('ACCESS-12', rel, u.lineAt(text, vp.index), 'The viewport blocks zooming, which people with low vision depend on.', 'Remove user-scalable=no and maximum-scale=1.', { impact: 'medium', tier: 'A' });
  const title = /<title>([\s\S]*?)<\/title>/i.exec(text);
  if (!title || !title[1].trim()) add('ACCESS-12', rel, title ? u.lineAt(text, title.index) : 1, 'The page has no <title>.', 'Add a title (translation of the app name).', { impact: 'medium', tier: 'A' });
  // every route shares the index title: no route title and no Title service
  const ts = project.listUiFiles(root, profile).filter((f) => f.kind === 'ts').map((f) => u.readText(f.abs) || '');
  const routes = ts.filter((t) => /\bRoutes\b/.test(t) && /\bpath\s*:/.test(t));
  const paths = routes.reduce((n, t) => n + (t.match(/\bpath\s*:/g) || []).length, 0);
  if (paths >= 2 && !routes.some((t) => /\btitle\s*:/.test(t)) && !ts.some((t) => /\bsetTitle\s*\(|TitleStrategy/.test(t))) add('ACCESS-12', rel, 1, `${paths} routes share one page title: a screen reader announces the same title on every page.`, 'Add a title: to each route (a translation key through a TitleStrategy).', { impact: 'medium', tier: 'needs-decision' });
}

function run(root, profile) {
  const findings = [];
  const add = (id, file, line, message, fix, extra) => findings.push(mk(root, id, file, line, message, fix, extra));
  let box = null;
  try { box = require('./media-check').boxInfoClasses(root, profile); } catch { /* no styles to read */ }
  for (const f of project.listUiFiles(root, profile)) {
    if (!['html', 'ts', 'index'].includes(f.kind)) continue;
    const text = u.readText(f.abs) || '';
    for (const tpl of h.templatesOf(f.rel, f.kind === 'index' ? text.replace(/<html\b/i, '<html') : text)) {
      if (f.kind === 'index') continue; // index.html is the document, not a component template
      checkTemplate(root, f.rel, tpl, add, { box });
    }
  }
  checkDocument(root, profile, add);
  return findings;
}

module.exports = { run, checkTemplate };
if (require.main === module) cli('access-check', `access-check.js — ACCESS-06..22 template checks (types and autofill, form structure, landmarks, headings, links,
document, role misuse, live regions, widgets, tabindex, media, embeds, tables, image box, label in name). Each finding has an impact (high|medium|low)
and a fix tier (A|B|C|D|needs-decision).`, run);
