import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  usePreviewCompositionRect,
  type PreviewCompositionRect,
} from "./usePreviewCompositionRect";
import { usePreviewGuidesStore } from "./previewGuidesStore";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";
import { useLivePreviewIframe } from "../../player/store/previewIframeStore";

export interface PreviewSnapPreferences {
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSpacing: number;
  snapToGrid: boolean;
}

interface PreviewOverlayContextValue {
  state: {
    snapPrefs: PreviewSnapPreferences;
    rulerVisible: boolean;
    safeMarginsVisible: boolean;
    iframeRef: RefObject<HTMLIFrameElement | null>;
    compositionRect: PreviewCompositionRect;
  };
  actions: {
    setSnapPrefs: (patch: Partial<PreviewSnapPreferences>) => void;
    toggleRulers: () => void;
    toggleSafeMargins: () => void;
  };
}

const PreviewOverlayContext = createContext<PreviewOverlayContextValue | null>(null);

function readSnapPrefs(): PreviewSnapPreferences {
  const prefs = readStudioUiPreferences();
  return {
    snapEnabled: prefs.snapEnabled ?? true,
    gridVisible: prefs.gridVisible ?? false,
    gridSpacing: prefs.gridSpacing ?? 50,
    snapToGrid: prefs.snapToGrid ?? false,
  };
}

export interface PreviewOverlayProviderProps {
  iframe?: HTMLIFrameElement | null;
  children: ReactNode;
}

export function PreviewOverlayProvider({ iframe, children }: PreviewOverlayProviderProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [snapPrefs, setSnapPrefs] = useState(readSnapPrefs);
  const rulerVisible = usePreviewGuidesStore((state) => state.rulerVisible);
  const safeMarginsVisible = usePreviewGuidesStore((state) => state.safeMarginsVisible);
  const liveIframe = useLivePreviewIframe();
  const resolvedIframe = iframe ?? liveIframe;
  const iframeRef = useRef<HTMLIFrameElement | null>(resolvedIframe);
  iframeRef.current = resolvedIframe;
  const compositionRect = usePreviewCompositionRect(overlayRef, resolvedIframe);

  const contextValue: PreviewOverlayContextValue = {
    state: { snapPrefs, rulerVisible, safeMarginsVisible, iframeRef, compositionRect },
    actions: {
      setSnapPrefs: (patch) => {
        writeStudioUiPreferences(patch);
        setSnapPrefs((current) => ({ ...current, ...patch }));
      },
      toggleRulers: () => usePreviewGuidesStore.getState().toggle("rulerVisible"),
      toggleSafeMargins: () => usePreviewGuidesStore.getState().toggle("safeMarginsVisible"),
    },
  };

  return (
    <PreviewOverlayContext.Provider value={contextValue}>
      <div ref={overlayRef} className="pointer-events-none absolute inset-0">
        {children}
      </div>
    </PreviewOverlayContext.Provider>
  );
}

export function usePreviewOverlayContext(): PreviewOverlayContextValue {
  const context = useContext(PreviewOverlayContext);
  if (!context)
    throw new Error("usePreviewOverlayContext must be used within PreviewOverlayProvider");
  return context;
}
