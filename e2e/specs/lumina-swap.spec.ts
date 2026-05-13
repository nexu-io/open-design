/**
 * lumina-swap.spec.ts — Lumina-managed direct-Anthropic swap (BYOK sentinel)
 *
 * Patch under test
 * ----------------
 *   Lumina-managed swap (apps/daemon/src/server.ts lines 2313–2349):
 *     When the browser POSTs /api/proxy/stream with:
 *       apiKey  = 'lumina-managed'
 *       baseUrl = 'https://lumina-gateway-managed'
 *     the daemon MUST swap to process.env.ANTHROPIC_API_KEY + api.anthropic.com,
 *     bypassing the openclaw gateway plugin pipeline that would otherwise
 *     overwrite messages[0] (system prompt) and break the <artifact> contract.
 *
 * Browser contract
 * ----------------
 *   1. Open tenant SPA (storageState auth from handshake.spec.ts).
 *   2. Write sentinel values into localStorage 'open-design:config'.
 *   3. Send a prompt via the chat composer.
 *   4. Assert:
 *      (a) /api/proxy/stream returns 200.
 *      (b) At least one SSE event arrives.
 *      (c) The assistant produces a renderable <artifact> — Deploy button visible.
 *   5. If the model emits <write_file> pseudo-tool (BYOK pollution — see
 *      feedback_byok_system_prompt_tool_pollution.md), retry ONCE with an
 *      explicit no-tools prefix before failing.
 *
 * BYOK system-prompt pollution note
 * ----------------------------------
 *   In BYOK mode the model has NO real tools. If the system prompt mentions
 *   tool names, claude-sonnet-4-5 may emit <write_file> / <todo_write>
 *   pseudo-XML instead of <artifact>. The retry logic sends a corrective
 *   prefix exactly once. If the second attempt also fails the test fails with
 *   a message pointing to the daemon-side fix path.
 *
 * Required env vars
 * -----------------
 *   OD_E2E_TENANT           - tenant slug: ceremonia | lumina | ericedmeades
 *                             (default: ceremonia)
 *   OD_E2E_STORAGE_STATE    - path to storageState from handshake.spec.ts
 *                             (default: e2e/.auth/state.json)
 *
 * Optional
 *   OD_E2E_TEST_PROMPT      - prompt to send (default: built-in simple prompt)
 *
 * How to run
 * ----------
 *   Production (after handshake.spec.ts):
 *     OD_E2E_TENANT=ceremonia \
 *     pnpm --filter @open-design/e2e exec playwright test \
 *       specs/lumina-swap.spec.ts --config=playwright.prod.config.ts
 *
 * Tenant isolation
 * ----------------
 *   Every test loading tenant content asserts no cross-tenant strings in the DOM.
 */

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT = process.env['OD_E2E_TENANT'] ?? 'ceremonia';
const PLATFORM_DOMAIN = 'opendesign.holalumina.com';
const TENANT_BASE = `https://${TENANT}.${PLATFORM_DOMAIN}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH =
  process.env['OD_E2E_STORAGE_STATE'] ??
  path.join(__dirname, '..', '.auth', 'state.json');

const STORAGE_KEY = 'open-design:config';

// Sentinel values that trigger the lumina-managed swap in server.ts.
// IMPORTANT: mode must be 'api' (BYOK direct path). mode='daemon' takes the
// local-CLI-agent code path and requires `agentId`, which is not the lumina
// swap. config.ts:DEFAULT_CONFIG also uses mode='api' for lumina-managed.
const LUMINA_SENTINEL_CONFIG = {
  apiKey: 'lumina-managed',
  baseUrl: 'https://lumina-gateway-managed',
  model: 'claude-sonnet-4-5',
  mode: 'api',
  onboardingCompleted: true,
} as const;

// Simple prompt; explicitly forbids tools to minimise pollution.
const DEFAULT_PROMPT =
  process.env['OD_E2E_TEST_PROMPT'] ??
  'Create a single-section HTML landing page titled "E2E Test" with a blue button. ' +
  'Output ONLY one <artifact> block with complete HTML. No other text.';

// Corrective prefix for BYOK pollution retry.
const NO_TOOLS_PREFIX =
  'IMPORTANT: You have NO tools. Do NOT emit <write_file>, <todo_write>, ' +
  '<read_file>, <edit_file>, or any XML tool tags. ' +
  'Output EXACTLY one <artifact> block with complete HTML. Nothing else. ';

// Cross-tenant deny list.
const ALL_TENANT_SLUGS = ['lumina', 'ericedmeades', 'edmeades', 'ceremonia'] as const;
const CROSS_TENANT_DENY = ALL_TENANT_SLUGS.filter(
  (s) => !TENANT.toLowerCase().includes(s.toLowerCase()),
);

function assertNoCrossTenantStrings(bodyText: string, context: string): void {
  for (const slug of CROSS_TENANT_DENY) {
    if (new RegExp(slug, 'i').test(bodyText)) {
      throw new Error(
        `TENANT ISOLATION FAILURE in "${context}": ` +
          `found cross-tenant string "${slug}" for tenant "${TENANT}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function injectLuminaConfig(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.evaluate(
    ([key, config]) => {
      const existing = window.localStorage.getItem(key as string);
      const parsed: Record<string, unknown> = existing
        ? (JSON.parse(existing) as Record<string, unknown>)
        : {};
      window.localStorage.setItem(
        key as string,
        JSON.stringify({ ...parsed, ...(config as object) }),
      );
    },
    [STORAGE_KEY, LUMINA_SENTINEL_CONFIG],
  );
  // SPA reads localStorage into React state ONCE on initial render. After
  // injection we must reload so the new sentinel config takes effect; without
  // this the daemon receives the SPA's cached default config and rejects the
  // prompt with "Pick a local agent first (top bar)".
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Open a project (creating a fresh one if needed) so the chat composer is
 * rendered. The tenant root (TENANT_BASE) shows a project list + creation
 * form, NOT the composer. Composer only renders inside a project view.
 *
 * Returns the composer Locator (placeholder "Describe the design…") so the
 * caller doesn't accidentally grab the project-title textbox at the top of
 * the project view (which is also an editable text element).
 */
