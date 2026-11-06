import { create } from "zustand";
import { useMountEffect } from "../../hooks/useMountEffect";

interface PreviewIframeState {
  iframe: HTMLIFrameElement | null;
  setIframe: (iframe: HTMLIFrameElement | null) => void;
}

/** The one owner of "the live preview iframe element"; a promoted reload replaces it. */
export const usePreviewIframeStore = create<PreviewIframeState>((set) => ({
  iframe: null,
  // Return the same state reference on a no-op set so zustand skips the
  // notify (Object.is check in setState) instead of merging a new object
  // every time a caller re-pushes the current value.
  setIframe: (iframe) => set((state) => (Object.is(state.iframe, iframe) ? state : { iframe })),
}));

/** Subscribe an effect to the live iframe by listing the result in its dependencies. */
export const useLivePreviewIframe = () => usePreviewIframeStore((s) => s.iframe);

/** The owner's hook: reads the live iframe and clears it on unmount so a remount starts from null. */
export function useOwnPreviewIframe() {
  useMountEffect(() => () => usePreviewIframeStore.getState().setIframe(null));
  return useLivePreviewIframe();
}
