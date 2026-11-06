import { useI18n } from "../../i18n/I18n";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { TRACK_H } from "./timelineLayout";
import type { TimelineTheme } from "./timelineTheme";
import { TimelineFxButton } from "./TimelineFxButton";
import type { AuditionSpan } from "../../components/editor/useAuditionTransport.js";

interface TimelineGroupHeaderProps {
  label: string;
  memberCount: number;
  /** Caret: shows/hides the member rows beneath this group (structural). */
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** `∿`: shows/hides the group's own automation-lane rows. */
  laneCount: number;
  isLaneOpen: boolean;
  onToggleLanes: () => void;
  /** `add: true` (⌘/Ctrl-click) toggles membership; a plain click is exclusive. */
  /** C1: the group's serialized `data-fx-chain`, when set. */
  fxChain?: string;
  onFxChainChange: (next: HfAudioFxChain) => void;
  onFxChainPreview?: (next: HfAudioFxChain, ended?: boolean) => void;
  /** Member clips, so hovering a preset auditions where the group sounds. */
  auditionSpans?: readonly AuditionSpan[];
  onOpenFxRack: () => void;
  columnWidth: number;
  theme: TimelineTheme;
  showAudioEffects?: boolean;
}

/**
 * A group's own row header: caret (member disclosure) + `▤` + label + count +
 * FX + `∿ n` (lane disclosure).
 */

/**
 * The group's name, which IS the way into its rack — a group is an element
 * carrying `data-fx-chain`, so selecting it is what puts the chain in the
 * property panel. Its own component because the header it sits in already
 * carries six controls and was over the complexity gate with this inline.
 */
function GroupNameButton({
  label,
  memberCount,
  onOpenFxRack,
  showAudioEffects,
}: {
  label: string;
  memberCount: number;
  onOpenFxRack: () => void;
  showAudioEffects: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={showAudioEffects ? t("Open {label} effects", { label: label }) : t("Select {label}", { label: label })}
      title={showAudioEffects ? t("Open effects") : t("Select group")}
      // No `flex-1`: the row's control group owns the slack now (`ml-auto`), so
      // claiming it here would push the controls off the right edge — and the
      // count with them, since it rides inside this button.
      className="flex h-6 min-w-0 items-center gap-1.5 rounded-sm border-0 bg-transparent p-0 text-left text-[11px] text-[var(--timeline-text-solid)] hover:text-[var(--timeline-accent)] focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-[var(--timeline-accent)]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpenFxRack();
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 text-[12px] leading-none text-[var(--timeline-track-label)]"
      >
        ▤
      </span>
      <span title={label} className="min-w-0 truncate text-left font-medium leading-tight">
        {label}
      </span>
      <span
        className="shrink-0 rounded-full bg-[var(--timeline-tick-major)] px-1 text-[9px] leading-[14px] tabular-nums text-[var(--timeline-handle)]"
        aria-hidden="true"
        title={t("{memberCount} tracks", { memberCount: memberCount })}
      >
        {memberCount}
      </span>
    </button>
  );
}

export function TimelineGroupHeader({
  label,
  memberCount,
  isExpanded,
  onToggleExpanded,
  laneCount,
  isLaneOpen,
  onToggleLanes,
  fxChain,
  onFxChainChange,
  onFxChainPreview,
  auditionSpans,
  onOpenFxRack,
  columnWidth,
  theme,
  showAudioEffects = true,
}: TimelineGroupHeaderProps) {
  const { t } = useI18n();
  return (
    <div
      role="rowheader"
      aria-colindex={1}
      className="sticky left-0 z-12 flex shrink-0 items-center gap-1.5 overflow-hidden px-1.5 text-[11px]"
      style={{
        width: columnWidth,
        height: TRACK_H,
        color: "var(--timeline-text-solid)",
        background: theme.gutterBackground,
        borderRight: `1px solid ${theme.gutterBorder}`,
      }}
    >
      {/* One line, like a track header's: caret and name, then every control
          anchored to the right edge. */}
      <button
        type="button"
        tabIndex={-1}
        aria-expanded={isExpanded}
        aria-label={t("{value0} {label} tracks", { value0: t(isExpanded ? "Hide" : "Show"), label: label })}
        title={t("{value0} tracks", { value0: t(isExpanded ? "Hide" : "Show") })}
        // 13px mono, matching the property panel's preset-run caret
        // (`hf-fx-preset-run-caret`) — the same disclosure, so the same glyph
        // at the same size rather than a smaller one unique to this row.
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 font-mono text-[13px] focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-[var(--timeline-accent)] ${
          isExpanded
            ? "text-[var(--timeline-text-solid)]"
            : "text-[var(--timeline-handle)] hover:text-[var(--timeline-text-solid)]"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleExpanded();
        }}
      >
        {/* Swapped, not rotated: the panel's caret swaps too, and a rotated
              ▸ sits off-centre in its box because the glyph is not square. */}
        <span aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
      </button>
      <GroupNameButton
        label={label}
        memberCount={memberCount}
        onOpenFxRack={onOpenFxRack}
        showAudioEffects={showAudioEffects}
      />
      {/* `ml-auto` absorbs the slack the truncating name leaves, so the controls
          sit on the edge whatever the name's length. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {showAudioEffects && (
          <TimelineFxButton
            fxChainRaw={fxChain}
            onChainChange={onFxChainChange}
            onChainPreview={onFxChainPreview}
            auditionSpans={auditionSpans}
            onOpenRack={onOpenFxRack}
          />
        )}
        {/* No lanes, no control: an author who opens it meets an empty row and
            learns nothing. A track header already gates its own `∿` this way
            (`disclosable`); the group's was the one that still offered a
            disclosure over nothing. Automation appears by being written — from
            the rack or a keyframe — not by opening this, so nothing is
            unreachable while it is hidden. */}
        {laneCount > 0 && (
          <button
            type="button"
            tabIndex={-1}
            aria-expanded={isLaneOpen}
            aria-label={t("{value0} {label} lanes", { value0: t(isLaneOpen ? "Hide" : "Show"), label: label })}
            title={t("{value0} lanes", { value0: t(isLaneOpen ? "Hide" : "Show") })}
            // Anchored right, matching every other header's lane toggle.
            className={`ml-auto flex h-6 items-center justify-center gap-0.5 rounded border-0 bg-transparent px-1 text-[11px] leading-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-[var(--timeline-accent)] ${
              isLaneOpen
                ? "text-[var(--timeline-accent)]"
                : "text-[var(--timeline-handle)] hover:text-[var(--timeline-text-solid)]"
            }`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLanes();
            }}
          >
            <span aria-hidden="true">∿</span>
            <span className="text-[9px] tabular-nums text-[var(--timeline-handle)]">
              {laneCount}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
