// Team-edition entry navigation rail (Lovart/Manus-style labeled column).
//
// Structure — faithfully ported from the design demo
// (origin/demo/workspace-team-features) but wired to the REAL workspace context
// (`GET /api/workspace/context`, shared via `useWorkspaceContext`), never the
// demo's hardcoded 琼羽 / Refly / 800 placeholders:
//
//   • Account section (top) — real `context.displayName` + an account menu
//     (settings / GitHub help / feature request / socials / sign out — theme and
//     language live in 设置·通用 only, matching #5517).
//     No header block when there is no cloud identity (context === null) —
//     the rail starts at the search box; expand/collapse lives in the
//     workspace tabs bar's pinned Home toggle.
//   • Billing chip — real plan tier + explicitly scoped USD balance when Vela
//     billing is available, with upgrade linking out to Vela Web.
//   • No search box: the ⌘K search button and the rail toggle live in the
//     chrome row (WorkspaceTabsBar) and reach EntryShell through
//     entryRailBridge events. `onOpenSearch` stays on the props as the
//     shell-owned opener for callers that still hand it down.
//   • 最近 (Recents) → home, Community → community.
//   • Team block (only when `context.workspaceType === 'team'`): an inline team
//     switcher + the team destinations. In-client views: drafts / all projects /
//     design systems / 扩展 (plugins). Member management lives in B's vela/web
//     console, so 成员 / 数据大盘 / Workspace 设置 link OUT to it (target=_blank),
//     derived from `context.workspaceSettingsUrl`.
//
// The gate is `workspaceType` + permissions, never the billing/provider axis — a
// personal_byok workspace still has full team features.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { coalescedGet, evictCoalescedGet } from '../lib/coalesced-get';
import {
  workspaceSeatCapacityState,
  type WorkspaceActiveResponse,
  type WorkspaceBillingSummary,
  type WorkspaceCollabContext,
  type WorkspaceDirectoryItem,
  type WorkspaceDirectoryResponse,
  type WorkspaceProjectSummary,
  workspaceContextHasTeamIdentity,
} from '@open-design/contracts';
import {
  fetchVelaLoginStatus,
  formatVelaBalanceAmount,
  formatVelaBalanceUsd,
  velaLogout,
} from '../providers/daemon';
import { resetCloudSignInTipDismissal } from './CloudSignInTip';
import { SignOutConfirmDialog } from './SignOutConfirmDialog';
import { notifyAmrLoginStatusChanged } from './amrLoginPolling';
import { Icon } from './Icon';
import { GITHUB_STARS_FALLBACK_LABEL, formatStars, useGithubStars } from './useGithubStars';
import { PlanWordmark, planBadgeTierForWorkspace } from './PlanWordmark';
import { RemixIcon } from './RemixIcon';
import { InviteDialog } from './InviteDialog';
import {
  closeRailRecentRowMenu,
  openRailRecentRowMenu,
  RailRecentRow,
} from './entry-nav-rail/RailRecentRow';
import { MoveToTeamConfirmDialog, moveConfirmSkipped } from './MoveToTeamConfirmDialog';
import { ProjectDeleteConfirmDialog } from './project-actions/ProjectDeleteConfirmDialog';
import { projectOwnedBySelf } from './project-actions/ownership';
import { useProjectDeleteFlow } from './project-actions/useProjectDeleteFlow';
import { useProjectDuplicateFlow } from './project-actions/useProjectDuplicateFlow';
import { useWorkspaceProjectMove } from './project-actions/useWorkspaceProjectMove';
import type { SharedProjectPredicate } from '../collab/all-projects-list';
import { acknowledgeProjectCompletion, useProjectRunStatuses } from '../hooks/useProjectRunStatuses';
import { MessageCenter } from './MessageCenter';
import type { EntrySettingsSection } from './EntrySettingsMenu';
import type { Project } from '../types';
import { isRtlLocale, useI18n } from '../i18n';
import { useDismissOnOutsideInteraction } from '../hooks/useDismissOnOutsideInteraction';
import {
  beginWorkspaceScopedRead,
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
  useWorkspaceBillingResponse,
  useWorkspaceContext,
  workspaceBillingBalanceUsd,
  workspaceBillingSummaryForContext,
  workspaceIdentityCacheKey,
} from '../collab/useWorkspaceContext';
import { canUpgradeFromPlanTier, resolvePlanLabelTier } from '../collab/team-plan';
import { shouldShowCreditsBalance } from './entry-rail-account-state';
import { amrConsoleUrlForWorkspace, amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { useWorkspaceInvalidation } from '../collab/workspace-events';
import { resolveDeepSeekV4FlashCampaignAudience } from '../campaigns/deepseek-v4-flash';
import { useDeepSeekV4FlashCampaignVisibility } from '../campaigns/use-deepseek-v4-flash-campaign';
import type { EntryHomeView } from '../router';
import type {
  AccountMenuClickProps,
  TrackingProjectCollectionPage,
  TrackingWorkspacePage,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackAccountMenuClick,
  trackEntryNavigationClick,
  trackWorkspaceSurfaceView,
  trackWorkspaceSwitcherClick,
  trackWorkspaceSwitchResult,
} from '../analytics/events';
import {
  entryViewToTracking,
  stableAnalyticsErrorCode,
  workspaceAnalyticsDimensions,
} from '../analytics/workspace';
import { WorkbenchCampaignBadge } from './WorkbenchCampaignBadge';
import { workspaceChromeAccountActionsHost } from './workspaceChromeActions';

/** Gap the account menu keeps from the rail card's top edge — the same inset
 *  its left/right edges already hold (10px card padding + the card's 1px
 *  stroke). */
const ACCOUNT_MENU_CARD_INSET = 11;
/** Never squeeze the menu below this; a shorter rail scrolls the page chrome
 *  instead of collapsing the menu into a sliver. */
const ACCOUNT_MENU_MIN_HEIGHT = 200;

const REPO_URL = 'https://github.com/nexu-io/open-design';
const GITHUB_HELP_URL = `${REPO_URL}/issues/new`;
const GITHUB_FEATURE_URL = `${REPO_URL}/pulls`;
const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
const X_URL = 'https://x.com/OpenDesignHQ';
const CONTACT_EMAIL_URL = 'mailto:support@open-design.ai';
const externalLinkProps = { target: '_blank', rel: 'noreferrer noopener' } as const;

// Last directory this shell successfully read. `coalescedGet` only collapses
// CONCURRENT reads, so without this every open of the switcher started from an
// empty list and showed a loading row before the same names reappeared. Kept at
// module scope so it survives the rail unmounting (returning from a project).
//
// Read it through `attributableWorkspaceDirectory` — never directly. The cache is
// deliberately long-lived, which is also what made it outlive the ACCOUNT it was
// filled under.
let cachedWorkspaceDirectory: WorkspaceDirectoryItem[] | null = null;

/** Test seam: clear the module-level directory cache between tests. */
export function resetWorkspaceDirectoryCache(): void {
  cachedWorkspaceDirectory = null;
}

/**
 * Whether a directory list may be shown to `context`.
 *
 * `GET /api/workspace/directory` answers "which workspaces can the SIGNED-IN
 * ACCOUNT see", so it is exactly the read `workspaceIdentityCacheKey` warns
 * about: a cache kept across an identity change answers the next identity with
 * the previous one's data. Nothing invalidated this one — the only caller of
 * `resetWorkspaceDirectoryCache` has ever been tests — so signing in as a
 * different account kept the previous account's workspace names on screen, and
 * kept them CONFIDENTLY, because a non-empty cache also suppresses the loading
 * row.
 *
 * The context carries no account id to key on. What every directory item DOES
 * carry is the `workspaceMemberId` of the membership that produced it, and a
 * membership id names exactly one (account, workspace) pair. So a list is
 * attributable to `context` precisely when it contains the caller's OWN
 * membership:
 *
 *   • A different account — even one sharing the same team workspace — holds a
 *     different member id for it, so this returns false. The switcher then falls
 *     back to the single entry it can still attribute — the active workspace,
 *     named from the caller's OWN context — until its own read lands. (Not the
 *     `role="status"` loading row: that only renders when there is no entry at
 *     all, which cannot happen while a context exists.)
 *   • The same account moving between its own workspaces still returns true:
 *     the membership it switched into was already in the list. That is the
 *     flash-free reopen the cache exists for, and it survives this fix.
 *
 * A false positive would require the list to already contain this caller's own
 * membership — that is, to have been read by this very account.
 */
function workspaceDirectoryBelongsTo(
  items: ReadonlyArray<{
    workspaceId: string;
    workspaceMemberId?: string | null;
  }> | null,
  context: WorkspaceCollabContext | null,
): boolean {
  if (!items || items.length === 0 || !context) return false;
  const memberId = context.workspaceMemberId?.trim();
  if (!memberId) return false;
  return items.some(
    (item) =>
      item.workspaceId === context.workspaceId && item.workspaceMemberId?.trim() === memberId,
  );
}

/**
 * Return only directory state attributable to the identity being rendered.
 *
 * This check must happen during render. Clearing stale component state from an
 * identity-change effect is one commit too late: when two accounts share a
 * workspace id, the incoming account otherwise paints the outgoing account's
 * cached workspace name for one frame before the effect runs.
 */
export function workspaceDirectoryForIdentity<
  T extends {
    workspaceId: string;
    workspaceMemberId?: string | null;
  },
>(
  items: readonly T[],
  context: WorkspaceCollabContext | null,
): readonly T[] {
  return workspaceDirectoryBelongsTo(items, context) ? items : [];
}

/** The cached switcher list, or null when it cannot be attributed to `context`. */
function attributableWorkspaceDirectory(
  context: WorkspaceCollabContext | null,
): WorkspaceDirectoryItem[] | null {
  return workspaceDirectoryBelongsTo(cachedWorkspaceDirectory, context)
    ? cachedWorkspaceDirectory
    : null;
}

// The rail's destination ids are the entry-shell home views (kept in sync with
// the router so `navigate({ kind: 'home', view })` type-checks for every item).
export type EntryView = EntryHomeView;

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  onNewProject: () => void;
  /** Opens the project search palette (blurred modal over all projects). */
  onOpenSearch?: () => void;
  newProjectDisabled?: boolean;
  /** When false the rail is collapsed (hidden off-canvas) on the entry view. */
  open: boolean;
  /** Extra content for the top-right chrome cluster, rendered LEFT of the
   *  account module (e.g. the DeepSeek campaign badge). */
  topRightSlot?: ReactNode;
  /** The one shared workspace context; null → local (no cloud identity) state. */
  context: WorkspaceCollabContext | null;
  /** Account billing metadata (via the vela CLI 收口). Null → the billing
   *  chip falls back to the context plan-tier hint. */
  billing?: WorkspaceBillingSummary | null;
  /** Explicitly scoped balance in USD for `context`. Team callers must pass
   *  only a backend-proven v2 workspace wallet, never account credits. */
  balanceUsd?: string | null;
  /** Open the app settings dialog (optionally on a specific section). */
  onOpenSettings?: (section?: EntrySettingsSection) => void;
  /** Open the members / invite slot (B's InviteDialog). */
  onInvite?: () => void;
  /** Start the cloud sign-in / team flow from the local-state callout. */
  onSignInCloud?: () => void;
  /** Clear app-owned model-source state after the daemon confirms sign-out. */
  onSignedOut?: () => void | Promise<void>;
  /**
   * The update-ready host (`UpdaterPopup`), which renders nothing until the
   * updater reports a downloaded, unopened installer.
   *
   * It is an independent control in the top-right chrome cluster
   * (`.entry-nav-rail__account-updater`), immediately after the account capsule
   * when one is present.
   */
  updaterSlot?: ReactNode;
  /** Optional notice shown above the footer controls. */
  footerNotice?: ReactNode;
  /** Projects for the rail's 最近浏览过 section (per product: 在插件下边新增一个
   *  类型). The SAME catalog and the SAME order 全部项目's 最近浏览过 tab shows —
   *  EntryShell hands over the one it already feeds that grid, so the two can
   *  never drift; this list only takes the head of it. Empty (or absent) hides
   *  the section entirely. */
  recentProjects?: Project[];
  /** Row actions for the 最近项目 list's ⋮ menu (重命名 / 复制 / 转入团队空间 /
   *  删除 — OPEND-2686, OPEND-2794). Omit one to drop its item. They are the
   *  SAME handlers the project cards drive their menu with, so an action from
   *  the rail lands in exactly one place. */
  onRenameRecentProject?: (id: string, name: string) => void;
  onDeleteRecentProject?: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicateRecentProject?: (id: string) => Promise<void> | void;
  /** The one shared-state answer for a row (see `createSharedProjectPredicate`)
   *  and the hub's projectId → sharing member map; together they decide which
   *  rows the member may mutate and which are already in the team space. */
  isSharedRecentProject?: SharedProjectPredicate;
  recentProjectOwnerMemberIds?: ReadonlyMap<string, string>;
  /** Optimistic shared-state markers for a 转入团队空间 from the rail — the
   *  same callbacks EntryShell hands the project cards. */
  onRecentProjectShared?: (project: WorkspaceProjectSummary) => void;
  onRecentProjectShareFailed?: (projectId: string) => void;
  /** Opens one of those projects — the pull-first opener, so a shared project
   *  that is not local yet still lands. */
  onOpenRecentProject?: (id: string) => void | Promise<unknown>;
  /** One-off targeted announcement coordination owned by the Home shell. */
  priorityAnnouncementActive?: boolean;
  onPriorityAnnouncementPendingChange?: (pending: boolean) => void;
  priorityAnnouncementCurrentPlanId?: string | null;
  priorityAnnouncementMetricsConsent?: boolean;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Rail items that own a popup surface expose the button so the surface can
   *  return focus here on close, and advertise the popup's kind + open state. */
  buttonRef?: Ref<HTMLButtonElement>;
  ariaHasPopup?: 'dialog' | 'menu';
  ariaExpanded?: boolean;
  children: ReactNode;
}

