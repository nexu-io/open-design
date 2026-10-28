import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CmsTouchpointClickProps, CmsTouchpointContext, CmsTouchpointSurfaceViewProps, SurfaceViewProps, UiClickProps, TrackingAmrEntrySource } from '../src/analytics/events.js';

const context: CmsTouchpointContext = { host_product: 'opend', host_family: 'open-design-desktop', mode: 'test', placement_key: 'opend.home.campaign-modal', activity_id: 'a', deployment_id: 'd', content_version_id: 'v', load_attempt_id: 'attempt', decision_id: null, locale: 'en' };
describe('CMS catalog', () => {
  it('includes the controlled payloads in the event unions and independent AMR source', () => {
    expectTypeOf<CmsTouchpointClickProps>().toExtend<UiClickProps>();
    expectTypeOf<CmsTouchpointSurfaceViewProps>().toExtend<SurfaceViewProps>();
    expectTypeOf<'cms_campaign_primary_cta'>().toExtend<TrackingAmrEntrySource>();
    const view: SurfaceViewProps = { ...context, placement_key: 'opend.home.campaign-modal', page_name: 'home', area: 'cms_campaign_modal', element: 'modal' };
    expect(view.decision_id).toBeNull();
  });
  it('does not allow fabricated entry triples, badge clicks or campaign enums', () => {
    // @ts-expect-error OD hover entry reuses the badge triple.
    const entry: CmsTouchpointSurfaceViewProps = { ...context, page_name: 'home', area: 'cms_hover_entry', element: 'entry' };
    // @ts-expect-error Badge click is absent from the frozen catalog.
    const badge: CmsTouchpointClickProps = { ...context, placement_key: 'opend.home.account-badge', page_name: 'home', area: 'cms_account_badge', element: 'primary_cta' };
    // @ts-expect-error Generic strings cannot create new elements.
    const arbitrary: CmsTouchpointClickProps = { ...context, placement_key: 'opend.home.campaign-modal', page_name: 'home', area: 'cms_campaign_modal', element: 'arbitrary' };
    expect([entry, badge, arbitrary]).toHaveLength(3);
  });
});


it('types actual CMS link targets independently from Pricing and legacy primary calls', () => {
  const base = {
    ...context,
    placement_key: 'opend.home.campaign-modal' as const,
    page_name: 'home' as const,
    area: 'cms_campaign_modal' as const,
  };
  const https: CmsTouchpointClickProps = {
    ...base,
    element: 'link_cta',
    action_id: 'Link-A',
    target_kind: 'https',
  };
  const internal: CmsTouchpointClickProps = {
    ...base,
    element: 'link_cta',
    action_id: 'Link_B',
    target_kind: 'internal',
  };
  const pricing: CmsTouchpointClickProps = {
    ...base,
    element: 'primary_cta',
    entry_id: 'entry',
  };
  const legacy: CmsTouchpointClickProps = { ...base, element: 'primary_cta' };
  // @ts-expect-error Ordinary links cannot carry upgrade attribution.
  const fakeEntry: CmsTouchpointClickProps = { ...https, entry_id: 'fake' };
  // @ts-expect-error A known HTTPS target cannot become a Pricing primary.
  const fakePrimary: CmsTouchpointClickProps = {
    ...base,
    element: 'primary_cta',
    action_id: 'Link-A',
    target_kind: 'https',
  };
  // @ts-expect-error Actual target metadata must include the registered ID.
  const noId: CmsTouchpointClickProps = {
    ...base,
    element: 'link_cta',
    target_kind: 'internal',
  };
  // @ts-expect-error Pricing dimensions require a verified role too.
  const pricingDimensions: CmsTouchpointClickProps = {
    ...base,
    element: 'primary_cta',
    action_id: 'Plan-A',
    target_kind: 'console_pricing',
  };
  expect([
    https,
    internal,
    pricing,
    legacy,
    fakeEntry,
    fakePrimary,
    noId,
    pricingDimensions,
  ]).toHaveLength(8);
});

it('types verified roles independently from target semantics and analytics-only hover X', () => {
  const base = {
    ...context,
    placement_key: 'opend.home.campaign-modal' as const,
    page_name: 'home' as const,
    area: 'cms_campaign_modal' as const,
  };
  const link: CmsTouchpointClickProps = {
    ...base,
    element: 'link_cta',
    action_id: 'learn',
    target_kind: 'https',
    button_role: 'primary',
  };
  const pricing: CmsTouchpointClickProps = {
    ...base,
    element: 'primary_cta',
    action_id: 'plans',
    target_kind: 'console_pricing',
    button_role: 'secondary',
  };
  const vela: CmsTouchpointClickProps = {
    ...base,
    element: 'primary_cta',
    action_id: 'subscribe',
    target_kind: 'vela_personal_subscription',
    button_role: 'secondary',
  };
  const hoverX: CmsTouchpointClickProps = {
    ...context,
    placement_key: 'opend.home.hover-layer',
    page_name: 'home',
    area: 'cms_hover_layer',
    element: 'close',
  };
  // @ts-expect-error Close X is not a content button.
  const roleX: CmsTouchpointClickProps = { ...hoverX, button_role: 'primary' };
  // @ts-expect-error Hover secondary_close remains unsupported.
  const secondaryHover: CmsTouchpointClickProps = {
    ...hoverX,
    element: 'secondary_close',
  };
  expect([link, pricing, vela, hoverX, roleX, secondaryHover]).toHaveLength(6);
});
