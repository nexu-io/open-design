import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser, BrowserContext, Page } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

// Explicit external sandbox lane: the AMR owner prepares a private fixture and
// independently verifies Link/PG after the browser performs the one real DELETE.
type Actor = {
  userId: string;
  memberId: string;
  controlKey: string;
  runtimeKey: string;
  runtimeKeyId: string;
  cookie: { name: string; value: string };
};
type Fixture = {
  alias: string;
  tuple: { apiSha: string; linkSha: string; linkBinarySha: string; odSha: string };
  urls: { api: string; link: string; web: string };
  workspace: { id: string; ownerMemberId: string; memberAId: string; memberBId: string };
  actors: { owner: Actor; A: Actor; B: Actor };
  projects: { sharedId: string; privateId: string };
  model: { id: string; tariffSnapshotSha: string; expectedChargeCredits: 20000 };
  provider: { baseUrl: string; statePath: string };
};
type Binding = {
  protocol: 'od-link-mem009-v1';
  alias: string;
  attemptId: string;
  fixtureSha256: string;
  odSha: string;
  apiSha: string;
  linkSha: string;
  linkBinarySha: string;
  workspaceId: string;
  memberAId: string;
  modelId: string;
};
type Receipt = Binding & {
  at: string;
  receiptFile: string;
  receiptDigest: string;
  [key: string]: unknown;
};
type Project = { projectId: string; workspaceId: string; ownerMemberId: string;
  visibility: 'team' | 'private'; access: { canView: boolean } };

const fixturePath = process.env.OD_LINK_MEM009_FIXTURE;
const output = process.env.OD_LINK_MEM009_EVIDENCE;

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function loopback(value: string) {
  const url = new URL(value);
  expect(url.protocol).toBe('http:');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
}

async function prepare() {
  if (!fixturePath || !output) throw new Error('Explicit MEM009 fixture and evidence directory required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('MEM009 fixture must be 0600');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: e2eWorkspaceRoot(), encoding: 'utf8',
  }).trim();
  expect(fixture.tuple.odSha).toBe(odSha);
  for (const value of [fixture.tuple.apiSha, fixture.tuple.linkSha])
    expect(value).toMatch(/^[a-f0-9]{40}$/);
  for (const value of [fixture.tuple.linkBinarySha, fixture.model.tariffSnapshotSha])
    expect(value).toMatch(/^[a-f0-9]{64}$/);
  expect(fixture.model.expectedChargeCredits).toBe(20000);
  expect(new Set(Object.values(fixture.actors).map(actor => actor.userId)).size).toBe(3);
  expect(fixture.workspace.ownerMemberId).toBe(fixture.actors.owner.memberId);
  expect(fixture.workspace.memberAId).toBe(fixture.actors.A.memberId);
  expect(fixture.workspace.memberBId).toBe(fixture.actors.B.memberId);
  expect(new Set([fixture.workspace.ownerMemberId, fixture.workspace.memberAId,
    fixture.workspace.memberBId]).size).toBe(3);
  expect(fixture.projects.sharedId).not.toBe(fixture.projects.privateId);
  for (const actor of Object.values(fixture.actors)) {
    expect(actor.controlKey.length).toBeGreaterThan(0);
    expect(actor.runtimeKey.length).toBeGreaterThan(0);
    expect(actor.runtimeKeyId.length).toBeGreaterThan(0);
    expect(actor.cookie.name.length).toBeGreaterThan(0);
    expect(actor.cookie.value.length).toBeGreaterThan(0);
  }
  for (const value of [...Object.values(fixture.urls), fixture.provider.baseUrl]) loopback(value);
  expect(fixture.provider.statePath).toMatch(/^\/[a-zA-Z0-9/_-]+$/);
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(markers, 0o700);
  expect(await readdir(markers)).toEqual([]);
  const binding: Binding = {
    protocol: 'od-link-mem009-v1', alias: fixture.alias, attemptId: randomUUID(),
    fixtureSha256: sha256(bytes), odSha, apiSha: fixture.tuple.apiSha,
    linkSha: fixture.tuple.linkSha, linkBinarySha: fixture.tuple.linkBinarySha,
    workspaceId: fixture.workspace.id, memberAId: fixture.workspace.memberAId,
    modelId: fixture.model.id,
  };
  const save = (name: string, value: unknown) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const mark = async (name: string, fields: Record<string, unknown>) => {
    const target = join(markers, name);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ ...binding, ...fields, at: new Date().toISOString() }),
      { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  };
  const receipt = async (name: string) => {
    let value!: Receipt;
    await expect.poll(async () => {
      try { value = JSON.parse(await readFile(join(markers, name), 'utf8')) as Receipt; return true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    }, { timeout: 180_000, intervals: [250, 500, 1000] }).toBe(true);
    expect(value).toMatchObject(binding);
    expect(value.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(value.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    expect(sha256(await readFile(join(markers, value.receiptFile)))).toBe(value.receiptDigest);
    if (value.error) throw new Error(`MEM009 verifier failed: ${String(value.error)}`);
    await save(name, value);
    return value;
  };
  return { fixture, binding, save, mark, receipt };
}

async function providerState(fixture: Fixture) {
  const response = await fetch(new URL(fixture.provider.statePath, fixture.provider.baseUrl),
    { signal: AbortSignal.timeout(T.medium) });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ held: string[]; attempts: unknown[] }>;
}

async function project(fixture: Fixture, actor: Actor, projectId: string) {
  const response = await fetch(`${fixture.urls.api}/api/v1/team-projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${actor.controlKey}`,
      'x-vela-workspace-id': fixture.workspace.id },
    signal: AbortSignal.timeout(T.medium),
  });
  const body = await response.json() as Project | { error: string };
  return { status: response.status, body };
}

