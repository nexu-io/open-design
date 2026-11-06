import { HF_AUDIO_GROUP_TAG } from "@hyperframes/core/audio-groups";
import { useDomEditActionsContextOptional } from "../../contexts/DomEditContext";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { hiddenToggleVerb } from "../../player/components/hiddenToggle";
import type { DomEditSelection } from "./domEditingTypes";

/** The panel header's hide toggle, or undefined when this selection has no writer for it. */
export function usePanelHiddenToggle({
  element,
  hidden,
  selectedElementId,
  onToggleElementHidden,
}: {
  element: Pick<DomEditSelection, "id" | "tagName">;
  hidden: boolean;
  selectedElementId: string | null | undefined;
  onToggleElementHidden?: (elementKey: string, hidden: boolean) => void | Promise<void>;
}): (() => void) | undefined {
  const { onSetAudioGroupAttributeQuiet } = useTimelineEditContextOptional();
  const domEditActions = useDomEditActionsContextOptional();
  // A bus has no timeline row, so it mutes through the group's own writer.
  const audioGroupId = element.tagName.toLowerCase() === HF_AUDIO_GROUP_TAG ? element.id : null;
  const write = audioGroupId
    ? onSetAudioGroupAttributeQuiet &&
      (() =>
        onSetAudioGroupAttributeQuiet(
          audioGroupId,
          "data-hidden",
          hidden ? null : "",
          `${hiddenToggleVerb(true, hidden)} element`,
        ))
    : selectedElementId && onToggleElementHidden
      ? () => onToggleElementHidden(selectedElementId, !hidden)
      : undefined;
  // The label reads the selection snapshot, so re-read whatever is selected once the write lands.
  return (
    write &&
    (() =>
      void Promise.resolve(write()).then(() => {
        const selection = domEditActions?.domEditSelectionRef.current;
        if (selection) void domEditActions?.refreshDomEditSelectionFromPreview(selection);
      }))
  );
}
