import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startScopedFundingClient } from '@/playwright/workspace-funding-client';
import { readFreeConcurrencyFixture } from '@/playwright/workspace-free-concurrency-fixture';
import { assertConcurrencyBinding, type ConcurrencyBinding } from '@/playwright/workspace-concurrency-fixture';
import { T } from '@/timeouts';

const output = process.env.OD_FUNDING_EVIDENCE_DIR!;
test.use({ video: 'on', viewport: { width: 1280, height: 800 } });
test('[P0] RUN-002 actual Link refusal, one release, preserved input and manual recheck', async ({ page }, info) => {
  test.setTimeout(480_000);
  if (process.env.OD_MANUAL_RETRY_RUNNER !== 'active') throw new Error('Canonical RUN002 runner required');
  const f = await readFreeConcurrencyFixture(); const free = f.freeConcurrency;
  expect(free.manualRetry?.caseKey).toBe('server:RUN-002');
  const binding: ConcurrencyBinding = { protocol: 'od-link-concurrency-v1', runId: f.isolation.runId,
    attemptId: free.attemptId, tag: `od-concurrency-${free.attemptId}-home`, surface: 'home',
    workspaceId: free.spaces.w1.workspaceId,
    fixtureSha256: createHash('sha256').update(await readFile(process.env.OD_FUNDING_FIXTURE!)).digest('hex') };
  const directory = join(output, 'manual-run002');
  const save = (name: string, data: unknown) => writeFile(join(output, name), JSON.stringify(data, null, 2), { mode: 0o600 });
  const marker = (name: string) => writeFile(join(directory, name), JSON.stringify({ ...binding, at: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
  async function phase(name: string, expected: number) {
    let row!: Record<string, unknown>;
    await expect.poll(async () => { try { row = JSON.parse(await readFile(join(directory, name + '.json'), 'utf8')); return true; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }, { timeout: T.xlong, intervals: [100, 250] }).toBe(true);
    assertConcurrencyBinding(row, binding); expect(row.count).toBe(expected);
    expect(row.receiptPath).toBe(name + '-receipt.safe.json');
    const raw = await readFile(join(directory, String(row.receiptPath)));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(row.receiptSha256);
    const receipt = JSON.parse(raw.toString()); assertConcurrencyBinding(receipt, binding); expect(receipt.count).toBe(expected);
    return receipt;
  }
  const requests: Array<{ method: string; path: string; at: number; body: string | null }> = [];
  page.on('request', r => { const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ method: r.method(), path, at: Date.now(), body: r.postData() }); });
  const results: Record<string, unknown> = { caseKey: 'server:RUN-002', actualUiSurface: 'project', binding,
    controlNamespace: 'Reuses the existing Free provider home tag; actual UI surface is Project, not inferred from the control tag',
    explicitGiven: 'Actual Free3 Link slots; only delivery timing of one genuine advisory response is controlled. No forged response or application task slots.' };
  let client: Awaited<ReturnType<typeof startScopedFundingClient>> | undefined;
  let advisoryHeld = false;
  async function terminal(runId: string) {
    let row!: Record<string, unknown>;
    await expect.poll(async () => { const r = await fetch(client!.runtime.url.web(`/api/runs/${runId}`)); expect(r.ok).toBe(true); row = await r.json(); return row.status; },
      { timeout: T.xlong, intervals: [250, 500] }).toMatch(/succeeded|failed|canceled/);
    await save(`actual-run-${runId}.safe.json`, row); return row;
  }
  try {
    client = await startScopedFundingClient(page, info, { fixture: f, initialSpace: free.spaces.w1,
      checkedSpaces: free.spaces, runtimeKey: free.ownerRuntimeKey, identitySuffix: 'owner', requireNamePrefix: false,
      checkPreflight: (_name, _space, preflight) => { expect(preflight.codingPlan.eligible).toBe(false); expect(Number(preflight.balanceUsd)).toBeGreaterThan(0); } });
    const projectId = await client.createProject(free.spaces.w1);
    await page.goto(client.runtime.url.web(`/projects/${projectId}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    const input = page.getByTestId('chat-composer-input'); const send = page.getByTestId('chat-send');
    await expect(input).toBeVisible({ timeout: T.xlong });
    const prompt = `QA:${JSON.stringify({ id: binding.tag + '-manual', tokens: 1, hold: false })} Reply ok only.`;
    await input.fill(prompt); results.originalPrompt = prompt;
    await marker('ready.json'); results.available = await phase('available2', 2);
    // A real 2/3 response crosses a real admission race. Only timing changes;
    // no route response bytes, policy, model request or product code is forged.
    await page.route('**/api/workspace/billing/request-concurrency*', async route => {
      if (advisoryHeld) { await route.continue(); return; }
      advisoryHeld = true;
      const response = await route.fetch(); const raw = await response.body(); const body = JSON.parse(raw.toString());
      expect(response.ok()).toBe(true); expect(body.requestConcurrencyHint.status).toBe('available');
      expect(body.requestConcurrencyHint.running).toBe(2); expect(body.requestConcurrencyHint.limit).toBe(3);
      results.genuineAdvisory = { at: Date.now(), body, sha256: createHash('sha256').update(raw).digest('hex') };
      await marker('advisory-read.json'); results.full = await phase('held3', 3);
      await route.fulfill({ response, body: raw });
    });
    const first = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click({ timeout: T.medium }); const firstResponse = await first;
    expect(firstResponse.status()).toBe(202); const firstCreated = await firstResponse.json();
    const firstTerminal = await terminal(firstCreated.runId);
    results.rejected = { created: firstCreated, terminal: firstTerminal };
    await save('actual-refusal-before-release.safe.json', { binding, ...results, requests });
    expect(firstTerminal.status).toBe('failed');
    expect(firstTerminal.failureDetail).toBe('membership_concurrency_limit');
    await expect(page.getByTestId('amr-concurrency-dialog')).toBeVisible({ timeout: T.medium });
    await page.screenshot({ path: join(output, 'before-release-real-Link-refusal.png') });
    await marker('client-rejected.json'); results.rejectedFull = await phase('rejected-held3', 3);
    await page.getByTestId('amr-concurrency-close').click();
    await expect(input).toHaveText(prompt, { timeout: T.medium });
    await marker('release-one-ready.json'); results.releasedOne = await phase('released-one', 2);
    const start = Date.now(); const startIndex = requests.length;
    // RUN002 requires no automatic restart; a real minute is shared with the
    // stricter RUN013 observation, not a claimed product retry SLA.
    const automatic = await page.waitForEvent('request', { predicate: r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/runs', timeout: 60_000 }).catch(() => null);
    results.idle = { startedAt: start, endedAt: Date.now(), automatic: !!automatic, requests: requests.slice(startIndex) };
    expect(automatic).toBeNull(); await expect(input).toHaveText(prompt);
    await save('step1-no-automatic-restart.safe.json', { binding, ...results });
    await page.screenshot({ path: join(output, 'after-one-release-preserved-draft.png') });
    const manualStart = requests.length; const clickedAt = Date.now();
    const retried = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click({ timeout: T.medium }); const retriedResponse = await retried;
    expect(retriedResponse.status()).toBe(202); const manualCreated = await retriedResponse.json();
    const manualTerminal = await terminal(manualCreated.runId);
    const manualRequests = requests.slice(manualStart);
    expect(manualRequests.some(r => r.path === '/api/workspace/billing/preflight')).toBe(true);
    expect(manualRequests.some(r => r.path === '/api/workspace/billing/request-concurrency')).toBe(true);
    expect(manualRequests.filter(r => r.method === 'POST' && r.path === '/api/runs')).toHaveLength(1);
    expect(manualTerminal.status).toBe('succeeded'); expect(manualTerminal.exitCode).toBe(0);
    results.manual = { clickedAt, created: manualCreated, terminal: manualTerminal, requests: manualRequests };
    await save('step2-manual-recheck.safe.json', { binding, ...results });
    await page.screenshot({ path: join(output, 'after-manual-retry-success.png') });
    await marker('manual-finished.json'); results.manualPhase = await phase('manual-complete', 2);
    await marker('release-ready.json'); results.final = await phase('released0', 0);
    results.completedAllOriginalSteps = true;
  } finally {
    await save('business-results.safe.json', { ...results, requests });
    await writeFile(join(output, 'ALL-DONE.json'), JSON.stringify({ at: new Date().toISOString() }), { mode: 0o600 });
    await page.unroute('**/api/workspace/billing/request-concurrency*');
    const cleanup = await Promise.allSettled([client?.close({ preserveScratch: true })]);
    await save('owned-runtimes-cleanup.safe.json', cleanup); expect(cleanup.every(r => r.status === 'fulfilled')).toBe(true);
  }
});
