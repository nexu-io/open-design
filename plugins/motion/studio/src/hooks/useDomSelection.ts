import { useState, useCallback, useRef, useEffect } from "react";
import type { TimelineElement } from "../player";
import {
  getAllPreviewTargetsFromPointer,
  getPreviewTargetFromPointer,
} from "../utils/studioPreviewHelpers";
import {
  domEditSelectionsEqual,
  domEditSelectionsTargetSame,
  domEditSelectionInGroup,
  toggleDomEditGroupSelection,
  replaceDomEditGroupSelection,
  seedDomEditGroupWithSelection,
} from "../utils/domEditHelpers";
import {
  findElementForSelection,
  findElementForTimelineElement,
  resolveDomEditSelection,
  type DomEditSelection,
} from "../components/editor/domEditing";
import { reapplyPositionEditsAfterSeek } from "../components/editor/manualEdits";
import { holdScenesOf } from "../utils/sceneHold";
import { useStudioTestHooks } from "./useStudioTestHooks";
import { logSelect } from "../utils/selectDebug";
import { announceTimelineSelection as announceSelectionToTimeline } from "./domSelectionTimelineMirror";
import type {
  ApplyDomSelectionOptions,
  ResolveDomSelectionOptions,
  UseDomSelectionParams,
  UseDomSelectionReturn,
} from "./useDomSelectionTypes";

export type {
  ApplyDomSelectionOptions,
  ResolveDomSelectionOptions,
  UseDomSelectionParams,
  UseDomSelectionReturn,
} from "./useDomSelectionTypes";

// ── Hook ──

