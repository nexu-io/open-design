import { useT } from '../../i18n';

interface Props {
  round: number;
  total: number;
  composite?: number;
  threshold: number;
  scale: number;
}

/**
 * Visual separator between rounds inside the Theater stage. Renders the
 * round number ("Round 2 of 3") plus, once the round has landed, the
 * composite score against the threshold. The `composite` prop is left
 * undefined while the round is still streaming so the divider can show
 * "in progress" without claiming a score that doesn't exist yet.
 */
export function RoundDivider({ round, total, composite, threshold, scale }: Props) {
  const t = useT();
  const landed = typeof composite === 'number';
  return (
    <div
      className="theater-round-divider"
      role="separator"
      aria-label={t('critiqueTheater.roundLabel', { n: round, m: total })}
      data-status={landed ? 'landed' : 'in-progress'}
    >
      <span className="theater-round-label">
        {t('critiqueTheater.roundLabel', { n: round, m: total })}
      </span>
      {landed ? (
        <span
          className="theater-round-score"
          data-meets-threshold={composite! >= threshold ? 'true' : 'false'}
        >
          <span className="theater-round-score-value">
            {composite!.toFixed(1)}
          </span>
          <span className="theater-round-score-scale">/{scale}</span>
        </span>
      ) : null}
    </div>
  );
}
