// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import {
  prepareCmsTouchpointContent,
  verifyCmsTouchpointContent,
  cmsActionCapture,
} from '../../src/analytics/cms-touchpoints';
import type { WebTouchpointContent } from '../../src/components/touchpoint-component';
import * as touchpointComponent from '../../src/components/touchpoint-component';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useEffect, useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { AnalyticsProvider, useAnalytics } from '../../src/analytics/provider';
import { capture, getAnalyticsClient } from '../../src/analytics/client';
import type { PostHog } from 'posthog-js';
import { captureCmsVisible, captureCmsPrimary, captureCmsClose, cmsPrimaryCapture, cmsTouchpointContext } from '../../src/analytics/cms-touchpoints';
import { TouchpointLoadOwner } from '../../src/components/touchpoint-load-observability';
import type { TouchpointLoadRecord } from '@open-design/contracts/api/touchpointLoadResults';
import { TestTouchpointBehaviorQueue, testTouchpointBehaviorEvent } from '../../src/components/test-touchpoint-behavior';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function owned(
  placement = 'opend.home.campaign-modal',
  mode: 'production' | 'test' = 'production',
) {
  const records: TouchpointLoadRecord[] = [];
  const owner = new TouchpointLoadOwner(mode, 'en', (record) =>
    records.push(record),
  );
  const request = owner.begin(placement);
  const decision = {
    activityId: 'a',
    deploymentId: 'd',
    content: { id: 'v' },
    placementKey: placement,
    touchpointDecisionId: 'decision',
  };
  const attempt = owner.decision(placement, request, decision);
  return { owner, decision, attempt, records };
}
describe('CMS owner adapter', () => {
  it('keeps first-visible B immutable while binding primary C to the actual renewed dispatch credential', async () => {
    const transport = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', transport);
    const { owner, attempt, decision, records } = owned('opend.home.hover-layer');
    const track = vi.fn();
    const firstB = attempt.exposure(decision)!;
    captureCmsVisible(track, attempt, firstB);
    const firstContext = cmsTouchpointContext(attempt)!;
    const renewed = { ...decision, touchpointDecisionId: 'decision-2' };
    expect(owner.decision(decision.placementKey, owner.begin(decision.placementKey), renewed)).toBe(attempt);
    const action = cmsPrimaryCapture(attempt, renewed)!;
    captureCmsPrimary(track, action);
    const retry = { ...cmsPrimaryCapture(attempt, renewed)!, eventId: action.eventId };
    expect(retry.context).toBe(action.context);
    captureCmsPrimary(track, retry);
    captureCmsVisible(track, attempt, attempt.exposure(renewed));
    await Promise.resolve();
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('ui_click', expect.objectContaining({ decision_id: 'decision-2' }), { insertId: action.eventId });
    expect(firstContext.decision_id).toBe('decision');
    expect(cmsTouchpointContext(attempt)).toBe(firstContext);
    expect(records.filter(record => record.kind === 'terminal')).toEqual([expect.objectContaining({ event_id: firstB, decision_id: 'decision' })]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('uses a retained modal dispatch credential rather than owner.latest and leaves Test credentials null', () => {
    const { owner, attempt, decision } = owned();
    cmsTouchpointContext(attempt);
    owner.decision(decision.placementKey, owner.begin(decision.placementKey), { ...decision, touchpointDecisionId: 'decision-2' });
    expect(attempt.analyticsFacts.decision_id).toBe('decision-2');
    expect(cmsPrimaryCapture(attempt, decision)?.context.decision_id).toBe('decision');
    const test = owned('opend.home.campaign-modal', 'test');
    expect(cmsPrimaryCapture(test.attempt, test.decision)?.context.decision_id).toBeNull();
  });
  it.each([
    { activityId: 'foreign' }, { deploymentId: 'foreign' },
    { content: { id: 'foreign' } }, { placementKey: 'opend.home.hover-layer' },
    { touchpointDecisionId: '' }, { touchpointDecisionId: undefined },
  ])('refuses a foreign or absent action credential: %j', overrides => {
    const { attempt, decision } = owned();
    expect(cmsPrimaryCapture(attempt, { ...decision, ...overrides })).toBeUndefined();
  });
  it('uses the owner B across actual exposure POST, terminal and typed capture without second runtime POST', async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', transport);
    const { attempt, decision, records } = owned();
    const track = vi.fn();
    attempt.ready();
    const eventId = attempt.exposure(decision);
    captureCmsVisible(track, attempt, eventId);
    captureCmsVisible(track, attempt, eventId);
    captureCmsVisible(track, attempt, attempt.exposure(decision));
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body)).eventId).toBe(eventId);
    expect(records.filter(record => record.kind === 'terminal')).toEqual([expect.objectContaining({ event_id: eventId, result: 'visible' })]);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('surface_view', expect.objectContaining({ area: 'cms_campaign_modal', element: 'modal', load_attempt_id: records[0]!.load_attempt_id }), { insertId: eventId });
    expect(track.mock.calls[0]![1]).not.toHaveProperty('event_id');
  });
  it('does not turn readiness, invalid context, cancelled attempts or absent preview owner into views', () => {
    const track = vi.fn();
    const { attempt, owner } = owned();
    attempt.ready();
    captureCmsVisible(track, attempt, crypto.randomUUID());
    owner.cancel('identity_changed');
    captureCmsVisible(track, attempt, attempt.visible());
    captureCmsVisible(track, undefined, crypto.randomUUID());
    const foreign = owned().attempt; foreign.enrich({ host_product: 'vela', host_family: 'vela-web' });
    expect(cmsTouchpointContext(foreign)).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
  it('deduplicates a primary C, keeps new actions distinct and ignores badge/entry clicks and unknown/automatic closes', () => {
    const track = vi.fn();
    const { attempt, decision } = owned();
    attempt.visible();
    const capture = cmsPrimaryCapture(attempt, decision)!;
    captureCmsPrimary(track, capture); captureCmsPrimary(track, capture);
    captureCmsPrimary(track, cmsPrimaryCapture(attempt, decision)!);
    captureCmsPrimary(track, cmsPrimaryCapture(owned('opend.home.account-badge').attempt)!);
    captureCmsPrimary(track, cmsPrimaryCapture(owned('opend.home.hover-entry').attempt)!);
    captureCmsClose(track, attempt);
    expect(track).toHaveBeenCalledTimes(2);
    captureCmsClose(track, attempt, 'close');
    captureCmsClose(track, attempt, 'secondary_close');
    expect(track.mock.calls.map(([, props]) => props.element)).toEqual(['primary_cta', 'primary_cta', 'close', 'secondary_close']);
  });
  it('groups Test with nullable decision and keeps the two hover halves on independent B values', () => {
    const track = vi.fn();
    for (const placement of ['opend.home.hover-entry', 'opend.home.hover-layer']) {
      const { attempt } = owned(placement, 'test');
      captureCmsVisible(track, attempt, attempt.visible());
    }
    expect(track.mock.calls.map(([, props]) => [props.area, props.element, props.mode, props.decision_id])).toEqual([['cms_account_badge', 'badge', 'test', null], ['cms_hover_layer', 'layer', 'test', null]]);
    expect(new Set(track.mock.calls.map(([, , options]) => options.insertId)).size).toBe(2);
  });
  it('isolates a throwing analytics callback from the owner and navigation facts', () => {
    const { attempt, decision } = owned();
    const eventId = attempt.visible();
    expect(() => captureCmsVisible(() => { throw new Error('analytics unavailable'); }, attempt, eventId)).not.toThrow();
    expect(attempt.behaviorEventId).toBe(eventId);
    expect(() => captureCmsPrimary(() => { throw new Error('analytics unavailable'); }, cmsPrimaryCapture(attempt, decision)!)).not.toThrow();
  });
  it('shares a supplied close C and returns it independently of capture delivery', () => {
    const { attempt } = owned(); attempt.visible();
    const eventId = crypto.randomUUID(); const track = vi.fn();
    expect(captureCmsClose(track, attempt, 'secondary_close', eventId)).toBe(eventId);
    expect(captureCmsClose(track, attempt, 'secondary_close', eventId)).toBe(eventId);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ element: 'secondary_close' }), { insertId: eventId });
    const suppressed = owned(); suppressed.attempt.visible();
    expect(captureCmsClose(() => { throw new Error('suppressed'); }, suppressed.attempt, 'close', eventId)).toBe(eventId);
  });
});


