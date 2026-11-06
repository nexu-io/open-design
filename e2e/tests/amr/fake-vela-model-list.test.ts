import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeFakeVelaBin } from '@/amr';

const run = promisify(execFile);

// The daemon's catalog probe (`fetchVelaRemoteModelsWithRetry`) spawns
// `vela model list --all --format json`. The fake must answer that exact argv,
// or the probe falls into the ACP loop, exits 0 with empty stdout, and every
// default run silently settles on the preset.
describe.skipIf(process.platform === 'win32')('fake vela model list', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fake-vela-model-list-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('[P1] answers the daemon catalog probe argv with the remote catalog', async () => {
    const bin = await writeFakeVelaBin(root);
    const { stdout } = await run(bin, ['model', 'list', '--all', '--format', 'json'], { env: { ...process.env, HOME: root } });
    const catalog = JSON.parse(stdout) as { source?: string; data?: unknown[] };
    expect(catalog.source).toBe('remote');
    expect(catalog.data?.length).toBeGreaterThan(0);
  });

  it('[P1] fails the daemon catalog probe argv with 401 when asked to', async () => {
    const bin = await writeFakeVelaBin(root, { failModelListInvalidApiKey: true });
    await expect(run(bin, ['model', 'list', '--all', '--format', 'json'], { env: { ...process.env, HOME: root } }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('invalid_api_key') });
  });
});
