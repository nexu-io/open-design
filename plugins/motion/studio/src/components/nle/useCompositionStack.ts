import { buildProjectApiPath } from "../../utils/projectRouting";
// Composition drill-down stack management for NLEContext/EditorShell
import { useState, useCallback, useRef, useEffect } from "react";
import { liveTime, usePlayerStore } from "../../player/store/playerStore";
import type { CompositionLevel } from "./CompositionBreadcrumb";
import { encodePreviewPath } from "../../player/components/thumbnailUtils";
import { normalizeTimelineCompositionSource } from "../editor/domEditingDom";

interface UseCompositionStackOptions {
  projectId: string;
  activeCompositionPath?: string | null;
  onCompositionChange?: (compositionPath: string | null) => void;
}

interface UseCompositionStackResult {
  compositionStack: CompositionLevel[];
  updateCompositionStack: React.Dispatch<React.SetStateAction<CompositionLevel[]>>;
  handleNavigateComposition: (index: number) => void;
  handleDrillDown: (element: { id: string; compositionSrc?: string }) => void;
  masterSeekRef: React.MutableRefObject<number>;
  compIdToSrc: Map<string, string>;
  setCompIdToSrc: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

export function useCompositionStack({
  projectId,
  activeCompositionPath,
  onCompositionChange,
}: UseCompositionStackOptions): UseCompositionStackResult {
  const [compositionStack, setCompositionStack] = useState<CompositionLevel[]>([
    {
      id: "master",
      label: "Master",
      previewUrl: buildProjectApiPath(projectId, `/preview`),
    },
  ]);

  const onCompositionChangeRef = useRef(onCompositionChange);
  onCompositionChangeRef.current = onCompositionChange;

  const masterSeekRef = useRef(0);
  const masterSeekProjectRef = useRef<string | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const stackRef = useRef(compositionStack);

  const updateCompositionStack: typeof setCompositionStack = useCallback((action) => {
    const prev = stackRef.current;
    const next = typeof action === "function" ? action(prev) : action;
    stackRef.current = next;
    const player = usePlayerStore.getState();
    if (prev.length === 1 && next.length > 1) {
      masterSeekRef.current = player.isPlaying ? liveTime.latest() : player.currentTime;
      masterSeekProjectRef.current = projectIdRef.current;
    } else if (next.length === 1 && prev.length > 1) {
      if (masterSeekProjectRef.current === projectIdRef.current) {
        player.setCurrentTime(masterSeekRef.current);
      }
    }
    setCompositionStack(next);
    const id = next[next.length - 1]?.id;
    queueMicrotask(() => onCompositionChangeRef.current?.(id === "master" ? null : id));
  }, []);

  const [compIdToSrc, setCompIdToSrc] = useState<Map<string, string>>(new Map());

  const compIdToSrcRef = useRef(compIdToSrc);
  compIdToSrcRef.current = compIdToSrc;

  const handleNavigateComposition = useCallback(
    (index: number) => {
      usePlayerStore.getState().setElements([]);
      updateCompositionStack((prev) => prev.slice(0, index + 1));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleDrillDown = useCallback(
    (element: { id: string; compositionSrc?: string }) => {
      if (!element.compositionSrc) return;

      const src = compIdToSrcRef.current.get(element.id) ?? element.compositionSrc;
      const normalized = normalizeTimelineCompositionSource(src) ?? src;
      const resolvedPath = normalized.replace(/^(\.\/|\/)+/, "");

      usePlayerStore.getState().setElements([]);

      updateCompositionStack((prev) => {
        const currentId = prev[prev.length - 1].id;
        if (currentId === resolvedPath && prev.length > 1) {
          return prev.slice(0, -1);
        }
        const label =
          resolvedPath
            .split("/")
            .pop()
            ?.replace(/\.html$/, "") || resolvedPath;
        const previewUrl = buildProjectApiPath(
          projectId,
          `/preview/comp/${encodePreviewPath(resolvedPath)}`,
        );
        return [...prev, { id: resolvedPath, label, previewUrl }];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  // Navigate to a composition when activeCompositionPath changes.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const master: CompositionLevel = {
      id: "master",
      label: "Master",
      previewUrl: buildProjectApiPath(projectId, `/preview`),
    };
    if (activeCompositionPath === "index.html") {
      usePlayerStore.getState().setElements([]);
      updateCompositionStack([master]);
    } else if (activeCompositionPath) {
      // Any composition file that isn't the root, wherever it lives. Gating
      // this on a `compositions/` prefix meant a project laying its comps out
      // anywhere else (`parts/part-1.html`, generated multi-part builds) hit
      // no branch at all: the stack kept the master mounted while the Comps
      // panel highlighted the row, so the canvas and timeline stayed on
      // index.html and edits landed in the root file.
      const label = activeCompositionPath.replace(/^compositions\//, "").replace(/\.html$/, "");
      const previewUrl = buildProjectApiPath(
        projectId,
        `/preview/comp/${encodePreviewPath(activeCompositionPath)}`,
      );
      usePlayerStore.getState().setElements([]);
      updateCompositionStack((prev) => {
        if (prev[prev.length - 1]?.id === activeCompositionPath) return prev;
        return [master, { id: activeCompositionPath, label, previewUrl }];
      });
    } else {
      usePlayerStore.getState().setElements([]);
      updateCompositionStack([master]);
    }
  }, [activeCompositionPath, projectId, updateCompositionStack]);

  return {
    compositionStack,
    updateCompositionStack,
    handleNavigateComposition,
    handleDrillDown,
    masterSeekRef,
    compIdToSrc,
    setCompIdToSrc,
  };
}
