// Builds ui-code-review's target.json for a LOCAL commit range (base..head), using ui-code-review's own functions,
// exactly like get-review-target.js does for a PR in a local repo (the --repo-root branch), minus TFS.
// Usage: node ucr-local-target.js <repoRoot> <base> <head> <outDir>
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const T = require('D:/plugin/ui-code-review/scripts/get-review-target.js');
const [repoRoot, base, head, outDir] = process.argv.slice(2);
const git = (args, opt = {}) => spawnSync('git', ['-C', repoRoot, ...args], { maxBuffer: 1 << 28, ...opt });
const lines = (r) => String(r.stdout).split(/\r?\n/);
const filesDir = path.join(outDir, 'files');
fs.mkdirSync(filesDir, { recursive: true });
const files = [], assets = [];
for (const entry of lines(git(['-c', 'core.quotepath=false', 'diff', '--name-status', '-M', '--no-color', base, head]))) {
  if (!entry) continue;
  const parts = entry.split('\t'), status = parts[0], filePath = parts[parts.length - 1];
  if (/^D/i.test(status)) continue;
  if (T.isAssetFile(filePath)) { const s = git(['cat-file', '-s', `${head}:${filePath}`]); if (s.status === 0) assets.push({ path: filePath, sizeBytes: Number(String(s.stdout).trim()) }); continue; }
  const role = T.fileRole(filePath);
  if (!role) continue;
  const contentFile = path.join(filesDir, T.safeFileName(filePath));
  const show = git(['show', `${head}:${filePath}`], { encoding: 'buffer' });
  fs.writeFileSync(contentFile, show.stdout || Buffer.alloc(0));
  let ranges;
  if (/^A/i.test(status)) ranges = T.wholeFileRange(fs.readFileSync(contentFile, 'utf8'));
  else ranges = T.changedLineRanges(lines(git(['-c', 'core.quotepath=false', 'diff', '--no-color', '-U0', '-M', '--ignore-cr-at-eol', base, head, '--', filePath])));
  if (!ranges.length) continue;
  files.push({ path: filePath, role, changeType: status, contentFile, changedLines: ranges });
}
const translations = [];
const tdir = path.join(outDir, 'translations');
fs.mkdirSync(tdir, { recursive: true });
for (const p of lines(git(['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', head]))) {
  if (!p || T.fileRole(p) !== 'translation') continue;
  const cf = path.join(tdir, T.safeFileName(p));
  fs.writeFileSync(cf, git(['show', `${head}:${p}`], { encoding: 'buffer' }).stdout);
  translations.push({ path: p, contentFile: cf });
}
const target = { kind: 'pr', id: 'local', title: 'local comparison', baseCommit: base, headCommit: head, files, translations, assets, fixWorkItems: [], fixCheckSkipped: 'no linked work item' };
fs.writeFileSync(path.join(outDir, 'target.json'), JSON.stringify(target, null, 2));
console.log(`${files.length} UI file(s), ${translations.length} translation file(s), ${assets.length} asset(s) -> ${path.join(outDir, 'target.json')}`);
for (const f of files) console.log(`  ${f.role} ${f.path} ${JSON.stringify(f.changedLines)}`);
