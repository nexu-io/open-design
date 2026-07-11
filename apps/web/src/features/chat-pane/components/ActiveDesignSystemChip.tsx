import type { DesignSystemSummary } from '../../../types';

export function ActiveDesignSystemChip({
  system,
  onOpenDetails,
}: {
  system: DesignSystemSummary;
  onOpenDetails?: (system: DesignSystemSummary) => void;
}) {
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Design System</span>
        <span className="msg-plugin-chip__title">{system.title}</span>
      </span>
      {system.category ? (
        <span className="msg-plugin-chip__task">{system.category}</span>
      ) : null}
    </>
  );
  if (!onOpenDetails) {
    return (
      <div className="msg-plugin-chip msg-plugin-chip--design-system" data-testid="msg-design-system-chip">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="msg-plugin-chip msg-plugin-chip--design-system msg-plugin-chip--action"
      data-testid="msg-design-system-chip"
      title={system.title}
      onClick={() => onOpenDetails(system)}
    >
      {content}
    </button>
  );
}
