import type { ProjectDisplayStatus } from '@open-design/contracts';
import { useT } from '../../i18n';
import { STATUS_LABEL_KEYS } from '../../state/projectRunStatus';
import { Icon } from '../Icon';
import { hasRunStatusGlyph, ProjectRunStatusIcon } from '../ProjectRunStatusIcon';

/** The selectable project row; menus and previews belong to its parent row. */
export function RailRecentItem({
  name,
  selected,
  opening,
  expanded,
  runStatus,
  showLeadingIcon,
  onOpen,
}: {
  name: string;
  selected: boolean;
  opening: boolean;
  expanded?: boolean;
  runStatus?: ProjectDisplayStatus;
  showLeadingIcon: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={`entry-nav-rail__recent-item${opening || selected ? ' is-active' : ''}`}
      aria-current={selected ? 'page' : undefined}
      aria-busy={opening || undefined}
      onClick={onOpen}
      aria-expanded={expanded}
      data-testid="entry-nav-recent-item"
    >
      {showLeadingIcon ? (
        <span className="entry-nav-rail__recent-icon">
          {runStatus && runStatus !== 'succeeded' && hasRunStatusGlyph(runStatus) ? (
            <ProjectRunStatusIcon
              status={runStatus}
              size={14}
              label={t(STATUS_LABEL_KEYS[runStatus])}
            />
          ) : (
            <Icon name={expanded ? 'folder-5' : 'folder-3'} size={16} />
          )}
        </span>
      ) : null}
      <span className="entry-nav-rail__recent-name">{name}</span>
      {runStatus === 'succeeded' ? (
        <span
          className="entry-nav-rail__recent-unread"
          role="img"
          aria-label={t(STATUS_LABEL_KEYS.succeeded)}
          title={t(STATUS_LABEL_KEYS.succeeded)}
          data-testid="entry-nav-recent-unread"
        />
      ) : null}
    </button>
  );
}
