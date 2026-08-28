// Coverage for the two seams that trigger `reconcileWorkspaceProjectsWithRemote`
// in server.ts: the hub's real-time `team-projects-changed` SSE push
// (`startHubEventsSubscriber`) and the ~15s `workspaceInvalidationPoller`'s
// own diff-and-signal cadence. Mirrors the existing precedent in
// `hub-workspace-context-changed-poll.test.ts` (same extracted-named-function
// + source-scan-boundary-guard style) for the sibling
// `workspace-context-changed` fix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  handleHubProjectMetadataChanged,
  handleHubTeamProjectsChanged,
  handlePolledWorkspaceInvalidation,
} from '../../src/collab/workspace-projects-reconciler.js';
import { parseHubWorkspaceEvent, startHubEventsSubscriber } from '../../src/collab/hub-events-subscriber.js';

function sseResponse(frames: string[]) {
  const encoder = new TextEncoder();
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        return;
      }
      // Never enqueue again — keeps the connection open so the subscriber
      // does not immediately loop into a reconnect after the one event.
      await new Promise(() => undefined);
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('handleHubTeamProjectsChanged', () => {
  it('emits the thin display-cache signal only after reconciliation finishes', async () => {
    const emit = vi.fn();
    let finishReconcile!: () => void;
    const reconcile = vi.fn(() => new Promise<void>((resolve) => {
      finishReconcile = resolve;
    }));
    handleHubTeamProjectsChanged(emit, reconcile);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();

    finishReconcile();
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
  });

  it('never lets a reconciliation failure throw or reject out of the hub event handler', async () => {
    const emit = vi.fn();
    const reconcile = vi.fn(() => Promise.reject(new Error('vela unreachable')));
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    expect(() => handleHubTeamProjectsChanged(emit, reconcile)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    process.removeListener('unhandledRejection', unhandled);
  });

  // End-to-end through the REAL SSE parser/dispatcher (`startHubEventsSubscriber`
  // + `parseHubWorkspaceEvent`), not a hand-called function — this is the
  // "real push" half of the verification: a genuine `team-projects-changed`
  // wire frame, parsed by real code, must reach the reconciler.
  it('fires from a genuine team-projects-changed SSE frame parsed by the real hub subscriber', async () => {
    const emit = vi.fn();
    const reconcile = vi.fn(async () => undefined);
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const readyFrame = 'event: ready\ndata: {"workspaceId":"w1"}\n\n';
    const frame =
      'event: workspace-event\ndata: {"type":"team-projects-changed","workspaceId":"w1","at":123}\n\n';
    const subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({
        url: 'https://hub/api/v1/collab/events',
        headers: {},
        workspaceId: 'w1',
      }),
      onEvent: (event) => {
        expect(parseHubWorkspaceEvent(JSON.stringify(event))).toEqual(event);
        if (event.type === 'team-projects-changed') {
          handleHubTeamProjectsChanged(emit, reconcile);
          resolveDone();
        }
      },
      fetchImpl: async () => sseResponse([readyFrame, frame]),
    });

    try {
      await done;
      expect(emit).toHaveBeenCalledTimes(1);
      expect(reconcile).toHaveBeenCalledTimes(1);
    } finally {
      subscriber.stop();
    }
  });
});

