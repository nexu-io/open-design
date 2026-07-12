// Browser-side bridge for a boolean "seen this session" flag persisted in
// `sessionStorage`. Lives in providers/ because it touches `window`/
// `sessionStorage`; slice hooks reach it through an injected port so they
// stay DOM-free and unit-testable. Both operations swallow storage-denied
// contexts (private browsing, disabled storage) the same way the pre-
// extraction module-level helpers did: a read failure reads as "not seen",
// and a write failure is a silent no-op (the caller's in-memory dedupe ref
// still prevents a repeat within the same session).
export function hasFlagSeen(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markFlagSeen(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Ignore storage-denied contexts; the in-memory state still prevents loops.
  }
}
