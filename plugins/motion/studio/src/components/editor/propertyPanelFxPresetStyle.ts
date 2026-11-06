/**
 * A title treatment per preset — the label as a small piece of design rather
 * than eighteen rows of the same condensed caps.
 *
 * The rack already letters by FAMILY (`propertyPanelFxFamily.ts`), which answers
 * "what kind of thing is this". This answers a different question: a preset is a
 * character, and the point of Telephone or Megaphone is that you know what it
 * sounds like before you play it. Type can carry that — a bullhorn's name should
 * look shouted, a tape's should look worn.
 *
 * Deliberately NOT a per-preset colour free-for-all. Each hue sits in the same
 * narrow lightness band as the family tints so nothing reads as a status colour,
 * and the panel already spends saturation on "automated" and "bypassed".
 *
 * A preset with no entry falls back to the neutral treatment, so the catalogue
 * can grow without this file — an unstyled preset looks plain, not broken.
 */

export interface FxPresetStyle {
  /** Tailwind classes for the title: weight, case, tracking, size. */
  type: string;
  /** The title's colour, and the bracket's left edge. */
  color: string;
  /**
   * A real font stack, when the character wants one.
   *
   * Tailwind ships three generic families, and a set of presets styled only
   * with those ends up variations of the same two faces. These are system
   * faces with a documented fallback chain: the studio has no webfont
   * pipeline, and the Google Fonts cache under `~/.cache/hyperframes` belongs
   * to the CLI's composition build — reaching into it from the panel would be
   * inventing a second one.
   *
   * Every stack ends in a generic keyword, so a machine without the named face
   * still lands somewhere deliberate.
   */
  family?: string;
}

/** Faces that ship with macOS and/or Windows, grouped by what they read as. */
const FACE = {
  /** Narrow industrial caps — signage, stencils, equipment panels. */
  condensed: '"Haettenschweiler", "Arial Narrow", Impact, sans-serif',
  /** Geometric and mechanical; reads as a machine rather than a voice. */
  geometric: '"Futura", "Century Gothic", "Avenir Next", sans-serif',
  /** Typewriter — struck, worn, slightly irregular. */
  typewriter: '"American Typewriter", "Courier New", Courier, monospace',
  /** High-contrast editorial serif; broadcast and print authority. */
  editorial: '"Didot", "Bodoni 72", "Playfair Display", Georgia, serif',
  /** Old-style serif with real warmth — books, not headlines. */
  bookish: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  /** Display face with no restraint at all. Theatrical, and a bit absurd. */
  theatrical: '"Luminari", "Papyrus", "Comic Sans MS", fantasy',
  /** Engraved caps — plaques, institutions, things bolted to walls. */
  engraved: '"Copperplate", "Optima", "Perpetua Titling MT", serif',
  /** Terminal type: fixed, plain, no personality of its own. */
  terminal: '"SF Mono", Consolas, Menlo, ui-monospace, monospace',
} as const;

/** Plain, and what any preset without its own entry gets. */
export const FX_PRESET_STYLE_DEFAULT: FxPresetStyle = {
  type: "text-[12px] uppercase tracking-wide",
  color: "hsl(220, 24%, 72%)",
  family: FACE.terminal,
};

