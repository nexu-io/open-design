// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { CSSProperties } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { useT } from '../i18n';
import { fetchProjectFiles, fetchProjectFileText, projectFileUrl } from '../providers/registry';
import type { DesignSystemSummary, Project, ProjectDisplayStatus, ProjectFile } from '../types';
import { Icon } from './Icon';
import { InviteDialog } from './InviteDialog';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';
import { useTeamMembers } from '../collab/useTeamMembers';
import { notifyTeamProjectsChanged, useWorkspaceContext } from '../collab/useWorkspaceContext';

/** Which project space this strip renders. Drives the per-card 共享 badge
 *  (hidden in the all-shared team space) and the "{creator}创建" line: 'recent'
 *  = home's mixed private/shared, 'drafts' = the member's own private list,
 *  'team' = the全部项目 grid where every card is a team-shared project. */
export type SpaceKind = 'recent' | 'drafts' | 'team';

interface Props {
  projects: Project[];
  /** Used only to show a "Published" status for design-system projects whose
   *  backing system is published (independent of the project's run status). */
  designSystems?: DesignSystemSummary[];
  /** Retained for call-site compatibility; the strip skips rendering
   *  while the list is loading so we never need a loading state. */
  loading?: boolean;
  /** Full-page project grids render their own title + controls. The Home strip
   *  omits this and keeps the compact "最近项目 / 查看全部" header. */
  heading?: string;
  description?: string;
  onOpen: (id: string) => void;
  onViewAll?: () => void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicate?: (id: string) => Promise<void> | void;
  onRename?: (id: string, name: string) => void;
  limit?: number;
  /** Ids of projects already shared to the team (persistent, from the hub). A
   *  project in this set shows the 共享 badge + "已在团队空间" and cannot be
   *  re-shared — so the state survives a refresh, not just the in-session share. */
  sharedProjectIds?: ReadonlySet<string>;
  /** Which space this strip renders (see {@link SpaceKind}). Defaults to
   *  'recent' (home). 'team' hides the per-card 共享 badge since every card
   *  there is already a team-shared project. */
  space?: SpaceKind;
  /** projectId → the sharing member's workspaceMemberId, for team-shared
   *  projects (from the team hub). Used to resolve the creator name against the
   *  member directory; a project absent from this map is a local project owned
   *  by the current member ("我创建"). */
  projectOwnerMemberIds?: ReadonlyMap<string, string>;
  collaborationEnabled?: boolean;
  canAssignInviteRoles?: boolean;
  canManageProjectCollection?: boolean;
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];

type OwnerFilter = 'all' | 'mine' | 'others';
type ProjectKindFilter = 'all' | 'prototype' | 'deck' | 'media' | 'other';
type ProjectSort = 'updatedDesc' | 'updatedAsc' | 'nameAsc';

const OWNER_FILTER_OPTIONS: Array<{ id: OwnerFilter; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { id: 'all', labelKey: 'recentProjects.ownerAll' },
  { id: 'mine', labelKey: 'recentProjects.ownerMine' },
  { id: 'others', labelKey: 'recentProjects.ownerOthers' },
];

const KIND_FILTER_OPTIONS: Array<{ id: ProjectKindFilter; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { id: 'all', labelKey: 'recentProjects.kindAll' },
  { id: 'prototype', labelKey: 'recentProjects.kindPrototype' },
  { id: 'deck', labelKey: 'recentProjects.kindSlides' },
  { id: 'media', labelKey: 'recentProjects.kindMedia' },
  { id: 'other', labelKey: 'recentProjects.kindOther' },
];

const SORT_OPTIONS: Array<{ id: ProjectSort; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { id: 'updatedDesc', labelKey: 'recentProjects.sortNewest' },
  { id: 'updatedAsc', labelKey: 'recentProjects.sortOldest' },
  { id: 'nameAsc', labelKey: 'recentProjects.sortName' },
];


const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;
const DEFAULT_RECENT_PROJECT_LIMIT = 6;
const WIDE_RECENT_PROJECT_LIMIT = 7;
// 7 * 180px cards + 6 * 12px gaps, matching recent-projects.css.
const WIDE_RECENT_PROJECT_MIN_ROW_WIDTH = 1332;
const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();

