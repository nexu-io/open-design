import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { GsapAnimation, GsapKeyframesData } from "@hyperframes/core/gsap-parser";
import { usePlayerStore } from "../player/store/playerStore";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { findPreviewNode } from "../components/editor/domEditingElement";
import { readRuntimeKeyframes, scanAllRuntimeKeyframes } from "./gsapRuntimeBridge";
import {
  clearKeyframeCacheForElement,
  elementCacheKeys,
  pruneKeyframeCacheToFiles,
  publishKeyframeCache,
  writeGsapAnimationsForElement,
} from "./gsapKeyframeCacheHelpers";
import { resolveClipTimingBasis, toClipKeyframes } from "./gsapShared";
import {
  deduplicateKeyframes,
  isStaticPositionHold,
  synthesizeFlatTweenKeyframes,
  type MergeableKeyframe,
} from "./gsapTweenSynth";
import { fetchParsedAnimations, populateKeyframeCacheFromAst } from "./keyframeCacheAstLoad";
import { getAnimationsForElement } from "./gsapElementMatch";

// Re-exported so callers keep importing the GSAP cache surface from one module.
export { resolveClipTimingBasis } from "./gsapShared";
export { fetchParsedAnimations, resolveSelectorElementIds } from "./keyframeCacheAstLoad";
export { getAnimationsForElement } from "./gsapElementMatch";

