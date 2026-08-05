// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';

const MOVE_CONFIRM_SKIP_KEY = 'od.projects.moveConfirmSkip';
import { useT } from '../i18n';
import {
  fetchProjectFiles,
  fetchProjectFileText,
  invalidateProjectFilesCache,
} from '../providers/registry';
import type { DesignSystemSummary, Project, ProjectDisplayStatus, ProjectFile } from '../types';
import { Icon } from './Icon';
import { InviteDialog } from './InviteDialog';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';
import type { SharedProjectPredicate } from '../collab/all-projects-list';
import { useTeamMembers } from '../collab/useTeamMembers';
import {
  notifyTeamProjectsChanged,
  useWorkspaceBilling,
  useWorkspaceContext,
} from '../collab/useWorkspaceContext';
import {
  canAccessWorkspaceInviteFlow,
  resolveWorkspaceInviteTarget,
  workspaceUpgradeUrl,
} from './EntryNavRail';
import { moveWorkspaceProject, workspaceProjectMoveErrorCode } from '../state/projects';
import {
  workspaceContextHasTeamIdentity,
  type WorkspaceCollabContext,
  type WorkspaceProjectSummary,
} from '@open-design/contracts';
import { useWorkspaceInvalidation } from '../collab/workspace-events';
import {
  THUMBNAIL_OVERSCAN_MARGIN,
  resumeThumbnailLoads,
  suspendThumbnailLoads,
  useThumbnailLoadSlot,
} from '../lib/thumbnail-load-gate';
import {
  getProjectCoverSnapshot,
  invalidateProjectCoverSnapshots,
  projectCoverSnapshotKey,
  setProjectCoverSnapshot,
} from '../lib/project-cover-cache';
import { useInView } from './plugins-home/useInView';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from '../collab/workspace-identity';
import { useAnalytics } from '../analytics/provider';
import {
  trackProjectCollectionClick,
  trackWorkspaceProjectActionResult,
  trackWorkspaceSharedProjectOpenResult,
} from '../analytics/events';
import { countBucket, workspaceAnalyticsDimensions } from '../analytics/workspace';
import type { ProjectCollectionClickProps } from '@open-design/contracts/analytics';

/** Which project space this strip renders. Drives the per-card 共享 badge
 *  (hidden in the all-shared team space) and the "{creator}创建" line: 'recent'
 *  = home's mixed private/shared, 'drafts' = the member's own private list,
 *  'team' = the全部项目 grid where every card is a team-shared project. */
export type SpaceKind = 'recent' | 'drafts' | 'team';
import {
  coverFromProjectFile,
  projectCoverUrl,
  selectProjectFileCover,
  type ProjectCoverOverride,
} from './project-cover';

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
  /** Return false when opening failed and the grid stayed mounted, so aborted
   * background cover work can resume after the foreground attempt finishes. */
  onOpen: (id: string) => boolean | void | Promise<boolean | void>;
  onViewAll?: () => void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicate?: (id: string) => Promise<void> | void;
  onRename?: (id: string, name: string) => void;
  limit?: number;
  /** The one shared-state answer for a card: true → 共享 badge + "已在团队空间",
   *  and the card cannot be re-shared. Owned by the caller, because the SAME
   *  answer decides which of the 全部项目 / 草稿 grids the project belongs to —
   *  see {@link createSharedProjectPredicate}. This strip must not re-derive it;
   *  a strip-local optimistic set is exactly how the badge and the grids drifted
   *  apart. Defaults to "nothing is shared" when a caller has no sharing surface. */
  isSharedProject?: SharedProjectPredicate;
  /** Reported after a successful share/unshare so the caller can fold the change
   *  into its optimistic layer before the team-projects poll catches up. */
  onProjectShared?: (project: WorkspaceProjectSummary) => void;
  /** Clears any optimistic owner proof when a share did not commit. */
  onProjectShareFailed?: (projectId: string) => void;
  onProjectUnshared?: (projectId: string) => void;
  /** Which space this strip renders (see {@link SpaceKind}). Defaults to
   *  'recent' (home). 'team' hides the per-card 共享 badge since every card
   *  there is already a team-shared project. */
  space?: SpaceKind;
  /** projectId → the sharing member's workspaceMemberId, for team-shared
   *  projects (from the team hub). Used to resolve the creator name against the
   *  member directory; a project absent from this map is a local project owned
   *  by the current member ("我创建"). */
  projectOwnerMemberIds?: ReadonlyMap<string, string>;
  /** Project currently being materialized before it can open (a member's
   *  first click on a team-shared card triggers a full content pull). The
   *  card shows a spinner overlay and further clicks are ignored — without
   *  this the pull looked like a dead click for its whole duration. */
  openingProjectId?: string | null;
  collaborationEnabled?: boolean;
  canAssignInviteRoles?: boolean;
  canManageProjectCollection?: boolean;
  /** Whether this mounted strip is visible. EntryShell keeps Home mounted while
   * other views are active, so hidden strips must not occupy browser connection
   * slots with background cover probes. */
  isActive?: boolean;
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];
/** Fallback for a caller with no sharing surface (no workspace, no grids). */
const NOTHING_SHARED: SharedProjectPredicate = () => false;
/** The chip a design-system project wears. Product name, not a translated
 *  string — shared by the card tag and the type filter so both read alike. */
const DESIGN_SYSTEM_TAG_LABEL = 'Design System';

type DictKey = Parameters<ReturnType<typeof useT>>[0];

type OwnerFilter = 'all' | 'mine' | 'others';
/** The type filter speaks the SAME vocabulary the cards stamp on themselves
 *  ({@link projectCardCategory}), so "原型 / 幻灯片 / 实时看板 / 媒体 /
 *  Design System" in the dropdown mean exactly the chips a user can read off
 *  the grid. It used to run a private taxonomy off `metadata.kind`
 *  (prototype/deck/media/other), which offered a 其他 bucket no card ever
 *  shows and no 实时看板 / Design System filter for chips every card does. */
type ProjectKindFilter = 'all' | ProjectCardCategory;
type ProjectSort = 'updatedDesc' | 'updatedAsc' | 'nameAsc';

const OWNER_FILTER_OPTIONS: Array<{ id: OwnerFilter; labelKey: DictKey }> = [
  { id: 'all', labelKey: 'recentProjects.ownerAll' },
  { id: 'mine', labelKey: 'recentProjects.ownerMine' },
  { id: 'others', labelKey: 'recentProjects.ownerOthers' },
];

type KindFilterOption =
  | { id: ProjectKindFilter; labelKey: DictKey; label?: undefined }
  | { id: ProjectKindFilter; label: string; labelKey?: undefined };

// One entry per chip the grid can render, reusing that chip's own i18n key so
// the filter label and the card label can never drift apart. `brand` is absent
// on purpose: `projectCardCategory` resolves every brand-kind project to
// 'design-system' first (see `isDesignSystemProject`), so a 'brand' option
// could only ever match nothing.
const KIND_FILTER_OPTIONS: KindFilterOption[] = [
  { id: 'all', labelKey: 'recentProjects.kindAll' },
  { id: 'prototype', labelKey: 'designs.tagPrototype' },
  { id: 'slide', labelKey: 'designs.tagSlide' },
  { id: 'live-artifact', labelKey: 'designs.tagLiveArtifact' },
  { id: 'web-clone', labelKey: 'designs.tagWebClone' },
  { id: 'media', labelKey: 'designs.tagMedia' },
  { id: 'design-system', label: DESIGN_SYSTEM_TAG_LABEL },
];

function kindFilterLabel(option: KindFilterOption, t: ReturnType<typeof useT>): string {
  return option.labelKey === undefined ? option.label : t(option.labelKey);
}

const SORT_OPTIONS: Array<{ id: ProjectSort; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { id: 'updatedDesc', labelKey: 'recentProjects.sortNewest' },
  { id: 'updatedAsc', labelKey: 'recentProjects.sortOldest' },
  { id: 'nameAsc', labelKey: 'recentProjects.sortName' },
];


