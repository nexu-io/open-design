/** What the Motion blur panel reads from and writes to a composition root, and how it describes the preview. */

import type { ElementSnapshot } from "@hyperframes/sdk";
import {
  MOTION_BLUR_ATTR,
  MOTION_BLUR_LIMITS,
  type MotionBlurSettings,
  motionBlurAttributeEdits,
  readMotionBlurSettings,
} from "@hyperframes/core/motion-blur-settings";

export interface CompositionRoot {
  id: string;
  attributes: Readonly<Record<string, string>>;
}

/** The composition's own root: the top-level element that names a composition, else the first. */
export function findCompositionRoot(roots: readonly ElementSnapshot[]): CompositionRoot | null {
  const root = roots.find((el) => "data-composition-id" in el.attributes) ?? roots[0];
  return root ? { id: root.id, attributes: root.attributes } : null;
}

export type RootAttributes = Readonly<Record<string, string>>;

export const settingsOf = (attributes: RootAttributes): MotionBlurSettings =>
  readMotionBlurSettings((name) => attributes[name] ?? null);

/** Only the attributes whose value would change, so a no-op edit writes nothing. */
export function changedEdits(
  attributes: RootAttributes,
  next: MotionBlurSettings,
): Array<{ name: string; value: string | null }> {
  return Object.entries(motionBlurAttributeEdits(next))
    .filter(([name, value]) => (attributes[name] ?? null) !== value)
    .map(([name, value]) => ({ name, value }));
}

/** `attributes` with `edits` applied: a value sets, null removes. */
export function withEdits(
  attributes: RootAttributes,
  edits: ReadonlyArray<{ name: string; value: string | null }>,
): RootAttributes {
  const next: Record<string, string> = { ...attributes };
  for (const { name, value } of edits) {
    if (value === null) delete next[name];
    else next[name] = value;
  }
  return next;
}

/** The blur attributes on the live preview's composition root: what actually runs, after an undo or an outside edit too. */
export function readPreviewRootAttributes(iframe: HTMLIFrameElement | null): RootAttributes | null {
  try {
    const root = iframe?.contentDocument?.querySelector("[data-composition-id]");
    if (!root) return null;
    const found: Record<string, string> = {};
    for (const name of Object.values(MOTION_BLUR_ATTR)) {
      const value = root.getAttribute(name);
      if (value !== null) found[name] = value;
    }
    return found;
  } catch {
    return null;
  }
}

export const sameAttributes = (a: RootAttributes | null, b: RootAttributes | null): boolean =>
  a === b ||
  (a !== null && b !== null && Object.keys({ ...a, ...b }).every((name) => a[name] === b[name]));

export type BlurLevel = "off" | "subtle" | "strong";

export const BLUR_LEVELS: ReadonlyArray<{ level: BlurLevel; label: string }> = [
  { level: "off", label: "Off" },
  { level: "subtle", label: "Subtle" },
  { level: "strong", label: "Strong" },
];

/** Subtle is the default blur; Strong opens the shutter and the samples as far as they go. */
const LEVEL_SETTINGS = {
  subtle: { shutterDeg: MOTION_BLUR_LIMITS.shutterDeg.default, samples: null },
  strong: {
    shutterDeg: MOTION_BLUR_LIMITS.shutterDeg.max,
    samples: MOTION_BLUR_LIMITS.samples.max,
  },
} as const;
/** Halfway between the two shutters: above it a root reads as Strong, so a hand-set 360 reads as Subtle. */
const STRONG_ABOVE = (LEVEL_SETTINGS.subtle.shutterDeg + LEVEL_SETTINGS.strong.shutterDeg) / 2;

export function levelOf(settings: MotionBlurSettings): BlurLevel {
  if (!settings.enabled) return "off";
  return settings.shutterDeg > STRONG_ABOVE ? "strong" : "subtle";
}

/** What choosing `level` changes; blur on turns events on too, and Off leaves the shutter, samples and the rest alone. */
export function patchForLevel(level: BlurLevel): Partial<MotionBlurSettings> {
  return level === "off"
    ? { enabled: false, events: false }
    : { enabled: true, events: true, ...LEVEL_SETTINGS[level] };
}
