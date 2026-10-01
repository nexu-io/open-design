import { reportProjectFailure } from '../observability/experience-diagnostics';
// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { CSSProperties } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';

const MOVE_CONFIRM_SKIP_KEY = 'od.projects.moveConfirmSkip';
import { useT } from '../i18n';
import {
  fetchProjectFiles,
  invalidateProjectFilesCache,
} from '../providers/registry';
import type { DesignSystemSummary, Project, ProjectDisplayStatus } from '../types';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { RemixIcon } from './RemixIcon';
import { InviteDialog } from './InviteDialog';
import { ProjectDeleteConfirmDialog } from './project-actions/ProjectDeleteConfirmDialog';
import { useProjectDeleteFlow } from './project-actions/useProjectDeleteFlow';
import { useProjectDuplicateFlow } from './project-actions/useProjectDuplicateFlow';
import { useWorkspaceProjectMove } from './project-actions/useWorkspaceProjectMove';
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
  workspaceInviteAvailableSeats,
  workspaceUpgradeUrl,
} from './EntryNavRail';
import { moveWorkspaceProject } from '../state/projects';
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
import {
  DECK_PREVIEW_HEIGHT,
  DECK_PREVIEW_WIDTH,
  getCachedDeckCover,
  loadDeckCover,
  resolveProjectCover,
} from '../lib/project-cover-pipeline';
// The deck cover parser moved to the pipeline with the rest of the cover
// decision; re-exported so its existing importers keep resolving.
export { deckPreviewSrcDoc } from '../lib/project-cover-pipeline';
import { useInView } from './plugins-home/useInView';
import { workspaceIdentityCacheKey } from '../collab/workspace-identity';
import { useAnalytics } from '../analytics/provider';
import {
  trackProjectCollectionClick,
  trackWorkspaceProjectActionResult,
  trackWorkspaceSharedProjectOpenResult,
} from '../analytics/events';
import {
  countBucket,
  workspaceAnalyticsDimensions,
} from '../analytics/workspace';
import type { ProjectCollectionClickProps } from '@open-design/contracts/analytics';

/** Which project space this strip renders. Drives the per-card 共享 badge
 *  (hidden in the all-shared team space) and the "{creator}创建" line: 'recent'
 *  = home's mixed private/shared, 'drafts' = the member's own private list,
 *  'team' = the全部项目 grid where every card is a team-shared project. */
