'use strict';
// Cascade-order proof helpers. Two rules may swap places in the cascade without changing what the page shows when they
// can never decide the same property on the same element at the same level: they set no overlapping property, or every
// pair of their selectors has a different specificity (the higher one wins wherever it is), or the declarations differ
// in importance. Anything this cannot read (:is()/:not()/:where()/:has(), unknown at-rules, SCSS it cannot resolve) is
// treated as a conflict — the answer is only ever "provably the same" or "keep the order".

// Logical → physical (LTR), sizes included, so `inline-size` and `width` are the same property here.
const LOGICAL = {
  'inline-size': 'width', 'block-size': 'height', 'min-inline-size': 'min-width', 'max-inline-size': 'max-width', 'min-block-size': 'min-height', 'max-block-size': 'max-height',
  'inset-inline-start': 'left', 'inset-inline-end': 'right', 'inset-block-start': 'top', 'inset-block-end': 'bottom',
};
const POSITION = new Set(['top', 'right', 'bottom', 'left', 'inset', 'inset-inline', 'inset-block', 'inset-inline-start', 'inset-inline-end', 'inset-block-start', 'inset-block-end']);
const SPECIAL = [
  ['font', 'line-height'], ['gap', 'row-gap'], ['gap', 'column-gap'], ['columns', 'column-width'], ['columns', 'column-count'],
  ['place-items', 'align-items'], ['place-items', 'justify-items'], ['place-content', 'align-content'], ['place-content', 'justify-content'],
  ['place-self', 'align-self'], ['place-self', 'justify-self'], ['overflow', 'overflow-x'], ['overflow', 'overflow-y'],
];

function normProp(p) {
  let x = String(p).trim().toLowerCase().replace(/^-(webkit|moz|ms|o)-/, '');
  if (LOGICAL[x]) x = LOGICAL[x];
  return x;
}
const family = (p) => (p.startsWith('--') ? p : p.split('-')[0]);

/** True when setting property a can change the value of property b (shorthands and logical forms included). */
function propsOverlap(a, b) {
  const x = normProp(a), y = normProp(b);
  if (x.startsWith('--') || y.startsWith('--')) return x === y;
  if (x === y || x === 'all' || y === 'all') return true;
  if (POSITION.has(x) && POSITION.has(y)) return true;
  if (family(x) === family(y)) return true;
  return SPECIAL.some(([s, t]) => (x === s && y === t) || (x === t && y === s));
}

/** [ids, classes, types] of one complex selector, or null when it cannot be read safely. */
function specificity(sel) {
  let s = String(sel).trim();
  if (!s || /[{}]/.test(s)) return null;
  if (/:(is|not|where|has|matches|-webkit-any|-moz-any|host|host-context|nth-child|nth-last-child)\(/i.test(s) || /::?ng-deep/i.test(s) || /&|#\{|%/.test(s)) return null;
  s = s.replace(/"[^"]*"|'[^']*'/g, '""');
  let ids = 0, cls = 0, types = 0;
  s = s.replace(/\[[^\]]*\]/g, () => { cls++; return ' '; });
  s = s.replace(/::[\w-]+(\([^)]*\))?/g, () => { types++; return ' '; });
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, (m) => { if (/^:(before|after|first-line|first-letter)$/i.test(m)) types++; else cls++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { ids++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { cls++; return ' '; });
  for (const t of s.split(/[\s>+~]+/)) { const n = t.replace(/\*/g, '').replace(/\|/g, '').trim(); if (n && /^[a-z][\w-]*$/i.test(n)) types++; else if (n) return null; }
  return [ids, cls, types];
}
const sameSpec = (a, b) => !a || !b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

/**
 * rule: { sels: [selector…], decls: [{ prop, important }] } or { unknown: true }.
 * True when swapping the two rules in the cascade could change the rendered result.
 */
function conflict(r1, r2) {
  if (!r1 || !r2 || r1.unknown || r2.unknown) return true;
  let overlap = false;
  for (const a of r1.decls) for (const b of r2.decls) if (!!a.important === !!b.important && propsOverlap(a.prop, b.prop)) overlap = true;
  if (!overlap) return false;
  const s1 = r1.sels.map(specificity), s2 = r2.sels.map(specificity);
  for (const a of s1) for (const b of s2) if (sameSpec(a, b)) return true;
  return false;
}

/** A statement of several rules conflicts with another when any pair does. */
function conflictMany(list1, list2) {
  for (const a of list1) for (const b of list2) if (conflict(a, b)) return true;
  return false;
}

/** One normalized rule string from scss-text.normalize (`ctx|…sel{prop:val;…}`) → rule. */
function fromNormalized(str) {
  const open = str.indexOf('{');
  if (open < 0 || !str.endsWith('}')) return { unknown: true };
  const head = str.slice(0, open);
  const sel = head.slice(head.lastIndexOf('|') + 1);
  if (/^@/.test(sel)) return { unknown: true };
  const body = str.slice(open + 1, -1);
  const decls = [];
  let cur = '', depth = 0, q = '';
  const push = () => { const k = cur.indexOf(':'); if (k > 0) decls.push({ prop: cur.slice(0, k).trim(), important: /!important\s*$/i.test(cur) }); cur = ''; };
  for (const c of body) {
    if (q) { if (c === q) q = ''; cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ';' && depth === 0) { push(); continue; }
    cur += c;
  }
  if (cur.trim()) push();
  const sels = sel.split(',').map((x) => x.trim()).filter(Boolean);
  if (/^:root$/.test(sel) && decls.every((d) => d.prop.startsWith('--'))) return { sels, decls };
  return { sels, decls };
}

/**
 * Is `b` the same cascade as `a`, up to swaps of rules that cannot conflict? Both are arrays of normalized rule
 * strings (same multiset expected). Returns { same, reason }.
 */
function samePermutation(a, b) {
  if (a.length !== b.length) return { same: false, reason: `different number of rules (${a.length} → ${b.length})` };
  const where = new Map();
  b.forEach((x, i) => { if (!where.has(x)) where.set(x, []); where.get(x).push(i); });
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    const list = where.get(a[i]);
    if (!list || !list.length) return { same: false, reason: `rule ${i + 1} is missing after the change: ${a[i].slice(0, 90)}` };
    pos.push(list.shift());
  }
  const parsed = a.map(fromNormalized);
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if (pos[j] > pos[i]) continue; // same relative order
      if (conflict(parsed[i], parsed[j])) return { same: false, reason: `rules swapped that can decide the same property at the same specificity: ${a[i].slice(0, 70)} ↔ ${a[j].slice(0, 70)}` };
    }
  }
  return { same: true };
}

module.exports = { propsOverlap, specificity, conflict, conflictMany, fromNormalized, samePermutation, normProp };
