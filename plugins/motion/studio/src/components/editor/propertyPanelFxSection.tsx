import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
/**
 * The FX section for an audio element: the chain, plus the voiceover carve.
 *
 * The carve is its own module — see `propertyPanelFxCarveModule.tsx` for why it
 * is not an entry in the chain.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { audioFxRevealTarget, scrollRevealedRowIntoView } from "./audioFxRevealTarget.js";
import {
  defaultAudioFxParams,
  mintAudioFxNodeId,
  type HfAudioFxChain,
  type HfAudioFxNode,
  type HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";
import { applyAudioFxPreset, getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import { applyPresetToChain } from "./useApplyAudioFxPreset.js";
import {
  addAudioEq,
  audioEqIds,
  removeAudioEq,
  setAudioEqBandGain,
} from "@hyperframes/core/audio-fx-eq";
import { applyAudioFxProfile, getAudioFxProfile } from "@hyperframes/core/audio-fx-profiles";
import { audioFxJobNode, type HfAudioFxJob } from "@hyperframes/core/audio-fx-jobs";
import { FxPresetMenu } from "./propertyPanelFxPresetMenu.js";
import { FxRackChain } from "./propertyPanelFxRackChain.js";
import { CLIP_SIGNAL_PATH } from "./audioFxSignalPath.js";
import { FxAddMenu } from "./propertyPanelFxAddMenu.js";
import { useFxAudition } from "./useFxAudition.js";
import {
  nodeOrigin,
  trackNodeAdded,
  trackNodeMoved,
  trackNodeRemoved,
  trackPresetAuditioned,
  trackPresetAutomated,
  trackPresetRemoved,
} from "./audioFxTelemetry.js";
import type { FxSectionProps } from "./propertyPanelFxSectionTypes.js";

export type { FxSectionProps } from "./propertyPanelFxSectionTypes.js";

/**
 * One effect appended, at the values its module opens on.
 *
 * For most effects that is the registry's defaults. For the five with a
 * derived knob it is NOT: the registry defaults are not a point on the
 * profile's curve, so the module opened reading a strength it was not set to —
 * a compressor arrived showing Evenness 0.67 with its make-up gain at 0 dB,
 * which is the "quieter as you turn it up" bug the profiles exist to prevent,
 * on the very first frame. Seeding through the profile puts the knob and the
 * mechanism in agreement from the start.
 */
function withEffect(base: HfAudioFxChain, type: string): HfAudioFxChain {
  return {
    ...base,
    nodes: [
      ...base.nodes,
      {
        type,
        id: mintAudioFxNodeId(base),
        enabled: true,
        params: getAudioFxProfile(type)
          ? applyAudioFxProfile(type, 0.5, defaultAudioFxParams(type))
          : defaultAudioFxParams(type),
      },
    ],
  };
}

/** The same, for a job — an ordinary node that arrives already named and aimed. */
function withJob(base: HfAudioFxChain, job: HfAudioFxJob): HfAudioFxChain {
  return { ...base, nodes: [...base.nodes, audioFxJobNode(job, base)] };
}

