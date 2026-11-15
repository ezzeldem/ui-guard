#!/usr/bin/env node
'use strict';
// §5.8 / §5.9 / §6.1 project setup pieces. Each subcommand is run by a command only AFTER the developer agreed.
// Never runs git write commands (core.hooksPath is set by the command itself, after asking).
const fs = require('fs');
const path = require('path');
const u = require('./lib/util');
const project = require('./lib/project');
const git = require('./lib/git');

const T = path.join(project.PLUGIN_ROOT, 'templates');
const HELP = `setup-project.js — install ui-guard's project-side files (run only after asking the developer).
Usage (all accept --root <dir>):
  node setup-project.js tools                  print the EXACT install commands (ESLint pinned to 9) and whether an installed ESLint works or crashes; installs nothing
  node setup-project.js status                 what exists already (configs, hook path, .gitignore, CLAUDE.md block)
  node setup-project.js lint [--internal] [--root-stylelint] [--root-eslint]
        --internal: only .ui-guard/lint/ (used by /ui-guard:scan and /ui-guard:fix — no file outside .ui-guard/, no question)
        copy the Stylelint plugin + configs into .ui-guard/lint/ and write lint-settings.json / lint-map.json from the profile.
        Root re-export files (stylelint.config.mjs / eslint.config.mjs) are written only when the project has NO config of its
        own, or when --root-stylelint / --root-eslint is given (= the developer agreed to replace). Existing configs are
        reported (exit 3) with the merge snippet — never overwritten silently.
  node setup-project.js githook [--chain <existing-hooks-path>] [--with-assets]
        write .githooks/pre-push + .ui-guard/bin/pre-push.js (does NOT change git config).
  node setup-project.js gitignore [--create]   add .ui-guard/tmp/ to .gitignore (exit 3 if .gitignore is missing and --create not given)
  node setup-project.js claude-md              add/replace the ui-guard block in CLAUDE.md (between markers)`;

function existingConfigs(root) {
  const names = fs.readdirSync(root);
  const pkg = u.readJSON(path.join(root, 'package.json'), {});
  const stylelint = names.filter((n) => /^(\.stylelintrc(\.(json|ya?ml|js|cjs|mjs))?|stylelint\.config\.(js|cjs|mjs|ts))$/.test(n));
  if (pkg.stylelint) stylelint.push('package.json#stylelint');
  const eslint = names.filter((n) => /^(eslint\.config\.(js|cjs|mjs|ts)|\.eslintrc(\.(json|ya?ml|js|cjs))?)$/.test(n));
  if (pkg.eslintConfig) eslint.push('package.json#eslintConfig');
  return { stylelint, eslint };
}
const isOurs = (root, f) => /ui-guard/.test(u.readText(path.join(root, f)) || '');

function lint(root, args) {
  const p = project.paths(root);
  const profile = project.readProfile(root);
  u.mkdirp(p.lint);
  for (const f of ['stylelint-ui-guard.mjs', 'stylelint.config.mjs', 'eslint.config.mjs']) fs.copyFileSync(path.join(T, 'lint', f), path.join(p.lint, f));
  u.writeJSON(path.join(p.lint, 'lint-settings.json'), { scssRoot: project.scssRoot(profile), themesRoot: 'src/assets/themes', roleMap: project.roleMap(profile) });
  const idx = project.loadRulesIndex();
  u.writeJSON(path.join(p.lint, 'lint-map.json'), { lintMap: idx.lintMap, severity: Object.fromEntries(idx.rules.map((r) => [r.id, r.severity])) });
  if (args.internal) { console.log(`lint files → ${u.relPosix(root, p.lint)}/ (internal: no root config written)`); return 0; }
  const ex = existingConfigs(root);
  let blocked = false;
  const sOthers = ex.stylelint.filter((f) => !isOurs(root, f));
  if (!sOthers.length || args['root-stylelint']) { u.writeText(path.join(root, 'stylelint.config.mjs'), "// ui-guard: re-export so VS Code, the git hook and Claude use the same rules.\nexport { default } from './.ui-guard/lint/stylelint.config.mjs';\n"); console.log('stylelint.config.mjs (root re-export) written.'); }
  else { blocked = true; console.log(`EXISTS Stylelint config: ${sOthers.join(', ')} — ask before replacing or merging. Merge = add to it: plugins/rules/overrides of .ui-guard/lint/stylelint.config.mjs.`); }
  const eOthers = ex.eslint.filter((f) => !isOurs(root, f));
  if (!eOthers.length || args['root-eslint']) { u.writeText(path.join(root, 'eslint.config.mjs'), "// ui-guard: re-export so VS Code, the git hook and Claude use the same rules.\nexport { default } from './.ui-guard/lint/eslint.config.mjs';\n"); console.log('eslint.config.mjs (root re-export) written.'); }
  else { blocked = true; console.log(`EXISTS ESLint config: ${eOthers.join(', ')} — ask before merging (never overwrite). Merge snippet for a flat config:\n  import { uiGuardConfigs } from './.ui-guard/lint/eslint.config.mjs';\n  export default [ ...yourExistingConfigs, ...uiGuardConfigs ];`); }
  console.log(`lint files → ${u.relPosix(root, p.lint)}/ (plugin, configs, lint-settings.json, lint-map.json)`);
  return blocked ? 3 : 0;
}

