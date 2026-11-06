import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
/**
 * The voiceover carve, as one module in the FX rack.
 *
 * Carve is deliberately not an entry in the chain. It is a relationship between
 * two tracks — it analyses a voice and dips *this* bed where that voice sits —
 * so it gets its own card with a source picker, the way a sidechain control
 * lives on the track being processed. What it produces is an ordinary chain of
 * peaking filters, so it composes with whatever else is on the track.
 */

import {
  defaultAudioFxParams,
  getAudioFxDef,
  type HfAudioFxNode,
  type HfAudioFxParam,
} from "@hyperframes/core/audio-fx";
import { DEFAULT_CARVE, type HfCarveSettings } from "@hyperframes/core/audio-carve";
import { fxAutomationTarget } from "@hyperframes/core/audio-automation";
import { FxParamRow } from "./propertyPanelFxControls.js";
import { FX_FAMILY_TYPE, fxFamilyTint } from "./propertyPanelFxFamily.js";
import { fxTintWash } from "./propertyPanelFxPresetStyle.js";
// Shared with the timeline's lane labels: a band is named by its frequency in
// both places, and two formatters would drift.
import { formatHz } from "../../player/components/automationLaneData";

export interface AudioTrackOption {
  id: string;
  label: string;
}

/** What one effect inside the module is called: its own name, plus the band. */
function carveMemberName(node: HfAudioFxNode): string {
  const def = getAudioFxDef(node.type);
  const freq = node.params?.["frequency"];
  const label = def?.label ?? node.type;
  return typeof freq === "number" ? `${label} ${formatHz(freq)}` : label;
}

/** A parameter's value as the rack shows it: rounded to the step, with its unit. */
function formatParamValue(param: HfAudioFxParam, raw: number | string | undefined): string {
  if (param.kind !== "number" || typeof raw !== "number") return String(raw ?? "");
  const places = param.step >= 1 ? 0 : param.step >= 0.1 ? 1 : 2;
  return `${Number(raw.toFixed(places))}${param.unit ? ` ${param.unit}` : ""}`;
}

/**
 * Width to reserve for a parameter's value, in characters.
 *
 * Derived from what the parameter CAN read rather than what it currently reads, so
 * the column never moves: an automated value updates 30 times a second, and
 * `-1 dB` is two characters narrower than `-3.2 dB`, which was enough to shunt
 * everything after it sideways on every frame. `ch` is exact here because the
 * readouts are monospace and already `tabular-nums`.
 */
function paramValueWidthCh(param: HfAudioFxParam): number {
  if (param.kind === "enum") {
    return Math.max(1, ...param.options.map((option) => option.value.length));
  }
  const places = param.step >= 1 ? 0 : param.step >= 0.1 ? 1 : 2;
  const digits = Math.max(
    String(Math.floor(Math.abs(param.min))).length,
    String(Math.floor(Math.abs(param.max))).length,
  );
  const sign = param.min < 0 ? 1 : 0;
  const decimals = places > 0 ? places + 1 : 0;
  const unit = param.unit ? param.unit.length + 1 : 0;
  return sign + digits + decimals + unit;
}

