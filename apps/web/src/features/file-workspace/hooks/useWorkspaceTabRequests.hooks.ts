// Feature-local hook for the file-workspace external-tab-request sync
// cluster: the batch of reactive effects that translate a prop-driven
// request (openRequest / shareRequest / downloadRequest / slideNavRequest /
// focusQuestionsRequest / designSystemEditRequest) or an internal
// consistency check (persisted-tab fallback, Questions-tab fallback) into
// `activeTab` / persisted tab-state updates. No transport/DOM here — pure
// state/dispatch reacting to already-computed values, so this hook takes no
// port.
//
// This is sub-cluster 3a of the still-in-progress tab-activation cluster
// (cluster 3 in EXTRACTION-PLAN.md). It is a *consumer* of the tab-state
// primitives (`setActiveTab`, `setPersistedActive`, `commitTabsState`,
// `workspaceTabsState`, `onTabsStateChange`) rather than a producer, so
// unlike `openFile`/`closeTab`/`commitTabsState` themselves (still inline in
// the orchestrator — see the plan for why splitting those out hits a real
// hook-ordering cycle with `useWiredSketches`/`useWiredFileOperations`/
// `useBrowserTabs`), this hook can be called safely AFTER
// `useWorkspaceContextTracking` without breaking any hoisting trick: it only
// needs `orderedWorkspaceTabs` as a plain value (not a ref), since none of
// its effects run synchronously during render.
//
// Effect-registration order matters here (see the `useBrowserTabs` mount-time
// clobbering gotcha in EXTRACTION-PLAN.md cluster 4): this hook must be
// called AFTER the orchestrator's own "pull the persisted active tab in"
// effect and after `useBrowserTabs` (both still call `setActiveTab` directly
// on mount), so this hook's own `setActiveTab` calls keep winning the same
// flush the way they did before extraction. None of the hooks called between
// `useBrowserTabs` and this one (`useWorkspaceContextTracking`) touch
// `activeTab`, so moving this cluster's call site later than its original
// textual position does not reorder it relative to either of those.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { OpenTabsState, DesignSystemSummary } from '../../../types';
import { type DesignKitEditFocusRequest } from '../../../components/DesignKitView';
import { isSlideNavDeliverableNow, type SlideNavRequest } from '../../../runtime/slide-nav';
import { isBrowserTabId, reanchorBrowserTabsToCurrentOrder } from '../rules';
import { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB, QUESTIONS_TAB } from '../constants';
import type { BrowserWorkspaceTab, SketchState, WorkspaceOrderedTab } from '../types';

export interface WorkspaceTabRequestsParams {
  activeTab: string;
  setActiveTab: (name: string) => void;
  defaultRootTab: string;
  persistedTabs: string[];
  browserTabs: BrowserWorkspaceTab[];
  setBrowserTabs: Dispatch<SetStateAction<BrowserWorkspaceTab[]>>;
  orderedWorkspaceTabs: WorkspaceOrderedTab[];
  sketches: Record<string, SketchState>;
  designSystemProject?: DesignSystemSummary | null;
  showQuestionsTab: boolean;
  setUploadError: (error: string | null) => void;
  setPersistedActive: (name: string | null) => void;
  onTabsStateChange: (next: OpenTabsState) => void;
  commitTabsState: (next: OpenTabsState) => void;
  workspaceTabsState: (
    tabs: string[],
    active: string | null,
    nextBrowserTabs?: BrowserWorkspaceTab[],
  ) => OpenTabsState;
  openRequest?: { name: string; nonce: number } | null;
  shareRequest?: { name: string; nonce: number } | null;
  downloadRequest?: { name: string; nonce: number } | null;
  slideNavRequest?: SlideNavRequest | null;
  focusQuestionsRequest?: { nonce: number } | null;
  designSystemEditRequest?: DesignKitEditFocusRequest | null;
  questionFormSubmittedAnswers?: Record<string, string | string[]>;
}

export interface WorkspaceTabRequestsController {
  slideNavDeliverableNonce: number | null;
}

