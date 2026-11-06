/**
 * The levelling script and its playhead-transport audition: measure this
 * track, write the "Even Out Levels" node and lane, and preview the result
 * before committing to it.
 *
 * Split out of `propertyPanelAudioFxGroup.tsx`, which owned all of this before
 * the file grew past a size where "levelling" was still one thing to read.
 */

import { useRef, useState } from "react";
import {
  HF_AUDIO_FX_ATTR,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import { levellingResult, removeLevelling } from "@hyperframes/core/audio-leveller";
import type { HfAutomation, HfAutomationPoint } from "@hyperframes/core/audio-automation";
import { timeAtSourceTime } from "@hyperframes/core/speed-ramp";
import {
  automationAttrValue,
  HF_AUDIO_AUTOMATION_ATTR,
  withLane,
  withoutLane,
} from "./propertyPanelAutomation";
import { trackLeveller } from "./audioFxTelemetry.js";
import type { DomEditSelection } from "./domEditingTypes";
import { clipSourceWindow, readClipClock } from "./clipAudioClock.js";
import { useAuditionTransport } from "./useAuditionTransport.js";
import { studioApiFetch } from "../../utils/studioApiFetch";

/**
 * Rate the track is decoded at. Analysis is self-consistent because it reads
 * the decoded buffer's own rate, so this only has to be a sane audio rate.
 */
const DECODE_SAMPLE_RATE = 48000;

export function useFxLevelling(
  element: DomEditSelection,
  chain: HfAudioFxChain,
  automation: HfAutomation,
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>,
  onSetAttributeLive: (attr: string, value: string | null) => void | Promise<void>,
  setAnalysing: (value: boolean) => void,
) {
  /**
   * This track's audio, decoded once and kept.
   *
   * Levelling is measured from it, and hover-auditioning means measuring on every
   * pass over the button — fetching and decoding a several-minute voiceover each
   * time would make the audition slower than the thing it is previewing. Keyed by
   * `src` so a track pointed at a different file re-decodes.
   */
  const decoded = useRef<{ src: string; samples: Float32Array; sampleRate: number } | null>(null);

  const decodeTrack = async (): Promise<{ samples: Float32Array; sampleRate: number } | null> => {
    const el = element.element;
    const src = el?.getAttribute("src");
    const doc = el?.ownerDocument;
    if (!src || !doc) return null;
    const cached = decoded.current;
    if (cached?.src === src) return cached;
    const Ctor =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Ctor) return null;
    const res = await studioApiFetch(new URL(src, doc.baseURI).href);
    const buffer = await new Ctor(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(
      await res.arrayBuffer(),
    );
    const next = { src, samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
    decoded.current = next;
    return next;
  };

  /** The levelled chain and its lane, with the lane moved from the source's clock onto the clip's. */
  const measureLevelling = (audio: { samples: Float32Array; sampleRate: number }) => {
    // Measured on the part of the file the clip plays, so lane times map from that window's zero.
    const clock = readClipClock((name) => element.dataAttributes?.[name.slice(5)]);
    const played = clipSourceWindow(audio.samples, audio.sampleRate, clock);
    const result = levellingResult(chain, played, audio.sampleRate);
    if (!result) return null;
    const lane = result.automation.lanes[0];
    const toClipTime = (point: HfAutomationPoint) => ({
      ...point,
      t: Number(timeAtSourceTime(clock.rate, point.t).toFixed(3)),
    });
    return { chain: result.chain, lane: lane && { ...lane, points: lane.points.map(toClipTime) } };
  };

  const runLeveller = async (): Promise<void> => {
    setAnalysing(true);
    try {
      const audio = await decodeTrack();
      if (!audio) return;
      const result = measureLevelling(audio);
      if (!result) return;
      trackLeveller("run");
      await onSetAttributeQuiet(HF_AUDIO_FX_ATTR, serializeAudioFxChain(result.chain));
      // Merged by target, never written wholesale: the script describes its own
      // lane only, and replacing the attribute would take the carve's lanes and
      // the volume lane with it.
      const lane = result.lane;
      if (lane) {
        void onSetAttributeQuiet(
          HF_AUDIO_AUTOMATION_ATTR,
          automationAttrValue(withLane(automation, lane)) || null,
        );
      }
    } catch {
      // A track whose audio cannot be fetched or decoded simply gets no
      // levelling, the same way an unreadable carve source is skipped.
    } finally {
      setAnalysing(false);
    }
  };

  // Hovering plays from the playhead and leaving rewinds to exactly where it
  // started: browsing the shelf must not cost the author their place. Shared
  // with the timeline's FX popover — see `useAuditionTransport`.
  const auditionTransport = useAuditionTransport();

  const [auditioningLevel, setAuditioningLevel] = useState(false);
  /**
   * Bumped on every enter and leave, so a measurement can tell whether the
   * pointer is still on the button when it finishes.
   *
   * Decoding a long voiceover takes seconds, and a hover that takes seconds is
   * one the author has usually already left. Applying the result then would put
   * levelling on a track nobody asked to level, through a channel that does not
   * persist — so it would be audible, invisible in the document, and gone on the
   * next reload. This counter is what makes a late result a no-op.
   */
  const auditionRun = useRef(0);

  /** Both attributes back to the stored chain, because levelling is a node AND the lane that drives it. */
  const stopLevelAudition = (): void => {
    setAuditioningLevel(false);
    void onSetAttributeLive(
      HF_AUDIO_FX_ATTR,
      chain.nodes.length ? serializeAudioFxChain(chain) : null,
    );
    void onSetAttributeLive(HF_AUDIO_AUTOMATION_ATTR, automationAttrValue(automation) || null);
  };

  /** Measure this track and play the levelling without persisting it. */
  const startLevelAudition = async (run: number): Promise<void> => {
    setAuditioningLevel(true);
    try {
      const audio = await decodeTrack();
      // Gone, or superseded by a later hover. Either way this result is stale.
      if (!audio || run !== auditionRun.current) return;
      const result = measureLevelling(audio);
      if (!result || run !== auditionRun.current) return;
      void onSetAttributeLive(HF_AUDIO_FX_ATTR, serializeAudioFxChain(result.chain));
      const lane = result.lane;
      if (lane) {
        void onSetAttributeLive(
          HF_AUDIO_AUTOMATION_ATTR,
          automationAttrValue(withLane(automation, lane)) || null,
        );
      }
    } catch {
      // Same as the real run: a track that cannot be decoded simply does not
      // audition, rather than failing the panel.
    } finally {
      if (run === auditionRun.current) setAuditioningLevel(false);
    }
  };

  /**
   * `false` puts the stored chain and automation back; `true` measures and
   * plays the result without persisting it.
   */
  const auditionLevel = async (on: boolean): Promise<void> => {
    const run = ++auditionRun.current;
    if (!on) return stopLevelAudition();
    await startLevelAudition(run);
  };

  const removeLeveller = (): void => {
    trackLeveller("removed");
    const { chain: next, removedTarget } = removeLevelling(chain);
    void onSetAttributeQuiet(HF_AUDIO_FX_ATTR, serializeAudioFxChain(next));
    // The lane goes with the node. An orphan keeps driving a parameter that is
    // no longer in the graph.
    if (removedTarget) {
      void onSetAttributeQuiet(
        HF_AUDIO_AUTOMATION_ATTR,
        automationAttrValue(withoutLane(automation, removedTarget)) || null,
      );
    }
  };

  return { runLeveller, auditionTransport, auditioningLevel, auditionLevel, removeLeveller };
}