function githook(root, args) {
  const p = project.paths(root);
  let hook = u.readText(path.join(T, 'git', 'pre-push'));
  if (args.chain) hook = hook.replace('# __CHAIN__', `# chained to the previous hooks path\nif [ -x "${String(args.chain).replace(/"/g, '')}/pre-push" ]; then\n  "${String(args.chain).replace(/"/g, '')}/pre-push" "$@" || exit $?\nfi`);
  else hook = hook.replace('# __CHAIN__\n', '');
  const hookFile = path.join(root, '.githooks', 'pre-push');
  u.writeText(hookFile, hook.replace(/\r\n/g, '\n'));
  try { fs.chmodSync(hookFile, 0o755); } catch { /* Windows: Git for Windows runs it anyway */ }
  u.mkdirp(p.bin);
  fs.copyFileSync(path.join(T, 'git', 'pre-push.js'), path.join(p.bin, 'pre-push.js'));
  // offered, not forced: the missing-asset check in the pre-push flow (fast, ignores items in assets-baseline.json)
  if (args['with-assets']) { fs.copyFileSync(path.join(__dirname, 'assets.js'), path.join(p.bin, 'assets.js')); console.log('pre-push also checks new missing assets (.ui-guard/bin/assets.js).'); }
  const current = git.getConfig(root, 'core.hooksPath');
  console.log(`hook files written: .githooks/pre-push, .ui-guard/bin/pre-push.js · current core.hooksPath: ${current || '(not set)'}`);
  if (!current) console.log('ASK: Set `git config core.hooksPath .githooks` so the hook runs for every push? (local git config only, no commit)');
  else if (current !== '.githooks') console.log(`ASK: core.hooksPath is already "${current}". Chain to it instead? (re-run with --chain "${current}", then set core.hooksPath .githooks after the developer agrees)`);
  return 0;
}

function gitignore(root, args) {
  const f = path.join(root, '.gitignore');
  if (!u.exists(f) && !args.create) { console.log('ASK: there is no .gitignore — create one with `.ui-guard/tmp/`? (re-run with --create)'); return 3; }
  const t = u.readText(f) || '';
  if (/^\/?\.ui-guard\/tmp\/?\s*$/m.test(t)) { console.log('.gitignore already ignores .ui-guard/tmp/'); return 0; }
  u.writeText(f, t + (t && !t.endsWith('\n') ? '\n' : '') + '\n# ui-guard: screenshots, scan batches, auth state (never commit)\n.ui-guard/tmp/\n');
  console.log('.gitignore: added .ui-guard/tmp/');
  return 0;
}

