// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CmsTouchpointContext } from '@open-design/contracts/analytics';
import { resolveConsolePricingTarget } from "../../src/components/console-pricing-target";
import { setRuntimeAmrConsoleOrigin } from "../../src/runtime/amr-guidance";
import { navigateCampaignTarget, resolveCampaignTarget } from "../../src/components/touchpoint-navigation";
import { completeCampaignAction } from "../../src/components/TestCampaignModal";
import { dispatchProductionCampaignAction } from "../../src/components/ProductionCampaignModal";
import { cmsPrimaryCapture, cmsTouchpointContext } from '../../src/analytics/cms-touchpoints';
import { TouchpointLoadOwner } from '../../src/components/touchpoint-load-observability';
const open = vi.hoisted(() => vi.fn(async (_url: string) => true));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: open }));
afterEach(() => { localStorage.clear(); setRuntimeAmrConsoleOrigin(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); open.mockReset(); });
const cmsContext: CmsTouchpointContext = { host_product: 'opend', host_family: 'open-design-desktop', mode: 'production', placement_key: 'opend.home.campaign-modal', activity_id: 'a', deployment_id: 'd', content_version_id: 'v', load_attempt_id: 'attempt', decision_id: 'decision', locale: 'en' };
const actions = [{ id: "upgrade", target: { kind: "console-pricing" as const } }];
describe("console pricing host action", () => {
  it.each([['prod', 'https://open-design.ai/cloud/dashboard'], ['test', 'https://open-design.powerformer.net/cloud/dashboard'], ['local', 'http://localhost:5173/dashboard']])("resolves %s to its plan page and carries the same entry ID", (profile, base) => {
    const track = vi.fn();
    const url = new URL(resolveConsolePricingTarget({ profile, metricsConsent: true, installationId: 'rotated-install', resolvedDeviceId: 'old-install', track, cmsCapture: { context: { ...cmsContext }, eventId: crypto.randomUUID() } }));
    expect(url.origin + url.pathname).toBe(base);
    expect(url.searchParams.get('billing')).toBe('plan');
    expect(url.searchParams.has('workspaceId')).toBe(false);
    expect(url.searchParams.get('od_device_id')).toBe('rotated-install');
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ entry_id: url.searchParams.get('od_entry_id'), area: 'cms_campaign_modal', element: 'primary_cta', source_detail: 'cms_campaign_primary_cta' }), { insertId: expect.any(String) });
    expect(track).toHaveBeenCalledTimes(1);
    expect(url.searchParams.get('od_entry_source')).toBe('cms_campaign_primary_cta');
    expect(url.searchParams.has('od_campaign_id')).toBe(false);
    expect(url.searchParams.has('od_conversion_source')).toBe(false);
    expect(JSON.parse(localStorage.getItem('open-design:amr-entry-attribution:v1')!).entryId).toBe(url.searchParams.get('od_entry_id'));
  });
  it("uses runtime environment mapping and excludes device ID when consent is off", () => {
    setRuntimeAmrConsoleOrigin('https://test.example/cloud');
    const url = new URL(resolveConsolePricingTarget({ profile: 'feature-test', metricsConsent: false, installationId: 'private-device', resolvedDeviceId: 'private-resolved' }));
    expect(url.origin).toBe('https://test.example');
    expect(url.searchParams.has('od_device_id')).toBe(false);
    expect(url.searchParams.get('billing')).toBe('plan');
  });
  it("keeps Max on the default plan destination and permits a failed host open to retry before closing", async () => {
    localStorage.setItem('open-design:config', JSON.stringify({ agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } }, telemetry: { metrics: false }, installationId: 'secret', subscription: { plan: 'max' } }));
    const target = resolveCampaignTarget(actions, 'upgrade')!;
    const close = vi.fn();
    open.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(completeCampaignAction(navigateCampaignTarget(target), close, () => true)).rejects.toThrow('touchpoint_action_denied');
    expect(close).not.toHaveBeenCalled();
    await completeCampaignAction(navigateCampaignTarget(target), close, () => true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(new URL(open.mock.calls[1]![0]).searchParams.get('billing')).toBe('plan');
  });
  it("production uses the same resolver after click authorization, and refuses duplicate IDs", async () => {
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock); open.mockResolvedValue(true);
    const decision = { activityId: 'a', deploymentId: 'd', placementKey: 'opend.home.campaign-modal', content: { id: 'c' }, touchpointDecisionId: 'decision', staticActions: actions } as unknown as Parameters<typeof dispatchProductionCampaignAction>[0];
    expect(await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, { profile: 'local', metricsConsent: false })).toBe(true);
    expect(new URL(open.mock.calls[0]![0]).origin).toBe('http://localhost:5173');
    expect(await dispatchProductionCampaignAction({ ...decision, staticActions: [...actions, ...actions] }, 'upgrade', 1, () => 1, Date.now() + 60000)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it('shares authorized C with one canonical CMS primary, reuses its entry on retry and never counts auto-close', async () => {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const runtime = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', runtime); open.mockResolvedValue(true);
  const track = vi.fn(), close = vi.fn();
  const decision = { activityId: 'a', deploymentId: 'd', placementKey: 'opend.home.campaign-modal', content: { id: 'v' }, touchpointDecisionId: 'decision', staticActions: actions } as unknown as Parameters<typeof dispatchProductionCampaignAction>[0];
  const cmsCapture = { context: { ...cmsContext }, eventId: crypto.randomUUID() };
  const options = { profile: 'local', metricsConsent: false, track, cmsCapture };
  await completeCampaignAction(dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, options), close, () => true);
  expect(close).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(runtime.mock.calls[0]![1]?.body))).toMatchObject({ eventId: cmsCapture.eventId, kind: 'click' });
  expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ area: 'cms_campaign_modal', element: 'primary_cta', source_detail: 'cms_campaign_primary_cta' }), { insertId: cmsCapture.eventId });
  expect(track.mock.calls[0]![1]).not.toHaveProperty('action_id');
  expect(track.mock.calls[0]![1]).not.toHaveProperty('target_kind');
  const entryId = new URL(open.mock.calls[0]![0]).searchParams.get('od_entry_id');
  await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, options);
  expect(JSON.parse(String(runtime.mock.calls[1]![1]?.body)).eventId).toBe(cmsCapture.eventId);
  expect(new URL(open.mock.calls[1]![0]).searchParams.get('od_entry_id')).toBe(entryId);
  expect(track).toHaveBeenCalledTimes(1);
  await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, { ...options, cmsCapture: { ...cmsCapture, eventId: crypto.randomUUID() } });
  expect(track).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 410])('runtime %s refuses primary analytics and attribution', async responseStatus => {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const runtime = vi.fn(async () => new Response('{}', { status: responseStatus }));
  vi.stubGlobal('fetch', runtime); open.mockResolvedValue(true);
  const track = vi.fn();
  const decision = { activityId: 'a', deploymentId: 'd', placementKey: 'opend.home.campaign-modal', content: { id: 'v' }, touchpointDecisionId: 'decision', staticActions: actions } as unknown as Parameters<typeof dispatchProductionCampaignAction>[0];
  expect(await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, { track, cmsCapture: { context: { ...cmsContext }, eventId: crypto.randomUUID() } })).toBe(false);
  expect(track).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(localStorage.getItem('open-design:amr-entry-attribution:v1')).toBeNull();
});

