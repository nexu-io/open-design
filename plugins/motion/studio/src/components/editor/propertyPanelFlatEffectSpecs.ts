import {
  getHfColorGradingCapabilities,
  normalizeHfColorGrading,
  type HfColorGradingActiveEffectKey,
  type HfColorGradingEffectKey,
  type HfColorGradingPresetId,
} from "@hyperframes/core/color-grading";

type SliderControl = {
  kind: "slider";
  key: HfColorGradingEffectKey;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  scale?: number;
  unit?: string;
  format?: (value: number) => string;
};

export type EffectControl =
  | SliderControl
  | { kind: "toggle"; key: HfColorGradingEffectKey; label: string }
  | {
      kind: "select";
      key: HfColorGradingEffectKey;
      label: string;
      options: Array<{ value: string; label: string }>;
    };

export type EffectSpec = {
  key: HfColorGradingActiveEffectKey;
  label: string;
  showMaster?: false;
  masterLabel?: string;
  masterFormat?: (value: number) => string;
  max?: number;
  settings?: readonly EffectControl[];
  palette?: "mono" | "art";
};

type EffectGroup = {
  label: string;
  effects: readonly EffectSpec[];
  presets?: readonly HfColorGradingPresetId[];
};

const EFFECT_CONTROL_LIMITS = new Map(
  getHfColorGradingCapabilities().effects.flatMap((effect) =>
    effect.controls.map((control) => [control.key, control] as const),
  ),
);

function controlRange(key: HfColorGradingEffectKey, scale: number) {
  const control = EFFECT_CONTROL_LIMITS.get(key);
  return control ? { min: control.min * scale, max: control.max * scale, scale } : { scale };
}

const percent = (key: HfColorGradingEffectKey, label: string): SliderControl => ({
  kind: "slider",
  key,
  label,
  ...controlRange(key, 100),
});

const degrees = (key: HfColorGradingEffectKey, label: string, max: number): SliderControl => ({
  kind: "slider",
  key,
  label,
  ...controlRange(key, max),
  unit: "deg",
});

function enumOptions(key: HfColorGradingEffectKey, labels: readonly string[]) {
  const control = EFFECT_CONTROL_LIMITS.get(key);
  const first = control?.min ?? 0;
  const count = (control?.max ?? labels.length - 1) - first + 1;
  if (labels.length !== count) throw new Error(`${key} labels do not match Core capabilities`);
  return labels.map((label, index) => ({ value: String(first + index), label }));
}

const ASCII_STYLES = enumOptions("asciiStyle", [
  "Standard",
  "Dense",
  "Minimal",
  "Blocks",
  "Braille",
  "Technical",
  "Matrix",
  "Hatching",
]);

const SCREEN_SHAPES = enumOptions("monoScreenShape", [
  "Circle",
  "Square",
  "Diamond",
  "Triangle",
  "Line",
]);

