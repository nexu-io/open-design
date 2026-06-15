/**
 * Agent probes (model-list / version / help / auth) must NOT inherit the daemon
 * process cwd. Some agent CLIs are bun-based (OpenCode) and run `bun install` on
 * startup in their working directory; when the daemon is launched from a pnpm
 * workspace (a dev checkout), an `opencode models` probe inheriting that cwd
 * dropped a workspace `bun.lock` + `node_modules/.bun` over the repo and wiped
 * its pnpm store. `execAgentFile` defaults probes to a neutral temp cwd; this
 * pins that behaviour (red on the pre-fix `inherit daemon cwd` path).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { execAgentFile } from '../../src/runtimes/invocation.js';

const PRINT_CWD = 'process.stdout.write(process.cwd())';
// `process.cwd()` reports the realpath, while os.tmpdir() / mkdtemp can sit
// behind symlinks (e.g. macOS `/tmp` → `/private/tmp`). Compare realpaths.
const real = (p: string) => fs.realpathSync(p);

describe('execAgentFile cwd isolation', () => {
  it('defaults to a neutral cwd (OS temp dir), not the daemon process cwd', async () => {
    const { stdout } = await execAgentFile(process.execPath, ['-e', PRINT_CWD]);
    const childCwd = real(String(stdout).trim());

    expect(childCwd).toBe(real(os.tmpdir()));
    // The daemon test runs from the package dir; the probe must not inherit it.
    expect(childCwd).not.toBe(real(process.cwd()));
  });

  it('still honors an explicit cwd when the caller provides one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-agent-cwd-'));
    try {
      const { stdout } = await execAgentFile(process.execPath, ['-e', PRINT_CWD], { cwd: dir });
      expect(real(String(stdout).trim())).toBe(real(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
