import { buildProjectApiPath } from "../../utils/projectRouting";
import { useCallback, useRef } from "react";
import { useCaptionStore } from "../store";
import { useMountEffect } from "../../hooks/useMountEffect";
import { trackEvent } from "../../telemetry/client";
import type { CaptionStyle } from "../types";
import { studioWriteHeaders } from "../../utils/studioFileVersion";
import { studioApiFetch } from "../../utils/studioApiFetch";

interface CaptionOverrideEntry {
  wordId?: string;
  wordIndex: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  activeColor?: string;
  dimColor?: string;
  opacity?: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
}

function buildOverrides(model: {
  groupOrder: string[];
  groups: Map<string, { segmentIds: string[] }>;
  segments: Map<string, { wordId?: string; style: Partial<CaptionStyle> }>;
}): CaptionOverrideEntry[] {
  const entries: CaptionOverrideEntry[] = [];
  let globalWordIndex = 0;

  for (const groupId of model.groupOrder) {
    const group = model.groups.get(groupId);
    if (!group) continue;
    for (const segId of group.segmentIds) {
      const seg = model.segments.get(segId);
      if (seg && Object.keys(seg.style).length > 0) {
        const entry: CaptionOverrideEntry = { wordIndex: globalWordIndex };
        if (seg.wordId) entry.wordId = seg.wordId;
        const s = seg.style;
        if (s.x !== undefined) entry.x = s.x;
        if (s.y !== undefined) entry.y = s.y;
        if (s.scaleX !== undefined) entry.scale = s.scaleX;
        if (s.rotation !== undefined) entry.rotation = s.rotation;
        if (s.activeColor !== undefined) entry.activeColor = s.activeColor;
        if (s.dimColor !== undefined) entry.dimColor = s.dimColor;
        if (s.opacity !== undefined) entry.opacity = s.opacity;
        if (s.fontSize !== undefined) entry.fontSize = s.fontSize;
        if (s.fontWeight !== undefined) entry.fontWeight = s.fontWeight as number;
        if (s.fontFamily !== undefined) entry.fontFamily = s.fontFamily;
        entries.push(entry);
      }
      globalWordIndex++;
    }
  }

  return entries;
}

/**
 * Auto-saves caption overrides to caption-overrides.json on every model change.
 * Also provides loadOverrides for reading existing overrides on edit mode entry.
 */