async function consolePage(browser: Browser, fixture: Fixture, actor: Actor, path: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
    recordVideo: { dir: output! } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  await context.addCookies([{ ...actor.cookie, url: fixture.urls.web,
    httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const contextResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/v1/workspaces/current' &&
    response.status() === 200, { timeout: T.xlong });
  await page.goto(`${fixture.urls.web}${path}?workspaceId=${encodeURIComponent(fixture.workspace.id)}`,
    { waitUntil: 'domcontentloaded', timeout: T.xlong });
  await contextResponse;
  return { context, page };
}

async function removeInOwnerUI(page: Page, fixture: Fixture) {
  const direct = page.getByTestId(`team-member-remove-${fixture.workspace.memberAId}`);
  if (await direct.isVisible()) await direct.click();
  else {
    const menu = page.getByTestId(`team-member-actions-${fixture.workspace.memberAId}`);
    await expect(menu).toBeVisible({ timeout: T.long });
    await menu.click();
    await page.getByRole('option', { name: /移除成员|Remove member/ }).click();
  }
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/正在运行的任务会被终止|running tasks will stop/i);
  await expect(dialog).toContainText(/私有项目|private projects/i);
  await page.screenshot({ path: join(output!, 'MEM009-owner-confirm-before-delete.png') });
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'DELETE' &&
      url.pathname.endsWith(`/api/v1/workspaces/${fixture.workspace.id}/members/${fixture.workspace.memberAId}`);
  }, { timeout: T.xlong });
  await dialog.getByRole('button', { name: /^(确认|Confirm)$/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const responseBytes = await response.body();
  return { status: response.status(), responseSha256: sha256(responseBytes), at: new Date().toISOString() };
}

test('[P1] MEM009 measured in-flight removal settles $2 once and transfers projects', async ({ browser }) => {
  test.setTimeout(300_000);
  const { fixture, binding, save, mark, receipt } = await prepare();
  let owner: { context: BrowserContext; page: Page } | undefined;
  let member: { context: BrowserContext; page: Page } | undefined;
  try {
    // The independent AMR writer starts a real streaming CLI request and emits
    // A-held only after its controlled upstream reports usage while still open.
    owner = await consolePage(browser, fixture, fixture.actors.owner, '/team');
    member = await consolePage(browser, fixture, fixture.actors.A, '/dashboard');
    await expect(owner.page.getByTestId('team-members-reference-table')).toBeVisible({ timeout: T.xlong });
    await expect(member.page.getByTestId('workspace-member-removed-content-blocked')).toHaveCount(0);
    const sharedBefore = await project(fixture, fixture.actors.B, fixture.projects.sharedId);
    const privateBefore = await project(fixture, fixture.actors.A, fixture.projects.privateId);
    expect(sharedBefore.status).toBe(200);
    expect(sharedBefore.body).toMatchObject({ projectId: fixture.projects.sharedId,
      visibility: 'team', ownerMemberId: fixture.workspace.memberAId });
    expect(privateBefore.status).toBe(200);
    expect(privateBefore.body).toMatchObject({ projectId: fixture.projects.privateId,
      visibility: 'private', ownerMemberId: fixture.workspace.memberAId });
    await mark('MEM009-ready.json', { sharedProjectId: fixture.projects.sharedId,
      privateProjectId: fixture.projects.privateId, ownerUiReady: true,
      memberNoticeObserverReady: true });
    const held = await receipt('MEM009-A-held.json');
    expect(held).toMatchObject({ requestState: 'streaming', responseTerminal: false,
      providerUsage: { inputTokens: 1, outputTokens: 1 },
      tariffSnapshotSha: fixture.model.tariffSnapshotSha,
      expectedChargeCredits: fixture.model.expectedChargeCredits });
    expect(held.requestId).toEqual(expect.any(String));
    expect(held.providerAttemptId).toEqual(expect.any(String));
    expect(held.providerUsageAt).toEqual(expect.any(String));
    const beforeProvider = await providerState(fixture);
    expect(beforeProvider.held).toContain(held.providerAttemptId);
    await save('MEM009-before-delete.safe.json', { binding, held, sharedBefore,
      privateBefore, providerHeld: beforeProvider.held });

    const deletion = await removeInOwnerUI(owner.page, fixture);
    expect(Date.parse(String(held.providerUsageAt))).toBeLessThan(Date.parse(deletion.at));
    await mark('MEM009-B-removed.json', { requestId: held.requestId,
      providerAttemptId: held.providerAttemptId, removedMemberId: fixture.workspace.memberAId,
      deleteResponseStatus: deletion.status, deleteResponseSha256: deletion.responseSha256,
      deletedAt: deletion.at });
    await expect(member.page.getByTestId('workspace-member-removed-content-blocked'))
      .toBeVisible({ timeout: T.xlong });
    await expect(member.page.getByTestId('workspace-member-removed-confirm'))
      .toBeVisible({ timeout: T.xlong });
    await expect(owner.page.getByTestId(`team-member-remove-${fixture.workspace.memberAId}`))
      .toHaveCount(0);
    await member.page.screenshot({ path: join(output!, 'MEM009-member-removed-notice.png') });
    const final = await receipt('MEM009-final.json');
    expect(final).toMatchObject({ requestId: held.requestId, removedMemberId: fixture.workspace.memberAId,
      original: { statusCode: 499, success: false, billableCancellation: true,
        metadata: { billableCancellation: true },
        billingScopeVersion: 2, inputTokens: 1, outputTokens: 1, chargeCredits: '20000',
        workspaceId: fixture.workspace.id, workspaceMemberId: fixture.workspace.memberAId,
        appUserId: fixture.actors.A.userId, apiKeyId: fixture.actors.A.runtimeKeyId },
      settlement: { exactCreditUsageCount: 1, allocationCount: 1, amountCredits: '20000',
        duplicateHttpStatuses: [200, 200], afterReplayUnchanged: true,
        originalInitiatorRetained: true },
      removal: { memberStatus: 'removed', memberKeyStatus: 'revoked',
        providerTransportClosed: true, originalTaskStopped: true },
      projects: { shared: { catalogOwnerMemberId: fixture.workspace.ownerMemberId,
        resourceOwnerMemberId: fixture.workspace.ownerMemberId, visibility: 'team' },
      private: { catalogOwnerMemberId: fixture.workspace.ownerMemberId,
        resourceOwnerMemberId: fixture.workspace.ownerMemberId, visibility: 'private' } } });
    const settlement = final.settlement as Record<string, unknown>;
    expect(settlement.ledgerExactsetDigestBeforeReplay).toMatch(/^[a-f0-9]{64}$/);
    expect(settlement.ledgerExactsetDigestAfterReplay)
      .toBe(settlement.ledgerExactsetDigestBeforeReplay);
    expect(Number(settlement.walletCreditsBefore) - Number(settlement.walletCreditsAfter))
      .toBe(fixture.model.expectedChargeCredits);
    expect(Date.parse(String(final.settledAt))).toBeGreaterThan(Date.parse(deletion.at));

    // Exercise live authorization after the removal, not merely DB state.
    const sharedAfter = await project(fixture, fixture.actors.B, fixture.projects.sharedId);
    const privateB = await project(fixture, fixture.actors.B, fixture.projects.privateId);
    const privateOwner = await project(fixture, fixture.actors.owner, fixture.projects.privateId);
    expect(sharedAfter.status).toBe(200);
    expect(sharedAfter.body).toMatchObject({ ownerMemberId: fixture.workspace.ownerMemberId,
      visibility: 'team' });
    expect(privateB.status).toBe(404);
    expect(privateOwner.status).toBe(200);
    expect(privateOwner.body).toMatchObject({ ownerMemberId: fixture.workspace.ownerMemberId,
      visibility: 'private', access: { canView: true } });
    const providerBeforeDenials = await providerState(fixture);
    for (const kind of ['new', 'retry'] as const) {
      const response = await fetch(`${fixture.urls.link}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${fixture.actors.A.runtimeKey}`,
          'x-vela-workspace-id': fixture.workspace.id, 'content-type': 'application/json',
          'x-request-id': kind === 'retry' ? String(held.requestId) : randomUUID() },
        body: JSON.stringify({ model: fixture.model.id,
          messages: [{ role: 'user', content: `MEM009 ${kind} after removal` }] }),
        signal: AbortSignal.timeout(T.medium),
      });
      expect(response.status).toBe(403);
      await response.arrayBuffer();
    }
    const providerAfterDenials = await providerState(fixture);
    expect(providerAfterDenials.attempts).toEqual(providerBeforeDenials.attempts);
    await member.page.getByTestId('workspace-member-removed-confirm').click();
    await expect(member.page.getByTestId('workspace-member-removed-content-blocked'))
      .toHaveCount(0);
    await member.page.screenshot({ path: join(output!, 'MEM009-member-exited-removed-workspace.png') });
    await save('MEM009-complete.safe.json', { binding, deletion,
      originalRequestId: held.requestId, final, sharedAfter,
      privateBStatus: privateB.status, privateOwner, rejectedLinkRequests: 2,
      providerAttemptsUnchanged: true });
  } finally {
    await member?.context.close();
    await owner?.context.close();
  }
});
