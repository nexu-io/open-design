/**
 * Helpers for reading/writing the GSAP keyframe cache in the player store.
 * Extracted from useGsapScriptCommits to keep file sizes under the 600-line limit.
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore, type KeyframeCacheEntry } from "../player/store/playerStore";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { sameData } from "../utils/sameData";
import { resolveClipTimingBasis, resolveSelectorElementIds, toClipKeyframes } from "./gsapShared";
import {
  deduplicateKeyframes,
  synthesizeFlatTweenKeyframes,
  type MergeableKeyframe,
} from "./gsapTweenSynth";

/** Both cache maps mid-edit, before the single store publish. */
export interface KeyframeCacheDraft {
  keyframeCache: Map<string, KeyframeCacheEntry>;
  gsapAnimations: Map<string, GsapAnimation[]>;
}

// A rebuilt entry equal to the one shown keeps its object, so re-reading an unchanged file publishes nothing.
function keepEqualEntries<V>(before: ReadonlyMap<string, V>, draft: Map<string, V>): void {
  for (const [key, value] of draft) {
    const shown = before.get(key);
    if (shown !== undefined && shown !== value && sameData(shown, value)) draft.set(key, shown);
  }
}

function sameEntries<V>(before: ReadonlyMap<string, V>, after: ReadonlyMap<string, V>): boolean {
  if (before.size !== after.size) return false;
  for (const [key, value] of before) {
    if (after.get(key) !== value) return false;
  }
  return true;
}

/**
 * Every multi-key cache writer publishes through here: clone both maps once,
 * let the caller edit the drafts, publish once. The per-key store setters turned
 * one logical refresh into N notifications, and every subscriber that rendered
 * in between saw a cache that was half the old file and half the new one. The
 * identity check keeps an edit that changed nothing from allocating fresh maps
 * and re-rendering every subscriber, which is the guard the per-key setters used
 * to carry individually.
 */
export function publishKeyframeCache(edit: (draft: KeyframeCacheDraft) => void): void {
  const { keyframeCache, gsapAnimations } = usePlayerStore.getState();
  const draft: KeyframeCacheDraft = {
    keyframeCache: new Map(keyframeCache),
    gsapAnimations: new Map(gsapAnimations),
  };
  edit(draft);
  keepEqualEntries(keyframeCache, draft.keyframeCache);
  keepEqualEntries(gsapAnimations, draft.gsapAnimations);
  if (
    sameEntries(keyframeCache, draft.keyframeCache) &&
    sameEntries(gsapAnimations, draft.gsapAnimations)
  )
    return;
  usePlayerStore.setState({
    keyframeCache: draft.keyframeCache,
    gsapAnimations: draft.gsapAnimations,
  });
}

export function updateKeyframeCacheFromParsed(
  animations: GsapAnimation[],
  targetPath: string,
  selectionId: string | undefined,
  mutation: Record<string, unknown>,
  doc?: Document | null,
): void {
  const { elements, domClipChildren } = usePlayerStore.getState();
  const idsWithKeyframes = new Set<string>();
  // Attributed keyframes only: everything in here came from a parsed tween via
  // toClipKeyframes, so the merge can rely on the source identity. It widens
  // back into KeyframeCacheEntry on the way to the store, which also holds the
  // runtime scan's unattributed keyframes.
  const merged = new Map<string, KeyframeCacheEntry & { keyframes: MergeableKeyframe[] }>();
  const sourceAnimations = new Map<string, GsapAnimation[]>();
  for (const anim of animations) {
    const kfSource =
      anim.keyframes?.keyframes ?? synthesizeFlatTweenKeyframes(anim)?.keyframes ?? [];
    if (kfSource.length === 0) continue;
    // Attribute the tween to every element it actually animates. A leading-id
    // match filed `#stat3 .block` under `#stat3`: the child's diamonds landed on
    // its ancestor AND collided with the ancestor's own tween at the shared
    // percentage, which the same-% merge then resolved by dropping the ease.
    for (const id of resolveSelectorElementIds(anim.targetSelector, doc)) {
      idsWithKeyframes.add(id);
      // Every tween that fed keyframeCache also lands in gsapAnimations, group or
      // not: a mixed-group tween (`{ x, opacity }` classifies to undefined) used to
      // cache diamonds with no source animation behind them, so the collapsed row
      // drew keyframes the expanded lanes couldn't render. Lane consumers do the
      // group filtering themselves (animationContributesLane).
      sourceAnimations.set(id, [...(sourceAnimations.get(id) ?? []), anim]);

      // Convert tween-relative percentages to clip-relative so diamonds
      // render at the correct position within the timeline clip. The basis comes
      // from the shared resolver, so this writer agrees with the AST load on both
      // the sub-comp host fallback and the tween's own time frame.
      const { elStart, elDuration } = resolveClipTimingBasis(
        id,
        targetPath,
        elements,
        domClipChildren,
      );
      const clipKeyframes = toClipKeyframes(kfSource, anim, elStart, elDuration);

      const existing = merged.get(id);
      if (existing) {
        // deduplicateKeyframes owns the same-% merge (including the colliding
        // animation targets downstream lanes read); a second copy of that rule
        // here is how the two writers drift.
        existing.keyframes = deduplicateKeyframes([...existing.keyframes, ...clipKeyframes]);
      } else {
        merged.set(id, {
          ...anim.keyframes,
          format: anim.keyframes?.format ?? "percentage",
          keyframes: clipKeyframes,
        });
      }
    }
  }
  const mutationSelector = (mutation as { targetSelector?: string }).targetSelector;
  const mutated = mutationSelector ? resolveSelectorElementIds(mutationSelector, doc) : [];
  const targetIds = mutated.length > 0 ? mutated : selectionId ? [selectionId] : [];
  publishKeyframeCache((draft) => {
    for (const [id, entry] of merged) {
      writeElementIntoDraft(draft, targetPath, id, entry, sourceAnimations.get(id));
    }
    for (const targetId of targetIds) {
      if (!idsWithKeyframes.has(targetId)) deleteElementFromDraft(draft, targetPath, targetId);
    }
  });
}

