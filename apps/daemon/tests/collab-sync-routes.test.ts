import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
import { createSharePublicationCompletion } from '../src/collab/share-publication-completion.js';
import { publicShareViewerUrl } from '../src/collab/public-share-viewer-url.js';
import { createShareContentFingerprints } from '../src/collab/share-content-fingerprint.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { publishReservedVelaShareVersion } from '../src/collab/vela-share-publish.js';
import { createPublicFilePublicationRecorder } from '../src/collab/public-file-publication-recording.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import http from 'node:http';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { runVelaResourceCommand } from '../src/collab/vela-cli-resource-adapter.js';
import {
  createCollabRuntime,
  type CollabRuntime,
  type CreateCollabRuntimeOptions,
} from '../src/collab/runtime.js';
import { contextToResourceHubPrincipal } from '../src/collab/resource-principal.js';
import type { WorkspaceContextProvider } from '../src/collab/workspace-context.js';
import {
  createProactiveContentPull,
  type ProactiveContentPullTarget,
  type ProactivePullAuthorizationWitness,
} from '../src/collab/proactive-content-pull.js';
import { createProjectContentTransferStateStore } from '../src/collab/project-content-transfer-state.js';
import { createSwrCache } from '../src/collab/swr-cache.js';
import { resolveAuthorizedActiveTeamWorkspaceSnapshot } from '../src/collab/active-workspace-selection.js';
import { verifyWorkspaceRequestContext } from '../src/collab/request-workspace-context.js';
import { createCachedWorkspaceDirectoryFetcher } from '../src/collab/vela-workspace-context.js';
import {
  promoteAuthorizedTeamProjectStage,
  type PromoteAuthorizedTeamProjectStageInput,
} from '../src/collab/team-mirror-promotion.js';
import {
  getTeamProjectMaterialization,
  materializePulledTeamMirror,
} from '../src/collab/team-mirror-materializer.js';
import { SHARED_PROJECT_PLACEHOLDER_METADATA_KEY } from '../src/collab/shared-project-placeholder.js';
import { withLastKnownWorkspaceContext } from '../src/collab/workspace-context.js';
import { closeDatabase, getProject, openDatabase } from '../src/db.js';
import { readVelaControlApiContext } from '../src/integrations/vela.js';
import { projectResourceIdFor } from '../src/integrations/vela-team-projects.js';
import {
  registerCollabSyncRoutes,
  type CollabSyncRoutesHandle,
  type PulledProjectStore,
  type RegisterCollabSyncRoutesDeps,
  type RegisterPulledProjectInput,
  type TeamMirrorPullScope,
} from '../src/routes/collab-sync.js';
import { writeProjectManifest } from '../src/project-locations.js';
import type { AuthorizedTeamProjectPullReceipt } from '../src/collab/authorized-team-project-pull.js';

vi.mock('../src/collab/vela-cli-resource-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/collab/vela-cli-resource-adapter.js')>();
  return {
    ...actual,
    runVelaResourceCommand: vi.fn(),
  };
});

vi.mock('../src/integrations/vela.js', () => ({
  readVelaControlApiContext: vi.fn(() => null),
}));

vi.mock('../src/collab/vela-share-publish.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/collab/vela-share-publish.js')>(),
  publishReservedVelaShareVersion: vi.fn(),
}));

/** In-memory project store standing in for the daemon's SQLite-backed store, so
 *  a route test can assert register-on-pull without a real database. */
function fakeProjectStore(): PulledProjectStore & {
  projects: Map<string, RegisterPulledProjectInput>;
  bindings: Map<string, TeamMirrorPullScope>;
  registerCalls: number;
} {
  const projects = new Map<string, RegisterPulledProjectInput>();
  const bindings = new Map<string, TeamMirrorPullScope>();
  const store = {
    projects,
    bindings,
    registerCalls: 0,
    get: (projectId: string) => projects.get(projectId) ?? null,
    has: (projectId: string) => projects.has(projectId),
    register(input: RegisterPulledProjectInput) {
      store.registerCalls += 1;
      projects.set(input.id, input);
    },
    update(input: RegisterPulledProjectInput) {
      projects.set(input.id, input);
    },
    materializeTeamMirror(input: RegisterPulledProjectInput, scope: TeamMirrorPullScope) {
      const existing = projects.get(input.id);
      const localRecordChanged = !existing || existing.name === '共享项目';
      if (localRecordChanged) projects.set(input.id, input);
      bindings.set(input.id, scope);
      return { localRecordChanged };
    },
    materializeAuthorizedTeamMirror(
      input: RegisterPulledProjectInput,
      scope: TeamMirrorPullScope,
      _receipt: AuthorizedTeamProjectPullReceipt,
    ) {
      return store.materializeTeamMirror(input, scope);
    },
  };
  return store;
}

/** A personal (non-team) workspace context — the default a fresh account lands
 *  on. Non-null and fully populated, but with no `teamId`: the resource hub is
 *  addressed by its `workspaceId` instead, as a partition of one. */
function personalContextProvider(): WorkspaceContextProvider {
  const context: WorkspaceCollabContext = {
    workspaceId: 'ws-personal-1',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-personal-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  return { current: async () => context };
}

/** A fixed team context whose `canShareProjects` bit is forced to the tested
 *  value, served by a minimal provider (no `set` seam). */
function fixedShareContextProvider(canShareProjects: boolean): WorkspaceContextProvider {
  const context: WorkspaceCollabContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    teamId: 'team-1',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: {
      ...buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
      canShareProjects,
    },
  };
  return { current: async () => context };
}

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    teamId: workspaceId,
    workspaceMemberId,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({
      role: 'owner',
      lifecycleState: 'active',
    }),
  };
}

async function mintProactivePullWitness(
  projectId: string,
  scope: TeamMirrorPullScope,
  version: number,
): Promise<ProactivePullAuthorizationWitness> {
  return (await mintProactivePullTarget(projectId, scope, version))
    .authorizationWitness!;
}

async function mintProactivePullTarget(
  projectId: string,
  scope: TeamMirrorPullScope,
  version: number,
): Promise<ProactiveContentPullTarget> {
  const targets: ProactiveContentPullTarget[] = [];
  const pull = createProactiveContentPull({
    getLocalBinding: () => ({
      workspaceId: scope.workspaceId,
      visibility: 'team',
    }),
    getWorkspaceIdentity: async () => ({
      workspaceId: scope.workspaceId,
      resourceTeamId: scope.resourceTeamId,
      workspaceMemberId: scope.viewerMemberId,
    }),
    resolveSharedProjectOwner: async () => scope.ownerMemberId,
    pullSharedProject: async (input) => {
      targets.push(input);
      return { status: 'pulled', version };
    },
  });
  try {
    await pull.handleContentChanged({
      projectId,
      workspaceId: scope.workspaceId,
      version,
    });
  } finally {
    pull.dispose();
  }
  const target = targets[0];
  if (!target?.authorizationWitness) {
    throw new Error('expected proactive guard to issue a witness');
  }
  return target;
}

async function invokeThroughProactivePull(
  handle: CollabSyncRoutesHandle,
  projectId: string,
  scope: TeamMirrorPullScope,
  version: number,
  profileReceivedAtMs?: number,
) {
  let outcome: Awaited<ReturnType<CollabSyncRoutesHandle['pullSharedProject']>>
    | undefined;
  const pull = createProactiveContentPull({
    getLocalBinding: () => ({
      workspaceId: scope.workspaceId,
      visibility: 'team',
    }),
    getWorkspaceIdentity: async () => ({
      workspaceId: scope.workspaceId,
      resourceTeamId: scope.resourceTeamId,
      workspaceMemberId: scope.viewerMemberId,
    }),
    resolveSharedProjectOwner: async () => scope.ownerMemberId,
    pullSharedProject: async (target, expectedVersion) => {
      outcome = await handle.pullSharedProject(
        target.projectId,
        scope,
        target.authorizationWitness,
        expectedVersion,
        target.authorizedStageInvocation,
      );
      return outcome;
    },
  });
  await pull.handleContentChanged({
    projectId,
    workspaceId: scope.workspaceId,
    version,
    ...(profileReceivedAtMs != null ? { profileReceivedAtMs } : {}),
  });
  if (!outcome) throw new Error('proactive pull did not invoke the route handle');
  return outcome;
}

let server: http.Server | null = null;
let runtime: CollabRuntime | null = null;
const tempDirs: string[] = [];
const publicationDatabases: Database.Database[] = [];
const fixtureSlug = '93a3c7e6-198d-4b72-9f70-0bbfdf9f9c55';

function publicationBarrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function confirmedShareOutput(args: string[], fault?: 'wrong-version' | 'missing-version') {
  const versionId = fault === 'missing-version' ? undefined : fault === 'wrong-version' ? 'wrong-upload' : args[args.indexOf('--version-id') + 1];
  const receipt = { slug: args[args.indexOf('--slug') + 1], versionId, version: 1, publishedAt: 1234,
    entryPath: args[args.indexOf('--entry-path') + 1] };
  return JSON.stringify({ status: 'published', ...receipt, receipt, snapshot: { versionId } });
}

/** Real reservation/receipt validation/completion, with only the CLI transport synthetic. */
async function publicShareFixture(options: {
  db?: Database.Database;
  enqueue?: Parameters<typeof createPublicFilePublicationRecorder>[2];
  run?: (args: string[]) => Promise<string>;
} = {}) {
  const actual = await vi.importActual<typeof import('../src/collab/vela-share-publish.js')>('../src/collab/vela-share-publish.js');
  vi.mocked(publishReservedVelaShareVersion).mockImplementation(actual.publishReservedVelaShareVersion);
  const db = options.db ?? new Database(':memory:');
  if (!options.db) publicationDatabases.push(db);
  migratePublicFilePublications(db);
  migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const outbox = createShareBindingOutbox(db);
  const record = createPublicFilePublicationRecorder(db, store, options.enqueue ?? (() => ({ enqueued: 0, skippedInbound: 0 })));
  let ids = 0;
  const sharePublishing: NonNullable<RegisterCollabSyncRoutesDeps['sharePublishing']> = {
    reservations: createShareAliasReservations(db, () => ids++ === 0 ? fixtureSlug : randomUUID()),
    outbox,
    complete: createSharePublicationCompletion(db, record, outbox, true),
    ensureProject: async scope => ({ projectId: scope.projectId, ownerMemberId: scope.ownerMemberId, sharedAt: null }),
    prepare: async (scope, slug) => ({
      url: publicShareViewerUrl(scope.projectId, slug, { OD_VELA_WEB_URL: 'https://web.example.test' }),
      run: async args => {
        if (options.run) return options.run(args);
        if (args[0] === 'resource') return runVelaResourceCommand(args.slice(1), scope.resourceTeamId);
        if (args[0] !== 'share') throw new Error('unexpected command');
        if (args[1] === 'stop') return JSON.stringify({ status: 'stopped', slug, projectId: scope.projectId });
        if (args[1] !== 'publish') throw new Error('unexpected share command');
        return confirmedShareOutput(args);
      },
    }),
    retry: vi.fn(),
  };
  const readProjectShareState = vi.fn(async (scope: { projectId: string }) => ({ projectId: scope.projectId, bindingExists: true, hasEverShared: true,
    publications: [{ sourceFilePath: 'index.html', slug: fixtureSlug, status: 'active' as const }, { sourceFilePath: 'pages/local.html', slug: fixtureSlug, status: 'active' as const }] }));
  return { publicFilePublicationStore: store, sharePublishing, readProjectShareState };
}


