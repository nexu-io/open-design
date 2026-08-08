import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseHubWorkspaceEvent,
  startHubEventsSubscriber,
  type HubEventsSubscriber,
} from '../../src/collab/hub-events-subscriber.js';
import { createWorkspaceBillingRuntimeCoordinator } from '../../src/collab/workspace-billing-runtime.js';
import type { VelaWorkspaceBillingProjection } from '../../src/integrations/vela-billing.js';

function sseResponse(frames: string[], opts: { holdOpen?: boolean } = {}) {
  const encoder = new TextEncoder();
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        if (!opts.holdOpen) controller.close();
        return;
      }
      if (!opts.holdOpen) controller.close();
      // holdOpen: never enqueue again — simulates a silent zombie stream.
      await new Promise(() => undefined);
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function abortableSseResponse(
  frames: string[],
  signal: AbortSignal | null | undefined,
  onAbort: () => void,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      const abort = () => {
        onAbort();
        controller.close();
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const READY = 'event: ready\ndata: {"workspaceId":"w1"}\n\n';
const HEARTBEAT = 'event: heartbeat\ndata: {}\n\n';
const COMMENT_EVENT =
  'event: workspace-event\ndata: {"type":"comment-changed","workspaceId":"w1","projectId":"p1","seq":7}\n\n';
const BILLING_KEY = { workspaceId: 'w1', workspaceMemberId: 'm1' };

function billingProjection(balanceUsd: string): VelaWorkspaceBillingProjection {
  return {
    snapshot: {
      schemaVersion: 1,
      workspaceId: BILLING_KEY.workspaceId,
      workspaceMemberId: BILLING_KEY.workspaceMemberId,
      billingScopeVersion: 2,
      billing: { billingState: 'active', planId: 'team_plus' },
      wallet: {
        balanceUsd,
        expiresAt: null,
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
      revisions: { billing: 'billing-1', wallet: `wallet-${balanceUsd}` },
    },
    workspaceBalance: {
      ...BILLING_KEY,
      billingScopeVersion: 2,
      balanceUsd,
      expiresAt: null,
      updatedAt: '2026-07-28T00:00:00.000Z',
    },
  };
}

let subscriber: HubEventsSubscriber | null = null;

afterEach(() => {
  subscriber?.stop();
  subscriber = null;
  vi.useRealTimers();
});

describe('parseHubWorkspaceEvent', () => {
  it('parses a valid thin event and drops unknown types', () => {
    expect(parseHubWorkspaceEvent('{"type":"comment-changed","projectId":"p","seq":3}')).toEqual({
      type: 'comment-changed',
      projectId: 'p',
      seq: 3,
    });
    expect(parseHubWorkspaceEvent('{"type":"mystery"}')).toBeNull();
    expect(parseHubWorkspaceEvent('not json')).toBeNull();
  });

  it('preserves v2 billing scope and revision fields for fail-closed consumers', () => {
    expect(
      parseHubWorkspaceEvent(
        '{"type":"wallet-balance-changed","workspaceId":"w1","workspaceMemberId":"m1","revision":"wallet-2"}',
      ),
    ).toEqual({
      type: 'wallet-balance-changed',
      workspaceId: 'w1',
      workspaceMemberId: 'm1',
      revision: 'wallet-2',
    });
    expect(
      parseHubWorkspaceEvent(
        '{"type":"billing-subscription-changed","workspaceId":"w1","revision":"billing-3","revisionClock":{"epoch":"billing-epoch-a","counter":"3"}}',
      ),
    ).toEqual({
      type: 'billing-subscription-changed',
      workspaceId: 'w1',
      revision: 'billing-3',
      revisionClock: {
        epoch: 'billing-epoch-a',
        counter: '3',
      },
    });
    expect(
      parseHubWorkspaceEvent(
        '{"type":"billing-changed","workspaceId":"w1","revision":"billing-3"}',
      ),
    ).toEqual({
      type: 'billing-changed',
      workspaceId: 'w1',
      revision: 'billing-3',
    });
  });

  it('drops malformed additive revision clocks and preserves the legacy event', () => {
    expect(
      parseHubWorkspaceEvent(
        '{"type":"billing-subscription-changed","workspaceId":"w1","revision":"billing:v1:3","revisionClock":{"epoch":"","counter":"-1"}}',
      ),
    ).toEqual({
      type: 'billing-subscription-changed',
      workspaceId: 'w1',
      revision: 'billing:v1:3',
    });
  });

  // workspace-team continuous-sync priority 3: the resource-hub's
  // 'team-resources-changed' push (vela API PR: emits on a 'published' ref
  // move or a resource soft-delete) needs resourceKind + resourceStatus to
  // route to the right per-kind reconciler and to tell "just shared" from
  // "just retracted" apart.
  it('parses team-resources-changed with resourceKind and resourceStatus', () => {
    expect(
      parseHubWorkspaceEvent(
        '{"type":"team-resources-changed","workspaceId":"w1","resourceId":"my-skill","resourceKind":"skill","resourceStatus":"shared","version":2}',
      ),
    ).toEqual({
      type: 'team-resources-changed',
      workspaceId: 'w1',
      resourceId: 'my-skill',
      resourceKind: 'skill',
      resourceStatus: 'shared',
      version: 2,
    });
    expect(
      parseHubWorkspaceEvent(
        '{"type":"team-resources-changed","workspaceId":"w1","resourceId":"my-skill","resourceKind":"skill","resourceStatus":"retracted"}',
      ),
    ).toMatchObject({ resourceStatus: 'retracted' });
  });

  it('drops an unrecognized resourceStatus rather than passing it through', () => {
    const event = parseHubWorkspaceEvent(
      '{"type":"team-resources-changed","workspaceId":"w1","resourceId":"r1","resourceStatus":"mystery"}',
    );
    expect(event).toEqual({
      type: 'team-resources-changed',
      workspaceId: 'w1',
      resourceId: 'r1',
    });
    expect(event).not.toHaveProperty('resourceStatus');
  });
});

describe('startHubEventsSubscriber', () => {
  it('uses revision clocks only when the ready frame advertises the capability', async () => {
    const clockEvent =
      'event: workspace-event\ndata: {"type":"billing-subscription-changed","workspaceId":"w1","revision":"billing:v1:2","revisionClock":{"epoch":"billing-epoch-a","counter":"2"}}\n\n';
    const events: unknown[] = [];
    let fetches = 0;
    let resolveBoth!: () => void;
    const both = new Promise<void>((resolve) => {
      resolveBoth = resolve;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: 'https://hub/events', headers: {} }),
      onEvent: (event) => {
        events.push(event);
        if (events.length === 2) resolveBoth();
      },
      backoffMinMs: 1,
      backoffMaxMs: 2,
      fetchImpl: async () => {
        fetches += 1;
        return fetches === 1
          ? sseResponse([
              'event: ready\ndata: {"workspaceId":"w1","capabilities":[]}\n\n',
              clockEvent,
            ])
          : sseResponse([
              'event: ready\ndata: {"workspaceId":"w1","capabilities":["billing-revision-clocks-v1"]}\n\n',
              clockEvent,
            ], { holdOpen: true });
      },
    });

    await both;
    expect(events[0]).not.toHaveProperty('revisionClock');
    expect(events[1]).toMatchObject({
      revisionClock: { epoch: 'billing-epoch-a', counter: '2' },
    });
  });

  it('reports one healthy source gap per listener epoch from status and heartbeat frames', async () => {
    const gaps: unknown[] = [];
    let resolveGaps!: () => void;
    const twoGaps = new Promise<void>((resolve) => {
      resolveGaps = resolve;
    });
    const recordGap = (gap: unknown) => {
      gaps.push(gap);
      if (gaps.length === 2) resolveGaps();
    };

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({
        url: 'https://hub/events',
        headers: {},
        workspaceId: 'w1',
      }),
      onEvent: () => undefined,
      onSourceGap: recordGap,
      fetchImpl: async () => sseResponse([
        'event: source-status\ndata: {"listenerEpoch":"listener-before-ready","listenerHealth":"healthy","sourceGap":true}\n\n',
        'event: ready\ndata: {"workspaceId":"w1","capabilities":["billing-revision-clocks-v1"],"listenerEpoch":"listener-a","listenerHealth":"starting","sourceGap":true}\n\n',
        'event: source-status\ndata: {"listenerEpoch":"listener-a","listenerHealth":"mystery","sourceGap":true}\n\n',
        'event: heartbeat\ndata: {"listenerEpoch":"listener-a","listenerHealth":"healthy","sourceGap":true}\n\n',
        'event: source-status\ndata: {"listenerEpoch":"listener-a","listenerHealth":"healthy","sourceGap":true}\n\n',
        'event: source-status\ndata: {"listenerEpoch":"listener-b","listenerHealth":"healthy","sourceGap":true}\n\n',
      ], { holdOpen: true }),
    });

    await twoGaps;
    expect(gaps).toEqual([
      { workspaceId: 'w1', listenerEpoch: 'listener-a' },
      { workspaceId: 'w1', listenerEpoch: 'listener-b' },
    ]);
  });

  it('delivers workspace-events and reports connected state', async () => {
    const events: unknown[] = [];
    const states: string[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: 'https://hub/api/v1/collab/events', headers: {} }),
      onEvent: (event) => {
        events.push(event);
        resolveDone();
      },
      onStateChange: (state) => states.push(state),
      fetchImpl: async () => sseResponse([READY, HEARTBEAT, COMMENT_EVENT], { holdOpen: true }),
    });

    await done;
    expect(events).toEqual([
      { type: 'comment-changed', workspaceId: 'w1', projectId: 'p1', seq: 7 },
    ]);
    expect(states).toEqual(['connected']);
    expect(subscriber.connected()).toBe(true);
  });

  it('fires onReconnect only from the second successful connect on', async () => {
    let connects = 0;
    const reconnects: number[] = [];
    let resolveSecond!: () => void;
    const second = new Promise<void>((r) => {
      resolveSecond = r;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: 'https://hub/events', headers: {} }),
      onEvent: () => undefined,
      onReconnect: () => {
        reconnects.push(connects);
        resolveSecond();
      },
      backoffMinMs: 1,
      backoffMaxMs: 2,
      fetchImpl: async () => {
        connects += 1;
        return sseResponse([READY]); // closes immediately → next loop reconnects
      },
    });

    await second;
    expect(reconnects[0]).toBeGreaterThanOrEqual(2);
  });

  it('fires the content catch-up hook on both the first connection and a reconnect', async () => {
    const connections: boolean[] = [];
    let fetches = 0;
    let resolveSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const options = {
      resolveEndpoint: async () => ({ url: 'https://hub/events', headers: {} }),
      onEvent: () => undefined,
      onConnect: ({ reconnect }: { reconnect: boolean }) => {
        connections.push(reconnect);
        if (connections.length === 2) resolveSecond();
      },
      backoffMinMs: 1,
      backoffMaxMs: 2,
      fetchImpl: async () => {
        fetches += 1;
        return sseResponse([READY]);
      },
    };

    // `onReconnect` deliberately skips the first successful connection. The
    // content catch-up hook must not: a published head may already exist when
    // this daemon establishes its very first stream.
    subscriber = startHubEventsSubscriber(options as Parameters<typeof startHubEventsSubscriber>[0]);

    await second;
    subscriber.stop();
    expect(fetches).toBeGreaterThanOrEqual(2);
    expect(connections).toEqual([false, true]);
  });

  it('authoritatively catches up an interested wallet mutation made while SSE is disconnected', async () => {
    let upstreamBalance = '1.00';
    let projectionReads = 0;
    let endpointResolutions = 0;
    const timeline: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        projectionReads += 1;
        timeline.push(`projection:${upstreamBalance}`);
        return billingProjection(upstreamBalance);
      },
    });

    await runtime.read(BILLING_KEY, {
      clientId: 'renderer-1',
      clientGeneration: '1',
    });

    let resolveRecovered!: () => void;
    const recovered = new Promise<void>((resolve) => {
      resolveRecovered = resolve;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => {
        endpointResolutions += 1;
        timeline.push(`resolve:${endpointResolutions}`);
        if (endpointResolutions === 2) {
          // The wallet commits after the first stream has closed and before
          // the reconnect becomes ready. No wallet invalidation is delivered.
          upstreamBalance = '2.00';
          timeline.push('wallet:2.00');
        }
        return { url: 'https://hub/events', headers: {} };
      },
      onEvent: () => undefined,
      onConnect: ({ reconnect }) => {
        timeline.push(reconnect ? 'ready:reconnect' : 'ready:first');
        if (!reconnect) return;
        runtime.reconnect(BILLING_KEY.workspaceId);
        void runtime
          .read(BILLING_KEY, {
            clientId: 'renderer-1',
            clientGeneration: '1',
          })
          .then((result) => {
            timeline.push(
              `fresh:${result.state.status}:${result.projection.workspaceBalance?.balanceUsd}`,
            );
            resolveRecovered();
          });
      },
      backoffMinMs: 1,
      backoffMaxMs: 2,
      fetchImpl: async () =>
        endpointResolutions === 1
          ? sseResponse([READY])
          : sseResponse([READY], { holdOpen: true }),
    });

    await recovered;
    expect(projectionReads).toBe(2);
    expect(runtime.peek(BILLING_KEY)).toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '2.00' } },
      state: { status: 'fresh', reason: 'reconnect' },
    });
    expect(timeline).toEqual([
      'projection:1.00',
      'resolve:1',
      'ready:first',
      'resolve:2',
      'wallet:2.00',
      'ready:reconnect',
      'projection:2.00',
      'fresh:fresh:2.00',
    ]);
    runtime.dispose();
  });

  it('reports ready capabilities per verified connection without retaining stale values', async () => {
    const capabilities: string[][] = [];
    let fetches = 0;
    let resolveSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({
        url: 'https://hub/events',
        headers: {},
        workspaceId: 'w1',
      }),
      onEvent: () => undefined,
      onConnect: ({ capabilities: readyCapabilities }) => {
        capabilities.push([...readyCapabilities]);
        if (capabilities.length === 2) resolveSecond();
      },
      backoffMinMs: 1,
      backoffMaxMs: 2,
      fetchImpl: async () => {
        fetches += 1;
        return sseResponse([
          fetches === 1
            ? 'event: ready\ndata: {"workspaceId":"w1","capabilities":["authoritative-project-presence-v1"]}\n\n'
            : 'event: ready\ndata: {"workspaceId":"w1","capabilities":[]}\n\n',
        ]);
      },
    });

    await second;
    expect(capabilities).toEqual([['authoritative-project-presence-v1'], []]);
  });

  it('immediately re-resolves and reconnects when the active workspace changes', async () => {
    let activeWorkspaceId = 'w1';
    const resolvedScopes: string[] = [];
    const connectedScopes: string[] = [];
    const abortedScopes: string[] = [];
    const errors: unknown[] = [];
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => {
        const workspaceId = activeWorkspaceId;
        resolvedScopes.push(workspaceId);
        return {
          url: 'https://hub/events',
          headers: { 'x-vela-workspace-id': workspaceId },
          workspaceId,
        };
      },
      onEvent: () => undefined,
      onConnect: ({ workspaceId }) => {
        if (!workspaceId) return;
        connectedScopes.push(workspaceId);
        if (workspaceId === 'w1') resolveFirst();
        if (workspaceId === 'w2') resolveSecond();
      },
      onError: (error) => errors.push(error),
      backoffMinMs: 1_000_000,
      backoffMaxMs: 1_000_000,
      fetchImpl: async (_url, init) => {
        const workspaceId = String(
          (init?.headers as Record<string, string>)?.['x-vela-workspace-id'],
        );
        return abortableSseResponse(
          [`event: ready\ndata: {"workspaceId":"${workspaceId}"}\n\n`],
          init?.signal,
          () => abortedScopes.push(workspaceId),
        );
      },
    });

    await first;
    activeWorkspaceId = 'w2';
    subscriber.refreshEndpoint();
    await second;

    expect(resolvedScopes.slice(0, 2)).toEqual(['w1', 'w2']);
    expect(connectedScopes).toEqual(['w1', 'w2']);
    expect(abortedScopes).toContain('w1');
    expect(errors).toEqual([]);
  });

  it('does not verify or dispatch a workspace event before the ready frame', async () => {
    const events: unknown[] = [];
    const connections: boolean[] = [];
    const drops: string[] = [];
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({
        url: 'https://hub/events',
        headers: {},
        workspaceId: 'w1',
      }),
      onEvent: (event) => events.push(event),
      onConnect: ({ reconnect }) => {
        connections.push(reconnect);
        resolveReady();
      },
      onDrop: ({ reason }) => drops.push(reason),
      fetchImpl: async () => sseResponse([COMMENT_EVENT, READY, COMMENT_EVENT], { holdOpen: true }),
    });

    await ready;
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(connections).toEqual([false]);
    expect(drops).toContain('unverified-scope');
  });

  it('reports a ready workspace mismatch and never runs connection catch-up', async () => {
    const onConnect = vi.fn();
    const onDrop = vi.fn();
    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({
        url: 'https://hub/events',
        headers: {},
        workspaceId: 'w1',
      }),
      onEvent: () => undefined,
      onConnect,
      onDrop,
      backoffMinMs: 1_000_000,
      fetchImpl: async () =>
        sseResponse(['event: ready\ndata: {"workspaceId":"w2"}\n\n'], { holdOpen: true }),
    });

    await vi.waitFor(() => {
      expect(onDrop).toHaveBeenCalledWith({
        reason: 'workspace-mismatch',
        eventName: 'ready',
        expectedWorkspaceId: 'w1',
        actualWorkspaceId: 'w2',
      });
    });
    expect(onConnect).not.toHaveBeenCalled();
  });


  it('idles when the endpoint resolves null and stops cleanly', async () => {
    let resolved = 0;
    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => {
        resolved += 1;
        return null;
      },
      onEvent: () => undefined,
      backoffMaxMs: 5,
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(resolved).toBeGreaterThanOrEqual(2);
    subscriber.stop();
    const after = resolved;
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(after);
  });

  it('aborts a silent stream once the heartbeat watchdog expires', async () => {
    let aborted = false;
    let resolveAborted!: () => void;
    const abortedOnce = new Promise<void>((r) => {
      resolveAborted = r;
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: 'https://hub/events', headers: {} }),
      onEvent: () => undefined,
      heartbeatTimeoutMs: 20,
      backoffMinMs: 1_000_000, // park after the abort so we observe exactly one cycle
      fetchImpl: async (_url, init) => {
        init?.signal?.addEventListener('abort', () => {
          if (!aborted) {
            aborted = true;
            resolveAborted();
          }
        });
        return sseResponse([READY], { holdOpen: true }); // then silence
      },
    });

    await abortedOnce;
    expect(aborted).toBe(true);
  });
});
