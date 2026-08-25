import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright';

type BridgeEvent = {
  kind: 'plan_exposure' | 'pricing_click';
  payload: Record<string, unknown>;
};

type BridgeRequest = {
  sourceSurface: 'wallet' | 'dashboard';
  sessionId: string;
  events: BridgeEvent[];
};

type BillingFixture = {
  membershipTier?: string;
  billingInterval?: 'monthly' | 'yearly';
  personalSubscriptionCheckoutAllowed?: boolean;
  firstMonthIntroEligible?: boolean;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionStatus?: string;
  subscriptionEntitlementStatus?: string;
  availableActions?: string[];
};

const landingRoot = fileURLToPath(new URL('..', import.meta.url));
let browser: Browser;
let server: ChildProcess;
let baseUrl: string;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (!address || typeof address === 'string') {
        socket.close();
        reject(new Error('failed to allocate a browser-test port'));
        return;
      }
      const { port } = address;
      socket.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Astro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Astro did not become ready at ${url}`);
}

async function buildLandingPage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const build = spawn('pnpm', ['exec', 'astro', 'build'], {
      cwd: landingRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    build.stdout?.on('data', (chunk) => { output += String(chunk); });
    build.stderr?.on('data', (chunk) => { output += String(chunk); });
    build.once('error', reject);
    build.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Astro build failed (${code ?? 'signal'}):\n${output}`));
    });
  });
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await buildLandingPage();
  server = spawn(
    'pnpm',
    ['exec', 'astro', 'preview', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: landingRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let serverOutput = '';
  server.stdout?.on('data', (chunk) => { serverOutput += String(chunk); });
  server.stderr?.on('data', (chunk) => { serverOutput += String(chunk); });
  server.once('exit', (code) => {
    if (code && code !== 0) process.stderr.write(serverOutput);
  });
  await waitForServer(`${baseUrl}/pricing/`);

  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
});

after(async () => {
  await browser?.close();
  if (server && !server.killed) server.kill('SIGTERM');
});

