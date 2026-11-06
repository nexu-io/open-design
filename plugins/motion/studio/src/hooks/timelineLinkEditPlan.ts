import type { TimelineElement } from "../player";
import type { TimelineLinkEdit } from "../player/components/timelineCallbacks";
import {
  buildPatchTarget,
  syncCompositionDurationToContent,
  type PatchTarget,
} from "./timelineEditingHelpers";
import { sharesLinkGroup } from "../player/components/audioClipLink";
import { toAuthoredStart } from "../player/store/timelineElement";
import { formatTimelineMediaOffset } from "../player/components/timelineEditing";
import { applyPatchByTarget } from "../utils/sourcePatcher";
import {
  detachAudioInSource,
  linkInSource,
  mergeAudioInSource,
  pickDetachedAudioTrack,
  setLinkInSource,
  sharesSourceFile,
} from "../components/editor/mediaLinkEdits";

export interface LinkEditPlan {
  label: string;
  anchor: TimelineElement;
  transform: (source: string) => string | null;
}

const keyOf = (el: TimelineElement) => el.key ?? el.id;

function targetsOf(elements: readonly TimelineElement[]): PatchTarget[] | null {
  const targets = elements.map(buildPatchTarget);
  return targets.every((target): target is PatchTarget => target !== null) ? targets : null;
}

/**
 * The clips to strip `data-link` from when `removed` leave their groups: the
 * removed clips themselves, plus any partner left alone in its group.
 */
export function clipsToUnlink(
  removed: readonly TimelineElement[],
  elements: readonly TimelineElement[],
): TimelineElement[] {
  const removedKeys = new Set(removed.map(keyOf));
  const orphans = new Map<string, TimelineElement>();
  for (const leaving of removed) {
    const survivors = elements.filter(
      (el) => sharesLinkGroup(el, leaving) && !removedKeys.has(keyOf(el)),
    );
    if (survivors.length === 1 && survivors[0]) orphans.set(keyOf(survivors[0]), survivors[0]);
  }
  return [...removed.filter((el) => el.link), ...orphans.values()];
}

type SyncEdit = Extract<TimelineLinkEdit, { kind: "move-into-sync" | "slip-into-sync" }>;

function planSyncEdit(edit: SyncEdit): LinkEditPlan | null {
  const target = buildPatchTarget(edit.element);
  if (!target) return null;
  if (edit.kind === "move-into-sync") {
    const value = formatTimelineMediaOffset(toAuthoredStart(edit.element, edit.start));
    return {
      label: "Move into Sync",
      anchor: edit.element,
      transform: (s) => {
        const moved = applyPatchByTarget(s, target, {
          type: "attribute",
          property: "start",
          value,
        });
        return syncCompositionDurationToContent(moved);
      },
    };
  }
  const property = edit.element.playbackStartAttr ?? "media-start";
  const value = formatTimelineMediaOffset(edit.mediaStart);
  return {
    label: "Slip into Sync",
    anchor: edit.element,
    transform: (s) => applyPatchByTarget(s, target, { type: "attribute", property, value }),
  };
}

export function planLinkEdit(
  edit: TimelineLinkEdit,
  elements: readonly TimelineElement[],
): LinkEditPlan | null {
  switch (edit.kind) {
    case "unlink": {
      const members = clipsToUnlink(edit.elements, elements);
      const targets = targetsOf(members);
      const anchor = members[0];
      if (!targets || !anchor) return null;
      return { label: "Unlink clips", anchor, transform: (s) => setLinkInSource(s, targets, null) };
    }
    case "link": {
      const targets = targetsOf(edit.elements);
      const anchor = edit.elements[0];
      if (!targets || !anchor) return null;
      return {
        label: "Link clips",
        anchor,
        transform: (s) => linkInSource(s, targets, { syncOrigin: sharesSourceFile(edit.elements) }),
      };
    }
    case "detach": {
      const target = buildPatchTarget(edit.element);
      if (!target) return null;
      const track = pickDetachedAudioTrack(elements, edit.element);
      return {
        label: "Detach audio",
        anchor: edit.element,
        transform: (s) =>
          detachAudioInSource(s, { target, videoId: edit.element.domId ?? null, track })?.html ??
          null,
      };
    }
    case "move-into-sync":
    case "slip-into-sync":
      return planSyncEdit(edit);
    case "merge": {
      const videoTarget = buildPatchTarget(edit.video);
      const audioTarget = buildPatchTarget(edit.audio);
      if (!videoTarget || !audioTarget) return null;
      return {
        label: "Merge audio back into video",
        anchor: edit.video,
        transform: (s) => mergeAudioInSource(s, { videoTarget, audioTarget }),
      };
    }
  }
}
