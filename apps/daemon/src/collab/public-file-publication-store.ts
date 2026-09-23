import type Database from 'better-sqlite3';
import type { PublicFileMutations } from './public-file-mutations.js';
import { cancelPersonalCommentRelayOutbox } from './comment-relay-outbox.js';
import { randomUUID } from 'node:crypto';

type SqliteDb = Database.Database;

export interface PublicFilePublicationScope {
  resourceTeamId: string;
  ownerMemberId: string;
  projectId: string;
  filePath: string;
}

export interface PublicFilePublication {
  /** Content may be published while its deployment Web origin is unknown. */
  url: string | null;
  slug: string;
  fileName: string;
}

/** Internal operation witness; never included in the public publication DTO. */
export interface PublicFilePublicationRevision { slug: string; token: string }

export interface PublicFilePublicationStore {
  getRevision(scope: PublicFilePublicationScope): PublicFilePublicationRevision | null;
  deleteIfRevisionMatches(scope: PublicFilePublicationScope, expected: PublicFilePublicationRevision): boolean;
  get(scope: PublicFilePublicationScope): PublicFilePublication | null;
  set(
    scope: PublicFilePublicationScope,
    publication: PublicFilePublication,
  ): void;
  delete(scope: PublicFilePublicationScope): void;
}

/** Full store capability for consumers that enumerate project publications. */
export interface ProjectPublicFilePublicationStore extends PublicFilePublicationStore {
  /** Lists this principal's project with the most recent successful publish time in epoch ms. */
  listByProject(scope: {
    resourceTeamId: string;
    ownerMemberId: string;
    projectId: string;
  }): ReadonlyArray<{
    filePath: string;
    slug: string;
    publishedAt: number;
  }>;
}

export interface PublicFileStopTaskKey extends PublicFilePublicationScope {
  slug: string;
}

export interface PublicFileStopTask extends PublicFileStopTaskKey {
  /** Absent for legacy tasks or a slug without a current local witness. */
  publicationRevision?: string;
  failureCount: number;
}

/** Internal persistence only: callers own stop requests and startup scheduling. */
export interface StopQueuePublicFilePublicationStore extends ProjectPublicFilePublicationStore {
  /** Record initial failure (count 1). Only a matching current revision may replace
   * an older intent; duplicate intents never reset their failure budget. */
  enqueueStop(key: PublicFileStopTaskKey, expected?: PublicFilePublicationRevision): void;
  /** Detached snapshot including exhausted tasks for diagnostics; no raw errors are stored. */
  listStops(): ReadonlyArray<PublicFileStopTask>;
  /** One entry per retryable key for one startup pass; no retries are executed here. */
  listRetryableStops(): ReadonlyArray<PublicFileStopTask>;
  /** Increment an existing task once, capped at five total failures; absent tasks are ignored. */
  recordStopFailure(key: PublicFileStopTaskKey): void;
  /** After successful stop, remove only this exact task, including explicitly resolved terminal tasks. */
  completeStop(key: PublicFileStopTaskKey): void;
}

const MAX_STOP_FAILURES = 5;

function readStopTasks(rows: unknown[]): PublicFileStopTask[] {
  return (rows as Array<PublicFileStopTask & { publicationRevision: string | null }>).map((row) => {
    const { publicationRevision, ...task } = row;
    return publicationRevision == null ? task : { ...task, publicationRevision };
  });
}

function stopTaskValues(key: PublicFileStopTaskKey): [string, string, string, string, string] {
  return [key.resourceTeamId, key.ownerMemberId, key.projectId, key.filePath, key.slug];
}

function stopTaskKey(key: PublicFileStopTaskKey): string {
  return JSON.stringify(stopTaskValues(key));
}

