import type { DomEditPersistOutcome } from "./domEditCommitTypes";
import type { DomEditSelection } from "../components/editor/domEditing";
import { captureStudioRotation, clearStudioRotation } from "../components/editor/manualEdits";
import { buildClearRotationPatches } from "../components/editor/manualEditsDomPatches";
import { STUDIO_ROTATION_ATTR } from "../components/editor/manualEditsTypes";
import {
  applyCssRotation,
  restorePlainRotation,
  type RotationCommit,
} from "../components/editor/rotationDraft";
import type { PatchOperation } from "../utils/sourcePatcher";
import type { ElementOffsetStagerDeps } from "./elementOffsetStager";

let plainRotateCounter = 0;

/** GSAP does not turn the element: `next` is its whole angle, drawn and saved as its CSS turn. */
export function savePlainRotation(
  { commitPositionPatchToHtml, readOnlyPreview }: Omit<ElementOffsetStagerDeps, "showToast">,
  selection: DomEditSelection,
  next: RotationCommit,
): Promise<DomEditPersistOutcome | undefined> {
  if (readOnlyPreview) return Promise.resolve(undefined);
  const { element } = selection;
  const before = captureStudioRotation(element);
  // Legacy marks go in the same write, or a seek puts their angle back; clearing them voids the press read.
  const patches: PatchOperation[] = element.hasAttribute(STUDIO_ROTATION_ATTR)
    ? buildClearRotationPatches(element)
    : [];
  if (patches.length) clearStudioRotation(element);
  const drawn = applyCssRotation(
    element,
    next.angle,
    patches.length ? undefined : (next.plain ?? undefined),
  );
  patches.push(...drawn);
  const turn = drawn.at(-1)!;
  return commitPositionPatchToHtml(selection, patches, {
    label: "Rotate layer",
    coalesceKey: `rotate:${++plainRotateCounter}`,
    coalesceMs: Number.POSITIVE_INFINITY,
  }).catch((error) => {
    if (element.style.getPropertyValue(turn.property) === turn.value) {
      restorePlainRotation(element, before);
    }
    throw error;
  });
}
