/**
 * One project's entry setter and file mutations run one at a time.
 *
 * The routes that move or remove project files, and the one that records the
 * entry file, each read the project, await filesystem work, then write the
 * record. Two of them interleaving across those awaits can leave the entry
 * attribute pointing at a file the other one just removed, or overwrite a
 * selection the other one just made. The daemon is one process, so a
 * per-project queue is enough: each mutation waits for the previous one on
 * the same project to settle, and reads its own inputs only once it runs.
 * Other projects are untouched, and a failed mutation never blocks the next.
 */

const queues = new Map<string, Promise<void>>();

export function withProjectMutation<T>(projectId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve();
  const run = previous.then(work);
  const settled: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(projectId, settled);
  void settled.then(() => {
    if (queues.get(projectId) === settled) queues.delete(projectId);
  });
  return run;
}
