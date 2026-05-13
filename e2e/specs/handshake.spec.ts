/**
 * handshake.spec.ts — Bug 9 + cross-subdomain handshake flow
 *
 * Patches under test
 * ------------------
 *   Bug 9 (apps/daemon/src/tenants/resolver.ts lines 196–299):
 *     When the __od_handshake JWT in the query string is itself expired, the
 *     resolver MUST 302 back to app.holalumina.com/api/od-handshake (to
 *     re-mint), NOT return 401. Previously the cascade was:
 *       stale-cookie → fresh handshake URL → expired before consume → 401
 *       → infinite reload.
 *     This spec verifies the re-handshake redirect branch fires instead of 401.
 *
 *   Cross-subdomain happy path (resolver steps 6a → cookie_set → 302 clean):
 *     Visit tenant subdomain without __session → 302 to handshake endpoint
 *     → handshake mints cookie → 302 back to clean tenant URL → SPA loads.
 *
 * Required env vars
 * -----------------
 *   OD_E2E_PROD_EMAIL      - Clerk account email (email+password only, NO Google SSO)
 *   OD_E2E_PROD_PASSWORD   - Clerk account password
 *   OD_E2E_TENANT          - tenant slug: ceremonia | lumina | ericedmeades
 *                            (default: ceremonia; must match the user's Clerk org)
 *   OD_E2E_STORAGE_STATE   - output path for Playwright storageState JSON
 *                            (default: e2e/.auth/state.json)
 *
 * How to run
 * ----------
 *   Local mocked server (no real Clerk):
 *     This spec requires the real Clerk + Caddy + daemon handshake chain.
 *     It cannot run meaningfully against the local mocked webServer.
 *     Skip it when running the default playwright.config.ts suite.
 *
 *   Production (ceremonia):
 *     OD_E2E_TENANT=ceremonia \
 *     OD_E2E_PROD_EMAIL=<email> \
 *     OD_E2E_PROD_PASSWORD=<password> \
 *     pnpm --filter @open-design/e2e exec playwright test \
 *       specs/handshake.spec.ts --config=playwright.prod.config.ts
 *
 *   Production (lumina or ericedmeades): set OD_E2E_TENANT accordingly.
 *
 * Auth rule
 * ---------
 *   This is the gate spec that MUST walk the real /sign-in UI.
 *   Per feedback_qa_must_exercise_real_signin_ui.md, storage-state-only auth
 *   misses broken sign-in forms (wrong client_id, disabled providers, etc.).
 *   This spec saves storageState on success; downstream specs may reuse it.
 *
 * Tenant isolation
 * ----------------
 *   Every test that loads tenant content asserts no cross-tenant strings
 *   appear in the rendered DOM. Cross-tenant leak → fail.
 */

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForClerkVerificationCode } from '../lib/agentmail-poll.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT = process.env['OD_E2E_TENANT'] ?? 'ceremonia';
const PLATFORM_DOMAIN = 'opendesign.holalumina.com';
const PLATFORM_APP = 'https://app.holalumina.com';
const HANDSHAKE_ENDPOINT = `${PLATFORM_APP}/api/od-handshake`;
const TENANT_BASE = `https://${TENANT}.${PLATFORM_DOMAIN}`;
const SIGN_IN_URL = `${PLATFORM_APP}/sign-in`;

// Path for storageState reused by downstream specs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH =
  process.env['OD_E2E_STORAGE_STATE'] ??
  path.join(__dirname, '..', '.auth', 'state.json');

