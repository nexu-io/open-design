// Paid image-generation POSTs are deliberately retried on a narrow response
// allowlist only. A fetch rejection is ambiguous (the provider may already
// have accepted and billed the request), so this helper reports it and lets it
// fail without issuing a second POST.
export type ImageGenerationRetryReason = 'rate_limit_429' | 'service_unavailable_503';

export type ImageGenerationRequestSummary = {
  attemptCount: number;
  retryCount: number;
  initialResponseStatus?: number;
  responseStatus?: number;
  retryReason?: ImageGenerationRetryReason;
  retryAfterMs?: number;
  retryDelayMs?: number;
  retryFinalResult: 'not_attempted' | 'success' | 'failed' | 'skipped_retry_after_budget';
};

type RetryDependencies = {
  now?: () => number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

const DEFAULT_RETRY_DELAY_MS = 1_000;
const RETRY_JITTER_MS = 250;
const MAX_RETRY_DELAY_MS = 60_000;

export async function fetchImageGenerationWithResponseRetry(
  issueRequest: () => Promise<Response>,
  onSettled?: (summary: ImageGenerationRequestSummary) => void,
  dependencies: RetryDependencies = {},
): Promise<Response> {
  const summary: ImageGenerationRequestSummary = {
    attemptCount: 0,
    retryCount: 0,
    retryFinalResult: 'not_attempted',
  };
  const settle = () => {
    try {
      onSettled?.({ ...summary });
    } catch {
      // Observability must never change whether a paid provider request succeeds.
    }
  };

  try {
    summary.attemptCount = 1;
    const initialResponse = await issueRequest();
    summary.initialResponseStatus = initialResponse.status;
    summary.responseStatus = initialResponse.status;

    const retryReason = retryReasonForStatus(initialResponse.status);
    if (!retryReason) {
      settle();
      return initialResponse;
    }

    summary.retryReason = retryReason;
    const retryAfterMs = parseRetryAfterMs(
      initialResponse.headers.get('retry-after'),
      dependencies.now?.() ?? Date.now(),
    );
    if (retryAfterMs !== undefined) {
      summary.retryAfterMs = retryAfterMs;
    }
    if (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_DELAY_MS) {
      summary.retryFinalResult = 'skipped_retry_after_budget';
      settle();
      return initialResponse;
    }

    const random = clampRandom(dependencies.random?.() ?? Math.random());
    const retryDelayMs = retryAfterMs
      ?? DEFAULT_RETRY_DELAY_MS + Math.floor(random * RETRY_JITTER_MS);
    summary.retryCount = 1;
    summary.retryDelayMs = retryDelayMs;
    summary.retryFinalResult = 'failed';

    try {
      await initialResponse.body?.cancel();
    } catch {
      // Best effort: discard the first response before reissuing the POST.
    }
    if (retryDelayMs > 0) {
      await (dependencies.sleep ?? sleep)(retryDelayMs);
    }

    delete summary.responseStatus;
    summary.attemptCount = 2;
    const retryResponse = await issueRequest();
    summary.responseStatus = retryResponse.status;
    summary.retryFinalResult = retryResponse.ok ? 'success' : 'failed';
    settle();
    return retryResponse;
  } catch (error) {
    settle();
    throw error;
  }
}

function retryReasonForStatus(status: number): ImageGenerationRetryReason | undefined {
  if (status === 429) return 'rate_limit_429';
  if (status === 503) return 'service_unavailable_503';
  return undefined;
}

function parseRetryAfterMs(value: string | null, nowMs: number): number | undefined {
  const retryAfter = value?.trim();
  if (!retryAfter) return undefined;

  if (/^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1_000
      ? seconds * 1_000
      : Number.MAX_SAFE_INTEGER;
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(retryAfter)) {
    return undefined;
  }

  const dateMs = Date.parse(retryAfter);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - nowMs);
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 0.9999999999999999);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
