import { expect, test } from '@/playwright/suite';
import {
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  gotoProject,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import {
  routeAgents,
  routeSuccessfulRuns,
  suppressWhatsNew,
} from '@/playwright/mock-factory';
import { T } from '@/timeouts';
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

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: T.medium });
  await input.fill(prompt);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await input.press('Enter');
}
