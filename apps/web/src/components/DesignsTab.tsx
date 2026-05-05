import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary, Project, ProjectDisplayStatus, SkillSummary } from '../types';
import { Icon } from './Icon';

// Wix Japan rebrand: each design card asks the daemon for the deck's
// first-page thumbnail URL on mount. The endpoint is silent (404) for
// projects without a deckId — we fall back to the folder icon. URL is
// served from a 25-minute daemon-side cache so re-renders don't hammer
// Google Slides.
function DesignCardThumb({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/thumbnail`);
        if (!r.ok) return;
        const j = (await r.json()) as { url?: string };
        if (!cancelled && j.url) setUrl(j.url);
      } catch {
        /* fall back to folder icon */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  if (url) {
    return (
      <div className="design-card-thumb design-card-thumb--image" aria-hidden>
        <img src={url} alt="" className="design-card-thumb-img" draggable={false} />
      </div>
    );
  }
  return <div className="design-card-thumb" aria-hidden />;
}

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
            {/* Wix Japan rebrand: removed the "あなたのデザイン"
                sub-tab — every project belongs to the user, so the
                two filters always returned the same list. The
                "最近" pill stays as the implicit default sort. */}
            <button
              aria-pressed={sub === 'recent'}
              className={sub === 'recent' ? 'active' : ''}
              onClick={() => setSub('recent')}
            >
              {t('designs.subRecent')}
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
                <DesignCardThumb projectId={p.id} />
                <div className="design-card-meta-block">
                  <div className="design-card-name" title={p.name}>
                    {humanizeName(p.name)}
                  </div>
                  <div className="design-card-meta">
                    {/* Wix Japan rebrand: card meta is intentionally
                        minimal — designers don't care about skill IDs
                        or status enums. Show design system + last
                        update timestamp; status is omitted because
                        the daemon doesn't currently sync it for
                        externally-spawned projects. */}
                    {ds ? (
                      <span className="ds">{ds}</span>
                    ) : (
                      <span>{t('designs.cardFreeform')}</span>
                    )}
                    {p.status?.updatedAt
                      ? ` · ${relativeTime(p.status.updatedAt, t)}`
                      : p.updatedAt
                      ? ` · ${relativeTime(p.updatedAt, t)}`
                      : ''}
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

// Strip ISO datestamp suffixes ("Wix JA E2E Round 6 2026-05-04T12:30")
// from project names so cards read as "Wix JA E2E Round 6". Future
// project names entered through the form won't have this suffix; this
// helper is mainly for round-trip-friendly display of legacy entries.
function humanizeName(name: string): string {
  if (!name) return name;
  return name.replace(/\s+\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/, '').trim() || name;
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
