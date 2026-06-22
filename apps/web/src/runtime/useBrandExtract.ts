// `useBrandExtract` — kick off an agent-driven brand extraction.
//
// Extraction is no longer an in-place SSE pipeline. `POST /api/brands { url }`
// reserves a brand record and stands up a backing `brand` project with the
// target site open in an in-app browser tab plus a seeded prompt. The caller
// navigates into that project and auto-sends the first prompt, so the agent
// runs the extraction live — measuring the page, synthesizing the kit, and
// registering the design system, pausing for the user when an anti-bot wall
// needs a human. This hook just drives the kickoff request and exposes a
// coarse status the New Brand modal / onboarding step render.

import { useCallback, useRef, useState } from 'react';
import type { BrandExtractStartResponse } from '@open-design/contracts';

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
  /** Human-readable failure reason when `phase === 'error'`. */
  error: string | null;
}

const INITIAL_STATE: BrandExtractState = {
  phase: 'idle',
  brandId: null,
  projectId: null,
  conversationId: null,
  error: null,
};

export interface UseBrandExtract {
  state: BrandExtractState;
  /** Start an extraction. Resolves to the kickoff result, or null on failure
   *  (in which case `state.error` is set). */
  run: (url: string) => Promise<BrandExtractStartResponse | null>;
  reset: () => void;
}

export function useBrandExtract(): UseBrandExtract {
  const [state, setState] = useState<BrandExtractState>(INITIAL_STATE);
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(async (url: string): Promise<BrandExtractStartResponse | null> => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setState({ ...INITIAL_STATE, phase: 'starting' });

    let resp: Response;
    try {
      resp = await fetch('/api/brands', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ url }),
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
      error: null,
    });
    return result;
  }, []);

  return { state, run, reset };
}
