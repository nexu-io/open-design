import { useCallback, useRef } from "react";
import type { TimelineElement } from "../player";
import { toAuthoredStart } from "../player/store/timelineElement";
import { buildPatchTarget } from "../utils/timelineElementSplit";
import { buildProjectApiPath } from "../utils/projectRouting";
import { markStudioWriteToken } from "../utils/studioFileVersion";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";
import type { RecordEditInput } from "../utils/studioFileHistory";
import { studioApiFetch } from "../utils/studioApiFetch";

type ProjectFileWriter = (path: string, content: string, expectedContent?: string) => Promise<void>;

interface FreezeFrameResponse {
  before: string;
  after: string;
  version: string;
  stillPath: string;
}

function isFreezeFrameResponse(value: unknown): value is FreezeFrameResponse {
  if (typeof value !== "object" || value === null) return false;
  const body: Partial<Record<keyof FreezeFrameResponse, unknown>> = value;
  return (
    typeof body.before === "string" &&
    typeof body.after === "string" &&
    typeof body.version === "string" &&
    typeof body.stillPath === "string"
  );
}

function errorOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  return typeof value.error === "string" ? value.error : null;
}

async function readVersion(projectId: string, path: string): Promise<string> {
  const response = await studioApiFetch(
    buildProjectApiPath(projectId, `/files/${encodeURIComponent(path)}`),
  );
  const body: unknown = await response.json().catch(() => null);
  const version =
    typeof body === "object" && body !== null && "version" in body ? body.version : null;
  if (!response.ok || typeof version !== "string") throw new Error(`Could not read ${path}`);
  return version;
}

/** POST the freeze to studio-server, which extracts the still and writes the whole edit at once. */
export async function requestFreezeFrame(input: {
  projectId: string;
  path: string;
  element: TimelineElement;
  playhead: number;
}): Promise<FreezeFrameResponse> {
  const target = buildPatchTarget(input.element);
  if (!target) throw new Error("This clip has no id to freeze it by");
  const expectedVersion = await readVersion(input.projectId, input.path);
  const transactionToken = `freeze:${crypto.randomUUID()}`;
  markStudioWriteToken(transactionToken);
  const response = await studioApiFetch(
    buildProjectApiPath(input.projectId, "/file-mutations/freeze-frame"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hyperframes-Write-Token": transactionToken,
      },
      body: JSON.stringify({
        path: input.path,
        expectedVersion,
        target,
        playhead: toAuthoredStart(input.element, input.playhead),
        transactionToken,
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isFreezeFrameResponse(body)) {
    throw new Error(errorOf(body) ?? `Freeze frame failed (${response.status})`);
  }
  return body;
}

interface UseFreezeFrameOptions {
  projectId: string | null;
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: ProjectFileWriter;
  observeProjectFileVersion?: (path: string, version: string | null) => void;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  forceReloadSdkSession?: () => void;
  isRecordingRef?: React.RefObject<boolean>;
}

export function useFreezeFrame(options: UseFreezeFrameOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useCallback(async (element: TimelineElement, playhead: number) => {
    const opts = optionsRef.current;
    if (opts.isRecordingRef?.current) {
      opts.showToast("Cannot edit timeline while recording", "error");
      return;
    }
    const projectId = opts.projectId;
    if (!projectId) return;
    const path = element.sourceFile || opts.activeCompPath || "index.html";
    try {
      await serializeStudioFileMutations(opts.writeProjectFile, [path], async () => {
        const result = await requestFreezeFrame({ projectId, path, element, playhead });
        await opts.recordEdit({
          label: "Freeze frame",
          files: { [path]: { before: result.before, after: result.after } },
          created: [result.stillPath],
        });
        opts.observeProjectFileVersion?.(path, result.version);
      });
      opts.forceReloadSdkSession?.();
      opts.reloadPreview();
      opts.showToast(`Froze a 2 s still at ${playhead.toFixed(2)}s`, "info");
    } catch (error) {
      opts.showToast(error instanceof Error ? error.message : "Freeze frame failed", "error");
    }
  }, []);
}
