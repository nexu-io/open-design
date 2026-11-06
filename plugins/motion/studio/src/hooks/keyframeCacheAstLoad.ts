/**
 * Reading a composition file's GSAP tweens into the keyframe cache: fetch and
 * selector -> element id resolution.
 * Split from useGsapTweenCache to keep that file under the 600-line limit.
 */
import type { GsapAnimation, GsapKeyframesData, ParsedGsap } from "@hyperframes/core/gsap-parser";
import { isStudioHoldSet } from "@hyperframes/core/gsap-parser";
import { isPreviewBooted, usePlayerStore, whenPreviewBooted } from "../player/store/playerStore";
import { replaceKeyframeCacheForFile } from "./gsapKeyframeCacheHelpers";
import { resolveClipTimingBasis, resolveSelectorElementIds, toClipKeyframes } from "./gsapShared";
import {
  deduplicateKeyframes,
  isStaticPositionHold,
  synthesizeFlatTweenKeyframes,
  type MergeableKeyframe,
} from "./gsapTweenSynth";
import { studioApiFetch } from "../utils/studioApiFetch";

export { resolveSelectorElementIds };

/**
 * The slice of the parse response callers actually read. The endpoint returns
 * the full `ParsedGsap` (preamble/postamble and all), but nothing downstream of
 * this fetch touches the source-text fields, so the guard below only has to
 * vouch for what gets used.
 */
type ParsedGsapAnimations = Pick<
  ParsedGsap,
  "animations" | "multipleTimelines" | "unsupportedTimelinePattern"
>;

/**
 * A proxy, an error page, or a stale server can answer 200 with something that
 * has no `animations` array — the case where the old blind cast crashed on
 * `.animations.filter`.
 */
function hasAnimations(value: unknown): value is ParsedGsapAnimations {
  return (
    typeof value === "object" &&
    value !== null &&
    "animations" in value &&
    Array.isArray(value.animations)
  );
}

/**
 * Requests for the same file that overlap in time, keyed `projectId|sourceFile`.
 *
 * Every parse re-reads and re-parses the whole composition server-side, and a
 * multi-element action asks for the same file once per element. Sharing the
 * in-flight promise makes that one request. Only OVERLAPPING calls share: the
 * entry is dropped the moment it settles, so a call made after a write still
 * gets a fresh parse.
 */
const inFlightParses = new Map<string, Promise<ParsedGsapAnimations | null>>();

export const parseCacheKey = (projectId: string, sourceFile: string) =>
  `${projectId}|${sourceFile}`;

export function fetchParsedAnimations(
  projectId: string,
  sourceFile: string,
  options: { fresh?: boolean } = {},
): Promise<ParsedGsapAnimations | null> {
  const key = parseCacheKey(projectId, sourceFile);
  if (options.fresh) inFlightParses.delete(key);
  const inFlight = inFlightParses.get(key);
  if (inFlight) return inFlight;
  const request = requestParsedAnimations(projectId, sourceFile).finally(() => {
    // A superseded pre-write request must not evict the fresh post-write one.
    if (inFlightParses.get(key) === request) inFlightParses.delete(key);
  });
  inFlightParses.set(key, request);
  return request;
}

async function requestParsedAnimations(
  projectId: string,
  sourceFile: string,
): Promise<ParsedGsapAnimations | null> {
  if (!isPreviewBooted(projectId) && !(await whenPreviewBooted(projectId))) return null;
  try {
    const res = await studioApiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/gsap-animations/${encodeURIComponent(sourceFile)}`,
      // Always revalidate; an unchanged file answers 304. No per-call timestamp
      // (a deterministic-render no-no).
      { cache: "no-cache" },
    );
    if (!res.ok) return null;
    const parsed: unknown = await res.json();
    if (!hasAnimations(parsed)) return null;
    // Studio-emitted pre-keyframe hold `set`s are an internal runtime detail (they
    // hold an element's first keyframe before its tween). They must not surface as
    // user animations — otherwise they pollute the keyframe cache / timeline diamonds.
    return { ...parsed, animations: parsed.animations.filter((a) => !isStudioHoldSet(a)) };
  } catch {
    return null;
  }
}

/**
 * Read one composition file's tweens into the keyframe cache. Split out of the
 * hook so the effect can run it per file without re-nesting the whole body.
 */
// fallow-ignore-next-line complexity
export async function populateKeyframeCacheFromAst(
  projectId: string,
  sf: string,
  doc: Document | null | undefined,
): Promise<boolean> {
  const parsed = await fetchParsedAnimations(projectId, sf);
  if (!parsed) return false;
  const { elements, domClipChildren } = usePlayerStore.getState();
  const mergedByElement = new Map<string, GsapKeyframesData<MergeableKeyframe>>();
  const sourceByElement = new Map<string, GsapAnimation[]>();
  for (const anim of parsed.animations) {
    if (anim.hasUnresolvedKeyframes) continue;
    if (isStaticPositionHold(anim)) continue;
    const kfData = anim.keyframes ?? synthesizeFlatTweenKeyframes(anim);
    if (!kfData) continue;
    // Attribute the tween to every element it animates (handles class /
    // group / descendant selectors, not just `#id`).
    for (const id of resolveSelectorElementIds(anim.targetSelector, doc)) {
      // kfData is already resolved (real keyframes OR a synthesized flat
      // tween), so a flat tween joins the store like a keyframed one. No
      // property-group filter: this map must cover every tween the cache
      // below records, or expanded lanes have nothing to render.
      sourceByElement.set(id, [...(sourceByElement.get(id) ?? []), anim]);
      const { elStart, elDuration } = resolveClipTimingBasis(id, sf, elements, domClipChildren);
      const clipKeyframes = toClipKeyframes(kfData.keyframes, anim, elStart, elDuration);
      const existing = mergedByElement.get(id);
      if (existing) {
        existing.keyframes = deduplicateKeyframes([...existing.keyframes, ...clipKeyframes]);
      } else {
        mergedByElement.set(id, { ...kfData, keyframes: clipKeyframes });
      }
    }
  }
  replaceKeyframeCacheForFile(sf, mergedByElement, sourceByElement);
  return true;
}
