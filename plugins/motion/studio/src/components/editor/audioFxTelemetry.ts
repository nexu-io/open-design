/**
 * What the audio FX rack reports about itself.
 *
 * One module rather than `trackStudioEvent` calls scattered through six
 * components, for two reasons. The event names and property shapes have to
 * agree across the panel or a dashboard cannot join them — and everything here
 * is subject to one rule that is easy to break a callsite at a time:
 *
 * **Nothing user-authored leaves the browser.** Not element ids, not media
 * filenames, not composition paths, not chain JSON. Every property below is
 * either a fixed identifier from our own catalogue (a preset id, an effect
 * type, a parameter key), a number, or a boolean. `studioTelemetry.ts` already
 * sends only a route kind in `url_hash` for the same reason. The rack sees
 * the same class of data and must hold the same line.
 *
 * The second rule is about volume: **commit, not preview.** Every control in
 * the rack has a preview path that fires continuously while a slider moves and
 * a commit path that fires once when it is released. Only the commit path
 * belongs here. Wiring a param event to the preview would emit tens of events
 * per drag, which is both a cost and a lie — an author who nudges a knob and
 * puts it back did not make thirty decisions.
 */

import { trackStudioEvent } from "../../utils/studioTelemetry";
import type { HfAudioFxChain, HfAudioFxNode } from "@hyperframes/core/audio-fx";

/** Kept narrow deliberately — see the "nothing user-authored" rule above. */
type FxEventProperties = Record<string, string | number | boolean | null | undefined>;

function track(event: string, properties: FxEventProperties = {}): void {
  trackStudioEvent(`audio_fx_${event}`, properties);
}

/** Where a node in the chain came from, as one word. */
export function nodeOrigin(node: HfAudioFxNode): string {
  if (node.fromPreset) return "preset";
  if (node.fromCarve) return "carve";
  if (node.fromEq) return "eq";
  if (node.fromLeveller) return "leveller";
  return "hand";
}

/**
 * A chain reduced to counts.
 *
 * Counts rather than contents: "four nodes, two of them from a preset" answers
 * how the rack is used without shipping what the author built. The origin mix
 * is the interesting half — it separates a chain somebody assembled by hand
 * from one a preset wrote from one an analysis wrote.
 */
export function chainShape(chain: HfAudioFxChain | null): FxEventProperties {
  const nodes = chain?.nodes ?? [];
  const byOrigin = new Map<string, number>();
  for (const node of nodes) {
    const origin = nodeOrigin(node);
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + 1);
  }
  return {
    node_count: nodes.length,
    nodes_from_preset: byOrigin.get("preset") ?? 0,
    nodes_from_carve: byOrigin.get("carve") ?? 0,
    nodes_from_eq: byOrigin.get("eq") ?? 0,
    nodes_from_leveller: byOrigin.get("leveller") ?? 0,
    nodes_by_hand: byOrigin.get("hand") ?? 0,
    // How many distinct presets are live on this track. Stacking a character
    // preset onto a cleaned voice is a supported thing to want, and this is the
    // only way to find out whether anybody does it.
    preset_count: new Set(nodes.map((n) => n.fromPreset).filter(Boolean)).size,
    bypassed_count: nodes.filter((n) => n.enabled === false).length,
  };
}

export interface FxTrackContext {
  /** What the track reads as — `voice` / `music` / `sfx` / `unknown`. */
  trackKind?: string;
}

const ctx = (c: FxTrackContext): FxEventProperties => ({ track_kind: c.trackKind ?? "unknown" });

// --- presets ---------------------------------------------------------------

export function trackPresetApplied(
  presetId: string,
  family: string,
  nodeCount: number,
  mode: "append" | "replace" | "reapply",
  c: FxTrackContext,
): void {
  track("preset_applied", { preset: presetId, family, node_count: nodeCount, mode, ...ctx(c) });
}

export function trackPresetRemoved(presetId: string, c: FxTrackContext): void {
  track("preset_removed", { preset: presetId, ...ctx(c) });
}

/** The whole-preset wet/dry knob, on release. `amount` is 0..1. */
export function trackPresetAmount(presetId: string, amount: number, c: FxTrackContext): void {
  track("preset_amount", { preset: presetId, amount, ...ctx(c) });
}

export function trackPresetAutomated(presetId: string, on: boolean, c: FxTrackContext): void {
  track("preset_automated", { preset: presetId, enabled: on, ...ctx(c) });
}

