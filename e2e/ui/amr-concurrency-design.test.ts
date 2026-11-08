import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, routeAgents, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, AMR_PERSONAL_WORKSPACE_HEADERS, createProjectViaApi, gotoProject, seedBrowserConfig } from '@/playwright/amr';
import { T } from '@/timeouts';

// UISTATE-F04-CLIENT / YANG-E2E-009: a controlled Link rejection witnesses
// the running browser's illustration, benefits and native upgrade action.
// Role/plan decisions remain covered by AmrConcurrencyDialog component tests.
test('[P0] F04 Go Owner concurrency rejection renders the approved Cloud offer and stays manual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
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
  const projectId = `f04-${testInfo.testId}-${Date.now()}`;
  await createProjectViaApi(page, projectId, 'F04 concurrency offer', {
    accountPlan: 'go', accountBalanceUsd: '100.00', accountCredits: 1_000_000,
  });
  const existingArtifact = '<!doctype html><html><body><h1>Existing F04 output</h1></body></html>';
  const savedArtifact = await page.request.post(`/api/projects/${projectId}/files`, {
    headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
    data: { name: 'existing-output.html', content: existingArtifact, artifactManifest: {
      version: 1, kind: 'html', title: 'Existing F04 output', entry: 'existing-output.html',
      renderer: 'html', exports: ['html'],
    } },
  });
  expect(savedArtifact.ok(), await savedArtifact.text()).toBeTruthy();
  const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, planId: 'team_go' };
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context } }));
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({ json: {
    scope: { kind: 'personal', projectId, workspaceId: context.workspaceId, visibility: 'personal', context },
  } }));
  await page.route('**/api/workspace/billing/preflight?**', route => route.fulfill({ json: { preflight: {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd: '100', funding: 'wallet',
    fundingCheck: 'available', modelCovered: false, codingPlan: { workspaceId: context.workspaceId,
      generatedAt: new Date().toISOString(), eligible: false, tier: null, windows: [] },
  } } }));
  const events = [
    'event: start', 'data: {"bin":"vela"}', '',
    'event: agent', 'data: {"type":"done_key","key":"f04-protocol-key"}', '',
    'event: error', 'data: {"message":"membership concurrency limit exceeded","code":"AGENT_EXECUTION_FAILED","failureDetail":"membership_concurrency_limit"}', '',
    'event: end', 'data: {"code":1,"status":"failed","failureDetail":"membership_concurrency_limit"}', '', '',
  ].join('\n');
  const runs = await routeSuccessfulRuns(page, { runId: `f04-rejected-${Date.now()}`, eventBody: events });
  await gotoProject(page, projectId);
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.long });
  await input.fill('Preserve the original F04 draft');
  const uploaded = page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/upload'));
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'f04-brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Original F04 attachment bytes.\n'),
  });
  expect((await uploaded).ok()).toBeTruthy();
  const attachment = page.getByTestId('staged-attachments').getByTitle('f04-brief.txt', { exact: true });
  await expect(attachment).toBeVisible();
  await page.getByTestId('chat-send').click();
  const dialog = page.getByTestId('amr-concurrency-dialog');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await expect(input).toHaveText('Preserve the original F04 draft');
  await expect(attachment).toBeVisible();
  const retainedArtifact = await page.request.get(`/api/projects/${projectId}/files/existing-output.html`, {
    headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
  });
  expect(retainedArtifact.ok(), await retainedArtifact.text()).toBeTruthy();
  expect(await retainedArtifact.text()).toContain('Existing F04 output');
  // Inspect the first modal state before any in-dialog click can move focus
  // away from the send/stop control and conceal its lingering tooltip.
  await testInfo.attach('f04-initial-focus', { body: JSON.stringify(await page.evaluate(() => ({
    active: document.activeElement?.outerHTML,
    tooltip: document.querySelector('.od-tooltip-layer')?.outerHTML,
  })), null, 2), contentType: 'application/json' });
  await testInfo.attach('f04-initial-modal', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement)))
    .toBe(true);
  await expect(dialog).toHaveCSS('outline-style', 'none');
  // The frozen F04 frame uses normal line-height and a neutral palette;
  // inherited app typography compressed the title and shifted all content up.
  await expect(dialog.locator('h2')).toHaveCSS('line-height', 'normal');
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect.soft(await dialog.evaluate(element => {
    const style = getComputedStyle(element.parentElement!);
    return { background: style.backgroundColor, filter: style.backdropFilter };
  })).toEqual({ background: 'rgba(0, 0, 0, 0.28)', filter: 'none' });
  await expect(page.getByTestId('amr-concurrency-close')).toHaveCSS('font-size', '13.5px');
  // This offer is deliberately neutral even when app appearance uses a color.
  await page.locator('html').evaluate(element => element.style.setProperty('--accent', '#1A74FF'));
  const upgradeButton = page.getByTestId('amr-concurrency-upgrade');
  await expect(upgradeButton).toHaveCSS('background-color', 'rgb(53, 53, 53)');
  await upgradeButton.hover();
  await expect(upgradeButton).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await page.mouse.move(0, 0);
  await expect(upgradeButton).toHaveCSS('background-color', 'rgb(53, 53, 53)');
  await expect(dialog).toContainText('当前并发不足，请升级套餐后再试。');
  await expect(dialog.locator('li')).toHaveCount(4);
  await expect(dialog.locator('li')).toHaveText([
    '无需复杂配置，海量 SOTA 模型任选',
    '邀请成员免费加入，共享额度',
    '支持多模态图像创作，图文一站生成',
    '作品一键发布上线，链接随时分享',
  ]);
  await expect(dialog.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  await dialog.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
  await dialog.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
  await testInfo.attach('f04-dialog-default', { body: await dialog.screenshot(), contentType: 'image/png' });
  // Capture the actual window.open destination while preventing external navigation.
  await page.evaluate(() => { window.open = ((url: string | URL | undefined) => {
    document.documentElement.dataset.f04Upgrade = String(url); return null;
  }) as typeof window.open; });
  await page.getByTestId('amr-concurrency-upgrade').click();
  const target = new URL(await page.locator('html').getAttribute('data-f04-upgrade') ?? '');
  expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
  expect(target.searchParams.get('billing')).toBe('plan');
  expect(runs.bodies).toHaveLength(1);
  // Native modal interaction must also leave no background tooltip behind.
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await testInfo.attach('f04-viewport-1280x720', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('f04-dialog', { body: await dialog.screenshot(), contentType: 'image/png' });
  await testInfo.attach('f04-geometry', { body: JSON.stringify(await dialog.evaluate(element =>
    [element, ...element.querySelectorAll('h2,p,ul,li,button')].map(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { tag: node.tagName, text: node.textContent, x: rect.x, y: rect.y,
        width: rect.width, height: rect.height, font: style.font, lineHeight: style.lineHeight,
        background: style.backgroundColor, color: style.color, padding: style.padding, margin: style.margin };
    })), null, 2), contentType: 'application/json' });
  // The current app deliberately stays light on a dark OS. F04 must follow
  // that existing appearance policy without adding a separate theme surface.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByTestId('amr-concurrency-close').click();
  await expect(dialog).toHaveCount(0);
  const ownerCard = page.getByTestId('chat-concurrency-card');
  await expect(ownerCard).toContainText('可用并发 已用满');
  await expect(ownerCard).toContainText('当前并发不足，请升级套餐后再试。');
  await expect(page.getByTestId('chat-run-error-card')).toHaveCount(0);
  await expect.poll(async () => { const box = await ownerCard.boundingBox(); return [box?.width, box?.height]; })
    .toEqual([480, 118]);
  const ownerCardButton = ownerCard.getByRole('button', { name: '升级' });
  await expect(ownerCardButton).toHaveCSS('border-radius', '8px');
  await expect(ownerCardButton).toHaveCSS('border-top-width', '1px');
  await expect(ownerCardButton).toHaveCSS('border-top-color', 'rgb(0, 255, 8)');
  await expect.poll(async () => { const box = await ownerCardButton.boundingBox(); return [box?.width, box?.height]; })
    .toEqual([86, 44]);
  await testInfo.attach('f12-concurrency-card', { body: await ownerCard.screenshot(), contentType: 'image/png' });
  await ownerCardButton.click();
  await expect(dialog).toBeVisible();
  await page.getByTestId('amr-concurrency-close').click();
  await expect(dialog).toHaveCount(0);
  expect(runs.bodies).toHaveLength(1);

  const keyboardRuns = await routeSuccessfulRuns(page, {
    runId: `f04-keyboard-rejected-${Date.now()}`, eventBody: events,
  });
  await input.fill('Keyboard modal focus regression');
  await input.press('Enter');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await expect(dialog).toBeFocused();
  await expect(dialog).toHaveAccessibleName('可用并发不足');
  await testInfo.attach('f04-keyboard-initial-modal', {
    body: await page.screenshot(), contentType: 'image/png',
  });
  await expect(dialog).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  const closeButton = dialog.getByRole('button').first();
  await expect(closeButton).toBeFocused();
  await expect(closeButton).not.toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(input).toBeFocused();
  expect(keyboardRuns.bodies).toHaveLength(1);
  expect(runs.bodies).toHaveLength(1);
});

