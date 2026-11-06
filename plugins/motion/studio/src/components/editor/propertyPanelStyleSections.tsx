import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";
import { Eye, Layers, Palette, Settings, Square, Zap } from "../../icons/SystemIcons";
import { buildDefaultGradientModel, serializeGradient } from "./gradientValue";
import { isTextEditableSelection, type DomEditSelection } from "./domEditing";
import {
  buildBoxShadowPresetValue,
  buildClipPathValue,
  buildInsetClipPathSides,
  buildInsetClipPathValue,
  buildStrokeStyleUpdates,
  buildStrokeWidthStyleUpdates,
  extractBackgroundImageUrl,
  formatNumericValue,
  formatPxMetricValue,
  getCssFilterFunctionPx,
  getClipPathInsetPx,
  inferBoxShadowPreset,
  inferClipPathPreset,
  LABEL,
  normalizePanelPxValue,
  parseInsetClipPathSides,
  parseNumericValue,
  parsePxMetricValue,
  RESPONSIVE_GRID,
  setCssFilterFunctionPx,
  type ClipPathInsetSides,
  type BoxShadowPreset,
} from "./propertyPanelHelpers";
import {
  DetailField,
  MetricField,
  Section,
  SegmentedControl,
  SelectField,
  SliderControl,
} from "./propertyPanelPrimitives";
import { ColorField } from "./propertyPanelColor";
import { GradientField, ImageFillField } from "./propertyPanelFill";
import { BorderRadiusEditor } from "./BorderRadiusEditor";

