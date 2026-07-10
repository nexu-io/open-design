import { describe, expect, it } from 'vitest';
import { createVelaCliTeamProjectCatalog } from '../src/collab/vela-cli-team-projects.js';

describe('Vela CLI team-project catalog adapter', () => {
  it('maps list output into team-project DTOs', async () => {
    const catalog = createVelaCliTeamProjectCatalog({
      run: async (args) => {
        expect(args).toEqual(['list']);
        return JSON.stringify({
          projects: [
            {
              projectId: 'p1',
              ownerMemberId: 'wm-owner',
              displayName: 'Electric Studio 2',
              syncState: 'synced',
              metadata: {
                skillId: 'deck-builder',
                designSystemId: 'ds-emerald',
                createdAt: 1719820800000,
                updatedAt: 1719907200000,
                metadata: { kind: 'deck', entryFile: 'index.html' },
              },
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-02T00:00:00.000Z',
            },
          ],
        });
      },
    });

    await expect(catalog.list()).resolves.toEqual([
      {
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Electric Studio 2',
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        createdAt: 1719820800000,
        updatedAt: 1719907200000,
        metadata: { kind: 'deck', entryFile: 'index.html' },
      },
    ]);
  });

  it('hides catalog rows whose project bytes are not synced yet', async () => {
    const catalog = createVelaCliTeamProjectCatalog({
      run: async () => JSON.stringify({
        projects: [
          {
            projectId: 'pending',
            ownerMemberId: 'wm-owner',
            displayName: 'Pending Upload',
            syncState: 'pending_upload',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            projectId: 'failed',
            ownerMemberId: 'wm-owner',
            displayName: 'Failed Upload',
            syncState: 'failed',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            projectId: 'synced',
            ownerMemberId: 'wm-owner',
            displayName: 'Ready Project',
            syncState: 'synced',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    });

    await expect(catalog.list()).resolves.toEqual([
      {
        projectId: 'synced',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Ready Project',
        createdAt: Date.parse('2026-07-01T00:00:00.000Z'),
      },
    ]);
  });

  it('uses Vela team-project commands for upsert and remove', async () => {
    const calls: string[][] = [];
    const catalog = createVelaCliTeamProjectCatalog({
      run: async (args) => {
        calls.push(args);
        return '{}';
      },
    });

    await catalog.upsert({
      projectId: 'p1',
      displayName: 'Electric Studio 2',
      syncState: 'pending_upload',
      lastSyncedVersionId: 'v2',
      metadata: {
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        metadata: { kind: 'deck' },
      },
    });
    await catalog.remove('p1');

    expect(calls).toEqual([
      [
        'upsert',
        'p1',
        '--resource-id',
        'project-p1',
        '--display-name',
        'Electric Studio 2',
        '--sync-state',
        'pending_upload',
        '--last-synced-version-id',
        'v2',
        '--metadata-json',
        JSON.stringify({
          skillId: 'deck-builder',
          designSystemId: 'ds-emerald',
          metadata: { kind: 'deck' },
        }),
      ],
      ['remove', 'p1'],
    ]);
  });
});
