import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import type { PanelistRole } from '@open-design/contracts/critique';
import type { CritiqueRound } from './state/reducer';

interface Props {
  role: PanelistRole;
  rounds: CritiqueRound[];
  activeRound: number;
  activePanelist: PanelistRole | null;
  scale: number;
}

const ROLE_LABEL_KEY: Record<PanelistRole, keyof Dict> = {
  designer: 'critiqueTheater.roleDesigner',
  critic: 'critiqueTheater.roleCritic',
  brand: 'critiqueTheater.roleBrand',
  a11y: 'critiqueTheater.roleA11y',
  copy: 'critiqueTheater.roleCopy',
};

/**
 * One row of the Theater stage representing a single panelist's
 * trajectory across every round. The lane is keyed by `data-role` so
 * the surrounding CSS can tint it from a role-specific token without
 * the component holding any hex literals. When this panelist is the
 * one currently speaking (`activePanelist === role` and the same
 * round), the lane gets `data-active="true"` so the parent can
 * highlight it.
 */
export function PanelistLane({
  role,
  rounds,
  activeRound,
  activePanelist,
  scale,
}: Props) {
  const t = useT();
  const label = t(ROLE_LABEL_KEY[role]);
  const totalMustFixes = rounds.reduce(
    (acc, r) => acc + (r.panelists[role]?.mustFixes.length ?? 0),
    0,
  );
  const isActive = activePanelist === role;
  return (
    <div
      className="theater-lane"
      role="group"
      aria-label={label}
      data-role={role}
      data-active={isActive ? 'true' : 'false'}
    >
      <header className="theater-lane-head">
        <span className="theater-lane-role">{label}</span>
        {totalMustFixes > 0 ? (
          <span className="theater-lane-mustfix">
            {t('critiqueTheater.mustFix', { n: totalMustFixes })}
          </span>
        ) : null}
      </header>
      <ol className="theater-lane-rounds">
        {rounds.map((round) => {
          const view = round.panelists[role];
          const score = view?.score;
          const isCurrent = round.n === activeRound && isActive;
          return (
            <li
              key={round.n}
              className="theater-lane-round"
              data-state={
                typeof score === 'number'
                  ? 'closed'
                  : view
                    ? 'open'
                    : 'pending'
              }
              data-current={isCurrent ? 'true' : 'false'}
            >
              <span className="theater-lane-round-n">R{round.n}</span>
              <span className="theater-lane-round-score">
                {typeof score === 'number' ? score.toFixed(1) : '·'}
              </span>
              {view && view.dims.length > 0 ? (
                <span
                  className="theater-lane-round-dims"
                  title={view.dims
                    .map((d) => `${d.name}: ${d.score.toFixed(1)}`)
                    .join(' · ')}
                  aria-hidden
                >
                  {view.dims.map((d) => (
                    <span
                      key={d.name}
                      className="theater-lane-round-dim"
                      data-meets-half={d.score >= scale / 2 ? 'true' : 'false'}
                    />
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
