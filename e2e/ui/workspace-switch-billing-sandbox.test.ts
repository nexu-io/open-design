import { readFile, stat } from 'node:fs/promises';
import type { Page } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { startFundingClient } from '@/playwright/workspace-funding-client';
import { fundingHeaders, readFundingFixture } from '@/playwright/workspace-funding-fixture';
import { readWorkspaceSwitchProof } from '@/playwright/workspace-switch-fixture';
import { T } from '@/timeouts';

type ProviderState = { pid: number; sourceSha256: string; ownattempt: string | null; held: string[];
  events: Array<{ type: string; kind: 'main' | 'aux'; id: string; requestIndex: number; tokens: number; at: string; workspaceId?: string; taskId?: string }> };
type RunRead = { status: string; exitCode?: number; [key: string]: unknown };

test('[P0] WS-005 switching to B preserves original A task and settles both exact workspace budgets', async ({ page }, info) => {
  test.setTimeout(T.xlong * 8);
  const fixture = await readFundingFixture();
  const proof = await readWorkspaceSwitchProof(fixture);
  const given = fixture.scopeSwitch!;
  const tags = { a: `od-ws005-${given.attemptId}-a`, b: `od-ws005-${given.attemptId}-b` };
  const stateReads: Array<{ at: string; state: ProviderState }> = [];
  const runs: Partial<Record<'a' | 'b', { runId: string; terminal: boolean; reads: RunRead[] }>> = {};
  const snapshots: unknown[] = [];
  const cleanup: unknown[] = [];
  let bodyCompleted = false;
  const providerState = async () => {
    expect((await stat(given.provider.statePath)).mode & 0o077).toBe(0);
    const state = JSON.parse(await readFile(given.provider.statePath, 'utf8')) as ProviderState;
    expect(state.pid).toBe(given.provider.pid);
    expect(state.sourceSha256).toBe(given.provider.sourceSha256);
    stateReads.push({ at: new Date().toISOString(), state });
    return state;
  };
  const initial = await providerState();
  expect(initial.held).toEqual([]);
  expect(initial.events.filter(event => Object.values(tags).includes(event.id))).toEqual([]);
  const client = await startFundingClient(page, info, { scopeSwitch: true });
  const readRun = async (alias: 'a' | 'b') => {
    const record = runs[alias]!;
    const response = await fetch(client.runtime.url.web(`/api/runs/${record.runId}`), {
      headers: fundingHeaders(given.spaces[alias]), signal: AbortSignal.timeout(T.short),
    });
    expect(response.ok).toBe(true);
    const value = await response.json() as RunRead;
    record.reads.push(value);
    record.terminal = ['succeeded', 'failed', 'canceled'].includes(value.status);
    return value;
  };
  const submit = async (target: Page, alias: 'a' | 'b') => {
    await expect(target.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await target.getByTestId('home-hero-input').fill(`QA:${JSON.stringify({ id: tags[alias], scenario: 'WS-005', task: alias })}`, { timeout: T.medium });
    const created = target.waitForResponse(response => new URL(response.url()).pathname === '/api/runs'
      && response.request().method() === 'POST', { timeout: T.long });
    await target.getByTestId('home-hero-submit').click({ timeout: T.medium });
    const response = await created;
    expect(response.status()).toBe(202);
    const { runId } = await response.json() as { runId: string };
    expect(typeof runId).toBe('string');
    runs[alias] = { runId, terminal: false, reads: [] };
    await client.attach(`WS005-${alias}-actual-submit`, { runId, workspaceId: given.spaces[alias].workspaceId,
      memberId: given.spaces[alias].actorMemberId ?? given.spaces[alias].ownerMemberId,
      requestWorkspaceId: response.request().headers()['x-od-workspace-id'], actualProviderTag: tags[alias] });
    expect(response.request().headers()['x-od-workspace-id']).toBe(given.spaces[alias].workspaceId);
  };
  const directSnapshot = async (alias: 'a' | 'b') => {
    const space = given.spaces[alias];
    const response = await fetch(new URL(`/api/v1/workspaces/${space.workspaceId}/billing/snapshot`, fixture.upstream.apiUrl), {
      headers: { authorization: `Bearer ${fixture.actor.controlKey}` }, signal: AbortSignal.timeout(T.short),
    });
    expect(response.ok).toBe(true);
    const body = await response.json() as { workspaceId: string; workspaceMemberId: string; wallet: { balanceUsd: string } };
    expect(body.workspaceId).toBe(space.workspaceId);
    expect(body.workspaceMemberId).toBe(space.actorMemberId ?? space.ownerMemberId);
    snapshots.push({ alias, observedAt: new Date().toISOString(), body });
    return Number(body.wallet.balanceUsd);
  };
  try {
    await page.goto(client.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await client.select(given.spaces.a);
    expect(await directSnapshot('a')).toBe(10);
    expect(await directSnapshot('b')).toBe(20);
    await submit(page, 'a');
    await expect.poll(async () => {
      const state = await providerState();
      return state.ownattempt === given.attemptId && state.held.includes(tags.a)
        && state.events.some(event => event.type === 'arrived' && event.kind === 'main' && event.id === tags.a)
        && !state.events.some(event => event.id === tags.b);
    }, { timeout: T.long }).toBe(true);
    expect((await readRun('a')).status).toBe('running');
    await info.attach('WS005-A-actual-running-before-switch', { body: await page.screenshot(), contentType: 'image/png' });

    // Navigate through the actual Home/switcher workflow while A stays running.
    await page.getByRole('button', { name: 'Home', exact: true }).click({ timeout: T.medium });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await client.select(given.spaces.b);
    await page.getByTestId('workspace-switcher').click({ timeout: T.medium });
    const selected = page.getByTestId('workspace-switcher-list').getByRole('menuitem').filter({ hasText: given.spaces.b.workspaceName! });
    await selected.scrollIntoViewIfNeeded({ timeout: T.medium });
    await expect(selected).toHaveAttribute('aria-current', 'true');
    await info.attach('WS005-visible-selected-B-row', { body: await page.screenshot(), contentType: 'image/png' });
    // A populated menu can cover the rail-scoped backdrop center. Click its exposed corner.
    await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 }, timeout: T.medium });
    await expect(page.getByTestId('workspace-switcher')).toHaveAttribute('aria-expanded', 'false');
    expect((await providerState()).held).toContain(tags.a);
    await submit(page, 'b');
    await expect.poll(async () => {
      const state = await providerState();
      return state.events.some(event => event.type === 'arrived' && event.kind === 'main' && event.id === tags.b)
        && state.events.some(event => event.type === 'completed' && event.kind === 'main' && event.id === tags.a);
    }, { timeout: T.long }).toBe(true);
    const ordered = (await providerState()).events;
    const aArrived = ordered.findIndex(event => event.type === 'arrived' && event.kind === 'main' && event.id === tags.a);
    const bArrived = ordered.findIndex(event => event.type === 'arrived' && event.kind === 'main' && event.id === tags.b);
    const aCompleted = ordered.findIndex(event => event.type === 'completed' && event.kind === 'main' && event.id === tags.a);
    expect(aArrived).toBeGreaterThanOrEqual(0);
    expect(bArrived).toBeGreaterThan(aArrived);
    expect(aCompleted).toBeGreaterThan(bArrived);
    for (const alias of ['a', 'b'] as const) {
      await expect.poll(async () => { await readRun(alias); return runs[alias]!.terminal; },
        { timeout: T.xlong * 2, intervals: [250, 500, 1_000] }).toBe(true);
      expect.soft(runs[alias]!.reads.at(-1)!.status).toBe('succeeded');
    }
    // A plan-exhaustion rejection is a failed Given, never normal task completion.
    const settledProvider = await providerState();
    expect(settledProvider.held).toEqual([]);
    const ownEvents = settledProvider.events.filter(event => Object.values(tags).includes(event.id));
    expect(ownEvents.filter(event => ['rejected', 'failed', 'disconnected'].includes(event.type))).toEqual([]);
    const requestKeys = (type: string) => ownEvents.filter(event => event.type === type)
      .map(event => `${event.id}:${event.kind}:${event.requestIndex}`).sort();
    expect(requestKeys('completed')).toEqual(requestKeys('arrived'));
    expect(client.posts.filter(post => post.path === '/api/runs')).toEqual([
      { path: '/api/runs', workspaceId: given.spaces.a.workspaceId },
      { path: '/api/runs', workspaceId: given.spaces.b.workspaceId },
    ]);
    await expect.poll(() => directSnapshot('a'), { timeout: T.long }).toBe(8);
    await expect.poll(() => directSnapshot('b'), { timeout: T.long }).toBe(17);
    const context = await fetch(client.runtime.url.web('/api/workspace/context'), { headers: fundingHeaders(given.spaces.b) });
    expect(context.ok).toBe(true);
    const current = (await context.json()).context;
    expect(current.workspaceId).toBe(given.spaces.b.workspaceId);
    expect(current.workspaceMemberId).toBe(given.spaces.b.actorMemberId ?? given.spaces.b.ownerMemberId);
    await page.getByTestId('entry-top-right-credits').click({ timeout: T.medium });
    const panel = page.getByTestId('entry-top-right-credits-panel');
    await expect(panel).toBeVisible();
    await panel.hover({ timeout: T.medium });
    await expect.soft(panel.getByTestId('entry-nav-credits-row')).toContainText('$17.00', { timeout: T.long });
    await info.attach('WS005-current-B-settled-wallet', { body: await page.screenshot(), contentType: 'image/png' });
    await client.attach('WS005-current-B-context', current);
    bodyCompleted = true;
  } finally {
    const cancellations = await Promise.allSettled((['a', 'b'] as const).map(async alias => {
      const run = runs[alias];
      if (run && !run.terminal) {
        // Read the original terminal state before cancellation can change it.
        try { await readRun(alias); }
        catch (error) { cleanup.push({ alias, beforeCancelReadError: error instanceof Error ? error.name : 'unknown' }); }
      }
      if (run && !run.terminal) {
        const response = await fetch(client.runtime.url.web(`/api/runs/${run.runId}/cancel`), {
          method: 'POST', headers: fundingHeaders(given.spaces[alias]), signal: AbortSignal.timeout(T.short),
        });
        cleanup.push({ alias, runId: run.runId, cancelStatus: response.status });
      }
    }));
    cleanup.push(...cancellations.map((result, index) => ({ alias: index === 0 ? 'a' : 'b', status: result.status,
      errorType: result.status === 'rejected' ? result.reason?.name ?? 'unknown' : null })));
    try {
      await client.attach('WS005-original-two-step-observations', { attemptId: given.attemptId, tags, proof,
        runs, snapshots, stateReads, cleanup, wholeQaPassed: false,
        independentAccountingRequired: 'Every actual main/aux usage and unique ledger must bind original run/workspace/member and total2/3; no fixed auxiliary invocation count' });
    } finally { await client.close({ preserveScratch: !bodyCompleted || info.errors.length > 0 }); }
    expect.soft(cancellations.every(result => result.status === 'fulfilled'), 'All owned cancellation calls completed').toBe(true);
    // A failed B submission may leave only this attempt's bounded upstream A
    // hold. Observe its terminal cleanup; never release unrelated requests.
    await expect.poll(async () => (await providerState()).held.filter(id => Object.values(tags).includes(id)),
      { timeout: T.xlong * 2 }).toEqual([]);
  }
});
