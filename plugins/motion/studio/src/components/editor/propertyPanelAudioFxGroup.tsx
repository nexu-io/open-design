/**
 * The audio FX panel's bridge to the element/attribute world.
 *
 * Chain, carve and automation are all serialised onto the element the way colour
 * grading carries its config, so persistence is an ordinary attribute write with
 * no new server route. Split out of PropertyPanelFlat, which is at its size
 * budget, and self-contained enough to test on its own.
 */

import { useMemo, useState } from "react";
import {
  HF_AUDIO_FX_ATTR,
  HF_AUDIO_FX_DATA_KEY,
  parseAudioFxChain,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import {
  classifyAudioName,
  HF_AUDIO_CARVE_ATTR,
  normalizeCarveSettings,
  type HfCarveSettings,
} from "@hyperframes/core/audio-carve";
import {
  fxAutomationTarget,
  parseAutomationTarget,
  presetAutomationTarget,
  sampleAutomationLane,
  type HfAutomation,
} from "@hyperframes/core/audio-automation";
import {
  automatedTargetsOf,
  automationAttrValue,
  HF_AUDIO_AUTOMATION_ATTR,
  HF_AUDIO_AUTOMATION_DATA_KEY,
  readPanelAutomation,
  resolveAutomationRange,
  withoutLane,
  withSeededLane,
} from "./propertyPanelAutomation";
import type { DomEditSelection } from "./domEditingTypes";
import { useLivePlayheadTime } from "../../hooks/useLivePlayheadTime";
import { usePlayerStore } from "../../player/store/playerStore";
import { isRevealedAudioFxRequestCurrent } from "../../player/store/keyframeSlice";
import { FxSection } from "./propertyPanelFxSection.js";
import { clipStart } from "./propertyPanelAudioFxGroupUtils.js";
import { useFxChainObserved } from "./useFxChainObserved.js";
import { useFxCarve } from "./useFxCarve.js";
import { audioFxSignalPath } from "./audioFxSignalPath.js";
import type { AuditionSpan } from "./useAuditionTransport.js";
import {
  HF_AUDIO_GROUP_ATTR,
  HF_AUDIO_GROUP_TAG,
  resolveAudioGroups,
} from "@hyperframes/core/audio-groups";
import { useFxLevelling } from "./useFxLevelling.js";
import { isCarveVoiceElement } from "./useFxCarveGrouping.js";

function auditionSpan(startRaw: string | undefined, durationRaw: string | undefined) {
  const start = Number.parseFloat(startRaw ?? "");
  const duration = Number.parseFloat(durationRaw ?? "");
  return Number.isFinite(start) && Number.isFinite(duration) && duration > 0
    ? { start, duration }
    : null;
}

/** The selected clip, or every current member when the selected rack is a bus. */
function auditionSpansFor(element: DomEditSelection): AuditionSpan[] {
  const own = auditionSpan(element.dataAttributes?.["start"], element.dataAttributes?.["duration"]);
  if (own) return [own];
  if (element.tagName?.toLowerCase() !== HF_AUDIO_GROUP_TAG || !element.id) return [];
  const doc = element.element?.ownerDocument;
  if (!doc) return [];
  return [...doc.querySelectorAll(`[${HF_AUDIO_GROUP_ATTR}]`)]
    .filter((member) => member.getAttribute(HF_AUDIO_GROUP_ATTR) === element.id)
    .filter(isCarveVoiceElement)
    .flatMap((member) => {
      const span = auditionSpan(
        member.getAttribute("data-start") ?? undefined,
        member.getAttribute("data-duration") ?? undefined,
      );
      return span ? [span] : [];
    });
}

/**
 * Bridges the FX panel to the element/attribute world. Chain and carve are
 * serialised onto the element the way colour grading carries its config, so
 * persistence is an ordinary attribute write with no new server route.
 */
export function AudioFxGroup({
  element,
  onSetAttributeQuiet: onSetAttributeQuietRaw,
  onSetAttributeLive,
  onAutoGroupCarveSources,
}: {
  element: DomEditSelection;
  /**
   * Every write here is quiet: it persists to the source and skips the preview
   * reload, because the runtime applies chain and automation edits to the
   * running graph — a reload would only interrupt the audio to reach the same
   * state, which is heard as the track chopping.
   *
   * It does re-read the selection afterwards, which this panel depends on: each
   * edit is computed from the current attribute, so without the resync a second
   * edit would work from a pre-edit value and appear to do nothing.
   */
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>;
  /** Continuous, non-persisting write for a dial being dragged. */
  onSetAttributeLive: (attr: string, value: string | null) => void | Promise<void>;
  /** Write `data-audio-group` on every named clip, atomically, one undo entry. */
  onAutoGroupCarveSources?: (clipIds: readonly string[], groupId: string) => Promise<void>;
}) {
  const chain = ((): HfAudioFxChain => {
    const raw = element.dataAttributes?.[HF_AUDIO_FX_DATA_KEY];
    if (!raw) return { version: 1, nodes: [] };
    try {
      return parseAudioFxChain(raw);
    } catch {
      // Show an unreadable chain as empty rather than breaking the panel; the
      // attribute is left untouched until the user changes something.
      return { version: 1, nodes: [] };
    }
  })();

  const automation = readPanelAutomation(
    element.dataAttributes?.[HF_AUDIO_AUTOMATION_DATA_KEY],
    chain,
  );
  const automatedTargets = automatedTargetsOf(automation);

  /**
   * What every automated knob is worth at the playhead, so the rack shows the
   * value the audio is actually using rather than the one the attribute stores.
   *
   * An automated parameter has two values: the number sitting in the chain, which
   * is only a seed once a lane exists, and the number the envelope is on right now.
   * The second is the true one, and a rack that shows the first reads as broken
   * during playback — the carve is visibly working and the readouts do not move.
   *
   * Sampled while paused as well, because the same argument applies to a scrub:
   * the playhead is somewhere, and the envelope has a value there.
   *
   * Sampled off the clip too, which is not obvious. A lane holds its first value
   * backwards and its last value forwards, so before the clip starts it already
   * knows what it will open on — while the stored number is a seed the lane
   * replaced and nothing will ever play. Showing that seed put a value on screen
   * that the automation never uses, and made the fader jump the moment the clip
   * came under the playhead.
   */
  const playhead = useLivePlayheadTime();
  const revealRequest = usePlayerStore((s) => s.revealedAudioFxTarget);
  const timelineProjectId = usePlayerStore((s) => s.timelineProjectId);
  const timelineSessionEpoch = usePlayerStore((s) => s.timelineSessionEpoch);
  const localTime = playhead - clipStart(element.dataAttributes?.["start"]);
  const liveAutomationValues = ((): Map<string, number> => {
    const values = new Map<string, number>();
    for (const lane of automation.lanes) {
      const range = resolveAutomationRange(lane.target, chain);
      if (!range) continue;
      values.set(lane.target, sampleAutomationLane(lane, localTime, range.scale));
    }
    return values;
  })();

  const carve = ((): HfCarveSettings | null => {
    const raw = element.dataAttributes?.["fx-carve"];
    if (!raw) return null;
    try {
      return normalizeCarveSettings(JSON.parse(raw));
    } catch {
      return null;
    }
  })();

  /**
   * Every persisting write this panel makes, counted — see `useFxChainObserved`,
   * which reports a chain that changed without one of these behind it as work
   * something outside the studio did.
   */
  const onSetAttributeQuiet = useFxChainObserved(
    element,
    chain,
    carve,
    automation,
    onSetAttributeQuietRaw,
  );

  // Written through the live path on purpose. It persists to the source just
  // like the refreshing one, but skips the preview reload — and a reload
  // restarts every playing track, which is heard as the audio chopping. The
  // runtime follows the attribute and swaps the graph in place instead.
  const writeAutomation = (next: HfAutomation): void => {
    void onSetAttributeQuiet(HF_AUDIO_AUTOMATION_ATTR, automationAttrValue(next) || null);
  };

  /**
   * Start automating one effect parameter.
   *
   * The lane is seeded with a single point at the value the control currently
   * holds, so switching to an envelope never changes the sound — it only moves
   * where the value comes from. The author then adds points in the timeline.
   */
  const automateParam = (nodeId: string, paramKey: string): void => {
    const target = fxAutomationTarget(nodeId, paramKey);
    const node = chain.nodes.find((n) => n.id === nodeId);
    const range = resolveAutomationRange(target, chain);
    if (!node || !range) return;
    const raw = node.params?.[paramKey];
    writeAutomation(
      withSeededLane(automation, target, typeof raw === "number" ? raw : range.default),
    );
  };

  /** Stop automating it, handing the value back to the panel control. */
  const removeParamAutomation = (nodeId: string, paramKey: string): void => {
    writeAutomation(withoutLane(automation, fxAutomationTarget(nodeId, paramKey)));
  };

  /**
   * Automate a whole preset's amount — the wet/dry blend around its run.
   *
   * Seeded where the preset already sits, so switching to a lane never changes
   * the sound; the author then draws the ramp in the timeline. Same contract as
   * automating one parameter, one level up.
   */
  const automatePreset = (presetId: string, amount: number): void => {
    writeAutomation(withSeededLane(automation, presetAutomationTarget(presetId), amount));
  };

  const removePresetAutomation = (presetId: string): void => {
    writeAutomation(withoutLane(automation, presetAutomationTarget(presetId)));
  };

  /** Presets a lane already drives, so the panel shows a readout not a slider. */
  const automatedPresets = new Set(
    automation.lanes
      .map((lane) => parseAutomationTarget(lane.target))
      .filter((t): t is { kind: "preset"; presetId: string } => t?.kind === "preset")
      .map((t) => t.presetId),
  );

  /**
   * Drop every lane belonging to these nodes, and optionally a whole-preset one.
   *
   * Takes a LIST rather than one id, because each call recomputes from the same
   * render-time `automation` snapshot and writes the whole attribute: calling it
   * per node in a loop meant every write but the last was discarded, and only
   * the final node's lanes were actually removed. The rest survived as orphans,
   * and with ids minted lowest-free the next effect added inherited one —
   * arriving "Automated" with an envelope nobody drew, baked into the render.
   */
  const removeNodesAutomation = (nodeIds: readonly string[], presetId?: string): void => {
    const prefixes = nodeIds.map((id) => `fx.${id}.`);
    const kept = automation.lanes.filter(
      (lane) =>
        !prefixes.some((p) => lane.target.startsWith(p)) &&
        !(presetId !== undefined && lane.target === presetAutomationTarget(presetId)),
    );
    if (kept.length !== automation.lanes.length) {
      writeAutomation({ version: 1, lanes: kept });
    }
  };

  const removeNodeAutomation = (nodeId: string): void => removeNodesAutomation([nodeId]);

  const [analysing, setAnalysing] = useState(false);

  // The rack's In/Out lines. Resolved from the live document because a group's
  // membership lives on the members, so neither end of the routing can be read
  // off the selected element alone.
  // Keyed on the store's element array as well as the selection: membership is
  // held by the MEMBERS, so a clip joining or leaving this group changes neither
  // `element` nor its attributes, and the path went stale — "OUT to mix" on a
  // clip that had just been grouped. `syncStoredGroupAttribute` and
  // `updateElement` both replace the array, so its identity is the cheap signal
  // that membership may have moved.
  const storeElements = usePlayerStore((s) => s.elements);
  const signalPath = useMemo(() => {
    const doc = element.element?.ownerDocument;
    return audioFxSignalPath(
      element.tagName?.toLowerCase(),
      element.id ?? undefined,
      doc ? resolveAudioGroups(doc) : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, storeElements]);

  // A bus has no span of its own, so resolve the live members. The
  // `storeElements` subscription above rerenders this panel when membership
  // changes without changing the selection.
  const auditionSpans = auditionSpansFor(element);

  const { carvedAgainstBy, sourceOptions, setCarve } = useFxCarve(
    element,
    chain,
    carve,
    automation,
    onSetAttributeQuiet,
    writeAutomation,
    setAnalysing,
    onAutoGroupCarveSources,
  );

  const { runLeveller, auditionTransport, auditioningLevel, auditionLevel, removeLeveller } =
    useFxLevelling(
      element,
      chain,
      automation,
      onSetAttributeQuiet,
      onSetAttributeLive,
      setAnalysing,
    );

  return (
    <FxSection
      // A lane's reveal request, but only when it names THIS element: the rack
      // shows one element, and a request aimed at another must not reopen
      // whatever happens to be mounted. Stale requests (other project, pre-
      // reload session) are refused by the same check.
      revealTarget={
        revealRequest &&
        revealRequest.elementKey === element.id &&
        isRevealedAudioFxRequestCurrent(revealRequest, {
          timelineProjectId,
          timelineSessionEpoch,
        })
          ? revealRequest.automationTarget
          : null
      }
      // Forwarded, not dropped: the section consumes by nonce, so without it a
      // request never fires and a second click on the same lane is inert.
      revealNonce={
        revealRequest &&
        revealRequest.elementKey === element.id &&
        isRevealedAudioFxRequestCurrent(revealRequest, {
          timelineProjectId,
          timelineSessionEpoch,
        })
          ? revealRequest.nonce
          : null
      }
      // Locked while the carve is measuring. `analyse` captures the chain and
      // the automation BEFORE its fetch and decode, then rewrites the whole
      // attribute from that snapshot — so an effect added, or a knob committed,
      // during those seconds was silently discarded when the analysis landed.
      // Only the Analyse button was disabled, so every other control in the rack
      // stayed live throughout. Refusing the edit is honest; merging it into a
      // measurement that did not account for it would not be.
      disabled={analysing}
      chain={chain}
      automatedTargets={automatedTargets}
      liveAutomationValues={liveAutomationValues}
      onAutomateParam={automateParam}
      onRemoveParamAutomation={removeParamAutomation}
      onRemoveNodeAutomation={removeNodeAutomation}
      onRemoveNodesAutomation={removeNodesAutomation}
      onChainChange={(next) =>
        // Live for the same reason as automation above: adding, removing or
        // bypassing an effect is applied to the running graph, so a reload would
        // only interrupt the audio to reach the same state.
        onSetAttributeQuiet(
          HF_AUDIO_FX_ATTR,
          next.nodes.length ? serializeAudioFxChain(next) : null,
        )
      }
      signalPath={signalPath}
      onAuditionTransport={(on) => auditionTransport(on, auditionSpans)}
      onChainPreview={(next) =>
        // Live writes skip the preview refresh entirely, so dragging a knob no
        // longer reloads the composition and restarts playback on every pixel.
        // The gesture-end write above is the one that resyncs.
        onSetAttributeLive(HF_AUDIO_FX_ATTR, next.nodes.length ? serializeAudioFxChain(next) : null)
      }
      carve={carve}
      onCarveChange={(next) => void setCarve(next)}
      onCarvePreview={(next) => onSetAttributeLive(HF_AUDIO_CARVE_ATTR, JSON.stringify(next))}
      sourceOptions={sourceOptions}
      // What this track sounds like, by the same reading that decides which
      // OTHER tracks a carve may listen to. The shelf uses it to stop offering
      // "My voice sounds amateur" on a music bed.
      trackKind={classifyAudioName(element.id, element.element?.getAttribute("src"))}
      onLevel={() => void runLeveller()}
      onRemoveLevel={removeLeveller}
      levelled={chain.nodes.some((n) => n.fromLeveller)}
      onAutomatePreset={automatePreset}
      onRemovePresetAutomation={removePresetAutomation}
      automatedPresets={automatedPresets}
      onAuditionLevel={(on) => void auditionLevel(on)}
      auditioningLevel={auditioningLevel}
      carvedAgainstBy={carvedAgainstBy}
      analysing={analysing}
    />
  );
}
