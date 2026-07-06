// Feature-local hook for the transient confirmation pill shown after a manual
// action (create/save/delete/index-saved/path-copied). Pure UI state with no
// transport, so it needs no injected port and is its own wired form; the
// orchestrator injects `fireFlash` into the hooks that fire it (entries,
// connectors) as an arg, keeping those hooks decoupled from this one.
import { useCallback, useEffect, useState } from 'react';
import type { FlashKind } from '../types';

export interface MemoryFlashController {
  /** The active pill, or null when nothing is showing. */
  flash: { kind: FlashKind; key: number } | null;
  /** Show a confirmation pill for ~1.8s. */
  fireFlash: (kind: FlashKind) => void;
}

export function useMemoryFlash(): MemoryFlashController {
  // Brief inline confirmation after a manual save/create/delete. The form
  // vanishes on success and the existing list re-renders, but those signals are
  // subtle — a 1.8s pill makes "your click did something" obvious without the
  // heavyweight global toast.
  const [flash, setFlash] = useState<{ kind: FlashKind; key: number } | null>(
    null,
  );

  const fireFlash = useCallback((kind: FlashKind) => {
    setFlash({ kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  return { flash, fireFlash };
}
