import type {
  WorkspaceBillingResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { VisuallyHidden } from '@open-design/components';
import { isTeamPlanTier } from '../collab/team-plan';
import { useI18n } from '../i18n';
import { codingPlanQuotaView } from './coding-plan-usage-model';
import styles from './CodingPlanUsage.module.css';
import type { PlanBadgeTier } from './PlanWordmark';

interface WalletEntry {
  /** Explicitly scoped fallback for older CLIs without preflight. */
  balanceUsd: string | null | undefined;
  url: string | null;
  onClick?: () => void;
}
function PlanArrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function walletLabel(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '—';
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return '—';
  return `${amount < 0 ? '-' : ''}US$${Math.abs(amount).toFixed(2)}`;
}

/** Personal plan quota and wallet share one loading boundary and preflight snapshot. */
export function CodingPlanUsage({
  context,
  usageUrl,
  onUsageClick,
  wallet,
  planTier,
  billing,
}: {
  context: WorkspaceCollabContext | null;
  /** Shared billing cache, refreshed by workspace SSE and its existing recovery path. */
  billing?: WorkspaceBillingResponse | null;
  usageUrl?: string | null;
  onUsageClick?: () => void;
  wallet?: WalletEntry;
  /** Same resolved tier as the card header; directory context may omit planId. */
  planTier?: PlanBadgeTier | null;
}) {
  const { t } = useI18n();
  const workspaceId = context?.workspaceId;
  const memberId = context?.workspaceMemberId;
  const planId = context?.planId;
  const personalScope = Boolean(
    context && context.workspaceType !== 'team' && !isTeamPlanTier(planId),
  );
  if (!workspaceId || !memberId || !personalScope) return null;
  if (billing === null) {
    const loadingTier = planTier ?? planId;
    let blocks = 1;
    if (loadingTier === 'go') blocks = 2;
    else if (!loadingTier || loadingTier === 'free') blocks = 0;
    return (
      <div
        role="status"
        aria-busy="true"
        data-testid="coding-plan-quota-skeleton"
        data-coding-plan-quota={blocks ? '' : undefined}
      >
        <VisuallyHidden>{t('common.loading')}</VisuallyHidden>
        {Array.from({ length: blocks }, (_, index) => (
          <div
            className={styles.block}
            key={index}
            aria-hidden="true"
            data-testid="coding-plan-skeleton-block"
          >
            <div className={styles.row}>
              <span className={styles.bone} data-testid="coding-plan-quota-bone" />
              <span
                className={`${styles.bone} ${styles.boneEnd}`}
                data-testid="coding-plan-quota-bone"
              />
            </div>
            <span
              className={`${styles.bone} ${styles.boneTrack}`}
              data-testid="coding-plan-quota-bone"
            />
          </div>
        ))}
        {wallet && (
          <div
            className={`${styles.wallet} ${blocks ? styles.walletWithQuota : ''}`}
            aria-hidden="true"
            data-testid="coding-plan-wallet-skeleton"
          >
            <span className={styles.bone} />
            <span className={`${styles.bone} ${styles.boneEnd}`} />
          </div>
        )}
      </div>
    );
  }
  const snapshot = billing?.preflight;
  const preflight =
    snapshot?.workspaceId === workspaceId && snapshot.workspaceMemberId === memberId
      ? snapshot
      : null;
  const plan = preflight?.codingPlan;
  const windows = plan?.windows.filter((window) =>
    window.durationSeconds === 604_800
      || (plan.tier === 'go' && window.durationSeconds === 18_000),
  ) ?? [];
  const views = plan?.eligible && plan.tier ? codingPlanQuotaView(windows) : [];
  const allowance = t('billing.codingPlanDesignPlan');
  const walletValue = walletLabel(preflight ? preflight.balanceUsd : wallet?.balanceUsd);
  const walletContent = (
    <>
      <span>{t('billing.wallet')}</span>
      <span className={styles.value}>
        <bdi>{walletValue}</bdi>
        <PlanArrow />
      </span>
    </>
  );
  return (
    <>
      {views.length > 0 && (
        <div className={styles.quota} data-coding-plan-quota="" data-testid="coding-plan-quota">
          {views.map((view) => {
            const period = view.periodLabel
              ? t(view.periodLabel.key, { count: view.periodLabel.count })
              : null;
            const share = t('billing.codingPlanRemainingPercent', {
              percent: view.remainingPercent,
            });
            return (
              <div
                className={styles.block}
                data-testid="coding-plan-quota-block"
                key={`${view.policyId}:${view.durationSeconds}`}
              >
                <div className={styles.row}>
                  <span className={styles.allowance}>
                    {allowance}
                    {period ? (
                      <>
                        {' '}
                        <small className={styles.period}>{period}</small>
                      </>
                    ) : null}
                  </span>
                  {usageUrl ? (
                    <a
                      className={styles.entry}
                      data-testid="coding-plan-quota-entry"
                      href={usageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onUsageClick}
                    >
                      <span>{share}</span>
                      <PlanArrow />
                    </a>
                  ) : (
                    <span className={styles.entry}>{share}</span>
                  )}
                </div>
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-label={period ? `${allowance} · ${period}` : allowance}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={view.remainingPercent}
                  aria-valuetext={share}
                >
                  <span
                    className={styles.fill}
                    data-testid="coding-plan-quota-fill"
                    style={{ width: `${view.remainingPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {wallet &&
        (wallet.url ? (
          <a
            className={`${styles.wallet} ${views.length ? styles.walletWithQuota : ''}`}
            data-testid="entry-nav-credits-row"
            href={wallet.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={wallet.onClick}
          >
            {walletContent}
          </a>
        ) : (
          <div
            className={`${styles.wallet} ${views.length ? styles.walletWithQuota : ''}`}
            data-testid="entry-nav-credits-row"
          >
            {walletContent}
          </div>
        ))}
    </>
  );
}
