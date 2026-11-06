import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../player";
import { findElementForSelection, type DomEditSelection } from "../components/editor/domEditing";
import { clampNumber, type RightPanelTab } from "../utils/studioHelpers";
import { parseProjectIdFromHash } from "../utils/projectRouting";
import {
  buildStudioHash,
  parseStudioUrlStateFromHash,
  type StudioUrlSelectionState,
  type StudioUrlSelectionTarget,
  type StudioUrlState,
} from "../utils/studioUrlState";

interface UseStudioUrlStateParams {
  projectId: string | null;
  activeCompPath: string | null;
  duration: number;
  isPlaying: boolean;
  compositionLoading: boolean;
  refreshKey: number;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  rightPanelTab: RightPanelTab;
  rightCollapsed: boolean;
  activeCompPathHydrated: boolean;
  domEditSelection: DomEditSelection | null;
  domEditGroupSelections: DomEditSelection[];
  applyMarqueeSelection: (selections: DomEditSelection[], additive: boolean) => void;
  buildDomSelectionFromTarget: (
    target: HTMLElement,
    options?: { preferClipAncestor?: boolean; skipSourceProbe?: boolean },
  ) => Promise<DomEditSelection | null>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: {
      revealPanel?: boolean;
      additive?: boolean;
      preserveGroup?: boolean;
    },
  ) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  initialState: StudioUrlState;
}

function toPersistedTarget(selection: DomEditSelection): StudioUrlSelectionTarget | null {
  if (!selection.id && !selection.selector) return null;
  return {
    sourceFile: selection.sourceFile || undefined,
    id: selection.id || undefined,
    selector: selection.selector || undefined,
    selectorIndex: selection.selectorIndex ?? undefined,
  };
}

function selectionTargetKey(selection: StudioUrlSelectionTarget): string {
  return [
    selection.sourceFile ?? "",
    selection.id ?? "",
    selection.selector ?? "",
    selection.selectorIndex ?? "",
  ].join("|");
}

function toPersistedSelection(
  selection: DomEditSelection | null,
  // Optional: a caller that only ever has one selection has nothing to add, and
  // the URL must still carry that one rather than throwing on the way out.
  group: DomEditSelection[] = [],
): StudioUrlSelectionState | null {
  if (!selection) return null;
  const primary = toPersistedTarget(selection);
  if (!primary) return null;
  // The primary is already carried by the top-level fields; the rest ride along so the link
  // reopens the same multi-selection instead of a single element.
  const primaryKey = selectionTargetKey(primary);
  const members = new Map<string, StudioUrlSelectionTarget>();
  for (const member of group) {
    const target = toPersistedTarget(member);
    if (!target) continue;
    const key = selectionTargetKey(target);
    if (key !== primaryKey) members.set(key, target);
  }
  return {
    ...primary,
    group: members.size > 0 ? [...members.values()] : undefined,
  };
}

function replaceHash(nextHash: string) {
  if (typeof window === "undefined") return;
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, "", nextHash);
}

interface ResolveUrlSelectionsParams {
  doc: Document;
  primaryElement: HTMLElement;
  selection: StudioUrlSelectionState;
  group: StudioUrlSelectionTarget[];
  activeCompPath: string | null;
  isCurrent: () => boolean;
  buildDomSelection: UseStudioUrlStateParams["buildDomSelectionFromTarget"];
}

function findUrlSelectionElement(
  doc: Document,
  target: StudioUrlSelectionTarget,
  fallbackSourceFile: string,
  activeCompPath: string | null,
): HTMLElement | null {
  return findElementForSelection(
    doc,
    {
      sourceFile: target.sourceFile ?? fallbackSourceFile,
      id: target.id,
      selector: target.selector,
      selectorIndex: target.selectorIndex,
    },
    activeCompPath,
  );
}

async function buildOptionalDomSelection(
  element: HTMLElement | null,
  buildDomSelection: UseStudioUrlStateParams["buildDomSelectionFromTarget"],
): Promise<DomEditSelection | null> {
  if (!element) return null;
  // No source probe for group members. Each one costs a request, they are
  // resolved one after another, and the URL carries the whole selection — so a
  // marquee over a captured page turned every reload into hundreds of serial
  // round trips before the canvas answered anything, including a Delete press.
  // The marquee that produced these members already skips the probe for the
  // same reason; only the primary, whose panel reads the flag, still pays it.
  return buildDomSelection(element, { preferClipAncestor: false, skipSourceProbe: true });
}

