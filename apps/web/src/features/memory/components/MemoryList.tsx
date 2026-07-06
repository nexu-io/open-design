// Dumb panel for the saved-memory records: counts, the type-filter pills, the
// extraction clear/refresh toolbar, and the unified list (saved entries + the
// visible extraction rows). Rendering only — every list, count, and handler is
// supplied by the orchestrator's entries/extractions hooks.
import { useMemo, type MutableRefObject } from 'react';
import type {
  MemoryEntrySummary,
  MemoryExtractionRecord,
  MemoryType,
} from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import { useT } from '../../../i18n';
import { TYPES } from '../constants';
import { memoryTypeLabels } from '../formatters';
import { MemoryEntryCard } from './MemoryEntryCard';
import { MemoryExtractionCard } from './MemoryExtractionCard';

export function MemoryList({
  sectionRef,
  entries,
  filtered,
  visibleExtractions,
  filter,
  onFilterChange,
  unifiedMemoryCount,
  onClearExtractions,
  onRefreshExtractions,
  isRefreshing,
  previewId,
  previewBody,
  nowClock,
  onOpenPreview,
  onStartEdit,
  onDeleteEntry,
  onDeleteExtraction,
}: {
  sectionRef: MutableRefObject<HTMLElement | null>;
  entries: MemoryEntrySummary[];
  filtered: MemoryEntrySummary[];
  visibleExtractions: MemoryExtractionRecord[];
  filter: 'all' | MemoryType;
  onFilterChange: (filter: 'all' | MemoryType) => void;
  unifiedMemoryCount: number;
  onClearExtractions: () => void;
  onRefreshExtractions: () => void;
  isRefreshing: boolean;
  previewId: string | null;
  previewBody: string | null;
  nowClock: number;
  onOpenPreview: (id: string) => void;
  onStartEdit: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onDeleteExtraction: (id: string) => void;
}) {
  const t = useT();
  const typeLabel = useMemo(() => memoryTypeLabels(t), [t]);
  return (
    <section ref={sectionRef} className="settings-section settings-section-card memory-records-section">
      <div className="memory-management-panel">
        <div className="memory-subsection-head">
          <div>
            <h4>Saved memory</h4>
            <p className="hint">
              Saved facts, preferences, and project context available to future chats.
            </p>
          </div>
          <div className="memory-management-counts">
            <span className="memory-source-badge">
              {entries.length} saved
            </span>
            {visibleExtractions.length > 0 ? (
              <span className="memory-source-badge">
                {visibleExtractions.length} extraction{visibleExtractions.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="library-toolbar is-row">
          <div className="library-filters">
            <button
              type="button"
              className={`filter-pill${filter === 'all' ? ' active' : ''}`}
              onClick={() => onFilterChange('all')}
            >
              {t('settings.memoryAll')}
              <span className="filter-pill-count">
                {entries.length + visibleExtractions.length}
              </span>
            </button>
            {TYPES.map((type) => {
              const count = entries.filter((e) => e.type === type).length;
              if (count === 0 && filter !== type) return null;
              return (
                <button
                  key={type}
                  type="button"
                  className={`filter-pill${filter === type ? ' active' : ''}`}
                  onClick={() => onFilterChange(type)}
                >
                  {typeLabel[type]}
                  <span className="filter-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="memory-management-actions">
            {visibleExtractions.length > 0 ? (
              <button
                type="button"
                className="ghost memory-clear-extractions"
                onClick={() => onClearExtractions()}
                title={t('settings.memoryExtractionsClearTitle')}
              >
                <Icon name="close" size={12} />
                <span>{t('settings.memoryExtractionsClear')}</span>
              </button>
            ) : null}
            {visibleExtractions.length > 0 ? (
              <button
                type="button"
                className="ghost memory-refresh-extractions"
                onClick={() => onRefreshExtractions()}
                disabled={isRefreshing}
                title={t('settings.memoryExtractionsRefresh')}
              >
                <Icon
                  name="refresh"
                  size={12}
                  className={isRefreshing ? 'icon-spin' : ''}
                />
                <span>
                  {isRefreshing
                    ? t('settings.memoryExtractionsRefreshing')
                    : t('settings.memoryExtractionsRefresh')}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="library-content memory-unified-list">
          {unifiedMemoryCount === 0 ? (
            /*
              Empty state — the previous one inlined two side-by-side
              <code> snippets ("记住：用户偏好深色主题 / I prefer dark
              mode") which read like duelling locales and made the user
              wonder if the chips were tap-to-prefill or just decorative.
              We now show one clear "no rows yet" line and a one-sentence
              primer that explains the mechanism (talk in chat, fact gets
              extracted) with a single example. Inline English; PR-time
              translation sweep can lift this into the dictionary.
            */
            <div className="library-empty">
              <p className="library-empty-title">
                {t('settings.memoryEmpty')}
              </p>
              <p className="library-empty-hint">
                Tell the assistant a fact in chat — e.g.{' '}
                <code>I prefer dark mode</code> — and it will be saved
                here automatically.
              </p>
            </div>
          ) : (
            <>
              {filtered.map((entry) => (
                <MemoryEntryCard
                  key={entry.id}
                  entry={entry}
                  previewId={previewId}
                  previewBody={previewBody}
                  onOpenPreview={onOpenPreview}
                  onStartEdit={onStartEdit}
                  onDelete={onDeleteEntry}
                />
              ))}
              {visibleExtractions.map((record) => (
                <MemoryExtractionCard
                  key={record.id}
                  record={record}
                  nowClock={nowClock}
                  onOpenPreview={onOpenPreview}
                  onDelete={onDeleteExtraction}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