const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;
// Deck covers are fetched once per artifact URL and shared by every card that
// points at it: the parsed srcDoc is cached, and concurrent mounts join the
// same in-flight request instead of re-fetching.
const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();
const DEFAULT_RECENT_PROJECT_LIMIT = 6;
const WIDE_RECENT_PROJECT_LIMIT = 7;
// Card covers are background decoration. Browsers commonly allow only six
// concurrent connections per origin, so an unbounded All Projects scan can
// occupy every slot and queue the project file list/preview the user just
// opened. Two cover probes keep the grid moving while reserving capacity for
// foreground reads.
const MAX_BACKGROUND_COVER_REQUESTS = 2;
// 7 * 180px cards + 6 * 12px gaps, matching recent-projects.css.
const WIDE_RECENT_PROJECT_MIN_ROW_WIDTH = 1332;

type BackgroundTask<T> = {
  controller: AbortController;
  run: () => Promise<T>;
  resolve: (value: T | undefined) => void;
  reject: (reason: unknown) => void;
  started: boolean;
  released: boolean;
  settled: boolean;
};

class BackgroundTaskQueue {
  private active = 0;
  private readonly pending: BackgroundTask<unknown>[] = [];
  private pauseDepth = 0;

  constructor(private readonly concurrency: number) {}

