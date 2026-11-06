export const TIMELINE_COMPOSITION_MIME = "application/x-hyperframes-composition";

export interface TimelineCompositionPayload {
  sourcePath: string;
}

export function parseTimelineCompositionPayload(raw: string): TimelineCompositionPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("sourcePath" in value)) return null;
    const sourcePath = value.sourcePath;
    return typeof sourcePath === "string" && sourcePath.trim() ? { sourcePath } : null;
  } catch {
    return null;
  }
}
