import fs from 'node:fs';
import path from 'node:path';

type StoredVersions = Record<string, string>;

export interface TeamResourceVersionStore {
  get(workspaceId: string, kind: string, resourceId: string): string | null;
  set(
    workspaceId: string,
    kind: string,
    resourceId: string,
    versionId: string,
  ): Promise<void>;
}

function versionKey(workspaceId: string, kind: string, resourceId: string) {
  return JSON.stringify([workspaceId, kind, resourceId]);
}

export function createTeamResourceVersionStore(
  runtimeDataDir: string,
): TeamResourceVersionStore {
  const filePath = path.join(runtimeDataDir, 'team-resource-versions.json');
  let versions: StoredVersions = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      versions = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && entry[1].length > 0,
        ),
      );
    }
  } catch {
    versions = {};
  }

  let pendingVersions = new Map<string, string>();
  let pendingWaiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  let drainScheduled = false;

  async function drainPendingVersions(): Promise<void> {
    try {
      while (pendingVersions.size > 0) {
        const batchVersions = pendingVersions;
        const batchWaiters = pendingWaiters;
        pendingVersions = new Map();
        pendingWaiters = [];
        try {
          // Build from the last successfully COMMITTED snapshot inside the
          // single writer. Every cursor that arrived before this batch began
          // shares one full-file atomic replace instead of queueing another
          // rewrite of the same JSON document.
          const next = {
            ...versions,
            ...Object.fromEntries(batchVersions),
          };
          await fs.promises.mkdir(runtimeDataDir, { recursive: true });
          const tempPath = `${filePath}.${process.pid}.tmp`;
          await fs.promises.writeFile(
            tempPath,
            `${JSON.stringify(next, null, 2)}\n`,
            { encoding: 'utf8', mode: 0o600 },
          );
          await fs.promises.rename(tempPath, filePath);
          // Publish to readers only after the atomic rename committed.
          versions = next;
          for (const waiter of batchWaiters) waiter.resolve();
        } catch (error) {
          for (const waiter of batchWaiters) waiter.reject(error);
        }
      }
    } finally {
      drainScheduled = false;
      // No await occurs between the loop's final emptiness check and this
      // branch, but keep the reschedule guard explicit for future changes.
      if (pendingVersions.size > 0) scheduleDrain();
    }
  }

  function scheduleDrain(): void {
    if (drainScheduled) return;
    drainScheduled = true;
    // One microtask of coalescing collects independent pulls that complete in
    // the same event-loop turn without adding wall-clock delay.
    void Promise.resolve().then(drainPendingVersions);
  }

  return {
    get(workspaceId, kind, resourceId) {
      return versions[versionKey(workspaceId, kind, resourceId)] ?? null;
    },
    set(workspaceId, kind, resourceId, versionId) {
      const key = versionKey(workspaceId, kind, resourceId);
      pendingVersions.set(key, versionId);
      const committed = new Promise<void>((resolve, reject) => {
        pendingWaiters.push({ resolve, reject });
      });
      scheduleDrain();
      return committed;
    },
  };
}
