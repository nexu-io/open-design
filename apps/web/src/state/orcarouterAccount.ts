// Whether the daemon holds a usable OrcaRouter credential.
//
// A PKCE account never places its key in the browser, so `config.apiKey` stays
// empty for that user and every client-side precondition that reads the key
// would block a send the daemon could actually serve. The daemon owns the
// answer; this module carries only the derived yes/no, never a secret.
//
// Mirrors `stagedAttachments`: a small subscribable store shared between the
// surfaces that know the answer (the Settings connect control, which polls
// status) and the surfaces that need it (the run preflight, the model picker).

import { useSyncExternalStore } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` = not yet known; a run preflight must not treat unknown as "absent". */
let connected: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): boolean | null {
  return connected;
}

/** Record what a status read or the connect control established. */
export function setOrcaRouterAccountConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  emit();
}

export function orcaRouterAccountConnected(): boolean | null {
  return connected;
}

/** Test seam. */
export function resetOrcaRouterAccount(): void {
  connected = null;
  inFlight = null;
  emit();
}

interface StatusPayload {
  connected?: boolean;
}

/**
 * Read the daemon's account status once and publish it.
 *
 * Concurrent callers share one request. A failure leaves the last known value
 * alone rather than flipping to false: a transient daemon restart must not
 * turn a connected account into a blocked send.
 */
export function refreshOrcaRouterAccountStatus(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch('/api/orcarouter/auth/status', {
        credentials: 'same-origin',
      });
      if (!response.ok) return connected ?? false;
      const payload = (await response.json()) as StatusPayload;
      const next = payload?.connected === true;
      setOrcaRouterAccountConnected(next);
      return next;
    } catch {
      return connected ?? false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Reactive form, for components that gate on it. */
export function useOrcaRouterAccountConnected(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
