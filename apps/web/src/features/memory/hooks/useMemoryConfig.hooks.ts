// Feature-local hook for the memory config cluster: the master memory switch
// plus the four per-hook flags (chat extraction, profile, rewrite, verify).
//
// This is the slice's hook-wiring paradigm, made concrete:
//   - `useMemoryConfig(port)` is the real hook. Its transport dependency is
//     INJECTED as the slice port, so it holds no import to a provider and
//     unit-tests against a hand-written fake `MemoryConfigPort` — no module
//     mocks, no global `fetch` stub.
//   - business logic (the pure `rules`) is imported directly; only the
//     side-effecting transport is injected.
//   - `useWiredMemoryConfig()` (the wirer, bottom of file) binds the real
//     provider port and is the default the orchestrator injects as a prop, so
//     production callers pass nothing while tests swap the whole hook.
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  MemoryListResponse,
} from '@open-design/contracts';
import type { MemoryConfigPort } from '../ports';
import { createAsyncCommitGuard } from '../async-commit-guard';
import { memoryConfigPort } from '../dependencies';
import {
  enabledPatch,
  singleFlagPatch,
  type MemoryConfigFlagKey,
} from '../rules';

/** One coalesced write intent: the latest desired value for a setting, plus
 *  every caller awaiting the PATCH that will carry it. */
interface PendingConfigWrite {
  value: boolean;
  settlers: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
}

/** Per-setting write queue: at most one PATCH on the wire, at most one queued
 *  intent — a toggle issued while a write is queued replaces the queued value
 *  instead of stacking behind it. */
interface ConfigWriteQueue {
  inFlight: boolean;
  pending: PendingConfigWrite | null;
}

const CONFIG_SAVE_ERROR_MESSAGE =
  "Memory settings couldn't be saved. Try again shortly.";

function newConfigWriteQueue(): ConfigWriteQueue {
  return { inFlight: false, pending: null };
}

function hasUnsettledConfigWrite(queue: ConfigWriteQueue): boolean {
  return queue.inFlight || queue.pending !== null;
}

/**
 * Enqueue one desired value for a setting; the returned promise settles when
 * the PATCH that carries it does (rejecting with the transport error when that
 * PATCH throws). Writes are serialized per queue, so the server can never
 * apply two of this setting's PATCHes in the wrong order: a rapid sequence of
 * toggles coalesces to the latest intent, and that intent is what the last
 * request on the wire carries. `onSettled` receives whether the write was
 * accepted and whether a newer intent is already queued — a failure with a
 * newer intent queued must not roll anything back, because the newer write
 * supersedes it.
 */
function enqueueConfigWrite(
  queue: ConfigWriteQueue,
  value: boolean,
  send: (value: boolean) => Promise<boolean>,
  onSettled: (ok: boolean, value: boolean, hasNewerIntent: boolean) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (queue.pending) {
      queue.pending.value = value;
      queue.pending.settlers.push({ resolve, reject });
    } else {
      queue.pending = { value, settlers: [{ resolve, reject }] };
    }
    if (queue.inFlight) return;
    queue.inFlight = true;
    void (async () => {
      try {
        while (queue.pending) {
          const { value: desired, settlers } = queue.pending;
          queue.pending = null;
          let ok = false;
          let thrown: unknown;
          let didThrow = false;
          try {
            ok = await send(desired);
          } catch (error) {
            didThrow = true;
            thrown = error;
          }
          onSettled(ok, desired, queue.pending !== null);
          for (const settler of settlers) {
            if (didThrow) settler.reject(thrown);
            else settler.resolve();
          }
        }
      } finally {
        queue.inFlight = false;
      }
    })();
  });
}

