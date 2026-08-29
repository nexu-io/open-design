// Hop-1 realtime: cloud hub → daemon thin-event subscriber.
//
// Subscribes to B's `GET /api/v1/collab/events` SSE channel (one connection
// per daemon, authenticated with the same vela control-key session everything
// else uses) and surfaces thin invalidation events. This replaces "poll every
// 5-15s and diff" as the PRIMARY freshness mechanism; the pollers stay alive
// as a lower-frequency safety net and as the sole mechanism while this
// channel is down — the channel's health is exposed through `onStateChange`
// so the caller can switch poll cadences.
//
// Reliability model (mirrors the daemon→web thin-event contract):
//   - Events are signals, not payloads; a missed event is closed by the
//     reconnect catch-up (`onReconnect` → caller re-runs its pollers once).
//   - Exponential backoff 1s→30s, forever; `resolveEndpoint` returning null
//     (signed out / no workspace) idles at the max backoff instead of
//     hammering.
//   - A heartbeat watchdog kills half-dead connections: the server sends a
//     frame at least every 15s, so 45s of silence means the TCP stream is
//     zombied and we abort + reconnect.

import type { WorkspaceBillingRevisionClock } from '@open-design/contracts';

export type HubResourceStatus = 'shared' | 'retracted';
export type HubWorkspaceMemberChange = 'added' | 'removed' | 'updated';
export type HubWorkspaceDirectoryChange =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'membership-added'
  | 'membership-updated'
  | 'membership-removed';
export type HubListenerHealth = 'starting' | 'healthy' | 'reconnecting' | 'stopped';

export interface HubListenerStatus {
  listenerEpoch: string;
  listenerHealth: HubListenerHealth;
  sourceGap: boolean;
}

export interface HubReadyFrame {
  workspaceId: string;
  capabilities: string[];
  listenerStatus: HubListenerStatus | null;
}

const BILLING_REVISION_CLOCKS_CAPABILITY = 'billing-revision-clocks-v1';
export const WORKSPACE_MEMBER_EVENTS_CAPABILITY =
  'workspace-member-events-v1';
const WORKSPACE_EVENT_LISTENER_STATUS_CAPABILITY =
  'workspace-event-listener-status-v1';
export const AUTHORITATIVE_PROJECT_PRESENCE_CAPABILITY =
  'authoritative-project-presence-v1';
export const WORKSPACE_DIRECTORY_EVENTS_CAPABILITY =
  'workspace-directory-events-v1';
const MAX_HANDLED_SOURCE_GAP_EPOCHS = 64;

export interface HubWorkspaceEvent {
  type:
    | 'team-projects-changed'
    | 'comment-changed'
    | 'presence-changed'
    | 'workspace-context-changed'
    | 'workspace-members-changed'
    | 'billing-changed'
    | 'billing-subscription-changed'
    | 'wallet-balance-changed'
    | 'project-metadata-changed'
    | 'project-content-changed'
    | 'team-resources-changed';
  workspaceId?: string;
  workspaceMemberId?: string;
  /** Subject of a workspace-members-changed event. This is distinct from the
   * authenticated workspaceMemberId carried by private billing events. */
  memberId?: string;
  memberChange?: HubWorkspaceMemberChange;
  revision?: string;
  revisionClock?: WorkspaceBillingRevisionClock;
  projectId?: string;
  resourceId?: string;
  /** Set on 'team-resources-changed': `resource_hub.resources.kind` at emit
   *  time — 'design_system' | 'plugin' | 'skill' | 'project' | any future
   *  kind. Opaque here by design (mirrors vela's own `WorkspaceEvent.
   *  resourceKind`); this daemon's `onEvent` handler owns the kind→reconciler
   *  routing. */
  resourceKind?: string;
  /** Set on 'team-resources-changed' alongside resourceKind: whether the hub
   *  write was a publish (moved the 'published' ref) or a retraction (the
   *  resource's soft-delete). */
  resourceStatus?: HubResourceStatus;
  seq?: number;
  version?: number;
  at?: string;
}

/** Account-scoped dirty signal multiplexed onto any verified Workspace SSE. */
export interface HubWorkspaceDirectoryEvent {
  type: 'workspace-directory-changed';
  workspaceId: string;
  change: HubWorkspaceDirectoryChange;
  at?: string;
}

