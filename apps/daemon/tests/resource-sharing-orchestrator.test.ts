import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { materializeRef, packTree } from '../src/resource-drive.js';
import { createSharingOrchestrator } from '../src/resource-sharing/orchestrator.js';
import { migrateResourceSharing } from '../src/resource-sharing/store.js';

const mockState = vi.hoisted(() => ({
  materializations: [] as Array<Record<string, string>>,
  versions: [{ id: 'version_1', version: 1, manifestDigest: 'digest_1' }],
}));

vi.mock('../src/integrations/resource-hub.js', () => ({
  createResourceHubClient: vi.fn(() => ({
    listVersions: vi.fn(async () => mockState.versions),
  })),
  readResourceHubPrincipal: vi.fn(() => ({
    memberId: 'member_1',
    teamId: 'team_1',
    role: 'member',
    lifecycleState: null,
  })),
}));

vi.mock('../src/resource-drive.js', () => ({
  materializeRef: vi.fn(async (_client, _principal, _resourceId, _ref, destDir) => {
    const files = mockState.materializations.shift();
    if (!files) throw new Error('missing mock materialization');
    for (const [relativePath, contents] of Object.entries(files)) {
      const target = path.join(destDir, relativePath);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, contents);
    }
  }),
  packTree: vi.fn(),
  pushTree: vi.fn(),
}));

describe('resource-sharing orchestrator', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    migrateResourceSharing(db);
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-resource-sharing-'));
    mockState.materializations = [];
    mockState.versions = [
      { id: 'version_1', version: 1, manifestDigest: 'digest_1' },
    ];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    db.close();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('replaces the team copy on repull so files deleted upstream disappear', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      },
    });
    mockState.materializations.push(
      {
        'DESIGN.md': 'v1',
        'components/Button.tsx': 'export const Button = () => null;\n',
      },
      {
        'DESIGN.md': 'v2',
        'tokens.json': '{}\n',
      },
    );

    const first = await orchestrator.pull('design_system', 'hub_design_system');
    expect(
      await fsp.readFile(
        path.join(first.dir ?? '', 'components', 'Button.tsx'),
        'utf8',
      ),
    ).toContain('Button');

    mockState.versions = [
      { id: 'version_2', version: 2, manifestDigest: 'digest_2' },
    ];
    const second = await orchestrator.pull('design_system', 'hub_design_system');

    await expect(
      fsp.access(path.join(second.dir ?? '', 'components', 'Button.tsx')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fsp.readFile(path.join(second.dir ?? '', 'DESIGN.md'), 'utf8'),
    ).resolves.toBe('v2');
    await expect(
      fsp.readFile(path.join(second.dir ?? '', 'tokens.json'), 'utf8'),
    ).resolves.toBe('{}\n');
  });

  it('rejects traversal local ids before packing a shared design system', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      },
    });

    await expect(
      orchestrator.share('design_system', '../brands'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_resource_id',
    });
    expect(packTree).not.toHaveBeenCalled();
  });

  it('rejects traversal hub ids before materializing a pulled design system', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      },
    });

    await expect(
      orchestrator.pull('design_system', '../../design-systems/hub-1'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_resource_id',
    });
    expect(materializeRef).not.toHaveBeenCalled();
  });
});
