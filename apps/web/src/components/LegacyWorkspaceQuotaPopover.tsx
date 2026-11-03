// Preserve the integration quota card until shared billing is explicitly proved.
import type { WorkspaceQuotaPopoverProps } from './WorkspaceQuotaPopover';
import { isWorkspaceLifecycleReadable } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { formatVelaBalanceUsd } from '../providers/daemon';
import { quotaPopoverConsoleUrl } from '../runtime/workspace-quota-links';
import { PlanWordmark } from './PlanWordmark';
import { Icon } from './Icon';
import { RemixIcon } from './RemixIcon';
import card from './PersonalPlanCard.module.css';
import quota from './CodingPlanUsage.module.css';
import styles from './LegacyWorkspaceQuotaPopover.module.css';

export function LegacyWorkspaceQuotaPopover({ view, context, profile, consoleOrigin, badgeTier, planLabel, onNavigate }: WorkspaceQuotaPopoverProps) {
  const { t } = useI18n();
  const workspaceId = context?.workspaceId;
  const consoleUrl = quotaPopoverConsoleUrl(profile, workspaceId, 'console', consoleOrigin);
  const max = view.tier === 'max';
  // Preserve base EntryNavRail's locked/past-due recovery priority.
  const actionUrl = context?.billingRecovery?.recoveryUrl?.trim()
    || quotaPopoverConsoleUrl(profile, workspaceId, max ? 'console' : 'plans', consoleOrigin);
  const owner = context?.role === 'owner';
  // Preserve the existing contracts billing policy: locked workspaces remain readable.
  const readable = context?.memberStatus === 'active' && isWorkspaceLifecycleReadable(context.lifecycleState);
  const shownBadge = view.planKnown ? view.tier ?? (badgeTier === 'team' ? 'team' : null) : null;
  // Go has 5h + 7d; other paid tiers only 7d.
  const durations = view.tier === 'free' ? [] : view.tier === 'go' ? [18_000, 604_800] : [604_800];
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
      ? view.modelRestriction ?? t('workspaceQuota.planHelp')
      : t('workspaceQuota.meteredHelp');
    return <span className={styles.help}>
      <button type="button" className={styles.helpTrigger} aria-label={label} aria-describedby={`workspace-quota-${kind}-tip`}>
        <RemixIcon name="information-line" size={16} />
      </button>
      <span className={styles.tooltip} id={`workspace-quota-${kind}-tip`} role="tooltip">{label}</span>
    </span>;
  }
  const walletContent = <>
    <span className={quota.value}><bdi>{formatVelaBalanceUsd(view.balanceUsd) ?? '—'}</bdi>
      {consoleUrl && readable ? <Icon name="chevron-right" size={14} /> : null}
    </span>
  </>;
  return (
    <div className={`entry-nav-rail__menu-credits ${card.card}`} data-plan-status={view.planStatus ?? undefined}>
      <div className="entry-nav-rail__menu-credits-head">
        <span className="entry-nav-rail__menu-credits-plan" role={shownBadge && shownBadge !== 'team' ? 'img' : undefined}
          aria-label={shownBadge && shownBadge !== 'team' ? shownBadge : undefined}>
          {!view.planKnown ? <span aria-busy="true" aria-label={t('common.loading')}>—</span> : null}
          {shownBadge === 'team' ? planLabel : null}
          {/* A scoped balance alone does not prove a plan tier. */}
          {shownBadge ? <PlanWordmark tier={shownBadge} height={shownBadge === 'team' ? 11 : 20} /> : null}
        </span>
        {/* Role, not wallet balance, chooses the action. */}
        {readable && owner && view.planKnown && actionUrl ? (
          <Button className="entry-nav-rail__menu-credits-upgrade" onClick={() => navigate(actionUrl, max ? 'credits' : 'upgrade')}>
            {t(max ? 'entry.creditsManage' : 'entry.creditsUpgrade')}
          </Button>
        ) : null}
      </div>
      {view.loading ? (
        // Header stays; no spinner, hint, error or retry text.
        <div aria-busy="true" data-testid="workspace-quota-skeleton">
          <div className={quota.block} data-testid="workspace-quota-window-skeleton" aria-hidden="true">
            <div className={quota.row}><span className={quota.bone} /><span className={`${quota.bone} ${quota.boneEnd}`} /></div>
            <span className={`${quota.bone} ${quota.boneTrack}`} />
          </div>
          <div className={`${quota.wallet} ${quota.walletWithQuota}`} aria-hidden="true" data-testid="workspace-quota-wallet-skeleton">
            <span className={quota.bone} /><span className={`${quota.bone} ${quota.boneEnd}`} />
          </div>
        </div>
      ) : (
        <>
          <section aria-label={t('workspaceQuota.designPlanAllowance')}>
            <div className={styles.sectionHead}><h3>{t('workspaceQuota.designPlanAllowance')}{help('plan')}</h3></div>
            {/* The Design Plan region is present even on Free. */}
            {view.tier === 'free' ? <div className={styles.placeholder}>
              <span>{t('workspaceQuota.unsubscribed')}</span><small>{t('workspaceQuota.subscribeToUse')}</small>
            </div> : durations.map(duration => {
              const window = view.windows?.find(item => item.durationSeconds === duration);
              const percent = window?.remainingPercent;
              const known = percent != null && Number.isFinite(percent) && percent >= 0 && percent <= 100;
              if (!known) return <div className={`${styles.placeholder} ${styles.planBlock}`} key={duration}>
                <span>—</span><small>{t('workspaceQuota.usageUnavailable')}</small>
              </div>;
              const resetLabel = resetCountdown(window?.resetsAt);
              return <div className={`${quota.block} ${styles.planBlock}`} key={duration}>
                <div className={quota.row}>
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
          </section>
          <section className={`${quota.walletWithQuota} ${styles.metered}`} aria-label={t('workspaceQuota.payAsYouGo')}>
            <div className={styles.sectionHead}>
              <h3>{t('workspaceQuota.payAsYouGo')}{help('metered')}</h3>
              {consoleUrl && readable ? <button type="button" className={`${styles.balance} ${quota.wallet}`}
                data-testid="entry-nav-credits-row" aria-label={t('workspaceQuota.viewBalance')}
                onClick={() => navigate(consoleUrl, 'credits')}>{walletContent}</button>
                : <div className={quota.wallet}>{walletContent}</div>}
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
