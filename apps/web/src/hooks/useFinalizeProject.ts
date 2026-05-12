// Wraps POST /api/projects/:id/finalize/anthropic for the Finalize
// design package button (#451). The daemon route runs synchronously for
// 60–120 s, so the hook owns:
//   - request lifecycle (idle / pending / success / error)
//   - cancellation via AbortController (best-effort — daemon's
//     synthesis call may already be in flight when abort fires)
//   - daemon error envelope mapping per #832's contract: when the
//     response is non-OK, body.error.{code,message,details} is the
//     authoritative payload. The mapping table below produces the
//     user-facing toast string for each `code`. `details`, when present,
//     is rendered as a secondary toast line so the upstream Anthropic
//     reason (e.g. account usage cap) is visible to the user instead of
//     just the daemon's category label (#450 verification commitment).

import { useCallback, useRef, useState } from 'react';
import type {
  ApiErrorCode,
  FinalizeAnthropicRequest,
  FinalizeAnthropicResponse,
} from '@open-design/contracts';

// 130 000 ms = daemon timeout (120 s) + 10 s buffer so the daemon's
// own retry/timeout layer always wins under normal failure modes.
const FETCH_TIMEOUT_MS = 130_000;

export type FinalizeStatus = 'idle' | 'pending' | 'success' | 'error';

export interface FinalizeError {
  code: ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT';
  message: string;
  details: string | null;
}

export interface FinalizeProjectState {
  status: FinalizeStatus;
  error: FinalizeError | null;
  result: FinalizeAnthropicResponse | null;
  trigger: (req: FinalizeAnthropicRequest) => Promise<FinalizeAnthropicResponse | null>;
  cancel: () => void;
}

interface DaemonErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export function useFinalizeProject(projectId: string): FinalizeProjectState {
  const [status, setStatus] = useState<FinalizeStatus>('idle');
  const [error, setError] = useState<FinalizeError | null>(null);
  const [result, setResult] = useState<FinalizeAnthropicResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks whether the in-flight controller's abort came from the
  // 130 s timeout (true) or the user clicking Cancel (false). The
  // catch block reads this to surface a TIMEOUT error instead of a
  // silent idle reset, so users learn the daemon may still be running.
  const timedOutRef = useRef(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const trigger = useCallback(
    async (req: FinalizeAnthropicRequest): Promise<FinalizeAnthropicResponse | null> => {
      // Cancel any in-flight call before starting a new one so a
      // double-clicked button doesn't pile up two daemon requests.
      abortRef.current?.abort();
      timedOutRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => {
        timedOutRef.current = true;
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      setStatus('pending');
      setError(null);
      setResult(null);

      // Every state-write site below first checks `isCurrent()` so a
      // superseded trigger cannot leak its outcome into a replacement
      // trigger's lifecycle. Without these guards, a quick double-click
      // would let the first request's late AbortError catch run
      // setStatus('idle') while the second request is still pending,
      // clearing the spinner and re-enabling the buttons mid-flight.
      const isCurrent = () => abortRef.current === controller;

      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/finalize/anthropic`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
            signal: controller.signal,
          },
        );

        if (!resp.ok) {
          const envelope = (await resp.json().catch(() => ({}))) as DaemonErrorEnvelope;
          if (!isCurrent()) return null;
          const code = envelope.error?.code ?? 'INTERNAL_ERROR';
          const detailsRaw = envelope.error?.details;
          const details = typeof detailsRaw === 'string' ? detailsRaw : null;
          const finalizeError: FinalizeError = {
            code: code as FinalizeError['code'],
            message: messageForCode(code as ApiErrorCode),
            details,
          };
          setError(finalizeError);
          setStatus('error');
          return null;
        }

        const body = (await resp.json()) as FinalizeAnthropicResponse;
        if (!isCurrent()) return null;
        setResult(body);
        setStatus('success');
        return body;
      } catch (err) {
        if (!isCurrent()) return null;
        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        if (aborted) {
          if (timedOutRef.current) {
            // Timeout abort — surface as an error so users see the
            // failure signal. The daemon may still be running its
            // synthesis, so the message names that explicitly.
            const finalizeError: FinalizeError = {
              code: 'TIMEOUT',
              message: messageForCode('TIMEOUT'),
              details: null,
            };
            setError(finalizeError);
            setStatus('error');
            return null;
          }
          // User-initiated cancel — clean reset, not an error surface.
          setError(null);
          setStatus('idle');
          return null;
        }
        const finalizeError: FinalizeError = {
          code: 'NETWORK_ERROR',
          message: messageForCode('NETWORK_ERROR'),
          details: err instanceof Error ? err.message : String(err),
        };
        setError(finalizeError);
        setStatus('error');
        return null;
      } finally {
        clearTimeout(timeoutId);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [projectId],
  );

  return { status, error, result, trigger, cancel };
}

// User-facing toast strings for each daemon error code. The unknown /
// network branch covers transport errors and codes the daemon adds in
// future without crashing the UI.
export function messageForCode(code: ApiErrorCode | 'NETWORK_ERROR' | string): string {
  switch (code) {
    case 'BAD_REQUEST':
      return 'Bad request — check the API key and model.';
    case 'UNAUTHORIZED':
      return 'API key was rejected. Check it in Settings.';
    case 'FORBIDDEN':
      return 'Access denied by the upstream API.';
    case 'RATE_LIMITED':
      return 'Anthropic rate-limited the request. Try again in a minute.';
    case 'UPSTREAM_UNAVAILABLE':
      return 'The Anthropic API is unavailable right now.';
    case 'CONFLICT':
      return 'Another finalize is in progress for this project.';
    case 'PROJECT_NOT_FOUND':
      return 'Project not found.';
    case 'INTERNAL_ERROR':
      return 'Something went wrong while finalizing. Check the daemon logs.';
    case 'TIMEOUT':
      return 'Finalize timed out after 130 s. The daemon may still be running.';
    case 'NETWORK_ERROR':
    default:
      return "Couldn't reach the daemon. Make sure it's running.";
  }
}
