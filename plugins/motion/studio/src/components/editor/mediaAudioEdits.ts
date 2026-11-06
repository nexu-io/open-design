import {
  HF_AUDIO_AUTOMATION_ATTR,
  RATE_TARGET,
  parseAutomation,
  serializeAutomation,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import { HF_AUDIO_CARVE_ATTR } from "@hyperframes/core/audio-carve";
import { HF_AUDIO_FADE_IN_ATTR, HF_AUDIO_FADE_OUT_ATTR } from "@hyperframes/core/audio-fade";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import { HF_AUDIO_GROUP_ATTR } from "@hyperframes/core/audio-groups";
import {
  escapeHtmlAttribute,
  findTagByTarget,
  applyPatchByTarget,
  readAttributeByTarget,
  readTagAttribute,
  type PatchOperation,
  type PatchTarget,
} from "../../utils/sourcePatcher";
import { collectHtmlIds, resolveAssetHasAudio } from "../../utils/studioHelpers";
import type { CommitDomAttributeBatch } from "../../hooks/domEditCommitTypes";
import { buildDomEditPatchTarget, type DomEditSelection } from "./domEditing";
import { generateId } from "../../utils/generateId";

import {
  MEDIA_LINK_ATTR,
  SYNC_ORIGIN_ATTR,
  mintLinkId as mintLinkIdFrom,
} from "@hyperframes/core/media-link";
const SOUND_KEPT_ON_LINKED_AUDIO_STAGE = "Background removed. Sound kept on a linked audio track.";

const SOUND_NOT_KEPT_MESSAGE =
  "Background removed, but the sound could not be kept on a linked audio track. Undo to restore the original clip.";

export const MOVED_SOUND_ATTRS = [
  "data-volume",
  HF_AUDIO_FADE_IN_ATTR,
  HF_AUDIO_FADE_OUT_ATTR,
  HF_AUDIO_FX_ATTR,
  HF_AUDIO_CARVE_ATTR,
  HF_AUDIO_GROUP_ATTR,
];

export const COPIED_TIMING_ATTRS = [
  "start",
  "end",
  "duration",
  "media-start",
  "playback-start",
  "playback-rate",
  "source-duration",
];

const htmlAttr = (property: string, value: string | null): PatchOperation => ({
  type: "html-attribute",
  property,
  value,
});

const dataAttr = (property: string, value: string | null): PatchOperation => ({
  type: "attribute",
  property,
  value,
});

function stripDataPrefix(name: string): string {
  return name.startsWith("data-") ? name.slice("data-".length) : name;
}

function probedHasAudioValue(probedHasAudio: boolean | null): string | null {
  if (probedHasAudio === null) return null;
  return probedHasAudio ? "true" : "false";
}

export function mutedToggleOps(input: {
  isVideo: boolean;
  nextMuted: boolean;
  probedHasAudio: boolean | null;
}): PatchOperation[] {
  const muted = htmlAttr("muted", input.nextMuted ? "true" : null);
  if (!input.isVideo) return [muted];
  const hasAudio = input.nextMuted ? null : probedHasAudioValue(input.probedHasAudio);
  return [muted, dataAttr("has-audio", hasAudio)];
}

export function hasAudioToggleOps(next: boolean): PatchOperation[] {
  return next
    ? [dataAttr("has-audio", "true"), htmlAttr("muted", null)]
    : [dataAttr("has-audio", null), htmlAttr("muted", "true")];
}

export function cutoutOps(input: { isVideo: boolean; cutoutSrc: string }): PatchOperation[] {
  const src = htmlAttr("src", input.cutoutSrc);
  return input.isVideo ? [src, htmlAttr("muted", "true"), dataAttr("has-audio", null)] : [src];
}

export function firstFreeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function mintLinkId(doc: Document): string {
  const taken = new Set<string>();
  const selector = `[id], [${MEDIA_LINK_ATTR}], [${SYNC_ORIGIN_ATTR}]`;
  for (const el of Array.from(doc.querySelectorAll(selector))) {
    for (const value of [
      el.id,
      el.getAttribute(MEDIA_LINK_ATTR),
      el.getAttribute(SYNC_ORIGIN_ATTR),
    ])
      if (value) taken.add(value);
  }
  return mintLinkIdFrom(taken);
}

function firstFreeTrackIndex(source: string): number {
  const used = new Set(
    Array.from(source.matchAll(/\bdata-track-index=["'](-?\d+)["']/g), (m) => Number(m[1])),
  );
  let track = 0;
  while (used.has(track)) track += 1;
  return track;
}

export function splitAutomation(raw: string): { videoKeeps: string | null; audioTakes: string } {
  let lanes: HfAutomationLane[];
  try {
    lanes = parseAutomation(raw).lanes;
  } catch {
    return { videoKeeps: null, audioTakes: raw };
  }
  const rateLanes = lanes.filter((lane) => lane.target === RATE_TARGET);
  const soundLanes = lanes.filter((lane) => lane.target !== RATE_TARGET);
  return {
    videoKeeps: rateLanes.length > 0 ? serializeAutomation({ version: 1, lanes: rateLanes }) : null,
    audioTakes: serializeAutomation({ version: 1, lanes: [...soundLanes, ...rateLanes] }),
  };
}

export function formatAttrs(attrs: Array<[string, string]>): string {
  return attrs.map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`).join(" ");
}

export function readAuthoredSrc(source: string, target: PatchTarget): string {
  const tag = findTagByTarget(source, target);
  if (!tag) return "";
  const own = readTagAttribute(tag.tag, "src");
  if (own) return own;
  const firstSource = /^\s*<source\b[^>]*>/i.exec(source.slice(tag.end + 1));
  return (firstSource && readTagAttribute(firstSource[0], "src")) || "";
}

export function insertBeforeTarget(source: string, target: PatchTarget, markup: string): string {
  const match = findTagByTarget(source, target);
  if (!match) return source;
  const lineStart = source.lastIndexOf("\n", match.start) + 1;
  const indent = /^[ \t]*$/.test(source.slice(lineStart, match.start))
    ? source.slice(lineStart, match.start)
    : "";
  const separator = indent ? `\n${indent}` : "";
  return `${source.slice(0, match.start)}${markup}${separator}${source.slice(match.start)}`;
}

export interface KeepSoundCutoutEdit {
  ops: PatchOperation[];
  prepareContent: (source: string) => string;
  audioInserted: () => boolean;
}

export function buildKeepSoundCutoutEdit(input: {
  video: Element;
  videoId: string | null;
  target: PatchTarget;
  cutoutSrc: string;
}): KeepSoundCutoutEdit {
  const { video, target } = input;
  const linkId = mintLinkId(video.ownerDocument);
  let audioInserted = false;

  const movedSound: Array<[string, string]> = [];
  const cutoutSrcOp = htmlAttr("src", input.cutoutSrc);
  const ops: PatchOperation[] = [htmlAttr("muted", "true"), dataAttr("has-audio", null)];
  for (const name of MOVED_SOUND_ATTRS) {
    const value = video.getAttribute(name);
    if (value === null) continue;
    movedSound.push([name, value]);
    ops.push(dataAttr(stripDataPrefix(name), null));
  }
  const automation = video.getAttribute(HF_AUDIO_AUTOMATION_ATTR);
  if (automation !== null) {
    const { videoKeeps, audioTakes } = splitAutomation(automation);
    movedSound.push([HF_AUDIO_AUTOMATION_ATTR, audioTakes]);
    ops.push(dataAttr(stripDataPrefix(HF_AUDIO_AUTOMATION_ATTR), videoKeeps));
  }
  ops.push(
    dataAttr(stripDataPrefix(MEDIA_LINK_ATTR), linkId),
    dataAttr(stripDataPrefix(SYNC_ORIGIN_ATTR), linkId),
  );

  const prepareContent = (source: string): string => {
    const originalSrc = readAuthoredSrc(source, target);
    const audioId = firstFreeName(
      `${input.videoId || "video"}-audio`,
      new Set(collectHtmlIds(source)),
    );
    const timing: Array<[string, string]> = [];
    for (const name of COPIED_TIMING_ATTRS) {
      const value = readAttributeByTarget(source, target, name);
      if (value !== undefined) timing.push([`data-${name}`, value]);
    }
    const attrs: Array<[string, string]> = [
      ["id", audioId],
      ["data-hf-id", `hf-${generateId()}`],
      ["class", "clip"],
      ["src", originalSrc],
      ...timing,
      ["data-track-index", String(firstFreeTrackIndex(source))],
      [MEDIA_LINK_ATTR, linkId],
      [SYNC_ORIGIN_ATTR, linkId],
      ...movedSound,
    ];
    if (video.hasAttribute("loop")) attrs.push(["loop", ""]);
    if (video.hasAttribute("data-hidden")) attrs.push(["data-hidden", ""]);
    const cut = applyPatchByTarget(source, target, cutoutSrcOp);
    const inserted = insertBeforeTarget(cut, target, `<audio ${formatAttrs(attrs)}></audio>`);
    audioInserted = inserted !== cut;
    return inserted;
  };

  return { ops, prepareContent, audioInserted: () => audioInserted };
}

export interface MediaEditContext {
  element: DomEditSelection;
  projectId: string | null;
  projectSrc: string;
  commit: CommitDomAttributeBatch;
}

const isVideoSelection = (element: DomEditSelection) => element.tagName === "video";

export async function commitMutedToggle(ctx: MediaEditContext, nextMuted: boolean): Promise<void> {
  const isVideo = isVideoSelection(ctx.element);
  const probedHasAudio =
    isVideo && !nextMuted && ctx.projectId && ctx.projectSrc
      ? await resolveAssetHasAudio(ctx.projectId, ctx.projectSrc)
      : null;
  await ctx.commit(ctx.element, mutedToggleOps({ isVideo, nextMuted, probedHasAudio }), {
    label: "Edit muted",
  });
}

export async function commitHasAudioToggle(ctx: MediaEditContext, next: boolean): Promise<void> {
  await ctx.commit(ctx.element, hasAudioToggleOps(next), { label: "Edit has audio" });
}

export async function commitCutout(
  ctx: MediaEditContext,
  cutoutSrc: string,
  keepSound: boolean,
): Promise<string> {
  const isVideo = isVideoSelection(ctx.element);
  const label = "Remove background";
  const keep = isVideo && keepSound;
  if (!keep) {
    const applied = await ctx.commit(ctx.element, cutoutOps({ isVideo, cutoutSrc }), { label });
    if (!applied) throw new Error("Couldn't apply the cutout");
    return "Applied cutout";
  }
  const { landed, soundKept } = await commitKeepSoundCutout(ctx, cutoutSrc, label);
  if (!landed) throw new Error("Couldn't apply the cutout");
  if (!soundKept) throw new Error(SOUND_NOT_KEPT_MESSAGE);
  return SOUND_KEPT_ON_LINKED_AUDIO_STAGE;
}

async function commitKeepSoundCutout(
  ctx: MediaEditContext,
  cutoutSrc: string,
  label: string,
): Promise<{ landed: boolean; soundKept: boolean }> {
  const edit = buildKeepSoundCutoutEdit({
    video: ctx.element.element,
    videoId: ctx.element.id ?? null,
    target: buildDomEditPatchTarget(ctx.element),
    cutoutSrc,
  });
  const landed = await ctx.commit(ctx.element, edit.ops, {
    label,
    prepareContent: edit.prepareContent,
  });
  return { landed, soundKept: landed && edit.audioInserted() };
}
