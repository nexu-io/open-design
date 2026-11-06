// "Continue in CLI" toolbar action — #451. Three states:
//
//   - DESIGN.md missing → disabled with a tooltip pointing at the
//     Finalize action so the user learns the workflow rather than
//     having the prerequisite hidden.
//   - DESIGN.md present + fresh → enabled, plain label.
//   - DESIGN.md present + stale → enabled with a warning chip; the
//     chip text is canonical per spec §4.6 ("Spec is stale —
//     regenerate?"). A "regenerate?" affordance can land in a
//     follow-up; v1 keeps the chip text-only so the user can still
//     proceed with Continue in CLI from a stale spec if they
//     intentionally want the captured intent.
//
// The actual click handler lives in ProjectView (it owns the
// resolvedDir + clipboard + terminal-launch + toast wiring) and is
// passed in as `onClick`. Disabled state short-circuits in the
// component itself.

import type { DesignMdState, DesignMdStaleReason } from '../hooks/useDesignMdState';

const STALE_CHIP_TEXT = 'Spec is stale — regenerate?';
// Round 7 (mrcfps @ useDesignMdState.ts:160): malformed provenance
// timestamps used to silently report fresh; they now surface as a
// distinct chip so the user knows the freshness signal is degraded
// rather than green.
const UNKNOWN_PROVENANCE_CHIP_TEXT = 'Spec freshness unknown — regenerate to refresh signal';
const DISABLED_TOOLTIP = 'Finalize the design package first.';

function chipTextForReason(reason: DesignMdStaleReason): string {
  return reason === 'unknown-provenance' ? UNKNOWN_PROVENANCE_CHIP_TEXT : STALE_CHIP_TEXT;
}

export interface ContinueInCliButtonProps {
  designMdState: Pick<DesignMdState, 'exists' | 'isStale' | 'staleReason'>;
  onClick: () => void | Promise<void>;
}

export function ContinueInCliButton({ designMdState, onClick }: ContinueInCliButtonProps) {
  if (!designMdState.exists) {
    // Native `<button disabled>` does not fire hover or focus events
    // in the browsers we ship against, so a `title` tooltip on the
    // disabled button never surfaces — that hides the prerequisite
    // guidance that the spec explicitly wanted discoverable. Render
    // the help text as a visible sibling instead, plus an
    // aria-describedby link so assistive tech announces the same
    // explanation when the disabled button gets focused.
    return (
      <span className="project-actions-button-group">
        <button
          type="button"
          className="project-actions-button project-actions-button-secondary"
          disabled
          aria-describedby="continue-in-cli-disabled-hint"
        >
          Continue in CLI
        </button>
        <span
          id="continue-in-cli-disabled-hint"
          className="project-actions-disabled-hint"
          role="note"
        >
          {DISABLED_TOOLTIP}
        </span>
      </span>
    );
  }

  return (
    <span className="project-actions-button-group">
      <button
        type="button"
        className="project-actions-button project-actions-button-secondary"
        onClick={() => {
          void onClick();
        }}
      >
        Continue in CLI
      </button>
      {designMdState.isStale ? (
        <span className="project-actions-chip" role="note" aria-label="Spec staleness">
          {chipTextForReason(designMdState.staleReason)}
        </span>
      ) : null}
    </span>
  );
}
