import React from "react";
import { vi } from "vitest";

vi.mock("../contexts/StudioContext", () => ({
  useStudioPlaybackContext: () => ({
    captionEditMode: false,
    refreshKey: 0,
    refreshPreviewDocumentVersion: vi.fn(),
    timelineElements: [],
  }),
  useStudioShellContext: () => ({
    projectId: "project-1",
    activeCompPath: "index.html",
    setActiveCompPath: vi.fn(),
    handlePreviewIframeRef: vi.fn(),
    showToast: vi.fn(),
  }),
}));

vi.mock("../contexts/DomEditContext", () => ({
  useDomEditActionsContext: () => ({
    handleTimelineElementSelect: vi.fn(),
    buildDomSelectionForTimelineElement: vi.fn(),
    applyDomSelection: vi.fn(),
    applyMarqueeSelection: vi.fn(),
  }),
  useDomEditSelectionContext: () => ({
    domEditSelection: null,
    domEditGroupSelections: [],
  }),
}));

vi.mock("./nle/NLEContext", () => ({
  NLEProvider: ({ children }: { children: React.ReactNode }) => children,
  useNLEContext: () => ({
    compositionStack: [],
    updateCompositionStack: vi.fn(),
    containerRef: { current: null },
  }),
}));

vi.mock("./nle/useTimelineEditCallbacks", () => ({
  useTimelineEditCallbacks: () => ({}),
}));
vi.mock("./nle/TimelinePane", () => ({ TimelinePane: () => null }));
vi.mock("../captions/components/CaptionTimeline", () => ({ CaptionTimeline: () => null }));
