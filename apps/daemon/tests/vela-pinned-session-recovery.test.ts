import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { cleanupAbandonedPinnedVelaSessions } from '../src/collab/vela-pinned-command.js';

it('cleans a SIGKILLed config owner, preserving live owners, unknown directories and symlink targets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-owner-recovery-'));
  const child = fork(path.join(import.meta.dirname, 'fixtures/pinned-vela-owner.ts'), [root], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = once(child, 'exit');
  try {
    const message = once(child, 'message');
    const ready = await Promise.race([message, exited.then(() => { throw new Error('owner exited before config creation'); })]);
    const home = (ready[0] as { home: string }).home;
    expect(path.basename(home)).toMatch(new RegExp(`^vela-session-v1-${child.pid}-[A-Za-z0-9]{6}$`));
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8')).profiles.test.controlKey).toBe('synthetic-only');
    expect(await cleanupAbandonedPinnedVelaSessions(root)).toMatchObject({ removed: 0, failed: 0 });
    expect(await readdir(root)).toContain(path.basename(home));
    child.kill('SIGKILL');
    expect((await exited)[1]).toBe('SIGKILL');
    const old = path.join(root, 'vela-session-legacy'); await mkdir(old);
    const outside = path.join(root, 'not-a-session'); await mkdir(outside); await writeFile(path.join(outside, 'keep'), 'safe');
    if (process.platform !== 'win32') await symlink(outside, path.join(root, `vela-session-v1-${child.pid}-ABC123`));
    expect(await cleanupAbandonedPinnedVelaSessions(root)).toEqual({ removed: 1, failed: 0 });
    expect(await readdir(root)).not.toContain(path.basename(home));
    expect(await readFile(path.join(outside, 'keep'), 'utf8')).toBe('safe');
    expect(await readdir(root)).toContain('vela-session-legacy');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});
it('rejects relative cleanup roots', async () => {
  await expect(cleanupAbandonedPinnedVelaSessions('relative')).rejects.toThrow();
});
