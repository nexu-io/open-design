import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import type { ShipStatus } from '@open-design/contracts/critique';
import type { CritiqueState } from './state/reducer';

interface Props {
  state: Extract<CritiqueState, { phase: 'shipped' | 'interrupted' | 'failed' }>;
}

const SHIP_BADGE_KEY: Record<ShipStatus, keyof Dict> = {
  shipped: 'critiqueTheater.shippedBadge',
  below_threshold: 'critiqueTheater.belowThresholdBadge',
  timed_out: 'critiqueTheater.timedOutBadge',
  interrupted: 'critiqueTheater.interrupted',
};

/**
 * Compact post-run summary that replaces the live stage once a run
 * has settled. Renders a single-line badge with the composite, the
 * round it shipped at, and a status tag (shipped / below_threshold /
 * interrupted / timed_out / failed). Designed to live next to the
 * generated artifact in the chat surface without dominating it.
 */
export function TheaterCollapsed({ state }: Props) {
  const t = useT();
  if (state.phase === 'shipped') {
    const { final } = state;
    return (
      <div
        className="theater-collapsed"
        role="status"
        data-phase="shipped"
        data-ship-status={final.status}
      >
        <span className="theater-collapsed-badge">{t(SHIP_BADGE_KEY[final.status])}</span>
        <span className="theater-collapsed-summary">
          {t('critiqueTheater.shippedSummary', {
            round: final.round,
            composite: final.composite.toFixed(1),
          })}
        </span>
      </div>
    );
  }
  if (state.phase === 'interrupted') {
    return (
      <div className="theater-collapsed" role="status" data-phase="interrupted">
        <span className="theater-collapsed-badge">
          {t('critiqueTheater.interrupted')}
        </span>
        <span className="theater-collapsed-summary">
          {t('critiqueTheater.interruptedSummary', {
            round: state.bestRound,
            composite: state.composite.toFixed(1),
          })}
        </span>
      </div>
    );
  }
  // failed
  const failedReasonKey: keyof Dict = (() => {
    switch (state.cause) {
      case 'cli_exit_nonzero':
        return 'critiqueTheater.failedReasonCliExit';
      case 'per_round_timeout':
        return 'critiqueTheater.failedReasonPerRoundTimeout';
      case 'total_timeout':
        return 'critiqueTheater.failedReasonTotalTimeout';
      case 'orchestrator_internal':
        return 'critiqueTheater.failedReasonOrchestrator';
    }
  })();
  return (
    <div className="theater-collapsed" role="status" data-phase="failed" data-cause={state.cause}>
      <span className="theater-collapsed-badge">
        {t('critiqueTheater.failedHeading')}
      </span>
      <span className="theater-collapsed-summary">{t(failedReasonKey)}</span>
    </div>
  );
}
