'use strict';
// ACCESS findings ranked by USER IMPACT (High / Medium / Low) instead of one "warning" for all, plus the findings that are
// not real problems and are never reported, and the grouping of repeats from one shared source.
const route = require('../route-files');

const HIGH = [
  [/alt-text|without (an? )?`?alt|no `?alt|missing `?alt|meaningful image/i, 'meaningful image without alt'],
  [/label-has-associated-control|no accessible name|unlabel|no label|without (a )?label|placeholder[- ]only|icon-only (button|link)/i, 'control without a name'],
  [/click-events-have-key-events|interactive-supports-focus|\((click)\)[^.]*\b(div|span|li|td|img)\b|\b(div|span)\b[^.]*\(click\)|clickable (div|span)|not (keyboard )?focusable|not operable with (enter|space|the keyboard)/i, 'clickable element without role/keyboard'],
  [/\blang\b[^.]*(missing|no |without)|(missing|no )[^.]*\blang\b|html-has-lang/i, 'missing page language'],
  [/positive tabindex|no-positive-tabindex|tabindex\s*=\s*"[1-9]/i, 'positive tabindex'],
  [/outline[^.]*(removed|none|0)[^.]*(no|without)[^.]*(replacement|focus)/i, 'focus outline removed without replacement'],
  [/contradict|lies|does not match the (real|actual) state|aria-hidden[^.]*focusable|static (aria-)?state/i, 'ARIA state contradicts the real state'],
];
const MEDIUM = [
  [/skipped heading|heading level|skips? (from )?h[1-6]|fake heading|heading for emphasis/i, 'heading order'],
  [/landmark|<main>|no `?<main|nav in a `?<div|<header>|<footer>|<nav>/i, 'landmark'],
  [/javascript:void|<a\b[^.]*without `?href|anchor[^.]*button|button[^.]*navigat|routerlink|click handler instead of/i, 'link/button misuse'],
  [/<th\b|table without|without `?<th|scope|caption|thead/i, 'table semantics'],
  [/iframe[^.]*title|title[^.]*iframe/i, 'iframe without title'],
  [/vague link|link text|click here|read more|"more"/i, 'vague link text'],
];

/** 'high' | 'medium' | 'low' for one ACCESS finding (an agent's own `impact` wins when valid). */
function impactOf(f) {
  if (f && ['high', 'medium', 'low'].includes(String(f.impact || '').toLowerCase())) return String(f.impact).toLowerCase();
  const text = `${f.message || ''} ${f.evidence || ''}`;
  if (HIGH.some(([re]) => re.test(text))) return 'high';
  if (MEDIUM.some(([re]) => re.test(text))) return 'medium';
  return 'low';
}
function labelOf(f) {
  const text = `${f.message || ''} ${f.evidence || ''}`;
  for (const [re, l] of HIGH.concat(MEDIUM)) if (re.test(text)) return l;
  return null;
}

/**
 * Findings that are not real problems (never reported):
 *  - a native element "without an explicit role" (button, a[href], input, nav, …: the role is implicit)
 *  - a correct alt="" on a decorative image
 *  - a missing <h1> in a component that is not a routed page or the shell (an obvious fragment)
 */
function notAProblem(root, f, pageDirs) {
  const m = `${f.message || ''}`;
  if (/\brole\b/i.test(m) && /\b(no|missing|without)\b[^.]*\b(explicit )?role\b|\brole\b[^.]*\b(missing|absent)\b/i.test(m) && /<?\b(button|a|input|select|textarea|nav|main|header|footer|ul|ol|li|table|img|form|h[1-6])\b>?/i.test(m) && !/\bdiv\b|\bspan\b|custom/i.test(m)) return 'native element: its role is implicit';
  if (/alt\s*=\s*""/.test(m + (f.evidence || '')) && /decorative/i.test(m) && !/meaningful|conveys|informative/i.test(m)) return 'decorative image with alt="" is correct';
  if (/\bh1\b/i.test(m) && /\b(no|missing|without)\b/i.test(m) && f.file !== 'src/index.html') {
    const dir = f.file.replace(/\/[^/]+$/, '');
    if (!pageDirs.some((d) => dir === d || dir.startsWith(d + '/')) && !/(^|\/)(layout|layouts|shell)(\/|$)/.test(f.file)) return 'component fragment: the page around it owns the <h1>';
  }
  return null;
}

function pageDirsOf(root) {
  const path = require('path');
  return route.routeMap(root).map((e) => path.relative(root, e.dir).split(path.sep).join('/'));
}

/** Normalized issue text: quoted names, numbers and line refs removed → same issue, same key. */
const issueKey = (f) => `${f.ruleId}|${String(f.message || '').replace(/`[^`]*`|"[^"]*"|'[^']*'/g, '…').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()}`;

/**
 * Group repeats: same issue from one shared source (one file, or the same markup line in several files) more than
 * 3 times → one group. Returns [{ key, impact, count, files, examples, shared, findings }], biggest/most severe first.
 */
function groups(findings) {
  const by = new Map();
  for (const f of findings) {
    const ev = String(f.evidence || '').replace(/\s+/g, ' ').trim();
    const k1 = `${issueKey(f)}|file:${f.file}`;
    const k2 = ev ? `${issueKey(f)}|ev:${ev}` : null;
    (by.get(k1) || by.set(k1, []).get(k1)).push(f);
    if (k2) (by.get(k2) || by.set(k2, []).get(k2)).push(f);
  }
  const used = new Set();
  const out = [];
  const keys = [...by.keys()].sort((a, b) => by.get(b).length - by.get(a).length || (a < b ? -1 : 1));
  for (const k of keys) {
    const list = by.get(k).filter((f) => !used.has(f));
    if (list.length <= 3) continue;
    list.forEach((f) => used.add(f));
    const files = [...new Set(list.map((f) => f.file))];
    out.push({ key: k, impact: impactOf(list[0]), count: list.length, files, examples: list.slice(0, 3).map((f) => `${f.file}:${f.line}`), shared: files.length > 1 || /shared|common|components\//.test(files[0]), message: list[0].message, ruleId: list[0].ruleId, findings: list });
  }
  for (const f of findings) if (!used.has(f)) out.push({ key: issueKey(f) + '|' + f.id, impact: impactOf(f), count: 1, files: [f.file], examples: [`${f.file}:${f.line}`], shared: false, message: f.message, ruleId: f.ruleId, findings: [f] });
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.impact] - rank[b.impact] || b.count - a.count || (a.key < b.key ? -1 : 1));
}

module.exports = { impactOf, labelOf, notAProblem, pageDirsOf, groups, issueKey };
