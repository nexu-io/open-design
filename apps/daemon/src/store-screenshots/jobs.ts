import type Database from 'better-sqlite3';
import {
  StoreScreenshotJobSchema,
  type ExportStoreScreenshotRequest,
  type StoreScreenshotJob,
} from '@open-design/contracts';
import type {
  StorePlatform,
  StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';

import {
  exportStoreScreenshots,
  StoreScreenshotExportValidationError,
} from './renderer.js';
import type { createStoreScreenshotPersistence } from './persistence.js';
import type {
  StoreScreenshotDocumentIdentity,
  StoreScreenshotJobOperations,
} from './service.js';
import type { ProjectStorage } from '../storage/project-storage.js';

export type StoreScreenshotJobTask = () => Promise<void>;

export interface CreateStoreScreenshotJobsDeps {
  db: Database.Database;
  persistence: ReturnType<typeof createStoreScreenshotPersistence>;
  projectStorage: ProjectStorage;
  createId: () => string;
  now?: () => number;
  schedule?: (task: StoreScreenshotJobTask) => void;
}

type JobRow = {
  id: string;
  type: string;
  status: string;
  progressJson: string;
  resultJson: string | null;
  errorJson: string | null;
};

const JOB_COLUMNS = `
  id,
  type,
  status,
  progress_json AS progressJson,
  result_json AS resultJson,
  error_json AS errorJson
`;

function isSafeJobId(jobId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(jobId);
}

function exportRoot(jobId: string): string {
  if (!isSafeJobId(jobId)) {
    throw new Error('Store screenshot job id contains unsafe path characters');
  }
  return `store-screenshots/exports/${jobId}`;
}

function parseJson(value: string | null): unknown {
  return value === null ? undefined : JSON.parse(value);
}

function jobFromRow(row: JobRow): StoreScreenshotJob {
  return StoreScreenshotJobSchema.parse({
    id: row.id,
    type: row.type,
    status: row.status,
    progress: JSON.parse(row.progressJson),
    ...(row.resultJson === null ? {} : { result: parseJson(row.resultJson) }),
    ...(row.errorJson === null ? {} : { error: parseJson(row.errorJson) }),
  });
}

function selectedPlatforms(platforms: readonly StorePlatform[]): StorePlatform[] {
  const selected = new Set(platforms);
  return (['appStore', 'googlePlay'] as const).filter((platform) => selected.has(platform));
}

function visiblePageCount(
  document: StoreScreenshotDocument,
  platforms: readonly StorePlatform[],
): number {
  return platforms.reduce((total, platform) => total + document.pages.filter((page) => (
    !(page.overrides[platform]?.hidden ?? page.hidden ?? false)
  )).length, 0);
}

function assertIdentity(
  document: StoreScreenshotDocument,
  identity: StoreScreenshotDocumentIdentity,
): void {
  if (
    document.projectId !== identity.projectId
    || document.id !== identity.documentId
    || document.version !== identity.documentVersion
  ) {
    throw new Error('Store screenshot document changed before the export was queued');
  }
}

export function reconcileStoreScreenshotJobsOnBoot(
  db: Database.Database,
  options: { now?: number } = {},
): { interrupted: number } {
  const timestamp = options.now ?? Date.now();
  const error = JSON.stringify({
    code: 'DAEMON_RESTART',
    message: 'Store screenshot job interrupted by daemon restart',
  });
  const result = db.prepare(`
    UPDATE store_screenshot_jobs
    SET status = 'interrupted',
        error_json = ?,
        ended_at = ?,
        updated_at = ?
    WHERE status IN ('queued', 'running')
  `).run(error, timestamp, timestamp);
  return { interrupted: result.changes };
}

export function createStoreScreenshotJobs(
  deps: CreateStoreScreenshotJobsDeps,
): StoreScreenshotJobOperations {
  const now = deps.now ?? Date.now;
  const schedule = deps.schedule ?? ((task: StoreScreenshotJobTask): void => {
    queueMicrotask(() => {
      void task();
    });
  });

  const get = async (
    projectId: string,
    documentId: string,
    jobId: string,
  ): Promise<StoreScreenshotJob | null> => {
    const row = deps.db.prepare(`
      SELECT ${JOB_COLUMNS}
      FROM store_screenshot_jobs
      WHERE id = ? AND project_id = ? AND document_id = ?
    `).get(jobId, projectId, documentId) as JobRow | undefined;
    return row ? jobFromRow(row) : null;
  };

  const updateProgress = (
    jobId: string,
    completed: number,
    total: number,
  ): void => {
    deps.db.prepare(`
      UPDATE store_screenshot_jobs
      SET progress_json = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(JSON.stringify({ completed, total }), now(), jobId);
  };

  const markFailed = (jobId: string, error: unknown): void => {
    const timestamp = now();
    const jobError = error instanceof StoreScreenshotExportValidationError
      ? {
        code: 'VALIDATION_FAILED',
        message: error.message,
      }
      : {
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      };
    deps.db.prepare(`
      UPDATE store_screenshot_jobs
      SET status = 'failed',
          error_json = ?,
          ended_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(JSON.stringify(jobError), timestamp, timestamp, jobId);
  };

  const runExport = async (
    jobId: string,
    identity: StoreScreenshotDocumentIdentity,
    document: StoreScreenshotDocument,
    platforms: StorePlatform[],
    total: number,
  ): Promise<void> => {
    const startedAt = now();
    const started = deps.db.prepare(`
      UPDATE store_screenshot_jobs
      SET status = 'running',
          started_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'queued'
    `).run(startedAt, startedAt, jobId);
    if (started.changes !== 1) return;

    try {
      const exported = await exportStoreScreenshots(document, platforms, {
        now: () => new Date(now()),
        onRendered: (completed, renderTotal) => {
          updateProgress(jobId, completed, renderTotal);
        },
      });
      const root = exportRoot(jobId);
      for (const entry of exported.entries) {
        await deps.projectStorage.writeFile(
          identity.projectId,
          `${root}/${entry.fileName}`,
          entry.body,
        );
      }
      await deps.projectStorage.writeFile(
        identity.projectId,
        `${root}/manifest.json`,
        exported.manifestBody,
      );
      const downloadPath = `${root}/store-screenshots.zip`;
      await deps.projectStorage.writeFile(identity.projectId, downloadPath, exported.zip);

      const timestamp = now();
      deps.db.prepare(`
        UPDATE store_screenshot_jobs
        SET status = 'done',
            progress_json = ?,
            result_json = ?,
            error_json = NULL,
            ended_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(
        JSON.stringify({ completed: total, total }),
        JSON.stringify({
          downloadPath,
          files: exported.files,
          manifest: exported.manifest,
        }),
        timestamp,
        timestamp,
        jobId,
      );
    } catch (error) {
      markFailed(jobId, error);
    }
  };

  const startExport = async (
    identity: StoreScreenshotDocumentIdentity,
    request: ExportStoreScreenshotRequest,
  ): Promise<StoreScreenshotJob> => {
    const document = await deps.persistence.read(identity.projectId);
    assertIdentity(document, identity);
    const platforms = selectedPlatforms(request.platforms);
    const total = Math.max(1, visiblePageCount(document, platforms));
    const jobId = deps.createId();
    exportRoot(jobId);
    const timestamp = now();
    deps.db.prepare(`
      INSERT INTO store_screenshot_jobs
        (id, project_id, document_id, type, status, progress_json,
         result_json, error_json, created_at, started_at, ended_at, updated_at)
      VALUES (?, ?, ?, 'export', 'queued', ?, NULL, NULL, ?, NULL, NULL, ?)
    `).run(
      jobId,
      identity.projectId,
      identity.documentId,
      JSON.stringify({ completed: 0, total }),
      timestamp,
      timestamp,
    );
    schedule(() => runExport(jobId, identity, document, platforms, total));
    const job = await get(identity.projectId, identity.documentId, jobId);
    if (!job) throw new Error('Store screenshot job was not persisted');
    return job;
  };

  const resolveDownload = async (
    projectId: string,
    documentId: string,
    jobId: string,
  ): Promise<{ relativePath: string } | null> => {
    const job = await get(projectId, documentId, jobId);
    if (!job || job.status !== 'done' || !isSafeJobId(jobId)) return null;
    const expectedPath = `${exportRoot(jobId)}/store-screenshots.zip`;
    if (
      !job.result
      || typeof job.result !== 'object'
      || !('downloadPath' in job.result)
      || job.result.downloadPath !== expectedPath
    ) return null;
    return { relativePath: expectedPath };
  };

  return {
    startExport,
    get,
    resolveDownload,
  };
}
