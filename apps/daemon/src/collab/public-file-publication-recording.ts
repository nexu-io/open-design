import type Database from 'better-sqlite3';
import type { PublicFilePublicationScope, PublicFilePublication, PublicFilePublicationRevision, PublicFilePublicationStore } from './public-file-publication-store.js';
import { publishedPathForSource, type ShareFileMapping } from './share-file-mapping.js';

export type RecordPublicFilePublication = (scope: PublicFilePublicationScope, publication: PublicFilePublication, mapping: ShareFileMapping) => PublicFilePublicationRevision;
type EnqueuePublishedFileComments = (db: Database.Database, input: {
  scope: PublicFilePublicationScope;
  publicationRevision: PublicFilePublicationRevision;
  publicFilePath: string;
}) => { enqueued: number; skippedInbound: number };

/** Record publication and its comment intent atomically, after network success.
 * The enqueuer is synchronous/local-only. It owns author policy and durable mapping.
 */
export function createPublicFilePublicationRecorder(
  db: Database.Database,
  publications: PublicFilePublicationStore,
  enqueue: EnqueuePublishedFileComments,
): RecordPublicFilePublication {
  return db.transaction((scope: PublicFilePublicationScope, publication: PublicFilePublication, mapping: ShareFileMapping) => {
    const publicFilePath = publishedPathForSource(mapping, scope.filePath);
    if (!publicFilePath) throw new Error('SHARE_ENTRY_MAPPING_UNAVAILABLE');
    publications.set(scope, publication);
    const publicationRevision = publications.getRevision(scope);
    if (!publicationRevision?.token || publicationRevision.slug !== publication.slug) throw new Error('PUBLICATION_WITNESS_UNAVAILABLE');
    enqueue(db, { scope, publicationRevision, publicFilePath });
    return publicationRevision;
  });
}
