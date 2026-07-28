import { describe, expect, it } from 'vitest';
import {
  StoreScreenshotDocumentSchema,
  StoreScreenshotTemplateIdSchema,
  assertPlatformPageCount,
  platformSpecs,
} from '../src/index.js';

describe('StoreScreenshotDocument', () => {
  it('通过唯一领域模板 Schema 验证页面模板', () => {
    expect(StoreScreenshotTemplateIdSchema.options).toEqual([
      'minimal-center',
      'gradient-device',
      'editorial-split',
    ]);
    expect(StoreScreenshotTemplateIdSchema.safeParse('unregistered-template').success).toBe(false);
  });

  it('接受版本化规范文档并拒绝悬空素材引用', () => {
    const result = StoreScreenshotDocumentSchema.safeParse({
      schemaVersion: 1,
      id: 'doc-1',
      projectId: 'project-1',
      version: 1,
      product: { name: 'Focus', summary: '专注任务', audience: '独立开发者', features: ['计时'] },
      designSystemId: 'clay',
      assets: [],
      pages: [{
        id: 'page-1',
        order: 0,
        templateId: 'minimal-center',
        headline: '保持专注',
        body: '一次只做一件事',
        screenshotAssetId: 'missing',
        overrides: {},
        lockedFields: [],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('执行平台数量限制', () => {
    expect(platformSpecs.appStore.size).toEqual({ width: 1290, height: 2796 });
    expect(platformSpecs.appStore.defaultPageCount).toBe(4);
    expect(platformSpecs.appStore.allowAlpha).toBe(false);
    expect(platformSpecs.googlePlay.defaultPageCount).toBe(4);
    expect(platformSpecs.googlePlay.allowAlpha).toBe(false);
    expect(() => assertPlatformPageCount('googlePlay', 3)).toThrow('4 到 8');
    expect(() => assertPlatformPageCount('appStore', 10)).not.toThrow();
  });

  it('只接受版本 1、连续页面序列和有效的渲染数值', () => {
    const valid = {
      schemaVersion: 1,
      id: 'doc-1',
      projectId: 'project-1',
      version: 1,
      product: { name: 'Focus', summary: '专注任务', audience: '独立开发者', features: ['计时'] },
      designSystemId: 'clay',
      assets: [{
        id: 'screen-1',
        color: '#123ABC',
        position: { x: 0, y: 1 },
        scale: 1,
      }],
      pages: [{
        id: 'page-1',
        order: 0,
        templateId: 'minimal-center',
        headline: '保持专注',
        screenshotAssetId: 'screen-1',
        overrides: {},
        lockedFields: [],
      }],
    };

    expect(StoreScreenshotDocumentSchema.safeParse(valid).success).toBe(true);
    expect(StoreScreenshotDocumentSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    expect(StoreScreenshotDocumentSchema.safeParse({
      ...valid,
      pages: [valid.pages[0], { ...valid.pages[0], id: 'page-1', order: 2 }],
    }).success).toBe(false);
    expect(StoreScreenshotDocumentSchema.safeParse({ ...valid, pages: [] }).success).toBe(false);
    expect(StoreScreenshotDocumentSchema.safeParse({
      ...valid,
      pages: Array.from({ length: 11 }, (_, order) => ({ ...valid.pages[0], id: `page-${order}`, order })),
    }).success).toBe(false);
    expect(StoreScreenshotDocumentSchema.safeParse({
      ...valid,
      assets: [{ ...valid.assets[0], color: '#123ABZ' }],
    }).success).toBe(false);
    expect(StoreScreenshotDocumentSchema.safeParse({
      ...valid,
      assets: [{ ...valid.assets[0], position: { x: Infinity, y: 1 }, scale: Number.NaN }],
    }).success).toBe(false);
  });
});
