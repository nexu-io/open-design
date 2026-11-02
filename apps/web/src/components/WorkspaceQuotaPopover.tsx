import { useWorkspaceJourney } from '../analytics/use-workspace-journey';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';
import { useEffect, useId, useRef } from 'react';
import { isWorkspaceLifecycleReadable, type WorkspaceCollabContext } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { notifyWorkspaceBillingRefresh } from '../collab/useWorkspaceContext';
import type { WorkspaceQuotaView } from '../collab/workspace-quota-view';
import { useI18n } from '../i18n';
import { formatVelaBalanceUsd } from '../providers/daemon';
import { quotaPopoverConsoleUrl } from '../runtime/workspace-quota-links';
import { PlanWordmark, type PlanBadgeTier } from './PlanWordmark';
import card from './PersonalPlanCard.module.css';
import quota from './CodingPlanUsage.module.css';
import styles from './WorkspaceQuotaPopover.module.css';
import { LegacyWorkspaceQuotaPopover } from './LegacyWorkspaceQuotaPopover';

function QuotaHelp({ label, kind }: { label: string; kind: 'plan' | 'metered' }) {
  const id = useId();
  const tipRef = useRef<HTMLSpanElement>(null);
  function hide() { tipRef.current?.hidePopover?.(); }
  useEffect(() => {
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  function show(target: HTMLButtonElement) {
    const tip = tipRef.current;
    if (!tip) return;
    tip.showPopover?.();
    const anchor = target.getBoundingClientRect();
    const rect = tip.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - rect.width / 2, window.innerWidth - rect.width - 12));
    const below = anchor.top < rect.height + 22;
    tip.dataset.below = String(below);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(12, Math.min(below ? anchor.bottom + 2.5 : anchor.top - rect.height - 2.5, window.innerHeight - rect.height - 12))}px`;
    tip.style.setProperty('--arrow-left', `${Math.max(10, Math.min(rect.width - 10, anchor.left + anchor.width / 2 - left))}px`);
  }
  return <span className={styles.help}
    onPointerLeave={event => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) && !event.currentTarget.contains(document.activeElement)) hide();
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}
    onKeyDown={event => { if (event.key === 'Escape') { hide(); event.stopPropagation(); } }}>
    <button type="button" className={styles.helpTrigger} aria-label={label} aria-describedby={id}
      onPointerEnter={event => show(event.currentTarget)} onFocus={event => show(event.currentTarget)}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" /><path d="M10 9v5" strokeLinecap="round" /><circle cx="10" cy="6" r=".7" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <span ref={tipRef} className={styles.tooltip} id={id} role="tooltip" popover="manual" data-workspace-quota-tip={kind}>{label}</span>
  </span>;
}

export interface WorkspaceQuotaPopoverProps {
  view: WorkspaceQuotaView;
  context: WorkspaceCollabContext | null;
  profile?: string | null;
  consoleOrigin?: string | null;
  badgeTier?: PlanBadgeTier | null;
  planLabel?: string;
  onNavigate?: (action: 'upgrade' | 'credits') => void;
}

export function WorkspaceQuotaPopover(props: WorkspaceQuotaPopoverProps) {
  useWorkspaceJourney({ page_name: 'home', area: 'workspace_quota_popover', ...workspaceAnalyticsDimensions(props.context) });
  const workspaceId = props.context?.workspaceId;
  const memberId = props.context?.workspaceMemberId;
  useEffect(() => {
    if (workspaceId && memberId) notifyWorkspaceBillingRefresh();
  }, [workspaceId, memberId]);
  return props.view.sharedBilling === true
    ? <SharedWorkspaceQuotaPopover {...props} />
    : <LegacyWorkspaceQuotaPopover {...props} />;
}

function SharedWorkspaceQuotaPopover({ view, context, profile, consoleOrigin, badgeTier, planLabel, onNavigate }: WorkspaceQuotaPopoverProps) {
  const { t } = useI18n();
  const workspaceId = context?.workspaceId;
  const consoleUrl = quotaPopoverConsoleUrl(profile, workspaceId, 'console', consoleOrigin);
  const max = view.tier === 'max';
  // Preserve base EntryNavRail's locked/past-due recovery priority.
  const actionUrl = context?.billingRecovery?.recoveryUrl?.trim()
    || quotaPopoverConsoleUrl(profile, workspaceId, max ? 'recharge' : 'plans', consoleOrigin);
  const owner = context?.role === 'owner';
  // Preserve the existing contracts billing policy: locked workspaces remain readable.
  const readable = context?.memberStatus === 'active' && isWorkspaceLifecycleReadable(context.lifecycleState);
  const shownBadge = view.planKnown ? view.tier ?? (badgeTier === 'team' ? 'team' : null) : null;
  // Go has 5h + 7d; other paid tiers only 7d.
  const durations = view.tier === 'free' ? [] : view.tier === 'go' ? [18_000, 604_800] : [604_800];
  const showPlan = view.tier != null;
  function resetCountdown(raw: string | null | undefined) {
    if (!raw) return null;
    const minutes = Math.ceil((new Date(raw).getTime() - Date.now()) / 60_000);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    const days = Math.floor(minutes / 1_440);
    const hours = Math.floor((minutes % 1_440) / 60);
    const rest = minutes % 60;
    const time = days
      ? `${t('billing.codingPlanPeriodDays', { count: days })}${hours ? ` ${t('billing.codingPlanPeriodHours', { count: hours })}` : ''}`
      : hours
        ? `${t('billing.codingPlanPeriodHours', { count: hours })}${rest ? ` ${t('workspaceQuota.periodMinutes', { count: rest })}` : ''}`
        : t('workspaceQuota.periodMinutes', { count: rest });
    return t('workspaceQuota.resetIn', { time });
  }
  function navigate(url: string, action: 'upgrade' | 'credits') {
    onNavigate?.(action);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function help(kind: 'plan' | 'metered') {
    const label = kind === 'plan'
      ? t('workspaceQuota.planHelp')
      : t(view.tier === 'free' ? 'workspaceQuota.freeMeteredHelp' : 'workspaceQuota.meteredHelp');
    return <QuotaHelp label={label} kind={kind} />;
  }
  const walletContent = <>
    <span className={quota.value}><bdi>{formatVelaBalanceUsd(view.balanceUsd) ?? '—'}</bdi>
      {consoleUrl && readable ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg> : null}
    </span>
  </>;
  return (
    <div className={`entry-nav-rail__menu-credits ${card.card} ${styles.card}`} data-plan-status={view.planStatus ?? undefined}>
      <div className="entry-nav-rail__menu-credits-head">
        <span className="entry-nav-rail__menu-credits-plan" role={shownBadge && shownBadge !== 'team' ? 'img' : undefined}
          aria-label={shownBadge && shownBadge !== 'team' ? shownBadge : undefined}>
          {!view.planKnown ? <span aria-busy="true" aria-label={t('common.loading')}>—</span> : null}
          {shownBadge === 'team' ? planLabel : null}
          {/* A scoped balance alone does not prove a plan tier. */}
          {shownBadge ? <PlanWordmark tier={shownBadge} height={shownBadge === 'team' ? 11 : 20} variant="seats-phase1" /> : null}
        </span>
        {/* Role, not wallet balance, chooses the action. */}
        {readable && owner && view.planKnown && actionUrl ? (
          <Button className="entry-nav-rail__menu-credits-upgrade" onClick={() => navigate(actionUrl, max ? 'credits' : 'upgrade')}>
            {t(max ? 'chat.amrError.rechargeCta' : 'entry.creditsUpgrade')}
          </Button>
        ) : null}
      </div>
      {view.loading ? (
        // Header stays; no spinner, hint, error or retry text.
        <div aria-busy="true" data-testid="workspace-quota-skeleton" className={view.tier === 'free' ? styles.freeSkeleton : undefined}>
          {Array.from({ length: view.tier === 'go' ? 2 : 1 }, (_, index) => <div key={index} className={quota.block} data-testid="workspace-quota-window-skeleton" aria-hidden="true">
            <div className={quota.row}><span className={quota.bone} /><span className={`${quota.bone} ${quota.boneEnd}`} /></div>
            <span className={`${quota.bone} ${quota.boneTrack}`} />
          </div>)}
          <div className={`${quota.wallet} ${quota.walletWithQuota} ${styles.walletSkeleton}`} aria-hidden="true" data-testid="workspace-quota-wallet-skeleton">
            <span className={quota.bone} /><span className={`${quota.bone} ${quota.boneEnd}`} />
          </div>
        </div>
      ) : (
        <>
          {showPlan ? <section aria-label={t('workspaceQuota.designPlanAllowance')}>
            <div className={styles.sectionHead}><h3>{t('workspaceQuota.designPlanAllowance')}{help('plan')}</h3></div>
            {view.tier === 'free' ? <div className={styles.planBlock}>
              <div className={`${styles.row} ${styles.freeRow}`}>
                <span className={styles.availability}>{t('workspaceQuota.subscribeToUse')}</span>
                <span>{t('billing.codingPlanRemainingPercent', { percent: 0 })}</span>
              </div>
              <div className={`${quota.track} ${styles.track}`} role="progressbar" aria-label={t('workspaceQuota.designPlanAllowance')}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
                <span className={quota.fill} style={{ width: '0%' }} />
              </div>
            </div> : durations.map(duration => {
              const window = view.windows?.find(item => item.durationSeconds === duration);
              const percent = window?.remainingPercent;
              const known = percent != null && Number.isFinite(percent) && percent >= 0 && percent <= 100;
              if (!known) return <div className={`${styles.placeholder} ${styles.planBlock}`} key={duration}>
                <span>—</span><small>{t('workspaceQuota.usageUnavailable')}</small>
              </div>;
              const resetLabel = resetCountdown(window?.resetsAt);
              return <div className={`${quota.block} ${styles.planBlock}`} key={duration}>
                <div className={styles.row}>
                  <span className={quota.allowance}>
                    {t(duration === 18_000 ? 'billing.codingPlanPeriodHours' : 'billing.codingPlanPeriodDays', { count: duration === 18_000 ? 5 : 7 })}
                  </span>
                  <span>{t('billing.codingPlanRemainingPercent', { percent })}</span>
                </div>
                <div className={`${quota.track} ${styles.track}`} role="progressbar" aria-label={t('billing.codingPlanDesignPlan')}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <span className={quota.fill} style={{ width: `${percent}%` }} />
                </div>
                {resetLabel ? <div className={styles.details}>{resetLabel}</div> : null}
              </div>;
            })}
          </section> : null}
          <section className={styles.metered} aria-label={t('workspaceQuota.payAsYouGo')}>
            <div className={styles.sectionHead}>
              <h3>{t('workspaceQuota.payAsYouGo')}{help('metered')}</h3>
              {consoleUrl && readable ? <button type="button" className={styles.balance}
                data-testid="entry-nav-credits-row" aria-label={t('workspaceQuota.viewBalance')}
                onClick={() => navigate(consoleUrl, 'credits')}>{walletContent}</button>
                : <div className={styles.balance}>{walletContent}</div>}
            </div>
          </section>
        </>
      )}
      {context ? <div className={styles.footer} role="note">
        {t(owner ? 'workspaceQuota.shared' : 'workspaceQuota.contactOwnerForBilling')}
      </div> : null}
    </div>
  );
}