export function useCaptionSync(projectId: string | null) {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flag to suppress auto-save during loadOverrides
  const suppressSaveRef = useRef(false);

  // True while an edit is debounced or a PUT is in flight — guards tab close.
  const pendingRef = useRef(false);
  // Bumped on every new edit: a PUT's success may only clear the pending flag
  // when no newer edit re-armed the debounce while it was in flight.
  const editSeqRef = useRef(0);

  const save = useCallback(() => {
    const state = useCaptionStore.getState();
    // Note: deliberately no isEditMode guard — exiting caption mode (or any
    // path that fires the flush) must still write the last edits; the model
    // survives exit, and after a store reset it is null anyway.
    if (!state.model || !state.sourceFilePath) {
      pendingRef.current = false;
      return;
    }
    const pid = projectIdRef.current;
    if (!pid) {
      pendingRef.current = false;
      return;
    }

    const seqAtSave = editSeqRef.current;
    const overrides = buildOverrides(state.model);

    studioApiFetch(
      buildProjectApiPath(pid, `/files/${encodeURIComponent("caption-overrides.json")}`),
      {
        method: "PUT",
        headers: { "Content-Type": "text/plain", ...studioWriteHeaders() },
        body: JSON.stringify(overrides, null, 2),
      },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // A newer edit may have re-armed the debounce while this PUT was in
        // flight — its beforeunload/unmount flush still needs pending=true.
        if (editSeqRef.current === seqAtSave) pendingRef.current = false;
        const s = useCaptionStore.getState();
        if (s.syncError) s.setSyncError(null);
      })
      .catch((error: unknown) => {
        // Caption auto-save is a data-loss path: surface it to the user, not
        // just telemetry. pendingRef stays true so beforeunload still warns.
        trackEvent("studio_caption_autosave_failed", { error: String(error) });
        useCaptionStore.getState().setSyncError("Caption changes couldn't be saved");
      });
  }, []);

  // Auto-save on model changes with 800ms debounce
  useMountEffect(() => {
    let prevModel = useCaptionStore.getState().model;

    const unsub = useCaptionStore.subscribe((state) => {
      if (!state.isEditMode || state.model === prevModel || !state.model) return;
      prevModel = state.model;

      // Skip save when loadOverrides just updated the model
      if (suppressSaveRef.current) {
        suppressSaveRef.current = false;
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current = true;
      editSeqRef.current++;
      debounceRef.current = setTimeout(save, 800);
    });

    // Warn before the tab closes while an edit is unsaved.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingRef.current) return;
      // Flush best-effort, then let the browser show its confirm.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        save();
      }
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Let the caption error banner retry the save directly.
    useCaptionStore.getState().setRetrySave(save);

    return () => {
      unsub();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Flush instead of discarding — clearTimeout alone drops the final edits.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        if (pendingRef.current) save();
      }
      useCaptionStore.getState().setRetrySave(null);
    };
  });

  const loadOverrides = useCallback(async () => {
    const state = useCaptionStore.getState();
    if (!state.model || !state.sourceFilePath) return;
    const pid = projectIdRef.current;
    if (!pid) return;

    let data: { content?: string };
    try {
      const res = await studioApiFetch(
        buildProjectApiPath(pid, `/files/${encodeURIComponent("caption-overrides.json")}`),
      );
      if (!res.ok) return; // no overrides file yet — normal
      data = await res.json();
    } catch {
      return; // network failure fetching an optional file — nothing to restore
    }
    if (!data.content) return;

    try {
      const overrides: CaptionOverrideEntry[] = JSON.parse(data.content);
      if (!Array.isArray(overrides)) throw new Error("not an array");

      const model = state.model;
      const allSegIds: string[] = [];
      const segIdByWordId = new Map<string, string>();
      for (const groupId of model.groupOrder) {
        const group = model.groups.get(groupId);
        if (!group) continue;
        for (const segId of group.segmentIds) {
          allSegIds.push(segId);
          const seg = model.segments.get(segId);
          if (seg?.wordId) segIdByWordId.set(seg.wordId, segId);
        }
      }

      const newSegments = new Map(model.segments);
      for (const override of overrides) {
        const segId =
          (override.wordId ? segIdByWordId.get(override.wordId) : undefined) ??
          allSegIds[override.wordIndex];
        if (!segId) continue;
        const seg = newSegments.get(segId);
        if (!seg) continue;

        const style: Partial<CaptionStyle> = { ...seg.style };
        if (override.x !== undefined) style.x = override.x;
        if (override.y !== undefined) style.y = override.y;
        if (override.scale !== undefined) {
          style.scaleX = override.scale;
          style.scaleY = override.scale;
        }
        if (override.rotation !== undefined) style.rotation = override.rotation;
        if (override.activeColor !== undefined) style.activeColor = override.activeColor;
        if (override.dimColor !== undefined) style.dimColor = override.dimColor;
        if (override.opacity !== undefined) style.opacity = override.opacity;
        if (override.fontSize !== undefined) style.fontSize = override.fontSize;
        if (override.fontWeight !== undefined) style.fontWeight = override.fontWeight;
        if (override.fontFamily !== undefined) style.fontFamily = override.fontFamily;

        newSegments.set(segId, { ...seg, style });
      }

      suppressSaveRef.current = true;
      useCaptionStore.getState().setModel({ ...model, segments: newSegments });
    } catch {
      // File exists but is unreadable — previous edits would silently not load.
      useCaptionStore
        .getState()
        .setSyncError("caption-overrides.json is corrupt, so earlier caption edits didn't load");
    }
  }, []);

  return { save, loadOverrides };
}
