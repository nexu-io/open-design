import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { ORCAROUTER_CHAT_CATALOGUE } from '@/playwright/orcarouter-catalogue';
import { openSettingsDialog, settingsSurface } from '../lib/playwright/amr.js';
import { suppressWhatsNew } from '../lib/playwright/mock-factory.js';
import { T } from '@/timeouts';

/**
 * OrcaRouter provider surface: both authentication entries and the live model
 * catalogue, captured from the running product.
 *
 * The catalogue is served from the daemon's real discovery route
 * (`POST /api/orcarouter/models`), which reads
 * `GET https://api.orcarouter.ai/v1/models?capability=chat` server-side with
 * the user's credential. The browser never holds the key — the route below only
 * stands in for the fake local catalog the suite can serve in CI.
 *
 * The evidence artifacts this file produces live under the OrcaRouter campaign
 * evidence directory; the screenshots are written from the real DOM, never a
 * static mockup.
 */

const STORAGE_KEY = 'open-design:config';
const EVIDENCE_DIR = process.env.OD_ORCAROUTER_EVIDENCE_DIR ?? '';
const MODEL_POPOVER_SELECTOR = '.model-select-searchable__popover';

/**
 * Live-evidence mode.
 *
 * The repository forbids e2e suites that depend on real provider accounts, so
 * the default path serves a fixture catalogue and the suite stays hermetic in
 * CI. Capturing evidence for a real integration is the opposite requirement:
 * the option list has to come from the gateway. Setting
 * `OD_ORCAROUTER_LIVE_EVIDENCE=1` therefore leaves the catalogue routes
 * unstubbed, and the daemon fetches
 * `GET https://api.orcarouter.ai/v1/models?capability=chat` server-side with
 * the environment's `ORCA_API_KEY` — the browser still never holds the key.
 */
const LIVE_EVIDENCE = process.env.OD_ORCAROUTER_LIVE_EVIDENCE === '1';

test.describe.configure({ timeout: T.xlong });

// The OrcaRouter panel carries two auth entries plus the model field; a taller
// viewport keeps the whole control in one evidence frame.
test.use({ viewport: { width: 1280, height: 1000 } });

/**
 * The catalogue the suite serves.
 *
 * `e2e/resources/orcarouter-chat-catalog.json` is a RECORDED snapshot of the
 * live endpoint — `GET https://api.orcarouter.ai/v1/models?capability=chat`,
 * captured through the OrcaRouter provider code path — projected onto the
 * picker option shape. Serving the recording rather than a handful of invented
 * rows keeps the suite hermetic in CI (the repo forbids e2e tests that depend
 * on real provider accounts) while the option list, its modality metadata, and
 * the counts the assertions below use remain the real catalogue's.
 *
 * `OD_ORCAROUTER_LIVE_EVIDENCE=1` skips the stub entirely and lets the daemon
 * fetch the same endpoint live, which is how the checked-in screenshots were
 * produced.
 */
const CATALOGUE_SNAPSHOT = ORCAROUTER_CHAT_CATALOGUE as {
  capturedAt: string;
  source: string;
  chatCount: number;
  imageCount: number;
  models: ReadonlyArray<{ id: string; label: string; metadata?: unknown }>;
};

const CHAT_CATALOGUE = {
  ok: true,
  capability: 'chat',
  degraded: false,
  source: 'oauth-orcarouter-pkce',
  seed: false,
  count: CATALOGUE_SNAPSHOT.chatCount,
  models: CATALOGUE_SNAPSHOT.models as unknown as Array<Record<string, unknown>>,
};

async function saveEvidence(page: Page, name: string): Promise<void> {
  if (!EVIDENCE_DIR) return;
  const target = join(EVIDENCE_DIR, name);
  await mkdir(dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: false });
}

async function gotoEntryHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: T.long });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog
      .getByRole('button', { name: /I get it|not now|got it|don't share/i })
      .click();
  }
}

/**
 * Open Settings on the OrcaRouter protocol with both entries live.
 *
 * The daemon routes are stubbed so the suite is hermetic: `/auth/status` reports
 * a connected PKCE credential, and the catalogue route returns the fake
 * catalogue above. The rendered UI, the option list, and the screenshot are the
 * real product's.
 */