export const FX_PRESET_STYLE: Record<string, FxPresetStyle> = {
  // --- voice: reach for these to sound like yourself, only better -----------
  // Restrained rather than plain. These are corrective, and a costume would
  // promise a character they deliberately do not add — but they still get a
  // face, because "no styling at all" is what every other row in the panel has.
  "voice-clean": {
    type: "text-[13px] font-medium tracking-tight",
    color: "hsl(202, 82%, 66%)",
    family: FACE.geometric,
  },
  "voice-broadcast": {
    type: "text-[13px] font-bold uppercase tracking-[0.14em]",
    color: "hsl(214, 84%, 70%)",
    family: FACE.editorial,
  },
  "voice-warm": {
    type: "text-[14px] italic tracking-normal",
    color: "hsl(32, 88%, 66%)",
    family: FACE.bookish,
  },

  // --- repair: workshop labels. Fixed, plain, nothing decorative ------------
  "rumble-cut": {
    type: "text-[12px] uppercase tracking-[0.18em]",
    color: "hsl(196, 78%, 64%)",
    family: FACE.terminal,
  },
  "room-gate": {
    type: "text-[12px] uppercase tracking-[0.18em]",
    color: "hsl(196, 78%, 64%)",
    family: FACE.terminal,
  },
  "boom-tame": {
    type: "text-[12px] uppercase tracking-[0.18em]",
    color: "hsl(196, 78%, 64%)",
    family: FACE.terminal,
  },
  "harsh-tame": {
    type: "text-[12px] uppercase tracking-[0.18em]",
    color: "hsl(196, 78%, 64%)",
    family: FACE.terminal,
  },

  // --- character: the costumes. This is where type does the work ------------
  // A phone's band is narrow; so is the tracking, on a face with no warmth.
  telephone: {
    type: "text-[13px] uppercase tracking-[0.3em]",
    color: "hsl(186, 85%, 62%)",
    family: FACE.terminal,
  },
  // A dial face: high-contrast serif caps, spaced like printed frequencies.
  "radio-am": {
    type: "text-[14px] uppercase tracking-[0.24em]",
    color: "hsl(42, 92%, 62%)",
    family: FACE.editorial,
  },
  // Shouted through a horn — the heaviest, narrowest thing available, leaning.
  megaphone: {
    type: "text-[17px] font-black italic uppercase tracking-tight",
    color: "hsl(12, 90%, 64%)",
    family: FACE.condensed,
  },
  // Struck on a machine, played back years later.
  "lofi-tape": {
    type: "text-[13px] tracking-wide",
    color: "hsl(28, 72%, 62%)",
    family: FACE.typewriter,
  },
  // Bolted to a wall in a station concourse.
  "pa-system": {
    type: "text-[13px] uppercase tracking-[0.26em]",
    color: "hsl(222, 80%, 70%)",
    family: FACE.engraved,
  },
  // Small, squeezed through a grille, no room for anything but the letters.
  intercom: {
    type: "text-[12px] font-bold uppercase tracking-tighter",
    color: "hsl(96, 68%, 60%)",
    family: FACE.terminal,
  },
  // The name is a joke and the type is in on it.
  "doofus-worble": {
    type: "text-[16px] tracking-widest",
    color: "hsl(288, 85%, 72%)",
    family: FACE.theatrical,
  },
  // Small, fast and squeaky — tight and bright, nothing about it sits still.
  chipmunk: {
    type: "text-[12px] font-black uppercase tracking-tighter",
    color: "hsl(54, 88%, 66%)",
    family: FACE.geometric,
  },
  // Huge and slow — the biggest size here, set on a face bolted to a monument.
  giant: {
    type: "text-[18px] font-black tracking-[0.02em]",
    color: "hsl(250, 72%, 68%)",
    family: FACE.engraved,
  },
  // Rough and too close — heavy industrial caps, growled rather than shouted.
  monster: {
    type: "text-[15px] font-black uppercase tracking-wider",
    color: "hsl(350, 78%, 64%)",
    family: FACE.condensed,
  },

  // --- space: rooms. Light and wide, because that is what space looks like ---
  "room-tight": {
    type: "text-[13px] uppercase tracking-[0.2em]",
    color: "hsl(252, 74%, 72%)",
    family: FACE.geometric,
  },
  "room-natural": {
    type: "text-[13px] uppercase tracking-[0.26em]",
    color: "hsl(258, 78%, 72%)",
    family: FACE.geometric,
  },
  // The biggest room gets the widest setting — the word itself opens out.
  hall: {
    type: "text-[15px] uppercase tracking-[0.4em]",
    color: "hsl(246, 84%, 74%)",
    family: FACE.engraved,
  },
  "slap-echo": {
    type: "text-[13px] uppercase tracking-[0.28em]",
    color: "hsl(274, 76%, 70%)",
    family: FACE.geometric,
  },
  "dub-throw": {
    type: "text-[14px] italic tracking-[0.3em]",
    color: "hsl(312, 78%, 70%)",
    family: FACE.editorial,
  },
};

export function fxPresetStyle(presetId: string): FxPresetStyle {
  return FX_PRESET_STYLE[presetId] ?? FX_PRESET_STYLE_DEFAULT;
}

/**
 * The wash behind a titled module, derived from the colour of its own title.
 *
 * Derived rather than picked: twenty hand-chosen pairs is twenty chances for
 * one to clash with its own title, and a hue rotation cannot. Same hue,
 * saturation pulled right down and lightness taken to near-black, so the panel
 * reads as tinted rather than coloured — the rack sits on `#0C0C0E` and
 * anything with real lightness here would fight every control on top of it.
 *
 * Takes a colour rather than an id so the smart modules can use it too: the
 * carve has a title worth setting and no preset entry to look up. Returns null
 * for a colour it cannot read, which is how a caller opts out.
 */
export function fxTintWash(color: string): string | null {
  // Decimals allowed: the preset colours are whole numbers, but `fxFamilyTint`
  // computes its lightness and emits `62.0%`, which an integer-only pattern
  // silently declines — the module then renders with no wash at all.
  const num = String.raw`\d+(?:\.\d+)?`;
  const hsl = new RegExp(`hsl\\(\\s*(${num}),\\s*${num}%,\\s*${num}%\\s*\\)`).exec(color);
  if (!hsl) return null;
  // 22% saturation at 11% lightness: present enough to tell two brackets apart
  // at a glance, dark enough that white body text still clears WCAG AA on it.
  return `hsl(${hsl[1]}, 22%, 11%)`;
}

/** The wash behind a preset's bracket. Null when the preset has no character. */
export function fxPresetBackground(presetId: string): string | null {
  const style = FX_PRESET_STYLE[presetId];
  return style ? fxTintWash(style.color) : null;
}
