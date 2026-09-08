import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import {
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  gotoProject,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import { runErrorCard } from '@/playwright/chat';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

const AMR_AGENT = {
  id: 'amr',
  name: 'OpenDesign AMR',
  bin: 'vela',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};

async function seedBalanceFailure(page: Page, locale: 'en' | 'zh-CN') {
  await page.addInitScript((nextLocale) => {
    window.localStorage.setItem('open-design:locale', nextLocale);
    window.localStorage.setItem('open-design:locale-source', 'manual');
    window.localStorage.setItem('open-design.project.chatPanelWidth', '320');
  }, locale);
  await routeAgents(page, [AMR_AGENT]);
  await page.route('**/api/skills', (route) => route.fulfill({ json: { skills: [] } }));
  await page.route('**/api/design-templates', (route) =>
    route.fulfill({ json: { designTemplates: [] } }));
  await page.route('**/api/design-systems', (route) =>
    route.fulfill({ json: { designSystems: [] } }));
  await page.route('**/api/integrations/vela/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: true,
        profile: 'local',
        configPath: '/tmp/.amr/config.json',
        user: { id: 'layout-user', email: 'layout@example.com', plan: 'free' },
      }),
    }));

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    mediaProviders: {},
    agentModels: {
      amr: { model: 'default', reasoning: 'default' },
    },
  };
  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `chat-error-layout-${locale}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(
    page,
    projectId,
    `Chat error card ${locale}`,
  );
  const userMessageId = `u-${projectId}`;
  const userResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`,
    {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      data: {
        role: 'user',
        content: 'Generate a landing page',
        createdAt: Date.now() - 2_000,
      },
    },
  );
  expect(userResponse.ok(), `upsert user message: ${await userResponse.text()}`).toBeTruthy();

  const assistantResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/a-${projectId}`,
    {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      data: {
        role: 'assistant',
        content: '',
        agentId: 'amr',
        runId: `run-${projectId}`,
        runStatus: 'failed',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        preTurnFileNames: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'AMR Cloud reported insufficient balance.',
            code: 'AMR_INSUFFICIENT_BALANCE',
          },
        ],
      },
    },
  );
  expect(
    assistantResponse.ok(),
    `upsert assistant message: ${await assistantResponse.text()}`,
  ).toBeTruthy();

  await gotoProject(page, projectId);
  const split = page.locator('.split');
  await expect(split).toBeVisible({ timeout: T.long });
  await split.evaluate((element) => {
    (element as HTMLElement).style.setProperty('--project-chat-panel-width', '320px');
  });
}

async function expectActionsContained(
  card: Locator,
  primaryAction: Locator,
  secondaryAction: Locator,
  options: { sameRow?: boolean } = {},
) {
  await expect(primaryAction).toBeVisible();
  await expect(secondaryAction).toBeVisible();
  await primaryAction.click({ trial: true });
  await secondaryAction.click({ trial: true });

  const layout = await card.evaluate((element) => {
    // `RunErrorCard` 把动作直接排在 `[data-user-action-footer]` 这一层。
    // 旧的 `UserActionCard` 在 footer 里另包了一个 `div.actions`(所以原来取的是
    // `:scope > div:last-child`);换组件之后那个 div 没了,再按老选择器取会取到
    // null、一颗按钮都数不到 —— 这个 P1 布局守卫会在不报错的情况下什么都不守。
    const footer = element.querySelector<HTMLElement>('[data-user-action-footer="true"]');
    const actions = footer;
    const buttons = actions
      ? Array.from(actions.querySelectorAll<HTMLElement>('button'))
      : [];
    const cardRect = element.getBoundingClientRect();
    const actionRect = actions?.getBoundingClientRect() ?? null;
    return {
      cardClientWidth: element.clientWidth,
      cardScrollWidth: element.scrollWidth,
      actionClientWidth: actions?.clientWidth ?? -1,
      actionScrollWidth: actions?.scrollWidth ?? -1,
      actionLeft: actionRect?.left ?? -1,
      actionRight: actionRect?.right ?? -1,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }),
    };
  });

  // The 320px split leaves 274px of content width inside the real error card.
  // Pin that geometry so a wider test viewport cannot hide this regression.
  expect(layout.cardClientWidth).toBe(274);
  expect(layout.cardScrollWidth).toBe(layout.cardClientWidth);
  expect(layout.actionScrollWidth).toBeLessThanOrEqual(layout.actionClientWidth);
  expect(layout.actionLeft).toBeGreaterThanOrEqual(layout.cardLeft);
  expect(layout.actionRight).toBeLessThanOrEqual(layout.cardRight);
  /*
   * ⚠️ OPEND-2807:报错卡只有**三颗** —— 〔联系我们〕〔导出日志〕+ 第三颗 CTA。
   * 这一族原来是四颗(多一颗按失败类型分档的〔充值〕),那一档已随工单撤掉。
   * 窄面板守卫本身没变:三颗仍然要装得下、不许把卡撑出横向滚动。
   */
  expect(layout.buttons).toHaveLength(3);
  for (const button of layout.buttons) {
    expect(button.width).toBeGreaterThan(0);
    expect(button.height).toBeGreaterThan(0);
    expect(button.left).toBeGreaterThanOrEqual(layout.cardLeft);
    expect(button.right).toBeLessThanOrEqual(layout.cardRight);
  }
  if (options.sameRow) {
    // 按**这两颗具体的按钮**比,不按下标 —— 动作行会换行,下标不再等于「那一对」。
    const [primaryBox, secondaryBox] = await Promise.all([
      primaryAction.boundingBox(),
      secondaryAction.boundingBox(),
    ]);
    expect(primaryBox?.y).toBe(secondaryBox?.y);
  }
}

/*
 * ⚠️ OPEND-2807 之后这一族的按钮组成变了:〔充值〕不再上卡,第三颗是〔重试〕
 * (这一轮跑在 Cloud 上)。这条用例守的从来是**窄面板下的排布**,不是「哪几颗」,
 * 所以量的对象换成实际在卡上的那两颗:主动作〔重试〕+ 常驻的〔导出日志〕。
 */
test('[P1] zh-CN balance recovery actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedBalanceFailure(page, 'zh-CN');

  const card = runErrorCard(page);
  await expect(card.getByRole('button', { name: '充值' })).toHaveCount(0);
  const retry = card.getByTestId('chat-error-retry');
  const exportLogs = card.getByTestId('chat-error-export-logs');
  await expectActionsContained(card, retry, exportLogs, { sameRow: true });
});

/*
 * 长文案档:德/法/俄以及被展开的英文标签会把动作行撑宽。这里仍然人工把第三颗
 * 的文字撑长,只是撑的对象从〔Top up〕换成了现在真的在卡上的〔Retry〕。
 */
test('[P1] expanded English balance actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedBalanceFailure(page, 'en');

  const card = runErrorCard(page);
  await expect(card.getByRole('button', { name: 'Top up' })).toHaveCount(0);
  const retry = card.getByTestId('chat-error-retry');
  await expect(retry).toBeVisible({ timeout: T.long });
  await retry.evaluate((button) => {
    button.textContent = 'Retry this run on OpenDesign Cloud';
  });
  const exportLogs = card.getByTestId('chat-error-export-logs');
  await expectActionsContained(card, retry, exportLogs);
});
