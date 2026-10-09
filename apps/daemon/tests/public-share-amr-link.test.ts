import Database from 'better-sqlite3';
import express from 'express';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createShareBindingStartup } from '../src/collab/share-binding-startup.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
import { publicFileResourceIdFor } from '../src/collab/public-file-resource-id.js';
import { parseAmrShareLink, resolvePublicShareLink, verifiedAmrShareViewerUrl } from '../src/collab/public-share-viewer-url.js';
import { parseProjectShareState } from '../src/collab/vela-project-share-state.js';
import { bindVelaShareVersion } from '../src/collab/vela-share-binding.js';
import { publishVelaShareVersion } from '../src/collab/vela-share-publish.js';
import type { runVelaCommand } from '../src/integrations/vela-command.js';
import { createPublicSharePublishingFixture, fixtureShareSlug, type FixtureAmrShareFields } from './public-share-publishing-fixture.js';

const slug = fixtureShareSlug;
const otherSlug = '93a3c7e6-198d-4b72-9f70-0bbfdf9f9c55';
const AMR_ORIGIN = 'https://share.example.test';
const amrUrl = (projectId: string, s: string) => `${AMR_ORIGIN}/artifact/${encodeURIComponent(projectId)}/${encodeURIComponent(s)}`;
/** AA5: an active binding carries AMR's canonical `url`. */
const amrReportsUrl: FixtureAmrShareFields = (projectId, s) => ({ url: amrUrl(projectId, s) });

// Parity cases copied from the shared URL table (AMR ↔ OD): the canonical
// address AMR prints for an identity, which the daemon must accept verbatim.
const parityValid: Array<{ projectId: string; url: string }> = [
  { projectId: 'project /中文', url: `https://viewer.example.test/artifact/project%20%2F%E4%B8%AD%E6%96%87/${slug}` },
  { projectId: 'p1', url: `https://viewer.example.test/artifact/p1/${slug}` },
  { projectId: 'p1', url: `https://open-design.app/artifact/p1/${slug}` },
  { projectId: "a&b=c:d@e!f'g(h)i*j~k", url: `https://viewer.example.test/artifact/a%26b%3Dc%3Ad%40e!f'g(h)i*j~k/${slug}` },
  { projectId: 'p1', url: `https://viewer.example.test:8443/artifact/p1/${slug}` },
  { projectId: 'p1', url: `https://[::1]:8443/artifact/p1/${slug}` },
  { projectId: 'p1', url: `https://viewer.example.test./artifact/p1/${slug}` },
];