it.each([true, false])('preserves renewed credential C retries, entry identity, source and consent-gated mirror: consent=%s', async consent => {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const transport = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}));
  vi.stubGlobal('fetch', transport); open.mockResolvedValue(true);
  const track = vi.fn();
  const owner = new TouchpointLoadOwner('production', 'en', () => {});
  const placement = 'opend.home.campaign-modal';
  const first = { activityId: 'a', deploymentId: 'd', placementKey: placement, content: { id: 'v' }, touchpointDecisionId: 'decision-1', staticActions: actions };
  const attempt = owner.decision(placement, owner.begin(placement), first);
  attempt.visible();
  const firstContext = cmsTouchpointContext(attempt)!;
  const renewed = { ...first, touchpointDecisionId: 'decision-2' };
  owner.decision(placement, owner.begin(placement), renewed);
  const decision = renewed as unknown as Parameters<typeof dispatchProductionCampaignAction>[0];
  const capture = cmsPrimaryCapture(attempt, renewed)!;
  const options = { profile: 'test', metricsConsent: consent, installationId: 'current-device', resolvedDeviceId: 'old-device', track, cmsCapture: capture };
  expect(await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, options)).toBe(true);
  const retry = { ...cmsPrimaryCapture(attempt, renewed)!, eventId: capture.eventId };
  expect(retry.context).toBe(capture.context);
  await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, { ...options, cmsCapture: retry });
  const urls = open.mock.calls.map(([url]) => new URL(url));
  expect(urls[1]!.searchParams.get('od_entry_id')).toBe(urls[0]!.searchParams.get('od_entry_id'));
  for (const url of urls) {
    expect(url.origin + url.pathname).toBe('https://open-design.powerformer.net/cloud/dashboard');
    expect(url.searchParams.get('billing')).toBe('plan');
    expect(url.searchParams.get('od_entry_source')).toBe('cms_campaign_primary_cta');
    expect(url.searchParams.get('od_device_id')).toBe(consent ? 'current-device' : null);
  }
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ decision_id: 'decision-2', area: 'cms_campaign_modal', element: 'primary_cta', source_product: 'open_design', source_detail: 'cms_campaign_primary_cta', entry_id: urls[0]!.searchParams.get('od_entry_id') }), { insertId: capture.eventId });
  const bodies = (path: string) => transport.mock.calls.filter(([url]) => url === path).map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies('/api/touchpoints/production-runtime/events')).toEqual([expect.objectContaining({ eventId: capture.eventId, touchpointDecisionId: 'decision-2' }), expect.objectContaining({ eventId: capture.eventId, touchpointDecisionId: 'decision-2' })]);
  const mirrors = bodies('/api/integrations/vela/analytics-entry');
  expect(mirrors).toHaveLength(consent ? 1 : 0);
  if (consent) expect(mirrors[0]).toMatchObject({ payload: { cmsEventId: capture.eventId, entryId: urls[0]!.searchParams.get('od_entry_id'), sourceDetail: 'cms_campaign_primary_cta' } });
  const next = cmsPrimaryCapture(attempt, renewed)!;
  expect(next.eventId).not.toBe(capture.eventId);
  await dispatchProductionCampaignAction(decision, 'upgrade', 1, () => 1, Date.now() + 60000, { ...options, cmsCapture: next });
  expect(track).toHaveBeenCalledTimes(2);
  expect(new URL(open.mock.calls[2]![0]).searchParams.get('od_entry_id')).not.toBe(urls[0]!.searchParams.get('od_entry_id'));
  expect(bodies('/api/integrations/vela/analytics-entry')).toHaveLength(consent ? 2 : 0);
  expect(firstContext.decision_id).toBe('decision-1');
});


