import { useI18n } from "../../i18n/I18n";
/**
 * The preset shelf for the FX rack.
 *
 * Its own module rather than another block inside the section: the section is
 * already the largest file in the panel, and this surface is going to grow —
 * search, per-item descriptions and a preview of the chain each preset draws
 * are all queued behind it.
 */

import {
  audioFxPresetsByFamily,
  HF_AUDIO_FX_PRESET_FAMILIES,
  type HfAudioFxPresetFamily,
} from "@hyperframes/core/audio-fx-presets";
import { PRESET_PROBLEM } from "@hyperframes/core/audio-fx-copy";
import { useRef } from "react";
import type { HfAudioNameKind } from "@hyperframes/core/audio-carve";

/**
 * Shelf names in the author's language, which is deliberately not the effect
 * registry's grouping. `group` says what an effect *is* (filter, dynamics);
 * somebody reaching for Telephone is shopping for what they *want*, and
 * Telephone is filters and saturation — nobody looks for it under either.
 */
const FAMILY_LABEL: Record<HfAudioFxPresetFamily, string> = {
  voice: "Voice",
  repair: "Fix",
  character: "Character",
  space: "Space",
};

export interface FxPresetMenuProps {
  /**
   * What the track reads as, from its id and filename.
   *
   * Only a confident "music" or "sfx" hides anything. `unknown` keeps the whole
   * shelf, on the same principle the carve's source picker follows: a name is a
   * hint, and a shelf that hides what somebody came for is worse than a long
   * one. Nothing here is irreversible either — the cost of a wrong guess is one
   * shelf the author has to scroll past, against the cost of "My voice sounds
   * amateur" sitting on a music bed.
   */
  trackKind?: HfAudioNameKind;
  onPick(id: string): void;
  /**
   * Report that a preset was auditioned. Called at most once per preset for as
   * long as this shelf stays mounted — a pointer crossing the column passes a
   * dozen items in a second, and counting every crossing would describe mouse
   * travel rather than interest, while drowning every other event in the rack.
   */
  onAuditionTracked?(id: string): void;
  /**
   * Play this preset on the running audio without persisting it, and revert on
   * `null`. Absent when there is no preview channel to hear it through.
   */
  onAudition?(id: string | null): void;
}

/**
 * Presets read as the complaint they answer, not as their own names.
 *
 * The name is a thing you have to already know — "Telephone", "Broadcast" — and
 * the author arriving here does not know it; they know their voice sounds
 * boomy. So the sentence leads and the name follows underneath, which is also
 * how the name gets learned. The four shelves stay because eighteen sentences
 * in a column is a wall, and they are already the author's grouping rather than
 * the registry's. See `plans/audio-fx-ux/README.md` §Decided.
 */
export function FxPresetMenu({
  trackKind,
  onPick,
  onAudition,
  onAuditionTracked,
}: FxPresetMenuProps) {
  const { t } = useI18n();
  // Mounted when the shelf opens and thrown away when it closes, so "once per
  // preset" resets each time the author comes back — a second visit is a second
  // look, not a duplicate of the first.
  const auditioned = useRef(new Set<string>());
  const reportAudition = (id: string) => {
    if (auditioned.current.has(id)) return;
    auditioned.current.add(id);
    onAuditionTracked?.(id);
  };
  // The voice presets all begin by cutting rumble out of a human voice and end
  // in a compressor set for speech. On a music bed that is not a mild mismatch,
  // it is the wrong instrument — and the shelf leads with the complaint, so it
  // would be offering the author a problem they do not have.
  const families =
    trackKind === "music" || trackKind === "sfx"
      ? HF_AUDIO_FX_PRESET_FAMILIES.filter((f) => f !== "voice")
      : HF_AUDIO_FX_PRESET_FAMILIES;
  return (
    <div
      className="hf-fx-preset-menu space-y-1.5 rounded-[4px] border border-panel-border-input p-1.5"
      // One handler for the shelf rather than one per button: leaving any preset
      // for the gap between two of them has to revert, and a per-button leave
      // fires that on the way to the next one.
      onMouseLeave={onAudition ? () => onAudition(null) : undefined}
      // Focus leaving the shelf is the keyboard's version of the pointer leaving
      // it. Moving between two buttons inside fires this and then the next
      // button's focus, so it reverts and re-auditions rather than sticking.
      onBlur={onAudition ? () => onAudition(null) : undefined}
    >
      {families.map((family) => (
        <div key={family} className="hf-fx-preset-group space-y-0.5">
          <span className="hf-fx-preset-group-label block font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
            {FAMILY_LABEL[family]}
          </span>
          {audioFxPresetsByFamily(family).map((preset) => (
            <button
              key={preset.id}
              type="button"
              // `pr-8` so a long complaint does not run under the wave.
              className="hf-fx-preset-item block w-full rounded-[3px] bg-panel-surface py-1 pl-1.5 pr-8 text-left text-panel-text-1 hover:text-panel-text-0"
              // The description says what it does; the count is doing real work
              // — it tells the author a preset IS a chain they can open and
              // edit, rather than an opaque setting they cannot follow.
              title={t("{description} ({count} effects)", { description: preset.description, count: preset.nodes.length })}
              onClick={() => onPick(preset.id)}
              onMouseEnter={() => {
                reportAudition(preset.id);
                onAudition?.(preset.id);
              }}
              // Keyboard reaches this too: arrowing down the shelf auditions the
              // same way hovering does, or the whole affordance is mouse-only.
              onFocus={() => {
                reportAudition(preset.id);
                onAudition?.(preset.id);
              }}
            >
              <span className="hf-fx-preset-problem block truncate text-[10px]">
                {PRESET_PROBLEM[preset.id] ?? preset.description}
              </span>
              {/* "Clean Voice · 5 effects" — the count is on the row in the
                  designs, not hidden in a tooltip. It is doing real work there:
                  it tells the author a preset IS a chain they can open and edit,
                  rather than an opaque setting they cannot follow. The count is
                  its own span so `.hf-fx-preset-name` stays the NAME — several
                  tests read it as the preset's identity. */}
              <span className="block truncate font-mono text-[9px] text-panel-text-2">
                <span className="hf-fx-preset-name">{preset.label}</span>
                <span className="hf-fx-preset-count">
                  {" · "}
                  {t("{count} effects", { count: preset.nodes.length })}
                </span>
              </span>
              {/* Hovering a preset plays it, and playing is otherwise invisible:
                  the panel looks identical whether the audition is sounding or
                  the pointer is just resting there. Only rendered when there IS
                  an audition channel, so it never claims audio that is not
                  happening. Four bars because that reads as a level meter at
                  this size; three reads as an ellipsis. */}
              {onAudition ? (
                <span className="hf-fx-preset-wave" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
