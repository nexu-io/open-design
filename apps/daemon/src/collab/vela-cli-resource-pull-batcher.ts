import {
  runVelaResourceBatchCommand,
  type VelaResourcePullBatchRequest,
} from './vela-cli-resource-adapter.js';

export interface VelaResourcePullRequest {
  workspaceId: string;
  kind: 'design_system' | 'plugin' | 'skill';
  resourceId: string;
  dir: string;
  ref?: string;
}

export type RunVelaResourceBatch = (
  requests: readonly VelaResourcePullBatchRequest[],
  workspaceId: string,
) => Promise<string>;

interface PendingPull {
  request: VelaResourcePullBatchRequest;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface PullBatchResult {
  results?: Array<{
    key?: unknown;
    ok?: unknown;
    error?: unknown;
    errorCode?: unknown;
  }>;
}

const MAX_BATCH_REQUESTS = 128;

/**
 * Coalesce resource pulls admitted in the same event-loop turn into one Vela
 * process. Workspace scope is a process-wide identity input, so queues never
 * cross workspace boundaries. Each caller still owns its private staging
 * directory and receives its own success/failure verdict.
 */
export function createVelaResourcePullBatcher(
  run: RunVelaResourceBatch = runVelaResourceBatchCommand,
): { pull(request: VelaResourcePullRequest): Promise<void> } {
  const pendingByWorkspace = new Map<string, PendingPull[]>();
  const scheduledWorkspaces = new Set<string>();
  let nextKey = 1;

  const schedule = (workspaceId: string): void => {
    if (scheduledWorkspaces.has(workspaceId)) return;
    scheduledWorkspaces.add(workspaceId);
    setImmediate(() => {
      scheduledWorkspaces.delete(workspaceId);
      void flush(workspaceId);
    });
  };

  const flush = async (workspaceId: string): Promise<void> => {
    const queue = pendingByWorkspace.get(workspaceId);
    if (!queue?.length) {
      pendingByWorkspace.delete(workspaceId);
      return;
    }
    const batch = queue.splice(0, MAX_BATCH_REQUESTS);
    if (queue.length === 0) pendingByWorkspace.delete(workspaceId);
    else schedule(workspaceId);

    let stdout: string;
    try {
      stdout = await run(batch.map(({ request }) => request), workspaceId);
    } catch (error) {
      for (const item of batch) item.reject(error);
      return;
    }

    let parsed: PullBatchResult;
    try {
      parsed = JSON.parse(stdout) as PullBatchResult;
    } catch {
      const error = new Error('vela resource pull-batch returned invalid JSON');
      for (const item of batch) item.reject(error);
      return;
    }
    if (!Array.isArray(parsed.results)) {
      const error = new Error('vela resource pull-batch response is missing results');
      for (const item of batch) item.reject(error);
      return;
    }

    const results = new Map<string, NonNullable<PullBatchResult['results']>[number]>();
    const duplicateKeys = new Set<string>();
    for (const result of parsed.results) {
      if (typeof result.key !== 'string') continue;
      if (results.has(result.key)) duplicateKeys.add(result.key);
      else results.set(result.key, result);
    }
    for (const item of batch) {
      const result = results.get(item.request.key);
      if (duplicateKeys.has(item.request.key)) {
        item.reject(
          new Error(`vela resource pull-batch duplicated result ${item.request.key}`),
        );
      } else if (!result) {
        item.reject(
          new Error(`vela resource pull-batch omitted result ${item.request.key}`),
        );
      } else if (result.ok === true) {
        item.resolve();
      } else {
        const message =
          typeof result.error === 'string' && result.error.trim()
            ? result.error
            : 'vela resource pull-batch item failed';
        const code =
          typeof result.errorCode === 'string' && result.errorCode.trim()
            ? ` (${result.errorCode})`
            : '';
        item.reject(new Error(`${message}${code}`));
      }
    }
  };

  return {
    pull(request) {
      const workspaceId = request.workspaceId.trim();
      if (!workspaceId) {
        return Promise.reject(new Error('explicit workspace scope is required'));
      }
      return new Promise<void>((resolve, reject) => {
        const queue = pendingByWorkspace.get(workspaceId) ?? [];
        if (!pendingByWorkspace.has(workspaceId)) {
          pendingByWorkspace.set(workspaceId, queue);
        }
        queue.push({
          request: {
            key: `od-pull-${nextKey++}`,
            kind: request.kind,
            resourceId: request.resourceId,
            dir: request.dir,
            ref: request.ref ?? 'published',
          },
          resolve,
          reject,
        });
        schedule(workspaceId);
      });
    },
  };
}
