import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
} from '@open-design/closure-proto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateBrokenClosureSuccessor,
  readPackagedClosureFixtureRuntime,
  resetPackagedClosureFixture,
  seedPackagedClosureFixture,
} from '@/vitest/packaged-closure-fixture';

vi.mock('extract-zip', () => ({
  default: async (_archivePath: string, options: { dir: string }) => {
    const entryPath = join(options.dir, CLOSURE_ARCHIVE_ENTRY_PATH);
    await mkdir(dirname(entryPath), { recursive: true });
    await writeFile(entryPath, 'export const fixture = true;\n', 'utf8');
  },
}));

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe('packaged Closure release fixture', () => {
  it('materializes one committed binding and never retains launch history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-e2e-closure-fixture-'));
    roots.push(root);
    const buildRoot = join(root, 'build');
    const installationRoot = join(root, 'runtime', 'mac');
    const archive = Buffer.from('fixture archive');
    const archivePath = join(buildRoot, 'closure.zip');
    const inventoryPath = join(buildRoot, 'inventory.json');
    const manifestPath = join(buildRoot, 'manifest.json');
    const buildJsonPath = join(buildRoot, 'closure.json');
    const entryContents = 'export const fixture = true;\n';
    const inventory = {
      files: [{
        digest: digest(entryContents),
        path: CLOSURE_ARCHIVE_ENTRY_PATH,
        size: Buffer.byteLength(entryContents),
      }],
      schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
    };
    const manifest = {
      artifact: {
        digest: digest(archive),
        entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
        inventoryDigest: digest(JSON.stringify(inventory.files)),
        mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
        size: archive.byteLength,
        url: 'https://releases.open-design.test/beta/versions/0.18.0-beta.4/closure.zip',
      },
      compatibility: { shell: { electron: { version: { min: '0.16.2' } } } },
      identity: {
        channel: 'beta',
        digest: digest(archive),
        platform: 'darwin-arm64',
        protocolVersion: CLOSURE_PROTOCOL_VERSION,
        version: '0.18.0-beta.4',
      },
      schemaVersion: CLOSURE_SCHEMA_VERSION,
    };
    await mkdir(buildRoot, { recursive: true });
    await Promise.all([
      writeFile(archivePath, archive),
      writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8'),
      writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
      writeFile(buildJsonPath, `${JSON.stringify({
        archivePath,
        inventoryPath,
        manifest,
        manifestPath,
      }, null, 2)}\n`, 'utf8'),
    ]);

    const fixture = await seedPackagedClosureFixture({
      buildJsonPath,
      channel: 'beta',
      expectedPlatform: 'darwin-arm64',
      installationRoot,
      namespace: 'release-beta',
      workspaceRoot: root,
    });
    expect((await readPackagedClosureFixtureRuntime(fixture)).committed).toEqual({
      releaseVersion: fixture.manifest.identity.version,
      standalone: fixture.pointer,
    });
    expect(await readFile(join(fixture.versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), 'utf8'))
      .toBe(entryContents);

    const successor = await activateBrokenClosureSuccessor(fixture);
    expect(successor.manifest.identity.version).toBe('0.18.0-beta.5');
    expect((await readPackagedClosureFixtureRuntime(fixture)).committed).toEqual({
      releaseVersion: successor.manifest.identity.version,
      standalone: successor.pointer,
    });
    expect(await readFile(join(successor.versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), 'utf8'))
      .toContain('damaged Closure successor');

    await resetPackagedClosureFixture({ channel: 'beta', installationRoot, namespace: 'release-beta' });
    expect((await readPackagedClosureFixtureRuntime(fixture)).committed).toBeNull();
  });
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
