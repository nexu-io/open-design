import { describe, expect, it } from 'vitest';
import {
  applyChangeSet,
  type StoreScreenshotDocument,
} from '../src/index.js';

const document: StoreScreenshotDocument = {
  schemaVersion: 1,
  id: 'document-1',
  projectId: 'project-1',
  version: 3,
  product: { name: 'Focus', summary: '专注任务', audience: '独立开发者', features: ['计时'] },
  designSystemId: 'clay',
  assets: [{ id: 'screen-1' }, { id: 'screen-2' }],
  pages: [
    {
      id: 'page-1',
      order: 0,
      templateId: 'minimal-center',
      headline: '锁定标题',
      body: '正文',
      screenshotAssetId: 'screen-1',
      overrides: {},
      lockedFields: ['headline'],
    },
    {
      id: 'page-2',
      order: 1,
      templateId: 'gradient-device',
      headline: '原始标题',
      overrides: {},
      lockedFields: [],
    },
  ],
};

describe('applyChangeSet', () => {
  it('只修改目标页并保留被锁定标题', () => {
    const next = applyChangeSet(document, {
      baseVersion: 3,
      operations: [
        { op: 'setText', pageId: 'page-1', field: 'headline', value: '不能覆盖' },
        { op: 'setText', pageId: 'page-2', field: 'headline', value: '新标题' },
      ],
    });
    expect(next.pages[0]?.headline).toBe(document.pages[0]?.headline);
    expect(next.pages[1]?.headline).toBe('新标题');
    expect(next.version).toBe(4);
  });

  it('拒绝过期版本而不静默覆盖', () => {
    expect(() => applyChangeSet(document, {
      baseVersion: 2,
      operations: [{ op: 'setText', pageId: 'page-2', field: 'headline', value: '新标题' }],
    })).toThrow('VERSION_CONFLICT');
  });

  it('只接受白名单操作', () => {
    expect(() => applyChangeSet(document, {
      baseVersion: 3,
      operations: [{ op: 'replaceEverything', pageId: 'page-1' } as never],
    })).toThrow('INVALID_CHANGESET');
  });

  it('拒绝伪装成已知操作的非法字段', () => {
    expect(() => applyChangeSet(document, {
      baseVersion: 3,
      operations: [{ op: 'setText', pageId: 'page-2', field: 'templateId', value: 'editorial-split' } as never],
    })).toThrow('INVALID_CHANGESET');
  });

  it('拒绝无效平台和非有限变换数值', () => {
    expect(() => applyChangeSet(document, {
      baseVersion: 3,
      operations: [{ op: 'setVisibility', pageId: 'page-2', visible: true, platform: 'desktopStore' } as never],
    })).toThrow('INVALID_CHANGESET');
    expect(() => applyChangeSet(document, {
      baseVersion: 3,
      operations: [{ op: 'setTransform', pageId: 'page-2', x: Infinity, y: 0, scale: 1 } as never],
    })).toThrow('INVALID_CHANGESET');
  });

  it('应用素材、颜色、变换和平台可见性操作', () => {
    const next = applyChangeSet(document, {
      baseVersion: 3,
      operations: [
        { op: 'setAsset', pageId: 'page-2', assetId: 'screen-2' },
        { op: 'setColor', pageId: 'page-2', field: 'accent', value: '#FF00AA' },
        { op: 'setTransform', pageId: 'page-2', x: 1.5, y: -2, scale: 0.75 },
        { op: 'setVisibility', pageId: 'page-2', visible: false, platform: 'googlePlay' },
      ],
    });

    expect(next.pages[1]).toMatchObject({
      screenshotAssetId: 'screen-2',
      colors: { accent: '#FF00AA' },
      transform: { x: 1.5, y: -2, scale: 0.75 },
      overrides: { googlePlay: { hidden: true } },
    });
  });

  it('插入、复制、删除和移动页面后重排顺序', () => {
    const next = applyChangeSet(document, {
      baseVersion: 3,
      operations: [
        {
          op: 'insertPage',
          afterPageId: 'page-1',
          page: {
            id: 'page-3',
            order: 99,
            templateId: 'editorial-split',
            headline: '新增页面',
            overrides: {},
            lockedFields: [],
          },
        },
        { op: 'duplicatePage', pageId: 'page-2' },
        { op: 'deletePage', pageId: 'page-1' },
        { op: 'movePage', pageId: 'page-3', toIndex: 1 },
      ],
    });

    expect(next.pages.map((page) => page.id)).toEqual(['page-2', 'page-3', 'page-2-copy']);
    expect(next.pages.map((page) => page.order)).toEqual([0, 1, 2]);
  });

  it('拒绝将十页文档扩展到十一页', () => {
    const fullDocument: StoreScreenshotDocument = {
      ...document,
      pages: Array.from({ length: 10 }, (_, order) => ({
        ...document.pages[1]!,
        id: `page-${order + 1}`,
        order,
      })),
    };

    expect(() => applyChangeSet(fullDocument, {
      baseVersion: 3,
      operations: [{
        op: 'insertPage',
        page: {
          id: 'page-11',
          order: 10,
          templateId: 'minimal-center',
          headline: '超出上限',
          overrides: {},
          lockedFields: [],
        },
      }],
    })).toThrow('INVALID_DOCUMENT');
  });

  it('拒绝插入悬空素材引用页面', () => {
    expect(() => applyChangeSet(document, {
      baseVersion: 3,
      operations: [{
        op: 'insertPage',
        page: {
          id: 'page-3',
          order: 2,
          templateId: 'minimal-center',
          headline: '悬空素材',
          screenshotAssetId: 'missing',
          overrides: {},
          lockedFields: [],
        },
      }],
    })).toThrow('INVALID_DOCUMENT');
  });
});
