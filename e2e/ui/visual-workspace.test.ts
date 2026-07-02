import { expect, test } from '@/playwright/suite';
import {
  captureVisual,
  captureVisualTarget,
  configureVisualPage,
  gotoVisualHome,
  gotoVisualWorkspace,
  mockSignedInVelaAccount,
  prepareVisualAvatarMenu,
  prepareVisualWorkspaceFileList,
  prepareVisualWorkspacePreview,
  openSettingsDetailsFromHeader,
  VISUAL_AMR_AGENT,
  VISUAL_CLI_AGENTS,
} from '@/playwright/visual';

test('[P2] captures the project workspace surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await prepareVisualWorkspaceFileList(page);

  await captureVisual(page, 'visual-project-workspace');
});

test('[P2] captures the workspace staged contexts surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await prepareVisualWorkspaceFileList(page);
  await expect(page.getByTestId('staged-contexts')).toBeVisible();
  await expect(page.getByTestId('staged-contexts')).not.toBeEmpty();

  await captureVisual(page, 'visual-workspace-staged-contexts');
});

test('[P1] @critical captures CSS hotspot workspace, preview, and settings surfaces', async ({ page }) => {
  test.setTimeout(90_000);

  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await prepareVisualWorkspaceFileList(page);
  await captureVisual(page, 'visual-critical-workspace');

  await prepareVisualWorkspacePreview(page);
  await captureVisual(page, 'visual-critical-workspace-preview');

  const dialog = await openSettingsDetailsFromHeader(page);
  await expect(dialog.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();
  await captureVisual(page, 'visual-critical-settings');
});

test('[P2] captures the topbar execution switcher surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toBeVisible();

  await captureVisual(page, 'visual-topbar-execution-switcher');
  await captureVisualTarget(
    page,
    'visual-topbar-execution-switcher-popover',
    page.getByTestId('inline-model-switcher-popover'),
  );
});

test('[P1] captures the topbar Open Design account balance surface', async ({ page }) => {
  test.setTimeout(60_000);

  await configureVisualPage(page, {
    agents: [...VISUAL_CLI_AGENTS, VISUAL_AMR_AGENT],
    config: {
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
    },
  });
  await mockSignedInVelaAccount(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  const [amrBox, claudeBox, codexBox] = await Promise.all([
    popover.getByTestId('inline-model-switcher-agent-amr').boundingBox(),
    popover.getByTestId('inline-model-switcher-agent-claude').boundingBox(),
    popover.getByTestId('inline-model-switcher-agent-codex').boundingBox(),
  ]);
  expect(amrBox).toBeTruthy();
  expect(claudeBox).toBeTruthy();
  expect(codexBox).toBeTruthy();
  expect(amrBox!.y).toBeLessThan(claudeBox!.y);
  expect(amrBox!.y).toBeLessThan(codexBox!.y);
  await expect(popover.locator('.inline-switcher__account')).toContainText('Open Design');
  await expect(popover.locator('.inline-switcher__account')).toContainText('plus');
  await expect(popover.locator('.inline-switcher__account')).toContainText('$247.51');
  const upgrade = page.getByTestId('inline-model-switcher-account-upgrade');
  await expect(upgrade).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await upgrade.click();
  const popup = await popupPromise;
  const upgradeUrl = new URL(popup.url());
  await popup.close();
  expect(upgradeUrl.searchParams.get('view')).toBe('plans');
  expect(upgradeUrl.searchParams.get('od_origin')).toBe('open_design');
  expect(upgradeUrl.searchParams.get('od_entry_source')).toBe('inline_amr_upgrade');
  expect(upgradeUrl.searchParams.get('od_entry_id')).toBeTruthy();

  await captureVisual(page, 'visual-topbar-open-design-account');
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
  const trigger = page.getByTestId('inline-model-switcher-agent-model');
  const popover = page.getByTestId('inline-model-switcher-agent-model-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-model-search')).toBeVisible();

  await captureVisual(page, 'visual-topbar-local-cli-model-dropdown');
  await captureVisualTarget(page, 'visual-topbar-local-cli-model-dropdown-popover', [trigger, popover]);
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
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-api')).toHaveAttribute('aria-selected', 'true');

  await captureVisual(page, 'visual-topbar-byok-switcher');
  await captureVisualTarget(
    page,
    'visual-topbar-byok-switcher-popover',
    page.getByTestId('inline-model-switcher-popover'),
  );
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
  const trigger = page.getByTestId('inline-model-switcher-api-model');
  await trigger.click();
  const popover = page.getByTestId('inline-model-switcher-api-model-popover');
  await expect(popover).toBeVisible();

  await captureVisual(page, 'visual-topbar-byok-model-dropdown');
  await captureVisualTarget(page, 'visual-topbar-byok-model-dropdown-popover', [trigger, popover]);
});

