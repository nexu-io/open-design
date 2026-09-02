import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { posthogHeadHtml } from '../app/_lib/posthog-analytics';

function tracker(input: { search?: string; stored?: object; referrer?: string; pageName?: string } = {}) {
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  const values = new Map<string, string>();
  if (input.stored) values.set('amr.openDesignAttribution.v1', JSON.stringify(input.stored));
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const listeners: Record<string, (event: unknown) => void> = {};
  const links: any[] = [];
  const document = {
    referrer: input.referrer ?? '',
    documentElement: { getAttribute: () => 'en' },
    querySelectorAll: () => links,
    addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; },
  };
  const posthog = { __SV: 1, init() {}, capture: (name: string, props: Record<string, unknown>) => events.push({ name, props }) };
  const window: Record<string, any> = {
    location: { href: 'https://open-design.ai/pricing/' + (input.search ?? ''), search: input.search ?? '', origin: 'https://open-design.ai' },
    posthog, localStorage: storage, sessionStorage: storage,
  };
  const html = posthogHeadHtml('test', undefined, input.pageName ?? 'pricing');
  runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)![1], { window, document, posthog, URL, URLSearchParams, Date, Math, navigator: {} });
  return { window, events, values, listeners, links };
}

test('anonymous pricing exposure and personal/team checkout share the same entry', () => {
  const { window, events } = tracker();
  const page = events.find((event) => event.name === 'page_view')!.props;
  assert.ok(page.entry_id);
  assert.equal(page.source_detail, 'landing_pricing_unattributed');
  for (const source of ['landing_pricing_personal_plan', 'landing_pricing_team_plan']) {
    const click = window.__odRecordCampaignEntry(source);
    assert.equal(click.entry_id, page.entry_id);
    assert.equal(click.source_detail, page.source_detail);
    assert.equal(click.conversion_source, source);
    const target = new URL(window.__odAttributedUrl('https://open-design.ai/cloud/dashboard', click));
    assert.equal(target.searchParams.get('od_entry_id'), page.entry_id);
  }
});

test('all valid stored first touches retain campaign and consented device through exposure and checkout', () => {
  for (const sourceDetail of ['settings_amr_upgrade', 'deepseek_workbench_badge', 'go_plan_sunset_modal']) {
    const stored = { sourceProduct: 'open_design', entryId: 'entry-1', sourceDetail, entryOccurredAt: new Date().toISOString(), campaignId: 'original-campaign', odDeviceId: 'consented-device' };
    const { window, events } = tracker({ stored });
    const page = events.find((event) => event.name === 'page_view')!.props;
    const click = window.__odRecordCampaignEntry('landing_pricing_team_plan', 'new-offer');
    assert.equal(page.entry_id, 'entry-1');
    assert.equal(click.entry_id, 'entry-1');
    assert.equal(click.campaign_id, 'original-campaign');
    assert.equal(click.device_id, 'consented-device');
    assert.equal(click.conversion_source, 'landing_pricing_team_plan');
  }
});

test('malformed and expired inbound entries cannot fabricate an origin or revive a campaign', () => {
  for (const date of ['bad-date', '2020-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z', new Date().toISOString().replace('Z', '+00:00')]) {
    const { window } = tracker({ search: '?od_origin=open_design&od_entry_id=stale&od_entry_source=landing_home_banner&od_entry_at=' + encodeURIComponent(date) + '&od_campaign_id=expired' });
    const click = window.__odRecordCampaignEntry('landing_pricing_personal_plan');
    assert.notEqual(click.entry_id, 'stale');
    assert.equal(click.campaign_id, undefined);
  }
});

test('external referrer is distinguished from unattributed without collecting its query', () => {
  const { events } = tracker({ referrer: 'https://example.com/article?secret=private' });
  const page = events.find((event) => event.name === 'page_view')!.props;
  assert.equal(page.source_detail, 'landing_pricing_referral');
  assert.ok(!JSON.stringify(page).includes('secret'));
});

test('campaign banner native href retains the specific campaign without recording an unclicked visit', () => {
  const { window } = tracker({ pageName: 'landing_home' });
  const prepared = window.__odPreparePricingEntry('landing_home_banner', 'deepseek_v4_pro');
  assert.equal(window.__odPricingBridgeAttribution, undefined);
  const href = new URL(window.__odAttributedUrl('https://open-design.ai/pricing/', prepared));
  assert.equal(href.searchParams.get('od_entry_source'), 'landing_home_banner');
  assert.equal(href.searchParams.get('od_campaign_id'), 'deepseek_v4_pro');
  const committed = window.__odCommitPricingEntry(prepared);
  assert.equal(committed.entry_id, prepared.entry_id);
  assert.equal(window.__odRecordCampaignEntry('landing_pricing_team_plan').campaign_id, 'deepseek_v4_pro');
});

test('header, footer and content pricing links carry their own entry into a new tab', () => {
  for (const area of ['header', 'footer', 'content']) {
    const { window, listeners, links } = tracker({ pageName: 'landing_home' });
    const link: Record<string, any> = {
      href: 'https://open-design.ai/pricing/', pathname: '/pricing/', textContent: 'Pricing',
      getAttribute: () => null,
      closest: (selector: string) => selector === 'a[href]' ? link : selector === 'header.nav, [data-chrome-headroom]' && area === 'header' ? {} : null,
      setAttribute: (name: string, value: string) => { link[name] = value; },
    };
    if (area === 'footer') link.closest = (selector: string) => selector === 'a[href]' ? link : selector === '[data-od-id]' ? { getAttribute: () => 'footer' } : null;
    links.push(link);
    listeners.DOMContentLoaded({});
    const destination = new URL(link.href);
    assert.equal(destination.searchParams.get('od_entry_source'), 'landing_pricing_' + area);
    assert.ok(destination.searchParams.get('od_entry_id'));
    assert.equal(window.__odPricingBridgeAttribution, undefined, 'rendering navigation must not record an unclicked first touch');
    listeners.click({ target: link });
    assert.equal(window.__odRecordCampaignEntry('landing_pricing_personal_plan').entry_id, destination.searchParams.get('od_entry_id'));
  }
});