// The preset-run card, the add shelf and the audition machinery are already
// their own files; what is left is the section deciding which of them to show.
// fallow-ignore-next-line complexity
export function FxSection({
  chain,
  automatedTargets,
  liveAutomationValues,
  onAutomateParam,
  onRemoveParamAutomation,
  onRemoveNodeAutomation,
  onRemoveNodesAutomation,
  onChainChange,
  onChainPreview,
  carve,
  carvedAgainstBy,
  onCarveChange,
  onCarvePreview,
  sourceOptions,
  trackKind,
  analysing,
  disabled,
  onLevel,
  onRemoveLevel,
  levelled,
  onAuditionLevel,
  auditioningLevel,
  onAutomatePreset,
  onRemovePresetAutomation,
  automatedPresets,
  onAuditionTransport,
  signalPath,
  revealTarget,
  revealNonce,
}: FxSectionProps) {
  const { t } = useI18n();
  const presetAutomated = automatedPresets ?? new Set<string>();
  // Falls back to the persisting write when no preview handler is supplied, which
  // keeps the control working rather than going dead.
  const previewCarve = onCarvePreview ?? onCarveChange;

  // Nothing to carve against means nothing to show — see the block below.
  // Not offered on the voice another track is already carving against — that
  // track is the far end of someone else's relationship, and a carve of its own
  // could only name a source it must not.
  const showCarve = !carvedAgainstBy && (sourceOptions.length > 0 || carve !== null);

  const trackInput = useTrackDesignInput();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [openNode, setOpenNode] = useState<number | null>(0);

  const mutate = useCallback(
    (nodes: HfAudioFxNode[], input?: string, control = "button") => {
      onChainChange({ ...chain, nodes });
      if (input) trackInput(control, input);
    },
    [chain, onChainChange, trackInput],
  );

  // Dragging a knob previews without persisting; releasing it commits once.
  const previewNode = useCallback(
    (index: number, params: HfAudioFxParamValues) =>
      onChainPreview?.({
        ...chain,
        nodes: chain.nodes.map((n, i) => (i === index ? { ...n, params } : n)),
      }),
    [chain, onChainPreview],
  );

  const { audition, clearAudition, storedChain } = useFxAudition(
    chain,
    onChainPreview,
    onAuditionTransport,
  );

  const applyPreset = useCallback(
    (id: string) => {
      // The stored chain, not whatever is being auditioned on top of it — see
      // `storedChain`. Clicking preset B while hovering preset A used to save
      // both, which is heard as the effect running twice.
      const next = applyPresetToChain(storedChain(), id, trackKind);
      if (!next) return;
      // The audition WAS this, so there is nothing to put back — and putting the
      // old chain back over the write that just landed is a race the author
      // hears as the preset arriving and then leaving again.
      clearAudition();
      mutate(next.nodes, "apply-preset");
      // Land on the first node the preset wrote, so the author can hear what
      // arrived and immediately see what it is made of.
      setOpenNode(next.nodes.findIndex((n) => n.fromPreset === id));
      setPicking(false);
    },
    [storedChain, mutate, clearAudition, trackKind],
  );

  const addJob = useCallback(
    (job: HfAudioFxJob) => {
      clearAudition();
      trackNodeAdded(job.type, "job", job.id, { trackKind });
      mutate(withJob(chain, job).nodes, "add-job");
      setOpenNode(chain.nodes.length);
      setAdding(false);
    },
    [chain, mutate, clearAudition, trackKind],
  );

  const addEffect = useCallback(
    (type: string) => {
      clearAudition();
      trackNodeAdded(type, "effect", null, { trackKind });
      mutate(withEffect(chain, type).nodes, "add-effect");
      setOpenNode(chain.nodes.length);
      setAdding(false);
    },
    [chain, mutate, clearAudition, trackKind],
  );

  const updateNode = useCallback(
    (index: number, patch: Partial<HfAudioFxNode>) =>
      mutate(chain.nodes.map((n, i) => (i === index ? { ...n, ...patch } : n))),
    [chain.nodes, mutate],
  );

  /**
   * How much of a preset is applied, 0..1.
   *
   * The switch and the lane are the same value, not two ways of silencing a
   * preset: `presetAmount` drives the wet/dry blend the graph wraps the run in,
   * so Off is amount 0 and a lane ramping 0 → 1 is the same control moving
   * continuously. Writing `enabled` instead would take the nodes out of the
   * graph, which a lane cannot do part-way and cannot do without a rebuild.
   *
   * On every node of the run because that is where the chain can hold it — see
   * `HfAudioFxNode.presetAmount`.
   */
  const setRunAmount = useCallback(
    (items: { node: HfAudioFxNode; i: number }[], amount: number, persist = true) => {
      const slots = new Set(items.map((item) => item.i));
      const next = {
        ...chain,
        nodes: chain.nodes.map((n, i) => (slots.has(i) ? { ...n, presetAmount: amount } : n)),
      };
      if (persist) mutate(next.nodes);
      else onChainPreview?.(next);
    },
    [chain, mutate, onChainPreview],
  );

  // Remove the run and its lanes together so new nodes cannot inherit orphaned automation.
  const removeRun = useCallback(
    (items: { node: HfAudioFxNode; i: number }[], presetId?: string) => {
      // Remove node and preset automation together before replacing the chain.
      const ids = items.map(({ node }) => node.id).filter((id): id is string => Boolean(id));
      if (ids.length > 0 || presetId) onRemoveNodesAutomation?.(ids, presetId);
      if (presetId) trackPresetRemoved(presetId, { trackKind });
      const slots = new Set(items.map((item) => item.i));
      mutate(
        chain.nodes.filter((_, i) => !slots.has(i)),
        "remove-preset",
      );
      setOpenNode(null);
    },
    [chain.nodes, mutate, onRemoveNodesAutomation, trackKind],
  );

  const removeNode = useCallback(
    (index: number) => {
      // The node's lanes go with it. `resolveAutomation` only hides an orphan at
      // read time; left in the attribute, and with ids minted lowest-free, the
      // next effect added takes the same id and inherits the dead envelope —
      // arriving with its control disabled and "Automated" without the author
      // ever automating it, and baked into the render.
      const removed = chain.nodes[index];
      const removedId = removed?.id;
      if (removedId) onRemoveNodeAutomation?.(removedId);
      if (removed) trackNodeRemoved(removed.type, nodeOrigin(removed), { trackKind });
      mutate(
        chain.nodes.filter((_, i) => i !== index),
        "remove-effect",
      );
      setOpenNode(null);
    },
    [chain.nodes, mutate, onRemoveNodeAutomation, trackKind],
  );

  // Open by default: the module is the carve's whole control surface now, and a
  // collapsed card would hide the knob the author came here for.
  const [carveOpen, setCarveOpen] = useState(true);
  const carveNodes = useMemo(() => chain.nodes.filter((n) => n.fromCarve), [chain.nodes]);
  /** Everything the author added, with the chain index every edit addresses. */
  const handBuilt = useMemo(
    () =>
      chain.nodes
        .map((node, i) => ({ node, i }))
        // Carve and EQ bands belong to their own modules; showing them here too
        // would put the same filter on screen twice with two ways to edit it.
        .filter(({ node }) => !node.fromCarve && !node.fromEq),
    [chain.nodes],
  );

  /**
   * The hand-built list cut into runs, so a preset reads as one thing.
   *
   * Applying a preset drops five rows into the rack with nothing saying they
   * arrived together — which is the same failure the carve module was built to
   * fix, one level down. Consecutive only: a preset whose nodes have been pulled
   * apart by a reorder is no longer a unit, and drawing a bracket around the gap
   * would claim an adjacency the signal path does not have.
   */
  const runs = useMemo(() => {
    const out: { preset?: string; items: { node: HfAudioFxNode; i: number }[] }[] = [];
    for (const item of handBuilt) {
      const preset = item.node.fromPreset;
      const last = out.at(-1);
      if (last && last.preset === preset) last.items.push(item);
      else out.push({ ...(preset ? { preset } : {}), items: [item] });
    }
    return out;
  }, [handBuilt]);

  /**
   * Preset runs the author has folded shut.
   *
   * A preset is one thing they added, and once it is set the seven modules
   * inside are detail — a rack with two presets in it was thirteen cards deep
   * before anything hand-built appeared. Collapsed by id rather than by index so
   * it survives a reorder, and open by default: a preset that arrives already
   * hidden is one nobody learns is a chain they can edit.
   */
  const [collapsedRuns, setCollapsedRuns] = useState<ReadonlySet<string>>(new Set());

  const eqIds = useMemo(() => audioEqIds(chain), [chain]);

  /**
   * The number each row wears, counted over what the rack actually shows.
   *
   * Not the chain index: the carve's filters and an EQ's bands are inside their
   * own modules, so counting raw nodes would leave the visible rack jumping from
   * 02 to 07 and the numbers would look like a bug rather than a position.
   */
  const positions = useMemo(() => {
    const map = new Map<number, number>();
    let at = (showCarve ? 1 : 0) + eqIds.length;
    for (const { i } of handBuilt) map.set(i, ++at);
    return map;
  }, [handBuilt, eqIds.length, showCarve]);
  const [openEq, setOpenEq] = useState<string | null>(null);

  /** The reveal request held until its row is mounted and scrolled. */
  const [consumedRevealNonce, setConsumedRevealNonce] = useState<number | null>(null);
  const [pendingReveal, setPendingReveal] = useState<{
    nonce: number;
    target: string;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  if (revealNonce != null && revealNonce !== consumedRevealNonce) {
    setConsumedRevealNonce(revealNonce);
    const where = revealTarget ? audioFxRevealTarget(revealTarget, chain) : null;
    if (where) {
      // Each surface has its own open-state; the resolver says which one owns
      // this parameter. Opening the wrong one leaves the click looking dead.
      if (where.kind === "node") setOpenNode(where.index);
      if (where.kind === "eq") setOpenEq(where.eqId);
      if (where.kind === "carve") setCarveOpen(true);
      if (where.kind === "preset") {
        setCollapsedRuns((was) => {
          if (!was.has(where.runKey)) return was;
          const next = new Set(was);
          next.delete(where.runKey);
          return next;
        });
      }
    }
    setPendingReveal(where && revealTarget ? { nonce: revealNonce, target: revealTarget } : null);
  }

  /**
   * Scroll the revealed parameter into view once its row has actually mounted.
   *
   * The request itself is a dependency so a second click on an already-open
   * surface still scrolls. It is cleared once used, so a later unrelated
   * re-render does not yank the panel back to an old parameter.
   */
  useEffect(() => {
    const target = pendingReveal?.target;
    if (target && scrollRevealedRowIntoView(rootRef.current, target, chain)) {
      setPendingReveal(null);
    }
    // `chain` is deliberately not a dependency: it changes on every knob edit,
    // and re-running then would scroll the panel while the author is dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNode, openEq, carveOpen, collapsedRuns, pendingReveal]);

  const addEq = useCallback(() => {
    clearAudition();
    const { chain: next, eqId } = addAudioEq(chain);
    trackNodeAdded("eq", "eq", null, { trackKind });
    mutate(next.nodes, "add-eq");
    setOpenEq(eqId);
    setAdding(false);
  }, [chain, mutate, clearAudition, trackKind]);

  // Dragging a fader is heard immediately and written once on release, the same
  // split every other control in the rack uses.
  const previewEqBand = useCallback(
    (eqId: string, band: string, gain: number) =>
      onChainPreview?.(setAudioEqBandGain(chain, eqId, band, gain)),
    [chain, onChainPreview],
  );
  const commitEqBand = useCallback(
    (eqId: string, band: string, gain: number) =>
      mutate(setAudioEqBandGain(chain, eqId, band, gain).nodes, "eq-gain", "slider"),
    [chain, mutate],
  );
  const removeEq = useCallback(
    (eqId: string) => {
      // Remove the EQ automation in one write.
      const ids = chain.nodes
        .filter((node) => node.fromEq === eqId)
        .map((node) => node.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) onRemoveNodesAutomation?.(ids);
      mutate(removeAudioEq(chain, eqId).nodes, "remove-eq");
    },
    [chain, mutate, onRemoveNodesAutomation],
  );

  const moveNode = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= chain.nodes.length) return;
      const next = [...chain.nodes];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      if (moved) trackNodeMoved(moved.type, delta < 0 ? "up" : "down", { trackKind });
      mutate(next, "move-effect");
      setOpenNode(target);
    },
    [chain.nodes, mutate, trackKind],
  );

  /**
   * Escape closes whichever menu is open.
   *
   * The first thing anyone reaches for, and on a surface that covers the rack it
   * is the one that needs no discovering. Bound on the section rather than the
   * window: a keystroke aimed at the timeline is not aimed at this.
   */
  const closeMenus = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!adding && !picking)) return;
      // Stops the panel's own Escape handling from also firing — closing a menu
      // and deselecting the clip on one keystroke loses the author their place.
      event.stopPropagation();
      audition(null);
      onAuditionLevel?.(false);
      setAdding(false);
      setPicking(false);
    },
    [adding, picking, audition, onAuditionLevel],
  );

  /** Seed a lane for a run's preset amount, or omit the control when one already exists. */
  const presetAutomateHandler = (
    presetId: string | undefined,
    amount: number,
  ): (() => void) | undefined => {
    if (!presetId || !onAutomatePreset || presetAutomated.has(presetId)) return undefined;
    return () => {
      trackPresetAutomated(presetId, true, { trackKind });
      onAutomatePreset(presetId, amount);
      trackInput("button", "automate-preset");
    };
  };

  /** Delete a run's preset-amount lane, or omit the control when there is none. */
  const presetRemoveAutomationHandler = (
    presetId: string | undefined,
  ): (() => void) | undefined => {
    if (!presetId || !onRemovePresetAutomation || !presetAutomated.has(presetId)) return undefined;
    return () => {
      onRemovePresetAutomation(presetId);
      trackInput("button", "remove-preset-automation");
    };
  };

  return (
    <div
      ref={rootRef}
      className="hf-fx-section space-y-2"
      // Focus lives on the buttons and menu items inside, so the keystroke
      // bubbles to here without the section needing focus of its own.
      onKeyDown={closeMenus}
    >
      <FxRackChain
        signalPath={signalPath ?? CLIP_SIGNAL_PATH}
        chain={chain}
        showCarve={showCarve}
        carveNodes={carveNodes}
        carve={carve}
        sourceOptions={sourceOptions}
        automatedTargets={automatedTargets}
        liveAutomationValues={liveAutomationValues}
        carveOpen={carveOpen}
        disabled={disabled}
        analysing={analysing}
        onToggleCarveOpen={() => setCarveOpen((was) => !was)}
        onCarveChange={onCarveChange}
        onCarvePreview={previewCarve}
        eqIds={eqIds}
        openEq={openEq}
        onToggleEq={(eqId) => setOpenEq((was) => (was === eqId ? null : eqId))}
        onPreviewEqBand={previewEqBand}
        onCommitEqBand={commitEqBand}
        onRemoveEq={removeEq}
        handBuiltCount={handBuilt.length}
        runs={runs}
        positions={positions}
        openNode={openNode}
        onToggleOpenNode={(i) => setOpenNode(openNode === i ? null : i)}
        onUpdateNode={updateNode}
        onMoveNode={moveNode}
        onRemoveNode={removeNode}
        onPreviewNode={previewNode}
        trackKind={trackKind}
        collapsedRuns={collapsedRuns}
        onToggleCollapse={(runKey) =>
          setCollapsedRuns((was) => {
            const next = new Set(was);
            if (was.has(runKey)) next.delete(runKey);
            else next.add(runKey);
            return next;
          })
        }
        onSetRunAmount={setRunAmount}
        onRemoveRun={removeRun}
        onAutomateParam={onAutomateParam}
        onRemoveParamAutomation={onRemoveParamAutomation}
        presetAutomated={presetAutomated}
        presetAutomateHandler={presetAutomateHandler}
        presetRemoveAutomationHandler={presetRemoveAutomationHandler}
      />

      {adding ? (
        <FxAddMenu
          disabled={disabled}
          analysing={analysing}
          levelled={levelled}
          auditioningLevel={auditioningLevel}
          onLevel={onLevel}
          onRemoveLevel={onRemoveLevel}
          onEq={addEq}
          onJob={addJob}
          onEffect={addEffect}
          onClose={() => setAdding(false)}
          audition={audition}
          onAuditionLevel={onAuditionLevel}
          withJob={withJob}
          withEffect={withEffect}
        />
      ) : null}

      {picking ? (
        <FxPresetMenu
          trackKind={trackKind}
          onPick={applyPreset}
          onAuditionTracked={(id) => trackPresetAuditioned(id, { trackKind })}
          onAudition={
            onChainPreview
              ? (id) => {
                  const preset = id ? getAudioFxPreset(id) : null;
                  audition(preset ? (base) => applyAudioFxPreset(base, preset) : null);
                }
              : undefined
          }
        />
      ) : null}

      {/* The buttons stay while their menu is open, and close it — an author who
          opened one and changed their mind had no way back: picking something
          was the only thing that set these false, so the only exits were adding
          an effect they did not want or deselecting the clip. */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="hf-fx-preset w-full rounded-[4px] border border-panel-text-0 py-1.5 text-[11px] font-semibold text-panel-text-0 disabled:opacity-40"
          aria-expanded={picking}
          disabled={disabled}
          onClick={() => {
            // Leaving the shelf by closing it is still leaving it, and an
            // audition left playing is audible over a chain the document does
            // not have.
            if (picking) audition(null);
            setPicking(!picking);
            setAdding(false);
          }}
        >
          {picking ? t("Close") : t("Presets")}
        </button>
        <button
          type="button"
          className="hf-fx-add self-end px-1 text-[10px] text-panel-text-2 hover:text-panel-text-0 disabled:opacity-40"
          aria-expanded={adding}
          disabled={disabled}
          onClick={() => {
            if (adding) {
              audition(null);
              onAuditionLevel?.(false);
            }
            setAdding(!adding);
            setPicking(false);
          }}
        >
          {adding ? t("Close") : t("+ effect")}
        </button>
      </div>
    </div>
  );
}
