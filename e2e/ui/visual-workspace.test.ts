import { expect, test } from '@/playwright/suite';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  gotoVisualWorkspace,
  openAvatarMenu,
  openSettingsDetailsFromHeader,
  VISUAL_AMR_AGENT,
  VISUAL_CLI_AGENTS,
  waitForVisualFonts,
} from '@/playwright/visual';

test('[P2] captures the project workspace surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-project-workspace');
});

test('[P2] captures the workspace staged contexts surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await page.getByTestId('design-files-tab').click();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('staged-contexts')).toBeVisible();
  await expect(page.getByTestId('staged-contexts')).not.toBeEmpty();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-workspace-staged-contexts');
});

test('[P1] @critical captures CSS hotspot workspace, preview, and settings surfaces', async ({ page }) => {
  test.setTimeout(90_000);

  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await waitForVisualFonts(page);
  await captureVisual(page, 'visual-critical-workspace');

  await page.getByTestId('design-files-tab').click();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
  const fileRow = page.getByTestId('design-file-row-index.html');
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole('button').first().click();
  const preview = page.getByTestId('design-file-preview');
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: /^Open$/ }).click();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', {
      name: 'Visual CSS Smoke',
    }),
  ).toBeVisible();
  await captureVisual(page, 'visual-critical-workspace-preview');

  const dialog = await openSettingsDetailsFromHeader(page);
  await expect(dialog.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();
  await captureVisual(page, 'visual-critical-settings');
});

test('[P2] captures the topbar execution switcher surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toBeVisible();

  await captureVisual(page, 'visual-topbar-execution-switcher');
});

test('[P2] captures the topbar local CLI model dropdown surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'claude',
      agentModels: { claude: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await page.getByTestId('inline-model-switcher-agent-model').click();
  await expect(page.getByTestId('inline-model-switcher-agent-model-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-model-search')).toBeVisible();

  await captureVisual(page, 'visual-topbar-local-cli-model-dropdown');
});

test('[P2] captures the topbar BYOK execution switcher surface', async ({ page }) => {
  await configureVisualPage(page, {
    config: {
      mode: 'api',
      apiKey: 'sk-visual',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      agentId: null,
    },
  });
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-api')).toHaveAttribute('aria-selected', 'true');

  await captureVisual(page, 'visual-topbar-byok-switcher');
});

test('[P2] captures the topbar BYOK model dropdown surface', async ({ page }) => {
  await configureVisualPage(page, {
    config: {
      mode: 'api',
      apiKey: 'sk-visual',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      agentId: null,
    },
  });
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await page.getByTestId('inline-model-switcher-api-model').click();
  await expect(page.getByTestId('inline-model-switcher-api-model-popover')).toBeVisible();

  await captureVisual(page, 'visual-topbar-byok-model-dropdown');
});

test('[P2] captures the avatar menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  // Settings moved out of the avatar menu to the header gear (footer-toolbar
  // layout); assert an agent option is present instead.
  await expect(menu.locator('.avatar-item').first()).toBeVisible();

  await captureVisual(page, 'visual-avatar-menu');
});

test('[P1] Avatar menu exposes the AMR account wallet entry for the active AMR agent', async ({ page }) => {
  await configureVisualPage(page, {
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      mode: 'daemon',
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  const amrAccount = menu.locator('.avatar-amr-account-link');
  await expect(amrAccount).toContainText('AMR account');
  await expect(amrAccount).toContainText('Balance & recharge');
  await expect(amrAccount).toHaveAttribute(
    'href',
    'https://vela.powerformer.net/wallet?source=open_design',
  );
});

test('[P2] captures the avatar local agent list surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  await expect(menu.getByTestId('avatar-agent-option-claude')).toBeVisible();
  await expect(menu.getByTestId('avatar-agent-option-codex')).toBeVisible();

  await captureVisual(page, 'visual-avatar-local-agent-list');
});

test('[P2] captures the avatar local agent model dropdown surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'claude',
      agentModels: { claude: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  const modelSelect = menu.locator('.avatar-model-section [role="combobox"]').first();
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  await expect(page.getByTestId('avatar-model-popover')).toBeVisible();
  await expect(page.getByTestId('avatar-model-search')).toBeVisible();

  await captureVisual(page, 'visual-project-avatar-model-dropdown');
});
