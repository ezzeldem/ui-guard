'use strict';
// A small Angular-template reader for the ACCESS script checks: elements with attributes (static and bound), their parents,
// their text, and whether they sit inside an `@if` / `@for` / `*ngIf` block. Not a full HTML parser — it reads what the checks need.
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'wbr']);
const FLOW = /^@(if|else|for|empty|switch|case|default|defer|placeholder|loading|error)\b/;

/** Value of a static attribute, or the bound expression of `[attr.x]` / `[x]`; undefined when the attribute is absent. */
function attr(node, name) {
  for (const k of [name, `[attr.${name}]`, `[${name}]`]) if (k in node.attrs) return node.attrs[k];
  return undefined;
}
const has = (node, name) => attr(node, name) !== undefined;
const isBound = (node, name) => `[attr.${name}]` in node.attrs || `[${name}]` in node.attrs;
const classes = (node) => String(node.attrs.class || '').split(/\s+/).filter(Boolean);

/** parse(text, lineOffset) → { nodes, roots }. node = { id, tag, attrs, line, parent, children, text, dynamic, inFlow, closed }. */
function parse(text, lineOffset = 0) {
  const nodes = [];
  const stack = [];
  const flow = [];
  let line = 1 + lineOffset;
  let i = 0;
  const n = text.length;
  const addText = (s) => {
    if (!s.trim()) return;
    for (const a of stack) { a.text += s; }
  };
  const newline = (s) => { for (const c of s) if (c === '\n') line++; };
  while (i < n) {
    const c = text[i];
    if (c === '<' && text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); const end = e < 0 ? n : e + 3; newline(text.slice(i, end)); i = end; continue; }
    if (c === '<' && text[i + 1] === '/') {
      const e = text.indexOf('>', i); const end = e < 0 ? n : e + 1;
      const name = text.slice(i + 2, end - 1).trim().toLowerCase();
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      newline(text.slice(i, end)); i = end; continue;
    }
    if (c === '<' && /[a-zA-Z]/.test(text[i + 1] || '')) {
      const startLine = line;
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(text[j])) j++;
      const tag = text.slice(i + 1, j).toLowerCase();
      const attrs = {};
      let selfClose = false;
      for (;;) {
        while (j < n && /\s/.test(text[j])) { if (text[j] === '\n') line++; j++; }
        if (j >= n) break;
        if (text[j] === '>') { j++; break; }
        if (text[j] === '/' && text[j + 1] === '>') { selfClose = true; j += 2; break; }
        let k = j;
        while (k < n && !/[\s=>]/.test(text[k]) && !(text[k] === '/' && text[k + 1] === '>')) k++;
        const name = text.slice(j, k);
        j = k;
        let value = true;
        if (text[j] === '=') {
          j++;
          if (text[j] === '"' || text[j] === "'") { const q = text[j]; let e = j + 1; while (e < n && text[e] !== q) e++; value = text.slice(j + 1, e); newline(value); j = e + 1; }
          else { let e = j; while (e < n && !/[\s>]/.test(text[e])) e++; value = text.slice(j, e); j = e; }
        }
        if (name) attrs[name] = value;
        else j++;
      }
      const parent = stack.length ? stack[stack.length - 1] : null;
      const node = { id: nodes.length, tag, attrs, line: startLine, parent, children: [], text: '', dynamic: false, inFlow: flow.length > 0 || '*ngIf' in attrs || '*ngFor' in attrs, flowDirect: false, closed: false };
      if (parent) parent.children.push(node);
      nodes.push(node);
      if (!VOID.has(tag) && !selfClose) stack.push(node);
      i = j; continue;
    }
    if (c === '@' && FLOW.test(text.slice(i, i + 14))) {
      const m = /^@(\w+)\s*(\([^{]*\))?\s*\{/.exec(text.slice(i, i + 400));
      if (m) { flow.push(m[1]); newline(m[0]); i += m[0].length; continue; }
    }
    if (c === '{' && text[i + 1] === '{') {
      const e = text.indexOf('}}', i + 2); const end = e < 0 ? n : e + 2;
      newline(text.slice(i, end));
      for (const a of stack) { a.dynamic = true; a.text += '\u0001'; }
      i = end; continue;
    }
    if (c === '}' && flow.length) { flow.pop(); i++; continue; }
    let j = i;
    while (j < n && text[j] !== '<' && !(text[j] === '{' && text[j + 1] === '{') && !(text[j] === '}' && flow.length) && !(text[j] === '@' && FLOW.test(text.slice(j, j + 14)))) j++;
    if (j === i) j = i + 1;
    const seg = text.slice(i, j);
    addText(seg); newline(seg); i = j;
  }
  // the element that directly sits in an @if/@for block (its parent is not inside the same block) renders only conditionally
  for (const nd of nodes) nd.flowDirect = nd.inFlow && (!nd.parent || !nd.parent.inFlow || '*ngIf' in nd.attrs);
  return { nodes };
}

/** Templates of a file: the .html text, or the inline `template: \`…\`` of a component .ts. [{ text, lineOffset }] */
function templatesOf(rel, text) {
  if (/\.html$/.test(rel)) return [{ text, lineOffset: 0 }];
  if (!/\.ts$/.test(rel)) return [];
  const out = [];
  for (const m of text.matchAll(/template\s*:\s*`([\s\S]*?)`/g)) out.push({ text: m[1], lineOffset: text.slice(0, m.index + m[0].indexOf('`') + 1).split('\n').length - 1 });
  return out;
}

const plain = (node) => node.text.replace(/\u0001/g, '').replace(/\s+/g, ' ').trim();
/** True when the element has something a reader can announce: text, an interpolation, or a descendant that has a name. */
function hasContent(node) {
  if (node.text.trim()) return true;
  return node.children.some((c) => c.tag === 'img' ? (attr(c, 'alt') || '').length > 0 || has(c, 'alt') && isBound(c, 'alt') : (has(c, 'aria-label') || has(c, 'aria-labelledby') || hasContent(c)));
}

module.exports = { parse, templatesOf, attr, has, isBound, classes, plain, hasContent, VOID };
