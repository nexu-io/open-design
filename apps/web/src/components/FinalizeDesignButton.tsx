// "Finalize design package" toolbar action — #451. Triggers the
// daemon's POST /api/projects/:id/finalize/anthropic, which
// synchronously synthesizes DESIGN.md from the project transcript +
// active design system + current artifact (route owned by PR #832,
// merged 2026-05-08 by lefarcen).
//
// Renders three label states based on whether DESIGN.md exists and
// whether it's stale; clicks during a pending request show a spinner
// + cancel link instead. Error toasts are rendered by ProjectView
// (the toolbar wires them through useFinalizeProject's `error`
// surface), so this component intentionally has no toast of its own.

import type { DesignMdState } from '../hooks/useDesignMdState';
import type { FinalizeStatus } from '../hooks/useFinalizeProject';

export interface FinalizeDesignButtonProps {
  designMdState: Pick<DesignMdState, 'exists' | 'isStale'>;
  status: FinalizeStatus;
  onFinalize: () => void;
  onCancel: () => void;
}

export function FinalizeDesignButton({
  designMdState,
  status,
  onFinalize,
  onCancel,
}: FinalizeDesignButtonProps) {
  if (status === 'pending') {
    return (
      <div className="project-actions-button project-actions-button-pending" role="group">
        <span className="project-actions-spinner" aria-hidden="true" />
        <span className="project-actions-label">Finalizing…</span>
        <button
          type="button"
          className="project-actions-link"
          onClick={onCancel}
          aria-label="Cancel finalize"
        >
          Cancel
        </button>
      </div>
    );
  }

  let label: string;
  let variantClass: string;
  if (!designMdState.exists) {
    label = 'Finalize design package';
    variantClass = 'project-actions-button-primary';
  } else if (designMdState.isStale) {
    label = 'Re-finalize (spec is stale)';
    variantClass = 'project-actions-button-warning';
  } else {
    label = 'Re-finalize';
    variantClass = 'project-actions-button-secondary';
  }

  return (
    <button
      type="button"
      className={`project-actions-button ${variantClass}`}
      onClick={onFinalize}
    >
      {label}
    </button>
  );
}
