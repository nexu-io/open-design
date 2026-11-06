import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
/**
 * The add-effect shelf: Tone, the composite jobs, and the raw registry.
 *
 * Split out of `propertyPanelFxSection.tsx`'s `{adding ? (...) : null}` block —
 * the section owns the audition/chain plumbing this shelf drives, and passes it
 * straight through.
 */

import {
  getAudioFxDef,
  HF_AUDIO_FX,
  type HfAudioFxChain,
  type HfAudioFxGroup,
} from "@hyperframes/core/audio-fx";
import {
  HF_AUDIO_FX_JOBS,
  HF_AUDIO_FX_JOB_TYPES,
  type HfAudioFxJob,
} from "@hyperframes/core/audio-fx-jobs";
import { EFFECT_COPY } from "@hyperframes/core/audio-fx-copy";

const GROUP_ORDER: HfAudioFxGroup[] = ["filter", "dynamics", "nonlinear", "time"];
const GROUP_LABEL: Record<HfAudioFxGroup, string> = {
  filter: "Filters",
  dynamics: "Dynamics",
  nonlinear: "Non-linear",
  time: "Time",
};

/**
 * The add menu, with the jobs standing in for the effect they are made of.
 *
 * `peaking` is not offered as itself: picking it is picking a machine and
 * leaving the real decision — which range — for afterwards. The jobs are that
 * decision, already made. See `audioFxJobs.ts`.
 *
 * Computed once at module scope, not per render: it has no dependency on props
 * or state, just the static effect registry.
 */
const GROUPED = GROUP_ORDER.map((g) => ({
  group: g,
  defs: HF_AUDIO_FX.filter((d) => d.group === g && !HF_AUDIO_FX_JOB_TYPES.has(d.id)),
  jobs: HF_AUDIO_FX_JOBS.filter((job) => getAudioFxDef(job.type)?.group === g),
}));

export interface FxAddMenuProps {
  disabled?: boolean;
  analysing?: boolean;
  levelled?: boolean;
  auditioningLevel?: boolean;
  /** Measure this track and write the levelling lane. Absent when unavailable. */
  onLevel?(): void;
  /** Take the levelling stage and its lane back out. */
  onRemoveLevel?(): void;
  onEq(): void;
  onJob(job: HfAudioFxJob): void;
  onEffect(type: string): void;
  /** The shelf just picked something, or the levelling button did its own close. */
  onClose(): void;
  /** Play a hypothetical chain without committing to it, or `null` to stop. */
  audition(make: ((base: HfAudioFxChain) => HfAudioFxChain) | null): void;
  onAuditionLevel?(on: boolean): void;
  withJob(base: HfAudioFxChain, job: HfAudioFxJob): HfAudioFxChain;
  withEffect(base: HfAudioFxChain, type: string): HfAudioFxChain;
}

