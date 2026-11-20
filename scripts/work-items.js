#!/usr/bin/env node
'use strict';
// Fix check (FIX-xx, rules/fix.md) support for /ui-guard:check — the same check ui-code-review runs on a PR.
// Finds the Bug / User Story the change is for, writes them as Markdown, and writes the full diff of every changed file
// (not only UI) for the ui-fix-checker agent. Read-only git; read-only TFS (GET only).
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');
const tfs = require('./lib/tfs');

const HELP = `work-items.js — fix check support for /ui-guard:check (rules/fix.md).
Usage:
  node work-items.js collect [--root <dir>] [--ref <git-ref>] [--work-item <id,id|auto>] [--work-item-file <path>] [--figma <url>]
      Run after \`changes.js collect\`. Opt-in: without --work-item or --work-item-file the fix check is skipped (0 tokens).
      --work-item <id,id> checks those; --work-item auto finds them: the work items linked to the active pull
      request of the current branch, else #<id> / AB#<id> in the messages of the commits being pushed. Only Bugs and backlog items
      (User Story, Product Backlog Item, Requirement). Needs an https TFS origin remote and the PAT in ${tfs.PAT_VARIABLE}.
      --work-item-file: a work item pasted as text (no TFS needed).
      Writes .ui-guard/tmp/check/fix/target.json (+ workitems/<id>.md, full.diff). Prints "fix check: …" or "fix check skipped: …".`;

const MAX_DIFF_LINES = 3000;
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|packages\.lock\.json)$|\.min\.(css|js)$|\.map$|(^|\/)(node_modules|dist|bin|obj|wwwroot\/lib)\//i;

/** #123 / AB#123 in the commit messages between base and HEAD. */
function idsFromCommits(root, base) {
  const log = git.git(root, ['log', '--format=%B', base ? `${base}..HEAD` : '-20']) || '';
  const ids = new Set();
  for (const m of log.matchAll(/(?:^|[\s(\[])(?:AB)?#(\d{2,7})\b/g)) ids.add(Number(m[1]));
  return [...ids];
}

/** Full diff of every changed file (committed since base + uncommitted), work-item-related files first, under MAX_DIFF_LINES. */
function writeFullDiff(root, base, dir, workItems) {
  const text = git.git(root, ['diff', '--no-color', base || 'HEAD']) || '';
  const chunks = [];
  for (const part of text.split(/^(?=diff --git )/m)) {
    const m = /^diff --git a\/(.+?) b\//.exec(part);
    if (m && !NOISE.test(m[1])) chunks.push({ path: m[1], text: part });
  }
  const words = new Set();
  for (const wi of workItems) for (const w of String(wi.title).toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4) words.add(w);
  const score = (p) => [...words].filter((w) => p.toLowerCase().includes(w)).length;
  const ordered = chunks.map((c, i) => ({ ...c, i, s: score(c.path) })).sort((a, b) => b.s - a.s || a.i - b.i);
  const out = [], omitted = [];
  let lines = 0;
  for (const c of ordered) {
    const n = c.text.split('\n').length;
    if (lines + n > MAX_DIFF_LINES && out.length) { omitted.push(c.path); continue; }
    out.push(c.text); lines += n;
  }
  const file = path.join(dir, 'full.diff');
  u.writeText(file, out.join('') + (omitted.length ? `\n# Not in this diff (too long): ${omitted.join(', ')}\n` : ''));
  return { file, files: chunks.length, truncated: omitted.length > 0, omitted };
}

async function collect(root, args) {
  const p = project.paths(root);
  const dir = path.join(p.checkTmp, 'fix');
  fs.rmSync(dir, { recursive: true, force: true });
  const ch = u.readJSON(path.join(p.checkTmp, 'changes.json'));
  if (!ch) { console.error('Run `changes.js collect` first.'); process.exit(1); }
  const base = ch.base || args.ref || null;
  const items = [];
  let source = null, skipped = null;

  if (args['work-item-file']) {
    const text = u.readText(path.resolve(String(args['work-item-file'])));
    if (!text) skipped = `could not read ${args['work-item-file']}`;
    else items.push({ id: 'pasted', type: 'Work item', title: (text.split('\n').find((l) => l.trim()) || 'pasted work item').replace(/^#+\s*/, '').slice(0, 120), state: '', md: tfs.redactSecrets(text) });
    source = 'pasted text';
  } else if (!args['work-item']) {
    skipped = 'not requested (pass --work-item <id> or --work-item auto)';
  } else {
    const remote = tfs.remoteInfo(root);
    const pat = tfs.getPat();
    if (!remote) skipped = 'the origin remote is not an https TFS / Azure DevOps Server Git remote (use --work-item-file)';
    else if (!pat) skipped = `${tfs.PAT_VARIABLE} is not set (use --work-item-file, or set the PAT)`;
    else {
      try {
        let ids = String(args['work-item']).toLowerCase() !== 'auto' ? String(args['work-item']).split(/[,\s]+/).map(Number).filter(Number.isInteger) : [];
        source = ids.length ? '--work-item' : null;
        if (!ids.length) {
          const branch = (git.git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim();
          if (branch && branch !== 'HEAD') { ids = await tfs.branchPullRequestWorkItemIds({ ...remote, branch, pat }); if (ids.length) source = `pull request of ${branch}`; }
        }
        if (!ids.length) { ids = idsFromCommits(root, base); if (ids.length) source = 'commit messages'; }
        if (!ids.length) skipped = 'no linked work item found (pass --work-item <id>)';
        else {
          const wis = (await tfs.getWorkItems({ collectionUrl: remote.collectionUrl, ids, pat })).filter((w) => tfs.FIX_WORK_ITEM_TYPES.test(w.type));
          if (!wis.length) skipped = `work item(s) ${ids.join(', ')}: no Bug or User Story`;
          for (const w of wis) items.push({ id: w.id, type: w.type, title: w.title, state: w.state, md: tfs.workItemMarkdown(w) });
        }
      } catch (e) { skipped = `work items could not be read (${e.message})`; }
    }
  }

  if (!items.length) {
    u.writeJSON(path.join(dir, 'target.json'), { skipped: skipped || 'no work item' });
    console.log(`fix check skipped: ${skipped || 'no work item'}`);
    return;
  }
  const wiDir = path.join(dir, 'workitems');
  const fixWorkItems = items.map((w) => {
    const file = path.join(wiDir, `${w.id}.md`);
    u.writeText(file, w.md);
    return { id: w.id, type: w.type, title: w.title, state: w.state, file: u.relPosix(root, file) };
  });
  const fd = writeFullDiff(root, base, dir, items);
  const target = {
    source, fixWorkItems,
    fullDiff: { file: u.relPosix(root, fd.file), files: fd.files, truncated: fd.truncated, omitted: fd.omitted },
    files: (ch.files || []).map((f) => ({ path: f, contentFile: f, changedLines: ch.ranges[f] || [] })),
    figma: args.figma || null,
  };
  u.writeJSON(path.join(dir, 'target.json'), target);
  console.log(`fix check: ${fixWorkItems.length} work item(s) from ${source} (${fixWorkItems.map((w) => `${w.type} ${w.id}`).join(', ')}), ${fd.files} file(s) in the diff${fd.truncated ? ' (truncated)' : ''} → ${u.relPosix(root, path.join(dir, 'target.json'))}`);
}

module.exports = { idsFromCommits };
if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('Not an Angular or ASP.NET project.'); process.exit(1); }
  if (args._[0] === 'collect') collect(root, args).catch((e) => { console.error(e.message); process.exit(1); });
  else console.log(HELP);
}
