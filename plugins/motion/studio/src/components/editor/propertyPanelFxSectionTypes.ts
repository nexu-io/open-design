/**
 * `FxSection`'s prop contract, split out of `propertyPanelFxSection.tsx` so the
 * component file is mostly logic and JSX rather than documentation.
 */

import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import type { HfAudioNameKind, HfCarveSettings } from "@hyperframes/core/audio-carve";
import type { AudioTrackOption } from "./propertyPanelFxCarveModule.js";
import type { AudioFxSignalPath } from "./audioFxSignalPath.js";

export interface FxSectionProps {
  /**
   * An automation lane asked to be shown: its `fx.<node>.<param>` / `volume`
   * target. The section opens whichever surface owns that parameter — a node
   * row, an EQ module, a preset run, or the carve — and scrolls to it.
   */
  revealTarget?: string | null;
  /**
   * The reveal request's nonce. Consumption keys on THIS, not on
   * `revealTarget`: clicking a lane selects the clip first, which remounts this
   * section, so a `!==` against the previous VALUE initialises to the
   * already-set request and never fires — and a second click on the same lane
   * would be byte-identical and inert. Same reason `PropertyPanelFlat` keys its
   * own consumption on the nonce.
   */
  revealNonce?: number | null;
  /** What the rack's `In`/`Out` lines name — see `audioFxSignalPath`. Absent
   *  means an ungrouped clip, which is what those lines said before groups. */
  signalPath?: AudioFxSignalPath;
  chain: HfAudioFxChain;
  /** Targets this track already automates, as `fx.<nodeId>.<param>` strings. */
  automatedTargets?: ReadonlySet<string>;
  /**
   * What each automated target is worth at the playhead, by the same key.
   *
   * An automated parameter's stored number is only the seed the lane replaced, so
   * a rack that shows it stands still while the carve is audibly working. Absent,
   * or missing a key, means there is no playhead over this clip and the stored
   * value is the honest one.
   */
  liveAutomationValues?: ReadonlyMap<string, number>;
  /** Add a lane for one effect parameter, seeded at its current value. */
  onAutomateParam?(nodeId: string, paramKey: string): void;
  /** Delete one effect parameter's lane. */
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  /** Delete every lane belonging to a node that is being removed. */
  onRemoveNodeAutomation?(nodeId: string): void;
  /**
   * Delete the lanes of SEVERAL nodes at once, plus the whole-preset lane when
   * a preset id is given. One call, because each write is computed from the same
   * snapshot and replaces the whole attribute — a loop keeps only its last write.
   */
  onRemoveNodesAutomation?(nodeIds: readonly string[], presetId?: string): void;
  /** Add a lane for a whole preset's amount, seeded where it sits now. */
  onAutomatePreset?(presetId: string, amount: number): void;
  /** Delete that lane. */
  onRemovePresetAutomation?(presetId: string): void;
  /** Presets whose amount a lane already drives. */
  automatedPresets?: ReadonlySet<string>;
  /** Measure this track and write the levelling lane. Absent when unavailable. */
  onLevel?(): void;
  /** Take the levelling stage and its lane back out. */
  onRemoveLevel?(): void;
  /** Whether a levelling stage is already on the track. */
  levelled?: boolean;
  /**
   * Hover-audition of the levelling script: measure this track and play the
   * result without persisting it, and put it back on `false`.
   *
   * Separate from `onChainPreview` because it is the one audition that cannot be
   * synthesised from the chain in hand — the numbers do not exist until the
   * audio has been decoded and measured.
   */
  onAuditionLevel?(on: boolean): void;
  /** Whether that measurement is running, so the button can say so. */
  auditioningLevel?: boolean;
  /**
   * Start the transport for an audition, and stop it on the way out.
   *
   * An audition is written to the running graph, which is silent while the
   * transport is paused — so without this, hovering a preset does nothing at all
   * for a paused author.
   */
  onAuditionTransport?(on: boolean): void;
  /** Structural edits and gesture-end writes; this is the one that persists. */
  onChainChange(chain: HfAudioFxChain): void;
  /** Continuous updates while a control is being dragged. */
  onChainPreview?(chain: HfAudioFxChain): void;
  carve: HfCarveSettings | null;
  /** Gesture-end write; this is the one that persists. */
  onCarveChange(carve: HfCarveSettings | null): void;
  /** Continuous updates while a carve slider is dragged. Without this every
   *  pointermove patched the source file and resynced the selection. */
  onCarvePreview?(carve: HfCarveSettings): void;
  /**
   * Set when another track's carve listens to this one, naming it. The carve block
   * is then not offered here at all: this track is the voice, not the bed.
   */
  carvedAgainstBy?: string | null;
  /** Other audio elements that could act as the carve source. */
  sourceOptions: AudioTrackOption[];
  /**
   * What this track reads as, from its id and filename. Passed through to the
   * preset shelf, which hides the Voice family on a track that is plainly music
   * or an effect. Absent means unknown, and unknown keeps everything.
   */
  trackKind?: HfAudioNameKind;
  analysing?: boolean;
  disabled?: boolean;
}
