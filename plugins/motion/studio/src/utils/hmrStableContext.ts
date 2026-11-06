/**
 * `createContext`, but stable across Vite HMR re-evaluations.
 *
 * A module-scope `createContext()` mints a NEW context object every time its
 * module is re-evaluated. HMR re-evaluates modules one at a time, so a context
 * module can be replaced while the components consuming it still hold the old
 * object — the provider then fills context A while the consumer reads context
 * B, gets `null`, and a `useX must be used within an XProvider` guard throws.
 *
 * The symptom is unmistakable and misleading: the React component stack shows
 * the consumer nested INSIDE the very provider it claims to be missing. It
 * crashed the studio on edits to files nowhere near the context — anything that
 * propagated an HMR boundary up to it was enough.
 *
 * Keying the context on `globalThis` by a stable name makes the second
 * evaluation reuse the first object, so old and new modules agree. Production
 * builds evaluate once, where this is an ordinary `createContext` with a map
 * lookup in front of it.
 */

import { createContext, type Context } from "react";

const REGISTRY = "__hfStudioContexts";

type Registry = Map<string, Context<unknown>>;

/** Default registered per name, so a genuine collision can be told from an HMR
 *  re-evaluation (which re-registers the same default). */
const seenNames = new Map<string, unknown>();

function registry(): Registry {
  const host = globalThis as unknown as Record<string, Registry | undefined>;
  const existing = host[REGISTRY];
  if (existing) return existing;
  const created: Registry = new Map();
  host[REGISTRY] = created;
  return created;
}

/**
 * `name` must be unique per context and stable across reloads — the module path
 * plus the export name is the convention here.
 */
export function createStableContext<T>(name: string, defaultValue: T): Context<T> {
  const store = registry();
  // A collision is silent and its symptom is remote: two modules asking for the
  // same name share ONE context, so one provider's value is read by the other's
  // consumers and the bug surfaces as a wrong value far from either file. The
  // convention is module path + export name; this makes breaking it loud.
  if (store.has(name) && seenNames.get(name) !== defaultValue) {
    // Not on the HMR path: a re-evaluated module hands back the SAME default it
    // registered, which is how a hot reload keeps its context alive.
    console.warn(
      `[hmrStableContext] "${name}" was registered twice with different defaults: ` +
        "two contexts are sharing one identity. Use module path + export name.",
    );
  }
  seenNames.set(name, defaultValue);
  const existing = store.get(name);
  if (existing) return existing as Context<T>;
  const created = createContext<T>(defaultValue);
  store.set(name, created as Context<unknown>);
  return created;
}
