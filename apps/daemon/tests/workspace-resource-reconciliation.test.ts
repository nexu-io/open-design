// Shared #6528 recovery primitives (workspace-resource-reconciliation.ts).
//
// `reconcileUnboundResources` is the adoption path used by the plugin, skill
// and design-system catalogs; `repairCreatorlessPersonalBindings` fixes rows a
// writer left with no creator, which the personal branch of every visibility
// check treats as permanently unreachable.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';
import {
  reconcileUnboundResources,
  reconcileWorkspaceResourceBindings,
  repairCreatorlessPersonalBindings,
} from '../src/workspace-resource-reconciliation.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ws-resource-reconcile-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

const WS = 'ws-1';
const MEMBER = 'member-a';

describe('reconcileUnboundResources', () => {
  it('binds unbound ids as personal resources of the authenticated member', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    expect(reconcileUnboundResources(db, {
      resourceType: 'skill',
      resourceIds: ['legacy-a', 'legacy-b'],
      workspaceId: WS,
      workspaceMemberId: MEMBER,
    })).toBe(2);

    for (const id of ['legacy-a', 'legacy-b']) {
      const binding = getWorkspaceResourceByResourceId(db, 'skill', id);
      expect(binding?.workspaceId).toBe(WS);
      expect(binding?.visibility).toBe('personal');
      expect(binding?.resourceState).toBe('active');
      expect(binding?.createdByWorkspaceMemberId).toBe(MEMBER);
    }
  });

  it('works across resource types without collision', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // Same id under two resource types is legal — the primary key is the pair.
    reconcileUnboundResources(db, {
      resourceType: 'skill', resourceIds: ['shared-id'], workspaceId: WS, workspaceMemberId: MEMBER,
    });
    reconcileUnboundResources(db, {
      resourceType: 'design_system', resourceIds: ['shared-id'], workspaceId: WS, workspaceMemberId: MEMBER,
    });

    expect(getWorkspaceResourceByResourceId(db, 'skill', 'shared-id')?.workspaceId).toBe(WS);
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'shared-id')?.workspaceId).toBe(WS);
  });

  it('is idempotent and never re-claims a resource bound to another workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const input = { resourceType: 'plugin', resourceIds: ['legacy'], workspaceId: WS, workspaceMemberId: MEMBER };

    expect(reconcileUnboundResources(db, input)).toBe(1);
    expect(reconcileUnboundResources(db, input)).toBe(0);
    expect(reconcileUnboundResources(db, {
      ...input, workspaceId: 'ws-2', workspaceMemberId: 'member-b',
    })).toBe(0);

    const binding = getWorkspaceResourceByResourceId(db, 'plugin', 'legacy');
    expect(binding?.workspaceId).toBe(WS);
    expect(binding?.createdByWorkspaceMemberId).toBe(MEMBER);
  });

  it('leaves a tombstoned binding terminal', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'skill', WS, 'retired', { createdByWorkspaceMemberId: MEMBER });
    updateWorkspaceResource(db, 'skill', WS, 'retired', { resourceState: 'deleted' });

    expect(reconcileUnboundResources(db, {
      resourceType: 'skill', resourceIds: ['retired'], workspaceId: WS, workspaceMemberId: MEMBER,
    })).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'retired')?.resourceState).toBe('deleted');
  });

  it('requires BOTH a verified workspace id and member id', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const ids = ['legacy'];

    expect(reconcileUnboundResources(db, { resourceType: 'skill', resourceIds: ids, workspaceId: null, workspaceMemberId: null })).toBe(0);
    expect(reconcileUnboundResources(db, { resourceType: 'skill', resourceIds: ids, workspaceId: WS, workspaceMemberId: null })).toBe(0);
    expect(reconcileUnboundResources(db, { resourceType: 'skill', resourceIds: ids, workspaceId: WS, workspaceMemberId: '  ' })).toBe(0);
    expect(reconcileUnboundResources(db, { resourceType: 'skill', resourceIds: ids, workspaceId: '', workspaceMemberId: MEMBER })).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'legacy')).toBeUndefined();
  });

  it('ignores blank ids', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    expect(reconcileUnboundResources(db, {
      resourceType: 'skill', resourceIds: ['', '   '], workspaceId: WS, workspaceMemberId: MEMBER,
    })).toBe(0);
  });
});

