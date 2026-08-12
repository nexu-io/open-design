// Insufficient-credits upgrade flow.
//
// Triggered when credits run out mid-use. Branches on the current plan:
//  - below 团队版: offer the upgrade tiers reachable from here, priced as a
//    pro-rated top-up ("按当前已使用天数补差价"); 确认支付 → upgrade takes effect.
//  - Max / 团队版: no credit packs — configure auto recharge instead.
//
// Ported verbatim from the design demo (origin/demo/workspace-team-features).
// The demo imported `DemoPlan` from its demo-only `DemoControlBar` (a control
// surface we do not ship); the plan-tier union is inlined here instead. The
// confirm action is wired by the caller to the real billing 收口
// (`POST /api/workspace/billing/checkout`).

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceBillingCatalog, WorkspaceTeamBillingPlanId } from '@open-design/contracts';
import { Icon } from './Icon';
import { useT } from '../i18n';

/** Plan-tier union — inlined from the demo's `DemoControlBar` (demo-only). */
export type DemoPlan = 'free' | 'plus' | 'pro' | 'max' | 'team';

type BillingCycle = 'annual' | 'monthly';
type AutoRechargeLimit = '30' | '50' | '100' | '200' | 'custom' | 'unlimited';

interface TierOption {
  plan: DemoPlan;
  labelKey: Parameters<ReturnType<typeof useT>>[0];
  descKey: Parameters<ReturnType<typeof useT>>[0];
  /** Per-month price (¥), billed monthly. */
  monthly: number;
  /** Per-month price (¥) when billed annually. */
  annual: number;
  /** Vela team subscription plan id when this option comes from the real catalog. */
  teamPlanId?: WorkspaceTeamBillingPlanId;
  /** Minimum seats enforced by Vela for this plan. */
  minSeats?: number;
  currency?: 'usd' | 'cny';
}

const PLUS: TierOption = { plan: 'plus', labelKey: 'entry.upgradePlanPlus', descKey: 'entry.upgradePlanPlusDesc', monthly: 39, annual: 29, teamPlanId: 'team_plus' };
const PRO: TierOption = { plan: 'pro', labelKey: 'entry.upgradePlanPro', descKey: 'entry.upgradePlanProDesc', monthly: 99, annual: 79, teamPlanId: 'team_pro' };
const MAX: TierOption = { plan: 'max', labelKey: 'entry.upgradePlanMax', descKey: 'entry.upgradePlanMaxDesc', monthly: 199, annual: 159, teamPlanId: 'team_max' };

// Tiers reachable from each plan, in order. Max / 团队版 use auto recharge.
const UPGRADE_TARGETS: Record<DemoPlan, TierOption[]> = {
  free: [PLUS, PRO, MAX],
  plus: [PRO, MAX],
  pro: [MAX],
  max: [],
  team: [],
};

const AUTO_RECHARGE_LIMITS: Array<{ id: AutoRechargeLimit; label: string }> = [
  { id: '30', label: '$30' },
  { id: '50', label: '$50' },
  { id: '100', label: '$100' },
  { id: '200', label: '$200' },
  { id: 'custom', label: 'custom' },
  { id: 'unlimited', label: 'unlimited' },
];

interface Props {
  open: boolean;
  plan: DemoPlan;
  onClose: () => void;
  /** Confirmed an upgrade to a higher tier. */
  onUpgrade: (target: DemoPlan, planId?: WorkspaceTeamBillingPlanId, minSeats?: number) => void;
  /** Saved an auto-recharge setting for top tiers. */
  onBuyPack: (packLabel: string) => void;
  autoRechargeScope?: 'team' | 'member';
  autoRechargeMemberName?: string;
  creditsRemaining?: number | null;
  billingCatalog?: WorkspaceBillingCatalog | null;
}

