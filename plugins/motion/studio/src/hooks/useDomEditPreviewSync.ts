/**
 * Side effects for syncing the DOM edit selection with the preview iframe on
 * load/refresh, and for auto-revealing source in the Code tab.
 * Extracted from useDomEditSession to keep file sizes under the 600-line limit.
 */
import { useEffect, useRef } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import { reapplyPositionEditsAfterSeek } from "../components/editor/manualEdits";
import { useDockLayoutStore } from "../components/dock/dockLayoutStore";
import type { PatchTarget } from "../utils/sourcePatcher";
import { onPreviewContentReplaced } from "../player/sceneSwap";

interface UseDomEditPreviewSyncParams {
  previewIframe: HTMLIFrameElement | null;
  captionEditMode: boolean;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  domEditSelection: DomEditSelection | null;
  /** Re-resolves the selection against the given preview, unless it was deselected meanwhile. */
  refreshDomEditSelectionFromPreview: (
    selection: DomEditSelection,
    iframe: HTMLIFrameElement,
  ) => Promise<void>;
  refreshPreviewDocumentVersion: () => void;
  syncPreviewHotkeys: (iframe: HTMLIFrameElement | null) => void;
  applyStudioManualEditsToPreviewRef: React.MutableRefObject<
    (iframe: HTMLIFrameElement) => Promise<void>
  >;
  openSourceForSelection?: (sourceFile: string, target: PatchTarget) => void;
  gsapCacheVersion?: number;
}

export function useDomEditPreviewSync({
  previewIframe,
  captionEditMode,
  domEditSelectionRef,
  domEditSelection,
  refreshDomEditSelectionFromPreview,
  refreshPreviewDocumentVersion,
  syncPreviewHotkeys,
  applyStudioManualEditsToPreviewRef,
  openSourceForSelection,
  gsapCacheVersion,
}: UseDomEditPreviewSyncParams): void {
  // Sync selection from preview document on load / refresh
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!previewIframe) return;

    // fallow-ignore-next-line complexity
    const syncSelectionFromDocument = async () => {
      if (captionEditMode) return;
      const currentSelection = domEditSelectionRef.current;
      if (!currentSelection) return;
      let doc: Document | null = null;
      try {
        doc = previewIframe.contentDocument;
      } catch {
        return;
      }
      if (!doc) return;

      reapplyPositionEditsAfterSeek(doc);
      await refreshDomEditSelectionFromPreview(currentSelection, previewIframe);
    };

    syncPreviewHotkeys(previewIframe);
    void applyStudioManualEditsToPreviewRef.current(previewIframe);
    void syncSelectionFromDocument();
    refreshPreviewDocumentVersion();

    const handleLoad = () => {
      syncPreviewHotkeys(previewIframe);
      void applyStudioManualEditsToPreviewRef.current(previewIframe);
      void syncSelectionFromDocument();
      refreshPreviewDocumentVersion();
    };

    return onPreviewContentReplaced(previewIframe, handleLoad);
  }, [
    captionEditMode,
    domEditSelectionRef,
    previewIframe,
    refreshDomEditSelectionFromPreview,
    refreshPreviewDocumentVersion,
    syncPreviewHotkeys,
    applyStudioManualEditsToPreviewRef,
    gsapCacheVersion,
  ]);

  // Auto-reveal source when an element is selected while the Code tab is active.
  // Use a ref for the callback so the effect only fires on selection changes,
  // not when openSourceForSelection is recreated due to editingFile content updates.
  const openSourceRef = useRef(openSourceForSelection);
  openSourceRef.current = openSourceForSelection;
  useEffect(
    // fallow-ignore-next-line complexity
    () => {
      if (!domEditSelection || !openSourceRef.current) return;
      if (!domEditSelection.sourceFile) return;
      if (!useDockLayoutStore.getState().visiblePanels.has("code")) return;
      openSourceRef.current(domEditSelection.sourceFile, {
        id: domEditSelection.id,
        selector: domEditSelection.selector,
        selectorIndex: domEditSelection.selectorIndex,
      });
    },
    [domEditSelection],
  );
}
