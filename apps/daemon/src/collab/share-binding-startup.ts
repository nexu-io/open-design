import type { PublicFilePublicationStore } from './public-file-publication-store.js';
import type { PublicFileMutations } from './public-file-mutations.js';
import type { ShareBindingOutbox, ShareBindingTask } from './share-binding-outbox.js';

export interface PreparedShareBinding {
  resourceTeamId: string;
  ownerMemberId: string;
  /** Must bind only this captured immutable publication, never publish again. */
  bind(): Promise<void>;
}
export type PrepareShareBinding = (task: Readonly<ShareBindingTask>) => Promise<PreparedShareBinding | null>;
export interface ShareBindingStartupOptions {
  prepare: PrepareShareBinding | null;
  publications: Pick<PublicFilePublicationStore, 'getRevision'>;
  /** Optional extra host restrictions; cannot override the durable witness. */
  isCurrent?(task: ShareBindingTask): boolean;
  mutations: PublicFileMutations;
}
export interface ShareBindingStartupResult { bound: number; failed: number; deferred: number; persistenceFailures: number }

/** One binding-only pass per lifecycle. A missing primitive defers; it is not
 * a failed network attempt. Local CAS protects bookkeeping, not cloud atomicity.
 */
export function createShareBindingStartup(outbox: ShareBindingOutbox, options: ShareBindingStartupOptions): () => Promise<ShareBindingStartupResult> {
  let started: Promise<ShareBindingStartupResult> | undefined;
  return () => started ??= Promise.resolve().then(async () => {
    const result = { bound: 0, failed: 0, deferred: 0, persistenceFailures: 0 };
    for (const snapshot of outbox.list()) {
      if (snapshot.failureCount >= 5) continue;
      const task = Object.freeze({ ...snapshot, receipt: Object.freeze({ ...snapshot.receipt }) });
      try {
        await options.mutations.run(task.projectId, async () => {
          const current = () => {
            const queued = outbox.list().find(item => item.id === task.id);
            const witness = options.publications.getRevision({
              resourceTeamId: task.resourceTeamId, ownerMemberId: task.ownerMemberId,
              projectId: task.projectId, filePath: task.receipt.filePath,
            });
            return queued?.publicationRevision === task.publicationRevision
              && queued.failureCount === task.failureCount
              && Boolean(task.publicationRevision.trim())
              && witness?.slug === task.receipt.slug && witness.token === task.publicationRevision
              && (options.isCurrent?.(task) ?? true);
          };
          if (!current()) { result.deferred++; return; }
          let operation: PreparedShareBinding | null = null;
          try { operation = await options.prepare?.(task) ?? null; } catch { /* No verified identity/primitive. */ }
          if (!operation || operation.resourceTeamId !== task.resourceTeamId
            || operation.ownerMemberId !== task.ownerMemberId || !current()) {
            result.deferred++; return;
          }
          let failed = false;
          try { await operation.bind(); } catch { failed = true; }
          if (!current()) { result.deferred++; return; }
          if (failed) { outbox.fail(task); result.failed++; }
          else { outbox.complete(task); result.bound++; }
        });
      } catch {
        // Preserve budget on local reads/writes/lock failure and continue other projects.
        result.persistenceFailures++;
      }
    }
    return result;
  });
}
