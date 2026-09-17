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

async function seedCloudRunFailure(page: Page, locale: 'en' | 'zh-CN') {
  // Use an ordinary run error: insufficient balance belongs to the separate
  // quota-card workflow covered by amr-run-failure-recovery.test.ts.
  await page.addInitScript((nextLocale) => {
    window.localStorage.setItem('open-design:locale', nextLocale);
    window.localStorage.setItem('open-design:locale-source', 'manual');
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
            detail: 'The model provider is temporarily unavailable.',
            code: 'UPSTREAM_UNAVAILABLE',
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
  const resizeHandle = page.getByRole('separator', {
    name: locale === 'zh-CN' ? '调整聊天面板大小' : 'Resize chat panel',
    exact: true,
  });
  await expect(resizeHandle).toBeVisible();
  await resizeHandle.press('Home');
  await expect(resizeHandle).toHaveAttribute('aria-valuemin', /^\d+$/);
  const minimumWidth = (await resizeHandle.getAttribute('aria-valuemin'))!;
  expect(Number(minimumWidth)).toBeGreaterThan(0);
  await expect(resizeHandle).toHaveAttribute('aria-valuenow', minimumWidth);
  await expect.poll(async () => {
    const bounds = await split.locator('.split-chat-slot').boundingBox();
    return Math.round(bounds?.width ?? 0);
  }).toBe(Number(minimumWidth));
}

async function expectActionsContained(
  card: Locator,
  actionLabels: string[],
) {
  const footer = card.locator('[data-user-action-footer="true"]');
  await expect(footer.getByRole('button')).toHaveText(actionLabels);
  for (const name of actionLabels) {
    const action = footer.getByRole('button', { name, exact: true });
    await expect(action).toBeVisible();
    await action.click({ trial: true });
  }

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
    const slotRect = element.closest('.split-chat-slot')?.getBoundingClientRect();
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
      slotLeft: slotRect?.left ?? -1,
      slotRight: slotRect?.right ?? -1,
      slotWidth: slotRect?.width ?? -1,
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    };
  });

  // Home reached the product's advertised minimum, confirmed by the actual
  // slot above. Measure containment without forcing an unreachable CSS width.
  expect(layout.cardClientWidth).toBeGreaterThan(0);
  expect(layout.cardClientWidth).toBeLessThanOrEqual(layout.slotWidth);
  expect(layout.cardLeft).toBeGreaterThanOrEqual(layout.slotLeft);
  expect(layout.cardRight).toBeLessThanOrEqual(layout.slotRight);
  expect(layout.cardScrollWidth).toBe(layout.cardClientWidth);
  expect(layout.actionScrollWidth).toBeLessThanOrEqual(layout.actionClientWidth);
  expect(layout.actionLeft).toBeGreaterThanOrEqual(layout.cardLeft);
  expect(layout.actionRight).toBeLessThanOrEqual(layout.cardRight);
  // OPEND-2807/G16: Contact + Export + Retry for a failed Cloud run.
  // Balance-specific actions and Switch to Cloud do not belong on this card.
  expect(layout.buttons).toHaveLength(3);
  for (const button of layout.buttons) {
    expect(button.width).toBeGreaterThan(0);
    expect(button.height).toBeGreaterThan(0);
    expect(button.left).toBeGreaterThanOrEqual(layout.cardLeft);
    expect(button.right).toBeLessThanOrEqual(layout.cardRight);
  }
  // The actual narrow-card layout stacks the three actions without overlap.
  for (let index = 1; index < layout.buttons.length; index += 1) {
    const previous = layout.buttons[index - 1];
    const current = layout.buttons[index];
    if (!previous || !current) {
      throw new Error(`Missing error-card action geometry at index ${index}`);
    }
    expect(current.top).toBeGreaterThanOrEqual(previous.bottom);
    expect(current.left).toBe(previous.left);
    expect(current.right).toBe(previous.right);
  }
}

test('[P1] zh-CN Cloud run recovery actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedCloudRunFailure(page, 'zh-CN');

  const card = runErrorCard(page);
  await expectActionsContained(card, ['联系我们', '导出日志', '重试']);
});

test('[P1] English Cloud run recovery actions stay inside a narrow ChatPane', async ({ page }) => {
  await seedCloudRunFailure(page, 'en');

  const card = runErrorCard(page);
  await expectActionsContained(card, ['Contact us', 'Export logs', 'Retry']);
});
