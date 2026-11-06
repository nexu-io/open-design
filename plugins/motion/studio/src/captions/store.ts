import { create } from "zustand";
import {
  CaptionAnimation,
  CaptionAnimationSet,
  CaptionContainerStyle,
  CaptionModel,
  CaptionStyle,
} from "./types";

let nextSplitId = 0;

const HISTORY_CAP = 50;
/** Coalesce rapid same-target edits (typing, nudging) into one history entry. */
const HISTORY_COALESCE_MS = 800;

interface CaptionState {
  isEditMode: boolean;
  /** User explicitly exited caption editing — suppresses auto re-activation. */
  dismissed: boolean;
  model: CaptionModel | null;
  selectedSegmentIds: Set<string>;
  selectedGroupId: string | null;
  sourceFilePath: string | null;
  /** Load/save failure surfaced to the user (null = healthy). */
  syncError: string | null;
  /** Registered by useCaptionSync so error banners can retry the save. */
  retrySave: (() => void) | null;

  // Undo/redo (in-memory model snapshots)
  past: CaptionModel[];
  future: CaptionModel[];
  undo: () => CaptionModel | null;
  redo: () => CaptionModel | null;

  // Basic
  setEditMode: (active: boolean) => void;
  setDismissed: (dismissed: boolean) => void;
  setModel: (model: CaptionModel | null) => void;
  setSourceFilePath: (path: string | null) => void;
  setSyncError: (error: string | null) => void;
  setRetrySave: (fn: (() => void) | null) => void;

  // Selection
  selectSegment: (id: string, additive?: boolean) => void;
  selectGroup: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Segment mutations
  updateSegmentStyle: (segmentId: string, style: Partial<CaptionStyle>) => void;
  updateSegmentText: (segmentId: string, text: string) => void;
  updateSegmentTiming: (segmentId: string, start: number, end: number) => void;

  // Group mutations
  updateGroupStyle: (groupId: string, style: Partial<CaptionStyle>) => void;
  updateGroupContainer: (groupId: string, container: Partial<CaptionContainerStyle>) => void;
  updateGroupAnimation: (
    groupId: string,
    phase: keyof CaptionAnimationSet,
    animation: Partial<CaptionAnimation>,
  ) => void;
  splitGroup: (groupId: string, atSegmentId: string) => void;
  mergeGroups: (groupId1: string, groupId2: string) => void;

  // Bulk
  updateSelectedStyle: (style: Partial<CaptionStyle>) => void;
  applyAnimationToAll: (animation: CaptionAnimationSet) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  isEditMode: false,
  dismissed: false,
  model: null,
  selectedSegmentIds: new Set<string>(),
  selectedGroupId: null,
  sourceFilePath: null,
  syncError: null,
  retrySave: null,
  past: [] as CaptionModel[],
  future: [] as CaptionModel[],
};

// Coalescing bookkeeping lives outside the store — it is not renderable state.
let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;

/**
 * Snapshot the current model onto the undo stack before a mutation.
 * `key` identifies the edit target so rapid repeats (typing a value, arrow-key
 * nudging) coalesce into a single entry instead of one per keystroke.
 */
function pushHistory(
  state: Pick<CaptionState, "model" | "past">,
  key: string,
): Partial<Pick<CaptionState, "past" | "future">> {
  if (!state.model) return {};
  const now = Date.now();
  if (lastHistoryKey === key && now - lastHistoryAt < HISTORY_COALESCE_MS) {
    lastHistoryAt = now;
    return { future: [] };
  }
  lastHistoryKey = key;
  lastHistoryAt = now;
  const past = [...state.past, state.model].slice(-HISTORY_CAP);
  return { past, future: [] };
}

