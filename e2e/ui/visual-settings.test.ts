import { expect, test } from '@/playwright/suite';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  gotoVisualWorkspace,
  openSettingsDetailsFromHeader,
  VISUAL_CLI_AGENTS,
  waitForVisualFonts,
} from '@/playwright/visual';

test('[P2] captures the settings execution surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
  await expect(dialog.getByRole('tab', { name: /Local CLI/i })).toBeVisible();
  await expect(dialog.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-execution');
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

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: /Local CLI/i }).click();
  await expect(dialog.getByTestId('settings-agent-select-codex')).toBeVisible();
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

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: /Local CLI/i }).click();
  await dialog.getByTestId('settings-agent-select-codex').click();
  const modelSelect = dialog.locator('.agent-card.active [role="combobox"]').first();
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  await expect(page.getByTestId('settings-agent-model-popover-codex')).toBeVisible();
  await expect(page.getByTestId('settings-agent-model-search-codex')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-local-cli-model-dropdown');
});

test('[P2] captures the settings BYOK surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const dialog = await openSettingsDetailsFromHeader(page);
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

  const dialog = await openSettingsDetailsFromHeader(page);
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

  const dialog = await openSettingsDetailsFromHeader(page);
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  const modelSelect = dialog.getByRole('combobox', { name: 'Model', exact: true });
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  await expect(page.getByTestId('settings-byok-model-popover')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok-model-dropdown');
});
