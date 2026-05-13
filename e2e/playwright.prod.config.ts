/**
 * Playwright configuration for production (Hetzner / Caddy) runs.
 *
 * Required env vars
 * -----------------
 *   OD_E2E_TENANT         - target tenant slug: ceremonia | lumina | ericedmeades
 *   OD_E2E_PROD_EMAIL     - Clerk account email (email+password only — NO Google SSO)
 *   OD_E2E_PROD_PASSWORD  - Clerk account password
 *
 * Optional
 *   OD_E2E_STORAGE_STATE  - path for signed-in storageState JSON
 *                           (default: e2e/.auth/state.json)
 *
 * Run commands
 * ------------
 *   # Against ceremonia tenant
 *   OD_E2E_TENANT=ceremonia \
 *   OD_E2E_PROD_EMAIL=<email> \
 *   OD_E2E_PROD_PASSWORD=<password> \
 *   pnpm --filter @open-design/e2e exec playwright test \
 *     --config=playwright.prod.config.ts
 *
 *   # Against lumina tenant
 *   OD_E2E_TENANT=lumina ... (same pattern)
 *
 *   # Against ericedmeades tenant
 *   OD_E2E_TENANT=ericedmeades ... (same pattern)
 *
 *   # Run a single spec against prod
 *   OD_E2E_TENANT=ceremonia ... playwright test \
 *     specs/handshake.spec.ts --config=playwright.prod.config.ts
 *
 * Design note
 * -----------
 * No webServer stanza — the daemon is running on Hetzner behind Caddy. Caddy
 * handles TLS termination and subdomain routing to the single
 * open-design-daemon container at 159.69.144.136.
 *
 * Spec ordering: fullyParallel=false so handshake.spec.ts (auth gate,
 * produces storageState) runs first before the three specs that reuse it.
 */

import { defineConfig, devices } from '@playwright/test';

const TENANT = process.env['OD_E2E_TENANT'] ?? 'ceremonia';
const VALID_TENANTS = ['ceremonia', 'lumina', 'ericedmeades'] as const;
type Tenant = (typeof VALID_TENANTS)[number];

function assertTenant(t: string): asserts t is Tenant {
  if (!(VALID_TENANTS as readonly string[]).includes(t)) {
    throw new Error(
      `OD_E2E_TENANT must be one of ${VALID_TENANTS.join(' | ')}. Got: "${t}"`,
    );
  }
}
assertTenant(TENANT);

const PLATFORM_DOMAIN = 'opendesign.holalumina.com';

export const PROD_BASE_URL = `https://${TENANT}.${PLATFORM_DOMAIN}` as const;

export default defineConfig({
  testDir: './specs',
  // Exclude the local-mocked app.spec.ts suite — its cases rely on mocked SSE
  // routes and `e2e/cases/index.ts` fixtures that don't exist against prod.
  testIgnore: ['**/app.spec.ts'],
  outputDir: './reports/test-results-prod',

  // Generous timeout: jwt-expiry-survival.spec can need up to 7 min; real-network
  // Vercel deploys take 30-60 s; handshake redirects take multiple round-trips.
  timeout: 480_000,
  expect: {
    timeout: 30_000,
  },

  // Run serially so handshake.spec (auth gate, sets storageState) finishes
  // before cookie-shadow / lumina-swap / vercel-deploy / jwt-expiry-survival
  // attempt to consume it.
  fullyParallel: false,

  reporter: process.env['CI']
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report-prod' }],
        ['json', { outputFile: './reports/results-prod.json' }],
        ['junit', { outputFile: './reports/junit-prod.xml' }],
        ['./reporters/markdown-reporter.ts', { outputFile: './reports/latest-prod.md' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report-prod' }],
        ['json', { outputFile: './reports/results-prod.json' }],
        ['junit', { outputFile: './reports/junit-prod.xml' }],
        ['./reporters/markdown-reporter.ts', { outputFile: './reports/latest-prod.md' }],
      ],

  use: {
    baseURL: PROD_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: false,
  },

  // No webServer — daemon is live on Hetzner.
  projects: [
    {
      name: `prod-${TENANT}-chromium`,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
