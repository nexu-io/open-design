// Lovart-style left navigation rail for the entry view.
//
// Renders a narrow icon-only column. The first slot is the brand logo,
// followed by the primary destinations users expect to keep in reach:
// New project, home, projects, brand kit, automations, plugins,
// and plugin capabilities. Footer controls are reserved for lower-frequency
// support affordances such as the help launcher.
// Language switching and other account-scoped controls live behind the
// floating settings cog in the top-right corner of the main content.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { InviteDialog } from './InviteDialog';
import { CreateTeamDialog } from './CreateTeamDialog';
import { UpgradeTeamDialog } from './UpgradeTeamDialog';
import type { CreditsInfo } from './CreditsPanel';
import { PlanBadge, planBadgeTierForLabel } from './PlanBadge';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import { GITHUB_REPO_URL } from './useGithubStars';

const REPO_URL = 'https://github.com/nexu-io/open-design';
const GITHUB_HELP_URL = `${REPO_URL}/issues/new`;
const GITHUB_FEATURE_URL = `${REPO_URL}/pulls`;
const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
const X_URL = 'https://x.com/OpenDesignHQ';
const externalLinkProps = { target: '_blank', rel: 'noreferrer noopener' } as const;

export type EntryView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'community'
  | 'drafts'
  | 'all-projects'
  | 'content-plan'
  | 'members'
  | 'dashboard'
  | 'workspace-settings'
  | 'design-systems'
  | 'library'
  | 'brands'
  | 'integrations'
  | 'settings';

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  onNewProject: () => void;
  /** When false the rail is collapsed (hidden off-canvas) on the entry view. */
  open: boolean;
  /** Collapse the rail — called after a destination is chosen or the user dismisses it. */
  onClose: () => void;
  /** Extra controls pinned to the bottom-left of the rail (GitHub star, Discord,
   *  Use-everywhere, settings) — moved out of the top bar so content rises. */
  footerExtra?: ReactNode;
  footerNotice?: ReactNode;
  /** Solo plan (免费版 / 个人版): only one team, no other workspaces, and
   *  inviting collaborators routes through the upgrade flow. */
  solo?: boolean;
  /** Credits popover data + upgrade handler for the ✨ credits chip. */
  credits?: CreditsInfo;
  onUpgrade?: () => void;
  onOpenSettings?: () => void;
  canManageWorkspace?: boolean;
  canOwnWorkspace?: boolean;
  cloudWorkspace?: boolean;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}

function NavButton({ active, ariaLabel, tooltip, onClick, testId, children }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="entry-nav-rail__btn-icon" aria-hidden>{children}</span>
      <span className="entry-nav-rail__btn-label">{tooltip}</span>
    </button>
  );
}

