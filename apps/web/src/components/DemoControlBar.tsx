// Demo-only floating control bar.
// Renders globally (portal to document.body) so it's visible on every route,
// including the onboarding flow.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type DemoScenario =
  | 'home'
  | 'owner'
  | 'manager'
  | 'editor'
  | 'viewer'
  | 'onboarding-new'
  | 'invite-editor'
  | 'invite-editor-existing'
  | 'invite-editor-new'
  | 'invite-admin'
  | 'invite-viewer';

export function isInviteScenario(
  s: DemoScenario,
): s is Extract<DemoScenario, 'invite-editor' | 'invite-editor-existing' | 'invite-editor-new'> {
  return s === 'invite-editor' || s === 'invite-editor-existing' || s === 'invite-editor-new';
}

export function isViewerScenario(s: DemoScenario): boolean {
  return s === 'viewer' || s === 'invite-viewer';
}

export function canManageWorkspaceScenario(s: DemoScenario): boolean {
  return s === 'home' || s === 'owner' || s === 'manager' || s === 'invite-admin';
}

// Membership tier — an axis independent of the scenario. Free + the three
// personal tiers (Plus / Pro / Max) are single-seat (solo); team unlocks
// multi-seat collaboration. Upgrade paths: Plus → Pro/Max/Team, Pro → Max/Team,
// Max → Team (and Free → any paid tier).
export type DemoPlan = 'free' | 'plus' | 'pro' | 'max' | 'team';
export type DemoUseMode = 'cloud' | 'local';
export type DemoPage = 'home' | 'onboarding';
export type DemoWorkspaceLifecycle = 'active' | 'expired';

export function isSoloPlan(p: DemoPlan): boolean {
  return p !== 'team';
}

export type InviteRole = 'editor' | 'admin' | 'viewer';

interface Props {
  page: DemoPage;
  onPage: (page: DemoPage) => void;
  scenario: DemoScenario;
  onScenario: (s: DemoScenario) => void;
  plan: DemoPlan;
  onPlan: (p: DemoPlan) => void;
  workspaceLifecycle: DemoWorkspaceLifecycle;
  onWorkspaceLifecycle: (lifecycle: DemoWorkspaceLifecycle) => void;
  useMode: DemoUseMode;
  onUseMode: (mode: DemoUseMode) => void;
  /** Fires the "积分不足" upgrade/top-up flow. */
  onLowCredits: () => void;
  /** Opens the top-tier auto-recharge demo flow. */
  onAutoRecharge?: (scope: 'team' | 'member') => void;
  /** Launches the invitee acceptance flow (email link → join workspace). */
  onAcceptInvite: (role: InviteRole) => void;
  /** Demo-only collaboration hooks consumed by project pages when mounted. */
  onQueueDemo?: () => void;
  onEditDemo?: () => void;
}

const PAGE_CHIPS: Array<{ id: DemoPage; label: string }> = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'home', label: '主页' },
];

const SCENARIO_CHIPS: Array<{ id: DemoScenario; label: string }> = [
  { id: 'onboarding-new', label: '新用户注册（默认 owner）' },
];

const ROLE_CHIPS: Array<{ id: DemoScenario; label: string; invite?: boolean }> = [
  { id: 'invite-editor-existing', label: '接受邀请网页端', invite: true },
  { id: 'invite-editor-new', label: '接受邀请客户端未注册', invite: true },
];

const VIEW_CHIPS: Array<{ id: DemoScenario; label: string }> = [
  { id: 'owner', label: 'Owner' },
  { id: 'manager', label: 'Admin' },
  { id: 'editor', label: 'Member' },
];

const PLAN_CHIPS: Array<{ id: DemoPlan; label: string }> = [
  { id: 'free', label: 'free' },
  { id: 'plus', label: 'Plus' },
  { id: 'pro',  label: 'Pro' },
  { id: 'max',  label: 'Max' },
  { id: 'team', label: 'team' },
];

const WORKSPACE_LIFECYCLE_CHIPS: Array<{ id: DemoWorkspaceLifecycle; label: string; desc: string }> = [
  { id: 'active', label: '正常', desc: '团队版订阅有效，团队资产可进入和编辑' },
  { id: 'expired', label: '到期降级', desc: '有效期结束后降级为个人 Workspace，团队共享资产锁定' },
];

const USE_MODE_CHIPS: Array<{ id: DemoUseMode; label: string; desc: string }> = [
  { id: 'cloud', label: 'Cloud', desc: '云端协作' },
  { id: 'local', label: 'CLI / BYOK', desc: '本地或自带 Key' },
];

const DEMO_BAR_COLLAPSED_KEY = 'od.demoBar.collapsed';

function readCollapsedState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEMO_BAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedState(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEMO_BAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    /* ignore disabled storage */
  }
}

function labelForScenario(scenario: DemoScenario): string {
  return [...SCENARIO_CHIPS, ...ROLE_CHIPS, ...VIEW_CHIPS].find((chip) => chip.id === scenario)?.label ?? '主页';
}

