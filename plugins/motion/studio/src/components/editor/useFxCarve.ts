/**
 * The voiceover carve: candidate voices, the relationship to another track's
 * carve, and the measurement that turns a voice into peaking filters and
 * ducking envelopes on this track.
 *
 * Split out of `propertyPanelAudioFxGroup.tsx`, which owned all of this before
 * the file grew past a size where "the carve" was still one thing to read.
 */

import { useEffect, useRef } from "react";
import {
  HF_AUDIO_FX_ATTR,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import {
  clipsOverlap,
  DEFAULT_CARVE,
  HF_AUDIO_CARVE_ATTR,
  type HfCarveSettings,
} from "@hyperframes/core/audio-carve";
import { resolveAudioGroups, resolveCarveSourceIds } from "@hyperframes/core/audio-groups";
import {
  carveBedRoles,
  carverAgainst,
  collectCarveCandidates,
  CARVE_ABORTED,
  isPromiseLike,
  resolveNextCarveSettings,
} from "./useFxCarveGrouping.js";
import { type HfAutomation } from "@hyperframes/core/audio-automation";
import { trackCarveChanged } from "./audioFxTelemetry.js";
import type { DomEditSelection } from "./domEditingTypes";
import { usePlayerStore } from "../../player";
import { dropCarveOutput, resolveCarveVoices, withoutCarveLanes } from "./carveOutput.js";
import { carveLanes, measureCarve, mintCarveNodes } from "./useFxCarveNodes.js";
import { readClipClock } from "./clipAudioClock.js";
import { spanOf } from "./propertyPanelAudioFxGroupUtils.js";
import type { AudioTrackOption } from "./propertyPanelFxCarveModule.js";

/**
 * Which carve setting actually moved, by comparing the two snapshots.
 *
 * On/off is checked before the rest: switching a carve off also strands its
 * sources and strength, and reporting that as a "strength" change would be
 * describing the wreckage instead of the decision.
 */
function carveAction(
  before: HfCarveSettings | null,
  after: HfCarveSettings | null,
): "enabled" | "disabled" | "strength" | "sources" {
  if (!after?.enabled) return "disabled";
  if (!before?.enabled) return "enabled";
  if (before.sources.length !== after.sources.length) return "sources";
  return "strength";
}

/**
 * Every setting here describes the filters, so changing one rebuilds them.
 * There is no apply button: a carve naming a voice with no filters behind it
 * is a setting nobody applied, and the panel already knows everything it needs
 * to. Picking the voice is what starts it; strength and dynamic re-derive what
 * is already there. A carve with no source yet has nothing to analyse.
 */
function carveNeedsReanalysis(
  before: HfCarveSettings | null,
  after: HfCarveSettings | null,
): after is HfCarveSettings {
  if (!after?.enabled || after.sources.length === 0) return false;
  if (!before || !before.enabled) return true;
  // Switching it back on is a change like any other: the filters went with the
  // switch, so there is nothing left to hear until they are rebuilt. Without
  // this, On restored the setting and left the bed uncarved.
  return (
    before.sources.join("\0") !== after.sources.join("\0") || before.strength !== after.strength
  );
}

export function useFxCarve(
  element: DomEditSelection,
  chain: HfAudioFxChain,
  carve: HfCarveSettings | null,
  automation: HfAutomation,
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>,
  writeAutomation: (next: HfAutomation) => void,
  setAnalysing: (value: boolean) => void,
  /**
   * Write `data-audio-group` on every named clip, atomically, one undo entry.
   * Absent in a harness with no such capability (or the flag off): the
   * auto-group step is then skipped and a multi-voice pick keeps naming plain
   * clip ids, exactly like before this existed.
   */
  onAutoGroupCarveSources?: (clipIds: readonly string[], groupId: string) => Promise<void>,
) {
  const carvedAgainstBy = carverAgainst(element.element?.ownerDocument, element.id);

  // Can this be a bed at all, and may one be applied unasked. See carveBedRoles.
  const { couldBeBed, autoBed } = carveBedRoles(element.id, element.element);

  /**
   * The tracks worth offering as the voice.
   *
   * Not every audio element is a plausible answer: a music bed is the thing being
   * carved, and a 200 ms whoosh has no speech to make room for. Offering them made
   * the picker a list of everything and the "exactly one candidate" rule — which is
   * what lets an obvious pairing carve itself — almost never true, because a
   * composition with a voice, a bed and two stings looked like four options.
   *
   * Classified by name, which is a hint and not a fact, so the rule is loose in the
   * safe direction: a name that says nothing stays in, voice-shaped names sort
   * first, and if filtering would leave nothing at all every track comes back. A
   * picker that hides the track somebody needs is worse than a long one.
   *
   * Empty on a track that cannot be a bed at all, which is what withholds the
   * whole module: `showCarve` already asks "is there anything to carve against",
   * so the near-end rule rides that rather than a second flag to thread.
   */
  const { sourceOptions, autoSourceIds } = ((): {
    sourceOptions: AudioTrackOption[];
    autoSourceIds: string[];
  } => {
    const doc = element.element?.ownerDocument;
    if (!doc || !couldBeBed) return { sourceOptions: [], autoSourceIds: [] };
    const others = Array.from(doc.querySelectorAll("audio[id], video[id]")).filter(
      (a) => a.id !== element.id,
    );
    // Only tracks that are actually playing while this bed is. A voice somewhere
    // else on the timeline cannot mask it, so including it would contribute silence
    // to the analysis and leave the author wondering why it changed nothing.
    const bedSpan = spanOf(element.dataAttributes?.["start"], element.dataAttributes?.["duration"]);
    const overlapsBed = (a: Element): boolean =>
      clipsOverlap(bedSpan, spanOf(a.getAttribute("data-start"), a.getAttribute("data-duration")));

    const described = collectCarveCandidates(doc, others, overlapsBed, element.id ?? undefined);
    const plausible = described.filter((t) => t.kind === "voice" || t.kind === "unknown");
    const offered = plausible.length > 0 ? plausible : described;
    const byVoiceFirst = (list: typeof described) =>
      [...list].sort((a, b) => (a.kind === "voice" ? 0 : 1) - (b.kind === "voice" ? 0 : 1));
    return {
      sourceOptions: byVoiceFirst(offered).map(({ id, label }) => ({ id, label })),
      // What the panel may pick WITHOUT being asked — never the fallback. The
      // fallback exists so the picker can still show a track whose name reads as
      // music or as an effect, because a name is a hint and the author may know
      // better. Choosing off that list is a different act: it is the panel
      // deciding, and "the only audio left is a 200 ms explosion" is not a voice
      // to make room for. A bed surrounded by nothing plausible waits instead.
      autoSourceIds: byVoiceFirst(plausible).map((t) => t.id),
    };
  })();

  /**
   * The voices this carve names that are still in the composition.
   *
   * Existence, not the candidate list: a voice can stop being offered without
   * being gone (it stopped overlapping the bed), and dropping it then would
   * quietly rewrite a relationship the author set. Deleted is the case that has
   * to be noticed, because what the carve produced was measured from that track.
   *
   * Asked of the timeline rather than of `element.element.ownerDocument`, which
   * is the preview's DOM and outlives a delete: measured in the studio, a bed
   * selected right after its voice was deleted still found that voice through
   * the document, so the carve sat on a measurement of a track the timeline had
   * already dropped. The store is what the delete actually edited.
   */
  const timelineElements = usePlayerStore((s) => s.elements);
  const survivingSources = ((): string[] => {
    if (!carve) return [];
    const present = new Set(timelineElements.map((el) => el.domId ?? el.id));
    // Absence only means deletion once the timeline is known to describe THIS
    // composition, and the bed being in it is the proof. Without that check a
    // store that is empty — not loaded yet, or a panel mounted outside the
    // player — reads as "every voice was deleted" and throws away a carve that
    // is perfectly fine. Unchanged sources are what the prune treats as nothing
    // to do.
    const doc = element.element?.ownerDocument;
    const groupIds = doc ? new Set(resolveAudioGroups(doc).map((g) => g.id)) : new Set<string>();
    // The BED can be a group too — a bus carrying its own carve — and a group id
    // is never in `present`, so the sentinel rejected every group bed and the
    // prune simply never ran for one. Accept either proof that the timeline
    // describes this composition.
    if (!element.id || !(present.has(element.id) || groupIds.has(element.id))) {
      return carve.sources;
    }
    // Same reason a group source needs its own check: it is not a timeline
    // element. A group survives as long as it still has at least one member,
    // read off the live document the way the picker resolves groups above.
    return carve.sources.filter((id) => present.has(id) || groupIds.has(id));
  })();

  /**
   * Turn carve on or off.
   *
   * Switching off drops the filters it generated — left behind they keep dipping
   * the bed with nothing in the panel to explain them — but that is a second
   * attribute, and each write is a read-modify-write against the same source
   * file. Fired together, both read the same content and the later one drops the
   * earlier: either the carve settings went and the filters stayed, or the
   * reverse. Awaiting the first means the second reads the file it produced.
   *
   * One commit carrying both would also close the window where a failure of just
   * the second leaves them half-applied; that needs a multi-attribute quiet
   * commit, which does not exist yet.
   */
  // fallow-ignore-next-line complexity
  const setCarve = async (nextRaw: HfCarveSettings | null): Promise<void> => {
    const doc = element.element?.ownerDocument;
    // Plural voiceover ⇒ carve targets a group, always — auto-created here if
    // picking the second voice clip is what just named it. Not unconditionally
    // awaited: see resolveNextCarveSettings's own contract.
    const resolved = resolveNextCarveSettings(nextRaw, doc, onAutoGroupCarveSources);
    const next = isPromiseLike(resolved) ? await resolved : resolved;
    if (next === CARVE_ABORTED) return;
    // Which of the carve's settings moved. One event per change with the action
    // named, rather than a single "carve touched" — enabling a carve and nudging
    // its strength are different decisions and the interesting question (do
    // people leave it at the default?) needs them apart.
    trackCarveChanged(carveAction(carve, next), {
      strength: next?.strength,
      sourceCount: next?.sources.length,
    });
    const generatedOutputStands = Boolean(next?.enabled) && (next?.sources.length ?? 0) > 0;
    if (!generatedOutputStands) await dropCarveOutput(chain, automation, onSetAttributeQuiet);
    await onSetAttributeQuiet(HF_AUDIO_CARVE_ATTR, next ? JSON.stringify(next) : null);

    if (carveNeedsReanalysis(carve, next)) await analyse(next);
  };

  // Voice resolution, measurement, node-minting and lane-building are already
  // their own functions (resolveCarveVoices, measureCarve, mintCarveNodes,
  // carveLanes); what is left is the orchestration between them, including the
  // two-attribute write order the comments below explain the reason for.
  // fallow-ignore-next-line complexity
  /**
   * One auto-carve decision at a time.
   *
   * `setCarve` awaits `resolveNextCarveSettings`, which awaits group creation —
   * and that live-patches `data-audio-group` onto each member and calls
   * `updateElement` per member, a store notification. So React re-renders while
   * the first `setCarve` is still in flight and BEFORE the carve attribute has
   * been written: the candidate count legitimately collapses 2 → 1 (two clips
   * became one group) while `carve` is still null, and the sibling
   * single-candidate effect fires a second concurrent `setCarve`. That is two
   * read-modify-write saves of `data-fx-carve` against the same file (a lost
   * update) and two `analyse()` runs — two decodes, two FFT passes, two
   * competing `data-fx-chain` / `data-automation` writes.
   *
   * The `<= 1` / `!== 1` split between the two effects prevents the same
   * double-fire within one render pass; it cannot see across an await.
   */
  const autoCarveInFlight = useRef(false);

  /** `setCarve` from an auto-decision: latched, so the sibling effect cannot
   *  start a second one across the await inside it. A manual change from the
   *  panel is deliberately NOT latched — the author is allowed to interrupt. */
  const setCarveAuto = (next: HfCarveSettings): void => {
    autoCarveInFlight.current = true;
    void setCarve(next).finally(() => {
      autoCarveInFlight.current = false;
    });
  };

  /**
   * Write what a measurement compiled to: the chain first, then the lanes.
   *
   * The chain write is live, like every other one — the runtime swaps the graph
   * in place, so a reload would only interrupt the audio to reach the same
   * filters. It is AWAITED because the automation write is a second
   * read-modify-write against the same file (fired together the later one drops
   * the earlier), and because a lane naming a node the chain does not carry yet
   * is pruned when it is read back.
   */
  const persistMeasuredCarve = async (
    measured: NonNullable<Awaited<ReturnType<typeof measureCarve>>>,
  ): Promise<void> => {
    const { bands, carved, duck, voiceMix } = measured;
    const { next, carvedNodes, duckNode } = mintCarveNodes(chain, carved, duck);
    await onSetAttributeQuiet(HF_AUDIO_FX_ATTR, serializeAudioFxChain(next));

    const lanes = carveLanes(carvedNodes, duckNode, duck, voiceMix, bands);
    const carriedOver = withoutCarveLanes(automation, chain);
    if (lanes.length > 0 || carriedOver.lanes.length !== automation.lanes.length) {
      writeAutomation({ version: 1, lanes: [...carriedOver.lanes, ...lanes] });
    }
  };

  const analyse = async (active: HfCarveSettings | null = carve): Promise<void> => {
    if (!active?.sources.length) return;
    const doc = element.element?.ownerDocument;
    if (!doc) return;
    // Membership resolves fresh at analysis time, never frozen into `sources`:
    // a group named here expands to whoever is in it right now, so a fourth
    // voice added to an already-carved group is heard on the next analysis
    // without anyone editing the carve itself.
    // The bed is excluded from its own voice list. A group expands to its
    // CURRENT members, so once the bed joins the group its own carve names —
    // one timeline drag — it was measured as one of its own voices: peaking
    // notches at the bed's own spectral peaks and a duck envelope that dips
    // whenever the bed is loud, written into `data-fx-chain` and
    // `data-automation` and baked into the export. The candidate-list guard
    // (`excludedFor`) only runs while the picker is offering options, never
    // against sources already persisted.
    const expanded = resolveCarveSourceIds(doc, active.sources).filter((id) => id !== element.id);
    const voices = resolveCarveVoices(doc, expanded);
    if (voices.length === 0) return;
    setAnalysing(true);
    try {
      const measured = await measureCarve(doc, voices, active.strength, {
        src: element.element?.getAttribute("src"),
        start: element.dataAttributes?.["start"],
        clock: readClipClock((name) => element.dataAttributes?.[name.slice(5)]),
      });
      if (!measured) return;
      await persistMeasuredCarve(measured);
    } catch {
      // Leave the chain as it was; the button simply re-enables.
    } finally {
      setAnalysing(false);
    }
  };

  /**
   * A deleted voice re-analyses the bed.
   *
   * The filters and envelopes are a measurement of specific tracks, so losing one
   * makes them a measurement of something that is no longer there — the bed keeps
   * ducking for a voice nobody can hear. `analyse` already skips a source it
   * cannot find, but nothing asked it to run again.
   *
   * Pruning is the whole trigger: `setCarve` re-analyses when the source list
   * changes, so the surviving voices are re-measured together. Losing the LAST
   * one leaves an empty list, which the effects below repoint at whatever
   * candidates remain — and if there are none, `setCarve` drops what the carve
   * generated, since there is nothing left it could be making room for.
   *
   * Keyed on the survivors rather than on the candidates: a voice that had
   * stopped overlapping was never in the candidate list, so its deletion would
   * not change that identity and this would never fire.
   */
  useEffect(() => {
    if (carvedAgainstBy || !carve?.enabled) return;
    if (survivingSources.length === carve.sources.length) return;
    void setCarve({ ...carve, sources: survivingSources });
    // Keyed on the identity of the decision, not on setCarve — which is rebuilt
    // every render and would re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carve, carvedAgainstBy, survivingSources.join(" ")]);

  /**
   * A bed with voices above it carves itself.
   *
   * Carving is what a bed under speech wants, and making the author find the
   * control, name the voices and set a strength before hearing the thing they
   * already wanted is ceremony.
   *
   * Every candidate, not one of them. This used to refuse when there were several,
   * because picking one of three was a guess — but they are analysed together now,
   * so "all of them" is the answer rather than a guess: a bed running under a
   * narrator, an answer and a second presenter should make room for all three.
   *
   * Runs once per state. The write lands in `data-fx-carve`, which is what `carve`
   * is read from, so the condition is false on every later render — and switching it
   * off stores `enabled: false`, which is also a configured carve. That is the whole
   * reason the flag exists rather than "off" being an absent attribute.
   */
  const candidateIds = autoSourceIds.join("\0");
  useEffect(() => {
    // Exactly one candidate is the sibling effect's case below, not this one's:
    // both guards passing for a single candidate fired two setCarve calls with
    // the same result — two decodes, two FFT runs, two concurrent attribute
    // writes.
    if (carvedAgainstBy || !autoBed || autoSourceIds.length <= 1) return;
    if (autoCarveInFlight.current) return;
    const all = autoSourceIds;
    // Nothing configured: the default carve, pointed at everything it could hear.
    if (carve === null) {
      setCarveAuto({ ...DEFAULT_CARVE, sources: all });
      return;
    }
    // Configured but naming no voice — switched on before there was anything to
    // listen to, or a source list emptied. The card reads the candidates out, so
    // they have to be the stored ones too.
    if (carve.enabled && carve.sources.length === 0) setCarveAuto({ ...carve, sources: all });
    // Keyed on the identity of the decision, not on setCarve — which is rebuilt
    // every render and would re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carve, carvedAgainstBy, autoBed, candidateIds]);

  /**
   * A bed with one obvious voice above it carves itself.
   *
   * Carving is what a bed under narration wants, and making the author find the
   * control, pick the voice and set a strength before hearing the thing they
   * already wanted is ceremony. So an unconfigured track with exactly ONE
   * candidate voice gets the default carve applied for it.
   *
   * Exactly one, not the first of several: picking for the author when the answer
   * is ambiguous is how the wrong track gets carved, and a carve against the wrong
   * voice is silent and confusing. With several candidates the module still appears,
   * with the picker waiting.
   *
   * Runs once. The write lands in `data-fx-carve`, which is what `carve` is read
   * from, so the condition is false on every later render — and switching it off
   * stores `enabled: false`, which is also a configured carve. That is the whole
   * reason the flag exists rather than "off" being an absent attribute.
   */
  useEffect(() => {
    if (carvedAgainstBy || !autoBed || autoSourceIds.length !== 1) return;
    if (autoCarveInFlight.current) return;
    const only = autoSourceIds[0];
    if (!only) return;
    // Nothing configured: the default carve, pointed at the one candidate.
    if (carve === null) {
      setCarveAuto({ ...DEFAULT_CARVE, sources: [only] });
      return;
    }
    // Configured but with no voice yet — a carve switched on before there was
    // anything to listen to, or one whose source was cleared. The panel reads the
    // sole candidate out as the source, so it has to be the stored one too;
    // otherwise the card claims a relationship the attribute does not record.
    if (carve.enabled && carve.sources.length === 0) setCarveAuto({ ...carve, sources: [only] });
    // Deliberately keyed on the identity of the decision, not on setCarve — which
    // is rebuilt every render and would re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carve, carvedAgainstBy, autoBed, autoSourceIds.length, autoSourceIds[0]]);

  return { carvedAgainstBy, sourceOptions, setCarve };
}
