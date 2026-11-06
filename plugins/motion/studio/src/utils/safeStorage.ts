// Best-effort access to Web Storage. Reading the `localStorage` /
// `sessionStorage` globals can throw (SSR, storage disabled, sandboxed or
// partitioned browsing contexts), so callers get `null` instead of an
// exception — telemetry must never break Studio.

export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