function labelForPage(page: DemoPage): string {
  return PAGE_CHIPS.find((chip) => chip.id === page)?.label ?? '主页';
}

function labelForPlan(plan: DemoPlan): string {
  return PLAN_CHIPS.find((chip) => chip.id === plan)?.label ?? 'free';
}

function labelForWorkspaceLifecycle(lifecycle: DemoWorkspaceLifecycle): string {
  return WORKSPACE_LIFECYCLE_CHIPS.find((chip) => chip.id === lifecycle)?.label ?? '正常';
}

function labelForUseMode(useMode: DemoUseMode): string {
  return USE_MODE_CHIPS.find((chip) => chip.id === useMode)?.label ?? 'Cloud';
}

function Bar({ page, onPage, scenario, onScenario, plan, onPlan, workspaceLifecycle, onWorkspaceLifecycle, useMode, onUseMode, onLowCredits, onAutoRecharge, onAcceptInvite, onQueueDemo, onEditDemo }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const availablePlans = useMode === 'local'
    ? PLAN_CHIPS.filter((chip) => chip.id !== 'team')
    : PLAN_CHIPS;

  useEffect(() => {
    writeCollapsedState(collapsed);
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="demo-bar demo-bar--collapsed">
        <button
          type="button"
          className="demo-bar__summary"
          onClick={() => setCollapsed(false)}
          aria-label="展开 Demo Control"
          aria-expanded="false"
        >
          <span className="demo-bar__summary-dot" aria-hidden />
          <span className="demo-bar__summary-title">Control</span>
          <span className="demo-bar__summary-meta">{labelForPage(page)} · {labelForUseMode(useMode)} · {labelForPlan(plan)} · {labelForWorkspaceLifecycle(workspaceLifecycle)}</span>
          <span className="demo-bar__summary-caret" aria-hidden>⌃</span>
        </button>
      </div>
    );
  }
  return (
    <div className="demo-bar">
      <div className="demo-bar__handle">
        <span className="demo-bar__handle-title">Control</span>
        <button
          type="button"
          className="demo-bar__collapse"
          onClick={() => setCollapsed(true)}
          aria-label="收起 Demo Control"
          aria-expanded="true"
        >
          收起
        </button>
      </div>

      <div className="demo-bar__body">
        <div className="demo-bar__group">
          <span className="demo-bar__label">使用方式</span>
          <div className="demo-bar__chips">
            {USE_MODE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${useMode === c.id ? ' is-active' : ''}`}
                onClick={() => onUseMode(c.id)}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__group">
          <span className="demo-bar__label">页面</span>
          <div className="demo-bar__chips">
            {PAGE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${page === c.id ? ' is-active' : ''}`}
                onClick={() => onPage(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__group">
          <span className="demo-bar__label">视角</span>
          <div className="demo-bar__chips">
            {VIEW_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${
                  (scenario === 'home' && c.id === 'owner') || scenario === c.id
                    ? ' is-active'
                    : ''
                }`}
                onClick={() => onScenario(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__group demo-bar__group--scenario">
          <span className="demo-bar__label">路径</span>
          <div className="demo-bar__chips">
            {SCENARIO_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${scenario === c.id ? ' is-active' : ''}`}
                onClick={() => onScenario(c.id)}
              >
                {c.label}
              </button>
            ))}
            {ROLE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${scenario === c.id ? ' is-active' : ''}`}
                onClick={() => onScenario(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">版本</span>
          <div className="demo-bar__chips">
            {availablePlans.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${plan === c.id ? ' is-active' : ''}`}
                onClick={() => onPlan(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">Workspace 状态</span>
          <div className="demo-bar__chips">
            {WORKSPACE_LIFECYCLE_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`demo-bar__chip${workspaceLifecycle === c.id ? ' is-active' : ''}${c.id === 'expired' ? ' demo-bar__chip--warning' : ''}`}
                onClick={() => onWorkspaceLifecycle(c.id)}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">自动充值</span>
          <div className="demo-bar__chips">
            <button type="button" className="demo-bar__chip" onClick={() => onAutoRecharge?.('team')}>
              所有员工
            </button>
            <button type="button" className="demo-bar__chip" onClick={() => onAutoRecharge?.('member')}>
              单个员工
            </button>
          </div>
        </div>

        <div className="demo-bar__divider" />

        <div className="demo-bar__group">
          <span className="demo-bar__label">演示</span>
          <div className="demo-bar__chips">
            <button type="button" className="demo-bar__chip" onClick={onQueueDemo}>
              Queue
            </button>
            <button type="button" className="demo-bar__chip" onClick={onEditDemo}>
              Edit
            </button>
            <button type="button" className="demo-bar__chip demo-bar__chip--warning" onClick={onLowCredits}>
              积分不足
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export function DemoControlBar(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  if (!containerRef.current) {
    const div = document.createElement('div');
    div.className = 'demo-bar-portal';
    containerRef.current = div;
  }

  useEffect(() => {
    const el = containerRef.current!;
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, []);

  return createPortal(<Bar {...props} />, containerRef.current);
}
