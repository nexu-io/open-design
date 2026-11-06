import type {
  BackgroundRemovalProgress,
  BackgroundRemovalResult,
} from "./editor/propertyPanelTypes";

const MEDIA_JOB_RECONNECT_TIMEOUT_MS = 15_000;
const ABSOLUTE_OR_ROOT_SOURCE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

function parseSerializedColorGrading(value: string): { lut?: { src?: unknown } } | null {
  try {
    return JSON.parse(value) as { lut?: { src?: unknown } } | null;
  } catch {
    return null;
  }
}

function readLutSource(value: string | null): string {
  const src = value ? parseSerializedColorGrading(value)?.lut?.src : null;
  return typeof src === "string" ? src.trim() : "";
}

export function hasRelativeLutSource(value: string | null): boolean {
  const src = readLutSource(value);
  return src !== "" && !ABSOLUTE_OR_ROOT_SOURCE_RE.test(src);
}

function parseProgressEvent(event: Event): BackgroundRemovalProgress | Error {
  try {
    return JSON.parse((event as MessageEvent).data) as BackgroundRemovalProgress;
  } catch {
    return new Error("Invalid background-removal progress event");
  }
}

function getCompleteProgressResult(
  progress: BackgroundRemovalProgress,
): BackgroundRemovalResult | Error {
  if (!progress.outputPath) return new Error("Background removal finished without an output path");
  return {
    outputPath: progress.outputPath,
    backgroundOutputPath: progress.backgroundOutputPath,
    provider: progress.provider,
  };
}

function getTerminalProgressResult(
  progress: BackgroundRemovalProgress,
): BackgroundRemovalResult | Error | null {
  switch (progress.status) {
    case "complete":
      return getCompleteProgressResult(progress);
    case "failed":
      return new Error(progress.error || "Background removal failed");
    default:
      return null;
  }
}

export function waitForMediaJob(
  jobId: string,
  onProgress?: (progress: BackgroundRemovalProgress) => void,
  signal?: AbortSignal,
): Promise<BackgroundRemovalResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Background removal was cancelled", "AbortError"));
      return;
    }
    const events = new EventSource(`/api/media-jobs/${encodeURIComponent(jobId)}/progress`);
    let settled = false;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearReconnectTimer();
      signal?.removeEventListener("abort", handleAbort);
      events.close();
      callback();
    };
    const finishReject = (error: Error) => finish(() => reject(error));
    const finishResolve = (result: BackgroundRemovalResult) => finish(() => resolve(result));
    const handleAbort = () => {
      finishReject(new DOMException("Background removal was cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });

    // fallow-ignore-next-line complexity
    events.addEventListener("progress", (event) => {
      const progress = parseProgressEvent(event);
      if (progress instanceof Error) {
        finishReject(progress);
        return;
      }
      clearReconnectTimer();
      onProgress?.(progress);
      const terminalResult = getTerminalProgressResult(progress);
      if (!terminalResult) return;
      if (terminalResult instanceof Error) {
        finishReject(terminalResult);
      } else {
        finishResolve(terminalResult);
      }
    });
    events.onopen = clearReconnectTimer;
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) {
        finishReject(new Error("Lost connection to background-removal job"));
        return;
      }
      if (reconnectTimer === null) {
        reconnectTimer = window.setTimeout(() => {
          finishReject(new Error("Lost connection to background-removal job"));
        }, MEDIA_JOB_RECONNECT_TIMEOUT_MS);
      }
    };
  });
}
