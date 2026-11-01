import { useWorkspaceJourney } from '../analytics/use-workspace-journey';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import type { WorkspaceJourneySurfaceProps } from '@open-design/contracts/analytics';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { useWorkspaceBilling, useWorkspaceContext } from '../collab/useWorkspaceContext';
import { workspaceUpgradeUrl } from './EntryNavRail';
import {
  amrBalanceGateScopeForWorkspaceContext,
  hasAmrFundingRecovered,
  type AmrBalanceGateScope,
} from '../runtime/amr-balance-gate';
import { AmrLoginPill } from './AmrLoginPill';
import { Icon } from './Icon';
import styles from './AmrBalanceDialog.module.css';

/** How often the post-recharge funding watch polls. Overlapping ticks are
 * skipped so a stalled preflight cannot stack HTTP or Vela work. */
export const WALLET_WATCH_INTERVAL_MS = 5_000;
/** Give up watching after this long; the dialog stays, resume goes manual. */
export const WALLET_WATCH_TIMEOUT_MS = 10 * 60_000;

interface Props {
  /** Backend funding rejection, or a pre-send sign-in block. */
  reason: 'insufficient' | 'signed_out';
  /** Funding recovery may dismiss the prompt without authorizing a send. */
  manualSendOnRecovery?: boolean;
  /** When the caller observed the funding refusal, independent of recovery behavior. */
  stage?: WorkspaceJourneySurfaceProps['stage'];
  modelId?: string | null;
  fundingScope?: AmrBalanceGateScope;
  /**
   * Raw wallet balance string from the blocking snapshot. Not rendered: the
   * finalized S06 copy (OPEND-2849) carries no amount. Kept so callers keep
   * passing the snapshot they gated on.
   */
  balanceUsd: string | null;
  /** OpenDesign Cloud profile from the blocking snapshot; picks the console origin. */
  profile: string | null;
  /** Origin captured with the same authenticated runtime profile, when available. */
  consoleOrigin?: string | null;
  /** Which surface blocked the send — keys the amr_entry attribution. */
  entrySource: 'home_balance_gate_upgrade' | 'chat_balance_gate_upgrade';
  /**
   * The caller's plan classification. `pricing` offers the current workspace's
   * plan page; the existing `auto_recharge` value identifies a Max Owner.
   * RUN-004 / frozen product r271 removes auto-recharge shortcuts from this
   * dialog, so Max has no purchase CTA. Separate card/settings entries keep
   * their own contracts.
   */
  upgradeIntent?: 'pricing' | 'auto_recharge';
  /**
   * The workspace whose wallet this block is about, when the caller already
   * knows it. Omit (the default) to resolve the ambient navigation selection,
   * which is correct for Home — there the ambient workspace IS the one that
   * would have paid.
   *
   * The project view is not in that position: its run is paid for by the
   * PROJECT's workspace, which is not necessarily the one the rail is showing.
   * Passing the payer's context keeps an available plan CTA in the original
   * workspace even when the navigation selection changes.
   *
   * `null` is a deliberate value (no billing identity resolved), distinct from
   * `undefined` (use the ambient one).
   */
  workspaceContext?: WorkspaceCollabContext | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Dismissal only ("not now" / Esc); does not retry a failed run. */
  onClose: () => void;
  /** The blocking condition just cleared (sign-in completed, or the wallet
   *  watch saw the recharge land) — the caller resumes the parked task. */
  onResolved: () => void;
}

