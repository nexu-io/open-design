/**
 * `studio_transform`: move, resize and rotate, as a drag would.
 *
 * This tool reads the element's box back after every write and reports what
 * ACTUALLY changed. That is not belt-and-braces, it is the only thing standing
 * between an agent and a silent lie, because two of the three handlers can do
 * nothing and resolve:
 *
 * - The handlers exposed on `DomEditActionsValue` are the GSAP-AWARE wrappers
 *   (`useDomEditSession.ts` aliases them), not the CSS ones in
 *   `useDomGeometryCommits.ts`.
 * - `handleGsapAwarePathOffsetCommit` and `handleGsapAwareRotationCommit` are
 *   `if (gsapCommitMutation) { ...intercept... }` with NO else branch. In a
 *   composition with no GSAP they return having done nothing. The adjacent
 *   comments confirm that is deliberate: there is no CSS fallback to write to.
 * - `handleGsapAwareBoxSizeCommit` is different. It runs through
 *   `runGestureTransaction` with a scale route and a width/height route, so
 *   resize works more generally than the other two.
 *
 * Read back, do not assume.
 */

import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import type { DomEditCommitOutcome } from "../../hooks/domEditCommitRunner";
import type { DomEditPersistOutcome } from "../../hooks/domEditCommitTypes";
import { toolFailure, type ToolFailure } from "../toolResult";
import {
  dispatched,
  runTargetedWrite,
  saved,
  verified,
  type StudioWriteAdapterSuccess,
  type StudioWriteResult,
  type TargetedWriteDeps,
  WRITE_RECEIPT_DESCRIPTION,
} from "../writeCoordinator";

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformToolDeps extends TargetedWriteDeps {
  /** The element's box as it renders right now. */
  readBox: (selection: DomEditSelection) => ElementBox;
  moveTo: (
    selection: DomEditSelection,
    next: { x: number; y: number },
  ) => Promise<DomEditCommitOutcome | void>;
  resizeTo: (
    selection: DomEditSelection,
    next: { width: number; height: number },
  ) => Promise<DomEditCommitOutcome | void>;
  rotateTo: (
    selection: DomEditSelection,
    next: { angle: number },
  ) => Promise<DomEditCommitOutcome | void>;
}

export interface StudioTransformInput {
  handle?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotate?: unknown;
}

export interface StudioTransformResult {
  /** The box as it renders after the write, read back, not echoed. */
  box: ElementBox;
  applied: string[];
  /** Requested operations whose effect could not be observed, with why. */
  unchanged: Record<string, string>;
  /** Present when earlier operations landed before a later operation failed. */
  partial?: true;
  failed?: Partial<Record<TransformOperation, string>>;
}

const NO_OP_HINT =
  "Move and rotate are written as GSAP code; a composition with no GSAP timeline has nothing to write to. studio_inspect reports the element's animations.";

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface TransformRequest {
  move: { x: number; y: number } | null;
  size: { width: number; height: number } | null;
  rotate: number | null;
}

/**
 * Both or neither. Accepting one axis alone would mean inventing the other from
 * the current value, which moves the element somewhere the caller did not ask
 * for.
 */
function parsePair(
  a: unknown,
  b: unknown,
  names: [string, string],
  min = Number.NEGATIVE_INFINITY,
): { pair: [number, number] | null } | ToolFailure {
  const first = readNumber(a);
  const second = readNumber(b);
  if (first === null && second === null) return { pair: null };
  if (first === null || second === null) {
    return toolFailure("invalid", `${names[0]} and ${names[1]} must be given together`);
  }
  if (first < min || second < min) {
    return toolFailure("invalid", `${names[0]} and ${names[1]} must be at least ${min}`);
  }
  return { pair: [first, second] };
}

function isFailure(value: object): value is ToolFailure {
  return "ok" in value;
}

