import { create } from "zustand";

/**
 * Ephemeral composition-variable overrides for the preview iframe.
 *
 * Values here are NEVER persisted to the composition — they ride the preview
 * URL as `?variables=<json>` (see the studio-server preview routes), which the
 * server injects as `window.__hfVariables` exactly like render-time injection,
 * so what the user previews is what `hyperframes render --variables` produces.
 * `null` means "preview with declared defaults".
 */
interface PreviewVariablesState {
  values: Record<string, unknown> | null;
  setValues: (values: Record<string, unknown> | null) => void;
}

export const usePreviewVariablesStore = create<PreviewVariablesState>((set) => ({
  values: null,
  setValues: (values) => set({ values: values && Object.keys(values).length > 0 ? values : null }),
}));

/**
 * Apply the current preview-variable overrides to a preview URL (both the
 * Player's initial mount and refreshPlayer's soft reload route through this,
 * so a hard remount can't silently drop the active overrides).
 */
export function applyPreviewVariablesToUrl(url: URL): void {
  const values = usePreviewVariablesStore.getState().values;
  if (values) {
    url.searchParams.set("variables", JSON.stringify(values));
  } else {
    url.searchParams.delete("variables");
  }
}