// Sign-in blocks and live backend funding rejections share this dialog.
// Wallet balance alone cannot decide admission: Coding Plan quota and
// automatic recharge may still fund the request. The two dialog variants are:
//
//   insufficient — the backend rejected funding. The CTA must LAND on
//     the current workspace's higher plans when available. A Max Owner has no
//     higher plan and no automatic-recharge shortcut in this dialog (RUN-004).
//
//   signed_out — OpenDesign Cloud selected but no account session. The CTA
//     is the in-app sign-in (AmrLoginPill: spawns vela login, surfaces the
//     activation link when the browser doesn't auto-open, polls until done);
//     sending the user to the wallet website would be a dead end.
//
// Sign-in or post-recharge funding recovery fires `onResolved`, allowing the
// caller to release pending sends. A failed run stays in history for the user
// to retry explicitly. Local cached amounts never trigger this dialog.
export function AmrBalanceDialog({
  reason,
  manualSendOnRecovery = false,
  stage = 'unknown',
  modelId,
  fundingScope,
  profile,
  consoleOrigin,
  entrySource,
  upgradeIntent = 'pricing',
  workspaceContext: workspaceContextOverride,
  metricsConsent,
  installationId,
  onClose,
  onResolved,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const signedOut = reason === 'signed_out';
  const signInEntrySource =
    entrySource === 'home_balance_gate_upgrade'
      ? ('home_balance_gate_sign_in' as const)
      : ('chat_balance_gate_sign_in' as const);
  // Armed by the wallet CTA click (the user's "I'm going to recharge"
  // signal): poll the wallet until the balance clears the hard line, then
  // resume the parked task via onResolved. Bounded so an abandoned recharge
  // doesn't poll forever; guarded against double-fires.
  const [watchingWallet, setWatchingWallet] = useState(false);
  const {
    context: ambientWorkspaceContext,
    loading: ambientWorkspaceContextLoading,
  } = useWorkspaceContext();
  // An explicitly supplied context is already resolved, so there is nothing to
  // wait for; only the ambient lane can still be in flight.
  const workspaceContext =
    workspaceContextOverride !== undefined
      ? workspaceContextOverride
      : ambientWorkspaceContext;
  const workspaceContextLoading =
    workspaceContextOverride !== undefined ? false : ambientWorkspaceContextLoading;
  const workspaceBilling = useWorkspaceBilling();
  const journey = useWorkspaceJourney({ page_name: entrySource === 'home_balance_gate_upgrade' ? 'home' : 'chat_panel', area: 'credit_exhausted_dialog', reason: 'credit_exhausted', stage, ...workspaceAnalyticsDimensions(workspaceContext) }, !signedOut && !workspaceContextLoading);
  const close = () => { journey.click('close'); onClose(); };
  // A Max classification cannot fall back to selling the same plan. The
  // frozen funding dialog has no auto-recharge shortcut for any Owner.
  const upgradeUrl = workspaceContextLoading || upgradeIntent === 'auto_recharge'
    ? null
    : workspaceUpgradeUrl(workspaceContext, workspaceBilling, {
        fallbackProfile: profile,
        consoleOrigin,
      });
  const resolvedRef = useRef(false);
  const resolveOnce = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolved();
  };
  useEffect(() => {
    if (!watchingWallet) return;
    let cancelled = false;
    let inFlight = false;
    const startedAt = Date.now();
    const stopWatching = () => {
      if (cancelled) return;
      setWatchingWallet(false);
    };
    const tick = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - startedAt > WALLET_WATCH_TIMEOUT_MS) {
        stopWatching();
        return;
      }
      inFlight = true;
      try {
        const recovered = await hasAmrFundingRecovered(fundingScope ?? amrBalanceGateScopeForWorkspaceContext(workspaceContext), modelId);
        if (cancelled) return;
        if (recovered) {
          resolveOnce();
          return;
        }
        if (Date.now() - startedAt > WALLET_WATCH_TIMEOUT_MS) {
          stopWatching();
        }
      } finally {
        inFlight = false;
      }
    };
    const interval = setInterval(() => void tick(), WALLET_WATCH_INTERVAL_MS);
    const timeout = setTimeout(stopWatching, WALLET_WATCH_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // resolveOnce is stable via ref; onResolved changes don't re-arm the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchingWallet, workspaceContext?.workspaceId, workspaceContext?.workspaceMemberId, fundingScope?.workspaceId, fundingScope?.workspaceMemberId, modelId]);
  const openUpgrade = () => {
    if (!upgradeUrl) return;
    setWatchingWallet(true);
    // Same attribution handshake as the other OpenDesign Cloud handoffs
    // (ChatPane recharge, AvatarMenu upgrade): record the amr_entry, forward
    // the consent-gated device id, and open the console for the profile.
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
      blockContext: { block_id: journey.id, ...(workspaceContext ? { workspace_key: workspaceContext.workspaceId } : {}), reason: 'credit_exhausted', stage },
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(upgradeUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  };
  const benefits = [
    t(signedOut ? 'chat.amrBalanceGate.benefit1' : 'chat.amrConcurrencyGate.benefit1'),
    t('chat.amrConcurrencyGate.benefit2'),
    t(signedOut ? 'chat.amrBalanceGate.benefit3' : 'chat.amrConcurrencyGate.benefit3'),
    t(signedOut ? 'chat.amrBalanceGate.benefit4' : 'chat.amrConcurrencyGate.benefit4'),
  ];
  const dialog = (
    <Dialog
      role="alertdialog"
      ariaLabel={signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      onClose={close}
      closeOnEscape
      className={signedOut ? styles.panel : `${styles.panel} ${styles.frozenPanel}`}
      backdropClassName={signedOut ? undefined : styles.frozenBackdrop}
      data-testid="amr-balance-dialog"
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={close}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={14} />
      </button>
      <div className={styles.banner}>
        <img
          className={styles.bannerImage}
          src="/upgrade/cloud-signin-aurora.jpg"
          alt=""
          width={1680}
          height={720}
          decoding="async"
          draggable={false}
        />
      </div>
      <h2 className={styles.title}>
        {signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      </h2>
      <p className={styles.message}>
        {/* Product copy S04 / S06 (OPEND-2849): the insufficient variant no
            longer quotes the balance — the finalized sentence has no amount. */}
        {signedOut
          ? t('chat.amrBalanceGate.signedOutMessage')
          : t('chat.amrBalanceGate.message')}
      </p>
      <div className={styles.benefitsCard}>
        <span className={styles.benefitsTitle}>
          {t('chat.amrBalanceGate.benefitsTitle')}
        </span>
        <ul className={styles.benefits}>
          {benefits.map((benefit) => (
            <li key={benefit} className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden>
                <Icon name="check" size={14} />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>
      {/* Dismissal first in DOM so it lands on the left of the row and focus
          order matches the reading order; the CTA follows on the right. */}
      <div className={styles.actions}>
        <Button variant="ghost" className={signedOut ? styles.later : `${styles.later} ${styles.frozenLater}`} onClick={close}>
          {t('chat.amrBalanceGate.laterCta')}
        </Button>
        {signedOut ? (
          <AmrLoginPill
            className={styles.signInPill}
            signInLabel={t('chat.amrBalanceGate.signInCta')}
            amrEntrySourceDetail={signInEntrySource}
            metricsConsent={metricsConsent}
            installationId={installationId}
            showActivationDetails
            hideSignedOutStatus
            revealPendingCancelAction
            onStatusChange={(loginStatus) => {
              // Signed in — the gate's reason is gone; resume the parked task.
              if (loginStatus?.loggedIn === true) resolveOnce();
            }}
          />
        ) : upgradeUrl ? (
          <Button
            variant="primary"
            className={`${styles.cta} ${styles.frozenCta}`}
            onClick={openUpgrade}
            data-testid="amr-balance-dialog-plans"
          >
            {t('chat.amrBalanceGate.plansCta')}
          </Button>
        ) : null}
      </div>
      {watchingWallet ? (
        <p className={styles.watchingHint} data-testid="amr-balance-dialog-watching">
          {t(manualSendOnRecovery ? 'chat.amrBalanceGate.watchingWalletManual' : 'chat.amrBalanceGate.watchingWallet')}
        </p>
      ) : null}
    </Dialog>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