it('forwards B through the existing public capture envelope without writing UUID properties at the CMS call site', () => {
  const sdkCapture = vi.fn();
  const track = (event: string, properties: Record<string, unknown>, options?: { insertId?: string }) => capture({ capture: sdkCapture } as unknown as PostHog, { event, properties, insertId: options!.insertId! });
  const { attempt } = owned();
  const eventId = attempt.visible()!;
  captureCmsVisible(track, attempt, eventId);
  expect(sdkCapture).toHaveBeenCalledWith('surface_view', expect.objectContaining({ event_id: eventId, $insert_id: eventId, area: 'cms_campaign_modal' }));
});

it('keeps load/runtime collection when the real AnalyticsProvider has no consent-eligible client', async () => {
  const transport = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/events')) return Response.json({});
    if (url === '/api/version') return Response.json({ version: { version: '1.0.0' } });
    if (url === '/api/analytics/config') return Response.json({ enabled: false, key: null, host: null });
    throw new Error('Unexpected analytics request: ' + url);
  });
  vi.stubGlobal('fetch', transport);
  const { attempt, decision, records } = owned();
  const eventId = attempt.exposure(decision)!;
  let tracked = false;
  function Probe() {
    const analytics = useAnalytics();
    useEffect(() => { captureCmsVisible(analytics.track, attempt, eventId); tracked = true; }, [analytics.track]);
    return null;
  }
  await act(async () => { render(createElement(AnalyticsProvider, null, createElement(Probe))); });
  expect(tracked).toBe(true);
  expect(await getAnalyticsClient({ anonymousId: 'private-device', sessionId: 'session', clientType: 'web', isFirstSession: false, locale: 'en', appVersion: '1.0.0' })).toBeNull();
  expect(transport.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(1);
  expect(records.some(record => record.result === 'visible' && record.event_id === eventId)).toBe(true);
  expect(transport.mock.calls.every(([url]) => ['/api/version', '/api/analytics/config', '/api/touchpoints/production-runtime/events'].includes(url))).toBe(true);
});

