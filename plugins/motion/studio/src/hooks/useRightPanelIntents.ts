import { useCallback, useEffect, useRef } from "react";
import { useDockLayoutStore, visiblePanelInZone } from "../components/dock/dockLayoutStore";

/** Opens the Slideshow panel when the file becomes a slideshow, closes it when it stops being one.
 * A user's own close, and a restored layout's placement, stick. */
export function useSlideshowDockPanel(isSlideshowComposition: boolean) {
  const controller = useDockLayoutStore((state) => state.controller);
  const wasSlideshow = useRef(false);
  useEffect(() => {
    if (!controller) return;
    const inDock = useDockLayoutStore.getState().openPanels.has("slideshow");
    if (isSlideshowComposition && !inDock) controller.open("slideshow");
    if (!isSlideshowComposition && wasSlideshow.current && inDock) controller.close("slideshow");
    wasSlideshow.current = isSlideshowComposition;
  }, [isSlideshowComposition, controller]);
}

/** Block params replace the Design body until Design stops showing; picking another tab dismisses them elsewhere. */
export function useBlockParamsDismissal({
  hasBlockParams,
  onDismiss,
}: {
  hasBlockParams: boolean;
  onDismiss: () => void;
}) {
  const designVisible = useDockLayoutStore((state) => state.visiblePanels.has("design"));
  useEffect(() => {
    if (hasBlockParams && !designVisible) onDismiss();
  }, [hasBlockParams, designVisible, onDismiss]);
}

/** Wraps a tab setter so any tab other than block-params first dismisses the block-params view. */
export function useDismissingTabSetter<Tab extends string>(
  setTab: (tab: Tab) => void,
  dismissBlockParams: () => void,
) {
  return useCallback(
    (tab: Tab) => {
      if (tab !== "block-params") dismissBlockParams();
      setTab(tab);
    },
    [setTab, dismissBlockParams],
  );
}

/** Caption edit mode owns the Design panel: whenever the right column shows something else, bring Design back. */
export function useCaptionDesignFocus(captionEditMode: boolean) {
  const designVisible = useDockLayoutStore((state) => state.visiblePanels.has("design"));
  const rightShown = useDockLayoutStore(
    (state) => visiblePanelInZone("right", state.lastActive, state.visiblePanels) !== null,
  );
  useEffect(() => {
    if (captionEditMode && rightShown && !designVisible) {
      useDockLayoutStore.getState().activatePanel("design");
    }
  }, [captionEditMode, rightShown, designVisible]);
}

/** The right-column panel the user last focused, whether or not the column is currently showing. */
export function useRightPanelIntent() {
  return useDockLayoutStore((state) =>
    visiblePanelInZone("right", state.lastActive, state.openPanels),
  );
}