// No `data-tooltip` here: every nav item renders its label inline, so the
// rail's hover bubble (entry-layout.css) would only duplicate visible text.
// That bubble stays reserved for the rail's icon-only controls (updater,
// avatar, icon-only sign-out).
function NavButton({
  active,
  ariaLabel,
  label,
  onClick,
  disabled,
  testId,
  buttonRef,
  ariaHasPopup,
  ariaExpanded,
  children,
}: NavButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaHasPopup ? Boolean(ariaExpanded) : undefined}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="entry-nav-rail__btn-icon" aria-hidden>{children}</span>
      <span className="entry-nav-rail__btn-label">{label}</span>
    </button>
  );
}

/** Remembers the section's open/closed state across launches, next to the
 *  rail's own `od.entry.railOpen`. A disclosure the user closed should stay
 *  closed — re-opening it on every boot is the whole reason to have the
 *  control. */
const RECENT_SECTION_STORAGE_KEY = 'od.entry.railRecentOpen';

/**
 * How many rows the 最近项目 list shows before it scrolls — 11 × 38px rows on a
 * desktop window (see `.entry-nav-rail__recent-list`). The head of the list
 * whose status is asked for before the scroll observer has reported.
 */
const RECENT_STATUS_HEAD_ROWS = 11;

function readStoredRecentOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // Default OPEN: the section is new and a collapsed-by-default disclosure
    // reads as a missing feature.
    return window.localStorage.getItem(RECENT_SECTION_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * 最近浏览过 — a collapsible list of the projects the 全部项目 view's own
 * 最近浏览过 tab would show, sitting under 插件 in the rail (per product).
 *
 * It takes the catalog EntryShell already feeds that grid and shows the head of
 * it in the same order (most recently touched first), so the rail and the grid
 * can never disagree about what "recent" means. Rows open the project through
 * the same pull-first opener the grid uses.
 */
function RailRecentSection({
  projects,
  onOpen,
  onRename,
  onDelete,
  onDuplicate,
  isShared,
  ownerMemberIds,
  onProjectShared,
  onProjectShareFailed,
  workspaceContext,
  analyticsPage,
  label,
}: {
  projects: Project[];
  onOpen?: (id: string) => void | Promise<unknown>;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicate?: (id: string) => Promise<void> | void;
  isShared?: SharedProjectPredicate;
  ownerMemberIds?: ReadonlyMap<string, string>;
  onProjectShared?: (project: WorkspaceProjectSummary) => void;
  onProjectShareFailed?: (projectId: string) => void;
  workspaceContext?: WorkspaceCollabContext | null;
  analyticsPage: TrackingWorkspacePage;
  label: string;
}) {
  const [open, setOpen] = useState(readStoredRecentOpen);
  // The row actions report under the project-collection page the rail is
  // standing on; every other entry view files under Home, where the rail's
  // list is the recent-projects surface.
  const collectionPage: TrackingProjectCollectionPage =
    analyticsPage === 'drafts' || analyticsPage === 'all_projects' ? analyticsPage : 'home';
  // The same gates the project cards apply (RecentProjectsStrip): a move needs
  // a team plane to move into AND the right to share, and only the member's
  // own projects can be changed at all.
  const moveToTeamAvailable =
    workspaceContextHasTeamIdentity(workspaceContext)
    && workspaceContext?.permissions.canShareProjects === true;
  const isSharedProject: SharedProjectPredicate = isShared ?? (() => false);
  const ownedBySelf = (projectId: string) => projectOwnedBySelf({
    projectId,
    ownerMemberIds,
    selfMemberId: workspaceContext?.workspaceMemberId,
    isShared: isSharedProject,
  });
  // 删除 confirms through the shared project delete dialog (OPEND-2797) — one
  // component for the rail and the project cards.
  const deleteFlow = useProjectDeleteFlow({
    onDelete,
    analyticsPage: collectionPage,
    workspaceContext,
  });
  const duplicateFlow = useProjectDuplicateFlow({
    onDuplicate,
    analyticsPage: collectionPage,
    workspaceContext,
  });
  // 转入团队空间 runs the flow the project cards run, confirmation dialog
  // included. Its progress and failure show in the row's ⋮ menu — the card
  // menu is where the cards report theirs — so the section re-opens that menu
  // once the request is on its way and closes it again on success.
  const moveFlow = useWorkspaceProjectMove({
    workspaceContext,
    analyticsPage: collectionPage,
    onProjectShared,
    onProjectShareFailed,
    onMoveStart: (project) => openRailRecentRowMenu(project.id),
    onMoveSettled: (project, _action, ok) => {
      if (ok) closeRailRecentRowMenu(project.id);
    },
  });
  const [moveTarget, setMoveTarget] = useState<Project | null>(null);
  function requestMoveToTeam(project: Project) {
    if (moveConfirmSkipped()) {
      void moveFlow.shareToTeam(project);
      return;
    }
    setMoveTarget(project);
  }
  // Every recent project, newest first (OPEND-2757: the old 8-row cap hid the
  // rest from the rail entirely). The LIST scrolls past ~11 rows, not the rail
  // — see `.entry-nav-rail__recent-list` in entry-layout.css.
  const items = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );
  // Run status for the rows' leading glyph. `Project.status` cannot serve it —
  // it only arrives on the UNSCOPED project list, so it is absent for every
  // workspace-bound project (see the hook's own note) — and this is the same
  // feed, with the same display mapping (✓-spending included), that the
  // workspace tab dropdown reads, which is what keeps the two glyph columns
  // telling one story about a project (OPEND-2795).
  const recentListRef = useRef<HTMLUListElement>(null);
  // Keep the full catalog navigable, but poll only rows intersecting its
  // scrollport. The list's existing height cap bounds the status request set.
  // `null` until the observer has reported once; never reset on a catalog
  // hand-over, so a re-render cannot blank the rows' glyphs.
  const [visibleProjectIds, setVisibleProjectIds] = useState<string[] | null>(null);
  useEffect(() => {
    const list = recentListRef.current;
    if (!open || !list || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.projectId;
        if (!id) continue;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      const next = [...visible].sort();
      setVisibleProjectIds((prev) =>
        prev && prev.length === next.length && prev.every((id, index) => id === next[index])
          ? prev
          : next);
    }, { root: list });
    for (const row of list.children) observer.observe(row);
    return () => observer.disconnect();
  }, [items, open]);
  // Until the observer has spoken, ask for the head of the list — the rows the
  // cap shows on a desktop window — in the same commit that paints them
  // (OPEND-2762). The observer's first report lands a frame later, and waiting
  // for it is what left the rows a round trip ahead of their glyphs.
  const runStatusProjectIds = useMemo(
    () => visibleProjectIds
      ?? items.slice(0, RECENT_STATUS_HEAD_ROWS).map((project) => project.id),
    [visibleProjectIds, items],
  );
  const runStatusByProjectId = useProjectRunStatuses(runStatusProjectIds, {
    enabled: open,
    workspaceContext,
  });

  // Opening a project is what spends its ✓ (per product): the finished run on
  // screen is recorded as seen — in the shared feed, so the tab switcher drops
  // the mark in the same moment.
  const openProject = useCallback(
    (id: string) => {
      acknowledgeProjectCompletion(id);
      return onOpen?.(id);
    },
    [onOpen],
  );

  function toggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      try {
        window.localStorage.setItem(RECENT_SECTION_STORAGE_KEY, String(next));
      } catch {
        // Private mode / storage disabled: the section still toggles, it just
        // forgets. Never let a storage failure swallow the interaction.
      }
      return next;
    });
  }

  // Nothing to list is not an empty state worth a row: a workspace with no
  // projects yet should see the rail it had before this section existed.
  if (items.length === 0) return null;

  return (
    <div className="entry-nav-rail__recent">
      <button
        type="button"
        className="entry-nav-rail__recent-head"
        onClick={toggle}
        aria-expanded={open}
        data-testid="entry-nav-recent-toggle"
      >
        {/* Title first, chevron trailing (per product: 展开和收起的按钮在最右侧).
            DOM order follows the visual one rather than an `order` swap, so the
            reading order matches too. */}
        <span className="entry-nav-rail__recent-title">{label}</span>
        <span className="entry-nav-rail__recent-chevron" aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        </span>
      </button>
      {/* The canonical disclosure pair (index.css / composio.css): the outer
          grid animates 0fr → 1fr, the inner box carries the clip. `hidden` on
          the wrapper would skip the transition entirely. */}
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <ul ref={recentListRef} className="entry-nav-rail__recent-list">
            {items.map((project) => {
              return (
                <li key={project.id} data-project-id={project.id}>
                  <RailRecentRow
                    project={project}
                    workspaceContext={workspaceContext}
                    runStatus={runStatusByProjectId.get(project.id)}
                    ownedBySelf={ownedBySelf(project.id)}
                    shared={isSharedProject(project.id)}
                    moveToTeamAvailable={moveToTeamAvailable}
                    sharing={moveFlow.sharingId === project.id}
                    shareError={moveFlow.error?.projectId === project.id ? moveFlow.error.kind : null}
                    onOpen={openProject}
                    onRename={onRename}
                    onDuplicate={onDuplicate ? (target) => { void duplicateFlow.duplicate(target); } : undefined}
                    onMoveToTeam={requestMoveToTeam}
                    onDelete={onDelete ? deleteFlow.request : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
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
        <MoveToTeamConfirmDialog
          action="to-team"
          onCancel={() => setMoveTarget(null)}
          onConfirm={() => {
            const project = moveTarget;
            setMoveTarget(null);
            void moveFlow.shareToTeam(project);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The spark mark the free plan's upgrade pill leads with (supplied artwork).
 *
 * Inlined rather than added to the shared icon set: it is the only place this
 * glyph appears, and it is a two-part mark (a large four-point star with a
 * small one trailing it) that the set's single-path convention would flatten.
 * `fill="currentColor"` is what lets the pill's `--upgrade-ink` reach it.
 */
function UpgradeSparkMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M10.6144 17.7956 11.492 15.7854C12.2731 13.9966 13.6789 12.5726 15.4325 11.7942L17.8482 10.7219C18.6162 10.381 18.6162 9.26368 17.8482 8.92277L15.5079 7.88394C13.7092 7.08552 12.2782 5.60881 11.5105 3.75894L10.6215 1.61673C10.2916.821765 9.19319.821767 8.8633 1.61673L7.97427 3.75892C7.20657 5.60881 5.77553 7.08552 3.97685 7.88394L1.63658 8.92277C.868537 9.26368.868536 10.381 1.63658 10.7219L4.0523 11.7942C5.80589 12.5726 7.21171 13.9966 7.99275 15.7854L8.8704 17.7956C9.20776 18.5682 10.277 18.5682 10.6144 17.7956ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899Z" />
    </svg>
  );
}

/**
 * Whether the entry layout has auto-collapsed the rail for a narrow window
 * (`@media (max-width: 1080px)` in entry-layout.css zeroes the rail track while
 * keeping `entry--rail-open`). The account module lives in that rail, so
 * anything that must stay reachable in a compact window — the update-ready
 * rocket — has to know when the rail is off screen. jsdom has no matchMedia;
 * treat that as a wide window.
 */
const RAIL_AUTO_COLLAPSE_QUERY = '(max-width: 1080px)';
function useRailAutoCollapsed(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const media = window.matchMedia(RAIL_AUTO_COLLAPSE_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(RAIL_AUTO_COLLAPSE_QUERY).matches
      : false;
  return useSyncExternalStore(subscribe, read, () => false);
}

function handleWorkspaceMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  );
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex: number;
  if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = items.length - 1;
  } else if (event.key === 'ArrowUp') {
    nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  } else {
    nextIndex = currentIndex < 0 || currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
  }

  event.preventDefault();
  items[nextIndex]?.focus();
}

// Team management (members, dashboard, settings) lives in B's vela/web console,
// not the local client. We link out to it, deriving the section path from the one
// workspace-settings URL the context carries. Best-effort: swap/append the section
// segment, falling back to the raw settings URL when the path can't be rewritten.
export function teamConsoleUrl(
  base: string,
  section:
    | 'members'
    | 'dashboard'
    | 'settings'
    | 'billing'
    | 'create-team'
    | 'invite',
): string {
  // B's console routes: members live at /team, everything account/billing
  // shaped reports on the dashboard. The settings URL the context carries
  // includes the ?workspaceId deep-link param; URL parsing preserves it, so
  // the target page opens on the SAME workspace this client is pinned to (B
  // asks the user to confirm if their account-level selection differs).
  //
  // `billing` (the 「额度」 row) is a plain dashboard visit. It used to open a
  // wallet page; that route still answers on B's side but is no longer part of
  // the product's information architecture — balance, manual top-up and the
  // auto-recharge policy were rehomed onto the dashboard (vela #1055).
  //
  // Plan comparison is deliberately absent here: every generic upgrade entry
  // uses `workspaceUpgradeUrl` and public Pricing instead of a Cloud modal.
  const path =
    section === 'members' ? 'team'
    : section === 'billing' ? 'dashboard'
    : section === 'create-team' || section === 'invite' ? 'dashboard'
    : section;
  try {
    const url = new URL(base);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0 && segments[segments.length - 1] === 'settings') {
      segments[segments.length - 1] = path;
    } else {
      segments.push(path);
    }
    url.pathname = `/${segments.join('/')}`;
    // Vela owns the final invite action because only its dashboard has the
    // authoritative subscription + seat state needed to choose between
    // upgrading to Team, buying seats, and sending an invite. `invite=auto`
    // is consumed one-shot by that dashboard and then removed from the URL.
    if (section === 'invite') url.searchParams.set('invite', 'auto');
    // recvq725Kx0rM4 / recvqfXzHtY5wg: `create-team` opens B's create-workspace
    // dialog via `?workspace=create`. A prior fix (675878434) removed this,
    // reasoning that B's route source had no handler for it — true of the repo
    // checkout that fix read at the time, but B's `sidebar-actions.tsx` (PR
    // #905, commit 501c0069, authored 2026-07-21) added exactly this handler,
    // and it is live on `origin/feat/workspace-team` (the branch the
    // feature-test deployment serves) as of this fix. Re-verified directly
    // against that branch's current source before restoring the param.
    if (section === 'create-team') url.searchParams.set('workspace', 'create');
    return url.toString();
  } catch {
    return base;
  }
}

/**
 * Shared destination for every generic 「升级」/「升级套餐」 affordance. Pricing
 * owns comparison; selecting a concrete card there is what hands checkout to
 * Cloud. A resolved workspace without billing permission still returns null.
 */
export function workspaceUpgradeUrl(
  context: WorkspaceCollabContext | null | undefined,
  billing: WorkspaceBillingSummary | null | undefined,
  options: { fallbackProfile: string | null | undefined },
): string | null;
export function workspaceUpgradeUrl(
  context: WorkspaceCollabContext | null | undefined,
  billing: WorkspaceBillingSummary | null | undefined,
): string | null;
export function workspaceUpgradeUrl(
  context: WorkspaceCollabContext | null | undefined,
  _billing: WorkspaceBillingSummary | null | undefined,
  options?: { fallbackProfile: string | null | undefined },
): string | null {
  // Billing is owner-only. Missing context can use the caller's fallback
  // profile because there is no workspace identity to authorize yet.
  if (context && context.permissions?.canManageBilling !== true) return null;
  if (!context && !options) return null;
  return amrPlansUrlForProfile(options?.fallbackProfile);
}

export type WorkspaceInviteTarget =
  | { kind: 'local' }
  | { kind: 'vela'; url: string }
  | { kind: 'unavailable' };

/**
 * Whether this member should discover the invite flow.
 *
 * Direct invites and billing recovery are separate capabilities. A Personal
 * Free owner (or a full Team owner) can still enter Vela's upgrade/seat flow
 * without direct invite capability, but an admin never acquires billing power
 * from role alone. Unknown capacity remains usable for a member with explicit
 * invite permission; the invite API is still the authority if the plan is full.
 */
export function canAccessWorkspaceInviteFlow(
  context: WorkspaceCollabContext | null | undefined,
): boolean {
  if (
    !context ||
    context.memberStatus !== 'active' ||
    context.lifecycleState !== 'active' ||
    (context.role !== 'owner' && context.role !== 'admin')
  ) {
    return false;
  }

  const canInviteMembers = context.permissions?.canInviteMembers === true;
  const canManageBilling = context.permissions?.canManageBilling === true;
  const needsTeamUpgrade =
    context.billingState === 'free' || context.billingState === 'inactive';
  if (needsTeamUpgrade) {
    return context.role === 'owner' && canManageBilling;
  }
  if (context.workspaceType === 'personal') return canInviteMembers;

  const isSeatFull = workspaceSeatFull(context);
  if (isSeatFull === undefined) return canInviteMembers;
  if (!isSeatFull) return canInviteMembers;
  return context.role === 'owner' && canManageBilling;
}

export function workspaceInviteAvailableSeats(
  context: WorkspaceCollabContext | null | undefined,
): number | undefined {
  if (workspaceSeatCapacityState(context?.seatSummary) === 'unknown') return undefined;
  return context?.seatSummary?.availableSeats;
}

function workspaceSeatFull(
  context: WorkspaceCollabContext,
): boolean | undefined {
  const state = workspaceSeatCapacityState(context.seatSummary);
  return state === 'unknown' ? undefined : state === 'full';
}

/**
 * Chooses the first safe invite surface. The local form requires direct invite
 * capability and no proof that the team is already full; unknown capacity is
 * resolved by the invite API when the form is submitted.
 * Personal, Free-plan, and proven full-seat owner states go to Vela, whose
 * dashboard owns the authoritative upgrade/seat/invite decision. Unknown seat
 * data stays on the local permission-gated flow and lets the invite API return
 * an authoritative capacity result.
 */
export function resolveWorkspaceInviteTarget(
  context: WorkspaceCollabContext | null | undefined,
): WorkspaceInviteTarget {
  if (!context || !canAccessWorkspaceInviteFlow(context)) {
    return { kind: 'unavailable' };
  }
  const needsTeamUpgrade =
    context.billingState === 'free' || context.billingState === 'inactive';
  if (
    context.workspaceType === 'team' &&
    !needsTeamUpgrade &&
    workspaceSeatFull(context) !== true &&
    context.permissions.canInviteMembers === true
  ) {
    return { kind: 'local' };
  }
  const settingsUrl = context?.workspaceSettingsUrl?.trim() || null;
  if (!settingsUrl) return { kind: 'unavailable' };
  return { kind: 'vela', url: teamConsoleUrl(settingsUrl, 'invite') };
}

/**
 * Map a raw vela plan id to a display label for the credits card.
 *
 * B's ids are namespaced by workspace kind and tier (`team_plus`, `team_max`,
 * `pro`, …). The card pairs this label with a PlanWordmark badge that already
 * carries the tier, so the label names the PLAN FAMILY (团队版 / 免费版 / …)
 * and never leaks a raw snake_case id — `team_plus` used to render verbatim
 * because only three exact ids were mapped.
 *
 * NOTE (parked 2026-07-20): membership is per workspace, so one account can
 * hold a personal 创作会员 tier AND a team tier at once. How the card should
 * present that (one family label, both badges, which one wins in a team) is
 * with the designer; see the ledger. Until then this keeps the pre-existing
 * single-label behavior.
 */
function formatBillingTier(tier: string, t: ReturnType<typeof useI18n>['t']): string {
  const normalized = tier.trim().toLowerCase();
  if (!normalized) return t('entry.billingTierFree');
  if (normalized === 'team' || normalized.startsWith('team_') || normalized.startsWith('team-')) {
    return t('entry.billingTierTeam');
  }
  if (normalized === 'free') return t('entry.billingTierFree');
  if (normalized === 'pro' || normalized === 'plus' || normalized === 'max') {
    return t('entry.billingTierPro');
  }
  // Unknown id: title-case the segments rather than showing `some_new_tier`.
  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

interface EntryTopRightClusterProps {
  /** Analytics page the cluster reports from: the entry views map through
   *  `entryViewToTracking`, the workspace mount reports 'project'. */
  page: TrackingWorkspacePage;
  context: WorkspaceCollabContext | null;
  billing?: WorkspaceBillingSummary | null;
  balanceUsd?: string | null;
  /** Extra content rendered LEFT of the credits pill (e.g. the DeepSeek
   *  campaign badge on Home). */
  leadingSlot?: ReactNode;
  /** Update-ready host; rides the account row right after the avatar chip. */
  updaterSlot?: ReactNode;
  /**
   * Where the account module (avatar + hover menu, message-centre bell,
   * updater rocket) renders. The rail passes a node at the foot of its nav
   * column so the identity sits under the nav items rather than in the
   * top-right corner (per product). Omit it and the account module is
   * dropped — the project route has no rail and gives the menu no second
   * home. The credits pill stays in the chrome either way.
   */
  accountHost?: HTMLElement | null;
  onOpenSettings?: (section?: EntrySettingsSection) => void;
  onSignedOut?: () => void | Promise<void>;
  priorityAnnouncementActive?: boolean;
  onPriorityAnnouncementPendingChange?: (pending: boolean) => void;
  priorityAnnouncementCurrentPlanId?: string | null;
  priorityAnnouncementMetricsConsent?: boolean;
}

/**
 * Top-right chrome cluster: an optional leading slot, the GitHub chip and the
 * standalone credits / 升级 pill — one flex row riding the workbench top-right
 * corner.
 *
 * It still OWNS the account module (menu state, hover timers, message centre,
 * sign-out) but renders it into `accountHost` — the foot of the rail's nav
 * column — instead of the corner (per product: 账户移到左栏底部). Extracted
 * from `EntryNavRail` so the WORKSPACE view (an open project tab) can mount
 * the same credits pill in the same position even though the entry shell —
 * and its rail — is unmounted there. Exactly one instance is on screen at a
 * time: `EntryNavRail` renders it on the entry views, `App.tsx` (via
 * `WorkspaceTopRightAccountCluster`) on the project route — those routes are
 * mutually exclusive.
 */
export function EntryTopRightCluster({
  page,
  context,
  billing,
  balanceUsd,
  leadingSlot,
  updaterSlot,
  accountHost,
  onOpenSettings,
  onSignedOut,
  priorityAnnouncementActive,
  onPriorityAnnouncementPendingChange,
  priorityAnnouncementCurrentPlanId,
  priorityAnnouncementMetricsConsent,
}: EntryTopRightClusterProps) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const workspaceDimensions = workspaceAnalyticsDimensions(context);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(
    workspaceChromeAccountActionsHost,
  );

  // On the initial App render the tabs chrome and this cluster are committed
  // in the same pass, so the host does not exist while this component renders.
  // A layout effect finds it after the DOM commit and moves the controls before
  // paint. Electron can then build its first draggable-region hit map with the
  // no-drag controls as real descendants of the drag header.
  useLayoutEffect(() => {
    // Isolated component harnesses do not mount the application chrome. Keep
    // those public component tests usable without re-creating the whole App;
    // the real shell always supplies the dedicated host above.
    setChromeActionsHost(workspaceChromeAccountActionsHost() ?? document.body);
  }, []);

  const isTeam = Boolean(context) && context!.workspaceType === 'team';
  const permissions = context?.permissions;
  const workspaceSettingsUrl = context?.workspaceSettingsUrl?.trim() || null;

  // Account identity (real). No email field on the context → the head shows the
  // avatar + name only.
  const displayName = context?.displayName?.trim() || '';
  const accountName = displayName || t('app.brand');
  const accountInitial = accountName.charAt(0).toUpperCase() || '·';

  // Billing chip: prefer the real summary metadata; fall back to the context
  // plan-tier hint when metadata has not loaded. Money is a separate,
  // explicitly scoped `balanceUsd` input.
  // The plan id from either source goes through the same formatter — the
  // context hint is a raw id too (`team_plus`), and it used to reach the card
  // unformatted whenever billing reported an empty tier (which it does today).
  const rawTier = billing?.membershipTier?.trim() || context?.planId?.trim() || '';
  // The LABEL is a subscription question, never a workspace-kind one: B makes
  // every user-created workspace team-typed, so `isTeam` labelled brand-new
  // unpaid workspaces 团队版 (#146). `resolvePlanLabelTier` answers 'free' when
  // B positively reports an unsubscribed entitlement, and null when it simply
  // has not said — only the null case still falls back to the legacy hint, so
  // a paying member (whom B tells us nothing about) keeps their team label.
  const labelTier = resolvePlanLabelTier({ billing, context });
  const tierLabel = labelTier
    ? formatBillingTier(labelTier, t)
    : isTeam
      ? t('entry.billingTierTeam')
      : t('entry.billingTierFree');
  const balanceLabel = formatVelaBalanceUsd(balanceUsd);
  const balanceAmount = formatVelaBalanceAmount(balanceUsd);
  // A subscriber's $0.00 is a healthy state (their popular models are
  // unlimited), so the pill stays out of the way instead of alarming them.
  const showCreditsBalance = shouldShowCreditsBalance({
    tier: labelTier,
    balanceUsd,
  });
  // #5517: wordmark badge inside the menu's billing card. It names the plan
  // FAMILY, so a TEAM workspace draws the one `team` wordmark at every tier —
  // free through max — while the personal ladder keeps its per-tier glyph
  // (product ruling, see `planBadgeTierForWorkspace`). The workspace kind is
  // passed because it is the only thing that can name the FREE team tier: B
  // reports it with a null `planId` and an empty `membershipTier`, an id no
  // different from a personal free account.
  const planTier = planBadgeTierForWorkspace({
    tier: rawTier || tierLabel,
    workspaceType: context?.workspaceType,
  });

  const [accountMenuMode, setAccountMenuMode] = useState<'closed' | 'hover' | 'pinned'>(
    'closed',
  );
  const railAutoCollapsed = useRailAutoCollapsed();
  const updaterSlotHostRef = useRef<HTMLDivElement | null>(null);
  const [updaterControlVisible, setUpdaterControlVisible] = useState(false);
  // ReactNode truthiness cannot tell whether UpdaterPopup rendered its control;
  // observe the stable host so signed-out chrome follows actual rendered content.
  useLayoutEffect(() => {
    const host = updaterSlotHostRef.current;
    if (!host) {
      setUpdaterControlVisible(false);
      return;
    }
    const syncVisibility = () => setUpdaterControlVisible(host.hasChildNodes());
    syncVisibility();
    const observer = new MutationObserver(syncVisibility);
    observer.observe(host, { childList: true });
    return () => observer.disconnect();
  }, [chromeActionsHost, updaterSlot, accountHost, railAutoCollapsed]);
  const accountOpen = accountMenuMode !== 'closed';
  const closeAccountMenu = () => setAccountMenuMode('closed');
  useEffect(() => {
    if (!accountOpen) return;
    trackWorkspaceSurfaceView(analytics.track, {
      page_name: page,
      area: 'account_menu',
      ...workspaceDimensions,
    });
  }, [accountOpen, analytics.track, page, workspaceDimensions.workspace_key]);
  // The billing card hangs off the top-right 升级 / balance pill (per product:
  // 黑色卡片在右上角的升级下边显示), no longer inside the account menu.
  // Opens on hover or focus; clicking the pill still opens the upgrade flow
  // for a free member.
  const [creditsPanelOpen, setCreditsPanelOpen] = useState(false);
  const creditsPanelId = useId();
  const creditsAnchorRef = useRef<HTMLDivElement | null>(null);
  const creditsCloseTimer = useRef<number | null>(null);
  const openCreditsPanel = () => {
    if (creditsCloseTimer.current !== null) {
      window.clearTimeout(creditsCloseTimer.current);
      creditsCloseTimer.current = null;
    }
    setCreditsPanelOpen(true);
  };
  const scheduleCreditsPanelClose = () => {
    if (creditsCloseTimer.current !== null) window.clearTimeout(creditsCloseTimer.current);
    creditsCloseTimer.current = window.setTimeout(() => {
      creditsCloseTimer.current = null;
      // Pointer exit must not unmount actions a keyboard user is navigating.
      if (!creditsAnchorRef.current?.contains(document.activeElement)) {
        setCreditsPanelOpen(false);
      }
    }, 180);
  };
  useEffect(
    () => () => {
      if (creditsCloseTimer.current !== null) window.clearTimeout(creditsCloseTimer.current);
    },
    [],
  );
  // Message-center panel (opened from the bell beside the identity row) and
  // its unread count, which drives the red dot on that bell.
  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const messageCenterBellRef = useRef<HTMLButtonElement | null>(null);
  // Sign-out confirm gate (recvqgMWpJZqhL): the menu item only ARMS the
  // confirmation dialog; the real logout chain runs on explicit confirm.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const githubStars = useGithubStars();
  // Signed-in account email for the menu head (#5517 shows it under the
  // display name). The workspace context carries no email, so lazily read the
  // vela login-status projection the first time the menu opens — never on
  // mount, so shells without an open menu spend zero requests on it.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!accountOpen) return;
    // Refetch on EVERY open (the previous value stays visible while the read
    // is in flight, so there is no flicker). A fetch-once cache here went
    // stale the moment the user switched vela accounts mid-session — the menu
    // kept showing the first account's email (#102).
    let cancelled = false;
    void fetchVelaLoginStatus().then((status) => {
      if (!cancelled) setAccountEmail(status?.user?.email?.trim() || '');
    });
    return () => {
      cancelled = true;
    };
  }, [accountOpen]);
  // Hover-open for the account menu (#5517 interaction). The popover floats
  // above the trigger, so closing is delayed just long enough for the pointer
  // to cross the gap; re-entering the container (menu included — it's a DOM
  // child even though it renders beside) cancels the pending close.
  const accountCloseTimer = useRef<number | null>(null);
  const cancelAccountClose = () => {
    if (accountCloseTimer.current !== null) {
      window.clearTimeout(accountCloseTimer.current);
      accountCloseTimer.current = null;
    }
  };
  const openAccountMenu = () => {
    cancelAccountClose();
    setAccountMenuMode((mode) => (mode === 'closed' ? 'hover' : mode));
  };
  const scheduleAccountClose = () => {
    cancelAccountClose();
    accountCloseTimer.current = window.setTimeout(() => {
      setAccountMenuMode((mode) => (mode === 'hover' ? 'closed' : mode));
    }, 220);
  };
  useEffect(() => cancelAccountClose, []);
  // While open, track the pointer at the document level: anywhere outside the
  // account container arms the close timer, back inside disarms it. This is
  // deliberately NOT React onMouseLeave — leaving from inside the floating
  // menu does not reliably produce a synthetic leave on the container.
  const accountContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const onDocPointerOver = (ev: PointerEvent) => {
      const container = accountContainerRef.current;
      if (!container) return;
      if (container.contains(ev.target as Node)) cancelAccountClose();
      else scheduleAccountClose();
    };
    document.addEventListener('pointerover', onDocPointerOver, true);
    return () => document.removeEventListener('pointerover', onDocPointerOver, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen]);
  // The menu grows with the account (identity card, rows), and it is anchored
  // to the rail card's BOTTOM — so on a short window a tall menu ran flush
  // past the card's top edge instead of keeping the 11px inset it holds on its
  // left and right. Bound it to the card with that same inset and let the
  // overflow scroll. Measured, not guessed: the card's height is the rail
  // column's, which no CSS length here can name.
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountMenuMaxHeight, setAccountMenuMaxHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!accountOpen) {
      setAccountMenuMaxHeight(null);
      return;
    }
    const measure = () => {
      const menu = accountMenuRef.current;
      const card = menu?.closest('.entry-nav-rail__panel');
      if (!menu || !card) return;
      // The menu's bottom edge is pinned to the trigger, so it stays put while
      // the height changes — measuring it once per layout is stable.
      const available =
        menu.getBoundingClientRect().bottom - card.getBoundingClientRect().top - ACCOUNT_MENU_CARD_INSET;
      setAccountMenuMaxHeight(Math.max(ACCOUNT_MENU_MIN_HEIGHT, Math.round(available)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [accountOpen]);
  // Hover-out does not cover anyone who never hovers: a touch user, or a click
  // that lands somewhere else without the pointer crossing this container.
  // Press-outside closes it immediately, and
  // Escape gives the keyboard the same exit. Still a listener, not a backdrop,
  // so the pointerover tracking above keeps receiving its events.
  useDismissOnOutsideInteraction(accountOpen, accountContainerRef, () => {
    cancelAccountClose();
    closeAccountMenu();
  });

  // One public comparison destination shared with the rail's invite dialog.
  // Pricing owns plan choice; only a selected card hands off to checkout.
  const upgradeUrl = workspaceUpgradeUrl(context, billing);
  const billingUpgradeUrl =
    context?.billingRecovery?.recoveryUrl?.trim() || upgradeUrl;
  // #62: the 积分 row links straight OUT to B's console dashboard (usage detail
  // lives there) — no intermediate credits popover in the client, matching
  // #5517. It used to open a wallet page; balance, top-up and the auto-recharge
  // policy were rehomed onto the dashboard (vela #1055).
  const billingConsoleUrl = workspaceSettingsUrl
    ? teamConsoleUrl(workspaceSettingsUrl, 'billing')
    : null;
  // Where the account menu's 账单 row goes. The workspace-settings URL is the
  // better answer when the context carries one (it pins the console to THIS
  // workspace through the deep-link param it already holds), but a context can
  // arrive without it — a local runtime does — and this row must not silently
  // vanish because of that. The fallback builds the same workspace-scoped
  // dashboard from the workspace id alone, exactly as EntryShell and the
  // campaign badge already build their plans links.
  const accountBillingUrl =
    billingConsoleUrl ?? amrConsoleUrlForWorkspace(undefined, context?.workspaceId);
  // Product decision: plan comparison lives on public Pricing and payment
  // lives in Cloud. The client refreshes billing + context when focus returns
  // so a completed web upgrade syncs plan, credits, seats and gates.
  //
  // The gate needs all three answers: a destination exists, the caller may act
  // on billing, AND the tier actually has somewhere to go. Without the tier
  // question a 团队版 Max owner — the top tier, nothing above it — was offered
  // 升级 that could only reopen the plan they already hold. It reads the tier
  // the card LABELS, so the button and the nameplate next to it can never
  // disagree.
  const canUpgrade =
    Boolean(billingUpgradeUrl && permissions?.canManageBilling)
    && canUpgradeFromPlanTier(labelTier);
  // Whether the top-right pill sells the upgrade instead of reporting a
  // balance. It reads the same tier the wordmark draws, so the pill's green
  // ground and its badge can never disagree. `labelTier` alone is not enough:
  // B commonly reports no plan at all for a free account, which leaves the
  // strict read null while the wordmark still resolves free off the display
  // label — that is the state a local dev workspace sits in. It is kept in the
  // test anyway for the case where B DOES say 'free' but the workspace is
  // team-typed, where the wordmark draws `team` instead.
  const isFreePlan = planTier === 'free' || (labelTier ?? '').trim().toLowerCase() === 'free';
  // The pill exists whenever billing has answered (it is the only way to the
  // billing card under it); what it SAYS follows the zero-balance ruling
  // above — a subscriber at $0.00 keeps the plan wordmark and drops the
  // number, so the card stays reachable without a permanent zero next to it.
  const showCreditsPill = Boolean(billing || balanceLabel);

  function openBillingUpgrade() {
    if (!billingUpgradeUrl) return;
    window.open(billingUpgradeUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => {
      notifyWorkspaceBillingRefresh();
      notifyWorkspaceContextRefresh();
    }, 3000);
  }

  function trackAccountAction(element: AccountMenuClickProps['element']) {
    trackAccountMenuClick(analytics.track, {
      page_name: page,
      area: 'account_menu',
      element,
      ...(element === 'upgrade'
        ? {
            is_free_active:
              workspaceDimensions.plan_bucket === 'free'
              && context?.lifecycleState === 'active',
          }
        : {}),
      ...workspaceDimensions,
    });
  }

  if (typeof document === 'undefined' || !chromeActionsHost) return null;
  if (!leadingSlot && !context && !updaterSlot) return null;

  // With a rail host the account module — and the update-ready rocket that
  // rides its row (per product: 升级提醒按钮跟在头像后边) — render at the foot
  // of the rail. Without one (signed-out, or the project route) the rocket
  // keeps its top-right home and the account module is dropped rather than
  // relocated: the menu has no second home. The rocket alone also falls back
  // to the top-right home while a narrow window has auto-collapsed the rail:
  // an update reminder parked in a hidden column is no reminder.
  const accountInRail = Boolean(context && accountHost);
  const updaterInRail = accountInRail && !railAutoCollapsed;
  const clusterVisible = Boolean(leadingSlot || context || updaterControlVisible);
  const updaterHostVisible = !updaterInRail && Boolean(context || updaterControlVisible);

  return (
    <>
      {createPortal(
        <div className={clusterVisible ? 'entry-top-right-cluster' : undefined}>
          {leadingSlot}
          {/* GitHub star chip: its own option in the cluster, right after the
              campaign badge (per product) — it used to live in the account
              menu's social row. */}
          {clusterVisible ? (
            <a
              className="entry-top-right-github"
              href={REPO_URL}
              {...externalLinkProps}
              aria-label={`GitHub · ${githubStars == null ? GITHUB_STARS_FALLBACK_LABEL : formatStars(githubStars)} stars`}
              title={`GitHub · ${githubStars == null ? GITHUB_STARS_FALLBACK_LABEL : formatStars(githubStars)} stars`}
              data-testid="entry-top-right-github"
              onClick={() => trackAccountAction('github')}
            >
              {/* 15, not the wordmark's 14: the octocat only fills 81% of its
                  24-unit viewBox while the plan wordmark fills 90% of its own, so
                  equal box heights drew an optically smaller mark. 15 puts the
                  two drawn glyphs on the same ~12.5px height. */}
              <Icon name="github-filled" size={15} />
              <span>{githubStars == null ? GITHUB_STARS_FALLBACK_LABEL : formatStars(githubStars)}</span>
            </a>
          ) : null}
          {/* The capsule holds the credits segment alone — the avatar moved
              to the rail, and with it the account menu's hover region. The
              anchor around it owns the hover region for the billing panel
              below: the panel is a DOM child, so crossing from the pill into
              it never leaves the anchor and never arms the close. */}
          {context && showCreditsPill ? (
            <div
              ref={creditsAnchorRef}
              className="entry-top-right-credits-anchor"
              onPointerEnter={openCreditsPanel}
              onPointerLeave={scheduleCreditsPanelClose}
              onFocus={openCreditsPanel}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) scheduleCreditsPanelClose();
              }}
            >
              <div
                className={`entry-top-right-account-pill${isFreePlan ? ' entry-top-right-account-pill--upgrade' : ''}`}
              >
                <button
                  type="button"
                  className="entry-top-right-credits"
                  data-testid="entry-top-right-credits"
                  aria-haspopup="dialog"
                  aria-expanded={creditsPanelOpen}
                  aria-controls={creditsPanelOpen ? creditsPanelId : undefined}
                  aria-label={isFreePlan ? t('entry.creditsUpgrade') : t('entry.credits')}
                  onClick={() => {
                    // The free pill IS the upgrade CTA, so it opens the upgrade
                    // flow when this member is allowed to buy. Without that
                    // permission (or without an upgrade URL) it falls back to
                    // the console, which is where the paid pill always goes.
                    if (isFreePlan && canUpgrade) {
                      trackAccountAction('upgrade');
                      openBillingUpgrade();
                      return;
                    }
                    trackAccountAction('credits');
                    if (accountBillingUrl) {
                      window.open(accountBillingUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  {isFreePlan ? (
                    /* Free plan: the pill stops reporting a balance that is only
                       ever 0.00 and sells the upgrade instead — spark mark plus
                       the same 升级 / Upgrade label the billing card uses, on
                       the green ground the wrapper paints. */
                    <>
                      <UpgradeSparkMark />
                      {t('entry.creditsUpgrade')}
                    </>
                  ) : (
                    <>
                      {/* Leads with the workspace's plan wordmark (plus / pro /
                          max / team) rather than a generic charge glyph, so the
                          chip names the membership it belongs to. The battery
                          icon stays as the fallback for the rare tier string no
                          wordmark matches — without it the chip would be a
                          bare, unlabelled number. */}
                      {planTier ? (
                        <PlanWordmark tier={planTier} height={14} />
                      ) : (
                        <RemixIcon name="battery-charge-line" size={13} />
                      )}
                      {showCreditsBalance ? <>{' '}{balanceAmount ?? '—'}</> : null}
                    </>
                  )}
                </button>
              </div>
              {/* #5517 billing card, relocated: plan (+badge) + 升级 CTA + USD
                  balance, hanging under the pill it describes. The balance row
                  links out to B's console. It receives only an explicitly
                  scoped money value; raw credits are never formatted as
                  dollars here. */}
              {creditsPanelOpen ? (
                <div
                  id={creditsPanelId}
                  role="dialog"
                  aria-label={t('entry.credits')}
                  className="entry-top-right-credits-panel"
                  data-testid="entry-top-right-credits-panel"
                >
                  <div className="entry-nav-rail__menu-credits">
                    <div className="entry-nav-rail__menu-credits-head">
                      <span className="entry-nav-rail__menu-credits-plan">
                        {tierLabel}
                        {planTier ? <PlanWordmark tier={planTier} height={11} /> : null}
                      </span>
                      {canUpgrade ? (
                        <button
                          type="button"
                          className="entry-nav-rail__menu-credits-upgrade"
                          onClick={() => {
                            trackAccountAction('upgrade');
                            setCreditsPanelOpen(false);
                            openBillingUpgrade();
                          }}
                        >
                          {t('entry.creditsUpgrade')}
                        </button>
                      ) : null}
                    </div>
                    {/* #62 (product ruling): clicking the balance jumps straight
                        to B's console dashboard for the usage detail — there is
                        NO intermediate credits popover in the client. */}
                    <button
                      type="button"
                      className="entry-nav-rail__menu-credits-row"
                      data-testid="entry-nav-credits-row"
                      onClick={() => {
                        trackAccountAction('credits');
                        setCreditsPanelOpen(false);
                        if (accountBillingUrl) {
                          window.open(accountBillingUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    >
                      <span className="entry-nav-rail__menu-credits-label">
                        <RemixIcon name="battery-charge-line" size={14} /> {t('entry.credits')}
                      </span>
                      <span className="entry-nav-rail__menu-credits-value">
                        {balanceLabel ?? '—'}
                        <Icon name="chevron-right" size={14} />
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Update-ready rocket, top-right home: signed-out shells, the
              project route, and a narrow window whose rail is auto-collapsed
              keep it here. Otherwise it rides the account row — see the dock
              below. The slot stays mounted so `:empty { display: none }` can
              remove it until an installer has downloaded. */}
          {updaterInRail ? null : (
            <div
              ref={updaterSlotHostRef}
              className={updaterHostVisible ? 'entry-nav-rail__account-updater' : undefined}
              data-testid={updaterHostVisible ? 'entry-nav-account-updater' : undefined}
            >
              {updaterSlot}
            </div>
          )}
        </div>,
        chromeActionsHost,
      )}
      {/* The account module renders into the rail's foot, not the top-right
          corner — see `accountHost`. Discord / X / mail sit ABOVE the identity
          row rather than inside the menu: they are outbound links to the
          project, not account actions, and behind a hover menu nobody found
          them. */}
      {accountInRail
        ? createPortal(
            <div className="entry-nav-rail__account-dock">
              <RailSocialRow page={page} dimensions={workspaceDimensions} variant="dock" />
              <div
                ref={accountContainerRef}
                className="entry-nav-rail__account"
                onMouseEnter={cancelAccountClose}
                onMouseLeave={scheduleAccountClose}
              >
                <button
                  type="button"
                  className="entry-nav-rail__account-trigger"
                  onClick={() => {
                    trackEntryNavigationClick(analytics.track, {
                      page_name: page,
                      area: 'entry_nav',
                      element: 'account_menu_trigger',
                      target: 'account_menu',
                      entry_from: 'sidebar',
                      ...workspaceDimensions,
                    });
                    cancelAccountClose();
                    setAccountMenuMode((mode) => (mode === 'pinned' ? 'closed' : 'pinned'));
                  }}
                  onMouseEnter={openAccountMenu}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label={accountName}
                  data-testid="entry-nav-account"
                >
                  {/* No unread dot here: the message-centre bell in this same
                      row owns that signal, and duplicating it on the avatar
                      pointed at two different things with one mark. */}
                  <span className="entry-nav-rail__account-avatar" aria-hidden>
                    {accountInitial}
                  </span>
                  {/* The rail is wide enough to name the identity, so the
                      avatar no longer has to carry it alone. Truncates rather
                      than widening the row — the two controls after it hold
                      fixed slots. */}
                  <span className="entry-nav-rail__account-name">{accountName}</span>
                </button>
                {/* Message centre is a peer of the identity here, not a menu
                    row: it is checked far more often than anything the menu
                    holds, and a row hidden behind a hover menu made the unread
                    dot on the avatar point at something two interactions
                    away. */}
                <button
                  type="button"
                  ref={messageCenterBellRef}
                  className="entry-nav-rail__account-bell"
                  aria-haspopup="dialog"
                  aria-expanded={messageCenterOpen}
                  aria-label={t('messageCenter.title')}
                  title={t('messageCenter.title')}
                  data-testid="entry-nav-account-message-center"
                  onClick={() => {
                    trackAccountAction('message_center');
                    closeAccountMenu();
                    setMessageCenterOpen(true);
                  }}
                >
                  <Icon name="bell" size={15} />
                  {messageUnreadCount > 0 ? (
                    <span className="entry-nav-rail__menu-item-dot" aria-hidden />
                  ) : null}
                </button>
                {/* Update-ready rocket, parked at the row's outer edge — last
                    in a fixed-slot tail so the elastic name column absorbs
                    whatever width is left. Mounted unconditionally so the
                    row's shape is stable; `:empty { display: none }` keeps an
                    idle slot from reserving width. It must never be a
                    DESCENDANT of the trigger above: a button inside the
                    account button would be invalid markup and would make
                    every rocket click toggle the account menu too. */}
                {updaterInRail ? (
                  <div className="entry-nav-rail__account-updater" data-testid="entry-nav-account-updater">
                    {updaterSlot}
                  </div>
                ) : null}
                {accountOpen ? (
                  <>
                    {/* No backdrop here (unlike the team menu): hover-open
                        relies on document-level pointerover to close, and a
                        full-screen backdrop would swallow those events and
                        insta-close. */}
                    <div
                      ref={accountMenuRef}
                      className="entry-nav-rail__account-menu"
                      role="menu"
                      style={
                        accountMenuMaxHeight === null
                          ? undefined
                          : { maxHeight: `${accountMenuMaxHeight}px` }
                      }
                    >
                      <div className="entry-nav-rail__account-head">
                        <span className="entry-nav-rail__account-head-avatar" aria-hidden>{accountInitial}</span>
                        <span className="entry-nav-rail__account-head-name">{accountName}</span>
                        {accountEmail ? (
                          <span className="entry-nav-rail__account-head-email">{accountEmail}</span>
                        ) : null}
                      </div>
                      {/* 账单 leads the menu: it is the only account-level
                          destination left here, and it opens the membership
                          surface in B's console — the same place the 额度 row
                          and the 升级 pill land, so plan, seats and balance
                          are never split across two destinations. Gated on
                          the URL: without a console to reach, the row would
                          be a dead click. */}
                      {accountBillingUrl ? (
                        <a
                          className="entry-nav-rail__menu-item"
                          role="menuitem"
                          href={accountBillingUrl}
                          {...externalLinkProps}
                          data-testid="entry-account-billing"
                          onClick={() => {
                            trackAccountAction('billing');
                            closeAccountMenu();
                          }}
                        >
                          <RemixIcon name="wallet-line" size={15} /> {t('entry.accountBilling')}
                        </a>
                      ) : null}
                      {/* #5517's account menu went 设置 → GitHub 帮助 → 功能建议 →
                          社交行, with no theme row, no language submenu, and no
                          divider in between. Both of those controls still have
                          a home in 设置·通用 (theme segmented control + language
                          picker), so dropping the duplicates here costs no
                          capability. 设置 itself left too: it is a rail item
                          under 插件 on this branch, and repeating it here would
                          be the same dialog twice in one column. */}
                      <a
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        href={GITHUB_HELP_URL}
                        {...externalLinkProps}
                        onClick={() => {
                          trackAccountAction('github_help');
                          closeAccountMenu();
                        }}
                      >
                        <Icon name="comment" size={15} /> {t('entry.accountGithubHelp')}
                      </a>
                      <a
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        href={GITHUB_FEATURE_URL}
                        {...externalLinkProps}
                        onClick={() => {
                          trackAccountAction('feature_request');
                          closeAccountMenu();
                        }}
                      >
                        <Icon name="sparkles" size={15} /> {t('entry.accountFeatureRequest')}
                      </a>
                      <div className="entry-nav-rail__menu-divider" />
                      <button
                        type="button"
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        onClick={() => {
                          trackAccountAction('logout');
                          closeAccountMenu();
                          // recvqgMWpJZqhL: never sign out on this click alone —
                          // arm the confirmation dialog and let it run the logout.
                          setConfirmSignOut(true);
                        }}
                      >
                        <Icon name="log-out" size={15} /> {t('entry.accountSignOut')}
                      </button>
                    </div>
                  </>
                ) : null}
                {confirmSignOut ? (
                  <SignOutConfirmDialog
                    onCancel={() => setConfirmSignOut(false)}
                    onConfirm={() => {
                      setConfirmSignOut(false);
                      // Real sign-out: clear the vela profile auth on the
                      // daemon, then nudge every workspace surface to re-read
                      // (the context read now resolves to null → the shell
                      // falls back to the signed-out local form).
                      void velaLogout().then(async (result) => {
                        if (!result.ok) return;
                        await onSignedOut?.();
                        // recvqbkcLqIFH7: a stale "dismissed" flag on the
                        // footer's CloudSignInTip must not survive a real
                        // sign-out, or the rail's only sign-in entry point
                        // silently disappears with nothing left in its place.
                        resetCloudSignInTipDismissal();
                        notifyAmrLoginStatusChanged();
                        notifyWorkspaceContextRefresh();
                        notifyWorkspaceBillingRefresh();
                        notifyTeamProjectsChanged();
                      });
                    }}
                  />
                ) : null}
              </div>
            </div>,
            accountHost as HTMLElement,
          )
        : null}
      {/* Panel + unread polling live here (outside the hover menu, which
          unmounts when closed); the bell beside the identity row just opens
          it. Signed-out shells have no account module — `EntryNavRail` mounts
          its own MessageCenter for that branch, so this one is context-gated
          to keep exactly one instance (and one unread poller) alive. */}
      {context ? (
        <MessageCenter
          hideTrigger
          returnFocusRef={messageCenterBellRef}
          open={messageCenterOpen}
          onOpenChange={setMessageCenterOpen}
          onUnreadCountChange={setMessageUnreadCount}
          onOpenNotificationSettings={onOpenSettings ? () => onOpenSettings('notifications') : undefined}
          priorityAnnouncementActive={priorityAnnouncementActive}
          onPriorityAnnouncementPendingChange={onPriorityAnnouncementPendingChange}
          priorityAnnouncementCurrentPlanId={priorityAnnouncementCurrentPlanId}
          priorityAnnouncementMetricsConsent={priorityAnnouncementMetricsConsent}
        />
      ) : null}
    </>
  );
}

/** Project-view variant. Bound projects pass their route-owned Workspace
 * authority explicitly; an unbound local project deliberately falls back to
 * the shell's ambient account context. */
export function WorkspaceTopRightAccountCluster({
  onOpenSettings,
  onSignedOut,
  updaterSlot,
  workspaceContextOverride,
  workspaceContextLoading,
  amrLoggedIn = null,
  amrAccountPlan = null,
  metricsConsent = false,
  installationId,
}: {
  onOpenSettings?: (section?: EntrySettingsSection) => void;
  onSignedOut?: () => void | Promise<void>;
  /** Keep the project-detail account cluster on the same updater surface as Home. */
  updaterSlot?: ReactNode;
  workspaceContextOverride?: WorkspaceCollabContext | null;
  workspaceContextLoading?: boolean;
  amrLoggedIn?: boolean | null;
  amrAccountPlan?: string | null;
  metricsConsent?: boolean;
  installationId?: string | null;
}) {
  const ambient = useWorkspaceContext();
  const hasExplicitWorkspaceContext = workspaceContextOverride !== undefined;
  const context = hasExplicitWorkspaceContext
    ? workspaceContextOverride
    : ambient.context;
  const contextLoading = hasExplicitWorkspaceContext
    ? workspaceContextLoading === true
    : ambient.loading;
  const billingResponse = useWorkspaceBillingResponse({
    context,
    loading: contextLoading,
  });
  // Plan and money are both workspace-scoped questions, so both go through a
  // context-partitioned projection — `response.summary` on its own is an
  // ACCOUNT read (`workspaceId: null` by contract). Same rule as EntryShell.
  const billing = workspaceBillingSummaryForContext(billingResponse, context);
  const balanceUsd = workspaceBillingBalanceUsd(billingResponse, context);
  const deepSeekCampaignVisibility = useDeepSeekV4FlashCampaignVisibility();
  const campaignPlan = resolvePlanLabelTier({
    billing,
    context,
    accountPlan:
      contextLoading || context?.workspaceType === 'team'
        ? null
        : amrAccountPlan,
  });
  const deepSeekCampaignAudience = resolveDeepSeekV4FlashCampaignAudience({
    plan: campaignPlan,
    loggedIn: amrLoggedIn,
    now: deepSeekCampaignVisibility.now,
  });
  const campaignAudience =
    deepSeekCampaignAudience === 'unknown'
      ? null
      : deepSeekCampaignAudience;
  return (
    <EntryTopRightCluster
      page="project"
      context={context}
      billing={billing}
      balanceUsd={balanceUsd}
      leadingSlot={campaignAudience ? (
        <WorkbenchCampaignBadge
          audience={campaignAudience}
          page="project"
          metricsConsent={metricsConsent}
          installationId={installationId}
          loggedIn={amrLoggedIn}
        />
      ) : null}
      updaterSlot={updaterSlot}
      onOpenSettings={onOpenSettings}
      onSignedOut={onSignedOut}
    />
  );
}

/**
 * Community/contact links pinned to the bottom of the nav rail.
 *
 * The row's first slot is the Discord invite for every locale (the Chinese
 * Feishu group entry was retired so there is one community to point at).
 * All three labels are translated and surface through the shared
 * `.od-tooltip` layer. Analytics keeps reporting these
 * under `area: 'account_menu'` so the existing funnel stays comparable across
 * the move out of that menu.
 */
/** X's own mark (inline SVG — it is not in the Remix set the Icon component
 *  draws from). Sized like its Discord / mail neighbours; the colour rides
 *  the link so hover moves all three together. */
function XMark({ size }: { size: number }) {
  return (
    <svg
      className="entry-nav-rail__menu-x"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M10.4883 14.651L15.25 21H22.25L14.3917 10.5223L20.9308 3H18.2808L13.1643 8.88578L8.75 3H1.75L9.26086 13.0145L2.31915 21H4.96917L10.4883 14.651ZM16.25 19L5.75 5H7.75L18.25 19H16.25Z" />
    </svg>
  );
}

/**
 * Community / contact links (Discord / X / mail).
 *
 * Two homes, one row: the signed-out rail keeps it in the footer as compact
 * icon buttons (`footer`), and the signed-in account dock stacks it directly
 * above the identity row with a label beside each glyph (`dock`, per product:
 * 左边图标，右边文本 — the dock CSS spreads the three across the row and drops
 * the labels once the rail gets too narrow for them).
 */
function RailSocialRow({
  page,
  dimensions,
  variant = 'footer',
}: {
  page: TrackingWorkspacePage;
  dimensions: ReturnType<typeof workspaceAnalyticsDimensions>;
  variant?: 'footer' | 'dock';
}) {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  const dock = variant === 'dock';
  // The rail sits on the leading edge, so tooltips open away from it —
  // right in LTR, left once RTL moves the whole rail to the right edge.
  // Without the flip the bubble would be clamped against the viewport
  // and land back on top of the icons it describes.
  const tooltipPlacement = isRtlLocale(locale) ? 'left' : 'right';
  // One string per link doubles as the accessible name and the hover
  // tooltip: the bubble is the only place the icons say what they do, so
  // the copy leads with the payoff (Discord hands out credits) rather
  // than naming the destination.
  const communityLabel = t('entry.discordAria');
  const xLabel = t('entry.xAria');
  const mailLabel = t('entry.mailAria');
  const rowClass = dock ? 'entry-nav-rail__menu-social' : 'entry-nav-rail__social';
  const btnClass = dock
    ? 'entry-nav-rail__menu-social-btn'
    : 'entry-nav-rail__social-btn od-tooltip';
  // The dock names each link inline, so the bubble is redundant there; a
  // native title still covers the narrow-rail state where the label hides.
  const hint = (label: string) =>
    dock
      ? { title: label }
      : { 'data-tooltip': label, 'data-tooltip-placement': tooltipPlacement };
  const glyph = dock ? 16 : 15;

  function track(element: AccountMenuClickProps['element']) {
    trackAccountMenuClick(analytics.track, {
      page_name: page,
      area: 'account_menu',
      element,
      ...dimensions,
    });
  }

  return (
    <div className={rowClass} data-testid="entry-nav-rail-social">
      <a
        className={btnClass}
        href={DISCORD_URL}
        {...externalLinkProps}
        aria-label={communityLabel}
        {...hint(communityLabel)}
        data-testid="entry-nav-rail-discord"
        onClick={() => track('discord')}
      >
        <Icon name="discord" size={glyph} />
        {dock ? <span className="entry-nav-rail__menu-social-label">Discord</span> : null}
      </a>
      <a
        className={btnClass}
        href={X_URL}
        {...externalLinkProps}
        aria-label={xLabel}
        {...hint(xLabel)}
        onClick={() => track('twitter')}
      >
        <XMark size={glyph} />
        {dock ? <span className="entry-nav-rail__menu-social-label">X</span> : null}
      </a>
      <a
        className={btnClass}
        href={CONTACT_EMAIL_URL}
        aria-label={mailLabel}
        {...hint(mailLabel)}
        onClick={() => track('email')}
      >
        <Icon name="mail" size={glyph} />
        {dock ? (
          <span className="entry-nav-rail__menu-social-label">{t('entry.socialMail')}</span>
        ) : null}
      </a>
    </div>
  );
}

export function EntryNavRail({
  view,
  onViewChange,
  onNewProject,
  onOpenSearch,
  newProjectDisabled,
  open,
  topRightSlot,
  context,
  billing,
  balanceUsd,
  onOpenSettings,
  onSignedOut,
  updaterSlot,
  footerNotice,
  recentProjects,
  onOpenRecentProject,
  onRenameRecentProject,
  onDeleteRecentProject,
  onDuplicateRecentProject,
  isSharedRecentProject,
  recentProjectOwnerMemberIds,
  onRecentProjectShared,
  onRecentProjectShareFailed,
  priorityAnnouncementActive,
  onPriorityAnnouncementPendingChange,
  priorityAnnouncementCurrentPlanId,
  priorityAnnouncementMetricsConsent,
}: Props) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const analyticsPage = entryViewToTracking(view);
  const workspaceDimensions = workspaceAnalyticsDimensions(context);
  // Portal target for the account module, which `EntryTopRightCluster` owns
  // but renders down here. State, not a ref: the cluster has to re-render once
  // the node exists or the portal would have nowhere to land on first paint.
  const [accountHost, setAccountHost] = useState<HTMLDivElement | null>(null);
  const communityLabel = t('pluginsHome.title');
  // #5517 renamed the rail's first item from 最近 (Recents) to 首页 (Home) —
  // the key keeps its historical name, the VALUE now reads Home in every
  // locale (polish round 2, ref 1db2d00c2).
  const homeLabel = t('entry.navRecents');
  const isHome = view === 'home';

  const isTeam = Boolean(context) && context!.workspaceType === 'team';
  const permissions = context?.permissions;
  // Demo `canOwnWorkspace` → real owner-level view of workspace settings. Never
  // re-derive from role — the permission bits already fold role + lifecycle in.
  const canViewWorkspaceSettings = Boolean(permissions?.canViewWorkspaceSettings);
  const canInviteMembers = Boolean(permissions?.canInviteMembers);
  const canAccessInviteFlow = canAccessWorkspaceInviteFlow(context);
  const workspaceSettingsUrl = context?.workspaceSettingsUrl?.trim() || null;

  // Message-center panel for the SIGNED-OUT shell only (its rail item under
  // 设置 is the one opener there). The signed-in panel — plus the unread badge
  // on the avatar — lives inside `EntryTopRightCluster` with the account menu.
  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const messageCenterRailRef = useRef<HTMLButtonElement | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  useEffect(() => {
    if (!teamOpen) return;
    trackWorkspaceSurfaceView(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_switcher',
      ...workspaceDimensions,
    });
  }, [teamOpen, analytics.track, analyticsPage, workspaceDimensions.workspace_key]);
  // The LATEST context, for async work to compare against. `loadWorkspaceDirectory`
  // closes over the render's `context` prop, which is the identity its read was
  // issued for — so only a ref can answer "has the identity moved since?".
  const contextRef = useRef(context);
  contextRef.current = context;
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceDirectoryItem[]>(
    () => attributableWorkspaceDirectory(context) ?? [],
  );
  const railIdentity = workspaceIdentityCacheKey(context);
  const [workspaceDirectoryLoading, setWorkspaceDirectoryLoading] = useState(false);
  const [workspaceSwitchingId, setWorkspaceSwitchingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteTarget = resolveWorkspaceInviteTarget(context);
  // The invite dialog's seat-gate upgrade entry uses the same public Pricing
  // destination as the credits chip's twin decision in EntryTopRightCluster.
  const upgradeUrl = workspaceUpgradeUrl(context, billing);
  const identityWorkspaceItems = workspaceDirectoryForIdentity(workspaceItems, context);
  const currentWorkspaceItem = context
    ? identityWorkspaceItems.find((item) => item.workspaceId === context.workspaceId) ?? null
    : null;
  // Name the CURRENT workspace from whatever real source has already answered,
  // never from a read of our own. `context` is the startup context the shell
  // already holds, and B populates its `workspaceName` for personal workspaces
  // too — so a personal workspace is labelled correctly on first paint instead
  // of sitting on the hardcoded fallback until the user opens this dropdown and
  // the directory read lands (recvpkuLOujgAm). The directory item stays first:
  // when it is warm it is the same value, revalidated.
  const workspaceName =
    currentWorkspaceItem?.workspaceName?.trim() ||
    context?.workspaceName?.trim() ||
    context?.teamName?.trim() ||
    context?.teamId ||
    (context?.workspaceType === 'personal' ? 'Personal workspace' : '') ||
    context?.workspaceId ||
    '';
  const workspaceInitial = workspaceName.charAt(0).toUpperCase() || 'W';
  const visibleWorkspaceItems =
    identityWorkspaceItems.length > 0
      ? identityWorkspaceItems
      : context
        ? [{
            workspaceId: context.workspaceId,
            workspaceName,
            workspaceType: context.workspaceType,
            workspaceMemberId: context.workspaceMemberId,
            role: context.role,
            memberStatus: context.memberStatus,
            lifecycleState: context.lifecycleState,
          } satisfies WorkspaceDirectoryItem]
        : [];

  async function loadWorkspaceDirectory(options: { force?: boolean } = {}) {
    // Capture the identity this read is FOR, and compare against `contextRef`
    // (not the closed-over `context`, which is by definition the identity we are
    // reading for) before committing anything — see `beginWorkspaceScopedRead`.
    const read = beginWorkspaceScopedRead(contextRef.current);
    // Only show the loading row when there is nothing to show yet. With a warm
    // cache the list is already on screen and this read just revalidates it —
    // but a cache belonging to another account counts as nothing to show.
    if (attributableWorkspaceDirectory(read.context) === null) {
      setWorkspaceDirectoryLoading(true);
    }
    try {
      // The coalescing key carries the caller's identity for the same reason the
      // module cache does: `coalescedGet` shares a settled result for a second,
      // and this read's answer depends on WHO asked.
      const cacheKey = `workspace-directory:${workspaceIdentityCacheKey(read.context)}`;
      if (options.force) evictCoalescedGet(cacheKey);
      const readDirectory = async () => {
        const response = await fetch('/api/workspace/directory', { cache: 'no-store' });
        if (!response.ok) throw new Error(`directory ${response.status}`);
        const body = (await response.json()) as WorkspaceDirectoryResponse;
        return body.items ?? [];
      };
      const items = await coalescedGet(cacheKey, readDirectory);
      // The account may have changed while this was in flight. Writing here
      // would repopulate BOTH the module cache and the visible list with the
      // previous account's names, after the identity-change effect below had
      // already cleared them — so an abandoned read must leave no trace.
      if (!read.isStillCurrent(contextRef.current)) return;
      cachedWorkspaceDirectory = items;
      setWorkspaceItems(items);
    } catch {
      // A failed revalidation must not blank a list the user is looking at —
      // keep the last known names and let the next open try again. A list this
      // caller has no claim to is not "a list the user is looking at".
      if (!read.isStillCurrent(contextRef.current)) return;
      if (attributableWorkspaceDirectory(read.context) === null) setWorkspaceItems([]);
    } finally {
      // A request for identity A can finish after identity B has started its
      // own load. It must not mark B as complete.
      if (read.isStillCurrent(contextRef.current)) {
        setWorkspaceDirectoryLoading(false);
      }
    }
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === context?.workspaceId || workspaceSwitchingId) return;
    const selected = visibleWorkspaceItems.find((item) => item.workspaceId === workspaceId);
    if (!selected) return;
    const startedAt = performance.now();
    const requestId = analytics.newRequestId();
    trackWorkspaceSwitcherClick(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_switcher',
      element: 'workspace_option',
      target_workspace_type: selected.workspaceType,
      is_current_workspace: false,
      ...workspaceDimensions,
    });
    setWorkspaceSwitchingId(workspaceId);
    try {
      const response = await fetch('/api/workspace/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          workspaceMemberId: selected.workspaceMemberId,
        }),
      });
      if (!response.ok) {
        trackWorkspaceSwitchResult(analytics.track, {
          page_name: analyticsPage,
          area: 'workspace_switcher',
          result: 'failed',
          target_workspace_type: selected.workspaceType,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: stableAnalyticsErrorCode(response.status),
          ...workspaceDimensions,
        }, { requestId });
        return;
      }
      const body = (await response.json()) as WorkspaceActiveResponse;
      trackWorkspaceSwitchResult(analytics.track, {
        page_name: analyticsPage,
        area: 'workspace_switcher',
        result: 'success',
        target_workspace_type: selected.workspaceType,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceAnalyticsDimensions(body.context),
      }, { requestId });
      setTeamOpen(false);
      // Seed this tab from the authoritatively verified switch response. The
      // selected identity is kept in sessionStorage by the context provider, so
      // another tab remains on its own Workspace.
      notifyWorkspaceContextRefresh(
        body?.context ? { context: body.context } : null,
      );
      notifyWorkspaceBillingRefresh();
      notifyTeamProjectsChanged();
      selectView('home');
    } catch {
      trackWorkspaceSwitchResult(analytics.track, {
        page_name: analyticsPage,
        area: 'workspace_switcher',
        result: 'failed',
        target_workspace_type: selected.workspaceType,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: 'network_error',
        ...workspaceDimensions,
      }, { requestId });
      // Keep the menu open; the next open/focus refresh can retry the directory.
    } finally {
      setWorkspaceSwitchingId(null);
    }
  }

  const selectView = (next: EntryView) => {
    trackEntryNavigationClick(analytics.track, {
      page_name: analyticsPage,
      area: 'entry_nav',
      element: 'nav_item',
      target: entryViewToTracking(next),
      entry_from: 'sidebar',
      ...workspaceDimensions,
    });
    onViewChange(next);
  };

  // While collapsed the rail is visually hidden but its controls stay mounted;
  // mark it `inert` so they leave the tab order and pointer flow entirely.
  const railRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = railRef.current;
    if (!node) return;
    if (open) {
      node.removeAttribute('inert');
    } else {
      node.setAttribute('inert', '');
    }
  }, [open]);

  useEffect(() => {
    if (!teamOpen) return;
    void loadWorkspaceDirectory();
  }, [teamOpen, railIdentity]);

  // The account-directory event is delivered through the already-shared local
  // Workspace EventSource. It stays mounted while the switcher is closed, so a
  // remote create/join/rename/removal updates the cached list immediately. A
  // reconnect/foreground edge also re-reads once to close a missed-event gap;
  // this is event-driven catch-up, not a timer.
  useWorkspaceInvalidation(
    {
      'workspace-directory-changed': () => {
        void loadWorkspaceDirectory({ force: true });
      },
    },
    {
      workspaceContext: context,
      onActive: () => {
        void loadWorkspaceDirectory({ force: true });
      },
    },
  );

  // This rail can outlive the identity that filled its list: an account swap
  // (sign out, sign in as someone else) does not necessarily unmount it, and
  // then component state would keep the previous account's names even though the
  // module cache is re-attributed on every read.
  //
  // So on each identity change, re-derive the list from the cache UNDER THE
  // INCOMING IDENTITY. A list the new identity can claim survives (the common
  // case: the same account moving between its own workspaces); one it cannot is
  // dropped, and the next open refetches. Re-deriving on the identity edge — not
  // on every render where attribution happens to fail — is what keeps a freshly
  // read list stable afterwards instead of being cleared again on the next pass.
  const lastRailIdentityRef = useRef(railIdentity);
  useEffect(() => {
    if (lastRailIdentityRef.current === railIdentity) return;
    lastRailIdentityRef.current = railIdentity;
    setWorkspaceItems(attributableWorkspaceDirectory(context) ?? []);
    // `context` is read only to re-attribute the cache for `railIdentity`, which
    // is its digest — depending on the object would re-run this on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railIdentity]);

  return (
    <nav
      ref={railRef}
      className={`entry-nav-rail${open ? ' is-open' : ''}`}
      aria-label={t('entry.primaryNavAria')}
      aria-hidden={open ? undefined : true}
    >
      <div className="entry-nav-rail__panel">
      <div className="entry-nav-rail__group">

        {context ? (
          <div className="entry-nav-rail__team-wrap">
            <button
              type="button"
              className="entry-nav-rail__team"
              onClick={() => {
                trackEntryNavigationClick(analytics.track, {
                  page_name: analyticsPage,
                  area: 'entry_nav',
                  element: 'workspace_switcher_trigger',
                  target: 'workspace_switcher',
                  entry_from: 'sidebar',
                  ...workspaceDimensions,
                });
                setTeamOpen((v) => !v);
              }}
              aria-expanded={teamOpen}
              data-testid="workspace-switcher"
            >
              <span className="entry-nav-rail__team-avatar" aria-hidden>{workspaceInitial}</span>
              <span className="entry-nav-rail__team-name">{workspaceName}</span>
              {/* The 最近浏览过 head's disclosure, exactly (per product: 展开和
                  收起和最近浏览过的一样): the glyph SWAPS rather than rotating —
                  › closed, ⌄ open — at the same 14px, in a fixed 14px slot so a
                  narrower caret cannot pull the workspace name along with it. */}
              <span className="entry-nav-rail__team-chevron" aria-hidden>
                <Icon name={teamOpen ? 'chevron-down' : 'chevron-right'} size={14} />
              </span>
            </button>
            {teamOpen ? (
              <>
                <div className="entry-nav-rail__menu-backdrop" onClick={() => setTeamOpen(false)} />
                <div
                  className="entry-nav-rail__team-menu"
                  role="menu"
                  onKeyDown={handleWorkspaceMenuKeyDown}
                >
                  <div
                    className="entry-nav-rail__workspace-list"
                    data-testid="workspace-switcher-list"
                  >
                    {visibleWorkspaceItems.map((item) => {
                      const active = item.workspaceId === context.workspaceId;
                      // Older daemon directory payloads can omit workspaceName.
                      // Keep those rows identifiable and actionable by falling
                      // back to the stable workspace id instead of crashing.
                      const itemName = item.workspaceName?.trim() || item.workspaceId;
                      const initial = itemName.charAt(0).toUpperCase() || 'W';
                      return (
                        <button
                          key={item.workspaceId}
                          type="button"
                          className={`entry-nav-rail__menu-item${active ? ' is-current' : ''}`}
                          role="menuitem"
                          aria-current={active ? 'true' : undefined}
                          // Only the in-flight switch disables a row. Disabling the
                          // CURRENT one made the UA grey it out, so the selected
                          // workspace read as the inactive one and vice versa;
                          // `.is-current` (bold + accent ✓) is the selected signal.
                          disabled={workspaceSwitchingId === item.workspaceId}
                          onClick={() => {
                            void switchWorkspace(item.workspaceId);
                          }}
                        >
                          <span className="entry-nav-rail__team-avatar" aria-hidden>{initial}</span>
                          {/* #5517's switcher rows are avatar + full name + ✓ only.
                              The raw role word ate the name's width and truncated
                              it; the role is already on 设置·工作区. */}
                          <span className="entry-nav-rail__workspace-menu-name">{itemName}</span>
                          {active ? <Icon name="check" size={14} /> : null}
                        </button>
                      );
                    })}
                    {workspaceDirectoryLoading && visibleWorkspaceItems.length === 0 ? (
                      <div className="entry-nav-rail__menu-item is-muted" role="status">
                        {t('common.loading')}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="entry-nav-rail__workspace-actions"
                    data-testid="workspace-switcher-actions"
                  >
                    <div className="entry-nav-rail__menu-divider" />
                    {canAccessInviteFlow && inviteTarget.kind !== 'unavailable' ? (
                      <button
                        type="button"
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        onClick={() => {
                          trackWorkspaceSwitcherClick(analytics.track, {
                            page_name: analyticsPage,
                            area: 'workspace_switcher',
                            element: 'invite_teammates',
                            ...workspaceDimensions,
                          });
                          setTeamOpen(false);
                          if (inviteTarget.kind === 'vela') {
                            window.open(inviteTarget.url, '_blank', 'noopener,noreferrer');
                          } else if (inviteTarget.kind === 'local') {
                            setInviteOpen(true);
                          }
                        }}
                      >
                        <Icon name="share" size={15} /> {t('workspaceSwitcher.invite')}
                      </button>
                    ) : null}
                    {/* Creating a workspace is a B console flow (its sidebar owns the
                        create dialog; there is no route or query param that opens it
                        directly), so this entry links OUT instead of doing local work.
                        With no console URL there is nowhere to send the user — render
                        nothing rather than a control that silently does nothing. */}
                    {workspaceSettingsUrl ? (
                      <a
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        href={teamConsoleUrl(workspaceSettingsUrl, 'create-team')}
                        {...externalLinkProps}
                        data-testid="entry-nav-create-team"
                        onClick={() => {
                          trackWorkspaceSwitcherClick(analytics.track, {
                            page_name: analyticsPage,
                            area: 'workspace_switcher',
                            element: 'create_team',
                            ...workspaceDimensions,
                          });
                          setTeamOpen(false);
                        }}
                      >
                        <Icon name="plus" size={15} /> {t('workspaceSwitcher.createTeam')}
                      </a>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* No search row here any more (per product: 搜索和收起跟 home icon 一起
            放在顶部): the search button and the rail toggle sit in the chrome
            row above (WorkspaceTabsBar's `.workspace-tabs-rail-actions`), and
            reach EntryShell through window events (entryRailBridge). The rail
            column starts at the workspace switcher. */}
        <NavButton
          active={isHome}
          ariaLabel={homeLabel}
          label={homeLabel}
          onClick={() => selectView('home')}
          testId="entry-nav-home"
        >
          <Icon name="home" size={16} />
        </NavButton>
        <NavButton
          active={view === 'community'}
          ariaLabel={communityLabel}
          label={communityLabel}
          onClick={() => selectView('community')}
          testId="entry-nav-community"
        >
          <Icon name="globe" size={16} />
        </NavButton>

        {context ? (
          <div className="entry-nav-rail__team-section">
            <NavButton
              active={view === 'drafts'}
              ariaLabel={t('entry.navDrafts')}
              label={t('workspaceSwitcher.draftsTooltip')}
              onClick={() => selectView('drafts')}
              testId="entry-nav-drafts"
            >
              <Icon name="file" size={16} />
            </NavButton>
            {isTeam ? (
              // All-projects is a TEAM-scoped grid (EntryShell.tsx feeds it from
              // `teamProjects`, not the personal project list) — a personal
              // workspace has no team catalog to show here at all. Rendering it
              // unconditionally left the item clickable in a personal workspace,
              // landing on a "还没有团队项目" empty state that names a concept
              // (团队项目) the current workspace cannot have.
              <NavButton
                active={view === 'all-projects'}
                ariaLabel={t('entry.navAllProjects')}
                label={t('workspaceSwitcher.allProjectsTooltip')}
                onClick={() => selectView('all-projects')}
                testId="entry-nav-all-projects"
              >
                <Icon name="grid" size={16} />
              </NavButton>
            ) : null}
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              label={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette" size={16} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navPlugins')}
              label={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="puzzle" size={16} />
            </NavButton>
            {/* 设置 is a rail destination on BOTH branches (product: 设置的按钮
                在插件下边). Signed-in used to keep it only in the account hover
                menu — two interactions deep, and invisible until you found the
                avatar. It sits directly under 插件 so the destination list ends
                the same way in either state, above 最近项目 (content, not a
                place to go). `entry-settings-button` stays UNIQUE: this branch
                and the signed-out one below are mutually exclusive. */}
            <NavButton
              ariaLabel={t('entry.accountSettings')}
              label={t('entry.accountSettings')}
              onClick={() => {
                trackAccountMenuClick(analytics.track, {
                  page_name: analyticsPage,
                  area: 'account_menu',
                  element: 'settings',
                });
                onOpenSettings?.();
              }}
              testId="entry-settings-button"
            >
              <Icon name="settings" size={16} />
            </NavButton>
            {/* 最近项目 sits under 设置 (per product) — the last thing in the
                destination list, because it is a list of CONTENT rather than a
                place to go. */}
            <RailRecentSection
              projects={recentProjects ?? []}
              onOpen={onOpenRecentProject}
              onRename={onRenameRecentProject}
              onDelete={onDeleteRecentProject}
              onDuplicate={onDuplicateRecentProject}
              isShared={isSharedRecentProject}
              ownerMemberIds={recentProjectOwnerMemberIds}
              onProjectShared={onRecentProjectShared}
              onProjectShareFailed={onRecentProjectShareFailed}
              workspaceContext={context}
              analyticsPage={analyticsPage}
              label={t('recentProjects.title')}
            />
            {/* Product decision (2026-07-20): 成员 and 数据大盘 leave the rail
                entirely — both surfaces live in B's console and the rail should
                not advertise them. Workspace 设置 stays, and still links OUT to
                that console rather than routing to an in-client view. Gate by B
                permissions, not workspaceType: a personal workspace owner can
                manage their workspace too. */}
            {canViewWorkspaceSettings && workspaceSettingsUrl ? (
              <a
                className="entry-nav-rail__btn"
                href={workspaceSettingsUrl}
                {...externalLinkProps}
                aria-label={t('entry.navWorkspaceSettings')}
                data-testid="entry-nav-workspace-settings"
                onClick={() => {
                  trackEntryNavigationClick(analytics.track, {
                    page_name: analyticsPage,
                    area: 'entry_nav',
                    element: 'workspace_settings',
                    target: 'workspace_settings',
                    entry_from: 'sidebar',
                    ...workspaceDimensions,
                  });
                }}
              >
                <span className="entry-nav-rail__btn-icon" aria-hidden>
                  <Icon name="settings" size={16} />
                </span>
                <span className="entry-nav-rail__btn-label">{t('entry.navWorkspaceSettings')}</span>
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              label={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette" size={16} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navPlugins')}
              label={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="puzzle" size={16} />
            </NavButton>
            {/* recvq4hGF7BJkI removed this entry while the rail footer still
                carried EntryShell's `entry-settings-chip` for the signed-out
                case. #5517 then dropped that chip (the footer only hosts the
                updater popup now), and a signed-out rail has no account menu
                either — leaving no settings entry at all. This item is the
                signed-out half of the pair (testId `entry-settings-button` is
                the e2e contract); the signed-in branch above renders the same
                item in the same slot under 插件, and the two never coexist. */}
            <NavButton
              ariaLabel={t('entry.accountSettings')}
              label={t('entry.accountSettings')}
              onClick={() => {
                trackAccountMenuClick(analytics.track, {
                  page_name: analyticsPage,
                  area: 'account_menu',
                  element: 'settings',
                });
                onOpenSettings?.();
              }}
              testId="entry-settings-button"
            >
              <Icon name="settings" size={16} />
            </NavButton>
            {/* Signed-out has no account menu (where the 消息中心 row lives when
                signed in), which left the message panel with no opener at all.
                It rides here as the rail item under 设置. */}
            <NavButton
              ariaLabel={t('messageCenter.title')}
              label={t('messageCenter.title')}
              onClick={() => setMessageCenterOpen(true)}
              testId="entry-nav-message-center"
              buttonRef={messageCenterRailRef}
              ariaHasPopup="dialog"
              ariaExpanded={messageCenterOpen}
            >
              <Icon name="bell" size={16} />
              {messageUnreadCount > 0 ? (
                <span className="entry-nav-rail__btn-dot" aria-hidden />
              ) : null}
            </NavButton>
          </>
        )}
        {/* Bottom of the nav column: the host `EntryTopRightCluster` portals
            the account module into. `display: contents` keeps the account
            dock itself a flex child of this group, so its own `order: 99` +
            `margin-top: auto` still push it below the nav items. */}
        {context ? <div ref={setAccountHost} className="entry-nav-rail__account-host" /> : null}
      </div>
      {/* Signed in, the social links ride the account dock above the identity
          row (see `EntryTopRightCluster`), so the footer only renders when it
          has a notice to show — an empty shell here read as a dead white
          strip under the account row. Signed out keeps the social row down
          here so the rail's bottom strip carries something. */}
      {context ? (
        footerNotice ? <div className="entry-nav-rail__footer">{footerNotice}</div> : null
      ) : (
        <div className="entry-nav-rail__footer">
          {footerNotice}
          <RailSocialRow page={analyticsPage} dimensions={workspaceDimensions} />
        </div>
      )}
      </div>

      {/* Signed-out message-center panel + unread polling (the rail's bell
          item above is its opener). Signed-in mounts move into
          `EntryTopRightCluster` — context-gating both sides is what keeps
          exactly one panel (and one unread poller) alive. */}
      {context ? null : (
        <MessageCenter
          hideTrigger
          returnFocusRef={messageCenterRailRef}
          open={messageCenterOpen}
          onOpenChange={setMessageCenterOpen}
          onUnreadCountChange={setMessageUnreadCount}
          onOpenNotificationSettings={onOpenSettings ? () => onOpenSettings('notifications') : undefined}
          priorityAnnouncementActive={priorityAnnouncementActive}
          onPriorityAnnouncementPendingChange={onPriorityAnnouncementPendingChange}
          priorityAnnouncementCurrentPlanId={priorityAnnouncementCurrentPlanId}
          priorityAnnouncementMetricsConsent={priorityAnnouncementMetricsConsent}
        />
      )}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceContext={context}
        canAssignRoles={canInviteMembers}
        availableSeats={workspaceInviteAvailableSeats(context)}
        entryFrom="workspace_switcher"
        onUpgrade={
          upgradeUrl
            ? () => {
                window.open(upgradeUrl, '_blank', 'noopener,noreferrer');
              }
            : undefined
        }
      />
      {/* Top-right chrome cluster: campaign badge (slot) + credits pill,
          mounted into the tabs chrome's no-drag actions host so Electron
          includes it in the first native hit map; the account module it owns
          portals into `accountHost` at the foot of this rail. Extracted so the
          project route can mount the same cluster without the rail (see
          `EntryTopRightCluster`). */}
      <EntryTopRightCluster
        page={analyticsPage}
        context={context}
        billing={billing}
        balanceUsd={balanceUsd}
        leadingSlot={topRightSlot}
        updaterSlot={updaterSlot}
        accountHost={accountHost}
        onOpenSettings={onOpenSettings}
        onSignedOut={onSignedOut}
        priorityAnnouncementActive={priorityAnnouncementActive}
        onPriorityAnnouncementPendingChange={onPriorityAnnouncementPendingChange}
        priorityAnnouncementCurrentPlanId={priorityAnnouncementCurrentPlanId}
        priorityAnnouncementMetricsConsent={priorityAnnouncementMetricsConsent}
      />
    </nav>
  );
}
