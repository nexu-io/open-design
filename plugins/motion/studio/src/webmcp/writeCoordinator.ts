import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { parseElementHandle, resolveLiveHandleSelection } from "./handles";
import { toolFailure, type ToolFailure, type ToolFailureKind } from "./toolResult";

export type StudioWriteOperation =
  | "set-text"
  | "set-style"
  | "transform"
  | "add-animation"
  | "update-animation"
  | "add-keyframe"
  | "delete-animation";

export const WRITE_RECEIPT_DESCRIPTION =
  "Read `stage` as the proof level: refused, dispatched, saved, verified, or failed. " +
  "`changed` is separate, and evidence explains what was actually proven.";

export interface StudioWriteTarget {
  handle: string;
  sourceFile: string;
}

export type StudioWriteEvidence =
  | { kind: "dispatch"; followUp: "studio_inspect" }
  | { kind: "content-version"; sourceFile: string; version: string }
  | {
      kind: "readback";
      sourceFile: string;
      version: string;
      before: unknown;
      after: unknown;
    };

export type StudioWriteAdapterSuccess<T extends object> = T & {
  ok: true;
  stage: "dispatched" | "saved" | "verified";
  changed: boolean;
  evidence: StudioWriteEvidence;
};

type StudioWriteAdapterResult<T extends object> = StudioWriteAdapterSuccess<T> | ToolFailure;

export type StudioWriteResult<T extends object> =
  | (T & {
      ok: true;
      stage: "dispatched" | "saved" | "verified";
      target: StudioWriteTarget;
      operation: StudioWriteOperation;
      changed: boolean;
      evidence: StudioWriteEvidence;
      cancelRequested?: true;
    })
  | (ToolFailure & {
      stage: "refused" | "failed";
      target?: StudioWriteTarget;
      operation: StudioWriteOperation;
      cancelRequested?: true;
    });

export interface TargetedWriteDeps {
  getPreviewDocument: () => Document | null;
  getProjectId: () => string | null;
  getWriteBlockedReason: () => string | null;
  buildSelection: (element: HTMLElement) => Promise<DomEditSelection | null>;
  applySelection: (selection: DomEditSelection) => void;
}

export type StudioEditLifecycleState =
  | { phase: "idle" }
  | {
      callId: string;
      projectId: string;
      target: StudioWriteTarget;
      operation: StudioWriteOperation;
      targetChanged: boolean;
      phase: "dispatching" | "dispatched" | "saved" | "verified" | "failed";
      receipt?: StudioWriteResult<object>;
    };

type LifecycleListener = () => void;

class StudioEditLifecycle {
  private state: StudioEditLifecycleState = { phase: "idle" };
  private listeners = new Set<LifecycleListener>();
  private lastTerminalTarget: { projectId: string; handle: string } | null = null;
  private activeProjectId: string | null = null;
  private callSequence = 0;

  getSnapshot = (): StudioEditLifecycleState => this.state;

