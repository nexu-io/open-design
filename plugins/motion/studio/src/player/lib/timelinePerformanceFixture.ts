import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { KeyframeCacheEntry, TimelineElement } from "../store/playerStore";

export type TimelinePerformanceFixtureProfile =
  | "dense-short"
  | "long-overlap"
  | "keyframe-heavy-expanded"
  | "composition-heavy"
  | "remote-unsupported";

export interface TimelinePerformanceFixtureSpec {
  elementCount: 1_000 | 50_000;
  profile: TimelinePerformanceFixtureProfile;
}

export interface TimelinePerformanceFixtureSummary extends TimelinePerformanceFixtureSpec {
  duration: number;
  trackCount: number;
  keyframedElementCount: number;
  expandedElementCount: number;
}

export interface TimelinePerformanceFixture {
  summary: Readonly<TimelinePerformanceFixtureSummary>;
  elements: TimelineElement[];
  keyframeCache: Map<string, KeyframeCacheEntry>;
  gsapAnimations: Map<string, GsapAnimation[]>;
  expandedClipIds: Set<string>;
}

const TRACK_COUNT = 1_000;
let fixtureLeaseActive = false;
const PROFILE_GEOMETRY: Readonly<
  Record<TimelinePerformanceFixtureProfile, { duration: number; clipDuration: number }>
> = Object.freeze({
  "dense-short": { duration: 120, clipDuration: 1.5 },
  "long-overlap": { duration: 7_200, clipDuration: 120 },
  "keyframe-heavy-expanded": { duration: 600, clipDuration: 8 },
  "composition-heavy": { duration: 900, clipDuration: 12 },
  "remote-unsupported": { duration: 900, clipDuration: 12 },
});

/** Prevent live iframe discovery from replacing an explicitly loaded dev fixture. */
export function setTimelinePerformanceFixtureLease(active: boolean): void {
  fixtureLeaseActive = active;
}

export function hasTimelinePerformanceFixtureLease(): boolean {
  return fixtureLeaseActive;
}

function validateFixtureSpec(spec: TimelinePerformanceFixtureSpec) {
  if (spec.elementCount !== 1_000 && spec.elementCount !== 50_000) {
    throw new RangeError("Timeline performance fixture elementCount must be 1000 or 50000");
  }
  if (!Object.hasOwn(PROFILE_GEOMETRY, spec.profile)) {
    throw new RangeError(`Unknown timeline performance fixture profile: ${spec.profile}`);
  }
  const geometry = PROFILE_GEOMETRY[spec.profile];
  return geometry;
}

function fixtureTrack(index: number, spec: TimelinePerformanceFixtureSpec): number {
  if (index < TRACK_COUNT) return index;
  if (spec.profile !== "dense-short") return index % TRACK_COUNT;
  // Keep the dense profile inside the declared 128-roots-per-row envelope while
  // still representing every one of the 1,000 logical tracks.
  const denseTrackCount = Math.ceil((spec.elementCount - TRACK_COUNT) / 127);
  return (index - TRACK_COUNT) % Math.max(1, denseTrackCount);
}

function fixtureStart(
  index: number,
  profile: TimelinePerformanceFixtureProfile,
  duration: number,
  clipDuration: number,
): number {
  const available = Math.max(0, duration - clipDuration);
  if (profile === "dense-short") return (index % 128) * 0.5;
  if (profile === "long-overlap") return (index * 37) % Math.max(1, available);
  return (index * 17) % Math.max(1, available);
}

function keyframeData(): KeyframeCacheEntry {
  return {
    format: "percentage",
    keyframes: [0, 33, 66, 100].map((percentage) => ({
      percentage,
      propertyGroup: "position",
      properties: { x: percentage },
      ease: "power2.inOut",
    })),
  };
}

function fixtureAnimation(id: string, start: number, duration: number): GsapAnimation {
  return {
    id: `animation-${id}`,
    targetSelector: `#${id}`,
    method: "to",
    position: start,
    resolvedStart: start,
    duration,
    propertyGroup: "position",
    fromProperties: { x: 0 },
    properties: { x: 100 },
    ease: "power2.inOut",
  };
}

/** Pure deterministic generator; the dev test hook performs the one store mutation. */
export function createTimelinePerformanceFixture(
  spec: TimelinePerformanceFixtureSpec,
): TimelinePerformanceFixture {
  const geometry = validateFixtureSpec(spec);
  const elements: TimelineElement[] = [];
  const keyframeCache = new Map<string, KeyframeCacheEntry>();
  const gsapAnimations = new Map<string, GsapAnimation[]>();
  const expandedClipIds = new Set<string>();

  for (let index = 0; index < spec.elementCount; index += 1) {
    const id = `perf-${spec.profile}-${spec.elementCount}-${index}`;
    const start = fixtureStart(index, spec.profile, geometry.duration, geometry.clipDuration);
    const track = fixtureTrack(index, spec);
    const element: TimelineElement = {
      id,
      key: id,
      domId: id,
      selector: `#${id}`,
      label: `Fixture ${index + 1}`,
      tag: spec.profile === "remote-unsupported" && index % 2 === 0 ? "video" : "div",
      start,
      duration: geometry.clipDuration,
      track,
      authoredTrack: track,
    };

    if (spec.profile === "composition-heavy") {
      element.compositionSrc = `compositions/perf-${index % 32}.html`;
    } else if (spec.profile === "remote-unsupported") {
      element.src =
        index % 2 === 0
          ? `https://media.invalid/perf-${index % 32}.mp4`
          : `assets/perf-${index % 32}.unsupported`;
    }
    if (spec.profile === "keyframe-heavy-expanded") {
      keyframeCache.set(id, keyframeData());
      gsapAnimations.set(id, [fixtureAnimation(id, start, geometry.clipDuration)]);
      expandedClipIds.add(id);
    }
    elements.push(element);
  }

  return {
    summary: Object.freeze({
      ...spec,
      duration: geometry.duration,
      trackCount: TRACK_COUNT,
      keyframedElementCount: keyframeCache.size,
      expandedElementCount: expandedClipIds.size,
    }),
    elements,
    keyframeCache,
    gsapAnimations,
    expandedClipIds,
  };
}
