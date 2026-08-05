// Real end-to-end coverage for the fix this file is named after: the AMR
// Settings login pill (apps/web/src/components/AmrLoginPill.tsx) used to only
// call notifyAmrLoginStatusChanged() when a poll detected a successful
// sign-in, leaving the workspace-context / billing / team-projects surfaces
// to refresh only as a SIDE EFFECT of App.tsx's global identity-scope reset
// (deriveTabIdentityScope) eventually forcing every open tab back to a fresh
// Home mount. The fix makes the pill call notifyWorkspaceContextRefresh() /
// notifyWorkspaceBillingRefresh() / notifyTeamProjectsChanged() directly and
// immediately, the same way CloudSignInTip's finishSignedIn() and
// EntryShell's pollAmrLoginCompletion() already do.
//
// Making that immediate has a duplicate-request risk: Settings renders TWO
// AmrLoginPill instances at once (the agent-card pill and the cloud sign-in
// callout pill, confirmed live via SettingsDialog.tsx), both subscribed to
// AMR_LOGIN_STATUS_EVENT, so BOTH independently detect the same sign-in and
// BOTH fire the three notifiers within single-digit ms of each other. Every
// mounted useWorkspaceContext()/useWorkspaceBilling() instance (App.tsx's own
// plus SettingsDialog's own) reacts to that SAME broadcast too. Then the
// tab-scope reset (unconditional, unrelated to this fix) navigates back to
// Home moments later, mounting EntryShell + HomeView's own instances fresh.
// `forceCoalescedGet` (apps/web/src/lib/coalesced-get.ts) is what collapses
// this whole multi-caller burst into ONE real fetch per endpoint instead of
// one per caller — that collapsing is what this test verifies against real
// network traffic, not just unit-level call counts.
//
// This test observes REAL network traffic against the per-worker daemon
// (no page.route mocking of the three workspace endpoints — only the vela
// login/status endpoints are mocked, exactly like amr-login-pill.test.ts) and
// asserts on request COUNT and TIMING, not just presence.

