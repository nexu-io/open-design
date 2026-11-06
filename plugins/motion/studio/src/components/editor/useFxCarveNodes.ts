/**
 * What a carve analysis COMPILES TO: the filter nodes it mints and the
 * automation lanes it writes for them.
 *
 * Split out of `useFxCarve.ts` to keep it under the studio's 600-line cap. This
 * half is pure — it takes measurements and returns nodes and lanes — while the
 * hook keeps the effects, the persistence and the auto-carve decisions.
 */

import {
  defaultAudioFxParams,
  mintAudioFxNodeId,
  type HfAudioFxChain,
  type HfAudioFxNode,
} from "@hyperframes/core/audio-fx";
import {
  analyseCarveBands,
  analyseCarveDuck,
  analyseCarveDynamics,
  carveBandsToChain,
  carveProfile,
  mixCarveSources,
} from "@hyperframes/core/audio-carve";
import { fxAutomationTarget, type HfAutomationLane } from "@hyperframes/core/audio-automation";
import { clipStart } from "./propertyPanelAudioFxGroupUtils.js";
import { clipAudioOnItsClock, type ClipClock } from "./clipAudioClock.js";
import { studioApiFetch } from "../../utils/studioApiFetch";

/** Decode rate every carve measurement shares — see `measureCarve`. */
const DECODE_SAMPLE_RATE = 48000;

/**
 * Turns the analysed bands (and, if the carve is asked to match levels, a
 * ducking envelope) into chain nodes — tagged so a re-run replaces them
 * instead of stacking, and minted against the nodes already claiming an id
 * because a dynamic carve automates these filters and a lane addresses its
 * node by id.
 */
export function mintCarveNodes(
  chain: HfAudioFxChain,
  carved: HfAudioFxChain,
  duck: { t: number; v: number }[],
): { next: HfAudioFxChain; carvedNodes: HfAudioFxNode[]; duckNode: HfAudioFxNode | null } {
  const kept = chain.nodes.filter((n) => !n.fromCarve);
  let claimed: HfAudioFxChain = { version: 1, nodes: kept };
  const mint = (node: HfAudioFxNode): HfAudioFxNode => {
    const withId = { ...node, id: mintAudioFxNodeId(claimed), fromCarve: true };
    claimed = { version: 1, nodes: [...claimed.nodes, withId] };
    return withId;
  };
  const carvedNodes: HfAudioFxNode[] = carved.nodes.map(mint);
  // The gain stage sits after the filters, and only exists when the carve was
  // asked to make level room. It sits at 0 and is driven by the envelope below.
  const duckNode =
    duck.length > 0
      ? mint({ type: "gain", enabled: true, params: { ...defaultAudioFxParams("gain"), gain: 0 } })
      : null;
  return {
    next: { version: 1, nodes: [...carvedNodes, ...(duckNode ? [duckNode] : []), ...kept] },
    carvedNodes,
    duckNode,
  };
}

/** A clip to decode, where it starts on the timeline, and how it plays its file. */
export interface CarveClip {
  src: string;
  start: string | null | undefined;
  clock: ClipClock;
}

/**
 * Decode every voice, mix them onto the bed's own clock, and measure the
 * bands (and, if the profile calls for it, the ducking envelope) from that
 * mix. Null on anything that leaves nothing to build a carve from — the
 * platform lacking an offline context, or a mix that decoded to silence.
 */
