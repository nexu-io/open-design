import { useI18n } from "../../i18n/I18n";
/**
 * The rack's own signal path: the carve, the Tone EQ modules, and every
 * hand-built effect or preset run in between — bracketed by the `In` / `Out`
 * labels that say the order is the point. What those two name depends on what
 * is selected; see `audioFxSignalPath`.
 *
 * Split out of `propertyPanelFxSection.tsx`, which owned this whole chain
 * before the file grew past a size where the chain and the add/pick menus
 * were still one thing to read.
 */

import type { HfAudioFxChain, HfAudioFxNode } from "@hyperframes/core/audio-fx";
import { readAudioEqBands } from "@hyperframes/core/audio-fx-eq";
import { DEFAULT_CARVE, type HfCarveSettings } from "@hyperframes/core/audio-carve";
import { trackEqChanged, trackPresetAmount } from "./audioFxTelemetry.js";
import { FxCarveModule, type AudioTrackOption } from "./propertyPanelFxCarveModule.js";
import { FxEqModule } from "./propertyPanelFxEqModule.js";
import { FxPresetRun } from "./propertyPanelFxPresetRun.js";
import type { AudioFxSignalPath } from "./audioFxSignalPath.js";

export interface FxRackChainProps {
  /** What the `In`/`Out` lines name — a clip's answer differs from a bus's. */
  signalPath: AudioFxSignalPath;
  chain: HfAudioFxChain;
  showCarve: boolean;
  carveNodes: HfAudioFxNode[];
  carve: HfCarveSettings | null;
  sourceOptions: AudioTrackOption[];
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  carveOpen: boolean;
  disabled?: boolean;
  analysing?: boolean;
  onToggleCarveOpen(): void;
  onCarveChange(carve: HfCarveSettings | null): void;
  onCarvePreview(carve: HfCarveSettings): void;
  eqIds: string[];
  openEq: string | null;
  onToggleEq(eqId: string): void;
  onPreviewEqBand(eqId: string, band: string, gain: number): void;
  onCommitEqBand(eqId: string, band: string, gain: number): void;
  onRemoveEq(eqId: string): void;
  handBuiltCount: number;
  runs: { preset?: string; items: { node: HfAudioFxNode; i: number }[] }[];
  positions: ReadonlyMap<number, number>;
  openNode: number | null;
  onToggleOpenNode(index: number): void;
  onUpdateNode(index: number, patch: Partial<HfAudioFxNode>): void;
  onMoveNode(index: number, delta: number): void;
  onRemoveNode(index: number): void;
  onPreviewNode(
    index: number,
    params: import("@hyperframes/core/audio-fx").HfAudioFxParamValues,
  ): void;
  trackKind?: string;
  collapsedRuns: ReadonlySet<string>;
  onToggleCollapse(runKey: string): void;
  onSetRunAmount(
    items: { node: HfAudioFxNode; i: number }[],
    amount: number,
    persist?: boolean,
  ): void;
  onRemoveRun(items: { node: HfAudioFxNode; i: number }[], presetId?: string): void;
  onAutomateParam?(nodeId: string, paramKey: string): void;
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  presetAutomated: ReadonlySet<string>;
  presetAutomateHandler(presetId: string | undefined, amount: number): (() => void) | undefined;
  presetRemoveAutomationHandler(presetId: string | undefined): (() => void) | undefined;
}

