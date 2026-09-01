import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

interface ActiveWorkspaceSelectionFile {
  workspaceId?: unknown;
}

export interface ActiveWorkspaceSelectionStore {
  get(): string | null;
  snapshot(): { workspaceId: string | null; generation: number };
  set(workspaceId: string): Promise<void>;
  clear(): Promise<void>;
  clearIf(workspaceId: string): Promise<boolean>;
  replaceIf(
    expectedWorkspaceId: string | null,
    workspaceId: string,
  ): Promise<string | null>;
  subscribe(listener: (workspaceId: string | null) => void): () => void;
}

interface AuthorizationWorkspaceContextSnapshot {
  context: {
    workspaceId: string;
    teamId?: string | undefined;
    workspaceMemberId: string;
    workspaceType: string;
    memberStatus: string;
    lifecycleState: string;
  } | null;
  generation: number;
}

export function resolveAuthorizedActiveTeamWorkspaceSnapshot(
  selection: { workspaceId: string | null; generation: number },
  observed: AuthorizationWorkspaceContextSnapshot,
): { workspaceId: string | null; generation: number } {
  const context = observed.context;
  const activeTeamWorkspaceId =
    context?.workspaceType === 'team' &&
    context.memberStatus === 'active' &&
    context.lifecycleState === 'active' &&
    Boolean(context.teamId?.trim()) &&
    Boolean(context.workspaceMemberId.trim())
      ? context.workspaceId
      : null;
  const pinMatches =
    selection.workspaceId == null ||
    selection.workspaceId === activeTeamWorkspaceId;
  return {
    workspaceId: pinMatches ? activeTeamWorkspaceId : null,
    generation: selection.generation + observed.generation,
  };
}

export function createActiveWorkspaceSelectionStore(
  dataDir: string,
): ActiveWorkspaceSelectionStore {
  const filePath = path.join(dataDir, 'workspace-selection.json');
  let cached: string | null | undefined;
  let generation = 0;
  let mutationTail = Promise.resolve();
  const listeners = new Set<(workspaceId: string | null) => void>();

  const read = (): string | null => {
    if (cached !== undefined) return cached;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as ActiveWorkspaceSelectionFile;
      cached = typeof parsed.workspaceId === 'string' && parsed.workspaceId.trim()
        ? parsed.workspaceId.trim()
        : null;
    } catch {
      cached = null;
    }
    return cached;
  };

  const notify = (workspaceId: string | null) => {
    for (const listener of listeners) {
      try {
        listener(workspaceId);
      } catch {
        // Selection persistence must not fail because one observer did.
      }
    }
  };

  const enqueueMutation = <T>(mutation: () => Promise<T>): Promise<T> => {
    const result = mutationTail.then(mutation);
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const persist = async (workspaceId: string) => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(
        tempPath,
        JSON.stringify({ workspaceId }, null, 2),
        'utf8',
      );
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  const commit = (workspaceId: string) => {
    cached = workspaceId;
    generation += 1;
    notify(workspaceId);
  };

  return {
    get: read,
    snapshot() {
      return { workspaceId: read(), generation };
    },
    async set(workspaceId: string) {
      const next = workspaceId.trim();
      if (!next) throw new Error('workspaceId is required');
      await enqueueMutation(async () => {
        await persist(next);
        commit(next);
      });
    },
    async clear() {
      await enqueueMutation(async () => {
        await fs.promises.rm(filePath, { force: true });
        cached = null;
        generation += 1;
        notify(null);
      });
    },
    async clearIf(workspaceId: string) {
      const expected = workspaceId.trim();
      if (!expected) return false;
      return enqueueMutation(async () => {
        if (read() !== expected) return false;
        await fs.promises.rm(filePath, { force: true });
        cached = null;
        generation += 1;
        notify(null);
        return true;
      });
    },
    async replaceIf(expectedWorkspaceId: string | null, workspaceId: string) {
      const expected = expectedWorkspaceId?.trim() || null;
      const next = workspaceId.trim();
      if (!next) throw new Error('workspaceId is required');
      await enqueueMutation(async () => {
        if (read() !== expected) return;
        await persist(next);
        commit(next);
      });

      // A user switch can queue while the conditional write is in flight.
      // Drain mutations that were already queued when this write settled, then
      // report the selection that actually won instead of the temporary value.
      const queuedThroughCommit = mutationTail;
      await queuedThroughCommit;
      return read();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
