export type StudioProjectFileWriter = (path: string, content: string) => Promise<void>;

// A writer is bound to one project (see useFileManager), so writer identity plus
// path is the complete durable-file identity. Sharing this queue across SDK and
// legacy mutation paths prevents independent read-modify-write transactions from
// cloning the same stale bytes and overwriting one another.
const mutationQueues = new WeakMap<StudioProjectFileWriter, Map<string, Promise<unknown>>>();

export function serializeStudioFileMutation<T>(
  writer: StudioProjectFileWriter,
  targetPath: string,
  task: () => Promise<T>,
): Promise<T> {
  let queues = mutationQueues.get(writer);
  if (!queues) {
    queues = new Map();
    mutationQueues.set(writer, queues);
  }
  const prior = queues.get(targetPath) ?? Promise.resolve();
  const next = prior.then(task, task);
  queues.set(targetPath, next);
  void next.then(
    () => {
      if (queues?.get(targetPath) === next) queues.delete(targetPath);
    },
    () => {
      if (queues?.get(targetPath) === next) queues.delete(targetPath);
    },
  );
  return next;
}

export function serializeStudioFileMutations<T>(
  writer: StudioProjectFileWriter,
  targetPaths: readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  const paths = [...new Set(targetPaths)].sort();
  const acquire = (index: number): Promise<T> => {
    const path = paths[index];
    if (path === undefined) return task();
    return serializeStudioFileMutation(writer, path, () => acquire(index + 1));
  };
  return acquire(0);
}
