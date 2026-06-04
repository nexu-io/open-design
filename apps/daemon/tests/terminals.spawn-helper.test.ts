import fs from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createTerminalService,
  ensureSpawnHelperExecutable,
  spawnHelperCandidatePaths,
} from '../src/terminals.js';

/**
 * Regression for the "无法启动终端会话" / "Could not start the terminal session"
 * report: pnpm unpacks node-pty's prebuilt `spawn-helper` without the execute
 * bit, so the first `pty.spawn()` dies with "posix_spawnp failed." and the
 * launcher toast fires. `terminals.create()` must self-heal that bit so a fresh
 * PTY actually spawns.
 *
 * macOS/Linux only — on win32 ConPTY has no spawn-helper and there is nothing to
 * repair (`spawnHelperCandidatePaths()` is empty there).
 */
const helperPath = spawnHelperCandidatePaths().find((p) => fs.existsSync(p)) ?? null;
const describeIfHelper = helperPath ? describe : describe.skip;

describeIfHelper('terminal spawn-helper executable repair', () => {
  afterEach(() => {
    // Leave the shared node_modules artifact executable regardless of outcome,
    // so a failure here can't cascade into every other terminal test.
    if (helperPath) ensureSpawnHelperExecutable();
  });

  it('spawns a PTY even when the prebuilt spawn-helper lost its +x bit', async () => {
    // Reproduce the post-`pnpm install` state: helper present but mode 0644.
    fs.chmodSync(helperPath!, 0o644);
    expect(fs.statSync(helperPath!).mode & 0o111).toBe(0);

    const terminals = createTerminalService();
    const session = await terminals.create({
      projectId: 'p-spawn-helper',
      cwd: process.cwd(),
    });

    try {
      expect(session.status).toBe('running');
      expect(typeof session.pty.pid).toBe('number');
      // The repair ran as part of create() → loadPty().
      expect(fs.statSync(helperPath!).mode & 0o100).not.toBe(0);
    } finally {
      terminals.kill(session, 'SIGTERM');
    }
  });
});
