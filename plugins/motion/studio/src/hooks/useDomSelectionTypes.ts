import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { SelectElementOptions, TimelineElement } from "../player";
import type { RightPanelTab } from "../utils/studioHelpers";

export interface DomSelectionResult {
  changed: boolean;
  count: number;
}

export interface ApplyDomSelectionOptions {
  revealPanel?: boolean;
  additive?: boolean;
  preserveGroup?: boolean;
  // A clear that came FROM the timeline must not be echoed back, or picking a
  // clip with no canvas node would deselect the clip you just picked.
  announce?: boolean;
}

export interface ResolveDomSelectionOptions {
  preferClipAncestor?: boolean;
  skipSourceProbe?: boolean;
  activeGroupElement?: HTMLElement | null;
  /** Resolve this node itself instead of applying human group-capture behavior. */
  exactTarget?: boolean;
  previous?: DomEditSelection | null;
}

// Shared by every hook that needs the project/timeline/panel context a DOM
// edit session is built around — useDomEditSession has its own superset.
export interface DomEditTimelineParams {
  projectId: string | null;
  activeCompPath: string | null;
  compIdToSrc: Map<string, string>;
  captionEditMode: boolean;
  previewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
  timelineElements: TimelineElement[];
  getTimelineSelectionSet: () => ReadonlySet<string>;
  setSelectedTimelineElementId: (id: string | null, options?: SelectElementOptions) => void;
  /** Publishes a whole multi-selection to the timeline; the anchor is set separately. */
  setTimelineSelectionSet: (ids: Set<string>) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
}

export interface UseDomSelectionParams extends DomEditTimelineParams {
  isMasterView: boolean;
  previewIframe: HTMLIFrameElement | null;
  refreshKey: number;
  rightPanelTab: RightPanelTab;
}

export interface UseDomSelectionReturn {
  // State
  domEditSelection: DomEditSelection | null;
  domEditGroupSelections: DomEditSelection[];
  domEditHoverSelection: DomEditSelection | null;
  activeGroupElement: HTMLElement | null;
  // Refs
  domEditSelectionRef: MutableRefObject<DomEditSelection | null>;
  domEditGroupSelectionsRef: MutableRefObject<DomEditSelection[]>;
  domEditHoverSelectionRef: MutableRefObject<DomEditSelection | null>;
  activeGroupElementRef: MutableRefObject<HTMLElement | null>;
  // State setters (needed by useDomEditSession for agent-prompt reset flows)
  setDomEditSelection: Dispatch<SetStateAction<DomEditSelection | null>>;
  setDomEditGroupSelections: Dispatch<SetStateAction<DomEditSelection[]>>;
  setActiveGroupElement: (el: HTMLElement | null) => void;
  // Callbacks
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: ApplyDomSelectionOptions,
  ) => void;
  clearDomSelection: () => void;
  buildDomSelectionFromTarget: (
    target: HTMLElement,
    options?: ResolveDomSelectionOptions,
  ) => Promise<DomEditSelection | null>;
  resolveDomSelectionFromPreviewPoint: (
    clientX: number,
    clientY: number,
    options?: ResolveDomSelectionOptions,
  ) => Promise<DomEditSelection | null>;
  resolveAllDomSelectionsFromPreviewPoint: (
    clientX: number,
    clientY: number,
  ) => Promise<DomEditSelection[]>;
  updateDomEditHoverSelection: (selection: DomEditSelection | null) => void;
  buildDomSelectionForTimelineElement: (
    element: TimelineElement,
  ) => Promise<DomEditSelection | null>;
  handleTimelineElementSelect: (element: TimelineElement | null) => Promise<void>;
  refreshDomEditSelectionFromPreview: (
    selection: DomEditSelection,
    iframe?: HTMLIFrameElement | null,
  ) => Promise<void>;
  applyMarqueeSelection: (selections: DomEditSelection[], additive: boolean) => DomSelectionResult;
}
