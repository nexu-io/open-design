import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODES,
  CreateStoreScreenshotDocumentRequestSchema,
  ApplyStoreScreenshotChangeSetRequestSchema,
  ScreenshotPlanSchema,
  StoreScreenshotChangeSetPreviewRequestSchema,
  StoreScreenshotChangeSetPreviewResponseSchema,
  StoreScreenshotJobSchema,
  StoreScreenshotValidationResultSchema,
} from '../src/index.js';
import type { ProjectMetadata } from '../src/api/projects.js';

describe('store screenshot API contracts', () => {
  it('parses document creation requests and background jobs', () => {
    expect(CreateStoreScreenshotDocumentRequestSchema.parse({
      product: {
        name: 'Focus',
        summary: '专注工具',
        audience: '创作者',
        features: ['番茄钟', '统计'],
      },
      designSystemId: 'clay',
      templateId: 'minimal-center',
      pageCount: 4,
    }).pageCount).toBe(4);

    expect(StoreScreenshotJobSchema.parse({
      id: 'job-1',
      type: 'export',
      status: 'queued',
      progress: { completed: 0, total: 8 },
    }).status).toBe('queued');
  });

  it('uses the domain change-set schema for previews and plans', () => {
    const changeSet = {
      baseVersion: 1,
      operations: [{
        op: 'setText' as const,
        pageId: 'page-1',
        field: 'headline' as const,
        value: '新标题',
      }],
    };

    expect(StoreScreenshotChangeSetPreviewRequestSchema.parse(changeSet)).toEqual(changeSet);
    expect(ApplyStoreScreenshotChangeSetRequestSchema.parse(changeSet)).toEqual(changeSet);

    expect(ScreenshotPlanSchema.parse({
      strategy: '从痛点到结果',
      pages: [{
        headline: '夺回注意力',
        body: '屏蔽干扰',
        feature: 'focus',
        templateId: 'minimal-center',
      }],
    }).pages).toHaveLength(1);

    expect(StoreScreenshotChangeSetPreviewResponseSchema.parse({
      changeSet,
      affectedPageIds: ['page-1'],
    }).changeSet.baseVersion).toBe(1);
  });

  it('keeps validation outcomes and store-specific errors shared', () => {
    expect(StoreScreenshotValidationResultSchema.parse({
      valid: false,
      issues: [{
        severity: 'error',
        code: 'PAGE_COUNT_OUT_OF_RANGE',
        message: 'Google Play 至少需要 4 页。',
        platform: 'googlePlay',
      }],
    }).valid).toBe(false);

    expect(API_ERROR_CODES).toEqual(expect.arrayContaining([
      'BAD_REQUEST',
      'PROJECT_NOT_FOUND',
      'DOCUMENT_NOT_FOUND',
      'VERSION_CONFLICT',
      'INVALID_ASSET',
      'PLATFORM_VALIDATION_FAILED',
      'PROVIDER_NOT_CONFIGURED',
      'JOB_NOT_FOUND',
    ]));
  });

  it('allows store screenshot projects to retain the image project kind', () => {
    const metadata: ProjectMetadata = { kind: 'image', intent: 'store-screenshot' };
    expect(metadata.intent).toBe('store-screenshot');
  });
});
