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

// The shared fixture's codex entry, reused by the reasoning-readout capture
// with reasoning options bolted on (see the comment there for why they are not
// added to `VISUAL_CLI_AGENTS` itself).
const VISUAL_CODEX_AGENT = VISUAL_CLI_AGENTS.find((agent) => agent.id === 'codex')!;
const VISUAL_CODEX_REASONING_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
] as const;

test('[P2] captures the project workspace surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await prepareVisualWorkspaceFileList(page);

  await captureVisual(page, 'visual-project-workspace');
});

test('[P1] keeps the project account action host anchored to the right edge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const accountActionsRect = await page
    .getByTestId('workspace-chrome-account-actions')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
  expect(accountActionsRect.left).toBeGreaterThan(1000);
  expect(1280 - accountActionsRect.right).toBeLessThanOrEqual(24);
});

test('[P2] captures the workspace staged contexts surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  await prepareVisualWorkspaceFileList(page);
  // The row is no longer unconditionally present: 56b538aa4 ("compact the
  // project composer like #5517") moved the design-system picker out of the
  // staged-context bar into the composer's icon row, and the picker was the
  // only thing keeping the bar mounted on a fresh project. `StagedRunContexts`
  // now renders once the run genuinely carries context, so stage an attachment
  // — the fixture already answers `/api/projects/*/upload` with
  // visual-reference.txt — instead of asserting a bar the composer only used to
  // draw because the picker lived inside it.
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/upload') && response.request().method() === 'POST',
  );
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'visual-reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Visual staged-context fixture.\n', 'utf8'),
  });
  expect((await uploadResponse).ok()).toBeTruthy();

  const stagedContexts = page.getByTestId('staged-contexts');
  await expect(stagedContexts).toBeVisible();
  // Stronger than the old `not.toBeEmpty()`: name the chip we staged, so an
  // empty-but-present bar cannot satisfy the capture.
  await expect(
    stagedContexts.locator('.staged-name', { hasText: 'visual-reference.txt' }),
  ).toBeVisible();

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
  // Assert the section nav, not a heading — same reason `prepareVisualSettingsDialog`
  // does: the surface's own <h2> is consumed as its accessible name via
  // aria-labelledby, and opening from a project lands on the execution section
  // whose heading reads "Models & providers", so a /Settings|General|Execution
  // mode/ probe can never match either presentation.
  await expect(dialog.getByTestId('settings-nav-execution')).toBeVisible();
  await captureVisual(page, 'visual-critical-settings');
});

test('[P2] captures the topbar execution switcher surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // ef9c8cd8b made the home top-bar switcher `compact` (EntryShell passes the
  // flag), which hides the mode segmented control: switching execution mode is
  // configuration and lives in Settings → Execution. What the popover keeps is
  // the active agent's model list plus the route to those settings, so assert
  // that pair. `inline-model-switcher-mode-daemon` still exists in
  // InlineModelSwitcher, but only in the non-compact shape the top bar no
  // longer mounts — pin its absence so a regression that re-mounts the console
  // here is still caught.
  await expect(popover.getByTestId('inline-model-switcher-compact-model-default')).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-mode-daemon')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-open-settings')).toBeVisible();

  await captureVisual(page, 'visual-topbar-execution-switcher');
  await captureVisualTarget(
    page,
    'visual-topbar-execution-switcher-popover',
    page.getByTestId('inline-model-switcher-popover'),
  );
});

