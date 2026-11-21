import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks, routeAgents, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, createProjectViaApi, gotoProject, seedBrowserConfig } from '@/playwright/amr';
import { T } from '@/timeouts';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = '/Users/luogao/Documents/works/auto-plane/engine/data/visual/OPEND-4605/e2e-real';

const AMR_AGENT = { id: 'amr', name: 'OpenDesign AMR', bin: 'vela', available: true,
  version: 'test', models: [{ id: 'glm-5', label: 'glm-5' }] };

async function seedConcurrencyFlow(page: Page, locale: 'fr' | 'zh-CN', tag: string) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript((loc) => {
    localStorage.setItem('open-design:locale', loc);
    localStorage.setItem('open-design:locale-source', 'manual');
  }, locale);
  await applyStandardMocks(page);
  await mockSignedInVelaAccount(page, { plan: 'go', balanceUsd: '100.00' });
  await routeAgents(page, [AMR_AGENT]);
  const config = { mode: 'daemon', agentId: 'amr', skillId: null, designSystemId: null,
    onboardingCompleted: true, privacyDecisionAt: 1, agentModels: { amr: { model: 'glm-5' } },
    telemetry: { metrics: false, content: false, artifactManifest: false } };
  await seedBrowserConfig(page, config);
  await page.route('**/api/app-config', route => route.fulfill({ json: { config } }));
  const projectId = `o4605-${tag}-${locale}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, 'OPEND-4605 concurrency', {
    accountPlan: 'go', accountBalanceUsd: '100.00', accountCredits: 1_000_000 });
  const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, workspaceType: 'team', role: 'member',
    planId: 'team_go', permissions: { ...AMR_PERSONAL_WORKSPACE_CONTEXT.permissions,
      canManageBilling: false, canManageAutoRecharge: false, canManageMembers: false } };
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context } }));
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({ json: {
    scope: { kind: 'team', projectId, workspaceId: context.workspaceId,
             visibility: 'personal', context } } }));
  await page.route('**/api/workspace/billing/preflight?**', route => route.fulfill({ json: { preflight: {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd: '100', funding: 'wallet',
    fundingCheck: 'available', modelCovered: false, codingPlan: { workspaceId: context.workspaceId,
      generatedAt: new Date().toISOString(), eligible: false, tier: null, windows: [] } } } }));
  const events = [
    'event: start', 'data: {"bin":"vela"}', '',
    'event: agent', 'data: {"type":"done_key","key":"o4605-key"}', '',
    'event: error', 'data: {"message":"membership concurrency limit exceeded","error":{"code":"AGENT_EXECUTION_FAILED","message":"membership concurrency limit exceeded"},"failureDetail":"membership_concurrency_limit"}', '',
    'event: end', 'data: {"code":1,"status":"failed","failureDetail":"membership_concurrency_limit"}', '', '',
  ].join('\n');
  await routeSuccessfulRuns(page, { runId: `o4605-${tag}-${Date.now()}`, eventBody: events });
  await gotoProject(page, projectId);
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.long });
  await input.fill('OPEND-4605');
  await page.getByTestId('chat-send').click();

  // dialog 先出现，点「知道了」后卡片才渲染（F06 流程）
  const dialog = page.getByTestId('amr-concurrency-dialog');
  const acknowledge = page.getByTestId('amr-concurrency-close');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await acknowledge.click();
  await expect(dialog).toHaveCount(0);

  const card = page.getByTestId('chat-concurrency-card');
  await expect(card).toBeVisible({ timeout: T.long });
  await expect(card).toContainText(locale === 'fr'
    ? 'Limite de simultanéité de l\u2019équipe atteinte'
    : '可用并发 已用满');
  await page.evaluate(() => document.fonts.ready);
  await card.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .map((animation) => animation.finished.catch(() => undefined)));
  });
  await page.mouse.move(0, 0);
  return card;
}

for (const locale of ['fr', 'zh-CN'] as const) {
  test(`[o4605] ${locale} — PR 修复后（含钳制）`, async ({ page }, testInfo) => {
    const card = await seedConcurrencyFlow(page, locale, 'after');
    const box = await card.boundingBox();
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/after-${locale}.png`, await card.screenshot());
    await writeFile(`${OUT}/after-${locale}-viewport.png`, await page.screenshot());
    await testInfo.attach(`o4605-after-${locale}`, {
      body: await card.screenshot(), contentType: 'image/png' });
    await testInfo.attach(`o4605-after-${locale}-viewport`, {
      body: await page.screenshot(), contentType: 'image/png' });
    console.log(`[o4605][after][${locale}] card ${Math.round(box?.height ?? 0)}px`);
    // 钳制生效断言：fr 下卡片高度不得显著超过 zh 基线 118
    if (locale === 'fr') {
      expect(Math.round(box?.height ?? 0)).toBeLessThan(190);
    }
  });

  test(`[o4605] ${locale} — 修复前基线（撤掉钳制）`, async ({ page }, testInfo) => {
    const card = await seedConcurrencyFlow(page, locale, 'before');
    // 注入：撤掉 .whyBody 钳制（还原修复前行为）
    await card.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        [data-testid="chat-concurrency-card"] span[class*="whyBody"] {
          display: block !important;
          -webkit-line-clamp: unset !important;
          line-clamp: unset !important;
          overflow: visible !important;
        }`;
      document.head.append(style);
    });
    await page.waitForTimeout(300);
    const box = await card.boundingBox();
    await writeFile(`${OUT}/baseline-${locale}.png`, await card.screenshot());
    await testInfo.attach(`o4605-baseline-${locale}`, {
      body: await card.screenshot(), contentType: 'image/png' });
    console.log(`[o4605][baseline][${locale}] card ${Math.round(box?.height ?? 0)}px`);
  });
}
