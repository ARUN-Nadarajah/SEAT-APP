#!/usr/bin/env node
/**
 * SEAT dev launcher — starts the backend API and the Expo app together.
 *
 *   npm run dev         backend (:5000) + Expo dev tools
 *   npm run dev:web     backend (:5000) + Expo web (:8081)
 *
 * Output from each process is prefixed with [api] / [app]. Ctrl+C (or the
 * exit of either process) stops the pair, so a half-running stack never
 * hides an error. The two startup failures we have actually hit —
 * EADDRINUSE and an unreachable MongoDB — print an actionable hint once.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const wantWeb = process.argv.includes('--web');

/** Mirror environment.js: an exported PORT wins (invalid/0 → 5000),
 *  otherwise backend/.env decides (PORT=5001 there, for example). */
function apiPort() {
  if (process.env.PORT !== undefined) {
    const parsed = Number.parseInt(process.env.PORT, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 5000;
  }
  try {
    const match = require('fs')
      .readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8')
      .match(/^PORT\s*=\s*(\d+)/m);
    return match ? Number.parseInt(match[1], 10) : 5000;
  } catch {
    return 5000;
  }
}
const API_PORT = apiPort();

/** @type {{ child: import('child_process').ChildProcess, label: string }[]} */
const children = [];
const hinted = new Set();
let shuttingDown = false;

function hintOnce(key, message) {
  if (hinted.has(key)) return;
  hinted.add(key);
  console.log(`[hint] ${message}`);
}

function printHint(label, line) {
  if (label !== 'api') return;
  if (line.includes('EADDRINUSE')) {
    hintOnce(
      'port',
      `Port ${API_PORT} is already in use — another backend is still running. Stop it first (Windows: taskkill /PID <pid> /F) or change PORT in backend/.env and update EXPO_PUBLIC_API_URL.`
    );
  } else if (
    line.includes('Continuing without a database connection') ||
    line.includes('buffering timed out')
  ) {
    hintOnce(
      'mongo',
      'MongoDB is unreachable (even after the automatic public-DNS retry). Check MONGODB_URI in backend/.env and your internet connection — Atlas needs network access; a local fallback is MONGODB_URI="mongodb://127.0.0.1:27017/seat-app".'
    );
  } else if (line.includes('retrying with public DNS')) {
    hintOnce('dns', 'Local DNS blocks SRV lookups — retrying through 8.8.8.8 / 1.1.1.1.');
  } else if (line.includes('API + Socket.IO running')) {
    hintOnce('up', `Verify the API with: curl http://localhost:${API_PORT}/health`);
  }
}

/** Pipe a child's output line-by-line, prefixed with its label. */
function pipe(label, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep an unfinished trailing line for the next chunk
    for (const line of lines) {
      if (!line.trim()) continue;
      console.log(`[${label}] ${line}`);
      printHint(label, line);
    }
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.killed) return;
  if (IS_WIN) {
    // shell:true means npm/node are grandchildren — kill the whole tree
    spawn(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }).on('error', () => {});
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) stopChild(child);
  setTimeout(() => process.exit(code), 700);
}

function launch(label, command, cwd) {
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  pipe(label, child.stdout);
  pipe(label, child.stderr);
  child.on('error', (err) => {
    console.error(`[${label}] failed to start: ${err.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    console.log(`[${label}] stopped${signal ? ` (${signal})` : ` (code ${code})`}`);
    if (!shuttingDown) shutdown(code || 0);
  });
  children.push({ child, label });
}

console.log('SEAT dev launcher');
console.log(`  API   http://localhost:${API_PORT}  (health: /health)`);
console.log(`  App   ${wantWeb ? 'http://localhost:8081' : 'Expo dev tools — press a / i / w, or scan with Expo Go'}`);
console.log('  Ctrl+C stops both.\n');

launch('api', 'npm run dev', path.join(ROOT, 'backend'));
launch('app', wantWeb ? 'npm run web' : 'npm start', path.join(ROOT, 'mobile'));

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