export const useCaptionStore = create<CaptionState>((set, get) => ({
  ...initialState,

  // Basic
  setEditMode: (active) => set({ isEditMode: active }),
  setDismissed: (dismissed) => set({ dismissed }),
  setModel: (model) => set({ model }),
  setSourceFilePath: (path) => set({ sourceFilePath: path }),
  setSyncError: (error) => set({ syncError: error }),
  setRetrySave: (fn) => set({ retrySave: fn }),

  // Undo/redo
  undo: () => {
    const { model, past, future } = get();
    const prev = past[past.length - 1];
    if (!prev || !model) return null;
    lastHistoryKey = null;
    set({ model: prev, past: past.slice(0, -1), future: [...future, model] });
    return prev;
  },
  redo: () => {
    const { model, past, future } = get();
    const next = future[future.length - 1];
    if (!next || !model) return null;
    lastHistoryKey = null;
    set({ model: next, past: [...past, model].slice(-HISTORY_CAP), future: future.slice(0, -1) });
    return next;
  },

  // Selection
  selectSegment: (id, additive = false) =>
    set((state) => {
      if (additive) {
        const next = new Set(state.selectedSegmentIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return { selectedSegmentIds: next, selectedGroupId: null };
      }
      return { selectedSegmentIds: new Set([id]), selectedGroupId: null };
    }),

  selectGroup: (id) => {
    const group = get().model?.groups.get(id);
    if (!group) return;
    set({ selectedSegmentIds: new Set(group.segmentIds), selectedGroupId: id });
  },

  selectAll: () =>
    set((state) => {
      if (!state.model) return {};
      return {
        selectedSegmentIds: new Set(state.model.segments.keys()),
        selectedGroupId: null,
      };
    }),

  clearSelection: () => {
    const { selectedSegmentIds, selectedGroupId } = get();
    if (selectedSegmentIds.size === 0 && selectedGroupId === null) return;
    set({ selectedSegmentIds: new Set(), selectedGroupId: null });
  },

  // Segment mutations
  updateSegmentStyle: (segmentId, style) =>
    set((state) => {
      if (!state.model) return {};
      const segment = state.model.segments.get(segmentId);
      if (!segment) return {};
      const segments = new Map(state.model.segments);
      segments.set(segmentId, { ...segment, style: { ...segment.style, ...style } });
      return {
        ...pushHistory(state, `seg-style:${segmentId}`),
        model: { ...state.model, segments },
      };
    }),

  updateSegmentText: (segmentId, text) =>
    set((state) => {
      if (!state.model) return {};
      const segment = state.model.segments.get(segmentId);
      if (!segment) return {};
      const segments = new Map(state.model.segments);
      segments.set(segmentId, { ...segment, text });
      return {
        ...pushHistory(state, `seg-text:${segmentId}`),
        model: { ...state.model, segments },
      };
    }),

  updateSegmentTiming: (segmentId, start, end) =>
    set((state) => {
      if (!state.model) return {};
      const segment = state.model.segments.get(segmentId);
      if (!segment) return {};
      const segments = new Map(state.model.segments);
      segments.set(segmentId, { ...segment, start, end });
      return {
        ...pushHistory(state, `seg-timing:${segmentId}`),
        model: { ...state.model, segments },
      };
    }),

  // Group mutations
  updateGroupStyle: (groupId, style) =>
    set((state) => {
      if (!state.model) return {};
      const group = state.model.groups.get(groupId);
      if (!group) return {};
      const groups = new Map(state.model.groups);
      groups.set(groupId, { ...group, style: { ...group.style, ...style } });
      return {
        ...pushHistory(state, `group-style:${groupId}`),
        model: { ...state.model, groups },
      };
    }),

  updateGroupContainer: (groupId, container) =>
    set((state) => {
      if (!state.model) return {};
      const group = state.model.groups.get(groupId);
      if (!group) return {};
      const groups = new Map(state.model.groups);
      groups.set(groupId, {
        ...group,
        containerStyle: { ...group.containerStyle, ...container },
      });
      return {
        ...pushHistory(state, `group-container:${groupId}`),
        model: { ...state.model, groups },
      };
    }),

  updateGroupAnimation: (groupId, phase, animation) =>
    set((state) => {
      if (!state.model) return {};
      const group = state.model.groups.get(groupId);
      if (!group) return {};
      const groups = new Map(state.model.groups);
      const existingPhase = group.animation[phase];
      const mergedPhase =
        existingPhase !== null
          ? { ...existingPhase, ...animation }
          : (animation as CaptionAnimation);
      groups.set(groupId, {
        ...group,
        animation: { ...group.animation, [phase]: mergedPhase },
      });
      return {
        ...pushHistory(state, `group-anim:${groupId}:${phase}`),
        model: { ...state.model, groups },
      };
    }),

  splitGroup: (groupId, atSegmentId) =>
    set((state) => {
      if (!state.model) return {};
      const group = state.model.groups.get(groupId);
      if (!group) return {};

      const splitIndex = group.segmentIds.indexOf(atSegmentId);
      if (splitIndex <= 0) return {};

      const firstIds = group.segmentIds.slice(0, splitIndex);
      const secondIds = group.segmentIds.slice(splitIndex);

      const newGroupId = `group-split-${nextSplitId++}`;
      const groups = new Map(state.model.groups);
      groups.set(groupId, { ...group, segmentIds: firstIds });
      groups.set(newGroupId, { ...group, id: newGroupId, segmentIds: secondIds });

      const orderIndex = state.model.groupOrder.indexOf(groupId);
      const groupOrder = [...state.model.groupOrder];
      groupOrder.splice(orderIndex + 1, 0, newGroupId);

      // Update groupIndex for segments in the new second group
      const segments = new Map(state.model.segments);
      secondIds.forEach((segId, idx) => {
        const seg = segments.get(segId);
        if (seg) {
          segments.set(segId, { ...seg, groupIndex: idx });
        }
      });

      return {
        ...pushHistory(state, `split:${groupId}:${atSegmentId}:${nextSplitId}`),
        model: { ...state.model, groups, segments, groupOrder },
      };
    }),

  mergeGroups: (groupId1, groupId2) =>
    set((state) => {
      if (!state.model) return {};
      const group1 = state.model.groups.get(groupId1);
      const group2 = state.model.groups.get(groupId2);
      if (!group1 || !group2) return {};

      const mergedSegmentIds = [...group1.segmentIds, ...group2.segmentIds];

      const groups = new Map(state.model.groups);
      groups.set(groupId1, { ...group1, segmentIds: mergedSegmentIds });
      groups.delete(groupId2);

      const groupOrder = state.model.groupOrder.filter((id) => id !== groupId2);

      // Update groupIndex for segments from group2
      const segments = new Map(state.model.segments);
      group2.segmentIds.forEach((segId, idx) => {
        const seg = segments.get(segId);
        if (seg) {
          segments.set(segId, { ...seg, groupIndex: group1.segmentIds.length + idx });
        }
      });

      // Clear selection if it referenced group2
      const selectedGroupId = state.selectedGroupId === groupId2 ? null : state.selectedGroupId;

      return {
        ...pushHistory(state, `merge:${groupId1}:${groupId2}`),
        model: { ...state.model, groups, segments, groupOrder },
        selectedGroupId,
      };
    }),

  // Bulk
  updateSelectedStyle: (style) =>
    set((state) => {
      if (!state.model || state.selectedSegmentIds.size === 0) return {};
      const segments = new Map(state.model.segments);
      for (const segmentId of state.selectedSegmentIds) {
        const segment = segments.get(segmentId);
        if (segment) {
          segments.set(segmentId, { ...segment, style: { ...segment.style, ...style } });
        }
      }
      return {
        ...pushHistory(state, `sel-style:${[...state.selectedSegmentIds].join(",")}`),
        model: { ...state.model, segments },
      };
    }),

  applyAnimationToAll: (animation) =>
    set((state) => {
      if (!state.model) return {};
      const groups = new Map(state.model.groups);
      for (const [id, group] of groups) {
        groups.set(id, { ...group, animation });
      }
      return {
        ...pushHistory(state, "apply-anim-all"),
        model: { ...state.model, groups },
      };
    }),

  // Reset — keeps retrySave (registered once by useCaptionSync for the app's lifetime)
  reset: () => {
    lastHistoryKey = null;
    set((state) => ({
      ...initialState,
      retrySave: state.retrySave,
      selectedSegmentIds: new Set<string>(),
      past: [],
      future: [],
    }));
  },
}));
