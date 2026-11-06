import { useI18n } from "../../i18n/I18n";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { RotateCcw } from "../../icons/SystemIcons";
import { CommitField } from "./propertyPanelPrimitives";
import { FlatSliderReadout } from "./propertyPanelFlatSliderReadout";
import {
  VALUE_TIER_LABEL_CLASS,
  VALUE_TIER_VALUE_CLASS,
  type PropertyValueTier,
} from "./propertyPanelValueTier";

export const FLAT_PREVIEW_GRID = "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1";

/* ------------------------------------------------------------------ */
/*  FlatRow — single-column label/value property row                   */
/* ------------------------------------------------------------------ */

export function FlatRow({
  label,
  value,
  tier,
  disabled,
  tooltip,
  liveCommit,
  suffix,
  dropdown,
  onPreview,
  onCommit,
  onReset,
}: {
  label: string;
  value: string;
  tier: PropertyValueTier;
  disabled?: boolean;
  /** Shown as a title attribute, e.g. why the row is disabled. */
  tooltip?: string;
  liveCommit?: boolean;
  suffix?: ReactNode;
  /** Renders a trailing 10px caret-down, for select-backed rows. */
  dropdown?: boolean;
  onPreview?: (nextValue: string) => void;
  onCommit: (nextValue: string) => void | Promise<unknown>;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  return (
    <div className="group flex min-h-[30px] items-center justify-between gap-3" title={tooltip ? t(tooltip) : undefined}>
      <span className={`text-[11px] ${VALUE_TIER_LABEL_CLASS[tier]}`}>{t(label)}</span>
      <span className="flex min-w-0 shrink-0 items-center gap-1.5">
        <span
          data-flat-row-value="true"
          className={`min-w-0 border-b pb-px font-mono text-[11px] ${VALUE_TIER_VALUE_CLASS[tier]} ${
            tier === "explicitCustom"
              ? "border-panel-accent/30 group-hover:border-panel-accent/70"
              : "border-panel-border-input/50 group-hover:border-panel-border-input"
          }`}
        >
          <CommitField
            value={value}
            disabled={disabled}
            liveCommit={liveCommit}
            align="right"
            onPreview={onPreview}
            onCommit={(nextValue) => {
              track("metric", label);
              return onCommit(nextValue);
            }}
          />
        </span>
        {suffix}
        {tier === "explicitCustom" && onReset && (
          <button
            type="button"
            data-flat-row-reset="true"
            title={t("Remove and fall back to default")}
            onClick={() => {
              track("button", `Reset ${label}`);
              onReset();
            }}
            className="shrink-0 text-panel-text-3 opacity-0 transition-opacity hover:text-panel-text-1 group-hover:opacity-100"
          >
            <RotateCcw size={11} />
          </button>
        )}
        {dropdown && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className="shrink-0 text-panel-text-5"
          >
            <path d="M2 3l3 4 3-4z" />
          </svg>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlatSegmentedRow — inline glyph runs, no container background      */
/* ------------------------------------------------------------------ */

export interface FlatSegmentOption {
  key: string;
  node: ReactNode;
  /** Accessible name — the glyph alone (e.g. two indistinguishable "A"
   *  buttons for upright vs. italic) isn't a valid accessible name on its
   *  own. */
  label: string;
  active: boolean;
}

export function FlatSegmentedRow({
  label,
  options,
  disabled,
  /** Index (0-based) after which to render a 12px spacer — for combined rows
   *  like Text's "Case · Style", which pack two independent option groups. */
  spacerAfterIndex,
  onChange,
}: {
  label: string;
  options: FlatSegmentOption[];
  disabled?: boolean;
  spacerAfterIndex?: number;
  onChange: (nextKey: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  return (
    <div className="flex min-h-[32px] items-center justify-between">
      <span className="text-[11px] text-panel-text-3">{t(label)}</span>
      <span className="flex items-center gap-0.5">
        {options.map((option, index) => (
          <span key={option.key} className="flex items-center">
            <button
              type="button"
              data-flat-segment="true"
              aria-label={t(option.label)}
              aria-pressed={option.active}
              disabled={disabled}
              onClick={() => {
                if (!option.active) track("segmented", label);
                onChange(option.key);
              }}
              className={`px-1.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed ${
                option.active
                  ? "border-b-2 border-panel-accent text-panel-text-0"
                  : "border-b-2 border-transparent text-panel-text-4 hover:text-panel-text-2"
              }`}
            >
              {typeof option.node === "string" ? t(option.node) : option.node}
            </button>
            {spacerAfterIndex === index && <span className="w-3" aria-hidden="true" />}
          </span>
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlatGroupHeader — one-open-at-a-time accordion group header        */
/*  (fixed-headers + scrollable-open-section layout, design_handoff    */
/*  scrollable-open-section): renders ONLY the header bar — collapsed  */
/*  button, or open-state title bar with the collapse control. Never   */
/*  positioned (no sticky, no stacking offsets) — it always sits in    */
/*  normal document flow. The open group's body content is rendered by */
/*  PropertyPanelFlat.tsx directly, in a dedicated scrollable region,   */
/*  not as children here.                                               */
/* ------------------------------------------------------------------ */

export function FlatGroupHeader({
  title,
  isOpen,
  onToggleOpen,
  accessory,
  summary,
  animateEntrance,
}: {
  title: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  accessory?: ReactNode;
  summary?: string;
  /** Play the fast entrance animation on this render — set only for the one
   *  group(s) actually transitioning (see PropertyPanelFlat's justToggledIds).
   *  Not derived from `isOpen`/remounting alone: React's key-based diffing
   *  can still shift an unrelated collapsed sibling's position in the
   *  before/after-open arrays (e.g. when the newly opened group isn't
   *  adjacent to the previously open one), and Chromium restarts a CSS
   *  entrance animation on such a position change even though nothing about
   *  that sibling actually changed — gating explicitly avoids that replay. */
  animateEntrance?: boolean;
}) {
  const { t } = useI18n();
  if (!isOpen) {
    return (
      <button
        type="button"
        data-flat-group-collapsed="true"
        onClick={onToggleOpen}
        className={`${animateEntrance ? "hf-flat-group-enter " : ""}flex min-h-10 w-full shrink-0 items-center justify-between gap-2 border-b border-panel-hairline bg-panel-bg px-4 text-left`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[12px] font-medium text-panel-text-2">{t(title)}</span>
          {summary && (
            <span className="min-w-0 truncate font-mono text-[9px] text-panel-text-4">
              {summary}
            </span>
          )}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className="shrink-0 text-panel-text-5"
        >
          <path d="M4 2l4 4-4 4z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={`${animateEntrance ? "hf-flat-group-enter " : ""}flex min-h-10 shrink-0 items-center justify-between bg-panel-bg px-4`}
    >
      <span className="text-[12px] font-semibold text-panel-text-0">{t(title)}</span>
      <span className="flex items-center gap-2.5 text-panel-text-5">
        {accessory}
        <button type="button" onClick={onToggleOpen} title={t("Collapse")} className="text-panel-text-3">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 4l4 4 4-4z" />
          </svg>
        </button>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlatSlider — full-width label/track/value row                      */
/* ------------------------------------------------------------------ */

/** Keyboard target for a slider keydown, or null for keys we don't handle. */
function sliderKeyTarget(
  key: string,
  current: number,
  min: number,
  max: number,
  step: number,
): number | null {
  if (key === "Home") return min;
  if (key === "End") return max;
  const deltas: Record<string, number> = {
    ArrowLeft: -step,
    ArrowDown: -step,
    ArrowRight: step,
    ArrowUp: step,
    PageDown: -step * 10,
    PageUp: step * 10,
  };
  const delta = deltas[key];
  if (delta === undefined) return null;
  return Math.max(min, Math.min(max, current + delta));
}

export function FlatSlider({
  label,
  value,
  min,
  max,
  step = 1,
  tier,
  displayValue,
  disabled,
  centerTick,
  onReset,
  onCommit,
  onCommitText,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  tier: "default" | "explicitCustom";
  displayValue: string;
  disabled?: boolean;
  centerTick?: boolean;
  onReset?: () => void;
  onCommit: (nextValue: number) => void;
  /** Typed readout: return false to refuse the text, keep the field open, and mark it invalid. */
  onCommitText?: (text: string) => boolean | void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  // `draft` gives the knob instant, drag-local visual feedback. `onCommit` is
  // throttled (not debounced) to at most once per 40ms: a real drag fires
  // pointermove faster than that, and a pure debounce (reset the timer on
  // every move) never commits until the pointer pauses or lifts — which kills
  // live preview updates during a continuous drag. Throttling still fires on
  // the leading edge and on a trailing timer, so the preview keeps updating
  // while dragging, with an immediate flush on release for the final value.
  const [draft, setDraft] = useState(value);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitAtRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  // True from pointerdown to pointerup/cancel. While dragging, the committed
  // prop echoing back through the parent must NOT reset `draft` — the echo is
  // up to 40ms stale (throttled commit), and syncing it mid-drag snaps the
  // knob backwards under the user's pointer.
  const draggingRef = useRef(false);
  // Tracks the last value actually sent to onCommit — separate from `value`
  // (the committed prop) because in a single pointerdown+pointerup click the
  // leading-edge commit fires before the parent has re-rendered with the new
  // prop, so the release flush must dedupe against what we just sent, not
  // against the stale prop, or the same value commits twice.
  const lastCommittedRef = useRef(value);
  // Always the current render's onCommit — read inside the throttle timer
  // instead of closing over the callback at schedule time. A caller whose
  // onCommit spreads other current state (e.g. Grade's "...grading, details:
  // {...}") would otherwise let a queued trailing commit fire ~40ms later
  // with a stale snapshot and silently revert whatever the user changed on a
  // different control in between.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // Always this render's committed value — read directly (not via the
  // effect below) by onLostPointerCapture, so the resync there doesn't
  // depend on ordering between the native event and the [value] effect.
  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  // releasePointerCapture() (called explicitly below in onPointerUp/
  // onPointerCancel) fires lostpointercapture SYNCHRONOUSLY in real
  // browsers — i.e. onLostPointerCapture runs mid-onPointerUp, BEFORE
  // onPointerUp's own draggingRef check and final commitDraft. Without this
  // flag, a NORMAL release would have onLostPointerCapture reset
  // draggingRef/draft to the stale value first, making onPointerUp's own
  // "if (!draggingRef.current) return" bail out and silently drop the
  // real final-position commit. Set right before each explicit release
  // call so onLostPointerCapture can tell "our own release, the caller's
  // own logic already handles it" apart from a genuine EXTERNAL capture
  // loss (another element steals it, or the browser reclaims it for a
  // scroll/touch gesture) where no other handler is about to run.
  const explicitReleaseRef = useRef(false);
  // The committed value when the current drag began — Escape and right-click
  // both cancel an in-progress drag by reverting to this, not by leaving
  // whatever position the pointer last reached committed.
  const dragStartValueRef = useRef(value);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (draggingRef.current) return;
    setDraft(value);
    lastCommittedRef.current = value;
  }, [value]);
  useEffect(
    () => () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        // Flush rather than drop a still-queued edit — this only fires if the
        // component unmounts mid-drag (e.g. selection changes away), and
        // silently discarding the user's last dragged position would look
        // like data loss.
        if (pendingRef.current !== null) onCommitRef.current(pendingRef.current);
      }
    },
    [],
  );

  const clampedPct = Math.max(0, Math.min(100, ((draft - min) / Math.max(max - min, 1e-6)) * 100));

  const stepFromClientX = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  };
  const commitDraft = (nextDraft: number) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    pendingRef.current = null;
    lastCommitAtRef.current = Date.now();
    if (nextDraft !== lastCommittedRef.current) {
      lastCommittedRef.current = nextDraft;
      onCommitRef.current(nextDraft);
    }
  };
  const scheduleCommit = (nextDraft: number) => {
    const elapsed = Date.now() - lastCommitAtRef.current;
    if (elapsed >= 40) {
      commitDraft(nextDraft);
      return;
    }
    pendingRef.current = nextDraft;
    if (!commitTimerRef.current) {
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        if (pendingRef.current !== null) commitDraft(pendingRef.current);
      }, 40 - elapsed);
    }
  };
  // Reverts to the pre-drag value instead of leaving whatever position the
  // pointer last reached committed — the drag's own leading-edge commit (in
  // onPointerDown) may already have applied an intermediate value, so this
  // must go through commitDraft (not just a visual setDraft) to actually
  // undo it.
  const cancelDrag = (target: HTMLDivElement) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pointerId = activePointerIdRef.current;
    if (pointerId !== null && target.hasPointerCapture(pointerId)) {
      explicitReleaseRef.current = true;
      target.releasePointerCapture(pointerId);
    }
    setDraft(dragStartValueRef.current);
    commitDraft(dragStartValueRef.current);
  };

  return (
    <div className="flex min-h-[28px] items-center gap-2.5">
      <span className="w-[86px] shrink-0 text-[11px] text-panel-text-3">{t(label)}</span>
      <div
        data-flat-slider-track="true"
        role="slider"
        aria-label={t(label)}
        aria-valuenow={draft}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={{ touchAction: "none" }}
        className={`relative h-5 flex-1 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        onPointerDown={(e) => {
          if (disabled) return;
          draggingRef.current = true;
          dragStartValueRef.current = latestValueRef.current;
          activePointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const stepped = stepFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
          setDraft(stepped);
          scheduleCommit(stepped);
        }}
        onPointerMove={(e) => {
          if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const stepped = stepFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
          setDraft(stepped);
          scheduleCommit(stepped);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            explicitReleaseRef.current = true;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          if (disabled) return;
          if (!draggingRef.current) return;
          draggingRef.current = false;
          // Recompute from the event itself rather than reading the `draft`
          // closure — if pointerdown+pointerup land in the same React batch
          // (e.g. a very fast click), the onPointerUp handler can still be
          // bound to the pre-drag render, making `draft` stale.
          const stepped = stepFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
          setDraft(stepped);
          commitDraft(stepped);
          if (stepped !== dragStartValueRef.current) track("slider", label);
        }}
        onPointerCancel={(e) => {
          // A native pointercancel means the platform aborted the gesture (a
          // scroll/touch takeover, pen leaving range, etc.) — that must cancel
          // the drag the same way Escape/right-click do (revert to the
          // pre-drag value), not just stop dragging and leave whatever
          // intermediate position the pointer last reached committed.
          cancelDrag(e.currentTarget);
        }}
        onLostPointerCapture={() => {
          if (explicitReleaseRef.current) {
            // Our own onPointerUp/onPointerCancel just released capture —
            // their own logic already handles (or intentionally leaves)
            // draggingRef/draft correctly. Resyncing here too would race
            // onPointerUp's still-pending final commitDraft(stepped) below
            // this call, since draggingRef flipping false would make its
            // own "if (!draggingRef.current) return" bail out first.
            explicitReleaseRef.current = false;
            return;
          }
          // A genuine EXTERNAL capture loss (another element steals it, or
          // the browser reclaims it for a scroll/touch gesture) — no other
          // handler is about to run, so resync immediately and directly
          // from latestValueRef rather than only clearing draggingRef and
          // waiting for the [value] effect to notice (that effect depends
          // on `value` actually changing again to re-run).
          draggingRef.current = false;
          setDraft(latestValueRef.current);
          lastCommittedRef.current = latestValueRef.current;
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape" && draggingRef.current) {
            e.preventDefault();
            cancelDrag(e.currentTarget);
            return;
          }
          const next = sliderKeyTarget(e.key, draft, min, max, step);
          if (next === null) return;
          e.preventDefault();
          setDraft(next);
          commitDraft(next);
          if (next !== draft) track("slider", label);
        }}
        onContextMenu={(e) => {
          // Right-click during a drag must cancel it (revert to the pre-drag
          // value), not leave the last dragged-to position committed while
          // the native context menu opens on top of the slider.
          if (!draggingRef.current) return;
          e.preventDefault();
          cancelDrag(e.currentTarget);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-panel-hover">
          {centerTick && (
            <div
              data-flat-slider-center-tick="true"
              className="absolute left-1/2 -top-px h-1 w-px -translate-x-1/2 bg-panel-text-5"
            />
          )}
          {tier === "explicitCustom" && (
            <div
              data-flat-slider-fill="true"
              className="absolute inset-y-0 left-0 rounded-full bg-panel-text-5"
              style={{ width: `${clampedPct}%` }}
            />
          )}
        </div>
        <div
          data-flat-slider-knob="true"
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            tier === "explicitCustom" ? "h-2 w-2 bg-text-0" : "h-[7px] w-[7px] bg-panel-text-4"
          }`}
          style={{ left: `${clampedPct}%` }}
        />
      </div>
      <FlatSliderReadout
        label={label}
        displayValue={displayValue}
        tier={tier}
        disabled={disabled}
        onCommitText={onCommitText}
        onCommitted={() => track("input", label)}
      />
      {(centerTick || onReset) && (
        <span data-flat-slider-reset-slot="true" className="w-3.5 shrink-0">
          {tier === "explicitCustom" && onReset && (
            <button
              type="button"
              data-flat-slider-reset="true"
              title={t("Remove and fall back to default")}
              disabled={disabled}
              onClick={() => {
                track("button", `Reset ${label}`);
                onReset();
              }}
              className="text-panel-text-3 hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export { FlatSelectRow } from "./propertyPanelFlatSelectRow";