const HUB_EVENT_TYPES = new Set<HubWorkspaceEvent['type']>([
  'team-projects-changed',
  'comment-changed',
  'presence-changed',
  'workspace-context-changed',
  'workspace-members-changed',
  'billing-changed',
  'billing-subscription-changed',
  'wallet-balance-changed',
  'project-metadata-changed',
  'project-content-changed',
  'team-resources-changed',
]);

const HUB_RESOURCE_STATUSES = new Set<HubResourceStatus>(['shared', 'retracted']);
const HUB_WORKSPACE_MEMBER_CHANGES = new Set<HubWorkspaceMemberChange>([
  'added',
  'removed',
  'updated',
]);
const HUB_WORKSPACE_DIRECTORY_CHANGES = new Set<HubWorkspaceDirectoryChange>([
  'created',
  'updated',
  'deleted',
  'membership-added',
  'membership-updated',
  'membership-removed',
]);

export function parseHubWorkspaceEvent(data: string): HubWorkspaceEvent | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (typeof parsed.type !== 'string' || !HUB_EVENT_TYPES.has(parsed.type as HubWorkspaceEvent['type'])) {
      return null;
    }
    const event: HubWorkspaceEvent = { type: parsed.type as HubWorkspaceEvent['type'] };
    if (typeof parsed.workspaceId === 'string') event.workspaceId = parsed.workspaceId;
    if (typeof parsed.workspaceMemberId === 'string') {
      event.workspaceMemberId = parsed.workspaceMemberId;
    }
    if (typeof parsed.memberId === 'string') event.memberId = parsed.memberId;
    if (
      typeof parsed.memberChange === 'string'
      && HUB_WORKSPACE_MEMBER_CHANGES.has(
        parsed.memberChange as HubWorkspaceMemberChange,
      )
    ) {
      event.memberChange = parsed.memberChange as HubWorkspaceMemberChange;
    }
    if (typeof parsed.revision === 'string') event.revision = parsed.revision;
    const revisionClock = parseRevisionClock(parsed.revisionClock);
    if (revisionClock) event.revisionClock = revisionClock;
    if (typeof parsed.projectId === 'string') event.projectId = parsed.projectId;
    if (typeof parsed.resourceId === 'string') event.resourceId = parsed.resourceId;
    if (typeof parsed.resourceKind === 'string') event.resourceKind = parsed.resourceKind;
    if (
      typeof parsed.resourceStatus === 'string' &&
      HUB_RESOURCE_STATUSES.has(parsed.resourceStatus as HubResourceStatus)
    ) {
      event.resourceStatus = parsed.resourceStatus as HubResourceStatus;
    }
    if (typeof parsed.seq === 'number') event.seq = parsed.seq;
    if (typeof parsed.version === 'number') event.version = parsed.version;
    if (typeof parsed.at === 'string') event.at = parsed.at;
    return event;
  } catch {
    return null;
  }
}

export function parseHubWorkspaceDirectoryEvent(
  data: string,
): HubWorkspaceDirectoryEvent | null {
  const parsed = parseJsonRecord(data);
  const workspaceId =
    typeof parsed?.workspaceId === 'string' ? parsed.workspaceId.trim() : '';
  const change = parsed?.change;
  if (
    parsed?.type !== 'workspace-directory-changed'
    || !workspaceId
    || typeof change !== 'string'
    || !HUB_WORKSPACE_DIRECTORY_CHANGES.has(
      change as HubWorkspaceDirectoryChange,
    )
  ) {
    return null;
  }
  return {
    type: 'workspace-directory-changed',
    workspaceId,
    change: change as HubWorkspaceDirectoryChange,
    ...(typeof parsed.at === 'string' ? { at: parsed.at } : {}),
  };
}

export function parseHubReadyFrame(data: string): HubReadyFrame | null {
  const parsed = parseJsonRecord(data);
  const workspaceId =
    typeof parsed?.workspaceId === 'string' ? parsed.workspaceId.trim() : '';
  if (!workspaceId) return null;
  const capabilities = Array.isArray(parsed?.capabilities)
    ? parsed.capabilities.filter(
        (capability): capability is string =>
          typeof capability === 'string' && Boolean(capability.trim()),
      )
    : [];
  return {
    workspaceId,
    capabilities,
    listenerStatus: parseHubListenerStatusRecord(parsed),
  };
}

export function parseHubListenerStatus(data: string): HubListenerStatus | null {
  return parseHubListenerStatusRecord(parseJsonRecord(data));
}