/** The shelf `adding` opens: Tone, the named jobs, and the raw effect registry. */
export function FxAddMenu({
  disabled,
  analysing,
  levelled,
  auditioningLevel,
  onLevel,
  onRemoveLevel,
  onEq,
  onJob,
  onEffect,
  onClose,
  audition,
  onAuditionLevel,
  withJob,
  withEffect,
}: FxAddMenuProps) {
  const { t } = useI18n();
  const trackInput = useTrackDesignInput();
  return (
    <div
      className="hf-fx-add-menu space-y-1.5 rounded-[4px] border border-panel-border-input p-1.5"
      // On the shelf, not on each button: moving between two of them passes
      // through the gap, and a per-button leave would revert on the way.
      onMouseLeave={() => {
        audition(null);
        onAuditionLevel?.(false);
      }}
      // The keyboard's version of leaving. Tabbing between two entries fires
      // this and then the next one's focus, so it reverts and re-auditions.
      onBlur={() => {
        audition(null);
        onAuditionLevel?.(false);
      }}
    >
      <div className="hf-fx-add-group flex flex-wrap items-center gap-1">
        <span className="hf-fx-add-group-label w-full font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
          {t("Tone")}</span>
        {onLevel ? (
          <button
            type="button"
            className="hf-fx-add-composite rounded-[3px] bg-panel-surface px-1.5 py-0.5 text-[10px] text-panel-text-1 hover:text-panel-text-0"
            title={t("Listen to this track and even out its loud and quiet parts.")}
            disabled={disabled || analysing}
            onClick={() => {
              if (levelled) {
                if (onRemoveLevel) {
                  onRemoveLevel();
                  trackInput("button", "remove-levelling");
                }
              } else {
                onLevel();
                trackInput("button", "add-levelling");
              }
              onClose();
            }}
            // The one module here that cannot answer instantly: it has to
            // decode the track and measure it before there is anything to
            // hear. So it says it is working rather than doing nothing
            // visible, and whoever handles this must drop a result that
            // arrives after the pointer has gone.
            onMouseEnter={
              levelled
                ? undefined
                : () => {
                    audition(null);
                    onAuditionLevel?.(true);
                  }
            }
            onFocus={levelled ? undefined : () => onAuditionLevel?.(true)}
          >
            {levelled ? t("Remove levelling") : t("Even Out Levels")}
            {auditioningLevel ? <span className="hf-fx-add-working"> {t("measuring…")}</span> : null}
          </button>
        ) : null}
        <button
          type="button"
          // Not hf-fx-add-item: Tone is a composite over several filters, not
          // an entry in the effect registry, and a count of the registry must
          // not include it.
          className="hf-fx-add-composite rounded-[3px] bg-panel-surface px-1.5 py-0.5 text-[10px] text-panel-text-1 hover:text-panel-text-0"
          title={t("Bass, middle and treble on one set of faders.")}
          // No audition of its own: a Tone module arrives with every band at
          // 0 dB, so there is nothing to hear until a fader moves, and a hover
          // that changes nothing teaches that hovering does nothing. It still
          // has to call the neighbours' auditions off.
          onMouseEnter={() => {
            audition(null);
            onAuditionLevel?.(false);
          }}
          onClick={onEq}
        >
          {t("Tone (EQ)")}</button>
      </div>
      {GROUPED.map(({ group, defs, jobs }) => (
        <div key={group} className="hf-fx-add-group flex flex-wrap items-center gap-1">
          <span className="hf-fx-add-group-label w-full font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
            {GROUP_LABEL[group]}
          </span>
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              // Same class as any other entry: a job IS an effect, and one
              // that looked special would read as a preset rather than as the
              // thing the author is about to add.
              className="hf-fx-add-item rounded-[3px] bg-panel-surface px-1.5 py-0.5 text-[10px] text-panel-text-1 hover:text-panel-text-0"
              title={job.does}
              onClick={() => onJob(job)}
              onMouseEnter={() => {
                onAuditionLevel?.(false);
                audition((base) => withJob(base, job));
              }}
              onFocus={() => audition((base) => withJob(base, job))}
            >
              {job.label}
            </button>
          ))}
          {defs.map((d) => (
            <button
              key={d.id}
              type="button"
              className="hf-fx-add-item rounded-[3px] bg-panel-surface px-1.5 py-0.5 text-[10px] text-panel-text-1 hover:text-panel-text-0"
              // The menu that adds it has to call it what the rack will call
              // it, or the author picks "High-pass" and a module named
              // "Remove Rumble" appears. The registry's own description stays
              // as the tooltip beside the plain one: the mechanism is taught
              // here rather than withheld.
              title={EFFECT_COPY[d.id] ? `${EFFECT_COPY[d.id]?.does} (${d.label})` : d.description}
              onClick={() => onEffect(d.id)}
              // Cancels the levelling audition as well as starting its own.
              // The shelf's leave handler only fires on the way OUT of the
              // menu, so sliding from Even Out Levels straight to here left a
              // measurement in flight — and it landed on top of this one, a
              // levelled version of the chain as it was, written through a
              // channel the document never sees.
              onMouseEnter={() => {
                onAuditionLevel?.(false);
                audition((base) => withEffect(base, d.id));
              }}
              onFocus={() => audition((base) => withEffect(base, d.id))}
            >
              {EFFECT_COPY[d.id]?.title ?? d.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
