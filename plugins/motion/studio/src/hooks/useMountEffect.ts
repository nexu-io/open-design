import { useEffect } from "react";

/**
 * Run an effect exactly once on mount (and optional cleanup on unmount).
 * This is the ONLY sanctioned way to call useEffect in this codebase.
 *
 * If you need to react to prop/state changes, use one of:
 * - Derived state (compute inline, no hook needed)
 * - Event handlers (onClick, onChange, etc.)
 * - `key` prop to force remount
 * - Data-fetching library (useQuery, useSWR)
 *
 * @see https://react.dev/learn/you-might-not-need-an-effect
 */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
