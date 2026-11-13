import { expect, test } from '@/playwright/suite';
import {
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  gotoProject,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import { routeAgents, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { runErrorCard } from '@/playwright/chat';
import { T } from '@/timeouts';

// OPEND-4367: a probe Edit must not turn a zero-project-change verification
// report into ARTIFACT_NOT_FOUND. The project-write control still must fail.
for (const projectWrite of [false, true]) {
  test(`[P1] verification ${projectWrite ? 'with an undelivered project edit fails' : 'with only a temporary script edit succeeds'}`, async ({ page }, testInfo) => {
    test.setTimeout(T.xlong);
    const config = {
      mode: 'daemon', apiKey: '', baseUrl: '', model: '', agentId: 'kimi',
      skillId: null, designSystemId: null, onboardingCompleted: true,
      privacyDecisionAt: 1,
      telemetry: { metrics: false, content: false, artifactManifest: false },
      agentModels: { kimi: { model: 'default', reasoning: 'default' } },
    };
    await seedBrowserConfig(page, config);
    await putAppConfig(page, config);
    await routeAgents(page, [{
      id: 'kimi', name: 'Kimi CLI', bin: 'kimi', available: true,
      version: 'test', models: [{ id: 'default', label: 'Default' }],
    }]);
    await page.route('**/api/integrations/vela/status*', (route) => route.fulfill({
      json: { loggedIn: true, profile: 'local', configPath: '/tmp/verification-amr/config.json',
        user: { id: 'verification-user', email: 'verification@example.com', plan: 'free' },
        account: { plan: 'free', balanceUsd: '0.00' } },
    }));
    const projectId = `verification-delivery-${projectWrite}-${Date.now()}`;
    const { conversationId } = await createProjectViaApi(page, projectId, 'Verify existing prototype');
    const existing = await page.request.post(`/api/projects/${projectId}/files`, {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      data: { name: 'index.html', content: '<!doctype html><html><body><h1>Existing prototype</h1></body></html>' },
    });
    expect(existing.ok(), await existing.text()).toBeTruthy();
    const detail = await page.request.get(`/api/projects/${projectId}`, {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
    });
    expect(detail.ok(), await detail.text()).toBeTruthy();
    const { resolvedDir } = await detail.json() as { resolvedDir: string };
    expect(resolvedDir).toBeTruthy();
    const report = projectWrite
      ? 'Attempted to update the project, but the edit failed.'
      : 'Verified the portrait and landscape layouts. No project files changed.';
    const events = [
      ['agent', { type: 'tool_use', id: 'probe', name: 'Edit', input: { filePath: '/tmp/od-probe/cdp.mjs' } }],
      ['agent', { type: 'tool_result', toolUseId: 'probe', content: 'Edit applied successfully.', isError: false }],
      ...(projectWrite ? [
        ['agent', { type: 'tool_use', id: 'project', name: 'Edit', input: { filePath: `${resolvedDir}/index.html` } }],
        ['agent', { type: 'tool_result', toolUseId: 'project', content: 'Edit failed.', isError: true }],
      ] : []),
      ['agent', { type: 'text_delta', delta: report }],
      ['end', { code: 0, status: 'succeeded', artifactCount: 0, artifactPaths: [] }],
    ];
    const runs = await routeSuccessfulRuns(page, {
      eventBody: events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''),
    });
    await gotoProject(page, projectId);
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible({ timeout: T.medium });
    await input.fill('Verify the existing prototype in portrait and landscape.');
    await expect(page.getByTestId('chat-send')).toBeEnabled();
    await input.press('Enter');
    await runs.expectCount(1);
    await expect.poll(async () => {
      const response = await page.request.get(`/api/projects/${projectId}/conversations/${conversationId}/messages`, {
        headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      });
      const { messages } = await response.json();
      const message = messages.findLast((message: { role: string }) => message.role === 'assistant');
      return {
        status: message?.runStatus,
        produced: message?.producedFiles?.length,
        trace: message?.traceObjectFiles?.length,
        delivery: message?.resultDeliveryState,
      };
    }, { timeout: T.long }).toEqual({
      status: 'succeeded', produced: 0, trace: 0,
      // report_only leaves no persisted delivery-error state.
      delivery: projectWrite ? 'no_result' : undefined,
    });
    if (projectWrite) {
      await expect(runErrorCard(page)).toBeVisible();
    } else {
      await expect(runErrorCard(page)).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('verification-report.png'), fullPage: true });
      await page.reload();
      await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.long });
      await expect(page.getByText(report, { exact: true })).toBeVisible();
      await expect(runErrorCard(page)).toHaveCount(0);
    }
  });
}
