import {
  createStudioSaveHttpError,
  StudioSaveHttpError,
  trackStudioSaveFailure,
} from "../utils/studioSaveDiagnostics";
import { buildProjectApiPath } from "../utils/projectRouting";
import type { DomEditPatchBatch } from "./domEditCommitTypes";
import { formatFieldsSuffix } from "./gsapScriptCommitHelpers";
import { studioWriteHeaders } from "../utils/studioFileVersion";
import { studioApiFetch } from "../utils/studioApiFetch";
import { findUnsafeDomPatchValues } from "@hyperframes/core/studio-api/finite-mutation";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

export function formatUnsafeFieldList(fields: Array<{ path: string }>): string {
  return fields.map((field) => field.path).join(", ");
}

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readErrorResponseBody(
  response: Response,
): Promise<{ error?: string; fields?: string[] } | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return (await response.json().catch(() => null)) as { error?: string; fields?: string[] } | null;
}

function formatPatchRejectionMessage(body: { error?: string; fields?: string[] } | null): string {
  if (!body?.error) return "Couldn't save edit";
  return `Couldn't save edit: ${body.error}${formatFieldsSuffix(body.fields)}`;
}

/** Human-readable identifier for a batch patch target (for the unmatched warning). */
function describeBatchPatchTarget(patch: DomEditPatchBatch["patches"][number]): string {
  return patch.target.id ?? patch.target.hfId ?? patch.target.selector ?? "(unaddressed)";
}

/**
 * Surface server-reported unmatched patches. The server atomically refuses the
 * whole multi-file gesture; the caller uses `durable: false` to roll back and
 * reload, so report the refusal without turning it into a second failure.
 */
function reportUnmatchedBatchPatches(batch: DomEditPatchBatch, matched: boolean[]): void {
  const unmatchedIds = batch.patches
    .filter((_, index) => matched[index] === false)
    .map(describeBatchPatchTarget);
  if (unmatchedIds.length === 0) return;
  console.warn(
    `[studio] z-index reorder: server could not match ${unmatchedIds.length} patch target(s) in ` +
      `${batch.sourceFile} (the whole z-order gesture will revert on reload):`,
    unmatchedIds.join(", "),
  );
  trackStudioSaveFailure({
    source: "dom_edit",
    error: new Error(`Batch patch target(s) unmatched: ${unmatchedIds.join(", ")}`),
    filePath: batch.sourceFile,
    mutationType: "z-reorder-unmatched",
  });
}

interface AtomicElementPatchFile {
  sourceFile: string;
  changed: boolean;
  matched?: boolean[];
  before: string;
  after: string;
}

export class AtomicElementPatchConvergenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AtomicElementPatchConvergenceError";
  }
}

// Keep the atomic response contract in one guard so callers do not compose validity.
// fallow-ignore-next-line complexity
function isAtomicElementPatchFile(value: unknown): value is AtomicElementPatchFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourceFile" in value &&
    typeof value.sourceFile === "string" &&
    "changed" in value &&
    typeof value.changed === "boolean" &&
    (!("matched" in value) ||
      (Array.isArray(value.matched) &&
        value.matched.every((matched) => typeof matched === "boolean"))) &&
    "before" in value &&
    typeof value.before === "string" &&
    "after" in value &&
    typeof value.after === "string" &&
    value.changed === (value.before !== value.after)
  );
}

// This is the single client owner for dispatching and validating the aggregate
// atomic endpoint. Splitting validation from the request would weaken that wire contract.
// fallow-ignore-next-line complexity
export async function patchElementBatches(projectId: string, batches: DomEditPatchBatch[]) {
  const body = JSON.stringify({ batches });
  try {
    const response = await studioApiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/file-mutations/patch-element-batches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
        body,
      },
    );
    if (!response.ok) {
      const rejection = await readErrorResponseBody(response);
      throw new StudioSaveHttpError(formatPatchRejectionMessage(rejection), response.status);
    }
    const result: unknown = await response.json().catch(() => null);
    if (
      typeof result !== "object" ||
      result === null ||
      !("durable" in result) ||
      typeof result.durable !== "boolean" ||
      !("files" in result) ||
      !Array.isArray(result.files) ||
      result.files.length !== batches.length ||
      !result.files.every(isAtomicElementPatchFile) ||
      (!result.durable && result.files.some((file) => file.changed))
    ) {
      throw new StudioSaveHttpError("Invalid atomic element patch response", 502);
    }
    const files = result.files.map((file, index) => {
      const batch = batches[index];
      const matched = file.matched ?? [];
      if (
        !batch ||
        file.sourceFile !== batch.sourceFile ||
        (matched.length !== 0 && matched.length !== batch.patches.length)
      ) {
        throw new StudioSaveHttpError("Invalid atomic element patch response", 502);
      }
      reportUnmatchedBatchPatches(batch, matched);
      return {
        ...file,
        matched,
        allMatched: matched.length === batch.patches.length && matched.every(Boolean),
      };
    });
    return { durable: result.durable, files };
  } catch (error) {
    throw new AtomicElementPatchConvergenceError(getErrorDetail(error), { cause: error });
  }
}

