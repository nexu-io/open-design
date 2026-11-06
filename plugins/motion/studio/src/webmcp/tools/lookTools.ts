/**
 * `studio_look`: the one call that orients an agent.
 *
 * Deliberately fat. Every field here is one the agent would otherwise have to
 * spend a round trip discovering.
 *
 * The building is a pure function over a snapshot so it can be tested with
 * values. Gathering the snapshot is the React layer's job.
 */

import { collectDomEditLayerItems } from "../../components/editor/domEditingLayers";
import type { DomEditLayerItem, DomEditSelection } from "../../components/editor/domEditingTypes";
import type { TimelineElement } from "../../player/store/timelineElement";
import { byStart, describeClip, type ClipFact } from "../../player/lib/describeClips";
import { mintElementHandle, patchTargetAddress, timelineElementAddress } from "../handles";
import { toolOk, type ToolResult } from "../toolResult";

export type StudioLookSceneSnapshot =
  | { status: "loading" }
  | {
      status: "ready";
      items: readonly DomEditLayerItem[];
      drillInItem: DomEditLayerItem | null;
    };

export interface StudioLookSnapshot {
  projectId: string | null;
  compositionPath: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  elements: readonly TimelineElement[];
  scene: StudioLookSceneSnapshot;
  selection: DomEditSelection | null;
  /** Live animations for the current selection arrive outside DomEditSelection. */
  selectionAnimationCount: number;
  /**
   * The undo stack as Studio's shell actually exposes it.
   *
   * This is a weaker signal than a revision counter, and deliberately not
   * dressed up as one: the depth lives in component-local state and is not
   * reachable here without plumbing it through the shell context. What an agent
   * CAN do is checkpoint `undoLabel` before a batch and notice it change to
   * something it did not do, which means a human pressed undo and its earlier
   * edits are gone.
   */
  history: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
  };
}

interface LookTimeline {
  start: number;
  duration: number;
  track: number;
  zIndex: number | null;
  kind: string | null;
}

interface LookElement {
  /** Pass back unchanged to tools that take a handle. */
  handle: string;
  parentHandle: string | null;
  label: string;
  tag: string;
  depth: number;
  childCount: number;
  sourceFile: string;
  timeline: LookTimeline | null;
}

interface LookSelection {
  handle: string | null;
  label: string;
  tagName: string;
  sourceFile: string;
  box: { x: number; y: number; width: number; height: number };
  text: string | null;
  /** What this element will and will not accept, straight from Studio. */
  can: {
    editStyles: boolean;
    move: boolean;
    resize: boolean;
    editText: boolean;
    reasonIfDisabled: string | null;
  };
  animationCount: number;
}

/**
 * Session-scoped response shape. There is intentionally no schema version:
 * WebMCP consumers discover the current tool and schema when they connect
 * rather than pinning a cached REST response contract.
 */
export interface StudioLook {
  projectId: string | null;
  compositionPath: string | null;
  playhead: number;
  duration: number;
  isPlaying: boolean;
  history: StudioLookSnapshot["history"];
  selection: LookSelection | null;
  sceneStatus: StudioLookSceneSnapshot["status"];
  drillIn: { handle: string; label: string; sourceFile: string } | null;
  elementCount: number;
  truncated: boolean;
  elements: LookElement[];
  /** Every timeline clip, audio included, whether or not it is a visual layer. */
  clipCount: number;
  clipsTruncated: boolean;
  clips: LookClip[];
}

/** A timeline clip; `handle` is null when the clip has no addressable source element. */
type LookClip = ClipFact & { handle: string | null };

export interface StudioLookInput {
  /** Case-insensitive substring match against label, tag, and handle. */
  filter?: string;
  /** Cap the returned list. The full count is always reported separately. */
  limit?: number;
}

const DEFAULT_LIMIT = 200;
const MAX_FILTER_LENGTH = 128;

function describeTimeline(element: TimelineElement): LookTimeline {
  return {
    start: element.start,
    duration: element.duration,
    track: element.track,
    zIndex: element.zIndex ?? null,
    kind: element.kind ?? null,
  };
}

function describeSelection(
  selection: DomEditSelection,
  animationCount: number,
  activeCompositionPath: string,
  projectId: string | null,
): LookSelection {
  const { capabilities } = selection;
  return {
    handle: mintElementHandle(patchTargetAddress(selection, activeCompositionPath, projectId)),
    label: selection.label,
    tagName: selection.tagName,
    sourceFile: selection.sourceFile,
    box: selection.boundingBox,
    text: selection.textContent,
    can: {
      editStyles: capabilities.canEditStyles,
      move: capabilities.canMove || capabilities.canApplyManualOffset,
      resize: capabilities.canResize || capabilities.canApplyManualSize,
      editText: selection.textFields.length > 0,
      reasonIfDisabled: capabilities.reasonIfDisabled ?? null,
    },
    animationCount,
  };
}

function matchesClipFilter(clip: LookClip, needle: string): boolean {
  return [clip.id, clip.label, clip.kind, clip.src].some((field) =>
    field?.toLowerCase().includes(needle),
  );
}

function describeClipsWithHandles(snapshot: StudioLookSnapshot): LookClip[] {
  const activeCompositionPath = snapshot.compositionPath ?? "index.html";
  return snapshot.elements.map((element) => ({
    ...describeClip(element),
    handle: mintElementHandle(
      timelineElementAddress(element, activeCompositionPath, snapshot.projectId),
    ),
  }));
}

function matchesFilter(element: LookElement, needle: string): boolean {
  return (
    element.label.toLowerCase().includes(needle) ||
    element.tag.toLowerCase().includes(needle) ||
    element.handle.toLowerCase().includes(needle)
  );
}

