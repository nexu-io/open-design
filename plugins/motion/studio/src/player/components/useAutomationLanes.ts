/**
 * Writes for the timeline's audio automation lanes.
 *
 * Kept out of TimelineLanes so that component does not grow another concern.
 * Reading lives in `automationLaneData`, shared with the row layout, which needs
 * the lane count to reserve height.
 *
 * Edits save through the timeline's gated save, as an effect preset does, so a
 * locked clip or group refuses them. Only the selected element is editable: an
 * unselected one still draws its envelopes read only, which is also what stops a
 * stray drag from editing the wrong track.
 */

import { useCallback, useMemo } from "react";
import {
  HF_AUDIO_AUTOMATION_ATTR,
  type HfAutomation,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import {
  useDomEditActionsContextOptional,
  useDomEditSelectionContextOptional,
} from "../../contexts/DomEditContext";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import type { TimelineEditOutcome } from "../../hooks/timelineEditPermission";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import type { AutomationSelection } from "../store/automationSelectionSlice";
import { automationAttrValue } from "../../components/editor/propertyPanelAutomation";
import { elementAutomation, elementFxChain } from "./automationLaneData";
import { isGroupAutomationElement } from "./groupAutomationElement";
import type { TimelineEditCallbacks } from "./timelineCallbacks";

export interface AutomationLaneBinding {
  automation: HfAutomation;
  /** One entry per lane, in draw order — each gets its own row. */
  lanes: HfAutomationLane[];
  chain: HfAudioFxChain | null;
  /** Continuous write while dragging; does not persist. `ended`: a cancel put the start back. */
  onPreview(next: HfAutomation, ended?: boolean): void;
  /** Gesture-end write; this is the one that persists and lands in undo. */
  onCommit(next: HfAutomation): Promise<TimelineEditOutcome | void>;
  /**
   * Select this clip, which is what makes its lanes editable. A lane calls this
   * instead of writing when it is read-only — pressing the lane is the only
   * route in, since lanes sit below the clip bar where the timeline's own
   * selection handler never sees them.
   */
  onSelect(): void;
  readOnly: boolean;
  /** This element's active selection box, or null if none / it belongs to a
   *  different element. */
  selection: AutomationSelection | null;
  /** Live write while dragging a selection box on the given lane; does not
   *  persist — the selection is ephemeral store state, not part of the
   *  composition. */
  onRangeSelect(target: string, t0: number, t1: number, v0: number, v1: number): void;
  onRangeClear(): void;
}

export interface UseAutomationLanesResult {
  bind(element: TimelineElement, isSelected: boolean): AutomationLaneBinding;
}

const AUTOMATION_LABEL = "Edit automation";

/** A group's lanes save on the group, gated by its members; a clip's on the clip. */
function automationWriters(edit: TimelineEditCallbacks, element: TimelineElement) {
  if (isGroupAutomationElement(element)) {
    const { onSetAudioGroupAttributeLive: live, onSetAudioGroupAttributeQuiet: save } = edit;
    if (!live || !save) return null;
    return {
      live: (value: string | null) => live(element.id, HF_AUDIO_AUTOMATION_ATTR, value),
      revert: () => edit.onRevertAudioGroupAttributeLive?.(element.id, HF_AUDIO_AUTOMATION_ATTR),
      save: (value: string | null) =>
        save(element.id, HF_AUDIO_AUTOMATION_ATTR, value, AUTOMATION_LABEL),
    };
  }
  const { onSetElementAttributeLive: live, onSetElementAttributeQuiet: save } = edit;
  if (!live || !save) return null;
  return {
    live: (value: string | null) => live(element, HF_AUDIO_AUTOMATION_ATTR, value),
    revert: () => edit.onRevertElementAttributeLive?.(element, HF_AUDIO_AUTOMATION_ATTR),
    save: (value: string | null) =>
      save(element, HF_AUDIO_AUTOMATION_ATTR, value, AUTOMATION_LABEL),
  };
}

export function useAutomationLanes(): UseAutomationLanesResult {
  // Optional: the player also runs outside Studio, where there is no edit
  // session. There the lanes render read-only, which is the right fallback.
  const domEdit = useDomEditActionsContextOptional();
  const domEditSelectionRef = useDomEditSelectionContextOptional()?.domEditSelectionRef;
  const timelineEdit = useTimelineEditContextOptional();
  const automationSelection = usePlayerStore((s) => s.automationSelection);
  const setAutomationSelection = usePlayerStore((s) => s.setAutomationSelection);
  const clearAutomationSelection = usePlayerStore((s) => s.clearAutomationSelection);

  const bind = useCallback(
    (element: TimelineElement, isSelected: boolean): AutomationLaneBinding => {
      const chain = elementFxChain(element);
      const automation = elementAutomation(element);
      const elementKey = getTimelineElementIdentity(element);

      const writers = domEdit && isSelected ? automationWriters(timelineEdit, element) : null;

      return {
        automation,
        lanes: automation.lanes,
        chain,
        onPreview: (next, ended) => {
          writers?.live(automationAttrValue(next) || null);
          if (ended) writers?.revert();
        },
        onCommit: async (next) => {
          if (!writers) return;
          const outcome = await writers.save(automationAttrValue(next) || null);
          // The FX panel reads the selection snapshot; a stale one makes its next
          // edit start from the automation this one replaced.
          const selection = domEditSelectionRef?.current;
          if (selection) void domEdit?.refreshDomEditSelectionFromPreview(selection);
          return outcome;
        },
        // Deliberately not awaited before an edit: the lane goes live when the
        // selection lands and it re-renders as selected.
        onSelect: () => void domEdit?.handleTimelineElementSelect(element),
        readOnly: !writers,
        selection: automationSelection?.elementKey === elementKey ? automationSelection : null,
        // Not gated on `isSelected`, unlike the writes above. A selection is
        // ephemeral store state, and the drag that draws one on a read-only lane is
        // the same press that selects the clip — refusing it here meant the first
        // drag on a lane silently did nothing and the author had to drag again.
        // Nothing can be written through it while the lane is read-only: every
        // consumer resolves the binding again and finds `readOnly`.
        onRangeSelect: (target, t0, t1, v0, v1) => {
          if (!domEdit) return;
          setAutomationSelection({ elementKey, target, t0, t1, v0, v1 });
        },
        onRangeClear: () => clearAutomationSelection(),
      };
    },
    [
      domEdit,
      domEditSelectionRef,
      timelineEdit,
      automationSelection,
      setAutomationSelection,
      clearAutomationSelection,
    ],
  );

  return useMemo(() => ({ bind }), [bind]);
}
