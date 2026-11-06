import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
/**
 * An effect row's open face: the derived or primary one-knob control, and
 * Details underneath it.
 *
 * Split out of `propertyPanelFxNodeRow.tsx`, which owned all of this before
 * the file grew past a size where the header and the open face were still one
 * thing to read.
 */

import {
  applyAudioFxProfile,
  audioFxProfileStrength,
  getAudioFxProfile,
} from "@hyperframes/core/audio-fx-profiles";
import type {
  HfAudioFxDef,
  HfAudioFxNode,
  HfAudioFxParam,
  HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";
import type { EFFECT_COPY } from "@hyperframes/core/audio-fx-copy";
import { trackProfileCommitted } from "./audioFxTelemetry.js";
import { FxParamRow } from "./propertyPanelFxControls.js";
import { FxBandRuler } from "./propertyPanelFxBandRuler.js";
import { FxNodeParams, type FxNodeControlHandlers } from "./propertyPanelFxNodeParams.js";

/**
 * The derived one-knob face, for a module with no real parameter that can be
 * its own. Not routed through `FxNodeParams`: this knob is not in the
 * registry, so it has no AudioParam behind it and nothing to automate. What
 * automation there is belongs to the parameters it sets, under Details, where
 * they can be aimed at individually.
 */
function FxNodeDerivedKnob({
  node,
  derived,
  profile,
  disabled,
  bypassed,
  params,
  index,
  onPreview,
  onUpdate,
  trackKind,
}: {
  node: HfAudioFxNode;
  derived: HfAudioFxParam | null;
  profile: ReturnType<typeof getAudioFxProfile>;
  disabled?: boolean;
  bypassed: boolean;
  params: HfAudioFxParamValues;
  index: number;
  onPreview(index: number, params: HfAudioFxParamValues): void;
  onUpdate(index: number, patch: Partial<HfAudioFxNode>): void;
  trackKind?: string;
}) {
  const trackInput = useTrackDesignInput();
  if (!derived) return null;
  return (
    <>
      <div className="hf-fx-params space-y-0.5 border-t border-panel-border-input px-1.5 py-1.5">
        <FxParamRow
          param={derived}
          value={audioFxProfileStrength(node.type, params)}
          disabled={Boolean(disabled) || bypassed}
          onChange={(_k, v) => onPreview(index, applyAudioFxProfile(node.type, Number(v), params))}
          onCommit={(_k, v) => {
            trackProfileCommitted(node.type, Number(v), { trackKind });
            onUpdate(index, { params: applyAudioFxProfile(node.type, Number(v), params) });
            trackInput("slider", "profile-strength");
          }}
        />
      </div>
      {profile ? (
        <p className="hf-fx-node-ends flex justify-between gap-2 px-1.5 pb-1 text-[9px] text-panel-text-2">
          <span className="truncate">{profile.ends.low}</span>
          <span className="truncate text-right">{profile.ends.high}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * The primary knob's face: the one control, what its two ends sound like, and
 * — for a spectral module — the ruler that teaches where it is working.
 */
function FxNodePrimaryKnob({
  node,
  onlyPrimary,
  primary,
  copy,
  params,
  index,
  disabled,
  bypassed,
  automatedTargets,
  liveAutomationValues,
  onUpdate,
  onPreview,
  onAutomateParam,
  onRemoveParamAutomation,
  trackKind,
}: FxNodeControlHandlers & {
  node: HfAudioFxNode;
  onlyPrimary: HfAudioFxDef;
  primary: string | null;
  copy: (typeof EFFECT_COPY)[string] | undefined;
  params: HfAudioFxParamValues;
  index: number;
  disabled?: boolean;
  bypassed: boolean;
}) {
  if (!primary) return null;
  return (
    <>
      <FxNodeParams
        node={node}
        def={onlyPrimary}
        index={index}
        disabled={Boolean(disabled) || bypassed}
        automatedTargets={automatedTargets}
        liveAutomationValues={liveAutomationValues}
        onUpdate={onUpdate}
        onPreview={onPreview}
        onAutomateParam={onAutomateParam}
        onRemoveParamAutomation={onRemoveParamAutomation}
        trackKind={trackKind}
      />
      {/* What the two ends of that knob sound like. A number tells an author
          where the control is; this tells them which way to move it, which is
          the question they actually have. */}
      {copy?.primaryEnds ? (
        <p className="hf-fx-node-ends flex justify-between gap-2 px-1.5 pb-1 text-[9px] text-panel-text-2">
          <span className="truncate">{copy.primaryEnds.low}</span>
          <span className="truncate text-right">{copy.primaryEnds.high}</span>
        </p>
      ) : null}
      {/* Where it is working, in the words the rack shares. Only for a module
          that acts on a range at all — there is nothing spectral about a
          limiter, and a ruler under one would be noise. */}
      {copy?.band && typeof params.frequency === "number" ? (
        <FxBandRuler band={copy.band} at={params.frequency} />
      ) : null}
    </>
  );
}

/**
 * Everything below the header: does-copy, the one-knob face, and Details. The
 * derived and primary knobs are already their own components — what is left
 * is five independent conditionals deciding which pieces of the open face to
 * show, which is the section's actual job rather than an avoidable branch.
 */
// fallow-ignore-next-line complexity
export function FxNodeOpenBody({
  node,
  registryDef,
  def,
  onlyPrimary,
  primary,
  derived,
  profile,
  oneKnob,
  details,
  onToggleDetails,
  copy,
  params,
  index,
  disabled,
  bypassed,
  automatedTargets,
  liveAutomationValues,
  onUpdate,
  onPreview,
  onAutomateParam,
  onRemoveParamAutomation,
  trackKind,
}: FxNodeControlHandlers & {
  node: HfAudioFxNode;
  registryDef: HfAudioFxDef;
  def: HfAudioFxDef;
  onlyPrimary: HfAudioFxDef;
  primary: string | null;
  derived: HfAudioFxParam | null;
  profile: ReturnType<typeof getAudioFxProfile>;
  oneKnob: boolean;
  details: boolean;
  onToggleDetails(): void;
  copy: (typeof EFFECT_COPY)[string] | undefined;
  params: HfAudioFxParamValues;
  index: number;
  disabled?: boolean;
  bypassed: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {/* What it is for, before what it is made of. */}
      {copy?.does ? (
        <p className="hf-fx-node-does border-t border-panel-border-input px-1.5 py-1 text-[10px] text-panel-text-2">
          {copy.does}
        </p>
      ) : null}
      {!details ? (
        <FxNodeDerivedKnob
          node={node}
          derived={derived}
          profile={profile}
          disabled={disabled}
          bypassed={bypassed}
          params={params}
          index={index}
          onPreview={onPreview}
          onUpdate={onUpdate}
          trackKind={trackKind}
        />
      ) : null}
      {!details ? (
        <FxNodePrimaryKnob
          node={node}
          onlyPrimary={onlyPrimary}
          primary={primary}
          copy={copy}
          params={params}
          index={index}
          disabled={disabled}
          bypassed={bypassed}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
          onUpdate={onUpdate}
          onPreview={onPreview}
          onAutomateParam={onAutomateParam}
          onRemoveParamAutomation={onRemoveParamAutomation}
          trackKind={trackKind}
        />
      ) : null}
      {/* The DSP name lives on the disclosure, so it is read at the moment
          the author asks what this really is — and never before. */}
      {oneKnob ? (
        <button
          type="button"
          className="hf-fx-node-details flex w-full items-center gap-1 border-t border-panel-border-input px-1.5 py-1 text-left font-mono text-[9px] uppercase tracking-wide text-panel-text-2 hover:text-panel-text-0"
          aria-expanded={details}
          onClick={onToggleDetails}
        >
          <span aria-hidden="true">{details ? "▾" : "▸"}</span>
          {t("Details:")}{" "}{registryDef.label}
        </button>
      ) : (
        <p className="hf-fx-node-mechanism border-t border-panel-border-input px-1.5 pt-1 font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
          {t("Details:")}{" "}{registryDef.label}
        </p>
      )}
      {details || !oneKnob ? (
        <FxNodeParams
          node={node}
          def={def}
          index={index}
          disabled={Boolean(disabled) || bypassed}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
          onUpdate={onUpdate}
          onPreview={onPreview}
          onAutomateParam={onAutomateParam}
          onRemoveParamAutomation={onRemoveParamAutomation}
          trackKind={trackKind}
        />
      ) : null}
    </>
  );
}