/** Everything the config UI (master toggle + hooks panel) needs from the hook. */
export interface MemoryConfigController {
  /** Master memory switch. */
  enabled: boolean;
  /** Non-null after a config PATCH fails; cleared by the next confirmed write. */
  error: string | null;
  /** The four per-hook flags, in the shape the hooks panel consumes. */
  hookFlags: Record<MemoryConfigFlagKey, boolean>;
  /** Flip the master switch (optimistic; rolls back on a failed PATCH). */
  onToggleEnabled: (next: boolean) => Promise<void>;
  /** Flip one per-hook flag (optimistic; rolls back on a failed PATCH). */
  onToggleHook: (key: MemoryConfigFlagKey, next: boolean) => Promise<void>;
  /** Capture the current config generation before beginning a shared list
   *  reload. A local toggle invalidates earlier captures. */
  captureHydrationRevision: () => number;
  /** Populate every flag from a freshly-fetched memory list response, but only
   *  if it was captured before the same config generation. */
  hydrate: (list: MemoryListResponse, revision: number) => void;
}

export function useMemoryConfig(port: MemoryConfigPort): MemoryConfigController {
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatExtractionEnabled, setChatExtractionEnabled] = useState(true);
  const [profileEnabled, setProfileEnabled] = useState(true);
  const [rewriteEnabled, setRewriteEnabled] = useState(true);
  const [verifyEnabled, setVerifyEnabled] = useState(true);

  // Each toggle flips its own state optimistically the instant it's clicked,
  // but the PATCHes themselves are serialized per setting through a write
  // queue: rollback bookkeeping alone would keep the LOCAL state consistent
  // while still letting two concurrent PATCHes land server-side in the wrong
  // order and persist stale intent. The confirmed refs remember the last
  // server-acknowledged value, so a failed write with no newer intent queued
  // rolls back to server truth — never to another request's optimistic guess.
  const enabledConfirmedRef = useRef(true);
  const enabledQueueRef = useRef(newConfigWriteQueue());
  const hookConfirmedRef = useRef<Record<MemoryConfigFlagKey, boolean>>({
    chatExtractionEnabled: true,
    profileEnabled: true,
    rewriteEnabled: true,
    verifyEnabled: true,
  });
  const hookQueuesRef = useRef<Record<MemoryConfigFlagKey, ConfigWriteQueue>>({
    chatExtractionEnabled: newConfigWriteQueue(),
    profileEnabled: newConfigWriteQueue(),
    rewriteEnabled: newConfigWriteQueue(),
    verifyEnabled: newConfigWriteQueue(),
  });
  // List reloads are owned by useMemoryEntries, while writes live here. This
  // guard joins the two lifetimes: a reload captures before its GET begins and
  // hydrate ignores it when a toggle has invalidated that snapshot meanwhile.
  const hydrationGuardRef = useRef(createAsyncCommitGuard());

  const captureHydrationRevision = useCallback(
    () => hydrationGuardRef.current.capture(),
    [],
  );

  const hydrate = useCallback((list: MemoryListResponse, revision: number) => {
    if (!hydrationGuardRef.current.isCurrent(revision)) return;
    const next = {
      enabled: list.enabled,
      chatExtractionEnabled: list.chatExtractionEnabled !== false,
      profileEnabled: list.profileEnabled !== false,
      rewriteEnabled: list.rewriteEnabled !== false,
      verifyEnabled: list.verifyEnabled !== false,
    };

    // A list response can have raced an optimistic PATCH. Keep both the
    // visible value and its rollback baseline untouched until that setting's
    // queue settles; the write's onSettled callback then reconciles it.
    if (!hasUnsettledConfigWrite(enabledQueueRef.current)) {
      setEnabled(next.enabled);
      enabledConfirmedRef.current = next.enabled;
    }
    if (!hasUnsettledConfigWrite(hookQueuesRef.current.chatExtractionEnabled)) {
      setChatExtractionEnabled(next.chatExtractionEnabled);
      hookConfirmedRef.current.chatExtractionEnabled = next.chatExtractionEnabled;
    }
    if (!hasUnsettledConfigWrite(hookQueuesRef.current.profileEnabled)) {
      setProfileEnabled(next.profileEnabled);
      hookConfirmedRef.current.profileEnabled = next.profileEnabled;
    }
    if (!hasUnsettledConfigWrite(hookQueuesRef.current.rewriteEnabled)) {
      setRewriteEnabled(next.rewriteEnabled);
      hookConfirmedRef.current.rewriteEnabled = next.rewriteEnabled;
    }
    if (!hasUnsettledConfigWrite(hookQueuesRef.current.verifyEnabled)) {
      setVerifyEnabled(next.verifyEnabled);
      hookConfirmedRef.current.verifyEnabled = next.verifyEnabled;
    }
  }, []);

  const onToggleEnabled = useCallback(
    (next: boolean) => {
      hydrationGuardRef.current.invalidate();
      setError(null);
      setEnabled(next);
      return enqueueConfigWrite(
        enabledQueueRef.current,
        next,
        (value) => port.patchConfig(enabledPatch(value)),
        (ok, value, hasNewerIntent) => {
          // Invalidate again at SETTLE, not just at the optimistic start: a
          // reload() can capture this guard's revision anywhere during the
          // in-flight window (after the start-invalidate, before this callback
          // runs) and still observe a pre-write server snapshot once its GET
          // resolves. Only invalidating at start left that window open —
          // hasUnsettledConfigWrite() had already flipped false by the time
          // such a read's response arrived, so hydrate() applied it anyway.
          hydrationGuardRef.current.invalidate();
          if (ok) {
            enabledConfirmedRef.current = value;
            if (!hasNewerIntent) setError(null);
          } else if (!hasNewerIntent) {
            setEnabled(enabledConfirmedRef.current);
            setError(CONFIG_SAVE_ERROR_MESSAGE);
          }
        },
      );
    },
    [port],
  );

  // Map each hook key to its setter so a single optimistic-set + rollback path
  // covers all four toggles.
  const setters = useMemo<
    Record<MemoryConfigFlagKey, (fn: (cur: boolean) => boolean) => void>
  >(
    () => ({
      profileEnabled: setProfileEnabled,
      rewriteEnabled: setRewriteEnabled,
      verifyEnabled: setVerifyEnabled,
      chatExtractionEnabled: setChatExtractionEnabled,
    }),
    [],
  );

  const onToggleHook = useCallback(
    (key: MemoryConfigFlagKey, next: boolean) => {
      hydrationGuardRef.current.invalidate();
      setError(null);
      const setter = setters[key];
      setter(() => next);
      return enqueueConfigWrite(
        hookQueuesRef.current[key],
        next,
        (value) => port.patchConfig(singleFlagPatch(key, value)),
        (ok, value, hasNewerIntent) => {
          // See onToggleEnabled above for why settle needs its own invalidate.
          hydrationGuardRef.current.invalidate();
          if (ok) {
            hookConfirmedRef.current[key] = value;
            if (!hasNewerIntent) setError(null);
          } else if (!hasNewerIntent) {
            setter(() => hookConfirmedRef.current[key]);
            setError(CONFIG_SAVE_ERROR_MESSAGE);
          }
        },
      );
    },
    [port, setters],
  );

  const hookFlags = useMemo<Record<MemoryConfigFlagKey, boolean>>(
    () => ({
      profileEnabled,
      rewriteEnabled,
      verifyEnabled,
      chatExtractionEnabled,
    }),
    [profileEnabled, rewriteEnabled, verifyEnabled, chatExtractionEnabled],
  );

  return {
    enabled,
    error,
    hookFlags,
    onToggleEnabled,
    onToggleHook,
    captureHydrationRevision,
    hydrate,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This is
 * the default the orchestrator injects; swap it via the component prop in tests.
 */
export function useWiredMemoryConfig(): MemoryConfigController {
  return useMemoryConfig(memoryConfigPort);
}
