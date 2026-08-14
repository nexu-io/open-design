import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { waitForLazyVelaRuntime } from '../../src/integrations/vela-runtime.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe('lazy packaged Vela runtime', () => {
  it('waits for the Closure resource destination to become executable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-vela-runtime-'));
    roots.push(root);
    const binary = join(root, process.platform === 'win32' ? 'vela.exe' : 'vela');
    const pending = waitForLazyVelaRuntime({
      OD_VELA_RUNTIME_LAZY: '1',
      VELA_BIN: binary,
    }, { pollMs: 5, timeoutMs: 1_000 });
    await writeFile(binary, 'vela');
    if (process.platform !== 'win32') await chmod(binary, 0o755);

    await expect(pending).resolves.toBeUndefined();
  });

  it('does not delay ordinary missing user overrides', async () => {
    await expect(waitForLazyVelaRuntime({ VELA_BIN: '/missing/vela' }, {
      pollMs: 1,
      timeoutMs: 1,
    })).resolves.toBeUndefined();
  });
});