it('uses resolved HTTPS facts instead of supplied Pricing metadata, and reuses one UUID without an entry', async () => {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const runtime = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}));
  vi.stubGlobal('fetch', runtime); open.mockResolvedValue(true);
  const track = vi.fn();
  const staticActions = [{ id: 'Upgrade-Label', target: { kind: 'https' as const, url: 'https://example.com' } }];
  const decision = { activityId: 'a', deploymentId: 'd', placementKey: 'opend.home.campaign-modal', content: { id: 'v' }, touchpointDecisionId: 'decision', staticActions } as unknown as Parameters<typeof dispatchProductionCampaignAction>[0];
  const cmsCapture = { context: { ...cmsContext }, eventId: crypto.randomUUID(), action: { action_id: 'forged', target_kind: 'console_pricing' as const } };
  const options = { track, cmsCapture, metricsConsent: true };
  for (let i = 0; i < 2; i++) expect(await dispatchProductionCampaignAction(decision, 'Upgrade-Label', 1, () => 1, Date.now() + 60000, options)).toBe(true);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ element: 'link_cta', action_id: 'Upgrade-Label', target_kind: 'https' }), { insertId: cmsCapture.eventId });
  expect(track.mock.calls[0]![1]).not.toHaveProperty('entry_id');
  expect(runtime.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([expect.objectContaining({ eventId: cmsCapture.eventId, kind: 'click' }), expect.objectContaining({ eventId: cmsCapture.eventId, kind: 'click' })]);
  expect(open.mock.calls.map(([url]) => url)).toEqual(['https://example.com', 'https://example.com']);
  expect(localStorage.getItem('open-design:amr-entry-attribution:v1')).toBeNull();
});
