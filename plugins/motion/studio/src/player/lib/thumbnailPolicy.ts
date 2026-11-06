export type ThumbnailMode = "adaptive" | "hidden";
export type ThumbnailRuntimePolicy = "follow-preference" | "force-hidden" | "legacy-default";

// "Adaptive" currently means the scheduler pauses rich work while scrolling.
// The mode name leaves room for finer-grained runtime heuristics later.

const rawPolicy = import.meta.env?.VITE_STUDIO_TIMELINE_THUMBNAIL_POLICY;

const studioThumbnailRuntimePolicy: ThumbnailRuntimePolicy =
  rawPolicy === "force-hidden" || rawPolicy === "legacy-default" ? rawPolicy : "follow-preference";

export function defaultThumbnailMode(
  storedMode: ThumbnailMode | undefined,
  policy: ThumbnailRuntimePolicy = studioThumbnailRuntimePolicy,
): ThumbnailMode {
  return storedMode ?? (policy === "legacy-default" ? "hidden" : "adaptive");
}

export function effectiveThumbnailMode(
  preferredMode: ThumbnailMode,
  policy: ThumbnailRuntimePolicy = studioThumbnailRuntimePolicy,
): ThumbnailMode {
  return policy === "force-hidden" ? "hidden" : preferredMode;
}