it('real consent-off AnalyticsProvider leaves Test B and close C available to the separate runtime sink', async () => {
  const transport = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/touchpoints/test-runtime/events') return Response.json({ accepted: true, deduplicated: false }, { status: 202 });
    if (url === '/api/version') return Response.json({ version: { version: '1.0.0' } });
    if (url === '/api/analytics/config') return Response.json({ enabled: false, key: null, host: null });
    throw new Error('Unexpected request: ' + url);
  });
  vi.stubGlobal('fetch', transport);
  const { attempt, records } = owned('opend.home.campaign-modal', 'test');
  const context = { deploymentId: 'd', scenario: 'realtime' as const, updatedAt: '', testerMemberId: 'tester',
    contextId: `ctx-v1:${'a'.repeat(64)}`, generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}` };
  const eventId = attempt.visible()!; const closeId = crypto.randomUUID();
  const queue = new TestTouchpointBehaviorQueue();
  function Probe() {
    const analytics = useAnalytics();
    const delivered = useRef(false);
    useEffect(() => {
      if (delivered.current) return;
      delivered.current = true;
      captureCmsVisible(analytics.track, attempt, eventId);
      captureCmsClose(analytics.track, attempt, 'close', closeId);
      queue.enqueue(testTouchpointBehaviorEvent(context, attempt, eventId, 'exposure')!, () => true);
      queue.enqueue(testTouchpointBehaviorEvent(context, attempt, closeId, 'click', 'close')!, () => true);
    }, [analytics.track]); return null;
  }
  await act(async () => { render(createElement(AnalyticsProvider, null, createElement(Probe))); });
  expect(await getAnalyticsClient({ anonymousId: 'private-device', sessionId: 'session', clientType: 'web', isFirstSession: false, locale: 'en', appVersion: '1.0.0' })).toBeNull();
  const bodies = transport.mock.calls.filter(([url]) => url === '/api/touchpoints/test-runtime/events').map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies).toEqual([expect.objectContaining({ kind: 'exposure', eventId }), expect.objectContaining({ kind: 'click', eventId: closeId, element: 'close' })]);
  expect(records.some(record => record.result === 'visible' && record.event_id === eventId)).toBe(true);
  queue.clear();
});


it.each(['https', 'internal'] as const)('keeps %s link metadata verbatim, excludes entry fields and deduplicates the same C', target_kind => {
  const { attempt, decision } = owned(); attempt.visible();
  const track = vi.fn();
  const capture = { ...cmsPrimaryCapture(attempt, decision)!, action: { action_id: 'Link-A_Unchanged', target_kind } };
  const attribution = { entryId: 'fake', sourceProduct: 'open_design' as const, sourceDetail: 'cms_campaign_primary_cta' as const, occurredAt: new Date().toISOString() };
  captureCmsPrimary(track, capture, attribution); captureCmsPrimary(track, capture, attribution);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ element: 'link_cta', action_id: 'Link-A_Unchanged', target_kind }), { insertId: capture.eventId });
  for (const key of ['entry_id', 'source_detail', 'source_product', 'entry_occurred_at', 'url', 'href']) expect(track.mock.calls[0]![1]).not.toHaveProperty(key);
});

const material = {
  version: 1 as const,
  materialVersionId: '12345678-1234-4234-8234-123456789012',
  sourceHash: 'a'.repeat(64),
  templateId: 'canonical-v3',
  templateVersion: 4,
  rendererDigest: `sha256:${'b'.repeat(64)}`,
  compilerIdentity: 'fixture',
  sourceDslVersion: 3 as const,
};
const dimensions = {
  template_id: material.templateId,
  template_version: 4,
  material_version_id: material.materialVersionId,
};
const digest = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
function verifiedDecision(metadata: unknown) {
  const { owner, attempt, decision } = owned();
  const entryModule = 'export {}';
  const manifest = {
    formatVersion: 2,
    runtimeKind: 'web-component',
    runtimeApiVersion: 1,
    platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
    sdkVersion: 'vela-touchpoint-sdk-v1',
    contentLine: 'no-inference',
    placements: [
      {
        key: decision.placementKey,
        entry: 'component.js',
        resources: [],
        locales: ['en'],
        requiredCapabilities: [],
        staticActions: [],
      },
    ],
    resources: ['component.js'],
    images: [],
    ...(metadata === undefined ? {} : { material: metadata }),
  };
  const content = {
    id: 'v',
    placementKey: decision.placementKey,
    locale: 'en',
    manifest,
    manifestHash: digest(JSON.stringify(manifest)),
    entryPath: 'component.js',
    entryDigest: digest(entryModule),
    entryModule,
    resources: [
      {
        path: 'component.js',
        digest: digest(entryModule),
        bytes: btoa(entryModule),
      },
    ],
    runtime: {
      kind: 'web-component',
      apiVersion: 1,
      wrapperVersion: 'vela-touchpoint-wrapper-v1',
      sdkVersion: 'vela-touchpoint-sdk-v1',
    },
    buildIdentity: { fingerprint: 'fixture' },
  } as WebTouchpointContent;
  return { owner, attempt, decision: { ...decision, content } };
}
describe('verified V3 rendered analytics identity', () => {
  it('binds real verified B/link C/X once and freezes dimensions across metadata-free and different renewals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    );
    const f = verifiedDecision(material);
    const track = vi.fn();
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    const bound = cmsTouchpointContext(f.attempt)!;
    expect(Object.isFrozen(bound)).toBe(true);
    expect(bound).toMatchObject(dimensions);
    captureCmsVisible(track, f.attempt, f.attempt.exposure(f.decision));
    for (const metadata of [undefined, { ...material, templateVersion: 99 }]) {
      const renewed = {
        ...f.decision,
        touchpointDecisionId: 'renewed',
        content: {
          ...f.decision.content,
          manifest: { ...f.decision.content.manifest, material: metadata },
        },
      };
      f.owner.decision(
        renewed.placementKey,
        f.owner.begin(renewed.placementKey),
        renewed,
      );
      await prepareCmsTouchpointContent(f.attempt, renewed, () => true);
      captureCmsPrimary(track, {
        ...cmsPrimaryCapture(f.attempt, renewed)!,
        action: { action_id: 'Link-A', target_kind: 'https' },
      });
    }
    captureCmsClose(track, f.attempt, 'close');
    expect(cmsTouchpointContext(f.attempt)).toBe(bound);
    expect(bound.decision_id).toBe('decision');
    for (const [, props] of track.mock.calls)
      expect(props).toMatchObject(dimensions);
    expect(track.mock.calls[1]![1].decision_id).toBe('renewed');
  });
  it.each([
    undefined,
    null,
    { ...material, sourceDslVersion: 2 },
    { ...material, sourceDslVersion: 4 },
    { ...material, extra: 'forbidden' },
    { ...material, materialVersionId: 'invalid' },
    { ...material, templateVersion: 0 },
    { ...material, sourceHash: 'invalid' },
  ])('omits every new key for unsupported metadata %j', async (metadata) => {
    const f = verifiedDecision(metadata);
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    expect(Object.keys(cmsTouchpointContext(f.attempt)!)).toEqual(
      Object.keys(cmsTouchpointContext(owned().attempt)!),
    );
    const track = vi.fn();
    captureCmsVisible(track, f.attempt, f.attempt.visible());
    captureCmsPrimary(track, {
      ...cmsPrimaryCapture(f.attempt, f.decision)!,
      action: { action_id: 'Link-A', target_kind: 'https' },
    });
    captureCmsClose(track, f.attempt, 'close');
    expect(track).toHaveBeenCalledTimes(3);
    for (const [, props] of track.mock.calls)
      for (const key of Object.keys(dimensions))
        expect(props).not.toHaveProperty(key);
  });
  it('does not accept shaped provenance when content integrity or current authority fails', async () => {
    const f = verifiedDecision(material);
    f.decision.content.manifestHash = digest('tampered');
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    expect(cmsTouchpointContext(f.attempt)).not.toHaveProperty('template_id');
    const cancelled = verifiedDecision(material);
    let current = true;
    let resolve!: (
      value: Awaited<
        ReturnType<typeof touchpointComponent.verifyWebTouchpoint>
      >,
    ) => void;
    const pending = new Promise<
      Awaited<ReturnType<typeof touchpointComponent.verifyWebTouchpoint>>
    >((done) => {
      resolve = done;
    });
    const verify = vi
      .spyOn(touchpointComponent, 'verifyWebTouchpoint')
      .mockImplementationOnce(() => pending);
    const binding = prepareCmsTouchpointContent(
      cancelled.attempt,
      cancelled.decision,
      () => current,
    );
    current = false;
    cancelled.owner.cancel('identity_changed');
    resolve({
      entryUrl: 'blob:late',
      resourceUrls: new Map(),
      dispose: vi.fn(),
    });
    await binding;
    expect(cmsTouchpointContext(cancelled.attempt)).not.toHaveProperty(
      'template_id',
    );
    verify.mockRestore();
  });
  it('refuses foreign decision facts and isolates a new content attempt from stale completion', async () => {
    const f = verifiedDecision(material);
    for (const overrides of [
      { activityId: 'foreign' },
      { deploymentId: 'foreign' },
      { placementKey: 'opend.home.hover-layer' },
      { content: { ...f.decision.content, id: 'foreign' } },
    ]) {
      await prepareCmsTouchpointContent(
        f.attempt,
        { ...f.decision, ...overrides },
        () => true,
      );
      expect(cmsTouchpointContext(f.attempt)).not.toHaveProperty('template_id');
    }
    const g = verifiedDecision(material);
    await prepareCmsTouchpointContent(g.attempt, g.decision, () => true);
    const old = cmsTouchpointContext(g.attempt)!;
    const next = {
      ...g.decision,
      content: {
        ...g.decision.content,
        id: 'v2',
        manifest: {
          ...g.decision.content.manifest,
          material: { ...material, templateVersion: 5 },
        },
      },
    };
    next.content.manifestHash = digest(JSON.stringify(next.content.manifest));
    const attempt = g.owner.decision(
      next.placementKey,
      g.owner.begin(next.placementKey),
      next,
    );
    expect(attempt).not.toBe(g.attempt);
    await prepareCmsTouchpointContent(attempt, next, () => true);
    expect(cmsTouchpointContext(attempt)).toMatchObject({
      ...dimensions,
      template_version: 5,
      content_version_id: 'v2',
    });
    expect(cmsTouchpointContext(g.attempt)).toBe(old);
    expect(cmsPrimaryCapture(attempt, g.decision)).toBeUndefined();
  });
});

function roleDecision(kind: 'https' | 'internal' = 'https') {
  const f = verifiedDecision(material);
  const staticActions = [
    {
      id: 'learn',
      target:
        kind === 'https'
          ? { kind: 'https' as const, url: 'https://example.com/learn' }
          : { kind: 'internal' as const, path: '/learn?q=1#x' },
    },
    { id: 'plans', target: { kind: 'console-pricing' as const } },
    {
      id: 'primary',
      target: { kind: 'https' as const, url: 'https://example.com/unbound' },
    },
  ];
  const manifest = f.decision.content.manifest;
  manifest.runtimeApiVersion = 2;
  f.decision.content.runtime.apiVersion = 2;
  manifest.placements[0]!.requiredCapabilities = ['action-console-pricing-v1'];
  manifest.placements[0]!.staticActions = staticActions;
  manifest.roleBindings = {
    version: 1,
    bindings: [
      {
        placementKey: 'opend.home.campaign-modal',
        fieldKey: 'buttons',
        buttonId: 'learn',
        role: 'primary',
      },
      {
        placementKey: 'opend.home.campaign-modal',
        fieldKey: 'buttons',
        buttonId: 'plans',
        role: 'secondary',
      },
    ],
  };
  f.decision.content.manifestHash = digest(JSON.stringify(manifest));
  return { ...f, decision: { ...f.decision, staticActions } };
}
const attribution = {
  entryId: 'entry',
  sourceProduct: 'open_design' as const,
  sourceDetail: 'cms_campaign_primary_cta' as const,
  occurredAt: '2030-01-01T00:00:00.000Z',
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function closureRoleDecision() {
  const f = roleDecision();
  const content = f.decision.content;
  const stylesheet = '.touchpoint { color: inherit; }';
  content.manifest.placements[0]!.resources = ['theme.css'];
  content.manifest.resources.push('theme.css');
  content.resources.push({
    path: 'theme.css',
    digest: digest(stylesheet),
    bytes: btoa(stylesheet),
  });
  content.manifestHash = digest(JSON.stringify(content.manifest));
  return f;
}
const closureChanges: Array<{
  name: string;
  mutate: (content: WebTouchpointContent) => void;
}> = [
  {
    name: 'entryModule',
    mutate: (c) => {
      c.entryModule = 'export const changed = true';
    },
  },
  {
    name: 'entryPath',
    mutate: (c) => {
      c.entryPath = 'theme.css';
    },
  },
  {
    name: 'entryDigest',
    mutate: (c) => {
      c.entryDigest = digest('changed entry');
    },
  },
  {
    name: 'non-entry resource bytes',
    mutate: (c) => {
      c.resources[1]!.bytes = btoa('changed css');
    },
  },
  {
    name: 'non-entry resource digest',
    mutate: (c) => {
      c.resources[1]!.digest = digest('changed css');
    },
  },
  {
    name: 'non-entry resource path',
    mutate: (c) => {
      c.resources[1]!.path = 'other.css';
    },
  },
  {
    name: 'entry resource bytes',
    mutate: (c) => {
      c.resources[0]!.bytes = btoa('changed entry');
    },
  },
  {
    name: 'resource removal',
    mutate: (c) => {
      c.resources.pop();
    },
  },
  {
    name: 'resource addition',
    mutate: (c) => {
      c.resources.push({
        path: 'extra.css',
        digest: digest('extra'),
        bytes: btoa('extra'),
      });
    },
  },
  {
    name: 'full resource inventory replacement',
    mutate: (c) => {
      c.resources = [
        { ...c.resources[0]! },
        {
          path: 'replacement.css',
          digest: digest('replacement'),
          bytes: btoa('replacement'),
        },
      ];
    },
  },
  {
    name: 'resource inventory order',
    mutate: (c) => {
      c.resources.reverse();
    },
  },
  {
    name: 'runtime kind',
    mutate: (c) => {
      Object.assign(c.runtime, { kind: 'foreign' });
    },
  },
  {
    name: 'runtime API version',
    mutate: (c) => {
      c.runtime.apiVersion = 1;
    },
  },
  {
    name: 'runtime wrapper version',
    mutate: (c) => {
      Object.assign(c.runtime, { wrapperVersion: 'foreign' });
    },
  },
  {
    name: 'runtime SDK version',
    mutate: (c) => {
      Object.assign(c.runtime, { sdkVersion: 'foreign' });
    },
  },
  {
    name: 'build identity',
    mutate: (c) => {
      c.buildIdentity.fingerprint = 'foreign';
    },
  },
  {
    name: 'locale',
    mutate: (c) => {
      c.locale = 'zh-CN';
    },
  },
];
describe('complete verified content snapshot closure', () => {
  it.each(closureChanges)(
    'actual successful verifier refuses changed $name at deferred completion without granting private bindings',
    async ({ mutate }) => {
      const f = closureRoleDecision();
      const completed =
        deferred<
          Awaited<ReturnType<typeof touchpointComponent.verifyWebTouchpoint>>
        >();
      const release = deferred<void>();
      const actualVerify = touchpointComponent.verifyWebTouchpoint;
      const dispose = vi.fn();
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      vi.spyOn(
        touchpointComponent,
        'verifyWebTouchpoint',
      ).mockImplementationOnce(async (content) => {
        const actual = await actualVerify(content);
        const originalDispose = actual.dispose;
        actual.dispose = () => {
          dispose();
          originalDispose();
        };
        completed.resolve(actual);
        await release.promise;
        return actual;
      });
      const binding = prepareCmsTouchpointContent(
        f.attempt,
        f.decision,
        () => true,
      );
      const actual = await completed.promise;
      expect([...actual.resourceUrls.keys()]).toEqual([
        'component.js',
        'theme.css',
      ]);
      expect(Object.isFrozen(f.decision.content)).toBe(false);
      mutate(f.decision.content);
      release.resolve();
      await binding;
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(revoke.mock.calls).toEqual(
        [...actual.resourceUrls.values()].map((url) => [url]),
      );
      const context = cmsTouchpointContext(f.attempt)!;
      for (const key of Object.keys(dimensions))
        expect.soft(context).not.toHaveProperty(key);
      const capture = cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!;
      const track = vi.fn();
      captureCmsPrimary(track, capture);
      expect(track).toHaveBeenCalledTimes(1);
      expect(track.mock.calls[0]![1]).toMatchObject({
        action_id: 'learn',
        target_kind: 'https',
      });
      expect(track.mock.calls[0]![1]).not.toHaveProperty('button_role');
    },
  );
  it('unchanged actual verification preserves raw manifest ordering/hash and binds the same strict roles', async () => {
    const f = closureRoleDecision();
    const { images, ...remaining } = f.decision.content.manifest;
    f.decision.content.manifest = { images, ...remaining };
    const rawManifest = JSON.stringify(f.decision.content.manifest);
    f.decision.content.manifestHash = digest(rawManifest);
    const rawContent = JSON.stringify(f.decision.content);
    const verify = vi.spyOn(touchpointComponent, 'verifyWebTouchpoint');
    const actual = await verifyCmsTouchpointContent(
      f.attempt,
      f.decision,
      () => true,
    );
    const input = verify.mock.calls[0]![0];
    expect(input).not.toBe(f.decision.content);
    expect(JSON.stringify(input)).toBe(rawContent);
    expect(Object.keys(input.manifest)[0]).toBe('images');
    expect(JSON.stringify(input.manifest)).toBe(rawManifest);
    expect(input.manifestHash).toBe(digest(rawManifest));
    expect([...actual.resourceUrls.keys()]).toEqual([
      'component.js',
      'theme.css',
    ]);
    actual.dispose();
    expect(cmsTouchpointContext(f.attempt)).toMatchObject(dimensions);
    const track = vi.fn();
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!,
    );
    expect(track.mock.calls[0]![1]).toMatchObject({
      ...dimensions,
      action_id: 'learn',
      target_kind: 'https',
      button_role: 'primary',
    });
  });
  it('real verifier pending at its manifest digest await consumes only the isolated immutable entry/resource/runtime snapshot', async () => {
    const f = closureRoleDecision();
    const original = f.decision.content;
    const rawContent = JSON.stringify(original);
    const reached = deferred<void>();
    const release = deferred<void>();
    const actualDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
      async (...args) => {
        const result = await actualDigest(...args);
        reached.resolve();
        await release.promise;
        return result;
      },
    );
    const verify = vi.spyOn(touchpointComponent, 'verifyWebTouchpoint');
    const verifying = verifyCmsTouchpointContent(
      f.attempt,
      f.decision,
      () => true,
    );
    await reached.promise;
    const input = verify.mock.calls[0]![0];
    expect(input).not.toBe(original);
    for (const key of [
      'manifest',
      'resources',
      'runtime',
      'buildIdentity',
    ] as const) {
      expect(input[key]).not.toBe(original[key]);
      expect(Object.isFrozen(input[key])).toBe(true);
      expect(Object.isFrozen(original[key])).toBe(false);
    }
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.resources[1])).toBe(true);
    expect(
      Object.isFrozen(input.manifest.placements[0]!.staticActions[0]!.target),
    ).toBe(true);
    expect(Object.isFrozen(input.manifest.roleBindings!.bindings[0])).toBe(
      true,
    );
    for (const { mutate } of closureChanges) mutate(original);
    expect(JSON.stringify(input)).toBe(rawContent);
    release.resolve();
    const actual = await verifying;
    expect([...actual.resourceUrls.keys()]).toEqual([
      'component.js',
      'theme.css',
    ]);
    actual.dispose();
    expect(cmsTouchpointContext(f.attempt)).not.toHaveProperty('template_id');
    const track = vi.fn();
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!,
    );
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]![1]).not.toHaveProperty('button_role');
  });
  it('identical byte-preserving content/resource clone replacement still binds after actual deferred verification', async () => {
    const f = closureRoleDecision();
    const original = f.decision.content;
    const completed = deferred<void>();
    const release = deferred<void>();
    const actualVerify = touchpointComponent.verifyWebTouchpoint;
    const dispose = vi.fn();
    vi.spyOn(touchpointComponent, 'verifyWebTouchpoint').mockImplementationOnce(
      async (content) => {
        const actual = await actualVerify(content);
        const originalDispose = actual.dispose;
        actual.dispose = () => {
          dispose();
          originalDispose();
        };
        completed.resolve();
        await release.promise;
        return actual;
      },
    );
    const binding = prepareCmsTouchpointContent(
      f.attempt,
      f.decision,
      () => true,
    );
    await completed.promise;
    f.decision.content = JSON.parse(
      JSON.stringify(original),
    ) as WebTouchpointContent;
    expect(f.decision.content).not.toBe(original);
    expect(f.decision.content.resources[1]).not.toBe(original.resources[1]);
    release.resolve();
    await binding;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(cmsTouchpointContext(f.attempt)).toMatchObject(dimensions);
    const track = vi.fn();
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'plans',
      )!,
      attribution,
    );
    expect(track.mock.calls[0]![1]).toMatchObject({
      ...dimensions,
      element: 'primary_cta',
      action_id: 'plans',
      target_kind: 'console_pricing',
      button_role: 'secondary',
    });
  });
});
describe('private verified role authority', () => {
  it.each(['https', 'internal'] as const)(
    'primary %s is a link, secondary Pricing remains Pricing, surface and X have no button fields',
    async (kind) => {
      const f = roleDecision(kind);
      const track = vi.fn();
      await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
      captureCmsVisible(track, f.attempt, f.attempt.visible());
      const link = cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!;
      captureCmsPrimary(track, link, attribution);
      captureCmsPrimary(track, link, attribution);
      captureCmsPrimary(
        track,
        cmsActionCapture(
          cmsPrimaryCapture(f.attempt, f.decision),
          f.decision,
          'plans',
        )!,
        attribution,
      );
      captureCmsClose(track, f.attempt, 'close');
      expect(track.mock.calls.map(([, p]) => p.element)).toEqual([
        'modal',
        'link_cta',
        'primary_cta',
        'close',
      ]);
      expect(track.mock.calls[1]![1]).toMatchObject({
        action_id: 'learn',
        target_kind: kind,
        button_role: 'primary',
        ...dimensions,
      });
      for (const key of [
        'entry_id',
        'source_product',
        'source_detail',
        'entry_occurred_at',
        'url',
        'path',
      ])
        expect(track.mock.calls[1]![1]).not.toHaveProperty(key);
      expect(track.mock.calls[2]![1]).toMatchObject({
        action_id: 'plans',
        button_role: 'secondary',
        target_kind: 'console_pricing',
        entry_id: 'entry',
      });
      for (const index of [0, 3])
        for (const key of ['action_id', 'target_kind', 'button_role'])
          expect(track.mock.calls[index]![1]).not.toHaveProperty(key);
    },
  );
  it('roleless Pricing payload is exactly legacy, and unbound legacy primary ID does not infer a role', async () => {
    const f = roleDecision();
    delete f.decision.content.manifest.roleBindings;
    f.decision.content.manifestHash = digest(
      JSON.stringify(f.decision.content.manifest),
    );
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    f.attempt.visible();
    const track = vi.fn();
    const base = cmsPrimaryCapture(f.attempt, f.decision)!;
    const action = cmsActionCapture(base, f.decision, 'plans')!;
    captureCmsPrimary(track, action, attribution);
    expect(track.mock.calls[0]![1]).toEqual({
      ...base.context,
      page_name: 'home',
      area: 'cms_campaign_modal',
      element: 'primary_cta',
      entry_id: 'entry',
      source_product: 'open_design',
      source_detail: 'cms_campaign_primary_cta',
      entry_occurred_at: attribution.occurredAt,
    });
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'primary',
      )!,
    );
    expect(track.mock.calls[1]![1]).not.toHaveProperty('button_role');
  });
  it('binds cloned declarations once through missing/different/unverified renewed metadata and credentials', async () => {
    const f = roleDecision();
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    f.attempt.visible();
    const original = cmsTouchpointContext(f.attempt);
    const track = vi.fn();
    for (const roles of [
      undefined,
      {
        version: 1 as const,
        bindings: [
          {
            ...f.decision.content.manifest.roleBindings!.bindings[0]!,
            role: 'secondary' as const,
          },
        ],
      },
    ]) {
      const renewed = {
        ...f.decision,
        touchpointDecisionId: crypto.randomUUID(),
        content: {
          ...f.decision.content,
          manifestHash: digest('unverified renewal'),
          manifest: {
            ...f.decision.content.manifest,
            material: undefined,
            roleBindings: roles,
          },
        },
      };
      expect(
        f.owner.decision(
          renewed.placementKey,
          f.owner.begin(renewed.placementKey),
          renewed,
        ),
      ).toBe(f.attempt);
      await prepareCmsTouchpointContent(f.attempt, renewed, () => true);
      captureCmsPrimary(
        track,
        cmsActionCapture(
          cmsPrimaryCapture(f.attempt, renewed),
          renewed,
          'learn',
        )!,
      );
    }
    f.decision.content.manifest.roleBindings!.bindings[0]!.role = 'secondary';
    f.decision.content.manifest.placements[0]!.staticActions[0]!.target = {
      kind: 'https',
      url: 'https://evil.example',
    };
    const retained = {
      ...f.decision,
      staticActions: [
        {
          id: 'learn',
          target: { kind: 'https' as const, url: 'https://example.com/learn' },
        },
      ],
    };
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, retained),
        retained,
        'learn',
      )!,
    );
    expect(cmsTouchpointContext(f.attempt)).toBe(original);
    expect(track.mock.calls).toHaveLength(3);
    for (const [, props] of track.mock.calls)
      expect(props).toMatchObject({ ...dimensions, button_role: 'primary' });
  });
  it.each(['https', 'internal'] as const)(
    'refuses changed full %s target of the same normalized kind',
    async (kind) => {
      const f = roleDecision(kind);
      await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
      f.attempt.visible();
      const changed = {
        ...f.decision,
        staticActions: [
          {
            id: 'learn',
            target:
              kind === 'https'
                ? {
                    kind: 'https' as const,
                    url: 'https://example.com/different',
                  }
                : { kind: 'internal' as const, path: '/different' },
          },
        ],
      };
      const track = vi.fn();
      captureCmsPrimary(
        track,
        cmsActionCapture(
          cmsPrimaryCapture(f.attempt, changed),
          changed,
          'learn',
        )!,
      );
      expect(track.mock.calls[0]![1]).toMatchObject({
        action_id: 'learn',
        target_kind: kind,
        element: 'link_cta',
      });
      expect(track.mock.calls[0]![1]).not.toHaveProperty('button_role');
    },
  );
  it('ignores caller role/receipt forgery, copied capture, unbound IDs, foreign action facts and stale owner', async () => {
    const f = roleDecision();
    await prepareCmsTouchpointContent(f.attempt, f.decision, () => true);
    f.attempt.visible();
    const base = cmsPrimaryCapture(f.attempt, f.decision)!;
    const track = vi.fn();
    const forged = {
      ...base,
      role: 'secondary',
      button_role: 'secondary',
      receipt: f.decision.content.manifest.roleBindings,
    };
    captureCmsPrimary(track, cmsActionCapture(forged, f.decision, 'learn')!);
    captureCmsPrimary(track, {
      ...base,
      eventId: crypto.randomUUID(),
      action: {
        action_id: 'learn',
        target_kind: 'https',
        button_role: 'secondary',
      },
    } as typeof base);
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'primary',
      )!,
    );
    expect(cmsActionCapture(base, f.decision, 'unknown')).toBeUndefined();
    for (const change of [
      { activityId: 'foreign' },
      { deploymentId: 'foreign' },
      { placementKey: 'opend.home.hover-layer' },
      { content: { id: 'foreign' } },
      { touchpointDecisionId: 'foreign' },
    ]) {
      captureCmsPrimary(
        track,
        cmsActionCapture(
          cmsPrimaryCapture(f.attempt, f.decision),
          { ...f.decision, ...change },
          'learn',
        )!,
      );
    }
    f.owner.cancel('page_left');
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!,
    );
    for (const [, props] of track.mock.calls)
      expect(props).not.toHaveProperty('button_role');
  });
  it.each(['manifest', 'hash', 'content', 'placement', 'stale'])(
    'actual successful verifier deferred at callback completion refuses changed %s and disposes temporary resources',
    async (change) => {
      const f = roleDecision();
      let current = true;
      const completed =
        deferred<
          Awaited<ReturnType<typeof touchpointComponent.verifyWebTouchpoint>>
        >();
      const release = deferred<void>();
      const actualVerify = touchpointComponent.verifyWebTouchpoint;
      const dispose = vi.fn();
      vi.spyOn(
        touchpointComponent,
        'verifyWebTouchpoint',
      ).mockImplementationOnce(async (content) => {
        const actual = await actualVerify(content);
        const originalDispose = actual.dispose;
        actual.dispose = () => {
          dispose();
          originalDispose();
        };
        completed.resolve(actual);
        await release.promise;
        return actual;
      });
      const binding = prepareCmsTouchpointContent(
        f.attempt,
        f.decision,
        () => current,
      );
      await completed.promise;
      if (change === 'manifest') {
        f.decision.content.manifest.material = {
          ...material,
          templateVersion: 99,
        };
        f.decision.content.manifest.roleBindings!.bindings[0]!.role =
          'secondary';
      }
      if (change === 'hash')
        f.decision.content.manifestHash = digest('replacement hash');
      if (change === 'content') f.decision.content.id = 'foreign';
      if (change === 'placement')
        f.decision.content.placementKey = 'opend.home.hover-layer';
      if (change === 'stale') {
        current = false;
        f.owner.cancel('page_left');
      }
      release.resolve();
      await binding;
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(cmsTouchpointContext(f.attempt)).not.toHaveProperty('template_id');
      const originalDecision = { ...f.decision, content: { id: 'v' } };
      const track = vi.fn();
      captureCmsPrimary(
        track,
        cmsActionCapture(
          cmsPrimaryCapture(f.attempt, originalDecision),
          originalDecision,
          'learn',
        )!,
      );
      expect(track.mock.calls[0]![1]).not.toHaveProperty('button_role');
    },
  );
  it('early sealed absence never gains dimensions or roles after actual valid V3 wrapper verification', async () => {
    const f = roleDecision();
    const absent = cmsTouchpointContext(f.attempt)!;
    expect(Object.isFrozen(absent)).toBe(true);
    const verified = await verifyCmsTouchpointContent(
      f.attempt,
      f.decision,
      () => true,
    );
    verified.dispose();
    expect(cmsTouchpointContext(f.attempt)).toBe(absent);
    expect(absent).not.toHaveProperty('template_id');
    const track = vi.fn();
    captureCmsPrimary(
      track,
      cmsActionCapture(
        cmsPrimaryCapture(f.attempt, f.decision),
        f.decision,
        'learn',
      )!,
    );
    expect(track.mock.calls[0]![1]).not.toHaveProperty('button_role');
  });
});