function writeElementIntoDraft(
  draft: KeyframeCacheDraft,
  sourceFile: string,
  elementId: string,
  entry: KeyframeCacheEntry,
  animations: GsapAnimation[] | undefined,
): void {
  for (const key of elementCacheKeys(sourceFile, elementId)) {
    draft.keyframeCache.set(key, entry);
    if (animations) draft.gsapAnimations.set(key, animations);
    else draft.gsapAnimations.delete(key);
  }
}

function deleteElementFromDraft(
  draft: KeyframeCacheDraft,
  sourceFile: string,
  elementId: string,
): void {
  for (const key of elementCacheKeys(sourceFile, elementId)) {
    draft.keyframeCache.delete(key);
    draft.gsapAnimations.delete(key);
  }
}

/**
 * Clear every keyframe-cache key variant written for an element: the
 * source-prefixed key, the index.html fallback, and the bare element id.
 * Writes set all three (see updateKeyframeCacheFromParsed and
 * usePopulateKeyframeCacheForFile). PropertyPanel's keyframe nav reads the bare
 * id directly (`element.id`), and other consumers (timeline diamonds, the
 * preview overlay) fall back to the bare id when an element has no
 * source-prefixed key — so a clear that drops only the prefixed keys leaves the
 * bare entry behind and those readers keep showing keyframes the element no
 * longer has. publishKeyframeCache skips the store write entirely when none of
 * the keys were present, so an absent element doesn't re-render every
 * subscriber.
 */
export function clearKeyframeCacheForElement(sourceFile: string, elementId: string): void {
  publishKeyframeCache((draft) => deleteElementFromDraft(draft, sourceFile, elementId));
}

function cachedElementIdsForFile(
  sourceFile: string,
  keyframeCache: ReadonlyMap<string, KeyframeCacheEntry>,
  gsapAnimations: ReadonlyMap<string, GsapAnimation[]>,
): Set<string> {
  const sfPrefix = `${sourceFile}#`;
  const ids = new Set<string>();
  for (const key of [...keyframeCache.keys(), ...gsapAnimations.keys()]) {
    if (key.startsWith(sfPrefix)) ids.add(key.slice(sfPrefix.length));
  }
  if (sourceFile !== "index.html") return ids;
  // Another file's element also writes the `index.html#id` fallback, as the very same entry object.
  for (const [key, entry] of keyframeCache) {
    const hash = key.indexOf("#");
    const id = key.slice(hash + 1);
    if (hash > 0 && !key.startsWith(sfPrefix) && keyframeCache.get(sfPrefix + id) === entry) {
      ids.delete(id);
    }
  }
  return ids;
}

/**
 * Drop every cached element owned by a file that is no longer on screen. Each
 * file only ever writes its OWN prefixed entries (see elementCacheKeys), so
 * switching composition left the previous composition's elements cached forever
 * (240 entries per switch on a 120-clip comp, in both keyframeCache and
 * gsapAnimations, with nothing to evict them). Called once before a re-scan,
 * with the full set of files that scan covers, and it publishes once: the prune
 * runs immediately before the atomic repopulate, so a per-element publish here
 * would reintroduce the empty-cache flash that repopulate was made to avoid.
 */
