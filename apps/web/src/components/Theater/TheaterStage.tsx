import { useT } from '../../i18n';
import type { CritiqueState } from './state/reducer';
import { PanelistLane } from './PanelistLane';
import { ScoreTicker } from './ScoreTicker';
import { RoundDivider } from './RoundDivider';
import { InterruptButton } from './InterruptButton';
import { TheaterCollapsed } from './TheaterCollapsed';
import { TheaterDegraded } from './TheaterDegraded';

interface Props {
  state: CritiqueState;
  /** Fired when the user clicks Interrupt or presses Esc on a running run. */
  onInterrupt: () => void;
  /** Optional: true while a kill request is in flight. */
  interruptPending?: boolean;
}

/**
 * Top-level Theater surface. Renders the right view for the reducer's
 * current phase: nothing on idle, the live debate on running, the
 * collapsed summary on shipped/interrupted/failed, the degraded chip
 * on degraded. Hosts the InterruptButton (with its Esc keybind) so
 * Phase 9's wire-up only has to mount this single component into the
 * existing project workspace.
 */
export function TheaterStage({ state, onInterrupt, interruptPending = false }: Props) {
  const t = useT();

  if (state.phase === 'idle') return null;
  if (state.phase === 'degraded') {
    return (
      <TheaterDegraded reason={state.degraded.reason} adapter={state.degraded.adapter} />
    );
  }
  if (state.phase === 'shipped' || state.phase === 'interrupted' || state.phase === 'failed') {
    return <TheaterCollapsed state={state} />;
  }

  const { config, rounds, activeRound, activePanelist } = state;
  return (
    <section
      className="theater-stage"
      role="region"
      aria-label={t('critiqueTheater.userFacingName')}
      data-phase="running"
    >
      <header className="theater-stage-head">
        <h3 className="theater-stage-title">{t('critiqueTheater.userFacingName')}</h3>
        <InterruptButton pending={interruptPending} onInterrupt={onInterrupt} />
      </header>
      <ScoreTicker rounds={rounds} threshold={config.threshold} scale={config.scale} />
      <ol className="theater-stage-rounds" aria-label={t('critiqueTheater.consensus')}>
        {rounds.map((round) => (
          <li key={round.n} className="theater-stage-round">
            <RoundDivider
              round={round.n}
              total={config.maxRounds}
              composite={round.composite}
              threshold={config.threshold}
              scale={config.scale}
            />
          </li>
        ))}
      </ol>
      <div className="theater-stage-lanes">
        {config.cast.map((role) => (
          <PanelistLane
            key={role}
            role={role}
            rounds={rounds}
            activeRound={activeRound}
            activePanelist={activePanelist}
            scale={config.scale}
          />
        ))}
      </div>
    </section>
  );
}
