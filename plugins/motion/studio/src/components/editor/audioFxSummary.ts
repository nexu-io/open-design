/**
 * What the collapsed Audio FX group says it holds.
 *
 * It has to describe the rack the author would see on opening it, which counts a
 * carve as one module rather than as the filters it compiles to. Six peaking
 * bands and a level stage reading "7 effects" invited exactly the misreading the
 * grouping exists to prevent — that they are seven things to manage.
 */

import { HF_AUDIO_FX_DATA_KEY, parseAudioFxChain } from "@hyperframes/core/audio-fx";
import type { DomEditSelection } from "./domEditingTypes";

/** Enabled nodes split by who authored them, or null when the chain won't parse. */
function countEnabledNodes(raw: string | undefined): { handBuilt: number; carve: number } | null {
  if (!raw) return { handBuilt: 0, carve: 0 };
  try {
    let handBuilt = 0;
    let carve = 0;
    for (const node of parseAudioFxChain(raw).nodes) {
      if (node.enabled === false) continue;
      if (node.fromCarve) carve += 1;
      else handBuilt += 1;
    }
    return { handBuilt, carve };
  } catch {
    return null;
  }
}

export function audioFxSummary(element: DomEditSelection, groupLabel?: string): string {
  // A clip inside a group reads "in Voiceover" — the designs use this line to
  // answer "where does this go?" before the author opens anything, which is
  // the same job the rack's OUT does from the other end. It outranks the effect
  // count: a member with no effects of its own is still IN the group, and that
  // is the more useful thing to say about it.
  if (groupLabel) return `in ${groupLabel}`;
  const counts = countEnabledNodes(element.dataAttributes?.[HF_AUDIO_FX_DATA_KEY]);
  if (!counts) return "unreadable";
  const parts: string[] = [];
  if (counts.handBuilt > 0) {
    parts.push(`${counts.handBuilt} effect${counts.handBuilt === 1 ? "" : "s"}`);
  }
  // One name for the module however many filters are behind it. Named when the
  // carve is switched on at all, because the control is in this section whether or
  // not it has compiled to anything yet.
  if (counts.carve > 0 || element.dataAttributes?.["fx-carve"]) parts.push("carve");
  return parts.length > 0 ? parts.join(" + ") : "none";
}
