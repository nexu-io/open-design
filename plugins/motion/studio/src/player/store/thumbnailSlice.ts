import type { StoreApi } from "zustand";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";
import { defaultThumbnailMode, type ThumbnailMode } from "../lib/thumbnailPolicy";

/** Revision that moves every composition's thumbnails at once. */
const EVERY_COMPOSITION = "*";

/** Mounts may be written `./scene.html`; the server reports `scene.html`. */
function revisionKey(path: string): string {
  return (path.split(/[?#]/)[0] ?? "").replace(/\\/g, "/").replace(/^\.?\//, "");
}

export interface ThumbnailSlice {
  thumbnailMode: ThumbnailMode;
  /** Monotonic identity, per composition path, for persisted content shown by mounted thumbnails. */
  thumbnailRevisions: Readonly<Record<string, number>>;
  setThumbnailMode: (mode: ThumbnailMode) => void;
  /** `null` moves every composition, e.g. after a root or asset change. */
  bumpThumbnailRevisions: (compositions: readonly string[] | null) => void;
}

export function thumbnailRevisionOf(
  revisions: Readonly<Record<string, number>>,
  compositionPath: string,
): number {
  return (revisions[EVERY_COMPOSITION] ?? 0) + (revisions[revisionKey(compositionPath)] ?? 0);
}

export function createThumbnailSlice(set: StoreApi<ThumbnailSlice>["setState"]): ThumbnailSlice {
  return {
    thumbnailMode: defaultThumbnailMode(readStudioUiPreferences().thumbnailMode),
    thumbnailRevisions: {},
    setThumbnailMode: (mode) => {
      writeStudioUiPreferences({ thumbnailMode: mode });
      set({ thumbnailMode: mode });
    },
    bumpThumbnailRevisions: (compositions) =>
      set(({ thumbnailRevisions }) => {
        const next = { ...thumbnailRevisions };
        for (const path of compositions?.map(revisionKey) ?? [EVERY_COMPOSITION]) {
          next[path] = (next[path] ?? 0) + 1;
        }
        return { thumbnailRevisions: next };
      }),
  };
}
