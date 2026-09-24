import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { isRtlLocale, useI18n } from '../i18n';
import { Icon } from './Icon';
import { PlanWordmark } from './PlanWordmark';
import styles from './ProPlanPreview.module.css';

// Explicitly enabled local design fixture. Never changes cloud entitlements or billing.
const consoleUrl = 'http://127.0.0.1:5454/dashboard?workspaceId=personal_workspace';
const pricingUrl = 'https://open-design.ai/zh/pricing/';
const quota = { used: 18, total: 50 };

export function ProPlanPreview() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!open) {
      setLoading(true);
      return;
    }
    // Preview the pending state while this local fixture has no live request.
    const timer = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(timer);
  }, [open]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const showPanel = () => { cancelClose(); setOpen(true); };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => { setOpen(false); }, 160);
  };
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); }
    };
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);
  const percent = Math.round(quota.used / quota.total * 100);
  const percentLabel = new Intl.NumberFormat(locale, { style: 'percent' }).format(percent / 100);
  const balanceLabel = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(0);

  return (
    <div
      ref={root}
      className={styles.root}
      onPointerEnter={showPanel}
      onPointerLeave={scheduleClose}
      onFocus={showPanel}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancelClose();
          trigger.current?.focus();
          setOpen(false);
        }
      }}
    >
      <div className="entry-top-right-account-pill">
        <button
          ref={trigger}
          type="button"
          className="entry-top-right-credits"
          data-testid="pro-preview-trigger"
          aria-label={t('entry.proPreview.previewLabel')}
          aria-expanded={open}
          aria-controls={id}
          onClick={showPanel}
        >
          <PlanWordmark tier="pro" height={14} />
        </button>
      </div>
      <div
        id={id}
        className={`${styles.panel} ${open ? styles.open : ''}`}
        dir={isRtlLocale(locale) ? 'rtl' : 'ltr'}
        lang={locale}
        inert={!open ? true : undefined}
        aria-hidden={!open}
      >
        <div className={styles.membershipRow}>
          <div className={styles.membership}>
            <span>{t('entry.billingTierPro')}</span>
            <PlanWordmark tier="pro" height={14} />
          </div>
          <Button
            variant="primary-ghost"
            className={styles.consoleButton}
            onClick={() => window.open(pricingUrl, '_blank', 'noopener,noreferrer')}
          >
            {t('settings.amrUpgrade')}
          </Button>
        </div>
        <div className={`${styles.quotaModule} ${loading ? styles.loading : ''}`} aria-busy={loading}>
          {loading && (
            <div className={styles.skeletonOverlay} aria-hidden="true" data-testid="pro-preview-loading">
              <div className={styles.skeletonRow}>
                <span className={styles.skeleton} style={{ width: 64 }} />
                <span className={styles.skeleton} style={{ width: 72 }} />
              </div>
              <div className={`${styles.skeleton} ${styles.skeletonTrack}`} />
              <div className={`${styles.skeletonRow} ${styles.skeletonBalance}`}>
                <span className={styles.skeleton} style={{ width: 64 }} />
                <span className={styles.skeleton} style={{ width: 56 }} />
              </div>
            </div>
          )}
          <div className={styles.quotaContent} inert={loading ? true : undefined} aria-hidden={loading}>
          <div className={styles.quotaRow}>
            <span className={styles.period}>{t('entry.proPreview.week')}</span>
            <a
              className={styles.used}
              href={consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('entry.proPreview.quota')} · ${t('entry.proPreview.viewDetails')}`}
            >
              <span>{t('entry.proPreview.used', { percent: percentLabel })}</span>
              <Icon name="chevron-right" size={14} />
            </a>
          </div>
          <div className={styles.track} role="progressbar" aria-label={t('entry.proPreview.quota')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={percentLabel}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <a className={styles.balance} href={`${consoleUrl}&billing=recharge`} target="_blank" rel="noopener noreferrer">
            <span>{t('entry.proPreview.balance')}</span>
            <span className={styles.balanceValue}>
              <strong><bdi>{balanceLabel}</bdi></strong>
              <Icon name="chevron-right" size={14} />
            </span>
          </a>
          </div>
        </div>
      </div>
    </div>
  );
}
