import { useI18n } from "../../i18n/I18n";
import type { TimelineElement } from "../store/timelineElement";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { usePlayerStore } from "../store/playerStore";
import { useLivePreviewIframe } from "../store/previewIframeStore";
import { clipHasSound, throwUnlessSaved, TimelineSaveError } from "./clipMenuNormalize";
import { openAudioGainDialog } from "./audioGainDialogStore";
import { offersDuck, readBedCarve, setDuckUnderVoice, type DuckOutcome } from "./clipMenuDuck";

const ITEM_CLASS =
  "w-full flex items-center justify-between px-3 py-1.5 text-xs text-left outline-hidden text-neutral-300 hover:bg-neutral-800 focus-visible:bg-neutral-800 cursor-pointer";

const DUCK_TOAST: Record<DuckOutcome, string> = {
  ducked: "Ducks under the voice. Normalize the voice first for the most even result.",
  off: "No longer ducks under the voice.",
  "no-voice": "No overlapping voice to duck under.",
  aborted: "Could not group the voices to duck under.",
};

/** Audio Gain… (opens the G dialog) or Duck under voice (toggle), placed separately in the sound group. */
export function ClipMenuAudioItems({
  part,
  element,
  onClose,
}: {
  part: "gain" | "duck";
  element: TimelineElement;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const shell = useStudioShellContextOptional();
  const { onSetElementAttributeQuiet, onGroupClips, onNotice } = useTimelineEditContextOptional();
  const liveIframe = useLivePreviewIframe();
  const sessionProjectId = usePlayerStore((s) => s.timelineProjectId);
  const projectId = shell?.projectId ?? sessionProjectId;
  const showToast = shell?.showToast ?? onNotice;
  const doc = (shell?.previewIframeRef.current ?? liveIframe)?.contentDocument ?? null;
  const bed = doc?.getElementById(element.domId ?? element.id) ?? null;
  const ducked = bed ? readBedCarve(bed)?.enabled === true : false;
  if (!clipHasSound(element) || !projectId || !showToast || !onSetElementAttributeQuiet) {
    return null;
  }

  const toggleDuck = async () => {
    onClose();
    if (!doc || !bed) return;
    const outcome = await setDuckUnderVoice(
      doc,
      bed,
      !ducked,
      async (attr, value) => {
        throwUnlessSaved(
          await onSetElementAttributeQuiet(element, attr, value, "Duck under voice"),
        );
      },
      onGroupClips ? (ids, groupId) => onGroupClips(ids, groupId, "Voice") : undefined,
    ).catch((error: unknown): DuckOutcome | TimelineSaveError =>
      error instanceof TimelineSaveError ? error : "aborted",
    );
    if (outcome instanceof TimelineSaveError) {
      showToast(outcome.message, "error");
      return;
    }
    showToast(DUCK_TOAST[outcome], outcome === "aborted" ? "error" : "info");
  };

  if (part === "gain") {
    return (
      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASS}
        onClick={() => {
          onClose();
          openAudioGainDialog(element);
        }}
      >
        <span>{t("Audio Gain…")}</span>
        <span className="text-neutral-500 text-[10px] ml-3">G</span>
      </button>
    );
  }
  if (!offersDuck(doc, bed)) return null;
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={ducked}
      className={ITEM_CLASS}
      onClick={() => void toggleDuck()}
    >
      <span>{t("Duck under voice")}</span>
      <span aria-hidden="true">{ducked ? "✓" : ""}</span>
    </button>
  );
}
