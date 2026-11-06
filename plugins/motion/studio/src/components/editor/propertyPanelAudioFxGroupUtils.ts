/**
 * Small clip-timing helpers shared by the FX group and its carve/levelling
 * hooks — split out of `propertyPanelAudioFxGroup.tsx` so each file that needs
 * "where does this clip sit" does not have to redefine it.
 */

/** Where a clip starts on the timeline, in seconds. */
export function clipStart(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A clip's span, with an unwritten duration left unbounded rather than zero. */
export function spanOf(
  start: string | null | undefined,
  duration: string | null | undefined,
): { start: number; duration: number | null } {
  const n =
    duration === null || duration === undefined || duration === "" ? Number.NaN : Number(duration);
  return { start: clipStart(start), duration: Number.isFinite(n) ? n : null };
}