  schedule<T>(
    controller: AbortController,
    run: () => Promise<T>,
    priority = false,
  ): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const task: BackgroundTask<T> = {
        controller,
        run,
        resolve,
        reject,
        started: false,
        released: false,
        settled: false,
      };
      const abort = () => {
        if (task.settled) return;
        task.settled = true;
        task.resolve(undefined);
        this.release(task);
        this.drain();
      };
      controller.signal.addEventListener('abort', abort, { once: true });
      // Store listener cleanup on the promise path without expanding the
      // queue's public contract. A settled task's one-shot abort listener is
      // harmless, but removing it avoids retaining component closures.
      task.run = async () => {
        try {
          return await run();
        } finally {
          controller.signal.removeEventListener('abort', abort);
        }
      };
      if (priority) {
        this.pending.unshift(task as BackgroundTask<unknown>);
      } else {
        this.pending.push(task as BackgroundTask<unknown>);
      }
      this.drain();
    });
  }

  withoutDraining(run: () => void): void {
    this.pauseDepth += 1;
    try {
      run();
    } finally {
      this.pauseDepth -= 1;
      this.drain();
    }
  }

  private release<T>(task: BackgroundTask<T>): void {
    if (task.started && !task.released) {
      task.released = true;
      this.active -= 1;
      return;
    }
    if (!task.started) {
      const index = this.pending.indexOf(task as BackgroundTask<unknown>);
      if (index >= 0) this.pending.splice(index, 1);
    }
  }

  private drain(): void {
    if (this.pauseDepth > 0) return;
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      if (task.settled || task.controller.signal.aborted) continue;
      task.started = true;
      this.active += 1;
      void task.run().then(
        (value) => {
          if (task.settled) return;
          task.settled = true;
          task.resolve(value);
          this.release(task);
          this.drain();
        },
        (error) => {
          if (task.settled) return;
          task.settled = true;
          task.reject(error);
          this.release(task);
          this.drain();
        },
      );
    }
  }
}

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
  isSharedProject,
  onProjectShared,
  onProjectShareFailed,
  onProjectUnshared,
  space = 'recent',
  projectOwnerMemberIds,
  openingProjectId = null,
  collaborationEnabled,
  canAssignInviteRoles,
  canManageProjectCollection,
  isActive = true,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const analyticsPage = space === 'drafts' ? 'drafts' : space === 'team' ? 'all_projects' : 'home';
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Real creator resolution (replaces the demo's mock 李娜/张伟 roster): the
  // member directory turns an ownerMemberId into a display name, and the
  // workspace context tells us which member is "me" so the owner's own cards
  // read "我创建" instead of their display name. Both hooks degrade to
  // empty/null off-team, so every card safely falls back to "我创建".
  const { resolve: resolveMember } = useTeamMembers();
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
  } = useWorkspaceContext();
  // A cover request captures the complete identity at dispatch. A mutable ref
  // keeps the queue callbacks stable without letting an in-flight read drift
  // to whichever Workspace a different render happens to select later.
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;
  const workspaceContextLoadingRef = useRef(workspaceContextLoading);
  workspaceContextLoadingRef.current = workspaceContextLoading;
  const workspaceIdentity = workspaceIdentityCacheKey(workspaceContext);
  const workspaceBilling = useWorkspaceBilling();
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  function trackCollection(
    element: ProjectCollectionClickProps['element'],
    properties: Partial<Omit<ProjectCollectionClickProps, 'page_name' | 'area' | 'element'>> = {},
    requestId?: string,
  ) {
    trackProjectCollectionClick(analytics.track, {
      page_name: analyticsPage,
      area: 'project_collection',
      element,
      ...workspaceDimensions,
      ...properties,
    }, requestId ? { requestId } : undefined);
  }
  const selfMemberId = workspaceContext?.workspaceMemberId ?? null;
  // `canShareProjects` alone is a ROLE permission ("could this member share IF
  // a team existed"), not a "does a team exist" signal — a purely personal
  // workspace's owner still gets `canShareProjects: true`. Without also
  // requiring `workspaceContextHasTeamIdentity`, this stayed true for a
  // personal-only workspace and the move-to-team menu item rendered a button
  // the daemon can only ever 403 (recvqfZsR901YQ "无法共享方案了" /
  // recvqgif6Xa7Wb "隐藏非 Team workspace 分享到团队的入口") — the exact class
  // of bug `workspaceContextHasTeamIdentity`'s own doc comment warns about:
  // "Deriving it twice is how a UI grows a button that can only ever fail."
  const collaborationAvailable =
    collaborationEnabled ??
    (workspaceContextHasTeamIdentity(workspaceContext) &&
      workspaceContext?.permissions.canShareProjects === true);
  const canAccessInviteFlow = canAccessWorkspaceInviteFlow(workspaceContext);
  // The invite dialog's seat-gate upgrade CTA: personal workspace → B's
  // personal plan modal, team → checkout vs change-plan by subscription state.
  // One shared decision point — see `workspaceUpgradeUrl` in EntryNavRail.tsx
  // (recvpYEiH019cD).
  const inviteUpgradeUrl = workspaceUpgradeUrl(workspaceContext, workspaceBilling);
  const inviteTarget = resolveWorkspaceInviteTarget(workspaceContext);
  const canManageCollection =
    canManageProjectCollection ??
    (workspaceContext?.permissions.canManageSharedResources === true ||
      workspaceContext?.permissions.canShareProjects === true);
  const [responsiveLimit, setResponsiveLimit] = useState(DEFAULT_RECENT_PROJECT_LIMIT);
  const resolvedLimit = limit ?? responsiveLimit;
  const hasRecentProjects = projects.length > 0;
  const fullPageGrid = heading !== undefined || description !== undefined || space !== 'recent';
  const showOwnerFilter = space !== 'drafts';
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [kindFilter, setKindFilter] = useState<ProjectKindFilter>('all');
  const [sort, setSort] = useState<ProjectSort>('updatedDesc');
  // recvqbipG9QDTt: this component mounts once per host view (Home, Drafts,
  // All projects) and stays alive across EntryShell tab switches — Home's
  // instance in particular is only ever hidden via `content-visibility`, not
  // unmounted (see EntryShell's `inactiveViewProps`) — so a filter picked
  // here keeps silently narrowing the grid on every later visit with no cue
  // that anything is filtered. Surfacing `hasActiveFilter` drives the visible
  // "clear filters" chip below instead of switching tabs quietly resetting
  // it, per the reporter's own preferred fix.
  const hasActiveFilter = ownerFilter !== 'all' || kindFilter !== 'all';
  const [openHeaderMenu, setOpenHeaderMenu] = useState<'owner' | 'kind' | 'sort' | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  // Confirmation gates for the bulk bar. Batch move reuses the single-card
  // 不再提示 opt-out; batch delete always confirms (it is irreversible and
  // spans N projects), mirroring the projects grid's own batch delete.
  const [bulkMoveAction, setBulkMoveAction] = useState<'to-team' | 'to-personal' | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
    Record<string, ProjectCoverOverride | null>
  >({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Project | null>(null);
  // recvqbh189zBY6: commitDelete used to await onDelete and drop the result on
  // the floor either way — a 403/network failure closed the dialog exactly
  // like a success, leaving the project right where it was with no signal
  // that anything went wrong. Track failure so the dialog can stay open and
  // say so instead of silently doing nothing.
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Project → team-space sharing (the project card entry). The daemon gates on
  // `canShareProjects` (403 off-team / no rights), so we only badge on success.
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  const [shareErrorProjectId, setShareErrorProjectId] = useState<string | null>(null);
  // 'owner-conflict' is the daemon's TEAM_PROJECT_OWNER_CONFLICT refusal: the
  // team hub already registers this project under another member's ownership.
  // That state is permanent until the registered owner unshares, so it gets
  // its own message instead of the retryable 'share' hint.
  const [shareErrorKind, setShareErrorKind] = useState<'share' | 'unshare' | 'owner-conflict'>('share');
  // Whether a card is team-shared is decided upstream, not here — the grids'
  // 全部项目 / 草稿 partition reads the very same predicate, so the badge and the
  // card's grid can no longer disagree.
  const isShared = isSharedProject ?? NOTHING_SHARED;
  // The card's "{creator}创建" line. A project the team hub attributes to another
  // member resolves through the directory to that member's display name; my own
  // shares and every local (non-shared) project read "我创建". Falls back to a
  // generic "团队成员" when a shared project's owner is not yet in the directory
  // (off-team, or a member the daemon has not seen register), never an opaque id.
  const resolveCreator = (projectId: string): { name: string; initial: string; ownedBySelf: boolean } => {
    const ownerMemberId = projectOwnerMemberIds?.get(projectId) ?? null;
    if (ownerMemberId === selfMemberId || (!ownerMemberId && !isShared(projectId))) {
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
          !showOwnerFilter ||
          ownerFilter === 'all' ||
          (ownerFilter === 'mine' && creator.ownedBySelf) ||
          (ownerFilter === 'others' && !creator.ownedBySelf);
        const kindMatches = kindFilter === 'all' || projectCardCategory(project) === kindFilter;
        return ownerMatches && kindMatches;
      })
      .slice(0, resolvedLimit),
    [
      kindFilter,
      ownerFilter,
      projectOwnerMemberIds,
      resolvedLimit,
      selfMemberId,
      showOwnerFilter,
      sortedProjects,
    ],
  );
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const renameTitleId = useId();
  const confirmTitleId = useId();
  const moveTitleId = useId();
  const bulkMoveTitleId = useId();
  const bulkDeleteTitleId = useId();
  // #5517 move confirmation: moving a project in/out of the team space asks
  // once, with a persisted 不再提示 opt-out (the demo keeps it per-session;
  // the product remembers the choice).
  const [moveTarget, setMoveTarget] = useState<{ project: Project; action: 'to-team' | 'to-personal' } | null>(null);
  const [moveDontRemind, setMoveDontRemind] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MOVE_CONFIRM_SKIP_KEY) === '1';
    } catch {
      return false;
    }
  });
  function requestMove(project: Project, action: 'to-team' | 'to-personal') {
    trackCollection(action === 'to-team' ? 'move_to_team' : 'move_to_personal', {
      project_key: project.id,
      project_relation: resolveCreator(project.id).ownedBySelf ? 'self' : 'other',
    });
    if (moveDontRemind) {
      void (action === 'to-team' ? handleShareToTeam(project) : handleUnshareFromTeam(project));
      return;
    }
    setMenuOpenId(null);
    setMoveTarget({ project, action });
  }
  function commitMove() {
    if (!moveTarget) return;
    if (moveDontRemind) {
      try {
        window.localStorage.setItem(MOVE_CONFIRM_SKIP_KEY, '1');
      } catch {
        // best-effort persistence
      }
    }
    const { project, action } = moveTarget;
    setMoveTarget(null);
    void (action === 'to-team' ? handleShareToTeam(project) : handleUnshareFromTeam(project));
  }
  const actionsAvailable = Boolean(onDelete || onDuplicate || onRename || collaborationAvailable);

  // Bulk-action state for the 多选 bar. Every action below is the batch form of
  // an action the per-card ⋯ menu already offers (move in/out of the team
  // space, delete); nothing new is exposed here that a single card cannot do.
  const selectedProjects = visibleProjects.filter(({ project }) => selectedProjectIds.has(project.id));
  const selectedCount = selectedProjectIds.size;
  // Same gate as the per-card menu: only your own projects can be moved or
  // deleted, so a selection containing someone else's shared project disables
  // the mutations instead of half-applying them.
  const selectionHasForeignProject = selectedProjects.some(({ creator }) => !creator.ownedBySelf);
  const bulkMutationDisabled = selectedCount === 0 || selectionHasForeignProject;
  const bulkMutationTitle = selectionHasForeignProject
    ? t('recentProjects.ownOnlyMutation')
    : selectedProjects.map(({ project }) => project.name).join('、') || undefined;
  const canBulkMoveToTeam = collaborationAvailable && space !== 'team';
  const canBulkMoveToPersonal = collaborationAvailable && space !== 'drafts';

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

  // Cover fetching must key off the *set of project ids and their readiness*, not the
  // `visibleProjects` array reference. That reference changes on every render
  // (upstream props/derived lists are recreated, and a 2s poll re-renders the
  // shell), and depending on it re-ran this effect — and re-fetched every
  // project's files — on every render (observed ~23× per project in a trace).
  // A catalog placeholder can materialize without changing id or updatedAt,
  // though, so include that one transition to start its first real scan.
  const coverFetchKey = visibleProjects
    .map(({ project }) =>
      `${project.id}:${project.metadata?.sharedProjectPlaceholderAt == null ? 'ready' : 'placeholder'}`,
    )
    .join('|');
  const visibleProjectsRef = useRef(new Map<string, Project>());
  visibleProjectsRef.current = new Map(
    visibleProjects.map(({ project }) => [project.id, project]),
  );
  const coverGenerationRef = useRef(new Map<string, number>());
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const coverQueueRef = useRef<BackgroundTaskQueue | null>(null);
  if (!coverQueueRef.current) {
    coverQueueRef.current = new BackgroundTaskQueue(MAX_BACKGROUND_COVER_REQUESTS);
  }
  const coverQueue = coverQueueRef.current;
  const coverInFlightRef = useRef(
    new Map<string, {
      controller: AbortController;
      generation: number;
      promise: Promise<void>;
    }>(),
  );
  // Resolves one project's cover decision. Returns:
  // - a cover override when the project has a renderable cover,
  // - `null` as the *authoritative* "this project has no cover" answer
  //   (safe to snapshot until the project version changes), and
  // - `undefined` for transient outcomes (abort, network failure) that must
  //   not be cached or written into state.
  const loadProjectCover = useCallback(async (
    project: Project,
    signal: AbortSignal,
    requestWorkspaceContext: WorkspaceCollabContext | null,
    freshFiles = false,
  ): Promise<ProjectCoverOverride | null | undefined> => {
    // Catalog-only Team projects intentionally have no local directory until
    // the first open materializes them. Probing `/files` here can only produce
    // a noisy 404. This is transient rather than an authoritative no-cover
    // decision: hydration can clear the stamp without changing id/updatedAt,
    // at which point coverFetchKey starts the first real scan.
    if (project.metadata?.sharedProjectPlaceholderAt != null) return undefined;
    const designSystemProject = isDesignSystemProject(project);
    if (project.metadata?.entryFile && !designSystemProject) return null;
    let files: Awaited<ReturnType<typeof fetchProjectFiles>>;
    try {
      files = await fetchProjectFiles(project.id, {
        signal,
        workspaceContext: requestWorkspaceContext,
        ...(freshFiles ? { fresh: true } : {}),
      });
    } catch {
      return undefined;
    }
    if (signal.aborted) return undefined;
    if (designSystemProject) {
      return (await findDesignSystemCover(
        project.id,
        files,
        signal,
        requestWorkspaceContext,
      )) ?? null;
    }
    const cover = selectProjectFileCover(files);
    if (cover?.kind !== 'html') return cover;

    const src = projectCoverUrl(
      project.id,
      cover.name,
      cover.mtime,
      requestWorkspaceContext,
    );
    const diagnostic = `${project.id}:${cover.name}`;
    if (project.metadata?.kind === 'deck') {
      try {
        await loadDeckCover(src, signal, requestWorkspaceContext);
        return signal.aborted ? undefined : cover;
      } catch (err) {
        if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return undefined;
        console.warn('[project-cover] failed to load HTML cover:', diagnostic, err);
        return undefined;
      }
    }

    try {
      const response = await fetch(src, {
        method: 'HEAD',
        cache: 'no-store',
        signal,
        ...(requestWorkspaceContext
          ? { headers: workspaceProjectHeaders(requestWorkspaceContext) }
          : {}),
      });
      if (signal.aborted) return undefined;
      if (response.ok || response.status === 304) return cover;
      console.warn(
        `[project-cover] HTML cover unavailable (${response.status} ${response.statusText}):`,
        diagnostic,
      );
      // The server answered: the cover file is not readable. That decision is
      // cacheable; the card renders its glyph until the project changes.
      return null;
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return undefined;
      console.warn('[project-cover] failed to verify HTML cover:', diagnostic, err);
      return undefined;
    }
  }, []);

  const requestProjectCover = useCallback((
    project: Project,
    options: { force?: boolean } = {},
  ): Promise<void> => {
    if (!activeRef.current) return Promise.resolve();
    if (workspaceContextLoadingRef.current) return Promise.resolve();
    const requestWorkspaceContext = workspaceContextRef.current;
    const snapshotKey = projectCoverSnapshotKey(
      workspaceIdentityCacheKey(requestWorkspaceContext),
      project.id,
      project.updatedAt,
    );
    if (!options.force) {
      // Serve the last successful decision for this exact workspace/project/
      // version instead of re-running the files scan + probe on every
      // remount. Stale versions miss the key; content-ready events
      // invalidate explicitly (Batch A §4.2).
      const snapshot = getProjectCoverSnapshot(snapshotKey);
      if (snapshot !== undefined) {
        if (visibleProjectsRef.current.has(project.id)) {
          setCoverByProject((current) =>
            current[project.id] === snapshot.cover
              ? current
              : { ...current, [project.id]: snapshot.cover },
          );
        }
        return Promise.resolve();
      }
    }
    const existing = coverInFlightRef.current.get(project.id);
    if (existing && !options.force) return existing.promise;
    const generation = (coverGenerationRef.current.get(project.id) ?? 0) + 1;
    coverGenerationRef.current.set(project.id, generation);
    const controller = new AbortController();
    const promise = coverQueue.schedule(
      controller,
      () => loadProjectCover(
        project,
        controller.signal,
        requestWorkspaceContext,
        options.force === true,
      ),
      options.force,
    )
      .then((cover) => {
        if (controller.signal.aborted) return;
        if (cover === undefined) return;
        if (coverGenerationRef.current.get(project.id) !== generation) return;
        setProjectCoverSnapshot(snapshotKey, cover);
        if (!visibleProjectsRef.current.has(project.id)) return;
        setCoverByProject((current) => ({ ...current, [project.id]: cover }));
      })
      .finally(() => {
        // Generation values can be reused after a StrictMode synthetic cleanup
        // clears the maps. Only the exact request that installed this entry may
        // remove it; otherwise late settlement from replay A can erase replay
        // B, leaving the real unmount with no controller to abort.
        if (coverInFlightRef.current.get(project.id)?.controller === controller) {
          coverInFlightRef.current.delete(project.id);
        }
      });
    coverInFlightRef.current.set(project.id, { controller, generation, promise });
    // Install the replacement first so a force-refresh enters the front of the
    // queue before aborting its stale predecessor releases a slot.
    existing?.controller.abort();
    return promise;
  }, [coverQueue, loadProjectCover]);

  const abortBackgroundCoverRequests = useCallback(() => {
    coverQueue.withoutDraining(() => {
      for (const request of coverInFlightRef.current.values()) {
        request.controller.abort();
      }
    });
    coverInFlightRef.current.clear();
  }, [coverQueue]);

  // Cards report themselves through a per-card viewport sentinel; only cards
  // that have actually been near the viewport ever start cover work
  // (Batch A §4.2). The set is per-mount on purpose: a fresh strip instance
  // re-discovers visibility, while resolved decisions come from the snapshot
  // cache.
  const coverSentinelSeenRef = useRef(new Set<string>());
  useEffect(() => {
    abortBackgroundCoverRequests();
    setCoverByProject({});
    if (workspaceContextLoading) return;
    for (const project of visibleProjectsRef.current.values()) {
      if (!coverSentinelSeenRef.current.has(project.id)) continue;
      void requestProjectCover(project);
    }
  }, [
    abortBackgroundCoverRequests,
    requestProjectCover,
    workspaceContextLoading,
    workspaceIdentity,
  ]);
  const handleCoverCardVisible = useCallback((projectId: string) => {
    if (coverSentinelSeenRef.current.has(projectId)) return;
    coverSentinelSeenRef.current.add(projectId);
    if (workspaceContextLoadingRef.current) return;
    const project = visibleProjectsRef.current.get(projectId);
    if (!project) return;
    void requestProjectCover(project);
  }, [requestProjectCover]);

  const resumeBackgroundCoverRequests = useCallback(() => {
    if (!activeRef.current) return;
    resumeThumbnailLoads();
    for (const project of visibleProjectsRef.current.values()) {
      if (!coverSentinelSeenRef.current.has(project.id)) continue;
      void requestProjectCover(project);
    }
  }, [requestProjectCover]);

  useEffect(() => {
    return () => {
      // Cover probes are background-only. Do not let them survive navigation
      // away from Home and occupy the connections needed by the reopened
      // project's file list and preview source.
      abortBackgroundCoverRequests();
      coverGenerationRef.current.clear();
    };
  }, [abortBackgroundCoverRequests]);

  const refreshProjectCover = useCallback((projectId: string) => {
    // A content-ready event is authoritative: the stored cover decision (any
    // version) and any pre-materialization file-list read are void even if the
    // card is currently offscreen or unlisted. Invalidate the exact Workspace
    // authority before the forced scan so another force refresh in the same
    // burst cannot make the file-list layer reuse its earlier [] response.
    invalidateProjectCoverSnapshots(projectId);
    invalidateProjectFilesCache(projectId, workspaceContextRef.current);
    const project = visibleProjectsRef.current.get(projectId);
    if (!project) return;
    if (!coverSentinelSeenRef.current.has(projectId)) return;
    // Supersedes an older initial scan that may still be resolving against
    // the pre-pull filesystem.
    void requestProjectCover(project, { force: true });
  }, [requestProjectCover]);

  useWorkspaceInvalidation(
    {
      'team-project-content-ready': ({ projectId, workspaceId }) => {
        if (!activeRef.current) return;
        if (workspaceContext?.workspaceId !== workspaceId) return;
        void refreshProjectCover(projectId);
      },
    },
    {
      workspaceContext,
      // Thin SSE events are not replayed. On reconnect/focus, retry only cards
      // whose initial scan found no local cover, closing a missed-ready gap
      // without re-fetching every already-resolved card in the grid.
      onActive: () => {
        if (!activeRef.current) return;
        for (const { project } of visibleProjects) {
          if (!coverSentinelSeenRef.current.has(project.id)) continue;
          if (coverByProject[project.id] == null) {
            if (coverInFlightRef.current.has(project.id)) continue;
            // `null` is normally a cacheable no-cover decision. Reconnect is
            // specifically the missed-invalidation recovery path, so bypass
            // that snapshot and re-probe the exact current Workspace.
            void requestProjectCover(project, { force: true });
          }
        }
      },
    },
  );

  useEffect(() => {
    const visibleIds = new Set(visibleProjects.map(({ project }) => project.id));
    if (!isActive) {
      abortBackgroundCoverRequests();
      return;
    }
    const staleRequests = [...coverInFlightRef.current.entries()]
      .filter(([projectId]) => !visibleIds.has(projectId));
    coverQueue.withoutDraining(() => {
      for (const [projectId, request] of staleRequests) {
        request.controller.abort();
        coverInFlightRef.current.delete(projectId);
        coverGenerationRef.current.delete(projectId);
      }
    });
    if (visibleProjects.length === 0) {
      setCoverByProject({});
      return;
    }
    setCoverByProject((current) => {
      const entries = Object.entries(current).filter(([projectId]) => visibleIds.has(projectId));
      return entries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(entries);
    });
    for (const { project } of visibleProjects) {
      if (!coverSentinelSeenRef.current.has(project.id)) continue;
      void requestProjectCover(project);
    }
    // Intentionally keyed on the id set (coverFetchKey), not visibleProjects,
    // so re-renders that don't change which projects are shown don't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abortBackgroundCoverRequests, coverFetchKey, coverQueue, isActive, requestProjectCover]);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. We also skip rendering during the
  // load window so the section doesn't pop in and then collapse;
  // the prompt hero is enough chrome on its own.
  // Home rail only: an empty rail is dropped entirely (dashed empty chrome is
  // noise over the plugin gallery). The FULL-PAGE grids (drafts/all-projects)
  // must keep their header + filter toolbar even when the current owner/type
  // filter matches nothing — collapsing them stranded the user with no way to
  // change the filter back.
  if (visibleProjects.length === 0 && !fullPageGrid) {
    return null;
  }

  function startRename(project: Project) {
    const creator = resolveCreator(project.id);
    if (!creator.ownedBySelf) return;
    trackCollection('rename', {
      project_key: project.id,
      project_relation: 'self',
    });
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
    trackCollection('delete', {
      project_key: project.id,
      project_relation: 'self',
    });
    setMenuOpenId(null);
    setDeleteFailed(false);
    setConfirmTarget(project);
  }

  // Promote/demote a project through the same workspace move endpoint used by
  // the full project grid so cards and in-file sharing cannot drift.
  async function handleShareToTeam(project: Project) {
    const startedAt = performance.now();
    setShareErrorProjectId(null);
    setMenuOpenId(project.id);
    setSharingId(project.id);
    try {
      const movedProject = await moveWorkspaceProject({
        projectId: project.id,
        visibility: 'team',
        workspaceContext,
      });
      onProjectShared?.(movedProject);
      notifyTeamProjectsChanged();
      setMenuOpenId(null);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_team',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
    } catch (err) {
      onProjectShareFailed?.(project.id);
      console.warn('[RecentProjectsStrip] share project to team failed:', err);
      setShareErrorProjectId(project.id);
      setShareErrorKind(
        workspaceProjectMoveErrorCode(err) === 'TEAM_PROJECT_OWNER_CONFLICT'
          ? 'owner-conflict'
          : 'share',
      );
      setMenuOpenId(project.id);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_team',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: workspaceProjectMoveErrorCode(err) ?? 'request_failed',
        ...workspaceDimensions,
      });
    } finally {
      setSharingId(null);
    }
  }

  async function handleUnshareFromTeam(project: Project) {
    const startedAt = performance.now();
    setShareErrorProjectId(null);
    setMenuOpenId(project.id);
    setUnsharingId(project.id);
    try {
      await moveWorkspaceProject({
        projectId: project.id,
        visibility: 'personal',
        workspaceContext,
      });
      onProjectUnshared?.(project.id);
      notifyTeamProjectsChanged();
      setMenuOpenId(null);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_personal',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
    } catch (err) {
      console.warn('[RecentProjectsStrip] unshare project from team failed:', err);
      setShareErrorProjectId(project.id);
      setShareErrorKind('unshare');
      setMenuOpenId(project.id);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_personal',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: workspaceProjectMoveErrorCode(err) ?? 'request_failed',
        ...workspaceDimensions,
      });
    } finally {
      setUnsharingId(null);
    }
  }

  function requestDuplicate(project: Project) {
    if (!onDuplicate) return;
    // Same ownership gate the menu item's `disabled` already enforces (see
    // recvqaRqM0dv2x above) — kept here too so the handler itself can never
    // fire the doomed-to-403 request, matching startRename/requestDelete's
    // own defense-in-depth check.
    const creator = resolveCreator(project.id);
    if (!creator.ownedBySelf) return;
    trackCollection('duplicate', {
      project_key: project.id,
      project_relation: 'self',
    });
    setMenuOpenId(null);
    const startedAt = performance.now();
    void Promise.resolve(onDuplicate(project.id)).then(() => {
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'duplicate',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
    }).catch((err) => {
      console.warn('[RecentProjectsStrip] duplicate project failed:', err);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'duplicate',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: 'request_failed',
        ...workspaceDimensions,
      });
    });
  }

  async function commitDelete() {
    if (!confirmTarget || !onDelete) return;
    const target = confirmTarget;
    const startedAt = performance.now();
    setDeleteFailed(false);
    try {
      const result = await onDelete(target.id);
      // A falsy result (false, or void from a caller that never resolves the
      // promise either way) means the daemon refused or the request failed —
      // keep the dialog open with a visible reason instead of closing it as
      // if the project were gone (recvqbh189zBY6).
      if (result === false) {
        trackWorkspaceProjectActionResult(analytics.track, {
          page_name: analyticsPage,
          area: 'project_collection',
          action: 'delete',
          result: 'failed',
          requested_count: 1,
          succeeded_count: 0,
          failed_count: 1,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: 'request_failed',
          ...workspaceDimensions,
        });
        setDeleteFailed(true);
        return;
      }
      setConfirmTarget(null);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'delete',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
    } catch (err) {
      console.warn('[RecentProjectsStrip] delete project failed:', err);
      setDeleteFailed(true);
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'delete',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: 'request_failed',
        ...workspaceDimensions,
      });
    }
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

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedProjectIds(new Set());
  }

  /** Shared by the single-card and the bulk move confirmations so both spell
   *  out the same consequence of crossing the team-space boundary. */
  function moveDescription(action: 'to-team' | 'to-personal') {
    return action === 'to-team' ? (
      <>
        {t('recentProjects.moveToTeamDescPre')}
        <strong>{t('recentProjects.moveToTeamDescStrong')}</strong>
        {t('recentProjects.moveToTeamDescPost')}
      </>
    ) : (
      <>
        {t('recentProjects.moveToPersonalDescPre')}
        <strong>{t('recentProjects.moveToPersonalDescStrong')}</strong>
        {t('recentProjects.moveToPersonalDescPost')}
      </>
    );
  }

  function requestBulkMove(action: 'to-team' | 'to-personal') {
    if (bulkMutationDisabled) return;
    trackCollection(action === 'to-team' ? 'bulk_move_to_team' : 'bulk_move_to_personal', {
      selection_count_bucket: countBucket(selectedCount),
    });
    if (moveDontRemind) {
      void commitBulkMove(action);
      return;
    }
    setBulkMoveAction(action);
  }

  /** Batch form of the per-card 转入/移出团队空间 action: the very same
   *  `moveWorkspaceProject` call, once per selected project. Failures are
   *  reported per project and never abort the rest of the batch. */
  async function commitBulkMove(action: 'to-team' | 'to-personal') {
    const ids = selectedProjects.map(({ project }) => project.id);
    const startedAt = performance.now();
    setBulkMoveAction(null);
    exitSelectionMode();
    if (ids.length === 0) return;
    const visibility = action === 'to-team' ? 'team' : 'personal';
    const moved = await Promise.all(
      ids.map(async (id) => {
        try {
          const project = await moveWorkspaceProject({ projectId: id, visibility, workspaceContext });
          return { id, project };
        } catch (err) {
          if (action === 'to-team') onProjectShareFailed?.(id);
          console.warn('[RecentProjectsStrip] bulk move project failed:', err);
          return null;
        }
      }),
    );
    const succeeded = moved.filter(
      (result): result is { id: string; project: WorkspaceProjectSummary } => result !== null,
    );
    for (const result of succeeded) {
      if (action === 'to-team') onProjectShared?.(result.project);
      else onProjectUnshared?.(result.id);
    }
    if (succeeded.length > 0) notifyTeamProjectsChanged();
    const failedCount = ids.length - succeeded.length;
    trackWorkspaceProjectActionResult(analytics.track, {
      page_name: analyticsPage,
      area: 'project_collection',
      action: action === 'to-team' ? 'bulk_move_to_team' : 'bulk_move_to_personal',
      result: failedCount === 0 ? 'success' : succeeded.length > 0 ? 'partial_success' : 'failed',
      requested_count: ids.length,
      succeeded_count: succeeded.length,
      failed_count: failedCount,
      duration_ms: Math.round(performance.now() - startedAt),
      ...(failedCount > 0 ? { error_code: 'one_or_more_failed' } : {}),
      ...workspaceDimensions,
    });
  }

  async function commitBulkDelete() {
    const ids = selectedProjects.map(({ project }) => project.id);
    const startedAt = performance.now();
    setBulkDeleteOpen(false);
    exitSelectionMode();
    if (!onDelete || ids.length === 0) return;
    const deleted = await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await onDelete(id);
          return result === false ? null : id;
        } catch (err) {
          console.warn('[RecentProjectsStrip] bulk delete project failed:', err);
          return null;
        }
      }),
    );
    const succeededCount = deleted.filter((id): id is string => id !== null).length;
    const failedCount = ids.length - succeededCount;
    trackWorkspaceProjectActionResult(analytics.track, {
      page_name: analyticsPage,
      area: 'project_collection',
      action: 'bulk_delete',
      result: failedCount === 0 ? 'success' : succeededCount > 0 ? 'partial_success' : 'failed',
      requested_count: ids.length,
      succeeded_count: succeededCount,
      failed_count: failedCount,
      duration_ms: Math.round(performance.now() - startedAt),
      ...(failedCount > 0 ? { error_code: 'one_or_more_failed' } : {}),
      ...workspaceDimensions,
    });
  }

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
            {space === 'team' &&
            canAccessInviteFlow &&
            inviteTarget.kind !== 'unavailable' ? (
              <button
                type="button"
                className="recent-projects__invite"
                onClick={() => {
                  trackCollection('invite_teammates');
                  if (inviteTarget.kind === 'vela') {
                    window.open(inviteTarget.url, '_blank', 'noopener,noreferrer');
                  } else if (inviteTarget.kind === 'local') {
                    setInviteOpen(true);
                  }
                }}
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
                  trackCollection('multi_select_toggle', {
                    selection_count_bucket: countBucket(selectedCount),
                  });
                  setSelectionMode((current) => !current);
                  setSelectedProjectIds(new Set());
                  setMenuOpenId(null);
                }}
              >
                {t('recentProjects.multiSelect')}
              </button>
            ) : null}
            {showOwnerFilter ? (
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
                          trackCollection('filter', {
                            filter_type: 'owner',
                            filter_value: option.id,
                          });
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
            ) : null}
            <div className="recent-projects__filter-wrap">
              <button
                type="button"
                className="recent-projects__filter"
                aria-expanded={openHeaderMenu === 'kind'}
                onClick={() => setOpenHeaderMenu((current) => current === 'kind' ? null : 'kind')}
              >
                {kindFilterLabel(
                  KIND_FILTER_OPTIONS.find((option) => option.id === kindFilter) ?? KIND_FILTER_OPTIONS[0]!,
                  t,
                )}
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
                        trackCollection('filter', {
                          filter_type: 'project_type',
                          filter_value: option.id,
                        });
                        setKindFilter(option.id);
                        setOpenHeaderMenu(null);
                      }}
                    >
                      {kindFilterLabel(option, t)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {hasActiveFilter ? (
              // Only rendered once a filter narrows the grid, so it never
              // competes for attention with the plain owner/kind/sort chips
              // above — see recvqbipG9QDTt.
              <button
                type="button"
                className="recent-projects__filter-clear"
                data-testid="recent-projects-clear-filters"
                onClick={() => {
                  trackCollection('filter', {
                    filter_type: 'owner',
                    filter_value: 'all',
                  });
                  trackCollection('filter', {
                    filter_type: 'project_type',
                    filter_value: 'all',
                  });
                  setOwnerFilter('all');
                  setKindFilter('all');
                  setOpenHeaderMenu(null);
                }}
              >
                <Icon name="close" size={12} />
                {t('recentProjects.clearFilters')}
              </button>
            ) : null}
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
                        trackCollection('sort', {
                          sort_value:
                            option.id === 'updatedAsc'
                              ? 'updated_asc'
                              : option.id === 'nameAsc'
                                ? 'name_asc'
                                : 'updated_desc',
                        });
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
                onClick={() => {
                  if (view !== 'grid') {
                    trackCollection('view_toggle', { view_value: 'grid' });
                    setView('grid');
                  }
                }}
              >
                <Icon name="grid" size={15} />
              </button>
              <button
                type="button"
                className={`recent-projects__view-btn${view === 'list' ? ' is-active' : ''}`}
                aria-pressed={view === 'list'}
                aria-label={t('recentProjects.viewList')}
                onClick={() => {
                  if (view !== 'list') {
                    trackCollection('view_toggle', { view_value: 'list' });
                    setView('list');
                  }
                }}
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
        <div
          className="recent-projects__bulkbar"
          role="toolbar"
          aria-label={t('recentProjects.multiSelect')}
        >
          <span className="recent-projects__bulkbar-count">
            {t('designs.selectedCount', { n: selectedCount })}
          </span>
          <div className="recent-projects__bulkbar-actions">
            {canBulkMoveToTeam ? (
              <button
                type="button"
                disabled={bulkMutationDisabled}
                title={bulkMutationTitle}
                onClick={() => requestBulkMove('to-team')}
              >
                <Icon name="import" size={14} /> {t('recentProjects.moveToTeam')}
              </button>
            ) : null}
            {canBulkMoveToPersonal ? (
              <button
                type="button"
                disabled={bulkMutationDisabled}
                title={bulkMutationTitle}
                onClick={() => requestBulkMove('to-personal')}
              >
                <Icon name="log-out" size={14} /> {t('recentProjects.moveOutOfTeam')}
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="danger"
                disabled={bulkMutationDisabled}
                title={bulkMutationTitle}
                onClick={() => {
                  trackCollection('bulk_delete', {
                    selection_count_bucket: countBucket(selectedCount),
                  });
                  setBulkDeleteOpen(true);
                }}
              >
                <Icon name="trash" size={14} /> {t('designs.deleteSelected')}
              </button>
            ) : null}
            <button type="button" className="ghost" onClick={exitSelectionMode}>
              {t('designs.cancelSelect')}
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={rowRef}
        className={`recent-projects__row${fullPageGrid ? ` recent-projects__row--${view}` : ''}${menuOpenId ? ' recent-projects__row--menu-open' : ''}${selectionMode ? ' is-selecting' : ''}`}
        role="list"
      >
        {visibleProjects.map(({ project, creator }) => {
          const cover = projectCover(
            project,
            coverByProject[project.id] ?? null,
            workspaceContext,
          );
          const designSystemProject = isDesignSystemProject(project);
          const status: ProjectDisplayStatus = project.status?.value ?? 'not_started';
          const publishedDesignSystem = isPublishedDesignSystemProject(project, designSystems);
          const isActive =
            !publishedDesignSystem &&
            (status === 'running' ||
              status === 'queued' ||
              status === 'awaiting_input' ||
              // Incomplete is terminal but needs attention; show the status dot so
              // it reads as "not done", not a static success pill (#1247 / #1060).
              status === 'incomplete');
          const shared = isShared(project.id);
          const selected = selectedProjectIds.has(project.id);
          const readonlyShared = shared && !creator.ownedBySelf;
          const opening = openingProjectId === project.id;
          return (
            <div
              key={project.id}
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}${shared ? ' is-shared' : ''}${menuOpenId === project.id ? ' is-menu-open' : ''}${selected ? ' is-selected' : ''}${readonlyShared ? ' is-readonly-shared' : ''}${opening ? ' is-opening' : ''}`}
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
                  <span aria-hidden>
                    {selected ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        width={16}
                        height={16}
                        style={{ display: 'block' }}
                      >
                        <path d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z" />
                      </svg>
                    ) : null}
                  </span>
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
                  if (opening) return;
                  const openStartedAt = performance.now();
                  const openRequestId = analytics.newRequestId();
                  const projectRelation = creator.ownedBySelf ? 'self' : 'other';
                  const materialization =
                    project.metadata?.sharedProjectPlaceholderAt != null ? 'required' : 'warm';
                  trackCollection('project_open', {
                    project_key: project.id,
                    project_relation: projectRelation,
                  }, openRequestId);
                  const trackSharedOpenResult = (opened: boolean) => {
                    if (!shared && space !== 'team') return;
                    trackWorkspaceSharedProjectOpenResult(analytics.track, {
                      page_name: analyticsPage,
                      area: 'project_collection',
                      result: opened ? 'success' : 'failed',
                      project_relation: projectRelation,
                      materialization,
                      duration_ms: Math.round(performance.now() - openStartedAt),
                      ...(!opened ? { error_code: 'open_failed' } : {}),
                      ...workspaceDimensions,
                    }, { requestId: openRequestId });
                  };
                  // Release every background cover slot before the project view
                  // starts its foreground files/content reads. Waiting for the
                  // entry shell to unmount is too late: navigation itself needs
                  // those same browser connections. Suspending the thumbnail
                  // gate also unmounts still-loading preview iframes so their
                  // document loads stop competing immediately (Batch A §4.2);
                  // already-loaded frames stay rendered.
                  abortBackgroundCoverRequests();
                  suspendThumbnailLoads();
                  try {
                    const result = onOpen(project.id);
                    if (result && typeof result === 'object' && 'then' in result) {
                      void Promise.resolve(result).then(
                        (opened) => {
                          trackSharedOpenResult(opened !== false);
                          if (opened === false) resumeBackgroundCoverRequests();
                        },
                        () => {
                          trackSharedOpenResult(false);
                          resumeBackgroundCoverRequests();
                        },
                      );
                    } else if (result === false) {
                      trackSharedOpenResult(false);
                      resumeBackgroundCoverRequests();
                    } else {
                      trackSharedOpenResult(true);
                    }
                  } catch {
                    trackSharedOpenResult(false);
                    resumeBackgroundCoverRequests();
                  }
                }}
                aria-busy={opening ? true : undefined}
                title={project.name}
              >
                {opening ? (
                  <span className="recent-projects__card-opening" aria-hidden>
                    <Icon name="spinner" size={20} />
                  </span>
                ) : null}
                <div
                  className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                  style={cover.style}
                  aria-hidden
                >
                  <CoverVisibilitySentinel
                    projectId={project.id}
                    onVisible={handleCoverCardVisible}
                  />
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
                      initial={cover.initial}
                      diagnostic={`${project.id}:${cover.name ?? 'unknown'}`}
                      deckCoverOnly={project.metadata?.kind === 'deck'}
                      workspaceContext={workspaceContext}
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
                  ) : shared && view !== 'list' ? (
                    // Grid's thumb has room for the badge as a floating overlay
                    // (hover-revealed, see recent-projects.css); list view's
                    // thumb is far too small (128x52) for it — the inline
                    // variant next to the name below covers that case instead.
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
                  <div className="recent-projects__card-name-row">
                    <span className="recent-projects__card-name">{project.name}</span>
                    {shared && view === 'list' ? (
                      <span className="recent-projects__card-badge recent-projects__card-badge--shared recent-projects__card-badge--inline">
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="8" r="3" />
                          <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0-1-5.8M21 20a6 6 0 0 0-5-5.9" />
                        </svg>
                        {t('recentProjects.sharedBadge')}
                      </span>
                    ) : null}
                  </div>
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
                      trackCollection('more_menu', {
                        project_key: project.id,
                        project_relation: creator.ownedBySelf ? 'self' : 'other',
                      });
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
                      {/* recvqaRqM0dv2x: duplicating a team-shared project you
                          did not create is meaningless (the daemon's
                          canDuplicate mirrors canMutate — privileged-or-
                          selfCreated only, see enforceWorkspaceProjectMutation)
                          and always 403s. This item was missing the same
                          ownedBySelf gate Rename/Delete already carry, so it
                          stayed enabled on a foreign card and looked like a
                          dead click when pressed. */}
                      {onDuplicate ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!creator.ownedBySelf}
                          title={creator.ownedBySelf ? undefined : t('recentProjects.ownOnlyMutation')}
                          onClick={() => requestDuplicate(project)}
                        >
                          <Icon name="copy" size={12} />
                          <span>{t('designs.menuDuplicate')}</span>
                        </button>
                      ) : null}
                      {/* recvq5fpqrXzV1: this menu item moves a project's
                          visibility WITHIN the current workspace, which is
                          meaningless (and the daemon 403s it) when the current
                          workspace has no team plane to share into at all — a
                          personal-only workspace. `collaborationAvailable` is
                          the same gate the bulk toolbar's move actions
                          already use (canBulkMoveToTeam/canBulkMoveToPersonal
                          above); this per-card item was missing it. */}
                      {collaborationAvailable && (shared && creator.ownedBySelf ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={unsharingId === project.id}
                          onClick={() => requestMove(project, 'to-personal')}
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
                          onClick={() => requestMove(project, 'to-team')}
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
                      ))}
                      {shareErrorProjectId === project.id ? (
                        <div className="recent-projects__card-menu-error" role="alert">
                          {t(
                            shareErrorKind === 'unshare'
                              ? 'recentProjects.unshareFailed'
                              : shareErrorKind === 'owner-conflict'
                                ? 'recentProjects.shareOwnerConflict'
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
          onClose={() => {
            setConfirmTarget(null);
            setDeleteFailed(false);
          }}
          ariaLabelledBy={confirmTitleId}
        >
          <DialogTitle id={confirmTitleId}>{t('designs.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('designs.deleteConfirm', { name: confirmTarget.name })}
          </DialogDescription>
          {deleteFailed ? (
            <p className="recent-projects__card-menu-error" role="alert">
              {t('ds.actionFailed')}
            </p>
          ) : null}
          <DialogFooter className="row">
            <button
              type="button"
              onClick={() => {
                setConfirmTarget(null);
                setDeleteFailed(false);
              }}
            >
              {t('designs.renameCancel')}
            </button>
            <button type="button" className="primary danger" onClick={() => void commitDelete()}>
              {t('designs.menuDelete')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {moveTarget ? (
        <Dialog
          className="modal-confirm"
          backdropClassName="modal-backdrop--no-blur"
          role="alertdialog"
          onClose={() => setMoveTarget(null)}
          closeOnEscape
          ariaLabelledBy={moveTitleId}
        >
          <DialogTitle id={moveTitleId}>
            {moveTarget.action === 'to-team'
              ? t('recentProjects.moveToTeam')
              : t('recentProjects.moveOutOfTeam')}
          </DialogTitle>
          <DialogDescription>{moveDescription(moveTarget.action)}</DialogDescription>
          <DialogFooter className="row">
            <label className="recent-projects__move-remind">
              <input
                type="checkbox"
                checked={moveDontRemind}
                onChange={(event) => setMoveDontRemind(event.target.checked)}
              />
              {t('recentProjects.moveDontRemind')}
            </label>
            <button type="button" onClick={() => setMoveTarget(null)}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="button"
              className={`primary${moveTarget.action === 'to-team' ? ' recent-projects__move-confirm' : ''}`}
              onClick={commitMove}
            >
              {moveTarget.action === 'to-team'
                ? t('recentProjects.confirmMoveToTeam')
                : t('recentProjects.confirmMoveToPersonal')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {bulkMoveAction ? (
        <Dialog
          className="modal-confirm"
          backdropClassName="modal-backdrop--no-blur"
          role="alertdialog"
          onClose={() => setBulkMoveAction(null)}
          closeOnEscape
          ariaLabelledBy={bulkMoveTitleId}
        >
          <DialogTitle id={bulkMoveTitleId}>
            {bulkMoveAction === 'to-team'
              ? t('recentProjects.moveToTeam')
              : t('recentProjects.moveOutOfTeam')}
          </DialogTitle>
          <DialogDescription>{moveDescription(bulkMoveAction)}</DialogDescription>
          <DialogFooter className="row">
            <label className="recent-projects__move-remind">
              <input
                type="checkbox"
                checked={moveDontRemind}
                onChange={(event) => setMoveDontRemind(event.target.checked)}
              />
              {t('recentProjects.moveDontRemind')}
            </label>
            <button type="button" onClick={() => setBulkMoveAction(null)}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="button"
              className={`primary${bulkMoveAction === 'to-team' ? ' recent-projects__move-confirm' : ''}`}
              onClick={() => void commitBulkMove(bulkMoveAction)}
            >
              {bulkMoveAction === 'to-team'
                ? t('recentProjects.confirmMoveToTeam')
                : t('recentProjects.confirmMoveToPersonal')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      {bulkDeleteOpen ? (
        <Dialog
          className="modal-confirm"
          role="alertdialog"
          onClose={() => setBulkDeleteOpen(false)}
          closeOnEscape
          ariaLabelledBy={bulkDeleteTitleId}
        >
          <DialogTitle id={bulkDeleteTitleId}>{t('designs.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('designs.deleteSelectedConfirm', { n: selectedCount })}
          </DialogDescription>
          <DialogFooter className="row">
            <button type="button" onClick={() => setBulkDeleteOpen(false)}>
              {t('designs.renameCancel')}
            </button>
            <button
              type="button"
              className="primary danger"
              onClick={() => void commitBulkDelete()}
            >
              {t('designs.deleteSelected')}
            </button>
          </DialogFooter>
        </Dialog>
      ) : null}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceContext={workspaceContext}
        canAssignRoles={
          canAssignInviteRoles ?? workspaceContext?.permissions.canInviteMembers === true
        }
        availableSeats={workspaceContext?.seatSummary?.availableSeats}
        entryFrom="all_projects"
        onUpgrade={
          inviteUpgradeUrl
            ? () => {
                window.open(inviteUpgradeUrl, '_blank', 'noopener,noreferrer');
              }
            : undefined
        }
      />
    </section>
  );
}

// Card thumbnails for HTML projects render the real artifact, not a
// placeholder: a plain prototype page loads straight into a lazy sandboxed
// iframe, while a deck collapses to its first slide (`DeckCoverThumb`) so the
// card shows a cover instead of whichever slide the deck script last left on
// screen.
function RecentProjectHtmlThumb({
  src,
  initial,
  diagnostic,
  deckCoverOnly,
  workspaceContext,
}: {
  src: string;
  initial: string;
  diagnostic: string;
  deckCoverOnly: boolean;
  workspaceContext?: WorkspaceCollabContext | null;
}) {
  // Plain HTML goes through the shared cover frame (#5762): it HEAD-probes the
  // cover URL in the parent cover queue first and falls back to the initial
  // glyph when the entry file has gone missing. Keeping verification in that
  // queue is what prevents an All Projects grid from launching one HEAD per
  // card at once.
  if (!deckCoverOnly) {
    return (
      <VerifiedHtmlCoverFrame
        src={src}
        initial={initial}
        diagnostic={diagnostic}
      />
    );
  }

  return <DeckCoverThumb src={src} workspaceContext={workspaceContext} />;
}

function VerifiedHtmlCoverFrame({
  src,
  initial,
  diagnostic,
}: {
  src: string;
  initial: string;
  diagnostic: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  // The iframe document load is deferred until the card is near the viewport
  // and one of the shared thumbnail load slots is free, so a large grid
  // cannot flood the daemon with background document loads (Batch A §4.2).
  const { ref: inViewRef, inView } = useInView<HTMLSpanElement>({
    rootMargin: THUMBNAIL_OVERSCAN_MARGIN,
  });
  const { canLoad, settle } = useThumbnailLoadSlot(inView && !failed);
  if (failed) {
    return <span className="recent-projects__card-glyph">{initial}</span>;
  }
  if (!canLoad) {
    return (
      <span ref={inViewRef} className="recent-projects__card-glyph">
        {initial}
      </span>
    );
  }
  return (
    <iframe
      className="recent-projects__thumb-iframe"
      src={src}
      title=""
      loading="lazy"
      sandbox="allow-scripts"
      tabIndex={-1}
      onLoad={settle}
      onError={() => {
        settle();
        console.warn('[project-cover] failed to load HTML cover:', diagnostic);
        setFailed(true);
      }}
    />
  );
}

// Zero-interaction marker that tells the strip when a card's thumbnail area
// first comes near the viewport. Cover probes (files scan + HEAD) start only
// after this fires, so offscreen cards in a 100+ project grid cost nothing
// until scrolled toward (Batch A §4.2).
function CoverVisibilitySentinel({
  projectId,
  onVisible,
}: {
  projectId: string;
  onVisible: (projectId: string) => void;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({
    rootMargin: THUMBNAIL_OVERSCAN_MARGIN,
  });
  const seenRef = useRef(false);
  useEffect(() => {
    if (!inView || seenRef.current) return;
    seenRef.current = true;
    onVisible(projectId);
  }, [inView, onVisible, projectId]);
  return (
    <span
      ref={ref}
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', visibility: 'hidden' }}
    />
  );
}

function DeckCoverThumb({
  src,
  workspaceContext,
}: {
  src: string;
  workspaceContext?: WorkspaceCollabContext | null;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>({
    rootMargin: THUMBNAIL_OVERSCAN_MARGIN,
  });
  const setFrameRef = useCallback(
    (node: HTMLDivElement | null) => {
      frameRef.current = node;
      inViewRef.current = node;
    },
    [inViewRef],
  );
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
    // Deck covers fetch the full document text; defer that until the card is
    // actually near the viewport (Batch A §4.2).
    if (!inView) return;
    loadDeckCover(src, undefined, workspaceContext)
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
  }, [src, inView, workspaceContext]);

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
      ref={setFrameRef}
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

async function loadDeckCover(
  src: string,
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  if (signal) {
    const response = await fetch(src, {
      signal,
      ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    });
    if (!response.ok) throw new Error(`Failed to load project cover: ${response.status}`);
    const parsed = deckPreviewSrcDoc(await response.text());
    if (!signal.aborted) deckCoverCache.set(src, parsed);
    return parsed;
  }
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

export function projectCover(
  project: Project,
  override: ProjectCoverOverride | null,
  workspaceContext?: WorkspaceCollabContext | null,
): {
  kind: 'image' | 'video' | 'html' | 'logo' | 'fallback';
  src?: string;
  style: CSSProperties;
  initial: string;
  name?: string;
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
      src: projectCoverUrl(
        project.id,
        override.name,
        override.mtime,
        workspaceContext,
      ),
      style,
      initial,
      name: override.name,
    };
  }
  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const src = projectCoverUrl(
      project.id,
      entry,
      project.updatedAt,
      workspaceContext,
    );
    if (meta?.kind === 'image') return { kind: 'image', src, style, initial };
    if (meta?.kind === 'video') return { kind: 'video', src, style, initial };
    if (/\.html?$/i.test(entry)) return { kind: 'html', src, style, initial, name: entry };
  }
  return { kind: 'fallback', style, initial };
}

export type ProjectCategory =
  | 'prototype'
  | 'live-artifact'
  | 'web-clone'
  | 'slide'
  | 'media'
  | 'brand';

/** Every chip a project card can wear, `ProjectCategory` plus the
 *  design-system tag the card substitutes for it. */
export type ProjectCardCategory = ProjectCategory | 'design-system';

/**
 * The type a card actually advertises — the single source of truth behind both
 * the chip in the card footer and the header's type filter. It mirrors the
 * card's own branch: a design-system project wears the Design System tag,
 * everything else falls through to {@link projectCategory}. Filtering must go
 * through this, never through the raw `metadata.kind`, or the dropdown starts
 * offering types no chip displays.
 */
export function projectCardCategory(project: Project): ProjectCardCategory {
  return isDesignSystemProject(project) ? 'design-system' : projectCategory(project);
}

export function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  // Website clone projects still store `kind: 'prototype'` (see
  // home-hero/chips.ts's 'web-clone' chip) so preview behavior stays
  // identical to a blank prototype; only `intent: 'web-clone'` marks the
  // scenario. Without this branch every clone fell through to the default
  // 'prototype' bucket and had no way to be filtered separately (recvpZbvupSr1o).
  if (meta?.intent === 'web-clone') return 'web-clone';
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'brand') return 'brand';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

export function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label =
    category === 'live-artifact'
      ? t('designs.tagLiveArtifact')
      : category === 'web-clone'
        ? t('designs.tagWebClone')
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
  return <span className="design-card-tag tag-design-system">{DESIGN_SYSTEM_TAG_LABEL}</span>;
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
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ProjectCoverOverride | null> {
  const knownFiles = new Map(files.map((file) => [file.path ?? file.name, file]));
  const brandCover = await designSystemCoverFromBrandJson(
    projectId,
    knownFiles,
    signal,
    workspaceContext,
  );
  if (signal?.aborted) return null;
  if (brandCover) return brandCover;

  const logo = findDesignSystemLogoFile(files);
  if (!logo) return null;
  return coverFromProjectFile(logo, 'logo');
}

async function designSystemCoverFromBrandJson(
  projectId: string,
  knownFiles: ReadonlyMap<string, ProjectFile>,
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ProjectCoverOverride | null> {
  const raw = await fetchProjectFileText(projectId, 'brand.json', {
    cache: 'no-store',
    signal,
    workspaceContext,
  });
  if (signal?.aborted) return null;
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
  if (image) return coverFromProjectFile(knownFiles.get(image)!, 'image');

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
  if (nonFaviconLogo) return coverFromProjectFile(knownFiles.get(nonFaviconLogo)!, 'logo');
  if (typeof logo?.primary === 'string' && knownFiles.has(logo.primary) && isRasterOrSvgImage(logo.primary)) {
    return coverFromProjectFile(knownFiles.get(logo.primary)!, 'logo');
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