export type SpaceKind = 'recent' | 'drafts' | 'team';
import {
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
  /** The collection tab the 全部项目 page opens on (drafts space only):
   *  最近浏览过 (every project the rail lists) / 个人项目 (the caller's un-shared
   *  projects) / 团队项目 (what {@link isSharedProject} says is shared). Pass it
   *  to control the tab from the host — the legacy `/all-projects` route opens
   *  the 团队项目 tab this way; leave it out and the strip owns the state. */
  collection?: ProjectCollectionScope;
  onCollectionChange?: (collection: ProjectCollectionScope) => void;
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
/** The chip a design-system project wears on its card. Product name, not a
 *  translated string. The type filter names the same type through the
 *  localized `dsManager.tabDesignSystem` noun (设计体系), per OPEND-3107. */
const DESIGN_SYSTEM_TAG_LABEL = 'Design System';

type DictKey = Parameters<ReturnType<typeof useT>>[0];

type OwnerFilter = 'all' | 'mine' | 'others';
/** The type filter lists every creation type on its own (OPEND-3107, 2026-09-16
 *  定稿), resolved per project by {@link projectKindFilterCategory} from the
 *  creation metadata the Home chips stamp — so a project files under the type
 *  the user picked to create it, not under the storage kind it happens to use
 *  (a HyperFrames project is stored as a video, a WebGL one as a prototype). */
type ProjectKindFilter = 'all' | ProjectKindFilterCategory;
type ProjectSort = 'updatedDesc' | 'updatedAsc' | 'nameAsc';
/** The three collection tabs of the 全部项目 page (OPEND-3108). */
export type ProjectCollectionScope = 'recent' | 'personalProjects' | 'teamProjects';

const OWNER_FILTER_OPTIONS: Array<{ id: OwnerFilter; labelKey: DictKey }> = [
  { id: 'all', labelKey: 'recentProjects.ownerAll' },
  { id: 'mine', labelKey: 'recentProjects.ownerMine' },
  { id: 'others', labelKey: 'recentProjects.ownerOthers' },
];

type KindFilterOption =
  | { id: ProjectKindFilter; labelKey: DictKey; label?: undefined }
  | { id: ProjectKindFilter; label: string; labelKey?: undefined };

// The twelve entries, in the order product specified (OPEND-3107, 2026-09-16):
// 任何类型、原型、幻灯片、文档、图片、HyperFrames、网站克隆、视频、音频、实时产物、
// WebGL、设计体系. Every creation type reuses the Home type chip's own label key
// (home-hero/chip-labels.ts) so the filter names a type exactly the way the
// user picked it; Design system is the same noun the project page's type
// label uses. Media (the merged video / audio bucket) is gone: video, audio
// and HyperFrames are listed on their own.
const KIND_FILTER_OPTIONS: KindFilterOption[] = [
  { id: 'all', labelKey: 'recentProjects.kindAll' },
  { id: 'prototype', labelKey: 'homeHero.chip.prototype' },
  { id: 'slide', labelKey: 'homeHero.chip.deck' },
  { id: 'document', labelKey: 'homeHero.chip.document' },
  { id: 'image', labelKey: 'homeHero.chip.image' },
  { id: 'hyperframes', labelKey: 'homeHero.chip.hyperframes' },
  { id: 'web-clone', labelKey: 'homeHero.chip.webClone' },
  { id: 'video', labelKey: 'homeHero.chip.video' },
  { id: 'audio', labelKey: 'homeHero.chip.audio' },
  { id: 'live-artifact', labelKey: 'homeHero.chip.liveArtifact' },
  { id: 'webgl', labelKey: 'homeHero.chip.webgl' },
  { id: 'design-system', labelKey: 'dsManager.tabDesignSystem' },
];

const COLLECTION_OPTIONS: Array<{ id: ProjectCollectionScope; labelKey: DictKey }> = [
  { id: 'recent', labelKey: 'recentProjects.collectionRecent' },
  { id: 'personalProjects', labelKey: 'recentProjects.collectionPersonalProjects' },
  { id: 'teamProjects', labelKey: 'recentProjects.collectionTeamProjects' },
];

function kindFilterLabel(option: KindFilterOption, t: ReturnType<typeof useT>): string {
  return option.labelKey === undefined ? option.label : t(option.labelKey);
}

const SORT_OPTIONS: Array<{ id: ProjectSort; labelKey: Parameters<ReturnType<typeof useT>>[0] }> = [
  { id: 'updatedDesc', labelKey: 'recentProjects.sortNewest' },
  { id: 'updatedAsc', labelKey: 'recentProjects.sortOldest' },
  { id: 'nameAsc', labelKey: 'recentProjects.sortName' },
];

const VIEW_OPTIONS: Array<{ id: 'grid' | 'list'; labelKey: DictKey }> = [
  { id: 'grid', labelKey: 'designs.viewGrid' },
  { id: 'list', labelKey: 'recentProjects.viewList' },
];


const DEFAULT_RECENT_PROJECT_LIMIT = 6;
const WIDE_RECENT_PROJECT_LIMIT = 7;
const PROJECT_MENU_GAP = 6;
const PROJECT_MENU_VIEWPORT_MARGIN = 24;
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
  collection: controlledCollection,
  onCollectionChange,
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
  // member directory turns an ownerMemberId into a display name, while the
  // workspace context supplies the signed-in user's own name and profile image.
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
  // The invite dialog's seat-gate upgrade CTA shares the public Pricing
  // destination owned by `workspaceUpgradeUrl` in EntryNavRail.tsx.
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
  // The 全部项目 page (drafts space) splits its one catalog into three tabs; the
  // team space and the home rail have no such split.
  const showCollectionTabs = space === 'drafts';
  // 团队项目 is a team-workspace tab only (OPEND-3285): a personal workspace
  // has no shared catalog to show, so the tab would only ever open an empty
  // state. Keyed on the workspace kind, not on `canShareProjects` (a role bit
  // a personal owner also carries).
  const teamCollectionAvailable = workspaceContext?.workspaceType === 'team';
  const collectionOptions = teamCollectionAvailable
    ? COLLECTION_OPTIONS
    : COLLECTION_OPTIONS.filter((option) => option.id !== 'teamProjects');
  const [uncontrolledCollection, setUncontrolledCollection] =
    useState<ProjectCollectionScope>('recent');
  const collection = controlledCollection ?? uncontrolledCollection;
  const selectCollection = (next: ProjectCollectionScope) => {
    if (controlledCollection === undefined) setUncontrolledCollection(next);
    onCollectionChange?.(next);
  };
  // A deep link (`/all-projects`), a cached tab or a workspace switch can land
  // a personal workspace on the hidden team tab; fall back to 最近浏览过 once
  // the workspace kind is known (never while it is still loading, or the
  // team-space deep link would be reset before the context arrives).
  const collectionUnavailable =
    showCollectionTabs &&
    !workspaceContextLoading &&
    !teamCollectionAvailable &&
    collection === 'teamProjects';
  useEffect(() => {
    if (collectionUnavailable) selectCollection('recent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionUnavailable]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [kindFilter, setKindFilter] = useState<ProjectKindFilter>('all');
  const [sort, setSort] = useState<ProjectSort>('updatedDesc');
  // recvqbipG9QDTt: this component mounts once per host view (Home, Drafts,
  // All projects) and stays alive across EntryShell tab switches — Home's
  // instance in particular is only ever hidden via `content-visibility`, not
  // unmounted (see EntryShell's `inactiveViewProps`) — so a filter picked
  // here keeps narrowing the grid on every later visit. The cue is the
  // filter trigger itself, which prints the picked value (Image rather than
  // Any type); resetting goes back through that menu. OPEND-3107 keeps the
  // row at the Demo's three controls, so there is no separate clear chip.
  const [openHeaderMenu, setOpenHeaderMenu] = useState<
    'owner' | 'kind' | 'display' | null
  >(null);
  const displayTriggerRef = useRef<HTMLButtonElement>(null);
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
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down');
  const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  // Delete confirm → request → settle, shared with the rail's 最近项目 rows
  // (OPEND-2797) so both entry points open the very same dialog. A failed
  // request keeps that dialog open with a visible reason (recvqbh189zBY6).
  const deleteFlow = useProjectDeleteFlow({ onDelete, analyticsPage, workspaceContext });
  const duplicateFlow = useProjectDuplicateFlow({ onDuplicate, analyticsPage, workspaceContext });
  // Project → team-space sharing (the project card entry), through the flow
  // the rail rows share. The card menu is this surface's progress readout: it
  // stays open to say 分享中… and to hold the failure text, so a move keeps
  // (re)opening it until the request succeeds.
  const moveFlow = useWorkspaceProjectMove({
    workspaceContext,
    analyticsPage,
    onProjectShared,
    onProjectShareFailed,
    onProjectUnshared,
    onMoveStart: (project) => setMenuOpenId(project.id),
    onMoveSettled: (project, _action, ok) => setMenuOpenId(ok ? null : project.id),
  });
  const { sharingId, unsharingId } = moveFlow;
  const shareErrorProjectId = moveFlow.error?.projectId ?? null;
  const shareErrorKind = moveFlow.error?.kind ?? 'share';
  // Whether a card is team-shared is decided upstream, not here — the grids'
  // 全部项目 / 草稿 partition reads the very same predicate, so the badge and the
  // card's grid can no longer disagree.
  const isShared = isSharedProject ?? NOTHING_SHARED;
  // The card's "{creator}创建" line. Self-owned projects use the account identity
  // instead of the literal "我 / Me" (whose first letter previously produced the
  // misleading M avatar). Other owners still resolve through the team directory.
  const resolveCreator = (projectId: string): {
    name: string;
    initial: string;
    avatarUrl: string | null;
    ownedBySelf: boolean;
  } => {
    const ownerMemberId = projectOwnerMemberIds?.get(projectId) ?? null;
    if (ownerMemberId === selfMemberId || (!ownerMemberId && !isShared(projectId))) {
      const name = workspaceContext?.displayName?.trim() || t('recentProjects.selfCreator');
      const initial = Array.from(name.trim())[0]?.toUpperCase() ?? 'M';
      return {
        name,
        initial,
        avatarUrl: workspaceContext?.avatarUrl?.trim() || null,
        ownedBySelf: true,
      };
    }
    const name = resolveMember(ownerMemberId)?.displayName ?? t('recentProjects.teamMemberCreator');
    const initial = (Array.from(name.trim())[0] ?? 'T').toUpperCase();
    return { name, initial, avatarUrl: null, ownedBySelf: false };
  };
  const visibleProjects = useMemo(
    () => sortedProjects
      .map((project) => ({ project, creator: resolveCreator(project.id) }))
      .filter(({ project, creator }) => {
        // 最近浏览过 is the whole catalog; the other two tabs split it by the one
        // shared-state answer the grids and the card badge already agree on.
        const collectionMatches =
          !showCollectionTabs ||
          collection === 'recent' ||
          (collection === 'personalProjects' ? !isShared(project.id) : isShared(project.id));
        const ownerMatches =
          !showOwnerFilter ||
          ownerFilter === 'all' ||
          (ownerFilter === 'mine' && creator.ownedBySelf) ||
          (ownerFilter === 'others' && !creator.ownedBySelf);
        const kindMatches = kindFilter === 'all' || projectKindFilterCategory(project) === kindFilter;
        return collectionMatches && ownerMatches && kindMatches;
      })
      .slice(0, resolvedLimit),
    [
      collection,
      isShared,
      kindFilter,
      ownerFilter,
      showCollectionTabs,
      projectOwnerMemberIds,
      resolveMember,
      resolvedLimit,
      selfMemberId,
      showOwnerFilter,
      sortedProjects,
      t,
      workspaceContext?.avatarUrl,
      workspaceContext?.displayName,
    ],
  );

  useEffect(() => {
    for (const { project } of visibleProjects) reportProjectFailure(project, 'recent_projects');
  }, [visibleProjects]);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameTitleId = useId();
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
  // A tab that can only hold one side of the share offers only the move that
  // leaves it: 团队项目 cannot move anything TO the team, 个人项目 nothing OUT.
  const canBulkMoveToTeam =
    collaborationAvailable &&
    space !== 'team' &&
    !(showCollectionTabs && collection === 'teamProjects');
  const canBulkMoveToPersonal =
    collaborationAvailable &&
    (space !== 'drafts' || (showCollectionTabs && collection !== 'personalProjects'));

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

  useLayoutEffect(() => {
    if (!menuOpenId) return;
    const anchor = menuContainerRef.current;
    const menu = menuRef.current;
    const trigger = anchor?.querySelector<HTMLElement>('.recent-projects__card-more');
    if (!anchor || !menu || !trigger) return;

    const measureMenuPlacement = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
      const scrollBoundary = anchor.closest<HTMLElement>('.entry-main--scroll');
      const scrollRect = scrollBoundary?.getBoundingClientRect();
      const visibleTop = Math.max(0, scrollRect?.top ?? 0);
      const visibleBottom = Math.min(viewportHeight, scrollRect?.bottom ?? viewportHeight);
      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const spaceBelow =
        visibleBottom - triggerRect.bottom - PROJECT_MENU_GAP - PROJECT_MENU_VIEWPORT_MARGIN;
      const spaceAbove =
        triggerRect.top - visibleTop - PROJECT_MENU_GAP - PROJECT_MENU_VIEWPORT_MARGIN;
      const nextPlacement =
        spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down';

      setMenuPlacement((current) => (current === nextPlacement ? current : nextPlacement));
    };

    measureMenuPlacement();
    window.addEventListener('resize', measureMenuPlacement);
    window.addEventListener('scroll', measureMenuPlacement, true);
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureMenuPlacement);
    if (observer) {
      observer.observe(anchor);
      observer.observe(menu);
    }
    return () => {
      window.removeEventListener('resize', measureMenuPlacement);
      window.removeEventListener('scroll', measureMenuPlacement, true);
      observer?.disconnect();
    };
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
  // The decision itself lives in `lib/project-cover-pipeline`
  // (`resolveProjectCover`), shared with the rail's hover preview
  // (OPEND-2766); this wrapper only keeps the grid's call sites stable.
  const loadProjectCover = useCallback(async (
    project: Project,
    signal: AbortSignal,
    requestWorkspaceContext: WorkspaceCollabContext | null,
    freshFiles = false,
  ): Promise<ProjectCoverOverride | null | undefined> =>
    resolveProjectCover(project, signal, requestWorkspaceContext, freshFiles), []);

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
    deleteFlow.request(project);
  }

  // Promote/demote a project through the same workspace move endpoint used by
  // the full project grid so cards and in-file sharing cannot drift.
  function handleShareToTeam(project: Project) {
    return moveFlow.shareToTeam(project);
  }

  function handleUnshareFromTeam(project: Project) {
    return moveFlow.unshareFromTeam(project);
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
    void duplicateFlow.duplicate(project);
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
        <header
          className={`recent-projects__head${showCollectionTabs ? ' recent-projects__head--personal' : ''}`}
        >
          <div className="recent-projects__title-block">
            <h2 className="recent-projects__heading">{heading ?? t('recentProjects.title')}</h2>
            {description ? (
              <p className="recent-projects__description">{description}</p>
            ) : null}
          </div>
          {showCollectionTabs ? (
            <div
              className="recent-projects__collection-switch"
              role="radiogroup"
              aria-label={heading ?? t('entry.navDrafts')}
            >
              {collectionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={collection === option.id}
                  className="recent-projects__collection-option"
                  data-testid={`recent-projects-collection-${option.id}`}
                  onClick={() => selectCollection(option.id)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="recent-projects__controls">
            {/* The invite CTA belongs to the team collection: the team space
                grid, and the 团队项目 tab of 全部项目 that replaced the rail's
                team entry (OPEND-3108). */}
            {(space === 'team' || (showCollectionTabs && collection === 'teamProjects')) &&
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
                  aria-haspopup="menu"
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
                aria-haspopup="menu"
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
            <div
              className="recent-projects__filter-wrap"
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || openHeaderMenu !== 'display') return;
                event.preventDefault();
                event.stopPropagation();
                setOpenHeaderMenu(null);
                displayTriggerRef.current?.focus();
              }}
            >
              <button
                ref={displayTriggerRef}
                type="button"
                className="recent-projects__view-btn"
                aria-label={`${t('recentProjects.sortAria')} · ${t('designs.viewToggleAria')}`}
                aria-haspopup="menu"
                aria-expanded={openHeaderMenu === 'display'}
                onClick={() =>
                  setOpenHeaderMenu((current) => current === 'display' ? null : 'display')
                }
              >
                <RemixIcon name="more-2-line" size={16} />
              </button>
              {openHeaderMenu === 'display' ? (
                <div
                  className="recent-projects__filter-menu recent-projects__filter-menu--display"
                  role="menu"
                >
                  <div
                    className="recent-projects__filter-menu-group"
                    role="group"
                    aria-label={t('recentProjects.sortAria')}
                  >
                    <span className="recent-projects__filter-menu-label" aria-hidden="true">
                      {t('recentProjects.sortAria')}
                    </span>
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === option.id}
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
                        <span>{t(option.labelKey)}</span>
                        <span className="recent-projects__filter-menu-check" aria-hidden="true">
                          {sort === option.id ? <Icon name="check" size={13} /> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div
                    className="recent-projects__filter-menu-group"
                    role="group"
                    aria-label={t('designs.viewToggleAria')}
                  >
                    <span className="recent-projects__filter-menu-label" aria-hidden="true">
                      {t('designs.viewToggleAria')}
                    </span>
                    {VIEW_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={view === option.id}
                        className={view === option.id ? 'is-active' : undefined}
                        onClick={() => {
                          if (view !== option.id) {
                            trackCollection('view_toggle', { view_value: option.id });
                            setView(option.id);
                          }
                          setOpenHeaderMenu(null);
                        }}
                      >
                        <span>{t(option.labelKey)}</span>
                        <span className="recent-projects__filter-menu-check" aria-hidden="true">
                          {view === option.id ? <Icon name="check" size={13} /> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
      {showCollectionTabs && visibleProjects.length === 0 && collection !== 'recent' ? (
        // A tab with nothing in it says why (the same copy the page-level
        // blank state uses), and keeps the tabs + toolbar so the user can
        // leave it — an empty grid alone read as a broken page.
        <p className="recent-projects__collection-empty">
          {t(
            collection === 'teamProjects'
              ? 'entry.blankAllProjectsDescription'
              : 'entry.blankDraftsDescription',
          )}
        </p>
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
                  ) : null}
                </div>
                <div className="recent-projects__card-meta">
                  <div className="recent-projects__card-name-row">
                    <span className="recent-projects__card-name">{project.name}</span>
                    {shared && view === 'list' ? (
                      <span className="recent-projects__card-badge recent-projects__card-badge--shared recent-projects__card-badge--inline">
                        <Icon name="swap" size={13} />
                        {t('recentProjects.sharedBadge')}
                      </span>
                    ) : null}
                  </div>
                  <div className="recent-projects__card-footer">
                    <div className="recent-projects__card-time">
                      <span className="recent-projects__card-owner" aria-hidden>
                        {creator.initial}
                        {creator.avatarUrl ? (
                          <img
                            key={creator.avatarUrl}
                            src={creator.avatarUrl}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}
                      </span>
                      {/* OPEND-3201: the creator is the part that gives way
                          when the row is short of room; the time keeps its
                          own non-shrinking box so it is never clipped by the
                          kind chip on the right. */}
                      <span className="recent-projects__card-creator">
                        {t('recentProjects.creatorLine', { name: creator.name })}
                      </span>
                      <span className="recent-projects__card-sep" aria-hidden>·</span>
                      <span className="recent-projects__card-when">
                        {relativeTime(project.updatedAt, t)}
                      </span>
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
              {/* The team badge overlays the cover but hangs off the CARD, not
                  the thumb — the same box the ⋯ button's anchor uses. Inside
                  the thumb it inherited that element's 1.03 hover scale, so it
                  grew and slid outward exactly when it appeared, landing flush
                  with the card edge while ⋯ stayed 8px in (per product: 这个间距
                  和最右侧的一样). Grid only: list rows are 128x52 and carry the
                  inline variant beside the name instead. While a share is in
                  flight the thumb shows its spinner instead. */}
              {shared && view !== 'list' && sharingId !== project.id ? (
                <span className="recent-projects__card-badge recent-projects__card-badge--shared">
                  <Icon name="swap" size={13} />
                  {t('recentProjects.sharedBadge')}
                </span>
              ) : null}
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
                      moveFlow.clearError();
                      setMenuOpenId((current) => current === project.id ? null : project.id);
                    }}
                  >
                    <Icon name="more-horizontal" size={14} />
                  </button>
                  {menuOpenId === project.id ? (
                    <div
                      className="recent-projects__card-menu"
                      data-placement={menuPlacement}
                      ref={menuRef}
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
                          <Icon name="pencil" size={14} />
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
                          <Icon name="copy" size={14} />
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
                          <Icon name="close" size={14} />
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
                          <Icon name="share" size={14} />
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
                          <Icon name="close" size={14} />
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
      {deleteFlow.target ? (
        <ProjectDeleteConfirmDialog
          projectName={deleteFlow.target.name}
          pending={deleteFlow.pending}
          failed={deleteFlow.failed}
          onCancel={deleteFlow.cancel}
          onConfirm={() => void deleteFlow.commit()}
        />
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
        availableSeats={workspaceInviteAvailableSeats(workspaceContext)}
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
  const [srcDoc, setSrcDoc] = useState<string | null>(() => getCachedDeckCover(src) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedDeckCover(src);
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

/** The eleven creation types the project list's type filter offers
 *  (OPEND-3107), in the product order. */
export type ProjectKindFilterCategory =
  | 'prototype'
  | 'slide'
  | 'document'
  | 'image'
  | 'hyperframes'
  | 'web-clone'
  | 'video'
  | 'audio'
  | 'live-artifact'
  | 'webgl'
  | 'design-system';

/**
 * The type-filter bucket a project falls into: the type the user picked to
 * create it. Every project resolves to exactly one bucket. The creation
 * `intent` the Home chips stamp (home-hero/chips.ts) outranks the storage
 * `kind`, because two intents share a kind with something else — HyperFrames
 * is stored as a video, WebGL and Document as prototypes — and a bare kind
 * then names the four media / deck / design-system buckets; whatever is left
 * is a blank prototype. This deliberately differs from the card chip
 * ({@link projectCardCategory}), which still folds video / audio into one
 * Media chip and shows no Document, HyperFrames or WebGL chip at all.
 */
export function projectKindFilterCategory(project: Project): ProjectKindFilterCategory {
  if (isDesignSystemProject(project) || project.metadata?.kind === 'brand') return 'design-system';
  switch (project.metadata?.intent) {
    case 'document':
      return 'document';
    case 'hyperframes':
      return 'hyperframes';
    case 'web-clone':
      return 'web-clone';
    case 'webgl-experience':
      return 'webgl';
    case 'live-artifact':
      return 'live-artifact';
    default:
      break;
  }
  if (project.skillId === 'live-artifact') return 'live-artifact';
  switch (project.metadata?.kind) {
    case 'deck':
      return 'slide';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return 'prototype';
  }
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

/** The glyph each kind chip leads with — the same icon that kind wears in the
 *  Home type rail, so a card and the rail name the same thing the same way. */
const PROJECT_TAG_ICON: Record<ProjectCardCategory, IconName> = {
  prototype: 'artboard',
  'live-artifact': 'bar-chart-box',
  'web-clone': 'globe',
  slide: 'present',
  media: 'image',
  brand: 'swatchbook',
  'design-system': 'sliders',
};

function projectTagLabel(category: ProjectCategory, t: ReturnType<typeof useT>): string {
  return category === 'live-artifact'
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
}

export function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label = projectTagLabel(category, t);
  return (
    <span className={`design-card-tag tag-${category}`}>
      <Icon name={PROJECT_TAG_ICON[category]} size={12} className="design-card-tag__icon" />
      {label}
    </span>
  );
}

function DesignSystemProjectTag() {
  return (
    <span className="design-card-tag tag-design-system">
      <Icon name={PROJECT_TAG_ICON['design-system']} size={12} className="design-card-tag__icon" />
      {DESIGN_SYSTEM_TAG_LABEL}
    </span>
  );
}