/**
 * Hover-auditioning a preset from the shelf.
 *
 * Fired once per preset per time the shelf is opened, not once per hover: a
 * pointer crossing the shelf passes over a dozen items in a second, and
 * counting those would drown every other event in the feature and describe
 * mouse travel rather than interest.
 */
export function trackPresetAuditioned(presetId: string, c: FxTrackContext): void {
  track("preset_auditioned", { preset: presetId, ...ctx(c) });
}

// --- nodes -----------------------------------------------------------------

/**
 * `via` separates the two doors onto the same effect: a named job arrives
 * already aimed at a frequency, a bare effect does not. Which one authors
 * actually reach for is the question the jobs were built to answer.
 */
export function trackNodeAdded(
  type: string,
  via: "job" | "effect" | "eq" | "leveller",
  jobId: string | null,
  c: FxTrackContext,
): void {
  track("node_added", { effect: type, via, job: jobId ?? "none", ...ctx(c) });
}

export function trackNodeRemoved(type: string, origin: string, c: FxTrackContext): void {
  track("node_removed", { effect: type, origin, ...ctx(c) });
}

export function trackNodeBypassed(type: string, bypassed: boolean, c: FxTrackContext): void {
  track("node_bypassed", { effect: type, bypassed, ...ctx(c) });
}

export function trackNodeMoved(type: string, direction: "up" | "down", c: FxTrackContext): void {
  track("node_moved", { effect: type, direction, ...ctx(c) });
}

// --- parameters ------------------------------------------------------------

/**
 * A committed parameter edit.
 *
 * `surface` is the point of the event. Every effect with a one-knob profile can
 * be driven either by that derived knob or by opening Details and setting the
 * mechanism directly, and the whole one-knob design rests on a claim about
 * which one people use. Without this property the two are indistinguishable.
 *
 * The value goes too — a parameter key with no value tells you somebody touched
 * "frequency" and not that every author lands on 80 Hz.
 */
export function trackParamCommitted(
  type: string,
  param: string,
  value: number | string,
  surface: "knob" | "details",
  c: FxTrackContext,
): void {
  track("param_committed", { effect: type, param, value, surface, ...ctx(c) });
}

/** The derived one-knob control, on release. `strength` is 0..1. */
export function trackProfileCommitted(type: string, strength: number, c: FxTrackContext): void {
  track("profile_committed", { effect: type, strength, ...ctx(c) });
}

// --- the measuring modules -------------------------------------------------

export function trackCarveChanged(
  action: "enabled" | "disabled" | "strength" | "sources",
  props: { strength?: number; sourceCount?: number },
): void {
  track("carve_changed", {
    action,
    strength: props.strength,
    source_count: props.sourceCount,
  });
}

export function trackLeveller(action: "run" | "removed" | "auditioned"): void {
  track("leveller", { action });
}

export function trackEqChanged(band: string, value: number): void {
  track("eq_changed", { band, value });
}

// --- provenance ------------------------------------------------------------

/**
 * What arrived on a composition that this session did not put there.
 *
 * This is how agent-applied effects become visible at all. An agent asked to
 * fix a mix does not drive the panel — it edits the composition HTML, or runs
 * `skills/media-use/audio/scripts/carve.mjs`, and the rack simply finds the result already present.
 * None of the events above will ever fire for that work.
 *
 * So the panel reports the shape of what it was handed, and how many edits this
 * session had made when it appeared. Fx that changed while the studio was open
 * with `panel_edits` unmoved was written by something else — which, combined
 * with `agent_runtime` on the same event, is as close to "an agent did this" as
 * the browser can honestly get.
 *
 * `first_sight` distinguishes opening a composition that already had effects
 * from watching effects appear in one that did not.
 */
export function trackChainObserved(
  chain: HfAudioFxChain | null,
  props: { firstSight: boolean; panelEdits: number; hasCarve: boolean; hasAutomation: boolean },
  c: FxTrackContext,
): void {
  track("chain_observed", {
    ...chainShape(chain),
    first_sight: props.firstSight,
    panel_edits: props.panelEdits,
    // The whole point: no panel edits behind a chain that is present or that
    // just changed means the chain came from outside the studio.
    authored_outside: props.panelEdits === 0,
    has_carve: props.hasCarve,
    has_automation: props.hasAutomation,
    ...ctx(c),
  });
}
