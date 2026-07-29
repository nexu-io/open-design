import type {
  StoreScreenshotDocumentResponse,
  StoreScreenshotJobResponse,
} from '@open-design/contracts';

export const documentResponse: StoreScreenshotDocumentResponse = {
  document: {
    schemaVersion: 1,
    id: 'document-1',
    projectId: 'project-1',
    version: 1,
    product: {
      name: 'Focus',
      summary: 'Plan the day with clarity.',
      audience: 'Busy professionals',
      features: ['Plan faster', 'Stay focused', 'See progress', 'Finish calmly'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: Array.from({ length: 4 }, (_, index) => ({
      id: `page-${index + 1}`,
      order: index,
      templateId: 'minimal-center' as const,
      headline: `Page ${index + 1}`,
      body: 'Plan the day with clarity.',
      overrides: index === 0
        ? { googlePlay: { headline: 'Google Play page 1' } }
        : {},
      lockedFields: [],
    })),
  },
};

export function queuedJobResponse(
  type: 'generate' | 'export',
  id = `${type}-job-1`,
): StoreScreenshotJobResponse {
  return {
    job: {
      id,
      type,
      status: 'queued',
      progress: { completed: 0, total: 1 },
    },
  };
}

export function failedJobResponse(
  type: 'generate' | 'export',
  id = `${type}-job-1`,
): StoreScreenshotJobResponse {
  return {
    job: {
      id,
      type,
      status: 'failed',
      progress: { completed: 0, total: 1 },
      error: {
        code: 'PROVIDER_FAILED',
        message: `${type} failed`,
      },
    },
  };
}

export const completedGenerateJobResponse: StoreScreenshotJobResponse = {
  job: {
    id: 'generate-job-1',
    type: 'generate',
    status: 'done',
    progress: { completed: 1, total: 1 },
    result: {
      plan: {
        strategy: 'Lead with the clearest benefit.',
        pages: [{
          headline: 'Focus faster',
          feature: 'Plan faster',
          templateId: 'minimal-center',
        }],
      },
      preview: {
        changeSet: {
          baseVersion: 1,
          operations: [],
        },
        affectedPageIds: [],
      },
    },
  },
};

export const completedExportJobResponse: StoreScreenshotJobResponse = {
  job: {
    id: 'export-job-1',
    type: 'export',
    status: 'done',
    progress: { completed: 1, total: 1 },
    result: {
      downloadPath: 'store-screenshots/exports/export-job-1/store-screenshots.zip',
      files: ['app-store/page-1.png'],
      manifest: {
        schemaVersion: 1,
        documentId: 'document-1',
        documentVersion: 1,
        exportedAt: '2026-07-29T12:00:00.000Z',
        platforms: {
          appStore: {
            ruleVersion: 1,
            targetSize: { width: 1290, height: 2796 },
            pageCount: 1,
          },
        },
        files: [{
          order: 1,
          fileName: 'app-store/page-1.png',
          width: 1290,
          height: 2796,
          sha256: 'a'.repeat(64),
          sourcePageId: 'page-1',
          templateId: 'minimal-center',
        }],
        errors: [],
        warnings: [],
      },
    },
  },
};
