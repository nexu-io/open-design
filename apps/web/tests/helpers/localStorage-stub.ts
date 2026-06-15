/**
 * Installs a working Map-backed `window.localStorage` stub.
 *
 * vitest 4.1.6's `@vitest-environment jsdom` ships `window.localStorage`
 * as an empty `{}` with a null prototype and no methods. That means any
 * test that calls `localStorage.getItem` / `setItem` / `removeItem` /
 * `clear` directly (either in production code paths that forget a
 * try/catch, or in test `afterEach` cleanup) throws `TypeError: ...
 * is not a function`.
 *
 * This helper creates the same Map-backed stub used in several test
 * files that already work around the jsdom regression. Call it in
 * `beforeAll` and the stub lives for the lifetime of the test file.
 */
export function installLocalStorageStub(): void {
  const store = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
}
