import { useI18n } from "../../i18n/I18n";
// fallow-ignore-file code-duplication
import { useEffect, useState } from "react";
import { isTextEditableSelection, type DomEditSelection } from "./domEditing";
import { buildDefaultGradientModel, serializeGradient } from "./gradientValue";
import { BorderRadiusEditor } from "./BorderRadiusEditor";
import { STROKE_STYLE_OPTIONS } from "./propertyPanelFlatStyleHelpers";
import {
  buildBoxShadowPresetValue,
  buildClipPathValue,
  buildStrokeStyleUpdates,
  buildStrokeWidthStyleUpdates,
  extractBackgroundImageUrl,
  formatNumericValue,
  formatPxMetricValue,
  getCssFilterFunctionPx,
  inferBoxShadowPreset,
  inferClipPathPreset,
  normalizePanelPxValue,
  parseNumericValue,
  parsePxMetricValue,
  setCssFilterFunctionPx,
  type BoxShadowPreset,
} from "./propertyPanelHelpers";
import {
  FlatRow,
  FlatSegmentedRow,
  FlatSelectRow,
  FlatSlider,
} from "./propertyPanelFlatPrimitives";
import { FlatMaskInsetRows } from "./propertyPanelFlatMaskInsetRows";
import { resolveValueTier } from "./propertyPanelValueTier";
import { ColorField } from "./propertyPanelColor";
import { GradientField, ImageFillField } from "./propertyPanelFill";

/* ------------------------------------------------------------------ */
/*  Flat Fill sub-block (design_handoff_studio_inspector, #11a)        */
/* ------------------------------------------------------------------ */

