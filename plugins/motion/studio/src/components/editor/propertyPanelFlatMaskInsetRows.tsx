import { useI18n } from "../../i18n/I18n";
import {
  buildInsetClipPathSides,
  buildInsetClipPathValue,
  formatNumericValue,
  formatPxMetricValue,
  getClipPathInsetPx,
  inferClipPathPreset,
  parseInsetClipPathSides,
  parsePxMetricValue,
  type ClipPathInsetSides,
} from "./propertyPanelHelpers";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import { MetricField } from "./propertyPanelPrimitives";

/* ------------------------------------------------------------------ */
/*  Flat Mask inset — uniform slider + per-side fields                 */
/*  (split out of propertyPanelFlatStyleSections.tsx to stay under the */
/*  600-line file-size gate)                                           */
/* ------------------------------------------------------------------ */

export function FlatMaskInsetRows({
  clipPathValue,
  radiusValue,
  disabled,
  onSetStyle,
}: {
  clipPathValue: string;
  radiusValue: number;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const clipPathPreset = inferClipPathPreset(clipPathValue);
  const parsedClipInsets = parseInsetClipPathSides(clipPathValue);
  const clipInsetValue = getClipPathInsetPx(clipPathValue);
  const clipInsetSides = parsedClipInsets ?? {
    top: clipInsetValue,
    right: clipInsetValue,
    bottom: clipInsetValue,
    left: clipInsetValue,
    radius: radiusValue,
  };
  const showClipInsetSides = clipPathPreset === "inset" || parsedClipInsets != null;

  const commitClipInsetSide = (side: keyof ClipPathInsetSides, nextValue: string) => {
    const next = parsePxMetricValue(nextValue);
    if (next == null) return;
    const sides: ClipPathInsetSides = {
      top: clipInsetSides.top,
      right: clipInsetSides.right,
      bottom: clipInsetSides.bottom,
      left: clipInsetSides.left,
    };
    sides[side] = next;
    void onSetStyle("clip-path", buildInsetClipPathSides(sides, clipInsetSides.radius));
  };

  return (
    <>
      <FlatSlider
        label={t("Mask inset")}
        value={clipInsetValue}
        min={0}
        max={Math.max(120, Math.ceil(clipInsetValue))}
        step={1}
        tier={clipInsetValue > 0 ? "explicitCustom" : "default"}
        displayValue={`${formatNumericValue(clipInsetValue)}px`}
        disabled={disabled}
        onCommit={(next) =>
          void onSetStyle("clip-path", buildInsetClipPathValue(next, radiusValue))
        }
      />
      {showClipInsetSides && (
        <div className="grid grid-cols-4 gap-2">
          <MetricField
            label="T"
            value={formatPxMetricValue(clipInsetSides.top)}
            disabled={disabled}
            onCommit={(next) => commitClipInsetSide("top", next)}
          />
          <MetricField
            label="R"
            value={formatPxMetricValue(clipInsetSides.right)}
            disabled={disabled}
            onCommit={(next) => commitClipInsetSide("right", next)}
          />
          <MetricField
            label="B"
            value={formatPxMetricValue(clipInsetSides.bottom)}
            disabled={disabled}
            onCommit={(next) => commitClipInsetSide("bottom", next)}
          />
          <MetricField
            label="L"
            value={formatPxMetricValue(clipInsetSides.left)}
            disabled={disabled}
            onCommit={(next) => commitClipInsetSide("left", next)}
          />
        </div>
      )}
    </>
  );
}
