// Credits popover — opened from the ✨ credits chip in the nav-rail account row.
// Ported from the design demo (markup + classes are the demo's). The data is
// real (A-lane billing via the vela CLI 收口): plan/tier/balance come from the
// live billing summary, and 升级 links out to Vela Web where billing lives.

import { Icon } from './Icon';
import { useT } from '../i18n';

export interface CreditsInfo {
  /** Full plan name shown in the popover header (e.g. "团队版"). */
  planName: string;
  /** Short tier label (unused in the panel body; kept for parity with the chip). */
  tierLabel: string;
  /** Whether to show the 升级 CTA (owner/admin with a Vela Web billing URL). */
  showUpgrade: boolean;
  /** Remaining usable credits (top-line number). Null → unknown ("—"). */
  balance: number | null;
  /** Tip text explaining the plan's credit grant. */
  grantTip: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  info: CreditsInfo;
  onUpgrade: () => void;
  /** While an external billing surface is being opened (disables the 升级 button). */
  upgrading?: boolean;
  memberCreditNotice?: boolean;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function CreditsPanel({
  open,
  onClose,
  info,
  onUpgrade,
  upgrading = false,
  memberCreditNotice = false,
}: Props) {
  const t = useT();

  if (!open) return null;

  return (
    <>
      <div className="entry-nav-rail__menu-backdrop" onClick={onClose} />
      <div className="credits-panel" role="menu">
        <div className="credits-panel__head">
          <span className="credits-panel__plan">{info.planName}</span>
          {info.showUpgrade ? (
            <button
              type="button"
              className="credits-panel__upgrade"
              disabled={upgrading}
              onClick={onUpgrade}
            >
              {upgrading ? t('entry.creditsOpening') : t('entry.creditsUpgrade')}
            </button>
          ) : null}
        </div>

        <div className="credits-panel__divider" />

        <div className="credits-panel__row credits-panel__row--total">
          <span className="credits-panel__row-label">
            <Icon name="sparkles" size={15} />
            {t('entry.creditsRemaining')}
            <span className="credits-panel__help" title={info.grantTip} aria-label={info.grantTip}>
              <Icon name="info" size={13} />
            </span>
          </span>
          <span className="credits-panel__row-value">{info.balance != null ? fmt(info.balance) : '—'}</span>
        </div>

        <button type="button" className="credits-panel__usage" onClick={onClose}>
          {t('entry.creditsUsage')}
          <Icon name="chevron-right" size={14} />
        </button>

        {memberCreditNotice ? (
          <div className="credits-panel__member-notice">
            <strong>{t('entry.creditsMemberNoticeTitle')}</strong>
            <p>{t('entry.creditsMemberNoticeBody')}</p>
            <button type="button" onClick={onClose}>{t('entry.creditsMemberNoticeAction')}</button>
          </div>
        ) : null}
      </div>
    </>
  );
}
