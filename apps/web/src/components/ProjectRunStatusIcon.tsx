/**
 * The one place a `ProjectDisplayStatus` becomes a glyph.
 *
 * Finished work is a static badge; anything still moving — or stalled in a way
 * the user has to act on — is the same rotating orb in a different colour, so
 * the row reads as one object changing state rather than four unrelated icons.
 *
 * Returns `null` for the statuses that have nothing to say (`not_started`,
 * `canceled`). Callers must still reserve the slot so names stay aligned; that
 * is the caller's layout concern, not this component's.
 */
import type { ProjectDisplayStatus } from '@open-design/contracts';
import { SiriOrb } from './SiriOrb';

/**
 * Recolouring the orb means moving BOTH accent slots, not just `--c1`.
 * `--c2` is the second accent and the outer glow, and the stock palette pairs
 * green `#00FF08` with spring-green `#00FFAE` — a neighbouring hue. Leaving it
 * green while `--c1` turns orange mixes the two into a muddy red-green dot; the
 * pairs below keep each state's two slots in one hue family, the way the
 * original does. Both stay chromatic, as `--c2` requires.
 */
/** Awaiting a reply, or finished with declared work left undone. */
const ATTENTION = { c1: '#EDC337', c2: '#FFE066' };
/** The run failed. */
const FAILED = { c1: '#F8672F', c2: '#FFA94D' };

/**
 * Whether this status draws anything at all.
 *
 * Callers need to know BEFORE rendering: the dropdown only reserves its icon
 * column when at least one row will fill it, so an all-quiet list is not left
 * indented past an empty gutter.
 */
export function hasRunStatusGlyph(status: ProjectDisplayStatus | undefined): boolean {
  return status !== undefined && status !== 'not_started' && status !== 'canceled';
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

export function ProjectRunStatusIcon({ status, size = 14, label }: Props) {
  switch (status) {
    case 'succeeded':
      return <SucceededBadge size={size} label={label} />;
    case 'running':
      return <SiriOrb size={size} state="thinking" label={label} />;
    case 'queued':
      // Same green: it is the same "not finished" family. Only the speed says
      // this one has not actually started turning over yet.
      return <SiriOrb size={size} state="idle" label={label} />;
    case 'awaiting_input':
    case 'incomplete':
      return <SiriOrb size={size} state="idle" colors={ATTENTION} label={label} />;
    case 'failed':
      return <SiriOrb size={size} state="idle" colors={FAILED} label={label} />;
    case 'not_started':
    case 'canceled':
      return null;
    default:
      return null;
  }
}