export function useWorkspaceTabRequests(
  params: WorkspaceTabRequestsParams,
): WorkspaceTabRequestsController {
  const {
    activeTab,
    setActiveTab,
    defaultRootTab,
    persistedTabs,
    browserTabs,
    setBrowserTabs,
    orderedWorkspaceTabs,
    sketches,
    designSystemProject,
    showQuestionsTab,
    setUploadError,
    setPersistedActive,
    onTabsStateChange,
    commitTabsState,
    workspaceTabsState,
    openRequest,
    shareRequest,
    downloadRequest,
    slideNavRequest,
    focusQuestionsRequest,
    designSystemEditRequest,
    questionFormSubmittedAnswers,
  } = params;

  // When the persisted tab list changes and the active tab is gone, fall
  // back to the last remaining tab. Skip transient activeTab values
  // (DESIGN_FILES_TAB, pending sketches) since those aren't in persistedTabs.
  useEffect(() => {
    if (
      activeTab === DESIGN_FILES_TAB
      || activeTab === DESIGN_SYSTEM_TAB
      || activeTab === QUESTIONS_TAB
    ) return;
    if (isBrowserTabId(activeTab)) {
      if (!browserTabs.some((tab) => tab.id === activeTab)) {
        setActiveTab(DESIGN_FILES_TAB);
      }
      return;
    }
    if (sketches[activeTab] && !sketches[activeTab]!.persisted) return;
    if (!persistedTabs.includes(activeTab)) {
      setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedTabs, activeTab]);

  useEffect(() => {
    if (!designSystemEditRequest) return;
    setUploadError(null);
    setPersistedActive(designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designSystemEditRequest?.nonce]);

  // External open requests from chat (tool cards, produced-file chips,
  // deep-linked URL, or the parent's auto-open after an agent Write) —
  // add the file to the open-tabs set and focus it.
  useEffect(() => {
    if (!openRequest) return;
    const name = openRequest.name;
    if (!name) return;
    if (name === DESIGN_FILES_TAB || name === DESIGN_SYSTEM_TAB) {
      const nextActive =
        name === DESIGN_SYSTEM_TAB && !designSystemProject
          ? DESIGN_FILES_TAB
          : name;
      onTabsStateChange(workspaceTabsState(persistedTabs, nextActive));
      setActiveTab(nextActive);
      return;
    }
    if (isBrowserTabId(name) && browserTabs.some((tab) => tab.id === name)) {
      onTabsStateChange(workspaceTabsState(persistedTabs, name));
      setActiveTab(name);
      return;
    }
    const isNewTab = !persistedTabs.includes(name);
    const nextBrowserTabs = isNewTab
      ? reanchorBrowserTabsToCurrentOrder(orderedWorkspaceTabs, browserTabs)
      : browserTabs;
    if (nextBrowserTabs !== browserTabs) setBrowserTabs(nextBrowserTabs);
    onTabsStateChange(workspaceTabsState(
      isNewTab ? [...persistedTabs, name] : persistedTabs,
      name,
      nextBrowserTabs,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // Share request: ensure the target file is open + active so the FileViewer
  // below receives the matching `shareRequest` and opens its Share menu.
  useEffect(() => {
    if (!shareRequest) return;
    const name = shareRequest.name;
    if (!name) return;
    commitTabsState(workspaceTabsState(
      persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      name,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareRequest]);

  // Download request: same as shareRequest, but the FileViewer opens its
  // Download/Export menu. Without this, Download did nothing whenever the target
  // artifact was not already the active tab (it forwards only on a name match).
  useEffect(() => {
    if (!downloadRequest) return;
    const name = downloadRequest.name;
    if (!name) return;
    commitTabsState(workspaceTabsState(
      persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      name,
    ));
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadRequest]);

  // Slide-nav request: decide deliverability once, at fire time. Only if the
  // named deck is already an open tab do we mark this nonce deliverable and
  // bring it forward so the matching FileViewer is mounted and flips. We never
  // open a closed file — auto-flipping is a follow-along, not a reason to yank
  // the user into a tab they never opened. Recording the deliverable nonce in
  // state (not a ref) also means a request for a closed deck stays undeliverable
  // forever: opening that file later matches the name but not the nonce, so the
  // stale request can't resurface and jump the preview.
  const [slideNavDeliverableNonce, setSlideNavDeliverableNonce] = useState<number | null>(null);
  useEffect(() => {
    if (!isSlideNavDeliverableNow(slideNavRequest, persistedTabs)) return;
    setSlideNavDeliverableNonce(slideNavRequest!.nonce);
    setActiveTab(slideNavRequest!.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideNavRequest]);

  // Focus the Questions tab when the parent bumps the nonce (banner click in
  // chat, or a freshly generated form). The tab is transient — not added to
  // the persisted tab list.
  useEffect(() => {
    if (!focusQuestionsRequest) return;
    setActiveTab(QUESTIONS_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusQuestionsRequest?.nonce]);

  // Submitting from the right-hand panel should close the preview once. The
  // answered form remains available, so a later chat-banner click can reopen
  // the same Questions tab without this effect immediately closing it again.
  const previousQuestionFormSubmittedAnswersRef = useRef(questionFormSubmittedAnswers);
  useEffect(() => {
    const wasAnswered = previousQuestionFormSubmittedAnswersRef.current !== undefined;
    const isAnswered = questionFormSubmittedAnswers !== undefined;
    previousQuestionFormSubmittedAnswersRef.current = questionFormSubmittedAnswers;
    if (activeTab === QUESTIONS_TAB && !wasAnswered && isAnswered) {
      setActiveTab(defaultRootTab);
    }
  }, [activeTab, defaultRootTab, questionFormSubmittedAnswers]);

  // If the Questions tab is active but the form is gone because a new assistant
  // turn has no form, fall back to the default root tab.
  useEffect(() => {
    if (activeTab === QUESTIONS_TAB && !showQuestionsTab) {
      setActiveTab(defaultRootTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, showQuestionsTab]);

  return { slideNavDeliverableNonce };
}
