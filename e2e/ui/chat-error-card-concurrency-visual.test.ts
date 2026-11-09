/**
 * OPEND-4605 — 并发已满提示卡片在长文案语言（fr）下被明显拉高。
 *
 * 视觉验收：用 Playwright 真渲染 .concurrency 卡（UpgradeCard 的并发变体），
 * 在 fr（长文案）与 zh-CN（对照）下量卡片与 CTA 几何：
 *  - fr 下卡片高度不得显著超过 zh-CN（钳制生效，CTA 不被挤到下方单独成行）
 *  - CTA 必须在卡片边界内可见可点
 *  - zh-CN 基线保持设计稿的 480×118 冻结尺寸
 */
import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, routeAgents, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import {
  AMR_PERSONAL_WORKSPACE_CONTEXT,
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  gotoProject,
  seedBrowserConfig,
} from '@/playwright/amr';
import { T } from '@/timeouts';

const LOCALES = ['zh-CN', 'fr'] as const;
type Locale = (typeof LOCALES)[number];

/** 与 amr-concurrency-design.test.ts 同一条 mock 链：并发已满的 run 被拒 */
async function seedConcurrencyRejection(page: import('@playwright/test').Page, locale: Locale) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript((nextLocale) => {
    localStorage.setItem('open-design:locale', nextLocale);
    localStorage.setItem('open-design:locale-source', 'manual');
  }, locale);
  await applyStandardMocks(page);
  await mockSignedInVelaAccount(page, { plan: 'go', balanceUsd: '100.00' });
  await routeAgents(page, [{ id: 'amr', name: 'OpenDesign AMR', bin: 'vela', available: true,
    version: 'test', models: [{ id: 'glm-5', label: 'glm-5' }] }]);
  await seedBrowserConfig(page, { mode: 'daemon', apiKey: '', baseUrl: 'https://api.anthropic.com',
    model: 'glm-5', agentId: 'amr', skillId: null, designSystemId: null, onboardingCompleted: true,
    agentModels: { amr: 'glm-5' }, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false } });
  await page.route('**/api/app-config', route => route.fulfill({ json: { config: {
    onboardingCompleted: true, agentId: 'amr', skillId: null, designSystemId: null,
    agentModels: { amr: { model: 'glm-5' } }, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
  } } }));

  const projectId = `o4605-${locale}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, `OPEND-4605 concurrency ${locale}`, {
    accountPlan: 'go', accountBalanceUsd: '100.00', accountCredits: 1_000_000,
  });
  const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, planId: 'team_go' };
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context } }));
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({ json: {
    scope: { kind: 'personal', projectId, workspaceId: context.workspaceId,
             visibility: 'personal', context },
  } }));
  await page.route('**/api/workspace/billing/preflight?**', route => route.fulfill({ json: { preflight: {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd: '100.00',
    fundingCheck: 'available', modelCovered: false,
    codingPlan: { workspaceId: context.workspaceId, generatedAt: new Date().toISOString(),
                  eligible: false, tier: null, windows: [] },
  } } }));

  const events = [
    'event: start', 'data: {"bin":"vela"}', '',
    'event: agent', 'data: {"type":"done_key","key":"o4605-key"}', '',
    'event: error', 'data: {"message":"membership concurrency limit exceeded","code":"AGENT_EXECUTION_FAILED","failureDetail":"membership_concurrency_limit"}', '',
    'event: end', 'data: {"code":1,"status":"failed","failureDetail":"membership_concurrency_limit"}', '', '',
  ].join('\n');
  await routeSuccessfulRuns(page, { runId: `o4605-rejected-${Date.now()}`, eventBody: events });
  await gotoProject(page, projectId);

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.long });
  await input.fill('OPEND-4605 visual check');
  await page.getByTestId('chat-send').click();

  const card = page.getByTestId('chat-concurrency-card');
  await expect(card).toBeVisible({ timeout: T.long });
  await page.evaluate(() => document.fonts.ready);
  // 等动画结束再量几何
  await card.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .map((animation) => animation.finished.catch(() => undefined)));
  });
  return card;
}

test('[P0] OPEND-4605 concurrency card height is clamped in long-copy locales', async ({ page }, testInfo) => {
  const geometry: Record<Locale, { card: number; cta: number; ctaTop: number; cardBottom: number }> =
    {} as never;

  for (const locale of LOCALES) {
    const card = await seedConcurrencyRejection(page, locale);
    // 拖窄 ChatPanel 到最小宽度（container query 断点之下），这是单据截图的场景
    const resizeHandle = page.getByRole('separator', { name: /resize|调整聊天面板/i }).first();
    const handleVisible = await resizeHandle.isVisible().catch(() => false);
    console.log('[o4605] resize handle visible:', handleVisible);
    if (handleVisible) {
      await resizeHandle.press('Home');
      await page.waitForTimeout(300);
    }

    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    console.log('[o4605] card width:', Math.round(cardBox!.width));

    const cta = card.getByRole('button').last();
    await expect(cta).toBeVisible();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();

    const whyBox = await card.locator('p').first().boundingBox();
    const titleBox = await card.locator('h2, [class*="head"]').first().boundingBox();
    geometry[locale] = {
      card: Math.round(cardBox!.height),
      cta: Math.round(ctaBox!.height),
      ctaTop: Math.round(ctaBox!.y),
      cardBottom: Math.round(cardBox!.y + cardBox!.height),
      whyH: Math.round(whyBox?.height ?? 0),
      whyLines: Math.round((whyBox?.height ?? 0) / 21),
      titleH: Math.round(titleBox?.height ?? 0),
    };

    // CTA 必须在卡片边界内（没被挤出去）
    expect(geometry[locale].ctaTop).toBeLessThan(geometry[locale].cardBottom);

    // 截图存档（测试报告 + 运行目录）
    await testInfo.attach(`o4605-card-${locale}`, {
      body: await card.screenshot(), contentType: 'image/png',
    });
  }

  console.log('[o4605] geometry:', JSON.stringify(geometry, null, 1));
  // zh-CN 基线：冻结的 118px 设计高度（±2px 容差）
  expect(Math.abs(geometry['zh-CN'].card - 118)).toBeLessThanOrEqual(2);

  // fr（长文案）与 zh-CN 的高度差必须在合理范围：钳制生效时两者接近；
  // 修复前 fr 会显著更高（这正是单据报告的问题）。
  const delta = geometry.fr.card - geometry['zh-CN'].card;
  expect(delta, `fr 卡片高度 ${geometry.fr.card}px vs zh-CN ${geometry['zh-CN'].card}px，差 ${delta}px（钳制应让它接近基线）`).toBeLessThanOrEqual(24);

  // fr 下 CTA 高度不得翻倍（修复前按钮换行/被挤成窄条时会异常）
  expect(geometry.fr.cta).toBeLessThanOrEqual(geometry['zh-CN'].cta * 1.5 + 4);
});