export function InsufficientCreditsDialog({
  open,
  plan,
  onClose,
  onUpgrade,
  onBuyPack,
  autoRechargeScope = 'team',
  autoRechargeMemberName = '李娜',
  creditsRemaining = null,
  billingCatalog = null,
}: Props) {
  const t = useT();
  const catalogTargets = useMemo(() => catalogToTierOptions(billingCatalog), [billingCatalog]);
  const targets = catalogTargets.length > 0 ? catalogTargets : UPGRADE_TARGETS[plan];
  const usesRealTeamCatalog = catalogTargets.length > 0;
  const isTopTier = targets.length === 0;
  const isMemberRecharge = autoRechargeScope === 'member';
  const creditsExhausted = typeof creditsRemaining === 'number' && creditsRemaining <= 0;
  const upgradeSubtitle = creditsExhausted
    ? t('entry.upgradeCreditsExhaustedSubtitle')
    : t('entry.upgradeSubtitle');

  const [selectedTier, setSelectedTier] = useState<DemoPlan>(targets[0]?.plan ?? 'team');
  const [selectedLimit, setSelectedLimit] = useState<AutoRechargeLimit>('50');
  // Billing cycle for tier upgrades — defaults to annual (年付).
  const [cycle, setCycle] = useState<BillingCycle>('annual');

  useEffect(() => {
    setSelectedTier(targets[0]?.plan ?? 'team');
  }, [targets]);

  useEffect(() => {
    if (usesRealTeamCatalog) setCycle('monthly');
  }, [usesRealTeamCatalog]);

  if (!open) return null;

  return (
    <div className="entry-invite" role="dialog" aria-modal="true" aria-label={t('entry.upgradeDialogAria')}>
      <div className="entry-invite__backdrop" onClick={onClose} />
      <div className="credit-upgrade">
        <button type="button" className="entry-invite__close" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" size={16} />
        </button>

        <div className="credit-upgrade__badge" aria-hidden>
          <Icon name="sparkles" size={20} />
        </div>
        <h2 className="credit-upgrade__title">
          {isTopTier
            ? t('entry.upgradeAutoRechargeTitle')
            : creditsExhausted
              ? t('entry.upgradeCreditsExhaustedTitle')
              : t('entry.upgradeTitle')}
        </h2>
        <p className="credit-upgrade__subtitle">
          {isTopTier
            ? isMemberRecharge
              ? t('entry.upgradeAutoRechargeMemberSubtitle', { member: autoRechargeMemberName })
              : t('entry.upgradeAutoRechargeTeamSubtitle')
            : upgradeSubtitle}
        </p>

        {isTopTier ? (
          <div className="credit-upgrade__auto">
            <div className="credit-upgrade__payment">
              <span>{t('entry.upgradeScopeLabel')}</span>
              <strong>
                {isMemberRecharge
                  ? t('entry.upgradeScopeMember', { member: autoRechargeMemberName })
                  : t('entry.upgradeScopeTeam')}
              </strong>
            </div>
            <div className="credit-upgrade__payment">
              <span>{t('entry.upgradePaymentHint')}</span>
              <button
                type="button"
                className="credit-upgrade__payment-button"
              >
                <Icon name="external-link" size={14} /> {t('entry.upgradeManagePayment')}
              </button>
            </div>
            <div className="credit-upgrade__auto-card">
              <h3 className="credit-upgrade__section-title">{t('entry.upgradeMonthlyLimit')}</h3>
              <div className="credit-upgrade__limit-grid">
                {AUTO_RECHARGE_LIMITS.map((limit) => (
                  <button
                    key={limit.id}
                    type="button"
                    className={`credit-upgrade__limit${selectedLimit === limit.id ? ' is-active' : ''}${limit.id === 'unlimited' ? ' credit-upgrade__limit--wide' : ''}`}
                    onClick={() => setSelectedLimit(limit.id)}
                  >
                    {limit.id === 'custom'
                      ? t('entry.upgradeLimitCustom')
                      : limit.id === 'unlimited'
                        ? t('entry.upgradeLimitUnlimited')
                        : limit.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="credit-upgrade__options">
            {!usesRealTeamCatalog ? (
              <div className="credit-upgrade__cycle" role="tablist" aria-label={t('entry.upgradeBillingCycleAria')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cycle === 'annual'}
                  className={`credit-upgrade__cycle-tab${cycle === 'annual' ? ' is-active' : ''}`}
                  onClick={() => setCycle('annual')}
                >
                  {t('entry.upgradeAnnual')} <span className="credit-upgrade__cycle-save">{t('entry.upgradeAnnualSave')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cycle === 'monthly'}
                  className={`credit-upgrade__cycle-tab${cycle === 'monthly' ? ' is-active' : ''}`}
                  onClick={() => setCycle('monthly')}
                >
                  {t('entry.upgradeMonthly')}
                </button>
              </div>
            ) : null}
            {targets.map((tier) => {
              const price = cycle === 'annual' && !usesRealTeamCatalog ? tier.annual : tier.monthly;
              return (
                <button
                  key={tier.plan}
                  type="button"
                  className={`credit-upgrade__option${selectedTier === tier.plan ? ' is-active' : ''}`}
                  onClick={() => setSelectedTier(tier.plan)}
                >
                  <span className="credit-upgrade__option-radio" aria-hidden />
                  <span className="credit-upgrade__option-text">
                    <span className="credit-upgrade__option-label">{t(tier.labelKey)}</span>
                    <span className="credit-upgrade__option-desc">{t(tier.descKey)}</span>
                  </span>
                  <span className="credit-upgrade__option-price">
                    {tier.currency === 'usd' ? '$' : '¥'}{price}
                    <span className="credit-upgrade__option-unit">
                      {usesRealTeamCatalog || tier.plan === 'team'
                        ? t('entry.upgradePriceUnitSeat')
                        : t('entry.upgradePriceUnitMonth')}
                    </span>
                  </span>
                </button>
              );
            })}
            {!usesRealTeamCatalog ? (
              <p className="credit-upgrade__prorate">
              <Icon name="info" size={13} />
              {cycle === 'annual'
                ? t('entry.upgradeProrateAnnualPrefix')
                : t('entry.upgradeProrateMonthlyPrefix')}
              {t('entry.upgradeProrateSuffix')}
              </p>
            ) : null}
          </div>
        )}

        <div className="credit-upgrade__foot">
          <button type="button" className="entry-invite__btn" onClick={onClose}>
            {isTopTier ? t('entry.upgradeBack') : t('common.cancel')}
          </button>
          {isTopTier ? (
            <button
              type="button"
              className="entry-invite__btn is-primary"
              onClick={() => onBuyPack(t('entry.upgradeAutoRechargeSaved'))}
            >
              {t('common.save')}
            </button>
          ) : (
            <button
	              type="button"
	              className="entry-invite__btn is-primary"
	              onClick={() => {
	                const tier = targets.find((option) => option.plan === selectedTier);
	                onUpgrade(selectedTier, tier?.teamPlanId, tier?.minSeats);
	              }}
	            >
              <Icon name="sparkles" size={14} /> {t('entry.upgradeConfirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function catalogToTierOptions(catalog: WorkspaceBillingCatalog | null): TierOption[] {
  if (!catalog) return [];
  const options: TierOption[] = [];
  for (const plan of catalog.plans) {
    if (plan.status !== 'active') continue;
    const mapped = teamPlanToDemoPlan(plan.planId);
    if (!mapped) continue;
    options.push({
      plan: mapped.plan,
      labelKey: mapped.labelKey,
      descKey: mapped.descKey,
      monthly: plan.seatUnitAmountCents / 100,
      annual: plan.seatUnitAmountCents / 100,
      teamPlanId: plan.planId,
      minSeats: plan.minSeats,
      currency: 'usd',
    });
  }
  return options;
}

function teamPlanToDemoPlan(
  planId: WorkspaceTeamBillingPlanId,
): Pick<TierOption, 'plan' | 'labelKey' | 'descKey'> | null {
  if (planId === 'team_plus') {
    return { plan: 'plus', labelKey: 'entry.upgradePlanPlus', descKey: 'entry.upgradePlanPlusDesc' };
  }
  if (planId === 'team_pro') {
    return { plan: 'pro', labelKey: 'entry.upgradePlanPro', descKey: 'entry.upgradePlanProDesc' };
  }
  if (planId === 'team_max') {
    return { plan: 'max', labelKey: 'entry.upgradePlanMax', descKey: 'entry.upgradePlanMaxDesc' };
  }
  return null;
}