// UISTATE-F06-CLIENT: supplied 2026-10-20 .limit-message.limit-member
// has an 18px gap; .limit-cta uses neutral #353535 and #202020 only on hover.
// A browser is required here: the shared primary Button and this CSS Module
// participate in the real cascade; a component DOM test cannot resolve it.
test('[P0] F06 member concurrency notice preserves the frozen spacing and button states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await applyStandardMocks(page);
  await mockSignedInVelaAccount(page, { plan: 'go', balanceUsd: '100.00' });
  await routeAgents(page, [{ id: 'amr', name: 'OpenDesign AMR', bin: 'vela', available: true,
    version: 'test', models: [{ id: 'glm-5', label: 'glm-5' }] }]);
  const config = { mode: 'daemon', agentId: 'amr', skillId: null, designSystemId: null,
    onboardingCompleted: true, privacyDecisionAt: 1, agentModels: { amr: { model: 'glm-5' } },
    telemetry: { metrics: false, content: false, artifactManifest: false } };
  await seedBrowserConfig(page, config);
  await page.route('**/api/app-config', route => route.fulfill({ json: { config } }));
  const projectId = `f06-${testInfo.testId}-${Date.now()}`;
  await createProjectViaApi(page, projectId, 'F06 member concurrency notice', {
    accountPlan: 'go', accountBalanceUsd: '100.00', accountCredits: 1_000_000,
  });
  const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, workspaceType: 'team', role: 'member',
    planId: 'team_go', permissions: { ...AMR_PERSONAL_WORKSPACE_CONTEXT.permissions,
      canManageBilling: false, canManageAutoRecharge: false, canManageMembers: false } };
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context } }));
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({ json: {
    scope: { kind: 'team', projectId, workspaceId: context.workspaceId, visibility: 'personal', context },
  } }));
  await page.route('**/api/workspace/billing/preflight?**', route => route.fulfill({ json: { preflight: {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd: '100', funding: 'wallet',
    fundingCheck: 'available', modelCovered: false, codingPlan: { workspaceId: context.workspaceId,
      generatedAt: new Date().toISOString(), eligible: false, tier: null, windows: [] },
  } } }));
  const events = [
    'event: start', 'data: {"bin":"vela"}', '',
    'event: agent', 'data: {"type":"done_key","key":"f06-protocol-key"}', '',
    'event: error', 'data: {"message":"membership concurrency limit exceeded","error":{"code":"AGENT_EXECUTION_FAILED","message":"membership concurrency limit exceeded"},"failureDetail":"membership_concurrency_limit"}', '',
    'event: end', 'data: {"code":1,"status":"failed","failureDetail":"membership_concurrency_limit"}', '', '',
  ].join('\n');
  const runs = await routeSuccessfulRuns(page, { runId: `f06-rejected-${Date.now()}`, eventBody: events });
  await gotoProject(page, projectId);
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.long });
  await input.fill('F06 member retained draft');
  await page.getByTestId('chat-send').click();
  const dialog = page.getByTestId('amr-concurrency-dialog');
  const acknowledge = page.getByTestId('amr-concurrency-close');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await expect(dialog).toHaveAccessibleName('团队并发不足');
  await expect(dialog).toContainText('当前团队并发不足，请联系团队空间所有者升级订阅。');
  await expect(acknowledge).toHaveText('知道了');
  await expect(page.getByTestId('amr-concurrency-upgrade')).toHaveCount(0);
  await expect(dialog.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  await dialog.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => document.fonts.ready);
  await dialog.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await testInfo.attach('f06-initial-geometry', { body: JSON.stringify(await dialog.evaluate(element =>
    [element, ...element.querySelectorAll('h2,p,button')].map(node => {
      const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return { tag: node.tagName, text: node.textContent, width: rect.width, height: rect.height,
        margin: style.margin, background: style.backgroundColor, hover: node.matches(':hover'),
        focusVisible: node.matches(':focus-visible'), font: style.font };
    })), null, 2), contentType: 'application/json' });
  await testInfo.attach('f06-initial-viewport', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('f06-initial-dialog', { body: await dialog.screenshot(), contentType: 'image/png' });
  await expect.soft(dialog.locator('p')).toHaveCSS('margin-bottom', '18px', { timeout: T.short });
  await expect.soft(acknowledge).toHaveCSS('background-color', 'rgb(53, 53, 53)', { timeout: T.short });
  await expect(acknowledge).toHaveCSS('height', '40px');
  await expect(acknowledge).toHaveCSS('width', '432px');
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
  await acknowledge.hover();
  await expect(acknowledge).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  await page.mouse.move(0, 0);
  await expect.soft(acknowledge).toHaveCSS('background-color', 'rgb(53, 53, 53)', { timeout: T.short });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button').first()).toBeFocused();
  await expect(dialog.getByRole('button').first()).toHaveCSS('outline-color', 'rgb(21, 148, 71)');
  await expect(dialog.getByRole('button').first()).toHaveCSS('outline-width', '2px');
  await expect(dialog.getByRole('button').first()).toHaveCSS('outline-offset', '3px');
  await page.keyboard.press('Tab');
  await expect(acknowledge).toBeFocused();
  await expect(acknowledge).toHaveCSS('outline-color', 'rgb(21, 148, 71)');
  await expect(acknowledge).toHaveCSS('outline-width', '2px');
  await expect(acknowledge).toHaveCSS('outline-offset', '3px');
  await acknowledge.click();
  await expect(dialog).toHaveCount(0);
  const memberCard = page.getByTestId('chat-concurrency-card');
  await expect(memberCard).toContainText('可用并发 已用满');
  await expect(memberCard).toContainText('当前团队并发不足，请联系团队空间所有者升级订阅。');
  await expect(page.getByTestId('chat-run-error-card')).toHaveCount(0);
  await expect.poll(async () => { const box = await memberCard.boundingBox(); return [box?.width, box?.height]; })
    .toEqual([480, 118]);
  const memberCardButton = memberCard.getByRole('button', { name: '升级' });
  await expect(memberCardButton).toHaveCSS('border-radius', '8px');
  await expect(memberCardButton).toHaveCSS('border-top-width', '1px');
  await expect(memberCardButton).toHaveCSS('border-top-color', 'rgb(0, 255, 8)');
  await expect.poll(async () => { const box = await memberCardButton.boundingBox(); return [box?.width, box?.height]; })
    .toEqual([86, 44]);
  await testInfo.attach('f15-concurrency-card', { body: await memberCard.screenshot(), contentType: 'image/png' });
  await memberCardButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('当前团队并发不足，请联系团队空间所有者升级订阅。');
  await acknowledge.click();
  expect(runs.bodies).toHaveLength(1);
});

