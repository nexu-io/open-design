import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { resolveWorkspaceSelectionIdentity } from './workspace-selection-identity.js';

interface ActiveWorkspaceSelectionFile {
  workspaceId?: unknown;
  /**
   * The identity stamp that chose `workspaceId`. Absent in records written
   * before this field existed; see {@link readAttributedSelection}.
   */
  identity?: unknown;
}

export interface ActiveWorkspaceSelectionStoreOptions {
  /**
   * Identity that owns reads and writes of the selection. Defaults to the
   * account + AMR environment currently configured for this process.
   */
  identity?: () => string;
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

/** A selection as it sits on disk: an id plus the identity that chose it. */
interface AttributedSelection {
  workspaceId: string | null;
  identity: string | null;
}

const NO_SELECTION: AttributedSelection = { workspaceId: null, identity: null };

/**
 * Parse the on-disk record without deciding whether it is usable.
 *
 * A record whose `identity` is missing or not a string is an unattributed
 * legacy record: it may well have been written by the identity reading it, but
 * it cannot say so. `identity: null` marks that, and every read then treats it
 * as belonging to nobody.
 */
function readAttributedSelection(filePath: string): AttributedSelection {
  let parsed: ActiveWorkspaceSelectionFile;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ActiveWorkspaceSelectionFile;
  } catch {
    return NO_SELECTION;
  }
  const workspaceId = typeof parsed.workspaceId === 'string' && parsed.workspaceId.trim()
    ? parsed.workspaceId.trim()
    : null;
  if (!workspaceId) return NO_SELECTION;
  const identity = typeof parsed.identity === 'string' && parsed.identity.trim()
    ? parsed.identity.trim()
    : null;
  return { workspaceId, identity };
}

export function createActiveWorkspaceSelectionStore(
  dataDir: string,
  options: ActiveWorkspaceSelectionStoreOptions = {},
): ActiveWorkspaceSelectionStore {
  const filePath = path.join(dataDir, 'workspace-selection.json');
  const currentIdentity = options.identity
    ?? (() => resolveWorkspaceSelectionIdentity());
  let cached: AttributedSelection | undefined;
  let generation = 0;
  let mutationTail = Promise.resolve();
  const listeners = new Set<(workspaceId: string | null) => void>();

  /**
   * The selection this process may act on: the stored id, but only while the
   * identity reading it is the identity that wrote it.
   *
   * The identity is re-derived on every read rather than captured once, because
   * it changes underneath a running daemon — `OPEN_DESIGN_AMR_PROFILE` moves
   * between environments and a fresh `vela login` rewrites the account. A
   * mismatch reads as "no selection", which is exactly the state the
   * directory-driven bootstrap in `resolveCurrent` already handles: it picks a
   * default from the membership list that the CURRENT credential returned, and
   * rebinds the file to the current identity on its way through. Announcing the
   * foreign id instead is what makes Vela answer `403 missing_principal` to
   * every request until someone re-picks a workspace by hand.
   *
   * A foreign record is left on disk rather than unlinked here: reads are
   * synchronous and unlinking belongs on the serialized mutation queue, and an
   * inert record costs nothing because the next write overwrites it.
   */
  const read = (): string | null => {
    if (cached === undefined) cached = readAttributedSelection(filePath);
    if (!cached.workspaceId || !cached.identity) return null;
    return cached.identity === currentIdentity() ? cached.workspaceId : null;
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

  /**
   * Write the id together with the identity choosing it, so a later read can
   * tell whether this record is still its own.
   */
  const persist = async (workspaceId: string, identity: string) => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(
        tempPath,
        JSON.stringify({ workspaceId, identity }, null, 2),
        'utf8',
      );
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  const commit = (workspaceId: string, identity: string) => {
    cached = { workspaceId, identity };
    generation += 1;
    notify(workspaceId);
  };

  const forget = () => {
    cached = NO_SELECTION;
    generation += 1;
    notify(null);
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
        const identity = currentIdentity();
        await persist(next, identity);
        commit(next, identity);
      });
    },
    async clear() {
      await enqueueMutation(async () => {
        await fs.promises.rm(filePath, { force: true });
        forget();
      });
    },
    async clearIf(workspaceId: string) {
      const expected = workspaceId.trim();
      if (!expected) return false;
      return enqueueMutation(async () => {
        if (read() !== expected) return false;
        await fs.promises.rm(filePath, { force: true });
        forget();
        return true;
      });
    },
    async replaceIf(expectedWorkspaceId: string | null, workspaceId: string) {
      const expected = expectedWorkspaceId?.trim() || null;
      const next = workspaceId.trim();
      if (!next) throw new Error('workspaceId is required');
      await enqueueMutation(async () => {
        if (read() !== expected) return;
        const identity = currentIdentity();
        await persist(next, identity);
        commit(next, identity);
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