describe('repairCreatorlessPersonalBindings', () => {
  it('adopts a personal binding whose creator column is empty', () => {
    // Observed in the wild: a design system with a correct workspace_id,
    // visibility and resource_state but no creator was invisible to its own
    // author, because `creatorId && callerId && creatorId === callerId` can
    // never be true with an empty creator.
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'design_system', WS, 'user:orphan', {
      visibility: 'personal',
      resourceState: 'active',
    });
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:orphan')?.createdByWorkspaceMemberId ?? '').toBe('');

    expect(repairCreatorlessPersonalBindings(db, {
      resourceType: 'design_system', resourceIds: ['user:orphan'], workspaceId: WS, workspaceMemberId: MEMBER,
    })).toBe(1);

    const binding = getWorkspaceResourceByResourceId(db, 'design_system', 'user:orphan');
    expect(binding?.createdByWorkspaceMemberId).toBe(MEMBER);
    expect(binding?.workspaceId).toBe(WS);
    expect(binding?.visibility).toBe('personal');
  });

  it('never transfers ownership away from an existing creator', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'skill', WS, 'owned', { createdByWorkspaceMemberId: 'member-owner' });

    expect(repairCreatorlessPersonalBindings(db, {
      resourceType: 'skill', resourceIds: ['owned'], workspaceId: WS, workspaceMemberId: MEMBER,
    })).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'owned')?.createdByWorkspaceMemberId).toBe('member-owner');
  });

  it('ignores rows bound to another workspace, Team rows and tombstones', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'skill', 'ws-other', 'elsewhere', {});
    ensureWorkspaceResource(db, 'skill', WS, 'team-row', { visibility: 'team' });
    ensureWorkspaceResource(db, 'skill', WS, 'dead-row', {});
    updateWorkspaceResource(db, 'skill', WS, 'dead-row', { resourceState: 'deleted' });

    expect(repairCreatorlessPersonalBindings(db, {
      resourceType: 'skill',
      resourceIds: ['elsewhere', 'team-row', 'dead-row'],
      workspaceId: WS,
      workspaceMemberId: MEMBER,
    })).toBe(0);

    expect(getWorkspaceResourceByResourceId(db, 'skill', 'elsewhere')?.createdByWorkspaceMemberId ?? '').toBe('');
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'team-row')?.visibility).toBe('team');
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'dead-row')?.resourceState).toBe('deleted');
  });
});

describe('reconcileWorkspaceResourceBindings', () => {
  it('binds missing rows and repairs creatorless ones in one pass', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'skill', WS, 'creatorless', { visibility: 'personal' });

    const result = reconcileWorkspaceResourceBindings(db, {
      resourceType: 'skill',
      resourceIds: ['creatorless', 'unbound'],
      workspaceId: WS,
      workspaceMemberId: MEMBER,
    });

    expect(result).toEqual({ adopted: 1, repaired: 1 });
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'unbound')?.createdByWorkspaceMemberId).toBe(MEMBER);
    expect(getWorkspaceResourceByResourceId(db, 'skill', 'creatorless')?.createdByWorkspaceMemberId).toBe(MEMBER);
  });

  it('consumes a one-shot iterable safely for both passes', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    function* ids() { yield 'gen-a'; yield 'gen-b'; }

    const result = reconcileWorkspaceResourceBindings(db, {
      resourceType: 'plugin', resourceIds: ids(), workspaceId: WS, workspaceMemberId: MEMBER,
    });

    expect(result.adopted).toBe(2);
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'gen-b')?.workspaceId).toBe(WS);
  });
});
