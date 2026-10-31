import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { startLocalAnalyticsCollector } from '@/playwright/local-analytics-collector';
import { T } from '@/timeouts';
import { ensureRailOpen } from '@/playwright/rail';

type Fixture = { origin: string; linkUrl: string; webUrl: string; recipients: string[];
  actor: { userId: string; email: string; cookie: string; controlKey: string; runtimeKey: string; workspaceId: string; memberId: string } };
const fixturePath = process.env.OD_ANALYTICS_REAL_FIXTURE;
const outputDir = process.env.OD_ANALYTICS_PRIVATE_OUTPUT;
const velaBin = process.env.OD_ANALYTICS_VELA_BIN;
const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture : null;
test.use({actionTimeout: T.medium, navigationTimeout: T.long});

test('[P1] existing invite events match real local API outcomes without recipient or credential payloads', async ({ page, context }, info) => {
  test.skip(!fixture, 'Requires an explicitly owned local API fixture');
  test.setTimeout(T.xlong * 6);
  if (!fixture || !fixturePath || !outputDir || !velaBin) throw new Error('Complete private local fixture required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Fixture must be private');
  for (const endpoint of [fixture.origin, fixture.linkUrl, fixture.webUrl])
    if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Local endpoints required');
  const actor = fixture.actor;
  const namespace = `safe005-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const suite = createToolsDevSuite({ root, namespace, ownerPid: process.pid,
    dataDir: join(root, 'scratch', 'data'), toolsDevRoot: join(root, 'scratch', 'tools-dev'), codexHomeDir: join(root, 'scratch', 'codex-home') });
  const amrHome = join(root, 'scratch', 'amr-home');
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await mkdir(suite.dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
    apiUrl: fixture.origin, linkUrl: fixture.linkUrl,
    user: { id: actor.userId, email: actor.email, name: 'SAFE005 local owner' },
  } } }), { mode: 0o600 });
  const config = { privacyDecisionAt: 1, telemetry: { metrics: true, content: false, artifactManifest: false },
    mode: 'daemon', agentId: 'amr', model: 'deepseek-v4.1-flash', onboardingCompleted: true,
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: velaBin } } };
  await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config));
  const collector = await startLocalAnalyticsCollector();
  const env = { AMR_HOME: amrHome, VELA_BIN: velaBin, VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local',
    VELA_API_URL: fixture.origin, VELA_LINK_URL: fixture.linkUrl, VELA_CONTROL_KEY: actor.controlKey,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.webUrl,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
    POSTHOG_KEY: 'phc_safe005_local_only', POSTHOG_HOST: collector.host, OD_TELEMETRY_ENV: 'test' };
  const business: Array<{ status: number; body: unknown }> = [];
  const external: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.hostname); await route.abort(); return;
    }
    await route.continue();
  });
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/workspace/invite' && response.request().method() === 'POST')
      void response.json().then(body => business.push({ status: response.status(), body }));
  });
  let started = false;
  let businessPassed = false;
  try {
    await suite.startWeb(env); started = true;
    await warmPlaywrightWebRuntime(suite.url.web('/'));
    await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
    await page.addInitScript(({ config, selection }) => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(selection));
    }, { config, selection: { workspaceId: actor.workspaceId, workspaceMemberId: actor.memberId } });
    await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
    const switcher = page.getByTestId('workspace-switcher');
    await expect(switcher).toBeVisible({ timeout: T.xlong });
    const onboardingSkip = page.getByRole('button', { name: '暂时跳过', exact: true });
    if (await onboardingSkip.isVisible()) await onboardingSkip.click();
    await writeFile(join(outputDir, 'stage-before-switcher.png'), await page.screenshot());
    await ensureRailOpen(page);
    await switcher.click();
    await page.getByRole('menuitem', { name: /邀请同事/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: T.long });
    await dialog.locator('footer').getByRole('button', { name: '取消', exact: true }).click();
    expect(business).toHaveLength(0);
    await ensureRailOpen(page);
    await switcher.click();
    await page.getByRole('menuitem', { name: /邀请同事/ }).click();
    const emails = [...fixture.recipients, actor.email];
    for (let i = 0; i < emails.length; i += 1) {
      if (i) await dialog.getByRole('button', { name: /添加成员/ }).click();
      await dialog.locator('input[type=email]').nth(i).fill(emails[i]!);
    }
    await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect.poll(() => business.length, { timeout: T.long }).toBe(1);
    expect(business[0]!.status).toBe(200);
    const rows = (business[0]!.body as { results: Array<{ ok: boolean }> }).results;
    expect(rows.filter(row => row.ok)).toHaveLength(2);
    expect(rows.filter(row => !row.ok)).toHaveLength(1);
    await expect.poll(() => collector.events().filter(event => event.event === 'workspace_invite_result').length, { timeout: T.long }).toBeGreaterThan(0);
    const outcomes = collector.events().filter(event => event.event === 'workspace_invite_result');
    const properties = outcomes.at(-1)?.properties;
    expect(properties).toMatchObject({ result: 'partial_success', requested_count: 3, succeeded_count: 2, failed_count: 1,
      workspace_key: actor.workspaceId, workspace_role: 'owner', workspace_type: 'team', plan_bucket: 'free', entry_from: 'workspace_switcher' });
    expect(collector.events().some(event => event.event === 'surface_view' && event.properties?.area === 'workspace_invite_dialog')).toBe(true);
    expect(collector.events().some(event => event.event === 'ui_click' && event.properties?.element === 'submit')).toBe(true);
    await writeFile(join(outputDir, 'invite-result.png'), await page.screenshot());
    businessPassed = true;
  } finally {
    await writeFile(join(outputDir, 'final-state.png'), await page.screenshot()).catch(() => undefined);
    await page.close().catch(() => undefined);
    if (started) await suite.stopWeb(env).catch(() => undefined);
    const saveCapture = () => writeFile(join(outputDir, 'capture.private.json'),
      JSON.stringify({ records: collector.records, events: collector.events(), business }, null, 2), { mode: 0o600 });
    try {
      await saveCapture();
    } finally {
      await collector.close();
    }
    // Closing drains in-flight requests. Preserve that complete input before any assertion.
    await saveCapture();
    if (businessPassed) {
      const privacy = collector.auditPrivacy({ sensitiveValues: [actor.controlKey, actor.runtimeKey, actor.cookie] });
      await writeFile(join(outputDir, 'result.safe.json'), JSON.stringify({ source: 'real local API and daemon; analytics local collector',
        businessRequests: business.length, successfulRecipients: 2, failedRecipients: 1, expectedOutcome: 'partial_success',
        httpCaptures: collector.records.length, events: collector.events().length, privacyFindings: privacy.findings.length,
        externalRequestsBlocked: [...new Set(external)], passed: true }, null, 2));
      if (info.status === info.expectedStatus) await rm(root, { recursive: true, force: true });
    }
  }
});
