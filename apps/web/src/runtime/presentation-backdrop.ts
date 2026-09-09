/**
 * When the presentation backdrop is allowed to paint.
 *
 * Promoting the preview to full window changes its layout — `position: fixed;
 * inset: 0` — and paints an opaque black ground in the same style rule. The
 * browser composites the new layer before the document has repainted into it,
 * so the audience sees the black ground alone for a frame or more. Measured on
 * the live product: roughly one entry in six flashed black for ~350 ms, with
 * zero document navigations and zero frame loads — nothing reloaded, the
 * ground simply arrived first. Making the ground transparent removed it in six
 * runs out of six.
 *
 * The ground is not decoration: a slide with a different aspect ratio needs it
 * for the letterbox bars. So it is delayed rather than dropped — the layout
 * change lands first, and the ground follows once the promoted document has
 * had a frame to paint.
 */
export const PRESENTATION_BACKDROP_DELAY_MS = 120;

export type PresentationBackdropPhase =
  /** Not presenting; no ground at all. */
  | 'idle'
  /** Promoted, still transparent so the document shows through immediately. */
  | 'promoting'
  /** Document has painted; the letterbox ground is safe to show. */
  | 'settled';

export function presentationBackdropPhase(input: {
  presenting: boolean;
  promotedAtMs: number | null;
  nowMs: number;
  delayMs?: number;
}): PresentationBackdropPhase {
  if (!input.presenting) return 'idle';
  if (input.promotedAtMs === null) return 'promoting';
  const delay = input.delayMs ?? PRESENTATION_BACKDROP_DELAY_MS;
  return input.nowMs - input.promotedAtMs >= delay ? 'settled' : 'promoting';
}
