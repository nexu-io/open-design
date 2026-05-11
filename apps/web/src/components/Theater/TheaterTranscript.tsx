import { useT } from '../../i18n';
import type { CritiqueState } from './state/reducer';
import type { ReplaySpeed, ReplayStatus } from './hooks/useCritiqueReplay';
import { PanelistLane } from './PanelistLane';
import { ScoreTicker } from './ScoreTicker';

interface Props {
  state: CritiqueState;
  status: ReplayStatus;
  error: string | null;
  speed: ReplaySpeed;
  onSpeedChange: (next: ReplaySpeed) => void;
}

const SPEED_OPTIONS: Array<{ value: ReplaySpeed; key: keyof import('../../i18n/types').Dict }>
  = [
    { value: 'paused', key: 'critiqueTheater.replaySpeedPaused' },
    { value: 'instant', key: 'critiqueTheater.replaySpeedInstant' },
    { value: 'live', key: 'critiqueTheater.replaySpeedLive' },
    { value: { intervalMs: 250 }, key: 'critiqueTheater.replaySpeedFast' },
  ];

function speedKey(speed: ReplaySpeed): string {
  if (typeof speed === 'string') return speed;
  return `intervalMs:${speed.intervalMs}`;
}

/**
 * Read-only replay surface for a recorded transcript. Drives the same
 * reducer state shape the live stage uses, plus a speed picker hooked
 * into `useCritiqueReplay`. Renders the loading / error / empty paths
 * inline so a missing transcript URL is recoverable without unmounting
 * the host.
 */
export function TheaterTranscript({ state, status, error, speed, onSpeedChange }: Props) {
  const t = useT();

  if (status === 'loading') {
    return (
      <section className="theater-transcript" data-status="loading" aria-busy="true">
        <p className="theater-transcript-loading">
          {t('critiqueTheater.transcriptLoading')}
        </p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="theater-transcript" data-status="error" role="alert">
        <p className="theater-transcript-error">
          {t('critiqueTheater.transcriptError', { error: error ?? '' })}
        </p>
      </section>
    );
  }

  if (state.phase === 'idle' && status !== 'playing') {
    return (
      <section className="theater-transcript" data-status="empty">
        <p className="theater-transcript-empty">
          {t('critiqueTheater.transcriptEmpty')}
        </p>
      </section>
    );
  }

  const config
    = state.phase === 'idle'
      ? { cast: [], maxRounds: 3, threshold: 8, scale: 10, protocolVersion: 1 }
      : state.config ?? { cast: [], maxRounds: 3, threshold: 8, scale: 10, protocolVersion: 1 };
  const rounds = state.phase === 'idle' ? [] : state.rounds;
  const activeRound = state.phase === 'running' ? state.activeRound : config.maxRounds;
  const activePanelist = state.phase === 'running' ? state.activePanelist : null;

  return (
    <section
      className="theater-transcript"
      data-status={status}
      aria-label={t('critiqueTheater.replay')}
    >
      <header className="theater-transcript-head">
        <span className="theater-transcript-readonly">{t('critiqueTheater.readOnly')}</span>
        <label className="theater-transcript-speed-label">
          <span className="theater-transcript-speed-label-text">
            {t('critiqueTheater.replaySpeed')}
          </span>
          <select
            className="theater-transcript-speed"
            value={speedKey(speed)}
            onChange={(e) => {
              const next = SPEED_OPTIONS.find((opt) => speedKey(opt.value) === e.target.value);
              if (next) onSpeedChange(next.value);
            }}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={speedKey(opt.value)} value={speedKey(opt.value)}>
                {t(opt.key)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <ScoreTicker rounds={rounds} threshold={config.threshold} scale={config.scale} />
      <div className="theater-transcript-lanes">
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