export function EntryNavRail({ view, onViewChange, onNewProject, open, onClose, footerExtra, footerNotice, solo = false, credits, onUpgrade, onOpenSettings, canManageWorkspace = true, canOwnWorkspace = true, cloudWorkspace = true }: Props) {
  const t = useT();
  const brandLabel = t('app.brand');
  const homeLabel = t('entry.navHome');
  const isHome = view === 'home';
  const [accountOpen, setAccountOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Hover-open for the account menu. The popover floats 4px above the
  // trigger, so closing is delayed just long enough for the pointer to cross
  // that gap; entering the container (menu included — it's a DOM child even
  // though it renders above) cancels the pending close.
  const accountCloseTimer = useRef<number | null>(null);
  const cancelAccountClose = () => {
    if (accountCloseTimer.current !== null) {
      window.clearTimeout(accountCloseTimer.current);
      accountCloseTimer.current = null;
    }
  };
  const openAccountMenu = () => {
    cancelAccountClose();
    setAccountOpen(true);
  };
  const scheduleAccountClose = () => {
    cancelAccountClose();
    accountCloseTimer.current = window.setTimeout(() => setAccountOpen(false), 220);
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

  // Once opened the rail stays docked (Manus-style); navigating between
  // destinations no longer collapses it.
  const selectView = (next: EntryView) => {
    onViewChange(next);
  };

  // While collapsed the rail is visually hidden but its logo + nav buttons
  // stay mounted. Mark the whole rail `inert` so those controls leave the
  // keyboard tab order and pointer flow entirely — otherwise a fresh Tab on
  // the home screen would land on invisible rail controls before the visible
  // toggle/hero. `inert` is set imperatively to stay compatible across React
  // versions whose JSX types don't yet declare the attribute.
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

  const planTier = credits ? planBadgeTierForLabel(credits.tierLabel) : null;
  const accountSwitcher = cloudWorkspace ? (
    <div
      ref={accountContainerRef}
      className="entry-nav-rail__account"
      onMouseEnter={cancelAccountClose}
      onMouseLeave={scheduleAccountClose}
    >
      <button
        type="button"
        className="entry-nav-rail__account-trigger"
        onClick={() => setAccountOpen((v) => !v)}
        onMouseEnter={openAccountMenu}
        aria-expanded={accountOpen}
      >
        <span className="entry-nav-rail__account-avatar" aria-hidden>琼</span>
        <span className="entry-nav-rail__account-name">琼羽</span>
        {planTier ? <PlanBadge tier={planTier} height={17} /> : <Icon name="chevron-down" size={14} />}
      </button>
      {accountOpen ? (
        <>
          <div className="entry-nav-rail__account-menu" role="menu">
            <div className="entry-nav-rail__account-head">
              <span className="entry-nav-rail__account-head-avatar" aria-hidden>琼</span>
              <span className="entry-nav-rail__account-head-name">琼羽</span>
              <span className="entry-nav-rail__account-head-email">qiongyu1999@gmail.com</span>
            </div>
            {credits ? (
              <div className="entry-nav-rail__menu-credits">
                <div className="entry-nav-rail__menu-credits-head">
                  <span className="entry-nav-rail__menu-credits-plan">
                    {credits.planName}
                    {planTier ? <PlanBadge tier={planTier} height={11} /> : null}
                  </span>
                  {credits.showUpgrade ? (
                    <button
                      type="button"
                      className="entry-nav-rail__menu-credits-upgrade"
                      onClick={() => {
                        setAccountOpen(false);
                        onUpgrade?.();
                      }}
                    >
                      升级
                    </button>
                  ) : null}
                </div>
                <div className="entry-nav-rail__menu-credits-row">
                  <span className="entry-nav-rail__menu-credits-label">
                    <Icon name="battery-charge" size={14} /> 积分
                  </span>
                  <span className="entry-nav-rail__menu-credits-value">
                    {credits.balance.toLocaleString('en-US')}
                    <Icon name="chevron-right" size={13} />
                  </span>
                </div>
                <div className="entry-nav-rail__menu-credits-row">
                  <span className="entry-nav-rail__menu-credits-label">
                    <Icon name="battery-charge" size={14} /> 附加积分
                  </span>
                  <span className="entry-nav-rail__menu-credits-value">0</span>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="entry-nav-rail__menu-item"
              role="menuitem"
              onClick={() => {
                setAccountOpen(false);
                onOpenSettings?.();
              }}
            >
              <Icon name="settings" size={15} /> 设置
            </button>
            <a
              className="entry-nav-rail__menu-item"
              role="menuitem"
              href={GITHUB_HELP_URL}
              {...externalLinkProps}
              onClick={() => setAccountOpen(false)}
            >
              <Icon name="comment" size={15} /> 在 GitHub 上获取帮助
            </a>
            <a
              className="entry-nav-rail__menu-item"
              role="menuitem"
              href={GITHUB_FEATURE_URL}
              {...externalLinkProps}
              onClick={() => setAccountOpen(false)}
            >
              <Icon name="sparkles" size={15} /> 提交功能建议
            </a>
            <div className="entry-nav-rail__menu-social">
              <a
                className="entry-nav-rail__menu-social-btn"
                role="menuitem"
                href={GITHUB_REPO_URL}
                {...externalLinkProps}
                aria-label="GitHub"
                title="GitHub"
                onClick={() => setAccountOpen(false)}
              >
                <Icon name="github-filled" size={15} />
              </a>
              <a
                className="entry-nav-rail__menu-social-btn"
                role="menuitem"
                href={DISCORD_URL}
                {...externalLinkProps}
                aria-label="加入 Discord"
                title="加入 Discord"
                onClick={() => setAccountOpen(false)}
              >
                <Icon name="discord" size={15} />
              </a>
              <a
                className="entry-nav-rail__menu-social-btn"
                role="menuitem"
                href={X_URL}
                {...externalLinkProps}
                aria-label="@OpenDesignHQ"
                title="@OpenDesignHQ"
                onClick={() => setAccountOpen(false)}
              >
                <span className="entry-nav-rail__menu-x" aria-hidden>X</span>
              </a>
            </div>
            <div className="entry-nav-rail__menu-divider" />
            <button type="button" className="entry-nav-rail__menu-item" role="menuitem">
              <Icon name="plus" size={15} /> 添加账号
            </button>
            <button type="button" className="entry-nav-rail__menu-item" role="menuitem">
              <Icon name="log-out" size={15} /> 退出登录
            </button>
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <nav
      ref={railRef}
      className={`entry-nav-rail${open ? ' is-open' : ''}`}
      aria-label="Primary"
      aria-hidden={open ? undefined : true}
    >
      {/* Squircle (superellipse) clip for the account avatars, normalized to
          the bounding box so one definition serves every avatar size. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
        <defs>
          <clipPath id="od-avatar-squircle" clipPathUnits="objectBoundingBox">
            <path d="M0.5,0 C0.93385,0 1,0.06615 1,0.5 C1,0.93385 0.93385,1 0.5,1 C0.06615,1 0,0.93385 0,0.5 C0,0.06615 0.06615,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>
      <div className="entry-nav-rail__panel">
      <div className="entry-nav-rail__group">
        <div className="entry-nav-rail__search-row">
          <div className="entry-nav-rail__search" aria-hidden>
            <Icon name="search" size={14} />
            <input type="text" placeholder={t('common.search')} readOnly tabIndex={-1} />
          </div>
        </div>
        <NavButton
          active={isHome}
          ariaLabel="Recents"
          tooltip="最近"
          onClick={() => selectView('home')}
          testId="entry-nav-home"
        >
          <Icon name="file-history-filled" size={18} />
        </NavButton>
        <NavButton
          active={view === 'community'}
          ariaLabel={t('pluginsHome.title')}
          tooltip="Community"
          onClick={() => selectView('community')}
          testId="entry-nav-community"
        >
          <Icon name="globe-filled" size={18} />
        </NavButton>

        {cloudWorkspace ? (
          <div className="entry-nav-rail__team-section">
            <div className="entry-nav-rail__team-wrap">
              <button
                type="button"
                className="entry-nav-rail__team"
                onClick={() => setTeamOpen((v) => !v)}
                aria-expanded={teamOpen}
              >
                <span className="entry-nav-rail__team-avatar" aria-hidden>
                  <img src="/logo.png" alt="" />
                </span>
                <span className="entry-nav-rail__team-name">Nexu 团队</span>
                <Icon name="chevron-down" size={14} />
              </button>
              {teamOpen ? (
                <>
                  <div className="entry-nav-rail__menu-backdrop" onClick={() => setTeamOpen(false)} />
                  <div className="entry-nav-rail__team-menu" role="menu">
                    {solo ? null : (
                      <button type="button" className="entry-nav-rail__menu-item" role="menuitem">
                        <span className="entry-nav-rail__team-avatar entry-nav-rail__team-avatar--alt" aria-hidden>R</span>
                        Refly
                      </button>
                    )}
                    <button type="button" className="entry-nav-rail__menu-item is-current" role="menuitem">
                      <span className="entry-nav-rail__team-avatar" aria-hidden>N</span>
                      Nexu 团队
                      <Icon name="check" size={14} />
                    </button>
                    <div className="entry-nav-rail__menu-divider" />
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item"
                      role="menuitem"
                      onClick={() => {
                        setTeamOpen(false);
                        setInviteOpen(true);
                      }}
                    >
                      <Icon name="share" size={15} /> 邀请同事
                    </button>
                    <button
                      type="button"
                      className="entry-nav-rail__menu-item"
                      role="menuitem"
                      onClick={() => {
                        setTeamOpen(false);
                        setCreateTeamOpen(true);
                      }}
                    >
                      <Icon name="plus" size={15} /> 新建团队
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            <NavButton
              active={view === 'drafts'}
              ariaLabel="Drafts"
              tooltip="草稿"
              onClick={() => selectView('drafts')}
              testId="entry-nav-drafts"
            >
              <Icon name="file-filled" size={18} />
            </NavButton>
            <NavButton
              active={view === 'all-projects'}
              ariaLabel="All projects"
              tooltip="全部项目"
              onClick={() => selectView('all-projects')}
              testId="entry-nav-all-projects"
            >
              <Icon name="grid-filled" size={18} />
            </NavButton>
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              tooltip={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette-filled" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navPlugins')}
              tooltip={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid-filled" size={18} />
            </NavButton>
            {canManageWorkspace ? (
              <>
                <NavButton
                  active={view === 'members'}
                  ariaLabel="成员"
                  tooltip="成员"
                  onClick={() => selectView('members')}
                  testId="entry-nav-members"
                >
                  <Icon name="share-filled" size={18} />
                </NavButton>
                <NavButton
                  active={view === 'dashboard'}
                  ariaLabel="数据大盘"
                  tooltip="数据大盘"
                  onClick={() => selectView('dashboard')}
                  testId="entry-nav-dashboard"
                >
                  <Icon name="dashboard-filled" size={18} />
                </NavButton>
                {canOwnWorkspace ? (
                  <NavButton
                    active={view === 'workspace-settings'}
                    ariaLabel="Workspace 设置"
                    tooltip="Workspace 设置"
                    onClick={() => selectView('workspace-settings')}
                    testId="entry-nav-workspace-settings"
                  >
                    <Icon name="settings-filled" size={18} />
                  </NavButton>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {!cloudWorkspace ? (
          <>
            <div className="entry-nav-rail__section-divider" aria-hidden />
            <NavButton
              active={view === 'design-systems'}
              ariaLabel={t('entry.navDesignSystems')}
              tooltip={t('entry.navDesignSystems')}
              onClick={() => selectView('design-systems')}
              testId="entry-nav-design-systems"
            >
              <Icon name="palette-filled" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navPlugins')}
              tooltip={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid-filled" size={18} />
            </NavButton>
          </>
        ) : null}
      </div>
      <div className="entry-nav-rail__footer">
        {footerNotice}
        <div className="entry-rail-actions">
          {footerExtra}
        </div>
        {accountSwitcher}
      </div>
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        freePlan={solo}
        onSubmit={() => { if (solo) setUpgradeOpen(true); }}
      />
      <CreateTeamDialog open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} />
      <UpgradeTeamDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </nav>
  );
}
