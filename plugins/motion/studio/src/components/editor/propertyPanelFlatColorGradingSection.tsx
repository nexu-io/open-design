import { useI18n } from "../../i18n/I18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HF_COLOR_GRADING_GRADE_PRESETS,
  normalizeHfColorGrading,
  serializeHfColorGrading,
  type HfColorGradingAdjustKey,
  type HfColorGradingDetailKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { Plus, Settings } from "../../icons/SystemIcons";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { LUT_EXT } from "../../utils/mediaTypes";
import { FLAT_PREVIEW_GRID, FlatSlider } from "./propertyPanelFlatPrimitives";
import type {
  ColorGradingControllerState,
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
  MediaMetadata,
} from "./useColorGradingController";
import { presetPreviewHandlers } from "./propertyPanelPresetPreview";
import { ColorCurves } from "./propertyPanelColorCurves";
import {
  COLOR_GRADING_ADJUST_SLIDERS,
  COLOR_GRADING_DETAIL_SLIDERS,
  colorGradingWithAdjust,
  colorGradingWithDetail,
  createColorGradingActions,
  GRAIN_TUNE_SLIDERS,
  normalizedColorGradingDefault,
  VIGNETTE_TUNE_SLIDERS,
  visibleColorGradingIntensity,
} from "./propertyPanelColorGradingControls";
import { PropertyPanelColorScopes } from "./propertyPanelColorScopes";
import { PropertyPanelColorSecondary } from "./propertyPanelColorSecondary";
import { ColorWheels } from "./propertyPanelColorWheels";

export { FlatColorGradingAccessory } from "./propertyPanelFlatColorGradingAccessory";

function formatAdjustValue(key: HfColorGradingAdjustKey, rawPercent: number): string {
  if (key === "exposure") {
    const stops = rawPercent / 100;
    return `${stops >= 0 ? "+" : ""}${stops.toFixed(2)}`;
  }
  return `${Math.round(rawPercent)}%`;
}

const detailByKey = (key: HfColorGradingDetailKey) => {
  const spec = COLOR_GRADING_DETAIL_SLIDERS.find((candidate) => candidate.key === key);
  if (!spec) throw new Error(`Unknown color grading detail key: ${key}`);
  return spec;
};

function resolveColorGrading(grading: Parameters<typeof normalizeHfColorGrading>[0]) {
  const resolved = normalizeHfColorGrading(grading);
  if (!resolved) throw new Error("Missing resolved color grading");
  return resolved;
}

function HdrBanner({ metadata }: { metadata: MediaMetadata | null }) {
  const { t } = useI18n();
  if (metadata?.color.dynamicRange !== "hdr") return null;
  const details = [
    metadata.color.codecName,
    metadata.color.profile,
    metadata.color.pixelFormat,
    metadata.color.colorPrimaries,
    metadata.color.colorTransfer,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      data-flat-grade-hdr-banner="true"
      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-4 text-warning-ink"
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="font-semibold">{metadata.color.label} {t("source")}</span>
        <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning-ink">
          {t("SDR preview")}</span>
      </div>
      <p className="text-text-2">
        {t("These controls use the current SDR shader preview path. Render may stay HDR-tagged, but this is not true HDR color grading yet.")}</p>
      {details && (
        <p data-flat-grade-hdr-detail="true" className="mt-0.5 truncate text-[9px] text-text-muted">
          {details}
        </p>
      )}
    </div>
  );
}

