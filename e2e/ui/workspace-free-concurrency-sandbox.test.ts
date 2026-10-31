import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startScopedFundingClient, type Preflight } from '@/playwright/workspace-funding-client';
import { readFreeConcurrencyFixture } from '@/playwright/workspace-free-concurrency-fixture';
import { fundingHeaders, type FundingSpace } from '@/playwright/workspace-funding-fixture';
import { assertConcurrencyBinding, type ConcurrencyBinding } from '@/playwright/workspace-concurrency-fixture';
import { T } from '@/timeouts';

const output = process.env.OD_FUNDING_EVIDENCE_DIR!;
test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('[P0] RUN-013-CLIENT Free three Link slots, manual recovery and independent workspace', async ({ page, browser }, info) => {
  test.setTimeout(600_000);
  if (process.env.OD_FREE_CONCURRENCY_RUNNER !== 'active') throw new Error('Mandatory canonical Free concurrency runner required');
  const f = await readFreeConcurrencyFixture(); const free = f.freeConcurrency;
  const binding: ConcurrencyBinding = { protocol: 'od-link-concurrency-v1', runId: f.isolation.runId,
    attemptId: free.attemptId, tag: `od-concurrency-${free.attemptId}-home`, surface: 'home',
    workspaceId: free.spaces.w1.workspaceId,
    fixtureSha256: createHash('sha256').update(await readFile(process.env.OD_FUNDING_FIXTURE!)).digest('hex') };
  const directory = join(output, 'free-run013');
  const save = (name: string, data: unknown) => writeFile(join(output, name), JSON.stringify(data, null, 2), { mode: 0o600 });
  const marker = (name: string, data: unknown = {}) => writeFile(join(directory, name), JSON.stringify({ ...binding, data, at: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
  async function phase(name: string, expected: number) {
    let row!: Record<string, unknown>;
    await expect.poll(async () => { try { row = JSON.parse(await readFile(join(directory, name + '.json'), 'utf8')); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }, { timeout: T.xlong, intervals: [100, 250] }).toBe(true);
    assertConcurrencyBinding(row, binding); expect(row.count).toBe(expected);
    expect(row.receiptPath).toBe(name + '-receipt.safe.json');
    const bytes = await readFile(join(directory, String(row.receiptPath)));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.receiptSha256);
    const receipt = JSON.parse(bytes.toString()); assertConcurrencyBinding(receipt, binding); expect(receipt.count).toBe(expected);
    return receipt;
  }
  const observerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const observerPage = await observerContext.newPage();
  type Stream = { url: string; openedAt?: number; readyAt?: number; events: Array<{ type: string; at: number; data: string }> };
  async function capture(page: Page) {
    await page.addInitScript(() => {
      const target = window as typeof window & { qaWorkspaceStreams?: unknown[] };
      target.qaWorkspaceStreams = [];
      const Original = window.EventSource;
      window.EventSource = class extends Original {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          if (!String(url).includes('/api/workspace/events')) return;
          const row = { url: String(url), openedAt: 0, readyAt: 0, events: [] as unknown[] };
          target.qaWorkspaceStreams!.push(row);
          this.addEventListener('open', () => { row.openedAt = Date.now(); });
          for (const type of ['ready', 'wallet-balance-changed', 'billing-changed', 'workspace-members-changed', 'workspace-context-changed', 'coding-plan-usage-changed']) {
            this.addEventListener(type, event => { if (type === 'ready') row.readyAt = Date.now(); row.events.push({ type, at: Date.now(), data: (event as MessageEvent).data }); });
          }
        }
      };
    });
  }
  await capture(page); await capture(observerPage);
  const requests: Array<{ actor: string; method: string; path: string; at: number }> = [];
  for (const [actor, current] of [['owner', page], ['observer', observerPage]] as const) current.on('request', r => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ actor, method: r.method(), path, at: Date.now() });
  });
  const verifyPreflight = (_: string, __: FundingSpace, preflight: Preflight) => {
    expect(preflight.codingPlan.eligible).toBe(false); expect(preflight.codingPlan.tier).toBeNull();
    expect(preflight.codingPlan.windows).toEqual([]); expect(Number(preflight.balanceUsd)).toBeGreaterThan(0);
  };
  let owner: Awaited<ReturnType<typeof startScopedFundingClient>> | undefined;
  let observer: typeof owner;
  const results: Record<string, unknown> = { caseKey: free.caseKey, binding, explicitGiven: 'Actual production Free3 configuration; controlled positive upstream usage, original prices unchanged' };
  async function streams(current: Page): Promise<Stream[]> { return current.evaluate(() => (window as typeof window & { qaWorkspaceStreams?: Stream[] }).qaWorkspaceStreams ?? []); }
  async function connected(current: Page) {
    await expect.poll(async () => (await streams(current)).some(s => s.readyAt && new URL(s.url, current.url()).searchParams.get('workspaceId') === free.spaces.w1.workspaceId), { timeout: T.xlong }).toBe(true);
  }
  const sendPrompt = async (client: NonNullable<typeof owner>, current: Page) => {
    const response = current.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: T.long });
    await current.getByTestId('home-hero-submit').click({ timeout: T.medium });
    const accepted = await response; expect(accepted.status()).toBe(202);
    const created = await accepted.json(); let terminal: Record<string, unknown> = {};
    await expect.poll(async () => { const r = await fetch(client.runtime.url.web(`/api/runs/${created.runId}`)); expect(r.ok).toBe(true); terminal = await r.json(); return terminal.status; }, { timeout: T.xlong, intervals: [250, 500] }).toMatch(/succeeded|failed|canceled/);
    await save(`actual-run-${created.runId}.safe.json`, { created, terminal });
    expect(terminal.status).toBe('succeeded'); expect(terminal.exitCode).toBe(0);
    return { created, terminal };
  };
  try {
    owner = await startScopedFundingClient(page, info, { fixture: f, initialSpace: free.spaces.w1,
      checkedSpaces: free.spaces, runtimeKey: free.ownerRuntimeKey, identitySuffix: 'owner', attachmentPrefix: 'owner-', requireNamePrefix: false, checkPreflight: verifyPreflight });
    observer = await startScopedFundingClient(observerPage, info, { fixture: { ...f, actor: free.observer.actor }, initialSpace: free.observer.space,
      checkedSpaces: { w1: free.observer.space }, runtimeKey: free.observer.runtimeKey, identitySuffix: 'observer', attachmentPrefix: 'observer-', requireNamePrefix: false, checkPreflight: verifyPreflight });
    await page.goto(owner.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await observerPage.goto(observer.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await expect(observerPage.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await connected(page); await connected(observerPage);
    const observerBillingUrl = new URL(`/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(free.spaces.w1.workspaceId)}&includePreflight=1&modelId=${encodeURIComponent(f.runtime.modelId)}`, observer.runtime.url.web('/')).toString();
    let observerRealtime: unknown;
    const healthResponse = await fetch(observerBillingUrl, { headers: fundingHeaders(free.observer.space) });
    const healthBody = await healthResponse.text();
    observerRealtime = { at: new Date().toISOString(), status: healthResponse.status, body: healthBody };
    await save('observer-realtime-health-diagnostic.safe.json', observerRealtime);
    // The original QA needs a live recipient, not this advisory health DTO.
    // Prove both hops: the actual browser SSE ready above and a verified hub
    // connection receiving a real same-workspace wallet event below.
    let observerHubLines: string[] = [];
    await expect.poll(async () => {
      const logs = await observer!.runtime.logs();
      const daemon = logs.daemon; if (!daemon) return false;
      const lines = (await readFile(daemon.logPath, 'utf8')).split('\n');
      observerHubLines = lines.filter(line => line.includes(`workspaceId=${free.spaces.w1.workspaceId}`)
        && (line.includes('hub events workspace verified') || line.includes('hub workspace event received')));
      return observerHubLines.some(line => line.includes('hub events workspace verified'))
        && observerHubLines.some(line => line.includes('type=wallet-balance-changed'));
    }, { timeout: T.medium, intervals: [500, 1000] }).toBe(true);
    await save('observer-real-hub-receipt.safe.json', { workspaceId: free.spaces.w1.workspaceId, memberId: free.observer.space.actorMemberId,
      at: new Date().toISOString(), actualLines: observerHubLines, browserStreams: await streams(observerPage) });
    results.observerRealtime = observerRealtime;
    results.streamsBefore = { owner: await streams(page), observer: await streams(observerPage) };
    const originalPrompt = `QA:${JSON.stringify({ id: binding.tag + '-manual', tokens: 1, hold: false })} Reply ok only.`;
    await page.getByTestId('home-hero-input').fill(originalPrompt);
    await marker('ready.json'); results.held = await phase('held3', 3);
    const beforeSend = requests.length; const startedAt = Date.now();
    const advisory = page.waitForResponse(r => new URL(r.url()).pathname === '/api/workspace/billing/request-concurrency');
    await page.getByTestId('home-hero-submit').click({ timeout: T.medium });
    const hint = await advisory; expect(hint.ok()).toBe(true);
    const actualHint = await hint.json(); expect(actualHint.requestConcurrencyHint.status).toBe('full');
    expect(actualHint.requestConcurrencyHint.running).toBe(3); expect(actualHint.requestConcurrencyHint.limit).toBe(3);
    await expect(page.getByTestId('amr-concurrency-dialog')).toBeVisible();
    await expect(page.getByTestId('amr-concurrency-upgrade')).toBeVisible();
    await expect(observerPage.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
    expect(requests.slice(beforeSend).filter(r => r.method === 'POST' && ['/api/projects', '/api/runs'].includes(r.path))).toEqual([]);
    await page.screenshot({ path: join(output, 'step1-owner-full.png') });
    await observerPage.screenshot({ path: join(output, 'step1-observer-no-notice.png') });
    results.step1 = { actualHint, startedAt, endedAt: Date.now(), ownerDraft: await page.getByTestId('home-hero-input').textContent(), observerStreams: await streams(observerPage) };
    await save('step1-completed.safe.json', { binding, step1: results.step1, requests: requests.slice(beforeSend), observerRealtime });
    await page.getByTestId('amr-concurrency-close').click();
    await marker('release-one-ready.json'); results.releasedOne = await phase('released-one', 2);
    const idleStart = Date.now(); const idleIndex = requests.length;
    // The original QA explicitly requires one real minute with no client action.
    const auto = await page.waitForEvent('request', { predicate: r => r.method() === 'POST' && ['/api/runs', '/api/projects'].includes(new URL(r.url()).pathname), timeout: 60_000 }).catch(() => null);
    results.minute = { startedAt: idleStart, endedAt: Date.now(), requests: requests.slice(idleIndex), automaticallyDispatched: !!auto };
    expect(auto).toBeNull(); expect(Date.now() - idleStart).toBeGreaterThanOrEqual(59_900);
    await expect(page.getByTestId('home-hero-input')).toHaveText(originalPrompt);
    await expect(observerPage.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
    const recheckIndex = requests.length;
    results.manual = await sendPrompt(owner, page);
    await save('step2-completed.safe.json', { binding, minute: results.minute, manual: results.manual });
    const rechecks = requests.slice(recheckIndex);
    expect(rechecks.some(r => r.path === '/api/workspace/billing/request-concurrency')).toBe(true);
    expect(rechecks.some(r => r.path === '/api/workspace/billing/preflight')).toBe(true);
    await marker('refill-ready.json'); results.refilled = await phase('refilled3', 3);
    await page.goto(owner.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.xlong });
    await owner.select(free.spaces.w2);
    const w2Prompt = `QA:${JSON.stringify({ id: binding.tag + '-w2', tokens: 1, hold: false })} Reply ok only.`;
    await page.getByTestId('home-hero-input').fill(w2Prompt);
    results.w2 = await sendPrompt(owner, page);
    await page.screenshot({ path: join(output, 'step3-w2-success.png') });
    await marker('add-member-ready.json'); results.memberAdded = await phase('member-added', 3);
    await marker('release-ready.json'); results.released = await phase('released0', 0);
    results.completedAllOriginalSteps = true;
  } finally {
    await save('business-results.safe.json', { ...results, requests, ownerStreams: page.isClosed() ? [] : await streams(page), observerStreams: observerPage.isClosed() ? [] : await streams(observerPage) });
    await writeFile(join(output, 'ALL-DONE.json'), JSON.stringify({ at: new Date().toISOString() }), { mode: 0o600 });
    const cleanup = await Promise.allSettled([owner?.close({ preserveScratch: true }), observer?.close({ preserveScratch: true })]);
    await observerContext.close();
    await save('owned-runtimes-cleanup.safe.json', cleanup);
    expect(cleanup.every(r => r.status === 'fulfilled')).toBe(true);
  }
});
