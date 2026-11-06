/**
 * Telling module families apart before the word registers.
 *
 * A rack of eight modules is eight lines of text, and reading it top to bottom
 * means reading eight names. Lettering each family differently means an author
 * knows what KIND of module they are looking at with the label out of focus —
 * the shape of the line carries it, and the word only confirms.
 *
 * Two faces of type, as budgeted in `plans/audio-fx-ux/README.md`: the sans
 * carries four families apart by weight, case and tracking, and the serif is
 * spent on the single family that behaves differently from all of them.
 * Non-linear is the only generative one — it invents signal rather than
 * measuring or shaping what is there — so it should not look like the others.
 *
 * Alongside it, a tint step per module WITHIN its family, derived from position
 * in the registry rather than assigned by hand: two filters read as two
 * different modules without reading as two different families, and adding an
 * effect upstream never re-colours its siblings.
 */

import { HF_AUDIO_FX, type HfAudioFxNode } from "@hyperframes/core/audio-fx";

export type FxFamily = "filter" | "dynamics" | "nonlinear" | "time" | "smart";

/**
 * How each family letters.
 *
 * `smart` is not a registry group. It is the measuring modules — the carve, the
 * Tone EQ, the leveller — which analyse the audio and write their own settings.
 * Monospace because that is what a readout looks like, and what they show IS a
 * readout: numbers something else decided.
 */
export const FX_FAMILY_TYPE: Record<FxFamily, string> = {
  filter: "font-light uppercase tracking-[0.14em]",
  dynamics: "font-bold uppercase tracking-tight",
  nonlinear: "font-serif italic tracking-normal",
  time: "font-extralight uppercase tracking-[0.24em]",
  smart: "font-mono font-medium tracking-normal",
};

/** Hue per family, and a lightness ramp across the modules inside it. */
const FAMILY_HUE: Record<FxFamily, number> = {
  filter: 205,
  dynamics: 25,
  nonlinear: 310,
  time: 165,
  smart: 95,
};

/**
 * Which family a chain node belongs to.
 *
 * The composite tags win over the registry group, because what a node IS to the
 * author is the module that owns it: a carve's peaking filters are not filters
 * the author added, they are one carve.
 */
export function fxFamilyOf(
  node: Pick<HfAudioFxNode, "type" | "fromCarve" | "fromEq" | "fromLeveller">,
): FxFamily {
  if (node.fromCarve || node.fromEq || node.fromLeveller) return "smart";
  const group = HF_AUDIO_FX.find((def) => def.id === node.type)?.group;
  return group === "dynamics" || group === "nonlinear" || group === "time" ? group : "filter";
}

/**
 * The module's own tint: its family's hue, stepped by where it sits among its
 * siblings in the registry.
 *
 * Kept narrow on purpose — 62% to 76% lightness at low saturation. This has to
 * separate two modules at a glance without reading as a status colour, and the
 * panel already spends saturation on "automated" and "bypassed".
 */
export function fxFamilyTint(
  node: Pick<HfAudioFxNode, "type" | "fromCarve" | "fromEq" | "fromLeveller">,
): string {
  const family = fxFamilyOf(node);
  const siblings = HF_AUDIO_FX.filter((def) => fxFamilyOf({ type: def.id }) === family);
  const index = siblings.findIndex((def) => def.id === node.type);
  const step = siblings.length > 1 ? Math.max(0, index) / (siblings.length - 1) : 0;
  // Comma syntax rather than the space-separated modern form: it is what every
  // CSS parser in the chain agrees on, including the one the tests run in.
  return `hsl(${FAMILY_HUE[family]}, 32%, ${(62 + step * 14).toFixed(1)}%)`;
}
