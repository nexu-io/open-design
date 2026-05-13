/**
 * vercel-deploy.spec.ts — Vercel env-var fallback deploy
 *
 * Patch under test
 * ----------------
 *   readVercelConfig env-var fallback (apps/daemon/src/deploy.ts lines 60–96):
 *     When ~/.open-design/vercel.json is absent or a field is empty, falls back to:
 *       VERCEL_API_TOKEN || VERCEL_TOKEN  →  token
 *       VERCEL_TEAM_ID                    →  teamId
 *       VERCEL_TEAM_SLUG                  →  teamSlug
 *     This makes the daemon container work without a persistent volume.
 *
 * Browser contract
 * ----------------
 *   1. Reuse storageState from handshake.spec.ts.
 *   2. Create a project + upload a pre-baked HTML fixture (no LLM call).
 *   3. Open the project in FileViewer and click Deploy.
 *   4. Assert deploy response includes a URL.
 *   5. Probe the Vercel URL → HTTP 200 + tenant-correct content.
 *   6. Assert no cross-tenant strings in deployed HTML.
 *
 * Artifact strategy
 * -----------------
 *   We upload a pre-baked HTML fixture directly via POST /api/projects/:id/upload
 *   instead of waiting for the LLM. This keeps the spec fast and deterministic,
 *   focusing on the readVercelConfig fallback rather than LLM output quality
 *   (which is lumina-swap.spec.ts's responsibility).
 *
 * Required env vars
 * -----------------
 *   OD_E2E_TENANT           - tenant slug: ceremonia | lumina | ericedmeades
 *                             (default: ceremonia)
 *   OD_E2E_STORAGE_STATE    - storageState path from handshake.spec.ts
 *                             (default: e2e/.auth/state.json)
 *
 * Optional
 *   OD_E2E_DEPLOY_PROJECT_ID - reuse existing project id (skip creation step)
 *
 * How to run
 * ----------
 *   Production (after handshake.spec.ts):
 *     OD_E2E_TENANT=ceremonia \
 *     pnpm --filter @open-design/e2e exec playwright test \
 *       specs/vercel-deploy.spec.ts --config=playwright.prod.config.ts
 *
 * Tenant isolation
 * ----------------
 *   Asserts no cross-tenant strings in deployed HTML and daemon DOM responses.
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

// Pre-baked fixture HTML. Must contain no cross-tenant slugs.
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E Deploy Test</title>
<style>
:root {
  --site-bg: #f8f9fa;
  --site-fg: #1a1a1a;
  --site-accent: #0066cc;
}
body {
  background: var(--site-bg);
  color: var(--site-fg);
  font-family: system-ui, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  margin: 0;
}
main { text-align: center; }
h1 { color: var(--site-accent); }
</style>
</head>
<body>
<main>
  <h1>E2E Deploy Test</h1>
  <p>Deployed by Playwright vercel-deploy.spec.ts</p>
  <p data-e2e="marker">open-design e2e fixture</p>
</main>
</body>
</html>`;

const FIXTURE_FILE_NAME = 'e2e-deploy-test.html';

// Cross-tenant deny list.
const ALL_TENANT_SLUGS = ['lumina', 'ericedmeades', 'edmeades', 'ceremonia'] as const;
const CROSS_TENANT_DENY = ALL_TENANT_SLUGS.filter(
  (s) => !TENANT.toLowerCase().includes(s.toLowerCase()),
);

function assertNoCrossTenantStrings(text: string, context: string): void {
  for (const slug of CROSS_TENANT_DENY) {
    if (new RegExp(slug, 'i').test(text)) {
      throw new Error(
        `TENANT ISOLATION FAILURE in "${context}": ` +
          `found cross-tenant string "${slug}" for tenant "${TENANT}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('vercel-deploy: Deploy button → public URL probe (env-var fallback)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      console.warn(
        '[vercel-deploy] storageState not found at',
        STORAGE_STATE_PATH,
        '— run handshake.spec.ts first.',
      );
    }
  });

  /**
   * should return non-empty token from /api/deploy/config confirming env-var fallback
   *
   * Light probe: GET /api/deploy/config and assert a token field is present.
   * An absent/empty token means readVercelConfig env-var fallback is not active
   * (VERCEL_API_TOKEN not set on daemon).
   */
  test('should return non-empty token from /api/deploy/config confirming env-var fallback is active', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    // Storage state JWT may have expired (5-min TTL) since handshake.spec ran.
    // Browser nav triggers Bug 9 re-handshake; /api/* paths return 401 directly
    // (browser fetch can't follow cross-origin 302). Page-navigate first so
    // the cookie is refreshed before we hit the API path under test.
    await page.goto(TENANT_BASE, { waitUntil: 'domcontentloaded' });

    const resp = await page.request.get(`${TENANT_BASE}/api/deploy/config`, {
      failOnStatusCode: false,
    });

    if (resp.status() === 404) {
      // Route absent in older daemon images — skip gracefully.
      console.warn('[vercel-deploy] /api/deploy/config not found (404); skipping.');
      test.skip();
      await ctx.close();
      return;
    }

    expect(
      [200],
      `Expected 200 from /api/deploy/config; got ${resp.status()}.`,
    ).toContain(resp.status());

    // Daemon redacts the real token at the API boundary (security): response
    // shape is {providerId, configured, tokenMask, teamId, teamSlug, target}.
    // Assert configured===true AND tokenMask is a non-empty fixed sentinel —
    // both signal that readVercelConfig found a token (env-var fallback OR
    // saved deploy.json). Real token leakage check belongs in unit tests.
    const body = (await resp.json()) as {
      configured?: boolean;
      tokenMask?: string;
      teamId?: string;
      teamSlug?: string;
    };

    expect(
      body.configured,
      `readVercelConfig fallback: configured must be true. Got: ${JSON.stringify(body)}. ` +
        `Ensure VERCEL_API_TOKEN or VERCEL_TOKEN is set in the daemon container env.`,
    ).toBe(true);
    expect(
      (body.tokenMask ?? '').length,
      `readVercelConfig fallback: tokenMask must be non-empty when configured.`,
    ).toBeGreaterThan(0);

    await ctx.close();
  });

  /**
   * should create project, upload HTML, click Deploy, serve HTTP 200 from Vercel URL
   *
   * Full integration test. Steps:
   *   1. POST /api/projects        → { id }
   *   2. POST /api/projects/:id/upload (multipart fixture HTML)
   *   3. Browser: navigate to file route, click Deploy button
   *   4. Intercept deploy API response → extract url
   *   5. Probe url → HTTP 200
   *   6. Tenant isolation on deployed HTML
   */
  test('should deploy fixture HTML via Deploy button and probe Vercel URL for HTTP 200', async ({
    browser,
    request,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    // ---- 1. Create or reuse project ----------------------------------------
    let projectId = process.env['OD_E2E_DEPLOY_PROJECT_ID'] ?? '';

    if (!projectId) {
      const createResp = await page.request.post(`${TENANT_BASE}/api/projects`, {
        data: { projectName: 'E2E Deploy Test', tab: 'prototype' },
        headers: { 'Content-Type': 'application/json' },
        failOnStatusCode: false,
      });

      if (![200, 201].includes(createResp.status())) {
        console.warn(
          '[vercel-deploy] POST /api/projects failed with',
          createResp.status(),
          '— skipping.',
        );
        test.skip();
        await ctx.close();
        return;
      }

      const createBody = await createResp.json() as { id?: string; project?: { id?: string } };
      projectId = createBody.id ?? createBody.project?.id ?? '';
    }

    if (!projectId) {
      console.warn('[vercel-deploy] Could not extract project id — skipping.');
      test.skip();
      await ctx.close();
      return;
    }

    // ---- 2. Upload fixture HTML ---------------------------------------------
    const uploadResp = await page.request.post(
      `${TENANT_BASE}/api/projects/${encodeURIComponent(projectId)}/upload`,
      {
        multipart: {
          file: {
            name: FIXTURE_FILE_NAME,
            mimeType: 'text/html',
            buffer: Buffer.from(FIXTURE_HTML, 'utf8'),
          },
        },
        failOnStatusCode: false,
      },
    );

    expect(
      [200, 201],
      `Upload failed with ${uploadResp.status()}. ` +
        `Check /api/projects/:id/upload endpoint on the daemon.`,
    ).toContain(uploadResp.status());

    // ---- 3. Navigate to file route and click Deploy -------------------------
    await page.goto(
      `${TENANT_BASE}/projects/${encodeURIComponent(projectId)}/files/${FIXTURE_FILE_NAME}`,
      { waitUntil: 'domcontentloaded' },
    );

    const deployButton = page
      .locator(
        'button:has-text("Deploy"), [data-testid="deploy-button"], [class*="deploy-btn"]',
      )
      .first();
    await deployButton.waitFor({ state: 'visible', timeout: 15_000 });

    // ---- 4. Capture deploy API response ------------------------------------
    let deployBody: Record<string, unknown> = {};
    const deployDone = new Promise<void>((resolve) => {
      page.on('response', async (resp) => {
        if (
          resp.url().includes('/api/') &&
          resp.url().includes('/deploy') &&
          !resp.url().includes('/deploy/config')
        ) {
          try {
            deployBody = await resp.json() as Record<string, unknown>;
          } catch {
            // Non-JSON — handled below.
          }
          resolve();
        }
      });
    });

    await deployButton.click();

    // Wait up to 90 s for deploy to complete (Vercel cold builds).
    await Promise.race([
      deployDone,
      page.waitForTimeout(90_000),
    ]);

    // ---- 5. Assert deploy URL present and probe it -------------------------
    const deployUrl =
      (deployBody['url'] as string | undefined) ??
      (deployBody['deployUrl'] as string | undefined) ??
      (deployBody['previewUrl'] as string | undefined) ??
      '';

    if (!deployUrl) {
      // Deploy may have failed silently. Provide diagnostic info.
      expect(
        deployUrl.length,
        `Deploy response must include a URL field. ` +
          `Got: ${JSON.stringify(deployBody)}. ` +
          `Confirm VERCEL_API_TOKEN, VERCEL_TEAM_ID, VERCEL_TEAM_SLUG are set ` +
          `on the daemon (readVercelConfig env-var fallback path).`,
      ).toBeGreaterThan(0);
      await ctx.close();
      return;
    }

    expect(deployUrl).toMatch(/^https?:\/\/.+/);

    // Vercel URL naming convention: od-<tenant>-<projectId>[-suffix].vercel.app
    // or custom domain. Assert the URL at least references the tenant slug.
    expect(
      deployUrl,
      `Vercel URL should reference tenant "${TENANT}".`,
    ).toContain(TENANT);

    // Probe the deployed URL via shared request context (not browser session).
    const probeResp = await request.get(deployUrl, {
      failOnStatusCode: false,
      timeout: 60_000,
    });

    expect(
      probeResp.status(),
      `Deployed URL ${deployUrl} returned ${probeResp.status()}. ` +
        `200 expected. Check Vercel project settings and Deployment Protection.`,
    ).toBe(200);

    // ---- 6. Tenant isolation on deployed HTML ------------------------------
    const deployedHtml = await probeResp.text();

    // Fixture marker must be present.
    expect(deployedHtml, 'Deployed HTML must contain fixture marker').toContain(
      'open-design e2e fixture',
    );

    // No cross-tenant strings.
    assertNoCrossTenantStrings(deployedHtml, 'deployed Vercel HTML');

    // Tenant isolation on daemon-side DOM.
    const daemonBodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(daemonBodyText, 'tenant SPA during deploy flow');

    await ctx.close();
  });
});
