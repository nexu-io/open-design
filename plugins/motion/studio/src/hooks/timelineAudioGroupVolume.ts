import { useCallback } from "react";
import {
  failedTimelineSave,
  projectForTimelineSave,
  type TimelineEditOutcome,
} from "./timelineEditPermission";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import { usePlayerStore } from "../player";
import type { TimelineElementPatch } from "../player/store/timelineElement";
import { invalidateGroupInfoCache } from "../player/lib/timelineGroupInfo";
import {
  buildPatchTarget,
  persistElementAttribute,
  readSavedAttribute,
  type RecordEditInput,
} from "./timelineEditingHelpers";
import { useLiveLanes, type LiveLaneRestore, type LiveLaneSource } from "./liveLanes";
import type {
  MutableRef,
  UseTimelineElementVisibilityEditingInput,
} from "./timelineTrackVisibility";

/** Direct DOM write on the group element for the gesture in progress — no
 *  file write, no history entry (mirrors FxParamRow's live/commit split). */
function patchLiveGroupAttribute(
  iframe: HTMLIFrameElement | null,
  groupId: string,
  attr: string,
  value: string | null,
): void {
  const target = iframe?.contentDocument?.getElementById(groupId);
  if (!target) return;
  if (value === null) target.removeAttribute(attr);
  else target.setAttribute(attr, value);
  invalidateGroupInfoCache(iframe?.contentDocument);
}

function audioGroupAttributeLiveKey(groupId: string, attr: string): string {
  return `${groupId}\0${attr}`;
}

/**
 * `data-volume` exactly as core reads it (`readAudioGroupVolume`): an absent or
 * empty attribute is UNITY, not zero.
 *
 * `Number(null)` and `Number("")` are both 0 and both finite, so the obvious
 * `Number.isFinite(Number(value))` mirrored "silent" into the store for a
 * removed attribute while the DOM, the preview bus and the render all read 1 —
 * exactly the parse divergence this mirror exists to eliminate.
 */