async function openOrcaRouterSettings(page: Page): Promise<Locator> {
  await suppressWhatsNew(page);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: STORAGE_KEY,
      value: {
        mode: 'api',
        apiProtocol: 'orcarouter',
        // A placeholder, never a real credential. Seeding it renders the form in
        // its completed state so the masked field is what the screenshot proves.
        // In live mode the daemon resolves the real key from its environment.
        apiKey: LIVE_EVIDENCE ? '' : 'sk-orca-evidence-placeholder-not-a-real-key',
        baseUrl: 'https://api.orcarouter.ai/v1',
        model: 'openai/gpt-5.5',
        apiProviderBaseUrl: 'https://api.orcarouter.ai/v1',
        agentId: null,
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
      },
    },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/orcarouter/auth/status', async (route) => {
    await route.fulfill({
      json: {
        connected: true,
        source: 'oauth-orcarouter-pkce',
        authState: 'active',
        needsReauth: false,
        scope: 'api',
        savedAt: Date.now(),
        listening: false,
        authBase: 'https://www.orcarouter.ai',
        apiBase: 'https://api.orcarouter.ai/v1',
      },
    });
  });
  if (!LIVE_EVIDENCE) {
    await page.route('**/api/orcarouter/models', async (route) => {
      await route.fulfill({ json: CHAT_CATALOGUE });
    });
    await page.route('**/api/provider/models', async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          kind: 'success',
          latencyMs: 12,
          models: CHAT_CATALOGUE.models,
        },
      });
    });
  }

  await gotoEntryHome(page);
  const dialog = await openSettingsDialog(page);
  await dialog.getByTestId('settings-nav-execution').click();
  await expect(dialog.getByTestId('orcarouter-connect-control')).toBeVisible();
  return dialog;
}

/** A 1x1 PNG, so the staged attachment carries a real image MIME type. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Reopen Settings on the execution section, from wherever the page is now. */
async function openExecutionSection(page: Page): Promise<Locator> {
  const dialog = await openSettingsDialog(page);
  await dialog.getByTestId('settings-nav-execution').click();
  await expect(dialog.getByTestId('orcarouter-connect-control')).toBeVisible();
  return dialog;
}

/**
 * The dropdown panel must be a real, readable panel anchored to its trigger:
 * an opaque background, a visible border, and a right edge flush with the
 * control that opened it.
 *
 * OrcaRouter's pickers opt into `popoverAlign="end"` (see modelOptions.tsx):
 * the catalogue lists long `vendor/model` ids behind a trigger far narrower
 * than the panel's minimum width, so the panel hangs from the trigger's RIGHT
 * edge. The anchor is therefore the enclosing select control, not the inner
 * combobox — the combobox is the button, the select is the box the panel is
 * positioned against.
 */
async function assertPopoverAnchored(
  page: Page,
  trigger: Locator,
  popover: Locator,
): Promise<void> {
  const anchor = trigger.locator('xpath=ancestor-or-self::*[contains(@class,"model-select-searchable")][1]');
  const anchorCount = await anchor.count();
  const anchorLocator = anchorCount > 0 ? anchor.first() : trigger;
  const [triggerBox, panelBox] = await Promise.all([
    anchorLocator.boundingBox(),
    popover.boundingBox(),
  ]);
  expect(triggerBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.width).toBeGreaterThan(0);
  expect(panelBox!.height).toBeGreaterThan(0);

  // Right edges line up (within the 2px the campaign's gate allows).
  const delta = Math.abs(
    (triggerBox!.x + triggerBox!.width) - (panelBox!.x + panelBox!.width),
  );
  expect(delta).toBeLessThanOrEqual(2);

  const style = await popover.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      background: computed.backgroundColor,
      borderTopWidth: computed.borderTopWidth,
      borderTopStyle: computed.borderTopStyle,
    };
  });
  // A transparent background or a borderless panel fails the readability gate.
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.background).not.toBe('transparent');
  expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
  expect(style.borderTopStyle).not.toBe('none');
}

/**
 * Option counts observed during the run, written next to the screenshots so the
 * evidence manifest can quote what the dropdowns actually contained.
 */
const observedCounts: { textCount?: number; imageCount?: number } = {};
let textCountFromPreviousTest = 0;

async function recordCounts(
  page: Page,
  next: { textCount?: number; imageCount?: number },
): Promise<void> {
  if (next.textCount !== undefined) {
    observedCounts.textCount = next.textCount;
    textCountFromPreviousTest = next.textCount;
  }
  if (next.imageCount !== undefined) observedCounts.imageCount = next.imageCount;
  if (!EVIDENCE_DIR) return;
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(
    join(EVIDENCE_DIR, 'counts.json'),
    JSON.stringify(observedCounts, null, 2),
    'utf8',
  );
}

function modelCombobox(scope: Page | Locator): Locator {
  return scope.getByRole('combobox', { name: 'Model', exact: true });
}

