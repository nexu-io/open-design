// `useBrandExtract` — kick off a programmatic-first brand extraction.
//
// Extraction is no longer an in-place SSE pipeline. `POST /api/brands { url }`
// reserves a brand record, stands up a backing `brand` project with the target
// site open in an in-app browser tab, and persists a real programmatic
// transcript before returning. The deterministic pass then registers the design
// system in the background, pausing for the user/agent fallback when an anti-bot
// wall needs a human. This hook just drives the kickoff request and exposes a
// coarse status the New Brand modal / onboarding step render.

import { useCallback, useRef, useState } from 'react';
import type { BrandExtractStartResponse, BrandStatus } from '@open-design/contracts';
import { useI18n } from '../i18n';

/** Coarse kickoff phase. */
export type BrandExtractPhase = 'idle' | 'starting' | 'done' | 'error';

export interface BrandExtractState {
  phase: BrandExtractPhase;
  /** Reserved brand id, available once the kickoff succeeds. */
  brandId: string | null;
  /** Backing brand-extraction project id. */
  projectId: string | null;
  /** Seeded conversation the first prompt auto-sends into. */
  conversationId: string | null;
  /** Outcome of the synchronous programmatic-first pass: `ready` means a usable
   *  design system was finalized before the response returned; `extracting`
   *  means it was skipped / blocked and still needs the agent. Null until done. */
  extractStatus: BrandStatus | null;
  /** The `user:<id>` design system registered by phase 1, present when ready. */
  designSystemId: string | null;
  /** Display name of the extracted brand (falls back to the source hostname). */
  brandName: string | null;
  /** Human-readable failure reason when `phase === 'error'`. */
  error: string | null;
}

const INITIAL_STATE: BrandExtractState = {
  phase: 'idle',
  brandId: null,
  projectId: null,
  conversationId: null,
  extractStatus: null,
  designSystemId: null,
  brandName: null,
  error: null,
};

export interface UseBrandExtract {
  state: BrandExtractState;
  /** Start an extraction. Resolves to the kickoff result, or null on failure
   *  (in which case `state.error` is set). */
  run: (
    url: string,
    options?: { description?: string; designMd?: string },
  ) => Promise<BrandExtractStartResponse | null>;
  reset: () => void;
}

export function useBrandExtract(): UseBrandExtract {
  const { locale } = useI18n();
  const [state, setState] = useState<BrandExtractState>(INITIAL_STATE);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(async (
    url: string,
    options: { description?: string; designMd?: string } = {},
  ): Promise<BrandExtractStartResponse | null> => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setState({ ...INITIAL_STATE, phase: 'starting' });

    let resp: Response;
    try {
      resp = await fetch('/api/brands', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...(url.trim() ? { url } : {}),
          ...(options.description?.trim() ? { description: options.description.trim() } : {}),
          ...(options.designMd?.trim() ? { designMd: options.designMd.trim() } : {}),
          locale,
        }),
      });
    } catch (err) {
      inFlightRef.current = false;
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Could not reach the daemon',
      });
      return null;
    }

    if (!resp.ok) {
      let message = `Extraction request failed (${resp.status})`;
      try {
        const body = (await resp.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // Non-JSON error body; keep the status-based message.
      }
      inFlightRef.current = false;
      setState({ ...INITIAL_STATE, phase: 'error', error: message });
      return null;
    }

    let result: BrandExtractStartResponse;
    try {
      result = (await resp.json()) as BrandExtractStartResponse;
    } catch (err) {
      inFlightRef.current = false;
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Malformed extraction response',
      });
      return null;
    }

    inFlightRef.current = false;
    setState({
      phase: 'done',
      brandId: result.id,
      projectId: result.projectId,
      conversationId: result.conversationId,
      extractStatus: result.status,
      designSystemId: result.designSystemId ?? null,
      brandName: result.brandName ?? null,
      error: null,
    });
    return result;
  }, [locale]);

  return { state, run, reset };
}
