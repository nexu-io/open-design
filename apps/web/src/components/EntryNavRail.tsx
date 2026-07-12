// Team-edition entry navigation rail (Lovart/Manus-style labeled column).
//
// Structure — faithfully ported from the design demo
// (origin/demo/workspace-team-features) but wired to the REAL workspace context
// (`GET /api/workspace/context`, shared via `useWorkspaceContext`), never the
// demo's hardcoded 琼羽 / Refly / 800 placeholders:
//
//   • Account section (top) — real `context.displayName` + an account menu
//     (theme / language / settings / GitHub help / feature request / sign out).
//     Falls back to the brand logo when there is no cloud identity
//     (context === null).
//   • Credits chip — real plan tier + balance when A's vela CLI billing summary
//     is available, with upgrade linking out to Vela Web.
//   • Search box (readonly, decorative).
//   • 最近 (Recents) → home, Community → community.
//   • Team block (only when `context.workspaceType === 'team'`): an inline team
//     switcher + the team destinations. In-client views: drafts / all projects /
//     design systems / 扩展 (plugins). Member management lives in B's vela/web
//     console, so 成员 / 数据大盘 / Workspace 设置 link OUT to it (target=_blank),
//     derived from `context.workspaceSettingsUrl`.
//
// The gate is `workspaceType` + permissions, never the billing/provider axis — a
// personal_byok workspace still has full team features.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { Icon } from './Icon';
import { InviteDialog } from './InviteDialog';
import { CreditsPanel } from './CreditsPanel';
import { LOCALE_LABEL, LOCALES, useI18n } from '../i18n';
import { notifyWorkspaceBillingRefresh } from '../collab/useWorkspaceContext';
import type { EntryHomeView } from '../router';

const REPO_URL = 'https://github.com/nexu-io/open-design';
const GITHUB_HELP_URL = `${REPO_URL}/issues/new`;
const GITHUB_FEATURE_URL = `${REPO_URL}/pulls`;
const externalLinkProps = { target: '_blank', rel: 'noreferrer noopener' } as const;

// The rail's destination ids are the entry-shell home views (kept in sync with
// the router so `navigate({ kind: 'home', view })` type-checks for every item).
export type EntryView = EntryHomeView;

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  onNewProject: () => void;
  newProjectDisabled?: boolean;
  /** When false the rail is collapsed (hidden off-canvas) on the entry view. */
  open: boolean;
  /** Collapse the rail — called when the user dismisses it (topbar toggle). */
  onClose: () => void;
  /** The one shared workspace context; null → local (no cloud identity) state. */
  context: WorkspaceCollabContext | null;
  /** Real billing summary (A-lane, via the vela CLI 收口). Null → the credits
   *  chip falls back to the context plan-tier hint with no balance. */
  billing?: WorkspaceBillingSummary | null;
  /** Open the app settings dialog. */
  onOpenSettings?: () => void;
  /** Flip the effective theme (light ⇄ dark). Omitted → the theme item is hidden. */
  onToggleTheme?: () => void;
  /** Open the members / invite slot (B's InviteDialog). */
  onInvite?: () => void;
  /** Start the cloud sign-in / team flow from the local-state callout. */
  onSignInCloud?: () => void;
  /** Extra controls pinned to the bottom-left of the rail. */
  footerExtra?: ReactNode;
  /** Optional notice shown above the footer controls. */
  footerNotice?: ReactNode;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: ReactNode;
}

function NavButton({ active, ariaLabel, tooltip, onClick, disabled, testId, children }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-tooltip={tooltip}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="entry-nav-rail__btn-icon" aria-hidden>{children}</span>
      <span className="entry-nav-rail__btn-label">{tooltip}</span>
    </button>
  );
}

// Team management (members, dashboard, settings) lives in B's vela/web console,
// not the local client. We link out to it, deriving the section path from the one
// workspace-settings URL the context carries. Best-effort: swap/append the section
// segment, falling back to the raw settings URL when the path can't be rewritten.
function teamConsoleUrl(base: string, section: 'members' | 'dashboard' | 'settings' | 'billing'): string {
  try {
    const url = new URL(base);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0 && segments[segments.length - 1] === 'settings') {
      segments[segments.length - 1] = section;
    } else {
      segments.push(section);
    }
    url.pathname = `/${segments.join('/')}`;
    return url.toString();
  } catch {
    return base;
  }
}

