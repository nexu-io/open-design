import { describe, expect, it, vi } from 'vitest';
import {
  ScreenshotPlanSchema,
  type GenerateStoreScreenshotPlanRequest,
  type ScreenshotPlan,
} from '@open-design/contracts';
import type { StoreScreenshotDocument } from '@launch-studio/store-screenshot';

import {
  createStoreScreenshotPlanner,
  screenshotPlanToChangeSet,
} from '../src/store-screenshots/planner.js';
import {
  createDocumentFromTemplate,
} from '../src/store-screenshots/service.js';
import type { StructuredJsonRequest } from '../src/structured-json.js';

const createRequest = {
  product: {
    name: 'FocusFlow',
    summary: '帮助知识工作者减少干扰并持续复盘',
    audience: '需要深度工作的创作者',
    features: ['专注计时', '屏蔽干扰', '每周统计', '智能提醒'],
  },
  designSystemId: 'calm',
  templateId: 'minimal-center' as const,
  pageCount: 4,
  platforms: ['appStore', 'googlePlay'] as Array<'appStore' | 'googlePlay'>,
};

const plan: ScreenshotPlan = ScreenshotPlanSchema.parse({
  strategy: '从价值到行动',
  pages: [
    {
      headline: '夺回注意力',
      body: '屏蔽干扰',
      feature: '屏蔽干扰',
      templateId: 'minimal-center',
    },
    {
      headline: '看见进展',
      body: '每周复盘',
      feature: '每周统计',
      templateId: 'editorial-split',
    },
    {
      headline: '形成节奏',
      body: '智能提醒',
      feature: '智能提醒',
      templateId: 'gradient-device',
    },
    {
      headline: '今天开始',
      body: '完成第一轮专注',
      feature: '专注计时',
      templateId: 'minimal-center',
    },
  ],
});

function document(): StoreScreenshotDocument {
  return createDocumentFromTemplate('project-1', createRequest, 'document-1');
}

describe('store screenshot planner', () => {
  it('validates provider JSON into a ScreenshotPlan and constrains the prompt', async () => {
    const generateJson = vi.fn(async (
      _request: StructuredJsonRequest<ScreenshotPlan>,
      _context: Pick<GenerateStoreScreenshotPlanRequest, 'byokProvider'>,
    ) => plan);
    const planner = createStoreScreenshotPlanner({ generateJson });

    await expect(planner.plan({
      document: document(),
      request: { prompt: '强调轻量和隐私' },
    })).resolves.toEqual(plan);

    const request = generateJson.mock.calls[0]?.[0];
    expect(request?.schema).toBe(ScreenshotPlanSchema);
    expect(request?.system).toContain('only valid ScreenshotPlan JSON');
    expect(request?.system).toContain('价格、评分、奖项或量化收益');
    expect(request?.system).toContain('价值主张 → 核心功能 → 证明/场景 → 行动');
    expect(request?.system).toContain('minimal-center');
    expect(request?.system).toContain('gradient-device');
    expect(request?.system).toContain('editorial-split');
    expect(request?.user).toContain('FocusFlow');
    expect(request?.user).toContain('专注计时');
    expect(request?.user).toContain('强调轻量和隐私');
  });

  it('forwards the existing run-scoped BYOK provider without putting it in the prompt', async () => {
    const generateJson = vi.fn(async (
      _request: StructuredJsonRequest<ScreenshotPlan>,
      _context: Pick<GenerateStoreScreenshotPlanRequest, 'byokProvider'>,
    ) => plan);
    const planner = createStoreScreenshotPlanner({ generateJson });
    const apiKey = 'AIza-existing-provider-secret';

    await planner.plan({
      document: document(),
      request: {
        byokProvider: {
          protocol: 'google',
          apiKey,
          model: 'gemini-test',
        },
      },
    });

    expect(generateJson.mock.calls[0]?.[1]).toEqual({
      byokProvider: {
        protocol: 'google',
        apiKey,
        model: 'gemini-test',
      },
    });
    expect(generateJson.mock.calls[0]?.[0].system).not.toContain(apiKey);
    expect(generateJson.mock.calls[0]?.[0].user).not.toContain(apiKey);
  });

  it('returns PROVIDER_NOT_CONFIGURED without disabling manual template creation', async () => {
    const planner = createStoreScreenshotPlanner();

    await expect(planner.plan({
      document: document(),
      request: {},
    })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });

    expect(document().pages).toHaveLength(4);
  });

  it('converts a plan to a previewable ChangeSet without mutating the document', () => {
    const before = document();
    const changeSet = screenshotPlanToChangeSet(before, plan);

    expect(changeSet.baseVersion).toBe(1);
    expect(changeSet.operations.filter(({ op }) => op === 'insertPage')).toHaveLength(4);
    expect(changeSet.operations.filter(({ op }) => op === 'deletePage')).toHaveLength(4);
    expect(before).toEqual(document());
    expect(changeSet.operations[0]).toMatchObject({
      op: 'insertPage',
      afterPageId: 'page-4',
      page: {
        id: 'ai-page-1-1',
        templateId: 'minimal-center',
        headline: '夺回注意力',
      },
    });
  });
});