function mirroredGroupVolume(value: string | null): number {
  if (!value) return 1;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

/** Which store field each writable group attribute mirrors into. */
const GROUP_ATTR_TO_MIRROR: Record<
  string,
  (value: string | null, groupId: string) => TimelineElementPatch
> = {
  "data-hidden": (value) => ({ audioGroupHidden: value !== null }),
  "data-volume": (value) => ({ audioGroupVolume: mirroredGroupVolume(value) }),
  "data-label": (value, groupId) => ({ audioGroupLabel: value ?? groupId }),
  [HF_AUDIO_FX_ATTR]: (value) => ({ audioGroupFxChain: value ?? undefined }),
  [HF_AUDIO_AUTOMATION_ATTR]: (value) => ({ audioGroupAutomation: value ?? undefined }),
};

/**
 * Mirror a group attribute onto the store copy every member carries.
 *
 * The timeline derives a group's label / volume / mute / chain from these
 * mirrored `audioGroup*` fields on its MEMBERS, not from the group element —
 * and a group write only ever touched the file and the live preview DOM.
 * Nothing re-parsed, so the header went on reading the old value: the observed
 * symptom was a muted group whose button stayed "Mute group", re-writing
 * `data-hidden` on every click and never offering to unmute.
 *
 * Invalidating the parse cache is necessary but not sufficient — it only
 * ensures the NEXT parse is honest, and a live attribute patch does not cause
 * one. Same reason `commitDataAttribute` carries `syncStoredAutomationFromPreview`.
 */
function syncStoredGroupAttribute(groupId: string, attr: string, value: string | null): void {
  const toPatch = GROUP_ATTR_TO_MIRROR[attr];
  if (!toPatch) return;
  const patch = toPatch(value, groupId);
  // ONE pass and one notification, rather than `updateElement` per member.
  // That helper maps the whole `elements` array per call, so a 3-member group on
  // a 500-clip composition was 1500 object spreads and 3 store notifications per
  // drag frame — at ~60/s, with every `elements`-keyed memo downstream
  // recomputing each time.
  // BOTH stores, because a group declared inside a sub-composition has no flat
  // member to mirror onto: `childGroupState` keeps those members out of
  // `elements` entirely, so their `audioGroup*` fields come from the
  // `DomClipChild` record instead. Mirroring only `elements` made this whole
  // function a no-op for such a group — the header kept the pre-write chain, its
  // FX button showed the old count, and `laneCount` stayed 0 so the lane
  // disclosure never appeared for automation that now existed. Verbatim the
  // symptom this docblock claims to have fixed, fixed only for flat members.
  //
  // `setDomClipChildren` has one other writer, inside `processTimelineMessage`,
  // which a live attribute patch does not trigger.
  usePlayerStore.setState((state) => {
    const next: Partial<typeof state> = {
      elements: state.elements.map((el) => (el.audioGroup === groupId ? { ...el, ...patch } : el)),
    };
    if (state.domClipChildren.some((child) => child.audioGroup === groupId)) {
      next.domClipChildren = state.domClipChildren.map((child) =>
        child.audioGroup === groupId ? { ...child, ...patch } : child,
      );
    }
    return next;
  });
}

/**
 * The composition FILE that contains a group element, walking up through
 * composition ancestors until one names a file.
 *
 * `getTimelineElementSourceFile` stops at the nearest `[data-composition-id]`,
 * which for an inlined sub-composition is its own ROOT element — that carries
 * the composition id but not the file. The file is on the HOST one level above
 * it. Measured on a live preview:
 *
 *   hf-audio-group#voiceover        (no composition attrs)
 *   section#voices-root             data-composition-id="voices"          <- stops here
 *   div#voices-host                 data-composition-file="…/voices.html" <- file is here
 *   body                            data-composition-id="<root>"
 *
 * Returns undefined for a group in the root composition (body names an id but
 * no file), which is exactly when the caller should fall back to activeCompPath.
 */
export function resolveGroupSourceFile(groupEl: Element | null): string | undefined {
  let node: Element | null = groupEl?.parentElement ?? null;
  while (node) {
    const owner: Element | null = node.closest("[data-composition-id]");
    if (!owner) return undefined;
    const file =
      owner.getAttribute("data-composition-file") ?? owner.getAttribute("data-composition-src");
    if (file) return file;
    node = owner.parentElement;
  }
  return undefined;
}

interface SetAudioGroupAttributeInput {
  projectId: string;
  activeCompPath: string | null;
  groupId: string;
  attr: string;
  value: string | null;
  label: string;
  previewIframe: HTMLIFrameElement | null;
  patchLive: (value: string | null) => void;
  onFileRead: (value: string | null) => void;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  pendingTimelineEditPathRef: MutableRef<Set<string>>;
}

/**
 * Persist one attribute on the group element itself — e.g. the bus strip's
 * volume slider writing `data-volume` on release. One undo entry; mirrors
 * `createAudioGroupAndAssignMembers`'s save shape but for a single element
 * and attribute rather than a member-assignment sweep.
 */
function groupSaveTarget(
  previewIframe: HTMLIFrameElement | null,
  groupId: string,
  activeCompPath: string | null,
) {
  const groupEl = previewIframe?.contentDocument?.getElementById(groupId) ?? null;
  return {
    targetPath: resolveGroupSourceFile(groupEl) || activeCompPath || "index.html",
    patchTarget: buildPatchTarget({ domId: groupId }),
  };
}

function groupLiveSource(
  previewIframe: HTMLIFrameElement | null,
  groupId: string,
  activeCompPath: string | null,
  attr: string,
): LiveLaneSource {
  const { targetPath, patchTarget } = groupSaveTarget(previewIframe, groupId, activeCompPath);
  return { path: targetPath, target: patchTarget, attr };
}

async function setAudioGroupAttribute({
  projectId,
  activeCompPath,
  groupId,
  attr,
  value,
  label,
  previewIframe,
  patchLive,
  onFileRead,
  writeProjectFile,
  recordEdit,
  pendingTimelineEditPathRef,
}: SetAudioGroupAttributeInput): Promise<string[] | null> {
  // The file that actually CONTAINS the group element, not just the active
  // composition. A hand-authored sub-composition can declare both the members
  // and their `<hf-audio-group>`, and until sub-comp children inherited
  // `audioGroup*` no group row existed for that case so nothing could reach
  // here. Now the row appears, and routing its writes at `activeCompPath`
  // means `readTagSnippetByTarget` finds nothing and every mute, fader move and
  // FX preset throws "Unable to patch element in index.html". Every sibling
  // timeline writer already routes `element.sourceFile || activeCompPath`.
  const { targetPath, patchTarget } = groupSaveTarget(previewIframe, groupId, activeCompPath);
  if (!patchTarget) return null;

  return persistElementAttribute({
    projectId,
    targetPath,
    patchTarget,
    attr,
    value,
    label,
    writeProjectFile,
    recordEdit,
    pendingTimelineEditPathRef,
    patchLive,
    onFileRead,
  });
}

/**
 * B7's bus strip: live-write the group's own attribute (`data-volume`, so
 * far — B5's mute will reuse this too) while dragging, persist one undo entry
 * on release. Unlike `useAudioGroupCarveAssignment`, this never touches
 * member elements — the group id doubles as its own DOM id, so no selection
 * or expanded-rows resolution is needed to find it.
 */
export function useSetAudioGroupAttribute({
  projectIdRef,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
}: UseTimelineElementVisibilityEditingInput): {
  setLive: (groupId: string, attr: string, value: string | null) => void;
  setQuiet: (
    groupId: string,
    attr: string,
    value: string | null,
    label: string,
  ) => Promise<TimelineEditOutcome>;
  revertLive: (groupId: string, attr: string) => void;
  restoreLive: (restore: LiveLaneRestore) => void;
} {
  const liveLanes = useLiveLanes(projectIdRef, activeCompPath);
  const setLive = useCallback(
    (groupId: string, attr: string, value: string | null) => {
      const key = audioGroupAttributeLiveKey(groupId, attr);
      const target = previewIframeRef.current?.contentDocument?.getElementById(groupId);
      liveLanes.preview(
        key,
        () => target?.getAttribute(attr) ?? null,
        groupLiveSource(previewIframeRef.current, groupId, activeCompPath, attr),
      );
      patchLiveGroupAttribute(previewIframeRef.current, groupId, attr, value);
      // Live too, not just on commit: a fader drag is `setLive` per frame and
      // `setQuiet` once on release, so without this the strip's own readout
      // fights the drag.
      syncStoredGroupAttribute(groupId, attr, value);
    },
    [liveLanes, previewIframeRef, activeCompPath],
  );
  const laneApply = useCallback(
    (groupId: string, attr: string) => ({
      preview: (value: string | null) =>
        patchLiveGroupAttribute(previewIframeRef.current, groupId, attr, value),
      store: (value: string | null) => syncStoredGroupAttribute(groupId, attr, value),
    }),
    [previewIframeRef],
  );
  const claimLive = useCallback(
    (groupId: string, attr: string, source: LiveLaneSource) =>
      liveLanes.claim(audioGroupAttributeLiveKey(groupId, attr), laneApply(groupId, attr), source),
    [liveLanes, laneApply],
  );
  const revertLive = useCallback(
    (groupId: string, attr: string) =>
      liveLanes.revert(audioGroupAttributeLiveKey(groupId, attr), laneApply(groupId, attr)),
    [liveLanes, laneApply],
  );
  const setQuiet = useCallback(
    async (
      groupId: string,
      attr: string,
      value: string | null,
      label: string,
    ): Promise<TimelineEditOutcome> => {
      const project = projectIdRef.current;
      const pid = projectForTimelineSave(isRecordingRef?.current, project, showToast);
      // Settles on what the file holds, so overlapping saves that fail cannot leave
      // the preview or the store on a value that never landed.
      const source = groupLiveSource(previewIframeRef.current, groupId, activeCompPath, attr);
      const live = claimLive(groupId, attr, source);
      const unsaved = async (outcome: TimelineEditOutcome): Promise<TimelineEditOutcome> => {
        live.settle(
          await readSavedAttribute(project, source.path, source.target, attr, writeProjectFile),
        );
        return outcome;
      };
      if (typeof pid !== "string") return unsaved(pid);
      try {
        const written = await setAudioGroupAttribute({
          projectId: pid,
          activeCompPath,
          groupId,
          attr,
          value,
          label,
          previewIframe: previewIframeRef.current,
          patchLive: live.preview,
          onFileRead: live.read,
          writeProjectFile,
          recordEdit,
          pendingTimelineEditPathRef,
        });
        if (!written)
          return unsaved(failedTimelineSave("This group has no id to save it by", showToast));
        live.settle(value);
        return { status: "saved" };
      } catch (error) {
        console.error("[Timeline] Failed to set group attribute", error);
        const message = error instanceof Error ? error.message : "Failed to update group";
        return unsaved(failedTimelineSave(message, showToast));
      }
    },
    [
      claimLive,
      activeCompPath,
      previewIframeRef,
      writeProjectFile,
      recordEdit,
      pendingTimelineEditPathRef,
      isRecordingRef,
      showToast,
      projectIdRef,
    ],
  );
  return { setLive, setQuiet, revertLive, restoreLive: liveLanes.restore };
}
