import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import {
  captureVisual,
  captureVisualTarget,
  configureVisualPage,
  gotoVisualHome,
  gotoVisualWorkspace,
  mockSignedInVelaAccount,
  prepareVisualSettingsDialog,
  VISUAL_AMR_AGENT,
  VISUAL_CLI_AGENTS,
  waitForVisualFonts,
} from '@/playwright/visual';

test.describe.configure({ timeout: T.xlong });

test('[P2] captures the settings execution surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await expect(dialog.getByRole('tab', { name: /Local CLI/i })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-execution');
});

test('[P1] captures the settings Open Design account balance surface', async ({ page }) => {
  test.setTimeout(T.xlong);

  await configureVisualPage(page, {
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
    },
  });
  await mockSignedInVelaAccount(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  const amrCard = dialog.getByTestId('settings-agent-card-amr');
  await expect(amrCard).toContainText('Open Design');
  await expect(amrCard).toContainText('plus');
  await expect(amrCard).toContainText('$247.51');
  await expect(dialog.getByTestId('settings-agent-card-amr-upgrade')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-open-design-account');
});

test('[P2] captures the settings local CLI surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await dialog.getByRole('tab', { name: /Local CLI/i }).click();
  const codexCard = dialog.getByTestId('settings-agent-card-codex');
  const codexSelect = dialog.getByTestId('settings-agent-select-codex');
  await expect(codexCard).toHaveClass(/active/);
  await expect(codexSelect).toBeVisible();
  await expect(codexSelect.locator('.agent-card-title')).toContainText('Codex CLI');
  await expect(codexCard.locator('.agent-card-test-btn')).toBeVisible();
  await expect(codexCard.locator('.agent-card-config')).toBeVisible();
  await expect(codexCard.locator('.agent-card-model-summary')).toHaveCount(0);

  const claudeCard = dialog.getByTestId('settings-agent-card-claude');
  await expect(claudeCard).not.toHaveClass(/active/);
  await expect(claudeCard.locator('.agent-card-model-summary')).toContainText(/Default|CLI config/i);

  const unavailableCard = dialog.locator('.agent-card-unavailable').first();
  if (await unavailableCard.isVisible().catch(() => false)) {
    await expect(unavailableCard.locator('.agent-card-actions--inline')).toBeVisible();
    await expect(unavailableCard.locator('.agent-card-link--icon')).toBeVisible();
    await expect(unavailableCard.locator('.agent-card-link--ghost')).toBeVisible();
  }
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-local-cli');
});

test('[P2] captures the settings local CLI model dropdown surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await dialog.getByRole('tab', { name: /Local CLI/i }).click();
  await dialog.getByTestId('settings-agent-select-codex').click();
  const modelSelect = dialog.locator('.agent-card.active [role="combobox"]').first();
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  const popover = page.getByTestId('settings-agent-model-popover-codex');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('settings-agent-model-search-codex')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-local-cli-model-dropdown');
  await captureVisualTarget(page, 'visual-settings-local-cli-model-dropdown-popover', [modelSelect, popover]);
});

test('[P2] captures the settings BYOK surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await expect(dialog.getByRole('tablist', { name: 'API protocol' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok');
});

test('[P2] captures the settings BYOK OpenAI surface', async ({ page }) => {
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
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok-openai');
});

test('[P2] captures the settings BYOK model dropdown surface', async ({ page }) => {
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
  await gotoVisualWorkspace(page);

  const dialog = await prepareVisualSettingsDialog(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  const modelSelect = dialog.getByRole('combobox', { name: 'Model', exact: true });
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  const popover = page.getByTestId('settings-byok-model-popover');
  await expect(popover).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok-model-dropdown');
  await captureVisualTarget(page, 'visual-settings-byok-model-dropdown-popover', [modelSelect, popover]);
});
