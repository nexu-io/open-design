import { useI18n } from "../../i18n/I18n";
import type React from "react";
import { Music } from "../../icons/SystemIcons";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { TrackClipCount } from "./TrackClipCount";
import { trackDisplaySuffix } from "./timelineTrackDisplay";
import { HiddenToggleIcon, hiddenToggleVerb } from "./hiddenToggle";

export function VisibilityButton({
  hidden,
  trackNumber,
  trackDisplayNumber,
  asMute,
  onToggle,
}: {
  hidden: boolean;
  trackNumber: number;
  trackDisplayNumber: number | null;
  /** `data-hidden` silences an audio-only track, so its toggle is a mute. */
  asMute: boolean;
  onToggle: TimelineEditCallbacks["onToggleTrackHidden"];
}) {
  const { t } = useI18n();
  // Display number in the text, real key in the callback. The two must not be
  // conflated in either direction.
  const suffix = trackDisplaySuffix(trackDisplayNumber);
  const label = t("{value0} track{suffix}", { value0: t(hiddenToggleVerb(asMute, hidden)), suffix: suffix });
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 transition-colors focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--timeline-accent)] ${
        hidden
          ? "text-[var(--timeline-accent)] hover:text-[var(--timeline-text-solid)]"
          : "text-[var(--timeline-text-faint)] hover:text-[var(--timeline-text-soft)]"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        // Display number alongside the real key: the undo-history label must
        // announce the same row this button just did (see `onToggleTrackHidden`).
        void onToggle?.(trackNumber, !hidden, trackDisplayNumber);
      }}
    >
      <HiddenToggleIcon asMute={asMute} hidden={hidden} size={14} />
    </button>
  );
}

// The header a track gets when it has no keyframe clip to disclose: label, clip
// count, eye. Not deprecated — it is the live path for every track without lanes.
export function PlainTrackHeader({
  trackNumber,
  trackDisplayNumber,
  trackLabel,
  clipCount,
  showTrackLabel,
  isTrackHidden,
  isAudioTrack,
  isAudioOnly,
  onToggleTrackHidden,
  trailing,
}: {
  trackNumber: number;
  trackDisplayNumber: number | null;
  trackLabel: string;
  clipCount: number;
  isTrackHidden: boolean;
  isAudioTrack: boolean;
  isAudioOnly: boolean;
  onToggleTrackHidden: TimelineEditCallbacks["onToggleTrackHidden"];
  showTrackLabel: boolean;
  /** Trailing controls that belong on the control line — the FX entry points,
   *  which the caller owns because only it knows the clip they act on. */
  trailing?: React.ReactNode;
}) {
  return (
    <>
      {/* One line: the name, then every control pushed to the right edge. The
          two-line split this replaced existed to stop four controls truncating
          the name — but the name already truncates on its own (`min-w-0` plus
          `truncate`), and the controls are `shrink-0`, so they hold the edge
          and the name gives way instead. */}
      <div className="flex min-w-0 items-center gap-1">
        {isAudioTrack && (
          <Music
            size={12}
            weight="fill"
            aria-hidden="true"
            className="text-[var(--timeline-text-faint)]"
          />
        )}
        {/* No `flex-1`: the name takes only the width it needs, so the clip
            count sits against it rather than being pushed out to meet the
            controls. The slack goes to the `ml-auto` group below instead. */}
        {showTrackLabel && (
          <span title={trackLabel} className="min-w-0 truncate text-[11px] leading-tight">
            {trackLabel}
          </span>
        )}
        {showTrackLabel && <TrackClipCount clipCount={clipCount} />}
        {/* `ml-auto` is what anchors the group right: it absorbs the slack the
            truncating name leaves, so the controls sit on the edge whatever the
            name's length. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <VisibilityButton
            hidden={isTrackHidden}
            trackNumber={trackNumber}
            trackDisplayNumber={trackDisplayNumber}
            asMute={isAudioOnly}
            onToggle={onToggleTrackHidden}
          />
          {trailing}
        </div>
      </div>
    </>
  );
}