describe('AMR share link verification', () => {
  it.each(parityValid)('accepts the canonical address for $projectId', ({ projectId, url }) => {
    expect(verifiedAmrShareViewerUrl(url, projectId, slug)).toBe(url);
  });

  it.each([
    ['plain http', `http://viewer.example.test/artifact/p1/${slug}`],
    ['userinfo', `https://user:pw@viewer.example.test/artifact/p1/${slug}`],
    ['empty userinfo', `https://@viewer.example.test/artifact/p1/${slug}`],
    ['query', `https://viewer.example.test/artifact/p1/${slug}?x=1`],
    ['empty query', `https://viewer.example.test/artifact/p1/${slug}?`],
    ['fragment', `https://viewer.example.test/artifact/p1/${slug}#c`],
    ['base path', `https://viewer.example.test/app/artifact/p1/${slug}`],
    ['legacy console path', `https://console.example.test/cloud/artifact/p1/${slug}`],
    ['trailing segment', `https://viewer.example.test/artifact/p1/${slug}/extra`],
    ['trailing slash', `https://viewer.example.test/artifact/p1/${slug}/`],
    ['other project', `https://viewer.example.test/artifact/p2/${slug}`],
    ['other slug', `https://viewer.example.test/artifact/p1/${otherSlug}`],
    ['non-canonical host case', `https://Viewer.Example.test/artifact/p1/${slug}`],
    ['explicit default port', `https://viewer.example.test:443/artifact/p1/${slug}`],
    ['padded', ` https://viewer.example.test/artifact/p1/${slug}`],
    ['backslash', `https://viewer.example.test\\artifact/p1/${slug}`],
    ['dot segments', `https://viewer.example.test/artifact/x/../p1/${slug}`],
    ['origin only', 'https://viewer.example.test'],
    ['not a string', 42],
  ])('rejects %s', (_name, url) => {
    expect(verifiedAmrShareViewerUrl(url, 'p1', slug)).toBeNull();
  });

  it('never forms an address for a non-stable alias or dot-segment project', () => {
    expect(verifiedAmrShareViewerUrl(`https://viewer.example.test/artifact/p1/legacy-snapshot`, 'p1', 'legacy-snapshot')).toBeNull();
    expect(verifiedAmrShareViewerUrl(`https://viewer.example.test/${slug}`, '..', slug)).toBeNull();
  });

  it('reads url, passes an unavailable code through, and logs a rejected url without echoing it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parseAmrShareLink({ url: amrUrl('p', slug) }, 'p', slug)).toEqual({ url: amrUrl('p', slug) });
      expect(parseAmrShareLink({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_IDENTITY_INVALID' } }, 'p', slug))
        .toEqual({ code: 'PUBLIC_SHARE_IDENTITY_INVALID' });
      expect(parseAmrShareLink({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } }, 'p', slug))
        .toEqual({ code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
      expect(parseAmrShareLink({ link: { status: 'unavailable', code: 'SOMETHING_NEW' } }, 'p', slug))
        .toEqual({ code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
      expect(parseAmrShareLink({ status: 'stopped' }, 'p', slug)).toBeNull();
      expect(parseAmrShareLink({ url: null, link: { status: 'unavailable', code: 'PUBLIC_SHARE_IDENTITY_INVALID' } }, 'p', slug))
        .toEqual({ code: 'PUBLIC_SHARE_IDENTITY_INVALID' });
      expect(warn).not.toHaveBeenCalled();
      const evil = `https://evil.example.test/artifact/other/${slug}`;
      expect(parseAmrShareLink({ url: evil }, 'p', slug)).toEqual({ code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('evil');
    } finally { warn.mockRestore(); }
  });
});

describe('share link source priority', () => {
  const amr = { url: amrUrl('p', slug) };
  it('uses the AMR address when no override is set', () => {
    expect(resolvePublicShareLink('p', slug, amr, {})).toEqual(amr);
  });
  it('lets an explicit env override win over AMR', () => {
    expect(resolvePublicShareLink('p', slug, amr, { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' }))
      .toEqual({ url: `https://viewer.example.test/artifact/p/${slug}` });
    expect(resolvePublicShareLink('p', slug, amr, { OPEN_DESIGN_AMR_PROFILE: 'test', OD_SHARE_VIEWER_URLS: JSON.stringify({ test: 'https://viewer.example.test' }) }))
      .toEqual({ url: `https://viewer.example.test/artifact/p/${slug}` });
  });
  it('treats a present invalid override as unavailable, never falling back to AMR', () => {
    expect(resolvePublicShareLink('p', slug, amr, { OD_SHARE_VIEWER_URL: 'http://viewer.example.test' }))
      .toEqual({ url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
  });
  it('defers to AMR when the override does not name the selected profile', () => {
    expect(resolvePublicShareLink('p', slug, amr, { OPEN_DESIGN_AMR_PROFILE: 'prod', OD_SHARE_VIEWER_URL: 'https://viewer.example.test' }, { OPEN_DESIGN_AMR_PROFILE: 'test' }))
      .toEqual(amr);
    expect(resolvePublicShareLink('p', slug, amr, { OD_SHARE_VIEWER_URL: '  ' })).toEqual(amr);
  });
  it('passes AMR unavailable codes through and re-verifies a persisted address', () => {
    expect(resolvePublicShareLink('p', slug, { code: 'PUBLIC_SHARE_IDENTITY_INVALID' }, {}))
      .toEqual({ url: null, code: 'PUBLIC_SHARE_IDENTITY_INVALID' });
    expect(resolvePublicShareLink('p', slug, null, {})).toEqual({ url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
    expect(resolvePublicShareLink('p', slug, amrUrl('p', slug), {})).toEqual(amr);
    expect(resolvePublicShareLink('p', slug, `https://console.example.test/cloud/artifact/p/${slug}`, {}))
      .toEqual({ url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
    expect(resolvePublicShareLink('p', slug, amrUrl('other', slug), {}))
      .toEqual({ url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
  });
  it('reports an invalid identity before any source', () => {
    expect(resolvePublicShareLink('p', 'legacy-snapshot', { url: 'x' }, { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' }))
      .toEqual({ url: null, code: 'PUBLIC_SHARE_IDENTITY_INVALID' });
  });
});

describe('vela CLI outputs carry the AMR link', () => {
  it('publish keeps the verified url of a bound share', async () => {
    const run = vi.fn<typeof runVelaCommand>().mockResolvedValue(JSON.stringify({
      status: 'published', slug, version: 1, publishedAt: 1, entryPath: 'index.html', snapshot: { versionId: 'v1' },
      receipt: { slug, versionId: 'v1', version: 1, publishedAt: 1, entryPath: 'index.html' }, url: amrUrl('p', slug),
    }));
    const result = await publishVelaShareVersion({ filePath: 'index.html', workspaceId: 'w', projectId: 'p', resourceId: 'r', slug,
      sourceKey: 'k', entryPath: 'index.html', name: 'index.html', versionId: 'v1' }, run);
    expect(result).toMatchObject({ status: 'published', amrLink: { url: amrUrl('p', slug) } });
  });
  it('bind returns the url or the unavailable code', async () => {
    const input = { sourceFilePath: 'index.html', workspaceId: 'w', projectId: 'p', resourceId: 'r', slug, version: 1, versionId: 'v1' };
    const receipt = { status: 'active', projectId: 'p', slug, verifiedVersion: 1, verifiedVersionId: 'v1' };
    await expect(bindVelaShareVersion(input, async () => JSON.stringify({ ...receipt, url: amrUrl('p', slug) }))).resolves.toEqual({ url: amrUrl('p', slug) });
    await expect(bindVelaShareVersion(input, async () => JSON.stringify({ ...receipt, link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } })))
      .resolves.toEqual({ code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' });
  });
  it('project-status reads a link for active publications only', () => {
    const state = parseProjectShareState(JSON.stringify({ projectId: 'p', bindingExists: true, publications: [
      { sourceFilePath: 'a.html', slug, status: 'active', url: amrUrl('p', slug) },
      { sourceFilePath: 'b.html', slug: otherSlug, status: 'stopped' },
    ] }), 'p');
    expect(state.publications).toEqual([
      { sourceFilePath: 'a.html', slug, status: 'active', amrLink: { url: amrUrl('p', slug) } },
      { sourceFilePath: 'b.html', slug: otherSlug, status: 'stopped' },
    ]);
  });
});

const context: WorkspaceCollabContext = {
  workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const scope = { resourceTeamId: 'w', ownerMemberId: 'owner', projectId: 'p', filePath: 'index.html' };
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

async function startShareDaemon(options: { env?: NodeJS.ProcessEnv; amr?: FixtureAmrShareFields; pending?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'od-amr-link-'));
  await writeFile(join(root, 'index.html'), '<h1>Shared</h1>');
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  const state = { offline: false, amr: options.amr };
  const fixture = createPublicSharePublishingFixture(db, store, async () => JSON.stringify({ id: 'version-1', version: 1 }), undefined, {
    env: options.env ?? {}, amr: (projectId, s) => state.amr?.(projectId, s) ?? {}, failShareState: () => state.offline,
    ...(options.pending ? { pending: true } : {}),
  });
  const app = express(); app.use(express.json());
  registerCollabSyncRoutes(app, { collab: runtime, publicFilePublicationStore: store, ...fixture,
    verifyWorkspaceRequest: async () => context,
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => root,
  });
  const server: Server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
  const base = `http://127.0.0.1:${address.port}`;
  const url = `${base}/api/projects/p/files/index.html/publish-public`;
  cleanups.push(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); db.close(); await rm(root, { recursive: true, force: true });
  });
  const json = async (init?: RequestInit) => {
    const response = await fetch(url, init);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { db, store, state, base, fixture, publish: () => json({ method: 'POST' }), read: () => json() };
}

/** Publish is atomic now (a CLI answering binding_pending is refused), so a
 * pending binding is one left by an earlier two-step publish: a publication row
 * without a link plus its queued binding. */
function seedPendingBinding(daemon: Awaited<ReturnType<typeof startShareDaemon>>) {
  const receipt = { filePath: scope.filePath, slug, version: 1, versionId: 'version-1', publishedAt: 1, entryPath: 'index.html' };
  daemon.store.set(scope, { url: null, slug, fileName: scope.filePath });
  createShareBindingOutbox(daemon.db).enqueue({ ...scope, resourceId: publicFileResourceIdFor(scope),
    publicationRevision: daemon.store.getRevision(scope)!.token, receipt });
}

describe('publish-public takes its link from AMR', () => {
  it('publish shows and persists the AMR url; GET returns it', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    const published = await daemon.publish();
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: 'published', url: amrUrl('p', slug) });
    expect(published.body).not.toHaveProperty('link');
    expect(daemon.store.get(scope)?.url).toBe(amrUrl('p', slug));
    expect((await daemon.read()).body).toMatchObject({ publication: { url: amrUrl('p', slug), slug }, status: 'active' });
  });

  it('an explicit env override wins over AMR on every surface, without replacing the persisted AMR url', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl, env: { OD_SHARE_VIEWER_URL: 'https://viewer.example.test' } });
    const override = `https://viewer.example.test/artifact/p/${slug}`;
    expect((await daemon.publish()).body).toMatchObject({ status: 'published', url: override });
    expect((await daemon.read()).body).toMatchObject({ publication: { url: override } });
    expect(daemon.store.get(scope)?.url).toBe(amrUrl('p', slug));
  });

  it.each([
    ['other host shape', (projectId: string, s: string) => ({ url: `http://share.example.test/artifact/${projectId}/${s}` })],
    ['console path', (projectId: string, s: string) => ({ url: `${AMR_ORIGIN}/cloud/artifact/${projectId}/${s}` })],
    ['other project', (_projectId: string, s: string) => ({ url: amrUrl('someone-else', s) })],
    ['other slug', (projectId: string) => ({ url: amrUrl(projectId, otherSlug) })],
    ['query', (projectId: string, s: string) => ({ url: `${amrUrl(projectId, s)}?next=/x` })],
  ])('an invalid AMR url (%s) is unavailable and never shown or stored', async (_name, amr) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanups.push(() => warn.mockRestore());
    const daemon = await startShareDaemon({ amr });
    const published = await daemon.publish();
    expect(published.body).toMatchObject({ status: 'published', link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } });
    expect(published.body).not.toHaveProperty('url');
    expect(daemon.store.get(scope)?.url).toBeNull();
    const read = await daemon.read();
    expect(read.body).toMatchObject({ publication: null, slug, link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } });
    expect(JSON.stringify(read.body)).not.toContain('someone-else');
    expect(warn).toHaveBeenCalled();
  });

  it('passes an AMR unavailable code through on publish and read', async () => {
    const daemon = await startShareDaemon({ amr: () => ({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } }) });
    expect((await daemon.publish()).body).toMatchObject({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } });
    daemon.state.amr = () => ({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_IDENTITY_INVALID' } });
    expect((await daemon.read()).body).toMatchObject({ publication: null, slug, link: { status: 'unavailable', code: 'PUBLIC_SHARE_IDENTITY_INVALID' } });
  });

  it('shows the persisted link while AMR cannot be reached, marked stale', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    await daemon.publish();
    daemon.state.offline = true;
    const offline = await daemon.read();
    expect(offline.status).toBe(200);
    expect(offline.body).toMatchObject({ publication: { url: amrUrl('p', slug), slug }, status: 'active', stale: true });
    // A queued stop for this alias is never offered as a live link.
    (daemon.store as unknown as { enqueueStop(key: typeof scope & { slug: string }): void }).enqueueStop({ ...scope, slug });
    expect((await daemon.read()).status).toBe(503);
    // Nothing persisted: a failed read with no local record stays a failure.
    daemon.store.delete(scope);
    expect((await daemon.read()).status).toBe(503);
  });

  it('never shows a legacy stored console url, and the next online status read replaces it', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    await daemon.publish();
    const legacy = `https://console.example.test/cloud/artifact/p/${slug}`;
    const revision = daemon.store.getRevision(scope);
    expect(daemon.store.updateLink(scope, slug, legacy)).toBe(true);
    daemon.state.offline = true;
    const offline = await daemon.read();
    expect(offline.body).toMatchObject({ publication: null, slug, link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' }, stale: true });
    expect(JSON.stringify(offline.body)).not.toContain('console.example.test');
    daemon.state.offline = false;
    expect((await daemon.read()).body).toMatchObject({ publication: { url: amrUrl('p', slug) }, status: 'active' });
    expect(daemon.store.get(scope)?.url).toBe(amrUrl('p', slug));
    // A presentation refresh, not a new publication: the witness is unchanged.
    expect(daemon.store.getRevision(scope)).toEqual(revision);
  });

  it('a status read picks up a changed AMR origin and a later unavailable answer', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    await daemon.publish();
    const moved = `https://moved.example.test/artifact/p/${slug}`;
    daemon.state.amr = () => ({ url: moved });
    expect((await daemon.read()).body).toMatchObject({ publication: { url: moved } });
    expect(daemon.store.get(scope)?.url).toBe(moved);
    daemon.state.amr = () => ({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } });
    expect((await daemon.read()).body).toMatchObject({ publication: null, link: { status: 'unavailable' } });
    expect(daemon.store.get(scope)?.url).toBeNull();
  });

  it('a pending binding gets its link from the bind that completes it, in the foreground', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    seedPendingBinding(daemon);
    expect(daemon.store.get(scope)?.url).toBeNull();
    // Foreground explicit retry: `vela share bind` returns the url.
    expect((await daemon.publish()).body).toMatchObject({ status: 'published', url: amrUrl('p', slug) });
    expect(daemon.store.get(scope)?.url).toBe(amrUrl('p', slug));
  });

  it('the background binding retry persists the address AMR returns', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    seedPendingBinding(daemon);
    const outbox = createShareBindingOutbox(daemon.db);
    const run = daemon.fixture.sharePublishing!.prepare;
    const startup = createShareBindingStartup(outbox, {
      publications: daemon.store, mutations: createPublicFileMutations(),
      prepare: async task => {
        const prepared = await run({ ...scope, filePath: task.receipt.filePath }, task.receipt.slug);
        return { resourceTeamId: task.resourceTeamId, ownerMemberId: task.ownerMemberId,
          bind: () => bindVelaShareVersion({ workspaceId: task.resourceTeamId, projectId: task.projectId, resourceId: task.resourceId,
            sourceFilePath: task.receipt.filePath, slug: task.receipt.slug, version: task.receipt.version, versionId: task.receipt.versionId }, prepared.run) };
      },
    });
    expect(await startup()).toMatchObject({ bound: 1 });
    expect(daemon.store.get(scope)?.url).toBe(amrUrl('p', slug));
  });
});

const execFileP = promisify(execFile);
const DAEMON_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_CLI = pathResolve(DAEMON_ROOT, '../../node_modules/tsx/dist/cli.mjs');
async function runCli(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, pathResolve(DAEMON_ROOT, 'src/cli.ts'), ...args], { cwd: DAEMON_ROOT, env, timeout: 30_000 });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
  }
}

describe('od project share shows the same link as the UI read', () => {
  it('get --json equals the HTTP body; human output prints the same link, and stale offline', async () => {
    const daemon = await startShareDaemon({ amr: amrReportsUrl });
    await daemon.publish();
    const args = ['project', 'share', 'get', 'p', '--path', 'index.html', '--daemon-url', daemon.base];
    const http = (await daemon.read()).body;
    const json = await runCli([...args, '--json']);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual(http);
    const human = await runCli(args);
    expect(human.stdout.trim()).toBe(amrUrl('p', slug));
    expect(human.stderr).toBe('');
    daemon.state.offline = true;
    const offline = await runCli(args);
    expect(offline.stdout.trim()).toBe(amrUrl('p', slug));
    expect(offline.stderr).toContain('last known link');
    daemon.state.offline = false;
    daemon.state.amr = () => ({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_IDENTITY_INVALID' } });
    const unavailable = await runCli(args);
    expect(unavailable.stdout.trim()).toBe(`Published; link unavailable for this alias (slug ${slug}).`);
    expect(JSON.parse((await runCli([...args, '--json'])).stdout)).toMatchObject({ link: { code: 'PUBLIC_SHARE_IDENTITY_INVALID' } });
  }, 60_000);
});
