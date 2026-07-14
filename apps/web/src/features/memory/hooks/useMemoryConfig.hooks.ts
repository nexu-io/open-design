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

  // Each toggle flips its own state optimistically the instant it's clicked, so
  // two overlapping PATCHes for the SAME setting must not let an earlier
  // request's rollback stomp a later one's outcome. Track, per setting, the
  // last server-confirmed value and a request sequence number: a rollback only
  // applies when it belongs to the most recently issued request for that
  // setting, and it always restores the last confirmed value (never another
  // in-flight request's own optimistic guess).
  const enabledConfirmedRef = useRef(true);
  const enabledSeqRef = useRef(0);
  const hookConfirmedRef = useRef<Record<MemoryConfigFlagKey, boolean>>({
    chatExtractionEnabled: true,
    profileEnabled: true,
    rewriteEnabled: true,
    verifyEnabled: true,
  });
  const hookSeqRef = useRef<Record<MemoryConfigFlagKey, number>>({
    chatExtractionEnabled: 0,
    profileEnabled: 0,
    rewriteEnabled: 0,
    verifyEnabled: 0,
  });

  const hydrate = useCallback((list: MemoryListResponse) => {
    const next = {
      enabled: list.enabled,
      chatExtractionEnabled: list.chatExtractionEnabled !== false,
      profileEnabled: list.profileEnabled !== false,
      rewriteEnabled: list.rewriteEnabled !== false,
      verifyEnabled: list.verifyEnabled !== false,
    };
    setEnabled(next.enabled);
    setChatExtractionEnabled(next.chatExtractionEnabled);
    setProfileEnabled(next.profileEnabled);
    setRewriteEnabled(next.rewriteEnabled);
    setVerifyEnabled(next.verifyEnabled);
    enabledConfirmedRef.current = next.enabled;
    hookConfirmedRef.current = {
      chatExtractionEnabled: next.chatExtractionEnabled,
      profileEnabled: next.profileEnabled,
      rewriteEnabled: next.rewriteEnabled,
      verifyEnabled: next.verifyEnabled,
    };
  }, []);

  const onToggleEnabled = useCallback(
    async (next: boolean) => {
      const seq = ++enabledSeqRef.current;
      setEnabled(next);
      let ok = false;
      try {
        ok = await port.patchConfig(enabledPatch(next));
      } finally {
        if (ok) {
          enabledConfirmedRef.current = next;
        } else if (enabledSeqRef.current === seq) {
          setEnabled(enabledConfirmedRef.current);
        }
      }
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
    async (key: MemoryConfigFlagKey, next: boolean) => {
      const setter = setters[key];
      const seq = ++hookSeqRef.current[key];
      setter(() => next);
      let ok = false;
      try {
        ok = await port.patchConfig(singleFlagPatch(key, next));
      } finally {
        if (ok) {
          hookConfirmedRef.current[key] = next;
        } else if (hookSeqRef.current[key] === seq) {
          setter(() => hookConfirmedRef.current[key]);
        }
      }
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
