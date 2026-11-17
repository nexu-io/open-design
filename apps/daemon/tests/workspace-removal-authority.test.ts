import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
import { createWorkspaceDirectoryAuthorityBroker, fetchVelaWorkspaceDirectory } from '../src/collab/vela-workspace-context.js';
import { cancelRevokedWorkspaceRuns, createWorkspaceMembershipRevocationObserver } from '../src/collab/cancel-revoked-workspace-runs.js';

const session = { profile: 'test', apiUrl: 'https://vela.example', controlKey: 'test-control-key', user: null, configMtimeMs: null };
const member = (workspaceId: string): WorkspaceDirectoryItem => ({ workspaceId, workspaceName: workspaceId, workspaceMemberId: `member-${workspaceId}`, workspaceType: 'team', role: 'member', memberStatus: 'active', lifecycleState: 'active' });

describe('membership cancellation through accepted directory authority', () => {
  it.each([401, 403, 'network', 'missing-items', 'invalid-row'] as const)(
    'does not cancel for %s but still detects a subsequent successful complete revocation snapshot', async (failure) => {
      let next: 'initial' | 'failure' | 'removed' = 'initial';
      const affected = { workspaceScope: { workspaceId: 'a', workspaceMemberId: 'member-a' } };
      const unrelated = { workspaceScope: { workspaceId: 'b', workspaceMemberId: 'member-b' } };
      const cancel = vi.fn(async (_run: unknown) => undefined);
      const cancellations: Promise<void>[] = [];
      const observer = createWorkspaceMembershipRevocationObserver((workspaceId, memberId) => {
        cancellations.push(cancelRevokedWorkspaceRuns({ list: () => [affected, unrelated], cancel }, workspaceId, memberId));
      });
      const fetch: typeof globalThis.fetch = async () => {
        if (next === 'initial') return Response.json({ items: [member('a'), member('b')] });
        if (next === 'removed') return Response.json({ items: [member('b')] });
        if (failure === 'network') throw new TypeError('offline');
        if (failure === 'missing-items') return Response.json({});
        if (failure === 'invalid-row') return Response.json({ items: [member('b'), { workspaceId: 'a' }] });
        return Response.json({ error: 'unauthorized' }, { status: failure });
      };
      const broker = createWorkspaceDirectoryAuthorityBroker({
        identityKey: () => 'account',
        fetchDirectory: () => fetchVelaWorkspaceDirectory({ fetch, readSession: () => session }),
        onAcceptedResult: (result, identity) => observer.observe(identity, 'account', result),
      });
      expect((await broker.fresh()).ok).toBe(true);
      next = 'failure';
      expect((await broker.fresh()).ok).toBe(false);
      expect(cancel).not.toHaveBeenCalled();
      next = 'removed';
      expect((await broker.fresh()).ok).toBe(true);
      await Promise.all(cancellations);
      expect(cancel).toHaveBeenCalledExactlyOnceWith(affected, 'project_cleanup');
    },
  );
});
