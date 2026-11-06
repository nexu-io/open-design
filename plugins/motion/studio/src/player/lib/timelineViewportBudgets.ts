export interface TimelineViewportBudgets {
  directScrollSafetyPx: number;
  rowOverscanPerSide: number;
  timeOverscanViewportRatio: number;
  maxMountedRows: number;
  maxMountedClipRoots: number;
  maxMountedClipRootsPerRow: number;
  maxMountedTimelineDescendants: number;
  posterMaxPhysicalWidth: number;
  posterMaxPhysicalHeight: number;
  posterDprCap: number;
  richPreviewFrameCount: number;
  concurrentVideoDecodes: number;
  concurrentMetadataJobs: number;
  concurrentCompositionFetches: number;
  concurrentServerPages: number;
  thumbnailLoadTimeoutMs: number;
  thumbnailCacheBytes: number;
  sharedFrameCacheBytes: number;
  thumbnailSourceIdleMs: number;
  thumbnailCacheEntries: number;
  thumbnailCacheEntriesPerProject: number;
  metadataRegistryEntries: number;
  metadataFailureTtlMs: number;
  waveformCacheBytes: number;
  waveformCacheEntries: number;
  compositionDiskCacheBytes: number;
  compositionDiskCacheMaxAgeMs: number;
  interactionP95Ms: number;
  frameIntervalP95Ms: number;
  constrainedInteractionP95Ms: number;
  constrainedFrameIntervalP95Ms: number;
  ciVirtualizedInteractionP95Ms: number;
  ciVirtualizedFrameIntervalP95Ms: number;
  longTaskLimitMs: number;
  constrainedLongTaskLimitMs: number;
  memoryReturnToleranceRatio: number;
  posterColdP95Ms: number;
  posterCachedP95Ms: number;
  constrainedPosterColdP95Ms: number;
  constrainedPosterCachedP95Ms: number;
  posterCoverageRatio: number;
  posterCoverageSettleMs: number;
  constrainedPosterCoverageSettleMs: number;
  richPreviewP95Ms: number;
  constrainedRichPreviewP95Ms: number;
  supportedFixtureFallbackRatio: number;
  scrollSamplesPerRun: number;
  warmupRuns: number;
  measuredRuns: number;
  requiredPassingRuns: number;
}

const MEBIBYTE = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_VISIBLE_THUMBNAIL_FRAMES = Math.ceil(3840 / (66 * (16 / 9))); // Decode-memory cap, 4K width / a 66 px 16:9 tile; 40 px clips reuse frames past it.

/**
 * The sole default budget owner for timeline viewport and media virtualization.
 * Consumers may resolve an immutable per-test override; production defaults are
 * never mutated globally.
 */
export const TIMELINE_VIEWPORT_BUDGETS: Readonly<TimelineViewportBudgets> = Object.freeze({
  directScrollSafetyPx: 8_000_000,
  rowOverscanPerSide: 2,
  timeOverscanViewportRatio: 0.25,
  maxMountedRows: 64,
  maxMountedClipRoots: 512,
  maxMountedClipRootsPerRow: 128,
  maxMountedTimelineDescendants: 5_000,
  posterMaxPhysicalWidth: 240,
  posterMaxPhysicalHeight: 135,
  posterDprCap: 1.5,
  richPreviewFrameCount: MAX_VISIBLE_THUMBNAIL_FRAMES,
  concurrentVideoDecodes: 2,
  concurrentMetadataJobs: 4,
  concurrentCompositionFetches: 2,
  concurrentServerPages: 1,
  thumbnailLoadTimeoutMs: 30_000,
  thumbnailCacheBytes: 64 * MEBIBYTE,
  sharedFrameCacheBytes: 32 * MEBIBYTE,
  thumbnailSourceIdleMs: 10_000,
  thumbnailCacheEntries: 256,
  thumbnailCacheEntriesPerProject: 96,
  metadataRegistryEntries: 512,
  metadataFailureTtlMs: 30_000,
  waveformCacheBytes: 16 * MEBIBYTE,
  waveformCacheEntries: 256,
  compositionDiskCacheBytes: 512 * MEBIBYTE,
  compositionDiskCacheMaxAgeMs: 14 * DAY_MS,
  interactionP95Ms: 50,
  frameIntervalP95Ms: 33.3,
  constrainedInteractionP95Ms: 75,
  constrainedFrameIntervalP95Ms: 75,
  ciVirtualizedInteractionP95Ms: 58.3,
  ciVirtualizedFrameIntervalP95Ms: 25,
  longTaskLimitMs: 50,
  constrainedLongTaskLimitMs: 300,
  memoryReturnToleranceRatio: 0.15,
  posterColdP95Ms: 750,
  posterCachedP95Ms: 250,
  constrainedPosterColdP95Ms: 1_200,
  constrainedPosterCachedP95Ms: 400,
  posterCoverageRatio: 0.9,
  posterCoverageSettleMs: 1_500,
  constrainedPosterCoverageSettleMs: 2_500,
  richPreviewP95Ms: 750,
  constrainedRichPreviewP95Ms: 1_200,
  supportedFixtureFallbackRatio: 0.02,
  scrollSamplesPerRun: 63,
  warmupRuns: 3,
  measuredRuns: 5,
  requiredPassingRuns: 4,
});

function assertValidBudget(name: keyof TimelineViewportBudgets, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Timeline viewport budget ${name} must be a finite non-negative number`);
  }
}

export function resolveTimelineViewportBudgets(
  overrides: Partial<TimelineViewportBudgets> = {},
): Readonly<TimelineViewportBudgets> {
  for (const [name, value] of Object.entries(overrides)) {
    assertValidBudget(name as keyof TimelineViewportBudgets, value);
  }
  const resolved = { ...TIMELINE_VIEWPORT_BUDGETS, ...overrides };
  for (const name of [
    "scrollSamplesPerRun",
    "warmupRuns",
    "measuredRuns",
    "requiredPassingRuns",
  ] as const) {
    if (!Number.isInteger(resolved[name])) {
      throw new RangeError(`Timeline viewport budget ${name} must be an integer`);
    }
  }
  if (resolved.scrollSamplesPerRun < 20) {
    throw new RangeError(
      "Timeline viewport budget scrollSamplesPerRun must be at least 20 for p95",
    );
  }
  if (resolved.measuredRuns === 0 || resolved.requiredPassingRuns === 0) {
    throw new RangeError(
      "Timeline viewport budget measuredRuns and requiredPassingRuns must be greater than zero",
    );
  }
  if (resolved.requiredPassingRuns > resolved.measuredRuns) {
    throw new RangeError("Timeline viewport budget requiredPassingRuns cannot exceed measuredRuns");
  }
  for (const name of [
    "memoryReturnToleranceRatio",
    "posterCoverageRatio",
    "supportedFixtureFallbackRatio",
  ] as const) {
    if (resolved[name] > 1) {
      throw new RangeError(`Timeline viewport budget ${name} cannot exceed 1`);
    }
  }
  return Object.freeze(resolved);
}
