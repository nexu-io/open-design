import type { EditContextTarget } from "./studioFileHistory";
import { openComposition, type Composition } from "@hyperframes/sdk";
import { hashContent, markSelfWrite } from "../hooks/sdkSelfWriteRegistry";
import { trackStudioEvent } from "./studioTelemetry";
import { serializeStudioFileMutation } from "./studioFileMutationCoordinator";
import type { StudioSdkOperationFamily } from "./sdkCutoverPolicy";
import {
  StudioFileConflictError,
  StudioSaveHttpError,
  StudioSaveNetworkError,
} from "./studioSaveDiagnostics";

export type CutoverResult =
  | { status: "declined"; reason: string }
  | { status: "committed"; version: string; before: string; after: string }
  | { status: "failed"; error: Error };

export interface SdkSessionPublication {
  candidate: Composition;
  expectedSession: Composition;
  targetPath: string;
}

export type SdkSessionPublicationResult =
  | "published"
  | "rejected-active-target"
  | "rejected-inactive-target";

export type PublishSdkSession = (publication: SdkSessionPublication) => SdkSessionPublicationResult;

export interface CutoverDeps {
  editHistory: {
    recordEdit: (entry: {
      label: string;
      targets?: EditContextTarget[];
      coalesceKey?: string;
      coalesceMs?: number;
      files: Record<string, { before: string; after: string }>;
    }) => Promise<void>;
  };
  /**
   * Must be bound to one project. Its identity plus path scopes the shared
   * mutation queue used by every whole-file writer in that project.
   */
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  reloadPreview: () => void;
  refresh?: (after: string) => void;
  compositionPath?: string | null;
  readProjectFile?: (path: string) => Promise<string>;
  /**
   * Takes ownership only when it returns `published`. Rejection identifies
   * whether target-sensitive preview refresh is still safe. MUST NOT throw
   * after installation; rejection leaves ownership with the caller.
   */
  publishSession?: PublishSdkSession;
  /** Test seam; production clones with openComposition. */
  createCandidateSession?: (serialized: string, live: Composition) => Promise<Composition>;
}

export interface CutoverOptions {
  targets?: EditContextTarget[];
  label?: string;
  coalesceKey?: string;
  /** Coalesce window (ms); Infinity folds across a slow round-trip. */
  coalesceMs?: number;
  skipRefresh?: boolean;
}

interface CandidateEdit {
  live: Composition;
  candidate: Composition;
  serializedBefore: string;
  after: string;
}

/**
 * Explicit fall-back to the legacy server path. Emits `sdk_cutover_declined` so
 * post-flip we can distinguish "SDK took the edit" from "SDK bowed out"; payload
 * is reason + family only (no hfId / path / content).
 *
 * `resolverDisagreement` is the one extra field with diagnostic value beyond the
 * reason itself: on a `target_not_found`, the shadow's `resolveSnapshot` (what
 * dispatch resolves) found the element that `getElement` could not. The shadow
 * event stays silent in that case, so without this flag the case is invisible —
 * and it is an adoption loss (a dispatchable edit refused), not a missing node.
 */
export function declinedCutover(
  reason: string,
  family?: StudioSdkOperationFamily,
  resolverDisagreement?: boolean,
): CutoverResult {
  trackStudioEvent("sdk_cutover_declined", {
    reason,
    family: family ?? null,
    ...(resolverDisagreement ? { resolverDisagreement: true } : {}),
  });
  return { status: "declined", reason };
}