/** Gather the live scene once per tool call. The response never retains DOM nodes. */
export function collectStudioLookScene(
  doc: Document | null,
  activeCompositionPath: string | null,
  activeGroupElement: HTMLElement | null,
): StudioLookSceneSnapshot {
  if (!doc) return { status: "loading" };

  const root = doc.querySelector<HTMLElement>("[data-composition-id]");
  if (!root) return { status: "loading" };

  const options = {
    activeCompositionPath,
    isMasterView: !activeCompositionPath || activeCompositionPath === "index.html",
    activeGroupElement: null,
  };
  const items = collectDomEditLayerItems(root, options);
  const liveGroup =
    activeGroupElement?.isConnected && activeGroupElement.ownerDocument === doc
      ? activeGroupElement
      : null;
  return {
    status: "ready",
    items,
    drillInItem: liveGroup ? (items.find((item) => item.element === liveGroup) ?? null) : null,
  };
}

function describeScene(snapshot: StudioLookSnapshot): {
  elements: LookElement[];
  drillIn: StudioLook["drillIn"];
} {
  if (snapshot.scene.status === "loading") return { elements: [], drillIn: null };

  const activeCompositionPath = snapshot.compositionPath ?? "index.html";
  const timelineByHandle = new Map<string, LookTimeline>();
  for (const element of snapshot.elements) {
    const handle = mintElementHandle(
      timelineElementAddress(element, activeCompositionPath, snapshot.projectId),
    );
    if (handle) timelineByHandle.set(handle, describeTimeline(element));
  }

  const parentHandles: string[] = [];
  const elements = snapshot.scene.items.map((item) => {
    const handle = mintElementHandle(
      patchTargetAddress(item, activeCompositionPath, snapshot.projectId),
    );
    if (!handle) throw new Error("collectDomEditLayerItems returned an unaddressable layer");
    const parentHandle = item.depth > 0 ? (parentHandles[item.depth - 1] ?? null) : null;
    parentHandles[item.depth] = handle;
    parentHandles.length = item.depth + 1;
    return {
      handle,
      parentHandle,
      label: item.label,
      tag: item.tagName,
      depth: item.depth,
      childCount: item.childCount,
      sourceFile: item.sourceFile,
      timeline: timelineByHandle.get(handle) ?? null,
    };
  });

  const drillInItem = snapshot.scene.drillInItem;
  const drillInHandle = drillInItem
    ? mintElementHandle(patchTargetAddress(drillInItem, activeCompositionPath, snapshot.projectId))
    : null;
  return {
    elements,
    drillIn:
      drillInItem && drillInHandle
        ? {
            handle: drillInHandle,
            label: drillInItem.label,
            sourceFile: drillInItem.sourceFile,
          }
        : null,
  };
}

export function buildStudioLook(
  snapshot: StudioLookSnapshot,
  input: StudioLookInput = {},
): ToolResult<StudioLook> {
  const scene = describeScene(snapshot);
  const needle = input.filter?.slice(0, MAX_FILTER_LENGTH).trim().toLowerCase();
  const matched = needle
    ? scene.elements.filter((element) => matchesFilter(element, needle))
    : scene.elements;

  // Clamp rather than reject: a bad limit should not cost the agent a round trip
  // when the answer it wants is right here.
  const requested =
    Number.isInteger(input.limit) && input.limit! > 0 ? input.limit! : DEFAULT_LIMIT;
  const limit = Math.min(requested, DEFAULT_LIMIT);
  const clips = describeClipsWithHandles(snapshot).sort(byStart);
  const matchedClips = needle ? clips.filter((clip) => matchesClipFilter(clip, needle)) : clips;

  return toolOk<StudioLook>({
    projectId: snapshot.projectId,
    compositionPath: snapshot.compositionPath,
    playhead: snapshot.currentTime,
    duration: snapshot.duration,
    isPlaying: snapshot.isPlaying,
    history: snapshot.history,
    selection: snapshot.selection
      ? describeSelection(
          snapshot.selection,
          snapshot.selectionAnimationCount,
          snapshot.compositionPath ?? "index.html",
          snapshot.projectId,
        )
      : null,
    sceneStatus: snapshot.scene.status,
    drillIn: scene.drillIn,
    // The count is of everything that MATCHED, so a truncated list is visible
    // as a truncated list rather than reading as "that is all there is".
    elementCount: matched.length,
    truncated: matched.length > limit,
    elements: matched.slice(0, limit),
    clipCount: matchedClips.length,
    clipsTruncated: matchedClips.length > limit,
    clips: matchedClips.slice(0, limit),
  });
}

export const STUDIO_LOOK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    filter: {
      type: "string",
      maxLength: MAX_FILTER_LENGTH,
      description: "Case-insensitive substring matched against element label, tag, and handle.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: DEFAULT_LIMIT,
      description: `Cap the returned elements and clips (default and max ${DEFAULT_LIMIT} each). elementCount and clipCount always report the full match count.`,
    },
  },
  additionalProperties: false,
} as const;

export const STUDIO_LOOK_DESCRIPTION = [
  "Read HyperFrames Studio's live state in one call: the open project and composition,",
  "the playhead and duration, what the human currently has selected (including what that",
  "element will and will not accept), and the live nested scene in DOM preorder.",
  "Each scene element includes source ownership, hierarchy, and optional timeline timing.",
  "`clips` lists every timeline clip, audio included: kind, start, duration, track, volume,",
  "volume/effect automation points, playback rate, audio group and role.",
  "Pass a handle back to any tool that edits an element.",
  "Returns an object with `ok: true`, or `ok: false` with `kind`, `reason` and often a `hint`.",
  "`history.undoLabel` is worth checkpointing before a batch: if it later names something",
  "you did not do, a human pressed undo and your earlier edits are gone.",
].join(" ");
