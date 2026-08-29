/**
 * Non-optimistic, race-safe writer for the daemon-owned `allowSilentUpdates`
 * preference. Concurrent callers are serialized so an earlier request cannot
 * commit after a later one (false → true → false must end at false).
 */

export type SilentUpdatePreferenceWriterDeps<TBase extends { allowSilentUpdates?: boolean }> = {
  /** Snapshot the current app config base before applying the new preference. */
  readBase: () => TBase;
  /** Persist the intended preference to the daemon. Must throw on failure. */
  writeDaemon: (next: TBase & { allowSilentUpdates: boolean }) => Promise<void>;
  /** Commit the preference into app-wide memory only after a successful write. */
  commit: (allowSilentUpdates: boolean) => void;
};

export type SilentUpdatePreferenceWriter = {
  write: (allowSilentUpdates: boolean) => Promise<void>;
};

export function createSilentUpdatePreferenceWriter<TBase extends { allowSilentUpdates?: boolean }>(
  deps: SilentUpdatePreferenceWriterDeps<TBase>,
): SilentUpdatePreferenceWriter {
  let chain: Promise<void> = Promise.resolve();
  let seq = 0;

  const write = (allowSilentUpdates: boolean): Promise<void> => {
    const mySeq = ++seq;
    const run = async () => {
      // A newer request was queued after us — skip so we never overwrite it.
      if (mySeq !== seq) return;
      const next = {
        ...deps.readBase(),
        allowSilentUpdates,
      } as TBase & { allowSilentUpdates: boolean };
      await deps.writeDaemon(next);
      // Drop local commit if a newer write started while we were on the network.
      if (mySeq !== seq) return;
      deps.commit(allowSilentUpdates);
    };
    const result = chain.then(run, run);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return { write };
}