export async function measureCarve(
  doc: Document,
  voices: CarveClip[],
  strength: number,
  bed: Omit<CarveClip, "src"> & { src: string | null | undefined },
): Promise<{
  bands: ReturnType<typeof analyseCarveBands>;
  carved: HfAudioFxChain;
  duck: { t: number; v: number }[];
  voiceMix: Float32Array;
} | null> {
  // Decoded in an OfflineAudioContext, not a live one. Opening a second output
  // device mid-playback makes the running track glitch while the hardware is
  // reconfigured; an offline context touches no device.
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!Ctor) return null;
  // Each clip as it plays: trimmed to its in-point and duration, and at its own speed.
  const decode = async (relative: string, clock: ClipClock): Promise<Float32Array> => {
    const res = await studioApiFetch(new URL(relative, doc.baseURI).href);
    const buffer = await new Ctor(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(
      await res.arrayBuffer(),
    );
    return clipAudioOnItsClock(buffer.getChannelData(0), DECODE_SAMPLE_RATE, clock);
  };
  const bedStart = clipStart(bed.start);
  // Every voice, summed onto the bed's own clock. One question — where and
  // when is speech masking this bed — with one answer, even when the answer
  // comes from three people talking at different times. Doing this before the
  // analysis is also what lets the bands and the envelopes stay a single set:
  // the chain is fixed, so there is no per-voice filter to switch between.
  const decoded = await Promise.all(
    voices.map(async (voice) => ({
      samples: await decode(voice.src, voice.clock),
      offsetSeconds: clipStart(voice.start) - bedStart,
    })),
  );
  const mixed = mixCarveSources(decoded, DECODE_SAMPLE_RATE);
  if (mixed.length === 0) return null;
  // Strength is what the author set; these are the numbers it means.
  const profile = carveProfile(strength);
  // The bed as it plays: its length bounds the speech worth carving, and the duck
  // compares against it ("how far over the voice is this bed" needs both).
  const bedSamples = bed.src ? await decode(bed.src, bed.clock).catch(() => null) : null;
  // Speech after the bed stops has no bed to carve.
  const voiceMix = bedSamples ? mixed.subarray(0, bedSamples.length) : mixed;
  const bands = analyseCarveBands(voiceMix, DECODE_SAMPLE_RATE, profile);
  // The level half of the carve, measured against the speech it has to sit
  // under. No offset to apply: the mix is already on the bed's clock.
  const duck = bedSamples
    ? analyseCarveDuck(voiceMix, bedSamples, DECODE_SAMPLE_RATE, profile, 0)
    : [];
  return { bands, carved: carveBandsToChain(bands), duck, voiceMix };
}

/** Each filter's depth as an envelope, plus the level envelope if there is one. */
export function carveLanes(
  carvedNodes: HfAudioFxNode[],
  duckNode: HfAudioFxNode | null,
  duck: { t: number; v: number }[],
  voiceMix: Float32Array,
  bands: ReturnType<typeof analyseCarveBands>,
): HfAutomationLane[] {
  // Each filter's depth becomes an envelope of the speech's level in that
  // band, so pauses leave the bed alone and whoever is talking sets the depth.
  const lanes = analyseCarveDynamics(voiceMix, DECODE_SAMPLE_RATE, bands).flatMap((dyn, i) => {
    const id = carvedNodes[i]?.id;
    return id ? carveLaneFor(id, dyn.points) : [];
  });
  // The level envelope rides the gain stage, on the same clock as the bands.
  if (duckNode?.id && duck.length > 0) lanes.push(...carveLaneFor(duckNode.id, duck));
  return lanes;
}

/**
 * One carve envelope as a lane on this bed's clock.
 *
 * No shifting: the voices were summed onto the bed's clock before the analysis
 * ran, so what comes back is already in the bed's own time. A lane does hold
 * its first value backwards to the start of its clip, so an envelope that
 * begins later needs an explicit "no cut" at zero or the bed starts out ducked.
 */
function carveLaneFor(id: string, points: { t: number; v: number }[]): HfAutomationLane[] {
  const timed = points.map((p) => ({ t: Number(p.t.toFixed(3)), v: p.v })).filter((p) => p.t >= 0);
  if ((timed[0]?.t ?? 0) > 0) timed.unshift({ t: 0, v: 0 });
  return timed.length > 1 ? [{ target: fxAutomationTarget(id, "gain"), points: timed }] : [];
}