export function useGsapAnimationsForElement(
  projectId: string | null,
  sourceFile: string,
  target: DomEditSelection | null,
  version: number,
  iframeRef?: React.RefObject<HTMLIFrameElement | null>,
): {
  animations: GsapAnimation[];
  multipleTimelines: boolean;
  unsupportedTimelinePattern: boolean;
} {
  const [allAnimations, setAllAnimations] = useState<GsapAnimation[]>([]);
  const [multipleTimelines, setMultipleTimelines] = useState(false);
  const [unsupportedTimelinePattern, setUnsupportedTimelinePattern] = useState(false);
  const lastFetchKeyRef = useRef("");
  // Re-run the per-element cache populate when sub-comp DOM children appear, so a
  // sub-comp element gets its host-relative keyframe percentages (not elDuration=1).
  const domClipChildrenKey = usePlayerStore((s) =>
    s.domClipChildren.map((c) => `${c.id}<${c.hostId}`).join("|"),
  );

  useEffect(() => {
    const targetKey = target?.id ?? target?.selector ?? "";
    const fetchKey = `${projectId}:${sourceFile}:${version}:${targetKey}`;
    if (fetchKey === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = fetchKey;

    if (!projectId) {
      setAllAnimations([]);
      setMultipleTimelines(false);
      setUnsupportedTimelinePattern(false);
      return;
    }

    let cancelled = false;
    fetchParsedAnimations(projectId, sourceFile).then((parsed) => {
      if (cancelled) {
        return;
      }
      if (!parsed) {
        setAllAnimations([]);
        setMultipleTimelines(false);
        setUnsupportedTimelinePattern(false);
        return;
      }
      setAllAnimations(parsed.animations);
      setMultipleTimelines(parsed.multipleTimelines === true);
      setUnsupportedTimelinePattern(parsed.unsupportedTimelinePattern === true);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, sourceFile, version, target?.id, target?.selector]);

  const targetId = target?.id ?? null;
  const targetSelector = target?.selector ?? null;
  const rawAnimations = useMemo(() => {
    if (!targetId && !targetSelector) return [];
    // Resolve the live element so class / descendant tweens (e.g.
    // gsap.from(".dot", {stagger})) attribute to every matching element, not
    // just the one whose exact selector equals the tween's. `version` re-runs
    // this after composition reloads.
    const element = target ? findPreviewNode(iframeRef?.current?.contentDocument, target) : null;
    return getAnimationsForElement(
      allAnimations,
      { id: targetId, selector: targetSelector },
      element,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAnimations, target, version, iframeRef]);

  // fallow-ignore-next-line complexity
  const animations = useMemo(() => {
    const iframe = iframeRef?.current;
    let result = rawAnimations;

    // Enrich animations with unresolved keyframes from runtime
    if (iframe) {
      result = result.map((anim) => {
        if (!anim.hasUnresolvedKeyframes || anim.keyframes) return anim;
        const runtime = readRuntimeKeyframes(iframe, anim.targetSelector);
        if (!runtime) return anim;
        return {
          ...anim,
          keyframes: {
            format: "percentage" as const,
            keyframes: runtime.keyframes,
            ...(runtime.easeEach ? { easeEach: runtime.easeEach } : {}),
          },
          ...(runtime.arcPath ? { arcPath: runtime.arcPath } : {}),
        };
      });
    }

    // Match unresolved-selector animations from the parser to runtime tweens
    // targeting this element. This handles fully dynamic code (loop with variable selector).
    if (iframe && targetId && result.length === 0) {
      const unresolvedAnims = allAnimations.filter((a) => a.hasUnresolvedSelector);
      if (unresolvedAnims.length > 0) {
        const runtimeData = readRuntimeKeyframes(iframe, `#${targetId}`);
        if (runtimeData) {
          const scanned = scanAllRuntimeKeyframes(iframe);
          const runtimeEntry = scanned.get(targetId);
          if (runtimeEntry) {
            // Find which unresolved animation index matches this element
            // by correlating parser order with runtime tween order
            const runtimeIds = Array.from(scanned.keys());
            const runtimeIndex = runtimeIds.indexOf(targetId);
            const matchedAnim =
              runtimeIndex >= 0 && runtimeIndex < unresolvedAnims.length
                ? unresolvedAnims[runtimeIndex]
                : unresolvedAnims[0];
            if (matchedAnim) {
              result = [
                {
                  ...matchedAnim,
                  targetSelector: `#${targetId}`,
                  keyframes: {
                    format: "percentage" as const,
                    keyframes: runtimeEntry.keyframes,
                    ...(runtimeEntry.easeEach ? { easeEach: runtimeEntry.easeEach } : {}),
                  },
                  ...(runtimeEntry.arcPath ? { arcPath: runtimeEntry.arcPath } : {}),
                },
              ];
            }
          }
        }
      }
    }

    return result;
  }, [rawAnimations, allAnimations, iframeRef, targetId]);

  // Populate keyframe cache for the selected element.
  // Key format must match timeline element keys: "sourceFile#domId".
  // Merges keyframes from ALL animations targeting this element and synthesizes
  // flat tweens so the cache is never downgraded vs the bulk populate.
  const elementId = target?.id ?? null;
  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (!elementId) return;
    // Same admission rule as the keyframe cache below (hold skip included) and
    // no property-group filter: the two stores must agree, or a hold draws an
    // expanded property lane with no collapsed diamond behind it and an
    // ungrouped tween draws diamonds with no lane source.
    const sourceAnimations = animations.filter(
      (animation) =>
        !isStaticPositionHold(animation) &&
        (animation.keyframes || synthesizeFlatTweenKeyframes(animation)),
    );
    if (sourceAnimations.length > 0)
      writeGsapAnimationsForElement(sourceFile, elementId, sourceAnimations);

    // Resolve the element's time range from the player store so we can
    // convert tween-relative keyframe percentages to clip-relative ones.
    const { elements, domClipChildren } = usePlayerStore.getState();
    const { elStart, elDuration } = resolveClipTimingBasis(
      elementId,
      sourceFile,
      elements,
      domClipChildren,
    );

    const allKeyframes: MergeableKeyframe[] = [];
    let format: GsapKeyframesData["format"] = "percentage";
    let ease: string | undefined;
    let easeEach: string | undefined;
    for (const anim of animations) {
      if (isStaticPositionHold(anim)) continue;
      const kf = anim.keyframes ?? synthesizeFlatTweenKeyframes(anim);
      if (!kf) continue;
      allKeyframes.push(...toClipKeyframes(kf.keyframes, anim, elStart, elDuration));
      format = kf.format;
      if (kf.ease) ease = kf.ease;
      if (kf.easeEach) easeEach = kf.easeEach;
    }
    if (allKeyframes.length === 0) {
      // The per-element parsed-animation match can transiently miss class /
      // selector tweens (e.g. `.dot`) that the file-wide populate or runtime
      // scan already cached. Only clear when no source cached this element —
      // otherwise selecting it would wipe its diamonds.
      const { keyframeCache } = usePlayerStore.getState();
      const hasCached = elementCacheKeys(sourceFile, elementId).some((key) =>
        keyframeCache.has(key),
      );
      if (!hasCached) clearKeyframeCacheForElement(sourceFile, elementId);
      return;
    }
    const dedupedKeyframes = deduplicateKeyframes(allKeyframes);
    const merged: GsapKeyframesData = {
      format,
      keyframes: dedupedKeyframes,
      ...(ease ? { ease } : {}),
      ...(easeEach ? { easeEach } : {}),
    };
    // elementCacheKeys owns the key-variant list every writer sets (prefixed,
    // index.html fallback, bare id). Building it by hand here is what let this
    // site drift: it omitted the fallback key, and it wrote the bare id without
    // the string coercion that keeps prune from throwing on a non-string. All
    // keys land in one publish: a reader that woke between two separate writes
    // saw the prefixed key updated and the bare one still stale.
    publishKeyframeCache((draft) => {
      for (const key of elementCacheKeys(sourceFile, elementId)) {
        draft.keyframeCache.set(key, merged);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId, sourceFile, animations, domClipChildrenKey]);

  return { animations, multipleTimelines, unsupportedTimelinePattern };
}

export function useGsapCacheVersion() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return { version, bump };
}

/**
 * Fetch GSAP animations for a file and populate the keyframe cache for all
 * elements. Called from the Timeline component so diamonds show without
 * requiring a selection.
 */

export function usePopulateKeyframeCacheForFile(
  projectId: string | null,
  sourceFile: string,
  version: number,
  iframeRef?: React.RefObject<HTMLIFrameElement | null>,
): void {
  const elementCount = usePlayerStore((s) => s.elements.length);
  // Every sub-composition file the timeline shows rows for. The cache is loaded
  // for all of them up front, so keyframe lanes are populated on open instead of
  // only once a clip from that file is selected (which is what switches
  // `sourceFile`). Only files reachable from the store's elements are covered;
  // a composition nested inside another still loads on first selection.
  const compositionSrcKey = usePlayerStore((s) =>
    Array.from(new Set(s.elements.map((el) => el.compositionSrc).filter((src) => !!src)))
      .sort()
      .join("|"),
  );
  // Re-run when sub-comp DOM children appear (they supply the host bounds the
  // clip-relative keyframe percentages are computed against; without this the
  // cache is computed once before they exist and the percentages stay wrong).
  const domClipChildrenKey = usePlayerStore((s) =>
    s.domClipChildren.map((c) => `${c.id}<${c.hostId}`).join("|"),
  );
  const loadedRef = useRef<{ dataKey: string; files: Set<string> }>({
    dataKey: "",
    files: new Set(),
  });

  const runtimeScanDoneRef = useRef("");

  useEffect(() => {
    const dataKey = `kf-cache:${projectId}:${version}:${elementCount}:${domClipChildrenKey}:${compositionSrcKey}`;
    if (!projectId) return;

    // The active file first: it owns the selection, and each file clears only
    // its own cache entries, so the order just decides who writes the bare
    // `id` alias last.
    const files = Array.from(
      new Set([sourceFile, ...(compositionSrcKey ? compositionSrcKey.split("|") : [])]),
    );
    const sameData = loadedRef.current.dataKey === dataKey;
    const stale = sameData ? files.filter((sf) => !loadedRef.current.files.has(sf)) : files;
    const covered = sameData ? new Set([...loadedRef.current.files, ...files]) : new Set(files);
    loadedRef.current = { dataKey, files: covered };
    // Everything the previous scan cached for a file this one no longer covers
    // (the composition just switched away from) has no owner left to clear it.
    if (!sameData) pruneKeyframeCacheToFiles(files);
    if (stale.length === 0) return;
    runtimeScanDoneRef.current = "";
    const doc = iframeRef?.current?.contentDocument;
    for (const sf of stale) {
      void populateKeyframeCacheFromAst(projectId, sf, doc).then((loaded) => {
        if (!loaded && loadedRef.current.dataKey === dataKey) loadedRef.current.files.delete(sf);
      });
    }
    // elementCount is in the deps because new timeline elements (e.g. after a
    // sub-composition expand) need their keyframe cache populated immediately;
    // without it the effect won't re-run when elements appear/disappear.
    // iframeRef is read for DOM selector resolution but intentionally not a dep
    // (it's a stable ref; the separate runtime-scan effect owns iframe timing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceFile, version, elementCount, domClipChildrenKey, compositionSrcKey]);

  // Separate effect for runtime keyframe discovery — polls until the iframe
  // has loaded GSAP timelines, independent of the AST fetch lifecycle.
  useEffect(() => {
    if (!projectId) return;
    const sf = sourceFile;

    let attempts = 0;
    const maxAttempts = 10;

    // fallow-ignore-next-line complexity
    const tryRuntimeScan = () => {
      if (runtimeScanDoneRef.current === `kf-cache:${projectId}:${sf}:${version}`) return true;
      const iframe = iframeRef?.current;
      if (!iframe) return false;
      // Clip dims per element so the scan converts tween-relative keyframes to
      // clip-relative (matching the static path) instead of timeline-relative.
      const clipById = new Map<string, { start: number; duration: number }>();
      for (const el of usePlayerStore.getState().elements) {
        if (el.domId) clipById.set(el.domId, { start: el.start, duration: el.duration });
      }
      const scanned = scanAllRuntimeKeyframes(iframe, clipById);
      if (scanned.size === 0) return false;
      // One publish for the whole scan: a scan of a 120-clip composition used to
      // emit up to three store notifications per element, and every subscriber
      // in between re-rendered against a cache only partly filled in.
      publishKeyframeCache((draft) => {
        for (const [id, data] of scanned) {
          const keys = elementCacheKeys(sf, id);
          if (keys.some((key) => draft.keyframeCache.has(key))) continue;
          // Skip position-only set tweens from runtime too, same filter as AST path
          const isPosOnly =
            data.keyframes.length === 1 &&
            Object.keys(data.keyframes[0].properties).every((k) => k === "x" || k === "y");
          if (isPosOnly) {
            continue;
          }
          const entry = {
            format: "percentage" as const,
            keyframes: data.keyframes,
            ...(data.easeEach ? { easeEach: data.easeEach } : {}),
          };
          for (const key of keys) draft.keyframeCache.set(key, entry);
        }
      });
      runtimeScanDoneRef.current = `kf-cache:${projectId}:${sf}:${version}`;
      return true;
    };

    if (tryRuntimeScan()) return;

    const interval = setInterval(() => {
      attempts++;
      if (tryRuntimeScan() || attempts >= maxAttempts) clearInterval(interval);
    }, 500);

    return () => clearInterval(interval);
  }, [projectId, sourceFile, version, iframeRef]);
}
