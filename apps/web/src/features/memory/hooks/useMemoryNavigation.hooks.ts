// Feature-local hook for the orchestrator's navigation/layout state: which top
// tab is showing (memories vs how), which source sub-tab is active, whether the
// add / advanced modals are open, and the records-section ref used for scroll.
// Pure UI state with no transport and — deliberately — NO effects: the effects
// that READ this state (reload-on-`activeTab`, the SSE stream, the OAuth
// subscriptions) stay in the single-instance orchestrator per the slice's
// effect-placement rule, so they can't double-fire. That keeps this hook a plain
// state container the orchestrator re-exposes, and it's driveable with
// `renderHook` to assert the tab/modal transitions in isolation.
import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { MemoryTab } from '../types';

/** The two top-level views: the saved-memory list vs the "how it works" panel. */
export type MemoryTopTab = 'memories' | 'how';

export interface MemoryNavigationController {
  topTab: MemoryTopTab;
  setTopTab: Dispatch<SetStateAction<MemoryTopTab>>;
  activeTab: MemoryTab;
  setActiveTab: Dispatch<SetStateAction<MemoryTab>>;
  addModalOpen: boolean;
  setAddModalOpen: Dispatch<SetStateAction<boolean>>;
  advancedModalOpen: boolean;
  setAdvancedModalOpen: Dispatch<SetStateAction<boolean>>;
  /** The saved-memory <section>; scroll targets and layout probes read it. */
  recordsRef: MutableRefObject<HTMLElement | null>;
  /** Open the manual editor: jump to the memories view, open the add modal, and
   *  select the manual sub-tab. Injected into the entries hook as coordination
   *  so that hook never reaches into nav state directly. */
  openEditor: () => void;
  /** Close the add modal (used after a successful create/save). */
  closeEditor: () => void;
}

export function useMemoryNavigation(): MemoryNavigationController {
  const [topTab, setTopTab] = useState<MemoryTopTab>('memories');
  const [activeTab, setActiveTab] = useState<MemoryTab>('profile');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const recordsRef = useRef<HTMLElement | null>(null);

  const openEditor = useCallback(() => {
    setTopTab('memories');
    setAddModalOpen(true);
    setActiveTab('manual');
  }, []);
  const closeEditor = useCallback(() => setAddModalOpen(false), []);

  return {
    topTab,
    setTopTab,
    activeTab,
    setActiveTab,
    addModalOpen,
    setAddModalOpen,
    advancedModalOpen,
    setAdvancedModalOpen,
    recordsRef,
    openEditor,
    closeEditor,
  };
}
