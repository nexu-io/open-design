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
  /** The four per-hook flags, in the shape the hooks panel consumes. */
  hookFlags: Record<MemoryConfigFlagKey, boolean>;
  /** Flip the master switch (optimistic; rolls back on a failed PATCH). */
  onToggleEnabled: (next: boolean) => Promise<void>;
  /** Flip one per-hook flag (optimistic; rolls back on a failed PATCH). */
  onToggleHook: (key: MemoryConfigFlagKey, next: boolean) => Promise<void>;
  /** Populate every flag from a freshly-fetched memory list response. Called by
   *  the shared list reload so one GET hydrates config + entries together. */
  hydrate: (list: MemoryListResponse) => void;
}

export function useMemoryConfig(port: MemoryConfigPort): MemoryConfigController {
  const [enabled, setEnabled] = useState(true);
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

  const hydrate = useCallback((list: MemoryListResponse) => {
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
      setEnabled(next);
      return enqueueConfigWrite(
        enabledQueueRef.current,
        next,
        (value) => port.patchConfig(enabledPatch(value)),
        (ok, value, hasNewerIntent) => {
          if (ok) enabledConfirmedRef.current = value;
          else if (!hasNewerIntent) setEnabled(enabledConfirmedRef.current);
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
      const setter = setters[key];
      setter(() => next);
      return enqueueConfigWrite(
        hookQueuesRef.current[key],
        next,
        (value) => port.patchConfig(singleFlagPatch(key, value)),
        (ok, value, hasNewerIntent) => {
          if (ok) hookConfirmedRef.current[key] = value;
          else if (!hasNewerIntent) setter(() => hookConfirmedRef.current[key]);
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

  return { enabled, hookFlags, onToggleEnabled, onToggleHook, hydrate };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This is
 * the default the orchestrator injects; swap it via the component prop in tests.
 */
export function useWiredMemoryConfig(): MemoryConfigController {
  return useMemoryConfig(memoryConfigPort);
}
