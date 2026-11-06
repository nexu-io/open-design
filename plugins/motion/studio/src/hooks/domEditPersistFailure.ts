import type { DomEditSelection } from "../components/editor/domEditing";
import { StudioSaveHttpError } from "../utils/studioSaveDiagnostics";
import type { PatchOperation } from "../utils/sourcePatcher";

export class DomEditPersistUnresolvableError extends Error {
  constructor(targetPath: string) {
    super(`Couldn't find this element in the source file (${targetPath})`);
    this.name = "DomEditPersistUnresolvableError";
  }
}

export class DomEditPersistUnsafeValueError extends Error {
  readonly alreadyToasted: boolean;

  constructor(message: string, options: { alreadyToasted?: boolean } = {}) {
    super(message);
    this.name = "DomEditPersistUnsafeValueError";
    this.alreadyToasted = options.alreadyToasted ?? false;
  }
}

export class DomEditPersistPreparedWriteError extends Error {
  readonly alreadyToasted = true;

  constructor(targetPath: string) {
    super(`The edit saved but its follow-up write to ${targetPath} did not`);
    this.name = "DomEditPersistPreparedWriteError";
  }
}

export type DomEditPersistFailureSelection = Pick<
  DomEditSelection,
  "label" | "hfId" | "id" | "selector" | "selectorIndex" | "sourceFile"
>;

function summarizeOperations(operations: PatchOperation[]): string {
  return operations.map((op) => `${op.type}:${op.property}`).join(", ");
}

function getTargetTuple(selection: DomEditPersistFailureSelection) {
  return {
    hfId: selection.hfId,
    id: selection.id,
    selector: selection.selector,
    selectorIndex: selection.selectorIndex,
    sourceFile: selection.sourceFile,
  };
}

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSelectionLabel(selection: DomEditPersistFailureSelection): string {
  return selection.label || selection.selector || selection.id || "this element";
}

export function wasAlreadyToasted(error: unknown): boolean {
  return (
    (error instanceof DomEditPersistUnsafeValueError ||
      error instanceof DomEditPersistPreparedWriteError ||
      error instanceof StudioSaveHttpError) &&
    error.alreadyToasted
  );
}

export function reportDomEditPersistFailure(
  selection: DomEditPersistFailureSelection,
  operations: PatchOperation[],
  error: unknown,
  showToast: (message: string, tone?: "error" | "info") => void,
): void {
  const detail = getErrorDetail(error);
  console.warn("[Studio] DOM edit persist failed", {
    target: getTargetTuple(selection),
    operations: summarizeOperations(operations),
    error: detail,
  });

  if (wasAlreadyToasted(error)) return;

  showToast(`Couldn't save "${getSelectionLabel(selection)}": ${detail}`, "error");
}

export function warnDomEditPersistNoOp(
  selection: DomEditPersistFailureSelection,
  operations: PatchOperation[],
): void {
  console.warn("[Studio] DOM edit persist no-op", {
    target: getTargetTuple(selection),
    operations: summarizeOperations(operations),
    detail:
      "Server matched the target but reported no change even though the client believed the value changed.",
  });
}
