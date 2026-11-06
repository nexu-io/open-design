import { buildProjectApiPath } from "./projectRouting";

export interface FrameCaptureRequest {
  projectId: string;
  compositionPath: string | null;
  currentTime: number;
  origin?: string;
  version?: number;
}

function normalizeCompositionPath(compositionPath: string | null): string {
  return compositionPath && compositionPath !== "master" ? compositionPath : "index.html";
}

export function buildFrameCaptureUrl({
  projectId,
  compositionPath,
  currentTime,
  origin = window.location.origin,
  version = Date.now(),
}: FrameCaptureRequest): string {
  const compPath = normalizeCompositionPath(compositionPath);
  const url = new URL(
    buildProjectApiPath(projectId, `/thumbnail/${encodeURIComponent(compPath)}`),
    origin,
  );
  url.searchParams.set("t", Math.max(0, currentTime).toFixed(3));
  url.searchParams.set("format", "png");
  url.searchParams.set("output", "source");
  url.searchParams.set("v", String(version));
  return url.toString();
}

export function buildFrameCaptureFilename(compositionPath: string | null, currentTime: number) {
  const compPath = normalizeCompositionPath(compositionPath);
  const base =
    compPath
      .split("/")
      .pop()
      ?.replace(/\.html$/i, "") || "frame";
  const frameTime = Math.max(0, currentTime).toFixed(3).replace(".", "-");
  return `${base}-${frameTime}s.png`;
}