// 2026-10-27 user confirmation: Max uses the unified F04/F06 illustration
// frame, while F05 still offers waiting/manual resend, never a higher plan.
test('[P1] F05 Max Owner uses the unified dialog and preserves a manually editable draft', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await applyStandardMocks(page);
  await mockSignedInVelaAccount(page, { plan: 'max', balanceUsd: '100.00' });
  await routeAgents(page, [{ id: 'amr', name: 'OpenDesign AMR', bin: 'vela', available: true,
    version: 'test', models: [{ id: 'glm-5', label: 'glm-5' }] }]);
  const config = { mode: 'daemon', agentId: 'amr', skillId: null, designSystemId: null,
    onboardingCompleted: true, privacyDecisionAt: 1, agentModels: { amr: { model: 'glm-5' } },
    telemetry: { metrics: false, content: false, artifactManifest: false } };
  await seedBrowserConfig(page, config);
  await page.route('**/api/app-config', route => route.fulfill({ json: { config } }));
  const projectId = `f05-${testInfo.testId}-${Date.now()}`;
  await createProjectViaApi(page, projectId, 'F05 Max unified concurrency notice', {
    accountPlan: 'max', accountBalanceUsd: '100.00', accountCredits: 1_000_000,
  });
  const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, planId: 'team_max' };
  await page.route('**/api/workspace/context', route => route.fulfill({ json: { context } }));
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({ json: {
    scope: { kind: 'personal', projectId, workspaceId: context.workspaceId, visibility: 'personal', context },
  } }));
  await page.route('**/api/workspace/billing/preflight?**', route => route.fulfill({ json: { preflight: {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd: '100', funding: 'wallet',
    fundingCheck: 'available', modelCovered: false, codingPlan: { workspaceId: context.workspaceId,
      generatedAt: new Date().toISOString(), eligible: false, tier: null, windows: [] },
  } } }));
  const events = [
    'event: start', 'data: {"bin":"vela"}', '',
    'event: agent', 'data: {"type":"done_key","key":"f05-protocol-key"}', '',
    'event: error', 'data: {"message":"membership concurrency limit exceeded","error":{"code":"AGENT_EXECUTION_FAILED","message":"membership concurrency limit exceeded"},"failureDetail":"membership_concurrency_limit"}', '',
    'event: end', 'data: {"code":1,"status":"failed","failureDetail":"membership_concurrency_limit"}', '', '',
  ].join('\n');
  const runs = await routeSuccessfulRuns(page, { runId: `f05-rejected-${Date.now()}`, eventBody: events });
  await gotoProject(page, projectId);
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.long });
  const draft = 'Max 并发占满后保留这段草稿，等其他任务结束再手动发送';
  await input.fill(draft);
  await page.getByTestId('chat-send').click();
  const dialog = page.getByTestId('amr-concurrency-dialog');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await expect(dialog).toContainText('手动');
  await expect(dialog).not.toContainText('升级套餐');
  await expect(page.getByTestId('amr-concurrency-upgrade')).toHaveCount(0);
  await expect(dialog.locator('li')).toHaveCount(0);
  await expect(input).toHaveText(draft);
  await expect(dialog.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
  await dialog.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
  const dismiss = page.getByTestId('amr-concurrency-close');
  await expect(dismiss).toHaveCSS('height', '40px');
  await expect(dismiss).toHaveCSS('width', '432px');
  await testInfo.attach('f05-max-desktop-dialog', { body: await dialog.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await testInfo.attach('f05-max-desktop-page', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(width - 32);
    await expect(dismiss).toBeVisible();
    await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await testInfo.attach(`f05-max-mobile-${width}`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
  await dismiss.click();
  await expect(dialog).toHaveCount(0);
  await expect(input).toHaveText(draft);
  await expect(input).toBeEditable();
  await input.fill(`${draft}；已继续编辑`);
  await expect(input).toHaveText(`${draft}；已继续编辑`);
  expect(runs.bodies).toHaveLength(1);
  await testInfo.attach('f05-max-result', { body: JSON.stringify({
    boundary: 'Real web/daemon with controlled account, preflight and rejected-run HTTP. No real Link or provider call.',
    draftPreservedAndEditable: true, runPostsAfterDismissAndEdit: runs.bodies.length,
    desktopWidth: 480, mobileWidths: [358, 288], noHigherPlan: true,
  }, null, 2), contentType: 'application/json' });
});
