/**
 * Unified helper for committing any GSAP property value from the design panel.
 *
 * Routing depends on whether the element is animated (has keyframes on any tween):
 * - Animated → write the value into a keyframe at the current playhead (convert a
 *   flat tween first if needed). An existing static `set` auto-converts to keyframes.
 * - Static (no keyframes anywhere) → persist as a `tl.set`, NEVER keyframes — same
 *   as manual drag / resize / rotate. Updates an existing set or creates one.
 */
import { useCallback } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { classifyPropertyGroup } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { readAllAnimatedProperties, readGsapProperty } from "./gsapRuntimeBridge";
import type { SetPatchProps } from "./gsapRuntimePatch";
import {
  selectorFromSelection,
  computeElementPercentage,
  isInstantHold,
  keyframeEases,
  writeTargetSelector,
  tweenTargetsElement,
} from "./gsapShared";
import { resolveTweenStart, resolveTweenDuration } from "../utils/globalTimeCompiler";
import { progressAtTime, runEaseOf, timeAtProgress } from "../utils/gsapKeyframeEases";
import { roundTo3 } from "../utils/rounding";
import { commitWholePropertyOffset } from "./gsapWholePropertyOffsetCommit";
import {
  assertGsapEditPersisted,
  directEditOutcomeForProperties,
  GsapEditBlockedError,
} from "./gsapEditOutcome";
import type { CommitMutation, CommitMutationCall } from "./gsapScriptCommitTypes";

interface CommitAnimatedPropertyDeps {
  selectedGsapAnimations: GsapAnimation[];
  gsapCommitMutation: CommitMutation | null;
  addGsapAnimation: (
    selection: DomEditSelection,
    method: "to" | "from" | "set" | "fromTo",
    currentTime?: number,
  ) => void;
  convertToKeyframes: (selection: DomEditSelection, animId: string) => void;
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
  bumpGsapCache: () => void;
}