export function migratePublicFilePublications(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_file_publications (
      resource_team_id TEXT NOT NULL,
      owner_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      url TEXT,
      slug TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      revision TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (resource_team_id, owner_member_id, project_id, file_path)
    );
    CREATE TABLE IF NOT EXISTS public_file_stop_queue (
      resource_team_id TEXT NOT NULL,
      owner_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      slug TEXT NOT NULL,
      failure_count INTEGER NOT NULL CHECK (failure_count BETWEEN 1 AND 5),
      publication_revision TEXT,
      PRIMARY KEY (resource_team_id, owner_member_id, project_id, file_path, slug)
    );
  `);
  const stopColumns = db.prepare('PRAGMA table_info(public_file_stop_queue)').all() as Array<{ name: string }>;
  if (!stopColumns.some(column => column.name === 'publication_revision')) {
    db.exec('ALTER TABLE public_file_stop_queue ADD COLUMN publication_revision TEXT');
  }
  const columns = db.prepare('PRAGMA table_info(public_file_publications)').all() as Array<{ name: string; notnull: number }>;
  if (!columns.some(column => column.name === 'revision')) {
    db.exec("ALTER TABLE public_file_publications ADD COLUMN revision TEXT NOT NULL DEFAULT ''");
  }
  // Legacy rows required a display URL to exist before retaining a publication
  // witness. Preserve every identity/revision while allowing a real SQL NULL;
  // an empty or guessed URL would leak a false copy target to callers.
  if (columns.find(column => column.name === 'url')?.notnull) {
    db.transaction(() => {
      db.exec(`CREATE TABLE public_file_publications_nullable (
        resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
        project_id TEXT NOT NULL, file_path TEXT NOT NULL, url TEXT,
        slug TEXT NOT NULL, file_name TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        revision TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (resource_team_id, owner_member_id, project_id, file_path)
      );
      INSERT INTO public_file_publications_nullable
        SELECT resource_team_id, owner_member_id, project_id, file_path, url,
          slug, file_name, created_at, updated_at, revision FROM public_file_publications;
      DROP TABLE public_file_publications;
      ALTER TABLE public_file_publications_nullable RENAME TO public_file_publications;`);
    })();
  }
}

function scopeKey(scope: PublicFilePublicationScope): string {
  return JSON.stringify([
    scope.resourceTeamId,
    scope.ownerMemberId,
    scope.projectId,
    scope.filePath,
  ]);
}

// Use the same locale-independent ordering for both backends, including Unicode paths.
function comparePublicationFilePaths(a: { filePath: string }, b: { filePath: string }): number {
  if (a.filePath === b.filePath) return 0;
  return a.filePath < b.filePath ? -1 : 1;
}

export function createInMemoryPublicFilePublicationStore(): StopQueuePublicFilePublicationStore {
  const stopTasks = new Map<string, PublicFileStopTask>();
  const publications = new Map<string, {
    scope: PublicFilePublicationScope;
    publication: PublicFilePublication;
    publishedAt: number;
    revision: string;
  }>();
  return {
    getRevision(scope) {
      const entry = publications.get(scopeKey(scope));
      return entry ? { slug: entry.publication.slug, token: entry.revision } : null;
    },
    deleteIfRevisionMatches(scope, expected) {
      const key = scopeKey(scope);
      const entry = publications.get(key);
      if (!entry || entry.publication.slug !== expected.slug || entry.revision !== expected.token) return false;
      return publications.delete(key);
    },
    enqueueStop(key, expected) {
      const id = stopTaskKey(key);
      const current = publications.get(scopeKey(key));
      if (expected && (expected.slug !== key.slug || current?.publication.slug !== key.slug
        || current.revision !== expected.token)) return;
      const existing = stopTasks.get(id);
      if (!existing || (expected && existing.publicationRevision !== expected.token)) {
        stopTasks.set(id, {
          ...(current?.publication.slug === key.slug ? { publicationRevision: current.revision } : {}),
          resourceTeamId: key.resourceTeamId,
          ownerMemberId: key.ownerMemberId,
          projectId: key.projectId,
          filePath: key.filePath,
          slug: key.slug,
          failureCount: 1,
        });
      }
    },
    listStops: () => [...stopTasks.values()].map((task) => ({ ...task })),
    listRetryableStops: () => [...stopTasks.values()]
      .filter((task) => task.failureCount < MAX_STOP_FAILURES)
      .map((task) => ({ ...task })),
    recordStopFailure(key) {
      const task = stopTasks.get(stopTaskKey(key));
      if (task && task.failureCount < MAX_STOP_FAILURES) task.failureCount += 1;
    },
    completeStop(key) { stopTasks.delete(stopTaskKey(key)); },
    get: (scope) => publications.get(scopeKey(scope))?.publication ?? null,
    listByProject: (scope) => [...publications.values()]
      .filter((entry) => entry.scope.resourceTeamId === scope.resourceTeamId
        && entry.scope.ownerMemberId === scope.ownerMemberId
        && entry.scope.projectId === scope.projectId)
      .map((entry) => ({
        filePath: entry.scope.filePath,
        slug: entry.publication.slug,
        publishedAt: entry.publishedAt,
      }))
      .sort(comparePublicationFilePaths),
    set: (scope, publication) => {
      publications.set(scopeKey(scope), {
        scope: { ...scope },
        publication,
        publishedAt: Date.now(),
        revision: randomUUID(),
      });
    },
    delete: (scope) => {
      publications.delete(scopeKey(scope));
    },
  };
}

/**
 * Persist public snapshot identities under the exact resource-hub principal
 * that created them. There is deliberately no project foreign key: deleting a
 * local project must not erase the slug needed to redact its still-public
 * remote snapshot.
 */
export function createSqlitePublicFilePublicationStore(
  db: SqliteDb,
  now: () => number = Date.now,
): StopQueuePublicFilePublicationStore {
  const selectRow = db.prepare(`
    SELECT url, slug, file_name AS fileName
      FROM public_file_publications
     WHERE resource_team_id = ?
       AND owner_member_id = ?
       AND project_id = ?
       AND file_path = ?
  `);
  const selectProjectRows = db.prepare(`
    SELECT file_path AS filePath, slug, updated_at AS publishedAt
      FROM public_file_publications
     WHERE resource_team_id = ?
       AND owner_member_id = ?
       AND project_id = ?
  `);
  const upsertRow = db.prepare(`
    INSERT INTO public_file_publications
      (resource_team_id, owner_member_id, project_id, file_path,
       url, slug, file_name, created_at, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resource_team_id, owner_member_id, project_id, file_path)
    DO UPDATE SET
      url = excluded.url,
      slug = excluded.slug,
      file_name = excluded.file_name,
      updated_at = excluded.updated_at,
      revision = excluded.revision
  `);
  const deleteRow = db.prepare(`
    DELETE FROM public_file_publications
     WHERE resource_team_id = ?
       AND owner_member_id = ?
       AND project_id = ?
       AND file_path = ?
  `);

  const deletePublicationAndCancelOutbox = db.transaction((scope: PublicFilePublicationScope) => {
    deleteRow.run(
      scope.resourceTeamId,
      scope.ownerMemberId,
      scope.projectId,
      scope.filePath,
    );
    cancelPersonalCommentRelayOutbox(db, scope);
  });

  const selectRevision = db.prepare(`SELECT slug, revision AS token FROM public_file_publications
    WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ?`);
  const deleteRevision = db.prepare(`DELETE FROM public_file_publications
    WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ?
    AND slug = ? AND revision = ?`);
  const deleteRevisionAndCancelOutbox = db.transaction((
    scope: PublicFilePublicationScope,
    expected: PublicFilePublicationRevision,
  ): boolean => {
    const removed = deleteRevision.run(
      scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath,
      expected.slug, expected.token,
    ).changes === 1;
    // A stale stop owns neither the current publication nor its relay intents.
    // Cancellation failure rolls back the witness deletion, and re-publication
    // cannot interleave between the CAS and cancellation of pre-stop rows.
    if (removed) cancelPersonalCommentRelayOutbox(db, scope);
    return removed;
  });
  // Independent of publications/projects: replacement slugs and local deletion
  // must not erase an outstanding remote stop, including exhausted diagnostics.
  const stopSelect = `SELECT resource_team_id AS resourceTeamId,
    owner_member_id AS ownerMemberId, project_id AS projectId,
    file_path AS filePath, slug, failure_count AS failureCount, publication_revision AS publicationRevision
    FROM public_file_stop_queue`;
  const selectStops = db.prepare(stopSelect);
  const selectRetryableStops = db.prepare(`${stopSelect} WHERE failure_count < ?`);
  const enqueueStop = db.prepare(`
    INSERT INTO public_file_stop_queue
      (resource_team_id, owner_member_id, project_id, file_path, slug, failure_count, publication_revision)
    VALUES (?, ?, ?, ?, ?, 1, (SELECT revision FROM public_file_publications
      WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ? AND slug = ?))
    ON CONFLICT(resource_team_id, owner_member_id, project_id, file_path, slug) DO NOTHING
  `);
  // INSERT SELECT makes checking the current witness and replacing only the
  // superseded intent a single atomic statement, including across DB handles.
  const enqueueCurrentStop = db.prepare(`
    INSERT INTO public_file_stop_queue
      (resource_team_id, owner_member_id, project_id, file_path, slug, failure_count, publication_revision)
    SELECT resource_team_id, owner_member_id, project_id, file_path, slug, 1, revision
      FROM public_file_publications
      WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ?
        AND file_path = ? AND slug = ? AND revision = ?
    ON CONFLICT(resource_team_id, owner_member_id, project_id, file_path, slug)
    DO UPDATE SET failure_count = 1, publication_revision = excluded.publication_revision
      WHERE public_file_stop_queue.publication_revision IS NOT excluded.publication_revision
  `);
  const failStop = db.prepare(`UPDATE public_file_stop_queue
    SET failure_count = failure_count + 1 WHERE resource_team_id = ? AND owner_member_id = ?
    AND project_id = ? AND file_path = ? AND slug = ? AND failure_count < ?`);
  const completeStop = db.prepare(`DELETE FROM public_file_stop_queue WHERE resource_team_id = ?
    AND owner_member_id = ? AND project_id = ? AND file_path = ? AND slug = ?`);

  return {
    getRevision(scope) {
      return selectRevision.get(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath) as PublicFilePublicationRevision | undefined ?? null;
    },
    deleteIfRevisionMatches(scope, expected) {
      return deleteRevisionAndCancelOutbox(scope, expected);
    },
    enqueueStop(key, expected) {
      if (!expected) enqueueStop.run(...stopTaskValues(key), ...stopTaskValues(key));
      else if (expected.slug === key.slug) enqueueCurrentStop.run(...stopTaskValues(key), expected.token);
    },
    listStops() { return readStopTasks(selectStops.all()); },
    listRetryableStops() { return readStopTasks(selectRetryableStops.all(MAX_STOP_FAILURES)); },
    recordStopFailure(key) { failStop.run(...stopTaskValues(key), MAX_STOP_FAILURES); },
    completeStop(key) { completeStop.run(...stopTaskValues(key)); },
    get(scope) {
      const row = selectRow.get(
        scope.resourceTeamId,
        scope.ownerMemberId,
        scope.projectId,
        scope.filePath,
      ) as { url?: unknown; slug?: unknown; fileName?: unknown } | undefined;
      if (
        !row
        || (row.url !== null && typeof row.url !== 'string')
        || typeof row.slug !== 'string'
        || typeof row.fileName !== 'string'
      ) {
        return null;
      }
      return { url: row.url, slug: row.slug, fileName: row.fileName };
    },
    listByProject(scope) {
      const rows = selectProjectRows.all(
        scope.resourceTeamId,
        scope.ownerMemberId,
        scope.projectId,
      ) as Array<{ filePath: string; slug: string; publishedAt: number }>;
      return rows.map((row) => ({
        filePath: row.filePath,
        slug: row.slug,
        publishedAt: row.publishedAt,
      })).sort(comparePublicationFilePaths);
    },
    set(scope, publication) {
      const timestamp = now();
      upsertRow.run(
        scope.resourceTeamId,
        scope.ownerMemberId,
        scope.projectId,
        scope.filePath,
        publication.url,
        publication.slug,
        publication.fileName,
        timestamp,
        timestamp,
        randomUUID(),
      );
    },
    delete(scope) {
      // A successful public-file stop is authoritative locally. Remove its
      // witness and every pre-stop personal relay revision as one SQLite
      // transaction, so immediate re-publication cannot revive stale rows.
      deletePublicationAndCancelOutbox(scope);
    },
  };
}

/**
 * Prepare an operation bound to the queued resource team AND member. Return null
 * when capability/identity is unavailable; never resolve to a different account.
 * Preparation must not send the stop request. The returned operation must retain
 * the verified credentials rather than consulting mutable current-account state.
 */
interface PreparedPublicFileStop {
  resourceTeamId: string;
  ownerMemberId: string;
  stop(): Promise<void>;
}

export type PreparePublicFileStop = (
  key: Readonly<PublicFileStopTaskKey>,
) => Promise<PreparedPublicFileStop | null>;

interface PublicFileStopStartupResult {
  stopped: number;
  failed: number;
  deferred: number;
  persistenceFailures: number;
}

/** One pass per daemon lifecycle, not per route registration or request. */
export function createPublicFileStopStartup(
  store: StopQueuePublicFilePublicationStore,
  prepare: PreparePublicFileStop | null,
  mutations?: PublicFileMutations,
): () => Promise<PublicFileStopStartupResult> {
  let started: Promise<PublicFileStopStartupResult> | undefined;
  return () => started ??= Promise.resolve().then(async () => {
    const result = { stopped: 0, failed: 0, deferred: 0, persistenceFailures: 0 };
    const seen = new Set<string>();
    const processTask = async (task: PublicFileStopTask): Promise<void> => {
      const key: PublicFileStopTaskKey = {
        resourceTeamId: task.resourceTeamId,
        ownerMemberId: task.ownerMemberId,
        projectId: task.projectId,
        filePath: task.filePath,
        slug: task.slug,
      };
      const id = stopTaskKey(key);
      if (seen.has(id)) return;
      seen.add(id);
      const stillOwnsTask = () => {
        const currentTask = store.listStops().find(item => stopTaskKey(item) === id);
        if (!currentTask || currentTask.publicationRevision !== task.publicationRevision
          || currentTask.failureCount !== task.failureCount) return false;
        const current = store.getRevision(key);
        // Legacy tasks can retry orphaned slugs, but never claim a live witness.
        return !current || (current.slug === task.slug
          && current.token === task.publicationRevision);
      };
      if (!stillOwnsTask()) { result.deferred++; return; }
      let operation: PreparedPublicFileStop | null = null;
      try { operation = await prepare?.(Object.freeze(key)) ?? null; } catch { /* No verified operation. */ }
      if (!operation
        || operation.resourceTeamId !== key.resourceTeamId
        || operation.ownerMemberId !== key.ownerMemberId
        || !stillOwnsTask()) {
        result.deferred++;
        return;
      }
      let failed = false;
      try { await operation.stop(); } catch { failed = true; }
      // Persistence errors must not masquerade as network failures or success.
      try {
        if (!stillOwnsTask()) {
          result.deferred++;
          return;
        }
        if (failed) {
          store.recordStopFailure(key);
          result.failed++;
        } else {
          const current = store.getRevision(key);
          if (current && (task.publicationRevision === undefined
            || !store.deleteIfRevisionMatches(key, { slug: task.slug, token: task.publicationRevision }))) {
            result.deferred++;
            return;
          }
          store.completeStop(key);
          result.stopped++;
        }
      } catch {
        result.persistenceFailures++;
      }
    };
    for (const task of store.listRetryableStops()) {
      try {
        if (mutations) await mutations.run(task.projectId, () => processTask(task));
        else await processTask(task);
      } catch {
        // A failed ownership read must neither send an unverified stop nor
        // abort unrelated tasks. Preserve the task and its network budget.
        result.persistenceFailures++;
      }
    }
    return result;
  });
}