test('[P1] captures the topbar OpenDesign model picker with no account surface', async ({ page }) => {
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
  // Count the signed-in status requests so the "no account surface" assertions
  // below cannot pass by racing ahead of the popover's own fetch. `fallback()`
  // hands the request straight to mockSignedInVelaAccount's handler, so the
  // payload stays defined in exactly one place.
  let velaStatusRequests = 0;
  await page.route('**/api/integrations/vela/status', async (route) => {
    velaStatusRequests += 1;
    await route.fallback();
  });
  await gotoVisualHome(page);

  const requestsBeforeOpen = velaStatusRequests;
  await page.getByTestId('inline-model-switcher-chip').click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // InlineModelSwitcher refetches the AMR status whenever the popover opens
  // with OpenDesign installed, so a landed response proves the signed-in
  // render happened.
  await expect.poll(() => velaStatusRequests).toBeGreaterThan(requestsBeforeOpen);

  // ef9c8cd8b's compact home popover lists the active agent's models and
  // nothing else. The agent grid (which is where the Open-Design-first ordering
  // was observable), the account block with its plan badge + balance, and the
  // 升级 entry all belong to the non-compact shape that the top bar stopped
  // mounting — account and billing surfaces live in the nav rail and Settings
  // now. Coverage did not disappear with the assertions: the live plan/balance/
  // upgrade card is captured by visual-settings.test.ts's "settings OpenDesign
  // account balance" case in this same lane, and the `inline_amr_upgrade`
  // attribution URL by apps/web/tests/components/InlineModelSwitcher.test.tsx
  // ("routes inline upgrades through the signed-in AMR profile").
  await expect(popover.getByTestId('inline-model-switcher-compact-model-deepseek-v4-flash')).toBeVisible();
  await expect(popover.locator('.inline-switcher__agent.is-active')).toHaveCount(1);
  await expect(popover.locator('.inline-switcher__account')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-account-upgrade')).toHaveCount(0);
  await expect(popover).not.toContainText('$247.51');

  await captureVisual(page, 'visual-topbar-open-design-model-picker');
});

test('[P2] captures the topbar local CLI model list surface', async ({ page }) => {
  await configureVisualPage(page, {
    agents: VISUAL_CLI_AGENTS,
    config: {
      agentId: 'claude',
      agentModels: { claude: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);

  const chip = page.getByTestId('inline-model-switcher-chip');
  await chip.click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // ef9c8cd8b replaced the top bar's click-to-open searchable dropdown with an
  // always-expanded radio list of the current agent's models; there is no
  // `inline-model-switcher-agent-model` trigger and no search box in the
  // compact shape. The searchable dropdown itself still ships — in
  // Settings → Execution — and is captured in this same lane by
  // visual-settings.test.ts's "settings local CLI model dropdown" case, so the
  // capture kept here is the list a real multi-model catalog renders.
  const modelList = popover.getByRole('radiogroup');
  await expect(modelList).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-compact-model-sonnet-alias')).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-agent-model')).toHaveCount(0);
  await expect(modelList.locator('.inline-switcher__agent.is-active')).toHaveCount(1);

  await captureVisual(page, 'visual-topbar-local-cli-model-list');
  await captureVisualTarget(page, 'visual-topbar-local-cli-model-list-popover', [chip, popover]);
});

test('[P2] captures the topbar BYOK execution switcher surface', async ({ page }) => {
  await configureVisualPage(page, {
    // No local agent, which is the premise the popover assertions below already
    // state ("a BYOK config has no local agent"). `configureVisualPage`
    // otherwise serves `[MOCK_AGENT]` from `/api/agents`; the popover body must
    // derive from `config.mode` either way, so the leanest fixture is the one
    // with nothing else to draw.
    agents: [],
    config: {
      mode: 'api',
      apiKey: 'sk-visual',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      agentId: null,
    },
  });
  // Deterministic BYOK catalogue: opening the popover warms the shared
  // provider-models cache through the daemon (`/api/provider/models`), which
  // would otherwise forward the fixture key to the real provider endpoint.
  // The fulfilled list is what the capture and the option assertions render.
  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        kind: 'success',
        latencyMs: 1,
        models: [
          { id: 'gpt-4o', label: 'gpt-4o' },
          { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
          { id: 'o3', label: 'o3' },
        ],
      }),
    });
  });
  await gotoVisualHome(page);

  const chip = page.getByTestId('inline-model-switcher-chip');
  // BYOK identity reads off the compact chip now: the link glyph stands in for
  // an agent logo and the configured model name follows it. That is what the
  // `aria-selected` mode tab used to prove.
  await expect(chip.locator('.inline-switcher__byok-glyph')).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', /gpt-4o/);
  await chip.click();
  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // The compact popover body derives from the ACTIVE execution mode: with BYOK
  // active it offers the provider's own model catalogue in place (#6515
  // restored this after #6142 left BYOK with only a Settings hint — or, with a
  // CLI agent installed, that agent's cloud models). Execution configuration
  // stays folded into Settings → Execution: neither the mode segmented control
  // nor the provider tabs mount in the top bar, and both remain captured in
  // this same lane by visual-settings.test.ts ("settings BYOK" and "settings
  // BYOK model dropdown").
  await expect(popover.getByTestId('inline-model-switcher-mode-api')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-provider-openai')).toHaveCount(0);
  const modelPicker = popover.getByTestId('inline-model-switcher-api-model');
  await expect(modelPicker).toBeVisible();
  await expect(modelPicker).toContainText('gpt-4o');
  await expect(popover.getByTestId('inline-model-switcher-open-settings')).toBeVisible();

  await captureVisual(page, 'visual-topbar-byok-switcher');
  await captureVisualTarget(
    page,
    'visual-topbar-byok-switcher-popover',
    page.getByTestId('inline-model-switcher-popover'),
  );

  // The catalogue is genuinely selectable, not a readout: the dropdown opens
  // with the provider's models on offer.
  await modelPicker.click();
  const modelPopover = page.getByTestId('inline-model-switcher-api-model-popover');
  await expect(modelPopover.getByRole('option', { name: 'gpt-4o-mini' })).toBeVisible();
});