afterEach(async () => {
  vi.mocked(runVelaResourceCommand).mockReset();
  vi.mocked(publishReservedVelaShareVersion).mockReset();
  vi.mocked(readVelaControlApiContext).mockReturnValue(null);
  runtime?.dispose(); // cancel any pending debounce timers
  runtime = null;
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  while (publicationDatabases.length) publicationDatabases.pop()!.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function startSyncServer(
  workspaceContext?: WorkspaceContextProvider,
  extraDeps?: Omit<RegisterCollabSyncRoutesDeps, 'collab'>,
  runtimeOptions?: Omit<CreateCollabRuntimeOptions, 'workspaceContext'>,
) {
  const app = express();
  app.use(express.json());
  const effectiveWorkspaceContext =
    workspaceContext ?? fixedShareContextProvider(true);
  // Freeze the test authority once, mirroring an authoritative directory
  // fixture. Route verification must never follow later ambient Workspace
  // changes from the runtime provider.
  const authoritativeContext =
    await effectiveWorkspaceContext.current({});
  runtime = createCollabRuntime({
    ...(runtimeOptions ?? {}),
    workspaceContext: effectiveWorkspaceContext,
  });
  const verifyWorkspaceRequest = async (req: express.Request) => {
    if (
      !authoritativeContext
      || req.get('x-od-workspace-id') !== authoritativeContext.workspaceId
      || req.get('x-od-workspace-member-id')
        !== authoritativeContext.workspaceMemberId
    ) {
      return null;
    }
    return authoritativeContext;
  };
  const verifyWorkspaceScope = async (scope: TeamMirrorPullScope) => {
    return Boolean(
      authoritativeContext
      && authoritativeContext.workspaceType === 'team'
      && authoritativeContext.memberStatus === 'active'
      && authoritativeContext.lifecycleState === 'active'
      && authoritativeContext.workspaceId === scope.workspaceId
      && (authoritativeContext.teamId ?? authoritativeContext.workspaceId)
        === scope.resourceTeamId
      && authoritativeContext.workspaceMemberId === scope.viewerMemberId,
    );
  };
  const defaultResolveSharedProject = async (
    projectId: string,
    scope?: TeamMirrorPullScope | null,
  ) => {
    const ownerMemberId =
      scope?.ownerMemberId || authoritativeContext?.workspaceMemberId || '';
    return ownerMemberId
      ? {
          projectId,
          ownerMemberId,
          sharedAt: '2026-07-30T00:00:00.000Z',
        }
      : null;
  };
  const defaultResolveSharedProjectOwner = async (
    projectId: string,
    scope?: { workspaceId: string; workspaceMemberId: string },
  ) => {
    if (
      !authoritativeContext
      || authoritativeContext.workspaceType !== 'team'
      || !scope
      || scope.workspaceId !== authoritativeContext.workspaceId
      || scope.workspaceMemberId !== authoritativeContext.workspaceMemberId
    ) {
      return null;
    }
    return runtime!.projectOwnerMemberId(projectId, {
      teamId:
        authoritativeContext.teamId ?? authoritativeContext.workspaceId,
      memberId: authoritativeContext.workspaceMemberId,
      role: authoritativeContext.role,
      lifecycleState: authoritativeContext.lifecycleState,
    });
  };
  const handle: CollabSyncRoutesHandle = registerCollabSyncRoutes(app, {
    collab: runtime,
    readProjectShareState: async scope => ({ projectId: scope.projectId, bindingExists: false, hasEverShared: false, publications: [] }),
    verifyWorkspaceRequest,
    verifyWorkspaceScope,
    // Local fixture ownership is pinned to the verified directory, not request headers.
    resolveLocalPublicShareOwner: (_projectId, workspaceId) => workspaceId === authoritativeContext?.workspaceId
      ? authoritativeContext.workspaceMemberId : null,
    resolveSharedProject: defaultResolveSharedProject,
    resolveSharedProjectOwner: defaultResolveSharedProjectOwner,
    ...(extraDeps?.resolveSharedProject && !extraDeps.resolveSharedProjectOwner
      ? {
          resolveSharedProjectOwner: async (
            projectId: string,
            scope?: { workspaceId: string; workspaceMemberId: string },
          ) =>
            (await extraDeps.resolveSharedProject?.(
              projectId,
              scope
                ? {
                    workspaceId: scope.workspaceId,
                    resourceTeamId: scope.workspaceId,
                    viewerMemberId: scope.workspaceMemberId,
                    ownerMemberId: '',
                  }
                : null,
            ))?.ownerMemberId ?? null,
        }
      : {}),
    ...extraDeps,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    handle,
    async json(
      route: string,
      options: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
        workspaceScope?: WorkspaceCollabContext | false;
      } = {},
    ) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      const workspaceScope =
        options.workspaceScope === false
          ? null
          : options.workspaceScope ?? authoritativeContext;
      const requestHeaders: Record<string, string> = {
        ...(workspaceScope
          ? {
              'x-od-workspace-id': workspaceScope.workspaceId,
              'x-od-workspace-member-id': workspaceScope.workspaceMemberId,
            }
          : {}),
        ...(options.headers ?? {}),
      };
      if (options.body !== undefined) {
        init.headers = { 'content-type': 'application/json', ...requestHeaders };
        init.body = JSON.stringify(options.body);
      } else if (Object.keys(requestHeaders).length > 0) {
        init.headers = requestHeaders;
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
    // Publishing is async (flush → adapter → onPublished); poll until it lands.
    async awaitPublishedVersion(route: string, notEqualTo: number | null): Promise<number | null> {
      let version = notEqualTo;
      for (let i = 0; i < 40 && version === notEqualTo; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        version = (await this.json(route)).body.publishedVersion;
      }
      return version;
    },
  };
}

describe('collab sync routes', () => {
  it('keeps publish callbacks scoped to every workspace sharing the same project', async () => {
    const onPublished = vi.fn();
    const publish = vi.fn(async (input: { principal?: { memberId?: string } }) => ({
      version: input.principal?.memberId === 'member-a' ? 11 : 22,
    }));
    runtime = createCollabRuntime({
      adapter: { publish },
      onPublished,
    });
    const projectId = 'shared-project';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (let i = 0; i < 40 && (publish.mock.calls.length < 2 || onPublished.mock.calls.length < 2); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((publish.mock.calls as unknown as Array<[Record<string, unknown>]>).map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId, principal: workspaceA }),
        expect.objectContaining({ projectId, principal: workspaceB }),
      ]),
    );
    expect(onPublished.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.publishedVersion(projectId, workspaceA)).toBe(11);
    expect(runtime.publishedVersion(projectId, workspaceB)).toBe(22);
    expect(runtime.projectOwnerMemberId(projectId, workspaceA)).toBe('member-a');
    expect(runtime.projectOwnerMemberId(projectId, workspaceB)).toBe('member-b');

    publish.mockClear();
    onPublished.mockClear();
    runtime.scheduler.notifyChanged(projectId, 'save');
    runtime.scheduler.runBoundary(projectId);

    for (
      let i = 0;
      i < 40 &&
      (publish.mock.calls.length < 2 ||
        runtime.publishedVersion(projectId, workspaceA) === null ||
        runtime.publishedVersion(projectId, workspaceB) === null);
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((publish.mock.calls as unknown as Array<[Record<string, unknown>]>).map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId, reason: 'save', principal: workspaceA }),
        expect.objectContaining({ projectId, reason: 'save', principal: workspaceB }),
      ]),
    );
    expect(onPublished.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.publishedVersion(projectId, workspaceA)).toBe(11);
    expect(runtime.publishedVersion(projectId, workspaceB)).toBe(22);
  });

  it('unshares only the requested workspace and keeps other workspace state live', async () => {
    const publish = vi.fn(async (input: { principal?: { memberId?: string } }) => ({
      version: input.principal?.memberId === 'member-a' ? 11 : 22,
    }));
    const unpublish = vi.fn(async () => undefined);
    const teamProjectCatalog = {
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    runtime = createCollabRuntime({
      adapter: { publish, unpublish },
      teamProjectCatalog,
    });
    const projectId = 'shared-project';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    await runtime.requestTeamShare(projectId, workspaceA);
    await runtime.requestTeamShare(projectId, workspaceB);
    await runtime.requestTeamUnshare(projectId, workspaceA);

    expect(unpublish).toHaveBeenCalledWith({ projectId, principal: workspaceA });
    expect(teamProjectCatalog.remove).toHaveBeenCalledWith(projectId, workspaceA);
    expect(runtime.publishedVersion(projectId, workspaceA)).toBeNull();
    expect(runtime.projectSyncState(projectId, workspaceA)).toBe('local_only');
    expect(runtime.projectOwnerMemberId(projectId, workspaceA)).toBeNull();
    expect(runtime.publishedVersion(projectId, workspaceB)).toBe(22);
    expect(runtime.projectSyncState(projectId, workspaceB)).toBe('synced');
    expect(runtime.projectOwnerMemberId(projectId, workspaceB)).toBe('member-b');
    expect(runtime.publishedVersion(projectId)).toBe(22);
    expect(runtime.projectSyncState(projectId)).toBe('synced');

    publish.mockClear();
    runtime.scheduler.notifyChanged(projectId, 'save');
    runtime.scheduler.runBoundary(projectId);
    for (let i = 0; i < 40 && publish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      projectId,
      reason: 'save',
      principal: workspaceB,
    });
  });

  it('reports ordinary publish failures to every workspace sharing the same project', async () => {
    let failPublish = false;
    const onError = vi.fn();
    const publish = vi.fn(async (input: { principal?: { memberId?: string } }) => {
      if (failPublish) throw new Error('resource hub unavailable');
      return { version: input.principal?.memberId === 'member-a' ? 11 : 22 };
    });
    runtime = createCollabRuntime({
      adapter: { publish },
      onError,
    });
    const projectId = 'shared-project';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (
      let i = 0;
      i < 40 &&
      (publish.mock.calls.length < 2 ||
        runtime.publishedVersion(projectId, workspaceA) === null ||
        runtime.publishedVersion(projectId, workspaceB) === null);
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    publish.mockClear();
    onError.mockClear();

    failPublish = true;
    runtime.scheduler.notifyChanged(projectId, 'change');
    runtime.scheduler.runBoundary(projectId);

    for (
      let i = 0;
      i < 40 &&
      (onError.mock.calls.length < 2 ||
        runtime.projectSyncState(projectId, workspaceA) !== 'sync_failed' ||
        runtime.projectSyncState(projectId, workspaceB) !== 'sync_failed');
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(onError.mock.calls.map((call) => call[0]?.principal)).toEqual(
      expect.arrayContaining([workspaceA, workspaceB]),
    );
    expect(runtime.projectSyncState(projectId, workspaceA)).toBe('sync_failed');
    expect(runtime.projectSyncState(projectId, workspaceB)).toBe('sync_failed');
  });

  it('does not recreate a failed catalog row when a publish error arrives after unshare', async () => {
    let publishCalls = 0;
    const teamProjectCatalog = {
      upsert: vi.fn(async () => null),
      remove: vi.fn(async () => null),
    };
    const workspace = {
      memberId: 'wm-1',
      teamId: 'ws-1',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    runtime = createCollabRuntime({
      adapter: {
        publish: async () => {
          publishCalls += 1;
          if (publishCalls === 1) return { version: 1 };
          throw new Error('project directory removed after unshare');
        },
        unpublish: async () => {},
      },
      workspaceContext: fixedShareContextProvider(true),
      teamProjectCatalog,
    });

    await runtime.requestTeamShare('landing', workspace);
    for (let i = 0; i < 40 && teamProjectCatalog.upsert.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    teamProjectCatalog.upsert.mockClear();

    await runtime.requestTeamUnshare('landing', workspace);
    runtime.scheduler.notifyChanged('landing', 'save');
    runtime.scheduler.runBoundary('landing');
    for (let i = 0; i < 40 && teamProjectCatalog.upsert.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(runtime.projectSyncState('landing', workspace)).toBe('local_only');
    expect(teamProjectCatalog.upsert).not.toHaveBeenCalled();
  });

  it('never re-publishes a fully-unshared project when a stale file-watcher notification arrives after unshare', async () => {
    // Regression for "unshare silently reverts to shared" (recvpTXk3liiya):
    // the project's chokidar subscription in collab-publish-watcher.ts is
    // only torn down when the project is deleted locally, never when it is
    // merely unshared. A file touched after the unshare (autosave, thumbnail
    // regen, or any write under the project dir) still fires
    // `scheduler.notifyChanged`. Before the fix, the scheduler adapter found
    // no remaining principal for the project and fell through to publishing
    // it anyway under an unscoped resource id — durably re-sharing it for
    // the window before `onPublished`'s `unshared` guard noticed and issued
    // a compensating unpublish. A status read landing in that window saw the
    // project as shared again.
    const publish = vi.fn(async () => ({ version: 1 }));
    const unpublish = vi.fn(async () => undefined);
    runtime = createCollabRuntime({
      adapter: { publish, unpublish },
    });
    const projectId = 'stale-watcher-project';
    const workspace = {
      memberId: 'wm-1',
      teamId: 'ws-1',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };

    await runtime.requestTeamShare(projectId, workspace);
    expect(publish).toHaveBeenCalledTimes(1);

    await runtime.requestTeamUnshare(projectId, workspace);
    publish.mockClear();

    // Simulate the stale file-watcher subscription firing after unshare —
    // exactly what collab-publish-watcher.ts's leftover `subs` entry does.
    runtime.scheduler.notifyChanged(projectId, 'file-change');
    runtime.scheduler.runBoundary(projectId);
    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(publish).not.toHaveBeenCalled();
    expect(runtime.projectOwnerMemberId(projectId, workspace)).toBeNull();
    expect(runtime.projectSyncState(projectId, workspace)).toBe('local_only');
  });

  it('preserves existing sync state when rememberTeamShare only seeds ownership', () => {
    runtime = createCollabRuntime();
    const workspace = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    runtime.rememberTeamShare('p1', workspace, 'sync_failed');
    runtime.rememberTeamShare('p1', workspace);
    expect(runtime.projectSyncState('p1', workspace)).toBe('sync_failed');
  });

  it('keeps team-project catalog resource ids scoped per workspace principal', async () => {
    const teamProjectCatalog = {
      list: vi.fn(),
      upsert: vi.fn(async () => null),
    };
    runtime = createCollabRuntime({
      teamProjectCatalog,
    });
    const projectId = 'landing';
    const workspaceA = {
      memberId: 'member-a',
      teamId: 'workspace-a',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };
    const workspaceB = {
      memberId: 'member-b',
      teamId: 'workspace-b',
      role: 'admin' as const,
      lifecycleState: 'active' as const,
    };

    runtime.requestTeamShare(projectId, workspaceA);
    runtime.requestTeamShare(projectId, workspaceB);

    for (let i = 0; i < 40 && teamProjectCatalog.upsert.mock.calls.length < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const resourceIds = (
      teamProjectCatalog.upsert.mock.calls as unknown as Array<[{
        resourceId?: string;
      }]>
    ).map((call) => call[0]?.resourceId);
    expect(resourceIds).toEqual(
      expect.arrayContaining([
        projectResourceIdFor(projectId, workspaceA),
        projectResourceIdFor(projectId, workspaceB),
      ]),
    );
    expect(projectResourceIdFor(projectId, workspaceA)).not.toBe(projectResourceIdFor(projectId, workspaceB));
  });

  it('writes project discovery metadata when publishing a team share through the runtime', async () => {
    const descriptor = {
      name: 'Electric Studio 2',
      skillId: 'deck-builder',
      designSystemId: 'ds-emerald',
      createdAt: 1719820800000,
      updatedAt: 1719907200000,
      metadata: { kind: 'deck', entryFile: 'index.html' },
    };
    const teamProjectCatalog = {
      upsert: vi.fn(async () => null),
    };
    const workspace = {
      memberId: 'member-owner',
      teamId: 'workspace-team',
      role: 'owner' as const,
      lifecycleState: 'active' as const,
    };
    runtime = createCollabRuntime({
      adapter: { publish: async () => ({ version: 1 }) },
      describeProject: () => descriptor,
      teamProjectCatalog,
    });

    await runtime.requestTeamShare('landing', workspace);
    for (let i = 0; i < 40 && teamProjectCatalog.upsert.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(teamProjectCatalog.upsert).toHaveBeenCalledWith(
      {
        projectId: 'landing',
        resourceId: projectResourceIdFor('landing', workspace),
        displayName: 'Electric Studio 2',
        syncState: 'synced',
        metadata: descriptor,
      },
      workspace,
    );
  });

  it('restores persisted team-share principals after runtime restart', async () => {
    const projectId = 'shared-after-restart';
    const workspace = {
      memberId: 'member-owner',
      teamId: 'workspace-restart',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const initialPublish = vi.fn(async () => ({ version: 1 }));
    runtime = createCollabRuntime({
      adapter: { publish: initialPublish },
    });
    runtime.requestTeamShare(projectId, workspace);
    for (let i = 0; i < 40 && initialPublish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    runtime.dispose();

    const publish = vi.fn(async () => ({ version: 2 }));
    runtime = createCollabRuntime({
      adapter: { publish },
    });
    runtime.rememberTeamShare(projectId, workspace, 'synced');

    expect(runtime.projectOwnerMemberId(projectId, workspace)).toBe('member-owner');
    runtime.scheduler.notifyChanged(projectId, 'change');
    runtime.scheduler.runBoundary(projectId);

    for (let i = 0; i < 40 && publish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      projectId,
      principal: workspace,
    }));
  });

  it('publishes on request and advances the published version monotonically', async () => {
    const context = teamContext('workspace-publish', 'member-publish');
    const api = await startSyncServer({ current: async () => context });
    runtime!.rememberTeamShare(
      'p1',
      contextToResourceHubPrincipal(context)!,
      'synced',
    );
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBeNull();

    const pub = await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    expect(pub.status).toBe(200);
    expect(pub.body.ok).toBe(true);

    const v1 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    expect(v1).toBe(1);

    await api.json('/api/projects/p1/collab/publish', { method: 'POST' });
    const v2 = await api.awaitPublishedVersion('/api/projects/p1/collab/status', v1);
    expect(v2).toBe(2);
  });

  it('accepts a coalesced change notification', async () => {
    const context = teamContext('workspace-change', 'member-change');
    const api = await startSyncServer({ current: async () => context });
    runtime!.rememberTeamShare(
      'p1',
      contextToResourceHubPrincipal(context)!,
      'synced',
    );
    const res = await api.json('/api/projects/p1/collab/changed', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('keeps the default route verifier on its authoritative fixture after ambient moves', async () => {
    const contextA = teamContext('workspace-fixture-a', 'member-fixture-a');
    const contextB = teamContext('workspace-fixture-b', 'member-fixture-b');
    let ambientContext = contextA;
    const api = await startSyncServer({
      current: async () => ambientContext,
    });
    runtime!.rememberTeamShare(
      'fixture-project',
      contextToResourceHubPrincipal(contextA)!,
      'synced',
    );

    ambientContext = contextB;
    const response = await api.json(
      '/api/projects/fixture-project/collab/changed',
      {
        method: 'POST',
        workspaceScope: contextA,
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('fails status closed before reading or materializing when workspace verification fails', async () => {
    const store = fakeProjectStore();
    const resolveSharedProjectOwner = vi.fn(async () => 'member-owner');
    const context = teamContext('workspace-status', 'member-status');
    let authorityAvailable = true;
    const api = await startSyncServer(
      { current: async () => context },
      {
        projectStore: store,
        resolveSharedProjectOwner,
        verifyWorkspaceRequest: async (req) =>
          authorityAvailable
          && req.get('x-od-workspace-id') === context.workspaceId
          && req.get('x-od-workspace-member-id') === context.workspaceMemberId
            ? context
            : null,
      },
    );

    const missing = await api.json('/api/projects/secret-project/collab/status', {
      workspaceScope: false,
    });
    expect(missing.status).toBe(403);
    expect(missing.body.error).toBe('WORKSPACE_PROJECT_STATUS_DENIED');
    expect(resolveSharedProjectOwner).not.toHaveBeenCalled();
    expect(store.has('secret-project')).toBe(false);

    const spoofed = await api.json('/api/projects/secret-project/collab/status', {
      workspaceScope: false,
      headers: {
        'x-od-workspace-id': 'workspace-spoofed',
        'x-od-workspace-member-id': 'member-spoofed',
      },
    });
    expect(spoofed.status).toBe(403);
    expect(resolveSharedProjectOwner).not.toHaveBeenCalled();
    expect(store.has('secret-project')).toBe(false);

    authorityAvailable = false;
    const unavailable = await api.json('/api/projects/secret-project/collab/status');
    expect(unavailable.status).toBe(403);
    expect(resolveSharedProjectOwner).not.toHaveBeenCalled();
    expect(store.has('secret-project')).toBe(false);
  });

  it('publishes a changed project only to the verified request workspace', async () => {
    const contextA = teamContext('workspace-a', 'member-a');
    const contextB = teamContext('workspace-b', 'member-b');
    const principalA = contextToResourceHubPrincipal(contextA)!;
    const principalB = contextToResourceHubPrincipal(contextB)!;
    const publish = vi.fn(async () => ({ version: 1 }));
    const verifyWorkspaceRequest = async (req: express.Request) => {
      const workspaceId = req.get('x-od-workspace-id');
      const memberId = req.get('x-od-workspace-member-id');
      if (workspaceId === contextA.workspaceId && memberId === contextA.workspaceMemberId) {
        return contextA;
      }
      if (workspaceId === contextB.workspaceId && memberId === contextB.workspaceMemberId) {
        return contextB;
      }
      return null;
    };
    const api = await startSyncServer(
      { current: async () => contextA },
      {
        verifyWorkspaceRequest,
        resolveSharedProjectOwner: async (_projectId, scope) =>
          scope?.workspaceId === contextA.workspaceId
            ? contextA.workspaceMemberId
            : scope?.workspaceId === contextB.workspaceId
              ? contextB.workspaceMemberId
              : null,
      },
      { adapter: { publish } },
    );
    runtime!.rememberTeamShare('shared-project', principalA, 'synced');
    runtime!.rememberTeamShare('shared-project', principalB, 'synced');

    const response = await api.json('/api/projects/shared-project/collab/publish', {
      method: 'POST',
      workspaceScope: contextB,
    });
    expect(response.status).toBe(200);

    for (let i = 0; i < 40 && publish.mock.calls.length < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'shared-project',
      principal: principalB,
    }));
  });

  it('rejects unscoped and spoofed change notifications before scheduling', async () => {
    const context = teamContext('workspace-author', 'member-author');
    const principal = contextToResourceHubPrincipal(context)!;
    const publish = vi.fn(async () => ({ version: 1 }));
    const api = await startSyncServer(
      { current: async () => context },
      undefined,
      { adapter: { publish } },
    );
    runtime!.rememberTeamShare('shared-project', principal, 'synced');

    const missing = await api.json('/api/projects/shared-project/collab/changed', {
      method: 'POST',
      workspaceScope: false,
    });
    expect(missing.status).toBe(403);
    expect(missing.body.error).toBe('WORKSPACE_PROJECT_PUBLISH_DENIED');

    const spoofed = await api.json('/api/projects/shared-project/collab/publish', {
      method: 'POST',
      workspaceScope: false,
      headers: {
        'x-od-workspace-id': 'workspace-spoofed',
        'x-od-workspace-member-id': 'member-spoofed',
      },
    });
    expect(spoofed.status).toBe(403);
    expect(spoofed.body.error).toBe('WORKSPACE_PROJECT_PUBLISH_DENIED');

    expect(runtime!.projectSyncState('shared-project', principal)).toBe('synced');
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps published versions independent per project', async () => {
    const context = teamContext('workspace-independent', 'member-independent');
    const principal = contextToResourceHubPrincipal(context)!;
    const api = await startSyncServer({ current: async () => context });
    runtime!.rememberTeamShare('a', principal, 'synced');
    await api.json('/api/projects/a/collab/publish', { method: 'POST' });
    await api.awaitPublishedVersion('/api/projects/a/collab/status', null);
    expect((await api.json('/api/projects/b/collab/status')).body.publishedVersion).toBeNull();
  });

  it('reports local_only sync state before any share', async () => {
    const api = await startSyncServer();
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('leases consecutive status reads while publish, share, and pull stay fresh', async () => {
    const context = teamContext('ws-1', 'wm-1');
    const directory = {
      ok: true as const,
      items: [{
        workspaceId: context.workspaceId,
        workspaceName: 'Team',
        workspaceType: 'team' as const,
        workspaceMemberId: context.workspaceMemberId,
        role: context.role,
        memberStatus: context.memberStatus,
        lifecycleState: context.lifecycleState,
      }],
    };
    const fetchReadDirectory = vi.fn(async () => directory);
    const cachedReadDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory: fetchReadDirectory,
      identityKey: () => 'account-a:config-a',
      ttlMs: 5_000,
    });
    const verifyWorkspaceReadRequest = vi.fn((req: express.Request) =>
      verifyWorkspaceRequestContext({
        req,
        fetchWorkspaceDirectory: cachedReadDirectory,
      }));
    const verifyWorkspaceRequest = vi.fn(async () => ({
      ok: true as const,
      context,
    }));
    const api = await startSyncServer(
      { current: async () => context },
      {
        verifyWorkspaceReadRequest,
        verifyWorkspaceRequest,
        resolveSharedProjectOwner: async () => null,
      },
    );

    expect((await api.json('/api/projects/p1/collab/status')).status).toBe(200);
    expect((await api.json('/api/projects/p1/collab/status')).status).toBe(200);
    expect(verifyWorkspaceReadRequest).toHaveBeenCalledTimes(2);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);
    expect(verifyWorkspaceRequest).not.toHaveBeenCalled();

    expect((await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: {
        event: 'project_team_share_requested',
        projectId: 'p1',
      },
    })).status).toBe(200);
    expect((await api.json('/api/projects/p1/collab/publish', {
      method: 'POST',
    })).status).toBe(200);
    // This narrow fixture has no mirror store, so pull reaches its expected
    // post-authorization 502 after proving it used fresh authority.
    expect((await api.json('/api/projects/p1/collab/pull', {
      method: 'POST',
    })).status).toBe(502);
    expect(verifyWorkspaceRequest).toHaveBeenCalledTimes(3);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);
  });

  it('reuses the scoped catalog across consecutive status owner reads and refreshes after invalidation', async () => {
    const context = teamContext('ws-status-cache', 'wm-status-viewer');
    const listCatalog = vi.fn(async () => [{
      projectId: 'shared-status-project',
      ownerMemberId: 'wm-status-owner',
    }]);
    const cache = createSwrCache(
      listCatalog,
      () => JSON.stringify([
        context.workspaceId,
        context.workspaceMemberId,
      ]),
      3_000,
    );
    const resolveSharedProjectOwnerForStatus = vi.fn(async (
      projectId: string,
      scope?: { workspaceId: string; workspaceMemberId: string },
    ) => {
      if (
        scope?.workspaceId !== context.workspaceId
        || scope.workspaceMemberId !== context.workspaceMemberId
      ) {
        return null;
      }
      return (await cache())
        .find((entry) => entry.projectId === projectId)
        ?.ownerMemberId ?? null;
    });
    const api = await startSyncServer(
      { current: async () => context },
      { resolveSharedProjectOwnerForStatus },
    );

    expect((await api.json(
      '/api/projects/shared-status-project/collab/status',
    )).status).toBe(200);
    expect((await api.json(
      '/api/projects/shared-status-project/collab/status',
    )).status).toBe(200);
    expect(resolveSharedProjectOwnerForStatus).toHaveBeenCalledTimes(2);
    expect(listCatalog).toHaveBeenCalledTimes(1);

    cache.invalidate();
    expect((await api.json(
      '/api/projects/shared-status-project/collab/status',
    )).status).toBe(200);
    expect(listCatalog).toHaveBeenCalledTimes(2);
  });

  it('rejects a revoked member before consulting a cached status owner catalog', async () => {
    const context = teamContext('ws-revoked-status', 'wm-revoked-status');
    let revoked = false;
    const resolveSharedProjectOwnerForStatus = vi.fn(
      async () => 'wm-status-owner',
    );
    const verifyWorkspaceReadRequest = vi.fn(async () =>
      revoked
        ? {
            ok: false as const,
            status: 403 as const,
            code: 'WORKSPACE_ACCESS_DENIED' as const,
            message: 'workspace membership is inactive',
          }
        : {
            ok: true as const,
            context,
          });
    const api = await startSyncServer(
      { current: async () => context },
      {
        verifyWorkspaceReadRequest,
        resolveSharedProjectOwnerForStatus,
      },
    );

    expect((await api.json(
      '/api/projects/revoked-status-project/collab/status',
    )).status).toBe(200);
    expect(resolveSharedProjectOwnerForStatus).toHaveBeenCalledTimes(1);

    revoked = true;
    expect((await api.json(
      '/api/projects/revoked-status-project/collab/status',
    )).status).toBe(403);
    expect(verifyWorkspaceReadRequest).toHaveBeenCalledTimes(2);
    expect(resolveSharedProjectOwnerForStatus).toHaveBeenCalledTimes(1);
  });

  it('circuits failed status authority reads and retries after the outage lease', async () => {
    let now = 0;
    const context = teamContext('ws-1', 'wm-1');
    const fetchReadDirectory = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, items: [] })
      .mockResolvedValueOnce({
        ok: true as const,
        items: [{
          workspaceId: context.workspaceId,
          workspaceName: 'Team',
          workspaceType: 'team' as const,
          workspaceMemberId: context.workspaceMemberId,
          role: context.role,
          memberStatus: context.memberStatus,
          lifecycleState: context.lifecycleState,
        }],
      });
    const cachedReadDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory: fetchReadDirectory,
      identityKey: () => 'account-a:config-a',
      ttlMs: 5_000,
      failureBackoffMinMs: 100,
      failureBackoffMaxMs: 100,
      now: () => now,
      random: () => 0,
    });
    const api = await startSyncServer(
      { current: async () => context },
      {
        verifyWorkspaceReadRequest: (req) =>
          verifyWorkspaceRequestContext({
            req,
            fetchWorkspaceDirectory: cachedReadDirectory,
          }),
        verifyWorkspaceRequest: vi.fn(async () => ({
          ok: true as const,
          context,
        })),
        resolveSharedProjectOwner: async () => null,
      },
    );

    expect((await api.json('/api/projects/p1/collab/status')).status).toBe(503);
    expect((await api.json('/api/projects/p1/collab/status')).status).toBe(503);
    expect(fetchReadDirectory).toHaveBeenCalledOnce();

    now = 100;
    expect((await api.json('/api/projects/p1/collab/status')).status).toBe(200);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(2);
  });

  it('rechecks fresh authority before a status-triggered placeholder pull', async () => {
    const context = teamContext('ws-1', 'wm-1');
    const projectStore = fakeProjectStore();
    const markSharedProjectPlaceholder = vi.fn(
      (projectId: string, placeholder: boolean) => {
        const record = projectStore.projects.get(projectId);
        if (!record) return;
        const metadata = {
          ...((record.metadata as Record<string, unknown> | undefined) ?? {}),
        };
        if (placeholder) {
          metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY] = Date.now();
        } else {
          delete metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY];
        }
        projectStore.projects.set(projectId, {
          ...record,
          metadata: metadata as never,
        });
      },
    );
    const pullDir = await mkdtemp(path.join(tmpdir(), 'od-status-fresh-pull-'));
    tempDirs.push(pullDir);
    let resolveFresh:
      | ((value: { ok: true; context: WorkspaceCollabContext }) => void)
      | undefined;
    const verifyWorkspaceRequest = vi.fn(
      () =>
        new Promise<{ ok: true; context: WorkspaceCollabContext }>((resolve) => {
          resolveFresh = resolve;
        }),
    );
    const pull = vi.fn(async () => ({ version: 1 }));
    const api = await startSyncServer(
      { current: async () => context },
      {
        projectStore,
        markSharedProjectPlaceholder,
        resolvePullDir: () => pullDir,
        verifyWorkspaceReadRequest: vi.fn(async () => ({
          ok: true as const,
          context,
        })),
        verifyWorkspaceRequest,
        resolveSharedProjectOwner: async () => context.workspaceMemberId,
        resolveSharedProject: async (projectId, scope) => ({
          projectId,
          ownerMemberId: scope?.ownerMemberId ?? context.workspaceMemberId,
          sharedAt: new Date(1).toISOString(),
          name: 'Freshly Authorized Project',
        }),
      },
      {
        adapter: {
          publish: async () => ({ version: 1 }),
          syncLatest: async () => ({ version: 1 }),
          pull,
        },
      },
    );

    const status = await api.json('/api/projects/fresh-pull/collab/status');
    expect(status.status).toBe(200);
    expect(status.body.awaitingFirstMaterialization).toBe(true);
    await vi.waitFor(() => expect(verifyWorkspaceRequest).toHaveBeenCalledOnce());
    expect(pull).not.toHaveBeenCalled();

    resolveFresh?.({ ok: true, context });
    await vi.waitFor(() => expect(pull).toHaveBeenCalledOnce());
  });

  it('registers a local placeholder when a member opens a not-yet-pulled shared project', async () => {
    const projectStore = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore,
      resolveSharedProjectOwner: async () => 'other-owner',
    });
    expect(projectStore.has('shared-p')).toBe(false);
    // The first status poll a member fires on opening the shared project must
    // register the placeholder so the other project routes stop 404ing while
    // the pull runs.
    const res = await api.json('/api/projects/shared-p/collab/status');
    expect(res.status).toBe(200);
    expect(projectStore.registerCalls).toBe(1);
    expect(projectStore.projects.get('shared-p')?.name).toBe('共享项目');
    // Idempotent: subsequent polls do not re-register the now-known project.
    await api.json('/api/projects/shared-p/collab/status');
    expect(projectStore.registerCalls).toBe(1);
  });

  it('owner opening their own unmaterialized shared project self-pulls and clears the placeholder stamp (recvqzaDvUU6B3)', async () => {
    // Fresh-install shape: the hub still lists the project with THIS member as
    // owner, but the local data root has no copy. The status poll registers a
    // placeholder — and, because the owner has no other pull path ("the owner
    // never auto-pulls" only holds when their local copy is real), that same
    // poll must kick off a background self-pull. Without it the empty
    // placeholder stays the only local state, which is exactly what the
    // publish paths used to wipe the hub with.
    const projectStore = fakeProjectStore();
    const markSharedProjectPlaceholder = vi.fn(
      (projectId: string, placeholder: boolean) => {
        const rec = projectStore.projects.get(projectId);
        if (!rec) return;
        const metadata = {
          ...((rec.metadata as Record<string, unknown> | undefined) ?? {}),
        };
        if (placeholder) {
          metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY] = Date.now();
        } else {
          delete metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY];
        }
        projectStore.projects.set(projectId, { ...rec, metadata: metadata as never });
      },
    );
    const pullDir = await mkdtemp(path.join(tmpdir(), 'od-owner-selfpull-'));
    tempDirs.push(pullDir);
    let pullCalls = 0;
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        projectStore,
        markSharedProjectPlaceholder,
        resolvePullDir: () => pullDir,
        // The CALLER (wm-1) is the hub-registered owner of this project.
        resolveSharedProjectOwner: async () => 'wm-1',
        resolveSharedProject: async () => ({
          projectId: 'owned-shared-p',
          ownerMemberId: 'wm-1',
          sharedAt: new Date(1).toISOString(),
          name: 'Real Owner Project',
        }),
      },
      {
        adapter: {
          publish: async () => {
            throw new Error('an owner self-pull must never publish');
          },
          syncLatest: async () => ({ version: 5 }),
          pull: async () => {
            pullCalls += 1;
            return { version: 5 };
          },
        },
      },
    );

    const res = await api.json('/api/projects/owned-shared-p/collab/status');
    expect(res.status).toBe(200);
    // The placeholder was registered AND stamped as unmaterialized on open.
    expect(markSharedProjectPlaceholder).toHaveBeenCalledWith('owned-shared-p', true);

    // The same status poll kicks off the background owner self-pull …
    await vi.waitFor(() => {
      expect(pullCalls).toBeGreaterThan(0);
    });
    // … whose registration replaces the placeholder with the real record and
    // clears the stamp, so normal owner publishing can resume on top of the
    // materialized content.
    await vi.waitFor(() => {
      expect(markSharedProjectPlaceholder).toHaveBeenCalledWith('owned-shared-p', false);
    });
    expect(projectStore.projects.get('owned-shared-p')?.name).toBe('Real Owner Project');
  });

  it('owner self-pull hitting a retracted hub resource heals the dangling catalog row instead of leaving a ghost', async () => {
    // The reinstall-revival shape reproduced live on the feature-test hub
    // (2026-07-27, workspace res-wipe-0727): an unshare's two hub writes are
    // resource remove → team-projects catalog remove, and when only the first
    // landed the hub is left dangling — the catalog still lists the project
    // while its backing resource row is tombstoned. On a fresh data root the
    // local `cloudTombstonedAt` suppression is gone, so the retracted project
    // came back as a normal-looking team card (visibility=team, canOpen) for
    // every member. Opening it registered a placeholder and the owner
    // self-pull died with `resource_not_found`, silently — the ghost stayed
    // in the list forever, and the unshare retry-trap (see
    // vela-cli-resource-adapter.test.ts) meant no user action could clear it.
    //
    // The invariant: the catalog naming this caller as owner WHILE the
    // published pull answers `resource_not_found` is the hub-authoritative
    // signature of "曾共享已撤" (a half-landed retraction) — never of a live
    // share. The owner's daemon must finish the retraction (remove the
    // dangling catalog row) and retire the just-registered unmaterialized
    // placeholder, instead of swallowing the pull error.
    const projectStore = fakeProjectStore();
    const markSharedProjectPlaceholder = vi.fn(
      (projectId: string, placeholder: boolean) => {
        const rec = projectStore.projects.get(projectId);
        if (!rec) return;
        const metadata = {
          ...((rec.metadata as Record<string, unknown> | undefined) ?? {}),
        };
        if (placeholder) {
          metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY] = Date.now();
        } else {
          delete metadata[SHARED_PROJECT_PLACEHOLDER_METADATA_KEY];
        }
        projectStore.projects.set(projectId, { ...rec, metadata: metadata as never });
      },
    );
    const retireUnmaterializedSharedPlaceholder = vi.fn((projectId: string) => {
      projectStore.projects.delete(projectId);
    });
    const invalidateTeamProjectCatalog = vi.fn();
    const pullDir = await mkdtemp(path.join(tmpdir(), 'od-owner-ghost-heal-'));
    tempDirs.push(pullDir);
    const unpublish = vi.fn(async () => undefined);
    const catalogRemove = vi.fn(async (_projectId: string, _principal?: unknown) => ({}));
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        projectStore,
        markSharedProjectPlaceholder,
        retireUnmaterializedSharedPlaceholder,
        invalidateTeamProjectCatalog,
        resolvePullDir: () => pullDir,
        // The CALLER (wm-1) is the hub-registered owner: the dangling catalog
        // row still names them, which is exactly why the ghost renders.
        resolveSharedProjectOwner: async () => 'wm-1',
        resolveSharedProject: async () => ({
          projectId: 'ghost-shared-p',
          ownerMemberId: 'wm-1',
          sharedAt: new Date(1).toISOString(),
          name: 'Ghost Project',
        }),
      },
      {
        adapter: {
          publish: async () => {
            throw new Error('an owner self-pull must never publish');
          },
          // `head` on a tombstoned resource reports "no published version".
          syncLatest: async () => null,
          // The exact transport failure the live repro surfaced: the hub's
          // tombstone gate 404s the published-ref pull.
          pull: async () => {
            throw new Error(
              'Command failed: vela resource pull project project-ghost /dir --ref published --json\n' +
                'Error: pull resource: API request failed with status 404: resource_not_found\n',
            );
          },
          unpublish,
        },
        teamProjectCatalog: { upsert: async () => ({}), remove: catalogRemove },
      },
    );

    const res = await api.json('/api/projects/ghost-shared-p/collab/status');
    expect(res.status).toBe(200);
    expect(markSharedProjectPlaceholder).toHaveBeenCalledWith('ghost-shared-p', true);

    // The heal finishes the half-landed retraction hub-side …
    await vi.waitFor(() => {
      expect(catalogRemove).toHaveBeenCalled();
    });
    expect(catalogRemove.mock.calls[0]?.[0]).toBe('ghost-shared-p');
    // … retires the contentless placeholder this same open registered …
    await vi.waitFor(() => {
      expect(retireUnmaterializedSharedPlaceholder).toHaveBeenCalledWith('ghost-shared-p');
    });
    expect(projectStore.projects.has('ghost-shared-p')).toBe(false);
    // … and drops the cached catalog so the ghost card leaves the list now,
    // not one stale-while-revalidate TTL later.
    expect(invalidateTeamProjectCatalog).toHaveBeenCalled();
  });

  it('reports the durable owner-scoped materialized version for a shared project', async () => {
    const readMaterializedVersion = vi.fn(() => 6);
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        resolveSharedProjectOwner: async () => 'wm-owner',
        readMaterializedVersion,
      },
      {
        adapter: {
          publish: async () => ({ version: 7 }),
          syncLatest: async () => ({ version: 7 }),
        },
      },
    );

    const first = await api.json('/api/projects/shared-p/collab/status');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      publishedVersion: null,
      materializedVersion: null,
      ownerMemberId: 'wm-owner',
    });
    expect(await api.awaitPublishedVersion(
      '/api/projects/shared-p/collab/status',
      null,
    )).toBe(7);
    const res = await api.json('/api/projects/shared-p/collab/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      publishedVersion: 7,
      materializedVersion: 6,
      ownerMemberId: 'wm-owner',
    });
    expect(readMaterializedVersion).toHaveBeenCalledWith('shared-p', {
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-1',
      ownerMemberId: 'wm-owner',
    });
  });

  it('returns the daemon-local content transfer snapshot for reconnects', async () => {
    const contentTransferState = {
      status: 'downloading' as const,
      version: 8,
      startedAt: 100,
      updatedAt: 101,
    };
    const readContentTransferState = vi.fn(() => contentTransferState);
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        resolveSharedProjectOwner: async () => 'wm-owner',
        readContentTransferState,
      },
    );

    const res = await api.json('/api/projects/shared-p/collab/status');

    expect(res.status).toBe(200);
    expect(res.body.contentTransferState).toEqual(contentTransferState);
    expect(readContentTransferState).toHaveBeenCalledWith('shared-p', {
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-1',
      ownerMemberId: 'wm-owner',
    });
  });

  it('fails closed to a null materialized version when the durable cursor cannot be read', async () => {
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        resolveSharedProjectOwner: async () => 'wm-owner',
        readMaterializedVersion: () => {
          throw new Error('cursor unavailable');
        },
      },
      {
        adapter: {
          publish: async () => ({ version: 7 }),
          syncLatest: async () => ({ version: 7 }),
        },
      },
    );

    const res = await api.json('/api/projects/shared-p/collab/status');

    expect(res.status).toBe(200);
    expect(res.body.materializedVersion).toBeNull();
  });

  it('registers a local placeholder when the OWNER opens their own shared project not materialized on this machine', async () => {
    const projectStore = fakeProjectStore();
    const ownerContext = teamContext('ws-1', 'owner-self');
    const api = await startSyncServer({ current: async () => ownerContext }, {
      projectStore,
      // The hub reports the caller themselves as the owner.
      resolveSharedProjectOwner: async () => 'owner-self',
    });
    expect(projectStore.has('shared-owned')).toBe(false);
    // An owner can hit a shared project that is NOT in this daemon's local DB —
    // it was created/shared on another machine (or a smoke-test attributed it to
    // them in the hub). Opening it must still register the placeholder, or
    // conversations/events/tabs 404 and the left pane hangs for a minute. The
    // owner never auto-pulls, so nothing else registers it. callerIsOwner=true
    // here (owner member id === caller's own member id via the workspace header).
    const ownerHeaders = {
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'owner-self',
    };
    const res = await api.json('/api/projects/shared-owned/collab/status', {
      headers: ownerHeaders,
    });
    expect(res.status).toBe(200);
    expect(projectStore.registerCalls).toBe(1);
    expect(projectStore.projects.get('shared-owned')?.name).toBe('共享项目');
    // Idempotent: the now-known project is not re-registered on the next poll.
    await api.json('/api/projects/shared-owned/collab/status', { headers: ownerHeaders });
    expect(projectStore.registerCalls).toBe(1);
  });

  it('drives the visibility-to-sync team-share intent through to synced', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    const intent = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(intent.status).toBe(200);
    // Team-share is user-facing: the route waits for a durable resource version
    // before reporting success, so teammates never see a catalog-only shell.
    expect(intent.body.syncState).toBe('synced');
    expect(intent.body.publishedVersion).toBe(1);
    expect((await api.json('/api/projects/p1/collab/status')).body.publishedVersion).toBe(1);
  });

  it('moves a team-shared project back to local_only on unshare intent', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);

    const unshare = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });

    expect(unshare.status).toBe(200);
    expect(unshare.body.syncState).toBe('local_only');
    const status = await api.json('/api/projects/p1/collab/status');
    expect(status.body.syncState).toBe('local_only');
    expect(status.body.publishedVersion).toBeNull();
  });

  it('invalidates the team-project catalog on a sync-intent share and unshare', async () => {
    // The display read behind `/api/workspace/projects/team` is served from a
    // 3s SWR entry, so invalidation is part of the mutation contract now. The
    // `/api/workspaces/:id/projects` move path already invalidates; this route
    // — the one `od project share` and CollabDemoView drive — did not, so a
    // catalog GET right after sharing could answer with the pre-share list
    // until the freshness window expired or a hub event happened to arrive.
    const invalidateTeamProjectCatalog = vi.fn();
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      { invalidateTeamProjectCatalog },
    );

    await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(invalidateTeamProjectCatalog).toHaveBeenCalledTimes(1);

    await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });
    expect(invalidateTeamProjectCatalog).toHaveBeenCalledTimes(2);
  });

  it('accepts a visibility-changed intent as a no-op signal', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_visibility_changed', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('local_only'); // visibility change alone doesn't publish
  });

  it('rejects an unknown sync intent event', async () => {
    const api = await startSyncServer();
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'nonsense', projectId: 'p1' },
    });
    expect(res.status).toBe(400);
  });

  it('refuses a team-share intent from a member without canShareProjects (server-side gate)', async () => {
    // The client hides the share affordance, but the daemon must not trust the
    // client — a member whose context lacks canShareProjects is refused (403),
    // and the project stays local_only (no publish is triggered).
    const api = await startSyncServer(fixedShareContextProvider(false));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_SHARE_DENIED');
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('local_only');
  });

  it('refuses a team-share intent when no workspace context is available', async () => {
    const api = await startSyncServer({ current: async () => null });
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_SHARE_DENIED');
    const status = await api.json('/api/projects/p1/collab/status');
    expect(status.status).toBe(403);
    expect(status.body.error).toBe('WORKSPACE_PROJECT_STATUS_DENIED');
  });

  it('honors a team-share intent from a member with canShareProjects', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true));
    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('synced');
    expect(res.body.publishedVersion).toBe(1);
  });

  it('treats an already shared project owned by another member as shared instead of republishing it', async () => {
    let publishCalls = 0;
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      {
        resolveSharedProject: async () => ({
          projectId: 'p1',
          ownerMemberId: 'wm-owner',
          sharedAt: new Date(1).toISOString(),
          name: 'Owner Project',
        }),
      },
      {
        adapter: {
          publish: async () => {
            publishCalls += 1;
            throw new Error('resource hub should not be called');
          },
          syncLatest: async () => null,
          pull: async () => null,
          unpublish: async () => {},
        },
      },
    );

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(200);
    expect(res.body.syncState).toBe('synced');
    expect(publishCalls).toBe(0);
  });

  it('refuses to unshare a project owned by another member', async () => {
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveSharedProject: async () => ({
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: new Date(1).toISOString(),
        name: 'Owner Project',
      }),
    });

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WORKSPACE_PROJECT_UNSHARE_DENIED');
  });

  it.each(['none', 'active', 'stopped', 'unavailable'] as const)('reads authoritative project/file state without any local publication: %s', async state => {
    const history = { projectId: 'p1', bindingExists: state !== 'none', hasEverShared: state !== 'none',
      publications: state === 'none' || state === 'unavailable' ? [] : [{ sourceFilePath: 'index.html', slug: fixtureSlug, status: state }] };
    const read = vi.fn(async () => { if (state === 'unavailable') throw new Error('upstream 404 is not never-shared'); return history; });
    const api = await startSyncServer(personalContextProvider(), { readProjectShareState: read });
    const project = await api.json('/api/projects/p1/share-state');
    const file = await api.json('/api/projects/p1/files/index.html/publish-public');
    if (state === 'unavailable') { expect(project.status).toBe(503); expect(file.status).toBe(503); }
    else {
      expect(project.status).toBe(200); expect(project.body).toEqual(history);
      expect(file.status).toBe(200); expect(file.body).toEqual({ publication: null, status: state, freshness: 'unknown' });
    }
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', resourceTeamId: 'ws-personal-1', ownerMemberId: 'wm-personal-1' }));
  });

  it('25 real HTTP freshness compares the rewritten package including dependency bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-share-freshness-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'pages'));
    await writeFile(path.join(dir, 'pages', 'local.html'), '<link rel="stylesheet" href="../style.css"><h1>Content</h1>');
    await writeFile(path.join(dir, 'style.css'), 'body{color:red}');
    const db = new Database(':memory:');
    try {
      migratePublicFilePublications(db);
      const store = createSqlitePublicFilePublicationStore(db);
      const fingerprints = createShareContentFingerprints(db, store);
      vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://api.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
      vi.mocked(runVelaResourceCommand).mockImplementation(async args => JSON.stringify(args[0] === 'snapshot'
        ? { slug: 'legacy-freshness', name: 'local.html', kind: 'project', versionId: 'v1', createdAt: new Date(1).toISOString() }
        : { id: 'v1', version: 1 }));
      const api = await startSyncServer(personalContextProvider(), {
        resolveProjectDir: () => dir, resolveSharedProject: async () => null,
        ...await publicShareFixture({ db }),
        publicFilePublicationStore: store, shareContentFingerprints: fingerprints,
      });
      const endpoint = '/api/projects/p1/files/pages/local.html/publish-public';
      expect((await api.json(endpoint, { method: 'POST' })).status).toBe(200);
      const publication = (await api.json(endpoint)).body.publication;
      expect.soft((await api.json(endpoint)).body.freshness).toBe('current');
      await writeFile(path.join(dir, 'style.css'), 'body{color:blue}');
      expect.soft((await api.json(endpoint)).body.freshness).toBe('outdated');
      db.exec('DELETE FROM share_content_fingerprints');
      const unknown = await api.json(endpoint);
      expect.soft(unknown.body.freshness).toBe('unknown');
      expect(unknown.body.publication).toEqual(publication);
      expect(vi.mocked(runVelaResourceCommand).mock.calls.map(call => call[0][0])).toEqual(['push']);
    } finally { db.close(); }
  });

  it.each(['published', 'binding_pending'] as const)('22/23 real HTTP separates the Viewer URL from binding readiness; outcome=%s', async status => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-share-entry-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Public file</h1>');
    const db = new Database(':memory:');
    try {
      migratePublicFilePublications(db);
      const store = createSqlitePublicFilePublicationStore(db);
      const outbox = createShareBindingOutbox(db);
      const receipt = { filePath: 'index.html', entryPath: 'index.html', slug: 'a863b8d7-cc55-465a-a359-435bd3ef4919', versionId: 'immutable-upload-1', version: 1, publishedAt: 1 };
      vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://api.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
      vi.mocked(publishReservedVelaShareVersion).mockResolvedValue(status === 'published'
        ? { status, receipt } : { status, receipt, binding: { retrying: false } });
      vi.mocked(runVelaResourceCommand).mockImplementation(async args => JSON.stringify(args[0] === 'snapshot'
        ? { slug: 'legacy-snapshot', name: 'index.html', kind: 'project', versionId: receipt.versionId, createdAt: new Date(1).toISOString() }
        : { id: receipt.versionId, version: 1 }));
      const api = await startSyncServer(personalContextProvider(), {
        resolveProjectDir: () => dir, resolveSharedProject: async () => null,
        publicFilePublicationStore: store,
        recordPublicFilePublication: createPublicFilePublicationRecorder(db, store, () => ({ enqueued: 0, skippedInbound: 0 })),
        sharePublishing: {
          reservations: createShareAliasReservations(db, () => receipt.slug), outbox,
          ensureProject: async scope => ({ projectId: scope.projectId, ownerMemberId: scope.ownerMemberId, sharedAt: null }),
          complete: createSharePublicationCompletion(db, createPublicFilePublicationRecorder(db, store, () => ({ enqueued: 0, skippedInbound: 0 })), outbox, true),
          prepare: async (scope, slug) => ({
            url: publicShareViewerUrl(scope.projectId, slug, { OD_VELA_WEB_URL: 'https://web.example.test/cloud' }),
            run: async args => runVelaResourceCommand(args.slice(1), scope.resourceTeamId),
          }),
          retry: vi.fn(),
        },
      });
      const response = await api.json('/api/projects/p1/files/index.html/publish-public', { method: 'POST' });
      expect.soft(response.status).toBe(200);
      if (status === 'published') {
        expect.soft(new URL(response.body.url).pathname).toMatch(/\/artifact\/p1\/a863b8d7-cc55-465a-a359-435bd3ef4919$/u);
        expect.soft(new URL(response.body.url).origin).not.toBe('https://api.example.test');
        expect.soft(outbox.list()).toHaveLength(0);
      } else {
        expect.soft(response.body.url).toBe(`https://web.example.test/cloud/artifact/p1/${receipt.slug}`);
        expect.soft(response.body.binding?.retrying).toBe(true);
        expect.soft(outbox.list()).toHaveLength(1);
      }
      expect.soft(response.body.status).toBe(status);
      expect.soft(response.body.receipt).toEqual(receipt);
      expect.soft(publishReservedVelaShareVersion).toHaveBeenCalledTimes(1);
    } finally { db.close(); }
  });

  it.each([false, true])('records planner mapping and publication in the HTTP transaction; enqueue failure=%s', async fail => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-publish-transaction-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'pages'));
    await writeFile(path.join(dir, 'pages', 'local.html'), '<h1>Nested entry</h1>');
    const db = new Database(':memory:');
    try {
      migratePublicFilePublications(db);
      db.exec('CREATE TABLE test_publish_intents (local_path TEXT, public_path TEXT, revision TEXT)');
      const store = createSqlitePublicFilePublicationStore(db);
      const scope = { resourceTeamId: 'ws-personal-1', ownerMemberId: 'wm-personal-1', projectId: 'p1', filePath: 'pages/local.html' };
      const enqueue = vi.fn((connection: Database.Database, input: {
        scope: typeof scope; publicationRevision: { slug: string; token: string }; publicFilePath: string;
      }) => {
        expect(connection).toBe(db); expect(db.inTransaction).toBe(true);
        expect(input.scope).toEqual(scope); expect(input.publicFilePath).toBe('index.html');
        expect(input.publicationRevision).toEqual(store.getRevision(scope));
        db.prepare('INSERT INTO test_publish_intents VALUES (?, ?, ?)').run(input.scope.filePath, input.publicFilePath, input.publicationRevision.token);
        if (fail) throw new Error('intent storage unavailable');
        return { enqueued: 1, skippedInbound: 0 };
      });
      vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://hub.example.test', controlKey: 'synthetic', user: null, configMtimeMs: null });
      vi.mocked(runVelaResourceCommand).mockImplementation(async args => JSON.stringify(args[0] === 'snapshot'
        ? { slug: 'confirmed', name: 'local.html', kind: 'project', versionId: 'v1', createdAt: new Date(1).toISOString() }
        : { id: 'v1', version: 1 }));
      const api = await startSyncServer(personalContextProvider(), {
        resolveProjectDir: () => dir, resolveSharedProject: async () => null,
        ...await publicShareFixture({ db, enqueue }),
      });
      const response = await api.json('/api/projects/p1/files/pages/local.html/publish-public', { method: 'POST' });
      expect(enqueue).toHaveBeenCalledTimes(1); expect(db.inTransaction).toBe(false);
      expect(response.status).toBe(fail ? 502 : 200);
      const commands = vi.mocked(runVelaResourceCommand).mock.calls;
      expect(commands.map(call => call[0][0])).toEqual(['push']);
      for (const command of commands) expect(command[1]).toBe(scope.resourceTeamId);
      const current = await api.json('/api/projects/p1/files/pages/local.html/publish-public');
      if (fail) {
        expect(response.body.error).toMatchObject({ code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED', data: { slug: fixtureSlug, fileName: scope.filePath } });
        expect(response.body.error.data.url).toBe(`https://web.example.test/artifact/p1/${fixtureSlug}`);
        expect(store.get(scope)).toBeNull(); expect(current.body.publication).toBeNull();
        expect(db.prepare('SELECT * FROM test_publish_intents').all()).toEqual([]);
        // Local storage failure must not revoke the already confirmed remote alias.
      } else {
        expect(response.body.receipt.slug).toBe(fixtureSlug); expect(current.body.publication.slug).toBe(fixtureSlug);
        expect(db.prepare('SELECT * FROM test_publish_intents').all()).toEqual([
          { local_path: scope.filePath, public_path: 'index.html', revision: store.getRevision(scope)!.token },
        ]);
      }
    } finally { db.close(); }
  });

  it.each([false, true])('publishes a public file from a personal workspace; fingerprint failure=%s', async (fingerprintFailure) => {
    // The public-file routes require A workspace, not a TEAM workspace.
    //
    // They were briefly team-only, on the premise that a hub snapshot is keyed
    // by teamId and a personal session had nothing to publish under. B's
    // control-key auth path stopped refusing non-team callers: it mints a
    // principal whose teamId IS the workspace id, and its access check only
    // compares that id against the resource's own — a partition of one. So a
    // personal workspace must get through, and must be scoped by its OWN id.
    const dir = await mkdtemp(path.join(tmpdir(), 'od-public-file-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<link rel="stylesheet" href="style.css"><h1>Published</h1>');
    await writeFile(path.join(dir, 'style.css'), 'body{color:red}');
    const remember = vi.fn(() => { if (fingerprintFailure) throw new Error('disk unavailable'); return true; });
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    vi.mocked(runVelaResourceCommand).mockResolvedValue(JSON.stringify({ id: 'v1', version: 1 }));
    const api = await startSyncServer(personalContextProvider(), {
      ...await publicShareFixture(),
      resolveProjectDir: () => dir,
      resolveSharedProject: async () => null,
      shareContentFingerprints: { remember, compare: () => 'unknown' },
    });

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'POST',
    });

    expect(publish.status).toBe(200);
    expect(publish.body).toEqual({
      status: 'published', url: `https://web.example.test/artifact/p1/${fixtureSlug}`,
      receipt: { filePath: 'index.html', slug: fixtureSlug, version: 1, versionId: 'v1', publishedAt: 1234, entryPath: 'index.html' },
    });
    expect(remember).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ resourceTeamId: 'ws-personal-1', projectId: 'p1', filePath: 'index.html' }),
      { slug: fixtureSlug, token: expect.any(String) },
      expect.arrayContaining([expect.objectContaining({ file: 'index.html' }), expect.objectContaining({ file: 'style.css', data: expect.anything() })]),
    );
    expect(vi.mocked(runVelaResourceCommand).mock.calls.map(call => call[0][0])).toEqual(['push']);
    // Every hub call carries the personal workspace's own id as the scope —
    // there is no teamId on this context, and nothing may invent one.
    expect(runVelaResourceCommand).toHaveBeenCalled();
    for (const call of vi.mocked(runVelaResourceCommand).mock.calls) {
      expect(call[1]).toBe('ws-personal-1');
    }

    // The published link then reads back and clears like any other.
    const current = await api.json('/api/projects/p1/files/index.html/publish-public');
    expect(current.body.publication?.slug).toBe(fixtureSlug);
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: fixtureSlug },
    });
    expect(unpublish.status).toBe(200);
  });

  it('keeps public file ownership reads on request workspace A while ambient workspace B is active', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const dir = await mkdtemp(path.join(tmpdir(), 'od-public-file-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Published in A</h1>');
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    vi.mocked(runVelaResourceCommand).mockImplementation(async (args) => {
      if (args[0] === 'snapshot') {
        return JSON.stringify({
          slug: fixtureSlug,
          name: 'index.html',
          kind: 'project',
          versionId: 'v1',
          createdAt: new Date(1).toISOString(),
        });
      }
      return JSON.stringify({ id: 'v1', version: 1 });
    });
    const ownershipScopes: Array<TeamMirrorPullScope | null | undefined> = [];
    const resolveSharedProject = vi.fn(async (
      projectId: string,
      scope?: TeamMirrorPullScope | null,
    ) => {
      ownershipScopes.push(scope);
      // Production used to omit this scope, so the catalog adapter fell back
      // to ambient B and returned B's owner for an explicit A request.
      const workspaceId = scope?.workspaceId ?? 'workspace-b';
      return {
        projectId,
        ownerMemberId: workspaceId === 'workspace-a' ? 'member-a' : 'member-b',
        sharedAt: '2026-07-30T00:00:00.000Z',
      };
    });
    const api = await startSyncServer(
      { current: async () => workspaceA },
      {
        ...await publicShareFixture(),
        resolveProjectDir: () => dir,
        resolveSharedProject,
      },
    );

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'POST',
    });
    const current = await api.json('/api/projects/p1/files/index.html/publish-public');
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: fixtureSlug },
    });

    expect(publish.status).toBe(200);
    expect(current.status).toBe(200);
    expect(current.body.publication?.slug).toBe(fixtureSlug);
    expect(unpublish.status).toBe(200);
    expect(resolveSharedProject).toHaveBeenCalledTimes(3);
    expect(ownershipScopes).toHaveLength(3);
    for (const scope of ownershipScopes) {
      expect(scope).toMatchObject({
        workspaceId: 'workspace-a',
        resourceTeamId: 'workspace-a',
        viewerMemberId: 'member-a',
      });
    }
    for (const call of vi.mocked(runVelaResourceCommand).mock.calls) {
      expect(call[1]).toBe('workspace-a');
    }
  });

  it('explains, rather than bare-codes, a public file publish with no workspace at all', async () => {
    // The gate was widened, not removed. A signed-out caller (or a context read
    // that came back empty) has no id to publish under and no member id to own
    // the resource with, so all three handlers still refuse it — and must ship a
    // human-readable reason alongside the code, since the `od` CLI and embedding
    // agents surface the body verbatim. The sentence now says SIGN IN; telling a
    // personal user to "switch to a team workspace" is no longer true.
    const resolveProjectDir = vi.fn(() => {
      throw new Error('project dir should not be read');
    });
    const api = await startSyncServer(
      { current: async () => null },
      { resolveProjectDir, resolveSharedProject: async () => null },
    );

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'POST',
    });
    const read = await api.json('/api/projects/p1/files/index.html/publish-public');
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: 'public-slug' },
    });

    for (const res of [publish, read, unpublish]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('WORKSPACE_IDENTITY_REQUIRED');
      // The load-bearing assertion: a human-readable reason ships with the code.
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message).toMatch(/sign in/i);
      expect(res.body.message).not.toMatch(/team workspace/i);
    }
    // The gate must short-circuit before any project read or hub call.
    expect(resolveProjectDir).not.toHaveBeenCalled();
    expect(runVelaResourceCommand).not.toHaveBeenCalled();
  });

  it('refuses public file operations for a shared project owned by another member without side effects', async () => {
    const resolveProjectDir = vi.fn(() => {
      throw new Error('project dir should not be read');
    });
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveProjectDir,
      resolveSharedProject: async () => ({
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: new Date(1).toISOString(),
        name: 'Owner Project',
      }),
    });

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'POST',
    });
    const current = await api.json('/api/projects/p1/files/index.html/publish-public');
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: 'other-member-slug' },
    });

    for (const res of [publish, current, unpublish]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('WORKSPACE_PROJECT_PUBLISH_DENIED');
    }
    expect(resolveProjectDir).not.toHaveBeenCalled();
    expect(runVelaResourceCommand).not.toHaveBeenCalled();
  });

  it('fails public file publish and unpublish when ownership lookup fails', async () => {
    const resolveProjectDir = vi.fn(() => {
      throw new Error('project dir should not be read');
    });
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveProjectDir,
      resolveSharedProject: async () => {
        throw new Error('catalog unavailable');
      },
    });

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'POST',
    });
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: 'public-slug' },
    });

    expect(publish.status).toBe(503);
    expect(publish.body.error).toBe('WORKSPACE_PROJECT_OWNERSHIP_UNAVAILABLE');
    expect(unpublish.status).toBe(503);
    expect(unpublish.body.error).toBe('WORKSPACE_PROJECT_OWNERSHIP_UNAVAILABLE');
    expect(resolveProjectDir).not.toHaveBeenCalled();
    expect(runVelaResourceCommand).not.toHaveBeenCalled();
  });

  it('does not upload when Viewer preparation fails', async () => {
    const resolveProjectDir = vi.fn(() => { throw new Error('must not read project'); });
    const fixture = await publicShareFixture();
    fixture.sharePublishing.prepare = async () => { throw new Error('Viewer origin unavailable'); };
    const api = await startSyncServer(fixedShareContextProvider(true), { ...fixture, resolveProjectDir, resolveSharedProject: async () => null });
    const response = await api.json('/api/projects/p1/files/index.html/publish-public', { method: 'POST' });
    expect(response.status).toBe(502);
    expect(response.body.error).toBe('PUBLIC_SHARE_PREPARATION_UNAVAILABLE');
    expect(resolveProjectDir).not.toHaveBeenCalled();
    expect(runVelaResourceCommand).not.toHaveBeenCalled();
    expect(publishReservedVelaShareVersion).not.toHaveBeenCalled();
  });

  it('pins each publication to its own push while retaining one stable alias', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-version-pin-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>A</h1>');
    const pushed = publicationBarrier();
    const release = publicationBarrier();
    const versions = new Map<string, string>();
    const published: string[][] = [];
    let sequence = 0;
    const fixture = await publicShareFixture({ run: async args => {
      if (args[0] === 'resource' && args[1] === 'push') {
        const version = ++sequence;
        const id = `v${version}`;
        versions.set(id, await readFile(path.join(args[4]!, 'index.html'), 'utf8'));
        if (version === 1) { pushed.resolve(); await release.promise; }
        return JSON.stringify({ id, version });
      }
      if (args[0] === 'share' && args[1] === 'publish') { published.push(args); return confirmedShareOutput(args); }
      throw new Error('unexpected command');
    } });
    const api = await startSyncServer(fixedShareContextProvider(true), { ...fixture, resolveProjectDir: () => dir, resolveSharedProject: async () => null });
    const endpoint = '/api/projects/p1/files/index.html/publish-public';
    const a = api.json(endpoint, { method: 'POST' });
    let b: Awaited<typeof a>;
    try {
      await Promise.race([pushed.promise, a.then(() => { throw new Error('first request ended before upload barrier'); })]);
      await writeFile(path.join(dir, 'index.html'), '<h1>B</h1>');
      b = await api.json(endpoint, { method: 'POST' });
    } finally { release.resolve(); }
    const first = await a;
    expect(first.status).toBe(200); expect(b!.status).toBe(200);
    expect(first.body.url).toBe(b!.body.url);
    expect(first.body.receipt.slug).toBe(b!.body.receipt.slug);
    expect(versions.get(first.body.receipt.versionId)).toContain('<h1>A</h1>');
    expect(versions.get(b!.body.receipt.versionId)).toContain('<h1>B</h1>');
    expect(published).toHaveLength(2);
    for (const args of published) { expect(args).not.toContain('--ref'); expect(args).toContain('--version-id'); }
  });

  it.each(['missing-push-id', 'wrong-version', 'missing-version'] as const)('rejects %s without replacing a successful publication', async fault => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-version-pin-failure-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Keep old publication</h1>');
    let broken = false;
    let publishes = 0;
    const fixture = await publicShareFixture({ run: async args => {
      if (args[0] === 'resource' && args[1] === 'push') return JSON.stringify(broken && fault === 'missing-push-id' ? { version: 2 } : { id: 'v1', version: 1 });
      if (args[0] === 'share' && args[1] === 'publish') {
        publishes++;
        return confirmedShareOutput(args, broken && fault !== 'missing-push-id' ? fault : undefined);
      }
      throw new Error('unexpected command');
    } });
    const api = await startSyncServer(fixedShareContextProvider(true), { ...fixture, resolveProjectDir: () => dir, resolveSharedProject: async () => null });
    const endpoint = '/api/projects/p1/files/index.html/publish-public';
    expect((await api.json(endpoint, { method: 'POST' })).status).toBe(200);
    const original = await api.json(endpoint);
    broken = true;
    const failed = await api.json(endpoint, { method: 'POST' });
    expect(failed.status).toBe(502);
    expect((await api.json(endpoint)).body.publication).toEqual(original.body.publication);
    expect(publishes).toBe(fault === 'missing-push-id' ? 1 : 2);
  });

  it('stages root assets relative to the share package rather than the hub root', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-share-relative-route-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'assets'));
    await mkdir(path.join(dir, 'images'));
    await writeFile(path.join(dir, 'index.html'), '<link rel="stylesheet" href="/assets/site.css"><img src="/images/bg.png?q#h">');
    await writeFile(path.join(dir, 'assets/site.css'), '.x{background:url(/images/bg.png?css#h)}');
    await writeFile(path.join(dir, 'images/bg.png'), 'image-bytes');
    vi.mocked(readVelaControlApiContext).mockReturnValue({ profile: 'test', apiUrl: 'https://hub.example.test', controlKey: 'ctrl-test', user: null, configMtimeMs: null });
    let staged: { html: string; css: string; image: string } | undefined;
    vi.mocked(runVelaResourceCommand).mockImplementation(async (args) => {
      if (args[0] === 'push') {
        staged = {
          html: await readFile(path.join(args[3]!, 'index.html'), 'utf8'),
          css: await readFile(path.join(args[3]!, 'assets/site.css'), 'utf8'),
          image: await readFile(path.join(args[3]!, 'images/bg.png'), 'utf8'),
        };
        return JSON.stringify({ id: 'v1', version: 1 });
      }
      return JSON.stringify({ slug: 'root-assets', versionId: 'v1' });
    });
    const api = await startSyncServer(fixedShareContextProvider(true), { ...await publicShareFixture(),
        resolveProjectDir: () => dir, resolveSharedProject: async () => null });
    expect((await api.json('/api/projects/p1/files/index.html/publish-public', { method: 'POST' })).status).toBe(200);
    expect(staged?.html).toContain('href="assets/site.css"');
    expect(staged?.html).toContain('src="images/bg.png?q#h"');
    expect(staged?.css).toBe('.x{background:url(../images/bg.png?css#h)}');
    expect(staged?.image).toBe('image-bytes');
  });

  it.each([false, true])('preserves a replaced local publication witness when old stop returns (same slug: %s)', async sameSlug => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-stale-stop-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Original</h1>');
    const reached = publicationBarrier();
    const release = publicationBarrier();
    const fixture = await publicShareFixture({ run: async args => {
      if (args[0] === 'resource') return JSON.stringify({ id: 'v1', version: 1 });
      if (args[1] === 'publish') return confirmedShareOutput(args);
      if (args[1] === 'stop') { reached.resolve(); await release.promise; return JSON.stringify({ status: 'stopped', projectId: 'p1', slug: fixtureSlug }); }
      throw new Error('unexpected command');
    } });
    const api = await startSyncServer(fixedShareContextProvider(true), { ...fixture, resolveProjectDir: () => dir, resolveSharedProject: async () => null });
    const endpoint = '/api/projects/p1/files/index.html/publish-public';
    expect((await api.json(endpoint, { method: 'POST' })).status).toBe(200);
    const stop = api.json(endpoint, { method: 'DELETE', body: { slug: fixtureSlug } });
    const slug = sameSlug ? fixtureSlug : randomUUID();
    const newer = { slug, fileName: 'index.html', url: publicShareViewerUrl('p1', slug, { OD_VELA_WEB_URL: 'https://web.example.test' }) };
    try {
      await Promise.race([reached.promise, stop.then(() => { throw new Error('stop ended before barrier'); })]);
      // Explicit external witness replacement, not an ordinary update changing the stable alias.
      fixture.readProjectShareState.mockResolvedValue({ projectId: 'p1', bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug, status: 'active' }] });
      fixture.publicFilePublicationStore.set({ resourceTeamId: 'team-1', ownerMemberId: 'wm-1', projectId: 'p1', filePath: 'index.html' }, newer);
    } finally { release.resolve(); }
    expect((await stop).status).toBe(200);
    expect((await api.json(endpoint)).body.publication).toEqual(newer);
    // Local revision CAS only; this does not prove remote operation ordering.
  });

  it('hydrates and clears public file publication state', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-public-file-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Published</h1>');
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    vi.mocked(runVelaResourceCommand).mockResolvedValue(JSON.stringify({ id: 'v1', version: 1 }));
    const api = await startSyncServer(fixedShareContextProvider(true), {
      ...await publicShareFixture(),
      resolveProjectDir: () => dir,
      resolveSharedProject: async () => null,
    });

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', { method: 'POST' });
    const current = await api.json('/api/projects/p1/files/index.html/publish-public');
    const unpublish = await api.json('/api/projects/p1/files/index.html/publish-public', {
      method: 'DELETE',
      body: { slug: fixtureSlug },
    });
    const afterUnpublish = await api.json('/api/projects/p1/files/index.html/publish-public');

    const publication = {
      url: `https://web.example.test/artifact/p1/${fixtureSlug}`,
      slug: fixtureSlug,
      fileName: 'index.html',
    };
    expect(publish.status).toBe(200);
    expect(publish.body).toEqual({
      status: 'published', url: `https://web.example.test/artifact/p1/${fixtureSlug}`,
      receipt: { filePath: 'index.html', slug: fixtureSlug, version: 1, versionId: 'v1', publishedAt: 1234, entryPath: 'index.html' },
    });
    expect(current.body.publication).toEqual(publication);
    expect(unpublish.status).toBe(200);
    expect(afterUnpublish.body.publication).toBeNull();
  });

  it('publishes a public file when the project-dir resolver is async (production wiring)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-public-file-'));
    tempDirs.push(dir);
    await writeFile(path.join(dir, 'index.html'), '<h1>Published</h1>');
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    vi.mocked(runVelaResourceCommand).mockResolvedValue(JSON.stringify({ id: 'v1', version: 1 }));
    // Production injects resolveProjectDir as an async resolver (it awaits
    // ensureProject before returning the share dir). The handler must await it;
    // otherwise the raw Promise reaches realpath and the owner gets a spurious
    // FILE_UNAVAILABLE even though the file is present and readable.
    const api = await startSyncServer(fixedShareContextProvider(true), {
      ...await publicShareFixture(),
      resolveProjectDir: async () => dir,
      resolveSharedProject: async () => null,
    });

    const publish = await api.json('/api/projects/p1/files/index.html/publish-public', { method: 'POST' });

    expect(publish.status).toBe(200);
    expect(publish.body).toEqual({
      status: 'published', url: `https://web.example.test/artifact/p1/${fixtureSlug}`,
      receipt: { filePath: 'index.html', slug: fixtureSlug, version: 1, versionId: 'v1', publishedAt: 1234, entryPath: 'index.html' },
    });
  });

  it('rejects escaped and symlinked public file paths before publishing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-public-file-'));
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'od-public-outside-'));
    tempDirs.push(dir, outsideDir);
    await writeFile(path.join(outsideDir, 'secret.html'), '<h1>Secret</h1>');
    await symlink(path.join(outsideDir, 'secret.html'), path.join(dir, 'secret-link.html'));
    vi.mocked(readVelaControlApiContext).mockReturnValue({
      profile: 'test',
      apiUrl: 'https://hub.example.test',
      controlKey: 'ctrl-test',
      user: null,
      configMtimeMs: null,
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      ...await publicShareFixture(),
        resolveProjectDir: () => dir,
      resolveSharedProject: async () => null,
    });

    const backslash = await api.json('/api/projects/p1/files/nested%5Csecret.html/publish-public', { method: 'POST' });
    const symlinked = await api.json('/api/projects/p1/files/secret-link.html/publish-public', { method: 'POST' });

    expect(backslash.status).toBe(400);
    expect(backslash.body.error).toBe('invalid_file_path');
    expect(symlinked.status).toBe(400);
    expect(symlinked.body.error).toBe('FILE_UNAVAILABLE');
    expect(runVelaResourceCommand).not.toHaveBeenCalled();
  });

  it('writes and removes the Vela team-project catalog around share intents', async () => {
    const writes: unknown[] = [];
    const removes: string[] = [];
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      undefined,
      {
        adapter: {
          publish: async () => ({ version: 1, versionId: 'version-1' }),
          unpublish: async () => {},
        },
        describeProject: () => ({
          name: 'Electric Studio 2',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
        }),
        teamProjectCatalog: {
          upsert: async (input) => {
            writes.push(input);
          },
          remove: async (projectId) => {
            removes.push(projectId);
          },
        },
      },
    );

    const share = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(share.status).toBe(200);
    expect(writes).toEqual([
      {
        projectId: 'p1',
        resourceId: projectResourceIdFor('p1', {
          teamId: 'team-1',
          memberId: 'wm-1',
          role: 'member',
          lifecycleState: 'active',
        }),
        displayName: 'Electric Studio 2',
        syncState: 'synced',
        lastSyncedVersionId: 'version-1',
        metadata: {
          name: 'Electric Studio 2',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 2,
        },
      },
    ]);

    const unshare = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_unshare_requested', projectId: 'p1' },
    });
    expect(unshare.status).toBe(200);
    expect(removes).toEqual(['p1']);
  });

  it('does not pretend a project is shared when the Vela catalog write fails', async () => {
    const unpublish = vi.fn(async () => undefined);
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      undefined,
      {
        adapter: {
          publish: async () => ({ version: 1, versionId: 'version-1' }),
          unpublish,
        },
        teamProjectCatalog: {
          upsert: async () => {
            throw new Error('catalog unavailable');
          },
          remove: async () => {},
        },
      },
    );

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('TEAM_PROJECT_PUBLISH_UNAVAILABLE');
    expect(unpublish).toHaveBeenCalledTimes(1);
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('sync_failed');
  });

  it('does not write the team catalog when resource publishing fails', async () => {
    const writes: unknown[] = [];
    const api = await startSyncServer(
      fixedShareContextProvider(true),
      undefined,
      {
        teamProjectCatalog: {
          upsert: async (input) => {
            writes.push(input);
          },
          remove: async () => {},
        },
        adapter: {
          publish: async () => {
            throw new Error('resource hub unavailable');
          },
          syncLatest: async () => null,
          pull: async () => null,
          unpublish: async () => {},
        },
      },
    );

    const res = await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('TEAM_PROJECT_PUBLISH_UNAVAILABLE');
    expect(writes).toEqual([]);
    expect((await api.json('/api/projects/p1/collab/status')).body.syncState).toBe('sync_failed');
  });

  it('rejects spoofed workspace headers without publishing, pulling, or materializing', async () => {
    const authoritativeContext =
      await fixedShareContextProvider(true).current({});
    if (!authoritativeContext) {
      throw new Error('expected authoritative Team context fixture');
    }
    const projectStore = fakeProjectStore();
    const publish = vi.fn(async () => ({ version: 1 }));
    const pull = vi.fn(async () => ({ version: 1 }));
    const api = await startSyncServer(
      { current: async () => null },
      {
        projectStore,
        resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
        verifyWorkspaceRequest: async (req) =>
          req.get('x-od-workspace-id') === authoritativeContext.workspaceId
          && req.get('x-od-workspace-member-id')
            === authoritativeContext.workspaceMemberId
            ? authoritativeContext
            : null,
        verifyWorkspaceScope: async (scope) =>
          scope.workspaceId === authoritativeContext.workspaceId
          && scope.viewerMemberId
            === authoritativeContext.workspaceMemberId,
        resolveSharedProjectOwner: async () =>
          authoritativeContext.workspaceMemberId,
        resolveSharedProject: async (projectId, scope) => ({
          projectId,
          ownerMemberId:
            scope?.ownerMemberId ?? authoritativeContext.workspaceMemberId,
          sharedAt: '2026-07-30T00:00:00.000Z',
        }),
      },
      {
        adapter: {
          publish,
          pull,
          syncLatest: vi.fn(async () => ({ version: 1 })),
        },
      },
    );
    const headers = {
      'x-od-workspace-id': 'ws-spoofed',
      'x-od-workspace-member-id': 'member-spoofed',
      'x-od-workspace-role': 'owner',
    };

    const intent = await api.json('/api/projects/spoofed-project/collab/sync-intent', {
      method: 'POST',
      workspaceScope: false,
      headers,
      body: {
        event: 'project_team_share_requested',
        projectId: 'spoofed-project',
      },
    });
    const status = await api.json(
      '/api/projects/spoofed-project/collab/status',
      {
        workspaceScope: false,
        headers,
      },
    );
    const pullResponse = await api.json(
      '/api/projects/spoofed-project/collab/pull',
      {
        method: 'POST',
        workspaceScope: false,
        headers,
      },
    );

    expect(intent.status).toBe(403);
    expect(status.status).toBe(403);
    expect(pullResponse.status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
    expect(projectStore.has('spoofed-project')).toBe(false);
    expect(runtime!.projectSyncState(
      'spoofed-project',
      contextToResourceHubPrincipal(authoritativeContext)!,
    )).toBe('local_only');
  });

  it('returns retryable 503s before collab side effects when Workspace authority is unavailable', async () => {
    const projectStore = fakeProjectStore();
    const resolveSharedProjectOwner = vi.fn(async () => 'member-1');
    const resolveSharedProject = vi.fn(async () => ({
      projectId: 'authority-outage',
      ownerMemberId: 'member-1',
      sharedAt: '2026-07-30T00:00:00.000Z',
    }));
    const api = await startSyncServer(undefined, {
      projectStore,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner,
      resolveSharedProject,
      verifyWorkspaceRequest: async () => ({
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      }),
    });
    const notifyChanged = vi.spyOn(runtime!.scheduler, 'notifyChanged');

    const responses = [
      await api.json('/api/projects/authority-outage/collab/publish', {
        method: 'POST',
      }),
      await api.json('/api/projects/authority-outage/collab/status'),
      await api.json('/api/projects/authority-outage/collab/pull', {
        method: 'POST',
      }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        retryable: true,
      });
    }
    expect(notifyChanged).not.toHaveBeenCalled();
    expect(resolveSharedProjectOwner).not.toHaveBeenCalled();
    expect(resolveSharedProject).not.toHaveBeenCalled();
    expect(projectStore.has('authority-outage')).toBe(false);
  });

  it('pulls the published head for a member (null before any publish)', async () => {
    const api = await startSyncServer(undefined, {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });
    const before = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(before.status).toBe(403);
    expect(before.body.error).toBe('WORKSPACE_PROJECT_PULL_DENIED');

    await api.json('/api/projects/p1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested', projectId: 'p1' },
    });
    await api.awaitPublishedVersion('/api/projects/p1/collab/status', null);
    const after = await api.json('/api/projects/p1/collab/pull', { method: 'POST' });
    expect(after.body.version).toBe(1);
  });

  it('finishes the exact scoped transfer token when a shared pull succeeds', async () => {
    const pullScope: TeamMirrorPullScope = {
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-1',
      ownerMemberId: 'wm-owner',
    };
    const transferStates = createProjectContentTransferStateStore();
    const beginContentTransfer = vi.fn(
      (projectId: string, scope: TeamMirrorPullScope, version?: number) =>
        transferStates.begin({ projectId, ...scope }, version).token,
    );
    const finishContentTransfer = vi.fn(
      (
        projectId: string,
        scope: TeamMirrorPullScope,
        token: ReturnType<typeof beginContentTransfer>,
        version?: number,
      ) => {
        transferStates.finish({ projectId, ...scope }, token, version);
      },
    );
    const api = await startSyncServer(fixedShareContextProvider(true), {
      beginContentTransfer,
      finishContentTransfer,
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async (projectId) => ({
        projectId,
        ownerMemberId: pullScope.ownerMemberId,
        sharedAt: '2026-07-25T00:00:00.000Z',
      }),
    });
    await runtime!.requestTeamShare('p1', {
      teamId: pullScope.resourceTeamId,
      memberId: pullScope.ownerMemberId,
      role: 'owner',
      lifecycleState: 'active',
      workspaceType: 'team',
    });

    const pull = await api.handle.pullSharedProject('p1', pullScope);

    expect(pull).toEqual({ status: 'pulled', version: 1 });
    expect(beginContentTransfer).toHaveBeenCalledTimes(1);
    const [projectId, scope, version] =
      beginContentTransfer.mock.calls[0]!;
    const token = beginContentTransfer.mock.results[0]!.value;
    expect(projectId).toBe('p1');
    expect(scope).toEqual(pullScope);
    expect(version).toBeUndefined();
    expect(finishContentTransfer).toHaveBeenCalledWith(
      'p1',
      scope,
      token,
      1,
    );
    expect(transferStates.read({ projectId, ...scope })).toMatchObject({
      status: 'idle',
      version: 1,
    });
  });

  it('refuses to pull a project that is no longer team-shared (revocation)', async () => {
    // The team catalog no longer lists this project (the owner moved it out of
    // the team). A stale local copy on a former member's daemon must not be able
    // to keep pulling fresh content, and the mirror is flagged revoked so its
    // files stop being served.
    const revoked: Array<{ projectId: string; revoked: boolean }> = [];
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveSharedProjectOwner: async () => 'wm-1',
      resolveSharedProject: async () => null,
      markTeamProjectRevoked: (projectId, value) => revoked.push({ projectId, revoked: value }),
    });

    const pull = await api.json('/api/projects/moved-out-project/collab/pull', { method: 'POST' });

    expect(pull.status).toBe(403);
    expect(pull.body.error).toBe('WORKSPACE_PROJECT_PULL_DENIED');
    expect(revoked).toContainEqual({ projectId: 'moved-out-project', revoked: true });
  });

  it('does not register a placeholder project when there is no published version to pull', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolveSharedProject: async (projectId) => ({
        projectId,
        ownerMemberId: 'wm-1',
        sharedAt: '2026-07-30T00:00:00.000Z',
      }),
    });

    const pull = await api.json('/api/projects/unpublished-shared/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);
    expect(pull.body.version).toBeNull();
    expect(store.has('unpublished-shared')).toBe(false);
  });

  it('fails the pull route when a pulled shared project cannot be registered locally', async () => {
    const api = await startSyncServer(undefined, {
      projectStore: {
        get: () => ({ name: 'Existing project' }),
        has: () => true,
        register: () => {},
        materializeTeamMirror: () => {
          throw new Error('project store unavailable');
        },
      },
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    await api.json('/api/projects/shared-register-fail/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-register-fail/collab/status', null);
    const pull = await api.json('/api/projects/shared-register-fail/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(502);
    expect(pull.body.error).toBe('TEAM_PROJECT_PULL_REGISTER_UNAVAILABLE');
  });

  it('registers a pulled shared project locally so it appears in the project store', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    expect(store.has('shared-1')).toBe(false);
    await api.json('/api/projects/shared-1/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-1/collab/status', null);
    const pull = await api.json('/api/projects/shared-1/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);

    // The pull registered a local project record. With no manifest under the
    // (non-existent) pull dir, it falls back to the placeholder name.
    expect(store.has('shared-1')).toBe(true);
    expect(store.projects.get('shared-1')?.name).toBe('共享项目');
  });

  it('notifies notifyFilesChanged after a successful pull, so an open FileViewer refreshes without depending on chokidar surviving the pull\'s directory-replace (recvq6CIesNvWZ)', async () => {
    const store = fakeProjectStore();
    const notifyFilesChanged = vi.fn();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      notifyFilesChanged,
    });

    await api.json('/api/projects/shared-notify/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-notify/collab/status', null);
    expect(notifyFilesChanged).not.toHaveBeenCalled();
    const pull = await api.json('/api/projects/shared-notify/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);
    expect(notifyFilesChanged).toHaveBeenCalledTimes(1);
    expect(notifyFilesChanged).toHaveBeenCalledWith('shared-notify');
  });

  it('does not call notifyFilesChanged when the pulled project fails to register locally', async () => {
    const notifyFilesChanged = vi.fn();
    const api = await startSyncServer(undefined, {
      projectStore: {
        get: () => ({ name: 'Existing project' }),
        has: () => true,
        register: () => {},
        materializeTeamMirror: () => {
          throw new Error('project store unavailable');
        },
      },
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      notifyFilesChanged,
    });

    await api.json('/api/projects/shared-notify-fail/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-notify-fail/collab/status', null);
    const pull = await api.json('/api/projects/shared-notify-fail/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(502);
    expect(notifyFilesChanged).not.toHaveBeenCalled();
  });

  // recvqhwv6RPU1j: replacing the "共享项目" placeholder record with the real
  // project name happens only in the daemon DB (registerPulledProject). The
  // only post-pull signal used to be `file-changed`, which makes the web
  // refresh the FILE LIST but never re-read the project record — so a member's
  // sidebar/tab title stayed on the placeholder until a manual page reload.
  // A pull that registered or updated the local record must also emit the
  // existing `project-metadata-changed` thin signal (notifyProjectMetadataChanged)
  // so the open project view re-fetches the record and the title follows.
  it('notifies notifyProjectMetadataChanged when a pull replaces the placeholder record with the real name (recvqhwv6RPU1j)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    await writeProjectManifest(dir, {
      schemaVersion: 1,
      id: 'shared-title-notify',
      name: 'Q3 Marketing Site',
      createdAt: 111,
      updatedAt: 222,
    });

    const store = fakeProjectStore();
    store.register({
      id: 'shared-title-notify',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const notifyProjectMetadataChanged = vi.fn();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
      notifyProjectMetadataChanged,
    });

    await api.json('/api/projects/shared-title-notify/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-title-notify/collab/status', null);
    expect(notifyProjectMetadataChanged).not.toHaveBeenCalled();
    const pull = await api.json('/api/projects/shared-title-notify/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);
    expect(store.projects.get('shared-title-notify')?.name).toBe('Q3 Marketing Site');
    expect(notifyProjectMetadataChanged).toHaveBeenCalledTimes(1);
    expect(notifyProjectMetadataChanged).toHaveBeenCalledWith('shared-title-notify');
  });

  it('does not notify notifyProjectMetadataChanged when the pulled project already has its real name locally', async () => {
    const store = fakeProjectStore();
    store.register({
      id: 'shared-title-steady',
      name: 'Already Local',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const notifyProjectMetadataChanged = vi.fn();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      notifyProjectMetadataChanged,
    });

    await api.json('/api/projects/shared-title-steady/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-title-steady/collab/status', null);
    const pull = await api.json('/api/projects/shared-title-steady/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);
    // A content-only pull of an already-named local project changes no
    // metadata the web renders; no spurious refetch signal.
    expect(notifyProjectMetadataChanged).not.toHaveBeenCalled();
  });

  it('prefers the hub project name and metadata when registering a pulled project', async () => {
    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async (projectId) => ({
        projectId,
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-09T00:00:00.000Z',
        name: 'Emerald Editorial',
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        createdAt: 123,
        updatedAt: 456,
        metadata: { kind: 'deck', entryFile: 'index.html' },
      }),
    });

    await runtime!.requestTeamShare('shared-from-hub', {
      teamId: 'team-1',
      memberId: 'wm-owner',
      role: 'owner',
      lifecycleState: 'active',
      workspaceType: 'team',
    });
    const pull = await api.json('/api/projects/shared-from-hub/collab/pull', { method: 'POST' });
    expect(pull.status).toBe(200);

    const registered = store.projects.get('shared-from-hub');
    expect(registered?.name).toBe('Emerald Editorial');
    expect(registered?.skillId).toBe('deck-builder');
    expect(registered?.designSystemId).toBe('ds-emerald');
    expect(registered?.createdAt).toBe(123);
    expect(registered?.updatedAt).toBe(456);
    expect(registered?.metadata).toEqual({ kind: 'deck', entryFile: 'index.html' });
  });

  it('registers a pulled shared project under its real name from the manifest', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    // The shared tree carries the owner's project manifest; register-on-pull
    // reads it so the local record shows the real name after opening.
    await writeProjectManifest(dir, {
      schemaVersion: 1,
      id: 'shared-2',
      name: 'Team Roadmap',
      createdAt: 111,
      updatedAt: 222,
      skillId: 'live-artifact',
      designSystemId: 'ds-9',
    });

    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-2/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-2/collab/status', null);
    await api.json('/api/projects/shared-2/collab/pull', { method: 'POST' });
    const registered = store.projects.get('shared-2');
    expect(registered?.name).toBe('Team Roadmap');
    expect(registered?.skillId).toBe('live-artifact');
    expect(registered?.designSystemId).toBe('ds-9');
    expect(registered?.createdAt).toBe(111);
    expect(registered?.updatedAt).toBe(222);
  });

  it('infers a pulled shared project name from the bundled skill manifest when no project manifest exists', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, '.od-skills', 'fs-emerald'), { recursive: true });
    await writeFile(
      path.join(dir, '.od-skills', 'fs-emerald', 'open-design.json'),
      JSON.stringify({ title: 'Emerald Editorial', name: 'example-fs-emerald-editorial' }),
    );

    const store = fakeProjectStore();
    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-skill/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-skill/collab/status', null);
    await api.json('/api/projects/shared-skill/collab/pull', { method: 'POST' });
    expect(store.projects.get('shared-skill')?.name).toBe('Emerald Editorial');
  });

  it('repairs an existing placeholder pulled project name once pulled files expose a title', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-pull-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, '.od-skills', 'fs-emerald'), { recursive: true });
    await writeFile(
      path.join(dir, '.od-skills', 'fs-emerald', 'open-design.json'),
      JSON.stringify({ title: 'Emerald Editorial' }),
    );

    const store = fakeProjectStore();
    store.register({
      id: 'shared-placeholder',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: () => dir,
    });

    await api.json('/api/projects/shared-placeholder/collab/sync-intent', {
      method: 'POST',
      body: { event: 'project_team_share_requested' },
    });
    await api.awaitPublishedVersion('/api/projects/shared-placeholder/collab/status', null);
    await api.json('/api/projects/shared-placeholder/collab/pull', { method: 'POST' });
    expect(store.registerCalls).toBe(1);
    expect(store.projects.get('shared-placeholder')?.name).toBe('Emerald Editorial');
  });

  it('is idempotent — a pull for an already-local project does not re-register it', async () => {
    const store = fakeProjectStore();
    store.register({
      id: 'shared-3',
      name: 'Already Local',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(store.registerCalls).toBe(1);

    const api = await startSyncServer(undefined, {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
    });

    await api.json('/api/projects/shared-3/collab/pull', { method: 'POST' });
    // Still exactly one registration; the existing record is left untouched.
    expect(store.registerCalls).toBe(1);
    expect(store.projects.get('shared-3')?.name).toBe('Already Local');
  });

  it('derives read-only from the hub at status time — no pull or in-memory record needed', async () => {
    const api = await startSyncServer(undefined, {
      resolveSharedProjectOwner: async (projectId) =>
        projectId === 'shared-ro' ? 'wm-owner' : null,
    });

    // Straight to status: no pull, no in-memory share record. A project the hub
    // lists as shared by wm-owner reports synced + that owner, so a non-owner
    // member's client (`shared && !isOwner`) renders it single-writer read-only.
    // Deriving every read is what makes read-only survive a daemon restart (which
    // clears the in-memory maps) and an already-pulled project opened without a
    // re-pull — the bug was the pull never recording this at all.
    const status = await api.json('/api/projects/shared-ro/collab/status');
    expect(status.body.syncState).toBe('synced');
    expect(status.body.ownerMemberId).toBe('wm-owner');
  });

  it('leaves a project the hub does not list editable (local_only)', async () => {
    const api = await startSyncServer(undefined, {
      resolveSharedProjectOwner: async () => null,
    });
    const status = await api.json('/api/projects/not-shared/collab/status');
    // Not team-shared → no read-only: the member keeps full edit on their own
    // local project. Read-only never fires just because a status probe ran.
    expect(status.body.syncState).toBe('local_only');
    expect(status.body.ownerMemberId).toBeNull();
  });
});

