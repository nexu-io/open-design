/**
 * `studio_inspect`: everything about one element, in one call.
 *
 * The point is to prevent a failed write. Every field here either tells the
 * agent what it can change (`can`, with `reasonIfDisabled` verbatim) or what it
 * would be changing (the resolved styles, the text fields, the animations).
 * An agent that reads this first should never attempt an edit the element will
 * refuse.
 *
 * The GSAP diagnostics are here for the same reason: `multipleTimelines` and
 * `unsupportedTimelinePattern` are states where animation editing is off, and
 * learning that from a read is cheaper than learning it from a failed write.
 */

import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import {
  elementHandleMatchesProject,
  mintElementHandle,
  patchTargetAddress,
  resolveLiveHandleSelection,
} from "../handles";
import { toolFailure, toolOk, type ToolResult } from "../toolResult";
import type { SelectionToolDeps } from "./selectionTools";

export interface InspectToolDeps extends SelectionToolDeps {
  /** What the human currently has selected, used when no handle is given. */
  getCurrentSelection: () => DomEditSelection | null;
  getGsapDiagnostics: () => {
    animations: readonly GsapAnimation[];
    multipleTimelines: boolean;
    unsupportedTimelinePattern: boolean;
  };
}

interface InspectAnimation {
  animationId: string;
  method: string;
  target: string;
  position: number | string;
  duration: number | null;
  ease: string | null;
  properties: Record<string, number | string>;
  hasKeyframes: boolean;
  hasArcPath: boolean;
}

interface InspectTextField {
  key: string;
  label: string;
  value: string;
  tagName: string;
}

export interface StudioInspectResult {
  handle: string | null;
  label: string;
  tagName: string;
  sourceFile: string;
  box: { x: number; y: number; width: number; height: number };
  text: string | null;
  textFields: InspectTextField[];
  /** The styles Studio itself surfaces, resolved, not as authored. */
  styles: Record<string, string>;
  inlineStyles: Record<string, string>;
  dataAttributes: Record<string, string>;
  can: {
    editStyles: boolean;
    move: boolean;
    resize: boolean;
    rotate: boolean;
    crop: boolean;
    editText: boolean;
    reasonIfDisabled: string | null;
  };
  animations: InspectAnimation[];
  /** Present only when animation editing is unavailable, with the reason. */
  animationEditingBlocked: string | null;
  /** True when this element is the one the human currently has selected. */
  isCurrentSelection: boolean;
}

export interface StudioInspectInput {
  /** Omit to inspect the current selection. */
  handle?: string;
}

function describeAnimation(animation: GsapAnimation): InspectAnimation {
  return {
    animationId: animation.id,
    method: animation.method,
    target: animation.targetSelector,
    position: animation.position,
    duration: animation.duration ?? null,
    ease: animation.ease ?? null,
    properties: animation.properties,
    hasKeyframes: animation.keyframes !== undefined,
    hasArcPath: animation.arcPath !== undefined,
  };
}

function getAnimationEditingBlock(
  isCurrentSelection: boolean,
  diagnostics: ReturnType<InspectToolDeps["getGsapDiagnostics"]>,
): string | null {
  if (!isCurrentSelection) return "animations are only readable for the current selection";
  if (diagnostics.multipleTimelines) return "this composition has multiple GSAP timelines";
  if (diagnostics.unsupportedTimelinePattern) {
    return "this composition's timeline pattern is not editable by Studio";
  }
  return null;
}

function describe(
  selection: DomEditSelection,
  deps: InspectToolDeps,
  isCurrentSelection: boolean,
  resolvedHandle?: string,
): ToolResult<StudioInspectResult> {
  const { capabilities } = selection;
  const gsap = deps.getGsapDiagnostics();

  // Only the CURRENT selection's animations are parsed by Studio. Reporting
  // them for some other element would be reporting the wrong element's motion,
  // which is worse than reporting none.
  const animations = isCurrentSelection ? gsap.animations.map(describeAnimation) : [];

  const animationEditingBlocked = getAnimationEditingBlock(isCurrentSelection, gsap);

  return toolOk<StudioInspectResult>({
    handle:
      resolvedHandle ??
      mintElementHandle(
        patchTargetAddress(
          selection,
          deps.getCompositionPath() ?? "index.html",
          deps.getProjectId(),
        ),
      ),
    label: selection.label,
    tagName: selection.tagName,
    sourceFile: selection.sourceFile,
    box: selection.boundingBox,
    text: selection.textContent,
    textFields: selection.textFields.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      tagName: field.tagName,
    })),
    styles: selection.computedStyles,
    inlineStyles: selection.inlineStyles,
    dataAttributes: selection.dataAttributes,
    can: {
      editStyles: capabilities.canEditStyles,
      move: capabilities.canMove || capabilities.canApplyManualOffset,
      resize: capabilities.canResize || capabilities.canApplyManualSize,
      rotate: capabilities.canApplyManualRotation,
      crop: capabilities.canCrop,
      editText: selection.textFields.length > 0,
      reasonIfDisabled: capabilities.reasonIfDisabled ?? null,
    },
    animations,
    animationEditingBlocked,
    isCurrentSelection,
  });
}

export async function studioInspect(
  deps: InspectToolDeps,
  input: StudioInspectInput = {},
): Promise<ToolResult<StudioInspectResult>> {
  const current = deps.getCurrentSelection();

  if (!input.handle) {
    // An empty result here would assert "this element has nothing", which is a
    // different and false claim from "you did not tell me which element".
    if (!current) {
      return toolFailure(
        "invalid",
        "nothing is selected and no handle was given",
        "Pass a handle from studio_look, or call studio_select first.",
      );
    }
    return describe(current, deps, true);
  }
  if (!elementHandleMatchesProject(input.handle, deps.getProjectId())) {
    return toolFailure(
      "invalid",
      "the handle belongs to a different project",
      "Call studio_look in the active project.",
    );
  }

  const resolved = await resolveLiveHandleSelection(
    deps.getPreviewDocument,
    input.handle,
    deps.buildSelection,
  );
  if (resolved.status === "preview-unavailable") {
    return toolFailure("blocked", "the preview is not mounted yet");
  }
  if (resolved.status === "not-found") {
    return toolFailure(
      "invalid",
      `no element matches handle ${input.handle}`,
      "Call studio_look for current handles.",
    );
  }
  if (resolved.status === "unsupported") {
    return toolFailure("blocked", `${input.handle} resolved to an element Studio cannot inspect`);
  }
  if (resolved.status === "changed") {
    return toolFailure(
      "invalid",
      "the target changed while it was resolving",
      "Call studio_look again.",
    );
  }

  return describe(
    resolved.selection,
    deps,
    current?.element === resolved.selection.element,
    input.handle,
  );
}

export const STUDIO_INSPECT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: {
      type: "string",
      description: "An element handle from studio_look. Omit to inspect the current selection.",
    },
  },
  additionalProperties: false,
} as const;

export const STUDIO_INSPECT_DESCRIPTION = [
  "Everything about one element: its resolved styles, its text fields, its box,",
  "its GSAP animations, and crucially what it will and will not accept.",
  "Read this BEFORE editing. `can` tells you which edits are possible and",
  "`can.reasonIfDisabled` says why one is not, so you can avoid a write that would be refused.",
  "Animations are only readable for the CURRENT selection; `animationEditingBlocked` says when",
  "and why animation editing is unavailable.",
  "Returns `ok: true`, or `ok: false` with `kind`, `reason` and a `hint`.",
].join(" ");
