import { useI18n } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import {
  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS,
  HF_COLOR_GRADING_EFFECT_PRESETS,
  HF_COLOR_GRADING_PALETTES,
  normalizeHfColorGrading,
  type HfColorGradingActiveEffectKey,
  type HfColorGradingEffectKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { Plus, RotateCcw, X } from "../../icons/SystemIcons";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { FLAT_PREVIEW_GRID, FlatSlider } from "./propertyPanelFlatPrimitives";
import type {
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
} from "./useColorGradingController";
import {
  DEFAULT_EFFECTS,
  EFFECT_GROUPS,
  EFFECT_SPECS,
  type EffectControl,
  type EffectSpec,
} from "./propertyPanelFlatEffectSpecs";
import { FlatEffectControl } from "./propertyPanelFlatEffectControl";
import { presetPreviewHandlers } from "./propertyPanelPresetPreview";

export function activeColorGradingEffectCount(grading: NormalizedHfColorGrading): number {
  return EFFECT_SPECS.filter((effect) => grading.effects[effect.key] > 0.0001).length;
}

export function FlatEffectsAccessory({
  grading,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  if (!activeColorGradingEffectCount(grading)) return null;
  return (
    <button
      type="button"
      data-flat-effects-reset="true"
      title={t("Reset effects")}
      onClick={(event) => {
        event.stopPropagation();
        track("button", "Reset effects");
        onCommitColorGrading({ ...grading, effects: { ...DEFAULT_EFFECTS }, palette: null });
      }}
      className="shrink-0 text-panel-text-3 hover:text-panel-text-1"
    >
      <RotateCcw size={12} />
    </button>
  );
}

export function FlatEffectsSection({
  grading,
  previews,
  presetPreviews,
  onCommitColorGrading,
  onPreviewColorGrading,
  onRequestEffectPreviews,
  onRequestPresetPreviews,
}: {
  grading: NormalizedHfColorGrading;
  previews: ColorGradingPresetPreviews;
  presetPreviews: ColorGradingPresetPreviews;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  onRequestEffectPreviews: (effects: readonly HfColorGradingActiveEffectKey[]) => void;
  onRequestPresetPreviews: () => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const activeEffects = EFFECT_SPECS.filter((effect) => grading.effects[effect.key] > 0.0001);
  const [catalogOpen, setCatalogOpen] = useState(activeEffects.length === 0);
  const [catalogGroup, setCatalogGroup] = useState(EFFECT_GROUPS[0].label);
  const [selectedKey, setSelectedKey] = useState<HfColorGradingActiveEffectKey | null>(
    activeEffects[0]?.key ?? null,
  );
  const selectedEffect =
    activeEffects.find((effect) => effect.key === selectedKey) ?? activeEffects[0] ?? null;

  useEffect(() => {
    if (!catalogOpen) return;
    const group = EFFECT_GROUPS.find((candidate) => candidate.label === catalogGroup);
    if (!group) return;
    const effectKeys = group.effects.map((effect) => effect.key);
    if (previews.status !== "loading" && effectKeys.some((effect) => !previews.images[effect])) {
      onRequestEffectPreviews(effectKeys);
    }
    if (
      group.presets?.some((preset) => !presetPreviews.images[preset]) &&
      presetPreviews.status !== "loading"
    ) {
      onRequestPresetPreviews();
    }
  }, [
    catalogGroup,
    catalogOpen,
    onRequestEffectPreviews,
    onRequestPresetPreviews,
    presetPreviews.images,
    presetPreviews.status,
    previews.images,
    previews.status,
  ]);
  useEffect(() => () => onPreviewColorGrading(null), [onPreviewColorGrading]);

  const commitEffects = (effects: NormalizedHfColorGrading["effects"]) => {
    onCommitColorGrading({
      ...grading,
      effects,
    });
  };
  const commitEffect = (key: HfColorGradingEffectKey, value: number) => {
    commitEffects({ ...grading.effects, [key]: value });
  };
  const resolveEffect = (effect: EffectSpec): NormalizedHfColorGrading => ({
    ...grading,
    effects: {
      ...grading.effects,
      ...HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS[effect.key],
    },
  });
  const applyEffect = (effect: EffectSpec) => {
    track("button", `Add ${effect.label}`);
    onCommitColorGrading(resolveEffect(effect));
    setSelectedKey(effect.key);
    setCatalogOpen(false);
  };
  const resolvePreset = (presetId: string) =>
    normalizeHfColorGrading({ preset: presetId, lut: grading.lut }) ?? grading;
  const removeEffect = (effect: EffectSpec) => {
    track("button", `Remove ${effect.label}`);
    commitEffect(effect.key, 0);
    setSelectedKey(null);
  };

  const renderPalette = (kind: "mono" | "art") => {
    const fallback = kind === "art" ? ["#1a1a1a", "#f5f5dc"] : ["#000000", "#ffffff"];
    const palette = grading.palette;
    return (
      <div data-flat-effects-palette="true" className="space-y-2 py-1">
        <div className="grid grid-cols-3 gap-1">
          {HF_COLOR_GRADING_PALETTES.map((preset) => {
            const selected =
              palette?.length === preset.colors.length &&
              palette.every((color, index) => color === preset.colors[index]);
            return (
              <button
                key={preset.id}
                type="button"
                title={`${preset.group}: ${preset.label}`}
                data-flat-effects-palette-preset={preset.id}
                aria-pressed={selected}
                onClick={() => {
                  track("button", `Use ${preset.label} palette`);
                  onCommitColorGrading({ ...grading, palette: [...preset.colors] });
                }}
                className={`min-w-0 border p-1 text-left ${
                  selected
                    ? "border-panel-accent bg-panel-accent/10"
                    : "border-panel-hairline hover:border-panel-border-input"
                }`}
              >
                <span className="mb-1 flex h-3 overflow-hidden rounded-[2px]">
                  {preset.colors.map((color) => (
                    <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="block truncate text-[8px] text-panel-text-3">{preset.label}</span>
              </button>
            );
          })}
        </div>
        {!palette ? (
          <button
            type="button"
            data-flat-effects-add-palette="true"
            onClick={() => {
              track("button", "Customize effect palette");
              onCommitColorGrading({ ...grading, palette: fallback });
            }}
            className="flex min-h-[28px] items-center gap-1 text-[10px] font-medium text-accent-ink hover:text-accent-ink/80"
          >
            <Plus size={11} /> {t("Custom palette")}</button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-panel-text-3">{t("Custom palette")}</span>
              <button
                type="button"
                title={t("Use default palette")}
                onClick={() => onCommitColorGrading({ ...grading, palette: null })}
                className="text-panel-text-4 hover:text-panel-text-1"
              >
                <RotateCcw size={11} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {palette.map((color, index) => (
                <span key={`${index}-${color}`} className="group/swatch relative">
                  <input
                    type="color"
                    aria-label={t("Palette color {value0}", { value0: index + 1 })}
                    value={color}
                    onChange={(event) => {
                      const nextPalette = [...palette];
                      nextPalette[index] = event.target.value;
                      onCommitColorGrading({ ...grading, palette: nextPalette });
                    }}
                    className="h-6 w-6 cursor-pointer rounded-xs border border-panel-border-input bg-transparent p-0"
                  />
                  {palette.length > 2 && (
                    <button
                      type="button"
                      aria-label={t("Remove palette color {value0}", { value0: index + 1 })}
                      onClick={() =>
                        onCommitColorGrading({
                          ...grading,
                          palette: palette.filter((_, colorIndex) => colorIndex !== index),
                        })
                      }
                      className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-panel-bg text-panel-text-2 shadow-sm group-hover/swatch:flex"
                    >
                      <X size={8} />
                    </button>
                  )}
                </span>
              ))}
              {palette.length < 6 && (
                <button
                  type="button"
                  aria-label={t("Add palette color")}
                  onClick={() =>
                    onCommitColorGrading({
                      ...grading,
                      palette: [...palette, palette.at(-1) ?? "#ffffff"],
                    })
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-xs border border-panel-border-input text-panel-text-4 hover:text-panel-text-1"
                >
                  <Plus size={11} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-flat-effects-section="true">
      {activeEffects.length > 0 && (
        <div data-flat-effects-active-list="true" className="space-y-1">
          {activeEffects.map((effect) => {
            const selected = selectedEffect?.key === effect.key;
            return (
              <button
                key={effect.key}
                type="button"
                data-flat-effect-active={effect.key}
                aria-pressed={selected}
                onClick={() => setSelectedKey(effect.key)}
                className={`flex min-h-[30px] w-full items-center justify-between border px-2 text-left text-[10px] transition-colors ${
                  selected
                    ? "border-panel-accent bg-panel-accent/10 text-panel-text-0"
                    : "border-panel-hairline bg-panel-bg-soft text-panel-text-3 hover:border-panel-border-input hover:text-panel-text-1"
                }`}
              >
                <span>{effect.label}</span>
                <span className="text-[9px] text-panel-text-5">
                  {selected ? t("Editing") : t("Active")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedEffect && (
        <div
          data-flat-effect-editor={selectedEffect.key}
          className="space-y-1 border-l-2 border-panel-border-input pl-2.5"
        >
          <div className="flex min-h-[26px] items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-panel-text-1">
              {selectedEffect.label}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                title={t("Reset {value0}", { value0: selectedEffect.label })}
                onClick={() => applyEffect(selectedEffect)}
                className="text-panel-text-4 hover:text-panel-text-1"
              >
                <RotateCcw size={11} />
              </button>
              <button
                type="button"
                title={t("Remove {value0}", { value0: selectedEffect.label })}
                onClick={() => removeEffect(selectedEffect)}
                className="text-panel-text-4 hover:text-danger-ink"
              >
                <X size={11} />
              </button>
            </span>
          </div>
          {selectedEffect.showMaster !== false && (
            <FlatSlider
              label={selectedEffect.masterLabel ?? "Mix"}
              value={grading.effects[selectedEffect.key] * 100}
              min={0}
              max={selectedEffect.max ?? 100}
              tier="explicitCustom"
              displayValue={
                selectedEffect.masterFormat?.(grading.effects[selectedEffect.key]) ??
                `${Math.round(grading.effects[selectedEffect.key] * 100)}%`
              }
              onCommit={(next) => commitEffect(selectedEffect.key, next / 100)}
              onReset={() =>
                commitEffect(
                  selectedEffect.key,
                  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS[selectedEffect.key][selectedEffect.key] ??
                    1,
                )
              }
            />
          )}
          {selectedEffect.settings?.map((control: EffectControl) => (
            <FlatEffectControl
              key={control.key}
              control={control}
              effect={selectedEffect}
              effects={grading.effects}
              onCommit={commitEffect}
            />
          ))}
          {selectedEffect.palette && renderPalette(selectedEffect.palette)}
        </div>
      )}

      <button
        type="button"
        data-flat-effects-add-toggle="true"
        aria-expanded={catalogOpen}
        onClick={() => setCatalogOpen((open) => !open)}
        className="flex min-h-[30px] items-center gap-1 text-[10px] font-medium text-accent-ink hover:text-accent-ink/80"
      >
        <Plus size={11} /> {t("Add effect")}</button>

      {catalogOpen && (
        <div data-flat-effects-catalog="true" className="space-y-2">
          <div
            role="tablist"
            aria-label={t("Effect families")}
            className="grid grid-cols-4 gap-px overflow-hidden border border-panel-hairline bg-panel-hairline"
          >
            {EFFECT_GROUPS.map((group) => (
              <button
                key={group.label}
                type="button"
                role="tab"
                aria-selected={catalogGroup === group.label}
                data-flat-effect-group={group.label}
                onClick={() => setCatalogGroup(group.label)}
                className={`min-h-[25px] min-w-0 truncate bg-panel-bg px-2 text-[9px] ${
                  catalogGroup === group.label
                    ? "font-medium text-accent-ink"
                    : "text-panel-text-4 hover:text-panel-text-1"
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>
          {EFFECT_GROUPS.filter((group) => group.label === catalogGroup).map((group) => (
            <section key={group.label} className="space-y-1" role="tabpanel">
              <div className={FLAT_PREVIEW_GRID}>
                {group.presets?.map((presetId) => {
                  const preset = HF_COLOR_GRADING_EFFECT_PRESETS.find(
                    (candidate) => candidate.id === presetId,
                  );
                  if (!preset) return null;
                  const selected = grading.preset === preset.id;
                  const preview = presetPreviews.images[preset.id];
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-flat-effect-preset={preset.id}
                      aria-pressed={selected}
                      {...presetPreviewHandlers({
                        id: preset.id,
                        label: preset.label,
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
                        className="flex w-full items-center justify-center overflow-hidden bg-black/20"
                        style={{
                          aspectRatio: `${presetPreviews.width} / ${presetPreviews.height}`,
                        }}
                      >
                        {preview ? (
                          <img
                            data-flat-effect-preset-preview={preset.id}
                            src={preview}
                            alt=""
                            draggable={false}
                            className="block h-full w-full object-contain"
                          />
                        ) : (
                          <span
                            data-flat-effect-preset-placeholder={presetPreviews.status}
                            className="h-full w-full bg-panel-bg-soft"
                          />
                        )}
                      </span>
                      <span className="block truncate px-2 py-1.5">{preset.label}</span>
                    </button>
                  );
                })}
                {group.effects.map((effect) => {
                  const active = grading.effects[effect.key] > 0.0001;
                  const preview = previews.images[effect.key];
                  return (
                    <button
                      key={effect.key}
                      type="button"
                      data-flat-effect-option={effect.key}
                      aria-pressed={active}
                      title={t("Preview {value0}", { value0: effect.label })}
                      onPointerEnter={() =>
                        onPreviewColorGrading(resolveEffect(effect), {
                          animatedPreview: { kind: "effects", id: effect.key },
                        })
                      }
                      onPointerLeave={() => onPreviewColorGrading(null)}
                      onFocus={() => onPreviewColorGrading(resolveEffect(effect))}
                      onBlur={() => onPreviewColorGrading(null)}
                      onClick={() => {
                        if (active) {
                          setSelectedKey(effect.key);
                          setCatalogOpen(false);
                        } else {
                          applyEffect(effect);
                        }
                      }}
                      className={`min-w-0 overflow-hidden border text-left text-[10px] transition-colors ${
                        active
                          ? "border-panel-accent bg-panel-accent/10 text-panel-text-1"
                          : "border-panel-hairline bg-panel-bg-soft text-panel-text-3 hover:border-panel-border-input hover:text-panel-text-1"
                      }`}
                    >
                      <span
                        data-flat-effect-preview-frame={effect.key}
                        className="flex w-full items-center justify-center overflow-hidden bg-black/20"
                        style={{ aspectRatio: `${previews.width} / ${previews.height}` }}
                      >
                        {preview ? (
                          <img
                            data-flat-effect-preview={effect.key}
                            src={preview}
                            alt=""
                            draggable={false}
                            className="block h-full w-full object-contain"
                          />
                        ) : (
                          <span
                            data-flat-effect-preview-placeholder={previews.status}
                            className="h-full w-full bg-panel-bg-soft"
                          />
                        )}
                      </span>
                      <span className="block truncate px-2 py-1.5">{effect.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