// recvqmKQRiIlYf: the hub push channel needs a daemon-internal way to run the
// SAME pull flow POST /collab/pull runs (revocation gate → pull → register →
// file/metadata signals) without an HTTP request, and racing pulls for one
// project (proactive pull vs the member web's poll-triggered POST) must
// coalesce onto one materialization instead of two full-tree pulls.
describe('collab sync pull handle (daemon-internal proactive pull)', () => {
  const pullScope: TeamMirrorPullScope = {
    workspaceId: 'ws-1',
    resourceTeamId: 'team-1',
    viewerMemberId: 'wm-1',
    ownerMemberId: 'wm-owner',
  };
  const resolvePulledSharedProject = async (projectId: string) => ({
    projectId,
    ownerMemberId: pullScope.ownerMemberId,
    sharedAt: '2026-07-25T00:00:00.000Z',
  });
  const authorizedReceipt = (
    projectId: string,
    version: number,
  ): AuthorizedTeamProjectPullReceipt => {
    const now = Date.now();
    return {
      schemaVersion: 1,
      ...pullScope,
      projectId,
      resourceId: projectResourceIdFor(projectId, {
        teamId: pullScope.resourceTeamId,
        memberId: pullScope.ownerMemberId,
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      }),
      ref: 'published',
      version,
      versionId: `version-${version}`,
      manifestDigest: `sha256:${'a'.repeat(64)}`,
      lifecycleState: 'active',
      // Exercise the allowed small positive server/local clock skew while
      // leaving enough wall-clock headroom for parallel test scheduling.
      authorizedAt: new Date(now + 500).toISOString(),
      expiresAt: new Date(now + 2_500).toISOString(),
    };
  };

  it('materializes content and fires the same post-pull signals as POST /collab/pull', async () => {
    const store = fakeProjectStore();
    const notifyFilesChanged = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      notifyFilesChanged,
    });

    await runtime!.requestTeamShare('handle-pull', {
      teamId: pullScope.resourceTeamId,
      memberId: pullScope.ownerMemberId,
      role: 'owner',
      lifecycleState: 'active',
      workspaceType: 'team',
    });

    const outcome = await api.handle.pullSharedProject('handle-pull', pullScope);
    expect(outcome).toEqual({ status: 'pulled', version: 1 });
    expect(store.has('handle-pull')).toBe(true);
    expect(store.bindings.get('handle-pull')).toEqual(pullScope);
    expect(notifyFilesChanged).toHaveBeenCalledTimes(1);
    expect(notifyFilesChanged).toHaveBeenCalledWith('handle-pull');
  });

  it('fails both pull surfaces before notifications when the durable cursor cannot commit', async () => {
    const materializedVersion = 4;
    const notifyFilesChanged = vi.fn();
    const notifyProjectMetadataChanged = vi.fn();
    const writeMaterializedVersion = vi.fn(async () => {
      throw new Error('cursor disk unavailable');
    });
    const store = fakeProjectStore();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      readMaterializedVersion: () => materializedVersion,
      writeMaterializedVersion,
      notifyFilesChanged,
      notifyProjectMetadataChanged,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    expect(await api.awaitPublishedVersion(
      '/api/projects/cursor-fail/collab/status',
      null,
    )).toBe(5);
    const before = await api.json('/api/projects/cursor-fail/collab/status');
    expect(before.body.materializedVersion).toBe(4);

    const viaHandle = await api.handle.pullSharedProject('cursor-fail', pullScope);
    expect(viaHandle).toEqual({ status: 'register_failed' });
    const viaRoute = await api.json('/api/projects/cursor-fail/collab/pull', {
      method: 'POST',
      headers: {
        'x-od-workspace-id': pullScope.workspaceId,
        'x-od-workspace-member-id': pullScope.viewerMemberId,
        'x-od-workspace-role': 'member',
      },
    });
    expect(viaRoute.status).toBe(502);
    expect(notifyFilesChanged).not.toHaveBeenCalled();
    expect(notifyProjectMetadataChanged).not.toHaveBeenCalled();

    // A failed disk commit never advances the value status exposes, so both
    // proactive events and the web floor remain free to retry version 5.
    const after = await api.json('/api/projects/cursor-fail/collab/status');
    expect(after.body.materializedVersion).toBe(4);
  });

  it('fails closed when a scoped pull cannot prove the team mirror binding', async () => {
    const notifyFilesChanged = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: {
        get: () => null,
        has: () => false,
        register: () => undefined,
      },
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      notifyFilesChanged,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const outcome = await api.handle.pullSharedProject('handle-unbound', pullScope);
    expect(outcome).toEqual({ status: 'register_failed' });
    expect(notifyFilesChanged).not.toHaveBeenCalled();
  });

  it('fails closed when the authoritative shared-project lookup throws for a scoped pull', async () => {
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const store = fakeProjectStore();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async () => {
        throw new Error('catalog unavailable');
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const outcome = await api.handle.pullSharedProject('handle-catalog-error', pullScope);
    expect(outcome).toEqual({ status: 'register_failed' });
    expect(adapterPull).not.toHaveBeenCalled();
    expect(store.has('handle-catalog-error')).toBe(false);
  });

  it('starts the independent initial scope and catalog guards concurrently', async () => {
    let releaseInitialScope!: () => void;
    let initialScopeStarted!: () => void;
    const initialScopeGate = new Promise<void>((resolve) => {
      releaseInitialScope = resolve;
    });
    const initialScopeStart = new Promise<void>((resolve) => {
      initialScopeStarted = resolve;
    });
    let scopeCalls = 0;
    const verifyWorkspaceScope = vi.fn(async () => {
      scopeCalls += 1;
      if (scopeCalls === 1) {
        initialScopeStarted();
        await initialScopeGate;
      }
      return true;
    });
    const resolveSharedProject = vi.fn(async (projectId: string) => ({
      projectId,
      ownerMemberId: pullScope.ownerMemberId,
      sharedAt: '2026-07-25T00:00:00.000Z',
    }));
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject,
      verifyWorkspaceScope,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const outcomePromise = api.handle.pullSharedProject(
      'handle-parallel-guards',
      pullScope,
    );
    await initialScopeStart;
    await Promise.resolve();
    const catalogStartedBeforeInitialScopeFinished =
      resolveSharedProject.mock.calls.length;
    releaseInitialScope();

    await expect(outcomePromise).resolves.toEqual({
      status: 'pulled',
      version: 5,
    });
    expect(catalogStartedBeforeInitialScopeFinished).toBe(1);
  });

  it('reuses a fresh internal guard witness but keeps post-pull reauthorization', async () => {
    const resolveSharedProject = vi.fn(resolvePulledSharedProject);
    const verifyWorkspaceScope = vi.fn(async () => true);
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject,
      verifyWorkspaceScope,
      onPullTiming,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const projectId = 'handle-fresh-witness';
    const witness = await mintProactivePullWitness(projectId, pullScope, 5);
    const outcome = await api.handle.pullSharedProject(
      projectId,
      pullScope,
      witness,
      5,
    );

    expect(outcome).toEqual({ status: 'pulled', version: 5 });
    // The witness replaces only the duplicate PRE-transport checks. The final
    // uncached catalog + exact-scope gates still run immediately before the
    // mirror transaction.
    expect(resolveSharedProject).toHaveBeenCalledTimes(1);
    expect(verifyWorkspaceScope).toHaveBeenCalledTimes(1);
    expect(onPullTiming).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'initial-authorization-reused',
      projectId: 'handle-fresh-witness',
      version: 5,
    }));
  });

  it('falls back to all initial gates for a copied witness', async () => {
    const resolveSharedProject = vi.fn(resolvePulledSharedProject);
    const verifyWorkspaceScope = vi.fn(async () => true);
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject,
      verifyWorkspaceScope,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const projectId = 'handle-copied-witness';
    const witness = await mintProactivePullWitness(projectId, pullScope, 5);
    const outcome = await api.handle.pullSharedProject(
      projectId,
      pullScope,
      { ...witness },
      5,
    );

    expect(outcome).toEqual({ status: 'pulled', version: 5 });
    expect(resolveSharedProject).toHaveBeenCalledTimes(2);
    expect(verifyWorkspaceScope).toHaveBeenCalledTimes(3);
  });

  it('ignores an authorization-witness-shaped HTTP body', async () => {
    const resolveSharedProject = vi.fn(resolvePulledSharedProject);
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject,
      onPullTiming,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const projectId = 'http-witness-injection';
    const witness = await mintProactivePullWitness(projectId, pullScope, 5);

    const response = await api.json(
      `/api/projects/${projectId}/collab/pull`,
      {
        method: 'POST',
        headers: {
          'x-od-workspace-id': pullScope.workspaceId,
          'x-od-workspace-member-id': pullScope.viewerMemberId,
          'x-od-workspace-role': 'member',
        },
        body: {
          authorizationWitness: witness,
          expectedVersion: 5,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(resolveSharedProject).toHaveBeenCalledTimes(2);
    expect(
      onPullTiming.mock.calls.some(
        ([event]) => event.phase === 'initial-authorization-reused',
      ),
    ).toBe(false);
  });

  it('uses the authorized staged transport only for a branded proactive invocation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-route-'));
    tempDirs.push(root);
    const liveDir = path.join(root, 'project');
    const stageDir = path.join(root, '.project.od-pull-stage-test');
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Staged project</title>');
    const receipt = authorizedReceipt('authorized-fast', 5);
    const stage = vi.fn(async () => ({
      stageDir,
      identity: { dev: '1', ino: '2' },
      receipt,
      cleanup: vi.fn(async () => undefined),
    }));
    const promote = vi.fn(async (input: {
      commit: () => { localRecordChanged: boolean };
      isExpectedVersion: () => boolean;
      validateReceipt: () => void;
    }) => {
      expect(input.isExpectedVersion()).toBe(true);
      input.validateReceipt();
      return input.commit();
    });
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const store = fakeProjectStore();
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: () => liveDir,
      resolveSharedProject: resolvePulledSharedProject,
      onPullTiming,
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 7,
        }),
        stage,
        promote,
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const profileReceivedAtMs = Date.now() - 100;
    const outcome = await invokeThroughProactivePull(
      api.handle,
      'authorized-fast',
      pullScope,
      5,
      profileReceivedAtMs,
    );

    expect(outcome).toEqual({ status: 'pulled', version: 5 });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'authorized-fast',
      liveDir,
      scope: pullScope,
      expectedVersion: 5,
    }));
    expect(promote).toHaveBeenCalledTimes(1);
    expect(adapterPull).not.toHaveBeenCalled();
    expect(store.projects.get('authorized-fast')?.name).toBe('Staged project');
    expect(onPullTiming.mock.calls.map(([event]) => event.phase)).toEqual([
      'route-started',
      'authorized-stage-started',
      'authorized-stage-done',
      'authorized-receipt-validated',
      'authorized-scope-revalidated',
      'promotion-started',
      'version-persisted',
      'promotion-done',
      'route-completed',
    ]);
    expect(onPullTiming.mock.calls.map(([event]) => event.receivedAtMs))
      .toEqual(Array(9).fill(profileReceivedAtMs));
  });

  it('re-acquires one fresh authorized stage when promotion outlives the receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-retry-'));
    tempDirs.push(root);
    const projectId = 'authorized-retry';
    const stageDirs = [
      path.join(root, `.${projectId}.od-pull-stage-first`),
      path.join(root, `.${projectId}.od-pull-stage-second`),
    ];
    await Promise.all(stageDirs.map(async (stageDir) => {
      await mkdir(stageDir);
      await writeFile(path.join(stageDir, 'index.html'), '<title>Fresh stage</title>');
    }));
    let now = Date.parse('2026-08-02T10:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const cleanups = [vi.fn(async () => undefined), vi.fn(async () => undefined)];
    const stage = vi.fn(async () => {
      const index = stage.mock.calls.length - 1;
      return {
        stageDir: stageDirs[index]!,
        identity: { dev: String(index + 1), ino: String(index + 10) },
        receipt: authorizedReceipt(projectId, 5),
        cleanup: cleanups[index]!,
      };
    });
    const promote = vi.fn(async (input: {
      commit: () => { localRecordChanged: boolean };
      validateReceipt: () => void;
    }) => {
      if (promote.mock.calls.length === 1) now += 3_000;
      input.validateReceipt();
      return input.commit();
    });
    const store = fakeProjectStore();
    const materialize = vi.spyOn(store, 'materializeAuthorizedTeamMirror');

    try {
      const api = await startSyncServer(fixedShareContextProvider(true), {
        projectStore: store,
        resolvePullDir: (id) => path.join(root, id),
        resolveSharedProject: resolvePulledSharedProject,
        authorizedTeamProjectPull: {
          journalDir: path.join(root, '.journals'),
          getActiveWorkspaceSnapshot: () => ({
            workspaceId: pullScope.workspaceId,
            generation: 7,
          }),
          stage,
          promote,
        },
      });

      await expect(invokeThroughProactivePull(
        api.handle,
        projectId,
        pullScope,
        5,
      )).resolves.toEqual({ status: 'pulled', version: 5 });
    } finally {
      nowSpy.mockRestore();
    }

    expect(stage).toHaveBeenCalledTimes(2);
    expect(promote).toHaveBeenCalledTimes(2);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(cleanups[1]).toHaveBeenCalledTimes(1);
  });

  it('bounds stale authorized-stage recovery to one retry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-retry-bound-'));
    tempDirs.push(root);
    const projectId = 'authorized-retry-bound';
    const stageDirs = [
      path.join(root, `.${projectId}.od-pull-stage-first`),
      path.join(root, `.${projectId}.od-pull-stage-second`),
    ];
    await Promise.all(stageDirs.map(async (stageDir) => {
      await mkdir(stageDir);
      await writeFile(path.join(stageDir, 'index.html'), '<title>Bounded stage</title>');
    }));
    let now = Date.parse('2026-08-02T11:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const cleanups = [vi.fn(async () => undefined), vi.fn(async () => undefined)];
    const stage = vi.fn(async () => {
      const index = stage.mock.calls.length - 1;
      return {
        stageDir: stageDirs[index]!,
        identity: { dev: String(index + 1), ino: String(index + 10) },
        receipt: authorizedReceipt(projectId, 5),
        cleanup: cleanups[index]!,
      };
    });
    const promote = vi.fn(async (input: { validateReceipt: () => void }) => {
      now += 3_000;
      input.validateReceipt();
      throw new Error('unreachable');
    });
    const store = fakeProjectStore();
    const materialize = vi.spyOn(store, 'materializeAuthorizedTeamMirror');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const api = await startSyncServer(fixedShareContextProvider(true), {
        projectStore: store,
        resolvePullDir: (id) => path.join(root, id),
        resolveSharedProject: resolvePulledSharedProject,
        authorizedTeamProjectPull: {
          journalDir: path.join(root, '.journals'),
          getActiveWorkspaceSnapshot: () => ({
            workspaceId: pullScope.workspaceId,
            generation: 7,
          }),
          stage,
          promote,
        },
      });

      await expect(invokeThroughProactivePull(
        api.handle,
        projectId,
        pullScope,
        5,
      )).resolves.toEqual({ status: 'register_failed' });
    } finally {
      nowSpy.mockRestore();
      warn.mockRestore();
    }

    expect(stage).toHaveBeenCalledTimes(2);
    expect(promote).toHaveBeenCalledTimes(2);
    expect(materialize).not.toHaveBeenCalled();
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(cleanups[1]).toHaveBeenCalledTimes(1);
  });

  it('does not reacquire a receipt when the expired stage cannot be cleaned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-retry-cleanup-'));
    tempDirs.push(root);
    const projectId = 'authorized-retry-cleanup';
    const stageDir = path.join(root, `.${projectId}.od-pull-stage-first`);
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Unclean stage</title>');
    let now = Date.parse('2026-08-02T12:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const cleanup = vi.fn(async () => {
      throw new Error('stage cleanup failed');
    });
    const stage = vi.fn(async () => ({
      stageDir,
      identity: { dev: '1', ino: '10' },
      receipt: authorizedReceipt(projectId, 5),
      cleanup,
    }));
    const promote = vi.fn(async (input: { validateReceipt: () => void }) => {
      now += 3_000;
      input.validateReceipt();
      throw new Error('unreachable');
    });
    const store = fakeProjectStore();
    const materialize = vi.spyOn(store, 'materializeAuthorizedTeamMirror');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const api = await startSyncServer(fixedShareContextProvider(true), {
        projectStore: store,
        resolvePullDir: (id) => path.join(root, id),
        resolveSharedProject: resolvePulledSharedProject,
        authorizedTeamProjectPull: {
          journalDir: path.join(root, '.journals'),
          getActiveWorkspaceSnapshot: () => ({
            workspaceId: pullScope.workspaceId,
            generation: 7,
          }),
          stage,
          promote,
        },
      });

      await expect(invokeThroughProactivePull(
        api.handle,
        projectId,
        pullScope,
        5,
      )).resolves.toEqual({ status: 'register_failed' });
    } finally {
      nowSpy.mockRestore();
      warn.mockRestore();
    }

    expect(stage).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(materialize).not.toHaveBeenCalled();
  });

  it('coalesces direct, targeted, and broad recovery onto one stable authorized promotion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-overlap-'));
    tempDirs.push(root);
    const projectId = 'authorized-overlap';
    const liveDir = path.join(root, projectId);
    const stageDir = path.join(
      root,
      `.${projectId}.od-pull-stage-overlap`,
    );
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), 'old');
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), 'new');
    let releaseStage!: () => void;
    const stageGate = new Promise<void>((resolve) => {
      releaseStage = resolve;
    });
    const stage = vi.fn(async () => {
      await stageGate;
      const identity = await lstat(stageDir);
      return {
        stageDir,
        identity: {
          dev: String(identity.dev),
          ino: String(identity.ino),
        },
        receipt: authorizedReceipt(projectId, 5),
        cleanup: vi.fn(async () => undefined),
      };
    });
    const observedLiveVersions: string[] = [];
    const promote = vi.fn((
      input: PromoteAuthorizedTeamProjectStageInput<{
        localRecordChanged: boolean;
      }>,
    ) =>
      promoteAuthorizedTeamProjectStage({
        ...input,
        durability: {
          syncDirectory: async () => {
            observedLiveVersions.push(
              await readFile(path.join(liveDir, 'index.html'), 'utf8'),
            );
          },
        },
      }));
    const store = fakeProjectStore();
    const materializeAuthorized = vi.spyOn(
      store,
      'materializeAuthorizedTeamMirror',
    );
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: () => liveDir,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote,
      },
    });
    const proactive = createProactiveContentPull({
      getLocalBinding: () => ({
        workspaceId: pullScope.workspaceId,
        visibility: 'team',
      }),
      getWorkspaceIdentity: async () => ({
        workspaceId: pullScope.workspaceId,
        resourceTeamId: pullScope.resourceTeamId,
        workspaceMemberId: pullScope.viewerMemberId,
      }),
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      pullSharedProject: (target, version) =>
        api.handle.pullSharedProject(
          target.projectId,
          pullScope,
          target.authorizationWitness,
          version,
          target.authorizedStageInvocation,
        ),
      listSharedProjects: async () => [{
        projectId,
        ownerMemberId: pullScope.ownerMemberId,
      }],
      hasMaterializedProject: () => false,
      publishedHead: async () => 5,
      materializedVersion: () => '4',
    });

    try {
      const direct = proactive.handleContentChanged({
        projectId,
        workspaceId: pullScope.workspaceId,
        version: 5,
      });
      await vi.waitFor(() => expect(stage).toHaveBeenCalledTimes(1));
      expect(await readFile(path.join(liveDir, 'index.html'), 'utf8'))
        .toBe('old');

      const targeted = proactive.materializeMissingProjects(
        pullScope.workspaceId,
        projectId,
      );
      const broad = proactive.catchUpPublishedHeads(
        pullScope.workspaceId,
      );
      await Promise.resolve();
      expect(stage).toHaveBeenCalledTimes(1);
      releaseStage();
      await Promise.all([direct, targeted, broad]);
    } finally {
      proactive.dispose();
    }

    expect(stage).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(1);
    expect(materializeAuthorized).toHaveBeenCalledTimes(1);
    expect(observedLiveVersions.every(
      (version) => version === 'old' || version === 'new',
    )).toBe(true);
    expect(observedLiveVersions).toContain('old');
    expect(observedLiveVersions.at(-1)).toBe('new');
    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8'))
      .toBe('new');
  });

  it('coalesces an authorized stage and legacy POST for the same scope and version', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-cross-lane-pull-'));
    tempDirs.push(root);
    const projectId = 'cross-lane-pull';
    const liveDir = path.join(root, projectId);
    const stageDir = path.join(root, `.${projectId}.od-pull-stage-test`);
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), '<title>Version four</title>');
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Version five</title>');
    let releaseStage!: () => void;
    const stageGate = new Promise<void>((resolve) => {
      releaseStage = resolve;
    });
    const stage = vi.fn(async () => {
      await stageGate;
      const identity = await lstat(stageDir);
      return {
        stageDir,
        identity: {
          dev: String(identity.dev),
          ino: String(identity.ino),
        },
        receipt: authorizedReceipt(projectId, 5),
        cleanup: vi.fn(async () => undefined),
      };
    });
    const promote = vi.fn((
      input: PromoteAuthorizedTeamProjectStageInput<{
        localRecordChanged: boolean;
      }>,
    ) => promoteAuthorizedTeamProjectStage(input));
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: () => liveDir,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote,
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const proactive = createProactiveContentPull({
      getLocalBinding: () => ({
        workspaceId: pullScope.workspaceId,
        visibility: 'team',
      }),
      getWorkspaceIdentity: async () => ({
        workspaceId: pullScope.workspaceId,
        resourceTeamId: pullScope.resourceTeamId,
        workspaceMemberId: pullScope.viewerMemberId,
      }),
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      pullSharedProject: (target, version) =>
        api.handle.pullSharedProject(
          target.projectId,
          pullScope,
          target.authorizationWitness,
          version,
          target.authorizedStageInvocation,
        ),
    });

    try {
      const authorized = proactive.handleContentChanged({
        projectId,
        workspaceId: pullScope.workspaceId,
        version: 5,
      });
      await vi.waitFor(() => expect(stage).toHaveBeenCalledTimes(1));
      const legacy = api.json(`/api/projects/${projectId}/collab/pull`, {
        method: 'POST',
        headers: {
          'x-od-workspace-id': pullScope.workspaceId,
          'x-od-workspace-member-id': pullScope.viewerMemberId,
          'x-od-workspace-role': 'member',
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      releaseStage();

      const [, legacyResponse] = await Promise.all([authorized, legacy]);
      expect(legacyResponse.status).toBe(200);
      expect(legacyResponse.body.version).toBe(5);
    } finally {
      proactive.dispose();
    }

    expect(stage).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(1);
    expect(adapterPull).not.toHaveBeenCalled();
  });

  it('fails a joined authorized waiter closed when it becomes stale before legacy completion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-cross-lane-stale-'));
    tempDirs.push(root);
    const projectId = 'cross-lane-stale';
    const liveDir = path.join(root, projectId);
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), '<title>Version five</title>');
    let releaseLegacy!: () => void;
    const legacyGate = new Promise<void>((resolve) => {
      releaseLegacy = resolve;
    });
    let reportLegacyStarted!: () => void;
    const legacyStarted = new Promise<void>((resolve) => {
      reportLegacyStarted = resolve;
    });
    const adapterPull = vi.fn(async () => {
      reportLegacyStarted();
      await legacyGate;
      return { version: 5 };
    });
    const stage = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: () => liveDir,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const onPulled = vi.fn();
    let reportAuthorizedJoined!: () => void;
    const authorizedJoined = new Promise<void>((resolve) => {
      reportAuthorizedJoined = resolve;
    });
    const proactive = createProactiveContentPull({
      getLocalBinding: () => ({
        workspaceId: pullScope.workspaceId,
        visibility: 'team',
      }),
      getWorkspaceIdentity: async () => ({
        workspaceId: pullScope.workspaceId,
        resourceTeamId: pullScope.resourceTeamId,
        workspaceMemberId: pullScope.viewerMemberId,
      }),
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      pullSharedProject: (target, version) => {
        reportAuthorizedJoined();
        return api.handle.pullSharedProject(
          target.projectId,
          pullScope,
          target.authorizationWitness,
          version,
          target.authorizedStageInvocation,
        );
      },
      onPulled,
    });

    const legacy = api.json(`/api/projects/${projectId}/collab/pull`, {
      method: 'POST',
      headers: {
        'x-od-workspace-id': pullScope.workspaceId,
        'x-od-workspace-member-id': pullScope.viewerMemberId,
        'x-od-workspace-role': 'member',
      },
    });
    await legacyStarted;
    const authorized = proactive.handleContentChanged({
      projectId,
      workspaceId: pullScope.workspaceId,
      version: 5,
    });
    await authorizedJoined;
    proactive.dispose();
    releaseLegacy();

    const [legacyResponse] = await Promise.all([legacy, authorized]);
    expect(legacyResponse.status).toBe(200);
    expect(stage).not.toHaveBeenCalled();
    expect(adapterPull).toHaveBeenCalledTimes(1);
    expect(onPulled).not.toHaveBeenCalled();
  });

  it('adopts a durable legacy success before a queued authorized retry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-cross-lane-retry-'));
    tempDirs.push(root);
    const projectId = 'cross-lane-retry';
    const liveDir = path.join(root, projectId);
    const stageDir = path.join(root, `.${projectId}.od-pull-stage-test`);
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Version five</title>');
    let durableVersion = 4;
    const stage = vi.fn(async () => ({
      stageDir,
      identity: { dev: '1', ino: '2' },
      receipt: authorizedReceipt(projectId, 5),
      cleanup: vi.fn(async () => undefined),
    }));
    const promote = vi.fn(async () => {
      throw new Error('promotion journal unavailable');
    });
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const retryCallbacks: Array<() => void | Promise<void>> = [];
    let observeLegacyPull = async (
      _observedProjectId: string,
      _observedScope: TeamMirrorPullScope,
      _version: number,
    ): Promise<void> => {};
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: () => liveDir,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      readMaterializedVersion: () => durableVersion,
      writeMaterializedVersion: async (_id, _scope, version) => {
        durableVersion = version;
      },
      onLegacyPullMaterialized: (observedProjectId, observedScope, version) =>
        observeLegacyPull(observedProjectId, observedScope, version),
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote,
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const proactive = createProactiveContentPull({
      getLocalBinding: () => ({
        workspaceId: pullScope.workspaceId,
        visibility: 'team',
      }),
      getWorkspaceIdentity: async () => ({
        workspaceId: pullScope.workspaceId,
        resourceTeamId: pullScope.resourceTeamId,
        workspaceMemberId: pullScope.viewerMemberId,
      }),
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      pullSharedProject: (target, version) =>
        api.handle.pullSharedProject(
          target.projectId,
          pullScope,
          target.authorizationWitness,
          version,
          target.authorizedStageInvocation,
        ),
      materializedVersion: () => String(durableVersion),
      scheduler: {
        setTimeout: (callback) => {
          retryCallbacks.push(callback);
          return callback;
        },
        clearTimeout: (handle) => {
          const index = retryCallbacks.indexOf(
            handle as () => void | Promise<void>,
          );
          if (index >= 0) retryCallbacks.splice(index, 1);
        },
      },
    });
    observeLegacyPull = (observedProjectId, observedScope, version) =>
      proactive.observeMaterialized(
        { projectId: observedProjectId, ...observedScope },
        version,
      );

    try {
      await proactive.handleContentChanged({
        projectId,
        workspaceId: pullScope.workspaceId,
        version: 5,
      });
      expect(stage).toHaveBeenCalledTimes(1);
      expect(promote).toHaveBeenCalledTimes(1);
      expect(retryCallbacks).toHaveLength(1);
      const queuedRetry = retryCallbacks[0];

      const legacy = await api.json(`/api/projects/${projectId}/collab/pull`, {
        method: 'POST',
        headers: {
          'x-od-workspace-id': pullScope.workspaceId,
          'x-od-workspace-member-id': pullScope.viewerMemberId,
          'x-od-workspace-role': 'member',
        },
      });
      expect(legacy.status).toBe(200);
      expect(durableVersion).toBe(5);
      expect(retryCallbacks).toHaveLength(0);

      // Even a timer callback that was already dequeued by the event loop must
      // see the intent was settled by the durable legacy commit.
      await queuedRetry?.();
    } finally {
      proactive.dispose();
    }

    expect(adapterPull).toHaveBeenCalledTimes(1);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(1);
    expect(durableVersion).toBe(5);
  });

  it('commits an exact-scope stage through a context gap and global Workspace switch', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-transient-route-'));
    tempDirs.push(root);
    const projectId = 'authorized-transient-route';
    const liveDir = path.join(root, projectId);
    const stageDir = path.join(root, `.${projectId}.od-pull-stage-test`);
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), '<title>Old project</title>');
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Staged project</title>');

    const activeContext = await fixedShareContextProvider(true).current({});
    if (!activeContext) throw new Error('expected active team context');
    let currentContext: WorkspaceCollabContext | null = activeContext;
    const workspaceContext = withLastKnownWorkspaceContext({
      current: async () => currentContext,
    });
    await workspaceContext.current({});
    const capturedSnapshot = workspaceContext.lastKnownSnapshot!();
    const activeWorkspaceSelection = {
      workspaceId: pullScope.workspaceId,
      generation: 0,
    };
    const getActiveWorkspaceSnapshot = () =>
      resolveAuthorizedActiveTeamWorkspaceSnapshot(
        activeWorkspaceSelection,
        workspaceContext.lastKnownSnapshot!(),
      );

    const db = openDatabase(root, { dataDir: root });
    const projectStore: PulledProjectStore = {
      get: (id) => getProject(db, id),
      has: (id) => getProject(db, id) != null,
      register: () => {
        throw new Error('authorized route must use the transactional materializer');
      },
      materializeAuthorizedTeamMirror: (input, scope, pullReceipt) =>
        materializePulledTeamMirror(db, input, scope, pullReceipt),
    };
    let pullReceipt: AuthorizedTeamProjectPullReceipt | null = null;
    const stage = vi.fn(async () => {
      // Reproduce the production failure window while the Vela child owns the
      // staged bytes: the same active identity briefly becomes unavailable,
      // then recovers before the atomic promotion boundary.
      currentContext = null;
      await workspaceContext.current({});
      currentContext = activeContext;
      await workspaceContext.current({});
      // The operation remains bound to pullScope. A concurrent UI switch is
      // control-plane state and must not cancel or retarget these staged bytes.
      activeWorkspaceSelection.workspaceId = 'workspace-other';
      const now = Date.now();
      pullReceipt = {
        ...authorizedReceipt(projectId, 5),
        authorizedAt: new Date(now - 100).toISOString(),
        expiresAt: new Date(now + 1_900).toISOString(),
      };
      const stat = await lstat(stageDir);
      return {
        stageDir,
        identity: { dev: String(stat.dev), ino: String(stat.ino) },
        receipt: pullReceipt,
        cleanup: async () => {
          await rm(stageDir, { recursive: true, force: true });
        },
      };
    });
    const notifyFilesChanged = vi.fn();

    try {
      const api = await startSyncServer(workspaceContext, {
        projectStore,
        resolvePullDir: () => liveDir,
        resolveSharedProject: resolvePulledSharedProject,
        notifyFilesChanged,
        authorizedTeamProjectPull: {
          journalDir: path.join(root, '.journals'),
          getActiveWorkspaceSnapshot,
          stage,
          promote: promoteAuthorizedTeamProjectStage,
        },
      });

      await expect(invokeThroughProactivePull(
        api.handle,
        projectId,
        pullScope,
        5,
      )).resolves.toEqual({ status: 'pulled', version: 5 });

      expect(workspaceContext.lastKnownSnapshot!()).toEqual(capturedSnapshot);
      expect(await readFile(path.join(liveDir, 'index.html'), 'utf8'))
        .toContain('Staged project');
      expect(getProject(db, projectId)?.name).toBe('Staged project');
      expect(
        getTeamProjectMaterialization(db, pullScope.workspaceId, projectId),
      ).toEqual(pullReceipt);
      expect(notifyFilesChanged).toHaveBeenCalledOnce();
      expect(notifyFilesChanged).toHaveBeenCalledWith(projectId);
    } finally {
      closeDatabase();
    }
  });

  it('logs the project, version, redacted message/cause, and snapshot reason when promotion fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-log-'));
    tempDirs.push(root);
    const liveDir = path.join(root, 'project');
    const stageDir = path.join(root, '.project.od-pull-stage-test');
    await mkdir(stageDir);
    await writeFile(path.join(stageDir, 'index.html'), '<title>Staged project</title>');
    let snapshot = {
      workspaceId: pullScope.workspaceId as string | null,
      generation: 7,
    };
    const stage = vi.fn(async () => ({
      stageDir,
      identity: { dev: '1', ino: '2' },
      receipt: authorizedReceipt('authorized-log', 5),
      cleanup: vi.fn(async () => undefined),
    }));
    const promote = vi.fn(async () => {
      snapshot = { workspaceId: null, generation: 7 };
      throw new Error(
        'active workspace changed while Bearer abcdefghijklmnopqrstuvwxyz',
        {
          cause: new Error(
            'journal rename failed for sk-live-abcdefghijklmnopqrstuvwxyz',
          ),
        },
      );
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const api = await startSyncServer(fixedShareContextProvider(true), {
        projectStore: fakeProjectStore(),
        resolvePullDir: () => liveDir,
        resolveSharedProject: resolvePulledSharedProject,
        authorizedTeamProjectPull: {
          journalDir: path.join(root, '.journals'),
          getActiveWorkspaceSnapshot: () => snapshot,
          stage,
          promote,
        },
      });

      await expect(invokeThroughProactivePull(
        api.handle,
        'authorized-log',
        pullScope,
        5,
      )).resolves.toEqual({ status: 'register_failed' });

      expect(stage).toHaveBeenCalledTimes(1);
      expect(promote).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        '[od] failed to promote authorized team project',
        {
          projectId: 'authorized-log',
          version: 5,
          reason: 'promotion-failed',
          errorName: 'Error',
          errorMessage:
            'active workspace changed while Bearer [REDACTED:bearer_token]',
          errorCause:
            'journal rename failed for [REDACTED:sk_key]',
        },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('never accepts an authorized-stage-shaped HTTP body', async () => {
    const stage = vi.fn();
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const response = await api.json('/api/projects/http-stage-injection/collab/pull', {
      method: 'POST',
      headers: {
        'x-od-workspace-id': pullScope.workspaceId,
        'x-od-workspace-member-id': pullScope.viewerMemberId,
        'x-od-workspace-role': 'member',
      },
      body: {
        authorizedStageInvocation: {
          kind: 'authorized-proactive-stage',
          expectedVersion: 5,
          isStillExpected: true,
        },
      },
    });

    expect(response.status).toBe(200);
    expect(adapterPull).toHaveBeenCalledTimes(1);
    expect(stage).not.toHaveBeenCalled();
  });

  it('fails a real but already-stale authorized invocation without legacy fallback', async () => {
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const stage = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    // The helper's proactive intent has completed before it returns, so this
    // is a genuine WeakSet-issued invocation whose liveness closure is stale.
    const stale = await mintProactivePullTarget(
      'stale-before-route',
      pullScope,
      5,
    );

    await expect(api.handle.pullSharedProject(
      'stale-before-route',
      pullScope,
      stale.authorizationWitness,
      5,
      stale.authorizedStageInvocation,
    )).resolves.toEqual({ status: 'register_failed' });
    expect(stage).not.toHaveBeenCalled();
    expect(adapterPull).not.toHaveBeenCalled();
    expect(writeMaterializedVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['scope mismatch', false],
    ['spread forgery', true],
  ])('fails a nonempty authorized invocation with %s without legacy fallback', async (
    _case,
    spreadInvocation,
  ) => {
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const stage = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const issuedProjectId = spreadInvocation
      ? 'spread-forgery'
      : 'scope-mismatch-source';
    const routedProjectId = spreadInvocation
      ? issuedProjectId
      : 'scope-mismatch-target';
    const target = await mintProactivePullTarget(
      issuedProjectId,
      pullScope,
      5,
    );
    const invocation = spreadInvocation
      ? { ...target.authorizedStageInvocation! }
      : target.authorizedStageInvocation;

    await expect(api.handle.pullSharedProject(
      routedProjectId,
      pullScope,
      target.authorizationWitness,
      5,
      invocation,
    )).resolves.toEqual({ status: 'register_failed' });
    expect(stage).not.toHaveBeenCalled();
    expect(adapterPull).not.toHaveBeenCalled();
    expect(writeMaterializedVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown command "pull" for "team-projects"', true],
    ['HTTP 403 forbidden', false],
    ['HTTP 500 unavailable', false],
    ['network timeout', false],
    ['authorized pull response is not valid JSON', false],
  ])('falls back only for old-CLI capability absence: %s', async (
    message,
    shouldFallback,
  ) => {
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage: vi.fn(async () => {
          throw new Error(message);
        }),
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const outcome = await invokeThroughProactivePull(
      api.handle,
      `fallback-${shouldFallback}`,
      pullScope,
      5,
    );

    expect(adapterPull).toHaveBeenCalledTimes(shouldFallback ? 1 : 0);
    expect(outcome).toEqual(
      shouldFallback
        ? { status: 'pulled', version: 5 }
        : { status: 'register_failed' },
    );
  });

  it('uses the captured expected version as a legacy lower bound after capability fallback', async () => {
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const adapterPull = vi.fn(async () => null);
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage: vi.fn(async () => {
          throw new Error('unknown command "pull" for "team-projects"');
        }),
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    await expect(invokeThroughProactivePull(
      api.handle,
      'legacy-null-version',
      pullScope,
      5,
    )).resolves.toEqual({ status: 'pulled', version: 5 });
    expect(writeMaterializedVersion).toHaveBeenCalledWith(
      'legacy-null-version',
      pullScope,
      5,
    );
    await expect(invokeThroughProactivePull(
      api.handle,
      'legacy-null-version',
      pullScope,
      6,
    )).resolves.toEqual({ status: 'pulled', version: 6 });
    expect(writeMaterializedVersion).toHaveBeenLastCalledWith(
      'legacy-null-version',
      pullScope,
      6,
    );
  });

  it('prefers a real legacy transport version over the fallback lower bound', async () => {
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage: vi.fn(async () => {
          throw new Error('unknown flag: --expected-version');
        }),
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 8 })),
        pull: vi.fn(async () => ({ version: 8 })),
        syncLatest: vi.fn(async () => ({ version: 8 })),
      },
    });

    await expect(invokeThroughProactivePull(
      api.handle,
      'legacy-real-version',
      pullScope,
      5,
    )).resolves.toEqual({ status: 'pulled', version: 8 });
    expect(writeMaterializedVersion).toHaveBeenCalledWith(
      'legacy-real-version',
      pullScope,
      8,
    );
  });

  it('does not advance the fallback lower bound when post-pull authorization fails', async () => {
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async () => null,
      writeMaterializedVersion,
      authorizedTeamProjectPull: {
        journalDir: '/unused',
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage: vi.fn(async () => {
          throw new Error('unknown command "pull" for "team-projects"');
        }),
        promote: vi.fn(),
      },
    }, {
      adapter: {
        publish: vi.fn(async () => null),
        pull: vi.fn(async () => null),
        syncLatest: vi.fn(async () => null),
      },
    });

    await expect(invokeThroughProactivePull(
      api.handle,
      'legacy-post-auth-fail',
      pullScope,
      5,
    )).resolves.toEqual({ status: 'revoked' });
    expect(writeMaterializedVersion).not.toHaveBeenCalled();
  });

  it('preempts an old authorized stage and commits only the newer receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-authorized-preempt-'));
    tempDirs.push(root);
    const liveDir = path.join(root, 'preempt');
    const stage4 = path.join(root, '.preempt.od-pull-stage-v4');
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), '<title>Version three</title>');
    await mkdir(stage4);
    await writeFile(path.join(stage4, 'index.html'), '<title>Version four</title>');
    const stage4Stat = await lstat(stage4);
    let firstCleaned = false;
    const stage = vi.fn(async (input: {
      expectedVersion: number;
      signal?: AbortSignal;
    }) => {
      if (input.expectedVersion === 3) {
        await new Promise<void>((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            firstCleaned = true;
            reject(new DOMException('aborted', 'AbortError'));
          }, { once: true });
        });
      }
      return {
        stageDir: stage4,
        identity: {
          dev: String(stage4Stat.dev),
          ino: String(stage4Stat.ino),
        },
        receipt: authorizedReceipt('preempt', 4),
        cleanup: vi.fn(async () => undefined),
      };
    });
    const observedLiveVersions: string[] = [];
    const promote = vi.fn((
      input: PromoteAuthorizedTeamProjectStageInput<{
        localRecordChanged: boolean;
      }>,
    ) =>
      promoteAuthorizedTeamProjectStage({
        ...input,
        durability: {
          syncDirectory: async () => {
            observedLiveVersions.push(
              await readFile(path.join(liveDir, 'index.html'), 'utf8'),
            );
          },
        },
      }));
    const adapterPull = vi.fn(async () => ({ version: 99 }));
    const store = fakeProjectStore();
    const materializeAuthorized = vi.spyOn(
      store,
      'materializeAuthorizedTeamMirror',
    );
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: () => liveDir,
      resolveSharedProject: resolvePulledSharedProject,
      authorizedTeamProjectPull: {
        journalDir: path.join(root, '.journals'),
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: pullScope.workspaceId,
          generation: 1,
        }),
        stage,
        promote,
      },
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 99 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 99 })),
      },
    });
    const proactive = createProactiveContentPull({
      getLocalBinding: () => ({
        workspaceId: pullScope.workspaceId,
        visibility: 'team',
      }),
      getWorkspaceIdentity: async () => ({
        workspaceId: pullScope.workspaceId,
        resourceTeamId: pullScope.resourceTeamId,
        workspaceMemberId: pullScope.viewerMemberId,
      }),
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      pullSharedProject: (target, version) =>
        api.handle.pullSharedProject(
          target.projectId,
          pullScope,
          target.authorizationWitness,
          version,
          target.authorizedStageInvocation,
        ),
    });

    try {
      const first = proactive.handleContentChanged({
        projectId: 'preempt',
        workspaceId: pullScope.workspaceId,
        version: 3,
      });
      await vi.waitFor(() => expect(stage).toHaveBeenCalledTimes(1));
      expect(await readFile(path.join(liveDir, 'index.html'), 'utf8'))
        .toBe('<title>Version three</title>');
      const second = proactive.handleContentChanged({
        projectId: 'preempt',
        workspaceId: pullScope.workspaceId,
        version: 4,
      });
      await Promise.all([first, second]);
    } finally {
      proactive.dispose();
    }

    expect(firstCleaned).toBe(true);
    expect(stage.mock.calls.map(([input]) => input.expectedVersion)).toEqual([
      3,
      4,
    ]);
    expect(promote).toHaveBeenCalledTimes(1);
    expect(materializeAuthorized).toHaveBeenCalledTimes(1);
    expect(materializeAuthorized.mock.calls[0]?.[2].version).toBe(4);
    expect(adapterPull).not.toHaveBeenCalled();
    expect(observedLiveVersions.every(
      (version) =>
        version === '<title>Version three</title>' ||
        version === '<title>Version four</title>',
    )).toBe(true);
    expect(observedLiveVersions).toContain('<title>Version three</title>');
    expect(observedLiveVersions.at(-1)).toBe('<title>Version four</title>');
    expect(await readFile(path.join(liveDir, 'index.html'), 'utf8'))
      .toBe('<title>Version four</title>');
  });

  it('keeps an authorized exact-scope pull alive when the ambient active workspace changes', async () => {
    const activeContext = await fixedShareContextProvider(true).current({});
    const current = vi.fn()
      .mockResolvedValueOnce(activeContext)
      .mockResolvedValue({
        ...activeContext,
        workspaceId: 'ws-other',
        teamId: 'ws-other',
      });
    const adapterPull = vi.fn(async () => ({ version: 5 }));
    const store = fakeProjectStore();
    const api = await startSyncServer({ current }, {
      verifyWorkspaceScope: async (scope) =>
        scope.workspaceId === pullScope.workspaceId
        && scope.viewerMemberId === pullScope.viewerMemberId,
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: async (projectId, scope) => ({
        projectId,
        ownerMemberId: scope?.ownerMemberId ?? pullScope.ownerMemberId,
        sharedAt: '2026-07-25T00:00:00.000Z',
      }),
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const outcome = await api.handle.pullSharedProject('handle-scope-drift', pullScope);
    expect(outcome).toEqual({ status: 'pulled', version: 5 });
    expect(adapterPull).toHaveBeenCalledTimes(1);
    expect(store.has('handle-scope-drift')).toBe(true);
  });

  it('fails closed when the project is unshared while the scoped pull is in flight', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    let shared = true;
    const resolveSharedProject = vi.fn(async (projectId: string) => shared
      ? {
          projectId,
          ownerMemberId: pullScope.ownerMemberId,
          sharedAt: '2026-07-25T00:00:00.000Z',
        }
      : null);
    const store = fakeProjectStore();
    const notifyFilesChanged = vi.fn();
    const revoked = vi.fn();
    const adapterPull = vi.fn(async () => {
      await pullGate;
      return { version: 5 };
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject,
      markTeamProjectRevoked: revoked,
      notifyFilesChanged,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const projectId = 'handle-unshared-during-pull';
    const witness = await mintProactivePullWitness(projectId, pullScope, 5);
    const outcomePromise = api.handle.pullSharedProject(
      projectId,
      pullScope,
      witness,
      5,
    );
    await vi.waitFor(() => expect(adapterPull).toHaveBeenCalledTimes(1));
    shared = false;
    releasePull();

    await expect(outcomePromise).resolves.toEqual({ status: 'revoked' });
    expect(resolveSharedProject).toHaveBeenCalledTimes(1);
    expect(store.has(projectId)).toBe(false);
    expect(notifyFilesChanged).not.toHaveBeenCalled();
    expect(revoked).toHaveBeenCalledWith('handle-unshared-during-pull', true);
  });

  it('rechecks workspace identity after the post-pull authoritative lookup before materializing', async () => {
    let drifted = false;
    const verifyWorkspaceScope = vi.fn(async () => !drifted);
    let releaseFinalCatalog!: () => void;
    const finalCatalogGate = new Promise<void>((resolve) => {
      releaseFinalCatalog = resolve;
    });
    let catalogCalls = 0;
    const resolveSharedProject = vi.fn(async (projectId: string) => {
      catalogCalls += 1;
      if (catalogCalls === 1) await finalCatalogGate;
      return {
        projectId,
        ownerMemberId: pullScope.ownerMemberId,
        sharedAt: '2026-07-25T00:00:00.000Z',
      };
    });
    const store = fakeProjectStore();
    const notifyFilesChanged = vi.fn();
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject,
      verifyWorkspaceScope,
      notifyFilesChanged,
      onPullTiming,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: vi.fn(async () => ({ version: 5 })),
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const projectId = 'handle-second-catalog-drift';
    const witness = await mintProactivePullWitness(projectId, pullScope, 5);
    const outcomePromise = api.handle.pullSharedProject(
      projectId,
      pullScope,
      witness,
      5,
    );
    await vi.waitFor(() => expect(resolveSharedProject).toHaveBeenCalledTimes(1));
    drifted = true;
    releaseFinalCatalog();

    await expect(outcomePromise).resolves.toEqual({ status: 'register_failed' });
    expect(store.has(projectId)).toBe(false);
    expect(notifyFilesChanged).not.toHaveBeenCalled();
    expect(onPullTiming).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'route-completed',
      projectId: 'handle-second-catalog-drift',
      status: 'register_failed',
    }));
  });

  it('reports revoked (and flags the mirror) when the project is no longer team-shared', async () => {
    const revoked: Array<{ projectId: string; revoked: boolean }> = [];
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      resolveSharedProject: async () => null,
      markTeamProjectRevoked: (projectId, value) => revoked.push({ projectId, revoked: value }),
      onPullTiming,
    });

    const outcome = await api.handle.pullSharedProject('handle-revoked', pullScope);
    expect(outcome).toEqual({ status: 'revoked' });
    expect(revoked).toContainEqual({ projectId: 'handle-revoked', revoked: true });
    expect(onPullTiming).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'route-completed',
      projectId: 'handle-revoked',
      status: 'revoked',
    }));
  });

  it('coalesces a racing POST /collab/pull and handle pull into one adapter pull', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const adapterPull = vi.fn(async () => {
      await pullGate;
      return { version: 5 };
    });
    const syncLatest = vi.fn(async () => ({ version: 5 }));
    const publish = vi.fn(async () => ({ version: 5 }));
    const store = fakeProjectStore();
    const writeMaterializedVersion = vi.fn(async () => undefined);
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion,
      onPullTiming,
    }, {
      adapter: { publish, pull: adapterPull, syncLatest },
    });

    const viaHandle = api.handle.pullSharedProject('race-pull', pullScope);
    const viaRoute = api.json('/api/projects/race-pull/collab/pull', {
      method: 'POST',
      headers: {
        'x-od-workspace-id': pullScope.workspaceId,
        'x-od-workspace-member-id': pullScope.viewerMemberId,
        'x-od-workspace-role': 'member',
      },
    });
    // Let the POST reach the route (and the shared in-flight map) before the
    // gate opens; the coalescing must hold with both callers waiting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    releasePull();

    const [handleOutcome, routeResponse] = await Promise.all([viaHandle, viaRoute]);
    expect(handleOutcome).toEqual({ status: 'pulled', version: 5 });
    expect(routeResponse.status).toBe(200);
    expect(routeResponse.body.version).toBe(5);
    expect(adapterPull).toHaveBeenCalledTimes(1);
    expect(writeMaterializedVersion).toHaveBeenCalledTimes(1);
    expect(writeMaterializedVersion).toHaveBeenCalledWith('race-pull', pullScope, 5);
    expect(onPullTiming.mock.calls.map(([event]) => event.phase)).toEqual([
      'route-started',
      'transport-invoke',
      'transport-done',
      'registration-prepared',
      'catalog-revalidated',
      'scope-revalidated',
      'mirror-materialized',
      'version-write-started',
      'persisted',
      'route-completed',
    ]);
  });

  it('does not coalesce the same project across different workspace scopes', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const adapterPull = vi.fn(async () => {
      await pullGate;
      return { version: 5 };
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });
    const otherWorkspaceScope = {
      ...pullScope,
      workspaceId: 'ws-other',
    };

    const active = api.handle.pullSharedProject(
      'cross-workspace-pull',
      pullScope,
    );
    await vi.waitFor(() => expect(adapterPull).toHaveBeenCalledTimes(1));
    const mismatched = api.handle.pullSharedProject(
      'cross-workspace-pull',
      otherWorkspaceScope,
    );

    let mismatchedSettled = false;
    void mismatched.finally(() => {
      mismatchedSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mismatchedSettled).toBe(false);
    expect(adapterPull).toHaveBeenCalledTimes(1);
    releasePull();
    await expect(mismatched).resolves.toEqual({
      status: 'register_failed',
    });
    await expect(active).resolves.toEqual({ status: 'pulled', version: 5 });
    expect(adapterPull).toHaveBeenCalledTimes(1);
  });

  it('allows different project ids to enter transport concurrently', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const adapterPull = vi.fn(async () => {
      await pullGate;
      return { version: 5 };
    });
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: fakeProjectStore(),
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProject: resolvePulledSharedProject,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    const first = api.handle.pullSharedProject('parallel-a', pullScope);
    const second = api.handle.pullSharedProject('parallel-b', pullScope);
    await vi.waitFor(() => expect(adapterPull).toHaveBeenCalledTimes(2));
    releasePull();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'pulled', version: 5 },
      { status: 'pulled', version: 5 },
    ]);
  });

  it('releases the per-project pull lock after a transport deadline rejects', async () => {
    const adapterPull = vi.fn()
      .mockRejectedValueOnce(new Error('vela resource pull timed out'))
      .mockResolvedValueOnce({ version: 5 });
    const store = fakeProjectStore();
    const onPullTiming = vi.fn();
    const api = await startSyncServer(fixedShareContextProvider(true), {
      projectStore: store,
      resolvePullDir: (projectId) => `/does/not/exist/${projectId}`,
      resolveSharedProjectOwner: async () => pullScope.ownerMemberId,
      resolveSharedProject: resolvePulledSharedProject,
      writeMaterializedVersion: async () => undefined,
      onPullTiming,
    }, {
      adapter: {
        publish: vi.fn(async () => ({ version: 5 })),
        pull: adapterPull,
        syncLatest: vi.fn(async () => ({ version: 5 })),
      },
    });

    await expect(
      api.handle.pullSharedProject('deadline-retry', pullScope),
    ).rejects.toThrow('timed out');
    expect(onPullTiming.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({ phase: 'route-started' }),
      expect.objectContaining({ phase: 'transport-invoke' }),
      expect.objectContaining({ phase: 'transport-done', status: 'threw' }),
      expect.objectContaining({ phase: 'route-completed', status: 'threw' }),
    ]);
    onPullTiming.mockClear();
    await expect(
      api.handle.pullSharedProject('deadline-retry', pullScope),
    ).resolves.toEqual({ status: 'pulled', version: 5 });

    expect(adapterPull).toHaveBeenCalledTimes(2);
  });
});
