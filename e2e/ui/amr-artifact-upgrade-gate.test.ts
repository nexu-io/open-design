import { expect, test } from '@/playwright/suite';
import {
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  gotoProject,
  mockAmrPersonalWorkspace,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import {
  routeAgents,
  routeSuccessfulRuns,
  suppressWhatsNew,
} from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import type { Page } from '@playwright/test';

const KIMI_AGENT = {
  id: 'kimi',
  name: 'Kimi CLI',
  bin: 'kimi',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};

const KIMI_CONFIG = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'kimi',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
  agentModels: { kimi: { model: 'default', reasoning: 'default' } },
};

const KIMI_ARTIFACT_RUN = [
  'event: stdout',
  `data: ${JSON.stringify({
    chunk: '<artifact identifier="kimi-upgrade-gate" type="text/html" title="Kimi artifact"><!doctype html><html><body><h1>Kimi artifact</h1></body></html></artifact>',
  })}`,
  '',
  'event: end',
  'data: {"code":0,"status":"succeeded","artifactCount":1}',
  '',
  '',
].join('\n');

test('[P1] Kimi artifact follow-ups bypass the AMR Free upgrade dialog', async ({ page }) => {
  test.setTimeout(T.xlong);

  await suppressWhatsNew(page);
  await routeAgents(page, [KIMI_AGENT]);
  await page.route('**/api/integrations/vela/status*', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        profile: 'local',
        configPath: '/tmp/.amr/config.json',
        user: {
          id: 'kimi-upgrade-gate-user',
          email: 'kimi-upgrade-gate@example.com',
          plan: 'free',
        },
        account: { plan: 'free', balanceUsd: '0.00' },
      },
    });
  });
  await seedBrowserConfig(page, KIMI_CONFIG);
  await putAppConfig(page, KIMI_CONFIG);
  const projectId = `kimi-upgrade-gate-${Date.now()}`;
  const runs = await routeSuccessfulRuns(page, {
    runIdPrefix: 'kimi-upgrade-gate',
    eventBody: async (requestIndex) => {
      if (requestIndex === 1) {
        const response = await page.request.post(`/api/projects/${projectId}/files`, {
          headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
          data: {
            name: 'kimi-upgrade-gate.html',
            content: '<!doctype html><html><body><h1>Kimi artifact</h1></body></html>',
            artifactManifest: {
              version: 1,
              kind: 'html',
              title: 'Kimi artifact',
              entry: 'kimi-upgrade-gate.html',
              renderer: 'html',
              status: 'complete',
              exports: ['html'],
              primary: true,
              metadata: { identifier: 'kimi-upgrade-gate' },
            },
          },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      }
      return KIMI_ARTIFACT_RUN;
    },
  });

  await createProjectViaApi(page, projectId, 'Kimi upgrade gate');
  await gotoProject(page, projectId);

  await sendPrompt(page, 'Create a Kimi artifact');
  await runs.expectCount(1);
  await expect(page.frameLocator(
    '[data-testid="artifact-preview-frame"]:visible, '
    + '[data-testid="artifact-preview-frame-url-load"]:visible, '
    + '[data-testid="artifact-preview-frame-srcdoc"]:visible, '
    + '[data-testid="live-artifact-preview-frame"]:visible',
  ).getByRole('heading', { name: 'Kimi artifact' })).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('amr-artifact-upgrade-dialog')).toHaveCount(0);

  await sendPrompt(page, 'Refine the Kimi artifact');
  await runs.expectCount(2, {
    timeout: T.long,
    message: 'the Kimi follow-up should reach POST /api/runs without an AMR upsell gate',
  });
  await expect(page.getByTestId('amr-artifact-upgrade-dialog')).toHaveCount(0);
});

test('[P1] generated Free AMR artifacts return Home without the removed upgrade card', async ({ page }) => {
  test.setTimeout(T.xlong);
  await suppressWhatsNew(page);
  const projectId = `amr-no-home-upsell-${Date.now()}`;
  const model = 'deepseek-v4.1-flash';
  const config = { ...KIMI_CONFIG, agentId: 'amr', agentModels: { amr: { model, reasoning: 'default' } } };
  await routeAgents(page, [{ ...KIMI_AGENT, id: 'amr', name: 'OpenDesign Cloud', bin: 'vela', models: [{ id: model, label: model }] }]);
  await page.route('**/api/amr/models', (route) => route.fulfill({ json: { source: 'remote', models: [{ id: model, label: model }], refreshing: false } }));
  await mockSignedInVelaAccount(page, { plan: 'free', balanceUsd: '20.00' });
  await mockAmrPersonalWorkspace(page, projectId, { accountBalanceUsd: '20.00', accountCredits: 2000, accountPlan: 'free', fundingCheck: 'available' });
  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);
  const runs = await routeSuccessfulRuns(page, {
    runIdPrefix: 'amr-no-home-upsell',
    eventBody: async (requestIndex) => {
      if (requestIndex === 1) {
        const response = await page.request.post(`/api/projects/${projectId}/files`, {
          headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
          data: {
            name: 'completed.html',
            content: '<!doctype html><html><body><h1>Completed AMR artifact</h1></body></html>',
            artifactManifest: { version: 1, kind: 'html', title: 'Completed AMR artifact', entry: 'completed.html', renderer: 'html', status: 'complete', exports: ['html'], primary: true },
          },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      }
      return KIMI_ARTIFACT_RUN.replaceAll('Kimi artifact', 'Completed AMR artifact');
    },
  });
  await page.addInitScript(() => {
    const observed = window as typeof window & { __artifactCompletions?: Array<{ runId?: string; agentId?: string; artifactCount?: number; result?: string }> };
    observed.__artifactCompletions = [];
    window.addEventListener('open-design:daemon-run-finished', (event) => {
      observed.__artifactCompletions?.push((event as CustomEvent).detail);
    });
  });
  await createProjectViaApi(page, projectId, 'AMR Home card removal');
  await gotoProject(page, projectId);
  await sendPrompt(page, 'Generate the AMR artifact');
  await runs.expectCount(1);
  // Observe the real completion event before leaving: an idle or empty Home
  // would not exercise the removed card's former trigger.
  await expect(page.frameLocator(
    '[data-testid="artifact-preview-frame"]:visible, '
    + '[data-testid="artifact-preview-frame-url-load"]:visible, '
    + '[data-testid="artifact-preview-frame-srcdoc"]:visible, '
    + '[data-testid="live-artifact-preview-frame"]:visible',
  ).getByRole('heading', { name: 'Completed AMR artifact' })).toBeVisible({ timeout: T.long });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __artifactCompletions?: Array<{ agentId?: string; artifactCount?: number; result?: string }> }).__artifactCompletions?.filter(
      (event) => event.agentId === 'amr' && event.result === 'success' && (event.artifactCount ?? 0) > 0,
    ).length ?? 0,
  )).toBe(1);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('amr-artifact-upgrade-home-card')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('generated-artifact-home-no-card.png'), fullPage: true, animations: 'disabled' });
  // Return via normal project navigation, keeping the shell-mounted Gate.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  await expect(page.getByTestId('chat-composer-input')).toBeEditable({ timeout: T.long });
  await sendPrompt(page, 'Refine the completed artifact');
  await runs.expectCount(2, { timeout: T.long, message: 'Home visit keeps the original same-session modal suppression' });
  await expect(page.getByTestId('amr-artifact-upgrade-dialog')).toHaveCount(0);
});

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.medium });
  await input.fill(prompt);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await input.press('Enter');
}
