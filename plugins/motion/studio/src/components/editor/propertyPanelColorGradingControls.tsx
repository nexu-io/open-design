import { useI18n } from "../../i18n/I18n";
import { useMemo, useRef, useState } from "react";
import {
  HF_COLOR_GRADING_PRESETS,
  normalizeHfColorGrading,
  type HfColorGradingAdjustKey,
  type HfColorGradingDetailKey,
  type HfColorGradingEffectKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { ChevronDown, ChevronRight, Plus, X } from "../../icons/SystemIcons";
import { LUT_EXT } from "../../utils/mediaTypes";
import { LABEL } from "./propertyPanelHelpers";
import { ColorGradingSliderControl } from "./propertyPanelColorGradingSlider";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

const LUT_UPLOAD_DIR = "assets/luts";

export const COLOR_GRADING_ADJUST_SLIDERS: Array<{
  key: HfColorGradingAdjustKey;
  label: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  suffix: string;
}> = [
  { key: "exposure", label: "Exposure", min: -200, max: 200, step: 5, scale: 100, suffix: "" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  {
    key: "highlights",
    label: "Highlights",
    min: -100,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
  },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  {
    key: "whites",
    label: "White Point",
    min: -100,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
  },
  {
    key: "blacks",
    label: "Black Point",
    min: -100,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
  },
  { key: "temperature", label: "Warmth", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "tint", label: "Tint", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
];

export const COLOR_GRADING_DETAIL_SLIDERS: Array<{
  key: HfColorGradingDetailKey;
  label: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  suffix: string;
  defaultValue?: number;
}> = [
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1, scale: 100, suffix: "%" },
  {
    key: "vignetteMidpoint",
    label: "Midpoint",
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
    defaultValue: 50,
  },
  {
    key: "vignetteRoundness",
    label: "Roundness",
    min: -100,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
  },
  {
    key: "vignetteFeather",
    label: "Feather",
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
    defaultValue: 65,
  },
  { key: "grain", label: "Grain", min: 0, max: 100, step: 1, scale: 100, suffix: "%" },
  {
    key: "grainSize",
    label: "Grain Size",
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
    defaultValue: 25,
  },
  {
    key: "grainRoughness",
    label: "Roughness",
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
    defaultValue: 50,
  },
];

type DetailSlider = (typeof COLOR_GRADING_DETAIL_SLIDERS)[number];
type SliderSettings = {
  active?: boolean;
  label: string;
  onClick: () => void;
};

const EFFECT_SLIDERS: Array<{
  key: HfColorGradingEffectKey;
  label: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  suffix: string;
}> = [
  { key: "blur", label: "Blur", min: 0, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "pixelate", label: "Pixelate", min: 0, max: 100, step: 1, scale: 100, suffix: "%" },
];

const AMOUNT_DETAIL_SLIDERS = COLOR_GRADING_DETAIL_SLIDERS.filter(
  (slider) => slider.key === "vignette" || slider.key === "grain",
);
export const VIGNETTE_TUNE_SLIDERS = COLOR_GRADING_DETAIL_SLIDERS.filter(
  (slider) =>
    slider.key === "vignetteMidpoint" ||
    slider.key === "vignetteRoundness" ||
    slider.key === "vignetteFeather",
);
export const GRAIN_TUNE_SLIDERS = COLOR_GRADING_DETAIL_SLIDERS.filter(
  (slider) => slider.key === "grainSize" || slider.key === "grainRoughness",
);

export function normalizedColorGradingDefault(slider: {
  defaultValue?: number;
  scale: number;
}): number {
  return (slider.defaultValue ?? 0) / slider.scale;
}

export function visibleColorGradingIntensity(grading: NormalizedHfColorGrading): number {
  // Earlier drafts could persist 0% strength; the next manual edit should revive visible grading.
  return grading.intensity === 0 ? 1 : grading.intensity;
}

function colorGradingWithLut(
  grading: NormalizedHfColorGrading,
  src: string | null,
  intensity = 1,
): NormalizedHfColorGrading {
  return {
    ...grading,
    intensity: visibleColorGradingIntensity(grading),
    lut: src ? { src, intensity } : null,
  };
}

export function colorGradingWithDetail(
  grading: NormalizedHfColorGrading,
  key: HfColorGradingDetailKey,
  value: number,
): NormalizedHfColorGrading {
  return {
    ...grading,
    intensity: visibleColorGradingIntensity(grading),
    details: { ...grading.details, [key]: value },
  };
}

function colorGradingWithIntensity(
  grading: NormalizedHfColorGrading,
  intensity: number,
): NormalizedHfColorGrading {
  return { ...grading, intensity };
}

export function colorGradingWithAdjust(
  grading: NormalizedHfColorGrading,
  key: HfColorGradingAdjustKey,
  value: number,
): NormalizedHfColorGrading {
  return {
    ...grading,
    intensity: visibleColorGradingIntensity(grading),
    adjust: { ...grading.adjust, [key]: value },
  };
}

async function importFirstLut(
  files: FileList | null,
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>,
): Promise<string | null> {
  if (!files?.length || !onImportAssets) return null;
  const uploaded = await onImportAssets(files, LUT_UPLOAD_DIR);
  return uploaded.find((asset) => LUT_EXT.test(asset)) ?? null;
}

export function createColorGradingActions(
  grading: NormalizedHfColorGrading,
  onCommit: (grading: NormalizedHfColorGrading) => void,
) {
  const applyLut = (src: string | null, intensity = 1) => {
    onCommit(colorGradingWithLut(grading, src, intensity));
  };
  return {
    setIntensityPercent(value: number) {
      onCommit(colorGradingWithIntensity(grading, value / 100));
    },
    applyLut,
    setLutIntensityPercent(value: number) {
      if (grading.lut) applyLut(grading.lut.src, value / 100);
    },
    async importLut(
      files: FileList | null,
      onImportAssets: ((files: FileList, dir?: string) => Promise<string[]>) | undefined,
      onImported: () => void,
    ) {
      const src = await importFirstLut(files, onImportAssets);
      if (!src) return;
      onImported();
      applyLut(src);
    },
  };
}

export function ColorGradingControls({
  grading,
  assets,
  onImportAssets,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  assets: string[];
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onCommitColorGrading: (nextGrading: NormalizedHfColorGrading) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const lutInputRef = useRef<HTMLInputElement>(null);
  const [lutOpen, setLutOpen] = useState(false);
  const [detailSettings, setDetailSettings] = useState<"vignette" | "grain" | null>(null);
  const [lutImporting, setLutImporting] = useState(false);
  const [lutImportError, setLutImportError] = useState<string | null>(null);
  const lutAssets = useMemo(
    () => assets.filter((asset) => LUT_EXT.test(asset)).sort((a, b) => a.localeCompare(b)),
    [assets],
  );
  const selectedLut = grading.lut?.src ?? "";
  const selectedProjectLut = selectedLut ? (selectedLut.split("/").pop() ?? selectedLut) : null;
  const detailSettingsSliders =
    detailSettings === "vignette" ? VIGNETTE_TUNE_SLIDERS : GRAIN_TUNE_SLIDERS;
  const vignetteSettingsActive = VIGNETTE_TUNE_SLIDERS.some(
    (slider) =>
      Math.abs(grading.details[slider.key] - normalizedColorGradingDefault(slider)) > 0.0001,
  );
  const grainSettingsActive = GRAIN_TUNE_SLIDERS.some(
    (slider) =>
      Math.abs(grading.details[slider.key] - normalizedColorGradingDefault(slider)) > 0.0001,
  );
  const actions = createColorGradingActions(grading, onCommitColorGrading);

  const applyPreset = (preset: string) => {
    // Pass the LUT through normalize; the preset's own adjust values are its
    // look (main's normalize already avoids carrying over grading.adjust,
    // which was the bug this PR originally fixed).
    const next = normalizeHfColorGrading({ preset, intensity: 1, lut: grading.lut });
    if (next) {
      track("select", "Preset");
      onCommitColorGrading(next);
    }
  };
  const commitDetailSlider = (slider: DetailSlider, next: number) => {
    onCommitColorGrading(colorGradingWithDetail(grading, slider.key, next / slider.scale));
  };
  const resetDetailSlider = (slider: DetailSlider) => {
    onCommitColorGrading(
      colorGradingWithDetail(grading, slider.key, normalizedColorGradingDefault(slider)),
    );
  };
  const renderDetailSlider = (slider: DetailSlider, settings?: SliderSettings) => {
    const value = Math.round(grading.details[slider.key] * slider.scale);
    return (
      <ColorGradingSliderControl
        key={slider.key}
        label={slider.label}
        value={value}
        min={slider.min}
        max={slider.max}
        step={slider.step}
        neutral={slider.defaultValue ?? 0}
        suffix={slider.suffix}
        displayValue={`${value}%`}
        settings={settings}
        onCommit={(next) => commitDetailSlider(slider, next)}
        onReset={() => resetDetailSlider(slider)}
      />
    );
  };

  return (
    <div className="space-y-3">
      <label className="grid min-w-0 gap-1.5">
        <span className={LABEL}>{t("Preset")}</span>
        <select
          value={String(grading.preset ?? "neutral")}
          onChange={(event) => applyPreset(event.target.value)}
          className="w-full min-w-0 rounded-md bg-panel-input px-3 py-2 text-[11px] font-medium text-panel-text-1 outline-hidden"
        >
          {HF_COLOR_GRADING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <ColorGradingSliderControl
        label={t("Preset strength")}
        value={Math.round(grading.intensity * 100)}
        min={0}
        max={100}
        step={1}
        neutral={0}
        suffix="%"
        displayValue={`${Math.round(grading.intensity * 100)}%`}
        onCommit={actions.setIntensityPercent}
        onReset={() => actions.setIntensityPercent(100)}
      />

      <div className="min-w-0 rounded-md border border-panel-border/70 bg-panel-input/15">
        <button
          type="button"
          className="flex h-8 w-full min-w-0 items-center gap-1.5 px-2 text-left text-[11px] font-medium text-panel-text-3 transition-colors hover:bg-panel-hover/60 hover:text-panel-text-1"
          onClick={() => setLutOpen((value) => !value)}
          aria-expanded={lutOpen}
        >
          {lutOpen ? (
            <ChevronDown size={11} className="shrink-0 text-panel-text-5" />
          ) : (
            <ChevronRight size={11} className="shrink-0 text-panel-text-5" />
          )}
          <span className="min-w-0 flex-1 truncate">{t("Custom LUT")}</span>
          {grading.lut && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent" />}
        </button>
        {lutOpen && (
          <div className="grid gap-1.5 border-t border-panel-border/60 p-1.5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] gap-2">
              <select
                value={selectedLut}
                onChange={(event) => {
                  const nextSrc = event.target.value;
                  track("select", "Custom LUT");
                  actions.applyLut(
                    nextSrc || null,
                    nextSrc && grading.lut?.src === nextSrc ? grading.lut.intensity : 1,
                  );
                }}
                className="w-full min-w-0 rounded-md bg-panel-input px-3 py-2 text-[11px] font-medium text-panel-text-1 outline-hidden"
                title={t("Uploaded .cube LUT")}
              >
                <option value="">{t("None")}</option>
                {lutAssets.length > 0 && (
                  <optgroup label={t("Uploaded LUTs")}>
                    {lutAssets.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset.split("/").pop() ?? asset}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                disabled={!onImportAssets || lutImporting}
                onClick={(event) => {
                  event.stopPropagation();
                  lutInputRef.current?.click();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-panel-input text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                title={lutImporting ? t("Importing…") : t("Import .cube LUT")}
                aria-label={t("Import .cube LUT")}
                aria-busy={lutImporting}
              >
                {lutImporting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-panel-text-4 border-t-transparent motion-reduce:animate-none" />
                ) : (
                  <Plus size={13} />
                )}
              </button>
              <input
                ref={lutInputRef}
                type="file"
                accept=".cube"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  setLutImporting(true);
                  setLutImportError(null);
                  void actions
                    .importLut(files, onImportAssets, () => track("button", "Import LUT"))
                    .catch(() =>
                      setLutImportError("LUT import failed. Check the .cube file and try again."),
                    )
                    .finally(() => setLutImporting(false));
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {lutImportError && (
              <div className="text-[10px] text-danger-ink" role="alert">
                {lutImportError}
              </div>
            )}
            {grading.lut && (
              <div className="grid gap-2">
                {selectedProjectLut && (
                  <div className="flex min-w-0 items-start gap-2 text-[10px] leading-4 text-panel-text-3">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent" />
                    <span className="min-w-0 flex-1 truncate" title={selectedProjectLut}>
                      <span className="font-medium text-panel-text-2">{t("Uploaded LUT")}</span>
                      {` · ${selectedProjectLut}`}
                    </span>
                  </div>
                )}
                <ColorGradingSliderControl
                  label={t("LUT Strength")}
                  value={Math.round((grading.lut.intensity ?? 1) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  neutral={0}
                  suffix="%"
                  displayValue={`${Math.round((grading.lut.intensity ?? 1) * 100)}%`}
                  onCommit={actions.setLutIntensityPercent}
                  onReset={() => actions.setLutIntensityPercent(100)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className={LABEL}>{t("Adjust")}</span>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {COLOR_GRADING_ADJUST_SLIDERS.map((slider) => {
            const value = grading.adjust[slider.key] * slider.scale;
            const isExposure = slider.key === "exposure";
            return (
              <ColorGradingSliderControl
                key={slider.key}
                label={slider.label}
                value={Math.round(value)}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                neutral={0}
                scale={isExposure ? 100 : 1}
                suffix={isExposure ? "" : slider.suffix}
                displayValue={
                  isExposure
                    ? `${value > 0 ? "+" : ""}${(value / 100).toFixed(2)}`
                    : `${Math.round(value)}%`
                }
                onCommit={(next) => {
                  onCommitColorGrading(
                    colorGradingWithAdjust(grading, slider.key, next / slider.scale),
                  );
                }}
                onReset={() => {
                  onCommitColorGrading(colorGradingWithAdjust(grading, slider.key, 0));
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className={LABEL}>{t("Finishing")}</span>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {AMOUNT_DETAIL_SLIDERS.map((slider) =>
            renderDetailSlider(slider, {
              active: slider.key === "vignette" ? vignetteSettingsActive : grainSettingsActive,
              label: `${slider.label} settings`,
              onClick: () =>
                setDetailSettings((current) =>
                  current === slider.key ? null : (slider.key as "vignette" | "grain"),
                ),
            }),
          )}
        </div>
        {detailSettings && (
          <div className="grid min-w-0 gap-1.5 rounded-md border border-panel-border bg-panel-input/40 p-1.5 shadow-xl shadow-black/20">
            <div className="flex min-w-0 items-center gap-2 px-0.5">
              <span className={`${LABEL} min-w-0 flex-1 truncate`}>
                {detailSettings === "vignette" ? t("Vignette settings") : t("Grain settings")}
              </span>
              <button
                type="button"
                aria-label={t("Close settings")}
                title={t("Close settings")}
                onClick={() => setDetailSettings(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-panel-text-5 transition-colors hover:bg-panel-hover hover:text-panel-text-1"
              >
                <X size={11} />
              </button>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-1.5">
              {detailSettingsSliders.map((slider) => renderDetailSlider(slider))}
            </div>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className={LABEL}>{t("Effects")}</span>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {EFFECT_SLIDERS.map((slider) => {
            const value = grading.effects[slider.key] * slider.scale;
            return (
              <ColorGradingSliderControl
                key={slider.key}
                label={slider.label}
                value={Math.round(value)}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                neutral={0}
                suffix={slider.suffix}
                displayValue={`${Math.round(value)}%`}
                onCommit={(next) => {
                  onCommitColorGrading({
                    ...grading,
                    intensity: visibleColorGradingIntensity(grading),
                    effects: {
                      ...grading.effects,
                      [slider.key]: next / slider.scale,
                    },
                  });
                }}
                onReset={() => {
                  onCommitColorGrading({
                    ...grading,
                    intensity: visibleColorGradingIntensity(grading),
                    effects: {
                      ...grading.effects,
                      [slider.key]: 0,
                    },
                  });
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