describe('handleHubProjectMetadataChanged', () => {
  it('re-emits after the targeted metadata write becomes durable', async () => {
    const emit = vi.fn();
    const reconcile = vi.fn(async () => true);
    handleHubProjectMetadataChanged(emit, reconcile);

    expect(emit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
  });

  it('does not emit a persistence follow-up for a no-op or failed reconcile', async () => {
    const noOpEmit = vi.fn();
    handleHubProjectMetadataChanged(noOpEmit, async () => false);
    await Promise.resolve();
    expect(noOpEmit).toHaveBeenCalledTimes(1);

    const failedEmit = vi.fn();
    handleHubProjectMetadataChanged(failedEmit, async () => { throw new Error('offline'); });
    await Promise.resolve();
    await Promise.resolve();
    expect(failedEmit).toHaveBeenCalledTimes(1);
  });
});

describe('handlePolledWorkspaceInvalidation', () => {
  it('forwards every payload to emit unchanged', () => {
    const emit = vi.fn();
    const reconcile = vi.fn(async () => undefined);
    const payload = { type: 'members-changed' as const, at: 1 };
    handlePolledWorkspaceInvalidation(payload, emit, reconcile);
    expect(emit).toHaveBeenCalledWith(payload);
  });

  it('kicks reconciliation only for a team-projects-changed payload', () => {
    const emit = vi.fn();
    const reconcile = vi.fn(async () => undefined);

    handlePolledWorkspaceInvalidation({ type: 'workspace-context-changed', at: 1 }, emit, reconcile);
    handlePolledWorkspaceInvalidation({ type: 'members-changed', at: 1 }, emit, reconcile);
    handlePolledWorkspaceInvalidation({ type: 'billing-changed', at: 1 }, emit, reconcile);
    expect(reconcile).not.toHaveBeenCalled();

    handlePolledWorkspaceInvalidation({ type: 'team-projects-changed', at: 1 }, emit, reconcile);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('never lets a reconciliation failure throw out of the poller emit path', async () => {
    const emit = vi.fn();
    const reconcile = vi.fn(() => Promise.reject(new Error('vela unreachable')));
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    expect(() =>
      handlePolledWorkspaceInvalidation({ type: 'team-projects-changed', at: 1 }, emit, reconcile),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(unhandled).not.toHaveBeenCalled();
    process.removeListener('unhandledRejection', unhandled);
  });
});

// Scope-boundary guard (real source, not a re-implementation) — the sibling of
// `hub-workspace-context-changed-poll.test.ts`'s own switch-boundary test.
// Confirms the wiring actually landed in server.ts: exactly the
// `team-projects-changed` case calls `handleHubTeamProjectsChanged`, and the
// poller's `emit` wiring calls `handlePolledWorkspaceInvalidation`.
describe('server.ts wiring (source boundary)', () => {
  const serverSourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/server.ts',
  );
  const source = fs.readFileSync(serverSourcePath, 'utf8');

  function extractOnEventSwitchBody(): string {
    const anchor = 'onEvent: (event, connection) => {';
    const start = source.indexOf(anchor);
    expect(start, 'expected to find the hub events onEvent handler in server.ts').toBeGreaterThan(-1);
    const switchStart = source.indexOf('switch (event.type) {', start);
    expect(switchStart, 'expected a switch(event.type) right after onEvent').toBeGreaterThan(-1);
    let depth = 0;
    let i = switchStart + 'switch (event.type) {'.length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    expect(depth, 'expected the switch braces to balance').toBe(0);
    return source.slice(switchStart, i + 1);
  }

  it('resets directory and exact authority across credential changes before refreshing hub endpoints', () => {
    const resetHelperStart = source.indexOf(
      'const resetWorkspaceIdentityCaches = (): void => {',
    );
    const start = source.indexOf(
      'const refreshWorkspaceHubAccountIdentity = (): void => {',
    );
    const end = source.indexOf(
      'const fetchWorkspaceDirectoryForAccountSurface = () => {',
      start,
    );
    expect(resetHelperStart).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(resetHelperStart);
    expect(end).toBeGreaterThan(start);
    const resetHelperBody = source.slice(resetHelperStart, start);
    expect(resetHelperBody).toContain(
      'workspaceDirectoryAuthority.resetIdentity();',
    );
    expect(resetHelperBody).toContain(
      'workspaceExactAuthorityCache.resetIdentity();',
    );
    expect(resetHelperBody).toContain(
      'workspaceExactContextCache.resetIdentity();',
    );
    const body = source.slice(start, end);
    const resetStart = body.indexOf('resetWorkspaceIdentityCaches();');
    const endpointRefreshStart = body.indexOf(
      'workspaceHubSubscriptions?.refreshEndpoints();',
    );
    expect(resetStart).toBeGreaterThan(-1);
    expect(endpointRefreshStart).toBeGreaterThan(resetStart);
  });

  it('routes both project catalog event families through project reconciliation', () => {
    const switchBody = extractOnEventSwitchBody();
    const cases = switchBody.split(/(?=case '[a-z-]+':)/g).filter((chunk) => chunk.startsWith("case '"));
    expect(cases.length).toBeGreaterThanOrEqual(7);

    const casesCallingReconcile = cases.filter((chunk) => /handleHubTeamProjectsChanged\(/.test(chunk));
    const caseNames = casesCallingReconcile.map((chunk) => chunk.match(/^case '([a-z-]+)':/)?.[1]);
    expect(caseNames).toEqual(['team-projects-changed', 'team-resources-changed']);
  });

  it('routes project resource retractions through project reconciliation instead of the generic resource lane', () => {
    const switchBody = extractOnEventSwitchBody();
    const teamResourcesCase = switchBody
      .split(/(?=case '[a-z-]+':)/g)
      .find((chunk) => chunk.startsWith("case 'team-resources-changed':"));

    expect(teamResourcesCase).toContain("event.resourceKind === 'project'");
    expect(teamResourcesCase).toContain('handleHubTeamProjectsChanged(');
    expect(teamResourcesCase).toContain('reconcileWorkspaceProjectsFromRemote(');
  });

  it('runs targeted metadata reconciliation only from project-metadata-changed', () => {
    const switchBody = extractOnEventSwitchBody();
    const cases = switchBody.split(/(?=case '[a-z-]+':)/g).filter((chunk) => chunk.startsWith("case '"));
    const casesCallingTargetedMetadata = cases.filter((chunk) =>
      /reconcileWorkspaceProjectMetadataFromRemote\(/.test(chunk),
    );
    expect(casesCallingTargetedMetadata.map((chunk) =>
      chunk.match(/^case '([a-z-]+)':/)?.[1],
    )).toEqual(['project-metadata-changed']);
  });

  it('only starts hub missing-project recovery for a targeted project id', () => {
    const switchBody = extractOnEventSwitchBody();
    const teamProjectsCase = switchBody
      .split(/(?=case '[a-z-]+':)/g)
      .find((chunk) => chunk.startsWith("case 'team-projects-changed':"));

    expect(teamProjectsCase).toContain(
      'if (event.workspaceId && event.projectId) {',
    );
    expect(teamProjectsCase).toContain(
      'proactiveContentPull.materializeMissingProjects(\n' +
        '              event.workspaceId,\n' +
        '              event.projectId,\n' +
        '            );',
    );
  });

  it('logs broad-head cooldown deferrals in catch-up completion diagnostics', () => {
    // Matched without the closing backtick so the assertion survives further
    // fields being appended to the same template — it is here to pin that
    // suppressed/complete are still reported, not to freeze the line's length.
    expect(source).toContain(
      'suppressed=${event.suppressed ?? 0} complete=${event.complete === true}',
    );
  });

  it('reports background materialization volume in catch-up completion diagnostics', () => {
    // `candidates` counts projects CONSIDERED, which says nothing about what
    // actually landed on a member's disk. These totals are the only reading
    // that makes OD_COLLAB_BACKGROUND_PULL_MAX_CUMULATIVE_ENTRIES choosable
    // from a diagnostics bundle, so the guard's `volume()` has to reach this
    // sink — a counter nothing reads is why that ceiling stayed unset.
    expect(source).toContain('const backgroundVolume = backgroundPullSizeGuard.volume();');
    expect(source).toContain('processEntries=${backgroundVolume.entries}');
    expect(source).toContain('processProjects=${backgroundVolume.countedProjects}');
    expect(source).toContain('processUncounted=${backgroundVolume.uncountedProjects}');
  });

  it('wires exact-scope recovery pollers through reconciliation and bounded full recovery', () => {
    const anchor = 'createWorkspaceInvalidationPoller({';
    const start = source.indexOf(anchor);
    expect(start, 'expected to find createWorkspaceInvalidationPoller(...) in server.ts').toBeGreaterThan(-1);
    // Brace-balance from the opening `{` (not a naive `indexOf('});')`, which
    // would stop at the first NESTED closing brace inside e.g.
    // `getWorkspaceContext: async () => { ... }`).
    let depth = 0;
    let i = start + anchor.length - 1; // position of the opening brace
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    expect(depth, 'expected createWorkspaceInvalidationPoller({...}) braces to balance').toBe(0);
    const configBody = source.slice(start, i + 1);
    expect(configBody).toContain(
      'activeTeamWorkspaceIdentity(context)?.workspaceId ?? workspaceId,',
    );
    expect(configBody).toContain(
      'listTeamProjects: (context) => teamProjectsForDisplay(context),',
    );
    expect(configBody).not.toContain('polledWorkspaceIdForReconcile');
    expect(configBody).toContain(
      'onTeamProjectsObserved: ({ workspaceId: observedWorkspaceId }) =>\n' +
        '          proactiveContentPull.advanceRecoveryFloor(observedWorkspaceId),',
    );
    expect(configBody).not.toContain('activeWorkspace');
    expect(configBody).toContain(
      'resolveAuthoritativeTeamWorkspaceContext(workspaceId)',
    );
    expect(configBody).not.toContain('collab.workspaceContext.current({})');
    const emitStart = configBody.indexOf('emit: (payload, context) => {');
    const emitEnd = configBody.indexOf(
      'onTeamProjectsObserved:',
      emitStart,
    );
    expect(emitStart).toBeGreaterThan(-1);
    expect(emitEnd).toBeGreaterThan(emitStart);
    expect(configBody.slice(emitStart, emitEnd)).not.toContain(
      'proactiveContentPull.advanceRecoveryFloor',
    );
  });

  it('disposes proactive pull retry timers during daemon shutdown', () => {
    const anchor = 'const cleanupDaemonBackgroundWork = () => {';
    const start = source.indexOf(anchor);
    expect(start, 'expected daemon background cleanup in server.ts').toBeGreaterThan(-1);
    const end = source.indexOf('};', start);
    expect(end, 'expected daemon background cleanup to close').toBeGreaterThan(start);
    const cleanupBody = source.slice(start, end + 2);
    expect(cleanupBody).toContain('proactiveContentPull.dispose();');
  });

  it('recovers promotion journals before registering collaboration pull routes', () => {
    const recovery = source.indexOf(
      'await recoverAuthorizedTeamProjectPromotions({',
    );
    const routes = source.indexOf(
      'const collabSyncRoutes = registerCollabSyncRoutes(app, {',
    );
    expect(recovery).toBeGreaterThan(-1);
    expect(routes).toBeGreaterThan(recovery);
    expect(source.slice(recovery, routes)).toContain(
      'allowedProjectsRoot: PROJECTS_DIR',
    );
    expect(source.slice(recovery, routes)).toContain(
      'getTeamProjectMaterialization(',
    );
  });

  it('wires the exact proactive invocation and transactional receipt materializer', () => {
    expect(source).toContain(
      'materializeAuthorizedTeamMirror: (input, scope, receipt) =>\n' +
        '        materializePulledTeamMirror(db, input, scope, receipt)',
    );
    expect(source).toContain(
      '}, target.authorizationWitness, expectedVersion, target.authorizedStageInvocation)',
    );
    expect(source).not.toContain(
      'getActiveWorkspaceSnapshot: authorizedActiveWorkspaceSnapshot',
    );
    expect(source).toContain(
      'authorizedTeamProjectPull: {\n' +
        '      journalDir: teamMirrorPromotionJournalDir,\n' +
        '    },',
    );
  });

  it('authorizes reconnect catch-up from the expected Workspace directory identity', () => {
    const anchor = 'listSharedProjects: async (workspaceId) => {';
    const start = source.indexOf(anchor);
    const end = source.indexOf('hasMaterializedProject:', start);
    const body = source.slice(start, end);
    expect(body).not.toContain('activeWorkspace.get()');
    expect(body).not.toContain('collab.workspaceContext.current({})');
    expect(body).not.toContain('lastKnown');
    expect(body).toContain(
      'resolveAuthoritativeTeamWorkspaceContext(workspaceId)',
    );
    expect(
      body.split('resolveAuthoritativeTeamWorkspaceContext(workspaceId)')
        .length - 1,
    ).toBe(2);
  });

  it('does not drop subscribed Workspace A hub data when Workspace B is ambient', () => {
    const start = source.indexOf(
      'const startWorkspaceHubSubscriber = (subscribedWorkspaceId: string) =>',
    );
    const end = source.indexOf(
      'workspaceHubSubscriptions = createWorkspaceHubSubscriptionManager({',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    expect(body).not.toContain(
      'subscribedWorkspaceId === activeWorkspace.get()?.trim()',
    );
    expect(body).not.toContain('if (!isAmbientWorkspace');
    expect(body).toContain(
      'event.workspaceId ?? subscribedWorkspaceId',
    );
    expect(body).toContain(
      'workspaceId: eventWorkspaceId',
    );
  });

  it('runs reconnect and source-gap recovery for the exact subscribed Workspace', () => {
    const start = source.indexOf(
      'const startWorkspaceHubSubscriber = (subscribedWorkspaceId: string) =>',
    );
    const end = source.indexOf(
      'workspaceHubSubscriptions = createWorkspaceHubSubscriptionManager({',
      start,
    );
    const body = source.slice(start, end);
    const reconnectStart = body.indexOf('onReconnect: (connection) => {');
    const sourceGapStart = body.indexOf('onSourceGap:', reconnectStart);
    const errorStart = body.indexOf('onError:', sourceGapStart);
    expect(reconnectStart).toBeGreaterThan(-1);
    expect(sourceGapStart).toBeGreaterThan(reconnectStart);
    expect(errorStart).toBeGreaterThan(sourceGapStart);

    const reconnectBody = body.slice(reconnectStart, sourceGapStart);
    const sourceGapBody = body.slice(sourceGapStart, errorStart);
    expect(reconnectBody).not.toContain('activeWorkspace.get()');
    expect(sourceGapBody).not.toContain('activeWorkspace.get()');
    expect(reconnectBody).toContain(
      'reconcileWorkspaceProjectsFromRemote(subscribedWorkspaceId)',
    );
    expect(reconnectBody).toContain(
      "reconcileTeamResourcesFromRemote(undefined, subscribedWorkspaceId, 'catch-up')",
    );
    expect(sourceGapBody).toContain(
      'workspaceId ?? subscribedWorkspaceId',
    );
    expect(sourceGapBody).toContain("'catch-up'");
  });

  it('polls leased, subscribed, and persisted Team resource Workspaces instead of only ambient', () => {
    const persistentIdsStart = source.indexOf(
      'const persistentTeamResourceBackgroundWorkspaceIds = (): string[] => {',
    );
    const idsStart = source.indexOf(
      'const teamResourceBackgroundWorkspaceIds = (',
      persistentIdsStart,
    );
    const timerStart = source.indexOf(
      'const teamResourcesPollTimer = setInterval(() => {',
      idsStart,
    );
    expect(persistentIdsStart).toBeGreaterThan(-1);
    expect(idsStart).toBeGreaterThan(-1);
    expect(timerStart).toBeGreaterThan(idsStart);
    const persistentIdsBody = source.slice(persistentIdsStart, idsStart);
    const idsBody = source.slice(idsStart, timerStart);
    expect(idsBody).toContain('rememberedTeamResourceScopes.activeWorkspaceLeases()');
    expect(persistentIdsBody).toContain(
      'workspaceHubSubscriptions?.activeWorkspaceIds()',
    );
    expect(persistentIdsBody).toContain('listTeamWorkspaceProjectShares(db)');
    expect(persistentIdsBody).toContain(
      'listTeamWorkspaceResourceWorkspaceIds(db)',
    );

    const start = source.indexOf('const teamResourcesPollTimer = setInterval(() => {');
    const end = source.indexOf('teamResourcesPollTimer.unref?.();', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    expect(body).not.toContain('activeWorkspace.get()');
    expect(body).toContain('teamResourceBackgroundWorkspaceIds(');
    expect(body).toContain(
      'const rememberedLease = persistentWorkspaceIdSet.has(workspaceId)',
    );
    expect(body).toContain('rememberedLease,');

    const refreshStart = source.indexOf(
      'const reconcileTeamResourcesFromRemote = async (',
    );
    const refreshBody = source.slice(refreshStart, persistentIdsStart);
    expect(refreshBody).toContain(
      '!rememberedTeamResourceScopes.isLeaseCurrent(rememberedLease)',
    );
    expect(refreshBody).toContain('isRefreshCurrent: () =>');
    expect(refreshBody).toContain(
      'rememberedTeamResourceScopes.isLeaseCurrent(rememberedLease)',
    );
  });

  it('keeps background authority fail-closed without renewing an expired remembered scope', () => {
    const resolverStart = source.indexOf(
      'const resolveTeamResourceScopeForWorkspaceId = async (',
    );
    const authorizationStart = source.indexOf(
      'const teamResourceScopeStillAuthorized = async (',
      resolverStart,
    );
    expect(resolverStart).toBeGreaterThan(-1);
    expect(authorizationStart).toBeGreaterThan(resolverStart);
    const resolverBody = source.slice(resolverStart, authorizationStart);

    expect(resolverBody).toContain('if (!directory.ok) return null;');
    expect(resolverBody).toContain('teamResourceRequestScopeForWorkspaceId(');
    expect(resolverBody).toContain('return scope;');
    expect(resolverBody).not.toContain('rememberTeamResourceScope(scope)');
  });

  it('materializes and reconciles Team resources before exact-scope invalidation', () => {
    const coordinatorStart = source.indexOf(
      'const teamResourceEventCoordinator = createWorkspaceTeamResourceEventCoordinator({',
    );
    const refreshStart = source.indexOf(
      'const reconcileTeamResourcesFromRemote = async (',
      coordinatorStart,
    );
    expect(coordinatorStart).toBeGreaterThan(-1);
    expect(refreshStart).toBeGreaterThan(coordinatorStart);
    const coordinatorBody = source.slice(coordinatorStart, refreshStart);
    expect(coordinatorBody).toContain(
      'const listing = await teamResourceListByKind[resourceKind].authoritative(scope);',
    );
    expect(coordinatorBody).toContain(
      '!teamResourceMaterializationIsReady(resourceKind, resource, scope)',
    );
    expect(coordinatorBody).toContain(
      'was not materialized',
    );
    expect(coordinatorBody).toContain(
      'reconcileTeamResourceKind(resourceKind, scope, resources)',
    );
    expect(coordinatorBody).toContain('emit: emitWorkspaceEvent');
    const reconcileKindStart = source.indexOf(
      'const reconcileTeamResourceKind = async (',
    );
    const readinessStart = source.indexOf(
      'const teamResourceMaterializationIsReady = (',
      reconcileKindStart,
    );
    expect(source.slice(reconcileKindStart, readinessStart)).toContain(
      'if (reconciliationError) throw reconciliationError;',
    );
    const coordinatorStartAfterReadiness = source.indexOf(
      'const teamResourceEventCoordinator = createWorkspaceTeamResourceEventCoordinator({',
      readinessStart,
    );
    const readinessBody = source.slice(readinessStart, coordinatorStartAfterReadiness);
    expect(readinessBody).toContain("if (resourceType === 'design_system')");
    expect(readinessBody).toContain('ownedDesignSystemSourceIsReady({');
    expect(readinessBody).not.toContain(
      'if (resource.ownerMemberId === scope.principal.memberId) return true;',
    );

    const designSystemSyncStart = source.indexOf(
      'async function syncSharedTeamDesignSystem(',
    );
    const skillSyncStart = source.indexOf(
      'async function syncSharedTeamSkill(',
      designSystemSyncStart,
    );
    const designSystemSyncBody = source.slice(designSystemSyncStart, skillSyncStart);
    expect(designSystemSyncBody).toContain('const ownerLocalSourceReady = ownedDesignSystemSourceIsReady({');
    expect(designSystemSyncBody).toContain('if (ownerLocalSourceReady) return;');
    expect(designSystemSyncBody).not.toContain('if (isOwnedByCurrentMember) return;');
    const designSystemAdoptionStart = source.indexOf(
      'const adoptLegacyWorkspaceTeamDesignSystemBindings = async (',
    );
    const skillAdoptionStart = source.indexOf(
      'const adoptLegacyWorkspaceTeamSkillBindings = async (',
      designSystemAdoptionStart,
    );
    const designSystemAdoptionBody = source.slice(
      designSystemAdoptionStart,
      skillAdoptionStart,
    );
    expect(designSystemAdoptionBody).toContain(
      'workspaceId,\n          `user:${entry.name}`,\n          entry.name,',
    );

    const pollStart = source.indexOf(
      'const persistentTeamResourceBackgroundWorkspaceIds = (): string[] => {',
      refreshStart,
    );
    const refreshBody = source.slice(refreshStart, pollStart);
    expect(refreshBody).toContain('if (kinds.length === 0) return;');
    expect(refreshBody.indexOf('invalidateTeamResourceListingCaches({'))
      .toBeLessThan(refreshBody.indexOf('teamResourceEventCoordinator.refresh({'));
    expect(refreshBody).toContain('workspaceId: requestedWorkspaceId');

    const hubSwitch = extractOnEventSwitchBody();
    const resourceCase = hubSwitch
      .split(/(?=case '[a-z-]+':)/g)
      .find((chunk) => chunk.startsWith("case 'team-resources-changed':"));
    expect(resourceCase).toContain("'push'");
    expect(resourceCase).toContain('event.resourceId');
    expect(source).toContain(
      "reconcileTeamResourcesFromRemote(undefined, subscribedWorkspaceId, 'catch-up')",
    );
    expect(source).toContain("workspaceId,\n        'poll',");
  });

  it('has no ambient active-workspace invalidation poller or hub subscription', () => {
    expect(source).not.toContain(
      'const workspaceInvalidationPoller = createWorkspaceInvalidationPoller({',
    );
    expect(source).not.toContain(
      'workspaceHubSubscriptions.setAmbientWorkspace(',
    );
    expect(source).not.toContain('activeWorkspace.subscribe(');
    expect(source).toContain(
      'const workspaceInvalidationPollerFor = (workspaceIdInput: string) => {',
    );
  });

  it('never lets display cache readers infer scope from workspaceContext current or lastKnown', () => {
    const projectsStart = source.indexOf('const teamProjectsForDisplay = async (');
    const projectsEnd = source.indexOf('const teamProjectsForRequest = async (', projectsStart);
    const projectsBody = source.slice(projectsStart, projectsEnd);
    expect(projectsBody).not.toContain('workspaceContext.current');
    expect(projectsBody).not.toContain('lastKnown');

    const membersStart = source.indexOf('const teamMembersForDisplay = async (');
    const membersEnd = source.indexOf('let workspaceHubSubscriptions:', membersStart);
    const membersBody = source.slice(membersStart, membersEnd);
    expect(membersBody).not.toContain('workspaceContext.current');
    expect(membersBody).not.toContain('lastKnown');
  });

  it('serves repeated collab status owner reads from the explicit display cache while revocation stays fresh', () => {
    const freshOwnerStart = source.indexOf(
      'const resolveSharedProjectOwner = async (',
    );
    const statusOwnerStart = source.indexOf(
      'const resolveSharedProjectOwnerForStatus = async (',
      freshOwnerStart,
    );
    const presenceStart = source.indexOf(
      'const authoritativePresenceWorkspaces',
      statusOwnerStart,
    );
    expect(freshOwnerStart).toBeGreaterThan(-1);
    expect(statusOwnerStart).toBeGreaterThan(freshOwnerStart);
    expect(presenceStart).toBeGreaterThan(statusOwnerStart);
    const freshOwnerBody = source.slice(freshOwnerStart, statusOwnerStart);
    const statusOwnerBody = source.slice(statusOwnerStart, presenceStart);

    expect(statusOwnerBody).toContain(
      'await teamProjectsDisplayCache(explicitScope)',
    );
    expect(statusOwnerBody).not.toContain(
      'await teamProjectsLister(explicitScope.workspaceId)',
    );
    expect(freshOwnerBody).toContain(
      'await teamProjectsLister(explicitScope.workspaceId)',
    );
    expect(freshOwnerBody).not.toContain('teamProjectsDisplayCache');

    const pullStart = source.indexOf('const resolveSharedProject = async (');
    expect(pullStart).toBeGreaterThan(-1);
    expect(pullStart).toBeLessThan(freshOwnerStart);
    const pullBody = source.slice(pullStart, freshOwnerStart);
    expect(pullBody).toContain(
      'await teamProjectsLister(scope.workspaceId)',
    );
    expect(pullBody).not.toContain('teamProjectsDisplayCache');
  });

  it('recognizes an authorized remote mirror from exact version and a real live directory, not a local project manifest', () => {
    const helperStart = source.indexOf(
      'const proactiveTeamProjectMaterializedVersion = (',
    );
    const configStart = source.indexOf(
      'const proactiveContentPull = createProactiveContentPull({',
      helperStart,
    );
    expect(helperStart).toBeGreaterThan(-1);
    expect(configStart).toBeGreaterThan(helperStart);
    const helperBody = source.slice(helperStart, configStart);
    expect(helperBody).toContain('getTeamProjectMaterialization(');
    expect(helperBody).toContain('target.workspaceId');
    expect(helperBody).toContain(
      'teamProjectContentResourceId(target.projectId, target)',
    );
    expect(helperBody).toContain(
      'latestTeamProjectMaterializationVersion(',
    );

    const probeStart = source.indexOf(
      'hasMaterializedProject: async (projectId, target) => {',
      configStart,
    );
    const probeEnd = source.indexOf(
      'materializedVersion: proactiveTeamProjectMaterializedVersion,',
      probeStart,
    );
    expect(probeStart).toBeGreaterThan(configStart);
    expect(probeEnd).toBeGreaterThan(probeStart);
    const probeBody = source.slice(probeStart, probeEnd);
    expect(probeBody).toContain('const project = getProject(db, projectId);');
    expect(probeBody).toContain(
      'proactiveTeamProjectMaterializedVersion(target)',
    );
    expect(probeBody).toContain('fs.promises.lstat(projectDir)');
    expect(probeBody).toContain('entry.isDirectory()');
    expect(probeBody).toContain('!entry.isSymbolicLink()');
    expect(probeBody).not.toContain('readProjectManifest');
  });
});