export function pruneKeyframeCacheToFiles(files: readonly string[]): void {
  const keep = new Set(files);
  const { keyframeCache, gsapAnimations } = usePlayerStore.getState();
  const stale = new Map<string, Set<string>>();
  for (const key of [...keyframeCache.keys(), ...gsapAnimations.keys()]) {
    const hash = key.indexOf("#");
    // Bare-id aliases carry no owner; deleteElementFromDraft takes them with
    // their prefixed key, so skipping them here loses nothing.
    if (hash < 0) continue;
    const sourceFile = key.slice(0, hash);
    if (keep.has(sourceFile)) continue;
    const ids = stale.get(sourceFile) ?? new Set<string>();
    ids.add(key.slice(hash + 1));
    stale.set(sourceFile, ids);
  }
  publishKeyframeCache((draft) => {
    for (const [sourceFile, ids] of stale) {
      for (const id of ids) deleteElementFromDraft(draft, sourceFile, id);
    }
  });
}

/**
 * The source-scoped key that names one element across panels and the store
 * (focused ease segment, keyframe cache reads). Four call sites built this
 * string by hand and two of them omitted the index.html fallback, so an element
 * with no sourceFile was addressed as `#box` by one panel and `index.html#box`
 * by another and the two never matched. One builder keeps them on one key.
 */
export function scopedElementKey(element: {
  sourceFile?: string | null;
  id?: string | null;
}): string {
  return `${element.sourceFile || "index.html"}#${element.id}`;
}

/**
 * The one gate every cache write passes through, so it is also the one place
 * that can guarantee `keyframeCache` / `gsapAnimations` really are keyed by
 * string the way their types claim.
 *
 * Two of the three keys are template literals, which coerce on their own. The
 * bare-id key was passed through raw, so a non-string `elementId` reaching here
 * put a non-string key in both maps — and `pruneKeyframeCacheToFiles` then threw
 * `s.indexOf is not a function` on it, taking Studio to the crash boundary.
 *
 * Which caller supplies a non-string id is still unknown: every writer traced
 * from here produces a string. So this coerces rather than guesses, and reports
 * the offending value's shape instead of swallowing it — the next occurrence
 * names its own producer.
 */
export function elementCacheKeys(sourceFile: string, elementId: string): string[] {
  const id = typeof elementId === "string" ? elementId : coerceCacheKeyId(elementId, sourceFile);
  return sourceFile === "index.html"
    ? [`index.html#${id}`, id]
    : [`${sourceFile}#${id}`, `index.html#${id}`, id];
}

function coerceCacheKeyId(elementId: unknown, sourceFile: string): string {
  trackStudioEvent("cache_key_non_string", {
    value_type: typeof elementId,
    // An Element lands here as "HTMLDivElement", a boxed id as "Number" — enough
    // to name the producer without shipping user content to telemetry.
    constructor_name: (elementId as { constructor?: { name?: string } })?.constructor?.name ?? null,
    is_array: Array.isArray(elementId),
    source_file: sourceFile,
  });
  return String(elementId);
}

/** Replace one file's complete cache snapshot with one atomic store publish. */
export function replaceKeyframeCacheForFile(
  sourceFile: string,
  entries: ReadonlyMap<string, KeyframeCacheEntry>,
  animationsByElement: ReadonlyMap<string, GsapAnimation[]>,
): void {
  publishKeyframeCache((draft) => {
    for (const id of cachedElementIdsForFile(
      sourceFile,
      draft.keyframeCache,
      draft.gsapAnimations,
    )) {
      deleteElementFromDraft(draft, sourceFile, id);
    }
    for (const [id, entry] of entries) {
      writeElementIntoDraft(draft, sourceFile, id, entry, animationsByElement.get(id));
    }
  });
}

export function writeGsapAnimationsForElement(
  sourceFile: string,
  elementId: string,
  animations: GsapAnimation[] | undefined,
): void {
  publishKeyframeCache((draft) => {
    for (const key of elementCacheKeys(sourceFile, elementId)) {
      if (animations) draft.gsapAnimations.set(key, animations);
      else draft.gsapAnimations.delete(key);
    }
  });
}

function buildCacheKey(sourceFile: string, elementId: string): string {
  return `${sourceFile}#${elementId}`;
}

export function readKeyframeSnapshot(
  sourceFile: string,
  elementId: string | null | undefined,
): KeyframeCacheEntry | undefined {
  if (!elementId) return undefined;
  return usePlayerStore.getState().keyframeCache.get(buildCacheKey(sourceFile, elementId));
}

export function writeKeyframeCache(
  sourceFile: string,
  elementId: string | null | undefined,
  data: KeyframeCacheEntry | undefined,
): void {
  if (!elementId) return;
  usePlayerStore.getState().setKeyframeCache(buildCacheKey(sourceFile, elementId), data);
}