function parseRequest(input: StudioTransformInput): TransformRequest | ToolFailure {
  const move = parsePair(input.x, input.y, ["x", "y"]);
  if (isFailure(move)) return move;
  const size = parsePair(input.width, input.height, ["width", "height"], 0);
  if (isFailure(size)) return size;
  const rotate = readNumber(input.rotate);

  if (!move.pair && !size.pair && rotate === null) {
    return toolFailure(
      "invalid",
      "give at least one of x, y, width, height, rotate as a finite number",
    );
  }

  return {
    move: move.pair ? { x: move.pair[0], y: move.pair[1] } : null,
    size: size.pair ? { width: size.pair[0], height: size.pair[1] } : null,
    rotate,
  };
}

type TransformOperation = "resize" | "move" | "rotate";

interface TransformObservation {
  operation: TransformOperation;
  changed: boolean;
  unchangedReason?: string;
  persistence?: DomEditPersistOutcome;
}

function transformPreflight(
  request: TransformRequest,
  selection: DomEditSelection,
): ToolFailure | null {
  if (
    request.size &&
    !selection.capabilities.canResize &&
    !selection.capabilities.canApplyManualSize
  ) {
    return toolFailure("blocked", "this target cannot be resized");
  }
  if (
    request.move &&
    !selection.capabilities.canMove &&
    !selection.capabilities.canApplyManualOffset
  ) {
    return toolFailure("blocked", "this target cannot be moved");
  }
  if (request.rotate !== null && !selection.capabilities.canApplyManualRotation) {
    return toolFailure("blocked", "this target cannot be rotated");
  }
  return null;
}

async function observeResize(
  deps: TransformToolDeps,
  selection: DomEditSelection,
  size: NonNullable<TransformRequest["size"]>,
): Promise<TransformObservation | ToolFailure> {
  const before = deps.readBox(selection);
  const outcome = await deps.resizeTo(selection, size);
  if (outcome && !outcome.ok) return outcomeFailure(outcome.reason);
  const after = deps.readBox(selection);
  const changed = after.width !== before.width || after.height !== before.height;
  return {
    operation: "resize",
    changed,
    ...(!changed ? { unchangedReason: "the element's size did not change" } : {}),
    ...(outcome?.ok && outcome.persistence ? { persistence: outcome.persistence } : {}),
  };
}

async function observeMove(
  deps: TransformToolDeps,
  selection: DomEditSelection,
  move: NonNullable<TransformRequest["move"]>,
): Promise<TransformObservation | ToolFailure> {
  const before = deps.readBox(selection);
  const outcome = await deps.moveTo(selection, move);
  if (outcome && !outcome.ok) return outcomeFailure(outcome.reason);
  const after = deps.readBox(selection);
  const changed = after.x !== before.x || after.y !== before.y;
  return {
    operation: "move",
    changed,
    ...(!changed ? { unchangedReason: `the element did not move. ${NO_OP_HINT}` } : {}),
    ...(outcome?.ok && outcome.persistence ? { persistence: outcome.persistence } : {}),
  };
}

async function observeRotation(
  deps: TransformToolDeps,
  selection: DomEditSelection,
  rotate: number,
): Promise<TransformObservation | ToolFailure> {
  const outcome = await deps.rotateTo(selection, { angle: rotate });
  if (outcome && !outcome.ok) return outcomeFailure(outcome.reason);
  if (!outcome || !outcome.persistence) {
    return {
      operation: "rotate",
      changed: false,
      unchangedReason: "rotation was dispatched but not independently observed",
    };
  }
  if (!outcome.persistence.changed) {
    return {
      operation: "rotate",
      changed: false,
      unchangedReason: "the durable write reported no rotation change",
      persistence: outcome.persistence,
    };
  }
  return { operation: "rotate", changed: true, persistence: outcome.persistence };
}

function requestMatchesBox(request: TransformRequest, box: ElementBox): boolean {
  const sizeMatches =
    !request.size || (box.width === request.size.width && box.height === request.size.height);
  const moveMatches = !request.move || (box.x === request.move.x && box.y === request.move.y);
  return sizeMatches && moveMatches;
}

