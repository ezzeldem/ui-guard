'use strict';
// TFS / Azure DevOps Server access for the fix check (FIX-xx) — the same conventions as ui-code-review
// (common/tfs-auth.js + scm-adapters/tfs.js): the PAT is read from SONARTOOLKIT_TFS_PAT (process, else the Windows user
// environment), sent as HTTP Basic auth with an empty user name, never over http, never on a command line, never logged.
// Node built-ins only (global fetch, Node 18+). Read-only: GET requests only.
const { spawnSync } = require('child_process');

const PAT_VARIABLE = 'SONARTOOLKIT_TFS_PAT';

function readUserEnvironmentVariable(name) {
  if (process.platform !== 'win32') return '';
  const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return '';
  const m = r.stdout.match(new RegExp(`^\\s*${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, 'mi'));
  return m ? m[1].trim() : '';
}

function getPat() { return process.env[PAT_VARIABLE] || readUserEnvironmentVariable(PAT_VARIABLE) || ''; }

async function tfsJson(uri, pat) {
  if (!/^https:\/\//i.test(uri)) throw new Error(`refusing to send the PAT over http: ${uri}`);
  let res;
  try {
    res = await fetch(uri, { method: 'GET', headers: { Authorization: 'Basic ' + Buffer.from(`:${pat}`, 'ascii').toString('base64') } });
  } catch (e) {
    throw new Error(`GET ${uri} failed: ${e.message}${e.cause && e.cause.code ? ` (${e.cause.code})` : ''}`);
  }
  if (!res.ok) throw new Error(`GET ${uri} failed: (${res.status}) ${res.statusText}`);
  return res.json();
}

const esc = (s) => encodeURIComponent(s);

/** https://<server>/<collection>/<project>/_git/<repo> → { collectionUrl, project, repositoryName } or null. */
function remoteInfo(root) {
  const r = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const url = r.stdout.trim();
  const m = url.match(/^(?<collection>https:\/\/[^/]+\/[^/]+)\/(?<project>[^/]+)\/_git\/(?<repo>[^/]+?)\/?$/i);
  if (!m) return null;
  return { collectionUrl: m.groups.collection, project: decodeURIComponent(m.groups.project), repositoryName: decodeURIComponent(m.groups.repo.replace(/\.git$/i, '')) };
}

/** Work item ids linked to the active pull request whose source branch is `branch` (none → []). */
async function branchPullRequestWorkItemIds({ collectionUrl, project, repositoryName, branch, pat }) {
  const base = `${collectionUrl}/${esc(project)}/_apis/git/repositories/${esc(repositoryName)}`;
  const prs = await tfsJson(`${base}/pullrequests?searchCriteria.sourceRefName=${esc('refs/heads/' + branch)}&searchCriteria.status=active&api-version=5.0`, pat);
  const ids = new Set();
  for (const pr of (prs && prs.value) || []) {
    const wi = await tfsJson(`${base}/pullrequests/${pr.pullRequestId}/workitems?api-version=5.0`, pat);
    for (const w of (wi && wi.value) || []) if (Number.isInteger(Number(w.id))) ids.add(Number(w.id));
  }
  return [...ids];
}

const WORK_ITEM_FIELDS = ['System.WorkItemType', 'System.Title', 'System.State', 'System.Description', 'Microsoft.VSTS.TCM.ReproSteps', 'Microsoft.VSTS.Common.AcceptanceCriteria'];
async function getWorkItems({ collectionUrl, ids, pat }) {
  if (!ids || !ids.length) return [];
  const reply = await tfsJson(`${collectionUrl}/_apis/wit/workitems?ids=${ids.slice(0, 200).join(',')}&fields=${WORK_ITEM_FIELDS.join(',')}&errorPolicy=omit&api-version=5.0`, pat);
  const s = (v) => (v == null ? '' : String(v));
  return ((reply && reply.value) || []).filter((w) => w && w.fields).map((w) => ({
    id: w.id, type: s(w.fields['System.WorkItemType']), title: s(w.fields['System.Title']), state: s(w.fields['System.State']),
    description: s(w.fields['System.Description']), reproSteps: s(w.fields['Microsoft.VSTS.TCM.ReproSteps']), acceptanceCriteria: s(w.fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
  }));
}

/** Work item HTML (TFS rich text) to plain text, keeping line and list structure. */
function htmlToText(html) {
  return String(html || '')
    .replace(/\r/g, '')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/tr|\/ul|\/ol)\s*\/?>/gi, '\n')
    .replace(/<\s*(p|div|h[1-6]|tr)(\s[^>]*)?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/(td|th)\s*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/gi, '&')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Repro steps often carry test logins: the value after a password / token / secret label is replaced.
const SECRET_LABEL = /((?:password|passwd|pwd|pass|otp|pin|token|secret|api[-_ ]?key|كلمة\s*(?:ال)?مرور|كلمة\s*السر|الرقم\s*السري|رمز\s*التحقق)\s*[:：=]\s*)\S+/giu;
function redactSecrets(text) { return String(text).replace(SECRET_LABEL, '$1[redacted]'); }

function workItemMarkdown(wi) {
  const section = (name, html) => { const t = redactSecrets(htmlToText(html)); return t ? [`## ${name}`, '', t, ''] : []; };
  return [`# ${wi.type} ${wi.id}: ${wi.title}`, '', `State: ${wi.state || 'unknown'}`, '',
    ...section('Description', wi.description), ...section('Repro steps', wi.reproSteps), ...section('Acceptance criteria', wi.acceptanceCriteria)].join('\n');
}

const FIX_WORK_ITEM_TYPES = /^(bug|user story|product backlog item|requirement)$/i;

module.exports = { PAT_VARIABLE, getPat, remoteInfo, branchPullRequestWorkItemIds, getWorkItems, htmlToText, redactSecrets, workItemMarkdown, FIX_WORK_ITEM_TYPES };
if (require.main === module) console.log('tfs.js — read-only TFS / Azure DevOps Server helpers for the fix check (library).');