async function openPricing(input: {
  billing?: BillingFixture;
  browserLocale?: string;
  sourcePath?: '/dashboard' | '/wallet' | '/not-a-pricing-source' | null;
  signedIn?: boolean;
  targetHref?: string;
} = {}): Promise<{ page: Page; requests: BridgeRequest[]; navigations: string[] }> {
  const context = await browser.newContext({
    locale: input.browserLocale ?? 'en-US',
  });
  const page = await context.newPage();
  const requests: BridgeRequest[] = [];
  const navigations: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigations.push(request.url());
    }
  });
  const sourcePath = input.sourcePath === undefined ? '/dashboard' : input.sourcePath;
  const targetHref = input.targetHref ?? '/pricing/';
  const signedIn = input.signedIn ?? true;
  const billing: BillingFixture = {
    personalSubscriptionCheckoutAllowed: true,
    firstMonthIntroEligible: true,
    subscriptionCancelAtPeriodEnd: false,
    availableActions: ['billing_portal'],
    ...input.billing,
  };

  await page.route('https://amr-api.open-design.ai/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const cors = {
      'Access-Control-Allow-Origin': baseUrl,
      'Access-Control-Allow-Credentials': 'true',
      'Content-Type': 'application/json',
    };
    if (pathname === '/api/auth/get-session') {
      await route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify(signedIn ? { user: { id: 'user-1' } } : null),
      });
      return;
    }
    if (pathname === '/api/v1/billing/summary') {
      await route.fulfill({ status: 200, headers: cors, body: JSON.stringify(billing) });
      return;
    }
    if (pathname === '/api/v1/analytics/pricing-events') {
      requests.push(request.postDataJSON() as BridgeRequest);
      await route.fulfill({ status: 204, headers: cors, body: '' });
      return;
    }
    await route.abort();
  });

  if (sourcePath) {
    await page.route(`${baseUrl}${sourcePath}`, async (route) => {
      const escapedTargetHref = targetHref
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;');
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><a id="pricing-link" href="${escapedTargetHref}">Pricing</a>`,
      });
    });
    await page.goto(`${baseUrl}${sourcePath}`);
    await page.locator('#pricing-link').click();
    await page.waitForURL((url) => url.pathname.endsWith('/pricing/'));
  } else {
    await page.goto(`${baseUrl}/pricing/`);
  }
  return { page, requests, navigations };
}

async function waitForRequests(
  requests: BridgeRequest[],
  count: number,
): Promise<void> {
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 5_000;
    while (requests.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(requests.length >= count, `expected ${count} bridge request(s), got ${requests.length}`);
  });
}

function flattened(requests: BridgeRequest[]): BridgeEvent[] {
  return requests.flatMap((request) => request.events);
}

describe('authenticated Pricing compatibility browser wiring', { concurrency: false }, () => {
  it('sends corrected Go Plus Pro Max context on the first trusted dashboard exposure', async (t) => {
    const { page, requests, navigations } = await openPricing({
      billing: {
        membershipTier: 'pro',
        billingInterval: 'monthly',
        firstMonthIntroEligible: false,
      },
    });
    t.after(() => page.context().close());
    await page.waitForFunction(() =>
      document.querySelector('[data-pricing-root]')?.getAttribute(
        'data-personal-pricing-context-resolved',
      ) === 'true',
    );
    assert.equal(
      await page.evaluate(() => document.referrer),
      `${baseUrl}/dashboard`,
      navigations.join(' -> '),
    );
    await waitForRequests(requests, 1);

    assert.equal(requests[0]?.sourceSurface, 'dashboard');
    assert.ok(requests[0]?.sessionId);
    assert.deepEqual(
      requests[0]?.events.map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
    assert.deepEqual(
      requests[0]?.events.map((event) => [
        event.payload.planId,
        event.payload.billingInterval,
        event.payload.firstMonthEligible,
        event.payload.isCurrentPlan,
      ]),
      [
        ['go', 'monthly', false, false],
        ['plus', 'monthly', false, false],
        ['pro', 'monthly', false, true],
        ['max', 'monthly', false, false],
      ],
    );
  });

  it('preserves wallet attribution for a direct Chinese Vela locale handoff', async (t) => {
    const targetHref =
      '/zh/pricing/?od_locale=zh&cloud_console_base=' +
      encodeURIComponent('https://open-design.ai/cloud/');
    const { page, requests, navigations } = await openPricing({
      browserLocale: 'zh-CN',
      sourcePath: '/wallet',
      targetHref,
    });
    t.after(() => page.context().close());
    await waitForRequests(requests, 1);

    assert.deepEqual(navigations, [
      `${baseUrl}/wallet`,
      `${baseUrl}${targetHref}`,
    ]);
    assert.equal(
      page.url(),
      `${baseUrl}/zh/pricing/?cloud_console_base=${encodeURIComponent('https://open-design.ai/cloud/')}`,
    );
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-CN');
    assert.equal(await page.evaluate(() => document.referrer), `${baseUrl}/wallet`);
    assert.equal(requests[0]?.sourceSurface, 'wallet');
    assert.deepEqual(
      requests[0]?.events.map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
  });

  it('fails closed for direct, untrusted-route, and signed-out traffic', async (t) => {
    for (const fixture of [
      { sourcePath: null, signedIn: true },
      { sourcePath: '/not-a-pricing-source' as const, signedIn: true },
      { sourcePath: '/dashboard' as const, signedIn: false },
    ]) {
      const opened = await openPricing(fixture);
      t.after(() => opened.page.context().close());
      await opened.page.waitForTimeout(300);
      assert.deepEqual(opened.requests, [], JSON.stringify(fixture));
    }
  });

  it('orders interval click before new exposures and re-exposes after Team', async (t) => {
    const { page, requests } = await openPricing();
    t.after(() => page.context().close());
    await waitForRequests(requests, 1);

    await page.locator('[data-interval-btn="monthly"]').click();
    await waitForRequests(requests, 2);
    assert.deepEqual(
      requests[1]?.events.map((event) =>
        event.kind === 'pricing_click' ? event.payload.element : event.payload.planId,
      ),
      ['change_interval', 'go', 'plus', 'pro', 'max'],
    );

    await page.locator('[data-audience-btn="team"]').click();
    await page.locator('[data-audience-btn="creator"]').click();
    await waitForRequests(requests, 3);
    assert.deepEqual(
      requests[2]?.events.map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
  });

  it('excludes disabled Personal CTAs and records invalid Enterprise submit intent', async (t) => {
    const { page, requests } = await openPricing({
      billing: { membershipTier: 'pro', billingInterval: 'yearly' },
    });
    t.after(() => page.context().close());
    await waitForRequests(requests, 1);

    const disabledPro = page.locator('[data-pricing-cta][data-tier="pro"]');
    await assert.doesNotReject(() => disabledPro.click({ force: true }));
    await page.waitForTimeout(100);
    assert.equal(
      flattened(requests).filter((event) => event.kind === 'pricing_click').length,
      0,
    );

    await page.locator('[data-audience-btn="team"]').click();
    await page.locator('[data-open-lead-modal]').click();
    await waitForRequests(requests, 2);
    await page.locator('#ent-form button[type="submit"]').click();
    await waitForRequests(requests, 3);
    assert.deepEqual(
      flattened(requests)
        .filter((event) => event.kind === 'pricing_click')
        .map((event) => event.payload),
      [
        {
          element: 'request_team_access',
          currentPlanId: 'pro',
          currentBillingInterval: 'yearly',
        },
        {
          element: 'team_lead_submit',
          currentPlanId: 'pro',
          currentBillingInterval: 'yearly',
        },
      ],
    );
  });
});