test('[P2] captures the avatar menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await prepareVisualAvatarMenu(page);

  await captureVisual(page, 'visual-avatar-menu');
  await captureVisualTarget(page, 'visual-avatar-menu-panel', menu);
});

test('[P1] Avatar menu surfaces the signed-in plan/balance and upgrade entry', async ({ page }) => {
  test.setTimeout(60_000);

  await configureVisualPage(page, {
    agents: [...VISUAL_CLI_AGENTS, VISUAL_AMR_AGENT],
    config: {
      mode: 'daemon',
      agentId: 'amr',
      agentModels: { amr: { model: 'deepseek-v4-flash', reasoning: 'default' } },
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
    },
  });
  await mockSignedInVelaAccount(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await prepareVisualAvatarMenu(page);
  const agentOrder = await menu.locator('[data-testid^="avatar-agent-option-"]').evaluateAll(
    (nodes) => nodes.map((node) => (node as HTMLElement).dataset.testid),
  );
  expect(agentOrder.slice(0, 3)).toEqual([
    'avatar-agent-option-amr',
    'avatar-agent-option-claude',
    'avatar-agent-option-codex',
  ]);
  const row = menu.locator('.avatar-amr-row');
  await expect(row).toContainText('Open Design');
  await expect(row).toContainText('Plus');
  await expect(row).toContainText('$247.51');
  const upgrade = row.locator('.avatar-amr-row__upgrade');
  await expect(upgrade).toHaveAttribute('href', /view=plans/);
  const popupPromise = page.waitForEvent('popup');
  await upgrade.click();
  const popup = await popupPromise;
  const upgradeUrl = new URL(popup.url());
  await popup.close();
  expect(upgradeUrl.searchParams.get('view')).toBe('plans');
  expect(upgradeUrl.searchParams.get('od_origin')).toBe('open_design');
  expect(upgradeUrl.searchParams.get('od_entry_source')).toBe('avatar_amr_upgrade');
  expect(upgradeUrl.searchParams.get('od_entry_id')).toBeTruthy();

  await captureVisual(page, 'visual-avatar-open-design-account');
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

  const menu = await prepareVisualAvatarMenu(page);
  await expect(menu.getByTestId('avatar-agent-option-claude')).toBeVisible();
  await expect(menu.getByTestId('avatar-agent-option-codex')).toBeVisible();

  await captureVisual(page, 'visual-avatar-local-agent-list');
  await captureVisualTarget(page, 'visual-avatar-local-agent-list-panel', menu);
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

  const menu = await prepareVisualAvatarMenu(page);
  const modelSelect = menu.locator('.avatar-model-section [role="combobox"]').first();
  await expect(modelSelect).toBeVisible();
  await modelSelect.click();
  const popover = page.getByTestId('avatar-model-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('avatar-model-search')).toBeVisible();

  await captureVisual(page, 'visual-project-avatar-model-dropdown');
  await captureVisualTarget(page, 'visual-project-avatar-model-dropdown-popover', [modelSelect, popover]);
});
