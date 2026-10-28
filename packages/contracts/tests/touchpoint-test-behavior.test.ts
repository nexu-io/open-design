import { describe, expect, it } from 'vitest';
import { legacyTouchpointTestBehaviorClick, TOUCHPOINT_TEST_BEHAVIOR_BODY_LIMIT, touchpointTestBehaviorEventSchema, touchpointTestContextIdentitySchema, touchpointTestCtaElement } from '../src/api/touchpointTestRuntime';

const event = { contractVersion: 1, eventId: '11111111-1111-4111-8111-111111111111', loadAttemptId: '22222222-2222-4222-8222-222222222222',
  deploymentId: 'cm123opaque', placementKey: 'opend.home.campaign-modal', locale: 'zh-Hant-TW',
  contextId: `ctx-v1:${'a'.repeat(64)}`, generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}`, surface: 'placement', kind: 'exposure' };
// Explicit frozen catalog expectations, independent of the parser's evaluator.
const catalog = new Set([
  'opend.home.campaign-modal:placement:exposure:absent',
  'opend.home.campaign-modal:placement:click:primary_cta',
  'opend.home.campaign-modal:placement:click:close',
  'opend.home.campaign-modal:placement:click:secondary_close',
  'opend.home.account-badge:placement:exposure:absent',
  'opend.home.hover-entry:entry:exposure:absent',
  'opend.home.hover-layer:layer:exposure:absent',
  'opend.home.hover-layer:layer:click:primary_cta',
      'opend.home.hover-layer:layer:click:close',
  'vela.web.console-overlay:entry:exposure:absent',
  'vela.web.console-overlay:layer:exposure:absent',
  'vela.web.console-overlay:layer:click:primary_cta',
  'vela.web.console-overlay:layer:click:close',
  'vela.web.console-overlay:layer:click:secondary_close',
]);
const combinations = ['opend.home.campaign-modal', 'opend.home.account-badge', 'opend.home.hover-entry', 'opend.home.hover-layer', 'vela.web.console-overlay']
  .flatMap(placementKey => ['placement', 'entry', 'layer'].flatMap(surface => ['exposure', 'click'].flatMap(kind =>
    [undefined, 'primary_cta', 'close', 'secondary_close', 'unknown'].map(element => ({ placementKey, surface, kind, element,
      accepted: catalog.has(`${placementKey}:${surface}:${kind}:${element ?? 'absent'}`) })))));
describe('AMR strict Test behavior v1 mirror', () => {
  it('accepts opaque deployment IDs, UUID B/C and the exact bounded identity', () => {
    expect(TOUCHPOINT_TEST_BEHAVIOR_BODY_LIMIT).toBe(4096);
    expect(touchpointTestBehaviorEventSchema.parse(event)).toEqual(event);
    for (const element of ['primary_cta', 'close', 'secondary_close']) expect(touchpointTestBehaviorEventSchema.safeParse({ ...event, kind: 'click', element }).success).toBe(true);
  });
  it.each(['testerMemberId', 'environment', 'activityId', 'decisionId', 'touchpointDecisionId', 'authorization', 'serverTime', 'simulatedAt', 'asOf', 'lease', 'content'])('rejects extra authority %s', field => {
    expect(touchpointTestBehaviorEventSchema.safeParse({ ...event, [field]: 'forged' }).success).toBe(false);
  });
  it.each([{ generation: '0' }, { generation: 1 }, { generation: '01' }, { generation: '10000000000' },
    { contextId: 'ctx-browser' }, { contextToken: 'Bearer secret' }, { eventId: 'B' }, { loadAttemptId: 'attempt' }, { locale: 'en_US' },
    { contractVersion: 2 }, { element: 'close' }, { kind: 'click' }, { kind: 'click', element: 'dismiss' }])('rejects malformed wire %j', invalid => {
    expect(touchpointTestBehaviorEventSchema.safeParse({ ...event, ...invalid }).success).toBe(false);
  });
  it.each(combinations)('catalog $placementKey / $surface / $kind / $element => $accepted', ({ placementKey, surface, kind, element, accepted }) => {
    const input = { ...event, placementKey, surface, kind, ...(element === undefined ? {} : { element }) };
    const parsed = touchpointTestBehaviorEventSchema.safeParse(input);
    expect(parsed.success).toBe(accepted);
    if (parsed.success) expect(parsed.data).toEqual(input);
  });
  it('covers all five placements, three surfaces, both kinds and all element variants', () => {
    expect(combinations).toHaveLength(150);
    expect(combinations.filter(row => row.accepted)).toHaveLength(14);
  });
  it.each(['abcdef01-2345-4678-89ab-cdef01234567', 'ABCDEF01-2345-4678-89AB-CDEF01234567'])('preserves wire UUID case: %s', id => {
    const input = { ...event, eventId: id, loadAttemptId: id };
    expect(touchpointTestBehaviorEventSchema.parse(input)).toEqual(input);
    const click = { ...input, kind: 'click', element: 'primary_cta' };
    expect(touchpointTestBehaviorEventSchema.parse(click)).toEqual(click);
  });
  it('rejects partial and augmented identity objects', () => {
    expect(touchpointTestContextIdentitySchema.safeParse({ contextId: event.contextId }).success).toBe(false);
    expect(touchpointTestContextIdentitySchema.safeParse({ contextId: event.contextId, generation: '1', contextToken: event.contextToken, actor: 'x' }).success).toBe(false);
  });
});

describe('OBS-011 content-button click (contract v2)', () => {
  const button = { id: 'plans', role: 'secondary', targetKind: 'https', targetUrl: 'https://example.com/p7k-plans',
    templateId: 'compact', templateVersion: 8, materialVersionId: '12345678-1234-4234-8234-123456789012' } as const;
  const click = { ...event, placementKey: 'vela.web.console-overlay', surface: 'layer', contractVersion: 2, kind: 'click', element: 'secondary_cta', button };
  it('carries button ID, role, target URL, template and material version, distinct from primary', () => {
    expect(touchpointTestBehaviorEventSchema.parse(click)).toEqual(click);
    const primary = { ...click, element: 'primary_cta', button: { ...button, id: 'docs', role: 'primary', targetUrl: 'https://example.com/p7k-docs' } };
    expect(touchpointTestBehaviorEventSchema.parse(primary)).toEqual(primary);
  });
  it.each([
    ['secondary recorded as primary', { element: 'primary_cta' }],
    ['primary role recorded as secondary', { button: { ...button, role: 'primary' } }],
    ['unknown role defaulted to primary', { element: 'primary_cta', button: { ...button, role: null } }],
    ['missing button', { button: undefined }],
    ['v1 with button facts', { contractVersion: 1 }],
    ['v2 close', { element: 'close' }],
    ['link without URL', { button: { ...button, targetUrl: null } }],
    ['host-resolved target with URL', { button: { ...button, targetKind: 'console_pricing' } }],
    ['partial provenance', { button: { ...button, templateVersion: null } }],
    ['extra authority in button', { button: { ...button, href: 'x' } }],
    ['entry surface', { surface: 'entry' }],
    ['badge placement', { placementKey: 'opend.home.account-badge', surface: 'placement' }],
  ])('rejects %s', (_name, patch) => {
    expect(touchpointTestBehaviorEventSchema.safeParse({ ...click, ...patch }).success).toBe(false);
  });
  it('accepts unclassified legacy buttons honestly and hover-layer secondary buttons', () => {
    const unknown = { ...click, element: 'unclassified_cta', button: { ...button, role: null, templateId: null, templateVersion: null, materialVersionId: null } };
    expect(touchpointTestBehaviorEventSchema.safeParse(unknown).success).toBe(true);
    expect(touchpointTestBehaviorEventSchema.safeParse({ ...click, placementKey: 'opend.home.hover-layer' }).success).toBe(true);
    const pricing = { ...click, element: 'primary_cta', button: { ...button, role: 'primary', targetKind: 'console_pricing', targetUrl: null } };
    expect(touchpointTestBehaviorEventSchema.safeParse(pricing).success).toBe(true);
  });
  it('maps role to element and projects only a verified primary to strict v1', () => {
    expect([touchpointTestCtaElement('primary'), touchpointTestCtaElement('secondary'), touchpointTestCtaElement(null)])
      .toEqual(['primary_cta', 'secondary_cta', 'unclassified_cta']);
    expect(legacyTouchpointTestBehaviorClick(click as never)).toBeNull();
    expect(legacyTouchpointTestBehaviorClick({ ...click, element: 'unclassified_cta', button: { ...button, role: null } } as never)).toBeNull();
    const primary = { ...click, element: 'primary_cta', button: { ...button, role: 'primary' } };
    const legacy = legacyTouchpointTestBehaviorClick(primary as never)!;
    expect(legacy).toEqual({ ...event, placementKey: 'vela.web.console-overlay', surface: 'layer', kind: 'click', element: 'primary_cta' });
    expect(touchpointTestBehaviorEventSchema.safeParse(legacy).success).toBe(true);
  });
});