// Cross-tenant deny list: substrings that, if found in body text, indicate
// a real cross-tenant content bleed. We deliberately AVOID matching bare
// tenant slugs because:
//   - "lumina" appears in platform branding ("Lumina OS", "lumina-gateway-managed")
//   - "ceremonia" can appear in lumina context as marketing copy
// Instead we match the SPECIFIC SUBDOMAIN HOSTNAMES (proof of cross-link)
// plus tenant-identifying proper nouns that would only appear when the
// daemon leaked another tenant's data (e.g. Eric's last name "Edmeades"
// only shows when ericedmeades's data is being served).
const ALL_TENANT_SLUGS = ['lumina', 'ericedmeades', 'ceremonia'] as const;
const OTHER_TENANTS = ALL_TENANT_SLUGS.filter((s) => s !== TENANT);
const CROSS_TENANT_DENY: string[] = [
  ...OTHER_TENANTS.map((s) => `${s}.opendesign.holalumina.com`),
  // Eric's surname is an identifying marker that should only appear when
  // his tenant is being served. Skip when the current tenant IS Eric.
  ...(TENANT === 'ericedmeades' ? [] : ['Edmeades']),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(
      `Required env var "${name}" is not set. ` +
        `Set it before running this spec against prod.`,
    );
  }
  return val;
}

