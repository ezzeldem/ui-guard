#!/usr/bin/env node
'use strict';
// §8.3 Dev server: port check, start `ng serve`, wait until it responds, stop ONLY the process tree it started.
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const u = require('./lib/util');
const project = require('./lib/project');
const lint = require('./lib/lint');

const HELP = `dev-server.js — §8.3
Usage:
  node dev-server.js check-port <port>            prints "free" or "busy" (exit 0 / 3)
  node dev-server.js wait <url> [--timeout 180]    wait until the URL responds (exit 0) or time out (exit 1)
  node dev-server.js start [--port <p>] [--root <dir>] [--timeout 180]
        starts \`ng serve --port <p>\` in the background (project's own @angular/cli), records the PID in
        .ui-guard/tmp/dev-server.json, waits until http://localhost:<p>/ responds.
  node dev-server.js stop [--root <dir>]           stops ONLY the process tree recorded by start (never anything else).
  node dev-server.js status [--root <dir>]`;

function checkPort(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    sock.setTimeout(1500);
    sock.on('connect', () => { sock.destroy(); resolve('busy'); });
    sock.on('timeout', () => { sock.destroy(); resolve('free'); });
    sock.on('error', () => resolve('free'));
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 5000, rejectUnauthorized: false }, (res) => { res.resume(); resolve(res.statusCode > 0 && res.statusCode < 500); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitFor(url, timeoutSec) {
  const end = Date.now() + timeoutSec * 1000;
  while (Date.now() < end) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function stateFile(root) { return path.join(project.paths(root).tmp, 'dev-server.json'); }

async function start(root, port, timeoutSec) {
  const bin = lint.resolveBin(root, '@angular/cli', 'ng');
  if (!bin) throw new Error('@angular/cli is not installed in this project (node_modules). Install the project dependencies yourself first.');
  if ((await checkPort(port)) === 'busy') { console.log(`Port ${port} is in use — ask the developer: is that the app? Use it, or start on another port?`); process.exit(3); }
  const logFile = path.join(project.paths(root).tmp, 'dev-server.log');
  u.mkdirp(path.dirname(logFile));
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [bin, 'serve', '--port', String(port)], { cwd: root, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  const url = `http://localhost:${port}/`;
  u.writeJSON(stateFile(root), { pid: child.pid, port, url, startedAt: new Date().toISOString(), startedByUiGuard: true, log: u.relPosix(root, logFile) });
  const ok = await waitFor(url, timeoutSec);
  if (!ok) { console.log(`Dev server did not respond within ${timeoutSec}s. PID ${child.pid}. Log: ${u.relPosix(root, logFile)}`); process.exit(1); }
  console.log(`dev server up: ${url} (PID ${child.pid}, started by ui-guard)`);
}

function stop(root) {
  const st = u.readJSON(stateFile(root));
  if (!st || !st.startedByUiGuard || !st.pid) { console.log('No dev server started by ui-guard — nothing stopped.'); return; }
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(st.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-st.pid, 'SIGTERM'); } catch { try { process.kill(st.pid, 'SIGTERM'); } catch { /* already gone */ } } }
  fs.unlinkSync(stateFile(root));
  console.log(`stopped the dev server ui-guard started (PID ${st.pid} and its children only).`);
}

if (require.main === module) {
  const args = u.parseArgs(process.argv.slice(2));
  u.helpExit(args, HELP);
  const cmd = args._[0];
  const root = args.root ? path.resolve(args.root) : project.findRoot();
  (async () => {
    if (cmd === 'check-port') { const r = await checkPort(+args._[1] || 4200); console.log(r); process.exit(r === 'free' ? 0 : 3); }
    if (cmd === 'wait') { const ok = await waitFor(args._[1], +args.timeout || 180); console.log(ok ? 'up' : 'timeout'); process.exit(ok ? 0 : 1); }
    if (!root) { console.error('Not an Angular project.'); process.exit(1); }
    if (cmd === 'start') { const prof = project.readProfile(root); await start(root, +args.port || (prof.devServer && prof.devServer.port) || 4200, +args.timeout || 180); return; }
    if (cmd === 'stop') return stop(root);
    if (cmd === 'status') { console.log(JSON.stringify(u.readJSON(stateFile(root)) || { running: false })); return; }
    console.log(HELP);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { checkPort, ping, waitFor };
