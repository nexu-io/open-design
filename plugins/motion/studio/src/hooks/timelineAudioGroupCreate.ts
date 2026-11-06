/**
 * Creating an audio group: the member sweep, the group element, and the
 * carve's auto-group write-back.
 *
 * Split out of `timelineTrackVisibility.ts`, which owns the hidden/mute writes
 * these mirror and had reached the 600-line studio ceiling.
 */

import { useCallback } from "react";
import { usePlayerStore, type TimelineElement } from "../player";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import { HF_AUDIO_GROUP_ATTR, HF_AUDIO_GROUP_TAG } from "@hyperframes/core/audio-groups";
import { runtimeAudioId } from "../player/lib/timelineElementHelpers";
import { invalidateGroupInfoCache } from "../player/lib/timelineGroupInfo";
import { readTagSnippetByTarget, type PatchOperation } from "../utils/sourcePatcher";
import {
  findTimelineElementInIframe,
  operationChanges,
  patchTimelineChangesInSource,
  readFileContent,
  type RecordEditInput,
} from "./timelineEditingHelpers";
import {
  groupElementsByTargetPath,
  reseekPreviewRuntime,
  type MutableRef,
  type UseTimelineElementVisibilityEditingInput,
} from "./timelineTrackVisibility";

interface AudioGroupCarveInput extends UseTimelineElementVisibilityEditingInput {
  checkEditable?: (elements: readonly TimelineElement[]) => boolean;
}

function assertAudioGroupEditable(
  checkEditable: AudioGroupCarveInput["checkEditable"],
  elements: readonly TimelineElement[],
): void {
  if (checkEditable && !checkEditable(elements)) {
    throw new Error("Timeline edit blocked");
  }
}

/**
 * Assign (or restore) `data-audio-group` across a set of members.
 *
 * `restore` carries each member's PRIOR value so the unwind can put back a
 * membership that already existed, rather than removing the attribute outright.
 * `setElementsHidden`, which this mirrors, gets away with a plain `!hidden`
 * because hidden is boolean; group membership is an arbitrary id, and the carve
 * path does not check whether a clip is already grouped — so a failed save
 * could silently un-group clips that belonged to another group before it.
 */
function patchLiveAudioGroupState(
  iframe: HTMLIFrameElement | null,
  elements: readonly TimelineElement[],
  groupId: string | null,
  activeCompPath: string | null,
  restore?: ReadonlyMap<TimelineElement, string | null>,
): void {
  for (const element of elements) {
    const target = findTimelineElementInIframe(iframe, element, activeCompPath);
    if (!target) continue;
    const next = restore ? (restore.get(element) ?? null) : groupId;
    if (next) target.setAttribute(HF_AUDIO_GROUP_ATTR, next);
    else target.removeAttribute(HF_AUDIO_GROUP_ATTR);
  }
  invalidateGroupInfoCache(iframe?.contentDocument);
}

/** Each member's `data-audio-group` before this write, for the unwind. */
function captureAudioGroupState(
  iframe: HTMLIFrameElement | null,
  elements: readonly TimelineElement[],
  activeCompPath: string | null,
): Map<TimelineElement, string | null> {
  const prior = new Map<TimelineElement, string | null>();
  for (const element of elements) {
    const target = findTimelineElementInIframe(iframe, element, activeCompPath);
    prior.set(element, target?.getAttribute(HF_AUDIO_GROUP_ATTR) ?? null);
  }
  return prior;
}

/** Group ids are interpolated into markup and into a render-side filename, so
 *  they stay in the character set an HTML id and a path can both carry. */
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The group's own `<hf-audio-group>` element, appended before `</body>` when it
 * is not already in the file.
 *
 * Membership alone is enough for `resolveAudioGroups` to see the group, but
 * every group-level WRITE — mute, the bus fader's `data-volume`, an FX preset —
 * addresses the group by its DOM id (`setAudioGroupAttribute` →
 * `buildPatchTarget({ domId: groupId })`), so without an element of its own a
 * group is created and then cannot be edited at all.
 *
 * Written to the active composition file rather than beside the members, which
 * can live in a sub-composition: that is the file the group's later writes
 * target, and `resolveAudioGroups` reads the flattened document, so co-location
 * buys nothing.
 */
