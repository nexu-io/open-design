import { useT } from '../../i18n';
import type { CritiqueRound } from './state/reducer';

interface Props {
  rounds: CritiqueRound[];
  threshold: number;
  scale: number;
}

/**
 * Live composite trajectory across rounds. Renders one tick per round
 * that has a final composite, plus a horizontal threshold marker so the
 * reviewer can see at a glance whether the latest round cleared the bar.
 * Stays empty (just the threshold label) until the first round closes
 * so users do not see a misleading "0 / threshold" baseline.
 */
export function ScoreTicker({ rounds, threshold, scale }: Props) {
  const t = useT();
  const landed = rounds.filter((r): r is CritiqueRound & { composite: number } =>
    typeof r.composite === 'number',
  );
  const latest = landed[landed.length - 1];
  return (
    <div
      className="theater-score-ticker"
      role="status"
      aria-label={t('critiqueTheater.composite')}
      data-empty={landed.length === 0 ? 'true' : 'false'}
    >
      <div className="theater-score-row" aria-hidden>
        {landed.map((r) => (
          <span
            key={r.n}
            className="theater-score-tick"
            data-meets-threshold={r.composite >= threshold ? 'true' : 'false'}
            style={{ height: `${Math.max(8, Math.round((r.composite / scale) * 100))}%` }}
            title={`R${r.n}: ${r.composite.toFixed(1)} / ${scale}`}
          />
        ))}
        <span
          className="theater-score-threshold"
          style={{ bottom: `${Math.round((threshold / scale) * 100)}%` }}
          aria-hidden
        />
      </div>
      <div className="theater-score-meta">
        <span className="theater-score-label">
          {t('critiqueTheater.composite')}
        </span>
        <span className="theater-score-value">
          {latest ? latest.composite.toFixed(1) : '—'}
        </span>
        <span className="theater-score-threshold-label">
          {t('critiqueTheater.threshold')} {threshold.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
