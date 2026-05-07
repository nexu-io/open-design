import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    provider: 'composio',
    category: 'Developer tools',
    description: 'Read repository issues and pull requests.',
    status: 'available',
    auth: { provider: 'composio', configured: true },
    tools: [
      {
        name: 'list_issues',
        title: 'List issues',
        description: 'List recent issues from a repository.',
        safety: {
          sideEffect: 'read',
          approval: 'auto',
          reason: 'Read-only issue lookup.',
        },
        refreshEligible: true,
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    provider: 'composio',
    category: 'Communication',
    description: 'Search channels and messages.',
    status: 'connected',
    accountLabel: 'design-team',
    auth: { provider: 'composio', configured: true },
    tools: [],
  },
];

const IMAGE_TEMPLATE = {
  id: 'editorial-poster',
  surface: 'image',
  title: 'Editorial Poster',
  summary: 'A punchy launch poster for a product announcement.',
  category: 'Marketing',
  tags: ['poster', 'launch'],
  model: 'gpt-image-1',
  aspect: '4:5',
  source: {
    repo: 'open-design/test-prompts',
    license: 'MIT',
    author: 'Open Design QA',
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
});

test('prompt template retry preserves the edited body in project metadata', async ({ page }) => {
  let detailRequests = 0;
  await page.route('**/api/prompt-templates', async (route) => {
    await route.fulfill({ json: { promptTemplates: [IMAGE_TEMPLATE] } });
  });
  await page.route('**/api/prompt-templates/image/editorial-poster', async (route) => {
    detailRequests += 1;
    if (detailRequests === 1) {
      await route.fulfill({ status: 500, body: 'template unavailable' });
      return;
    }
    await route.fulfill({
      json: {
        promptTemplate: {
          ...IMAGE_TEMPLATE,
          prompt: 'Original poster prompt with dramatic type and product photography.',
        },
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('new-project-tab-image').click();
  await page.getByTestId('new-project-name').fill('Prompt template retry metadata');

  await page.getByTestId('prompt-template-trigger').click();
  await page.getByTestId('prompt-template-search').fill('poster');
  await page.getByRole('option', { name: /Editorial Poster/i }).click();

  await expect(page.getByTestId('prompt-template-error')).toBeVisible();
  await page.getByTestId('prompt-template-retry').click();
  await expect(page.getByTestId('prompt-template-error')).toHaveCount(0);
  await expect(page.getByTestId('prompt-template-body')).toContainText('Original poster prompt');

  await page.getByTestId('prompt-template-body').fill('');
  await expect(page.getByTestId('prompt-template-empty-hint')).toBeVisible();
  await page.getByTestId('prompt-template-body').fill(
    'Edited QA prompt: bold poster, one hero product, crisp headline.',
  );
  await page.getByTestId('create-project').click();

  const project = await fetchCurrentProject(page);
  expect(project.metadata?.promptTemplate).toMatchObject({
    id: 'editorial-poster',
    surface: 'image',
    title: 'Editorial Poster',
    prompt: 'Edited QA prompt: bold poster, one hero product, crisp headline.',
  });
});

test('live artifact empty connector CTA opens the gated connector setup path', async ({ page }) => {
  await routeConnectors(page, []);

  await gotoEntryHome(page);
  await page.getByTestId('new-project-tab-live-artifact').click();
  await expect(page.getByTestId('new-project-connectors')).toBeVisible();

  await page.getByTestId('new-project-connectors-empty').click();
  await expect(page.getByTestId('entry-tab-connectors')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('connector-gate')).toBeVisible();

  await page.getByTestId('connector-gate-action').click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('heading', { name: 'Connectors' })).toBeVisible();
  await expect(settingsDialog.getByPlaceholder('Paste Composio API key')).toBeVisible();
});

test('connectors search supports empty results and keyboard-closeable details', async ({ page }) => {
  await routeConnectors(page, CONNECTORS);

  await gotoEntryHome(page);
  await page.getByTestId('entry-tab-connectors').click();
  await expect(page.getByTestId('connector-grid-wrap')).toBeVisible();

  const search = page.getByTestId('connectors-search-input');
  await search.fill('git');
  await expect(connectorCard(page, 'github')).toBeVisible();
  await expect(connectorCard(page, 'slack')).toHaveCount(0);

  await search.fill('missing connector');
  await expect(page.getByTestId('connectors-empty')).toBeVisible();
  await search.press('Escape');
  await expect(page.getByTestId('connectors-empty')).toHaveCount(0);
  await expect(connectorCard(page, 'github')).toBeVisible();
  await expect(connectorCard(page, 'slack')).toBeVisible();

  await connectorCard(page, 'github').click();
  await expect(page.getByTestId('connector-drawer')).toBeVisible();
  await expect(page.getByTestId('connector-drawer')).toContainText('List issues');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('connector-drawer')).toHaveCount(0);
});

async function routeConnectors(page: Page, connectors: typeof CONNECTORS) {
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    const statuses = Object.fromEntries(
      connectors.map((connector) => [
        connector.id,
        {
          status: connector.status,
          accountLabel: connector.accountLabel,
        },
      ]),
    );
    await route.fulfill({ json: { statuses } });
  });
  await page.route('**/api/connectors/discovery*', async (route) => {
    await route.fulfill({
      json: {
        connectors,
        meta: { provider: 'composio' },
      },
    });
  });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

function connectorCard(page: Page, id: string) {
  return page.locator(`article.connector-card[data-connector-id="${id}"]`);
}

async function fetchCurrentProject(page: Page) {
  await expect(page).toHaveURL(/\/projects\/[^/]+/);
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  expect(projectId).toBeTruthy();

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      metadata?: {
        promptTemplate?: {
          id: string;
          surface: string;
          title: string;
          prompt: string;
        };
      };
    };
  };
  return body.project;
}
