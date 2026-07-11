// Workspace tab-bar chip: icon, label, close button, drag handlers, live-
// artifact badges. Fully dumb (props in, JSX out) — moved verbatim out of
// `components/FileWorkspace.tsx` as part of the ADR-0002 vertical-slice
// decomposition.
import type { DragEvent as ReactDragEvent } from 'react';
import { useT } from '../../../i18n';
import { Icon, type IconName } from '../../../components/Icon';
import { LiveArtifactBadges } from '../../../components/LiveArtifactBadges';
import type { LiveArtifactWorkspaceEntry, ProjectFile } from '../../../types';
import { kindIconName } from '../rules';
import type { TabDropEdge } from '../types';

export function Tab({
  label,
  meta,
  title,
  active,
  onActivate,
  onClose,
  closable = true,
  kind,
  iconNameOverride,
  liveArtifact,
  draggable = false,
  dragging = false,
  dragOverEdge,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  label: string;
  meta?: string;
  title?: string;
  active: boolean;
  onActivate: () => void;
  onClose?: () => void;
  closable?: boolean;
  kind?: ProjectFile['kind'] | 'live-artifact' | 'browser';
  /** Force a specific icon (e.g. non-file tabs like terminal:<id> / chat:<id>). */
  iconNameOverride?: IconName;
  liveArtifact?: LiveArtifactWorkspaceEntry;
  draggable?: boolean;
  dragging?: boolean;
  dragOverEdge?: TabDropEdge | null;
  onDragStart?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const t = useT();
  const iconName = iconNameOverride ?? kindIconName(kind);
  const tabTitle = title ?? (meta ? `${label} ${meta}` : label);
  return (
    <div
      className={[
        'ws-tab',
        'od-tooltip',
        meta ? 'has-meta' : '',
        kind === 'live-artifact' ? 'live-artifact-tab' : '',
        kind === 'browser' ? 'browser-tab' : '',
        active ? 'active' : '',
        draggable ? 'draggable' : '',
        dragging ? 'dragging' : '',
        dragOverEdge ? `drag-over-${dragOverEdge}` : '',
      ].filter(Boolean).join(' ')}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={tabTitle}
      data-tooltip={tabTitle}
      data-tooltip-placement="bottom"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDragLeave={draggable ? onDragLeave : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {iconName ? (
        <span className="tab-icon" aria-hidden>
          <Icon name={iconName} size={13} />
        </span>
      ) : null}
      <span className="ws-tab-text">
        <span className="ws-tab-label">{label}</span>
        {meta ? <span className="ws-tab-meta">{meta}</span> : null}
      </span>
      {liveArtifact ? (
        <LiveArtifactBadges
          compact
          className="ws-live-artifact-badges"
          status={liveArtifact.status}
          refreshStatus={liveArtifact.refreshStatus}
        />
      ) : null}
      {closable && onClose ? (
        <button
          type="button"
          className="ws-tab-close od-tooltip"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={t('workspace.closeTab')}
          data-tooltip={t('workspace.closeTab')}
          data-tooltip-placement="bottom"
          aria-label={t('workspace.closeTab')}
        >
          <Icon name="close" size={11} />
        </button>
      ) : null}
    </div>
  );
}
