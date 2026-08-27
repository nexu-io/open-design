import { chmod, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';

type ClientIdentity = {
  controlKey: string;
  memberId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
};

type TeamProjectRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  resourceId: string;
  ownerMemberId: string;
  displayName: string | null;
  syncState: string;
  lastSyncedVersionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  access: {
    canView: boolean;
    canComment: boolean;
    canEdit: boolean;
    frozen: boolean;
  };
};

type ResourceRecord = {
  workspaceId: string;
  projectId: string | null;
  resourceId: string;
  kind: string;
  ownerMemberId: string;
  metadata: Record<string, unknown> | null;
  snapshotDir: string;
  version: number;
  versions: Map<number, string>;
};

type HubEvent = {
  type: string;
  workspaceId: string;
  workspaceMemberId?: string;
  projectId?: string;
  resourceId?: string;
  resourceKind?: string;
  resourceStatus?: 'shared' | 'retracted';
  revision?: string;
  version?: number;
};

type WorkspaceDirectoryEvent = {
  type: 'workspace-directory-changed';
  workspaceId: string;
  change:
    | 'created'
    | 'updated'
    | 'deleted'
    | 'membership-added'
    | 'membership-updated'
    | 'membership-removed';
  at: string;
};

type CommandLog = {
  args: string[];
  memberId: string;
  workspaceId: string;
};

type RequestLog = {
  method: string;
  path: string;
  memberId: string | null;
  workspaceId: string;
};

type Subscriber = {
  response: ServerResponse;
  workspaceId: string;
  memberId: string;
  heartbeat: ReturnType<typeof setInterval> | null;
};

export type FakeCollabHub = {
  url: string;
  workspaceId: string;
  commandLog: CommandLog[];
  eventLog: HubEvent[];
  requestLog: RequestLog[];
  writeVelaBin: (path: string) => Promise<string>;
  waitForCommand: (
    predicate: (entry: CommandLog) => boolean,
    timeoutMs?: number,
  ) => Promise<CommandLog>;
  waitForEvent: (
    predicate: (entry: HubEvent) => boolean,
    timeoutMs?: number,
  ) => Promise<HubEvent>;
  setEventsAvailable: (memberId: string, available: boolean) => void;
  eventSubscriberCount: (memberId: string) => number;
  emitEvent: (event: HubEvent) => void;
  removeMember: (memberId: string) => void;
  setMemberRole: (memberId: string, role: ClientIdentity['role']) => void;
  addWorkspace: (memberId: string, workspaceId: string, workspaceName: string) => void;
  setAccountMembershipTier: (memberId: string, membershipTier: string) => void;
  setWorkspacePlan: (planId: string, billingState?: string) => void;
  setWorkspaceBalance: (memberId: string, balanceUsd: string) => void;
  close: () => Promise<void>;
};

