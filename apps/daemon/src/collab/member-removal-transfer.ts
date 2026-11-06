import type Database from 'better-sqlite3';
import { readVelaControlApiContext } from '../integrations/vela.js';

export interface MemberRemovalTransfer {
  workspaceId: string;
  removedMemberId: string;
  ownerMemberId: string;
  removedAt: string;
}

export interface MemberRemovalTransferSource {
  list(workspaceId: string): Promise<MemberRemovalTransfer[]>;
}

function parseTransferRows(body: unknown, workspaceId: string): MemberRemovalTransfer[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { removals?: unknown }).removals)) {
    throw new Error('invalid member removal transfer response');
  }
  const rows = (body as { removals: unknown[] }).removals;
  const seen = new Set<string>();
  return rows.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('invalid member removal transfer');
    const row = value as Record<string, unknown>;
    const removedAt = typeof row.removedAt === 'string' ? Date.parse(row.removedAt) : NaN;
    if (
      row.workspaceId !== workspaceId
      || typeof row.removedMemberId !== 'string' || !row.removedMemberId.trim()
      || typeof row.ownerMemberId !== 'string' || !row.ownerMemberId.trim()
      || row.removedMemberId === row.ownerMemberId
      || !Number.isFinite(removedAt)
      || seen.has(row.removedMemberId)
    ) {
      throw new Error('invalid member removal transfer');
    }
    seen.add(row.removedMemberId);
    return {
      workspaceId,
      removedMemberId: row.removedMemberId,
      ownerMemberId: row.ownerMemberId,
      removedAt: row.removedAt as string,
    };
  });
}

/** AMR's durable owner-only readback; realtime events are only dirty signals. */
export function createVelaMemberRemovalTransferSource(options: {
  configuredEnv: () => Record<string, string>;
  fetch?: typeof fetch;
  readSession?: typeof readVelaControlApiContext;
}): MemberRemovalTransferSource {
  const fetchImpl = options.fetch ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;
  return {
    async list(workspaceId) {
      const configuredEnv = options.configuredEnv();
      const session = readSession(process.env, configuredEnv);
      if (!session?.apiUrl || !session.controlKey) throw new Error('member removal authority unavailable');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const url = new URL(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/member-removals`, session.apiUrl);
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { authorization: `Bearer ${session.controlKey}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`member removal authority returned ${response.status}`);
        const removals = parseTransferRows(await response.json(), workspaceId);
        const current = readSession(process.env, options.configuredEnv());
        if (current?.apiUrl !== session.apiUrl || current.controlKey !== session.controlKey) {
          throw new Error('member removal authority identity changed');
        }
        return removals;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/**
 * Transfer only private bindings in the exact Workspace that still name the
 * removed member. Project files stay in place, so the Owner can open their
 * original contents from the same daemon data root after this binding update.
 */
export function createMemberRemovalProjectReconciler(options: {
  db: Database.Database;
  source: MemberRemovalTransferSource;
}) {
  const pendingForeignPrivate = options.db.prepare(`
    SELECT 1 FROM workspace_projects
     WHERE workspace_id = ? AND visibility = 'personal'
       AND created_by_workspace_member_id IS NOT NULL
       AND created_by_workspace_member_id <> ?
     LIMIT 1
  `);
  const transfer = options.db.prepare(`
    UPDATE workspace_projects
       SET created_by_workspace_member_id = ?,
           updated_by_workspace_member_id = ?,
           transferred_from_workspace_member_id = ?
     WHERE workspace_id = ? AND visibility = 'personal'
       AND created_by_workspace_member_id = ?
  `);
  return async (workspaceId: string, ownerMemberId: string): Promise<number> => {
    if (!workspaceId || !ownerMemberId || !pendingForeignPrivate.get(workspaceId, ownerMemberId)) return 0;
    const removals = await options.source.list(workspaceId);
    // Historical facts naming a different Owner cannot authorize this caller
    // to take that Owner's projects. The AMR read is owner-only, but its facts
    // retain the owner at removal time; never substitute today's Owner.
    const applicable = removals.filter((row) =>
      row.workspaceId === workspaceId && row.ownerMemberId === ownerMemberId);
    return options.db.transaction(() => applicable.reduce((count, row) =>
      count + transfer.run(
        ownerMemberId,
        ownerMemberId,
        row.removedMemberId,
        workspaceId,
        row.removedMemberId,
      ).changes, 0))();
  };
}