// fallow-ignore-next-line complexity
export function FlatColorGradingSection({
  grading,
  assets,
  onImportAssets,
  onCommitColorGrading,
  onPreviewColorGrading,
  applyScope,
  applyBusy,
  onSetApplyScope,
  onApplyToScope,
  onApplyScopeAvailable,
  mediaMetadata,
  presetPreviews,
  onRequestPresetPreviews,
  captureGradedFrame,
}: {
  grading: NormalizedHfColorGrading;
  assets: string[];
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  applyScope: "source-file" | "project";
  applyBusy: boolean;
  onSetApplyScope: (scope: "source-file" | "project") => void;
  onApplyToScope: () => void;
  onApplyScopeAvailable: boolean;
  mediaMetadata: MediaMetadata | null;
  presetPreviews: ColorGradingPresetPreviews;
  onRequestPresetPreviews: () => void;
  captureGradedFrame: ColorGradingControllerState["captureGradedFrame"];
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const lutInputRef = useRef<HTMLInputElement>(null);
  const [lutOpen, setLutOpen] = useState(false);
  const [detailSettingsOpen, setDetailSettingsOpen] = useState<"vignette" | "grain" | null>(null);
  const lutAssets = useMemo(
    () => assets.filter((asset) => LUT_EXT.test(asset)).sort((a, b) => a.localeCompare(b)),
    [assets],
  );
  const lut = grading.lut;
  const selectedLutName = lut?.src ? (lut.src.split("/").pop() ?? lut.src) : null;
  const resolvedGrading = useMemo(() => resolveColorGrading(grading), [grading]);
  const secondaryInputGrading = useMemo(
    () =>
      resolveColorGrading({
        intensity: 1,
        adjust: resolvedGrading.adjust,
        wheels: resolvedGrading.wheels,
        curves: resolvedGrading.curves,
        hueCurves: resolvedGrading.hueCurves,
        colorSpace: resolvedGrading.colorSpace,
      }),
    [
      resolvedGrading.adjust,
      resolvedGrading.colorSpace,
      resolvedGrading.curves,
      resolvedGrading.hueCurves,
      resolvedGrading.wheels,
    ],
  );
  const actions = createColorGradingActions(grading, onCommitColorGrading);
  const scopesRefreshKey = useMemo(() => serializeHfColorGrading(grading), [grading]);

  useEffect(() => {
    if (presetPreviews.status === "idle") onRequestPresetPreviews();
  }, [onRequestPresetPreviews, presetPreviews.status]);

  const resolvePreset = (presetId: string) => {
    const resolved = normalizeHfColorGrading({ preset: presetId, lut: grading.lut });
    return resolved
      ? {
          ...resolved,
          effects: grading.effects,
          palette: grading.palette,
        }
      : grading;
  };

  useEffect(() => () => onPreviewColorGrading(null), [onPreviewColorGrading]);

  const renderDetailSlider = (key: HfColorGradingDetailKey) => {
    const spec = detailByKey(key);
    const value = grading.details[key];
    const defaultValue = normalizedColorGradingDefault(spec);
    const isSet = Math.abs(value - defaultValue) > 1e-4;
    return (
      <FlatSlider
        key={key}
        label={spec.label}
        value={Math.round(value * spec.scale)}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        tier={isSet ? "explicitCustom" : "default"}
        displayValue={`${Math.round(value * spec.scale)}${spec.suffix}`}
        centerTick={key === "vignetteRoundness"}
        onCommit={(next) =>
          onCommitColorGrading(colorGradingWithDetail(grading, key, next / spec.scale))
        }
        onReset={() => onCommitColorGrading(colorGradingWithDetail(grading, key, defaultValue))}
      />
    );
  };

  return (
    <div className="space-y-1.5">
      <HdrBanner metadata={mediaMetadata} />
      <PropertyPanelColorScopes
        captureFrame={() => captureGradedFrame()}
        refreshKey={scopesRefreshKey}
      />
      <div data-flat-grade-presets="true" className="space-y-1.5">
        {presetPreviews.status === "unavailable" && (
          <button
            type="button"
            onClick={onRequestPresetPreviews}
            className="text-[10px] font-medium text-accent-ink hover:text-accent-ink/80"
          >
            {t("Retry look previews")}</button>
        )}
        <div data-flat-grade-preset-group="presets" className={FLAT_PREVIEW_GRID}>
          {HF_COLOR_GRADING_GRADE_PRESETS.map((preset) => {
            const label = preset.label;
            const selected = grading.preset === preset.id;
            const preview = presetPreviews.images[preset.id];
            return (
              <button
                key={preset.id}
                type="button"
                data-flat-grade-preset={preset.id}
                aria-pressed={selected}
                {...presetPreviewHandlers({
                  id: preset.id,
                  label,
                  resolve: () => resolvePreset(preset.id),
                  onPreview: onPreviewColorGrading,
                  onCommit: onCommitColorGrading,
                  onTrack: (name) => track("button", `Apply ${name}`),
                })}
                className={`min-w-0 overflow-hidden border text-left text-[10px] transition-colors ${
                  selected
                    ? "border-panel-accent bg-panel-accent/10 text-panel-text-0"
                    : "border-panel-hairline bg-panel-bg-soft text-panel-text-3 hover:border-panel-border-input hover:text-panel-text-1"
                }`}
              >
                <span
                  data-flat-grade-preview-frame={preset.id}
                  className="flex w-full items-center justify-center overflow-hidden bg-black/20"
                  style={{ aspectRatio: `${presetPreviews.width} / ${presetPreviews.height}` }}
                >
                  {preview ? (
                    <img
                      data-flat-grade-preview={preset.id}
                      src={preview}
                      alt=""
                      draggable={false}
                      className="block h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      data-flat-grade-preview-placeholder={presetPreviews.status}
                      className="h-full w-full bg-panel-bg-soft"
                    />
                  )}
                </span>
                <span className="block truncate px-2 py-1.5">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <FlatSlider
        label={t("Amount")}
        value={Math.round(grading.intensity * 100)}
        min={0}
        max={100}
        tier={grading.intensity === 1 ? "default" : "explicitCustom"}
        displayValue={`${Math.round(grading.intensity * 100)}%`}
        onCommit={actions.setIntensityPercent}
        onReset={() => actions.setIntensityPercent(100)}
      />

      <div className="space-y-0.5 border-t border-panel-hairline pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t("Primary")}</div>
        {COLOR_GRADING_ADJUST_SLIDERS.map((slider) => {
          const rawPercent = grading.adjust[slider.key] * slider.scale;
          const isSet = Math.abs(grading.adjust[slider.key]) > 1e-6;
          return (
            <div key={slider.key} data-flat-grade-adjust="true">
              <FlatSlider
                label={slider.label}
                value={rawPercent}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                tier={isSet ? "explicitCustom" : "default"}
                displayValue={formatAdjustValue(slider.key, rawPercent)}
                centerTick
                onCommit={(next) =>
                  onCommitColorGrading(
                    colorGradingWithAdjust(grading, slider.key, next / slider.scale),
                  )
                }
                onReset={() => onCommitColorGrading(colorGradingWithAdjust(grading, slider.key, 0))}
              />
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5 border-t border-panel-hairline pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t("Color wheels")}</div>
        <ColorWheels
          value={resolvedGrading.wheels}
          onPreview={(wheels) =>
            onPreviewColorGrading({
              ...grading,
              intensity: visibleColorGradingIntensity(grading),
              wheels,
            })
          }
          onCommit={(wheels) =>
            onCommitColorGrading({
              ...grading,
              intensity: visibleColorGradingIntensity(grading),
              wheels,
            })
          }
        />
      </div>

      <div className="space-y-1.5 border-t border-panel-hairline pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t("Curves")}</div>
        <ColorCurves
          value={{ curves: resolvedGrading.curves, hueCurves: resolvedGrading.hueCurves }}
          onPreview={({ curves, hueCurves }) =>
            onPreviewColorGrading({
              ...grading,
              intensity: visibleColorGradingIntensity(grading),
              curves,
              hueCurves,
            })
          }
          onCommit={({ curves, hueCurves }) =>
            onCommitColorGrading({
              ...grading,
              intensity: visibleColorGradingIntensity(grading),
              curves,
              hueCurves,
            })
          }
        />
      </div>

      <div className="space-y-1.5 border-t border-panel-hairline pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t("Secondary color")}</div>
        <PropertyPanelColorSecondary
          secondaries={resolvedGrading.secondaries}
          captureFrame={() => captureGradedFrame({ grading: secondaryInputGrading })}
          onCommit={(secondaries) =>
            onCommitColorGrading({
              ...grading,
              intensity: visibleColorGradingIntensity(grading),
              secondaries,
            })
          }
        />
      </div>

      <div className="border-t border-panel-hairline pt-1.5">
        <button
          type="button"
          data-flat-grade-lut-toggle="true"
          onClick={() => setLutOpen((v) => !v)}
          className="flex min-h-[30px] w-full items-center justify-between text-left"
        >
          <span className="text-[11px] text-panel-text-2">{t("Custom LUT")}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className={`shrink-0 text-panel-text-5 transition-transform ${lutOpen ? "rotate-90" : ""}`}
          >
            <path d="M2 3l3 4 3-4z" />
          </svg>
        </button>
        {lutOpen && (
          <div className="space-y-1.5 pb-1">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-panel-text-3">
                {selectedLutName ?? "None"}
              </span>
              <select
                data-flat-grade-lut-select="true"
                aria-label={t("Custom LUT")}
                value={lut?.src ?? ""}
                onChange={(e) => {
                  const src = e.target.value;
                  track("select", "Custom LUT");
                  actions.applyLut(src || null, src && lut?.src === src ? lut.intensity : 1);
                }}
                className="border-b border-panel-border-input/50 bg-transparent font-mono text-[10px] text-panel-text-3 outline-hidden hover:border-panel-border-input"
              >
                <option value="">{t("None")}</option>
                {lutAssets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset.split("/").pop() ?? asset}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!onImportAssets}
                onClick={() => lutInputRef.current?.click()}
                title={t("Import .cube LUT")}
                className="shrink-0 text-panel-text-4 hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} />
              </button>
              <input
                ref={lutInputRef}
                type="file"
                accept=".cube"
                className="hidden"
                onChange={(e) => {
                  void actions.importLut(e.currentTarget.files, onImportAssets, () =>
                    track("button", "Import LUT"),
                  );
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {lut && (
              <FlatSlider
                label={t("LUT strength")}
                value={Math.round((lut.intensity ?? 1) * 100)}
                min={0}
                max={100}
                tier={lut.intensity === 1 ? "default" : "explicitCustom"}
                displayValue={`${Math.round((lut.intensity ?? 1) * 100)}%`}
                onCommit={(v) => actions.applyLut(lut.src, v / 100)}
                onReset={() => actions.applyLut(lut.src, 1)}
              />
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-panel-hairline pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
          {t("Finish")}</div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">{renderDetailSlider("vignette")}</div>
          <button
            type="button"
            data-flat-grade-settings="vignette"
            title={t("Vignette settings")}
            onClick={() => setDetailSettingsOpen((c) => (c === "vignette" ? null : "vignette"))}
            className="shrink-0 text-panel-text-4 hover:text-panel-text-1"
          >
            <Settings size={12} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">{renderDetailSlider("grain")}</div>
          <button
            type="button"
            data-flat-grade-settings="grain"
            title={t("Grain settings")}
            onClick={() => setDetailSettingsOpen((c) => (c === "grain" ? null : "grain"))}
            className="shrink-0 text-panel-text-4 hover:text-panel-text-1"
          >
            <Settings size={12} />
          </button>
        </div>
        {detailSettingsOpen && (
          <div className="space-y-0.5 border-l-2 border-panel-border-input pl-2.5">
            {(detailSettingsOpen === "vignette" ? VIGNETTE_TUNE_SLIDERS : GRAIN_TUNE_SLIDERS).map(
              (slider) => renderDetailSlider(slider.key),
            )}
          </div>
        )}
      </div>

      {onApplyScopeAvailable && (
        <div className="flex items-center justify-between gap-2 border-t border-panel-hairline pt-1.5">
          <span className="flex items-center gap-1.5 text-[11px] text-panel-text-2">
            {t("Copy grade to")}{" "}<select
              aria-label={t("Copy grade to")}
              value={applyScope}
              onChange={(e) => {
                track("select", "Copy grade scope");
                onSetApplyScope(e.target.value as "source-file" | "project");
              }}
              disabled={applyBusy}
              className="border-b border-panel-border-input/50 bg-transparent font-mono text-[11px] text-panel-text-0 outline-hidden hover:border-panel-border-input disabled:opacity-50"
            >
              <option value="source-file">{t("Current file media")}</option>
              <option value="project">{t("All project media")}</option>
            </select>
          </span>
          <button
            type="button"
            data-flat-grade-apply="true"
            disabled={applyBusy}
            onClick={() => {
              track("button", "Apply grade to scope");
              onApplyToScope();
            }}
            className="text-[11px] font-medium text-accent-ink hover:text-accent-ink/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applyBusy ? t("Applying") : t("Apply")}
          </button>
        </div>
      )}
    </div>
  );
}
