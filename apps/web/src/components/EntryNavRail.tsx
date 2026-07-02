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
import { CreditsPanel, type CreditsInfo } from './CreditsPanel';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';

const REPO_URL = 'https://github.com/nexu-io/open-design';
const GITHUB_HELP_URL = `${REPO_URL}/issues/new`;
const GITHUB_FEATURE_URL = `${REPO_URL}/pulls`;
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
  workspaceExpired?: boolean;
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

export function EntryNavRail({ view, onViewChange, onNewProject, open, onClose, footerExtra, footerNotice, solo = false, credits, onUpgrade, onOpenSettings, canManageWorkspace = true, canOwnWorkspace = true, cloudWorkspace = true, workspaceExpired = false }: Props) {
  const t = useT();
  const brandLabel = t('app.brand');
  const homeLabel = t('entry.navHome');
  const isHome = view === 'home';
  const [accountOpen, setAccountOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [workspaceLockedOpen, setWorkspaceLockedOpen] = useState(false);
  const workspaceAccessBlocked = workspaceExpired && !canOwnWorkspace;

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

  return (
    <nav
      ref={railRef}
      className={`entry-nav-rail${open ? ' is-open' : ''}`}
      aria-label="Primary"
      aria-hidden={open ? undefined : true}
    >
      <div className="entry-nav-rail__group">
        {cloudWorkspace ? (
          <div className="entry-nav-rail__account">
            <button
              type="button"
              className="entry-nav-rail__account-trigger"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
            >
              <span className="entry-nav-rail__account-avatar" aria-hidden>琼</span>
              <span className="entry-nav-rail__account-name">琼羽</span>
              <Icon name="chevron-down" size={14} />
            </button>
            {credits ? (
              <button
                type="button"
                className="entry-nav-rail__credits-chip"
                onClick={() => setCreditsOpen((v) => !v)}
                aria-expanded={creditsOpen}
                aria-label={`${credits.tierLabel} · 剩余积分 ${credits.balance}`}
              >
                <span className="entry-nav-rail__credits-tier">{credits.tierLabel}</span>
                <span className="entry-nav-rail__credits-sep" aria-hidden>·</span>
                <Icon name="sparkles" size={12} />
                {credits.balance.toLocaleString('en-US')}
              </button>
            ) : null}
            {credits ? (
              <CreditsPanel
                open={creditsOpen}
                onClose={() => setCreditsOpen(false)}
                info={credits}
                onUpgrade={() => {
                  setCreditsOpen(false);
                  onUpgrade?.();
                }}
                memberCreditNotice={cloudWorkspace && !canManageWorkspace}
              />
            ) : null}
            {accountOpen ? (
              <>
                <div className="entry-nav-rail__menu-backdrop" onClick={() => setAccountOpen(false)} />
                <div className="entry-nav-rail__account-menu" role="menu">
                  <div className="entry-nav-rail__account-head">
                    <span className="entry-nav-rail__account-head-avatar" aria-hidden>琼</span>
                    <span className="entry-nav-rail__account-head-name">琼羽</span>
                    <span className="entry-nav-rail__account-head-email">qiongyu1999@gmail.com</span>
                  </div>
                  <button type="button" className="entry-nav-rail__menu-item is-primary" role="menuitem">
                    <Icon name="layout" size={15} /> 切换主题 <span className="entry-nav-rail__menu-chevron"><Icon name="chevron-right" size={13} /></span>
                  </button>
                  <button type="button" className="entry-nav-rail__menu-item" role="menuitem">
                    <Icon name="languages" size={15} />
                    切换语言
                    <span className="entry-nav-rail__menu-meta">中文 / English</span>
                  </button>
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
                  <div className="entry-nav-rail__menu-divider" />
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
        ) : (
          <button
            type="button"
            className="entry-nav-rail__local-logo"
            onClick={() => selectView('home')}
            aria-label={brandLabel}
            data-testid="entry-local-logo"
          >
            <img src="/brand-icon.svg" alt="" aria-hidden />
          </button>
        )}
        <div className="entry-nav-rail__search" aria-hidden>
          <Icon name="search" size={14} />
          <input type="text" placeholder={t('common.search')} readOnly tabIndex={-1} />
        </div>
        <NavButton
          active={isHome}
          ariaLabel="Recents"
          tooltip="最近"
          onClick={() => selectView('home')}
          testId="entry-nav-home"
        >
          <Icon name="history" size={18} />
        </NavButton>
        <NavButton
          active={view === 'community'}
          ariaLabel={t('pluginsHome.title')}
          tooltip="Community"
          onClick={() => selectView('community')}
          testId="entry-nav-community"
        >
          <Icon name="globe" size={18} />
        </NavButton>

        {cloudWorkspace ? (
          <>
            <div className="entry-nav-rail__team-wrap">
              <button
                type="button"
                className={`entry-nav-rail__team${workspaceExpired ? ' is-expired' : ''}${workspaceAccessBlocked ? ' is-locked' : ''}`}
                onClick={() => {
                  if (workspaceAccessBlocked) {
                    setWorkspaceLockedOpen(true);
                    return;
                  }
                  setTeamOpen((v) => !v);
                }}
                aria-expanded={workspaceAccessBlocked ? workspaceLockedOpen : teamOpen}
                aria-haspopup={workspaceAccessBlocked ? 'dialog' : undefined}
                aria-label={workspaceAccessBlocked ? 'Nexu 团队已锁定，需 Owner 续费后恢复团队协作' : undefined}
                title={workspaceExpired ? '团队版已到期，需 Owner 续费后恢复团队协作' : undefined}
              >
                <span className="entry-nav-rail__team-avatar" aria-hidden>
                  <img src="/logo.png" alt="" />
                </span>
                <span className="entry-nav-rail__team-name">Nexu 团队</span>
                {workspaceExpired ? <Icon name="lock" size={13} /> : <Icon name="chevron-down" size={14} />}
              </button>
              {teamOpen && !workspaceAccessBlocked ? (
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
                      {workspaceExpired ? <span className="entry-nav-rail__team-plan">已降级</span> : null}
                      <Icon name={workspaceExpired ? 'lock' : 'check'} size={14} />
                    </button>
                    {!workspaceExpired ? (
                      <>
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
                      </>
                    ) : null}
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
              <Icon name="file" size={18} />
            </NavButton>
            <NavButton
              active={view === 'all-projects'}
              ariaLabel="All projects"
              tooltip="全部项目"
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
              ariaLabel={t('entry.navPlugins')}
              tooltip={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid" size={18} />
            </NavButton>
          </>
        ) : null}
{null /* demo: hide content-plan nav item */}
        {cloudWorkspace && canManageWorkspace ? (
          <>
            <NavButton
              active={view === 'members'}
              ariaLabel="成员"
              tooltip="成员"
              onClick={() => selectView('members')}
              testId="entry-nav-members"
            >
              <Icon name="share" size={18} />
            </NavButton>
            <NavButton
              active={view === 'dashboard'}
              ariaLabel="数据大盘"
              tooltip="数据大盘"
              onClick={() => selectView('dashboard')}
              testId="entry-nav-dashboard"
            >
              <Icon name="kanban" size={18} />
            </NavButton>
            {canOwnWorkspace ? (
              <NavButton
                active={view === 'workspace-settings'}
                ariaLabel="Workspace 设置"
                tooltip="Workspace 设置"
                onClick={() => selectView('workspace-settings')}
                testId="entry-nav-workspace-settings"
              >
                <Icon name="settings" size={18} />
              </NavButton>
            ) : null}
          </>
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
              <Icon name="palette" size={18} />
            </NavButton>
            <NavButton
              active={view === 'plugins'}
              ariaLabel={t('entry.navPlugins')}
              tooltip={t('entry.navPlugins')}
              onClick={() => selectView('plugins')}
              testId="entry-nav-plugins"
            >
              <Icon name="grid" size={18} />
            </NavButton>
          </>
        ) : null}
      </div>
      <div className="entry-nav-rail__footer">
        {footerNotice}
        <div className="entry-rail-actions">
          {footerExtra}
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
      {workspaceLockedOpen ? (
        <div className="entry-nav-rail__locked-modal-backdrop" role="presentation" onClick={() => setWorkspaceLockedOpen(false)}>
          <section
            className="entry-nav-rail__locked-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace 已锁定"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="entry-nav-rail__locked-icon" aria-hidden>
              <Icon name="lock" size={18} />
            </span>
            <div>
              <h2>Nexu 团队已到期</h2>
              <p>该 Workspace 已降级为 Owner 的个人 Workspace。必须由 Owner 完成续费充值后，团队成员才能恢复并重新进入。</p>
            </div>
            <button type="button" onClick={() => setWorkspaceLockedOpen(false)}>
              知道了
            </button>
          </section>
        </div>
      ) : null}
    </nav>
  );
}
