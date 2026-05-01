import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary, Project, ProjectDisplayStatus, SkillSummary } from '../types';
import { Icon } from './Icon';

type SubTab = 'recent' | 'yours';

const DESIGNS_VIEW_STORAGE_KEY = 'od:designs:view';

// Single source of truth for the order kanban columns are rendered in and the
// i18n key each status maps to. Keeping this typed as a tuple lets us derive
// both the column list and the `statusLabel` lookup without duplication.
export const STATUS_ORDER = [
  'not_started',
  'running',
  'awaiting_input',
  'succeeded',
  'failed',
  'canceled',
] as const satisfies readonly ProjectDisplayStatus[];

export const STATUS_LABEL_KEYS = {
  not_started: 'designs.status.notStarted',
  queued: 'designs.status.queued',
  running: 'designs.status.running',
  awaiting_input: 'designs.status.awaitingInput',
  succeeded: 'designs.status.succeeded',
  failed: 'designs.status.failed',
  canceled: 'designs.status.canceled',
} as const satisfies Record<ProjectDisplayStatus, Parameters<ReturnType<typeof useT>>[0]>;

interface Props {
  projects: Project[];
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DesignsTab({ projects, skills, designSystems, onOpen, onDelete }: Props) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [sub, setSub] = useState<SubTab>('recent');
  const [view, setView] = useState<'grid' | 'kanban'>(() => {
    if (typeof window === 'undefined') {
      return 'grid';
    }

    try {
      const storedView = window.localStorage.getItem(DESIGNS_VIEW_STORAGE_KEY);
      return storedView === 'grid' || storedView === 'kanban' ? storedView : 'grid';
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(DESIGNS_VIEW_STORAGE_KEY, view);
    } catch {}
  }, [view]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = projects;
    if (sub === 'recent') {
      list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter, sub]);

  const skillName = (id: string | null) => skills.find((s) => s.id === id)?.name ?? '';
  const dsName = (id: string | null) => designSystems.find((d) => d.id === id)?.title ?? '';

  return (
    <div className={`tab-panel${view === 'kanban' ? ' design-kanban-view' : ''}`}>
      <div className="tab-panel-toolbar">
        <div className="toolbar-left">
          <div
            className="subtab-pill"
            role="group"
            aria-label={t('designs.filterAria')}
          >
            <button
              aria-pressed={sub === 'recent'}
              className={sub === 'recent' ? 'active' : ''}
              onClick={() => setSub('recent')}
            >
              {t('designs.subRecent')}
            </button>
            <button
              aria-pressed={sub === 'yours'}
              className={sub === 'yours' ? 'active' : ''}
              onClick={() => setSub('yours')}
            >
              {t('designs.subYours')}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="toolbar-search">
            <span className="search-icon" aria-hidden>
              <Icon name="search" size={13} />
            </span>
            <input
              placeholder={t('designs.searchPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div
            className="subtab-pill"
            role="group"
            aria-label={t('designs.viewToggleAria')}
          >
            <button
              aria-pressed={view === 'grid'}
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
              title={t('designs.viewGrid')}
              data-testid="designs-view-grid"
            >
              <Icon name="grid" size={14} />
            </button>
            <button
              aria-pressed={view === 'kanban'}
              className={view === 'kanban' ? 'active' : ''}
              onClick={() => setView('kanban')}
              title={t('designs.viewKanban')}
              data-testid="designs-view-kanban"
            >
              <Icon name="kanban" size={14} />
            </button>
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="tab-empty">
          {projects.length === 0
            ? t('designs.emptyNoProjects')
            : t('designs.emptyNoMatch')}
        </div>
      ) : view === 'grid' ? (
        <div className="design-grid">
          {filtered.map((p) => {
            const skill = skillName(p.skillId);
            const ds = dsName(p.designSystemId);
            const status = p.status?.value ?? 'not_started';
            return (
              <div
                key={p.id}
                className="design-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(p.id);
                  }
                }}
              >
                <button
                  className="design-card-close"
                  title={t('designs.deleteTitle')}
                  aria-label={t('designs.deleteAria', { name: p.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t('designs.deleteConfirm', { name: p.name }))) {
                      onDelete(p.id);
                    }
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
                <div className="design-card-thumb" aria-hidden />
                <div className="design-card-meta-block">
                  <div className="design-card-name" title={p.name}>{p.name}</div>
                  <div className="design-card-meta">
                    {ds ? (
                      <span className="ds">{ds}</span>
                    ) : (
                      <span>{t('designs.cardFreeform')}</span>
                    )}
                    {skill ? ` · ${skill}` : ''}
                    {' · '}
                    <span className={`design-card-status design-card-status-${status}`}>
                      {statusLabel(status, t)}
                    </span>
                    {p.status?.updatedAt ? ` · ${relativeTime(p.status.updatedAt, t)}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="design-kanban-board">
          {STATUS_ORDER.map((status) => {
            const colProjects = filtered.filter(
              p => ((p.status?.value ?? 'not_started') === 'queued' ? 'running' : (p.status?.value ?? 'not_started')) === status,
            );
            return (
              <div key={status} className="design-kanban-col">
                <div className="design-kanban-header">
                  <span>{statusLabel(status, t)}</span>
                  <span className="design-kanban-count">{colProjects.length}</span>
                </div>
                <div className="design-kanban-list">
                  {colProjects.length === 0 ? (
                    <div className="design-kanban-empty">{t('designs.kanbanEmptyColumn')}</div>
                  ) : (
                    colProjects.map((p) => {
                      const skill = skillName(p.skillId);
                      const ds = dsName(p.designSystemId);
                      return (
                        <div
                          key={p.id}
                          className={`design-kanban-card status-${status}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpen(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpen(p.id);
                            }
                          }}
                        >
                          <button
                            className="design-card-close"
                            title={t('designs.deleteTitle')}
                            aria-label={t('designs.deleteAria', { name: p.name })}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t('designs.deleteConfirm', { name: p.name }))) {
                                onDelete(p.id);
                              }
                            }}
                          >
                            <Icon name="close" size={12} />
                          </button>
                          <div className="design-kanban-card-name" title={p.name}>{p.name}</div>
                          <div className="design-kanban-card-meta">
                            {ds ? <span className="ds">{ds}</span> : <span>{t('designs.cardFreeform')}</span>}
                            {skill ? ` · ${skill}` : ''}
                            {p.status?.updatedAt ? ` · ${relativeTime(p.status.updatedAt, t)}` : ''}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: ProjectDisplayStatus, t: ReturnType<typeof useT>): string {
  return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}
