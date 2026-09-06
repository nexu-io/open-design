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
  retryAction: Locator,
  options: { sameRow?: boolean } = {},
) {
  await expect(primaryAction).toBeVisible();
  await expect(retryAction).toBeVisible();
  await primaryAction.click({ trial: true });
  await retryAction.click({ trial: true });

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
  // 四颗:常驻的〔联系支持〕〔导出日志〕+ 这一档的主动作 + 重试。
  // 前两颗不挑失败类型(产品 2026-08-26 裁决),所以它们也在这条窄面板守卫里。
  expect(layout.buttons).toHaveLength(4);
  for (const button of layout.buttons) {
    expect(button.width).toBeGreaterThan(0);
    expect(button.height).toBeGreaterThan(0);
    expect(button.left).toBeGreaterThanOrEqual(layout.cardLeft);
    expect(button.right).toBeLessThanOrEqual(layout.cardRight);
  }
  if (options.sameRow) {
    // 按**这两颗具体的按钮**比,不按下标 —— 动作行会换行,下标不再等于「那一对」。
    const [primaryBox, retryBox] = await Promise.all([
      primaryAction.boundingBox(),
      retryAction.boundingBox(),
    ]);
    expect(primaryBox?.y).toBe(retryBox?.y);
  }
}

test('[P1] zh-CN balance recovery actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedBalanceFailure(page, 'zh-CN');

  const card = runErrorCard(page);
  const recharge = card.getByRole('button', { name: '充值' });
  const retry = card.getByRole('button', { name: '重试' });
  await expectActionsContained(card, recharge, retry, { sameRow: true });
});

test('[P1] expanded English balance actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedBalanceFailure(page, 'en');

  const card = runErrorCard(page);
  const recharge = card.getByRole('button', { name: 'Top up' });
  await expect(recharge).toBeVisible({ timeout: T.long });
  await recharge.evaluate((button) => {
    button.textContent = 'Top up OpenDesign Cloud balance';
  });
  const expandedRecharge = card.getByRole('button', {
    name: 'Top up OpenDesign Cloud balance',
  });
  const retry = card.getByRole('button', { name: 'Retry' });
  await expectActionsContained(card, expandedRecharge, retry);
});
