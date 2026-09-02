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
  attribution?: {
    sourceProduct: 'open_design';
    entryId: string;
    sourceDetail: string;
    entryOccurredAt: string;
    campaignId?: string;
    conversionSource?: string;
    odDeviceId?: string;
  };
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
  billingStatus?: number;
  browserLocale?: string;
  sourcePath?: '/dashboard' | '/wallet' | '/not-a-pricing-source' | null;
  signedIn?: boolean;
  targetHref?: string;
} = {}): Promise<{ page: Page; requests: BridgeRequest[]; navigations: string[] }> {
  const context = await browser.newContext({
    locale: input.browserLocale ?? 'en-US',
  });
  const page = await context.newPage();
  // Capture the production tracker without sending QA events to live PostHog.
  await context.addInitScript(() => {
    const state = window as unknown as { __qaEvents: Array<{ name: string; props: Record<string, unknown> }>; posthog: unknown };
    state.__qaEvents = [];
    state.posthog = { __SV: 1, init() {}, capture(name: string, props: Record<string, unknown>) { state.__qaEvents.push({ name, props }); } };
  });
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
      const billingStatus = input.billingStatus ?? 200;
      await route.fulfill({
        status: billingStatus,
        headers: cors,
        body: billingStatus >= 400 ? 'error' : JSON.stringify(billing),
      });
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
  it('joins anonymous Personal and Team impressions to the actual checkout URLs', async (t) => {
    for (const [audience, button] of [['creator', 'left'], ['team', 'left'], ['creator', 'middle'], ['team', 'middle']] as const) {
      const { page } = await openPricing({ signedIn: false, sourcePath: null });
      t.after(() => page.context().close());
      if (audience === 'team') await page.locator('[data-audience-btn="team"]').click();
      const events = await page.evaluate(() => (window as unknown as { __qaEvents: Array<{ name: string; props: Record<string, unknown> }> }).__qaEvents);
      const impression = events.find((event) => event.name === 'surface_view' && event.props.element === 'plan_view' && event.props.audience === audience);
      assert.ok(impression?.props.entry_id, `${audience} impression must have an entry before auth`);
      const originalId = impression.props.entry_id;
      await page.context().route('https://open-design.ai/**', (route) => route.abort());
      const cta = page.locator(audience === 'team' ? '[data-pricing-cta][data-tier="team"]' : '[data-pricing-cta][data-tier="plus"]').first();
      const nativeHref = new URL((await cta.getAttribute('href'))!);
      assert.equal(nativeHref.searchParams.get('od_entry_id'), originalId, 'context-menu and middle-click need the attributed href before click');
      let url: URL;
      if (button === 'middle') {
        const opened = page.context().waitForEvent('page');
        await cta.click({ button });
        const popup = await opened;
        await popup.waitForURL((url) => url.searchParams.has('od_entry_id'));
        url = new URL(popup.url());
      } else {
        const navigation = page.waitForRequest((request) => request.isNavigationRequest() && request.url().includes('od_entry_id='));
        await cta.click();
        url = new URL((await navigation).url());
      }
      assert.equal(url.searchParams.get('od_entry_id'), originalId);
      assert.equal(url.searchParams.get('od_entry_source'), 'landing_pricing_unattributed');
      assert.equal(url.searchParams.get('od_conversion_source'), audience === 'team' ? 'landing_pricing_team_plan' : 'landing_pricing_personal_plan');
    }
  });
  it('carries the header entry through a native middle-click without claiming a render as a visit', async (t) => {
    const { page } = await openPricing({ signedIn: false, sourcePath: null });
    t.after(() => page.context().close());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      sessionStorage.removeItem('od.pricingEntry.v1');
      localStorage.removeItem('amr.openDesignAttribution.v1');
    });
    await page.goto(baseUrl + '/');
    const link = page.locator('header a[href*="/pricing/"]').first();
    const href = new URL((await link.getAttribute('href'))!);
    assert.equal(href.searchParams.get('od_entry_source'), 'landing_pricing_header');
    assert.equal(await page.evaluate(() => localStorage.getItem('amr.openDesignAttribution.v1')), null);
    await page.context().route('https://amr-api.open-design.ai/**', (route) => route.abort());
    const opened = page.context().waitForEvent('page');
    await link.click({ button: 'middle' });
    const popup = await opened;
    await popup.waitForURL((url) => url.searchParams.has('od_entry_id'));
    assert.equal(new URL(popup.url()).searchParams.get('od_entry_id'), href.searchParams.get('od_entry_id'));
    assert.equal(await popup.evaluate(() => window.__odPricingBridgeAttribution?.entryId), href.searchParams.get('od_entry_id'));
  });
  it('shows Go as sold out for a signed-out visitor', async (t) => {
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      signedIn: false,
      targetHref: '/zh/pricing/',
    });
    t.after(() => page.context().close());
    const go = page.locator('[data-pricing-cta][data-tier="go"]');
    await go.waitFor();

    assert.equal((await go.textContent())?.trim(), '已停售');
    assert.equal(await go.getAttribute('aria-disabled'), 'true');
    assert.equal(await go.getAttribute('href'), null);
    assert.equal(
      await page.locator('[data-pricing-root]').getAttribute(
        'data-personal-pricing-context-resolved',
      ),
      null,
    );
  });

  it('renders yearly first without an interval swap for a signed-out visitor', async (t) => {
    const html = await (await fetch(`${baseUrl}/zh/pricing/`)).text();
    const pricingRootTag = html.match(/<article[^>]*data-pricing-root[^>]*>/)?.[0];
    assert.match(pricingRootTag ?? '', /data-interval="yearly"/);
    assert.match(
      html,
      /data-interval-btn="yearly"[^>]*aria-selected="true"/,
    );

    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      signedIn: false,
      targetHref: '/zh/pricing/',
    });
    t.after(() => page.context().close());
    await page.locator('[data-pricing-cta][data-tier="go"]').waitFor();

    assert.equal(
      await page.locator('[data-pricing-root]').getAttribute('data-interval'),
      'yearly',
    );
    assert.equal(
      await page.locator('[data-interval-btn="yearly"]').getAttribute('aria-selected'),
      'true',
    );
  });

  it('shows first-month prices on monthly cards for a signed-out visitor', async (t) => {
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      signedIn: false,
      targetHref: '/zh/pricing/',
    });
    t.after(() => page.context().close());
    await page.locator('[data-pricing-cta][data-tier="go"]').waitFor();
    await page.locator('[data-interval-btn="monthly"]').click();

    const prices = await page.locator(
      '.pricing-card:not([data-tier="go"]) [data-monthly-price]',
    ).allTextContents();
    const originalPrices = await page.locator(
      '.pricing-card:not([data-tier="go"]) .price[data-when="monthly"] del',
    ).allTextContents();

    assert.deepEqual(prices.map((price) => price.trim()), ['16', '70', '120']);
    assert.deepEqual(
      originalPrices.map((price) => price.trim()),
      ['$20', '$100', '$200'],
    );
  });

  it('keeps paid yearly upgrades enabled for a signed-out visitor', async (t) => {
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      signedIn: false,
      targetHref: '/zh/pricing/',
    });
    t.after(() => page.context().close());
    await page.locator('[data-pricing-cta][data-tier="go"]').waitFor();
    await page.locator('[data-interval-btn="yearly"]').click();

    const states = await page.locator('[data-pricing-cta]').evaluateAll((ctas) =>
      ctas.slice(0, 4).map((cta) => ({
        tier: cta.getAttribute('data-tier'),
        text: cta.textContent?.trim(),
        disabled: cta.getAttribute('aria-disabled'),
      })),
    );
    assert.deepEqual(states, [
      { tier: 'go', text: '已停售', disabled: 'true' },
      { tier: 'plus', text: '升级 Plus', disabled: null },
      { tier: 'pro', text: '升级 Pro', disabled: null },
      { tier: 'max', text: '升级 Max', disabled: null },
    ]);
  });

  it('leaves static CTAs unchanged when billing summary fails', async (t) => {
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      signedIn: true,
      billingStatus: 500,
      targetHref: '/zh/pricing/',
    });
    t.after(() => page.context().close());
    await page.locator('[data-pricing-cta][data-tier="go"]').waitFor();
    await page.waitForTimeout(300);

    assert.equal(
      await page.locator('[data-pricing-root]').getAttribute(
        'data-personal-pricing-context-resolved',
      ),
      null,
    );
    const states = await page.locator('[data-pricing-cta]').evaluateAll((ctas) =>
      ctas.slice(0, 4).map((cta) => ({
        tier: cta.getAttribute('data-tier'),
        text: cta.textContent?.trim(),
        disabled: cta.getAttribute('aria-disabled'),
      })),
    );
    assert.deepEqual(states, [
      { tier: 'go', text: '已停售', disabled: 'true' },
      { tier: 'plus', text: '升级 Plus', disabled: null },
      { tier: 'pro', text: '升级 Pro', disabled: null },
      { tier: 'max', text: '升级 Max', disabled: null },
    ]);
  });

  it('ignores legacy demo_plan query and keeps live billing current plan', async (t) => {
    // Regression: ?demo_plan=pro used to synthesize a Pro context and mark Pro
    // as current even when live billing said otherwise. Public demo_plan is gone.
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      targetHref: '/zh/pricing/?demo_plan=pro',
      billing: { membershipTier: 'plus', billingInterval: 'yearly' },
    });
    t.after(() => page.context().close());
    await page.waitForFunction(() =>
      document.querySelector('[data-pricing-root]')?.getAttribute(
        'data-personal-pricing-context-resolved',
      ) === 'true',
    );

    assert.match(page.url(), /[?&]demo_plan=pro(?:&|$)/);
    const states = await page.locator('[data-pricing-cta]').evaluateAll((ctas) =>
      ctas.slice(0, 4).map((cta) => ({
        tier: cta.getAttribute('data-tier'),
        text: cta.textContent?.trim(),
        disabled: cta.getAttribute('aria-disabled'),
      })),
    );
    assert.deepEqual(states, [
      { tier: 'go', text: '已停售', disabled: 'true' },
      { tier: 'plus', text: '当前套餐', disabled: 'true' },
      { tier: 'pro', text: '升级 Pro', disabled: null },
      { tier: 'max', text: '升级 Max', disabled: null },
    ]);
  });

  it('shows lower tiers as disabled Subscribe buttons for a current Pro user', async (t) => {
    const { page } = await openPricing({
      browserLocale: 'zh-CN',
      targetHref: '/zh/pricing/',
      billing: { membershipTier: 'pro', billingInterval: 'yearly' },
    });
    t.after(() => page.context().close());
    await page.waitForFunction(() =>
      document.querySelector('[data-pricing-root]')?.getAttribute(
        'data-personal-pricing-context-resolved',
      ) === 'true',
    );

    const states = await page.locator('[data-pricing-cta]').evaluateAll((ctas) =>
      ctas.slice(0, 4).map((cta) => ({
        tier: cta.getAttribute('data-tier'),
        text: cta.textContent?.trim(),
        disabled: cta.getAttribute('aria-disabled'),
      })),
    );
    assert.deepEqual(states, [
      { tier: 'go', text: '已停售', disabled: 'true' },
      { tier: 'plus', text: '订阅', disabled: 'true' },
      { tier: 'pro', text: '当前套餐', disabled: 'true' },
      { tier: 'max', text: '升级 Max', disabled: null },
    ]);
  });

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
      encodeURIComponent('https://open-design.ai/cloud/') +
      '&od_origin=open_design' +
      '&od_entry_id=od-amr-entry-1' +
      '&od_entry_source=home_balance_gate_upgrade' +
      '&od_entry_at=2026-08-25T12%3A00%3A00.000Z' +
      '&od_campaign_id=go_plan_sunset_202608' +
      '&od_conversion_source=go_plan_sunset_modal' +
      '&od_device_id=device-1';
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
      `${baseUrl}${targetHref.replace('od_locale=zh&', '')}`,
    );
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-CN');
    assert.equal(await page.evaluate(() => document.referrer), `${baseUrl}/wallet`);
    assert.equal(requests[0]?.sourceSurface, 'wallet');
    assert.deepEqual(requests[0]?.attribution, {
      sourceProduct: 'open_design',
      entryId: 'od-amr-entry-1',
      sourceDetail: 'home_balance_gate_upgrade',
      entryOccurredAt: '2026-08-25T12:00:00.000Z',
      campaignId: 'go_plan_sunset_202608',
      conversionSource: 'go_plan_sunset_modal',
      odDeviceId: 'device-1',
    });
    assert.deepEqual(
      requests[0]?.events.map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
  });

  it('preserves the real Go popup first touch through Vela Dashboard into Pricing', async (t) => {
    const context = await browser.newContext({ locale: 'zh-CN' });
    await context.addInitScript(() => {
      window.posthog = { __SV: 1, init() {}, capture() {} };
    });
    const launcher = await context.newPage();
    const requests: BridgeRequest[] = [];
    const entryOccurredAt = new Date().toISOString();
    const goDashboardUrl = new URL('/amr/dashboard', baseUrl);
    goDashboardUrl.search = new URLSearchParams({
      source: 'open_design',
      billing: 'plan',
      od_origin: 'open_design',
      od_entry_id: 'od-amr-go-sunset-browser',
      od_entry_source: 'go_plan_sunset_modal',
      od_entry_at: entryOccurredAt,
      od_campaign_id: 'go_plan_sunset_202608',
      od_conversion_source: 'go_plan_sunset_modal',
    }).toString();
    const pricingHref =
      '/zh/pricing/?od_locale=zh&cloud_console_base=' +
      encodeURIComponent('https://open-design.ai/cloud/');

    t.after(() => context.close());
    await context.route('https://amr-api.open-design.ai/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const headers = {
        'Access-Control-Allow-Origin': baseUrl,
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
      };
      if (pathname === '/api/auth/get-session') {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ user: { id: 'go-user-1' } }),
        });
        return;
      }
      if (pathname === '/api/v1/billing/summary') {
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            membershipTier: 'go',
            billingInterval: 'monthly',
            personalSubscriptionCheckoutAllowed: true,
            firstMonthIntroEligible: false,
            subscriptionCancelAtPeriodEnd: false,
            availableActions: ['billing_portal'],
          }),
        });
        return;
      }
      if (pathname === '/api/v1/analytics/pricing-events') {
        requests.push(request.postDataJSON() as BridgeRequest);
        await route.fulfill({ status: 204, headers, body: '' });
        return;
      }
      await route.abort();
    });
    await context.route(`${baseUrl}/go-sunset`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><button id="view-subscriptions">View subscriptions</button><script>
          document.querySelector('#view-subscriptions').addEventListener('click', () => {
            window.open(${JSON.stringify(goDashboardUrl.toString())}, '_blank', 'noopener,noreferrer');
          });
        </script>`,
      });
    });
    await context.route((url) => (
      url.origin === baseUrl && url.pathname === '/amr/dashboard'
    ), async (route) => {
      const source = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><script>
          localStorage.setItem('test.goPopupReferrer', document.referrer);
          location.replace(${JSON.stringify(`${baseUrl}/cloud/dashboard?${source.searchParams.toString()}`)});
        </script>`,
      });
    });
    await context.route((url) => (
      url.origin === baseUrl && url.pathname === '/cloud/dashboard'
    ), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><button id="continue-to-pricing">Continue to Pricing</button><script>
          localStorage.setItem('test.goDashboardReferrer', document.referrer);
          const params = new URLSearchParams(location.search);
          localStorage.setItem('amr.openDesignAttribution.v1', JSON.stringify({
            sourceProduct: params.get('od_origin'),
            entryId: params.get('od_entry_id'),
            sourceDetail: params.get('od_entry_source'),
            entryOccurredAt: params.get('od_entry_at'),
            campaignId: params.get('od_campaign_id'),
            conversionSource: params.get('od_conversion_source'),
          }));
          document.querySelector('#continue-to-pricing').addEventListener('click', () => {
            location.assign(${JSON.stringify(pricingHref)});
          });
        </script>`,
      });
    });

    await launcher.goto(`${baseUrl}/go-sunset`);
    const popupPromise = launcher.waitForEvent('popup');
    await launcher.locator('#view-subscriptions').click();
    const pricing = await popupPromise;
    await pricing.waitForURL((url) => url.pathname === '/cloud/dashboard');
    await pricing.locator('#continue-to-pricing').click();
    await pricing.waitForURL((url) => url.pathname.endsWith('/pricing/'));

    assert.equal(
      await pricing.evaluate(() => localStorage.getItem('test.goPopupReferrer')),
      '',
      'noopener,noreferrer must suppress the Open Design referrer into Dashboard',
    );
    assert.equal(new URL(pricing.url()).searchParams.has('source'), false);
    assert.equal(new URL(pricing.url()).searchParams.has('od_entry_id'), false);
    assert.match(await pricing.evaluate(() => document.referrer), /\/cloud\/dashboard\?/u);
    await pricing.waitForFunction(() =>
      document.querySelector('[data-pricing-root]')?.getAttribute(
        'data-personal-pricing-context-resolved',
      ) === 'true',
    );
    await waitForRequests(requests, 1);
    assert.equal(requests[0]?.sourceSurface, 'dashboard');
    assert.deepEqual(requests[0]?.attribution, {
      sourceProduct: 'open_design',
      entryId: 'od-amr-go-sunset-browser',
      sourceDetail: 'go_plan_sunset_modal',
      entryOccurredAt,
      campaignId: 'go_plan_sunset_202608',
      conversionSource: 'go_plan_sunset_modal',
    });

    await pricing.evaluate(() => {
      window.__odAttributedUrl = (_href, attribution) => {
        localStorage.setItem(
          'test.goCheckoutAttribution',
          JSON.stringify(attribution ?? null),
        );
        return '#checkout-attribution-captured';
      };
      document.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest('[data-tier="plus"]')) {
          event.preventDefault();
        }
      }, { capture: true });
    });
    await pricing.locator('[data-pricing-cta][data-tier="plus"]').click();
    await waitForRequests(requests, 2);
    assert.equal(requests[1]?.events[0]?.kind, 'pricing_click');
    assert.deepEqual(requests[1]?.attribution, requests[0]?.attribution);
    assert.deepEqual(
      await pricing.evaluate(() => JSON.parse(
        localStorage.getItem('test.goCheckoutAttribution') ?? 'null',
      )),
      {
        entry_id: 'od-amr-go-sunset-browser',
        source_product: 'open_design',
        source_detail: 'go_plan_sunset_modal',
        entry_occurred_at: entryOccurredAt,
        conversion_source: 'landing_pricing_personal_plan',
        campaign_id: 'go_plan_sunset_202608',
      },
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