function pickBestAnimation(
  animations: GsapAnimation[],
  selector: string | null,
  property?: string,
): GsapAnimation | undefined {
  const targetGroup = property ? classifyPropertyGroup(property) : undefined;
  // Group-aware: never hand back a tween from a DIFFERENT property group. The old
  // `animations.length <= 1` early return merged a rotation/3D edit into the element's
  // only tween even when that was a `position` tween — contaminating it and leaving the
  // new property with no clean keyframe baseline. When a target group is known, only
  // same-group tweens are candidates; if none exist we return undefined and the caller
  // creates a fresh same-group tween.
  const candidates =
    targetGroup !== undefined
      ? animations.filter((a) => a.propertyGroup === targetGroup)
      : animations;
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const currentTime = usePlayerStore.getState().currentTime;
  // Intentional multi-signal ranking: group match, selector specificity, and playhead overlap.
  // fallow-ignore-next-line complexity
  const scored = candidates.map((a) => {
    let score = 0;
    if (a.keyframes) score += 10;
    if (selector && a.targetSelector === selector) score += 5;
    else if (a.targetSelector.includes(",")) score -= 3;
    const pos = a.resolvedStart ?? (typeof a.position === "number" ? a.position : 0);
    const dur = a.duration ?? 0;
    if (currentTime >= pos - 0.05 && currentTime <= pos + dur + 0.05) score += 8;
    return { anim: a, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.anim;
}

/**
 * Auto-keyframe a just-updated static `set`: if the element is already animated
 * (its clip carries keyframes on another tween), convert the set to keyframes so
 * subsequent edits at other playheads interpolate — matching the drag / resize /
 * rotate UX. Purely static elements (no other keyframes) are left as a set.
 */
async function maybeAutoKeyframeSet(
  selection: DomEditSelection,
  setAnim: GsapAnimation,
  animations: GsapAnimation[],
  commit: NonNullable<CommitAnimatedPropertyDeps["gsapCommitMutation"]>,
): Promise<void> {
  const animatedTween = animations.find((a) => a.keyframes && a.id !== setAnim.id);
  if (!animatedTween) return;
  await commit(
    selection,
    {
      type: "convert-to-keyframes",
      animationId: setAnim.id,
      duration: animatedTween.duration ?? 1,
    },
    { label: "Keyframe 3D transform", softReload: true },
  );
}

type Commit = CommitMutation;

/** Undo-history label for a static-set commit, from the group it writes. */
const STATIC_SET_LABELS: Partial<Record<ReturnType<typeof classifyPropertyGroup>, string>> = {
  position: "Move layer",
  scale: "Resize layer",
  size: "Resize layer",
  rotation: "Rotate layer",
  visual: "Set opacity",
  other: "Set 3D transform",
};

function staticSetLabel(propEntries: [string, number | string][]): string {
  const groups = new Set(propEntries.map(([k]) => classifyPropertyGroup(k)));
  const only = groups.size === 1 ? [...groups][0] : undefined;
  return (only && STATIC_SET_LABELS[only]) || "Set properties";
}

/** Merge ALL props into the static `set` in ONE commit (value-only, instant), then
 *  auto-keyframe. One mutation — a per-property loop would shift the set's
 *  group-derived id mid-way (e.g. reset adding `scale` to a rotation set), 404-ing
 *  the next update. */
async function commitSetProps(
  selection: DomEditSelection,
  setAnim: GsapAnimation,
  propEntries: [string, number | string][],
  selector: string | null,
  animations: GsapAnimation[],
  commit: Commit,
): Promise<void> {
  const call = buildSetPropsCall(selection, setAnim, propEntries, selector);
  await commit(call.selection, call.mutation, call.options);
  await maybeAutoKeyframeSet(selection, setAnim, animations, commit);
}

function buildSetPropsCall(
  selection: DomEditSelection,
  setAnim: GsapAnimation,
  propEntries: [string, number | string][],
  selector: string | null,
): CommitMutationCall {
  const properties = Object.fromEntries(propEntries);
  const numericProps: SetPatchProps = {};
  for (const [k, v] of propEntries) {
    if (typeof v === "number") numericProps[k as keyof SetPatchProps] = v;
  }
  const instantPatch =
    selector && Object.keys(numericProps).length > 0
      ? {
          selector,
          change: {
            kind: (setAnim.global ? "global-set" : "set") as "set" | "global-set",
            props: numericProps,
          },
        }
      : undefined;
  return {
    selection,
    mutation: { type: "update-properties", animationId: setAnim.id, properties },
    options: {
      label: staticSetLabel(propEntries),
      softReload: true,
      ...(instantPatch ? { instantPatch } : {}),
    },
  };
}

/**
 * Static element (no keyframes on ANY of its tweens): persist the 3D props as a
 * `tl.set` — NEVER keyframes. Mirrors manual drag / resize / rotate, which `tl.set`
 * a static element instead of animating it. Updates an existing same-group static
 * hold in place, or creates a dedicated `set` at position 0 when the element has none.
 */
async function commitStaticSet(
  selection: DomEditSelection,
  propEntries: [string, number | string][],
  selector: string | null,
  animations: GsapAnimation[],
  commit: Commit,
): Promise<void> {
  const calls = planStaticSetCalls(selection, propEntries, selector, animations);
  const only = calls[0];
  if (!only) return;
  if (calls.length === 1) {
    await commit(only.selection, only.mutation, only.options);
    return;
  }
  if (!commit.batch) {
    throw new Error("Atomic GSAP property batch is unavailable");
  }
  await commit.batch(calls, {
    label: staticSetLabel(propEntries),
    softReload: true,
  });
}

function groupStaticSetEntries(
  propEntries: [string, number | string][],
): Map<string, [string, number | string][]> {
  // One commit per PROPERTY GROUP, each into a static write that owns that group —
  // never a live tween, and never a foreign-group write (a width edit used to
  // merge into the element's position set, producing a mixed write the split
  // machinery exists to prevent). Within a group everything batches into ONE
  // commit: a write's id is group-derived, so a per-prop loop would shift the id
  // mid-way and 404 the next update.
  const byGroup = new Map<string, [string, number | string][]>();
  for (const entry of propEntries) {
    const group = classifyPropertyGroup(entry[0]);
    const batch = byGroup.get(group) ?? [];
    batch.push(entry);
    byGroup.set(group, batch);
  }
  return byGroup;
}

function planStaticSetCalls(
  selection: DomEditSelection,
  propEntries: [string, number | string][],
  selector: string | null,
  animations: GsapAnimation[],
): CommitMutationCall[] {
  const byGroup = groupStaticSetEntries(propEntries);
  const staticWrites = selector
    ? animations.filter(
        (a) =>
          isInstantHold(a) && tweenTargetsElement(a.targetSelector, selector, selection.element),
      )
    : [];
  // Resolve every group's target BEFORE committing anything, and coalesce
  // groups that land on the SAME write into one commit: the snapshot is captured
  // once, so if two groups resolved to one legacy mixed write, a first
  // commit could re-shape it server-side and leave the second chasing a stale
  // id (404 on legacy pre-split files).
  const byTargetWrite = new Map<GsapAnimation, [string, number | string][]>();
  const newSetBatches: [string, number | string][][] = [];
  for (const [group, batch] of byGroup) {
    const existingWrite = findGroupOwningStaticWrite(staticWrites, group);
    if (existingWrite) {
      byTargetWrite.set(existingWrite, [...(byTargetWrite.get(existingWrite) ?? []), ...batch]);
    } else {
      newSetBatches.push(batch);
    }
  }
  return [
    ...[...byTargetWrite].map(([targetWrite, batch]) =>
      buildSetPropsCall(selection, targetWrite, batch, selector),
    ),
    ...newSetBatches.map((batch) => buildGlobalStaticSetCall(selection, batch)),
  ];
}

/**
 * The static write that owns a property group: one already dedicated to the
 * group wins; else a mixed write that already carries a property of the group
 * (merging same-group values there beats spawning a second writer for the channel).
 */
function findGroupOwningStaticWrite(
  staticWrites: GsapAnimation[],
  group: string,
): GsapAnimation | undefined {
  return (
    staticWrites.find((a) => a.propertyGroup === group) ??
    staticWrites.find((a) =>
      Object.keys(a.properties).some((k) => classifyPropertyGroup(k) === group),
    )
  );
}

/**
 * Base `gsap.set` (off-timeline) — a static hold with no 0% keyframe marker, so
 * adjusting a 3D transform on a non-keyframed element doesn't drop a keyframe on
 * the timeline (matches the manual-drag UX). The global-set instant patch applies
 * it straight to the element so the first edit shows with no soft-reload flash.
 */
function buildGlobalStaticSetCall(
  selection: DomEditSelection,
  batch: [string, number | string][],
): CommitMutationCall {
  const numericProps: SetPatchProps = {};
  for (const [k, v] of batch) {
    if (typeof v === "number") numericProps[k as keyof SetPatchProps] = v;
  }
  // A brand-new write, so it must address ONE element: the selection's own
  // selector is the bare class an id-less element yields, which would hold every
  // sibling. No one-element form means no write at all (see writeTargetSelector).
  const target = writeTargetSelector(selection);
  if (!target) throw new GsapEditBlockedError("no-selector");
  return {
    selection,
    mutation: {
      type: "add",
      targetSelector: target,
      method: "set",
      position: 0,
      properties: Object.fromEntries(batch),
      global: true,
    },
    options: {
      label: staticSetLabel(batch),
      softReload: true,
      ...(Object.keys(numericProps).length > 0
        ? {
            instantPatch: {
              selector: target,
              change: { kind: "global-set" as const, props: numericProps },
            },
          }
        : {}),
    },
  };
}

/** Convert-if-flat, then write ALL props into ONE keyframe at the playhead. */
// fallow-ignore-next-line complexity
async function commitKeyframeProps(
  selection: DomEditSelection,
  anim: GsapAnimation,
  props: Record<string, number | string>,
  propEntries: [string, number | string][],
  primaryProp: string,
  selector: string | null,
  iframe: HTMLIFrameElement | null,
  commit: Commit,
): Promise<void> {
  const wasKeyframed = !!anim.keyframes;
  if (!wasKeyframed) {
    await commit(
      selection,
      { type: "convert-to-keyframes", animationId: anim.id },
      { label: "Convert to keyframes", keyframeTelemetry: false, skipReload: true },
    );
  }
  const ct = usePlayerStore.getState().currentTime;
  const runtimeProps = selector ? readAllAnimatedProperties(iframe, selector, anim) : {};
  const properties: Record<string, number | string> = { ...runtimeProps, ...props };

  const backfillDefaults: Record<string, number | string> = { ...runtimeProps };
  for (const [property, value] of propEntries) {
    if (!(property in runtimeProps) && selector) {
      const cssVal = readGsapProperty(iframe, selector, property);
      if (cssVal != null) backfillDefaults[property] = cssVal;
    }
    backfillDefaults[property] = value;
  }

  // Playhead OUTSIDE the keyframe tween's time range → EXTEND the tween to reach it
  // and add a keyframe there, exactly like manual drag's extendTweenAndAddKeyframe.
  // The add-keyframe below only writes WITHIN the existing range, so without this a
  // depth edit past the tween end just overwrites the last keyframe (the bug: no new
  // diamond appears at a playhead beyond the tween). Only for an already-keyframed
  // tween — a freshly-converted set has no prior range worth remapping.
  const kfs = anim.keyframes?.keyframes;
  const ts = resolveTweenStart(anim);
  const td = resolveTweenDuration(anim);
  const hasSelectedKeyframe = usePlayerStore.getState().activeKeyframePct != null;
  const playheadOutside = ts !== null && td > 0 && (ct < ts - 0.01 || ct > ts + td + 0.01);
  const willExtend = wasKeyframed && !!kfs && playheadOutside && !hasSelectedKeyframe;
  if (willExtend && kfs && ts !== null) {
    const newStart = Math.min(ct, ts);
    const newEnd = Math.max(ct, ts + td);
    const newDuration = Math.max(0.01, newEnd - newStart);
    const runEase = runEaseOf(anim);
    const toNewPct = (absTime: number) =>
      Math.round(progressAtTime(runEase, ((absTime - newStart) / newDuration) * 100) * 10) / 10;
    const remapped = kfs.map((kf) => {
      const newPct = toNewPct(ts + (timeAtProgress(runEase, kf.percentage) / 100) * td);
      const p: Record<string, number | string> = { ...kf.properties };
      for (const k of Object.keys(properties)) {
        if (!(k in p) && backfillDefaults[k] != null) p[k] = backfillDefaults[k];
      }
      return { percentage: newPct, properties: p, ...(kf.ease ? { ease: kf.ease } : {}) };
    });
    remapped.push({ percentage: toNewPct(ct), properties });
    remapped.sort((a, b) => a.percentage - b.percentage);
    await commit(
      selection,
      {
        type: "replace-with-keyframes",
        animationId: anim.id,
        targetSelector: anim.targetSelector,
        position: roundTo3(newStart),
        duration: roundTo3(newDuration),
        keyframes: remapped,
        ...keyframeEases(anim),
      },
      { label: `Edit ${primaryProp} (extended keyframe)`, keyframeAction: "add", softReload: true },
    );
    return;
  }

  const pct = computeElementPercentage(ct, selection, anim);
  const existingKf = anim.keyframes?.keyframes.some((kf) => Math.abs(kf.percentage - pct) < 0.05);
  // Rebuild the live keyframe tween in place so the edit shows instantly (no flash);
  // rebuildKeyframeTween declines → soft reload if the tween can't be safely rebuilt.
  const numericProps: Record<string, number> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (typeof v === "number") numericProps[k] = v;
  }
  const instantPatch =
    selector && Object.keys(numericProps).length > 0
      ? { selector, change: { kind: "keyframe-rebuild" as const, pct, props: numericProps } }
      : undefined;
  await commit(
    selection,
    existingKf
      ? { type: "update-keyframe", animationId: anim.id, percentage: pct, properties }
      : {
          type: "add-keyframe",
          animationId: anim.id,
          percentage: pct,
          properties,
          backfillDefaults,
        },
    {
      label: `Edit ${primaryProp} (keyframe ${pct}%)`,
      softReload: true,
      ...(instantPatch ? { instantPatch } : {}),
    },
  );
}

export function useAnimatedPropertyCommit(deps: CommitAnimatedPropertyDeps) {
  const { selectedGsapAnimations, gsapCommitMutation, previewIframeRef, bumpGsapCache } = deps;

  const commitAnimatedProperties = useCallback(
    // This is the single routing boundary for set, keyframe, whole-tween, and first-group writes.
    // fallow-ignore-next-line complexity
    async (
      selection: DomEditSelection,
      props: Record<string, number | string>,
      commit: CommitMutation | null = gsapCommitMutation,
    ): Promise<void> => {
      if (!commit) return;
      const propEntries = Object.entries(props);
      if (propEntries.length === 0) return;
      const primaryProp = propEntries[0]![0];
      assertGsapEditPersisted(
        directEditOutcomeForProperties(
          selectedGsapAnimations,
          new Set(propEntries.map(([property]) => property)),
        ),
      );

      const iframe = previewIframeRef.current;
      const selector = selectorFromSelection(selection);

      const anim: GsapAnimation | undefined = pickBestAnimation(
        selectedGsapAnimations,
        selector,
        primaryProp,
      );
      if (!anim && !writeTargetSelector(selection)) {
        throw new GsapEditBlockedError("no-selector");
      }
      // Whether the element is animated at all. A 3D edit only creates/edits
      // keyframes when it IS — a static element (no keyframes on any of its tweens)
      // gets a `tl.set`, never new keyframes (matches manual drag / resize / rotate).
      const elementHasKeyframes = selectedGsapAnimations.some((a) => !!a.keyframes);

      // The picked anim comes from the (possibly stale) panel cache: if keyframes
      // were just removed or the script changed underneath us, its id is gone
      // server-side and the commit 404s. The raw commit already toasts; we catch
      // so the rejection doesn't escape as an uncaught promise, and bump the cache
      // so selectedGsapAnimations re-syncs and the user's next edit self-heals.
      try {
        // Animated element → keyframe at the playhead, EXACTLY like manual drag /
        // resize / rotate: if the picked anim is still a static `set`,
        // commitKeyframeProps converts it to keyframes first, then writes the new
        // value as a keyframe at the current time — so the 3D animates instead of
        // holding a flat constant. This MUST come before the `set`-update path below,
        // or a 3D `set` would short-circuit to an in-place update and the playhead
        // keyframe would never land (the bug: scrolling depth on a keyframed element
        // just changed the constant instead of dropping a keyframe).
        if (elementHasKeyframes && anim) {
          // With auto-keyframe off (#1808), nudge the whole tween instead of
          // adding/updating a keyframe at the playhead.
          if (!usePlayerStore.getState().autoKeyframeEnabled) {
            const pct = computeElementPercentage(
              usePlayerStore.getState().currentTime,
              selection,
              anim,
            );
            await commitWholePropertyOffset(
              selection,
              anim,
              Object.fromEntries(
                propEntries.filter((e): e is [string, number] => typeof e[1] === "number"),
              ),
              pct,
              iframe,
              { commitMutation: commit },
              `Edit ${primaryProp} (whole animation)`,
            );
            return;
          }
          await commitKeyframeProps(
            selection,
            anim,
            props,
            propEntries,
            primaryProp,
            selector,
            iframe,
            commit,
          );
          return;
        }

        // Static element (no keyframes anywhere) — persist as a `tl.set`, never
        // keyframes (incl. the no-animation case, which creates a fresh set).
        // Route the complete property set through the group-aware planner even
        // when pickBestAnimation found one existing set: a mixed X+width edit
        // must update the position set AND create a size set atomically rather
        // than contaminating the first set with a foreign property group.
        if (!elementHasKeyframes) {
          await commitStaticSet(selection, propEntries, selector, selectedGsapAnimations, commit);
          return;
        }

        // Existing static hold on an otherwise animated element — merge the props
        // into the same write, then auto-keyframe it against the sibling tween.
        if (anim && isInstantHold(anim)) {
          await commitSetProps(
            selection,
            anim,
            propEntries,
            selector,
            selectedGsapAnimations,
            commit,
          );
          return;
        }

        // Animated element but NO same-group tween exists (e.g. the FIRST rotation/3D
        // keyframe on an element that only has a position tween). Create a fresh
        // same-group keyframed tween WITH a 0% baseline at the playhead, instead of
        // contaminating a foreign-group tween. Mirror an existing keyframed tween's
        // time range so the new group animates over the same span. The 0% baseline is
        // an `_auto` endpoint so it tracks the nearest keyframe as you add more.
        // A fresh tween, so its target must address ONE element; with no
        // one-element form the edit is dropped rather than written onto every
        // class sibling (see writeTargetSelector).
        const newTweenTarget = writeTargetSelector(selection);
        if (newTweenTarget) {
          const template = selectedGsapAnimations.find((a) => !!a.keyframes);
          const tStart = template ? (resolveTweenStart(template) ?? 0) : 0;
          const tDur = template ? resolveTweenDuration(template) || 1 : 1;
          const ct = usePlayerStore.getState().currentTime;
          const pct =
            tDur > 0
              ? Math.max(0, Math.min(100, Math.round(((ct - tStart) / tDur) * 1000) / 10))
              : 0;
          const newProps = Object.fromEntries(propEntries);
          const keyframes =
            pct <= 0.05
              ? [{ percentage: 0, properties: newProps }]
              : [
                  { percentage: 0, properties: { ...newProps, _auto: 1 } },
                  { percentage: pct, properties: newProps },
                ];
          await commit(
            selection,
            {
              type: "add-with-keyframes",
              targetSelector: newTweenTarget,
              position: roundTo3(tStart),
              duration: roundTo3(tDur),
              keyframes,
            },
            { label: `Add ${primaryProp} keyframe`, softReload: true },
          );
          return;
        }
        throw new GsapEditBlockedError("no-selector");
      } catch (error) {
        bumpGsapCache();
        throw error;
      }
    },
    [selectedGsapAnimations, gsapCommitMutation, previewIframeRef, bumpGsapCache],
  );

  const commitAnimatedProperty = useCallback(
    (selection: DomEditSelection, property: string, value: number | string) =>
      commitAnimatedProperties(selection, { [property]: value }),
    [commitAnimatedProperties],
  );

  return { commitAnimatedProperty, commitAnimatedProperties };
}