export function useDomSelection({
  projectId,
  activeCompPath,
  isMasterView,
  compIdToSrc,
  captionEditMode,
  previewIframeRef,
  timelineElements,
  getTimelineSelectionSet,
  setSelectedTimelineElementId,
  setTimelineSelectionSet,
  setRightCollapsed,
  setRightPanelTab,
  previewIframe,
  refreshKey,
  rightPanelTab,
}: UseDomSelectionParams): UseDomSelectionReturn {
  // ── State ──

  const [domEditSelection, setDomEditSelection] = useState<DomEditSelection | null>(null);
  const [domEditGroupSelections, setDomEditGroupSelections] = useState<DomEditSelection[]>([]);
  const [domEditHoverSelection, setDomEditHoverSelection] = useState<DomEditSelection | null>(null);
  // The data-hf-group wrapper the user has drilled into (null = top level).
  const [activeGroupElement, setActiveGroupElementState] = useState<HTMLElement | null>(null);

  // ── Refs ──

  const rightPanelTabRef = useRef(rightPanelTab);
  rightPanelTabRef.current = rightPanelTab;
  const domEditSelectionRef = useRef<DomEditSelection | null>(domEditSelection);
  const domEditGroupSelectionsRef = useRef<DomEditSelection[]>(domEditGroupSelections);
  const domEditHoverSelectionRef = useRef<DomEditSelection | null>(domEditHoverSelection);
  const activeGroupElementRef = useRef<HTMLElement | null>(activeGroupElement);
  const compositionIdentityRef = useRef({ activeCompPath, projectId });
  // Monotonic token so a rapid A->B timeline-clip select can't let A's slower async
  // resolution land after B and restore the wrong selection.
  const timelineSelectSeqRef = useRef(0);

  // Keep refs in sync with state
  domEditSelectionRef.current = domEditSelection;
  domEditGroupSelectionsRef.current = domEditGroupSelections;
  domEditHoverSelectionRef.current = domEditHoverSelection;
  activeGroupElementRef.current = activeGroupElement;

  // ── Callbacks ──

  const announceTimelineSelection = useCallback(
    (group: DomEditSelection[], primary: DomEditSelection | null, replaceSet?: boolean) =>
      announceSelectionToTimeline(
        {
          timelineElements,
          getTimelineSelectionSet,
          setSelectedTimelineElementId,
          setTimelineSelectionSet,
        },
        group,
        primary,
        replaceSet,
      ),
    [
      getTimelineSelectionSet,
      setSelectedTimelineElementId,
      setTimelineSelectionSet,
      timelineElements,
    ],
  );

  const applyDomSelection = useCallback(
    // fallow-ignore-next-line complexity
    (selection: DomEditSelection | null, options?: ApplyDomSelectionOptions) => {
      if (!selection) {
        logSelect("clear", { hadGroup: domEditGroupSelectionsRef.current.length });
        domEditSelectionRef.current = null;
        domEditGroupSelectionsRef.current = [];
        setDomEditSelection(null);
        setDomEditGroupSelections([]);
        if (options?.announce !== false) announceTimelineSelection([], null);
        return;
      }

      const isAdditiveSelection = Boolean(options?.additive);
      const currentSelection = domEditSelectionRef.current;
      const previousGroup = domEditGroupSelectionsRef.current;
      const isRepeatedSingleSelection =
        !isAdditiveSelection &&
        !options?.preserveGroup &&
        previousGroup.length === 1 &&
        domEditSelectionsTargetSame(currentSelection, selection) &&
        domEditSelectionsTargetSame(previousGroup[0], selection);
      const isUnchangedRefresh =
        options?.preserveGroup &&
        currentSelection !== null &&
        (previousGroup.length === 0 || previousGroup.includes(currentSelection)) &&
        domEditSelectionsEqual(currentSelection, selection);
      if (isUnchangedRefresh) return;
      if (isRepeatedSingleSelection) {
        if (options?.revealPanel !== false) {
          setRightCollapsed(false);
          if (rightPanelTabRef.current !== "variables") setRightPanelTab("design");
        }
        return;
      }
      const currentGroup = isAdditiveSelection
        ? seedDomEditGroupWithSelection(previousGroup, currentSelection)
        : previousGroup;
      const wasInGroup = domEditSelectionInGroup(currentGroup, selection);
      const nextGroup = options?.preserveGroup
        ? replaceDomEditGroupSelection(currentGroup, selection)
        : isAdditiveSelection
          ? toggleDomEditGroupSelection(currentGroup, selection)
          : [selection];
      const nextSelection = options?.preserveGroup
        ? selection
        : isAdditiveSelection && wasInGroup
          ? domEditSelectionsTargetSame(currentSelection, selection)
            ? (nextGroup[0] ?? null)
            : domEditSelectionInGroup(nextGroup, currentSelection)
              ? currentSelection
              : (nextGroup[0] ?? null)
          : selection;

      logSelect("apply", {
        additive: isAdditiveSelection,
        target: selection.selector ?? selection.id ?? null,
        wasInGroup,
        prevGroup: previousGroup.length,
        nextGroup: nextGroup.length,
      });
      domEditSelectionRef.current = nextSelection;
      domEditGroupSelectionsRef.current = nextGroup;
      setDomEditSelection(nextSelection);
      setDomEditGroupSelections(nextGroup);

      // Selecting something outside the drilled-into group exits the drill-in, so
      // a later click on the group selects it as a unit again (non-sticky drill-in).
      const activeGroup = activeGroupElementRef.current;
      if (activeGroup && nextSelection && !activeGroup.contains(nextSelection.element)) {
        activeGroupElementRef.current = null;
        setActiveGroupElementState(null);
      }

      if (nextSelection) {
        if (options?.revealPanel !== false) {
          setRightCollapsed(false);
          // Keep the Variables tab in place — selecting elements is part of the bind
          // flow there; yanking to Design would lose the context.
          if (rightPanelTabRef.current !== "variables") {
            setRightPanelTab("design");
          }
        }
        announceTimelineSelection(nextGroup, nextSelection, isAdditiveSelection);
        return;
      }

      announceTimelineSelection([], null);
    },
    [announceTimelineSelection, setRightCollapsed, setRightPanelTab],
  );

  const clearDomSelection = useCallback(() => {
    applyDomSelection(null, { revealPanel: false });
  }, [applyDomSelection]);

  // Drill into / out of a group. Changing scope clears the current selection so
  // the user isn't left with an out-of-scope element selected.
  const setActiveGroupElement = useCallback(
    (el: HTMLElement | null) => {
      if (activeGroupElementRef.current === el) return;
      activeGroupElementRef.current = el;
      setActiveGroupElementState(el);
      applyDomSelection(null, { revealPanel: false });
    },
    [applyDomSelection],
  );

  const buildDomSelectionFromTarget = useCallback(
    (target: HTMLElement, options?: ResolveDomSelectionOptions) => {
      return resolveDomEditSelection(target, {
        activeCompositionPath: activeCompPath,
        isMasterView,
        preferClipAncestor: options?.preferClipAncestor,
        skipSourceProbe: options?.skipSourceProbe,
        exactTarget: options?.exactTarget,
        previous: options?.previous,
        activeGroupElement:
          options && "activeGroupElement" in options
            ? options.activeGroupElement
            : activeGroupElementRef.current,
        projectId,
      });
    },
    [activeCompPath, isMasterView, projectId],
  );

  const resolveDomSelectionFromPreviewPoint = useCallback(
    // fallow-ignore-next-line complexity
    async (
      clientX: number,
      clientY: number,
      options?: {
        preferClipAncestor?: boolean;
        skipSourceProbe?: boolean;
        activeGroupElement?: HTMLElement | null;
      },
    ) => {
      const iframe = previewIframeRef.current;
      if (!iframe || captionEditMode) return null;
      try {
        if (iframe.contentDocument) reapplyPositionEditsAfterSeek(iframe.contentDocument);
      } catch {
        /* cross-origin guard */
      }
      const target = getPreviewTargetFromPointer(iframe, clientX, clientY, activeCompPath);
      if (!target) return null;
      return buildDomSelectionFromTarget(
        target,
        options && "activeGroupElement" in options
          ? {
              preferClipAncestor: options.preferClipAncestor,
              skipSourceProbe: options.skipSourceProbe,
              activeGroupElement: options.activeGroupElement,
            }
          : {
              preferClipAncestor: options?.preferClipAncestor,
              skipSourceProbe: options?.skipSourceProbe,
            },
      );
    },
    [activeCompPath, buildDomSelectionFromTarget, captionEditMode, previewIframeRef],
  );

  const resolveAllDomSelectionsFromPreviewPoint = useCallback(
    // fallow-ignore-next-line complexity
    async (clientX: number, clientY: number): Promise<DomEditSelection[]> => {
      const iframe = previewIframeRef.current;
      if (!iframe || captionEditMode) return [];
      try {
        if (iframe.contentDocument) reapplyPositionEditsAfterSeek(iframe.contentDocument);
      } catch {
        /* cross-origin guard */
      }
      const targets = getAllPreviewTargetsFromPointer(iframe, clientX, clientY, activeCompPath);
      const results: DomEditSelection[] = [];
      for (const target of targets) {
        const sel = await buildDomSelectionFromTarget(target, { skipSourceProbe: true });
        if (sel) results.push(sel);
      }
      return results;
    },
    [activeCompPath, buildDomSelectionFromTarget, captionEditMode, previewIframeRef],
  );

  const updateDomEditHoverSelection = useCallback((selection: DomEditSelection | null) => {
    if (domEditSelectionsTargetSame(domEditHoverSelectionRef.current, selection)) return;
    domEditHoverSelectionRef.current = selection;
    setDomEditHoverSelection(selection);
  }, []);

  const buildDomSelectionForTimelineElement = useCallback(
    // fallow-ignore-next-line complexity
    async (element: TimelineElement): Promise<DomEditSelection | null> => {
      const iframe = previewIframeRef.current;
      let doc: Document | null = null;
      try {
        doc = iframe?.contentDocument ?? null;
      } catch {
        return null;
      }
      if (!doc) return null;

      const held = holdScenesOf(iframe, element);
      if (held) await held;
      reapplyPositionEditsAfterSeek(doc);

      const targetElement = findElementForTimelineElement(doc, element, {
        activeCompositionPath: activeCompPath,
        compIdToSrc,
        isMasterView,
      });
      return targetElement
        ? buildDomSelectionFromTarget(targetElement, {
            preferClipAncestor: false,
          })
        : null;
    },
    [activeCompPath, buildDomSelectionFromTarget, compIdToSrc, isMasterView, previewIframeRef],
  );

  const handleTimelineElementSelect = useCallback(
    async (element: TimelineElement | null) => {
      const seq = ++timelineSelectSeqRef.current;
      if (!element) {
        void holdScenesOf(previewIframeRef.current, null);
        applyDomSelection(null, { revealPanel: false });
        return;
      }

      const selection = await buildDomSelectionForTimelineElement(element);
      // A newer selection superseded this one while we were resolving — drop the stale result.
      if (seq !== timelineSelectSeqRef.current) return;
      if (selection) {
        applyDomSelection(selection);
        return;
      }
      // No canvas node (audio, a comp that is not the active one). Leaving the
      // previous selection pointed the canvas at something the user did not pick,
      // and Delete acts on the canvas first — so it removed that, not the clip.
      applyDomSelection(null, { revealPanel: false, announce: false });
    },
    [applyDomSelection, buildDomSelectionForTimelineElement, previewIframeRef],
  );

  // Forward handle to the group refresher defined below: the single-selection
  // refresher falls back to it when the primary is gone, and a ref keeps that from
  // forcing either callback to be declared in the other's dependency list.
  const refreshDomEditGroupSelectionsFromPreviewRef = useRef<
    (selections: DomEditSelection[]) => Promise<void>
  >(async () => {});

  const refreshDomEditSelectionFromPreview = useCallback(
    // fallow-ignore-next-line complexity
    async (selection: DomEditSelection, iframe = previewIframeRef.current) => {
      const stillSelected = () =>
        domEditSelectionsTargetSame(domEditSelectionRef.current, selection);
      if (!stillSelected()) return;
      let doc: Document | null = null;
      try {
        doc = iframe?.contentDocument ?? null;
      } catch {
        return;
      }
      if (!doc) return;

      const element = findElementForSelection(doc, selection, activeCompPath);
      if (!element) {
        // Losing the primary is not losing the selection. When a group is live,
        // re-resolve it and keep whoever still exists rather than wiping the lot.
        const group = domEditGroupSelectionsRef.current;
        logSelect("refresh-lost", {
          target: selection.selector ?? selection.id ?? null,
          group: group.length,
        });
        if (group.length > 1) {
          await refreshDomEditGroupSelectionsFromPreviewRef.current(group);
          return;
        }
        applyDomSelection(null, { revealPanel: false });
        return;
      }

      const nextSelection = await buildDomSelectionFromTarget(element, { previous: selection });
      if (nextSelection && stillSelected()) {
        applyDomSelection(nextSelection, {
          revealPanel: false,
          preserveGroup: true,
        });
      }
    },
    [activeCompPath, applyDomSelection, buildDomSelectionFromTarget, previewIframeRef],
  );

  const refreshDomEditGroupSelectionsFromPreview = useCallback(
    // fallow-ignore-next-line complexity
    async (selections: DomEditSelection[]) => {
      const iframe = previewIframeRef.current;
      let doc: Document | null = null;
      try {
        doc = iframe?.contentDocument ?? null;
      } catch {
        return;
      }
      if (!doc) return;

      const nextGroup: DomEditSelection[] = [];
      for (const selection of selections) {
        const element = findElementForSelection(doc, selection, activeCompPath);
        if (!element) continue;
        const nextSelection = await buildDomSelectionFromTarget(element, { previous: selection });
        if (nextSelection) nextGroup.push(nextSelection);
      }
      if (nextGroup.length === 0) return;

      const currentSelection = domEditSelectionRef.current;
      const nextSelection =
        nextGroup.find((selection) => domEditSelectionsTargetSame(selection, currentSelection)) ??
        nextGroup[0] ??
        null;

      domEditSelectionRef.current = nextSelection;
      domEditGroupSelectionsRef.current = nextGroup;
      setDomEditSelection(nextSelection);
      setDomEditGroupSelections(nextGroup);

      announceTimelineSelection(nextGroup, nextSelection);
    },
    [activeCompPath, announceTimelineSelection, buildDomSelectionFromTarget, previewIframeRef],
  );

  // ── Effects ──

  useEffect(() => {
    refreshDomEditGroupSelectionsFromPreviewRef.current = refreshDomEditGroupSelectionsFromPreview;
  }, [refreshDomEditGroupSelectionsFromPreview]);

  // Clear hover unconditionally on composition/project/preview change
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    updateDomEditHoverSelection(null);
  }, [activeCompPath, projectId, previewIframe, refreshKey, updateDomEditHoverSelection]);

  // Clear committed selection only when the composition identity actually changes.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const previous = compositionIdentityRef.current;
    if (previous.activeCompPath === activeCompPath && previous.projectId === projectId) return;
    compositionIdentityRef.current = { activeCompPath, projectId };
    activeGroupElementRef.current = null;
    setActiveGroupElementState(null);
    applyDomSelection(null, { revealPanel: false });
  }, [activeCompPath, projectId, applyDomSelection]);

  // Clear hover conditionally (caption mode, matches selection, disconnected element)
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!domEditHoverSelection) return;
    const shouldClear =
      captionEditMode ||
      domEditSelectionsTargetSame(domEditHoverSelection, domEditSelection) ||
      domEditSelectionInGroup(domEditGroupSelections, domEditHoverSelection) ||
      !domEditHoverSelection.element.isConnected;
    if (shouldClear) updateDomEditHoverSelection(null);
  }, [
    captionEditMode,
    domEditHoverSelection,
    domEditSelection,
    domEditGroupSelections,
    updateDomEditHoverSelection,
  ]);

  // Clear selection on caption mode change
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!captionEditMode) return;
    applyDomSelection(null, { revealPanel: false });
  }, [applyDomSelection, captionEditMode]);

  // Dev-only headless-QA shortcut (window.__studioTest.selectByDomId). No-op in prod.
  useStudioTestHooks({ previewIframeRef, buildDomSelectionFromTarget, applyDomSelection });

  const applyMarqueeSelection = useCallback(
    // fallow-ignore-next-line complexity
    (selections: DomEditSelection[], additive: boolean) => {
      logSelect("marquee", { hits: selections.length, additive });
      const current = domEditSelectionRef.current;
      const currentGroup = domEditGroupSelectionsRef.current;
      if (selections.length === 0) {
        const count = seedDomEditGroupWithSelection(currentGroup, current).length;
        if (!additive) applyDomSelection(null, { revealPanel: false });
        return { changed: !additive && count > 0, count: additive ? count : 0 };
      }
      let nextGroup: DomEditSelection[];
      if (additive) {
        nextGroup = seedDomEditGroupWithSelection(currentGroup, current);
        for (const s of selections) {
          if (!domEditSelectionInGroup(nextGroup, s)) nextGroup = [...nextGroup, s];
        }
      } else {
        // Dedupe by target: select-as-unit collapses marquee'd members to one group.
        nextGroup = [];
        for (const s of selections) {
          if (!domEditSelectionInGroup(nextGroup, s)) nextGroup.push(s);
        }
      }
      const nextSelection = additive && current ? current : selections[0];
      const previous = seedDomEditGroupWithSelection(currentGroup, current);
      const changed =
        previous.length !== nextGroup.length ||
        nextGroup.some((selection) => !domEditSelectionInGroup(previous, selection)) ||
        !domEditSelectionsTargetSame(current, nextSelection);
      domEditSelectionRef.current = nextSelection;
      domEditGroupSelectionsRef.current = nextGroup;
      setDomEditSelection(nextSelection);
      setDomEditGroupSelections(nextGroup);
      announceTimelineSelection(nextGroup, nextSelection, true);
      return { changed, count: nextGroup.length };
    },
    [applyDomSelection, announceTimelineSelection],
  );

  return {
    // State
    domEditSelection,
    domEditGroupSelections,
    domEditHoverSelection,
    activeGroupElement,
    // Refs
    domEditSelectionRef,
    domEditGroupSelectionsRef,
    domEditHoverSelectionRef,
    activeGroupElementRef,
    // State setters
    setDomEditSelection,
    setDomEditGroupSelections,
    setActiveGroupElement,
    // Callbacks
    applyDomSelection,
    clearDomSelection,
    buildDomSelectionFromTarget,
    resolveDomSelectionFromPreviewPoint,
    resolveAllDomSelectionsFromPreviewPoint,
    updateDomEditHoverSelection,
    buildDomSelectionForTimelineElement,
    handleTimelineElementSelect,
    refreshDomEditSelectionFromPreview,
    applyMarqueeSelection,
  };
}
