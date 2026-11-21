'use strict';
// The four scan/fix domains. Each domain owns one rule family, its own scripts and its own files under .ui-guard/<domain>/.
//   scss   → STYLE   (Stylelint + structure/theme/token/class scripts + the STYLE-48 foundation check)
//   access → ACCESS  (ESLint template rules + access-check.js + AI)
//   lang   → LANG    (i18n script + AI)
//   safe   → SAFE    (secrets/web scripts + ESLint SAFE rules + AI)
const path = require('path');

const DOMAINS = {
  scss: {
    prefix: 'STYLE', title: 'SCSS architecture, classes and theme', rulesFile: 'rules/style.md',
    // the AXIS standard itself (rules with priorities, the review checklist, naming, stylesheet accessibility) is always read with style.md;
    // the segment document of every file in the batch is added by rulesFilesFor (axisSegmentFor)
    areaRulesFiles: ['rules/axis/guides/rules.md', 'rules/axis/guides/review-checklist.md', 'rules/axis/guides/naming-conventions.md', 'rules/axis/guides/accessibility.md'],
    segmentDocs: true,
    scripts: ['foundation', 'theme-check', 'tokens-check', 'angular-config-check', 'web-check', 'class-usage', 'structure-check'],
    lint: { stylelint: true, eslint: false },
  },
  access: {
    prefix: 'ACCESS', title: 'accessibility', rulesFile: 'rules/access.md', mvcRulesFile: 'rules/access-mvc.md',
    // the five area texts (what to detect, how to fix, the stack section, the hard rules): read together with access.md by the scan, the fixer and the reviewer
    areaRulesFiles: ['rules/access/area-1-labels.md', 'rules/access/area-2-alt.md', 'rules/access/area-3-aria.md', 'rules/access/area-4-semantics.md', 'rules/access/area-5-keyboard.md'],
    scripts: ['access-check'],
    lint: { stylelint: false, eslint: true },
  },
  lang: {
    prefix: 'LANG', title: 'translation', rulesFile: 'rules/lang.md',
    scripts: ['i18n-check'],
    lint: { stylelint: false, eslint: false },
  },
  safe: {
    prefix: 'SAFE', title: 'UI security', rulesFile: 'rules/safe.md',
    scripts: ['secrets-check', 'web-check'],
    lint: { stylelint: false, eslint: true },
  },
};
const NAMES = Object.keys(DOMAINS);

/** Rule files an agent needs for `domain` and these files: the MVC part of ACCESS only when a .cshtml / .js file is in them. */
/** The AXIS segment document that governs one stylesheet (settings, tools, generic, … utilities, theme, or the component/layout/page style of an Angular component). */
function axisSegmentFor(file) {
  const f = String(file || '').split('\\').join('/');
  if (!/\.s?css$/.test(f)) return null;
  const m = /(^|\/)(settings|tools|generic|elements|common|objects|components|layout|modules|pages|packages|utilities|theme)\//.exec(f.replace(/^src\/app\//, 'x/'));
  if (m && !/^src\/app\//.test(f)) return m[2];
  if (/^src\/app\//.test(f)) return /(^|\/)(layout|layouts|shell)[^/]*\//.test(f) ? 'layout' : /(^|\/)(pages?|features?|routes?)\//.test(f) ? 'pages' : 'components';
  return null;
}

function rulesFilesFor(name, files, pluginRoot) {
  const d = get(name);
  if (!d) return [];
  const out = [d.rulesFile, ...(d.areaRulesFiles || [])];
  if (d.segmentDocs) for (const x of new Set((files || []).map((f) => axisSegmentFor(typeof f === 'string' ? f : (f && (f.file || f.path)) || '')).filter(Boolean))) out.push(`rules/axis/segments/${x}.md`);
  if (d.mvcRulesFile && (files || []).some((f) => /.(cshtml|js)$/i.test(typeof f === 'string' ? f : (f && (f.file || f.path)) || ''))) out.push(d.mvcRulesFile);
  return pluginRoot ? out.map((r) => path.join(pluginRoot, r)) : out;
}

function get(name) {
  const d = DOMAINS[String(name || '').toLowerCase()];
  return d ? { name: String(name).toLowerCase(), ...d } : null;
}

/** Does a finding belong to the domain? LINT:* findings of Stylelint (style files) belong to scss. */
function owns(domain, f) {
  const d = typeof domain === 'string' ? get(domain) : domain;
  if (!d || !f || !f.ruleId) return false;
  const id = String(f.ruleId);
  if (id.startsWith(d.prefix + '-')) return true;
  if (d.name === 'scss' && id.startsWith('LINT:') && /\.s?css$/.test(f.file || '')) return true;
  return false;
}

/** Domain of a rule id (or null: MEDIA-xx and other families have no domain). */
function ofRule(ruleId) {
  for (const n of NAMES) if (String(ruleId).startsWith(DOMAINS[n].prefix + '-')) return n;
  return null;
}

/** Per-domain files under .ui-guard/<domain>/ and .ui-guard/tmp/<domain>/. */
function paths(root, name) {
  const ug = path.join(root, '.ui-guard');
  const dir = path.join(ug, name);
  const tmp = path.join(ug, 'tmp', name);
  return {
    dir, tmp,
    findings: path.join(dir, 'findings.json'),
    report: path.join(dir, 'report.md'),
    plan: path.join(dir, 'plan.md'),
    planJson: path.join(dir, 'plan.json'),
    baseline: path.join(dir, 'baseline.json'),
    renames: path.join(dir, 'renames.md'),
    history: path.join(dir, 'history'),
    fixes: path.join(dir, 'fixes'),
    details: path.join(dir, 'details.md'),
    needsDecision: path.join(dir, 'needs-decision.md'),
    summary: path.join(dir, 'fix-summary.md'),
    scan: path.join(tmp, 'scan'),
    fix: path.join(tmp, 'fix'),
    screens: path.join(tmp, 'screens'),
  };
}

/** Read --domain (or the first positional) and exit with the list when it is missing or unknown. */
function fromArgs(args, { required = true } = {}) {
  const raw = args.domain || null;
  if (!raw) {
    if (!required) return null;
    console.error(`--domain is required: ${NAMES.join(' | ')}`);
    process.exit(1);
  }
  const d = get(raw);
  if (!d) { console.error(`Unknown domain "${raw}". Use one of: ${NAMES.join(', ')}`); process.exit(1); }
  return d;
}

function listText() {
  return NAMES.map((n) => `  ${n.padEnd(7)} ${DOMAINS[n].prefix.padEnd(7)} ${DOMAINS[n].title}`).join('\n');
}

module.exports = { DOMAINS, NAMES, get, owns, ofRule, paths, fromArgs, listText, rulesFilesFor, axisSegmentFor };
