/**
 * Reading and editing an element's automation from the property panel.
 *
 * Shared by the audio FX group (per-effect parameters) and the media section
 * (track volume), so both agree on what "automated" means and both write the
 * attribute the same way.
 */

import type { HfAutomationLane } from "@hyperframes/core/audio-automation";
import {
  HF_AUDIO_AUTOMATION_ATTR,
  HF_AUDIO_AUTOMATION_DATA_KEY,
  parseAutomation,
  resolveAutomation,
  resolveAutomationRange,
  serializeAutomation,
  type HfAutomation,
} from "@hyperframes/core/audio-automation";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { mergeInsertPoint } from "../../player/components/automationLaneGeometry";

const EMPTY: HfAutomation = { version: 1, lanes: [] };

/**
 * The element's automation as the panel should treat it.
 *
 * Pass the chain to have it bound: a lane whose effect has been deleted is then
 * dropped rather than reported as automating something. Pass `undefined` when
 * the caller genuinely does not know the chain — the volume section does not
 * parse it — and every lane is preserved instead.
 *
 * That distinction matters because callers write this value straight back to the
 * attribute. Resolving against a chain that was merely unavailable would delete
 * every FX lane the moment someone automated the volume.
 *
 * An unreadable attribute reads as no automation rather than breaking the panel;
 * it is left untouched until the author changes something.
 */
export function readPanelAutomation(
  raw: string | undefined,
  chain: HfAudioFxChain | undefined,
): HfAutomation {
  if (!raw) return EMPTY;
  try {
    const parsed = parseAutomation(raw);
    return chain ? resolveAutomation(parsed, chain) : parsed;
  } catch {
    return EMPTY;
  }
}

/** Targets the element currently automates. */
export function automatedTargetsOf(automation: HfAutomation): Set<string> {
  return new Set(automation.lanes.map((lane) => lane.target));
}

/**
 * Add a lane for `target`, seeded with a single point at `current`.
 *
 * One point is a constant, so switching a parameter to an envelope does not
 * change the sound — it only moves where the value comes from. The author then
 * shapes it in the timeline.
 */
export function withSeededLane(
  automation: HfAutomation,
  target: string,
  current: number,
): HfAutomation {
  if (automation.lanes.some((lane) => lane.target === target)) return automation;
  return { version: 1, lanes: [...automation.lanes, { target, points: [{ t: 0, v: current }] }] };
}

/** Drop one lane, handing its value back to the panel control. */
export function withoutLane(automation: HfAutomation, target: string): HfAutomation {
  return { version: 1, lanes: automation.lanes.filter((lane) => lane.target !== target) };
}

/**
 * Replace one lane, leaving every other lane alone.
 *
 * A script that hands back a whole `HfAutomation` describes only its OWN lane.
 * Writing that wholesale would take the carve's lanes and the volume lane with
 * it, so what the script produces has to be merged in by target rather than
 * swapped for what is already there.
 */
export function withLane(automation: HfAutomation, lane: HfAutomationLane): HfAutomation {
  return {
    version: 1,
    lanes: [...automation.lanes.filter((l) => l.target !== lane.target), lane],
  };
}

/** Insert or replace the point nearest `t` on `target`'s lane — reuses the
 * timeline envelope's own double-click merge rule, so a panel control with no
 * drag gesture of its own can still write into an automated parameter the
 * same way. */
export function withPointAt(
  automation: HfAutomation,
  target: string,
  t: number,
  v: number,
): HfAutomation {
  const points = automation.lanes.find((lane) => lane.target === target)?.points ?? [];
  return withLane(automation, { target, points: mergeInsertPoint(points, t, v) });
}

/** The attribute value for an automation set; empty when nothing is automated. */
export function automationAttrValue(automation: HfAutomation): string {
  return automation.lanes.length > 0 ? serializeAutomation(automation) : "";
}

export { HF_AUDIO_AUTOMATION_ATTR, HF_AUDIO_AUTOMATION_DATA_KEY, resolveAutomationRange };