export function RecentProjectsStrip({
  projects,
  designSystems = EMPTY_DESIGN_SYSTEMS,
  heading,
  description,
  onOpen,
  onViewAll,
  onDelete,
  onDuplicate,
  onRename,
  limit,
  sharedProjectIds,
  space = 'recent',
  projectOwnerMemberIds,
  collaborationEnabled,
  canAssignInviteRoles,
  canManageProjectCollection,
}: Props) {
  const t = useT();
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Real creator resolution (replaces the demo's mock 李娜/张伟 roster): the
  // member directory turns an ownerMemberId into a display name, and the
  // workspace context tells us which member is "me" so the owner's own cards
  // read "我创建" instead of their display name. Both hooks degrade to
  // empty/null off-team, so every card safely falls back to "我创建".
  const { resolve: resolveMember } = useTeamMembers();
  const { context: workspaceContext } = useWorkspaceContext();
  const selfMemberId = workspaceContext?.workspaceMemberId ?? null;
  const collaborationAvailable =
    collaborationEnabled ?? workspaceContext?.workspaceType === 'team';
  const canInvite =
    canAssignInviteRoles ?? workspaceContext?.permissions.canInviteMembers === true;
  const canManageCollection =
    canManageProjectCollection ??
    (workspaceContext?.permissions.canManageSharedResources === true ||
      workspaceContext?.permissions.canShareProjects === true);
  const [responsiveLimit, setResponsiveLimit] = useState(DEFAULT_RECENT_PROJECT_LIMIT);
  const resolvedLimit = limit ?? responsiveLimit;
  const hasRecentProjects = projects.length > 0;
  const fullPageGrid = heading !== undefined || description !== undefined || space !== 'recent';
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [kindFilter, setKindFilter] = useState<ProjectKindFilter>('all');
  const [sort, setSort] = useState<ProjectSort>('updatedDesc');
  const [openHeaderMenu, setOpenHeaderMenu] = useState<'owner' | 'kind' | 'sort' | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (limit !== undefined) return;

    const update = () => {
      const rowWidth = rowRef.current?.getBoundingClientRect().width;
      if (rowWidth === undefined) {
        setResponsiveLimit(DEFAULT_RECENT_PROJECT_LIMIT);
        return;
      }
      setResponsiveLimit(
        rowWidth >= WIDE_RECENT_PROJECT_MIN_ROW_WIDTH
          ? WIDE_RECENT_PROJECT_LIMIT
          : DEFAULT_RECENT_PROJECT_LIMIT,
      );
    };

    update();
    const node = rowRef.current;
    if (node && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }

    if (typeof window === 'undefined') return;

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [hasRecentProjects, limit]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => {
      if (sort === 'updatedAsc') return a.updatedAt - b.updatedAt;
      if (sort === 'nameAsc') return a.name.localeCompare(b.name);
      return b.updatedAt - a.updatedAt;
    }),
    [projects, sort],
  );
  const [coverByProject, setCoverByProject] = useState<
    Record<string, { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null>
  >({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Project | null>(null);
  // Project → team-space sharing (the project card entry). The daemon gates on
  // `canShareProjects` (403 off-team / no rights), so we only badge on success.
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  const [sharedIds, setSharedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [unsharedIds, setUnsharedIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [shareErrorProjectId, setShareErrorProjectId] = useState<string | null>(null);
  const [shareErrorKind, setShareErrorKind] = useState<'share' | 'unshare'>('share');
  // A project counts as team-shared if the hub already lists it (persistent —
  // survives refresh) OR we shared it in this session (optimistic, before the
  // team-projects poll catches up). The union is what makes the badge stick.
  const isShared = (id: string) =>
    !unsharedIds.has(id) && (sharedProjectIds?.has(id) === true || sharedIds.has(id));
  // The card's "{creator}创建" line. A project the team hub attributes to another
  // member resolves through the directory to that member's display name; my own
  // shares and every local (non-shared) project read "我创建". Falls back to a
  // generic "团队成员" when a shared project's owner is not yet in the directory
  // (off-team, or a member the daemon has not seen register), never an opaque id.
  const resolveCreator = (projectId: string): { name: string; initial: string; ownedBySelf: boolean } => {
    const ownerMemberId = projectOwnerMemberIds?.get(projectId) ?? null;
    if (!ownerMemberId || ownerMemberId === selfMemberId) {
      const name = t('recentProjects.selfCreator');
      const initial = Array.from(name.trim())[0]?.toUpperCase() ?? 'M';
      return { name, initial, ownedBySelf: true };
    }
    const name = resolveMember(ownerMemberId)?.displayName ?? t('recentProjects.teamMemberCreator');
    const initial = (Array.from(name.trim())[0] ?? 'T').toUpperCase();
    return { name, initial, ownedBySelf: false };
  };
  const visibleProjects = useMemo(
    () => sortedProjects
      .map((project) => ({ project, creator: resolveCreator(project.id) }))
      .filter(({ project, creator }) => {
        const ownerMatches =
          ownerFilter === 'all' ||
          (ownerFilter === 'mine' && creator.ownedBySelf) ||
          (ownerFilter === 'others' && !creator.ownedBySelf);
        const kindMatches = kindFilter === 'all' || filterKindForProject(project) === kindFilter;
        return ownerMatches && kindMatches;
      })
      .slice(0, resolvedLimit),
    [kindFilter, ownerFilter, resolvedLimit, sortedProjects, projectOwnerMemberIds, selfMemberId],
  );
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const renameTitleId = useId();
  const confirmTitleId = useId();
  const actionsAvailable = Boolean(onDelete || onDuplicate || onRename || collaborationAvailable);

  useEffect(() => {
    setSelectedProjectIds((current) => {
      if (current.size === 0) return current;
      const visibleIds = new Set(visibleProjects.map(({ project }) => project.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleProjects]);

  useEffect(() => {
    if (!menuOpenId) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuContainerRef.current?.contains(target)) return;
      setMenuOpenId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    let cancelled = false;
    if (visibleProjects.length === 0) {
      setCoverByProject({});
      return;
    }

    void Promise.all(
      visibleProjects.map(async ({ project }) => {
        const designSystemProject = isDesignSystemProject(project);
        if (project.metadata?.entryFile && !designSystemProject) return [project.id, null] as const;
        let files: Awaited<ReturnType<typeof fetchProjectFiles>>;
        try {
          files = await fetchProjectFiles(project.id);
        } catch {
          return [project.id, null] as const;
        }
        if (designSystemProject) {
          const cover = await findDesignSystemCover(project.id, files);
          if (cover) {
            return [
              project.id,
              cover,
            ] as const;
          }
          return [project.id, null] as const;
        }
        const html =
          files.find((file) => (file.path ?? file.name) === 'index.html') ??
          files
            .filter((file) => file.kind === 'html')
            .sort((a, b) => b.mtime - a.mtime)[0];
        if (html) {
          return [
            project.id,
            { kind: 'html' as const, name: html.path ?? html.name },
          ] as const;
        }
        const image = files
          .filter((file) => file.kind === 'image')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (image) {
          return [
            project.id,
            { kind: 'image' as const, name: image.path ?? image.name },
          ] as const;
        }
        const video = files
          .filter((file) => file.kind === 'video')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (video) {
          return [
            project.id,
            { kind: 'video' as const, name: video.path ?? video.name },
          ] as const;
        }
        return [project.id, null] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCoverByProject(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [visibleProjects]);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. We also skip rendering during the
  // load window so the section doesn't pop in and then collapse;
  // the prompt hero is enough chrome on its own.
  if (visibleProjects.length === 0) {
    return null;
  }

  function startRename(project: Project) {
    const creator = resolveCreator(project.id);
    if (!creator.ownedBySelf) return;
    setMenuOpenId(null);
    setRenameTarget({ id: project.id, original: project.name });
    setRenameInput(project.name);
  }

  function cancelRename() {
    setRenameTarget(null);
    setRenameInput('');
  }

  function commitRename() {
    if (!renameTarget || !onRename) return;
    const trimmed = renameInput.trim();
    if (trimmed && trimmed !== renameTarget.original) {
      onRename(renameTarget.id, trimmed);
    }
    cancelRename();
  }

  function requestDelete(project: Project) {
    const creator = resolveCreator(project.id);
    if (!creator.ownedBySelf) return;
    setMenuOpenId(null);
    setConfirmTarget(project);
  }

  // Promote a project into the team space: fire the sync-intent the daemon uses
  // to publish it for teammates. Server-side gated on `canShareProjects`, so a
  // non-team / unpermitted caller gets a 403 and the project stays un-badged.
  async function handleShareToTeam(project: Project) {
    setShareErrorProjectId(null);
    setMenuOpenId(project.id);
    setSharingId(project.id);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/collab/sync-intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'project_team_share_requested', projectId: project.id }),
      });
      if (!res.ok) {
        throw new Error(`share failed with status ${res.status}`);
      }
      setSharedIds((prev) => new Set(prev).add(project.id));
      setUnsharedIds((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
      notifyTeamProjectsChanged();
      setMenuOpenId(null);
    } catch (err) {
      console.warn('[RecentProjectsStrip] share project to team failed:', err);
      setShareErrorProjectId(project.id);
      setShareErrorKind('share');
      setMenuOpenId(project.id);
    } finally {
      setSharingId(null);
    }
  }

  async function handleUnshareFromTeam(project: Project) {
    setShareErrorProjectId(null);
    setMenuOpenId(project.id);
    setUnsharingId(project.id);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/collab/sync-intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'project_team_unshare_requested', projectId: project.id }),
      });
      if (!res.ok) {
        throw new Error(`unshare failed with status ${res.status}`);
      }
      setUnsharedIds((prev) => new Set(prev).add(project.id));
      setSharedIds((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
      notifyTeamProjectsChanged();
      setMenuOpenId(null);
    } catch (err) {
      console.warn('[RecentProjectsStrip] unshare project from team failed:', err);
      setShareErrorProjectId(project.id);
      setShareErrorKind('unshare');
      setMenuOpenId(project.id);
    } finally {
      setUnsharingId(null);
    }
  }

  function requestDuplicate(project: Project) {
    if (!onDuplicate) return;
    setMenuOpenId(null);
    void Promise.resolve(onDuplicate(project.id)).catch((err) => {
      console.warn('[RecentProjectsStrip] duplicate project failed:', err);
    });
  }

  async function commitDelete() {
    if (!confirmTarget || !onDelete) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    await onDelete(target.id);
  }

  function toggleSelection(projectId: string) {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  const selectedCount = selectedProjectIds.size;

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      {fullPageGrid ? (
        <header className="recent-projects__head">
          <div className="recent-projects__title-block">
            <h2 className="recent-projects__heading">{heading ?? t('recentProjects.title')}</h2>
            {description ? (
              <p className="recent-projects__description">{description}</p>
            ) : null}
          </div>
          <div className="recent-projects__controls">
            {collaborationAvailable && space === 'team' && canInvite ? (
              <button
                type="button"
                className="recent-projects__invite"
                onClick={() => setInviteOpen(true)}
              >
                <Icon name="share" size={15} /> {t('recentProjects.inviteTeammates')}
              </button>
            ) : null}
            {canManageCollection ? (
              <button
                type="button"
                className={`recent-projects__select-toggle${selectionMode ? ' is-active' : ''}`}
                aria-pressed={selectionMode}
                onClick={() => {
                  setSelectionMode((current) => !current);
                  setSelectedProjectIds(new Set());
                  setMenuOpenId(null);
                }}
              >
                {t('recentProjects.multiSelect')}
              </button>
            ) : null}
            <div className="recent-projects__filter-wrap">
              <button
                type="button"
                className="recent-projects__filter"
                aria-expanded={openHeaderMenu === 'owner'}
                onClick={() => setOpenHeaderMenu((current) => current === 'owner' ? null : 'owner')}
              >
                {t(OWNER_FILTER_OPTIONS.find((option) => option.id === ownerFilter)?.labelKey ?? 'recentProjects.ownerAll')}
                <Icon name="chevron-down" size={13} />
              </button>
              {openHeaderMenu === 'owner' ? (
                <div className="recent-projects__filter-menu" role="menu">
                  {OWNER_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={ownerFilter === option.id ? 'is-active' : undefined}
                      onClick={() => {
                        setOwnerFilter(option.id);
                        setOpenHeaderMenu(null);
                      }}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="recent-projects__filter-wrap">
              <button
                type="button"
                className="recent-projects__filter"
                aria-expanded={openHeaderMenu === 'kind'}
                onClick={() => setOpenHeaderMenu((current) => current === 'kind' ? null : 'kind')}
              >
                {t(KIND_FILTER_OPTIONS.find((option) => option.id === kindFilter)?.labelKey ?? 'recentProjects.kindAll')}
                <Icon name="chevron-down" size={13} />
              </button>
              {openHeaderMenu === 'kind' ? (
                <div className="recent-projects__filter-menu" role="menu">
                  {KIND_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={kindFilter === option.id ? 'is-active' : undefined}
                      onClick={() => {
                        setKindFilter(option.id);
                        setOpenHeaderMenu(null);
                      }}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="recent-projects__filter-wrap">
              <button
                type="button"
                className="recent-projects__view-btn"
                aria-label={t('recentProjects.sortAria')}
                aria-expanded={openHeaderMenu === 'sort'}
                onClick={() => setOpenHeaderMenu((current) => current === 'sort' ? null : 'sort')}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h6M3 12h10M3 17h14M17 4v8m0 0 3-3m-3 3-3-3" />
                </svg>
              </button>
              {openHeaderMenu === 'sort' ? (
                <div className="recent-projects__filter-menu" role="menu">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={sort === option.id ? 'is-active' : undefined}
                      onClick={() => {
                        setSort(option.id);
                        setOpenHeaderMenu(null);
                      }}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="recent-projects__view" role="group" aria-label={t('designs.viewToggleAria')}>
              <button
                type="button"
                className={`recent-projects__view-btn${view === 'grid' ? ' is-active' : ''}`}
                aria-pressed={view === 'grid'}
                aria-label={t('designs.viewGrid')}
                onClick={() => setView('grid')}
              >
                <Icon name="grid" size={15} />
              </button>
              <button
                type="button"
                className={`recent-projects__view-btn${view === 'list' ? ' is-active' : ''}`}
                aria-pressed={view === 'list'}
                aria-label={t('recentProjects.viewList')}
                onClick={() => setView('list')}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="recent-projects__head">
          <h2 className="recent-projects__title">{t('recentProjects.title')}</h2>
          {onViewAll ? (
            <button
              type="button"
              className="recent-projects__view-all"
              onClick={onViewAll}
              data-testid="recent-projects-view-all"
            >
              <span>{t('recentProjects.viewAll')}</span>
              <Icon name="chevron-right" size={12} />
            </button>
          ) : null}
        </header>
      )}
      {selectionMode ? (
        <div className="recent-projects__bulkbar" role="status">
          <span className="recent-projects__bulkbar-count">
            {t('designs.selectedCount', { n: selectedCount })}
          </span>
        </div>
      ) : null}
      <div
        ref={rowRef}
        className={`recent-projects__row${fullPageGrid ? ` recent-projects__row--${view}` : ''}${menuOpenId ? ' recent-projects__row--menu-open' : ''}${selectionMode ? ' is-selecting' : ''}`}
        role="list"
      >
        {visibleProjects.map(({ project, creator }) => {
          const cover = projectCover(project, coverByProject[project.id] ?? null);
          const designSystemProject = isDesignSystemProject(project);
          const status: ProjectDisplayStatus = project.status?.value ?? 'not_started';
          const publishedDesignSystem = isPublishedDesignSystemProject(project, designSystems);
          const isActive =
            !publishedDesignSystem &&
            (status === 'running' || status === 'queued' || status === 'awaiting_input');
          const shared = isShared(project.id);
          const selected = selectedProjectIds.has(project.id);
          const readonlyShared = shared && !creator.ownedBySelf;
          return (
            <div
              key={project.id}
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}${shared ? ' is-shared' : ''}${menuOpenId === project.id ? ' is-menu-open' : ''}${selected ? ' is-selected' : ''}${readonlyShared ? ' is-readonly-shared' : ''}`}
              data-project-id={project.id}
            >
              {selectionMode ? (
                <button
                  type="button"
                  className="recent-projects__select-check"
                  aria-pressed={selected}
                  aria-label={project.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelection(project.id);
                  }}
                >
                  <span aria-hidden>{selected ? '✓' : ''}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="recent-projects__card-main"
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(project.id);
                    return;
                  }
                  onOpen(project.id);
                }}
                title={project.name}
              >
                <div
                  className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                  style={cover.style}
                  aria-hidden
                >
                  {(cover.kind === 'image' || cover.kind === 'logo') && cover.src ? (
                    <img
                      className="recent-projects__thumb-media"
                      src={cover.src}
                      alt=""
                      loading="lazy"
                    />
                  ) : cover.kind === 'video' && cover.src ? (
                    <video
                      className="recent-projects__thumb-media"
                      src={cover.src}
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : cover.kind === 'html' && cover.src ? (
                    <RecentProjectHtmlThumb
                      src={cover.src}
                      deckCoverOnly={project.metadata?.kind === 'deck'}
                    />
                  ) : (
                    <span className="recent-projects__card-glyph">{cover.initial}</span>
                  )}
                  {sharingId === project.id ? (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.55)',
                        borderRadius: 'inherit',
                      }}
                    >
                      <Icon name="spinner" size={18} />
                    </span>
                  ) : shared ? (
                    <span className="recent-projects__card-badge recent-projects__card-badge--shared">
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0-1-5.8M21 20a6 6 0 0 0-5-5.9" />
                      </svg>
                      {t('recentProjects.sharedBadge')}
                    </span>
                  ) : null}
                </div>
                <div className="recent-projects__card-meta">
                  <div className="recent-projects__card-name">{project.name}</div>
                  <div className="recent-projects__card-footer">
                    <div className="recent-projects__card-time">
                      <span className="recent-projects__card-owner" aria-hidden>
                        {creator.initial}
                      </span>
                      <span>{t('recentProjects.creatorLine', { name: creator.name })}</span>
                      <span className="recent-projects__card-sep" aria-hidden>·</span>
                      {relativeTime(project.updatedAt, t)}
                    </div>
                    <div className="design-card-tag-row">
                      {designSystemProject ? (
                        <DesignSystemProjectTag />
                      ) : (
                        <ProjectTag category={projectCategory(project)} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
              {actionsAvailable && !selectionMode ? (
                <div
                  className="recent-projects__card-menu-anchor"
                  ref={menuOpenId === project.id ? menuContainerRef : undefined}
                >
                  <button
                    type="button"
                  className="recent-projects__card-more"
                  aria-label={t('designs.menuMore')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpenId === project.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShareErrorProjectId(null);
                      setMenuOpenId((current) => current === project.id ? null : project.id);
                    }}
                  >
                    <Icon name="more-horizontal" size={14} />
                  </button>
                  {menuOpenId === project.id ? (
                    <div
                      className="recent-projects__card-menu"
                      role="menu"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {onRename ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!creator.ownedBySelf}
                          title={creator.ownedBySelf ? undefined : t('recentProjects.ownOnlyMutation')}
                          onClick={() => startRename(project)}
                        >
                          <Icon name="pencil" size={12} />
                          <span>{t('designs.menuRename')}</span>
                        </button>
                      ) : null}
                      {onDuplicate ? (
                        <button type="button" role="menuitem" onClick={() => requestDuplicate(project)}>
                          <Icon name="copy" size={12} />
                          <span>{t('designs.menuDuplicate')}</span>
                        </button>
                      ) : null}
                      {shared && creator.ownedBySelf ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={unsharingId === project.id}
                          onClick={() => void handleUnshareFromTeam(project)}
                        >
                          <Icon name="close" size={12} />
                          <span>
                            {unsharingId === project.id
                              ? t('recentProjects.unshareInProgress')
                              : t('recentProjects.moveOutOfTeam')}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={sharingId === project.id || shared || !creator.ownedBySelf}
                          title={!creator.ownedBySelf ? t('recentProjects.ownOnlyMutation') : undefined}
                          onClick={() => void handleShareToTeam(project)}
                        >
                          <Icon name="share" size={12} />
                          <span>
                            {sharingId === project.id
                              ? t('recentProjects.shareInProgress')
                              : shared
                                ? t('recentProjects.sharedInTeam')
                                : t('recentProjects.moveToTeam')}
                          </span>
                        </button>
                      )}
                      {shareErrorProjectId === project.id ? (
                        <div className="recent-projects__card-menu-error" role="alert">
                          {t(
                            shareErrorKind === 'unshare'
                              ? 'recentProjects.unshareFailed'
                              : 'recentProjects.shareFailed',
                          )}
                        </div>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          disabled={!creator.ownedBySelf}
                          title={creator.ownedBySelf ? undefined : t('recentProjects.ownOnlyMutation')}
                          onClick={() => requestDelete(project)}
                        >
                          <Icon name="close" size={12} />
                          <span>{t('designs.menuDelete')}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {renameTarget ? (
        <Dialog
          as="form"
          className="modal-rename"
          onClose={cancelRename}
          closeOnEscape
          ariaLabelledBy={renameTitleId}
          onSubmit={(event) => {
            event.preventDefault();
            commitRename();
          }}
        >
          <DialogTitle id={renameTitleId}>{t('designs.renameTitle')}</DialogTitle>
          <label>
            {t('designs.renamePrompt', { name: renameTarget.original })}
            <input
              type="text"
              value={renameInput}
              autoFocus
              onChange={(event) => setRenameInput(event.target.value)}
            />
          </label>
          <DialogFooter className="row">
            <button type="button" onClick={cancelRename}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!renameInput.trim() || renameInput.trim() === renameTarget.original}
            >
              {t('designs.renameSave')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {confirmTarget ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setConfirmTarget(null)}
          ariaLabelledBy={confirmTitleId}
        >
          <DialogTitle id={confirmTitleId}>{t('designs.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('designs.deleteConfirm', { name: confirmTarget.name })}
          </DialogDescription>
          <DialogFooter className="row">
            <button type="button" onClick={() => setConfirmTarget(null)}>
              {t('designs.renameCancel')}
            </button>
            <button type="button" className="primary danger" onClick={() => void commitDelete()}>
              {t('designs.menuDelete')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        canAssignRoles={canInvite}
      />
    </section>
  );
}

function RecentProjectHtmlThumb({
  src,
  deckCoverOnly,
}: {
  src: string;
  deckCoverOnly: boolean;
}) {
  if (!deckCoverOnly) {
    return (
      <iframe
        className="recent-projects__thumb-iframe"
        src={src}
        title=""
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
      />
    );
  }

  return <DeckCoverThumb src={src} />;
}

function DeckCoverThumb({ src }: { src: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(() => deckCoverCache.get(src) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = deckCoverCache.get(src);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    setSrcDoc(null);
    loadDeckCover(src)
      .then((next) => {
        if (!cancelled) setSrcDoc(next);
      })
      .catch(() => {
        if (cancelled) return;
        setSrcDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / DECK_PREVIEW_WIDTH, rect.height / DECK_PREVIEW_HEIGHT));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="recent-projects__deck-frame"
      style={{ '--recent-deck-scale': scale } as CSSProperties}
      aria-hidden
    >
      {srcDoc ? (
        <iframe
          className="recent-projects__deck-iframe"
          srcDoc={srcDoc}
          title=""
          loading="lazy"
          sandbox=""
          tabIndex={-1}
        />
      ) : (
        <span className="recent-projects__deck-cover-loading" aria-hidden />
      )}
    </div>
  );
}

async function loadDeckCover(src: string): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  const existing = deckCoverInflight.get(src);
  if (existing) return existing;
  const run = fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
      return res.text();
    })
    .then((html) => {
      const parsed = deckPreviewSrcDoc(html);
      deckCoverCache.set(src, parsed);
      deckCoverInflight.delete(src);
      return parsed;
    })
    .catch((error) => {
      deckCoverInflight.delete(src);
      throw error;
    });
  deckCoverInflight.set(src, run);
  return run;
}

function deckPreviewSrcDoc(html: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  const style = `<style id="od-recent-deck-real-preview">
    html,
    body {
      margin: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }
    body {
      display: block !important;
      scroll-snap-type: none !important;
    }
    .slide,
    section[data-slide],
    section[data-screen-label] {
      position: absolute !important;
      inset: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      flex: none !important;
      scroll-snap-align: none !important;
    }
    .slide:not(:first-of-type),
    section[data-slide]:not(:first-of-type),
    section[data-screen-label]:not(:first-of-type),
    .deck-counter,
    .deck-controls,
    .deck-hint,
    .deck-page-controls,
    .deck-pager,
    .deck-progress,
    .deck-nav,
    .deck-navigation,
    .page-controls,
    .page-flip-controls,
    .page-nav,
    .page-navigation,
    .pagination-control,
    .pagination-controls,
    #deck-prev,
    #deck-next,
    #deck-cur,
    #deck-total,
    [data-deck-controls],
    [data-page-controls],
    [data-pagination],
    [aria-label="Previous slide"],
    [aria-label="Next slide"],
    [aria-label="Deck navigation"],
    [aria-label="Page navigation"],
    [aria-label="Pagination"],
    nav[aria-label*="page" i],
    nav[aria-label*="pagination" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>`;
  return injectBefore(withoutScripts, '</head>', style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function statusLabel(
  status: ProjectDisplayStatus,
  t: ReturnType<typeof useT>,
): string {
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

function projectCover(
  project: Project,
  override: { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null,
): {
  kind: 'image' | 'video' | 'html' | 'logo' | 'fallback';
  src?: string;
  style: CSSProperties;
  initial: string;
} {
  let h = 0;
  for (let i = 0; i < project.id.length; i += 1) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
  const trimmed = project.name.trim();
  const initial = (trimmed ? Array.from(trimmed)[0]! : '?').toUpperCase();
  if (override) {
    return {
      kind: override.kind,
      src: projectFileUrl(project.id, override.name),
      style,
      initial,
    };
  }
  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const src = projectFileUrl(project.id, entry);
    if (meta?.kind === 'image') return { kind: 'image', src, style, initial };
    if (meta?.kind === 'video') return { kind: 'video', src, style, initial };
    if (/\.html?$/i.test(entry)) return { kind: 'html', src, style, initial };
  }
  return { kind: 'fallback', style, initial };
}

function filterKindForProject(project: Project): ProjectKindFilter {
  const kind = project.metadata?.kind;
  if (kind === 'deck') return 'deck';
  if (kind === 'image' || kind === 'video' || kind === 'audio') return 'media';
  if (kind === 'prototype' || kind === 'template') return 'prototype';
  return 'other';
}

type ProjectCategory = 'prototype' | 'live-artifact' | 'slide' | 'media' | 'brand';

function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'brand') return 'brand';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label =
    category === 'live-artifact'
      ? t('designs.tagLiveArtifact')
      : category === 'slide'
        ? t('designs.tagSlide')
        : category === 'brand'
          ? 'Brand'
        : category === 'media'
          ? t('designs.tagMedia')
          : t('designs.tagPrototype');
  return <span className={`design-card-tag tag-${category}`}>{label}</span>;
}

function DesignSystemProjectTag() {
  return <span className="design-card-tag tag-design-system">Design System</span>;
}

function findDesignSystemLogoFile(files: ProjectFile[]): ProjectFile | null {
  const logoCandidates = files
    .filter((file) => file.type !== 'dir')
    .filter((file) => {
      const name = file.path ?? file.name;
      return file.kind === 'image' || /\.(svg|png|jpe?g|webp|gif)$/iu.test(name);
    });
  return (
    logoCandidates.find((file) => (file.path ?? file.name).toLowerCase() === 'assets/logo.svg') ??
    logoCandidates.find((file) => /(^|\/)(logo|wordmark|brand-mark|brandmark|mark|icon|favicon)[^/]*\.(svg|png|jpe?g|webp|gif)$/iu.test(file.path ?? file.name)) ??
    null
  );
}

async function findDesignSystemCover(
  projectId: string,
  files: ProjectFile[],
): Promise<{ kind: 'image' | 'logo'; name: string } | null> {
  const knownFiles = new Set(files.map((file) => file.path ?? file.name));
  const brandCover = await designSystemCoverFromBrandJson(projectId, knownFiles);
  if (brandCover) return brandCover;

  const logo = findDesignSystemLogoFile(files);
  if (!logo) return null;
  return { kind: 'logo', name: logo.path ?? logo.name };
}

async function designSystemCoverFromBrandJson(
  projectId: string,
  knownFiles: ReadonlySet<string>,
): Promise<{ kind: 'image' | 'logo'; name: string } | null> {
  const raw = await fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' });
  if (!raw) return null;
  let brand: unknown;
  try {
    brand = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!brand || typeof brand !== 'object') return null;
  const root = brand as Record<string, unknown>;
  const imagery = root.imagery && typeof root.imagery === 'object'
    ? root.imagery as Record<string, unknown>
    : null;
  const samples = Array.isArray(imagery?.samples) ? imagery.samples : [];
  const samplePaths = samples
    .filter((sample): sample is Record<string, unknown> => Boolean(sample && typeof sample === 'object'))
    .sort((a, b) => imageSampleRank(a.kind) - imageSampleRank(b.kind))
    .map((sample) => typeof sample.file === 'string' ? sample.file : null)
    .filter((file): file is string => Boolean(file));
  const image = samplePaths.find((file) => knownFiles.has(file) && isRasterOrSvgImage(file));
  if (image) return { kind: 'image', name: image };

  const logo = root.logo && typeof root.logo === 'object' ? root.logo as Record<string, unknown> : null;
  const alternates = Array.isArray(logo?.alternates) ? logo.alternates : [];
  const logoCandidates = [
    typeof logo?.primary === 'string' ? logo.primary : null,
    ...alternates,
  ];
  const nonFaviconLogo = logoCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' &&
      knownFiles.has(candidate) &&
      isRasterOrSvgImage(candidate) &&
      !/(^|\/)favicon[-.]/iu.test(candidate),
  );
  if (nonFaviconLogo) return { kind: 'logo', name: nonFaviconLogo };
  if (typeof logo?.primary === 'string' && knownFiles.has(logo.primary) && isRasterOrSvgImage(logo.primary)) {
    return { kind: 'logo', name: logo.primary };
  }
  return null;
}

function imageSampleRank(kind: unknown): number {
  if (kind === 'cover') return 0;
  if (kind === 'hero') return 1;
  return 2;
}

function isRasterOrSvgImage(path: string): boolean {
  return /\.(svg|png|jpe?g|webp|gif)$/iu.test(path);
}
