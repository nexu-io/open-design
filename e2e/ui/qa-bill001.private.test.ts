import { randomUUID } from 'node:crypto';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startScopedFundingClient } from '@/playwright/workspace-funding-client';
import { fundingHeaders, readFundingFixture, type FundingFixture, type FundingSpace } from '@/playwright/workspace-funding-fixture';
import { T } from '@/timeouts';

type Bill001Given = {
  workspaceId: string; ownerMemberId: string; memberMemberId: string; modelId: string;
  expectedUnitPrice: { input: number; output: number; tokenUnit: number; tokensEachSide: number; usdPerCall: number };
  owner: { actor: FundingFixture['actor']; runtimeKey: string };
  member: { actor: FundingFixture['actor']; runtimeKey: string };
};

test('[P0] BILL-001 two real client sends debit one workspace wallet by actor', async ({ page }, info) => {
  test.setTimeout(T.xlong * 5);
  const base = await readFundingFixture() as FundingFixture & { bill001?: Bill001Given };
  const given = base.bill001;
  if (!given) throw new Error('Explicit disposable BILL-001 two-actor given required');
  expect(given.expectedUnitPrice.usdPerCall).toBe(3);
  expect((given.expectedUnitPrice.input + given.expectedUnitPrice.output)
    * given.expectedUnitPrice.tokensEachSide / given.expectedUnitPrice.tokenUnit).toBe(3);
  const result: Record<string, unknown>[] = [];
  for (const [index, role] of (['owner', 'member'] as const).entries()) {
    const actor = given[role];
    const actorPage = index === 0 ? page : await page.context().newPage();
    const space: FundingSpace = { workspaceId: given.workspaceId, ownerMemberId: given.ownerMemberId,
      actorMemberId: role === 'owner' ? given.ownerMemberId : given.memberMemberId,
      actorRole: role, runtimeKey: actor.runtimeKey };
    const expectedBefore = index === 0 ? 10 : 7;
    const expectedAfter = index === 0 ? 7 : 4;
    const fixture = { ...base, actor: actor.actor, runtime: { ...base.runtime, modelId: given.modelId } };
    const client = await startScopedFundingClient(actorPage, info, { fixture,
      initialSpace: space, checkedSpaces: { bill001: space }, runtimeKey: actor.runtimeKey,
      identitySuffix: `bill001-${role}`, attachmentPrefix: `BILL001-${role}-`, requireNamePrefix: false,
      checkPreflight(_alias, _space, preflight) {
        expect(Number(preflight.balanceUsd)).toBe(expectedBefore);
        expect(preflight.modelCovered).toBe(false);
      },
    });
    try {
      await actorPage.goto(client.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
      const credits = actorPage.getByTestId('entry-top-right-credits');
      await expect(credits).toBeVisible({ timeout: T.xlong });
      await credits.click();
      const walletPanel = actorPage.getByTestId('entry-top-right-credits-panel');
      await expect(walletPanel).toContainText(`$${expectedBefore.toFixed(2)}`, { timeout: T.long });
      const input = actorPage.getByTestId('home-hero-input');
      const send = actorPage.getByTestId('home-hero-submit');
      await expect(input).toBeVisible({ timeout: T.xlong });
      const requestId = `bill001-${randomUUID()}-${role}`;
      const prompt = `QA:${JSON.stringify({ id: requestId, tokens: given.expectedUnitPrice.tokensEachSide })}`;
      await input.fill(prompt);
      await expect(send).toBeEnabled({ timeout: T.medium });
      await info.attach(`BILL001-${role}-before-send`, { body: await actorPage.screenshot(), contentType: 'image/png' });
      const runPost = actorPage.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
      await send.click();
      const created = await runPost;
      expect(created.status()).toBe(202);
      const body = await created.json() as { runId?: string };
      expect(body.runId).toBeTruthy();
      let terminal: Record<string, unknown> | undefined;
      await expect.poll(async () => {
        const response = await fetch(client.runtime.url.daemon(`/api/runs/${body.runId}`), { headers: fundingHeaders(space) });
        terminal = await response.json() as Record<string, unknown>;
        return terminal.status;
      }, { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe('succeeded');
      const billingUrl = new URL('/api/workspace/billing', client.runtime.url.web());
      billingUrl.search = new URLSearchParams({ scope: 'workspace', workspaceId: given.workspaceId,
        includePreflight: '1', modelId: given.modelId }).toString();
      let observedBalance = NaN;
      await expect.poll(async () => {
        const response = await fetch(billingUrl, { headers: fundingHeaders(space) });
        expect(response.ok).toBe(true);
        const billing = await response.json() as { preflight?: { balanceUsd?: string } };
        observedBalance = Number(billing.preflight?.balanceUsd);
        return observedBalance;
      }, { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe(expectedAfter);
      await actorPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(credits).toBeVisible({ timeout: T.xlong });
      await credits.click();
      await expect(walletPanel).toContainText(`$${expectedAfter.toFixed(2)}`, { timeout: T.long });
      await info.attach(`BILL001-${role}-after-send`, { body: await actorPage.screenshot(), contentType: 'image/png' });
      result.push({ role, actorUserId: actor.actor.userId, workspaceId: given.workspaceId,
        requestId, runId: body.runId, runStatus: terminal?.status, createdStatus: created.status(),
        expectedBefore, observedBalance, expectedAfter,
        appRunPosts: client.posts.filter(post => post.path === '/api/runs') });
    } finally { await client.close(); }
  }
  await info.attach('BILL001-two-client-observation', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
