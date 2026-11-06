import { useMemo, type MutableRefObject } from "react";
import { SLIDESHOW_ISLAND_TYPE, slideshowIslandRegex } from "@hyperframes/core/slideshow";
import type { SceneInfo } from "../components/panels/SlideshowPanel";
import type { IframeWindow } from "../player/lib/playbackTypes";

/**
 * Derives whether the currently-edited composition is a slideshow (carries
 * the slideshow JSON island — the same definitive marker the CLI's `present`
 * command requires; it refuses to run without one) and the live scene list
 * for the Slideshow panel. Extracted from StudioRightPanels to keep that file
 * under the 600-LOC gate.
 */
export function useSlideshowTabState(params: {
  editingFileContent: string | null | undefined;
  previewIframeRef: MutableRefObject<HTMLIFrameElement | null>;
  refreshKey: number;
  slideshowVisible: boolean;
}): { isSlideshowComposition: boolean; slideshowScenes: SceneInfo[] } {
  const { editingFileContent, previewIframeRef, refreshKey, slideshowVisible } = params;

  // Presence-only (not full manifest validation): a malformed island should
  // still surface the Slideshow tab so the user can see/fix it, rather than
  // making the whole panel disappear. The plain substring check short-circuits
  // the regex scan on every non-slideshow file (the common case) without
  // paying for a full-content RegExp pass.
  const isSlideshowComposition = useMemo(() => {
    if (!editingFileContent || !editingFileContent.includes(SLIDESHOW_ISLAND_TYPE)) return false;
    return slideshowIslandRegex("i").test(editingFileContent);
  }, [editingFileContent]);

  // Derive scene list from the live clip manifest in the preview iframe.
  const slideshowScenes = useMemo<SceneInfo[]>(() => {
    try {
      const win = previewIframeRef.current?.contentWindow as IframeWindow | null;
      return (win?.__clipManifest?.scenes ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        start: s.start,
        duration: s.duration,
      }));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIframeRef, slideshowVisible, refreshKey]);

  return { isSlideshowComposition, slideshowScenes };
}
