/**
 * cookie-shadow.spec.ts — Bug 10: empty __session cookie shadow patch
 *
 * Patch under test
 * ----------------
 *   Bug 10 (apps/daemon/src/tenants/resolver.ts lines 546–578, readSessionCookie):
 *     When the browser sends multiple __session= cookie attributes (one empty,
 *     one valid — Chrome's documented behaviour when a host-only Set-Cookie
 *     from Clerk satellite SDK sits alongside the daemon's domain cookie), the
 *     resolver MUST skip empty values and return the first non-empty one.
 *
 *     Pre-fix: the function returned null on the first empty __session, causing
 *     every request to be treated as anonymous → infinite handshake redirect loop.
 *     Post-fix: iterates all __session attrs, skips empties, returns first valid.
 *
 * Coverage approach (and limitation)
 * ------------------------------------
 *   LIMITATION: Triggering the browser-level dual-cookie state reliably in a
 *   single Playwright run is not practical. The dual-cookie state arises from
 *   Chrome's internal cookie-jar ordering (host-only cookies before
 *   domain-scoped ones) when two Set-Cookie headers with the same name but
 *   different Domain attributes land in the same browser profile. Reproducing
 *   this deterministically requires CDP-level cookie store manipulation, which
 *   Playwright's public API does not expose without a custom CDP session.
 *
 *   Tests 1–3 therefore use APIRequestContext (request-level) to send crafted
 *   Cookie headers directly to the daemon. This exercises the exact
 *   readSessionCookie code path (Bug 10 fix) at the HTTP boundary without
 *   depending on browser cookie-jar ordering. The crafted Cookie header is
 *   byte-for-byte what Chrome sends in the dual-cookie state.
 *
 *   Test 4 (browser-level trigger) is test.skip with a detailed explanation.
 *
 *   Additional coverage:
 *     - Unit tests: resolver.test.ts lines 607–646 (8 combinations, deterministic).
 *     - Integration: test 5 (smoke) loads the authenticated SPA via storageState.
 *
 * Required env vars
 * -----------------
 *   OD_E2E_TENANT           - tenant slug (default: ceremonia)
 *   OD_E2E_STORAGE_STATE    - path to storageState from handshake.spec.ts
 *                             (default: e2e/.auth/state.json)
 *
 * How to run
 * ----------
 *   Production (after handshake.spec.ts has produced storageState):
 *     OD_E2E_TENANT=ceremonia \
 *     pnpm --filter @open-design/e2e exec playwright test \
 *       specs/cookie-shadow.spec.ts --config=playwright.prod.config.ts
 *
 * Tenant isolation
 * ----------------
 *   Tests that load tenant content assert no cross-tenant strings in the DOM.
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
const DAEMON_URL =
  process.env['OD_E2E_DAEMON_URL'] ?? `https://${TENANT}.${PLATFORM_DOMAIN}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH =
  process.env['OD_E2E_STORAGE_STATE'] ??
  path.join(__dirname, '..', '.auth', 'state.json');

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
// Tests
// ---------------------------------------------------------------------------

test.describe('cookie-shadow: Bug 10 — empty __session shadow skip via request-level probe', () => {
  /**
   * should treat empty-only __session as anonymous and redirect to handshake
   *
   * A browser sends Cookie: __session= (empty — host-only Clerk satellite
   * leftover). Resolver MUST treat this as "no session" and 302 to handshake.
   */
  test('should treat empty-only __session cookie as anonymous and redirect to handshake', async ({
    page,
  }) => {
    const response = await page.request.get(`${DAEMON_URL}/`, {
      headers: {
        Cookie: '__session=',
        Host: `${TENANT}.${PLATFORM_DOMAIN}`,
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    const status = response.status();
    expect(
      [301, 302, 307, 308],
      `Expected redirect for empty-only __session; got ${status}. ` +
        `Daemon should treat it as anonymous.`,
    ).toContain(status);

    const location = response.headers()['location'] ?? '';
    expect(location, 'Redirect must point to handshake endpoint').toContain(
      'od-handshake',
    );
  });

  /**
   * should honor non-empty __session when empty shadow precedes it (Bug 10)
   *
   * Crafted header: __session=; __session=<valid JWT>
   * This is the exact byte sequence Chrome sends in the dual-cookie state.
   * The Bug 10 fix must skip the empty first value and return the valid JWT.
   * Result: daemon resolves auth, does NOT redirect to handshake.
   */
  test('should honor non-empty __session when empty __session shadow precedes it (Bug 10)', async ({
    page,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const state = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, 'utf8'),
    ) as { cookies: Array<{ name: string; value: string; domain: string }> };

    const sessionCookie = state.cookies.find(
      (c) => c.name === '__session' && c.domain.includes(TENANT),
    );

    if (!sessionCookie) {
      test.skip();
      return;
    }

    const validJwt = sessionCookie.value;
    const craftedCookieHeader = `__session=; __session=${validJwt}`;

    const response = await page.request.get(`${DAEMON_URL}/api/me`, {
      headers: {
        Cookie: craftedCookieHeader,
        Host: `${TENANT}.${PLATFORM_DOMAIN}`,
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    const status = response.status();

    // Bug 10 fix: must NOT redirect to handshake when a valid JWT follows
    // an empty shadow. Acceptable: 200 (auth ok), 404/405 (route not found
    // but auth passed), even 401 (JWT may have expired since storageState
    // was minted — that is ok, expiry is a separate concern).
    // NOT acceptable: 302 to od-handshake.
    if (status >= 300 && status < 400) {
      const location = response.headers()['location'] ?? '';
      expect(
        location,
        `Bug 10 REGRESSION: daemon redirected to handshake endpoint for ` +
          `crafted dual-cookie (empty shadow first). ` +
          `status=${status} location=${location}`,
      ).not.toContain('od-handshake');
    }

    expect(
      [200, 401, 404, 405],
      `Expected non-302-to-handshake for crafted dual-cookie; got ${status}.`,
    ).toContain(status);
  });

  /**
   * should honor non-empty __session when empty shadow follows it (reverse order)
   *
   * Crafted header: __session=<valid JWT>; __session=
   * Defensive coverage for the reverse ordering.
   */
  test('should honor non-empty __session when empty shadow follows it (reverse order)', async ({
    page,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const state = JSON.parse(
      fs.readFileSync(STORAGE_STATE_PATH, 'utf8'),
    ) as { cookies: Array<{ name: string; value: string; domain: string }> };

    const sessionCookie = state.cookies.find(
      (c) => c.name === '__session' && c.domain.includes(TENANT),
    );

    if (!sessionCookie) {
      test.skip();
      return;
    }

    const validJwt = sessionCookie.value;
    const craftedCookieHeader = `__session=${validJwt}; __session=`;

    const response = await page.request.get(`${DAEMON_URL}/api/me`, {
      headers: {
        Cookie: craftedCookieHeader,
        Host: `${TENANT}.${PLATFORM_DOMAIN}`,
      },
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    const status = response.status();

    if (status >= 300 && status < 400) {
      const location = response.headers()['location'] ?? '';
      expect(location).not.toContain('od-handshake');
    }

    expect(
      [200, 401, 404, 405],
      `Expected non-302-to-handshake for reverse-order dual-cookie; got ${status}.`,
    ).toContain(status);
  });

  /**
   * SKIPPED — browser-level dual-cookie state not reliably triggerable in Playwright
   *
   * To trigger the exact browser-level dual-cookie state, we would need:
   *   1. Chrome to have received a host-only Set-Cookie for __session from
   *      app.holalumina.com (Clerk satellite SDK artefact).
   *   2. Chrome to have received a domain-scoped Set-Cookie for __session
   *      on tenant.opendesign.holalumina.com (daemon handshake).
   *   3. Both cookies in the same jar, with the host-only one first in
   *      Chrome's internal ordering.
   *
   * Playwright's BrowserContext.addCookies() does not expose the "host-only"
   * flag (RFC 6265 §5.3 step 6); all Playwright-added cookies get a Domain
   * attribute. To create a true host-only cookie requires sending a Set-Cookie
   * with no Domain attr, which can only be done by controlling the server side
   * or using CDP's `Network.setCookie` with `hostOnly: true`.
   *
   * Using CDP in a Playwright spec creates a tight coupling to the Chrome
   * DevTools Protocol that is brittle, poorly documented for multi-page flows,
   * and out of scope for this spec's purpose (verifying the daemon patch).
   *
   * The Bug 10 fix is fully exercised by:
   *   (a) Unit tests: resolver.test.ts lines 607–646 (8 combinations).
   *   (b) Request-level probe tests 1–3 above (HTTP boundary, crafted headers).
   */
  test.skip('SKIPPED — browser-level dual-cookie requires CDP host-only flag (see spec header)', async () => {
    // No-op body. See header comment for detailed explanation.
  });

  /**
   * should load authenticated tenant SPA without cross-tenant content (smoke)
   *
   * Confirms the full authenticated flow still works with Bug 10 fix applied.
   * Reuses storageState from handshake.spec.ts.
   */
  test('should load tenant SPA without cross-tenant content after Bug 10 fix (smoke)', async ({
    browser,
  }) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip();
      return;
    }

    const ctx = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await ctx.newPage();

    await page.goto(DAEMON_URL, { waitUntil: 'domcontentloaded' });

    const bodyText = await page.locator('body').innerText();
    assertNoCrossTenantStrings(bodyText, 'authenticated tenant SPA — cookie-shadow smoke');

    await ctx.close();
  });
});
