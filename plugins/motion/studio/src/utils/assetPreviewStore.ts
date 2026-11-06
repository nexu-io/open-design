/**
 * Tiny Zustand slice that carries the "asset preview overlay" state.
 *
 * When a user clicks an asset card that has NOT yet been added to the
 * timeline the overlay fires up: a dark scrim + centered media element
 * (img / video / audio) + filename label rendered inside PreviewPane.
 *
 * State lives here so AssetsTab (sidebar) and PreviewPane (preview column)
 * can communicate without prop-drilling through the multi-layer EditorShell
 * tree. The store is project-scoped: NLEProvider (NLEContext.tsx) clears it
 * whenever `projectId` changes, so a preview opened in one project can't
 * bleed into another (the overlay itself stays mounted across project
 * switches — EditorShell isn't keyed by projectId).
 */
import { create } from "zustand";

interface AssetPreviewState {
  /** Project-relative asset path currently being previewed, or null. */
  previewAsset: string | null;
  /** projectId for which the preview was opened (used to build the serve URL). */
  previewProjectId: string | null;
  /** Open a media preview for the given asset. */
  setPreviewAsset: (asset: string, projectId: string) => void;
  /** Close the preview overlay. */
  clearPreviewAsset: () => void;
}

export const useAssetPreviewStore = create<AssetPreviewState>((set) => ({
  previewAsset: null,
  previewProjectId: null,
  setPreviewAsset: (asset, projectId) => set({ previewAsset: asset, previewProjectId: projectId }),
  clearPreviewAsset: () => set({ previewAsset: null, previewProjectId: null }),
}));