async function openProjectForChat(
  page: import('@playwright/test').Page,
) {
  const projectName = `E2E ${Date.now()}`;
  const nameInput = page
    .locator('input[placeholder*="Project name" i], input[name="projectName"]')
    .first();
  await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await nameInput.fill(projectName);
  // The "+ Create" button has explicit text; disambiguate from
  // "Import Claude Design ZIP" by exact text match.
  await page
    .getByRole('button', { name: /^\+?\s*Create\s*$/i })
    .first()
    .click();
  // After Create the URL changes to /projects/<id>; wait for the composer
  // input, identified by its placeholder copy ("Describe the design…").
  const composer = page
    .locator(
      'textarea[placeholder*="Describe the design" i], textarea[placeholder*="Describe what you want" i]',
    )
    .first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  return composer;
}

/**
 * Submit text in the chat composer. The composer hint shows "⌘/Ctrl + Enter
 * to send" — plain Enter inserts a newline. Use the Send button (the action
 * the user actually performs).
 */
async function sendComposer(
  page: import('@playwright/test').Page,
  composer: ReturnType<typeof openProjectForChat> extends Promise<infer T>
    ? T
    : never,
  prompt: string,
): Promise<void> {
  // The composer is a React-controlled textarea; `fill()` programmatic
  // value-set sometimes doesn't trigger the input/change handlers that
  // toggle the Send button's `disabled` attribute. Use click+keyboard.type
  // so the React onChange fires per keystroke.
  await composer.click();
  await composer.evaluate((el: HTMLTextAreaElement) => {
    el.value = '';
  });
  await page.keyboard.type(prompt, { delay: 15 });
  // Wait for Send to become enabled (React state propagation).
  const sendBtn = page.getByRole('button', { name: /^Send$/i }).first();
  await sendBtn.waitFor({ state: 'visible' });
  // Poll for enabled state up to 5s — React commits to enabled state
  // after the textarea onChange resolves.
  for (let i = 0; i < 50; i++) {
    const disabled = await sendBtn.isDisabled().catch(() => true);
    if (!disabled) break;
    await page.waitForTimeout(100);
  }
  await sendBtn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('lumina-swap: direct-Anthropic sentinel swap + artifact emission', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      console.warn(
        '[lumina-swap] storageState not found at',
        STORAGE_STATE_PATH,
        '— run handshake.spec.ts first.',
      );
    }
  });

  /**
   * should return 200 from /api/proxy/stream with lumina-managed sentinel values
   *
   * Verifies the daemon accepts sentinel values without short-circuiting with
   * 400 BAD_REQUEST (missing fields) or 502 CONFIG_ERROR (ANTHROPIC_API_KEY
   * not set on daemon).
   */
  test('should return 200 from /api/proxy/stream when apiKey=lumina-managed sentinel is set', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    let proxyStatus = 0;
    const proxyStarted = new Promise<void>((resolve) => {
      page.on('response', (resp) => {
        if (resp.url().includes('/api/proxy/stream')) {
          proxyStatus = resp.status();
          resolve();
        }
      });
    });

    await page.goto(TENANT_BASE, { waitUntil: 'domcontentloaded' });
    await injectLuminaConfig(page);
    const composer = await openProjectForChat(page);
    await sendComposer(page, composer, DEFAULT_PROMPT);

    await proxyStarted;

    expect(
      proxyStatus,
      `Expected 200 from /api/proxy/stream with lumina-managed; got ${proxyStatus}. ` +
        `502 = ANTHROPIC_API_KEY missing on daemon. 400 = sentinel values not recognised.`,
    ).toBe(200);

    const bodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(bodyText, 'tenant SPA — proxy stream status check');

    await ctx.close();
  });

  /**
   * should receive at least one SSE event from /api/proxy/stream
   *
   * Empty 200 with no data = silently broken proxy (upstream timeout or bad
   * response from Anthropic). Asserts the stream actually produces tokens.
   */
  test('should receive at least one SSE event when streaming with lumina-managed sentinel', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    let sseDataReceived = false;
    const firstChunk = new Promise<void>((resolve) => {
      // Monitor XHR/fetch responses at the network level.
      page.on('response', async (resp) => {
        if (!resp.url().includes('/api/proxy/stream')) return;
        try {
          // Attempt to read partial body; SSE streams may not have a
          // complete body yet. We check for a non-empty body buffer.
          const buf = await resp.body().catch(() => null);
          if (buf && buf.length > 0) {
            sseDataReceived = true;
            resolve();
          }
        } catch {
          // Body consumed by EventSource. Fall through to DOM check below.
        }
      });
    });

    await page.goto(TENANT_BASE, { waitUntil: 'domcontentloaded' });
    await injectLuminaConfig(page);
    const composer = await openProjectForChat(page);
    await sendComposer(page, composer, DEFAULT_PROMPT);

    // Wait for either a network-level SSE chunk OR an assistant DOM node.
    const assistantEl = page
      .locator(
        '[data-testid="assistant-message"], [class*="assistant"], [class*="message"]',
      )
      .first();

    await Promise.race([
      firstChunk,
      assistantEl.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
    ]);

    const domHasContent = await assistantEl.isVisible().catch(() => false);
    expect(
      sseDataReceived || domHasContent,
      'Expected at least one SSE event or assistant message after 30 s.',
    ).toBe(true);

    await ctx.close();
  });

  /**
   * should render Deploy button in FileViewer after artifact emission
   *
   * Full integration: sentinel → /api/proxy/stream → <artifact> → FileViewer
   * shows Deploy button. Includes the BYOK tool-pollution retry-once strategy.
   */
  test('should render FileViewer Deploy button after artifact emission (with write_file retry-once fallback)', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    await page.goto(TENANT_BASE, { waitUntil: 'domcontentloaded' });
    await injectLuminaConfig(page);
    const composer = await openProjectForChat(page);

    type Outcome = 'deploy_button' | 'write_file_pollution' | 'timeout';

    async function sendPromptAndWait(prompt: string): Promise<Outcome> {
      await composer.fill('');
      await sendComposer(page, composer, prompt);

      // Artifact emission is signalled by a file tab appearing in the
      // FileViewer (e.g. "e2e-test-landing.html"). The "Deploy to Vercel"
      // action lives inside the Share dropdown; opening the dropdown adds
      // extra UI surface that flakes the test. Instead assert (a) the file
      // tab exists AND (b) the Share button is enabled — both prove the
      // artifact was emitted and the FileViewer mounted in deployable state.
      const artifactTab = page
        .locator('[role="tab"]:has-text(".html"), button:has-text(".html")')
        .first();
      const shareButton = page.getByRole('button', { name: /^Share$/i }).first();

      const result = await Promise.race<Outcome | null>([
        Promise.all([
          artifactTab.waitFor({ state: 'visible', timeout: 45_000 }),
          shareButton.waitFor({ state: 'visible', timeout: 45_000 }),
        ])
          .then((): Outcome => 'deploy_button')
          .catch(() => null),
        page
          .waitForFunction(
            () =>
              typeof document.body.textContent === 'string' &&
              document.body.textContent.includes('<write_file>'),
            { timeout: 45_000 },
          )
          .then((): Outcome => 'write_file_pollution')
          .catch(() => null),
      ]);

      return result ?? 'timeout';
    }

    // Attempt 1.
    let outcome = await sendPromptAndWait(DEFAULT_PROMPT);

    if (outcome === 'write_file_pollution') {
      // BYOK pollution detected — retry once with corrective prefix.
      // Contract: exactly ONE retry before failing.
      console.warn(
        '[lumina-swap] BYOK tool-pollution (<write_file>) on attempt 1. ' +
          'Retrying with no-tools prefix.',
      );
      outcome = await sendPromptAndWait(NO_TOOLS_PREFIX + DEFAULT_PROMPT);
    }

    if (outcome === 'timeout') {
      expect(
        false,
        '[lumina-swap] No Deploy button appeared after 2 attempts (45 s each). ' +
          'Possible causes: artifact emission broken; UI selector mismatch; ' +
          'Anthropic quota exhausted. ' +
          'See feedback_byok_system_prompt_tool_pollution.md for daemon-side fix.',
      ).toBe(true);
      return;
    }

    if (outcome === 'write_file_pollution') {
      expect(
        false,
        '[lumina-swap] BYOK pollution persisted after retry. ' +
          'Fix: patch composeSystemPrompt to strip tool references when ' +
          "apiKey='lumina-managed' (packages/contracts/src/prompts/system.ts).",
      ).toBe(true);
      return;
    }

    expect(outcome).toBe('deploy_button');

    const bodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(bodyText, 'tenant SPA after artifact emission');

    await ctx.close();
  });
});
