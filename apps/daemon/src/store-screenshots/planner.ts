import {
  ScreenshotPlanSchema,
  type GenerateStoreScreenshotPlanRequest,
  type ScreenshotPlan,
} from '@open-design/contracts';
import {
  StoreScreenshotChangeSetSchema,
  type StoreScreenshotChangeSet,
  type StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';

import {
  StructuredJsonError,
  type StructuredJsonRequest,
} from '../structured-json.js';

export const STORE_SCREENSHOT_PLANNER_SYSTEM_PROMPT = `You are a store screenshot narrative planner.

Return only valid ScreenshotPlan JSON. Do not add prose, Markdown fences, or fields outside the schema.
Use only truthful features from the supplied Product Profile. Never invent 价格、评分、奖项或量化收益.
Unless the user explicitly requests otherwise, create exactly 4 pages with this narrative:
价值主张 → 核心功能 → 证明/场景 → 行动
Use only these registered templateId values:
- minimal-center
- gradient-device
- editorial-split

Plan content only. Do not modify a document or emit document mutations. The host converts the validated plan into a previewable ChangeSet before the user may apply it.`;

export interface StoreScreenshotPlannerInput {
  document: StoreScreenshotDocument;
  request: GenerateStoreScreenshotPlanRequest;
  chatAgentId?: string;
}

export interface CreateStoreScreenshotPlannerDeps {
  generateJson?(
    request: StructuredJsonRequest<ScreenshotPlan>,
    context: Pick<GenerateStoreScreenshotPlanRequest, 'byokProvider'>,
  ): Promise<unknown>;
}

function plannerUserPrompt(input: StoreScreenshotPlannerInput): string {
  return `## Product Profile
${JSON.stringify(input.document.product, null, 2)}

## Current document context
${JSON.stringify({
    pageCount: input.document.pages.length,
    assets: input.document.assets.map(({ id }) => id),
  }, null, 2)}

## User direction
${input.request.prompt?.trim() || '(none; use the default 4-page narrative)'}`;
}

export function createStoreScreenshotPlanner(
  deps: CreateStoreScreenshotPlannerDeps = {},
) {
  return {
    plan: async (input: StoreScreenshotPlannerInput): Promise<ScreenshotPlan> => {
      if (!deps.generateJson) {
        throw new StructuredJsonError(
          'PROVIDER_NOT_CONFIGURED',
          'No configured provider is available for store screenshot planning',
        );
      }
      const structuredRequest: StructuredJsonRequest<ScreenshotPlan> = {
        system: STORE_SCREENSHOT_PLANNER_SYSTEM_PROMPT,
        user: plannerUserPrompt(input),
        schema: ScreenshotPlanSchema,
        ...(input.chatAgentId ? { chatAgentId: input.chatAgentId } : {}),
      };
      const generated = await deps.generateJson(
        structuredRequest,
        {
          ...(input.request.byokProvider
            ? { byokProvider: input.request.byokProvider }
            : {}),
        },
      );
      return ScreenshotPlanSchema.parse(generated);
    },
  };
}

export type StoreScreenshotPlanner = ReturnType<typeof createStoreScreenshotPlanner>;

function nextGeneratedPageId(
  document: StoreScreenshotDocument,
  pageIndex: number,
): string {
  const stem = `ai-page-${document.version}-${pageIndex + 1}`;
  const existing = new Set(document.pages.map(({ id }) => id));
  if (!existing.has(stem)) return stem;
  let suffix = 2;
  while (existing.has(`${stem}-${suffix}`)) suffix += 1;
  return `${stem}-${suffix}`;
}

export function screenshotPlanToChangeSet(
  document: StoreScreenshotDocument,
  plan: ScreenshotPlan,
): StoreScreenshotChangeSet {
  const parsedPlan = ScreenshotPlanSchema.parse(plan);
  const orderedPages = [...document.pages].sort((left, right) => left.order - right.order);
  let afterPageId = orderedPages.at(-1)?.id;
  const insertions = parsedPlan.pages.map((page, index) => {
    const pageId = nextGeneratedPageId(document, index);
    const operation = {
      op: 'insertPage' as const,
      ...(afterPageId ? { afterPageId } : {}),
      page: {
        id: pageId,
        order: orderedPages.length + index,
        templateId: page.templateId,
        headline: page.headline,
        ...(page.body ? { body: page.body } : {}),
        ...(page.screenshotAssetId
          && document.assets.some(({ id }) => id === page.screenshotAssetId)
          ? { screenshotAssetId: page.screenshotAssetId }
          : {}),
        overrides: page.platformOverrides ?? {},
        lockedFields: [],
      },
    };
    afterPageId = pageId;
    return operation;
  });
  const deletions = orderedPages.map(({ id }) => ({
    op: 'deletePage' as const,
    pageId: id,
  }));

  return StoreScreenshotChangeSetSchema.parse({
    baseVersion: document.version,
    operations: [...insertions, ...deletions],
  }) as StoreScreenshotChangeSet;
}
