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
import { useCallback, useMemo, useState } from 'react';
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

  const hydrate = useCallback((list: MemoryListResponse) => {
    setEnabled(list.enabled);
    setChatExtractionEnabled(list.chatExtractionEnabled !== false);
    setProfileEnabled(list.profileEnabled !== false);
    setRewriteEnabled(list.rewriteEnabled !== false);
    setVerifyEnabled(list.verifyEnabled !== false);
  }, []);

  const onToggleEnabled = useCallback(
    async (next: boolean) => {
      // Optimistic flip; keep the prior value so a rejected PATCH (the provider
      // signals a non-2xx write with `false`) or a thrown transport error rolls
      // the master switch back — mirroring the per-flag path below.
      const previous = enabled;
      setEnabled(next);
      let ok = false;
      try {
        ok = await port.patchConfig(enabledPatch(next));
      } finally {
        if (!ok) setEnabled(previous);
      }
    },
    [enabled, port],
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
      setter(() => next);
      const ok = await port.patchConfig(singleFlagPatch(key, next));
      if (!ok) setter((current) => !current);
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
