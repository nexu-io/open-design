export interface PublicFileMutations {
  run<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

/**
 * One daemon-owned serialization boundary for public publication, stop and
 * project deletion. Hold until the operation settles, not until its HTTP
 * connection closes. Independent projects never block each other. This is
 * local ordering only; remote/cross-daemon races still need cloud authority.
 */
export function createPublicFileMutations(): PublicFileMutations {
  const tails = new Map<string, Promise<void>>();
  return {
    async run(projectId, operation) {
      const previous = tails.get(projectId) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => { release = resolve; });
      tails.set(projectId, current);
      await previous;
      try {
        return await operation();
      } finally {
        release();
        if (tails.get(projectId) === current) tails.delete(projectId);
      }
    },
  };
}