function transformReceipt(
  request: TransformRequest,
  initial: ElementBox,
  box: ElementBox,
  observations: TransformObservation[],
  failure?: { operation: TransformOperation; reason: string },
): StudioWriteAdapterSuccess<StudioTransformResult> {
  const applied = observations.filter((item) => item.changed).map((item) => item.operation);
  const unchanged = Object.fromEntries(
    observations.flatMap((item) => {
      if (!item.unchangedReason) return [];
      const key = item.operation === "rotate" ? "rotation" : item.operation;
      return [[key, item.unchangedReason]];
    }),
  );
  const value: StudioTransformResult = {
    box,
    applied,
    unchanged,
    ...(failure ? { partial: true, failed: { [failure.operation]: failure.reason } } : {}),
  };
  const changed = observations.some((item) => item.changed) || !boxesEqual(initial, box);
  const allDurable = observations.every((item) => item.persistence !== undefined);
  const persistence = observations.at(-1)?.persistence;
  if (!allDurable || !persistence) return dispatched(value, changed);
  if (!failure && requestMatchesBox(request, box) && request.rotate === null) {
    return { ...verified(value, persistence, { before: initial, after: box }), changed };
  }
  return { ...saved(value, persistence), changed };
}

async function writeTransform(
  deps: TransformToolDeps,
  selection: DomEditSelection,
  request: TransformRequest,
): Promise<StudioWriteAdapterSuccess<StudioTransformResult> | ToolFailure> {
  const initial = deps.readBox(selection);
  const observations: TransformObservation[] = [];
  if (request.size) {
    const observation = await observeResize(deps, selection, request.size);
    if (isFailure(observation)) return observation;
    observations.push(observation);
  }
  if (request.move) {
    const observation = await observeMove(deps, selection, request.move);
    if (isFailure(observation)) {
      if (observations.length === 0) return observation;
      return transformReceipt(request, initial, deps.readBox(selection), observations, {
        operation: "move",
        reason: observation.reason,
      });
    }
    observations.push(observation);
  }
  if (request.rotate !== null) {
    const observation = await observeRotation(deps, selection, request.rotate);
    if (isFailure(observation)) {
      if (observations.length === 0) return observation;
      return transformReceipt(request, initial, deps.readBox(selection), observations, {
        operation: "rotate",
        reason: observation.reason,
      });
    }
    observations.push(observation);
  }
  return transformReceipt(request, initial, deps.readBox(selection), observations);
}

export async function studioTransform(
  deps: TransformToolDeps,
  input: StudioTransformInput,
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioTransformResult>> {
  const request = parseRequest(input);
  if (isFailure(request)) {
    return { ...request, stage: "refused", operation: "transform" };
  }

  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "transform",
    signal,
    preflight: (selection) => transformPreflight(request, selection),
    write: (selection) => writeTransform(deps, selection, request),
  });
}

function boxesEqual(a: ElementBox, b: ElementBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function outcomeFailure(reason: string): ToolFailure {
  return toolFailure("failed", `the transform was not applied: ${reason}`);
}

export const STUDIO_TRANSFORM_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    x: { type: "number", description: "New x offset in pixels. Must be paired with y." },
    y: { type: "number", description: "New y offset in pixels. Must be paired with x." },
    width: { type: "number", minimum: 0, description: "New width. Must be paired with height." },
    height: { type: "number", minimum: 0, description: "New height. Must be paired with width." },
    rotate: { type: "number", description: "Rotation in degrees." },
  },
  required: ["handle"],
  additionalProperties: false,
} as const;

export const STUDIO_TRANSFORM_DESCRIPTION = [
  "Move, resize or rotate one element using its source-safe handle from studio_look.",
  "Give x with y, and width with height.",
  "The result's `box` is READ BACK after the write, not echoed from your request, and",
  "`applied` lists what actually took effect. Check it.",
  "Move and rotate are written as GSAP code, so in a composition with no GSAP timeline they",
  "do nothing; that shows up in `unchanged` rather than as a false success.",
  "Rotation is reported as dispatched rather than verified, because the CSS `rotate` property",
  "does not appear in the element's computed transform.",
  "Returns `ok: true`, or `ok: false` with `kind`, `reason` and a `hint`.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");
