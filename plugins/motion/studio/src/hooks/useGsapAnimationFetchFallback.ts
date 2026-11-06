import { useCallback } from "react";
import type { GsapAnimation, ParsedGsap } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditing";
import { fetchParsedAnimations, getAnimationsForElement } from "./useGsapTweenCache";

// A hard fetch error (404/403/network/JSON failure → `fetchParsedAnimations`
// returns null) gets one short retry for a transient blip; beyond that the
// endpoint genuinely isn't serving this file, so fall through to "no animation".
const FETCH_ERROR_RETRIES = 1;
const FETCH_ERROR_DELAY_MS = 120;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Outcome of resolving an element's animations from a single parse result.
 * - `resolved`: a definitive answer. The endpoint parses the file on disk per request,
 *   so no match, or a file with no tweens at all, means the element has no animation.
 * - `fetch-error`: `fetchParsedAnimations` returned null (HTTP/network/JSON
 *   failure) — retry briefly.
 */
export type ElementAnimationsOutcome =
  | { kind: "resolved"; animations: GsapAnimation[] }
  | { kind: "fetch-error" };

export interface GsapAnimationFetchOptions {
  /** Refuse the edit when the parse endpoint is unavailable instead of treating it as no motion. */
  failOnFetchError?: boolean;
  /** Ignore an overlapping pre-write parse and read the source after a durable write. */
  fresh?: boolean;
}

export function gsapSourceFileForSelection(selection: DomEditSelection): string {
  return selection.sourceFile || "index.html";
}

/** Classify a parse result for one element: a hard fetch failure (`parsed === null`) or its animations. */
export function selectElementAnimationsOrRetry(
  parsed: Pick<ParsedGsap, "animations"> | null,
  target: { id: string | null; selector: string | null },
  element?: Element | null,
): ElementAnimationsOutcome {
  if (!parsed) return { kind: "fetch-error" };
  return {
    kind: "resolved",
    animations: getAnimationsForElement(parsed.animations, target, element),
  };
}

async function fetchElementAnimationsWithRetry(
  projectId: string,
  gsapSourceFile: string,
  target: { id: string | null; selector: string | null },
  element: Element,
  failOnFetchError: boolean,
  fresh: boolean,
): Promise<GsapAnimation[]> {
  for (let errorAttempts = 0; ; errorAttempts++) {
    const parsed = await fetchParsedAnimations(projectId, gsapSourceFile, { fresh });
    fresh = false;
    const outcome = selectElementAnimationsOrRetry(parsed, target, element);
    if (outcome.kind === "resolved") return outcome.animations;
    if (errorAttempts >= FETCH_ERROR_RETRIES) {
      if (failOnFetchError) throw new Error("GSAP animation ownership could not be verified");
      return [];
    }
    await delay(FETCH_ERROR_DELAY_MS);
  }
}

export function useGsapAnimationFetchFallback(projectId: string | null) {
  return useCallback(
    (selection: DomEditSelection, options?: GsapAnimationFetchOptions) =>
      async (): Promise<GsapAnimation[]> => {
        if (!projectId) return [];
        const target = { id: selection.id ?? null, selector: selection.selector ?? null };
        return fetchElementAnimationsWithRetry(
          projectId,
          gsapSourceFileForSelection(selection),
          target,
          selection.element,
          options?.failOnFetchError === true,
          options?.fresh === true,
        );
      },
    [projectId],
  );
}
