import { useI18n } from "../../i18n/I18n";
import { memo, useCallback } from "react";
import type { ArcPathConfig, ArcPathSegment } from "@hyperframes/core/gsap-parser";
import { SliderControl } from "./propertyPanelPrimitives";
import { LABEL } from "./propertyPanelHelpers";
import { P } from "./panelTokens";

interface ArcPathControlsProps {
  arcPath: ArcPathConfig;
  segmentCount: number;
  onToggle: (enabled: boolean) => void;
  onUpdateSegment: (index: number, update: Partial<ArcPathSegment>) => void;
  onToggleAutoRotate: (autoRotate: boolean) => void;
  disabled?: boolean;
}

export const ArcPathControls = memo(function ArcPathControls({
  arcPath,
  segmentCount,
  onToggle,
  onUpdateSegment,
  onToggleAutoRotate,
  disabled,
}: ArcPathControlsProps) {
  const { t } = useI18n();
  const handleToggle = useCallback(() => {
    onToggle(!arcPath.enabled);
  }, [arcPath.enabled, onToggle]);

  const handleAutoRotate = useCallback(() => {
    onToggleAutoRotate(!arcPath.autoRotate);
  }, [arcPath.autoRotate, onToggleAutoRotate]);

  if (segmentCount < 1) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2">
        <p className="text-[11px] text-neutral-500">
          {t("Add at least 2 position keyframes to enable arc motion.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={LABEL}>{t("Arc Motion")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(arcPath.enabled)}
          aria-label={t("Arc motion")}
          onClick={handleToggle}
          disabled={disabled}
          className="relative rounded-full transition-colors duration-200"
          style={{ width: 28, height: 16, background: arcPath.enabled ? P.accent : P.borderInput }}
          title={arcPath.enabled ? t("Disable arc motion") : t("Enable arc motion")}
        >
          <span
            className="absolute top-[2px] left-0 rounded-full transition-transform duration-200"
            style={{
              width: 12,
              height: 12,
              background: arcPath.enabled ? P.white : P.textMuted,
              transform: arcPath.enabled ? "translateX(14px)" : "translateX(2px)",
            }}
          />
        </button>
      </div>

      {arcPath.enabled && (
        <>
          <div className="flex items-center justify-between">
            <span className={LABEL}>{t("Auto-Rotate")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(arcPath.autoRotate)}
              aria-label={t("Auto-rotate along path")}
              onClick={handleAutoRotate}
              disabled={disabled}
              className="relative rounded-full transition-colors duration-200"
              style={{
                width: 28,
                height: 16,
                background: arcPath.autoRotate ? P.accent : "#27272A",
              }}
              title={
                arcPath.autoRotate
                  ? t("Disable auto-rotate along path")
                  : t("Rotate element to follow path tangent")
              }
            >
              <span
                className="absolute top-[2px] left-0 rounded-full transition-transform duration-200"
                style={{
                  width: 12,
                  height: 12,
                  background: arcPath.autoRotate ? P.white : P.textMuted,
                  transform: arcPath.autoRotate ? "translateX(14px)" : "translateX(2px)",
                }}
              />
            </button>
          </div>

          {arcPath.segments.map((seg, i) => (
            <div key={i} className="grid min-w-0 gap-1.5">
              <div className="flex items-center justify-between">
                <span className={LABEL}>
                  {segmentCount === 1 ? t("Curviness") : t("Segment {value0}", { value0: i + 1 })}
                </span>
                {seg.cp1 && seg.cp2 && (
                  <button
                    type="button"
                    onClick={() => onUpdateSegment(i, { cp1: undefined, cp2: undefined })}
                    className="text-[9px] font-medium text-neutral-500 transition-colors hover:text-neutral-300"
                    title={t("Reset to auto-generated control points")}
                  >
                    {t("Reset")}</button>
                )}
              </div>
              <SliderControl
                trackName={segmentCount === 1 ? "Curviness" : `Segment ${i + 1} curviness`}
                value={seg.curviness}
                min={0}
                max={3}
                step={0.1}
                disabled={disabled}
                displayValue={seg.curviness.toFixed(1)}
                formatDisplayValue={(v) => v.toFixed(1)}
                onCommit={(v) => onUpdateSegment(i, { curviness: v })}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
});
