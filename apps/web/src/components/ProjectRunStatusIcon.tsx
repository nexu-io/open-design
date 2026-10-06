/**
 * The one place a `ProjectDisplayStatus` becomes a glyph — and the one place
 * the two surfaces that list projects (the rail's 最近项目 rows and the project
 * switcher above the chat) get their shared marks from, so they can never tell
 * different stories about the same project.
 *
 * A run that was interrupted is a static badge; a run still moving — or paused
 * on a question the user has to answer — is the same rotating orb in a
 * different colour, so the row reads as one object changing state rather than
 * a handful of unrelated icons. The split is "is it still going", not "did it
 * go well": spinning a stopped run's orb is the one thing this component must
 * never do, because the rotation itself is what says "working".
 *
 * Speed carries only one distinction, and it is not urgency: `queued` turns
 * slowly because it has not started. Everything else that is live — running
 * and awaiting a reply alike — turns at the same rate, so a colour change
 * never reads as a change of pace.
 *
 * A FINISHED run is not a glyph in the lead slot at all (OPEND-3133): the row
 * keeps the folder every idle project leads with (`ProjectFolderGlyph`) and
 * says "done, unread" with a small dot at its END (`ProjectCompletionDot`),
 * which opening the project spends. `hasRunStatusGlyph` / `hasCompletionNotice`
 * are the two questions a caller asks to pick between the three.
 *
 * Returns `null` for `not_started` and `succeeded`, which draw nothing here.
 * Callers must still reserve the slot so names stay aligned; that is the
 * caller's layout concern, not this component's.
 */
import type { ProjectDisplayStatus } from '@open-design/contracts';
import { Icon } from './Icon';
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
 * Whether this status puts a glyph in the row's LEAD slot.
 *
 * Callers need to know BEFORE rendering: when this says no, the slot holds the
 * folder (`ProjectFolderGlyph`) instead, so the column is never empty and
 * names stay on one edge. `succeeded` answers no on purpose — a finished run
 * keeps the folder and reports through {@link hasCompletionNotice} instead.
 */
export function hasRunStatusGlyph(status: ProjectDisplayStatus | undefined): boolean {
  return status !== undefined && status !== 'not_started' && status !== 'succeeded';
}

/**
 * Whether this status is a finished run the user has not looked at yet: the
 * one case that draws the unread dot at the row's END (`ProjectCompletionDot`)
 * rather than a glyph in its lead slot.
 *
 * The "not looked at yet" half is the store's, not this function's: the shared
 * run-status feed (`useProjectRunStatuses`) drops a `succeeded` the user has
 * acknowledged by opening the project, so a caller never sees it here. One
 * store, one rule, both surfaces.
 */
export function hasCompletionNotice(status: ProjectDisplayStatus | undefined): boolean {
  return status === 'succeeded';
}

interface Props {
  status: ProjectDisplayStatus;
  size?: number;
  /** Localized status name, announced to assistive tech. */
  label?: string;
}

/**
 * Interrupted: the run stopped before it delivered — it failed, it was
 * canceled, or it ended with declared work still undone. One mark for all
 * three, because the row only has to say "this did not finish"; the reason
 * belongs to the status text next to it, not to a colour the user has to
 * decode.
 *
 * A disc with the glyph knocked out of it, the mark carried by the counter
 * rather than the disc. The rect backs ONLY that counter; the disc paints
 * everything else, so its bounds never need to match the artwork. Two
 * hardcoded fills, so it cannot go through `Icon` — that component emits a
 * single `currentColor` path; standalone two-colour marks are the repo's
 * convention here (see PlanWordmark, EditorIcon).
 *
 * The viewBox is the disc's own bounds (a circle of r=10 centred at 12,12),
 * NOT the artwork's 24-unit frame: at `size` 14 that frame left the disc
 * drawing 11.7px while the running orb — which fills its box edge to edge —
 * drew the full 14, so "running" and "failed" were visibly different sizes in
 * the same column (per product: 运行中和完成的 icon 大小一样 14px). Cropping to
 * the ink makes `size` mean the same thing for both.
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

/**
 * The glyph a project leads with when it has nothing live to report
 * (OPEND-3129): the folder — the same mark the workspace tab strip and the
 * switcher trigger already draw for a project tab.
 *
 * ONE component for both surfaces that list projects — the rail's 最近项目
 * rows and the project switcher above the chat — for the same reason those two
 * share `ProjectRunStatusIcon`: an idle project must look like one and the same
 * thing wherever the user finds it. The first pass at this unified the two on
 * a chat-bubble mark; product and design settled on the folder instead, so
 * both slots now draw this. Pairs with `hasRunStatusGlyph`: callers draw this
 * exactly when that says there is no live status to draw — a finished, unread
 * run included, which keeps the folder and adds `ProjectCompletionDot`.
 *
 * `currentColor` through `Icon`, so each slot keeps its own ink — the rail
 * row's, hover included, and the switcher's muted text. `size` likewise: each
 * slot keeps the box it always had.
 */
export function ProjectFolderGlyph({ size = 14 }: { size?: number }) {
  return <Icon name="folder" size={size} data-testid="project-folder-glyph" />;
}

/**
 * "Finished, and you have not looked yet" (OPEND-3133): a 6px disc in the
 * design's blue at the END of the row — `margin-left: auto` in the caller's
 * stylesheet, so it sits on the row's right edge whatever the name's length.
 * The folder stays in the lead slot; this is a notice beside the name, not a
 * replacement for the glyph, which is why it is not a `ProjectRunStatusIcon`
 * case.
 *
 * Announced as the finished status it stands for (`role="img"` + the
 * localized label), the way the lead-slot glyphs are, so a screen reader
 * hears "Completed" here exactly as it did when this was a ✓. The caller
 * names the class and test id because each surface's stylesheet and specs
 * address it by their own convention; the shape and the semantics are shared.
 */
export function ProjectCompletionDot({
  className,
  label,
  testId,
}: {
  className: string;
  /** Localized status name, announced to assistive tech. */
  label: string;
  testId: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
    />
  );
}

export function ProjectRunStatusIcon({ status, size = 14, label }: Props) {
  switch (status) {
    case 'succeeded':
      // Not a lead-slot glyph: the row keeps its folder and reports through
      // `ProjectCompletionDot` at its end (see `hasCompletionNotice`).
      return null;
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
