import type Database from 'better-sqlite3';
import type { PublicFilePublicationScope, PublicFilePublication, PublicFilePublicationRevision, PublicFilePublicationStore, PublicFilePublicationReceipt } from './public-file-publication-store.js';
import { publishedPathForSource, type ShareFileMapping } from './share-file-mapping.js';

export type RecordPublicFilePublication = (scope: PublicFilePublicationScope, publication: PublicFilePublication, mapping: ShareFileMapping, reopened?: boolean, receipt?: PublicFilePublicationReceipt) => PublicFilePublicationRevision;
/** Record only publication facts atomically after confirmed network success. */
export function createPublicFilePublicationRecorder(
  db: Database.Database,
  publications: PublicFilePublicationStore,
): RecordPublicFilePublication {
  return db.transaction((scope: PublicFilePublicationScope, publication: PublicFilePublication, mapping: ShareFileMapping, reopened = false, receipt?: PublicFilePublicationReceipt) => {
    const publicFilePath = publishedPathForSource(mapping, scope.filePath);
    if (!publicFilePath) throw new Error('SHARE_ENTRY_MAPPING_UNAVAILABLE');
    publications.set(scope, publication, { publicFilePath, reopened, ...(receipt ? { receipt } : {}) });
    const publicationRevision = publications.getRevision(scope);
    if (!publicationRevision?.token || publicationRevision.slug !== publication.slug) throw new Error('PUBLICATION_WITNESS_UNAVAILABLE');
    return publicationRevision;
  });
}
