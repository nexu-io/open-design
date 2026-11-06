/**
 * Reading an element's automation, shared by the lane UI and the row layout.
 *
 * The attributes are carried on TimelineElement verbatim rather than parsed at
 * the manifest boundary: the lane reads and writes them, and round-tripping
 * through the attribute is what keeps the lane, the property panel and the
 * running audio graph on one source of truth.
 *
 * Both parse the same two attributes: the layout needs the lane count to
 * reserve height, the lanes need the lanes themselves. Parsing is cached by the
 * attribute text so the identity only changes when the text does — the lane's
 * drag draft compares against that identity, and a fresh object on every
 * playhead tick would throw away the drag in progress.
 */

import {
  parseAutomation,
  parseAutomationTarget,
  resolveAutomation,
  resolveAutomationRange,
  type HfAutomation,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import { parseAudioFxChain, type HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { isAudioOrVideoTimelineElement } from "../../utils/timelineInspector";
import type { TimelineElement } from "../store/playerStore";

const EMPTY: HfAutomation = { version: 1, lanes: [] };

const chainCache = new Map<string, HfAudioFxChain | null>();
const automationCache = new Map<string, HfAutomation>();
const CACHE_LIMIT = 64;

/**
 * Parse once per distinct attribute text, keeping the same object until the text
 * changes — the lane compares its drag draft against that identity.
 *
 * Eviction drops the oldest entry rather than clearing the map: clearing would
 * change the identity of every lane's automation at once, and any lane mid-drag
 * would release its draft and jump back to the stored value.
 */
function cached<T>(store: Map<string, T>, key: string, build: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) {
    // Re-insert so the entry counts as recently used.
    store.delete(key);
    store.set(key, hit);
    return hit;
  }
  const value = build();
  if (store.size >= CACHE_LIMIT) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  store.set(key, value);
  return value;
}

/** The element's FX chain, or null when it has none or it is unreadable. */
export function elementFxChain(element: TimelineElement): HfAudioFxChain | null {
  const raw = element.fxChain;
  if (!raw) return null;
  return cached(chainCache, raw, () => {
    try {
      return parseAudioFxChain(raw);
    } catch {
      return null;
    }
  });
}

/**
 * The element's automation, bound to its chain the same way preview and the
 * render bind it: a lane whose effect has been deleted is dropped rather than
 * drawn on the wrong axis.
 */
export function elementAutomation(element: TimelineElement): HfAutomation {
  const raw = element.automation;
  if (!raw) return EMPTY;
  const chain = elementFxChain(element);
  // Both texts key the entry: the resolved lanes depend on the chain too. Joined
  // through a separator no attribute can contain.
  return cached(automationCache, `${raw}\u0000${element.fxChain ?? ""}`, () => {
    try {
      const resolved = resolveAutomation(parseAutomation(raw), chain ?? undefined);
      return { ...resolved, lanes: orderLanes(resolved.lanes, chain) };
    } catch {
      // Unreadable automation draws no lanes rather than breaking the row.
      return EMPTY;
    }
  });
}

/**
 * Is this lane one the CARVE wrote, rather than the author?
 *
 * The carve compiles to tagged nodes and rewrites their envelopes on every
 * re-run (`withoutCarveLanes` replaces each one), so a drag on such a lane is
 * silently discarded the next time it analyses. Read-only rather than hidden:
 * the ducking curve is what a carve IS, and the whole reason to look at a
 * carved bed in the timeline is to see where it makes room. Hiding them left a
 * bed whose every lane was the carve's showing no automation at all and no
 * control to reveal any — which reads as the carve having done nothing.
 */
export function isCarveLane(target: string, chain: HfAudioFxChain | null): boolean {
  return (chain?.nodes ?? []).some(
    (node) => node.fromCarve && node.id && target.startsWith(`fx.${node.id}.`),
  );
}

/** Lanes in the order they are drawn, one row each. */
/**
 * The lanes a TIMELINE row should draw.
 *
 * Every lane the element carries, the carve's included — see `isCarveLane` for
 * why those are shown read-only instead of withheld.
 */
export function elementAutomationLanes(element: TimelineElement): HfAutomationLane[] {
  return elementAutomation(element).lanes;
}

/** The frequency the lane's effect sits at, when it has one. */
function laneFrequency(target: string, chain: HfAudioFxChain | null): number | null {
  const parsed = parseAutomationTarget(target);
  if (!parsed || parsed.kind !== "fx") return null;
  const node = chain?.nodes.find((n) => n.id === parsed.nodeId);
  const freq = node?.params?.["frequency"];
  return typeof freq === "number" ? freq : null;
}

/**
 * Lane order: the audible spectrum, top down, then everything else.
 *
 * A stack of EQ bands is read as a spectrum, so it has to be laid out like one —
 * high at the top, the way every analyser and every EQ curve is drawn. Attribute
 * order is whatever minted the nodes, which for a carve is ascending: exactly
 * upside down. Lanes with no frequency to place them — a level stage, the track's
 * own volume — keep their written order and sit under the bands, like a fader
 * below the EQ section of a channel strip.
 *
 * Sorted here, in the one function both the canvas lanes and the label column
 * read, because a label whose row disagrees with the envelope it names is worse
 * than either order.
 */
function orderLanes(lanes: HfAutomationLane[], chain: HfAudioFxChain | null): HfAutomationLane[] {
  const withFreq: { lane: HfAutomationLane; freq: number }[] = [];
  const rest: HfAutomationLane[] = [];
  for (const lane of lanes) {
    const freq = laneFrequency(lane.target, chain);
    if (freq === null) rest.push(lane);
    else withFreq.push({ lane, freq });
  }
  withFreq.sort((a, b) => b.freq - a.freq);
  return [...withFreq.map((e) => e.lane), ...rest];
}

/** A frequency as an author reads it: 400 Hz, 1.6 kHz, 10 kHz. */
export function formatHz(freq: number): string {
  if (freq < 1000) return `${Math.round(freq)} Hz`;
  const k = freq / 1000;
  return `${k >= 10 ? Math.round(k) : Number(k.toFixed(1))} kHz`;
}

/**
 * What a lane is called in the timeline, as its two lines.
 *
 * `name` is the effect and, when it has one, the frequency it sits at: "Peaking
 * EQ 1.6 kHz". The frequency is what tells two bands apart — three lanes all
 * reading "Peaking EQ" say nothing about which is which — and the effect still
 * has to be named, since a chain mixes filter types and a bare frequency does not
 * say whether it is a bell or a shelf.
 *
 * `param` is which knob the envelope drives, on its own line: a band can carry a
 * gain lane and a Q lane, and stacking the two lines is what keeps a name legible
 * in a column this narrow instead of truncating mid-word.
 *
 * Null when the target does not resolve against the chain — the same condition
 * that stops the lane being drawn at all.
 */
export function automationLaneLabelParts(
  target: string,
  chain: HfAudioFxChain | null,
): { name: string; param: string } | null {
  const range = resolveAutomationRange(target, chain ?? undefined);
  if (!range) return null;
  // The registry's label is "<effect> · <param>", or just "<param>" for volume.
  const parts = range.label.split(" · ");
  const param = parts.at(-1) ?? range.label;
  const effect = parts.length > 1 ? parts.slice(0, -1).join(" · ") : null;
  const freq = laneFrequency(target, chain);
  const name = [effect, freq === null ? null : formatHz(freq)].filter(Boolean).join(" ");
  return { name: name || param, param: name ? param : "" };
}

/**
 * What makes two lanes, on two different clips, the same lane row.
 *
 * A lane is a property over time, not a clip's private strip: four narration slices
 * on one track that each automate a 1 kHz peaking Q belong in ONE row, each drawing
 * its envelope over its own span.
 *
 * The key cannot be the lane target. Targets are `fx.<nodeId>.<param>` and node ids
 * are minted per chain, so `fx.n1.q` on one clip and `fx.n1.q` on another may be
 * different effects entirely — grouping by target would put unrelated envelopes in
 * one row and split matching ones apart. So the key is what identifies the parameter
 * to a reader: the effect, whatever distinguishes it from its siblings (a filter's
 * frequency), and the parameter. Which is exactly what the label already says, so
 * the row's identity and its name cannot drift apart.
 *
 * Null when the target does not resolve, the same condition that stops it drawing.
 */
export function laneGroupKey(target: string, chain: HfAudioFxChain | null): string | null {
  return automationLaneLabel(target, chain);
}

/** One clip's envelope inside a shared row: the clip, and the lane it draws. */
export interface AutomationLaneGroupEntry {
  element: TimelineElement;
  lane: HfAutomationLane;
}

/** A lane row on a track: one property, and every clip that automates it. */
export interface AutomationLaneGroup {
  /** {@link laneGroupKey} — the row's identity, and also its whole label. */
  key: string;
  /** The label's two lines, as {@link automationLaneLabelParts} splits them. */
  name: string;
  param: string;
  /** In track order. A clip that does not automate this property is simply
   *  absent, leaving its stretch of the row empty. */
  entries: AutomationLaneGroupEntry[];
}

/**
 * The lane rows a TRACK shows, unioned over the clips sharing it.
 *
 * Several clips on one row (four narration slices, say) each carry their own
 * chain and their own envelopes. Drawing only the selected clip's made a per-clip
 * lane read as governing the whole row, and swapped which envelopes were visible
 * whenever the selection moved. So the row is keyed by the property — a clip
 * draws into the row for `Peaking EQ 1 kHz · Q` over its own span, and clips that
 * automate nothing there leave it empty.
 *
 * Row order is first-seen: each clip's lanes are already in draw order (the
 * spectrum, top down), so the first clip to carry a property fixes its row and
 * later clips only append properties nobody has shown yet.
 *
 * Gated on `isAudioOrVideoTimelineElement`, the same predicate `automationLaneCountOf`
 * and `TimelineAutomationLaneSlot`'s clip filter use — the row's reserved height
 * and its drawn lanes have to count the same clips.
 */
export function groupAutomationLanes(elements: readonly TimelineElement[]): AutomationLaneGroup[] {
  const groups = new Map<string, AutomationLaneGroup>();
  for (const element of elements) {
    if (!isAudioOrVideoTimelineElement(element)) continue;
    const chain = elementFxChain(element);
    for (const lane of elementAutomationLanes(element)) {
      const key = laneGroupKey(lane.target, chain);
      const parts = automationLaneLabelParts(lane.target, chain);
      // Null on both together: an unresolvable target draws no lane either.
      if (!key || !parts) continue;
      const group = groups.get(key);
      if (group) group.entries.push({ element, lane });
      else {
        groups.set(key, {
          key,
          name: parts.name,
          param: parts.param,
          entries: [{ element, lane }],
        });
      }
    }
  }
  return [...groups.values()];
}

/** The whole label on one line, for a tooltip or an accessible name. */
export function automationLaneLabel(target: string, chain: HfAudioFxChain | null): string | null {
  const parts = automationLaneLabelParts(target, chain);
  if (!parts) return null;
  return parts.param ? `${parts.name} · ${parts.param}` : parts.name;
}
