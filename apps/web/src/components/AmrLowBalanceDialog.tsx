import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { amrConsoleUrlForProfile, amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { setAmrLowBalanceWarnOptedOut } from '../runtime/amr-balance-gate';
import { formatVelaBalanceUsd } from '../providers/daemon';
import { Icon } from './Icon';
import styles from './AmrLowBalanceDialog.module.css';

export type AmrLowBalanceDecision = 'proceed' | 'recharge' | 'dismiss';

interface Props {
  /** Raw wallet balance string from the warning snapshot. */
  balanceUsd: string | null;
  /** Billing plan tier; free accounts get an upgrade CTA instead of top-up copy. */
  plan?: string | null;
  /** Open Design Cloud profile from the warning snapshot; picks the console origin. */
  profile: string | null;
  /** Which surface warned — keys the amr_entry attribution on the recharge click. */
  entrySource: 'home_low_balance_warn_recharge' | 'chat_low_balance_warn_recharge';
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Resolves the pending send: 'proceed' starts the task, anything else parks it. */
  onDecision: (decision: AmrLowBalanceDecision) => void;
}

// SOFT pre-run reminder for Open Design Cloud tasks: the wallet can still
// fund a start but sits at or below the low-balance line, so the run may die
// mid-flight. Unlike the hard AmrBalanceDialog this never stands between the
// user and their task — "start anyway" resolves the SAME pending send the
// gate paused (a continuation, not a re-submit), "top up" opens the console
// wallet page and parks the send, and the "don't remind me" opt-out persists
// for every future soft warning. Hard blocks ignore the opt-out by design.
export function AmrLowBalanceDialog({
  balanceUsd,
  plan,
  profile,
  entrySource,
  metricsConsent,
  installationId,
  onDecision,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const optOutRef = useRef<HTMLInputElement>(null);
  const formattedBalance = formatVelaBalanceUsd(balanceUsd) ?? '';
  const isFreePlan = plan?.trim().toLowerCase() === 'free';
  const primaryActionUrl = isFreePlan
    ? amrPlansUrlForProfile(profile)
    : amrConsoleUrlForProfile(profile);
  const primaryActionLabel = isFreePlan
    ? t('chat.amrBalanceGate.plansCta')
    : t('chat.amrLowBalance.rechargeCta');
  const commitOptOut = () => {
    if (optOutRef.current?.checked) setAmrLowBalanceWarnOptedOut();
  };
  const decide = (decision: AmrLowBalanceDecision) => {
    commitOptOut();
    onDecision(decision);
  };
  const openWalletAndPark = () => {
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(primaryActionUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
    decide('recharge');
  };
  const dialog = (
    <Dialog
      role="alertdialog"
      ariaLabel={t('chat.amrLowBalance.title')}
      onClose={() => decide('dismiss')}
      closeOnEscape
      className={styles.panel}
      data-testid="amr-low-balance-dialog"
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={() => decide('dismiss')}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={14} />
      </button>
      <div className={styles.iconBadge} aria-hidden>
        <Icon name="info" size={22} />
      </div>
      <h2 className={styles.title}>{t('chat.amrLowBalance.title')}</h2>
      <p className={styles.message}>
        {t('chat.amrLowBalance.message', { balance: formattedBalance })}
      </p>
      {/* Canonical suppression-dialog footer (macOS alerts, VS Code, JetBrains):
          the "don't ask again" checkbox sits bottom-left as a quiet meta
          option, the actions sit bottom-right in one row with the primary
          outermost. */}
      <div className={styles.footer}>
        <label className={styles.optOut}>
          <input ref={optOutRef} type="checkbox" data-testid="amr-low-balance-dialog-optout" />
          {t('chat.amrLowBalance.dontRemind')}
        </label>
        <div className={styles.footerActions}>
          <Button onClick={() => decide('proceed')} data-testid="amr-low-balance-dialog-proceed">
            {t('chat.amrLowBalance.proceedCta')}
          </Button>
          <Button
            variant="primary"
            className={styles.cta}
            onClick={openWalletAndPark}
            data-testid="amr-low-balance-dialog-recharge"
          >
            {primaryActionLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
