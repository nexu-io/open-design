/**
 * The one place a `ProjectDisplayStatus` becomes a glyph.
 *
 * A run that has stopped is a static badge; a run still moving — or paused on a
 * question the user has to answer — is the same rotating orb in a different
 * colour, so the row reads as one object changing state rather than a handful
 * of unrelated icons. The split is "is it still going", not "did it go well":
 * spinning a stopped run's orb is the one thing this component must never do,
 * because the rotation itself is what says "working".
 *
 * Speed carries only one distinction, and it is not urgency: `queued` turns
 * slowly because it has not started. Everything else that is live — running
 * and awaiting a reply alike — turns at the same rate, so a colour change
 * never reads as a change of pace.
 *
 * Returns `null` only for `not_started`, which has nothing to say. Callers must
 * still reserve the slot so names stay aligned; that is the caller's layout
 * concern, not this component's.
 */
import type { ProjectDisplayStatus } from '@open-design/contracts';
import { SiriOrb } from './SiriOrb';

/**
 * Awaiting a reply: still live, but it is the user's move.
 *
 * A three-step warm ramp, ordered by the role each slot plays rather than by
 * hue: orange is the base, amber the second accent AND the outer bloom, gold
 * the narrow specular glint. Lightness climbs across them — OKLCH L 75.2 →
 * 83.1 → 85.0 — so the brightest slot is the one that draws the highlight,
 * which is what makes the dot read as a sphere at 14px.
 *
 * Gold in `c5` is what buys the glint back: `literal` bans the stock white
 * highlights because screen-blending white raises this accent's mid green
 * channel into yellow, but a lighter tone named outright is a colour the
 * design chose, not one the compositor invented.
 *
 * `literal` is not optional here. Without it the orb edits whatever it is
 * given — three slots still hold green, and the highlight, saturation and
 * texture passes each push a mid-channel accent off its hue. Not theoretical:
 * this palette came out green, then yellow, then red as each was found.
 */
const ATTENTION = { c1: '#FF8D02', c2: '#EDC337', c5: '#FFC400' };

/**
 * Whether this status draws anything at all.
 *
 * Callers need to know BEFORE rendering: the dropdown only reserves its icon
 * column when at least one row will fill it, so an all-quiet list is not left
 * indented past an empty gutter.
 */
export function hasRunStatusGlyph(status: ProjectDisplayStatus | undefined): boolean {
  return status !== undefined && status !== 'not_started';
}

interface Props {
  status: ProjectDisplayStatus;
  size?: number;
  /** Localized status name, announced to assistive tech. */
  label?: string;
}

/**
 * Completed: a dark disc with the checkmark knocked out of it. Two hardcoded
 * fills, so it cannot go through `Icon` — that component emits a single
 * `currentColor` path. Standalone two-colour marks are the repo's convention
 * here (see PlanWordmark, EditorIcon).
 *
 * The viewBox is the disc's own bounds (a circle of r=10 centred at 12,12),
 * NOT the artwork's 24-unit frame: at `size` 14 that frame left the disc
 * drawing 11.7px while the running orb — which fills its box edge to edge —
 * drew the full 14, so "running" and "done" were visibly different sizes in
 * the same column (per product: 运行中和完成的 icon 大小一样 14px). Cropping to
 * the ink makes `size` mean the same thing for both.
 */
function SucceededBadge({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="2 2 20 20"
      fill="none"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        fill="#202020"
      />
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM17.4571 9.45711L11 15.9142L6.79289 11.7071L8.20711 10.2929L11 13.0858L16.0429 8.04289L17.4571 9.45711Z"
        fill="#00FF08"
      />
    </svg>
  );
}

/**
 * Interrupted: the run stopped before it delivered — it failed, it was
 * canceled, or it ended with declared work still undone. One mark for all
 * three, because the row only has to say "this did not finish"; the reason
 * belongs to the status text next to it, not to a colour the user has to
 * decode.
 *
 * Built as the succeeded badge's twin — same disc, same knocked-out glyph, same
 * cropped viewBox so `size` means the same drawn pixels in a mixed column —
 * with the mark itself carried by the counter rather than the disc. The rect
 * backs ONLY that counter; the disc paints everything else, so its bounds never
 * need to match the artwork.
 */
function InterruptedBadge({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="2 2 20 20"
      fill="none"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect x="7" y="6" width="10" height="13" fill="#121212" />
      <path
        d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 9.5C12.8284 9.5 13.5 8.82843 13.5 8C13.5 7.17157 12.8284 6.5 12 6.5C11.1716 6.5 10.5 7.17157 10.5 8C10.5 8.82843 11.1716 9.5 12 9.5ZM14 15H13V10.5H10V12.5H11V15H10V17H14V15Z"
        fill="#F34801"
      />
    </svg>
  );
}

export function ProjectRunStatusIcon({ status, size = 14, label }: Props) {
  switch (status) {
    case 'succeeded':
      return <SucceededBadge size={size} label={label} />;
    case 'failed':
    case 'canceled':
    case 'incomplete':
      return <InterruptedBadge size={size} label={label} />;
    case 'running':
      return <SiriOrb size={size} state="thinking" label={label} />;
    case 'queued':
      // Same green as running: it is the same "not finished" family. The
      // slower turn is the only thing saying this one has not started yet, so
      // `idle` here is load-bearing.
      return <SiriOrb size={size} state="idle" label={label} />;
    case 'awaiting_input':
      // Running's speed, deliberately (per product). A pending question is not
      // a paused run — the agent is live and the work is mid-flight, so the
      // orb keeps working; colour alone carries "your move". Slowing it here
      // would say "stalled", which is what `queued` means.
      return <SiriOrb size={size} state="thinking" colors={ATTENTION} literal label={label} />;
    case 'not_started':
      return null;
    default:
      return null;
  }
}
