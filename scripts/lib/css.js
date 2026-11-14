'use strict';
// Tolerant CSS/SCSS parser for ui-guard scripts (not a full Sass parser).
// Produces: { type:'root', nodes } with children
//   { type:'rule', selector, line, nodes }
//   { type:'atrule', name, params, line, nodes|null }
//   { type:'decl', prop, value, important, line }
//   { type:'comment', text, line }

function parse(text) {
  const root = { type: 'root', nodes: [] };
  const stack = [root];
  let buf = '';
  let bufStart = -1;
  let line = 1;
  let bufLine = 1;
  let paren = 0;
  let i = 0;
  const n = text.length;
  const top = () => stack[stack.length - 1];
  const pushText = (c) => { if (bufStart < 0 && !/\s/.test(c)) { bufStart = i; bufLine = line; } buf += c; };

  function flushDecl() {
    const s = buf.trim();
    buf = ''; bufStart = -1;
    if (!s) return;
    if (s[0] === '@') {
      const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(s);
      top().nodes.push({ type: 'atrule', name: m ? m[1] : s.slice(1), params: m ? m[2].trim() : '', line: bufLine, nodes: null });
      return;
    }
    const c = s.indexOf(':');
    if (c > 0) {
      let value = s.slice(c + 1).trim();
      let important = false;
      if (/!important\s*$/i.test(value)) { important = true; value = value.replace(/\s*!important\s*$/i, ''); }
      top().nodes.push({ type: 'decl', prop: s.slice(0, c).trim(), value, important, line: bufLine });
    } else top().nodes.push({ type: 'unknown', text: s, line: bufLine });
  }

  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; buf += c; i++; continue; }
    // comments
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      const body = text.slice(i, stop);
      if (!buf.trim()) top().nodes.push({ type: 'comment', text: body.slice(2, -2), line, block: true });
      for (const ch of body) if (ch === '\n') line++;
      i = stop; continue;
    }
    if (c === '/' && text[i + 1] === '/' && text[i - 1] !== ':' && paren === 0) {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      if (!buf.trim()) top().nodes.push({ type: 'comment', text: text.slice(i + 2, stop), line, block: false });
      i = stop; continue;
    }
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j++; if (text[j] === '\n') line++; j++; }
      pushText(''); if (bufStart < 0) { bufStart = i; bufLine = line; }
      buf += text.slice(i, j + 1); i = j + 1; continue;
    }
    // interpolation #{...}
    if (c === '#' && text[i + 1] === '{') {
      let depth = 0, j = i + 1;
      for (; j < n; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') { depth--; if (depth === 0) break; } }
      if (bufStart < 0) { bufStart = i; bufLine = line; }
      buf += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '(') { paren++; pushText(c); i++; continue; }
    if (c === ')') { paren = Math.max(0, paren - 1); pushText(c); i++; continue; }
    if (paren > 0) { pushText(c); i++; continue; }
    if (c === ';') { flushDecl(); i++; continue; }
    if (c === '{') {
      const s = buf.trim();
      const l = bufStart < 0 ? line : bufLine;
      buf = ''; bufStart = -1;
      let node;
      if (s[0] === '@') {
        const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(s);
        node = { type: 'atrule', name: m ? m[1] : s.slice(1), params: m ? m[2].trim() : '', line: l, nodes: [] };
      } else if (/^[\w-]+\s*:\s*[^:]*$/.test(s) && !/^[\w-]+\s*:\s*(hover|focus|active|not|is|where|has|host|root|before|after|first|last|nth|disabled|checked)/.test(s) && top().type !== 'root' && /:\s*$/.test(s)) {
        node = { type: 'rule', selector: s, line: l, nodes: [], nestedProps: true };
      } else node = { type: 'rule', selector: s, line: l, nodes: [] };
      top().nodes.push(node);
      stack.push(node);
      i++; continue;
    }
    if (c === '}') {
      flushDecl();
      if (stack.length > 1) stack.pop();
      i++; continue;
    }
    pushText(c); i++;
  }
  flushDecl();
  return root;
}

/** Depth-first walk. cb(node, parents) */
function walk(node, cb, parents = []) {
  for (const child of node.nodes || []) {
    cb(child, parents);
    if (child.nodes) walk(child, cb, parents.concat(child));
  }
}

function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Resolve nested selectors (handles & and &-suffix). Returns array of full selectors. */
function resolveSelectors(parents, rule) {
  let current = [''];
  for (const p of parents.concat(rule)) {
    if (p.type !== 'rule' || p.nestedProps) continue;
    const parts = splitSelectors(p.selector);
    const next = [];
    for (const base of current) {
      for (const part of parts) {
        if (part.includes('&')) next.push(part.replace(/&/g, base).trim());
        else next.push((base ? base + ' ' : '') + part);
      }
    }
    current = next;
  }
  return current;
}

/** Class names in a (resolved) selector, ignoring those inside :not()/attribute values? (kept: all .class tokens). */
function classesIn(selector) {
  const out = [];
  const clean = selector.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"|'[^']*'/g, '').replace(/#\{[^}]*\}/g, 'X');
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(clean))) out.push(m[1]);
  return out;
}

/** Custom property declarations anywhere: [{name, value, line, selector}] */
function customProps(rootNode) {
  const out = [];
  walk(rootNode, (node, parents) => {
    if (node.type === 'decl' && node.prop.startsWith('--')) {
      const rule = [...parents].reverse().find((p) => p.type === 'rule');
      out.push({ name: node.prop, value: node.value, line: node.line, selector: rule ? rule.selector : null });
    }
  });
  return out;
}

module.exports = { parse, walk, splitSelectors, resolveSelectors, classesIn, customProps };
