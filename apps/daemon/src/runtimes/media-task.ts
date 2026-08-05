export interface MediaTaskSnapshotInput {
  id: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
  progress: readonly unknown[];
  file: unknown;
  error: unknown;
}

export interface MediaTaskSnapshot {
  taskId: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
  progress: unknown[];
  nextSince: number;
  file?: unknown;
  error?: unknown;
}

/** Project internal media state into the bounded API/SSE polling shape. */
export function mediaTaskSnapshot(task: MediaTaskSnapshotInput, since = 0): MediaTaskSnapshot {
  const snapshot: MediaTaskSnapshot = {
    taskId: task.id,
    status: task.status,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    progress: task.progress.slice(since),
    nextSince: task.progress.length,
  };
  if (task.status === 'done') snapshot.file = task.file;
  if (task.status === 'failed' || task.status === 'interrupted') snapshot.error = task.error;
  return snapshot;
}
