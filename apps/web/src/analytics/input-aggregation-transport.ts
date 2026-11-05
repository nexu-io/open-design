import { isInputAggregationDestination } from '@open-design/contracts/analytics';
import type { InputTelemetryEvent } from './input-aggregation';

/** Receipt acceptance is distinct from the later PostHog indexing reconciliation. */
export function inputAggregationSender(host: string, key: string, local = false) {
  let retryAt = 0;
  return async (events: InputTelemetryEvent[]): Promise<boolean> => {
    if (Date.now() < retryAt || !events.length) return false;
    if (!isInputAggregationDestination(host, key)
      && !(local && /^http:\/\/127\.0\.0\.1(?::[0-9]+)?\/?$/.test(host))) return false;
    if (!local && events.some(({ properties }) => !properties.device_id
      || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(properties.event_id))) return false;
    try {
      const body = JSON.stringify({ api_key: key, batch: events.map(({ event, properties }) => ({
        event, uuid: properties.event_id, distinct_id: properties.device_id, timestamp: properties.occurred_at,
        properties: { ...properties, distinct_id: properties.device_id, $insert_id: properties.event_id },
      })) });
      if (new TextEncoder().encode(body).length > 48 * 1024) return false;
      const response = await fetch(`${host.replace(/\/+$/, '')}/batch/`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
        redirect: 'error', keepalive: true, signal: AbortSignal.timeout(5000), body,
      });
      const retry = response.headers.get('retry-after');
      if (retry) {
        const seconds = Number(retry);
        const at = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(retry);
        if (Number.isFinite(at)) retryAt = Math.max(retryAt, at);
      }
      if (!response.ok) return false;
      // The old local receiver returns an empty 200. Real ingestion must acknowledge its JSON contract.
      const text = await response.text();
      if (local && text === '') return true;
      const receipt: unknown = JSON.parse(text);
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
      const result = receipt as Record<string, unknown>;
      const limited = result.quota_limited;
      if (limited && (Array.isArray(limited) ? limited.length > 0 : typeof limited !== 'object' || Object.keys(limited).length > 0)) return false;
      return (result.status === 1 || result.status === 'Ok') && !result.error && !result.errors;
    } catch { return false; }
  };
}