function asCutoverError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Browser rejection strings for a fetch that never produced a response (offline,
// the dev server gone, a CSP/PNA block, an extension rewriting fetch). See
// `useSdkSession.ts`'s `readProjectFileOptional` catch for the same list.
const FETCH_REJECTION_MESSAGE = /Failed to fetch|Load failed|NetworkError when attempting to fetch/;

/**
 * Classify a cutover failure for the gate dashboard. `writeProjectFile`'s own
 * fetch wraps a rejection as `StudioSaveNetworkError`, but two raw fetches in
 * this same transaction — `readProjectFile` (via `captureOnDiskBefore`) and
 * `writeProjectFile`'s own read-before-write preflight — throw an unwrapped
 * `TypeError` that reaches here undecorated. Without the message fallback,
 * those file as `"sdk"` and trip the cutover-failure rollback gate on a
 * network blip the SDK never had a chance to own.
 */
function cutoverErrorKind(error: Error): "network" | "conflict" | "http" | "sdk" {
  if (error instanceof StudioSaveNetworkError) return "network";
  if (error instanceof StudioFileConflictError) return "conflict";
  if (error instanceof StudioSaveHttpError) return "http";
  if (error.name === "TypeError" && FETCH_REJECTION_MESSAGE.test(error.message)) return "network";
  return "sdk";
}

/**
 * Record a cutover that could not commit. Replaces ad hoc `trackStudioEvent("sdk_cutover_failed", ...)`
 * calls so every gate event carries `family` and `error_kind` — without them the
 * dashboard's rollback gate (any `sdk_cutover_failed` on a flipped version) cannot
 * distinguish a real SDK defect from a rejected fetch it doesn't own.
 */
export function failedCutover(
  error: unknown,
  family: StudioSdkOperationFamily,
  context: { hfId?: string | null; opCount?: number } = {},
): CutoverResult {
  const err = asCutoverError(error);
  trackStudioEvent("sdk_cutover_failed", {
    ...context,
    family,
    error_kind: cutoverErrorKind(err),
    ...(err instanceof StudioSaveHttpError ? { status: err.statusCode } : {}),
    error: err.message,
  });
  return { status: "failed", error: err };
}

/** Only an explicit decline may enter the legacy mutation backend. */
export function cutoverCommittedOrThrow(
  result: CutoverResult,
): result is Extract<CutoverResult, { status: "committed" }> {
  if (result.status === "failed") throw result.error;
  return result.status === "committed";
}

/** A supplied authoritative reader fails closed; only its absence uses the snapshot fallback. */
async function captureOnDiskBefore(
  deps: CutoverDeps,
  targetPath: string,
  serializedFallback: string,
): Promise<string> {
  if (!deps.readProjectFile) return serializedFallback;
  return deps.readProjectFile(targetPath);
}

function disposeCandidate(candidate: Composition | undefined, live: Composition): void {
  if (candidate && candidate !== live) candidate.dispose();
}

function createCandidateSession(
  serializedBefore: string,
  live: Composition,
  deps: CutoverDeps,
): Promise<Composition> {
  return deps.createCandidateSession
    ? deps.createCandidateSession(serializedBefore, live)
    : openComposition(serializedBefore, { history: false });
}

function candidatePublisherAvailable(
  candidate: Composition,
  live: Composition,
  deps: CutoverDeps,
): boolean {
  return candidate === live || deps.publishSession !== undefined;
}

async function buildCandidateEdit(
  live: Composition,
  deps: CutoverDeps,
  mutate: (candidate: Composition) => void,
  sourceSnapshot?: string,
): Promise<CandidateEdit | CutoverResult> {
  let candidate: Composition | undefined;
  try {
    const serializedBefore = sourceSnapshot ?? live.serialize();
    candidate = await createCandidateSession(serializedBefore, live, deps);
    candidate.batch(() => mutate(candidate!));
    const after = candidate.serialize();
    if (after === serializedBefore) {
      disposeCandidate(candidate, live);
      return declinedCutover("no_change");
    }
    if (!candidatePublisherAvailable(candidate, live, deps)) {
      disposeCandidate(candidate, live);
      return { status: "failed", error: new Error("SDK candidate publisher is unavailable") };
    }
    return { live, candidate, serializedBefore, after };
  } catch (error) {
    disposeCandidate(candidate, live);
    return { status: "failed", error: asCutoverError(error) };
  }
}

function isCutoverResult(value: CandidateEdit | CutoverResult): value is CutoverResult {
  return "status" in value;
}

async function rollbackWrite(
  targetPath: string,
  originalContent: string,
  expectedCurrentContent: string,
  deps: CutoverDeps,
  cause: Error,
): Promise<Error> {
  try {
    markSelfWrite(targetPath, originalContent);
    await deps.writeProjectFile(targetPath, originalContent, expectedCurrentContent);
    return cause;
  } catch (rollbackError) {
    return new AggregateError(
      [cause, asCutoverError(rollbackError)],
      `SDK edit failed and rollback could not restore ${targetPath}`,
    );
  }
}

function historyEntryOptions(options?: CutoverOptions) {
  return {
    label: options?.label ?? "Edit layer",
    ...(options?.targets && { targets: options.targets }),
    ...(options?.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
    ...(options?.coalesceMs != null ? { coalesceMs: options.coalesceMs } : {}),
  };
}

async function writeAndRecord(
  after: string,
  targetPath: string,
  originalContent: string,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<Error | null> {
  markSelfWrite(targetPath, after);
  try {
    await deps.writeProjectFile(targetPath, after, originalContent);
  } catch (error) {
    return asCutoverError(error);
  }
  try {
    await deps.editHistory.recordEdit({
      ...historyEntryOptions(options),
      files: { [targetPath]: { before: originalContent, after } },
    });
    return null;
  } catch (error) {
    return rollbackWrite(targetPath, originalContent, after, deps, asCutoverError(error));
  }
}

function refreshCommittedEdit(after: string, deps: CutoverDeps, options?: CutoverOptions): void {
  try {
    if (deps.refresh) deps.refresh(after);
    else if (!options?.skipRefresh) deps.reloadPreview();
  } catch (error) {
    trackStudioEvent("sdk_cutover_refresh_failed", { error: asCutoverError(error).message });
  }
}

async function commitCandidateEdit(
  edit: CandidateEdit,
  targetPath: string,
  originalContent: string,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<CutoverResult> {
  const writeError = await writeAndRecord(edit.after, targetPath, originalContent, deps, options);
  if (writeError) {
    if (edit.candidate !== edit.live) edit.candidate.dispose();
    return { status: "failed", error: writeError };
  }
  let refreshTarget = true;
  try {
    if (edit.candidate !== edit.live) {
      const publication = deps.publishSession!({
        candidate: edit.candidate,
        expectedSession: edit.live,
        targetPath,
      });
      if (publication !== "published") edit.candidate.dispose();
      if (publication === "rejected-inactive-target") refreshTarget = false;
    }
  } catch (error) {
    // Persistence and history are already committed. A publisher can throw
    // after installing the candidate, so rolling back disk or disposing the
    // candidate here can make all three authorities disagree (or dispose the
    // now-live session). Production publishers are non-throwing; keep the
    // durable commit authoritative and surface this post-commit fault.
    trackStudioEvent("sdk_cutover_publish_failed", {
      path: targetPath,
      error: asCutoverError(error).message,
    });
  }
  if (refreshTarget) refreshCommittedEdit(edit.after, deps, options);
  return {
    status: "committed",
    version: hashContent(edit.after),
    before: originalContent,
    after: edit.after,
  };
}

export async function persistSdkCandidateMutation(
  live: Composition,
  targetPath: string,
  originalContent: string,
  deps: CutoverDeps,
  mutate: (candidate: Composition) => void,
  options?: CutoverOptions,
  sourceSnapshot?: string,
): Promise<CutoverResult> {
  return serializeStudioFileMutation(
    deps.writeProjectFile,
    targetPath,
    async (): Promise<CutoverResult> => {
      // Re-read only after acquiring the path queue. This makes each candidate
      // clone the latest committed bytes, even when React has not yet re-rendered
      // and the caller still holds the preceding live-session object.
      const serializedFallback = sourceSnapshot ?? originalContent;
      let onDiskBefore: string;
      try {
        onDiskBefore = await captureOnDiskBefore(deps, targetPath, serializedFallback);
      } catch (error) {
        return { status: "failed", error: asCutoverError(error) };
      }
      // Preserve the live-session path for adapters without a reader (notably
      // isolated consumers/tests). Production Studio supplies a reader so
      // queued edits always clone the latest durable source.
      const candidateSource = deps.readProjectFile ? onDiskBefore : sourceSnapshot;
      const candidate = await buildCandidateEdit(live, deps, mutate, candidateSource);
      if (isCutoverResult(candidate)) return candidate;
      return commitCandidateEdit(candidate, targetPath, onDiskBefore, deps, options);
    },
  );
}

/** Transactional writer for non-SDK islands and throwaway composition sessions. */
export async function persistSdkSerialize(
  buildAfter: (onDiskBefore: string) => string | Promise<string>,
  targetPath: string,
  originalContent: string,
  deps: CutoverDeps,
  options?: CutoverOptions,
): Promise<void> {
  await serializeStudioFileMutation(deps.writeProjectFile, targetPath, async () => {
    const onDiskBefore = await captureOnDiskBefore(deps, targetPath, originalContent);
    const after = await buildAfter(onDiskBefore);
    if (after === onDiskBefore) return;
    const error = await writeAndRecord(after, targetPath, onDiskBefore, deps, options);
    if (error) throw error;
    refreshCommittedEdit(after, deps, options);
  });
}