export async function startFakeCollabHub(options: {
  root: string;
  workspaceId: string;
  workspaceName: string;
  clients: readonly ClientIdentity[];
  includePersonalWorkspace?: boolean;
  /** Opt into the producer-health contract used by authority-cache E2E. */
  strictAuthorityEvents?: boolean;
}): Promise<FakeCollabHub> {
  const resourcesRoot = join(options.root, 'resources');
  await mkdir(resourcesRoot, { recursive: true });

  const identities = new Map(options.clients.map((client) => [client.controlKey, client]));
  const projects = new Map<string, TeamProjectRecord>();
  const resources = new Map<string, ResourceRecord>();
  const comments = new Map<string, Array<Record<string, unknown>>>();
  const presence = new Map<string, Map<string, Record<string, unknown>>>();
  const subscribers = new Set<Subscriber>();
  const blockedEventMembers = new Set<string>();
  const removedMembers = new Set<string>();
  const memberRoles = new Map(
    options.clients.map((client) => [client.memberId, client.role]),
  );
  const addedWorkspaces = new Map<
    string,
    Map<string, { workspaceId: string; workspaceName: string; workspaceMemberId: string }>
  >();
  const workspaceBalances = new Map(
    options.clients.map((client) => [
      workspaceMemberKey(options.workspaceId, client.memberId),
      { balanceUsd: '0.00', revision: 1 },
    ]),
  );
  const accountBilling = new Map(
    options.clients.map((client) => [client.memberId, {
      membershipTier: 'team_plus',
      balanceUsd: '0.00',
      revision: 1,
    }]),
  );
  const workspaceBilling = new Map([[options.workspaceId, {
    billingState: 'active',
    planId: 'team_plus' as string | null,
    revision: 1,
  }]]);
  const commandLog: CommandLog[] = [];
  const eventLog: HubEvent[] = [];
  const requestLog: RequestLog[] = [];

  const closeSubscriber = (subscriber: Subscriber): void => {
    if (subscriber.heartbeat) clearInterval(subscriber.heartbeat);
    subscriber.heartbeat = null;
    subscribers.delete(subscriber);
    subscriber.response.end();
  };

  const server: Server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const authenticatedIdentity = identityFor(request.headers.authorization, identities);
      const identity = authenticatedIdentity
        ? {
            ...authenticatedIdentity,
            role: memberRoles.get(authenticatedIdentity.memberId) ?? authenticatedIdentity.role,
          }
        : null;
      const workspaceId =
        headerValue(request.headers['x-vela-workspace-id']) || options.workspaceId;
      requestLog.push({
        method: request.method ?? 'GET',
        path: url.pathname,
        memberId: identity?.memberId ?? null,
        workspaceId,
      });

      if (url.pathname === '/__e2e/stats' && request.method === 'GET') {
        return json(response, 200, {
          commands: commandLog,
          events: eventLog,
          requests: requestLog,
          subscribers: [...subscribers].map((subscriber) => ({
            memberId: subscriber.memberId,
            workspaceId: subscriber.workspaceId,
          })),
        });
      }
      if (url.pathname === '/__e2e/event' && request.method === 'POST') {
        const body = await readJsonBody(request) as HubEvent;
        emit(body);
        return json(response, 200, { ok: true });
      }
      if (url.pathname === '/__e2e/events-available' && request.method === 'POST') {
        const body = await readJsonBody(request) as {
          available?: unknown;
          memberId?: unknown;
        };
        const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
        if (!memberId || typeof body.available !== 'boolean') {
          return json(response, 400, { error: 'invalid_events_available_input' });
        }
        if (body.available) {
          blockedEventMembers.delete(memberId);
        } else {
          blockedEventMembers.add(memberId);
          for (const subscriber of [...subscribers]) {
            if (subscriber.memberId === memberId) closeSubscriber(subscriber);
          }
        }
        return json(response, 200, { ok: true });
      }

      if (url.pathname === '/api/v1/workspaces' && request.method === 'GET') {
        if (!identity) return json(response, 401, { error: 'unauthorized' });
        return json(response, 200, {
          // This is a membership directory for the authenticated app user,
          // not a workspace roster. Two clients in the same workspace each
          // receive their own one membership row.
          items: [
            ...(removedMembers.has(identity.memberId)
              ? [personalWorkspaceDirectoryItem(identity)]
              : options.includePersonalWorkspace
                ? [
                    personalWorkspaceDirectoryItem(identity),
                    workspaceDirectoryItem(options, identity),
                  ]
                : [workspaceDirectoryItem(options, identity)]),
            ...[...(addedWorkspaces.get(identity.memberId)?.values() ?? [])]
              .map(addedWorkspaceDirectoryItem),
          ],
        });
      }
      if (url.pathname === '/api/v1/collab/events' && request.method === 'GET') {
        if (!identity) return json(response, 401, { error: 'unauthorized' });
        if (blockedEventMembers.has(identity.memberId)) {
          return json(response, 503, { error: 'event_stream_unavailable' });
        }
        response.writeHead(200, {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'content-type': 'text/event-stream; charset=utf-8',
        });
        const subscriber: Subscriber = {
          response,
          workspaceId,
          memberId: identity.memberId,
          heartbeat: null,
        };
        subscribers.add(subscriber);
        const listenerStatus = {
          listenerEpoch: `fake-hub-${identity.memberId}`,
          listenerHealth: 'healthy',
          sourceGap: false,
        } as const;
        response.write(
          `event: ready\ndata: ${JSON.stringify({
            workspaceId,
            capabilities: options.strictAuthorityEvents
              ? [
                  'authoritative-project-presence-v1',
                  'workspace-member-events-v1',
                  'workspace-event-listener-status-v1',
                  'billing-revision-clocks-v1',
                  'workspace-directory-events-v1',
                ]
              : [
                  'authoritative-project-presence-v1',
                  'workspace-directory-events-v1',
                ],
            ...(options.strictAuthorityEvents ? listenerStatus : {}),
          })}\n\n`,
        );
        if (options.strictAuthorityEvents) {
          const writeHeartbeat = () => {
            if (!subscribers.has(subscriber)) return;
            response.write(
              `event: heartbeat\ndata: ${JSON.stringify(listenerStatus)}\n\n`,
            );
          };
          // `ready` is deliberately not sufficient for authority health. The
          // immediate post-ready heartbeat proves the producer listener has
          // crossed its membership revalidation boundary.
          writeHeartbeat();
          subscriber.heartbeat = setInterval(writeHeartbeat, 5_000);
          subscriber.heartbeat.unref?.();
        }
        request.on('close', () => {
          if (subscribers.has(subscriber)) closeSubscriber(subscriber);
        });
        return;
      }
      if (url.pathname === '/__e2e/command' && request.method === 'POST') {
        if (!identity) return json(response, 401, { error: 'unauthorized' });
        if (removedMembers.has(identity.memberId)) {
          return json(response, 403, { error: 'workspace_membership_removed' });
        }
        const body = await readJsonBody(request) as { args?: unknown; stdin?: unknown };
        const args = Array.isArray(body.args)
          ? body.args.filter((value): value is string => typeof value === 'string')
          : [];
        const stdin = typeof body.stdin === 'string' ? body.stdin : '';
        commandLog.push({ args, memberId: identity.memberId, workspaceId });
        const stdout = await handleCommand({
          args,
          stdin,
          identity,
          workspaceId,
          options,
          projects,
          resources,
          resourcesRoot,
          comments,
          presence,
          accountBilling,
          workspaceBilling,
          workspaceBalances,
          memberRoles,
          removedMembers,
          emit,
        });
        return json(response, 200, { stdout });
      }
      return json(response, 404, { error: 'not_found', path: url.pathname });
    } catch (error) {
      return json(response, 500, {
        error: 'fake_hub_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  function emit(event: HubEvent): void {
    eventLog.push(event);
    const frame = `event: workspace-event\ndata: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of subscribers) {
      if (subscriber.workspaceId === event.workspaceId) {
        subscriber.response.write(frame);
      }
    }
  }

  function emitDirectory(memberId: string, event: WorkspaceDirectoryEvent): void {
    const frame =
      `event: workspace-directory-changed\ndata: ${JSON.stringify(event)}\n\n`;
    for (const subscriber of subscribers) {
      if (subscriber.memberId === memberId) subscriber.response.write(frame);
    }
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('fake collaboration hub did not expose a TCP port');
  }
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    workspaceId: options.workspaceId,
    commandLog,
    eventLog,
    requestLog,
    writeVelaBin: async (path) => {
      await writeFile(path, fakeVelaScript(), 'utf8');
      await chmod(path, 0o755);
      return path;
    },
    waitForCommand: (predicate, timeoutMs = 15_000) =>
      waitForLog(commandLog, predicate, timeoutMs, 'Vela command'),
    waitForEvent: (predicate, timeoutMs = 15_000) =>
      waitForLog(eventLog, predicate, timeoutMs, 'workspace event'),
    setEventsAvailable: (memberId, available) => {
      if (available) {
        blockedEventMembers.delete(memberId);
        return;
      }
      blockedEventMembers.add(memberId);
      for (const subscriber of [...subscribers]) {
        if (subscriber.memberId !== memberId) continue;
        closeSubscriber(subscriber);
      }
    },
    eventSubscriberCount: (memberId) =>
      [...subscribers].filter((subscriber) => subscriber.memberId === memberId).length,
    emitEvent: emit,
    removeMember: (memberId) => {
      removedMembers.add(memberId);
      for (const roster of presence.values()) {
        for (const [clientId, entry] of roster) {
          if (entry.memberId === memberId) roster.delete(clientId);
        }
      }
      emit({ type: 'workspace-context-changed', workspaceId: options.workspaceId });
    },
    setMemberRole: (memberId, role) => {
      if (!identitiesByMemberId(options.clients).has(memberId)) {
        throw new Error(`unknown fake collaboration member: ${memberId}`);
      }
      memberRoles.set(memberId, role);
      emit({ type: 'workspace-context-changed', workspaceId: options.workspaceId });
    },
    addWorkspace: (memberId, workspaceId, workspaceName) => {
      if (!identitiesByMemberId(options.clients).has(memberId)) {
        throw new Error(`unknown fake collaboration member: ${memberId}`);
      }
      const memberships = addedWorkspaces.get(memberId) ?? new Map();
      memberships.set(workspaceId, {
        workspaceId,
        workspaceName,
        workspaceMemberId: `member-${memberId}-${workspaceId}`,
      });
      addedWorkspaces.set(memberId, memberships);
      // Account-directory invalidation rides any existing Workspace stream for
      // this account; the new Workspace itself need not be subscribed yet.
      emitDirectory(memberId, {
        type: 'workspace-directory-changed',
        workspaceId,
        change: 'created',
        at: new Date().toISOString(),
      });
    },
    setAccountMembershipTier: (memberId, membershipTier) => {
      const previous = accountBilling.get(memberId) ?? {
        membershipTier: 'team_plus',
        balanceUsd: '0.00',
        revision: 0,
      };
      const revision = previous.revision + 1;
      accountBilling.set(memberId, { ...previous, membershipTier, revision });
      emit({
        type: 'billing-changed',
        workspaceId: options.workspaceId,
        revision: `account-${memberId}-${revision}`,
      });
    },
    setWorkspacePlan: (planId, billingState = 'active') => {
      const previous = workspaceBilling.get(options.workspaceId) ?? {
        billingState: 'free',
        planId: null,
        revision: 0,
      };
      const revision = previous.revision + 1;
      workspaceBilling.set(options.workspaceId, { billingState, planId, revision });
      emit({
        type: 'billing-subscription-changed',
        workspaceId: options.workspaceId,
        revision: `billing-${revision}`,
      });
    },
    setWorkspaceBalance: (memberId, balanceUsd) => {
      const key = workspaceMemberKey(options.workspaceId, memberId);
      const previous = workspaceBalances.get(key) ?? { balanceUsd: '0.00', revision: 0 };
      const revision = previous.revision + 1;
      workspaceBalances.set(key, { balanceUsd, revision });
      emit({
        type: 'wallet-balance-changed',
        workspaceId: options.workspaceId,
        workspaceMemberId: memberId,
        revision: `wallet-${revision}`,
      });
    },
    close: async () => {
      for (const subscriber of [...subscribers]) closeSubscriber(subscriber);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(resourcesRoot, { force: true, recursive: true });
    },
  };
}

async function handleCommand(input: {
  args: string[];
  stdin: string;
  identity: ClientIdentity;
  workspaceId: string;
  options: { workspaceId: string; workspaceName: string; clients: readonly ClientIdentity[] };
  projects: Map<string, TeamProjectRecord>;
  resources: Map<string, ResourceRecord>;
  resourcesRoot: string;
  comments: Map<string, Array<Record<string, unknown>>>;
  presence: Map<string, Map<string, Record<string, unknown>>>;
  accountBilling: Map<
    string,
    { membershipTier: string; balanceUsd: string; revision: number }
  >;
  workspaceBilling: Map<
    string,
    { billingState: string; planId: string | null; revision: number }
  >;
  workspaceBalances: Map<string, { balanceUsd: string; revision: number }>;
  memberRoles: Map<string, ClientIdentity['role']>;
  removedMembers: Set<string>;
  emit: (event: HubEvent) => void;
}): Promise<string> {
  const { args } = input;
  if (args[0] === '--version') return 'vela 0.0.0-e2e\n';
  if (args[0] === 'model' && args[1] === 'list') {
    return jsonLine({ models: [] });
  }
  if (args[0] === 'model' && args[1] === 'preset') {
    return jsonLine({ models: [] });
  }
  if (args[0] === 'billing' && args[1] === 'summary') {
    const billing = input.accountBilling.get(input.identity.memberId) ?? {
      membershipTier: 'team_plus',
      balanceUsd: '0.00',
    };
    return jsonLine({
      membershipTier: billing.membershipTier,
      balanceUsd: billing.balanceUsd,
    });
  }
  if (args[0] === 'billing' && args[1] === 'workspace-snapshot') {
    const billing = input.workspaceBilling.get(input.workspaceId) ?? {
      billingState: 'free',
      planId: null,
      revision: 0,
    };
    const balance = input.workspaceBalances.get(
      workspaceMemberKey(input.workspaceId, input.identity.memberId),
    ) ?? {
      balanceUsd: '0.00',
      revision: 0,
    };
    const updatedAt = new Date().toISOString();
    return jsonLine({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      workspaceMemberId: input.identity.memberId,
      billingScopeVersion: 2,
      billing: {
        billingState: billing.billingState,
        planId: billing.planId,
      },
      wallet: { balanceUsd: balance.balanceUsd, expiresAt: null, updatedAt },
      revisions: {
        billing: `billing-${billing.revision}`,
        wallet: `wallet-${balance.revision}`,
      },
    });
  }
  if (args[0] === 'team-projects') {
    return await handleTeamProjectsCommand(input);
  }
  if (args[0] === 'resource') {
    return await handleResourceCommand(input);
  }
  if (args[0] === 'collab') {
    return handleCollabCommand(input);
  }
  throw new Error(`unsupported fake Vela command: ${args.join(' ')}`);
}

async function handleTeamProjectsCommand(input: {
  args: string[];
  identity: ClientIdentity;
  workspaceId: string;
  projects: Map<string, TeamProjectRecord>;
  resources: Map<string, ResourceRecord>;
  emit: (event: HubEvent) => void;
}): Promise<string> {
  const [, command, projectId] = input.args;
  if (command === '--help') return 'team-projects list get upsert remove\n';
  if (command === 'list' || command == null) {
    return jsonLine({
      workspaceId: input.workspaceId,
      projects: [...input.projects.values()].filter(
        (project) => project.workspaceId === input.workspaceId,
      ).map((project) => recordForIdentity(project, input.identity)),
    });
  }
  if (command === 'get' && projectId) {
    const project = input.projects.get(projectId);
    if (!project) throw new Error('team_project_not_found');
    return jsonLine(recordForIdentity(project, input.identity));
  }
  if (command === 'pull' && projectId) {
    const authorizeOnly = input.args.includes('--authorize-only');
    const targetDir = authorizeOnly ? null : input.args[3];
    const expectedVersion = Number(flag(input.args, '--expected-version'));
    const project = input.projects.get(projectId);
    const resource = project
      ? input.resources.get(workspaceResourceKey(input.workspaceId, project.resourceId))
      : null;
    const requestedSnapshot = resource?.versions.get(expectedVersion);
    if (
      !project ||
      !resource ||
      !requestedSnapshot ||
      (!authorizeOnly && !targetDir) ||
      !Number.isSafeInteger(expectedVersion)
    ) {
      throw new Error('authorized_team_project_pull_rejected');
    }
    if (targetDir) {
      // Vela replaces the caller-created empty stage inode before returning its
      // short-lived authorization receipt.
      await rm(targetDir, { force: true, recursive: true });
      await cp(requestedSnapshot, targetDir, { recursive: true });
    }
    const authorizedAt = Date.now();
    const manifestEntryCount = authorizeOnly
      ? (await readdir(requestedSnapshot, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile()).length
      : undefined;
    return jsonLine({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      resourceTeamId: input.workspaceId,
      viewerMemberId: input.identity.memberId,
      ownerMemberId: project.ownerMemberId,
      projectId,
      resourceId: project.resourceId,
      ref: 'published',
      version: expectedVersion,
      versionId: `v${expectedVersion}`,
      manifestDigest: `sha256:${'a'.repeat(64)}`,
      lifecycleState: 'active',
      authorizedAt: new Date(authorizedAt).toISOString(),
      expiresAt: new Date(authorizedAt + 2_000).toISOString(),
      ...(manifestEntryCount === undefined ? {} : { manifestEntryCount }),
    });
  }
  if (command === 'upsert' && projectId) {
    const now = new Date().toISOString();
    const previous = input.projects.get(projectId);
    const resourceId = flag(input.args, '--resource-id') ?? previous?.resourceId;
    if (!resourceId) throw new Error('missing resource id');
    const record: TeamProjectRecord = {
      id: previous?.id ?? `catalog-${projectId}`,
      workspaceId: input.workspaceId,
      projectId,
      resourceId,
      ownerMemberId: previous?.ownerMemberId ?? input.identity.memberId,
      displayName: flag(input.args, '--display-name') ?? previous?.displayName ?? null,
      syncState: flag(input.args, '--sync-state') ?? previous?.syncState ?? 'synced',
      lastSyncedVersionId:
        flag(input.args, '--last-synced-version-id') ?? previous?.lastSyncedVersionId ?? null,
      metadata: parseJsonFlag(input.args, '--metadata-json') ?? previous?.metadata ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      access: {
        canView: true,
        canComment: true,
        canEdit: input.identity.role === 'owner',
        frozen: false,
      },
    };
    input.projects.set(projectId, record);
    input.emit({
      type: previous ? 'project-metadata-changed' : 'team-projects-changed',
      workspaceId: input.workspaceId,
      projectId,
    });
    return jsonLine(recordForIdentity(record, input.identity));
  }
  if (command === 'remove' && projectId) {
    input.projects.delete(projectId);
    input.emit({ type: 'team-projects-changed', workspaceId: input.workspaceId, projectId });
    return jsonLine({ ok: true });
  }
  throw new Error(`unsupported team-projects command: ${input.args.join(' ')}`);
}

async function handleResourceCommand(input: {
  args: string[];
  stdin: string;
  identity: ClientIdentity;
  workspaceId: string;
  projects: Map<string, TeamProjectRecord>;
  resources: Map<string, ResourceRecord>;
  resourcesRoot: string;
  emit: (event: HubEvent) => void;
}): Promise<string> {
  const [, command] = input.args;
  if (command === 'push') {
    const kind = input.args[2];
    const resourceId = input.args[3];
    const sourceDir = input.args[4];
    if (!kind || !resourceId || !sourceDir) throw new Error('invalid resource push');
    const metadata = parseJsonFlag(input.args, '--metadata-json');
    const projectId =
      typeof metadata?.projectId === 'string'
        ? metadata.projectId
        : [...input.projects.values()]
            .find(
              (project) =>
                project.workspaceId === input.workspaceId
                && project.resourceId === resourceId,
            )?.projectId ?? null;
    if (kind === 'project' && !projectId) throw new Error('resource push missing project id');
    const resourceKey = workspaceResourceKey(input.workspaceId, resourceId);
    const previous = input.resources.get(resourceKey);
    const version = (previous?.version ?? 0) + 1;
    const resourceRoot = join(input.resourcesRoot, encodeURIComponent(resourceKey));
    const snapshotDir = join(resourceRoot, `v${version}`);
    await rm(snapshotDir, { force: true, recursive: true });
    await cp(sourceDir, snapshotDir, { recursive: true });
    const versions = previous?.versions ?? new Map<number, string>();
    versions.set(version, snapshotDir);
    input.resources.set(resourceKey, {
      workspaceId: input.workspaceId,
      projectId,
      resourceId,
      kind,
      ownerMemberId: previous?.ownerMemberId ?? input.identity.memberId,
      metadata,
      snapshotDir,
      version,
      versions,
    });
    if (projectId && input.projects.has(projectId)) {
      input.emit({
        type: 'project-content-changed',
        workspaceId: input.workspaceId,
        projectId,
        version,
      });
    } else {
      input.emit({
        type: 'team-resources-changed',
        workspaceId: input.workspaceId,
        resourceId,
        resourceKind: kind,
        resourceStatus: 'shared',
      });
    }
    return jsonLine({ version, versionId: `v${version}` });
  }
  if (command === 'head') {
    const resourceId = input.args[2];
    const resource = resourceId
      ? input.resources.get(workspaceResourceKey(input.workspaceId, resourceId))
      : null;
    return jsonLine(
      resource
        ? { version: resource.version, versionId: `v${resource.version}` }
        : { version: null },
    );
  }
  if (command === 'pull') {
    const resourceId = input.args[3];
    const targetDir = input.args[4];
    const resource = resourceId
      ? input.resources.get(workspaceResourceKey(input.workspaceId, resourceId))
      : null;
    if (!resource || !targetDir) throw new Error('resource_not_found');
    // Deliberately replace the directory inode. This is the production pull
    // shape that used to orphan the already-open member daemon's watcher.
    await rm(targetDir, { force: true, recursive: true });
    await cp(resource.snapshotDir, targetDir, { recursive: true });
    return jsonLine({ version: resource.version, versionId: `v${resource.version}` });
  }
  if (command === 'pull-batch') {
    if (flag(input.args, '--requests-file') !== '-') {
      throw new Error('fake resource pull-batch requires --requests-file -');
    }
    const parsed = JSON.parse(input.stdin) as { requests?: unknown };
    if (!Array.isArray(parsed.requests) || parsed.requests.length === 0) {
      throw new Error('resource pull batch requires at least one request');
    }
    if (parsed.requests.length > 128) {
      throw new Error('resource pull batch contains more than 128 requests');
    }
    const keys = new Set<string>();
    const requests = parsed.requests.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`requests[${index}] must be an object`);
      }
      const request = raw as Record<string, unknown>;
      const key = typeof request.key === 'string' ? request.key.trim() : '';
      const kind = typeof request.kind === 'string' ? request.kind.trim() : '';
      const resourceId =
        typeof request.resourceId === 'string' ? request.resourceId.trim() : '';
      const dir = typeof request.dir === 'string' ? request.dir.trim() : '';
      const ref = typeof request.ref === 'string' && request.ref.trim()
        ? request.ref.trim()
        : 'latest';
      if (!key || !kind || !resourceId || !dir) {
        throw new Error(`requests[${index}] is missing a required field`);
      }
      if (keys.has(key)) throw new Error(`duplicate resource pull key: ${key}`);
      keys.add(key);
      return { key, kind, resourceId, dir, ref };
    });
    const results = [];
    let succeeded = 0;
    for (const request of requests) {
      const resource = input.resources.get(
        workspaceResourceKey(input.workspaceId, request.resourceId),
      );
      if (!resource) {
        results.push({
          ...request,
          ok: false,
          error: 'resource_not_found',
          errorCode: 'resource_not_found',
        });
        continue;
      }
      await rm(request.dir, { force: true, recursive: true });
      await cp(resource.snapshotDir, request.dir, { recursive: true });
      succeeded++;
      results.push({
        ...request,
        ok: true,
        version: resource.version,
        versionId: `v${resource.version}`,
      });
    }
    return jsonLine({ results, succeeded, failed: results.length - succeeded });
  }
  if (command === 'remove') {
    const resourceId = input.args[2];
    const resourceKey = resourceId
      ? workspaceResourceKey(input.workspaceId, resourceId)
      : null;
    const resource = resourceKey ? input.resources.get(resourceKey) : null;
    if (resourceKey) input.resources.delete(resourceKey);
    if (resource && resource.kind !== 'project') {
      input.emit({
        type: 'team-resources-changed',
        workspaceId: input.workspaceId,
        resourceId: resource.resourceId,
        resourceKind: resource.kind,
        resourceStatus: 'retracted',
      });
    }
    return jsonLine({ ok: true });
  }
  if (command === 'list') {
    return jsonLine({ resources: [] });
  }
  if (command === 'shared') {
    return jsonLine({
      resources: [...input.resources.values()]
        .filter(
          (resource) =>
            resource.workspaceId === input.workspaceId
            && resource.kind !== 'project',
        )
        .map((resource) => ({
          id: resource.resourceId,
          kind: resource.kind,
          deletedAt: null,
          ownerMemberId: resource.ownerMemberId,
          metadata: resource.metadata,
          publishedVersion: {
            id: `v${resource.version}`,
            version: resource.version,
          },
        })),
    });
  }
  throw new Error(`unsupported resource command: ${input.args.join(' ')}`);
}

function handleCollabCommand(input: {
  args: string[];
  identity: ClientIdentity;
  workspaceId: string;
  options: { clients: readonly ClientIdentity[] };
  comments: Map<string, Array<Record<string, unknown>>>;
  presence: Map<string, Map<string, Record<string, unknown>>>;
  memberRoles: Map<string, ClientIdentity['role']>;
  removedMembers: Set<string>;
  emit: (event: HubEvent) => void;
}): string {
  const [, domain, command, projectId] = input.args;
  if (domain === 'member' && command === 'list') {
    return jsonLine({
      members: input.options.clients
        .filter((client) => !input.removedMembers.has(client.memberId))
        .map((client) => ({
          memberId: client.memberId,
          displayName: client.name,
          role: input.memberRoles.get(client.memberId) ?? client.role,
        })),
    });
  }
  if (domain === 'member' && command === 'register') {
    return jsonLine({
      member: {
        memberId: input.identity.memberId,
        displayName: flag(input.args, '--display-name') ?? input.identity.name,
        role: flag(input.args, '--role') ?? input.identity.role,
      },
    });
  }
  if (domain === 'presence' && projectId) {
    const roster = input.presence.get(projectId) ?? new Map();
    input.presence.set(projectId, roster);
    const clientId = flag(input.args, '--client-id') ?? input.identity.memberId;
    if (command === 'heartbeat') {
      const joined = !roster.has(clientId);
      roster.set(clientId, {
        memberId: input.identity.memberId,
        displayName: flag(input.args, '--display-name') ?? input.identity.name,
        role: input.identity.role,
        filePath: flag(input.args, '--file-path') ?? null,
        heartbeatAt: new Date().toISOString(),
      });
      if (joined) {
        input.emit({
          type: 'presence-changed',
          workspaceId: input.workspaceId,
          projectId,
        });
      }
    } else if (command === 'leave') {
      const explicitClientId = flag(input.args, '--client-id');
      let removed = roster.delete(clientId);
      // Preserve compatibility with a legacy leave that has no session lease:
      // it means "this member left everywhere". Modern clients always send a
      // client id, so closing one tab must not evict another tab for the same
      // member.
      if (!explicitClientId) {
        for (const [key, entry] of roster) {
          if (entry.memberId === input.identity.memberId) {
            roster.delete(key);
            removed = true;
          }
        }
      }
      if (removed) {
        input.emit({
          type: 'presence-changed',
          workspaceId: input.workspaceId,
          projectId,
        });
      }
    } else if (command !== 'list') {
      throw new Error(`unsupported presence command: ${input.args.join(' ')}`);
    }
    return jsonLine({ viewers: [...roster.values()] });
  }
  if (domain === 'comment' && command === 'pull') {
    const sinceSeq = Number(flag(input.args, '--since-seq') ?? 0);
    const projectComments = input.comments.get(projectId ?? '') ?? [];
    const latestSeq = projectComments.reduce(
      (latest, comment) =>
        typeof comment.seq === 'number' ? Math.max(latest, comment.seq) : latest,
      0,
    );
    return jsonLine({
      comments: projectComments.filter(
        (comment) => typeof comment.seq === 'number' && comment.seq > sinceSeq,
      ),
      latestSeq,
    });
  }
  if (domain === 'comment' && command === 'push' && projectId) {
    const parsed = parseJsonFlag(input.args, '--comment-json');
    if (!parsed) throw new Error('comment push missing payload');
    const projectComments = input.comments.get(projectId) ?? [];
    const seq = projectComments.reduce(
      (latest, comment) =>
        typeof comment.seq === 'number' ? Math.max(latest, comment.seq) : latest,
      0,
    ) + 1;
    const next: Record<string, unknown> = { ...parsed, projectId, seq };
    const existingIndex = projectComments.findIndex(
      (comment) => comment.id === next.id,
    );
    if (existingIndex >= 0) projectComments[existingIndex] = next;
    else projectComments.push(next);
    input.comments.set(projectId, projectComments);
    input.emit({
      type: 'comment-changed',
      workspaceId: input.workspaceId,
      projectId,
    });
    return jsonLine({ seq });
  }
  throw new Error(`unsupported collab command: ${input.args.join(' ')}`);
}

function recordForIdentity(
  project: TeamProjectRecord,
  identity: ClientIdentity,
): TeamProjectRecord {
  return {
    ...project,
    access: {
      ...project.access,
      canEdit: project.ownerMemberId === identity.memberId,
    },
  };
}

function workspaceDirectoryItem(
  options: { workspaceId: string; workspaceName: string },
  identity: ClientIdentity,
) {
  return {
    workspaceId: options.workspaceId,
    workspaceName: options.workspaceName,
    workspaceType: 'team',
    workspaceMemberId: identity.memberId,
    role: identity.role,
    memberStatus: 'active',
    lifecycleState: 'active',
  };
}

function addedWorkspaceDirectoryItem(workspace: {
  workspaceId: string;
  workspaceName: string;
  workspaceMemberId: string;
}) {
  return {
    ...workspace,
    workspaceType: 'team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  };
}

function personalWorkspaceId(memberId: string): string {
  return `personal-${memberId}`;
}

function workspaceMemberKey(workspaceId: string, memberId: string): string {
  return `${workspaceId}\0${memberId}`;
}

function workspaceResourceKey(workspaceId: string, resourceId: string): string {
  return `${workspaceId}\0${resourceId}`;
}

function personalWorkspaceDirectoryItem(identity: ClientIdentity) {
  return {
    workspaceId: personalWorkspaceId(identity.memberId),
    workspaceName: `${identity.name} workspace`,
    workspaceType: 'personal',
    workspaceMemberId: `personal-member-${identity.memberId}`,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  };
}

function fakeVelaScript(): string {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);
let stdin = '';
const requestsFileIndex = args.indexOf('--requests-file');
if (requestsFileIndex >= 0 && args[requestsFileIndex + 1] === '-') {
  for await (const chunk of process.stdin) stdin += chunk;
}
const response = await fetch(new URL('/__e2e/command', process.env.VELA_API_URL), {
  method: 'POST',
  headers: {
    authorization: 'Bearer ' + process.env.VELA_CONTROL_KEY,
    'content-type': 'application/json',
    'x-vela-workspace-id': process.env.VELA_WORKSPACE_ID || process.env.OPEN_DESIGN_WORKSPACE_ID || '',
  },
  body: JSON.stringify({ args, stdin }),
});
const payload = await response.json();
if (!response.ok) {
  process.stderr.write(String(payload.message || payload.error || 'fake Vela command failed') + '\\n');
  process.exit(1);
}
process.stdout.write(String(payload.stdout || ''));
`;
}

function identityFor(
  authorization: string | undefined,
  identities: Map<string, ClientIdentity>,
): ClientIdentity | null {
  const key = authorization?.replace(/^Bearer\s+/i, '').trim();
  return key ? identities.get(key) ?? null : null;
}

function identitiesByMemberId(clients: readonly ClientIdentity[]): Set<string> {
  return new Set(clients.map((client) => client.memberId));
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function flag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && typeof args[index + 1] === 'string' ? args[index + 1]! : null;
}

function parseJsonFlag(args: readonly string[], name: string): Record<string, unknown> | null {
  const value = flag(args, name);
  if (!value) return null;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function waitForLog<T>(
  values: T[],
  predicate: (entry: T) => boolean,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = values.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}; observed ${JSON.stringify(values)}`);
}
