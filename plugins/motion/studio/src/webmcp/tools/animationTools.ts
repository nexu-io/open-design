/**
 * `studio_animate`: author motion.
 *
 * Add, update, and delete await the shared GSAP commit pipeline. Its promise is
 * the single settlement boundary for persistence and live-preview sync, so a
 * successful tool response never races ahead of the pixels the user sees.
 * Keyframe writes still report dispatch because their existing actor catches
 * its own failure instead of returning a landed signal.
 */

import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { toolFailure, type ToolFailure } from "../toolResult";
import {
  dispatched,
  runTargetedWrite,
  type StudioWriteResult,
  type TargetedWriteDeps,
  WRITE_RECEIPT_DESCRIPTION,
} from "../writeCoordinator";

export type GsapMethod = "to" | "from" | "set" | "fromTo";

const METHODS: readonly GsapMethod[] = ["to", "from", "set", "fromTo"];

export interface AnimationToolDeps extends TargetedWriteDeps {
  getAnimationsForSelection: (selection: DomEditSelection) => Promise<readonly { id: string }[]>;
  readPlayhead: () => { currentTime: number; duration: number; isPlaying: boolean };
  addAnimation: (selection: DomEditSelection, method: GsapMethod) => Promise<boolean>;
  updateAnimation: (
    selection: DomEditSelection,
    animationId: string,
    updates: { duration?: number; ease?: string; position?: number },
  ) => Promise<boolean>;
  addKeyframe: (
    selection: DomEditSelection,
    animationId: string,
    percent: number,
    properties: Record<string, number | string>,
  ) => Promise<void>;
  deleteAnimation: (selection: DomEditSelection, animationId: string) => Promise<boolean>;
}

const INSPECT_HINT = "Call studio_inspect to see the result.";

async function animationBelongsToTarget(
  deps: AnimationToolDeps,
  selection: DomEditSelection,
  animationId: string,
): Promise<ToolFailure | null> {
  const animations = await deps.getAnimationsForSelection(selection);
  return animations.some((animation) => animation.id === animationId)
    ? null
    : toolFailure(
        "invalid",
        `animation ${animationId} does not belong to the target handle`,
        "Select the target, then call studio_inspect for its current animation ids.",
      );
}

function readAnimationId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRawGsapExpression(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("__raw:");
}

export interface StudioAddAnimationResult {
  method: GsapMethod;
  /** Where it was inserted, which is the playhead, not a value you supplied. */
  insertedAtSeconds: number;
  dispatched: true;
}

export async function studioAddAnimation(
  deps: AnimationToolDeps,
  input: { handle?: unknown; method?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioAddAnimationResult>> {
  const method = METHODS.find((candidate) => candidate === input.method);
  if (!method) {
    return preDispatchFailure(
      "add-animation",
      toolFailure("invalid", `method must be one of ${METHODS.join(", ")}`),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "add-animation",
    signal,
    write: async (selection) => {
      const { currentTime } = deps.readPlayhead();
      const landed = await deps.addAnimation(selection, method);
      if (!landed) {
        return toolFailure(
          "failed",
          "the animation did not land",
          "The target may be stale. Call studio_look and try again with its current handle.",
        );
      }
      return dispatched({ method, insertedAtSeconds: currentTime, dispatched: true }, false);
    },
  });
}

export interface StudioUpdateAnimationResult {
  animationId: string;
  updated: { duration?: number; ease?: string; position?: number };
}

export async function studioUpdateAnimation(
  deps: AnimationToolDeps,
  input: {
    handle?: unknown;
    animationId?: unknown;
    duration?: unknown;
    ease?: unknown;
    position?: unknown;
  },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioUpdateAnimationResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "update-animation",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }

  const updates: { duration?: number; ease?: string; position?: number } = {};
  if (typeof input.duration === "number" && Number.isFinite(input.duration)) {
    if (input.duration < 0)
      return preDispatchFailure(
        "update-animation",
        toolFailure("invalid", "duration must not be negative"),
      );
    updates.duration = input.duration;
  }
  if (isRawGsapExpression(input.ease)) {
    return preDispatchFailure(
      "update-animation",
      toolFailure("invalid", "raw JavaScript expressions are not accepted"),
    );
  }
  if (typeof input.ease === "string" && input.ease.trim()) updates.ease = input.ease;
  if (typeof input.position === "number" && Number.isFinite(input.position)) {
    updates.position = input.position;
  }
  if (Object.keys(updates).length === 0) {
    return preDispatchFailure(
      "update-animation",
      toolFailure("invalid", "give at least one of duration, ease, position"),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "update-animation",
    signal,
    preflight: (selection) => animationBelongsToTarget(deps, selection, animationId),
    write: async (selection) => {
      const landed = await deps.updateAnimation(selection, animationId, updates);
      if (!landed) {
        return toolFailure(
          "failed",
          `the update to ${animationId} did not land`,
          "The animation id may be stale. studio_inspect lists the current ones.",
        );
      }
      return dispatched({ animationId, updated: updates }, false);
    },
  });
}

export interface StudioAddKeyframeResult {
  animationId: string;
  percent: number;
  properties: Record<string, number | string>;
  dispatched: true;
}

export async function studioAddKeyframe(
  deps: AnimationToolDeps,
  input: { handle?: unknown; animationId?: unknown; percent?: unknown; properties?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioAddKeyframeResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }
  const percent = input.percent;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    // Validated here because nothing in the platform checks input against the
    // schema; the tool receives whatever the agent sent.
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "percent must be a number between 0 and 100"),
    );
  }
  const raw = input.properties;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "properties must be an object of GSAP property to value"),
    );
  }
  const properties: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isRawGsapExpression(value)) {
      return preDispatchFailure(
        "add-keyframe",
        toolFailure("invalid", "raw JavaScript expressions are not accepted"),
      );
    }
    if (typeof value === "number" || typeof value === "string") properties[key] = value;
  }
  if (Object.keys(properties).length === 0) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "properties must contain at least one number or string value"),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "add-keyframe",
    signal,
    preflight: (selection) => animationBelongsToTarget(deps, selection, animationId),
    write: async (selection) => {
      await deps.addKeyframe(selection, animationId, percent, properties);
      return dispatched({ animationId, percent, properties, dispatched: true }, false);
    },
  });
}

