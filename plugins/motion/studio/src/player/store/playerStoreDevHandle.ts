/**
 * A console handle on the live store, dev builds only.
 *
 * Split out of `playerStore.ts` to keep it under the studio's 600-line cap. The
 * dev check is its own function because `import.meta.env` is absent under
 * Turbopack and other non-Vite bundlers, where reading it throws.
 */

function isDevBuild(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

/** Expose `store` as `window.__playerStore` for dumping live Studio state
 *  during bug-bash reproduction. No-op outside a dev build or a browser. */
export function attachPlayerStoreDevHandle(store: unknown): void {
  if (!isDevBuild() || typeof window === "undefined") return;
  (window as unknown as { __playerStore?: unknown }).__playerStore = store;
}
