import { useEffect, useRef } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore } from "../store/playerStore";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { animationContributesLane } from "./TimelinePropertyLanes";

/**
 * Keyframed clips start expanded (AE/Figma default). Auto-expands each clip the
 * first time it contributes a lane — real keyframes OR a synthesizable flat tween
 * — tracked per-clip so a later user collapse sticks and never bounces back open
 * (and clips added later still auto-expand).
 */
/**
 * Prunes clips that left the source, then returns the ones that newly contribute
 * a lane. The prune matters because the set is otherwise append-only: a clip
 * deleted and reinserted under the same id (undo, paste) would be remembered as
 * already-expanded and never auto-expand again.
 */
function freshLaneClips(gsapAnimations: Map<string, GsapAnimation[]>, clips: Set<string>) {
  for (const key of clips) {
    if (!gsapAnimations.has(key)) clips.delete(key);
  }
  const fresh: string[] = [];
  for (const [key, animations] of gsapAnimations) {
    if (clips.has(key)) continue;
    if (animations.some(animationContributesLane)) fresh.push(key);
  }
  return fresh;
}

export function useAutoExpandKeyframedClips(gsapAnimations: Map<string, GsapAnimation[]>): void {
  const expandClips = usePlayerStore((s) => s.expandClips);
  const projectId = useStudioShellContextOptional()?.projectId ?? null;
  const seen = useRef({ projectId, source: gsapAnimations, clips: new Set<string>() });
  useEffect(() => {
    if (seen.current.projectId !== projectId) {
      const sourceChanged = seen.current.source !== gsapAnimations;
      seen.current = { projectId, source: gsapAnimations, clips: new Set() };
      if (!sourceChanged) return;
    } else {
      seen.current.source = gsapAnimations;
    }
    const fresh = freshLaneClips(gsapAnimations, seen.current.clips);
    if (fresh.length === 0) return;
    for (const key of fresh) seen.current.clips.add(key);
    expandClips(fresh);
  }, [gsapAnimations, expandClips, projectId]);
}
