import { applyPreviewVariablesToUrl } from "../hooks/previewVariablesStore";
import { buildProjectApiPath, parseProjectIdFromHash } from "./projectRouting";
import { studioApiFetch } from "./studioApiFetch";

let prefetched: string | null = null;

/** Requests the URL's project preview while Studio boots, so the server builds it in parallel. */
export function prefetchPreviewForHash(hash: string): void {
  const projectId = parseProjectIdFromHash(hash);
  if (!projectId || projectId === prefetched) return;
  prefetched = projectId;
  const url = new URL(buildProjectApiPath(projectId, "/preview"), window.location.origin);
  applyPreviewVariablesToUrl(url);
  studioApiFetch(url).catch(() => undefined);
}