/** One member of the module: what it is, and what every knob is set to. */
function FxCarveMember({
  node,
  automatedTargets,
  liveAutomationValues,
}: {
  node: HfAudioFxNode;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
}) {
  const def = getAudioFxDef(node.type);
  if (!def) return null;
  const params = node.params ?? defaultAudioFxParams(node.type);
  return (
    <div className="hf-fx-carve-member flex flex-col gap-0.5 py-1 pl-3 pr-1.5">
      <span className="hf-fx-carve-member-name truncate font-mono text-[9px] text-panel-text-1">
        {carveMemberName(node)}
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {def.params.map((param) => {
          const target = node.id ? fxAutomationTarget(node.id, param.key) : null;
          const automated = Boolean(target && automatedTargets?.has(target));
          // The envelope's value at the playhead when there is one, which is what
          // the audio is using; the stored number is only the seed behind it.
          const live = target ? liveAutomationValues?.get(target) : undefined;
          const driven = automated && live !== undefined;
          const value = formatParamValue(param, driven ? live : params[param.key]);
          return (
            <span
              key={param.key}
              className="flex items-baseline gap-1 font-mono text-[9px] text-panel-text-2"
              {...(automated ? { "data-automated": "" } : {})}
              {...(driven ? { "data-automation-live": "" } : {})}
            >
              <span className="text-panel-text-2">{param.label}</span>
              <span
                className="tabular-nums text-panel-text-1"
                style={{ minWidth: `${paramValueWidthCh(param)}ch` }}
              >
                {value}
              </span>
              {/* The lane is where an automated value comes from, and where it is
                  edited — saying so is the difference between a stale readout and
                  a pointer to the thing that owns it. */}
              {automated ? <span className="text-accent-ink">A</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The carve, as one module in the rack.
 *
 * A carve is one thing the author switched on; the peaking filters and the level
 * stage are how it is built. Listed individually they read as hand-built effects —
 * removable one at a time, reorderable, each with knobs the next strength change
 * silently overwrites. So the rack shows the unit, and the unit owns everything
 * that means anything for it: which voice it listens to, how hard it works,
 * whether it follows that voice, and what the analysis made of it.
 *
 * The controls used to sit in their own block under the rack, which read as a
 * second, unrelated feature that happened to produce effects somewhere else. One
 * card, controls above the analysis they drive, is the same thing said once.
 *
 * Grouped is not hidden. Opening it lists every effect inside with all of its
 * settings, because an author has to be able to see where the analysis landed — as
 * readouts rather than controls, since strength is what sets them and a knob here
 * would be overwritten by the next adjustment.
 */
export function FxCarveModule({
  nodes,
  carve,
  sourceOptions,
  automatedTargets,
  liveAutomationValues,
  open,
  disabled,
  analysing,
  onToggleOpen,
  onCarveChange,
  onCarvePreview,
}: {
  nodes: HfAudioFxNode[];
  carve: HfCarveSettings;
  sourceOptions: AudioTrackOption[];
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  open: boolean;
  disabled?: boolean;
  analysing?: boolean;
  onToggleOpen(): void;
  onCarveChange(carve: HfCarveSettings): void;
  onCarvePreview(carve: HfCarveSettings): void;
}) {
  const { t } = useI18n();
  const on = carve.enabled;
  const trackInput = useTrackDesignInput();
  const soleVoice = soleCarveVoice(sourceOptions, carve.sources);
  const summary = carveSummary({ nodes, carve, analysing });
  // The carve's own colour, used three ways: the module's left edge, the title,
  // and the wash behind it. A preset gets a title treatment because it is a
  // character; the carve gets one because it is the only module in the rack
  // that LISTENS to another track, and a plain row understates that. It stays
  // in the smart family's monospace — what it shows is a readout, and a
  // display face would promise settings the author chose.
  const tint = fxFamilyTint({ type: "carve", fromCarve: true });
  const wash = fxTintWash(tint);
  return (
    <div
      className={`hf-fx-node hf-fx-carve-module hf-fx-carve rounded-[4px] border border-l-2 border-panel-border-input${
        on ? "" : " opacity-50"
      }`}
      data-fx-node="carve"
      data-fx-family="smart"
      // Smart, like the Tone EQ and the leveller: it measures the audio and
      // writes its own settings, and what it shows is a readout of what it
      // decided rather than controls the author set.
      style={{ borderLeftColor: tint, ...(wash ? { backgroundColor: wash } : {}) }}
      data-carve-enabled={on ? "" : undefined}
    >
      <div className="hf-fx-node-head flex min-h-7 items-center gap-1 px-1.5">
        <button
          type="button"
          className={`hf-fx-node-name min-w-0 flex-1 truncate text-left text-[13px] uppercase hover:opacity-80 ${FX_FAMILY_TYPE.smart}`}
          // Tracking goes here rather than in a class: the smart family already
          // sets `tracking-normal`, and two Tailwind tracking utilities on one
          // element resolve by stylesheet order, not by the order written.
          style={{ color: tint, letterSpacing: "0.16em" }}
          // Truncates in a narrow panel like every other name in the rack.
          title={t("Voiceover carve")}
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {t("Voiceover carve")}</button>
        <span className="hf-fx-carve-summary shrink-0 font-mono text-[9px] text-panel-text-2">
          {summary}
        </span>
        {/* One switch, not a bypass and a delete. Off drops the effects and the
            envelopes it wrote, and is remembered — otherwise the default would
            re-apply the carve the next time this clip was selected. */}
        <button
          type="button"
          className="hf-fx-bypass hf-fx-carve-toggle rounded-[3px] border border-panel-border-input px-1.5 py-0.5 font-mono text-[9px] text-panel-text-2 hover:text-panel-text-0 disabled:opacity-40"
          aria-pressed={on}
          title={on ? t("Switch the carve off") : t("Switch the carve on")}
          disabled={disabled}
          onClick={() => {
            onCarveChange({ ...carve, enabled: !on });
            trackInput("toggle", "carve-enabled");
          }}
        >
          {on ? t("On") : t("Off")}
        </button>
      </div>
      {open && on ? (
        <div className="hf-fx-carve-body border-t border-panel-border-input">
          <div className="hf-fx-carve-controls space-y-0.5 px-1.5 py-1.5">
            <CarveSourceRow
              carve={carve}
              sourceOptions={sourceOptions}
              soleVoice={soleVoice}
              disabled={disabled}
              onCarveChange={onCarveChange}
            />
            {/* One knob for the whole effect. Depth, band count, width, the
                intelligibility weighting and both level-match numbers move together
                anyway — a gentle carve is shallow in few bands with little ducking, a
                hard one is deeper in more with more — so the panel sets the strength
                and `carveProfile` derives the six numbers the analysis works in. */}
            <FxParamRow
              param={{
                kind: "number",
                key: "strength",
                label: "Strength",
                unit: "",
                min: 0,
                max: 1,
                step: 0.05,
                default: DEFAULT_CARVE.strength,
                hint: "How hard to carve: deeper cuts, in more bands, and more room made by dropping the bed's level under the voice. At 0 it carves frequencies only. Moving this re-runs the analysis on what is already here.",
              }}
              value={carve.strength}
              disabled={disabled || carve.sources.length === 0}
              onChange={(_k, v) => onCarvePreview({ ...carve, strength: Number(v) })}
              onCommit={(_k, v) => {
                onCarveChange({ ...carve, strength: Number(v) });
                trackInput("slider", "carve-strength");
              }}
            />
          </div>
          {/* What the analysis made of all that. Divided rather than boxed: these
              are parts of one module, and a border around each would read as the
              separate effects this replaced. */}
          {/* While the analysis runs, the previous filters are gone rather than
              stale. Every number in that list is about to be replaced — a strength
              change re-derives all of them — so leaving them up reads as the
              settings that are in force when they are already history, and the one
              honest thing to say is that the work is happening. */}
          <CarveAnalysis
            nodes={nodes}
            analysing={analysing}
            hasSources={carve.sources.length > 0}
            automatedTargets={automatedTargets}
            liveAutomationValues={liveAutomationValues}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The only track this bed could be listening to, when there is exactly one.
 *
 * A picker with one entry is a question with one answer: it asks the author to
 * confirm something already decided. So the voice reads out instead.
 *
 * Not when the stored source is some OTHER track, though — a name that no longer
 * classifies as a voice, or a track since renamed. Reading out the one remaining
 * candidate there would quietly claim the carve listens to something it does not,
 * so the picker comes back and shows the mismatch.
 */
function soleCarveVoice(
  sourceOptions: AudioTrackOption[],
  sources: readonly string[],
): AudioTrackOption | null {
  if (sourceOptions.length !== 1) return null;
  const only = sourceOptions[0];
  if (!only) return null;
  if (sources.length === 0) return only;
  return sources.length === 1 && sources[0] === only.id ? only : null;
}

/**
 * What the module is worth right now, for its head, so a collapsed card still
 * says whether it is doing anything: the analysis it produced, or why not.
 */
function carveSummary(input: {
  nodes: HfAudioFxNode[];
  carve: HfCarveSettings;
  analysing?: boolean;
}): string {
  const { nodes, carve, analysing } = input;
  if (!carve.enabled) return "off";
  if (analysing) return "analysing…";
  const bands = nodes.filter((n) => n.type === "peaking").length;
  if (bands === 0) return carve.sources.length > 0 ? "no analysis yet" : "pick a voice";
  return [
    `${bands} band${bands === 1 ? "" : "s"}`,
    ...(nodes.some((n) => n.type === "gain") ? ["level"] : []),
    // Worth saying when it is more than one: the cuts follow whoever is
    // speaking, and that is not obvious from a band count.
    ...(carve.sources.length > 1 ? [`${carve.sources.length} voices`] : []),
  ].join(" + ");
}

/** Which voices the bed makes room for: a readout when there is only one to
 *  choose, otherwise a set of checkboxes. */
function CarveSourceRow({
  carve,
  sourceOptions,
  soleVoice,
  disabled,
  onCarveChange,
}: {
  carve: HfCarveSettings;
  sourceOptions: AudioTrackOption[];
  soleVoice: AudioTrackOption | null;
  disabled?: boolean;
  onCarveChange(carve: HfCarveSettings): void;
}) {
  const { t } = useI18n();
  const trackInput = useTrackDesignInput();
  return (
    <div className="hf-fx-row flex min-h-6 items-center gap-2">
      {/* Wraps like every other name in this column (see FxParamRow) — one
          truncating row beside wrapping ones reads as a rendering bug. */}
      <span className="hf-fx-label w-[86px] shrink-0 wrap-break-word text-[10px] leading-tight text-panel-text-2">
        {t("Listen to")}</span>
      {soleVoice ? (
        <span
          className="hf-fx-carve-source min-w-0 flex-1 truncate font-mono text-[10px] text-panel-text-1"
          data-carve-source={soleVoice.id}
        >
          {soleVoice.label}
        </span>
      ) : (
        /* Every voice, not one of them. A bed usually runs under a whole
           sequence — a narrator, an answer, a second presenter — and they are
           analysed together, so the cuts follow whoever is speaking. Which
           makes this a set of things to include, not a choice between them. */
        <div className="hf-fx-carve-sources flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-0.5">
          {sourceOptions.map((o) => (
            <label
              key={o.id}
              className="flex min-w-0 items-center gap-1 font-mono text-[9px] text-panel-text-1"
              title={t("Make room for {value0}", { value0: o.label })}
            >
              <input
                type="checkbox"
                className="hf-fx-carve-source h-2.5 w-2.5 accent-panel-accent"
                data-carve-source={o.id}
                checked={carve.sources.includes(o.id)}
                disabled={disabled}
                onChange={(e) => {
                  onCarveChange({
                    ...carve,
                    sources: e.target.checked
                      ? [...carve.sources, o.id]
                      : carve.sources.filter((id) => id !== o.id),
                  });
                  trackInput("toggle", "carve-source");
                }}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What the analysis made of all that. Divided rather than boxed: these are parts
 * of one module, and a border around each would read as the separate effects
 * this replaced.
 *
 * While the analysis runs the previous filters are gone rather than stale. Every
 * number in that list is about to be replaced — a strength change re-derives all
 * of them — so leaving them up reads as the settings that are in force when they
 * are already history, and the one honest thing to say is that the work is
 * happening.
 */
function CarveAnalysis({
  nodes,
  analysing,
  hasSources,
  automatedTargets,
  liveAutomationValues,
}: {
  nodes: HfAudioFxNode[];
  analysing?: boolean;
  hasSources: boolean;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
}) {
  const { t } = useI18n();
  if (analysing) {
    return (
      <p className="hf-fx-carve-working flex items-center justify-center gap-1.5 border-t border-panel-border-input py-2 text-[10px] text-panel-text-2">
        <svg
          className="hf-fx-carve-spinner h-3 w-3 animate-spin motion-reduce:animate-none"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        {t("Analysing…")}</p>
    );
  }
  if (nodes.length === 0) {
    return (
      <p className="hf-fx-carve-working border-t border-panel-border-input py-1.5 text-center text-[10px] text-panel-text-2">
        {hasSources ? t("Nothing analysed yet.") : t("Pick the voices this bed should make room for.")}
      </p>
    );
  }
  return (
    <div className="hf-fx-carve-members divide-y divide-panel-border-input/60 border-t border-panel-border-input">
      <div className="hf-fx-carve-members-label px-1.5 pt-1 font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
        {t("analysed")}</div>
      {nodes.map((node, i) => (
        <FxCarveMember
          key={node.id ?? `${node.type}-${i}`}
          node={node}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
        />
      ))}
    </div>
  );
}