/** Map a raw vela membership tier to a display label for the credits chip. */
function formatBillingTier(tier: string, t: ReturnType<typeof useI18n>['t']): string {
  switch (tier) {
    case 'team':
      return t('entry.billingTierTeam');
    case 'free':
      return t('entry.billingTierFree');
    case 'pro':
      return t('entry.billingTierPro');
    default:
      return tier;
  }
}

export function EntryNavRail({
  view,
  onViewChange,
  onNewProject,
  newProjectDisabled,
  open,
  context,
  billing,
  onOpenSettings,
  onToggleTheme,
  footerExtra,
  footerNotice,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const brandLabel = t('app.brand');
  const communityLabel = t('pluginsHome.title');
  const isHome = view === 'home';

  const isTeam = Boolean(context) && context!.workspaceType === 'team';
  const permissions = context?.permissions;
  // Demo `canManageWorkspace` → real `canManageMembers`; demo `canOwnWorkspace` →
  // real owner-level view of workspace settings. Never re-derive from role — the
  // permission bits already fold role + lifecycle in.
  const canManageMembers = Boolean(permissions?.canManageMembers);
  const canViewWorkspaceSettings = Boolean(permissions?.canViewWorkspaceSettings);
  const canInviteMembers = Boolean(permissions?.canInviteMembers);
  const workspaceSettingsUrl = context?.workspaceSettingsUrl?.trim() || null;

  // Account identity (real). No email field on the context → the head shows the
  // avatar + name only.
  const displayName = context?.displayName?.trim() || '';
  const accountName = displayName || brandLabel;
  const accountInitial = accountName.charAt(0).toUpperCase() || '·';

  // Team identity (real).
  const teamName = context?.teamName?.trim() || context?.teamId || '';
  const teamInitial = teamName.charAt(0).toUpperCase() || 'T';

  // Credits chip: prefer the real billing summary (A-lane, via the vela CLI
  // 收口); fall back to the context plan-tier hint with no balance when billing
  // hasn't loaded / no session.
  const tierLabel = billing?.membershipTier
    ? formatBillingTier(billing.membershipTier, t)
    : context?.planId?.trim() || (isTeam ? t('entry.billingTierTeam') : t('entry.billingTierFree'));
  const creditsBalance = billing ? billing.totalAvailableCredits : null;

  const [accountOpen, setAccountOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const billingUpgradeUrl =
    context?.billingRecovery?.recoveryUrl?.trim() ||
    (workspaceSettingsUrl ? teamConsoleUrl(workspaceSettingsUrl, 'billing') : null);
  // Product decision: plan selection / payment lives in Vela Web. The local
  // client opens that billing surface, then refreshes `/api/workspace/billing`
  // when focus returns so direct web upgrades sync back into the credits chip.
  const canUpgrade = Boolean(billingUpgradeUrl && permissions?.canManageBilling);
  const currentLanguageLabel = LOCALE_LABEL[locale];

  function openBillingUpgrade() {
    if (!billingUpgradeUrl) return;
    setCreditsOpen(false);
    window.open(billingUpgradeUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => notifyWorkspaceBillingRefresh(), 3000);
  }

  const selectView = (next: EntryView) => {
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
    if (!accountOpen) setLanguageOpen(false);
  }, [accountOpen]);

  return (
    <nav
      ref={railRef}
      className={`entry-nav-rail${open ? ' is-open' : ''}`}
      aria-label={t('entry.primaryNavAria')}
      aria-hidden={open ? undefined : true}
    >
      <div className="entry-nav-rail__group">
        {context ? (
          <div className="entry-nav-rail__account">
            <button
              type="button"
              className="entry-nav-rail__account-trigger"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              data-testid="entry-nav-account"
            >
              <span className="entry-nav-rail__account-avatar" aria-hidden>{accountInitial}</span>
              <span className="entry-nav-rail__account-name">{accountName}</span>
              <Icon name="chevron-down" size={14} />
            </button>
            <button
              type="button"
              className="entry-nav-rail__credits-chip"
              onClick={() => setCreditsOpen((v) => !v)}
              aria-expanded={creditsOpen}
              aria-label={
                creditsBalance != null
                  ? t('entry.creditsAriaWithBalance', { tier: tierLabel, balance: creditsBalance.toLocaleString(locale) })
                  : t('entry.creditsAria', { tier: tierLabel })
              }
              data-testid="entry-nav-credits"
            >
              <span className="entry-nav-rail__credits-tier">{tierLabel}</span>
              <span className="entry-nav-rail__credits-sep" aria-hidden>·</span>
              <Icon name="sparkles" size={12} />
              {creditsBalance != null ? creditsBalance.toLocaleString('en-US') : <span aria-hidden>—</span>}
            </button>
            <CreditsPanel
              open={creditsOpen}
              onClose={() => setCreditsOpen(false)}
              info={{
                planName: tierLabel,
                tierLabel,
                showUpgrade: canUpgrade,
                balance: creditsBalance,
                grantTip: t('entry.creditsGrantTip'),
              }}
              onUpgrade={() => {
                openBillingUpgrade();
              }}
              memberCreditNotice={isTeam && !canManageMembers}
            />
            {accountOpen ? (
              <>
                <div className="entry-nav-rail__menu-backdrop" onClick={() => setAccountOpen(false)} />
                <div className="entry-nav-rail__account-menu" role="menu">
                  <div className="entry-nav-rail__account-head">
                    <span className="entry-nav-rail__account-head-avatar" aria-hidden>{accountInitial}</span>
                    <span className="entry-nav-rail__account-head-name">{accountName}</span>
                  </div>
                  {onToggleTheme ? (
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item is-primary"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onToggleTheme();
                      }}
                    >
                      <Icon name="layout" size={15} /> {t('entry.accountToggleTheme')}
                      <span className="entry-nav-rail__menu-chevron"><Icon name="chevron-right" size={13} /></span>
                    </button>
                  ) : null}
                  <div
                    className="entry-nav-rail__language-wrap"
                    onMouseEnter={() => setLanguageOpen(true)}
                    onMouseLeave={() => setLanguageOpen(false)}
                  >
                    <button
                      type="button"
                      className={`entry-nav-rail__menu-item${languageOpen ? ' is-open' : ''}`}
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={languageOpen}
                      onClick={() => setLanguageOpen((value) => !value)}
                      onFocus={() => setLanguageOpen(true)}
                    >
                      <Icon name="languages" size={15} />
                      {t('entry.accountSwitchLanguage')}
                      <span className="entry-nav-rail__menu-meta">{currentLanguageLabel}</span>
                      <span className="entry-nav-rail__menu-chevron">
                        <Icon name="chevron-right" size={13} />
                      </span>
                    </button>
                    {languageOpen ? (
                      <div
                        className="entry-nav-rail__language-menu"
                        role="menu"
                        aria-label={t('entry.accountSwitchLanguage')}
                      >
                        {LOCALES.map((code) => {
                          const active = locale === code;
                          return (
                            <button
                              key={code}
                              type="button"
                              className={`entry-nav-rail__language-option${active ? ' is-active' : ''}`}
                              role="menuitemradio"
                              aria-checked={active}
                              onClick={() => {
                                setLocale(code);
                                setLanguageOpen(false);
                                setAccountOpen(false);
                              }}
                            >
                              <span>{LOCALE_LABEL[code]}</span>
                              <span className="entry-nav-rail__language-code">{code}</span>
                              {active ? <Icon name="check" size={13} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="entry-nav-rail__menu-item"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenSettings?.();
                    }}
                  >
                    <Icon name="settings" size={15} /> {t('settings.title')}
                  </button>
                  <div className="entry-nav-rail__menu-divider" />
                  <a
                    className="entry-nav-rail__menu-item"
                    role="menuitem"
                    href={GITHUB_HELP_URL}
                    {...externalLinkProps}
                    onClick={() => setAccountOpen(false)}
                  >
                    <Icon name="comment" size={15} /> {t('entry.accountGithubHelp')}
                  </a>
                  <a
                    className="entry-nav-rail__menu-item"
                    role="menuitem"
                    href={GITHUB_FEATURE_URL}
                    {...externalLinkProps}
                    onClick={() => setAccountOpen(false)}
                  >
                    <Icon name="sparkles" size={15} /> {t('entry.accountFeatureRequest')}
                  </a>
                  <div className="entry-nav-rail__menu-divider" />
                  <button
                    type="button"
                    className="entry-nav-rail__menu-item"
                    role="menuitem"
                    onClick={() => {
                      // TODO(collab): sign-out via vela CLI 收口
                      setAccountOpen(false);
                    }}
                  >
                    <Icon name="log-out" size={15} /> {t('entry.accountSignOut')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="entry-nav-rail__local-logo"
            onClick={() => selectView('home')}
            aria-label={brandLabel}
            data-testid="entry-nav-logo"
          >
            <img src="/brand-icon.svg" alt="" aria-hidden draggable={false} />
          </button>
        )}

        <div className="entry-nav-rail__search" aria-hidden>
          <Icon name="search" size={14} />
          <input type="text" placeholder={t('common.search')} readOnly tabIndex={-1} />
        </div>

        <NavButton
          ariaLabel={t('entry.navNewProject')}
          tooltip={t('entry.navNewProject')}
          onClick={onNewProject}
          disabled={newProjectDisabled}
          testId="entry-nav-new-project"
        >
          <Icon name="plus" size={18} />
        </NavButton>
        <NavButton
          active={isHome}
          ariaLabel={t('entry.navRecents')}
          tooltip={t('entry.navRecents')}
          onClick={() => selectView('home')}
          testId="entry-nav-home"
        >
          <Icon name="history" size={18} />
        </NavButton>
        <NavButton
          active={view === 'community'}
          ariaLabel={communityLabel}
          tooltip="Community"
          onClick={() => selectView('community')}
          testId="entry-nav-community"
        >
          <Icon name="globe" size={18} />
        </NavButton>

        {isTeam ? (
          <>
            <div className="entry-nav-rail__team-wrap">
              <button
                type="button"
                className="entry-nav-rail__team"
                onClick={() => setTeamOpen((v) => !v)}
                aria-expanded={teamOpen}
                data-testid="workspace-switcher"
              >
                <span className="entry-nav-rail__team-avatar" aria-hidden>{teamInitial}</span>
                <span className="entry-nav-rail__team-name">{teamName}</span>
                <Icon name="chevron-down" size={14} />
              </button>
              {teamOpen ? (
                <>
                  <div className="entry-nav-rail__menu-backdrop" onClick={() => setTeamOpen(false)} />
                  <div className="entry-nav-rail__team-menu" role="menu">
                    <button type="button" className="entry-nav-rail__menu-item is-current" role="menuitem" disabled>
                      <span className="entry-nav-rail__team-avatar" aria-hidden>{teamInitial}</span>
                      {teamName}
                      <Icon name="check" size={14} />
                    </button>
                    <div className="entry-nav-rail__menu-divider" />
                    {canInviteMembers ? (
                      <button
                        type="button"
                        className="entry-nav-rail__menu-item"
                        role="menuitem"
                        onClick={() => {
                          setTeamOpen(false);
                          setInviteOpen(true);
                        }}
                      >
                        <Icon name="share" size={15} /> {t('workspaceSwitcher.invite')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item"
                      role="menuitem"
                      onClick={() => {
                        // TODO(collab): create-team is a B vela/web flow via vela CLI 收口
                        setTeamOpen(false);
                      }}
                    >
                      <Icon name="plus" size={15} /> {t('workspaceSwitcher.createTeam')}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            <NavButton
              active={view === 'drafts'}
              ariaLabel={t('entry.navDrafts')}
              tooltip={t('workspaceSwitcher.draftsTooltip')}
              onClick={() => selectView('drafts')}
              testId="entry-nav-drafts"
            >
              <Icon name="file" size={18} />
            </NavButton>
            <NavButton
              active={view === 'all-projects'}
              ariaLabel={t('entry.navAllProjects')}
              tooltip={t('workspaceSwitcher.allProjectsTooltip')}
              onClick={() => selectView('all-projects')}
              testId="entry-nav-all-projects"
            >
              <Icon name="grid" size={18} />
            </NavButton>
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              tooltip={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navExtensions')}
              tooltip={t('entry.navExtensions')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid" size={18} />
            </NavButton>
            {/* Member management (成员 / 数据大盘 / Workspace 设置) lives in B's
                vela/web console — link OUT, don't route to in-client views. */}
            {canManageMembers && workspaceSettingsUrl ? (
              <a
                className="entry-nav-rail__btn"
                href={teamConsoleUrl(workspaceSettingsUrl, 'members')}
                {...externalLinkProps}
                aria-label={t('entry.navMembers')}
                data-tooltip={t('entry.navMembers')}
                data-testid="entry-nav-members"
              >
                <span className="entry-nav-rail__btn-icon" aria-hidden>
                  <Icon name="users" size={18} />
                </span>
                <span className="entry-nav-rail__btn-label">{t('entry.navMembers')}</span>
              </a>
            ) : null}
            {canManageMembers && workspaceSettingsUrl ? (
              <a
                className="entry-nav-rail__btn"
                href={teamConsoleUrl(workspaceSettingsUrl, 'dashboard')}
                {...externalLinkProps}
                aria-label={t('entry.navDashboard')}
                data-tooltip={t('entry.navDashboard')}
                data-testid="entry-nav-dashboard"
              >
                <span className="entry-nav-rail__btn-icon" aria-hidden>
                  <Icon name="kanban" size={18} />
                </span>
                <span className="entry-nav-rail__btn-label">{t('entry.navDashboard')}</span>
              </a>
            ) : null}
            {canViewWorkspaceSettings && workspaceSettingsUrl ? (
              <a
                className="entry-nav-rail__btn"
                href={workspaceSettingsUrl}
                {...externalLinkProps}
                aria-label={t('entry.navWorkspaceSettings')}
                data-tooltip={t('entry.navWorkspaceSettings')}
                data-testid="entry-nav-workspace-settings"
              >
                <span className="entry-nav-rail__btn-icon" aria-hidden>
                  <Icon name="settings" size={18} />
                </span>
                <span className="entry-nav-rail__btn-label">{t('entry.navWorkspaceSettings')}</span>
              </a>
            ) : null}
          </>
        ) : context ? (
          <>
            <div className="entry-nav-rail__section-divider" aria-hidden />
            <NavButton
              active={view === 'projects'}
              ariaLabel={t('entry.navProjects')}
              tooltip={t('entry.navProjects')}
              onClick={() => selectView('projects')}
              testId="entry-nav-projects"
            >
              <Icon name="folder" size={18} />
            </NavButton>
            <NavButton
              active={view === 'tasks'}
              ariaLabel={t('entry.navTasks')}
              tooltip={t('entry.navTasks')}
              onClick={() => selectView('tasks')}
              testId="entry-nav-tasks"
            >
              <Icon name="kanban" size={18} />
            </NavButton>
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              tooltip={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navExtensions')}
              tooltip={t('entry.navExtensions')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid" size={18} />
            </NavButton>
            <NavButton
              active={view === 'integrations'}
              ariaLabel={t('entry.navIntegrations')}
              tooltip={t('entry.navIntegrations')}
              onClick={() => selectView('integrations')}
              testId="entry-nav-integrations"
            >
              <Icon name="integrations-filled" size={18} />
            </NavButton>
          </>
        ) : (
          <>
            <div className="entry-nav-rail__section-divider" aria-hidden />
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              tooltip={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navExtensions')}
              tooltip={t('entry.navExtensions')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid" size={18} />
            </NavButton>
          </>
        )}
      </div>
      <div className="entry-nav-rail__footer">
        {footerNotice}
        <div className="entry-rail-actions">
          {footerExtra}
        </div>
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </nav>
  );
}
