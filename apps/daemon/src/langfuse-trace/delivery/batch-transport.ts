/** @module langfuse-trace/delivery/batch-transport
 * Network transport layer for Langfuse telemetry: posts batches directly to the Langfuse
 * ingest endpoint or via the Open Design hosted relay, retrying on 429/5xx and inspecting
 * HTTP 207 Multi-Status bodies for per-event validation errors.
 * Imports from core/ only; has no knowledge of payload construction or consent gating.
 */
import type {
  LangfuseConfig,
  LangfuseDeliveryState,
  LangfuseDropReason,
  TelemetrySinkConfig,
} from '../core/index.js';

/**
 * Posts a batch of Langfuse ingestion events directly to the Langfuse `/api/public/ingestion`
 * endpoint. Retries on 429 and 5xx up to `config.retries` times, then inspects per-event
 * errors from the 207 Multi-Status response body before declaring success.
 * @param config - Direct Langfuse credentials and transport settings.
 * @param batch - Array of Langfuse ingestion event objects.
 * @param fetchImpl - Fetch implementation; injected for testability.
 * @returns The final delivery state after all retry attempts are exhausted.
 */
export async function postLangfuseBatch(
  config: LangfuseConfig,
  batch: unknown[],
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${config.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          Authorization: config.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({ batch }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Ingestion failed ${response.status}: ${body.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'langfuse',
          ),
        };
      }
      // Langfuse legacy ingestion responds with HTTP 207 Multi-Status whose
      // body shape is `{ successes: [...], errors: [...] }`. `response.ok`
      // is true for 207, so per-event validation errors slip through unless
      // we look at the body. Surface them so a malformed payload doesn't
      // silently disappear server-side.
      const body = await response.text().catch(() => '');
      if (body && warnPerEventErrors(body, 'Per-event errors')) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(body, 'langfuse'),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

/**
 * Posts a pre-serialized Langfuse batch to the Open Design telemetry relay endpoint.
 * The relay is the preferred delivery path in production; it proxies the serialized JSON
 * body to Langfuse server-side, preventing daemon processes from needing Langfuse keys.
 * Retries on 429/5xx and inspects relay responses for forwarded per-event errors.
 * @param config - Relay URL and transport settings.
 * @param body - Serialized `{ batch: [...] }` JSON string.
 * @param fetchImpl - Fetch implementation; injected for testability.
 * @returns The final delivery state after all retry attempts are exhausted.
 */
export async function postRelayBatch(
  config: Extract<TelemetrySinkConfig, { kind: 'relay' }>,
  body: string,
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(config.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Design-Telemetry': 'langfuse-ingestion-v1',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body,
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Relay failed ${response.status}: ${responseBody.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'relay',
          ),
        };
      }

      const responseBody = await response.text().catch(() => '');
      if (
        responseBody &&
        warnPerEventErrors(responseBody, 'Relay per-event errors')
      ) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(
            responseBody,
            'relay',
          ),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Relay fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

/**
 * @internal
 * Exponential back-off delay between retry attempts, capped at 1 second.
 * Shared by both {@link postLangfuseBatch} and {@link postRelayBatch} so
 * retry timing stays consistent across both transport paths.
 * @param attempt - 1-based attempt number; determines delay magnitude.
 */
export function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.min(250 * attempt, 1000)),
  );
}

/**
 * @internal
 * Converts an HTTP status code plus sink kind to the canonical {@link LangfuseDropReason}
 * stored on the run record. Relay and direct Langfuse paths share status semantics but
 * use distinct drop-reason prefixes so the telemetry schema can distinguish them.
 * @param status - HTTP response status code from the ingestion or relay endpoint.
 * @param sinkKind - The active sink type, which selects the drop-reason prefix.
 * @returns A typed drop reason string.
 */
export function ingestionDropReasonFromStatus(
  status: number,
  sinkKind: TelemetrySinkConfig['kind'],
): LangfuseDropReason {
  if (sinkKind === 'relay') {
    if (status === 429) return 'relay_429';
    if (status === 413) return 'relay_413';
    if (status >= 500) return 'relay_5xx';
    return 'langfuse_4xx';
  }
  if (status >= 500) return 'langfuse_5xx';
  return 'langfuse_4xx';
}

/**
 * @internal
 * Parses a 207 Multi-Status response body and derives the drop reason from the first
 * error entry that carries a numeric `status` field. Falls back to a generic 5xx reason
 * when the body is unparseable or lacks a recognizable error status.
 * @param responseBody - Raw response body text from the ingestion or relay endpoint.
 * @param sinkKind - Determines which drop-reason prefix to apply.
 * @returns A typed drop reason derived from the per-event error payload.
 */
export function dropReasonFromPerEventErrors(
  responseBody: string,
  sinkKind: TelemetrySinkConfig['kind'],
): LangfuseDropReason {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (!Array.isArray(errors)) {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  for (const error of errors) {
    if (!error || typeof error !== 'object' || Array.isArray(error)) continue;
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return ingestionDropReasonFromStatus(status, sinkKind);
    }
  }
  return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_4xx';
}

/**
 * @internal
 * Parses a response body for a non-empty Langfuse `errors` array and emits a console
 * warning when any are found. Used as a guard before treating an HTTP 2xx as success,
 * since Langfuse uses 207 Multi-Status to surface per-event validation failures.
 * @param responseBody - Raw response body text to inspect.
 * @param label - Log prefix for the warning message.
 * @returns True when errors were found and logged, false otherwise.
 */
export function warnPerEventErrors(responseBody: string, label: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return false;
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    console.warn(
      `[langfuse-trace] ${label} (${errors.length}): ${JSON.stringify(errors).slice(0, 500)}`,
    );
    return true;
  }
  return false;
}
