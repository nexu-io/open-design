import { useI18n } from "../../i18n/I18n";
import { TRACK_H } from "./timelineLayout";
import { TrackClipCount } from "./TrackClipCount";

// Layer row (diamond, name, then the ∿ disclosure on the right edge) — the
// disclosure lives
// here, not on the clip bar, and re-expands a collapsed layer. `∿` (not a
// caret) because a group's own row keeps the caret for its structural
// disclosure (member rows) — this button only ever means "show this row's
// lanes", so it needs its own distinct glyph.
/**
 * The `∿` that shows or hides a row's lanes.
 *
 * Shared, because two layouts need the identical control: the keyframe layer
 * row below, and the plain track header — an audio track with automation keeps
 * its own look (music glyph, indent) and gains this, rather than being
 * re-rendered as a keyframe layer to get at the button.
 */
export function LaneToggleButton({
  name,
  isExpanded,
  lanesId,
  onToggle,
}: {
  name: string;
  isExpanded: boolean;
  lanesId: string;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      // ponytail: No focus id here; keyboard routing belongs to the enclosing logical row.
      tabIndex={-1}
      aria-expanded={isExpanded}
      aria-controls={lanesId}
      aria-label={t("{value0} {name} lanes", { value0: t(isExpanded ? "Hide" : "Show"), name: name })}
      title={t("{value0} lanes", { value0: t(isExpanded ? "Hide" : "Show") })}
      // h-6 w-6 = the 24x24 WCAG 2.2 minimum target. The glyph stays 11px;
      // only the hit box grows.
      className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-[11px] leading-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-[var(--timeline-accent)] ${
        isExpanded
          ? "text-[var(--timeline-accent)]"
          : "text-[var(--timeline-handle)] hover:text-[var(--timeline-text-solid)]"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span aria-hidden="true">∿</span>
    </button>
  );
}

export function LayerDisclosureRow({
  name,
  clipCount,
  isExpanded,
  gutterBackground,
  columnWidth,
  lanesId,
  onToggleClipExpanded,
  children,
}: {
  /** What this row is called. The active clip's own name when it is alone on the
   *  track; the track itself once it holds several, since naming a shared row
   *  after one of its clips reads as if the rows under it were that clip's. */
  name: string;
  clipCount: number;
  isExpanded: boolean;
  gutterBackground: string;
  /** Same adaptive width the lane rows use: a narrowed header column must not
   *  leave this row hanging over the clips it labels. */
  columnWidth: number;
  /** Id of the CANVAS-side element holding the diamond lanes this row's caret
   *  expands (see TimelinePropertyLanes). The caret also reveals the per-lane
   *  control rows in this column, but the diamonds are what following the
   *  reference should land on. */
  lanesId: string;
  onToggleClipExpanded: () => void;
  /** Trailing controls that act on the LAYER (the visibility eye), not on a lane. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className="absolute left-0 top-0 flex items-center gap-1.5 overflow-hidden px-1.5 text-[11px]"
      style={{
        width: columnWidth,
        height: TRACK_H,
        color: "var(--timeline-text-solid)",
        background: gutterBackground,
      }}
    >
      {/* Decorative: the disclosure button above already names the row's keyframe
          state, and aria-label on a plain span is not exposed reliably anyway. */}
      <span
        aria-hidden="true"
        className="shrink-0 text-[13px] leading-none text-[var(--timeline-text-dim)]"
      >
        ◇
      </span>
      <span title={name} className="min-w-0 flex-1 truncate font-medium leading-tight">
        {name}
      </span>
      <TrackClipCount clipCount={clipCount} />
      {children}
      {/* Anchored right, on every header that has one: the lane toggle is the
          row's last word about itself, and a left-hand ∿ put it where the eye
          looks for identity instead. `ml-auto` rather than a spacer so it holds
          the edge whatever else the row grows. */}
      <LaneToggleButton
        name={name}
        isExpanded={isExpanded}
        lanesId={lanesId}
        onToggle={onToggleClipExpanded}
      />
    </div>
  );
}
