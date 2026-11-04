import type Database from 'better-sqlite3';
import { enqueuePublishedFileComments, type PublishedFileCommentBackfillInput } from './published-file-comment-backfill.js';
import { clearPublishedCommentBackfillEnqueueFailure, migratePublishedCommentBackfillState, readPublishedCommentBackfillPreparation, recordPublishedCommentBackfillEnqueueFailure } from './published-comment-backfill-state.js';
import { createSqlitePublicFilePublicationStore } from './public-file-publication-store.js';

export interface PublishedCommentBackfillSubject {
  resourceTeamId: string;
  ownerMemberId: string;
  projectId: string;
  filePath?: string;
}

/** Consumes committed publication facts. It has no publishing or stop capability. */
export function createPublishedCommentBackfillReconciler(
  db: Database.Database,
  deps: {
    /** Register the committed receipt for comments; never publishes or changes link lifecycle. */
    admitFact?: (fact: PublishedFileCommentBackfillInput) => Promise<void>;
    listFacts: (subject: PublishedCommentBackfillSubject) => readonly PublishedFileCommentBackfillInput[];
  },
) {
  migratePublishedCommentBackfillState(db);
  const publications = createSqlitePublicFilePublicationStore(db);
  return {
    async prepare(subject: PublishedCommentBackfillSubject, options?: { retryFailed?: boolean }): Promise<void> {
      if (db.inTransaction) throw new Error('Comment preparation requires committed publication facts');
      // A failed fact read is unknown work, never an empty successful batch.
      let facts: readonly PublishedFileCommentBackfillInput[];
      try { facts = deps.listFacts(subject); } catch { throw new Error('COMMENT_BACKFILL_FACTS_UNAVAILABLE'); }
      for (const fact of facts) {
        const { scope, publicationRevision } = fact;
        if (scope.resourceTeamId !== subject.resourceTeamId || scope.ownerMemberId !== subject.ownerMemberId
          || scope.projectId !== subject.projectId || (subject.filePath !== undefined && scope.filePath !== subject.filePath)) {
          throw new Error('COMMENT_BACKFILL_SCOPE_MISMATCH');
        }
        const current = () => {
          const revision = publications.getRevision(scope);
          return revision?.token === publicationRevision.token && revision.slug === publicationRevision.slug;
        };
        if (!current()) continue;
        const preparation = readPublishedCommentBackfillPreparation(db, scope, publicationRevision);
        if (preparation === 'prepared' || (preparation === 'enqueue-failed' && !options?.retryFailed)) continue;
        try {
          // Remote admission is comment work and cannot run inside SQLite's
          // synchronous transaction or hold publication completion open.
          await deps.admitFact?.(fact);
          if (!current()) continue;
          db.transaction(() => {
            if (!current()) return;
            const state = readPublishedCommentBackfillPreparation(db, scope, publicationRevision);
            if (state === 'prepared' || (state === 'enqueue-failed' && !options?.retryFailed)) return;
            if (state === 'enqueue-failed') clearPublishedCommentBackfillEnqueueFailure(db, scope, publicationRevision);
            enqueuePublishedFileComments(db, fact);
          })();
        } catch {
          // Queue writes roll back together. Only a safe, exact-scope failure is
          // persisted afterward; a failed write here must remain observable.
          try { recordPublishedCommentBackfillEnqueueFailure(db, { ...fact, commentIds: [] }); }
          catch { throw new Error('COMMENT_BACKFILL_FAILURE_STATE_UNAVAILABLE'); }
        }
      }
    },
  };
}