/** Attribute-safe, for a name the author typed. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function insertGroupElement(html: string, groupId: string, label?: string): string {
  const existing = readTagSnippetByTarget(html, { id: groupId });
  if (existing !== undefined) {
    // Only OUR tag counts as "already there". The id was minted against the
    // live preview document, which does not contain markup that is on disk but
    // not rendered (inside a `<template>`, or an unloaded sub-composition) — so
    // an unrelated element can already own it. Writing nothing there would aim
    // every later group write (`buildPatchTarget({ domId })`) at that element,
    // stamping data-volume / data-hidden / data-fx-chain onto it.
    if (new RegExp(`^<\\s*${HF_AUDIO_GROUP_TAG}\\b`, "i").test(existing)) return html;
    throw new Error(`Cannot create audio group: id ${groupId} is already used in this file`);
  }
  // The author's name for the group, from the naming dialog (groups doc §5).
  // Without it the timeline falls back to the minted id, which is the one thing
  // the dialog exists to stop an author having to read.
  const labelAttr = label ? ` data-label="${escapeAttr(label)}"` : "";
  const tag = `<${HF_AUDIO_GROUP_TAG} id="${groupId}"${labelAttr}></${HF_AUDIO_GROUP_TAG}>`;
  const closeBody = html.lastIndexOf("</body>");
  if (closeBody < 0) return `${html}\n${tag}\n`;
  return `${html.slice(0, closeBody)}  ${tag}\n  ${html.slice(closeBody)}`;
}

/** The same element in the live preview, so the group is editable before the
 *  next reload. Returns true when it created one (only then may the unwind
 *  remove it — a pre-existing group element is not ours to delete). */
function patchLiveGroupElement(
  iframe: HTMLIFrameElement | null,
  groupId: string,
  label?: string,
): boolean {
  const doc = iframe?.contentDocument;
  if (!doc?.body || doc.getElementById(groupId)) return false;
  const el = doc.createElement(HF_AUDIO_GROUP_TAG);
  el.id = groupId;
  if (label) el.setAttribute("data-label", label);
  doc.body.appendChild(el);
  invalidateGroupInfoCache(doc);
  return true;
}

interface CreateAudioGroupAndAssignMembersInput {
  projectId: string;
  activeCompPath: string | null;
  elements: readonly TimelineElement[];
  groupId: string;
  /** The author's name for it, from the naming dialog (groups doc §5). */
  groupLabel?: string;
  previewIframe: HTMLIFrameElement | null;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  pendingTimelineEditPathRef: MutableRef<Set<string>>;
}

/**
 * Group two or more voice clips: write `data-audio-group="<groupId>"` on
 * every one of them, atomically, one undo entry — the same multi-target shape
 * `setElementsHidden` uses for mute — plus the group's own `<hf-audio-group>`
 * element, which every later group-level write addresses by DOM id. No naming
 * dialog: the id is the default name, the way `resolveAudioGroups` reads it.
 */