  subscribe = (listener: LifecycleListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  begin(projectId: string, target: StudioWriteTarget, operation: StudioWriteOperation): string {
    this.activateProject(projectId);
    const callId = `studio-edit-${++this.callSequence}`;
    const previous = this.lastTerminalTarget;
    const targetChanged =
      previous === null || previous.projectId !== projectId || previous.handle !== target.handle;
    this.publish({
      callId,
      projectId,
      target,
      operation,
      targetChanged,
      phase: "dispatching",
    });
    return callId;
  }

  finish(callId: string, receipt: StudioWriteResult<object>): void {
    if (this.state.phase === "idle" || this.state.callId !== callId) return;
    this.lastTerminalTarget = {
      projectId: this.state.projectId,
      handle: this.state.target.handle,
    };
    this.publish({
      ...this.state,
      phase: receipt.ok ? receipt.stage : "failed",
      receipt,
    });
  }

  /** Clear only the invocation that still owns the visual lifecycle. */
  dismiss(callId: string): void {
    if (this.state.phase === "idle" || this.state.callId !== callId) return;
    this.publish({ phase: "idle" });
  }

  reset(): void {
    this.activeProjectId = null;
    this.lastTerminalTarget = null;
    this.publish({ phase: "idle" });
  }

  activateProject(projectId: string | null): void {
    if (this.activeProjectId === projectId) return;
    this.activeProjectId = projectId;
    this.lastTerminalTarget = null;
    this.publish({ phase: "idle" });
  }

  private publish(state: StudioEditLifecycleState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

/** One state owner shared by the coordinator and Studio's future overlay. */
export const studioEditLifecycle = new StudioEditLifecycle();

interface TargetedWriteInput<T extends object> {
  handle: unknown;
  operation: StudioWriteOperation;
  signal: AbortSignal;
  preflight?: (selection: DomEditSelection) => ToolFailure | null | Promise<ToolFailure | null>;
  write: (selection: DomEditSelection) => Promise<StudioWriteAdapterResult<T>>;
}

type ResolvedWriteSelection =
  | { ok: true; selection: DomEditSelection }
  | { ok: false; failure: ToolFailure };

async function resolveWriteSelection(
  deps: TargetedWriteDeps,
  handle: string,
): Promise<ResolvedWriteSelection> {
  const resolved = await resolveLiveHandleSelection(
    deps.getPreviewDocument,
    handle,
    deps.buildSelection,
  );
  if (resolved.status === "preview-unavailable") {
    return { ok: false, failure: toolFailure("blocked", "the composition preview is not ready") };
  }
  if (resolved.status === "not-found") {
    return {
      ok: false,
      failure: toolFailure("invalid", "the target handle is stale", "Call studio_look and retry."),
    };
  }
  if (resolved.status === "unsupported") {
    return {
      ok: false,
      failure: toolFailure(
        "blocked",
        "the target resolved to an element Studio cannot edit",
        "Try a parent or child element from studio_look.",
      ),
    };
  }
  if (resolved.status === "changed") {
    return {
      ok: false,
      failure: toolFailure(
        "invalid",
        "the target changed while it was resolving",
        "Call studio_look again.",
      ),
    };
  }
  return { ok: true, selection: resolved.selection };
}

function refusedResult<T extends object>(
  operation: StudioWriteOperation,
  failure: ToolFailure,
  cancelRequested = false,
): StudioWriteResult<T> {
  return {
    ...failure,
    stage: "refused",
    operation,
    ...(cancelRequested ? { cancelRequested: true as const } : {}),
  };
}

function completedWrite<T extends object>(
  adapter: StudioWriteAdapterResult<T>,
  target: StudioWriteTarget,
  operation: StudioWriteOperation,
  cancelRequested: boolean,
): StudioWriteResult<T> {
  const cancellation = cancelRequested ? { cancelRequested: true as const } : {};
  return adapter.ok
    ? { ...adapter, target, operation, ...cancellation }
    : { ...asFailed(adapter), stage: "failed", target, operation, ...cancellation };
}

function classifyThrownError(error: unknown): { kind: ToolFailureKind; reason: string } {
  return {
    kind: error instanceof TypeError || error instanceof ReferenceError ? "internal" : "failed",
    reason: error instanceof Error ? error.message : String(error),
  };
}

type ValidatedWriteAddress<T extends object> =
  | { ok: true; handle: string; projectId: string }
  | { ok: false; result: StudioWriteResult<T> };

function validateProjectScopedHandle<T extends object>(
  handle: string,
  projectId: string,
  operation: StudioWriteOperation,
): StudioWriteResult<T> | null {
  const parsedHandle = parseElementHandle(handle);
  if (!parsedHandle || parsedHandle.version !== 2 || !parsedHandle.projectId) {
    return refusedResult(
      operation,
      toolFailure(
        "invalid",
        "writes require a current project-scoped handle from studio_look",
        "Call studio_look again and pass the returned handle unchanged.",
      ),
    );
  }
  if (parsedHandle.projectId === projectId) return null;
  return refusedResult(
    operation,
    toolFailure(
      "invalid",
      "the handle belongs to a different project",
      "Call studio_look in the active project.",
    ),
  );
}

function validateWriteAddress<T extends object>(
  deps: TargetedWriteDeps,
  input: TargetedWriteInput<T>,
): ValidatedWriteAddress<T> {
  if (input.signal.aborted) {
    return {
      ok: false,
      result: refusedResult(
        input.operation,
        toolFailure("blocked", "the write was cancelled before dispatch"),
        true,
      ),
    };
  }
  if (typeof input.handle !== "string" || !input.handle) {
    return {
      ok: false,
      result: refusedResult(
        input.operation,
        toolFailure("invalid", "handle must name an element from studio_look"),
      ),
    };
  }
  const projectId = deps.getProjectId();
  if (!projectId) {
    return {
      ok: false,
      result: refusedResult(input.operation, toolFailure("blocked", "there is no active project")),
    };
  }
  const handleFailure = validateProjectScopedHandle<T>(input.handle, projectId, input.operation);
  if (handleFailure) return { ok: false, result: handleFailure };
  const blocked = deps.getWriteBlockedReason();
  if (blocked) {
    return {
      ok: false,
      result: refusedResult(
        input.operation,
        toolFailure("blocked", blocked, "Resolve it in Studio, then retry."),
      ),
    };
  }
  return { ok: true, handle: input.handle, projectId };
}

type PreparedWriteSelection<T extends object> =
  | { ok: true; selection: DomEditSelection }
  | { ok: false; result: StudioWriteResult<T> };

async function prepareWriteSelection<T extends object>(
  deps: TargetedWriteDeps,
  input: TargetedWriteInput<T>,
  handle: string,
): Promise<PreparedWriteSelection<T>> {
  const resolved = await resolveWriteSelection(deps, handle);
  if (!resolved.ok) {
    return { ok: false, result: refusedResult(input.operation, resolved.failure) };
  }
  const { selection } = resolved;
  if (selection.isInsideLockedComposition) {
    return {
      ok: false,
      result: refusedResult(
        input.operation,
        toolFailure("blocked", "the target is inside a locked composition"),
      ),
    };
  }
  const preflight = await input.preflight?.(selection);
  if (preflight) return { ok: false, result: refusedResult(input.operation, preflight) };
  if (input.signal.aborted) {
    return {
      ok: false,
      result: refusedResult(
        input.operation,
        toolFailure("blocked", "the write was cancelled before dispatch"),
        true,
      ),
    };
  }
  return { ok: true, selection };
}

export async function runTargetedWrite<T extends object>(
  deps: TargetedWriteDeps,
  input: TargetedWriteInput<T>,
): Promise<StudioWriteResult<T>> {
  const address = validateWriteAddress(deps, input);
  if (!address.ok) return address.result;
  let prepared: PreparedWriteSelection<T>;
  try {
    prepared = await prepareWriteSelection(deps, input, address.handle);
  } catch (error) {
    const { kind, reason } = classifyThrownError(error);
    if (kind === "internal") console.error(`[hf-webmcp] ${input.operation} preflight threw`, error);
    return refusedResult(input.operation, toolFailure(kind, reason));
  }
  if (!prepared.ok) return prepared.result;
  if (deps.getProjectId() !== address.projectId) {
    return refusedResult(
      input.operation,
      toolFailure(
        "blocked",
        "the active project changed while the target was resolving",
        "Call studio_look in the active project and retry.",
      ),
    );
  }
  const { selection } = prepared;
  const target = { handle: address.handle, sourceFile: selection.sourceFile };
  deps.applySelection(selection);
  const callId = studioEditLifecycle.begin(address.projectId, target, input.operation);
  let adapter: StudioWriteAdapterResult<T>;
  try {
    adapter = await input.write(selection);
  } catch (error) {
    const { kind, reason } = classifyThrownError(error);
    if (kind === "internal") console.error(`[hf-webmcp] ${input.operation} threw`, error);
    const result: StudioWriteResult<T> = {
      ok: false,
      kind,
      reason,
      stage: "failed",
      target,
      operation: input.operation,
      ...(input.signal.aborted ? { cancelRequested: true as const } : {}),
    };
    studioEditLifecycle.finish(callId, result);
    return result;
  }
  const result = completedWrite(adapter, target, input.operation, input.signal.aborted);
  studioEditLifecycle.finish(callId, result);
  return result;
}

function asFailed(failure: ToolFailure): ToolFailure {
  const kind: ToolFailureKind =
    failure.kind === "invalid" || failure.kind === "blocked" ? "failed" : failure.kind;
  return { ...failure, kind };
}

export function dispatched<T extends object>(
  value: T,
  changed: boolean,
): StudioWriteAdapterSuccess<T> & {
  stage: "dispatched";
  evidence: { kind: "dispatch"; followUp: "studio_inspect" };
} {
  return {
    ok: true,
    ...value,
    stage: "dispatched",
    changed,
    evidence: { kind: "dispatch", followUp: "studio_inspect" },
  };
}

export function saved<T extends object>(
  value: T,
  persistence: { sourceFile: string; version: string; changed: boolean },
): StudioWriteAdapterSuccess<T> & {
  stage: "saved";
  evidence: { kind: "content-version"; sourceFile: string; version: string };
} {
  return {
    ok: true,
    ...value,
    stage: "saved",
    changed: persistence.changed,
    evidence: {
      kind: "content-version",
      sourceFile: persistence.sourceFile,
      version: persistence.version,
    },
  };
}

export function verified<T extends object>(
  value: T,
  persistence: { sourceFile: string; version: string; changed: boolean },
  readback: { before: unknown; after: unknown },
): StudioWriteAdapterSuccess<T> & {
  stage: "verified";
  evidence: {
    kind: "readback";
    sourceFile: string;
    version: string;
    before: unknown;
    after: unknown;
  };
} {
  return {
    ok: true,
    ...value,
    stage: "verified",
    changed: persistence.changed,
    evidence: {
      kind: "readback",
      sourceFile: persistence.sourceFile,
      version: persistence.version,
      ...readback,
    },
  };
}
