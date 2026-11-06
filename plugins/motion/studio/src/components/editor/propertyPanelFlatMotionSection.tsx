import { useI18n, translate, type Translate } from "../../i18n/I18n";
import { scopedElementKey } from "../../hooks/gsapKeyframeCacheHelpers";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import type { DomEditSelection } from "./domEditing";
import { formatTimingValue, RESPONSIVE_GRID } from "./propertyPanelHelpers";
import { parseTimingValue } from "./propertyPanelTimingSection";
import { CommitField } from "./propertyPanelPrimitives";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import { deriveElementTiming } from "./propertyPanelFlatTimingDerivation";
import { GsapAnimationList } from "./GsapAnimationList";

export function FlatTimingRow({
  element,
  animations = [],
  onSetAttribute,
  onSetAttributes,
}: {
  element: DomEditSelection;
  animations?: GsapAnimation[];
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  /** Commits start+duration together in ONE atomic persist call, bound to
   *  THIS render's `element` explicitly — not whatever is "currently"
   *  selected by the time the call resolves. Falls back to two sequential
   *  `onSetAttribute` calls (with the same non-atomicity/misdirection risk
   *  documented below) when the caller doesn't wire it up. */
  onSetAttributes?: (selection: DomEditSelection, attrs: Record<string, string>) => Promise<void>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const { start, duration, inferred: derived } = deriveElementTiming(element, animations);
  const end = start + duration;

  // While the range is inferred from animations, editing ONE field must pin the
  // WHOLE displayed range: writing only data-duration flips inference off and
  // drops start to data-start-or-0 (the clip silently shifts), and writing only
  // data-start is ignored while duration is still inferred (the edit looks
  // dead). Pin both attributes in ONE atomic commit bound to THIS element —
  // two sequential `onSetAttribute` calls would each resolve `domEditSelection`
  // fresh from current hook state, so a selection change between the two
  // awaits could misdirect the second write at the newly-selected element, and
  // a failure of just the second call would leave the pair half-applied.
  const pinRange = async (nextStart: number, nextDuration: number) => {
    const attrs = { start: nextStart.toFixed(2), duration: nextDuration.toFixed(2) };
    if (onSetAttributes) {
      await onSetAttributes(element, attrs);
      return;
    }
    await onSetAttribute("start", attrs.start);
    await onSetAttribute("duration", attrs.duration);
  };

  const commitStart = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null) return;
    if (derived) {
      void pinRange(parsed, duration);
      return;
    }
    void onSetAttribute("start", parsed.toFixed(2));
  };

  const commitDuration = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= 0) return;
    if (derived) {
      void pinRange(start, parsed);
      return;
    }
    void onSetAttribute("duration", parsed.toFixed(2));
  };

  const commitEnd = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= start) return;
    if (derived) {
      void pinRange(start, parsed - start);
      return;
    }
    void onSetAttribute("duration", (parsed - start).toFixed(2));
  };

  const cell = (label: string, value: string, onCommit: (next: string) => void) => (
    <div className="grid gap-px">
      <span className="text-[9px] text-panel-text-4">{t(label)}</span>
      <span className="border-b border-panel-border-input/50 font-mono text-[11px] text-panel-text-0 hover:border-panel-border-input">
        <CommitField
          value={value}
          onCommit={(next) => {
            track("metric", label);
            onCommit(next);
          }}
        />
      </span>
    </div>
  );

  return (
    <div className={RESPONSIVE_GRID}>
      {cell("Start", formatTimingValue(start), commitStart)}
      {cell("End", formatTimingValue(end), commitEnd)}
      {cell("Duration", formatTimingValue(duration), commitDuration)}
      {derived && (
        <p className="col-span-3 mt-1 text-[10px] leading-snug text-panel-text-3">
          {t("Inferred from this element's animation. Edit to pin an explicit clip range.")}</p>
      )}
    </div>
  );
}

export function FlatMotionSection({
  element,
  animations,
  showTiming,
  showEffects,
  multipleTimelines,
  unsupportedTimelinePattern,
  onSetAttribute,
  onSetAttributes,
  onAddAnimation,
  ...callbacks
}: {
  element: DomEditSelection;
  animations: GsapAnimation[];
  showTiming: boolean;
  showEffects: boolean;
  multipleTimelines?: boolean;
  unsupportedTimelinePattern?: boolean;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetAttributes?: (selection: DomEditSelection, attrs: Record<string, string>) => Promise<void>;
  onAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
} & GsapAnimationEditCallbacks) {
  const { t } = useI18n();
  // Only consume a focus request aimed at the element THIS panel renders (not
  // the store's selectedElementId, which flips synchronously during async
  // selection resolution), so a shared class-selector animation id can't open
  // the wrong element's editor.
  const renderedElementId = scopedElementKey(element);

  return (
    <div className="space-y-3">
      {showTiming && (
        <FlatTimingRow
          element={element}
          animations={animations}
          onSetAttribute={onSetAttribute}
          onSetAttributes={onSetAttributes}
        />
      )}
      {showEffects && (
        <>
          {multipleTimelines && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-warning-ink">
              {t("This file has multiple GSAP timelines. Animation editing is disabled to prevent data loss. Consolidate into a single timeline to enable editing.")}</p>
          )}
          {unsupportedTimelinePattern && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-warning-ink">
              {t("This timeline uses a computed key the editor can't resolve statically.")}</p>
          )}
          {!multipleTimelines && !unsupportedTimelinePattern && (
            <GsapAnimationList
              {...callbacks}
              elementId={renderedElementId}
              animations={animations}
              onAddAnimation={onAddAnimation}
              variant="flat"
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * What the Motion section is called, and what its collapsed line says.
 *
 * "Motion" names the tween editor. On audio the section is Start/Duration/End
 * and nothing else, so the label would promise what it no longer offers — and
 * "Motion: 0 effects" on a sound is a category error, hence the span instead of
 * a count.
 *
 * Keyed on the TAG by its caller, not on whether the effects half is showing:
 * that half also disappears when a host simply has not wired the GSAP handlers,
 * and a div in that state is still a thing that moves — renaming its section
 * would be describing the host's wiring rather than the element.
 */
export function motionSectionLabel(args: {
  timingOnly: boolean;
  start: number;
  duration: number;
  effectCount: number;
}, t: Translate = (message, values) => translate("en", message, values)): { title: string; summary: string } {
  if (args.timingOnly) {
    return {
      title: "Timing",
      summary: t("{start} to {end}", { start: formatTimingValue(args.start), end: formatTimingValue(args.start + args.duration) }),
    };
  }
  return {
    title: "Motion",
    summary: t("{count} effects", { count: args.effectCount }),
  };
}