test('[P1] OrcaRouter settings expose the API-key and PKCE entries side by side', async ({ page }) => {
  const dialog = await openOrcaRouterSettings(page);

  // Entry 1 — the provider form's own API-key field. It is a password input,
  // so a stored value is masked rather than rendered as text.
  const keyInput = dialog.getByLabel('API key', { exact: true }).first();
  await expect(keyInput).toBeVisible();
  // A password input, so whatever it holds is masked rather than rendered.
  await expect(keyInput).toHaveAttribute('type', 'password');
  if (!LIVE_EVIDENCE) {
    await expect(keyInput).toHaveValue('sk-orca-evidence-placeholder-not-a-real-key');
  }
  // The masked value is never present as readable text anywhere in the markup.
  await expect(dialog).not.toContainText('sk-orca-evidence-placeholder');

  // Entry 2 — connect with an OrcaRouter account (OAuth 2.0 + PKCE). Its own
  // control, not the same button changing behaviour.
  const oauthEntry = dialog.getByTestId('orcarouter-oauth-entry');
  await expect(oauthEntry).toBeVisible();
  const connect = dialog.getByTestId('orcarouter-connect');
  await expect(connect).toBeVisible();
  await expect(connect).toBeEnabled();
  // With a credential already present the entry re-authorizes rather than
  // starting cold; both are the same account-login control.
  await expect(connect).toContainText(/Reconnect|Connect with OrcaRouter/i);

  // Both entries must be in frame together: this screenshot is the evidence
  // that a user can pick either one, so neither may be scrolled out of view.
  await connect.scrollIntoViewIfNeeded();
  await expect(keyInput).toBeInViewport();
  await expect(connect).toBeInViewport();

  await saveEvidence(page, 'auth-methods.png');
});

/**
 * Open the composer's BYOK model picker on the Home surface.
 *
 * This is the surface that shares scope with the staged attachments: the
 * switcher and the composer's file input are both live on Home, so staging an
 * image and reopening this picker is a real end-to-end transition rather than a
 * cross-page assumption. Settings is a routed page and takes HomeView (and its
 * staged files) down with it, so it cannot witness this.
 */
async function openHomeModelPicker(page: Page): Promise<{ trigger: Locator; popover: Locator }> {
  const switcherPopover = page.getByTestId('inline-model-switcher-popover');
  // The chip toggles: if this picker is already open (the pre-attachment
  // baseline leaves it that way) a click would close it instead.
  if (!(await switcherPopover.isVisible().catch(() => false))) {
    await page.getByTestId('inline-model-switcher-chip').click();
  }
  await expect(switcherPopover).toBeVisible();
  const trigger = page.getByTestId('inline-model-switcher-api-model');
  await trigger.click();
  // Scope to THIS picker's popover: the composer renders other
  // `.model-select-searchable__popover` instances (the task-type list), and a
  // bare `.last()` resolves to whichever mounted last.
  const popover = page.getByTestId('inline-model-switcher-api-model-popover');
  await expect(popover).toBeVisible();
  return { trigger, popover };
}

test('[P1] the composer text model picker lists the live catalogue', async ({ page }) => {
  await openOrcaRouterSettings(page);
  await page.getByRole('button', { name: /Back to home/i }).click();
  await expect(settingsSurface(page)).toHaveCount(0);

  const { trigger, popover } = await openHomeModelPicker(page);

  // The rows come from the catalogue response the daemon served, not from a
  // hand-written example list.
  const options = popover.getByRole('option');
  // The catalogue lists several gpt-5.5 variants; the canonical id must be one
  // of them.
  await expect(options.filter({ hasText: /^OpenAI: GPT-5\.5$/ }).first()).toBeVisible();

  // The list is the catalogue, not the handful of curated seed ids: it matches
  // the recorded live row count.
  const textCount = await options.count();
  expect(textCount).toBe(CATALOGUE_SNAPSHOT.chatCount);

  await assertPopoverAnchored(page, trigger, popover);
  await saveEvidence(page, 'text-model-dropdown.png');
  await recordCounts(page, { textCount });
});

test('[P1] staging an image narrows the composer picker to image-capable chat models', async ({ page }) => {
  await openOrcaRouterSettings(page);
  await page.getByRole('button', { name: /Back to home/i }).click();
  await expect(settingsSurface(page)).toHaveCount(0);

  // Baseline: without an attachment the full catalogue is on offer.
  {
    const { popover } = await openHomeModelPicker(page);
    expect(await popover.getByRole('option').count())
      .toBe(CATALOGUE_SNAPSHOT.chatCount);
    // Close by toggling the chip so the next open starts from a known-closed
    // state (Escape unmounts the inner list but leaves the popover open).
    await page.getByTestId('inline-model-switcher-chip').click();
    await expect(popover).toHaveCount(0);
  }

  // Stage a real image through the product's own composer input.
  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('reference.png');

  const { trigger, popover } = await openHomeModelPicker(page);
  const options = popover.getByRole('option');
  // The image-capable route survives...
  await expect(options.filter({ hasText: /^OpenAI: GPT-5\.5$/ })).toHaveCount(1);
  // ...and the list is exactly the catalogue's image-declaring subset. This is
  // the list the selector received, not a send-time guard.
  const imageCount = await options.count();
  expect(imageCount).toBe(CATALOGUE_SNAPSHOT.imageCount);
  expect(imageCount).toBeLessThan(CATALOGUE_SNAPSHOT.chatCount);

  await assertPopoverAnchored(page, trigger, popover);
  await saveEvidence(page, 'multimodal-model-dropdown.png');
  await recordCounts(page, { imageCount });
});