function assertNoCrossTenantStrings(bodyText: string, context: string): void {
  for (const slug of CROSS_TENANT_DENY) {
    if (new RegExp(slug, 'i').test(bodyText)) {
      throw new Error(
        `TENANT ISOLATION FAILURE in "${context}": ` +
          `found cross-tenant string "${slug}" while tenant is "${TENANT}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('handshake: cross-subdomain auth + Bug 9 re-handshake redirect', () => {
  test.beforeAll(() => {
    requireEnv('OD_E2E_PROD_EMAIL');
    requireEnv('OD_E2E_PROD_PASSWORD');
  });

  /**
   * should redirect unauthenticated tenant visit to handshake endpoint
   *
   * Resolver step 6b: no __session cookie → 302 to
   * app.holalumina.com/api/od-handshake?target_url=<encoded tenant URL>.
   * We track request events to confirm the intermediate handshake visit.
   */
  test('should redirect unauthenticated tenant visit to handshake endpoint when no session cookie exists', async ({
    page,
  }) => {
    const handshakeHits: string[] = [];
    page.on('request', (req) => {
      if (req.url().startsWith(HANDSHAKE_ENDPOINT)) {
        handshakeHits.push(req.url());
      }
    });

    // Navigate with no cookies. Playwright follows redirects.
    await page.goto(TENANT_BASE, { waitUntil: 'commit' });

    // Chain must have passed through the handshake endpoint.
    expect(handshakeHits.length).toBeGreaterThanOrEqual(1);
    const firstHit = handshakeHits[0];
    expect(firstHit).toBeDefined();

    // The handshake URL must carry target_url pointing back to this tenant.
    const url = new URL(firstHit as string);
    const targetUrl = decodeURIComponent(url.searchParams.get('target_url') ?? '');
    expect(targetUrl).toContain(TENANT);
  });

  /**
   * should complete real email+password sign-in then reach tenant SPA via handshake
   *
   * This is the GATE test: walks the real /sign-in UI. Storage-state auth
   * alone would miss a broken sign-in form (wrong client_id, disabled
   * provider, etc.) — see feedback_qa_must_exercise_real_signin_ui.md.
   *
   * Flow:
   *   1. Navigate to /sign-in?redirect_url=<tenant base>
   *   2. Fill email → Continue → fill password → Sign In
   *   3. Clerk 302s toward tenant; handshake fires if needed
   *   4. SPA shell loads at tenant base URL
   *   5. Assert: __session cookie present + scoped to tenant subdomain
   *   6. Save storageState for downstream specs
   */
  test('should complete real email+password sign-in then reach tenant SPA via handshake', async ({
    page,
  }) => {
    const email = requireEnv('OD_E2E_PROD_EMAIL');
    const password = requireEnv('OD_E2E_PROD_PASSWORD');

    // 1. Navigate to sign-in with redirect back to tenant base.
    await page.goto(
      `${SIGN_IN_URL}?redirect_url=${encodeURIComponent(TENANT_BASE)}`,
    );

    // 2. Wait for Clerk's email identifier input.
    const emailInput = page
      .locator('input[name="identifier"], input[type="email"]')
      .first();
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await emailInput.fill(email);

    // Click Continue / Next to advance to the password step.
    // Use Clerk's localization-key selector to disambiguate from the Google
    // SSO button (which also contains "Continue" text per Clerk's a11y label).
    await page
      .locator('button[data-localization-key="formButtonPrimary"]')
      .first()
      .click();

    // 3. Wait for password input and fill it.
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
    await passwordInput.fill(password);

    // 4. Submit sign-in. Same disambiguation as Continue — the password step
    // also exposes a Google SSO button whose a11y label may shadow "Continue".
    const signInRequestedAt = new Date().toISOString();
    await page
      .locator('button[data-localization-key="formButtonPrimary"]')
      .first()
      .click();

    // 4b. Prod Clerk requires email-OTP as a second factor — fixture codes
    // (`424242`) don't auto-resolve in prod. Wait briefly to see whether the
    // factor-two screen appears; if it does, poll AgentMail for the code.
    try {
      await page.waitForURL((url) => url.toString().includes('/factor-two'), {
        timeout: 5_000,
      });
      // factor-two reached — poll inbox for the verification email.
      const code = await waitForClerkVerificationCode(signInRequestedAt, 60_000, 3_000);
      // Clerk's current factor-two screen renders a SINGLE textbox with
      // aria-label "Enter verification code" (page-snapshot 2026-05-13), not
      // 6 per-digit inputs. Use role-based locator and type via keyboard so
      // Clerk's JS can route digits through whatever underlying widget it has.
      const codeInput = page
        .getByRole('textbox', { name: /verification|code/i })
        .first();
      await codeInput.click();
      await page.keyboard.type(code, { delay: 30 });
      // Some Clerk versions auto-submit on 6th digit; if not, click Continue.
      await page
        .locator('button[data-localization-key="formButtonPrimary"]')
        .first()
        .click({ timeout: 5_000 })
        .catch(() => {
          // Auto-submitted; ignore.
        });
    } catch {
      // factor-two never appeared — proceed to normal redirect wait.
    }

    // 5. Wait for redirect away from the sign-in page.
    await page.waitForURL(
      (url) =>
        !url.toString().includes('/sign-in') &&
        !url.toString().includes('__clerk'),
      { timeout: 30_000 },
    );

    // 6. If Clerk landed us on app.holalumina.com (e.g. /chat or /), navigate
    //    to the tenant subdomain to exercise the handshake.
    if (!page.url().startsWith(TENANT_BASE)) {
      await page.goto(TENANT_BASE, { waitUntil: 'domcontentloaded' });
    }

    // 7. Confirm we are on the tenant subdomain.
    await page.waitForURL(
      (url) => url.toString().startsWith(TENANT_BASE),
      { timeout: 20_000 },
    );
    await expect(page).toHaveURL(new RegExp(`^${TENANT_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    // 8. Tenant isolation.
    const bodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(bodyText, 'tenant SPA after handshake sign-in');

    // 9. Verify __session cookie is scoped to tenant subdomain (not apex).
    const cookies = await page.context().cookies();
    const sessionCookies = cookies.filter((c) => c.name === '__session');
    expect(sessionCookies.length).toBeGreaterThanOrEqual(1);
    const domainCookie = sessionCookies.find((c) =>
      (c.domain ?? '').includes(TENANT),
    );
    expect(domainCookie).toBeDefined();
    expect((domainCookie?.value ?? '').length).toBeGreaterThan(0);

    // 10. Save storageState for downstream specs.
    const dir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  });

  /**
   * should serve tenant SPA without re-triggering handshake when valid session cookie exists
   *
   * Steady-state path: once the cookie is set, subsequent navigations must
   * resolve directly (no intermediate handshake redirect).
   * Reuses storageState written by the gate test above.
   */
  test('should serve tenant SPA without handshake redirect when valid __session cookie is present', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    const handshakeHits: string[] = [];
    page.on('request', (req) => {
      if (req.url().startsWith(HANDSHAKE_ENDPOINT)) {
        handshakeHits.push(req.url());
      }
    });

    const response = await page.goto(TENANT_BASE, {
      waitUntil: 'domcontentloaded',
    });

    // Must reach tenant SPA directly — no handshake call.
    expect(handshakeHits).toHaveLength(0);
    expect(page.url()).toMatch(new RegExp(`^${TENANT_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    if (response) {
      expect(response.status()).toBeLessThan(400);
    }

    // Tenant isolation.
    const bodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(bodyText, 'steady-state tenant SPA');

    await ctx.close();
  });

  /**
   * should 302 to re-handshake endpoint (not 401) when __od_handshake JWT is expired (Bug 9)
   *
   * Bug 9 contract: resolver MUST 302 to re-mint when the handshake-URL JWT
   * has expired (kind=expired), NOT return 401.
   *
   * Strategy: craft a syntactically valid JWT with exp=1 (always-expired) and
   * send it as __od_handshake param. Inspect the 302 Location header without
   * following the redirect, confirming it points back to HANDSHAKE_ENDPOINT
   * without the expired token.
   *
   * NOTE: The daemon's verifyClerkSession calls Clerk's JWKS endpoint to
   * verify the RS256 signature. With an all-zero signature the verification
   * fails, but the error kind will be 'invalid_signature' rather than
   * 'expired', which would NOT trigger Bug 9's re-handshake branch.
   *
   * This test therefore verifies the 302 behavior at the HTTP level and
   * asserts the Location matches the re-handshake pattern. To trigger the
   * exact 'expired' kind, the daemon must be pointed at a JWKS that signs
   * the test token — that is covered by the unit tests in
   * apps/daemon/tests/tenants/resolver.test.ts cases (14) and (15).
   *
   * If the daemon returns 401 instead of 302 for this payload, it means:
   *   (a) Bug 9 is not deployed in the running image, OR
   *   (b) The JWT is being rejected as malformed before the exp check.
   * Either case is a failure of the Bug 9 contract.
   */
  // Skipped: an all-zero-signature JWT is rejected by Clerk JWKS as
  // `invalid_signature` before the resolver's `exp` check fires, so we cannot
  // hit the Bug 9 (`kind=expired`) branch from a Playwright client without
  // access to Clerk's private signing key. The exact branch is verified by
  // unit tests in apps/daemon/tests/tenants/resolver.test.ts cases (14) and (15).
  // Keep this test as a documented skip so future runs do not regress to
  // re-enabling it without a real signed-but-expired JWT minting strategy.
  test.skip('should 302 to re-handshake endpoint when __od_handshake JWT is expired (Bug 9)', async ({
    page,
  }) => {
    // Build an always-expired JWT payload.
    // Header: {"alg":"RS256","typ":"JWT"}
    const header = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user_test',
        sid: 'sess_test',
        o: { slg: TENANT },
        iat: 1,
        exp: 1, // epoch second 1 → always expired
      }),
    ).toString('base64url');
    // All-zero signature — will fail JWKS verification; daemon still reads
    // exp from the payload before the JWKS call in some Clerk SDK versions.
    // If not, the test degrades to checking that non-200 is not a silent 200.
    const expiredJwt = `${header}.${payload}.AAAAAAAAAA`;
    const targetPath = `/?__od_handshake=${encodeURIComponent(expiredJwt)}`;

    // Send without following redirects to inspect the intermediate response.
    const response = await page.request.get(`${TENANT_BASE}${targetPath}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    const status = response.status();
    const location = response.headers()['location'] ?? '';

    // Bug 9 fix: MUST be 302, not 401.
    // If the daemon is running a pre-Bug-9 image this assertion will fail,
    // which is the correct failure mode — the test is a green-light gate.
    expect(status, `Expected 302 re-handshake redirect for expired JWT; got ${status}. Bug 9 may not be deployed.`).toBe(302);

    // Location must point back to the handshake endpoint for re-minting.
    expect(location, 'Re-handshake Location must point to HANDSHAKE_ENDPOINT').toContain(HANDSHAKE_ENDPOINT);

    // The re-handshake URL must NOT carry the expired __od_handshake param.
    expect(location, 'Re-handshake URL must not carry expired __od_handshake param').not.toContain('__od_handshake');
  });
});
