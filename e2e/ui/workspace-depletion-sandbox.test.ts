import { readFile, stat } from 'node:fs/promises';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startScopedFundingClient } from '@/playwright/workspace-funding-client';
import { readFundingRuntimeFixture, fundingHeaders, type FundingSpace } from '@/playwright/workspace-funding-fixture';
import { T } from '@/timeouts';

type Frame = { receivedAtMs: number; eventName: string; data: Record<string, unknown> };
type CaseGiven = { space: FundingSpace; deviceRuntimeKey: string; initialBalanceUsd: string;
  provider: { attemptId: string; statePath: string; pid: number } };

// Automates the two numbered QA steps. The broader QA evidence note still
// requires a paid Link capacity witness and retry idempotency verification.
test('[P0][partial] RUN-005 numbered steps: stop after depletion and notify client', async ({ page }, info) => {
  test.setTimeout(T.xlong * 8);
  const fixture = await readFundingRuntimeFixture();
  const path = process.env.OD_FUNDING_FIXTURE!;
  expect((await stat(path)).mode & 0o077).toBe(0);
  const given = (JSON.parse(await readFile(path, 'utf8')) as { run005: CaseGiven }).run005;
  expect(given.initialBalanceUsd).toBe('2.0000');
  const observations: Record<string, unknown> = { caseKey: 'server:RUN-005', amrSha: fixture.upstream.amrSha };
  const sourceUrls = new Map<string, string>();
  const frames: Frame[] = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => sourceUrls.set(event.requestId, event.request.url));
  cdp.on('Network.eventSourceMessageReceived', event => {
    if (!sourceUrls.get(event.requestId)?.includes('/api/workspace/events')) return;
    try { frames.push({ receivedAtMs: Date.now(), eventName: event.eventName,
      data: JSON.parse(event.data) as Record<string, unknown> }); } catch { /* only valid frames count */ }
  });
  const provider = async () => JSON.parse(await readFile(given.provider.statePath, 'utf8')) as {
    pid: number; events: Array<{ type: string; kind: string; id: string }>;
  };
  const backend = async () => JSON.parse(await readFile(process.env.OD_RUN005_BACKEND_OBSERVATION!, 'utf8')) as {
    ready: boolean; pid: number; workspaceId: string; depletionEvent: null | { payload: { at: string; revision: string; workspaceId: string; workspaceMemberId: string };
      facts: { fund_credits: string; debt_credits: string }; usage: unknown[]; ledger: unknown[] };
    clockSamples: Array<{ offsetMinimumMs: number; offsetMaximumMs: number }>;
  };
  expect((await provider()).pid).toBe(given.provider.pid);
  expect((await provider()).events).toEqual([]);
  expect((await backend()).ready).toBe(true);
  process.kill((await backend()).pid, 0);
  const client = await startScopedFundingClient(page, info, {
    fixture, initialSpace: given.space, checkedSpaces: { funded: given.space },
    runtimeKey: given.deviceRuntimeKey, requireNamePrefix: true,
    checkPreflight(_alias, _space, preflight) {
      expect(Number(preflight.balanceUsd)).toBe(2);
      expect(preflight.codingPlan.eligible).toBe(false);
    },
  });
  try {
    let lastIdentityChange = Date.now();
    let configWrites = 0;
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if ((path === '/api/app-config' && response.request().method() === 'PUT') || path === '/api/workspace/context') {
        lastIdentityChange = Date.now();
        if (path === '/api/app-config') configWrites += 1;
      }
    });
    await page.goto(client.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await client.select(given.space);
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await expect.poll(() => configWrites, {
      message: 'Initial account and model configuration writes have completed',
      timeout: T.long,
      intervals: [100, 250],
    }).toBeGreaterThanOrEqual(3);
    await expect.poll(() => Date.now() - lastIdentityChange, {
      message: 'Workspace and model configuration has settled before the first send',
      timeout: T.long,
      intervals: [100, 250],
    }).toBeGreaterThan(1500);
    const marker = `od-ws005-${given.provider.attemptId}-b`;
    await page.getByTestId('home-hero-input').fill(`QA:${JSON.stringify({ id: marker, scenario: 'WS-005', task: 'b' })}`);
    const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/runs' && r.request().method() === 'POST', { timeout: T.long });
    await page.getByTestId('home-hero-submit').click({ timeout: T.medium });
    const accepted = await created;
    observations.createStatus = accepted.status();
    expect(accepted.status()).toBe(202);
    const runId = (await accepted.json() as { runId: string }).runId;
    observations.runId = runId;
    await expect.poll(async () => {
      const response = await fetch(client.runtime.url.web(`/api/runs/${runId}`), { headers: fundingHeaders(given.space), signal: AbortSignal.timeout(T.short) });
      expect(response.ok).toBe(true);
      const value = await response.json() as { status: string };
      observations.terminal = value;
      return ['succeeded', 'failed', 'canceled'].includes(value.status);
    }, { timeout: T.xlong * 2, intervals: [100, 250, 500] }).toBe(true);
    expect((observations.terminal as { status: string; errorCode: string }).status).toBe('failed');
    expect((observations.terminal as { status: string; errorCode: string }).errorCode).toBe('AMR_INSUFFICIENT_BALANCE');
    await expect.poll(async () => (await provider()).events.filter(e => e.id === marker && e.kind === 'main' && e.type === 'completed').length,
      { timeout: T.long }).toBeGreaterThanOrEqual(2);
    const beforeNew = await provider();
    observations.providerBeforeNew = beforeNew;
    expect(beforeNew.events.filter(e => e.id === marker && e.kind === 'main' && e.type === 'completed')).toHaveLength(2);
    expect(beforeNew.events.filter(e => e.id === marker && ['rejected', 'failed', 'disconnected'].includes(e.type))).toEqual([]);
    await expect.poll(async () => Boolean((await backend()).depletionEvent), { timeout: T.long }).toBe(true);
    const observed = await backend();
    const event = observed.depletionEvent!;
    observations.backend = observed;
    expect(observed.workspaceId).toBe(given.space.workspaceId);
    expect(event.usage.length).toBeGreaterThan(0);
    expect(event.ledger.length).toBeGreaterThan(0);
    expect(BigInt(event.facts.fund_credits) - BigInt(event.facts.debt_credits)).toBeLessThanOrEqual(0n);
    const response = await fetch(new URL('/v1/chat/completions', fixture.upstream.linkUrl), {
      method: 'POST', headers: { authorization: `Bearer ${given.deviceRuntimeKey}`, 'content-type': 'application/json',
        'x-vela-workspace-id': given.space.workspaceId },
      body: JSON.stringify({ model: fixture.runtime.modelId, messages: [{ role: 'user', content: `RUN005 exhausted ${given.provider.attemptId}` }], stream: false }),
      signal: AbortSignal.timeout(T.long),
    });
    const denied = await response.json();
    observations.newApi = { status: response.status, body: denied };
    expect(response.status).toBe(402);
    expect(JSON.stringify(denied)).toContain('insufficient_balance');
    expect((await provider()).events).toEqual(beforeNew.events);
    const received = frames.find(frame => frame.eventName === 'wallet-balance-changed' && frame.data.workspaceId === given.space.workspaceId
      && frame.data.workspaceMemberId === given.space.actorMemberId && frame.data.revision === event.payload.revision);
    observations.frames = frames;
    expect(received, 'Client must receive matching real depleted-wallet revision').toBeTruthy();
    const offsetMax = Math.max(...observed.clockSamples.map(s => Math.max(Math.abs(s.offsetMinimumMs), Math.abs(s.offsetMaximumMs))));
    const upperLatencyMs = received!.receivedAtMs - Date.parse(event.payload.at) + offsetMax;
    observations.notificationUpperLatencyMs = upperLatencyMs;
    expect(upperLatencyMs).toBeLessThanOrEqual(1000);
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await info.attach('RUN005-exhausted-dialog', { body: await page.screenshot(), contentType: 'image/png' });
    observations.qaStepsPassed = 2;
  } finally {
    await info.attach('RUN005-client-event-frames', { body: JSON.stringify(frames, null, 2), contentType: 'application/json' });
    await info.attach('RUN005-observations', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    await client.close({ preserveScratch: info.status !== info.expectedStatus });
  }
});