/**
 * A batch is reload-skippable only when it is style-only: every operation is an
 * `inline-style` write. The z-reorder commit applies those exact styles to the
 * live iframe DOM synchronously, so persisting them adds nothing the preview
 * doesn't already show. Any other op type (attribute / text-content / …) can
 * have server-side semantics the live DOM hasn't mirrored — reload for those.
 */
export function batchesAreInlineStyleOnly(batches: DomEditPatchBatch[]): boolean {
  return batches.every((batch) =>
    batch.patches.every((patch) => patch.operations.every((op) => op.type === "inline-style")),
  );
}

export interface PatchElementResponse {
  ok?: boolean;
  changed?: boolean;
  matched?: boolean;
  content?: string;
  path?: string;
  version?: string;
  /** The patched element's id after the patch; absent when the target was not found. */
  elementId?: string | null;
}

type ShowToast = (message: string, tone?: "error" | "info") => void;

export async function postPatchElement(
  projectId: string,
  targetPath: string,
  body: unknown,
  showToast: ShowToast,
): Promise<PatchElementResponse> {
  const response = await studioApiFetch(
    buildProjectApiPath(
      projectId,
      `/file-mutations/patch-element/${encodeURIComponent(targetPath)}`,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    showToast(formatPatchRejectionMessage(await readErrorResponseBody(response)), "error");
    throw await createStudioSaveHttpError(response, `Failed to patch ${targetPath}`, {
      alreadyToasted: true,
    });
  }
  return (await response.json()) as PatchElementResponse;
}

interface AssignAutoIdParams {
  projectId: string;
  targetPath: string;
  selection: DomEditSelection;
  autoId: string;
  showToast: ShowToast;
}

/** The id the file holds for the element after proposing `autoId` (the server keeps or dedupes it); null if none. */
export async function assignGsapTargetAutoIdIfNeeded({
  projectId,
  targetPath,
  selection,
  autoId,
  showToast,
}: AssignAutoIdParams): Promise<string | null> {
  const patchBody = {
    target: {
      id: selection.id,
      hfId: selection.hfId,
      selector: selection.selector,
      selectorIndex: selection.selectorIndex,
    },
    operations: [{ type: "ensure-id", property: "id", value: autoId }],
  };
  if (findUnsafeDomPatchValues(patchBody).length > 0) {
    showToast("Couldn't assign element id because the patch contains invalid values", "error");
    return null;
  }
  try {
    const { elementId } = await postPatchElement(projectId, targetPath, patchBody, showToast);
    if (elementId) return elementId;
    showToast(`Couldn't assign element id: element not found in ${targetPath}`, "error");
    return null;
  } catch (error) {
    if (error instanceof StudioSaveHttpError && error.alreadyToasted) return null;
    throw error;
  }
}

export async function writePreparedContent(
  targetPath: string,
  patchedContent: string,
  prepare: (html: string, sourceFile: string) => string,
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>,
  showToast: ShowToast,
): Promise<{ content: string; failed: boolean }> {
  const preparedContent = prepare(patchedContent, targetPath);
  if (preparedContent === patchedContent) return { content: patchedContent, failed: false };
  try {
    await writeProjectFile(targetPath, preparedContent, patchedContent);
    return { content: preparedContent, failed: false };
  } catch (error) {
    showToast(
      `Saved, but couldn't finish updating ${targetPath}: ${getErrorDetail(error)}`,
      "error",
    );
    return { content: patchedContent, failed: true };
  }
}