export const EFFECT_GROUPS: readonly EffectGroup[] = [
  {
    label: "Essentials",
    effects: [
      {
        key: "blur",
        label: "Blur",
        masterLabel: "Radius",
        masterFormat: (value) => `${(0.75 + Math.pow(value, 1.35) * 32).toFixed(1)}px`,
      },
      {
        key: "pixelate",
        label: "Pixelate",
        masterLabel: "Cell Size",
        masterFormat: (value) => `${Math.round(1 + value * 47)}px`,
      },
      {
        key: "bloom",
        label: "Bloom",
        masterLabel: "Intensity",
        max: controlRange("bloom", 100).max,
        settings: [
          {
            kind: "slider",
            key: "bloomRadius",
            label: "Radius",
            ...controlRange("bloomRadius", 1),
            unit: "px",
          },
        ],
      },
    ],
  },
  {
    label: "Retro & Glitch",
    presets: ["creator-camcorder", "vhs-playback", "home-movie-8mm"],
    effects: [
      { key: "chromaBleed", label: "Chroma Softening", masterLabel: "Smear" },
      {
        key: "tapeDamage",
        label: "Tape Damage",
        showMaster: false,
        settings: [
          percent("tapeTracking", "Tracking"),
          percent("tapeNoise", "Noise"),
          percent("tapeSpeed", "Speed"),
        ],
      },
      { key: "filmArtifacts", label: "Film Artifacts", masterLabel: "Density" },
      {
        key: "scanlines",
        label: "Scanlines",
        masterLabel: "Opacity",
        settings: [
          {
            ...percent("scanlineCount", "Line Count"),
            format: (value) => `${Math.round(50 + value * 450)}`,
          },
          percent("scanlineSoftness", "Softness"),
        ],
      },
      { key: "crtCurvature", label: "CRT Curvature", masterLabel: "Curvature" },
      {
        key: "chromaticAberration",
        label: "Channel Separation",
        masterLabel: "Separation",
        settings: [degrees("chromaticAngle", "Angle", 360)],
      },
      {
        key: "digitalGlitch",
        label: "Digital Glitch",
        showMaster: false,
        settings: [
          percent("digitalGlitchColorSplit", "Color Split"),
          percent("digitalGlitchLineTear", "Line Tear"),
          percent("digitalGlitchPixelate", "Pixelation"),
          percent("digitalGlitchBlockAmount", "Block Amount"),
          percent("digitalGlitchBlockDisplacement", "Displacement"),
          percent("digitalGlitchBlockOpacity", "Block Opacity"),
          percent("digitalGlitchSpeed", "Speed"),
        ],
      },
    ],
  },
  {
    label: "Print",
    presets: ["editorial-halftone", "two-ink-print"],
    effects: [
      {
        key: "halftone",
        label: "Halftone",
        showMaster: false,
        settings: [percent("halftoneSize", "Dot Size")],
      },
      {
        key: "twoInkPrint",
        label: "Two-Ink Print",
        showMaster: false,
        settings: [percent("twoInkPrintSize", "Dot Size")],
      },
      {
        key: "dither",
        label: "Ordered Dither",
        showMaster: false,
        palette: "mono",
        settings: [
          {
            ...percent("ditherSize", "Point Size"),
            format: (value) => `${(1 + value * 4).toFixed(1)}px`,
          },
        ],
      },
      {
        key: "monoScreen",
        label: "Mono Screen",
        showMaster: false,
        palette: "mono",
        settings: [
          {
            ...percent("monoScreenSize", "Cell Size"),
            format: (value) => `${Math.round(4 + value * 14)}px`,
          },
          degrees("monoScreenAngle", "Angle", 90),
          percent("monoScreenSpread", "Spread"),
          { kind: "select", key: "monoScreenShape", label: "Shape", options: SCREEN_SHAPES },
          { kind: "toggle", key: "monoScreenInvert", label: "Invert" },
        ],
      },
    ],
  },
  {
    label: "Art",
    effects: [
      {
        key: "ascii",
        label: "ASCII",
        showMaster: false,
        palette: "mono",
        settings: [
          {
            ...percent("asciiSize", "Character Size"),
            format: (value) => `${Math.round(4 + value * 76)}px`,
          },
          { kind: "select", key: "asciiStyle", label: "Style", options: ASCII_STYLES },
          { kind: "toggle", key: "asciiInvert", label: "Invert" },
          { kind: "toggle", key: "asciiColor", label: "Use Source Color" },
          percent("asciiRotation", "Edge Rotation"),
        ],
      },
      {
        key: "engraving",
        label: "Engraving",
        showMaster: false,
        palette: "art",
        settings: [
          percent("engravingSpacing", "Spacing"),
          percent("engravingMinThickness", "Min Thickness"),
          percent("engravingMaxThickness", "Max Thickness"),
          degrees("engravingAngle", "Angle", 180),
          percent("engravingContrast", "Contrast"),
          percent("engravingSharpness", "Sharpness"),
          percent("engravingWave", "Wave"),
          percent("engravingWaveFrequency", "Wave Frequency"),
        ],
      },
      {
        key: "crosshatch",
        label: "Crosshatch",
        showMaster: false,
        palette: "art",
        settings: [
          percent("crosshatchSpacing", "Spacing"),
          percent("crosshatchThickness", "Thickness"),
          degrees("crosshatchAngle", "Angle", 180),
          percent("crosshatchContrast", "Contrast"),
          percent("crosshatchEdges", "Edge Detail"),
          percent("crosshatchLineWeight", "Line Variation"),
          percent("crosshatchWave", "Wave"),
          percent("crosshatchWaveFrequency", "Wave Frequency"),
        ],
      },
      {
        key: "kuwahara",
        label: "Kuwahara Paint",
        showMaster: false,
        settings: [
          {
            ...percent("kuwaharaRadius", "Radius"),
            format: (value) => `${Math.round(2 + value * 14)}px`,
          },
          percent("kuwaharaSharpness", "Sharpness"),
          {
            ...percent("kuwaharaSaturation", "Saturation"),
            format: (value) => `${Math.round(value * 200)}%`,
          },
        ],
      },
    ],
  },
];

export const EFFECT_SPECS = EFFECT_GROUPS.flatMap((group) => group.effects);
const DEFAULT_GRADING = normalizeHfColorGrading("neutral");
if (!DEFAULT_GRADING) throw new Error("Missing neutral color grading preset");
export const DEFAULT_EFFECTS = DEFAULT_GRADING.effects;
