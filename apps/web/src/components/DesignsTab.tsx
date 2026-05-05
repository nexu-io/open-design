import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { deleteLiveArtifact, fetchLiveArtifacts } from '../providers/registry';
import type {
  DesignSystemSummary,
  LiveArtifactSummary,
  Project,
  ProjectDisplayStatus,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';

type SubTab = 'recent' | 'yours';
type ViewMode = 'grid' | 'kanban';

type DesignListItem =
  | { type: 'project'; project: Project; updatedAt: number }
  | { type: 'live-artifact'; project: Project; liveArtifact: LiveArtifactSummary; updatedAt: number };

const DESIGNS_VIEW_STORAGE_KEY = 'od:designs:view';

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
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDelete: (id: string) => void;
}

export function DesignsTab({
  projects,
  skills,
  designSystems,
  onOpen,
  onOpenLiveArtifact,
  onDelete,
}: Props) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [sub, setSub] = useState<SubTab>('recent');
  const [liveArtifactsByProject, setLiveArtifactsByProject] = useState<Record<string, LiveArtifactSummary[]>>({});
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      const storedView = window.localStorage.getItem(DESIGNS_VIEW_STORAGE_KEY);
      return storedView === 'grid' || storedView === 'kanban' ? storedView : 'grid';
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    let cancelled = false;
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) {
      setLiveArtifactsByProject({});
      return;
    }

    void Promise.all(
      projectIds.map(async (projectId) => [projectId, await fetchLiveArtifacts(projectId)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setLiveArtifactsByProject(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESIGNS_VIEW_STORAGE_KEY, view);
    } catch {}
  }, [view]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list: DesignListItem[] = projects.map((project) => ({
      type: 'project',
      project,
      updatedAt: project.updatedAt,
    }));
    const liveItems = projects.flatMap((project) =>
      (liveArtifactsByProject[project.id] ?? []).map((liveArtifact) => ({
        type: 'live-artifact' as const,
        project,
        liveArtifact,
        updatedAt: Date.parse(liveArtifact.updatedAt) || project.updatedAt,
      })),
    );
    list = [...list, ...liveItems];
    if (sub === 'recent') list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list;
    return list.filter((item) => {
      if (item.project.name.toLowerCase().includes(q)) return true;
      return item.type === 'live-artifact' && item.liveArtifact.title.toLowerCase().includes(q);
    });
  }, [projects, liveArtifactsByProject, filter, sub]);

  const filteredProjects = useMemo(
    () => filtered.filter((item): item is Extract<DesignListItem, { type: 'project' }> => item.type === 'project'),
    [filtered],
  );

  const skillName = (id: string | null) => skills.find((s) => s.id === id)?.name ?? '';
  const dsName = (id: string | null) => designSystems.find((d) => d.id === id)?.title ?? '';
  const handleDeleteLiveArtifact = async (projectId: string, artifact: LiveArtifactSummary) => {
    if (!confirm(`${t('common.delete')} "${artifact.title}"?`)) return;
    const ok = await deleteLiveArtifact(projectId, artifact.id);
    if (!ok) return;
    setLiveArtifactsByProject((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).filter((candidate) => candidate.id !== artifact.id),
    }));
  };

  return (
    <div className={`tab-panel${view === 'kanban' ? ' design-kanban-view' : ''}`}>
      <div className="tab-panel-toolbar">
        <div className="toolbar-left">
          <div className="subtab-pill" role="group" aria-label={t('designs.filterAria')}>
            <button aria-pressed={sub === 'recent'} className={sub === 'recent' ? 'active' : ''} onClick={() => setSub('recent')}>
              {t('designs.subRecent')}
            </button>
            <button aria-pressed={sub === 'yours'} className={sub === 'yours' ? 'active' : ''} onClick={() => setSub('yours')}>
              {t('designs.subYours')}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="toolbar-search">
            <span className="search-icon" aria-hidden>
              <Icon name="search" size={13} />
            </span>
            <input placeholder={t('designs.searchPlaceholder')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="subtab-pill" role="group" aria-label={t('designs.viewToggleAria')}>
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
        <div className="tab-empty">{projects.length === 0 ? t('designs.emptyNoProjects') : t('designs.emptyNoMatch')}</div>
      ) : view === 'grid' ? (
        <div className="design-grid">
          {filtered.map((item) => {
            const p = item.project;
            const skill = skillName(p.skillId);
            const ds = dsName(p.designSystemId);
            if (item.type === 'live-artifact') {
              const artifact = item.liveArtifact;
              return (
                <div
                  key={`live:${artifact.id}`}
                  className={`design-card live-artifact-card status-${artifact.status} refresh-${artifact.refreshStatus}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenLiveArtifact(p.id, artifact.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenLiveArtifact(p.id, artifact.id);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="design-card-close"
                    title={t('common.delete')}
                    aria-label={`${t('common.delete')} ${artifact.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteLiveArtifact(p.id, artifact);
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                  <div className="design-card-thumb live-artifact-thumb" aria-hidden>
                    <span className="live-artifact-thumb-glyph">●</span>
                  </div>
                  <div className="design-card-meta-block">
                    <LiveArtifactBadges className="design-card-badges" status={artifact.status} refreshStatus={artifact.refreshStatus} />
                    <div className="design-card-name" title={artifact.title}>{artifact.title}</div>
                    <div className="design-card-meta">
                      <span className="ds">{p.name}</span>
                      {' · '}
                      {artifactStatusLabel(artifact.status, artifact.refreshStatus, t)}
                      {' · '}
                      {relativeTime(item.updatedAt, t)}
                    </div>
                  </div>
                </div>
              );
            }

            const liveCount = liveArtifactsByProject[p.id]?.length ?? 0;
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
                    if (confirm(t('designs.deleteConfirm', { name: p.name }))) onDelete(p.id);
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
                <div className="design-card-thumb" aria-hidden>
                  {liveCount > 0 ? <span className="design-live-count">{t('designs.liveCount', { n: liveCount })}</span> : null}
                </div>
                <div className="design-card-meta-block">
                  <div className="design-card-name" title={p.name}>{p.name}</div>
                  <div className="design-card-meta">
                    {ds ? <span className="ds">{ds}</span> : <span>{t('designs.cardFreeform')}</span>}
                    {skill ? ` · ${skill}` : ''}
                    {' · '}
                    <span className={`design-card-status design-card-status-${status}`}>{statusLabel(status, t)}</span>
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
            const colProjects = filteredProjects.filter((item) => normalizeStatus(item.project.status?.value ?? 'not_started') === status);
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
                    colProjects.map(({ project: p }) => {
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
                              if (confirm(t('designs.deleteConfirm', { name: p.name }))) onDelete(p.id);
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

function normalizeStatus(status: ProjectDisplayStatus): Exclude<ProjectDisplayStatus, 'queued'> {
  return status === 'queued' ? 'running' : status;
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

function artifactStatusLabel(
  status: LiveArtifactSummary['status'],
  refreshStatus: LiveArtifactSummary['refreshStatus'],
  t: ReturnType<typeof useT>,
): string {
  if (status === 'archived') return t('designs.statusArchived');
  if (status === 'error') return t('designs.statusError');
  if (refreshStatus === 'running') return t('designs.statusRefreshing');
  if (refreshStatus === 'failed') return t('designs.statusRefreshFailed');
  if (refreshStatus === 'succeeded') return t('designs.statusRefreshed');
  return t('designs.statusLive');
}