test('[P2] captures the avatar menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await prepareVisualAvatarMenu(page);

  await captureVisual(page, 'visual-avatar-menu');
  await captureVisualTarget(page, 'visual-avatar-menu-panel', menu);
});

test('[P1] Avatar menu stays a model picker for a signed-in OpenDesign account', async ({ page }) => {
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
  // Same discipline as the topbar case: count the status requests so the
  // absence assertions cannot pass by outrunning the popover's own signed-in
  // fetch. `fallback()` defers the payload to mockSignedInVelaAccount.
  let velaStatusRequests = 0;
  await page.route('**/api/integrations/vela/status', async (route) => {
    velaStatusRequests += 1;
    await route.fallback();
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const requestsBeforeOpen = velaStatusRequests;
  const menu = await prepareVisualAvatarMenu(page);
  // AvatarMenu refetches the login status on open whenever OpenDesign is
  // installed, so a landed response means the signed-in render has happened.
  await expect.poll(() => velaStatusRequests).toBeGreaterThan(requestsBeforeOpen);

  // 4e3161751 (#6156) deleted the OpenDesign account row from this popover —
  // plan badge, balance, wallet fallback, upgrade/console links — and retired
  // the nine Vitest suites that asserted it, recasting the survivor as
  // apps/web/tests/components/AvatarMenu.test.tsx's "never renders the account
  // row, plan badge or balance in the popover". This is that invariant at the
  // rendered-app layer. The signed-in account surface itself is captured by
  // visual-settings.test.ts's "settings OpenDesign account balance" case, and
  // the `avatar_amr_upgrade` deep link — now reachable only by clicking a
  // plan-gated model row, which needs workspace billing permission this lane
  // does not fixture — by that same Vitest file's "routes a locked model only
  // when the exact project member can upgrade".
  await expect(menu.locator('[data-testid^="avatar-agent-option-"]')).toHaveCount(0);
  await expect(menu.locator('.avatar-amr-row')).toHaveCount(0);
  await expect(menu).not.toContainText('$247.51');
  // What it does render for a signed-in OpenDesign runtime: that runtime's
  // model catalog, with the configured model marked active.
  const modelList = menu.getByTestId('avatar-model-list');
  await expect(modelList).toBeVisible();
  await expect(modelList.getByRole('radio', { name: /DeepSeek V4 Flash/i })).toBeVisible();
  await expect(modelList.locator('.avatar-model-option.is-active')).toHaveCount(1);

  await captureVisual(page, 'visual-avatar-open-design-model-picker');
});

test('[P2] captures the avatar reasoning selector surface', async ({ page }) => {
  await configureVisualPage(page, {
    // AvatarMenu only draws the reasoning row for an agent that reports
    // `reasoningOptions`, and the shared `VISUAL_CLI_AGENTS` codex entry
    // declares models only. The real daemon does report them (apps/daemon/src/
    // runtimes/defs/codex.ts), so declare them here rather than widening the
    // shared fixture that the other captures in this file share.
    agents: [
      { ...VISUAL_CODEX_AGENT, reasoningOptions: VISUAL_CODEX_REASONING_OPTIONS },
      ...VISUAL_CLI_AGENTS.filter((agent) => agent.id !== 'codex'),
    ],
    config: {
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
    },
  });
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await prepareVisualAvatarMenu(page);
  const reasoningSelect = menu.getByRole('combobox', { name: 'Reasoning' });
  await expect(reasoningSelect).toHaveCount(1);
  await expect(reasoningSelect).toHaveValue('default');
  await expect(reasoningSelect.locator('option')).toHaveText(['Default', 'Medium', 'High']);

  await captureVisual(page, 'visual-avatar-local-agent-list');
  await captureVisualTarget(page, 'visual-avatar-local-agent-list-panel', menu);
});

test('[P2] captures the avatar local agent model list surface', async ({ page }) => {
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
  // Always-expanded radio list — no click-to-open dropdown, no search box.
  const modelList = menu.getByTestId('avatar-model-list');
  await expect(modelList).toBeVisible();
  await expect(modelList.getByRole('radio', { name: /Sonnet \(alias\)/i })).toBeVisible();
  await expect(modelList.locator('.avatar-model-option.is-active')).toHaveCount(1);

  await captureVisual(page, 'visual-project-avatar-model-dropdown');
  await captureVisualTarget(page, 'visual-project-avatar-model-dropdown-popover', [menu, modelList]);
});
