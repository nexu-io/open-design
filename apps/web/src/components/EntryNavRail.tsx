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
//   • Search box (opens the ⌘K project search palette via `onOpenSearch`).
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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
} from '@open-design/contracts';
import {
  fetchVelaLoginStatus,
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
import { MessageCenter } from './MessageCenter';
import type { EntrySettingsSection } from './EntrySettingsMenu';
import { isRtlLocale, useI18n } from '../i18n';
import { useDismissOnOutsideInteraction } from '../hooks/useDismissOnOutsideInteraction';
import { ENTRY_RAIL_TOGGLE_EVENT } from './entryRailBridge';
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
import { amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { useWorkspaceInvalidation } from '../collab/workspace-events';
import { resolveDeepSeekV4FlashCampaignAudience } from '../campaigns/deepseek-v4-flash';
import { useDeepSeekV4FlashCampaignVisibility } from '../campaigns/use-deepseek-v4-flash-campaign';
import type { EntryHomeView } from '../router';
import type {
  AccountMenuClickProps,
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
  onOpenSettings?: (section?: EntrySettingsSection) => void;
  onSignedOut?: () => void | Promise<void>;
  priorityAnnouncementActive?: boolean;
  onPriorityAnnouncementPendingChange?: (pending: boolean) => void;
  priorityAnnouncementCurrentPlanId?: string | null;
  priorityAnnouncementMetricsConsent?: boolean;
}

/**
 * Top-right chrome cluster: an optional leading
 * slot, the standalone credits pill, and the avatar account module with its
 * hover menu — one flex row riding the workbench top-right corner.
 *
 * Extracted from `EntryNavRail` so the WORKSPACE view (an open project tab)
 * can mount the same avatar + credits in the same fixed position even though
 * the entry shell — and its rail — is unmounted there (per product: 打开项目后
 * 个人头像和积分仍显示在原来的右上角位置). Exactly one instance is on screen
 * at a time: `EntryNavRail` renders it on the entry views, `App.tsx` (via
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
  }, [chromeActionsHost, updaterSlot]);
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
  // Message-center panel (opened from the account menu's 消息中心 row) and its
  // unread count, which drives the red dot on the account avatar.
  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  // Where the message-center panel returns keyboard focus on close. The
  // 消息中心 row cannot be it: the account menu unmounts the row before the
  // panel opens, so the account trigger it hangs off is the stable control.
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  // below the trigger, so closing is delayed just long enough for the pointer
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

  const clusterVisible = Boolean(leadingSlot || context || updaterControlVisible);
  const updaterHostVisible = Boolean(context || updaterControlVisible);

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
              <Icon name="github-filled" size={14} />
              <span>{githubStars == null ? GITHUB_STARS_FALLBACK_LABEL : formatStars(githubStars)}</span>
            </a>
          ) : null}
          {/* One shared capsule for the account module (per product: 头像和积分
              合并成一个胶囊): credits segment on the left (same availability
              rule as the menu's billing card; clicking jumps to B's billing
              console, mirroring the menu's 额度 row), avatar on the right.
              The capsule owns the pill material; the segments inside are
              chrome-free click targets. */}
          {context ? (
            <>
              <div className="entry-top-right-account-pill">
          {(billing || balanceLabel) && showCreditsBalance ? (
            <button
              type="button"
              className="entry-top-right-credits"
              data-testid="entry-top-right-credits"
              aria-label={t('entry.credits')}
              onClick={() => {
                trackAccountAction('credits');
                if (billingConsoleUrl) {
                  window.open(billingConsoleUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <RemixIcon name="battery-charge-line" size={13} /> {balanceLabel ?? '—'}
            </button>
          ) : null}
            <div
              ref={accountContainerRef}
              className="entry-nav-rail__account entry-nav-rail__account--floating"
              onMouseEnter={cancelAccountClose}
              onMouseLeave={scheduleAccountClose}
            >
              <button
                ref={accountTriggerRef}
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
                <span className="entry-nav-rail__account-avatar" aria-hidden>
                  {accountInitial}
                  {messageUnreadCount > 0 ? (
                    <span className="entry-nav-rail__account-avatar-dot" data-testid="account-avatar-unread-dot" />
                  ) : null}
                </span>
              </button>
              {accountOpen ? (
                <>
                  {/* No backdrop here (unlike the team menu): hover-open relies
                      on document-level pointerover to close, and a full-screen
                      backdrop would swallow those events and insta-close. */}
                  <div className="entry-nav-rail__account-menu" role="menu">
                    <div className="entry-nav-rail__account-head">
                      <span className="entry-nav-rail__account-head-avatar" aria-hidden>{accountInitial}</span>
                      <span className="entry-nav-rail__account-head-name">{accountName}</span>
                      {accountEmail ? (
                        <span className="entry-nav-rail__account-head-email">{accountEmail}</span>
                      ) : null}
                    </div>
                    {/* #5517 billing card: plan (+badge) + 升级 CTA + USD balance.
                        The balance row links out to B's console. It receives
                        only an explicitly scoped money value; raw credits are
                        never formatted as dollars here. */}
                    {billing || balanceLabel ? (
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
                                closeAccountMenu();
                                openBillingUpgrade();
                              }}
                            >
                              {t('entry.creditsUpgrade')}
                            </button>
                          ) : null}
                        </div>
                        {/* #62 (product ruling): clicking the balance jumps straight to
                            B's console dashboard for the usage detail — there is
                            NO intermediate credits popover in the client. */}
                        <button
                          type="button"
                          className="entry-nav-rail__menu-credits-row"
                          data-testid="entry-nav-credits-row"
                          onClick={() => {
                            trackAccountAction('credits');
                            closeAccountMenu();
                            if (billingConsoleUrl) {
                              window.open(billingConsoleUrl, '_blank', 'noopener,noreferrer');
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
                    ) : null}
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item"
                      role="menuitem"
                      onClick={() => {
                        trackAccountAction('settings');
                        closeAccountMenu();
                        onOpenSettings?.();
                      }}
                    >
                      <Icon name="settings" size={15} /> {t('entry.accountSettings')}
                    </button>
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item"
                      role="menuitem"
                      aria-haspopup="dialog"
                      aria-expanded={messageCenterOpen}
                      data-testid="account-menu-message-center"
                      onClick={() => {
                        trackAccountAction('message_center');
                        closeAccountMenu();
                        setMessageCenterOpen(true);
                      }}
                    >
                      <Icon name="bell" size={15} /> {t('messageCenter.title')}
                      {messageUnreadCount > 0 ? (
                        <span className="entry-nav-rail__menu-item-dot" aria-hidden />
                      ) : null}
                    </button>
                    {/* #5517's account menu goes 设置 → GitHub 帮助 → 功能建议 → 社交行,
                        with no theme row, no language submenu, and no divider in
                        between. Both controls still have a home in 设置·通用 (theme
                        segmented control + language picker), so dropping the
                        duplicates here costs no capability. */}
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
                    {/* The Discord/X/mail social row used to sit here (#5517).
                        It now lives in the nav rail's footer — see
                        `RailSocialRow` — so the account menu stays a pure list
                        of account actions. */}
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
              </div>
            </>
          ) : null}
          {/* Update-ready rocket: an independent top-right control. With an
              account it follows the credits/avatar capsule; signed-out keeps
              the same position without inventing an empty account shell. The
              slot stays mounted so `:empty { display: none }` can remove it
              until an installer has downloaded. */}
          <div
            ref={updaterSlotHostRef}
            className={updaterHostVisible ? 'entry-nav-rail__account-updater' : undefined}
            data-testid={updaterHostVisible ? 'entry-nav-account-updater' : undefined}
          >
            {updaterSlot}
          </div>
        </div>,
        chromeActionsHost,
      )}
      {/* Panel + unread polling live here (outside the hover menu, which
          unmounts when closed); the 消息中心 menu row above just opens it.
          Signed-out shells have no account module — `EntryNavRail` mounts its
          own MessageCenter for that branch, so this one is context-gated to
          keep exactly one instance (and one unread poller) alive. */}
      {context ? (
        <MessageCenter
          hideTrigger
          returnFocusRef={accountTriggerRef}
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
function RailSocialRow({
  page,
  dimensions,
}: {
  page: TrackingWorkspacePage;
  dimensions: ReturnType<typeof workspaceAnalyticsDimensions>;
}) {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
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

  function track(element: AccountMenuClickProps['element']) {
    trackAccountMenuClick(analytics.track, {
      page_name: page,
      area: 'account_menu',
      element,
      ...dimensions,
    });
  }

  return (
    <div className="entry-nav-rail__social" data-testid="entry-nav-rail-social">
      <a
        className="entry-nav-rail__social-btn od-tooltip"
        href={DISCORD_URL}
        {...externalLinkProps}
        aria-label={communityLabel}
        data-tooltip={communityLabel}
        data-tooltip-placement={tooltipPlacement}
        data-testid="entry-nav-rail-discord"
        onClick={() => track('discord')}
      >
        <Icon name="discord" size={15} />
      </a>
      <a
        className="entry-nav-rail__social-btn od-tooltip"
        href={X_URL}
        {...externalLinkProps}
        aria-label={xLabel}
        data-tooltip={xLabel}
        data-tooltip-placement={tooltipPlacement}
        onClick={() => track('twitter')}
      >
        <span className="entry-nav-rail__menu-x" aria-hidden>X</span>
      </a>
      <a
        className="entry-nav-rail__social-btn od-tooltip"
        href={CONTACT_EMAIL_URL}
        aria-label={mailLabel}
        data-tooltip={mailLabel}
        data-tooltip-placement={tooltipPlacement}
        onClick={() => track('email')}
      >
        <Icon name="mail" size={15} />
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
  priorityAnnouncementActive,
  onPriorityAnnouncementPendingChange,
  priorityAnnouncementCurrentPlanId,
  priorityAnnouncementMetricsConsent,
}: Props) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const analyticsPage = entryViewToTracking(view);
  const workspaceDimensions = workspaceAnalyticsDimensions(context);
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
              <Icon name="chevron-down" size={14} />
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

        {/* Search + the rail-collapse control in one row. The collapse button
            moved here from the chrome corner (per product: 收起按钮放在输入框
            后边) — the corner slot is the brand logo now, and re-opening a
            collapsed rail is what the logo does there. */}
        <div className="entry-nav-rail__search-row">
          <button
            type="button"
            className="entry-nav-rail__search"
            onClick={() => {
              trackEntryNavigationClick(analytics.track, {
                page_name: analyticsPage,
                area: 'entry_nav',
                element: 'search',
                target: 'search',
                entry_from: 'sidebar',
                ...workspaceDimensions,
              });
              onOpenSearch?.();
            }}
            aria-label={t('common.search')}
            data-testid="entry-nav-search"
          >
            <Icon name="search" size={14} />
            <span className="entry-nav-rail__search-placeholder">{t('common.search')}</span>
            <span className="entry-nav-rail__search-kbd" aria-hidden>⌘K</span>
          </button>
          <button
            type="button"
            className="entry-nav-rail__collapse od-tooltip"
            aria-label={t('entry.navCollapse')}
            title={t('entry.navCollapse')}
            data-tooltip={t('entry.navCollapse')}
            data-tooltip-placement="bottom"
            data-testid="entry-rail-collapse"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(ENTRY_RAIL_TOGGLE_EVENT));
            }}
          >
            <Icon name="panel-left" size={15} />
          </button>
        </div>

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
                ONLY signed-out settings entry (testId `entry-settings-button`
                is the e2e contract); signed-in keeps settings in the account
                menu, so it must not render on that branch. */}
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
      </div>
      {/* The footer always has the social row to show now, so it no longer
          collapses to nothing. The updater has one shared home in the
          top-right cluster for both signed-in and signed-out shells. */}
      <div className="entry-nav-rail__footer">
        {footerNotice}
        <RailSocialRow page={analyticsPage} dimensions={workspaceDimensions} />
      </div>
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
      {/* Top-right chrome cluster: campaign badge (slot) + credits pill +
          the account module, mounted into the tabs chrome's no-drag actions
          host so Electron includes it in the first native hit map. Extracted so the project
          route can mount the same cluster without the rail (see
          `EntryTopRightCluster`). */}
      <EntryTopRightCluster
        page={analyticsPage}
        context={context}
        billing={billing}
        balanceUsd={balanceUsd}
        leadingSlot={topRightSlot}
        updaterSlot={updaterSlot}
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
