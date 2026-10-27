// @vitest-environment node
// OPEND-3493: page-check/SSE overwrite approval regression.
// Mock only the Vela hub/CLI, keep publication, event handling, authorized
// materialization and project reads on the real daemon HTTP paths.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { requestJson, requestText } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const WORKSPACE = 'ws-opend3493-shared';
const OWNER = { controlKey: 'mock-opend3493-owner', memberId: 'mem-opend3493-owner', name: 'Mock owner', role: 'owner' as const };
const MEMBER = { controlKey: 'mock-opend3493-member', memberId: 'mem-opend3493-member', name: 'Mock member', role: 'member' as const };
type Identity = typeof OWNER | typeof MEMBER;
type Status = { publishedVersion: number | null; materializedVersion: number | null; ownerMemberId: string | null; awaitingFirstMaterialization: boolean };
function headers(identity: Identity) {
  return {
    'x-od-workspace-id': WORKSPACE, 'x-od-workspace-member-id': identity.memberId,
    'x-od-workspace-type': 'team', 'x-od-workspace-role': identity.role,
    'x-od-workspace-member-status': 'active', 'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': identity === OWNER ? 'true' : 'false',
    'x-od-workspace-can-write-synced-files': identity === OWNER ? 'true' : 'false',
  };
}

test('OPEND-3493: a second owner device approves updates and continues publishing without an echo', { timeout: 360_000 }, async () => {
  const a = await createSmokeSuite('opend3493-shared-a');
  const b = await createSmokeSuite('opend3493-shared-b');
  const c = await createSmokeSuite('opend3493-shared-c');
  const hub = await startFakeCollabHub({ root: join(a.scratchDir, 'hub'), workspaceId: WORKSPACE, workspaceName: 'Serial device mock', clients: [OWNER, MEMBER] });
  const velaBin = await hub.writeVelaBin(join(a.scratchDir, 'mock-vela'));
  function options(suite: typeof a, identity: Identity) {
    return { env: {
      OD_COLLAB_TRANSPORT: 'vela-cli', OD_RESOURCE_TRANSPORT: 'vela-cli',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela', VELA_API_URL: hub.url, VELA_BIN: velaBin,
      VELA_CONTROL_KEY: identity.controlKey, AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
    } };
  }
  const id = randomUUID();
  const v1 = '<!doctype html><html><body>A published version one</body></html>';
  const v2 = '<!doctype html><html><body>A published version two</body></html>';
  const filePath = `/api/projects/${id}/raw/index.html`;
  const statusPath = `/api/projects/${id}/collab/status`;
  async function pin(url: string, identity: Identity) {
    await requestJson(url, '/api/workspace/active', { method: 'PUT', body: { workspaceId: WORKSPACE, workspaceMemberId: identity.memberId } });
    await requestJson(url, `/api/workspace/billing?scope=workspace&workspaceId=${WORKSPACE}`, { headers: headers(identity) });
  }
  async function upload(url: string, content: string) {
    const form = new FormData();
    form.set('file', new Blob([content], { type: 'text/html' }), 'index.html');
    const response = await fetch(new URL(`/api/projects/${id}/files`, url), { method: 'POST', headers: headers(OWNER), body: form });
    expect(response.status, await response.text()).toBe(200);
  }
  async function read(url: string, identity: Identity) {
    const response = await fetch(new URL(filePath, url), { headers: headers(identity) });
    return { status: response.status, content: await response.text() };
  }
  async function seed(url: string, identity: Identity) {
    await pin(url, identity);
    // Opening a missing shared project uses the real first-materialization
    // path, including for an owner on a fresh device. No local file seeding.
    await requestJson(url, statusPath, { headers: headers(identity) });
    await expect.poll(async () => {
      const status = await requestJson<Status>(url, statusPath, { headers: headers(identity) });
      return status.awaitingFirstMaterialization;
    }, { timeout: 30_000 }).toBe(false);
    await expect.poll(() => read(url, identity), { timeout: 30_000 }).toEqual({ status: 200, content: v1 });
    return await requestJson<Status>(url, statusPath, { headers: headers(identity) });
  }
  try {
    await a.with.toolsDev(async ({ webUrl: aUrl }) => {
      await pin(aUrl, OWNER);
      await requestJson(aUrl, '/api/projects', { headers: headers(OWNER), body: { id, name: 'OPEND-3493 serial shared design', designSystemId: null, skillId: null, metadata: { kind: 'prototype' } } });
      await upload(aUrl, v1);
      await requestJson(aUrl, `/api/workspaces/${WORKSPACE}/projects/${id}/move`, { headers: headers(OWNER), body: { visibility: 'team' } });
      await hub.waitForCommand(entry => entry.args[0] === 'team-projects' && entry.args[1] === 'upsert' && entry.args[2] === id, 30_000);
      await b.with.toolsDev(async ({ webUrl: bUrl }) => {
        const bInitial = await seed(bUrl, OWNER);
        expect(bInitial.ownerMemberId).toBe(OWNER.memberId);
        // Actual bytes, not a status label, prove first materialization.
        await c.with.toolsDev(async ({ webUrl: cUrl }) => {
          await seed(cUrl, MEMBER);
          await expect.poll(async () => (await requestJson<Status>(cUrl, statusPath, { headers: headers(MEMBER) })).materializedVersion ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
          const initialVersion = Number((await requestJson<Status>(cUrl, statusPath, { headers: headers(MEMBER) })).materializedVersion);
          await expect.poll(() => hub.eventSubscriberCount(OWNER.memberId), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
          await expect.poll(() => hub.eventSubscriberCount(MEMBER.memberId), { timeout: 20_000 }).toBeGreaterThan(0);
          const checkpoint = hub.eventLog.length;
          await upload(aUrl, v2);
          await requestJson(aUrl, `/api/projects/${id}/collab/publish`, { headers: headers(OWNER), method: 'POST' });
          await expect.poll(() => hub.eventLog.slice(checkpoint).some(event => event.type === 'project-content-changed' && event.projectId === id && (event.version ?? 0) > initialVersion), { timeout: 30_000 }).toBe(true);
          // Control must actually receive v2 before judging the same-account B.
          await expect.poll(() => read(cUrl, MEMBER), { timeout: 30_000 }).toEqual({ status: 200, content: v2 });
          type Update = { state: string; latestVersion: number; localVersion: number; promptSuppressedUntil: number | null };
          const updatePath = `/api/projects/${id}/collab/update`;
          async function action(input: Record<string, unknown>) {
            return (await requestJson<{ update: Update }>(bUrl, updatePath, { headers: headers(OWNER), method: 'POST', body: input })).update;
          }
          // The event records an offer; neither SSE nor an unapproved pull may overwrite.
          await expect.poll(async () => (await requestJson<{ ownedContentUpdate: Update }>(bUrl, statusPath, { headers: headers(OWNER) })).ownedContentUpdate.state, { timeout: 20_000 }).toBe('confirmation_required');
          expect(await read(bUrl, OWNER)).toEqual({ status: 200, content: v1 });
          const unapproved = await fetch(new URL(`/api/projects/${id}/collab/pull`, bUrl), { method: 'POST', headers: headers(OWNER) });
          expect(unapproved.status).toBe(409);
          const denied = await fetch(new URL(updatePath, cUrl), { method: 'POST', headers: { ...headers(MEMBER), 'content-type': 'application/json' }, body: JSON.stringify({ action: 'accept', version: initialVersion }) });
          expect(denied.status).toBe(403);
          const offered = await action({ action: 'check', manual: true });
          expect(await action({ action: 'dismiss', version: offered.latestVersion })).toMatchObject({ state: 'ignored' });
          expect((await action({ action: 'check' })).state).toBe('ignored');
          const reoffered = await action({ action: 'check', manual: true });
          const checkpointCommands = hub.commandLog.length;
          const accepted = await action({ action: 'accept', version: reoffered.latestVersion, dontPromptFor24h: true });
          expect(accepted.state).toBe('up_to_date');
          expect(accepted.promptSuppressedUntil).toBeGreaterThan(Date.now());
          expect(await read(bUrl, OWNER)).toEqual({ status: 200, content: v2 });
          const history = await requestJson<{ versions: Array<{ id: string; source: string; current: boolean }> }>(bUrl, `/api/projects/${id}/files/index.html/versions`, { headers: headers(OWNER) });
          expect(history.versions.filter(v => v.source === 'sync').length).toBeGreaterThanOrEqual(2);
          const previous = history.versions.find(v => !v.current);
          expect(previous).toBeDefined();
          // Real child-process debounce cannot use this test process's fake clock.
          const observeUntil = Date.now() + 2_000;
          while (Date.now() < observeUntil) await requestJson(bUrl, statusPath, { headers: headers(OWNER) });
          const echoed = hub.commandLog.slice(checkpointCommands).filter(entry => entry.args[0] === 'resource' && entry.args[1] === 'push' && entry.args[4]?.startsWith(b.dataDir) === true);
          expect(echoed).toHaveLength(0);
          const v3 = '<!doctype html><html><body>B continues on this device</body></html>';
          const edits = hub.commandLog.length;
          await upload(bUrl, v3);
          await hub.waitForCommand(entry => hub.commandLog.indexOf(entry) >= edits && entry.args[0] === 'resource' && entry.args[1] === 'push' && entry.args[4]?.startsWith(b.dataDir) === true, 20_000);
          await expect.poll(() => read(cUrl, MEMBER), { timeout: 20_000 }).toEqual({ status: 200, content: v3 });
          await requestJson(bUrl, `/api/projects/${id}/files/index.html/versions/${previous!.id}/restore`, { method: 'POST', headers: headers(OWNER), body: {} });
          expect(await read(bUrl, OWNER)).toEqual({ status: 200, content: v1 });
          await expect.poll(() => read(cUrl, MEMBER), { timeout: 20_000 }).toEqual({ status: 200, content: v1 });
          await b.report.json('owner-device-update.json', { offered, accepted, echoPushes: echoed.length, laterEditPublished: true, htmlHistoryRestored: true });
        }, options(c, MEMBER));
      }, options(b, OWNER));
    }, options(a, OWNER));
  } finally { await hub.close(); }
});