function claudeMd(root) {
  const f = path.join(root, 'CLAUDE.md');
  const block = u.readText(path.join(T, 'claude-md-block.md')).trim();
  const t = u.readText(f);
  let out;
  if (t == null) out = block + '\n';
  else if (/<!-- ui-guard:start -->[\s\S]*?<!-- ui-guard:end -->/.test(t)) out = t.replace(/<!-- ui-guard:start -->[\s\S]*?<!-- ui-guard:end -->/, block);
  else out = t + (t.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
  u.writeText(f, out);
  console.log(`CLAUDE.md: ui-guard block ${t == null ? 'created' : 'written'}.`);
  return 0;
}

/** Stylelint 18 needs Node ≥ 22.22.2 / 24.15 / 26; otherwise the 17 line. */
function stylelintPkg() {
  const [maj, min, pat] = process.versions.node.split('.').map(Number);
  const ok18 = maj >= 26 || (maj === 24 && min >= 15) || (maj === 22 && (min > 22 || (min === 22 && pat >= 2)));
  return ok18 ? 'stylelint' : 'stylelint@^17';
}

/**
 * Prints the EXACT install commands (nothing is installed here). ESLint is pinned to 9 (ESLint 10 crashes in eslint-scope
 * with angular-eslint on some projects). If the project already has an ESLint, it is tried: a working one is kept; a
 * crashing one is reported with the exact reason and the fix to offer (ask first).
 */
function tools(root) {
  const profile = project.readProfile(root);
  const major = (profile.angular && profile.angular.major) || (u.readJSON(path.join(root, 'package.json'), {}).dependencies || {})['@angular/core'];
  const ngMajor = parseInt(String(major).replace(/^[^\d]*/, ''), 10) || '<Angular major>';
  const lint = require('./lib/lint');
  const pj = u.readJSON(path.join(root, 'node_modules', 'eslint', 'package.json'), null);
  const eslintCmd = `npm install -D eslint@^9 angular-eslint@^${ngMajor} typescript-eslint`;
  const out = {
    stylelint: { install: `npm install -D ${stylelintPkg()} postcss-scss stylelint-scss`, installed: !!lint.resolveBin(root, 'stylelint', 'stylelint') },
    eslint: { installed: !!pj, version: pj ? pj.version : null, install: eslintCmd, status: pj ? 'unknown' : 'not installed' },
    screenshots: { install: 'npm install -D playwright pixelmatch pngjs', extra: 'npx playwright install chromium' },
  };
  if (pj) {
    const cfg = lint.eslintConfig(root);
    const sample = project.listUiFiles(root, project.readProfile(root)).find((f) => f.kind === 'html' || f.kind === 'ts');
    if (!cfg) out.eslint.status = 'installed, ui-guard config not set up yet (run `setup-project.js lint` first)';
    else if (!sample) out.eslint.status = 'working (no file to try)';
    else {
      const r = lint.eslint(root, [sample.rel]);
      if (r.available) out.eslint.status = 'working';
      else { out.eslint.status = 'crashing'; out.eslint.reason = r.reason; }
    }
  }
  console.log(JSON.stringify(out, null, 2));
  if (!pj) console.log(`ASK before installing ESLint: ${eslintCmd}`);
  else if (out.eslint.status === 'crashing') console.log(`ESLint ${pj.version} crashes: ${out.eslint.reason}\nOffer (ask first): ${eslintCmd}   — its rules stay "NOT CHECKED" and are never sent to the AI until it works.`);
  else console.log(`ESLint ${pj.version}: ${out.eslint.status} — keep it (do not reinstall).`);
  return 0;
}

function status(root) {
  const ex = existingConfigs(root);
  const p = project.paths(root);
  console.log(JSON.stringify({
    profile: u.exists(p.profile), lintDir: u.exists(path.join(p.lint, 'stylelint.config.mjs')), stylelintConfigs: ex.stylelint, eslintConfigs: ex.eslint,
    hooksPath: git.getConfig(root, 'core.hooksPath'), hookFile: u.exists(path.join(root, '.githooks', 'pre-push')), gitignore: u.exists(path.join(root, '.gitignore')),
    gitignoreHasTmp: /\.ui-guard\/tmp/.test(u.readText(path.join(root, '.gitignore')) || ''), claudeMdBlock: /ui-guard:start/.test(u.readText(path.join(root, 'CLAUDE.md')) || ''),
  }, null, 2));
  return 0;
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2), ['root-stylelint', 'root-eslint', 'create', 'with-assets', 'internal']);
  u.helpExit(args, HELP);
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  if (!root) { console.error('This is not an Angular project.'); process.exit(1); }
  const cmd = args._[0];
  const fn = { lint, githook, gitignore, 'claude-md': claudeMd, status, tools }[cmd];
  if (!fn) { console.log(HELP); process.exit(0); }
  process.exitCode = fn(root, args);
}
module.exports = { existingConfigs };