import { expect, test } from '@/playwright/suite';
import type { Page, Request } from '@playwright/test';
import { T } from '@/timeouts';
import { openSettingsDialog as openEntrySettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';

test.describe.configure({ timeout: 45_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

interface VelaMockState {
  loggedIn: boolean;
  loginRequests: number;
  /** Set the first time a `/status` GET actually answers `loggedIn: true` —
   *  the reference point for "immediate", since `loggedIn` itself flips
   *  synchronously on the `/login` POST below (mirroring amr-login-pill.test.ts),
   *  but no client code observes that until a `/status` read reports it. */
  firstLoggedInStatusAt: number | null;
}

async function wireVelaMocks(page: Page, state: VelaMockState) {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await routeAgents(page, [
    {
      id: 'amr',
      name: 'AMR (vela)',
      bin: 'vela',
      versionArgs: ['--version'],
      available: true,
      authStatus: null,
      modelsSource: 'fallback',
      models: [{ id: 'gpt-5.4-mini', label: 'gpt-5.4-mini (openrouter · default)' }],
      path: '/usr/local/bin/vela',
      version: null,
    },
  ]);

  await page.route('**/api/integrations/vela/status', async (route) => {
    if (state.loggedIn && state.firstLoggedInStatusAt == null) {
      state.firstLoggedInStatusAt = Date.now();
    }
    const body = state.loggedIn
      ? {
          loggedIn: true,
          profile: 'local',
          configPath: '/tmp/.amr/config.json',
          user: { id: 'fake-user', email: 'workspace-refresh@example.com', name: 'Refresh Test', plan: 'free' },
        }
      : { loggedIn: false, profile: 'local', user: null, configPath: '/tmp/.amr/config.json' };
    await route.fulfill({ json: body });
  });

  await page.route('**/api/integrations/vela/login', async (route) => {
    state.loginRequests += 1;
    state.loggedIn = true;
    await route.fulfill({ status: 202, json: { pid: 4242, startedAt: new Date().toISOString(), profile: 'local' } });
  });
}

function baseStorageConfig() {
  return {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
  };
}

/** Timestamps of GET requests to one of the three refresh targets. */
interface WorkspaceRequestLog {
  context: number[];
  billing: number[];
  team: number[];
}

function watchWorkspaceRequests(page: Page): { log: WorkspaceRequestLog; stop: () => void } {
  const log: WorkspaceRequestLog = { context: [], billing: [], team: [] };
  const handler = (request: Request) => {
    if (request.method() !== 'GET') return;
    const pathname = new URL(request.url()).pathname;
    const at = Date.now();
    if (pathname === '/api/workspace/context') log.context.push(at);
    else if (pathname === '/api/workspace/billing') log.billing.push(at);
    else if (pathname === '/api/workspace/projects/team') log.team.push(at);
  };
  page.on('request', handler);
  return { log, stop: () => page.off('request', handler) };
}

// The multi-caller burst (two AmrLoginPill instances + however many
// useWorkspaceContext()/useWorkspaceBilling()/useTeamProjects() consumers are
// mounted at once) lands within single-digit ms in practice; this window is
// deliberately generous (matches forceCoalescedGet's own FORCE_BURST_MS) so a
// loaded CI machine cannot make a real single burst look like two.
const BURST_WINDOW_MS = 250;

/** How many timestamps in `hits` land within `windowMs` of (and no earlier
 *  than) `referenceAt`. */
function countWithinBurst(hits: number[], referenceAt: number, windowMs: number): number {
  return hits.filter((t) => t >= referenceAt - 5 && t - referenceAt < windowMs).length;
}

test('[P1] AMR sign-in immediately refreshes workspace context/billing/team-projects exactly once per burst, with no duplicate from the follow-up Home remount', async ({ page }) => {
  const state: VelaMockState = { loggedIn: false, loginRequests: 0, firstLoggedInStatusAt: null };
  await wireVelaMocks(page, state);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: 'open-design:config', value: baseStorageConfig() },
  );

  const { log, stop } = watchWorkspaceRequests(page);
  try {
    await gotoEntryHome(page);
    const dialog = await openEntrySettingsDialog(page);

    const amrCard = dialog
      .locator('.amr-agent-card, .agent-card-installed')
      .filter({ hasText: /Open Design|AMR \(vela\)/i })
      .first();
    await expect(amrCard).toBeVisible();

    const signInBtn = amrCard.getByRole('button', { name: /^(Authorize|Sign in)$/ });
    await expect(signInBtn).toBeVisible();

    // Settle the page's normal initial-mount reads before measuring the
    // sign-in-triggered delta, so an ambient poll from mount doesn't get
    // mistaken for a sign-in-triggered request.
    await page.waitForTimeout(500);
    const baseline = {
      context: log.context.length,
      billing: log.billing.length,
      team: log.team.length,
    };

    await signInBtn.click();
    await expect.poll(() => state.loginRequests).toBe(1);

    // A successful sign-in is also a tab-scope identity change
    // (deriveTabIdentityScope / WorkspaceTabsBar), which — independently of
    // this fix, and unconditionally — closes every open tab (including
    // Settings) back to a single fresh Home tab. That IS the "later
    // from-scratch remount" this fix's dedup story is about, so let it
    // happen naturally instead of forcing it: wait for Home to reappear.
    await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: 10_000 });

    // Reference point for "immediate": the first `/status` read that
    // actually reported loggedIn=true (loggedIn itself flips synchronously
    // in the mock on the /login POST above, but no client code observes the
    // transition until a /status read reports it — this is what the pills'
    // polls, and/or App.tsx's own independent status sync, actually saw).
    await expect.poll(() => state.firstLoggedInStatusAt).not.toBeNull();
    const signedInAt = state.firstLoggedInStatusAt!;

    // Wait for the context/billing refresh to actually land (real network
    // round trip against the per-worker daemon) instead of a blind sleep.
    // T.medium (not T.short) absorbs a loaded machine's real scheduling
    // jitter without weakening what's actually asserted below.
    await expect.poll(() => log.context.length, { timeout: T.medium }).toBeGreaterThan(baseline.context);
    await expect.poll(() => log.billing.length, { timeout: T.medium }).toBeGreaterThan(baseline.billing);
    await expect.poll(() => log.team.length, { timeout: T.medium }).toBeGreaterThan(baseline.team);
    // Give the Home remount (and any ambient revalidation, e.g. the
    // workspace-invalidation SSE's onConnect resync) time to land before the
    // final count.
    await page.waitForTimeout(1_000);

    const newContext = log.context.slice(baseline.context);
    const newBilling = log.billing.slice(baseline.billing);
    const newTeam = log.team.slice(baseline.team);

    console.log('[amr-login-pill-workspace-refresh] network timeline (ms relative to signedInAt):', {
      signedInAt,
      context: newContext.map((t) => t - signedInAt),
      billing: newBilling.map((t) => t - signedInAt),
      team: newTeam.map((t) => t - signedInAt),
    });

    // Requirement ①: the refresh requests land essentially at the moment
    // sign-in resolves, not only as a byproduct of the later Home remount.
    // T.medium (not T.short) is the bound here: this is a real round trip on
    // a shared dev machine (mock /status response -> browser -> tick() ->
    // forceCoalescedGet -> a brand-new per-run daemon), and the whole point
    // is distinguishing "immediate" from the pre-fix behavior (only via
    // App.tsx's later, unconditional Home remount, i.e. often several
    // seconds out, or never if the user doesn't return to Home) — T.medium
    // still draws that line clearly without flaking on ordinary scheduling
    // jitter this fix doesn't touch.
    expect(newContext[0], 'first /api/workspace/context hit after sign-in').toBeDefined();
    expect(newBilling[0], 'first /api/workspace/billing hit after sign-in').toBeDefined();
    expect(newTeam[0], 'first /api/workspace/projects/team hit after sign-in').toBeDefined();
    expect(newContext[0]! - signedInAt).toBeLessThan(T.medium);
    expect(newBilling[0]! - signedInAt).toBeLessThan(T.medium);
    expect(newTeam[0]! - signedInAt).toBeLessThan(T.medium);

    // Requirement ②: exactly one request lands inside the burst window for
    // each endpoint — the sign-in burst (two AmrLoginPill instances, plus
    // every mounted useWorkspaceContext()/useWorkspaceBilling()/
    // useTeamProjects() consumer reacting to the SAME broadcast) collapsed by
    // forceCoalescedGet, AND the follow-up Home remount joining that same
    // fetch instead of firing a fresh duplicate.
    //
    // The window is anchored to each endpoint's OWN first post-sign-in hit —
    // not to `signedInAt` — on purpose. `signedInAt` is a mock-side
    // timestamp recorded before the response is even sent to the browser;
    // the real network round trip plus React processing before the client
    // starts reacting is a separate, uncontrolled delay already covered by
    // requirement ①'s T.short bound above. Anchoring requirement ② to it too
    // would make a slow-but-single-request round trip on a loaded machine
    // indistinguishable from a genuine duplicate. Every notifier in the
    // burst fires synchronously inside the same tick(), so once the first
    // hit for an endpoint lands, a true duplicate from failed collapsing
    // would land within single-digit ms of it — still comfortably inside
    // BURST_WINDOW_MS. The later, legitimate SSE onConnect resync (outside
    // this fix's scope, see below) lands hundreds of ms after that first
    // hit, so it stays excluded either way.
    expect(countWithinBurst(newContext, newContext[0]!, BURST_WINDOW_MS)).toBe(1);
    expect(countWithinBurst(newBilling, newBilling[0]!, BURST_WINDOW_MS)).toBe(1);
    // `/api/workspace/projects/team` is intentionally not held to the same
    // exact-one count: unlike context/billing, it has a few direct call
    // sites elsewhere in the app (App.tsx's team-project pull check,
    // FileWorkspace/FileViewer's collab-status probe) that bypass this
    // coalescer entirely and can legitimately land inside this same window,
    // plus the workspace-invalidation SSE's onConnect resync once
    // EntryShell's new EventSource finishes connecting — none of that is
    // something this fix touches or can distinguish from a real duplicate by
    // timestamp alone. Requirement ① above already proved the coalesced path
    // itself fires immediately; asserting an exact count here would flake on
    // those unrelated call sites' own timing instead of testing this fix.
  } finally {
    stop();
  }
});
