import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOpenCodeEditBaseDirs } from '../../src/runtimes/opencode-permissions.js';
import * as invocation from '../../src/runtimes/invocation.js';

// HTTP launch coverage lives with the isolated public-run fixtures in
// od-next-automatic-simple-server.test.ts, including ordinary/BYOK failures.
describe('OpenCode resource edit base', () => {
  let fixtureDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (fixtureDir) {
      await chmod(path.join(fixtureDir, 'locked'), 0o755).catch(() => {});
      await rm(fixtureDir, { recursive: true, force: true });
    }
    fixtureDir = undefined;
  });

  it('covers the volume root outside Git and the enclosing worktree inside it', async () => {
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'od-profile-worktree-'));
    const outside = await resolveOpenCodeEditBaseDirs(fixtureDir);
    expect(outside.dirs).toContain(path.parse(fixtureDir).root);
    execFileSync('git', ['init', '--quiet', fixtureDir]);
    const nested = path.join(fixtureDir, 'nested');
    await mkdir(nested);
    const inside = await resolveOpenCodeEditBaseDirs(nested);
    expect(inside.gitProbe).toBe('resolved');
    expect(inside.dirs).toContain(await realpath(fixtureDir));
    expect(inside.dirs).toContain(path.parse(fixtureDir).root);
  });

  // Windows packaged QA W03: `git rev-parse` was killed by its 2 s timeout.
  it.each([
    ['times out', Object.assign(new Error('Command failed: git rev-parse --show-toplevel'), { killed: true, signal: 'SIGTERM', stderr: '' })],
    ['is missing', Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })],
  ])('still finds the worktree on disk when Git %s', async (_label, failure) => {
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'od-profile-worktree-'));
    execFileSync('git', ['init', '--quiet', fixtureDir]);
    const nested = path.join(fixtureDir, 'nested');
    await mkdir(nested);
    vi.spyOn(invocation, 'execAgentFile').mockRejectedValueOnce(failure);
    const resolved = await resolveOpenCodeEditBaseDirs(nested);
    expect(resolved.gitProbe).toBe('failed');
    expect(resolved.gitProbeError).toBe(failure.message);
    expect(resolved.dirs).toContain(await realpath(fixtureDir));
    expect(resolved.dirs).toContain(path.parse(fixtureDir).root);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves the edit base unconfirmed when an ancestor cannot be checked',
    async () => {
      fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'od-profile-worktree-'));
      const inner = path.join(fixtureDir, 'locked', 'inner');
      await mkdir(inner, { recursive: true });
      await chmod(path.join(fixtureDir, 'locked'), 0o000);
      await expect(resolveOpenCodeEditBaseDirs(inner)).rejects.toMatchObject({ code: 'EACCES' });
    },
  );
});
