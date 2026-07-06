// Dumb card for one saved memory entry: title, description, the preview toggle,
// and edit/delete actions. Preview open/close state and the transport live in
// the orchestrator's entries hook; this renders what it is given.
import type { MemoryEntrySummary } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import { renderMarkdown } from '../../../runtime/markdown';
import { useT } from '../../../i18n';

export function MemoryEntryCard({
  entry,
  previewId,
  previewBody,
  onOpenPreview,
  onStartEdit,
  onDelete,
}: {
  entry: MemoryEntrySummary;
  previewId: string | null;
  previewBody: string | null;
  onOpenPreview: (id: string) => void;
  onStartEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="library-card">
      <div className="library-card-info">
        <div className="library-card-title-row">
          <span className="library-card-name">{entry.name}</span>
        </div>
        <div className="library-card-desc">
          {entry.description || '—'}
        </div>
      </div>
      <div className="memory-card-actions">
        <button
          type="button"
          className="library-card-expand"
          onClick={() => onOpenPreview(entry.id)}
          title={t('settings.memoryPreview')}
        >
          <Icon
            name={previewId === entry.id ? 'chevron-down' : 'chevron-right'}
            size={14}
          />
        </button>
        <button
          type="button"
          className="ghost library-card-action"
          onClick={() => onStartEdit(entry.id)}
          title={t('settings.memoryEdit')}
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          type="button"
          className="ghost library-card-action"
          onClick={() => onDelete(entry.id)}
          title={t('settings.memoryDelete')}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {previewId === entry.id && (
        <div className="library-preview" style={{ width: '100%' }}>
          {previewBody === null ? (
            <p>{t('common.loading')}</p>
          ) : previewBody ? (
            <div className="library-preview-body">
              {renderMarkdown(previewBody)}
            </div>
          ) : (
            <p className="hint">—</p>
          )}
        </div>
      )}
    </div>
  );
}
