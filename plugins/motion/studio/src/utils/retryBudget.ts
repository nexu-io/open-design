import type { MutableRefObject } from "react";

export interface RetryBudgetState<K> {
  id: K;
  count: number;
}

// A target still resolving (a just-dropped/pasted/duplicated element, or a
// preview still reloading) heals within a few retries; one that never will
// would otherwise retry forever. A new id resets the count.
export function recordRetryAttempt<K>(
  ref: MutableRefObject<RetryBudgetState<K>>,
  id: K,
  maxRetries: number,
): boolean {
  const previous = ref.current;
  const count = previous.id === id ? previous.count + 1 : 1;
  ref.current = { id, count };
  return count <= maxRetries;
}