// fallow-ignore-next-line complexity
export function StyleSections({
  projectId,
  element,
  styles,
  assets,
  onSetStyle,
  onSetHtmlAttribute,
  onImportAssets,
  gsapBorderRadius,
  hideFlex = false,
}: {
  projectId: string;
  element: DomEditSelection;
  styles: Record<string, string>;
  assets: string[];
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onImportAssets?: (files: FileList) => Promise<string[]>;
  gsapBorderRadius?: { tl: number; tr: number; br: number; bl: number } | null;
  // When true, the Flex `Section` is suppressed. The flat inspector renders
  // its own Flex controls inside the Layout group (LayoutFlexBlock), so the
  // flat path passes this to avoid a double-render. Non-flat callers omit it.
  hideFlex?: boolean;
}) {
  const { t } = useI18n();
  const styleEditingDisabled = !element.capabilities.canEditStyles;
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";
  const radiusValue = parseNumericValue(styles["border-radius"]) ?? 0;
  const radiusTL =
    gsapBorderRadius?.tl ?? parseNumericValue(styles["border-top-left-radius"]) ?? radiusValue;
  const radiusTR =
    gsapBorderRadius?.tr ?? parseNumericValue(styles["border-top-right-radius"]) ?? radiusValue;
  const radiusBR =
    gsapBorderRadius?.br ?? parseNumericValue(styles["border-bottom-right-radius"]) ?? radiusValue;
  const radiusBL =
    gsapBorderRadius?.bl ?? parseNumericValue(styles["border-bottom-left-radius"]) ?? radiusValue;
  const opacityValue = Math.round((parseNumericValue(styles.opacity) ?? 1) * 100);
  const borderWidthValue =
    parsePxMetricValue(styles["border-width"] ?? "") ??
    parsePxMetricValue(styles["border-top-width"] ?? "") ??
    0;
  const hasVisualBackground =
    (styles.background != null && styles.background !== "none" && styles.background !== "") ||
    (styles["background-color"] != null &&
      styles["background-color"] !== "transparent" &&
      styles["background-color"] !== "rgba(0, 0, 0, 0)" &&
      styles["background-color"] !== "") ||
    (styles["background-image"] != null &&
      styles["background-image"] !== "none" &&
      styles["background-image"] !== "") ||
    borderWidthValue > 0;
  const borderStyleValue = styles["border-style"] || styles["border-top-style"] || "none";
  const borderColorValue =
    styles["border-color"] || styles["border-top-color"] || "rgba(255, 255, 255, 0.18)";
  const boxShadowPreset = inferBoxShadowPreset(styles["box-shadow"]);
  const filterBlurValue = getCssFilterFunctionPx(styles.filter, "blur");
  const backdropBlurValue = getCssFilterFunctionPx(styles["backdrop-filter"], "blur");
  const clipPathValue = styles["clip-path"] || "none";
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
  const backgroundImage = styles["background-image"] ?? "none";
  const hasTextControls = isTextEditableSelection(element);

  let fillMode = "Solid";
  if (element.tagName === "img") {
    fillMode = "Image";
  } else if (backgroundImage && backgroundImage !== "none") {
    fillMode = backgroundImage.includes("gradient") ? "Gradient" : "Image";
  }
  const [preferredFillMode, setPreferredFillMode] = useState(fillMode);
  const imageUrl = extractBackgroundImageUrl(backgroundImage);
  // Remember the last authored gradient so an exploratory Solid↔Gradient
  // toggle restores it instead of destroying it with the default gradient.
  const lastGradientRef = useRef<string | null>(
    backgroundImage.includes("gradient") ? backgroundImage : null,
  );

  // The remembered gradient is per-element: reset on selection change so
  // element A's gradient can't leak onto element B via the fill-mode toggle.
  // (The effect below re-stores it when the new element has its own gradient.)
  useEffect(() => {
    lastGradientRef.current = null;
  }, [element.id, element.selector]);

  useEffect(() => {
    setPreferredFillMode(fillMode);
    if (backgroundImage.includes("gradient")) {
      lastGradientRef.current = backgroundImage;
    }
  }, [fillMode, element.id, element.selector, backgroundImage]);

  const handleFillModeChange = (nextMode: string) => {
    setPreferredFillMode(nextMode);
    if (nextMode === "Solid") {
      if (backgroundImage.includes("gradient")) {
        lastGradientRef.current = backgroundImage;
      }
      onSetStyle("background-image", "none");
      return;
    }
    if (nextMode === "Gradient" && !backgroundImage.includes("gradient")) {
      onSetStyle(
        "background-image",
        lastGradientRef.current ??
          serializeGradient(buildDefaultGradientModel(styles["background-color"])),
      );
    }
  };

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
    onSetStyle("clip-path", buildInsetClipPathSides(sides, clipInsetSides.radius));
  };

  return (
    <>
      {isFlex && !hideFlex && (
        <Section title={t("Flex")} icon={<Layers size={15} />} defaultCollapsed>
          <div className="space-y-4">
            <SegmentedControl
              trackName="Flex direction"
              disabled={styleEditingDisabled}
              value={styles["flex-direction"] || "row"}
              onChange={(next) => onSetStyle("flex-direction", next)}
              options={[
                { label: "→ Row", value: "row" },
                { label: "↓ Column", value: "column" },
              ]}
            />
            <div className={RESPONSIVE_GRID}>
              <SelectField
                label={t("Justify")}
                value={styles["justify-content"] || "flex-start"}
                disabled={styleEditingDisabled}
                onChange={(next) => onSetStyle("justify-content", next)}
                options={[
                  "flex-start",
                  "center",
                  "space-between",
                  "space-around",
                  "space-evenly",
                  "flex-end",
                ]}
              />
              <SelectField
                label={t("Align")}
                value={styles["align-items"] || "stretch"}
                disabled={styleEditingDisabled}
                onChange={(next) => onSetStyle("align-items", next)}
                options={["stretch", "flex-start", "center", "flex-end", "baseline"]}
              />
            </div>
            <DetailField
              label={t("Gap")}
              value={styles.gap ?? "0px"}
              disabled={styleEditingDisabled}
              onCommit={(next) => onSetStyle("gap", next.endsWith("px") ? next : `${next}px`)}
            />
          </div>
        </Section>
      )}

      {hasVisualBackground && (
        <Section title={t("Radius")} icon={<Settings size={15} />} defaultCollapsed>
          <BorderRadiusEditor
            tl={radiusTL}
            tr={radiusTR}
            br={radiusBR}
            bl={radiusBL}
            disabled={styleEditingDisabled}
            onCommit={(corner, value) => {
              const px = `${formatNumericValue(value)}px`;
              if (corner === "all") {
                onSetStyle("border-radius", px);
              } else {
                const prop = {
                  tl: "border-top-left-radius",
                  tr: "border-top-right-radius",
                  br: "border-bottom-right-radius",
                  bl: "border-bottom-left-radius",
                }[corner];
                onSetStyle(prop, px);
              }
            }}
          />
        </Section>
      )}

      <Section title={t("Stroke")} icon={<Square size={15} />} defaultCollapsed>
        <div className="space-y-4">
          <div className={RESPONSIVE_GRID}>
            <MetricField
              label={t("Width")}
              value={formatPxMetricValue(borderWidthValue)}
              disabled={styleEditingDisabled}
              liveCommit
              onCommit={async (next) => {
                const normalized = normalizePanelPxValue(next, {
                  min: 0,
                  max: 200,
                  fallback: borderWidthValue,
                });
                if (!normalized) return;
                for (const [property, value] of buildStrokeWidthStyleUpdates(
                  normalized,
                  borderStyleValue,
                )) {
                  await onSetStyle(property, value);
                }
              }}
            />
            <SelectField
              label={t("Style")}
              value={borderStyleValue}
              disabled={styleEditingDisabled}
              onChange={async (next) => {
                for (const [property, value] of buildStrokeStyleUpdates(
                  next,
                  formatPxMetricValue(borderWidthValue),
                )) {
                  await onSetStyle(property, value);
                }
              }}
              options={[
                "none",
                "solid",
                "dashed",
                "dotted",
                "double",
                "hidden",
                "groove",
                "ridge",
                "inset",
                "outset",
              ]}
            />
          </div>
          <ColorField
            label={t("Stroke color")}
            value={borderColorValue}
            disabled={styleEditingDisabled}
            onCommit={(next) => onSetStyle("border-color", next)}
          />
        </div>
      </Section>

      <Section title={t("Effects")} icon={<Zap size={15} />} defaultCollapsed>
        <div className="space-y-4">
          <SelectField
            label={t("Shadow")}
            value={boxShadowPreset}
            disabled={styleEditingDisabled}
            onChange={(next) => {
              if (next === "custom") return;
              onSetStyle(
                "box-shadow",
                buildBoxShadowPresetValue(next as BoxShadowPreset, styles["box-shadow"]),
              );
            }}
            options={["custom", "none", "soft", "lift", "glow"]}
          />
          <div className={RESPONSIVE_GRID}>
            <div className="grid min-w-0 gap-1.5">
              <span className={LABEL}>{t("Layer blur")}</span>
              <SliderControl
                trackName="Layer blur"
                value={filterBlurValue}
                min={0}
                max={Math.max(40, Math.ceil(filterBlurValue))}
                step={1}
                disabled={styleEditingDisabled}
                displayValue={`${formatNumericValue(filterBlurValue)}px`}
                formatDisplayValue={(next) => `${formatNumericValue(next)}px`}
                onCommit={(next) =>
                  onSetStyle("filter", setCssFilterFunctionPx(styles.filter, "blur", next))
                }
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <span className={LABEL}>{t("Backdrop")}</span>
              <SliderControl
                trackName="Backdrop blur"
                value={backdropBlurValue}
                min={0}
                max={Math.max(60, Math.ceil(backdropBlurValue))}
                step={1}
                disabled={styleEditingDisabled}
                displayValue={`${formatNumericValue(backdropBlurValue)}px`}
                formatDisplayValue={(next) => `${formatNumericValue(next)}px`}
                onCommit={(next) =>
                  onSetStyle(
                    "backdrop-filter",
                    setCssFilterFunctionPx(styles["backdrop-filter"], "blur", next),
                  )
                }
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("Clip")} icon={<Layers size={15} />} defaultCollapsed>
        <div className="space-y-4">
          <div className={RESPONSIVE_GRID}>
            <SelectField
              label={t("Overflow")}
              value={styles.overflow || "visible"}
              disabled={styleEditingDisabled}
              onChange={(next) => onSetStyle("overflow", next)}
              options={["visible", "hidden", "clip", "auto", "scroll"]}
            />
            <SelectField
              label={t("Mask")}
              value={clipPathPreset}
              disabled={styleEditingDisabled}
              onChange={(next) => {
                if (next === "custom") return;
                onSetStyle(
                  "clip-path",
                  buildClipPathValue(
                    next as "none" | "inset" | "circle",
                    radiusValue,
                    clipPathValue,
                  ),
                );
              }}
              options={["custom", "none", "inset", "circle"]}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <span className={LABEL}>{t("Mask inset")}</span>
            <SliderControl
              trackName="Mask inset"
              value={clipInsetValue}
              min={0}
              max={Math.max(120, Math.ceil(clipInsetValue))}
              step={1}
              disabled={styleEditingDisabled}
              displayValue={`${formatNumericValue(clipInsetValue)}px`}
              formatDisplayValue={(next) => `${formatNumericValue(next)}px`}
              onCommit={(next) =>
                onSetStyle("clip-path", buildInsetClipPathValue(next, radiusValue))
              }
            />
          </div>
          {showClipInsetSides && (
            <div className="grid gap-2">
              <div className="grid grid-cols-4 gap-2">
                <MetricField
                  label="T"
                  value={formatPxMetricValue(clipInsetSides.top)}
                  disabled={styleEditingDisabled}
                  onCommit={(next) => commitClipInsetSide("top", next)}
                />
                <MetricField
                  label="R"
                  value={formatPxMetricValue(clipInsetSides.right)}
                  disabled={styleEditingDisabled}
                  onCommit={(next) => commitClipInsetSide("right", next)}
                />
                <MetricField
                  label="B"
                  value={formatPxMetricValue(clipInsetSides.bottom)}
                  disabled={styleEditingDisabled}
                  onCommit={(next) => commitClipInsetSide("bottom", next)}
                />
                <MetricField
                  label="L"
                  value={formatPxMetricValue(clipInsetSides.left)}
                  disabled={styleEditingDisabled}
                  onCommit={(next) => commitClipInsetSide("left", next)}
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title={t("Transparency")} icon={<Eye size={15} />} defaultCollapsed>
        <div className="space-y-4">
          <SliderControl
            trackName="Opacity"
            value={opacityValue}
            min={0}
            max={100}
            step={1}
            disabled={styleEditingDisabled}
            displayValue={`${opacityValue}%`}
            formatDisplayValue={(next) => `${Math.round(next)}%`}
            onCommit={(next) => onSetStyle("opacity", formatNumericValue(next / 100))}
          />
          <SelectField
            label={t("Mode")}
            value={styles["mix-blend-mode"] || "normal"}
            disabled={styleEditingDisabled}
            onChange={(next) => onSetStyle("mix-blend-mode", next)}
            options={["normal", "multiply", "screen", "overlay", "darken", "lighten"]}
          />
        </div>
      </Section>

      <Section title={t("Fill")} icon={<Palette size={15} />}>
        <div className="space-y-4">
          <SegmentedControl
            trackName="Fill type"
            disabled={styleEditingDisabled}
            value={preferredFillMode}
            onChange={handleFillModeChange}
            options={[
              { label: "Solid", value: "Solid" },
              { label: "Gradient", value: "Gradient" },
              { label: "Image", value: "Image" },
            ]}
          />
          {preferredFillMode === "Solid" ? (
            <ColorField
              label={t("Fill color")}
              value={styles["background-color"] ?? "transparent"}
              disabled={styleEditingDisabled}
              onCommit={(next) => onSetStyle("background-color", next)}
            />
          ) : preferredFillMode === "Gradient" ? (
            <GradientField
              value={
                backgroundImage !== "none"
                  ? backgroundImage
                  : serializeGradient(buildDefaultGradientModel(styles["background-color"]))
              }
              fallbackColor={styles["background-color"]}
              disabled={styleEditingDisabled}
              onCommit={(next) => onSetStyle("background-image", next)}
            />
          ) : (
            <ImageFillField
              projectId={projectId}
              element={element}
              onSetHtmlAttribute={onSetHtmlAttribute}
              value={imageUrl}
              assets={assets}
              disabled={styleEditingDisabled}
              onCommit={(next) => onSetStyle("background-image", next)}
              onImportAssets={onImportAssets}
            />
          )}
          {!hasTextControls && (
            <ColorField
              label={t("Text color")}
              value={styles.color ?? "rgb(0, 0, 0)"}
              disabled={styleEditingDisabled}
              onCommit={(next) => onSetStyle("color", next)}
            />
          )}
        </div>
      </Section>
    </>
  );
}