// fallow-ignore-next-line complexity
function FlatFillFields({
  projectId,
  element,
  styles,
  assets,
  onSetStyle,
  onSetHtmlAttribute,
  onPreviewStyle,
  onImportAssets,
}: {
  projectId: string;
  element: DomEditSelection;
  styles: Record<string, string>;
  assets: string[];
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onPreviewStyle?: (prop: string, value: string) => void;
  onImportAssets?: (files: FileList) => Promise<string[]>;
}) {
  const { t } = useI18n();
  const styleEditingDisabled = !element.capabilities.canEditStyles;
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

  useEffect(() => {
    setPreferredFillMode(fillMode);
  }, [fillMode, element.id, element.selector, backgroundImage]);

  const handleFillModeChange = (nextMode: string) => {
    setPreferredFillMode(nextMode);
    if (nextMode === "Solid") {
      onSetStyle("background-image", "none");
      return;
    }
    if (nextMode === "Gradient" && !backgroundImage.includes("gradient")) {
      onSetStyle(
        "background-image",
        serializeGradient(buildDefaultGradientModel(styles["background-color"])),
      );
    }
  };

  return (
    <>
      <FlatSegmentedRow
        label={t("Fill")}
        options={[
          { key: "Solid", node: "Solid", label: "Solid", active: preferredFillMode === "Solid" },
          {
            key: "Gradient",
            node: "Gradient",
            label: "Gradient",
            active: preferredFillMode === "Gradient",
          },
          { key: "Image", node: "Image", label: "Image", active: preferredFillMode === "Image" },
        ]}
        disabled={styleEditingDisabled}
        onChange={handleFillModeChange}
      />
      {preferredFillMode === "Solid" ? (
        <ColorField
          flat
          label={t("Color")}
          value={styles["background-color"] ?? "transparent"}
          disabled={styleEditingDisabled}
          onPreview={(next) => onPreviewStyle?.("background-color", next)}
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
          flat
          label={t("Text color")}
          value={styles.color ?? "rgb(0, 0, 0)"}
          disabled={styleEditingDisabled}
          onCommit={(next) => onSetStyle("color", next)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Flat Stroke row — width (numeric), style (select), color           */
/* ------------------------------------------------------------------ */

function FlatStrokeRow({
  styles,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const borderWidthValue =
    parsePxMetricValue(styles["border-width"] ?? "") ??
    parsePxMetricValue(styles["border-top-width"] ?? "") ??
    0;
  const borderStyleValue = styles["border-style"] || styles["border-top-style"] || "none";
  const borderColorValue =
    styles["border-color"] || styles["border-top-color"] || "rgba(255, 255, 255, 0.18)";
  const widthDisplay = formatPxMetricValue(borderWidthValue);

  return (
    <>
      <FlatRow
        label={t("Stroke width")}
        value={widthDisplay}
        tier={resolveValueTier(styles["border-width"], "0px")}
        disabled={disabled}
        onCommit={async (next) => {
          const normalizedWidth = normalizePanelPxValue(next, {
            min: 0,
            max: 200,
            fallback: borderWidthValue,
          });
          if (!normalizedWidth) return;
          // buildStrokeWidthStyleUpdates already covers "a width typed in
          // from 0 needs a style to actually render a visible border" —
          // it only defaults to solid when the current style is none/hidden,
          // never clobbering an already-chosen style (dashed, dotted, …).
          for (const [property, value] of buildStrokeWidthStyleUpdates(
            normalizedWidth,
            borderStyleValue,
          )) {
            await onSetStyle(property, value);
          }
        }}
      />
      <FlatSelectRow
        label={t("Stroke style")}
        value={borderStyleValue}
        // Valid border-style keywords — the ONLY way to set this, since a
        // free-text field here would require typing an exact CSS keyword
        // (e.g. "dashed") with no indication of which ones are valid.
        options={STROKE_STYLE_OPTIONS}
        tier={resolveValueTier(styles["border-style"], "none")}
        disabled={disabled}
        onChange={async (next) => {
          for (const [property, value] of buildStrokeStyleUpdates(
            next,
            formatPxMetricValue(borderWidthValue),
          )) {
            await onSetStyle(property, value);
          }
        }}
      />
      <ColorField
        flat
        label={t("Stroke color")}
        value={borderColorValue}
        disabled={disabled}
        onCommit={(next) => onSetStyle("border-color", next)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Flat Radius row — always delegates to BorderRadiusEditor            */
/* ------------------------------------------------------------------ */

// fallow-ignore-next-line complexity
function FlatRadiusRow({
  styles,
  gsapBorderRadius,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  gsapBorderRadius?: { tl: number; tr: number; br: number; bl: number } | null;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const radiusValue = parseNumericValue(styles["border-radius"]) ?? 0;
  const radiusTL =
    gsapBorderRadius?.tl ?? parseNumericValue(styles["border-top-left-radius"]) ?? radiusValue;
  const radiusTR =
    gsapBorderRadius?.tr ?? parseNumericValue(styles["border-top-right-radius"]) ?? radiusValue;
  const radiusBR =
    gsapBorderRadius?.br ?? parseNumericValue(styles["border-bottom-right-radius"]) ?? radiusValue;
  const radiusBL =
    gsapBorderRadius?.bl ?? parseNumericValue(styles["border-bottom-left-radius"]) ?? radiusValue;

  const commit = (corner: "all" | "tl" | "tr" | "br" | "bl", value: number) => {
    const px = `${formatNumericValue(value)}px`;
    if (corner === "all") {
      void onSetStyle("border-radius", px);
      return;
    }
    const prop = {
      tl: "border-top-left-radius",
      tr: "border-top-right-radius",
      br: "border-bottom-right-radius",
      bl: "border-bottom-left-radius",
    }[corner];
    void onSetStyle(prop, px);
  };

  return (
    <BorderRadiusEditor
      tl={radiusTL}
      tr={radiusTR}
      br={radiusBR}
      bl={radiusBL}
      disabled={disabled}
      onCommit={commit}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Flat Shadow + Blend rows                                           */
/* ------------------------------------------------------------------ */

function FlatShadowBlendRows({
  styles,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const boxShadowPreset = inferBoxShadowPreset(styles["box-shadow"]);
  const blendValue = styles["mix-blend-mode"] || "normal";

  return (
    <>
      <FlatSelectRow
        label={t("Shadow")}
        value={boxShadowPreset}
        options={["none", "soft", "lift", "glow", "custom"]}
        tier={resolveValueTier(boxShadowPreset === "none" ? undefined : boxShadowPreset, "none")}
        disabled={disabled}
        onChange={(next) => {
          if (next === "custom") return;
          void onSetStyle(
            "box-shadow",
            buildBoxShadowPresetValue(next as BoxShadowPreset, styles["box-shadow"]),
          );
        }}
        onReset={() => void onSetStyle("box-shadow", "none")}
      />
      <FlatSelectRow
        label={t("Blend")}
        value={blendValue}
        options={["normal", "multiply", "screen", "overlay", "darken", "lighten"]}
        tier={resolveValueTier(styles["mix-blend-mode"], "normal")}
        disabled={disabled}
        onChange={(next) => void onSetStyle("mix-blend-mode", next)}
        onReset={() => void onSetStyle("mix-blend-mode", "normal")}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Flat Layer blur + Backdrop sliders                                 */
/* ------------------------------------------------------------------ */

function FlatBlurSliders({
  styles,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const filterBlurValue = getCssFilterFunctionPx(styles.filter, "blur");
  const backdropBlurValue = getCssFilterFunctionPx(styles["backdrop-filter"], "blur");

  return (
    <>
      <FlatSlider
        label={t("Layer blur")}
        value={filterBlurValue}
        min={0}
        max={Math.max(40, Math.ceil(filterBlurValue))}
        tier={filterBlurValue > 0 ? "explicitCustom" : "default"}
        displayValue={`${formatNumericValue(filterBlurValue)}px`}
        disabled={disabled}
        onCommit={(next) =>
          void onSetStyle("filter", setCssFilterFunctionPx(styles.filter, "blur", next))
        }
      />
      <FlatSlider
        label={t("Backdrop")}
        value={backdropBlurValue}
        min={0}
        max={Math.max(60, Math.ceil(backdropBlurValue))}
        tier={backdropBlurValue > 0 ? "explicitCustom" : "default"}
        displayValue={`${formatNumericValue(backdropBlurValue)}px`}
        disabled={disabled}
        onCommit={(next) =>
          void onSetStyle(
            "backdrop-filter",
            setCssFilterFunctionPx(styles["backdrop-filter"], "blur", next),
          )
        }
      />
    </>
  );
}

// Flat Overflow + Mask rows (+ inset sides).
function FlatOverflowMaskRows({
  styles,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const radiusValue = parseNumericValue(styles["border-radius"]) ?? 0;
  const clipPathValue = styles["clip-path"] || "none";
  const clipPathPreset = inferClipPathPreset(clipPathValue);

  return (
    <>
      <FlatSelectRow
        label={t("Overflow")}
        value={styles.overflow || "visible"}
        options={["visible", "hidden", "clip", "auto", "scroll"]}
        tier={resolveValueTier(styles.overflow, "visible")}
        disabled={disabled}
        onChange={(next) => void onSetStyle("overflow", next)}
        onReset={() => void onSetStyle("overflow", "visible")}
      />
      <FlatSelectRow
        label={t("Mask")}
        value={clipPathPreset}
        // "custom" = authored clip-path; showing "none" invites destroying it.
        options={[...(clipPathPreset === "custom" ? ["custom"] : []), "none", "inset", "circle"]}
        tier={resolveValueTier(clipPathPreset === "none" ? undefined : clipPathPreset, "none")}
        disabled={disabled}
        onChange={(next) => {
          if (next === "custom") return;
          void onSetStyle(
            "clip-path",
            buildClipPathValue(next as "none" | "inset" | "circle", radiusValue, clipPathValue),
          );
        }}
        onReset={() => void onSetStyle("clip-path", "none")}
      />
      <FlatMaskInsetRows
        clipPathValue={clipPathValue}
        radiusValue={radiusValue}
        disabled={disabled}
        onSetStyle={onSetStyle}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Flat Opacity slider                                                */
/* ------------------------------------------------------------------ */

function FlatOpacitySlider({
  styles,
  disabled,
  onSetStyle,
}: {
  styles: Record<string, string>;
  disabled: boolean;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const opacityValue = Math.round((parseNumericValue(styles.opacity) ?? 1) * 100);

  return (
    <FlatSlider
      label={t("Opacity")}
      value={opacityValue}
      min={0}
      max={100}
      tier="explicitCustom"
      displayValue={`${opacityValue}%`}
      disabled={disabled}
      onCommit={(next) => void onSetStyle("opacity", formatNumericValue(next / 100))}
    />
  );
}

export function FlatStyleSection({
  projectId,
  element,
  styles,
  assets,
  onSetStyle,
  onSetHtmlAttribute,
  onPreviewStyle,
  onImportAssets,
  gsapBorderRadius,
}: {
  projectId: string;
  element: DomEditSelection;
  styles: Record<string, string>;
  assets: string[];
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onPreviewStyle?: (prop: string, value: string) => void;
  onImportAssets?: (files: FileList) => Promise<string[]>;
  gsapBorderRadius?: { tl: number; tr: number; br: number; bl: number } | null;
}) {
  const styleEditingDisabled = !element.capabilities.canEditStyles;
  return (
    <div className="space-y-1.5">
      <FlatFillFields
        projectId={projectId}
        element={element}
        styles={styles}
        assets={assets}
        onSetStyle={onSetStyle}
        onSetHtmlAttribute={onSetHtmlAttribute}
        onPreviewStyle={onPreviewStyle}
        onImportAssets={onImportAssets}
      />
      <FlatStrokeRow styles={styles} disabled={styleEditingDisabled} onSetStyle={onSetStyle} />
      <FlatRadiusRow
        styles={styles}
        gsapBorderRadius={gsapBorderRadius}
        disabled={styleEditingDisabled}
        onSetStyle={onSetStyle}
      />
      <FlatShadowBlendRows
        styles={styles}
        disabled={styleEditingDisabled}
        onSetStyle={onSetStyle}
      />
      <FlatBlurSliders styles={styles} disabled={styleEditingDisabled} onSetStyle={onSetStyle} />
      <FlatOverflowMaskRows
        styles={styles}
        disabled={styleEditingDisabled}
        onSetStyle={onSetStyle}
      />
      <FlatOpacitySlider styles={styles} disabled={styleEditingDisabled} onSetStyle={onSetStyle} />
    </div>
  );
}
