import { useCallback, useMemo, useRef, type RefObject } from "react";

/** What a shadow reload gives as its cause when it ran out its wait budgets. */
export const READY_TIMEOUT_CAUSE = "it took too long to load";
export const SHADOW_RETRY_DELAY_MS = 2_000;

/** One more try for a reload that timed out, so an edit is not left unseen behind the old preview. A newer reload or
 * a composition switch in the meantime cancels it, and a retry that times out is not tried again. */
export function useShadowReloadRetry(
  generation: RefObject<number>,
  url: RefObject<string>,
  begin: RefObject<(url: string) => void>,
) {
  const retried = useRef(false);
  const retrying = useRef(false);
  const cancelRef = useRef(() => {});

  const retryWhenVisible = useCallback(
    (failedGen: number) => {
      const schedule = () => {
        const timer = setTimeout(() => {
          cancelRef.current = () => {};
          if (generation.current !== failedGen) return;
          const next = new URL(url.current, window.location.origin);
          next.searchParams.set("_t", String(Date.now()));
          retrying.current = true;
          begin.current(next.toString());
        }, SHADOW_RETRY_DELAY_MS);
        cancelRef.current = () => {
          clearTimeout(timer);
          cancelRef.current = () => {};
        };
      };
      if (document.visibilityState !== "hidden") return schedule();
      const onVisible = () => {
        if (document.visibilityState === "hidden") return;
        document.removeEventListener("visibilitychange", onVisible);
        schedule();
      };
      document.addEventListener("visibilitychange", onVisible);
      cancelRef.current = () => {
        document.removeEventListener("visibilitychange", onVisible);
        cancelRef.current = () => {};
      };
    },
    [generation, url, begin],
  );

  /** A reload failed with `cause` as generation `failedGen`: a timeout is retried once. */
  const afterFailure = useCallback(
    (cause: string, failedGen: number) => {
      if (cause !== READY_TIMEOUT_CAUSE || retried.current) return;
      retried.current = true;
      cancelRef.current();
      retryWhenVisible(failedGen);
    },
    [retryWhenVisible],
  );
  /** A reload starts: a request of its own gets its own retry; the retry itself does not. */
  const started = useCallback(() => {
    cancelRef.current();
    if (!retrying.current) retried.current = false;
    retrying.current = false;
  }, []);
  /** The pending retry, if any, is dropped. */
  const cancel = useCallback(() => cancelRef.current(), []);
  return useMemo(() => ({ afterFailure, started, cancel }), [afterFailure, started, cancel]);
}
