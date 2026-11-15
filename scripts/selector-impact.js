#!/usr/bin/env node
'use strict';
// Selector-impact check for ACCESS Tier B/C/D changes (rules/access-fix-tiers.md): which stylesheet rules could stop
// (or start) matching when an element of a block changes its tag or moves. 0 tokens.
const path = require('path');
const u = require('./lib/util');
const css = require('./lib/css');
const project = require('./lib/project');

const HELP = `selector-impact.js — rules that a tag swap or a structure change could break.
Usage: node selector-impact.js --file <template.html> --class <block or element class> [--tag <old tag>] [--to <new tag>] [--root <dir>] [--json]
Lists, from every project stylesheet:
  - rules that mention the class together with a structural pseudo-class (:first-child, :last-child, :nth-*, :only-*, :empty, :has()),
    a combinator (> + ~) or a bare tag (div, span, p, a, button, ul, ol, li, …)
  - bare selectors of the old and the new tag (the element layer and anywhere else)
  - rules for :required / :invalid / [type=…] / [required] (they make an attribute change a Tier C change)
Exit 0 = nothing found (the change is safe from the selector side) · 1 = rules listed (adjust them in the same change, or skip).`;

const TAGS = ['div', 'span', 'p', 'a', 'button', 'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'figure', 'fieldset', 'legend', 'table', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'input', 'img'];
const STRUCT = /:(first-child|last-child|nth-child|nth-last-child|nth-of-type|nth-last-of-type|first-of-type|last-of-type|only-child|only-of-type|empty)\b|:has\(/;

function check(root, { cls, tag, to }) {
  const profile = project.readProfile(root);
  const hits = [];
  const tagRe = (t) => new RegExp(`(^|[\\s>+~(,])${t}(?=$|[\\s.:#[>+~),])`);
  for (const f of project.listUiFiles(root, profile).filter((x) => x.kind === 'scss' || x.kind === 'css')) {
    const tree = css.parse(u.readText(f.abs) || '');
    css.walk(tree, (node, parents) => {
      if (node.type !== 'rule') return;
      for (const sel of css.resolveSelectors(parents, node)) {
        const s = sel.trim();
        const hasCls = cls && new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(s);
        if (hasCls) {
          if (STRUCT.test(s)) hits.push({ file: f.rel, line: node.line, selector: s, why: 'structural pseudo-class next to the block' });
          else if (/[>+~]/.test(s.replace(/\([^)]*\)/g, ''))) hits.push({ file: f.rel, line: node.line, selector: s, why: 'combinator: the element must stay in the same place' });
          else if (TAGS.some((t) => tagRe(t).test(s))) hits.push({ file: f.rel, line: node.line, selector: s, why: 'bare tag next to the block' });
        }
        for (const t of [tag, to].filter(Boolean)) if (tagRe(t).test(s) && !/[.#]/.test(s.replace(/::?[\w-]+(\([^)]*\))?/g, ''))) hits.push({ file: f.rel, line: node.line, selector: s, why: `bare \`${t}\` selector${t === to ? ' — it will now match the new element' : ' — it will stop matching'}` });
        if (/:(required|invalid|optional|valid)\b|\[(type|required)/.test(s) && (!cls || hasCls || !/[.#]/.test(s))) hits.push({ file: f.rel, line: node.line, selector: s, why: 'styles a required/type/validity state: an attribute change here is Tier C' });
      }
    });
  }
  const seen = new Set();
  return hits.filter((h) => { const k = `${h.file}:${h.line}:${h.why}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { check };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['json']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot(args.file ? path.resolve(args.file) : process.cwd());
  if (!root) { console.error('Not an Angular project.'); process.exit(1); }
  const hits = check(root, { cls: args.class ? String(args.class).replace(/^\./, '') : null, tag: args.tag, to: args.to });
  if (args.json) console.log(JSON.stringify(hits, null, 2));
  else { for (const h of hits) console.log(`${h.file}:${h.line}  ${h.selector}  — ${h.why}`); console.log(`selector-impact: ${hits.length} rule(s) to check`); }
  process.exit(hits.length ? 1 : 0);
}
