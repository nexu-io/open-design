#!/usr/bin/env node
// Launcher for `pnpm run dev:all`.
//
// Probes for free ports for the daemon (OD_PORT, default 7456) and the
// Next.js dev server (NEXT_PORT, default 3000) before spawning the workspace
// apps, so a stray process holding either port doesn't kill the
// whole boot. The resolved ports are exported into the child env, which
// means:
//   * the daemon's cli.js sees the new OD_PORT and binds to it
//   * apps/web/next.config.ts reads the same OD_PORT and proxies /api, /artifacts,
//     /frames to the daemon's actual port
//   * Next.js binds to NEXT_PORT (we pass `-p $NEXT_PORT` to the web package
//     dev script so it can stay parameter-free for the common single-process
//     case where the user runs just `pnpm dev`)
//
// If a port is busy we walk forward up to PORT_SEARCH_RANGE steps and log
// the switch so the user notices.

import { spawn } from 'node:child_process';
import { findFreePort } from './resolve-dev-ports.mjs';

const desiredDaemon = Number(process.env.OD_PORT) || 7456;
const desiredNext = Number(process.env.NEXT_PORT) || 3000;
const strictDaemonPort = process.env.OD_PORT_STRICT === '1';
const strictNextPort = process.env.NEXT_PORT_STRICT === '1';

const daemonPort = strictDaemonPort
  ? desiredDaemon
  : await findFreePort(desiredDaemon, 'daemon');
const nextPort = strictNextPort
  ? desiredNext
  : await findFreePort(desiredNext, 'next');

if (daemonPort !== desiredDaemon) {
  console.log(
    `[dev:all] daemon port ${desiredDaemon} is busy, switching to ${daemonPort}`,
  );
}
if (nextPort !== desiredNext) {
  console.log(
    `[dev:all] next port ${desiredNext} is busy, switching to ${nextPort}`,
  );
}

const env = {
  ...process.env,
  OD_PORT: String(daemonPort),
  NEXT_PORT: String(nextPort),
  PORT: String(nextPort),
};

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const children = [
  spawn(packageManager, ['--filter', '@open-design/daemon', 'daemon'], {
    env,
    stdio: 'inherit',
  }),
  spawn(packageManager, ['--filter', '@open-design/web', 'dev', '-p', String(nextPort)], {
    env,
    stdio: 'inherit',
  }),
];

let shuttingDown = false;

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren(signal || 'SIGTERM');
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    shuttingDown = true;
    stopChildren(sig);
  });
}
