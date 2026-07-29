import type {
  ApplyStoreScreenshotChangeSetRequest,
  CreateStoreScreenshotDocumentRequest,
  ExportStoreScreenshotRequest,
  GenerateStoreScreenshotPlanRequest,
  StoreScreenshotChangeSetPreviewResponse,
  StoreScreenshotJob,
  StoreScreenshotUploadedAsset,
  StoreScreenshotValidationResult,
} from '@open-design/contracts';
import {
  applyChangeSet,
  platformSpecs,
  StoreScreenshotChangeSetSchema,
  StoreScreenshotDocumentSchema,
  type StorePlatform,
  type StoreScreenshotChangeSet,
  type StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';

import type { createStoreScreenshotAssetStore, SaveStoreScreenshotAssetInput } from './assets.js';
import type { createStoreScreenshotPersistence } from './persistence.js';
import type { ProjectStorage } from '../storage/project-storage.js';

export type StoreScreenshotServiceErrorCode =
  | 'INVALID_CHANGE_SET'
  | 'JOB_NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'UNSAFE_DOWNLOAD';

export class StoreScreenshotServiceError extends Error {
  constructor(
    readonly code: StoreScreenshotServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreScreenshotServiceError';
  }
}

export interface StoreScreenshotDocumentIdentity {
  projectId: string;
  documentId: string;
  documentVersion: number;
}

export interface StoreScreenshotGenerateOperations {
  start(
    identity: StoreScreenshotDocumentIdentity,
    request: GenerateStoreScreenshotPlanRequest,
  ): Promise<StoreScreenshotJob>;
}

export interface StoreScreenshotJobOperations {
  startExport(
    identity: StoreScreenshotDocumentIdentity,
    request: ExportStoreScreenshotRequest,
  ): Promise<StoreScreenshotJob>;
  get(
    projectId: string,
    documentId: string,
    jobId: string,
  ): Promise<StoreScreenshotJob | null>;
  resolveDownload(
    projectId: string,
    documentId: string,
    jobId: string,
  ): Promise<{ relativePath: string } | null>;
}

export interface CreateStoreScreenshotServiceDeps {
  persistence: ReturnType<typeof createStoreScreenshotPersistence>;
  assets: ReturnType<typeof createStoreScreenshotAssetStore>;
  projectStorage: ProjectStorage;
  createId: () => string;
  generate?: StoreScreenshotGenerateOperations;
  jobs?: StoreScreenshotJobOperations;
}

export function createDocumentFromTemplate(
  projectId: string,
  request: CreateStoreScreenshotDocumentRequest,
  documentId: string,
): StoreScreenshotDocument {
  const pages = Array.from({ length: request.pageCount }, (_, index) => ({
    id: `page-${index + 1}`,
    order: index,
    templateId: request.templateId,
    headline: request.product.features[index] ?? request.product.name,
    ...(request.product.summary ? { body: request.product.summary } : {}),
    overrides: {},
    lockedFields: [],
  }));
  return StoreScreenshotDocumentSchema.parse({
    schemaVersion: 1,
    id: documentId,
    projectId,
    version: 1,
    product: request.product,
    designSystemId: request.designSystemId,
    assets: [],
    pages,
  }) as StoreScreenshotDocument;
}

function affectedPageIds(changeSet: StoreScreenshotChangeSet): string[] {
  const ids: string[] = [];
  for (const operation of changeSet.operations) {
    const pageId = operation.op === 'insertPage'
      ? operation.page.id
      : operation.pageId;
    if (!ids.includes(pageId)) ids.push(pageId);
  }
  return ids;
}

function applyOrThrow(
  document: StoreScreenshotDocument,
  changeSet: ApplyStoreScreenshotChangeSetRequest,
): StoreScreenshotDocument {
  try {
    const parsed = StoreScreenshotChangeSetSchema.parse(
      changeSet,
    ) as StoreScreenshotChangeSet;
    return applyChangeSet(document, parsed);
  } catch (error) {
    if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
      throw error;
    }
    throw new StoreScreenshotServiceError(
      'INVALID_CHANGE_SET',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function validatePlatforms(
  document: StoreScreenshotDocument,
  platforms: readonly StorePlatform[],
): StoreScreenshotValidationResult {
  const issues: StoreScreenshotValidationResult['issues'] = [];
  for (const platform of platforms) {
    const visiblePageCount = document.pages.filter((page) => (
      !(page.overrides[platform]?.hidden ?? page.hidden ?? false)
    )).length;
    const { min, max } = platformSpecs[platform].pageCount;
    if (visiblePageCount < min || visiblePageCount > max) {
      issues.push({
        severity: 'error',
        code: 'PAGE_COUNT_OUT_OF_RANGE',
        message: `${platform} requires ${min} to ${max} visible screenshots`,
        platform,
      });
    }
  }
  return { valid: issues.every(({ severity }) => severity !== 'error'), issues };
}

function assertControlledDownloadPath(relativePath: string): void {
  const segments = relativePath.split('/');
  const fileName = segments.at(-1) ?? '';
  if (
    relativePath.length === 0
    || relativePath.startsWith('/')
    || relativePath.includes('\\')
    || !relativePath.startsWith('store-screenshots/exports/')
    || segments.some((segment) => (
      segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9._-]+$/.test(segment)
    ))
    || !fileName.toLowerCase().endsWith('.zip')
  ) {
    throw new StoreScreenshotServiceError(
      'UNSAFE_DOWNLOAD',
      'Store screenshot download path is not a controlled export path',
    );
  }
}

async function readDocumentIdentity(
  persistence: ReturnType<typeof createStoreScreenshotPersistence>,
  projectId: string,
): Promise<StoreScreenshotDocumentIdentity> {
  const document = await persistence.readIdentity(projectId);
  return {
    projectId,
    documentId: document.documentId,
    documentVersion: document.version,
  };
}

export function createStoreScreenshotService(deps: CreateStoreScreenshotServiceDeps) {
  return {
    create: async (
      projectId: string,
      request: CreateStoreScreenshotDocumentRequest,
    ): Promise<StoreScreenshotDocument> => deps.persistence.create(
      projectId,
      createDocumentFromTemplate(projectId, request, deps.createId()),
    ),

    read: (projectId: string): Promise<StoreScreenshotDocument> => (
      deps.persistence.read(projectId)
    ),

    uploadAsset: async (
      projectId: string,
      input: SaveStoreScreenshotAssetInput,
    ): Promise<StoreScreenshotUploadedAsset> => {
      const document = await deps.persistence.read(projectId);
      const asset = await deps.assets.save(projectId, document.id, input);
      if (!document.assets.some(({ id }) => id === asset.id)) {
        await deps.persistence.save(projectId, {
          ...document,
          version: document.version + 1,
          assets: [...document.assets, { id: asset.id }],
        }, null, 'asset-replacement');
      }
      return asset;
    },

    previewChanges: async (
      projectId: string,
      changeSet: ApplyStoreScreenshotChangeSetRequest,
    ): Promise<StoreScreenshotChangeSetPreviewResponse> => {
      const document = await deps.persistence.read(projectId);
      applyOrThrow(document, changeSet);
      const parsed = StoreScreenshotChangeSetSchema.parse(
        changeSet,
      ) as StoreScreenshotChangeSet;
      return {
        changeSet,
        affectedPageIds: affectedPageIds(parsed),
      } as StoreScreenshotChangeSetPreviewResponse;
    },

    applyChanges: async (
      projectId: string,
      changeSet: ApplyStoreScreenshotChangeSetRequest,
    ): Promise<StoreScreenshotDocument> => {
      const document = await deps.persistence.read(projectId);
      const updated = applyOrThrow(document, changeSet);
      const parsed = StoreScreenshotChangeSetSchema.parse(
        changeSet,
      ) as StoreScreenshotChangeSet;
      return deps.persistence.save(projectId, updated, parsed, 'ai-change-set');
    },

    listVersions: (projectId: string) => deps.persistence.listVersions(projectId),

    restore: (projectId: string, version: number) => deps.persistence.restore(projectId, version),

    validate: async (
      projectId: string,
      platforms: readonly StorePlatform[] = ['appStore', 'googlePlay'],
    ): Promise<StoreScreenshotValidationResult> => (
      validatePlatforms(await deps.persistence.read(projectId), platforms)
    ),

    generate: async (
      projectId: string,
      request: GenerateStoreScreenshotPlanRequest,
    ): Promise<StoreScreenshotJob> => {
      const identity = await readDocumentIdentity(deps.persistence, projectId);
      if (!deps.generate) {
        throw new StoreScreenshotServiceError(
          'NOT_IMPLEMENTED',
          'Store screenshot generation is not implemented',
        );
      }
      return deps.generate.start(identity, request);
    },

    export: async (
      projectId: string,
      request: ExportStoreScreenshotRequest,
    ): Promise<StoreScreenshotJob> => {
      const identity = await readDocumentIdentity(deps.persistence, projectId);
      if (!deps.jobs) {
        throw new StoreScreenshotServiceError(
          'NOT_IMPLEMENTED',
          'Store screenshot export is not implemented',
        );
      }
      return deps.jobs.startExport(identity, request);
    },

    getJob: async (projectId: string, jobId: string): Promise<StoreScreenshotJob> => {
      const identity = await readDocumentIdentity(deps.persistence, projectId);
      if (!deps.jobs) {
        throw new StoreScreenshotServiceError(
          'NOT_IMPLEMENTED',
          'Store screenshot jobs are not implemented',
        );
      }
      const job = await deps.jobs.get(projectId, identity.documentId, jobId);
      if (!job) {
        throw new StoreScreenshotServiceError('JOB_NOT_FOUND', 'Store screenshot job not found');
      }
      return job;
    },

    readJobDownload: async (
      projectId: string,
      jobId: string,
    ): Promise<{ body: Buffer; fileName: string }> => {
      const identity = await readDocumentIdentity(deps.persistence, projectId);
      if (!deps.jobs) {
        throw new StoreScreenshotServiceError(
          'NOT_IMPLEMENTED',
          'Store screenshot downloads are not implemented',
        );
      }
      const download = await deps.jobs.resolveDownload(projectId, identity.documentId, jobId);
      if (!download) {
        throw new StoreScreenshotServiceError('JOB_NOT_FOUND', 'Store screenshot job not found');
      }
      assertControlledDownloadPath(download.relativePath);
      const fileName = download.relativePath.split('/').at(-1);
      if (!fileName) {
        throw new StoreScreenshotServiceError('UNSAFE_DOWNLOAD', 'Download file name is invalid');
      }
      return {
        body: await deps.projectStorage.readFile(projectId, download.relativePath),
        fileName,
      };
    },
  };
}

export type StoreScreenshotService = ReturnType<typeof createStoreScreenshotService>;