export async function resolveUrlSelections({
  doc,
  primaryElement,
  selection,
  group,
  activeCompPath,
  isCurrent,
  buildDomSelection,
}: ResolveUrlSelectionsParams): Promise<DomEditSelection[] | null> {
  const primary = await buildDomSelection(primaryElement, { preferClipAncestor: false });
  if (!isCurrent()) return null;
  if (!primary) return [];
  const members = [primary];
  for (const member of group) {
    const element = findUrlSelectionElement(
      doc,
      member,
      selection.sourceFile ?? "",
      activeCompPath,
    );
    const resolved = await buildOptionalDomSelection(element, buildDomSelection);
    if (!isCurrent()) return null;
    if (resolved) members.push(resolved);
  }
  return members;
}

export function useStudioUrlState({
  projectId,
  activeCompPath,
  duration,
  isPlaying,
  compositionLoading,
  refreshKey,
  previewIframeRef,
  rightPanelTab,
  rightCollapsed,
  activeCompPathHydrated,
  domEditSelection,
  domEditGroupSelections,
  applyMarqueeSelection,
  buildDomSelectionFromTarget,
  applyDomSelection,
  setRightPanelTab,
  initialState,
}: UseStudioUrlStateParams) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const hydratedSeekRef = useRef(initialState.currentTime == null);
  const hydratedInitialTimeRef = useRef(initialState.currentTime == null);
  const hydratedSelectionRef = useRef(initialState.selection == null);
  // Mirrors hydratedSelectionRef as state so the selection-hydration effect can
  // drop its currentTime subscription once hydration completes — otherwise it
  // re-runs on every playhead tick for the lifetime of the session.
  const [selectionHydrated, setSelectionHydrated] = useState(initialState.selection == null);
  const pendingSelectionRef = useRef(initialState.selection);
  const stableTimeRef = useRef<number | null>(initialState.currentTime);
  const selectionApplySeqRef = useRef(0);

  const buildUrlState = useCallback(
    (): StudioUrlState => ({
      activeCompPath,
      currentTime: stableTimeRef.current,
      rightPanelTab,
      rightCollapsed,
      timelineVisible: null,
      selection: hydratedSelectionRef.current
        ? toPersistedSelection(domEditSelection, domEditGroupSelections)
        : pendingSelectionRef.current,
    }),
    [activeCompPath, domEditGroupSelections, domEditSelection, rightCollapsed, rightPanelTab],
  );

  // Resolve a URL selection to a live element and apply it. Shared by the initial
  // hydration effect and the external-navigation (hashchange) handler. Returns
  // false ONLY when the iframe document isn't ready yet (caller should retry);
  // a missing element or null selection clears the selection and returns true.
  const applyUrlSelection = useCallback(
    (selection: StudioUrlSelectionState | null): boolean => {
      const applySeq = ++selectionApplySeqRef.current;
      if (!selection) {
        applyDomSelection(null, { revealPanel: false });
        return true;
      }
      let doc: Document | null = null;
      try {
        doc = previewIframeRef.current?.contentDocument ?? null;
      } catch {
        return false;
      }
      if (!doc) return false;
      const element = findElementForSelection(
        doc,
        {
          sourceFile: selection.sourceFile ?? "",
          id: selection.id,
          selector: selection.selector,
          selectorIndex: selection.selectorIndex,
        },
        activeCompPath,
      );
      if (!element) {
        applyDomSelection(null, { revealPanel: false });
        return true;
      }
      const group = selection.group ?? [];
      void resolveUrlSelections({
        doc,
        primaryElement: element,
        selection,
        group,
        activeCompPath,
        isCurrent: () => applySeq === selectionApplySeqRef.current,
        buildDomSelection: buildDomSelectionFromTarget,
      }).then((members) => {
        if (!members) return;
        const primary = members[0];
        if (!primary) return applyDomSelection(null, { revealPanel: false });
        if (group.length === 0) return applyDomSelection(primary, { revealPanel: false });
        // Missing group members are dropped without failing the rest.
        applyMarqueeSelection(members, false);
      });
      return true;
    },
    [
      activeCompPath,
      applyDomSelection,
      applyMarqueeSelection,
      buildDomSelectionFromTarget,
      previewIframeRef,
    ],
  );

  useEffect(() => {
    if (!projectId || hydratedSeekRef.current || compositionLoading) return;
    const nextTime =
      duration > 0
        ? clampNumber(initialState.currentTime ?? 0, 0, duration)
        : Math.max(0, initialState.currentTime ?? 0);
    // The request is honored even if it fires before the player runtime mounts:
    // initializeAdapter reconciles the store's requestedSeekTime when the adapter
    // becomes ready. currentTime then settles to nextTime, releasing the selection
    // hydration below.
    usePlayerStore.getState().requestSeek(nextTime);
    stableTimeRef.current = nextTime;
    hydratedSeekRef.current = true;
  }, [projectId, compositionLoading, duration, initialState.currentTime]);

  // Once hydration completes the selection effect no longer needs the playhead,
  // so freeze its time dependency. This stops the effect re-running on every tick
  // for the rest of the session (cosmetic perf) while still retrying as the seek
  // settles before hydration.
  const selectionHydrationTime = selectionHydrated ? 0 : currentTime;
  useEffect(() => {
    if (!projectId || hydratedSelectionRef.current || compositionLoading) return;
    if (!hydratedSeekRef.current) return;
    const targetTime = initialState.currentTime;
    if (targetTime != null && Math.abs(selectionHydrationTime - stableTimeRef.current!) > 0.05) {
      return;
    }

    const markHydrated = () => {
      hydratedSelectionRef.current = true;
      setSelectionHydrated(true);
    };
    const pendingSelection = pendingSelectionRef.current;
    if (!pendingSelection) {
      markHydrated();
      return;
    }
    // Doc not ready yet → leave hydration pending so a later tick retries.
    if (!applyUrlSelection(pendingSelection)) return;
    markHydrated();
    pendingSelectionRef.current = null;
  }, [
    applyUrlSelection,
    compositionLoading,
    selectionHydrationTime,
    initialState.currentTime,
    projectId,
    refreshKey,
  ]);

  useEffect(() => {
    if (hydratedInitialTimeRef.current) return;
    const targetTime = stableTimeRef.current;
    if (targetTime == null) {
      hydratedInitialTimeRef.current = true;
      return;
    }
    if (Math.abs(currentTime - targetTime) > 0.05) return;
    hydratedInitialTimeRef.current = true;
  }, [currentTime]);

  useEffect(() => {
    if (!activeCompPathHydrated) return;
    if (!hydratedSeekRef.current) return;
    if (!hydratedInitialTimeRef.current) return;
    if (!projectId || isPlaying) return;
    const handle = window.setTimeout(() => {
      stableTimeRef.current = clampNumber(currentTime, 0, Math.max(0, duration));
      replaceHash(buildStudioHash(projectId, buildUrlState()));
    }, 200);

    return () => window.clearTimeout(handle);
  }, [activeCompPathHydrated, buildUrlState, currentTime, duration, isPlaying, projectId]);

  useEffect(() => {
    if (!activeCompPathHydrated) return;
    if (!projectId) return;
    replaceHash(buildStudioHash(projectId, buildUrlState()));
  }, [activeCompPathHydrated, buildUrlState, projectId]);

  // Re-apply URL state when the hash changes externally (pasting a new link,
  // back/forward) AFTER initial load. The app only reads the URL once on mount
  // and otherwise WRITES the hash via replaceState (which never fires
  // `hashchange`), so this listener sees only genuine external navigations —
  // without it, opening a same-project deep link (different `t`, element, or
  // tab) is silently ignored and then overwritten by the next hash-sync.
  useEffect(() => {
    if (!projectId) return;
    const onHashChange = () => {
      if (parseProjectIdFromHash(window.location.hash) !== projectId) return; // different project → remount handles it
      const parsed = parseStudioUrlStateFromHash(window.location.hash);
      if (parsed.currentTime != null) {
        const clamped =
          duration > 0
            ? clampNumber(parsed.currentTime, 0, duration)
            : Math.max(0, parsed.currentTime);
        if (Math.abs(usePlayerStore.getState().currentTime - clamped) > 0.05) {
          usePlayerStore.getState().requestSeek(clamped);
          stableTimeRef.current = clamped;
        }
      }
      applyUrlSelection(parsed.selection);
      if (parsed.rightPanelTab) setRightPanelTab(parsed.rightPanelTab);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [projectId, duration, applyUrlSelection, setRightPanelTab]);
}
