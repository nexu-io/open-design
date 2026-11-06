import type { TimelineElement } from "../player";
import { toAuthoredStart } from "../player/store/timelineElement";
import type { RecordEditInput } from "../hooks/timelineEditingHelpers";
import { buildPatchTarget } from "./timelineElementSplit";
import { serializeStudioFileMutations } from "./studioFileMutationCoordinator";
import { buildProjectApiPath } from "./projectRouting";
import { markStudioWriteToken } from "./studioFileVersion";
import { resolveElementTrack } from "./studioHelpers";
import { studioApiFetch } from "./studioApiFetch";

type ProjectFileWriter = (path: string, content: string, expectedContent?: string) => Promise<void>;

interface CutTarget {
  target: NonNullable<ReturnType<typeof buildPatchTarget>>;
  originalId?: string;
  splitTime: number;
  elementStart: number;
  elementDuration: number;
  playbackStart?: number;
  playbackRate?: number;
  track?: number;
}

interface CutFileIntent {
  path: string;
  targets: CutTarget[];
}

interface CutFileResult {
  path: string;
  before: string;
  after: string;
  version: string;
  writeToken: string;
  splitCount: number;
  skippedSelectors: string[];
}

interface CutBatchResponse {
  ok: true;
  outcome: "committed";
  files: CutFileResult[];
}

export interface AtomicCutResult {
  splitCount: number;
  skippedSelectors: string[];
  syncFailed: boolean;
}

function targetIdentity(
  path: string,
  target: NonNullable<ReturnType<typeof buildPatchTarget>>,
): string {
  if (target.hfId) return `${path}|hf:${target.hfId}`;
  if (target.id) return `${path}|id:${target.id}`;
  return `${path}|selector:${target.selector ?? ""}:${target.selectorIndex ?? 0}`;
}

function buildCutTarget(
  element: TimelineElement,
  target: CutTarget["target"],
  splitTime: number,
): CutTarget {
  return {
    target,
    ...(element.domId ? { originalId: element.domId } : {}),
    splitTime: Math.max(0, toAuthoredStart(element, splitTime)),
    elementStart: toAuthoredStart(element, element.start),
    elementDuration: element.duration,
    ...(element.playbackStart != null ? { playbackStart: element.playbackStart } : {}),
    ...(element.playbackRate != null ? { playbackRate: element.playbackRate } : {}),
    // Pin both halves to the current track: unstamped, the runtime's positional
    // fallback (parseAuthoredTrack) renumbers the new sibling onto a new row.
    track: resolveElementTrack(element),
  };
}

/** Group one immutable cut time by file and collapse runtime aliases once. */
export function buildAtomicCutIntents(
  elements: readonly TimelineElement[],
  splitTime: number,
  activeCompPath: string | null,
): CutFileIntent[] {
  const byPath = new Map<string, CutFileIntent>();
  const seen = new Set<string>();
  for (const element of elements) {
    const target = buildPatchTarget(element);
    if (!target) throw new Error("Clip is missing a patchable target.");
    const path = element.sourceFile || activeCompPath || "index.html";
    const identity = targetIdentity(path, target);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const intent = byPath.get(path) ?? { path, targets: [] };
    intent.targets.push(buildCutTarget(element, target, splitTime));
    byPath.set(path, intent);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function readFileVersion(projectId: string, path: string): Promise<string> {
  const response = await studioApiFetch(
    buildProjectApiPath(projectId, `/files/${encodeURIComponent(path)}`),
  );
  if (!response.ok) throw new Error(`Failed to read ${path} before cut (${response.status})`);
  const body = (await response.json()) as { version?: string };
  const version = body.version ?? response.headers.get("etag") ?? undefined;
  if (!version) throw new Error(`Missing content version for ${path}`);
  return version;
}

async function requestAtomicCut(
  projectId: string,
  intents: CutFileIntent[],
): Promise<CutBatchResponse> {
  const files = [];
  for (const intent of intents) {
    files.push({
      ...intent,
      expectedVersion: await readFileVersion(projectId, intent.path),
    });
  }
  const transactionToken = `cut:${crypto.randomUUID()}`;
  markStudioWriteToken(transactionToken);
  const response = await studioApiFetch(
    buildProjectApiPath(projectId, "/file-mutations/split-batch"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hyperframes-Write-Token": transactionToken,
      },
      body: JSON.stringify({ files, transactionToken }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<CutBatchResponse> & { error?: string; outcome?: string })
    | null;
  if (!response.ok || body?.ok !== true || !Array.isArray(body.files)) {
    const prefix = response.status === 409 ? "Cut conflict" : "Cut failed";
    throw new Error(`${prefix}: ${body?.error ?? `server returned ${response.status}`}`);
  }
  return body as CutBatchResponse;
}

async function rollbackUnrecordedCut(
  files: readonly CutFileResult[],
  writeProjectFile: ProjectFileWriter,
): Promise<void> {
  const failures: unknown[] = [];
  for (const file of [...files].reverse()) {
    try {
      await writeProjectFile(file.path, file.before, file.after);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Cut history failed and externally changed files could not be safely restored",
    );
  }
}

interface RunAtomicCutInput {
  projectId: string;
  intents: CutFileIntent[];
  label: string;
  writeProjectFile: ProjectFileWriter;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  observeProjectFileVersion?: (path: string, version: string | null) => void;
  synchronize: () => void;
}

/** One coordinator owns request, history registration, safe rollback, and resync. */
export function runAtomicCutTransaction(input: RunAtomicCutInput): Promise<AtomicCutResult> {
  const paths = input.intents.map((intent) => intent.path);
  return serializeStudioFileMutations(input.writeProjectFile, paths, async () => {
    const result = await requestAtomicCut(input.projectId, input.intents);
    const snapshots = Object.fromEntries(
      result.files.map((file) => [file.path, { before: file.before, after: file.after }]),
    );
    try {
      await input.recordEdit({ label: input.label, files: snapshots });
    } catch (error) {
      try {
        await rollbackUnrecordedCut(result.files, input.writeProjectFile);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Cut aborted with rollback conflicts");
      }
      throw error;
    }

    for (const file of result.files) input.observeProjectFileVersion?.(file.path, file.version);
    let syncFailed = false;
    try {
      input.synchronize();
    } catch {
      syncFailed = true;
    }
    return {
      splitCount: result.files.reduce((count, file) => count + file.splitCount, 0),
      skippedSelectors: [...new Set(result.files.flatMap((file) => file.skippedSelectors))],
      syncFailed,
    };
  });
}
