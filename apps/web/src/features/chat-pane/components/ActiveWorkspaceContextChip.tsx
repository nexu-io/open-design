import type { WorkspaceContextItem } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import { workspaceContextIcon, workspaceContextOpenTarget, workspaceContextTitle } from '../rules';

export function ActiveWorkspaceContextChip({
  item,
  onOpen,
}: {
  item: WorkspaceContextItem;
  onOpen?: (name: string) => void;
}) {
  const target = workspaceContextOpenTarget(item);
  const content = (
    <>
      <span className="msg-plugin-chip__icon" aria-hidden>
        <Icon name={workspaceContextIcon(item)} size={12} />
      </span>
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Current</span>
        <span className="msg-plugin-chip__title">{item.label}</span>
      </span>
    </>
  );
  if (!target || !onOpen) {
    return (
      <div
        className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind}`}
        data-testid="msg-workspace-context-chip"
        title={workspaceContextTitle(item)}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind} msg-plugin-chip--action`}
      data-testid="msg-workspace-context-chip"
      title={workspaceContextTitle(item)}
      onClick={() => onOpen(target)}
    >
      {content}
    </button>
  );
}