export interface StudioDeleteAnimationResult {
  animationId: string;
  dispatched: true;
}

export async function studioDeleteAnimation(
  deps: AnimationToolDeps,
  input: { handle?: unknown; animationId?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioDeleteAnimationResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "delete-animation",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "delete-animation",
    signal,
    preflight: (selection) => animationBelongsToTarget(deps, selection, animationId),
    write: async (selection) => {
      const landed = await deps.deleteAnimation(selection, animationId);
      if (!landed) {
        return toolFailure(
          "failed",
          `the delete of ${animationId} did not land`,
          "The animation id may be stale. studio_inspect lists the current ones.",
        );
      }
      return dispatched({ animationId, dispatched: true }, false);
    },
  });
}

const SETTLEMENT_NOTE =
  "Success means persistence and live-preview synchronization have finished. Inspect afterward when exact authored values matter.";
const KEYFRAME_DISPATCH_CAVEAT = `Reports what was dispatched, not what landed: the keyframe actor does not report back. ${INSPECT_HINT}`;

export const STUDIO_ADD_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    method: { type: "string", enum: METHODS, description: "The GSAP method to add." },
  },
  required: ["handle", "method"],
  additionalProperties: false,
} as const;

export const STUDIO_ADD_ANIMATION_DESCRIPTION = [
  "Add a GSAP animation to one element using its source-safe handle from studio_look.",
  "It is inserted AT THE PLAYHEAD, which this tool does not control: call studio_seek first",
  "to choose when it starts. The result reports where the playhead actually was.",
  SETTLEMENT_NOTE,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_UPDATE_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
    duration: { type: "number", minimum: 0, description: "Duration in seconds." },
    ease: { type: "string", description: "A GSAP ease, for example power2.out." },
    position: { type: "number", description: "Start position in seconds." },
  },
  required: ["handle", "animationId"],
  additionalProperties: false,
} as const;

export const STUDIO_UPDATE_ANIMATION_DESCRIPTION = [
  "Change an existing animation's duration, ease or position.",
  "It waits for persistence and live-preview synchronization before reporting success.",
  "Get current ids from studio_inspect.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_ADD_KEYFRAME_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
    percent: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Where in the tween, 0 to 100.",
    },
    properties: {
      type: "object",
      description: 'GSAP property to value, for example {"y": -50, "opacity": 0}.',
    },
  },
  required: ["handle", "animationId", "percent", "properties"],
  additionalProperties: false,
} as const;

export const STUDIO_ADD_KEYFRAME_DESCRIPTION = [
  "Add a keyframe to an existing animation at a percentage through it.",
  "All the properties land in one commit, so they are one undo entry.",
  KEYFRAME_DISPATCH_CAVEAT,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_DELETE_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
  },
  required: ["handle", "animationId"],
  additionalProperties: false,
} as const;

export const STUDIO_DELETE_ANIMATION_DESCRIPTION = [
  "Remove an animation from the element named by handle. Undo reverses it.",
  SETTLEMENT_NOTE,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

function preDispatchFailure<T extends object>(
  operation: "add-animation" | "update-animation" | "add-keyframe" | "delete-animation",
  failure: ToolFailure,
): StudioWriteResult<T> {
  return { ...failure, stage: "refused", operation };
}