export function FxRackChain({
  chain,
  showCarve,
  carveNodes,
  carve,
  sourceOptions,
  automatedTargets,
  liveAutomationValues,
  carveOpen,
  disabled,
  analysing,
  onToggleCarveOpen,
  onCarveChange,
  onCarvePreview,
  eqIds,
  openEq,
  onToggleEq,
  onPreviewEqBand,
  onCommitEqBand,
  onRemoveEq,
  handBuiltCount,
  runs,
  positions,
  openNode,
  onToggleOpenNode,
  onUpdateNode,
  onMoveNode,
  onRemoveNode,
  onPreviewNode,
  trackKind,
  collapsedRuns,
  onToggleCollapse,
  onSetRunAmount,
  onRemoveRun,
  onAutomateParam,
  onRemoveParamAutomation,
  presetAutomated,
  presetAutomateHandler,
  presetRemoveAutomationHandler,
  signalPath,
}: FxRackChainProps) {
  const { t } = useI18n();
  return (
    <div className="hf-fx-chain space-y-1">
      {/* The rack IS the signal path, and saying so costs two lines. Without
          them the order reads as a list, which is the one reading that makes
          "move up" look cosmetic — it is the most consequential control here. */}
      <p className="hf-fx-term flex items-baseline gap-1.5 px-1.5 font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
        <span className="hf-fx-term-cap text-panel-text-1">{t("In")}</span>
        <span>{signalPath.inLabel}</span>
      </p>
      {/* Carve leads the rack, which is also where its effects sit in the signal
          path — corrective work before anything the author added. Present
          whenever there is a voice for it to listen to, rather than appearing
          only once it has already produced something: a control that materialises
          after the fact cannot be the thing you reach for to start. */}
      {showCarve ? (
        <FxCarveModule
          nodes={carveNodes}
          carve={carve ?? { ...DEFAULT_CARVE }}
          sourceOptions={sourceOptions}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
          open={carveOpen}
          disabled={disabled}
          analysing={analysing}
          onToggleOpen={onToggleCarveOpen}
          onCarveChange={onCarveChange}
          onCarvePreview={onCarvePreview}
        />
      ) : null}
      {eqIds.map((eqId) => (
        <FxEqModule
          key={eqId}
          eqId={eqId}
          bands={readAudioEqBands(chain, eqId)}
          open={openEq === eqId}
          disabled={disabled}
          onToggleOpen={() => onToggleEq(eqId)}
          onPreview={(band, gain) => onPreviewEqBand(eqId, band, gain)}
          onCommit={(band, gain) => {
            trackEqChanged(band, gain);
            onCommitEqBand(eqId, band, gain);
          }}
          onRemove={() => onRemoveEq(eqId)}
        />
      ))}
      {handBuiltCount === 0 && eqIds.length === 0 ? (
        <p className="hf-fx-empty py-1 text-[11px] text-panel-text-2">
          {showCarve
            ? t("No other effects on this {value0}.", { value0: signalPath.subject })
            : t("No effects on this {value0}.", { value0: signalPath.subject })}
        </p>
      ) : (
        runs.map((run) => {
          // How much of the preset is applied. Any node of the run carries
          // it, and the first is the one the graph reads.
          const rawAmount = run.items[0]?.node.presetAmount;
          const amount = typeof rawAmount === "number" ? rawAmount : 1;
          const runKey = `${run.preset}-${run.items[0]?.i ?? 0}`;
          return (
            <FxPresetRun
              key={`preset-${run.preset}-${run.items[0]?.i}`}
              run={run}
              positions={positions}
              totalNodes={chain.nodes.length}
              automatedTargets={automatedTargets}
              liveAutomationValues={liveAutomationValues}
              onAutomateParam={onAutomateParam}
              onRemoveParamAutomation={onRemoveParamAutomation}
              openNode={openNode}
              onToggleOpenNode={onToggleOpenNode}
              disabled={disabled}
              onUpdateNode={onUpdateNode}
              onMoveNode={onMoveNode}
              onRemoveNode={onRemoveNode}
              onPreviewNode={onPreviewNode}
              trackKind={trackKind}
              collapsed={collapsedRuns.has(runKey)}
              onToggleCollapse={() => onToggleCollapse(runKey)}
              amount={amount}
              onSetAmount={(v, persist = true) => {
                if (persist && run.preset) trackPresetAmount(run.preset, v, { trackKind });
                onSetRunAmount(run.items, v, persist);
              }}
              onRemoveRun={() => onRemoveRun(run.items, run.preset)}
              automated={presetAutomated.has(run.preset ?? "")}
              onAutomate={presetAutomateHandler(run.preset, amount)}
              onRemoveAutomation={presetRemoveAutomationHandler(run.preset)}
            />
          );
        })
      )}
      <p className="hf-fx-term hf-fx-term-out flex items-baseline gap-1.5 px-1.5 font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
        <span className="hf-fx-term-cap text-panel-text-1">{t("Out")}</span>
        <span>{signalPath.outLabel}</span>
      </p>
    </div>
  );
}