function parseHubListenerStatusRecord(
  parsed: Record<string, unknown> | null,
): HubListenerStatus | null {
  if (!parsed) return null;
  const listenerEpoch =
    typeof parsed.listenerEpoch === 'string' ? parsed.listenerEpoch.trim() : '';
  const listenerHealth = parsed.listenerHealth;
  if (
    !listenerEpoch ||
    (
      listenerHealth !== 'starting' &&
      listenerHealth !== 'healthy' &&
      listenerHealth !== 'reconnecting' &&
      listenerHealth !== 'stopped'
    ) ||
    typeof parsed.sourceGap !== 'boolean'
  ) {
    return null;
  }
  return {
    listenerEpoch,
    listenerHealth,
    sourceGap: parsed.sourceGap,
  };
}

function parseRevisionClock(value: unknown): WorkspaceBillingRevisionClock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const epoch = typeof raw.epoch === 'string' ? raw.epoch.trim() : '';
  const counter = typeof raw.counter === 'string' ? raw.counter.trim() : '';
  if (!epoch || !/^(?:0|[1-9]\d*)$/.test(counter)) return null;
  return { epoch, counter };
}

function parseJsonRecord(data: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export interface HubEventsEndpoint {
  /** Absolute URL of the SSE endpoint. */
  url: string;
  /** Auth headers (Bearer control key + x-vela-workspace-id). */
  headers: Record<string, string>;
  /** Expected workspace carried by the server's `ready` frame. Catch-up and
   *  events stay gated until the stream proves this exact scope. */
  workspaceId?: string;
  /** Opaque local credential identity; never sent to or read from Vela. */
  identityKey?: string;
}

export interface HubEventsSubscriberOptions {
  /**
   * Resolve the endpoint from the CURRENT vela session + active workspace.
   * Returning null (signed out / personal-only) parks the subscriber at the
   * max backoff; it keeps re-resolving so a later sign-in picks up.
   */
  resolveEndpoint: () => Promise<HubEventsEndpoint | null>;
  onEvent: (
    event: HubWorkspaceEvent,
    connection: { identityKey?: string },
  ) => void;
  /** Account-directory dirty signal carried by any verified Workspace stream. */
  onDirectoryEvent?: (
    event: HubWorkspaceDirectoryEvent,
    connection: { identityKey?: string },
  ) => void;
  /** Terminal authorization signal emitted immediately before Vela closes a
   * revoked member's verified stream. */
  onAccessRevoked?: (revocation: {
    workspaceId?: string;
    identityKey?: string;
    reason?: string;
  }) => void;
  /** Channel health transitions — drives poll-cadence switching. */
  onStateChange?: (
    state: 'connected' | 'disconnected',
    connection: { identityKey?: string },
  ) => void;
  /** Strict authority health for adaptive polling. `healthy` is true only
   * after exact-scope verification, required roster/listener capabilities,
   * and a healthy gap-free producer status are all present. */
  onAuthorityHealthChange?: (health: {
    workspaceId?: string;
    identityKey?: string;
    healthy: boolean;
    capabilities: readonly string[];
    listenerStatus: HubListenerStatus | null;
  }) => void;
  /** Fired after a `ready` frame verifies the stream workspace. Unlike
   *  `onReconnect`, this includes the first successful connection. */
  onConnect?: (connection: {
    reconnect: boolean;
    workspaceId?: string;
    identityKey?: string;
    capabilities: readonly string[];
  }) => void;
  /** One catch-up nudge per healthy producer-listener epoch that reports a gap. */
  onSourceGap?: (gap: {
    workspaceId?: string;
    identityKey?: string;
    listenerEpoch: string;
  }) => void;
  /** Secret-free parser/scope diagnostics. Raw payloads are never exposed. */
  onDrop?: (drop: {
    reason: 'invalid-ready' | 'workspace-mismatch' | 'unverified-scope' | 'invalid-payload';
    eventName: string;
    expectedWorkspaceId?: string;
    actualWorkspaceId?: string;
  }) => void;
  /**
   * Fired on every successful (re)connect AFTER the first, i.e. whenever
   * events may have been missed. The caller should run one catch-up cycle
   * (its pollers' `pollOnce`).
   */
  onReconnect?: (connection: { identityKey?: string }) => void;
  onError?: (error: unknown) => void;
  fetchImpl?: typeof fetch;
  /** Abort the stream when no frame (event OR heartbeat) arrives for this long. */
  heartbeatTimeoutMs?: number;
  backoffMinMs?: number;
  backoffMaxMs?: number;
  /** Injectable jitter source for deterministic reconnect tests. */
  random?: () => number;
}

export interface HubEventsSubscriber {
  stop(): void;
  connected(): boolean;
  /** Re-resolve the endpoint immediately after active-workspace identity changes. */
  refreshEndpoint(): void;
}

export function startHubEventsSubscriber(options: HubEventsSubscriberOptions): HubEventsSubscriber {
  const fetchImpl = options.fetchImpl ?? fetch;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 45_000;
  const backoffMinMs = options.backoffMinMs ?? 1_000;
  const backoffMaxMs = options.backoffMaxMs ?? 30_000;
  const random = options.random ?? Math.random;

  let stopped = false;
  let isConnected = false;
  let everConnected = false;
  let backoffMs = backoffMinMs;
  let abortController: AbortController | null = null;
  let wakeSleep: (() => void) | null = null;
  let endpointGeneration = 0;
  const handledSourceGapEpochs = new Set<string>();

  const setConnected = (next: boolean, identityKey?: string) => {
    if (isConnected === next) return;
    isConnected = next;
    options.onStateChange?.(next ? 'connected' : 'disconnected', {
      ...(identityKey ? { identityKey } : {}),
    });
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wakeSleep = null;
        resolve();
      }, ms);
      timer.unref?.();
      wakeSleep = () => {
        clearTimeout(timer);
        wakeSleep = null;
        resolve();
      };
    });
  const jitteredBackoff = (ms: number): number =>
    Math.max(
      1,
      Math.floor(
        ms * (1 + Math.min(0.999_999, Math.max(0, random())) * 0.5),
      ),
    );

  async function consumeStream(
    endpoint: HubEventsEndpoint,
  ): Promise<'closed' | 'rejected' | 'revoked'> {
    abortController = new AbortController();
    let watchdog: NodeJS.Timeout | null = null;
    let scopeVerified = false;
    let verifiedWorkspaceId: string | undefined;
    let verifiedCapabilities: readonly string[] = [];
    let lastListenerStatus: HubListenerStatus | null = null;
    let lastAuthorityHealthy: boolean | null = null;
    const publishAuthorityHealth = (
      status: HubListenerStatus | null,
      forceUnhealthy = false,
    ) => {
      lastListenerStatus = status;
      const healthy =
        !forceUnhealthy &&
        scopeVerified &&
        verifiedCapabilities.includes(WORKSPACE_MEMBER_EVENTS_CAPABILITY) &&
        verifiedCapabilities.includes(
          WORKSPACE_EVENT_LISTENER_STATUS_CAPABILITY,
        ) &&
        status?.listenerHealth === 'healthy' &&
        status.sourceGap === false;
      if (lastAuthorityHealthy === healthy) return;
      lastAuthorityHealthy = healthy;
      try {
        options.onAuthorityHealthChange?.({
          ...(verifiedWorkspaceId ? { workspaceId: verifiedWorkspaceId } : {}),
          ...(endpoint.identityKey ? { identityKey: endpoint.identityKey } : {}),
          healthy,
          capabilities: [...verifiedCapabilities],
          listenerStatus: status,
        });
      } catch (error) {
        options.onError?.(error);
      }
    };
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => abortController?.abort(), heartbeatTimeoutMs);
      watchdog.unref?.();
    };

    try {
      const response = await fetchImpl(endpoint.url, {
        headers: { ...endpoint.headers, accept: 'text/event-stream' },
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`hub events stream ${response.status}`);
      }
      // Transport-connected. Do not publish a connected state until the
      // server's `ready` frame proves the exact expected workspace below.
      armWatchdog();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let connectionNotified = false;
      let revisionClocksEnabled = false;
      const reportSourceGap = (
        status: HubListenerStatus | null,
        suppressCallback = false,
      ) => {
        const handledKey =
          `${verifiedWorkspaceId ?? 'unknown'}\0${status?.listenerEpoch ?? ''}`;
        if (
          !status ||
          status.listenerHealth !== 'healthy' ||
          !status.sourceGap ||
          handledSourceGapEpochs.has(handledKey)
        ) {
          return;
        }
        handledSourceGapEpochs.add(handledKey);
        while (handledSourceGapEpochs.size > MAX_HANDLED_SOURCE_GAP_EPOCHS) {
          const oldest = handledSourceGapEpochs.values().next().value as
            | string
            | undefined;
          if (!oldest) break;
          handledSourceGapEpochs.delete(oldest);
        }
        if (!suppressCallback) {
          options.onSourceGap?.({
            ...(verifiedWorkspaceId ? { workspaceId: verifiedWorkspaceId } : {}),
            ...(endpoint.identityKey ? { identityKey: endpoint.identityKey } : {}),
            listenerEpoch: status.listenerEpoch,
          });
        }
      };
      const notifyVerifiedConnection = (
        workspaceId: string | undefined,
        capabilities: readonly string[],
      ) => {
        if (connectionNotified) return;
        connectionNotified = true;
        const reconnect = everConnected;
        everConnected = true;
        try {
          options.onConnect?.({
            reconnect,
            ...(workspaceId ? { workspaceId } : {}),
            ...(endpoint.identityKey ? { identityKey: endpoint.identityKey } : {}),
            capabilities: [...capabilities],
          });
          if (reconnect) {
            options.onReconnect?.({
              ...(endpoint.identityKey
                ? { identityKey: endpoint.identityKey }
                : {}),
            });
          }
        } catch (error) {
          options.onError?.(error);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armWatchdog();
        buffer += decoder.decode(value, { stream: true });
        // SSE permits CRLF as well as LF. Normalize only after appending so a
        // CR/LF pair split across transport chunks is still handled.
        buffer = buffer.replace(/\r\n/g, '\n');
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of rawEvent.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          const data = dataLines.join('\n');
          if (eventName === 'ready') {
            const ready = parseHubReadyFrame(data);
            if (!ready) {
              options.onDrop?.({
                reason: 'invalid-ready',
                eventName,
                ...(endpoint.workspaceId
                  ? { expectedWorkspaceId: endpoint.workspaceId }
                  : {}),
              });
              abortController?.abort();
              return 'rejected';
            }
            const actualWorkspaceId = ready.workspaceId;
            if (endpoint.workspaceId && actualWorkspaceId !== endpoint.workspaceId) {
              options.onDrop?.({
                reason: 'workspace-mismatch',
                eventName,
                expectedWorkspaceId: endpoint.workspaceId,
                actualWorkspaceId,
              });
              abortController?.abort();
              return 'rejected';
            }
            scopeVerified = true;
            verifiedWorkspaceId = actualWorkspaceId;
            verifiedCapabilities = [...ready.capabilities];
            // A verified connection has recovered from prior transport
            // failures. Terminal revocation below deliberately overrides this
            // with the maximum retry delay.
            backoffMs = backoffMinMs;
            setConnected(true, endpoint.identityKey);
            revisionClocksEnabled = ready.capabilities.includes(
              BILLING_REVISION_CLOCKS_CAPABILITY,
            );
            const reconnect = everConnected;
            notifyVerifiedConnection(actualWorkspaceId, ready.capabilities);
            // Transport reconnect already invokes the broader onReconnect
            // catch-up. A first connection has no such callback, so a healthy
            // producer-side gap reported in ready must trigger it here.
            reportSourceGap(ready.listenerStatus, reconnect);
            // `ready` verifies the stream scope and capabilities, but Vela
            // emits it before its post-subscribe membership revalidation has
            // completed. Keep the authority path conservative until the first
            // healthy post-ready status/heartbeat proves that catch-up crossed
            // that boundary.
            publishAuthorityHealth(ready.listenerStatus, true);
            continue;
          }
          if (eventName === 'source-status' || eventName === 'heartbeat') {
            if (scopeVerified) {
              const status = parseHubListenerStatus(data);
              reportSourceGap(status);
              publishAuthorityHealth(status);
            }
            continue;
          }
          if (eventName === 'access-revoked') {
            if (!scopeVerified) {
              options.onDrop?.({
                reason: 'unverified-scope',
                eventName,
                ...(endpoint.workspaceId
                  ? { expectedWorkspaceId: endpoint.workspaceId }
                  : {}),
              });
              continue;
            }
            const parsed = parseJsonRecord(data);
            const reason =
              typeof parsed?.reason === 'string' && parsed.reason.trim()
                ? parsed.reason.trim()
                : undefined;
            try {
              options.onAccessRevoked?.({
                ...(verifiedWorkspaceId
                  ? { workspaceId: verifiedWorkspaceId }
                  : {}),
                ...(endpoint.identityKey
                  ? { identityKey: endpoint.identityKey }
                  : {}),
                ...(reason ? { reason } : {}),
              });
            } catch (error) {
              options.onError?.(error);
            }
            publishAuthorityHealth(lastListenerStatus, true);
            setConnected(false, endpoint.identityKey);
            abortController?.abort();
            return 'revoked';
          }
          if (eventName === 'workspace-directory-changed') {
            if (!scopeVerified) {
              options.onDrop?.({
                reason: 'unverified-scope',
                eventName,
                ...(endpoint.workspaceId
                  ? { expectedWorkspaceId: endpoint.workspaceId }
                  : {}),
              });
              continue;
            }
            if (
              !verifiedCapabilities.includes(
                WORKSPACE_DIRECTORY_EVENTS_CAPABILITY,
              )
            ) {
              options.onDrop?.({ reason: 'invalid-payload', eventName });
              continue;
            }
            const directoryEvent = parseHubWorkspaceDirectoryEvent(data);
            if (!directoryEvent) {
              options.onDrop?.({ reason: 'invalid-payload', eventName });
              continue;
            }
            // Its workspace may be brand new and therefore intentionally does
            // NOT have to match the stream that carried the account signal.
            options.onDirectoryEvent?.(directoryEvent, {
              ...(endpoint.identityKey ? { identityKey: endpoint.identityKey } : {}),
            });
            continue;
          }
          if (eventName !== 'workspace-event') continue;
          if (!scopeVerified) {
            options.onDrop?.({
              reason: 'unverified-scope',
              eventName,
              ...(endpoint.workspaceId
                ? { expectedWorkspaceId: endpoint.workspaceId }
                : {}),
            });
            continue;
          }
          const event = parseHubWorkspaceEvent(data);
          if (!event) {
            options.onDrop?.({ reason: 'invalid-payload', eventName });
            continue;
          }
          if (
            endpoint.workspaceId &&
            event.workspaceId &&
            event.workspaceId !== endpoint.workspaceId
          ) {
            options.onDrop?.({
              reason: 'workspace-mismatch',
              eventName,
              expectedWorkspaceId: endpoint.workspaceId,
              actualWorkspaceId: event.workspaceId,
            });
            continue;
          }
          if (!revisionClocksEnabled && event.revisionClock) {
            const { revisionClock: _, ...legacyEvent } = event;
            options.onEvent(legacyEvent, {
              ...(endpoint.identityKey
                ? { identityKey: endpoint.identityKey }
                : {}),
            });
          } else {
            options.onEvent(event, {
              ...(endpoint.identityKey
                ? { identityKey: endpoint.identityKey }
                : {}),
            });
          }
        }
      }
      return 'closed';
    } finally {
      if (watchdog) clearTimeout(watchdog);
      abortController = null;
      if (scopeVerified) publishAuthorityHealth(lastListenerStatus, true);
      setConnected(false, endpoint.identityKey);
    }
  }

  void (async () => {
    while (!stopped) {
      const generation = endpointGeneration;
      try {
        const endpoint = await options.resolveEndpoint();
        if (stopped) break;
        // A workspace switch may land while endpoint resolution is in flight.
        // Never open the now-stale scope; resolve again from current identity.
        if (generation !== endpointGeneration) continue;
        if (!endpoint) {
          // Signed out / no team workspace — idle at max backoff, keep probing.
          await sleep(jitteredBackoff(backoffMaxMs));
          continue;
        }
        const outcome = await consumeStream(endpoint);
        if (generation !== endpointGeneration) {
          backoffMs = backoffMinMs;
          continue;
        }
        // Server closed cleanly (deploy/restart) — reconnect promptly. A
        // terminal revocation or untrusted ready frame must not become a
        // one-request-per-second loop; probe only at the bounded maximum until
        // membership, deployment, or scope changes.
        backoffMs = outcome === 'closed' ? backoffMinMs : backoffMaxMs;
      } catch (error) {
        // Deliberately aborting the old workspace stream is not a transport
        // failure and must not surface a misleading reconnect warning.
        if (!stopped && generation === endpointGeneration) options.onError?.(error);
      }
      if (stopped) break;
      if (generation !== endpointGeneration) {
        backoffMs = backoffMinMs;
        continue;
      }
      await sleep(jitteredBackoff(backoffMs));
      backoffMs = Math.min(backoffMs * 2, backoffMaxMs);
    }
  })();

  return {
    stop() {
      stopped = true;
      abortController?.abort();
      wakeSleep?.();
    },
    connected: () => isConnected,
    refreshEndpoint() {
      if (stopped) return;
      endpointGeneration += 1;
      abortController?.abort();
      wakeSleep?.();
    },
  };
}
