import { useMemo } from "react";
import { compositionThumbnailRequest } from "../player/components/CompositionThumbnail";
import type { ThumbnailPriority } from "../player/lib/thumbnailScheduler";
import { useThumbnailLease } from "./useThumbnailLease";

export interface UseThumbnailStillOptions {
  sessionEpoch?: number;
  priority?: ThumbnailPriority;
}

export type ThumbnailStill =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "failed" };

const LOADING: ThumbnailStill = Object.freeze({ status: "loading" });
const FAILED: ThumbnailStill = Object.freeze({ status: "failed" });

/** A host picture's server still through the thumbnail scheduler, so it yields to a preview reload. */
export function useThumbnailStill(
  url: string | null,
  projectId: string,
  { sessionEpoch = 0, priority = "visible" }: UseThumbnailStillOptions = {},
): ThumbnailStill {
  const request = useMemo(
    () => (url ? compositionThumbnailRequest(url, projectId, { sessionEpoch, priority }) : null),
    [priority, projectId, sessionEpoch, url],
  );
  const snapshot = useThumbnailLease(request);
  const ready =
    snapshot.status === "ready" && snapshot.value.kind === "image" ? snapshot.value.url : null;
  return useMemo(
    () =>
      ready ? { status: "ready", url: ready } : snapshot.status === "error" ? FAILED : LOADING,
    [ready, snapshot.status],
  );
}
