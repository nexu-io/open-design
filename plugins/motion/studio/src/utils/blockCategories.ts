import {
  type BlockCategory,
  BLOCK_CATEGORIES,
  resolveBlockCategory,
} from "@hyperframes/core/registry";

export type { BlockCategory };
export { BLOCK_CATEGORIES, resolveBlockCategory };

const COLOR_MAP: Record<BlockCategory, { bg: string; text: string; dot: string }> = {
  transitions: {
    bg: "bg-blue-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_255),var(--color-blue-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_255),var(--color-blue-400))]",
  },
  vfx: {
    bg: "bg-purple-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_305),var(--color-purple-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_305),var(--color-purple-400))]",
  },
  social: {
    bg: "bg-pink-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_350),var(--color-pink-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_350),var(--color-pink-400))]",
  },
  data: {
    bg: "bg-green-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_152),var(--color-green-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_152),var(--color-green-400))]",
  },
  scenes: { bg: "bg-amber-500/15", text: "text-warning-ink", dot: "bg-warning-ink" },
  captions: {
    bg: "bg-cyan-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_212),var(--color-cyan-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_212),var(--color-cyan-400))]",
  },
  effects: {
    bg: "bg-rose-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_13),var(--color-rose-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_13),var(--color-rose-400))]",
  },
  "text-effects": {
    bg: "bg-violet-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_294),var(--color-violet-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_294),var(--color-violet-400))]",
  },
  "code-animation": {
    bg: "bg-emerald-500/15",
    text: "text-[light-dark(oklch(0.48_0.12_163),var(--color-emerald-400))]",
    dot: "bg-[light-dark(oklch(0.48_0.12_163),var(--color-emerald-400))]",
  },
};

export function getCategoryColors(category: BlockCategory) {
  return COLOR_MAP[category];
}
