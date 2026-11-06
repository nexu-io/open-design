import { useRef } from "react";

type Handler = (...args: never[]) => unknown;
type Epoch = {
  scope: unknown;
  latest: object;
  wrappers: Map<string, Handler>;
  previous: object | null;
};

// The same object while its non-function fields are unchanged, and one identity per function field calling the
// latest one; a new `scope` (the project) starts new identities, and a wrapper kept from before calls its own scope's.
export function useStableHandlers<T extends object>(value: T, scope: unknown): T {
  const epoch = useRef<Epoch | null>(null);
  if (!epoch.current || !Object.is(epoch.current.scope, scope))
    epoch.current = { scope, latest: value, wrappers: new Map(), previous: null };
  const current = epoch.current;
  current.latest = value;

  const next: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field !== "function") {
      next[key] = field;
      continue;
    }
    let wrapper = current.wrappers.get(key);
    if (!wrapper) {
      wrapper = (...args: never[]) =>
        (current.latest as Record<string, (...a: never[]) => unknown>)[key]!(...args);
      current.wrappers.set(key, wrapper);
    }
    next[key] = wrapper;
  }
  const prev = current.previous as Record<string, unknown> | null;
  const keys = Object.keys(next);
  if (
    prev &&
    keys.length === Object.keys(prev).length &&
    keys.every((k) => k in prev && prev[k] === next[k])
  )
    return prev as T;
  current.previous = next;
  return next as T;
}
