import { useI18n } from "../../i18n/I18n";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { Clock } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditing";
import { formatTimingValue, RESPONSIVE_GRID } from "./propertyPanelHelpers";
import { MetricField, Section } from "./propertyPanelPrimitives";

export function parseTimingValue(input: string): number | null {
  const cleaned = input.replace(/s$/i, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Derive a time range from the element's GSAP tweens (earliest start → latest
 * end) so an element animated purely by GSAP — with no `data-start` /
 * `data-duration` — still shows a meaningful Timing range instead of 0s.
 */
function deriveTimingFromAnimations(
  animations: GsapAnimation[],
): { start: number; duration: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of animations) {
    const s = a.resolvedStart ?? (typeof a.position === "number" ? a.position : 0);
    const d = a.duration ?? 0;
    lo = Math.min(lo, s);
    hi = Math.max(hi, s + d);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { start: lo, duration: hi - lo };
}

export function TimingSection({
  element,
  animations = [],
  onSetAttribute,
}: {
  element: DomEditSelection;
  animations?: GsapAnimation[];
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const explicitStart = Number.parseFloat(element.dataAttributes.start ?? "0") || 0;
  const explicitDuration =
    Number.parseFloat(
      element.dataAttributes.duration ?? element.dataAttributes["hf-authored-duration"] ?? "0",
    ) || 0;

  // No authored clip timing → infer the range from the element's animations.
  const derived = explicitDuration > 0 ? null : deriveTimingFromAnimations(animations);
  const start = derived ? derived.start : explicitStart;
  const duration = derived ? derived.duration : explicitDuration;
  const end = start + duration;

  const commitStart = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null) return;
    void onSetAttribute("start", parsed.toFixed(2));
  };

  const commitDuration = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= 0) return;
    void onSetAttribute("duration", parsed.toFixed(2));
  };

  const commitEnd = (nextValue: string) => {
    const parsed = parseTimingValue(nextValue);
    if (parsed == null || parsed <= start) return;
    void onSetAttribute("duration", (parsed - start).toFixed(2));
  };

  return (
    <Section title={t("Timing")} icon={<Clock size={15} />}>
      <div className={RESPONSIVE_GRID}>
        <MetricField label={t("Start")} value={formatTimingValue(start)} onCommit={commitStart} />
        <MetricField label={t("End")} value={formatTimingValue(end)} onCommit={commitEnd} />
      </div>
      <div className="mt-3">
        <MetricField
          label={t("Duration")}
          value={formatTimingValue(duration)}
          onCommit={commitDuration}
        />
      </div>
      {derived && (
        <p className="mt-2 text-[10px] leading-snug text-neutral-500">
          {t("Inferred from this element’s animation. Edit to pin an explicit clip range.")}</p>
      )}
    </Section>
  );
}
