import { buildProjectApiPath } from "../utils/projectRouting";
import { useCallback } from "react";
import { studioApiFetch } from "../utils/studioApiFetch";

/**
 * Loads a composition file's content for the source editor when a composition
 * is selected. Content stays null until the fetch resolves — the source editor
 * must not mount on a null-content file, or its autosave would overwrite the
 * real file with an empty document. Load failures surface as an error toast
 * instead of silently rendering an empty (and autosave-armed) editor.
 */
export function useCompositionContentLoader({
  projectId,
  setEditingFile,
  setActiveCompPath,
  showToast,
}: {
  projectId: string | null;
  setEditingFile: (file: { path: string; content: string | null }) => void;
  setActiveCompPath: (path: string | null) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
}) {
  return useCallback(
    (comp: string) => {
      if (!projectId) return;
      setActiveCompPath(comp.endsWith(".html") ? comp : null);
      setEditingFile({ path: comp, content: null });
      studioApiFetch(buildProjectApiPath(projectId, `/files/${encodeURIComponent(comp)}`))
        .then(async (r) => {
          if (!r.ok) throw new Error(`Failed to load ${comp} (${r.status})`);
          return r.json();
        })
        .then((data: { content?: string }) => {
          if (typeof data.content !== "string") throw new Error(`No content returned for ${comp}`);
          setEditingFile({ path: comp, content: data.content });
        })
        .catch((err) => {
          showToast(err instanceof Error ? err.message : `Failed to load ${comp}`, "error");
        });
    },
    [projectId, setEditingFile, setActiveCompPath, showToast],
  );
}
