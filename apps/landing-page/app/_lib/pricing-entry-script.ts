import { pricingAttributionSourceDetails, velaDateTimePattern } from './pricing-analytics-bridge';

/** Runs in the head, before anonymous pricing impressions (not after auth). */
export function pricingEntryScript(pageName: string): string {
  return `
    var entrySources = ${JSON.stringify([...pricingAttributionSourceDetails])};
    var entryDatePattern = new RegExp(${JSON.stringify(velaDateTimePattern.source)});
    var entryStorageKey = 'amr.openDesignAttribution.v1';
    var entryTabKey = 'od.pricingEntry.v1';
    var bounded = function (value) {
      return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
    };
    var validateEntry = function (value) {
      if (!value || value.sourceProduct !== 'open_design' || !bounded(value.entryId) || entrySources.indexOf(value.sourceDetail) < 0) return null;
      if (typeof value.entryOccurredAt !== 'string' || !entryDatePattern.test(value.entryOccurredAt)) return null;
      var age = Date.now() - Date.parse(value.entryOccurredAt || '');
      var ttl = value.campaignId ? 14 : 7;
      if (!Number.isFinite(age) || age < -300000 || age > ttl * 86400000) return null;
      return {
        sourceProduct: 'open_design', entryId: value.entryId, sourceDetail: value.sourceDetail,
        entryOccurredAt: value.entryOccurredAt,
        campaignId: bounded(value.campaignId) ? value.campaignId : undefined,
        conversionSource: entrySources.indexOf(value.conversionSource) >= 0 ? value.conversionSource : undefined,
        odDeviceId: bounded(value.odDeviceId) ? value.odDeviceId : undefined
      };
    };
    var readStoredEntry = function (kind, key) {
      try { return validateEntry(JSON.parse(window[kind].getItem(key) || 'null')); } catch (e) { return null; }
    };
    var persistEntry = function (value) {
      window.__odPricingBridgeAttribution = value;
      try { window.sessionStorage.setItem(entryTabKey, JSON.stringify(value)); } catch (e) {}
      try { window.localStorage.setItem(entryStorageKey, JSON.stringify(value)); } catch (e) {}
      return value;
    };
    var inbound = new URLSearchParams(window.location.search || '');
    var inboundEntry = validateEntry({
      sourceProduct: inbound.get('od_origin'), entryId: inbound.get('od_entry_id'),
      sourceDetail: inbound.get('od_entry_source'), entryOccurredAt: inbound.get('od_entry_at'),
      campaignId: inbound.get('od_campaign_id'), conversionSource: inbound.get('od_conversion_source'),
      odDeviceId: inbound.get('od_device_id')
    });
    var firstEntry = inboundEntry || readStoredEntry('sessionStorage', entryTabKey) || readStoredEntry('localStorage', entryStorageKey);
    var mintEntry = function (sourceDetail, campaignId, detached) {
      var random = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      var entry = { sourceProduct: 'open_design', entryId: 'od-entry-' + random,
        sourceDetail: sourceDetail, entryOccurredAt: new Date().toISOString(),
        campaignId: bounded(campaignId) ? campaignId : undefined };
      return detached ? entry : persistEntry(entry);
    };
    if (!firstEntry && ${JSON.stringify(pageName)} === 'pricing') {
      var source = 'landing_pricing_unattributed';
      try {
        var referrer = new URL(document.referrer);
        if (referrer.origin !== window.location.origin) source = 'landing_pricing_referral';
      } catch (e) {}
      firstEntry = mintEntry(source);
    }
    if (firstEntry) persistEntry(firstEntry);
    window.__odEntryProperties = function (entry) {
      entry = entry || window.__odPricingBridgeAttribution;
      return entry ? { entry_id: entry.entryId, source_product: entry.sourceProduct,
        source_detail: entry.sourceDetail, entry_occurred_at: entry.entryOccurredAt,
        campaign_id: entry.campaignId, conversion_source: entry.conversionSource,
        device_id: entry.odDeviceId } : {};
    };
    window.__odRecordCampaignEntry = function (sourceDetail, campaignId) {
      var entry = window.__odPricingBridgeAttribution || mintEntry(sourceDetail, campaignId);
      // campaign_id describes acquisition, not eligibility for the current offer.
      // Never overwrite the original campaign with the offer displayed at checkout.
      return Object.assign({}, window.__odEntryProperties(), { conversion_source: sourceDetail });
    };
    // A rendered link is not an observed first touch. Its detached tuple is
    // adopted by the destination (new tab) or on actual same-tab activation.
    window.__odPreparePricingEntry = function (sourceDetail, campaignId) {
      return Object.assign({}, window.__odEntryProperties(window.__odPricingBridgeAttribution || mintEntry(sourceDetail, campaignId, true)), { conversion_source: sourceDetail });
    };
    window.__odCommitPricingEntry = function (props) {
      if (!window.__odPricingBridgeAttribution) {
        var entry = validateEntry({ sourceProduct: props.source_product, entryId: props.entry_id,
          sourceDetail: props.source_detail, entryOccurredAt: props.entry_occurred_at,
          campaignId: props.campaign_id, conversionSource: props.conversion_source, odDeviceId: props.device_id });
        if (entry) persistEntry(entry);
      }
      return Object.assign({}, window.__odEntryProperties(), { conversion_source: props.conversion_source });
    };
    window.__odAttributedUrl = function (href, attribution) {
      try {
        var target = new URL(href, window.location.href);
        if (attribution) {
          var fields = { od_origin: 'source_product', od_entry_id: 'entry_id', od_entry_source: 'source_detail',
            od_entry_at: 'entry_occurred_at', od_conversion_source: 'conversion_source',
            od_campaign_id: 'campaign_id', od_device_id: 'device_id' };
          Object.keys(fields).forEach(function (key) {
            var value = attribution[fields[key]];
            if (value) target.searchParams.set(key, value); else target.searchParams.delete(key);
          });
        }
        return target.toString();
      } catch (e) { return href; }
    };
  `;
}
