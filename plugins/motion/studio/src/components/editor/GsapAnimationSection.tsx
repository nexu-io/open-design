import { useI18n } from "../../i18n/I18n";
import { memo } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { Film } from "../../icons/SystemIcons";
import { Section } from "./propertyPanelPrimitives";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import { GsapAnimationList } from "./GsapAnimationList";

interface GsapAnimationSectionProps extends GsapAnimationEditCallbacks {
  elementId: string;
  animations: GsapAnimation[];
  multipleTimelines?: boolean;
  unsupportedTimelinePattern?: boolean;
  onAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
}

export const GsapAnimationSection = memo(function GsapAnimationSection({
  elementId,
  animations,
  multipleTimelines,
  unsupportedTimelinePattern,
  onAddAnimation,
  ...callbacks
}: GsapAnimationSectionProps) {
  const { t } = useI18n();
  return (
    <Section title={t("Animation")} icon={<Film size={15} />}>
      {multipleTimelines && (
        <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-warning-ink">
          {t("This file has multiple GSAP timelines. Animation editing is disabled to prevent data loss. Consolidate into a single timeline to enable editing.")}</p>
      )}
      {unsupportedTimelinePattern && (
        <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-warning-ink">
          {t("This timeline uses a computed key (window.__timelines[variable]) the editor can't resolve statically. Use a string-literal key (window.__timelines[\"id\"]) or a variable declaration (const tl = gsap.timeline()) to enable editing.")}</p>
      )}
      {multipleTimelines || unsupportedTimelinePattern ? null : (
        <GsapAnimationList
          {...callbacks}
          elementId={elementId}
          animations={animations}
          onAddAnimation={onAddAnimation}
          variant="classic"
        />
      )}
    </Section>
  );
});
