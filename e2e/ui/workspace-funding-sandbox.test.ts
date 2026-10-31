import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { holdRealBilling, startFundingClient } from '@/playwright/workspace-funding-client';
import { fundingHeaders } from '@/playwright/workspace-funding-fixture';
import { T } from '@/timeouts';

// This file belongs exclusively to lib/playwright/funding.config.ts. It is a real
// local AMR integration lane, not a route-mocked substitute for QA VIEW-015.
test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: T.xlong * 5 });

for (const surface of ['project', 'home'] as const) {
  test(`[P1] VIEW-015 ${surface} keeps B draft and rejects stale funded A after B insufficient`, async ({ page }, info) => {
    const client = await startFundingClient(page, info, { initialSpace: 'empty' });
    let timing: ReturnType<typeof holdRealBilling> | undefined;
    try {
      const { fixture, runtime } = client;
      const A = fixture.spaces.funded;
      const B = fixture.spaces.empty;
      const projectId = await client.createProject(B);
      // Visit once so the real Recent entry exists. Creating a project through
      // HTTP alone does not establish a browser navigation-history entry.
      await page.goto(runtime.url.web(`/projects/${projectId}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
      await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
      await page.getByRole('button', { name: 'Home', exact: true }).click({ timeout: T.medium });
      await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
      await client.select(fixture.spaces.dp);
      timing = holdRealBilling(page, [A.workspaceId, B.workspaceId]);
      await timing.install;
      await client.select(A);
      await expect.poll(() => timing!.held.filter(row => row.workspaceId === A.workspaceId).length,
        { timeout: T.medium }).toBeGreaterThan(0);
      await client.select(B);
      await expect.poll(() => timing!.held.filter(row => row.workspaceId === B.workspaceId).length,
        { timeout: T.medium }).toBeGreaterThan(0);
      if (surface === 'project') {
        await page.locator(`[data-project-id="${projectId}"]`).getByTestId('entry-nav-recent-item').click({ timeout: T.medium });
        await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
      }
      const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
      const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
      const draft = `VIEW015 ${surface} B must never borrow A funds`;
      await input.fill(draft);
      const originalPath = new URL(page.url()).pathname;
      const postStart = client.posts.length;
      const enabledWhilePending = await send.isEnabled();
      if (enabledWhilePending) await send.click({ timeout: T.medium });
      await client.attach('pending-B-after-submit', {
        surface, enabledWhilePending, originalPath, actualPath: new URL(page.url()).pathname,
        posts: client.posts.slice(postStart),
      });
      timing.stopHolding();
      // Network completion is awaited at the browser, not only route.fulfill.
      // The original response bodies are delivered without modifying bytes.
      await timing.release(B.workspaceId);
      if (!enabledWhilePending) {
        await expect(send).toBeEnabled({ timeout: T.medium });
        await send.click({ timeout: T.medium });
      }
      const memberDialog = (B.actorRole ?? 'owner') !== 'owner';
      const dialog = page.getByTestId(memberDialog ? 'amr-balance-owner-dialog' : 'amr-balance-dialog');
      await expect(dialog).toBeVisible({ timeout: T.medium });
      const bVisibleAt = Date.now();
      // Keep the Home red oracle. Optimistic bubbles/Queued1 do not satisfy
      // the original-page input-preservation requirement.
      expect.soft(new URL(page.url()).pathname, 'Rejected input remains on the originating page').toBe(originalPath);
      await expect.soft(input).toHaveText(draft, { timeout: T.short });
      // Modal implementations may legitimately lock the background composer.
      // Editability is required after dismissal, observed only while open.
      const backgroundInputEditable = await input.isEditable({ timeout: T.short }).catch(() => null);
      expect.soft(client.posts.slice(postStart).filter(row => row.path === '/api/runs'), 'Insufficient B cannot enqueue a run').toEqual([]);
      await timing.release(A.workspaceId);
      const aCompletedAt = Date.now();
      expect(aCompletedAt).toBeGreaterThanOrEqual(bVisibleAt);
      const aRows = timing.held.filter(row => row.workspaceId === A.workspaceId);
      const deliveredA = aRows.filter(row => row.browserStatus === 200 && row.browserCompletedAt !== null);
      expect(deliveredA.length, 'At least one original A HTTP200 must actually complete at the browser after B is visible').toBeGreaterThan(0);
      for (const row of aRows) {
        if (row.requestFailure) {
          expect(['net::ERR_ABORTED', 'ERR_ABORTED']).toContain(row.requestFailure);
          expect(row.browserCompletedAt).toBeNull();
        } else {
          expect(row.browserStatus).toBe(200);
          expect(row.browserCompletedAt).not.toBeNull();
          expect(row.browserCompletedAt!).toBeGreaterThanOrEqual(bVisibleAt);
        }
      }
      await expect(dialog).toBeVisible({ timeout: T.medium });
      await expect.soft(input).toHaveText(draft, { timeout: T.short });
      expect.soft(client.posts.slice(postStart).filter(row => row.path === '/api/runs')).toEqual([]);
      await client.attach('B-before-A-unchanged-real-responses', {
        surface, bVisibleAt, aCompletedAt,
        responses: timing.held.map(({ workspaceId, path, sha256, upstreamFetchedAt, browserCompletedAt, browserStatus, requestFailure }) =>
          ({ workspaceId, path, sha256, upstreamFetchedAt, browserCompletedAt, browserStatus, requestFailure })),
        responseBodiesModified: false, posts: client.posts.slice(postStart), wholeQaPassed: false,
        // Diagnostics, not extra QA requirements. A local project or an
        // internal queue alone does not establish model execution/input loss.
        queuedBannerVisible: await page.getByTestId('queued-send-banner').isVisible(),
        backgroundInputEditable,
      });
      if (memberDialog) await dialog.getByTestId('amr-balance-owner-dismiss').click({ timeout: T.medium });
      else await dialog.getByRole('button', { name: /Not now/i }).click({ timeout: T.medium });
      await expect.soft(input).toHaveText(draft, { timeout: T.short });
      await expect.soft(input).toBeEditable({ timeout: T.short });
      expect.soft(new URL(page.url()).pathname).toBe(originalPath);
    } finally {
      try { await timing?.dispose(); }
      finally { await client.close(); }
    }
  });
}

test('[P1] VIEW-015 native funding refusal restores an existing project draft and attachment after advisory timeout', async ({ page }, info) => {
  const client = await startFundingClient(page, info, { initialSpace: 'empty' });
  let timing: ReturnType<typeof holdRealBilling> | undefined;
  let passed = false;
  try {
    const { fixture, runtime } = client;
    const B = fixture.spaces.empty;
    const projectId = await client.createProject(B);
    await page.goto(runtime.url.web(`/projects/${projectId}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible({ timeout: T.xlong });
    const draft = 'VIEW015 native funding refusal must return this original input and attachment';
    const attachment = { name: 'view015-original-brief.txt', mimeType: 'text/plain', buffer: Buffer.from(draft) };
    await input.fill(draft);
    const uploaded = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/projects/${projectId}/upload`, { timeout: T.medium });
    await page.getByTestId('chat-file-input').setInputFiles(attachment);
    expect((await uploaded).ok()).toBe(true);
    const staged = page.getByTestId('staged-attachments');
    await expect(staged.getByRole('button', { name: `Remove ${attachment.name}`, exact: true })).toBeVisible();
    const originalPath = new URL(page.url()).pathname;
    const postStart = client.posts.length;
    timing = holdRealBilling(page, [B.workspaceId]);
    await timing.install;
    const accepted = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
    await page.getByTestId('chat-send').click();
    // This real browser/daemon/native boundary intentionally crosses the
    // product's advisory deadline. Only original response delivery is held;
    // the authoritative native refusal and composer restoration stay real.
    const created = await accepted;
    expect(created.status()).toBe(202);
    const { runId } = await created.json() as { runId: string };
    expect(typeof runId).toBe('string');
    const held = timing.held.find(row => row.path === '/api/workspace/billing/preflight');
    expect(held, 'The actual send-time advisory response was held').toBeTruthy();
    expect(JSON.parse(held!.bodyText).preflight).toMatchObject({
      workspaceId: B.workspaceId, fundingCheck: 'insufficient',
    });
    let result: { status: string; errorCode?: string } | undefined;
    await expect.poll(async () => {
      const response = await fetch(runtime.url.web(`/api/runs/${runId}`), {
        headers: fundingHeaders(B), signal: AbortSignal.timeout(T.short),
      });
      expect(response.ok).toBe(true);
      result = await response.json() as typeof result;
      return result?.status;
    }, { timeout: T.xlong }).toBe('failed');
    await client.attach('native-funding-refusal', { runId, result, originalPath,
      originalAdvisoryBody: held!.bodyText, originalAdvisorySha256: held!.sha256 });
    await info.attach('native-funding-refusal-events', {
      body: await readFile(join(runtime.dataDir, 'runs', runId, 'events.jsonl')), contentType: 'application/x-ndjson',
    });
    expect(result?.errorCode).toBe('AMR_INSUFFICIENT_BALANCE');
    const memberDialog = (B.actorRole ?? 'owner') !== 'owner';
    const dialog = page.getByTestId(memberDialog ? 'amr-balance-owner-dialog' : 'amr-balance-dialog');
    await expect(dialog).toBeVisible({ timeout: T.medium });
    await expect(input).toHaveText(draft);
    await expect(staged.getByRole('button', { name: `Remove ${attachment.name}`, exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(originalPath);
    expect(client.posts.slice(postStart).filter(row => row.path === '/api/runs')).toEqual([
      { path: '/api/runs', workspaceId: B.workspaceId },
    ]);
    await info.attach('native-funding-refusal-restored', { body: await page.screenshot(), contentType: 'image/png' });
    if (memberDialog) await dialog.getByTestId('amr-balance-owner-dismiss').click();
    else await dialog.getByRole('button', { name: /Not now/i }).click();
    await expect(dialog).toBeHidden();
    await input.fill(`${draft} edited after refusal`);
    await expect(input).toHaveText(`${draft} edited after refusal`);
    await expect(staged.getByRole('button', { name: `Remove ${attachment.name}`, exact: true })).toBeVisible();
    passed = true;
  } finally {
    try { await timing?.dispose(); }
    finally { await client.close({ preserveScratch: !passed }); }
  }
});

test('[P1] VIEW-015 cash0 with real available Design Plan completes one correctly scoped run', async ({ page }, info) => {
  const client = await startFundingClient(page, info);
  let runId: string | undefined;
  let terminal = false;
  try {
    await page.goto(client.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await client.select(client.fixture.spaces.dp);
    await page.getByTestId('home-hero-input').fill('VIEW015 cash0 actual available Design Plan');
    await expect(page.getByTestId('home-hero-submit')).toBeEnabled({ timeout: T.medium });
    const before = client.posts.length;
    const created = page.waitForResponse(r => r.request().method() === 'POST'
      && new URL(r.url()).pathname === '/api/runs', { timeout: T.medium });
    await page.getByTestId('home-hero-submit').click({ timeout: T.medium });
    const response = await created;
    const body = await response.json() as { runId?: string; run?: { id: string }; id?: string };
    runId = body.runId ?? body.run?.id ?? body.id;
    expect(response.status()).toBe(202);
    expect(typeof runId).toBe('string');
    expect(client.posts.slice(before).filter(row => row.path === '/api/runs')).toEqual([
      { path: '/api/runs', workspaceId: client.fixture.spaces.dp.workspaceId },
    ]);
    await client.attach('cash0-DP-submit-boundary', {
      status: response.status(), runId, workspaceId: client.fixture.spaces.dp.workspaceId,
      modelExecutionVerified: false, wholeQaPassed: false,
    });
    const observations: Array<{ observedAt: string; status: string }> = [];
    let result: { status: string; exitCode?: number; error?: string; terminalAt?: number } | undefined;
    try {
      await expect.poll(async () => {
        const status = await fetch(client.runtime.url.web(`/api/runs/${runId}`), {
          headers: fundingHeaders(client.fixture.spaces.dp), signal: AbortSignal.timeout(T.short),
        });
        expect(status.ok, 'Read this actual client-created run').toBe(true);
        result = await status.json() as typeof result;
        observations.push({ observedAt: new Date().toISOString(), status: result!.status });
        terminal = ['succeeded', 'failed', 'canceled'].includes(result!.status);
        return terminal;
      }, { timeout: T.xlong, intervals: [250, 500, 1_000] }).toBe(true);
      expect(result!.status, 'A scoped HTTP202 alone does not prove a model completed').toBe('succeeded');
      const events = await fetch(client.runtime.url.web(`/api/runs/${runId}/events`), {
        headers: fundingHeaders(client.fixture.spaces.dp), signal: AbortSignal.timeout(T.short),
      });
      expect(events.ok, 'Capture actual completed-run events before owned runtime cleanup').toBe(true);
      const eventText = await events.text();
      await info.attach('cash0-DP-completed-run-events', { body: eventText, contentType: 'text/plain' });
      await client.attach('cash0-DP-stop-reason-observation', {
        runId, endTurnStringObserved: /["']stopReason["']\s*:\s*["']end_turn["']/.test(eventText),
        // Event shape is observed, not imposed as a new product requirement.
        wholeQaPassed: false,
      });
    } finally {
      await client.attach('cash0-DP-actual-run-terminal', {
        runId, workspaceId: client.fixture.spaces.dp.workspaceId, result, observations,
        // Final CLI end_turn + canonical usage/DP-window increase + zero cash
        // charge are independently reconciled by the AMR environment owner.
        independentAccountingReviewRequired: true, wholeQaPassed: false,
      });
    }
  } finally {
    try {
      if (runId && !terminal) {
        const canceled = await fetch(client.runtime.url.web(`/api/runs/${runId}/cancel`), { method: 'POST' });
        expect(canceled.ok, 'Clean only this test-created run').toBe(true);
      }
    } finally { await client.close(); }
  }
});


test('[P1] VIEW-015 existing A task keeps original scope while switching to Member B', async ({ page }, info) => {
  const client = await startFundingClient(page, info);
  const { fixture, runtime } = client;
  const A = fixture.spaces.funded;
  const B = fixture.spaces.empty;
  const checkpoint = process.env.OD_FUNDING_INFLIGHT_DIR;
  const tag = process.env.OD_FUNDING_INFLIGHT_TAG;
  let runId: string | undefined;
  let terminal = false;
  let ready = false;
  try {
    expect(fixture.version).toBe(2);
    expect(A.actorRole).toBe('owner');
    expect(B.actorRole).toBe('member');
    expect(checkpoint && isAbsolute(checkpoint), 'Explicit private checkpoint directory').toBe(true);
    expect(tag).toMatch(/^b25-view015-[a-z0-9-]+$/);
    await mkdir(checkpoint!, { recursive: true, mode: 0o700 });
    const signal = (name: string, body: unknown) => writeFile(join(checkpoint!, name), JSON.stringify(body, null, 2), { mode: 0o600 });
    const waitSignal = async (name: string, key: string) => {
      let value: Record<string, unknown> | undefined;
      await expect.poll(async () => {
        try { value = JSON.parse(await readFile(join(checkpoint!, name), 'utf8')); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        return value?.[key] === true;
      }, { timeout: T.long, intervals: [100, 250, 500] }).toBe(true);
      expect(value!.tag, 'Watcher signal matches this attempt tag').toBe(tag);
      expect(value!.runId, 'Watcher signal matches this actual A run').toBe(runId);
      expect(value!.workspaceId).toBe(A.workspaceId);
      await client.attach(name, value);
    };
    const projectB = await client.createProject(B);
    const projectA = await client.createProject(A);
    // Warm the actual routes before holding an upstream request.
    await page.goto(runtime.url.web(`/projects/${projectB}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
    await page.getByRole('button', { name: 'Home', exact: true }).click({ timeout: T.medium });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await client.select(A);
    await page.goto(runtime.url.web(`/projects/${projectA}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
    const created = page.waitForResponse(r => r.request().method() === 'POST'
      && new URL(r.url()).pathname === '/api/runs', { timeout: T.medium });
    await page.getByTestId('chat-composer-input').fill(`QA:${JSON.stringify({ id: tag, tokens: 1, hold: true })}`);
    await page.getByTestId('chat-send').click({ timeout: T.medium });
    const response = await created;
    const body = await response.json() as { runId?: string; run?: { id: string }; id?: string };
    runId = body.runId ?? body.run?.id ?? body.id;
    expect(response.status()).toBe(202);
    expect(runId).toBeTruthy();
    expect(response.request().headers()['x-od-workspace-id']).toBe(A.workspaceId);
    await signal('A-ready.json', { actualrunId: runId, runId, workspaceId: A.workspaceId, tag });
    ready = true;
    await waitSignal('A-held.json', 'ready');
    // The first held request is auxiliary. The primary may start only after
    // release; independent accounting must join both actual request IDs to A.
    await client.attach('A-inflight-boundary', { runId, workspaceId: A.workspaceId,
      actorMemberId: A.actorMemberId, actorRole: A.actorRole, tag,
      heldRequestKind: 'auxiliary-first; primary not claimed held', wholeQaPassed: false });
    await page.getByRole('button', { name: 'Home', exact: true }).click({ timeout: T.medium });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await client.select(B);
    const toggle = page.getByTestId('entry-rail-collapse');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click({ timeout: T.medium });
    await page.getByTestId('workspace-switcher').click({ timeout: T.medium });
    const currentRow = page.getByTestId('workspace-switcher-list').getByRole('menuitem').filter({ hasText: client.authorizedSpaces.find(s => s.workspaceId === B.workspaceId)!.workspaceName });
    await expect(currentRow).toHaveAttribute('aria-current', 'true');
    await info.attach('B-Member-workspace-list', { body: await page.screenshot(), contentType: 'image/png' });
    await page.locator('.entry-nav-rail__menu-backdrop').click({ timeout: T.medium });
    const credits = page.getByTestId('entry-top-right-credits');
    await credits.hover({ timeout: T.medium });
    await credits.click({ timeout: T.medium });
    const quota = page.getByTestId('entry-top-right-credits-panel');
    await expect(quota).toBeVisible({ timeout: T.medium });
    await quota.hover({ timeout: T.medium });
    await expect(page.getByTestId('workspace-quota-skeleton')).toHaveCount(0, { timeout: T.medium });
    await expect(page.getByTestId('entry-nav-credits-row')).toContainText('$0.00', { timeout: T.medium });
    await info.attach('B-Member-current-zero-balance', { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByTestId('home-hero-input').click({ timeout: T.medium });
    const billingUrl = new URL('/api/workspace/billing', runtime.url.web());
    billingUrl.search = new URLSearchParams({ scope: 'workspace', workspaceId: B.workspaceId, includePreflight: '1', modelId: fixture.runtime.modelId }).toString();
    const actualBilling = await fetch(billingUrl, { headers: fundingHeaders(B) });
    expect(actualBilling.ok).toBe(true);
    const billing = await actualBilling.json();
    expect(billing.preflight.workspaceId).toBe(B.workspaceId);
    expect(billing.preflight.workspaceMemberId).toBe(B.actorMemberId);
    expect(Number(billing.preflight.balanceUsd)).toBe(0);
    expect(billing.preflight.fundingCheck).toBe('insufficient');
    await client.attach('B-actual-scoped-billing', { workspaceId: B.workspaceId, actorMemberId: B.actorMemberId,
      actorRole: B.actorRole, actualBilling: billing,
      selection: await page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? 'null')) });
    for (const surface of ['home', 'project'] as const) {
      if (surface === 'project') {
        await page.locator(`[data-project-id="${projectB}"]`).getByTestId('entry-nav-recent-item').click({ timeout: T.medium });
        await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
      }
      const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
      const draft = `VIEW015 Member B ${surface} while A task remains in flight`;
      const path = new URL(page.url()).pathname;
      const before = client.posts.length;
      await input.fill(draft);
      await page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send').click({ timeout: T.medium });
      const dialog = page.getByTestId('amr-balance-owner-dialog');
      await expect(dialog).toBeVisible({ timeout: T.medium });
      expect.soft(new URL(page.url()).pathname).toBe(path);
      await expect.soft(input).toHaveText(draft, { timeout: T.short });
      expect.soft(client.posts.slice(before).filter(p => p.path === '/api/runs')).toEqual([]);
      await info.attach(`B-Member-${surface}-insufficient`, { body: await page.screenshot(), contentType: 'image/png' });
      await dialog.getByTestId('amr-balance-owner-dismiss').click({ timeout: T.medium });
      await expect.soft(input).toHaveText(draft, { timeout: T.short });
      await expect.soft(input).toBeEditable({ timeout: T.short });
      expect.soft(new URL(page.url()).pathname).toBe(path);
    }
    await signal('A-release-ready.json', { runId, tag, workspaceId: A.workspaceId });
    await waitSignal('A-released.json', 'released');
    let result: { status: string; exitCode?: number } | undefined;
    const observations: Array<{ at: string; status: string }> = [];
    try {
      await expect.poll(async () => {
        const status = await fetch(runtime.url.web(`/api/runs/${runId}`), { headers: fundingHeaders(A), signal: AbortSignal.timeout(T.short) });
        expect(status.ok).toBe(true);
        result = await status.json();
        observations.push({ at: new Date().toISOString(), status: result!.status });
        terminal = ['succeeded', 'failed', 'canceled'].includes(result!.status);
        return terminal;
      }, { timeout: T.xlong, intervals: [250, 500, 1_000] }).toBe(true);
      expect(result!.status).toBe('succeeded');
    } finally {
      await client.attach('A-original-scope-terminal', { runId, tag, workspaceId: A.workspaceId,
        actorMemberId: A.actorMemberId, result, observations, independentAccountingReviewRequired: true, wholeQaPassed: false });
    }
  } finally {
    try {
      if (ready && checkpoint) await writeFile(join(checkpoint, 'A-release-ready.json'), JSON.stringify({ runId, tag, workspaceId: A.workspaceId, cleanup: true }), { mode: 0o600 });
      if (runId && !terminal) await fetch(runtime.url.web(`/api/runs/${runId}/cancel`), { method: 'POST', headers: fundingHeaders(A) });
    } finally { await client.close(); }
  }
});