// fallow-ignore-next-line complexity
export async function createAudioGroupAndAssignMembers({
  projectId,
  activeCompPath,
  elements,
  groupId,
  groupLabel,
  previewIframe,
  writeProjectFile,
  recordEdit,
  pendingTimelineEditPathRef,
}: CreateAudioGroupAndAssignMembersInput): Promise<string[]> {
  // Throws rather than returning empty: the carve's auto-group awaits this and
  // then persists `sources: [groupId]` on success, so a quiet no-op leaves the
  // carve aimed at a group that does not exist.
  if (elements.length < 2) {
    throw new Error(`Cannot group ${elements.length} clip(s): a group needs at least two`);
  }
  if (!GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(`Invalid audio group id ${JSON.stringify(groupId)}`);
  }

  const priorGroups = captureAudioGroupState(previewIframe, elements, activeCompPath);
  patchLiveAudioGroupState(previewIframe, elements, groupId, activeCompPath);
  const createdLiveGroupElement = patchLiveGroupElement(previewIframe, groupId, groupLabel);
  reseekPreviewRuntime(previewIframe);

  const groupOperation: PatchOperation = {
    type: "attribute",
    property: HF_AUDIO_GROUP_ATTR,
    value: groupId,
  };
  const groupPath = activeCompPath || "index.html";
  const byPath = groupElementsByTargetPath(elements, activeCompPath);
  const files: Record<string, (current: string) => string> = {};
  for (const targetPath of new Set([...byPath.keys(), groupPath])) {
    files[targetPath] = (current) => {
      let patched = patchTimelineChangesInSource(
        current,
        targetPath,
        operationChanges(byPath.get(targetPath) ?? [], groupOperation),
      );
      if (targetPath === groupPath) patched = insertGroupElement(patched, groupId, groupLabel);
      if (patched !== current) pendingTimelineEditPathRef.current.add(targetPath);
      return patched;
    };
  }

  try {
    const changedPaths = await saveProjectFilesWithHistory({
      projectId,
      label: groupLabel
        ? `Group ${elements.length} clips as ${groupLabel}`
        : `Group ${elements.length} voice clips`,
      files,
      readFile: (path) => readFileContent(projectId, path),
      writeFile: writeProjectFile,
      recordEdit,
    });
    for (const element of elements) {
      usePlayerStore.getState().updateElement(element.key ?? element.id, { audioGroup: groupId });
    }
    return changedPaths;
  } catch (error) {
    // Mirrors setElementsHidden's failure path: the optimistic live patch
    // already ran, so a save failure has to be unwound or the preview shows a
    // grouping that never made it to disk.
    patchLiveAudioGroupState(previewIframe, elements, null, activeCompPath, priorGroups);
    if (createdLiveGroupElement) {
      previewIframe?.contentDocument?.getElementById(groupId)?.remove();
    }
    reseekPreviewRuntime(previewIframe);
    throw error;
  }
}

/**
 * The write behind B6's auto-group: pick two or more voice clips in the carve
 * picker and they land in a group instead of naming each other by id. Same
 * expanded-rows resolution as element-visibility, for the same reason — a
 * nested sub-composition child has no entry in the raw store list.
 */
export function useAudioGroupCarveAssignment({
  projectIdRef,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
  checkEditable,
}: AudioGroupCarveInput): (
  clipIds: readonly string[],
  groupId: string,
  groupLabel?: string,
) => Promise<void> {
  const timelineElements = usePlayerStore((state) => state.elements);
  return useCallback(
    async (clipIds: readonly string[], groupId: string, groupLabel?: string) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) return;
      // DOM ids, not store keys: both callers (the carve picker and the
      // timeline's group-pointer button) name clips the way the document does,
      // because that is the only space `resolveAudioGroups` reads back.
      const wanted = new Set(clipIds);
      const elements = timelineElements.filter((item) => {
        const domId = runtimeAudioId(item);
        return domId !== null && wanted.has(domId);
      });
      if (elements.length === wanted.size) assertAudioGroupEditable(checkEditable, elements);
      try {
        // Loud, not silent: an unresolved id used to leave `elements` short,
        // `createAudioGroupAndAssignMembers` returning early with no write, and
        // the carve still persisting `sources: [groupId]` for a group that was
        // never created — a carve pointing at nothing, silently not ducking.
        if (elements.length !== wanted.size) {
          const missing = [...wanted].filter(
            (id) => !elements.some((item) => runtimeAudioId(item) === id),
          );
          throw new Error(`Cannot group: no timeline clip for ${missing.join(", ")}`);
        }
        await createAudioGroupAndAssignMembers({
          groupLabel,
          projectId: pid,
          activeCompPath,
          elements,
          groupId,
          previewIframe: previewIframeRef.current,
          writeProjectFile,
          recordEdit,
          pendingTimelineEditPathRef,
        });
      } catch (error) {
        console.error("[Timeline] Failed to group voice clips", error);
        const message = error instanceof Error ? error.message : "Failed to group voice clips";
        showToast(message);
        // Rethrown, not just reported: the carve's auto-group chains
        // `.then(() => ({ ...next, sources: [groupId] }))` off this promise, so
        // swallowing here let it persist a carve pointing at a group that was
        // never written — the exact silent no-op the throw inside
        // `createAudioGroupAndAssignMembers` exists to prevent.
        throw error;
      }
    },
    [
      activeCompPath,
      timelineElements,
      previewIframeRef,
      writeProjectFile,
      recordEdit,
      pendingTimelineEditPathRef,
      isRecordingRef,
      showToast,
      projectIdRef,
      checkEditable,
    ],
  );
}
