import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPluginInstallationHelpers } from '../../src/services/plugin-installation.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-upload-test-'));
  tempRoots.push(root);
  return root;
}

function helpersWithError(message: string) {
  return createPluginInstallationHelpers({
    db: {
      prepare: () => ({
        all: () => [],
        get: () => undefined,
        run: () => undefined,
      }),
    },
    installFromLocalFolder: async function* () {
      yield { kind: 'error', message, warnings: [] };
    },
    PLUGIN_REGISTRY_ROOTS: { userPluginsRoot: '/tmp/unused-plugin-root' },
    PLUGIN_LOCKFILE_PATH: '/tmp/unused-plugin-lock.json',
    PLUGIN_UPLOAD_MAX_BYTES: 1024,
  });
}

describe('plugin upload diagnostics', () => {
  it.each([
    ['Plugin manifest is missing', 'INVALID_MANIFEST'],
    ['Destination folder already exists', 'CONFLICT'],
  ] as const)('classifies local upload failure %s as %s', async (message, errorCode) => {
    const stagedFolder = await tempRoot();
    await mkdir(stagedFolder, { recursive: true });

    await expect(
      helpersWithError(message).finishUploadedPluginInstall(stagedFolder, 'upload:folder'),
    ).resolves.toMatchObject({ ok: false, errorCode });
  });

  it('returns a structured archive code when ZIP extraction fails', async () => {
    await expect(
      helpersWithError('unused').stageUploadedPluginZip(
        Buffer.from('not a zip archive'),
        'upload:zip:broken.zip',
      ),
    ).resolves.toMatchObject({ ok: false, errorCode: 'INVALID_ARCHIVE' });
  });
});
