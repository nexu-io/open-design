import type {
  DegradedReason,
  FailedCause,
  PanelEvent,
  PanelistRole,
  ParserWarningKind,
  RoundDecision,
  ShipStatus,
} from '@open-design/contracts/critique';

/**
 * Synthetic reducer action the host hooks (`useCritiqueStream`,
 * `useCritiqueReplay`) dispatch when their gating prop changes
 * (projectId switch, enabled flip, transcriptUrl swap). Lifts the
 * reducer back to idle so the surrounding UI cannot render a stale
 * critique that belonged to the previous project / transcript. Lives
 * in the action union (not as a separate setter) so the reducer
 * remains the single source of truth for state transitions.
 */
export interface CritiqueResetAction {
  type: '__reset__';
}

export type CritiqueAction = PanelEvent | CritiqueResetAction;

export interface CritiqueDimScore {
  name: string;
  score: number;
  note: string;
}

export interface CritiquePanelistView {
  dims: CritiqueDimScore[];
  mustFixes: string[];
  score?: number;
}

export interface CritiqueRound {
  n: number;
  composite?: number;
  /** Cumulative must-fix count across panelists for this round. */
  mustFix: number;
  decision?: RoundDecision;
  decisionReason?: string;
  panelists: Partial<Record<PanelistRole, CritiquePanelistView>>;
}

export interface CritiqueArtifactRef {
  projectId: string;
  artifactId: string;
}

export interface CritiqueRunConfig {
  cast: PanelistRole[];
  maxRounds: number;
  threshold: number;
  scale: number;
  protocolVersion: number;
}

export interface CritiqueParserWarning {
  kind: ParserWarningKind;
  position: number;
}

export interface CritiqueShipped {
  composite: number;
  round: number;
  status: ShipStatus;
  artifactRef: CritiqueArtifactRef;
  summary: string;
}

export interface CritiqueDegradedInfo {
  reason: DegradedReason;
  adapter: string;
}

export type CritiqueState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      runId: string;
      config: CritiqueRunConfig;
      rounds: CritiqueRound[];
      activeRound: number;
      activePanelist: PanelistRole | null;
      warnings: CritiqueParserWarning[];
    }
  | {
      phase: 'shipped';
      runId: string;
      config: CritiqueRunConfig;
      rounds: CritiqueRound[];
      warnings: CritiqueParserWarning[];
      final: CritiqueShipped;
    }
  | {
      phase: 'degraded';
      runId: string;
      config: CritiqueRunConfig | null;
      rounds: CritiqueRound[];
      warnings: CritiqueParserWarning[];
      degraded: CritiqueDegradedInfo;
    }
  | {
      phase: 'interrupted';
      runId: string;
      config: CritiqueRunConfig | null;
      rounds: CritiqueRound[];
      warnings: CritiqueParserWarning[];
      bestRound: number;
      composite: number;
    }
  | {
      phase: 'failed';
      runId: string;
      config: CritiqueRunConfig | null;
      rounds: CritiqueRound[];
      warnings: CritiqueParserWarning[];
      cause: FailedCause;
    };

export const initialState: CritiqueState = { phase: 'idle' };

function blankPanelist(): CritiquePanelistView {
  return { dims: [], mustFixes: [] };
}

/**
 * Look up an existing round by number, or seed a new one at the end of the
 * list. Panelists arrive interleaved with `round_end`, so we can't assume the
 * round we want is always at `rounds[rounds.length - 1]` (a stray late event
 * from a previous round would otherwise corrupt the in-flight round).
 */
function withRound(
  rounds: CritiqueRound[],
  n: number,
  mutate: (round: CritiqueRound) => void,
): CritiqueRound[] {
  const idx = rounds.findIndex((r) => r.n === n);
  if (idx === -1) {
    const seeded: CritiqueRound = { n, mustFix: 0, panelists: {} };
    mutate(seeded);
    return [...rounds, seeded].sort((a, b) => a.n - b.n);
  }
  const next = rounds.slice();
  const cloned: CritiqueRound = {
    ...next[idx]!,
    panelists: { ...next[idx]!.panelists },
  };
  mutate(cloned);
  next[idx] = cloned;
  return next;
}

function ensurePanelist(
  round: CritiqueRound,
  role: PanelistRole,
): CritiquePanelistView {
  const current = round.panelists[role] ?? blankPanelist();
  const cloned: CritiquePanelistView = {
    dims: current.dims.slice(),
    mustFixes: current.mustFixes.slice(),
    score: current.score,
  };
  round.panelists[role] = cloned;
  return cloned;
}

/**
 * Pure reducer for the Critique Theater run lifecycle. Driven by `PanelEvent`
 * (the contracts-level event shape that both the live SSE stream and the
 * replay path emit), so a single reducer powers both the in-flight panel and
 * the rerun replay. Terminal phases (`shipped`, `degraded`, `interrupted`,
 * `failed`) are sticky: further events for the same run are ignored. A
 * `run_started` for a NEW runId at any time resets the reducer so the UI can
 * launch consecutive runs without an explicit reset action.
 */
export function reduce(state: CritiqueState, action: CritiqueAction): CritiqueState {
  // Host-dispatched reset (project change, enabled flip, transcript
  // swap) always lifts us back to idle so a stale run from a prior
  // project/transcript cannot bleed into the new context. Lefarcen +
  // Siri-Ray + codex P2 on PR #1314.
  if (action.type === '__reset__') {
    return state.phase === 'idle' ? state : initialState;
  }
  // `run_started` is always accepted: from idle it boots a new run, and
  // mid-stream it discards any prior state and reboots cleanly (the daemon
  // does not multiplex two runs onto one SSE channel, so this only fires on
  // an intentional rerun).
  if (action.type === 'run_started') {
    const config: CritiqueRunConfig = {
      cast: action.cast.slice(),
      maxRounds: action.maxRounds,
      threshold: action.threshold,
      scale: action.scale,
      protocolVersion: action.protocolVersion,
    };
    return {
      phase: 'running',
      runId: action.runId,
      config,
      rounds: [],
      activeRound: 1,
      activePanelist: null,
      warnings: [],
    };
  }

  if (state.phase === 'idle') return state;
  if (state.runId !== action.runId) return state;

  // Terminal phases are sticky except for `run_started` (handled above) and
  // `parser_warning`, which is informational and can land late.
  if (
    state.phase === 'shipped'
    || state.phase === 'degraded'
    || state.phase === 'interrupted'
    || state.phase === 'failed'
  ) {
    if (action.type === 'parser_warning') {
      return {
        ...state,
        warnings: [...state.warnings, { kind: action.kind, position: action.position }],
      };
    }
    return state;
  }

  switch (action.type) {
    case 'panelist_open': {
      // Materialize the round + an empty panelist view so TheaterStage
      // can render the in-progress lane the instant the tag opens
      // (lefarcen + Siri-Ray P2 on PR #1314): without this, a stream
      // that emits only `panelist_open` after `run_started` would
      // leave `rounds = []` and the UI would render no current
      // round until a later `panelist_dim` arrived.
      const rounds = withRound(state.rounds, action.round, (round) => {
        ensurePanelist(round, action.role);
      });
      return {
        ...state,
        rounds,
        activePanelist: action.role,
        activeRound: action.round,
      };
    }
    case 'panelist_dim': {
      const rounds = withRound(state.rounds, action.round, (round) => {
        const panelist = ensurePanelist(round, action.role);
        panelist.dims.push({
          name: action.dimName,
          score: action.dimScore,
          note: action.dimNote,
        });
      });
      return { ...state, rounds };
    }
    case 'panelist_must_fix': {
      const rounds = withRound(state.rounds, action.round, (round) => {
        const panelist = ensurePanelist(round, action.role);
        panelist.mustFixes.push(action.text);
        round.mustFix += 1;
      });
      return { ...state, rounds };
    }
    case 'panelist_close': {
      const rounds = withRound(state.rounds, action.round, (round) => {
        const panelist = ensurePanelist(round, action.role);
        panelist.score = action.score;
      });
      // Closing a panelist clears the active highlight; the next `panelist_open`
      // will set it again.
      return { ...state, rounds, activePanelist: null };
    }
    case 'round_end': {
      const rounds = withRound(state.rounds, action.round, (round) => {
        round.composite = action.composite;
        round.decision = action.decision;
        round.decisionReason = action.reason;
      });
      // After a `continue` decision the next round is implicitly active. After
      // a `ship` the orchestrator will follow with `ship`, so leaving
      // `activeRound` pointing at the same round is fine — the terminal
      // transition will overwrite the state anyway.
      const nextActive
        = action.decision === 'continue' ? action.round + 1 : action.round;
      return {
        ...state,
        rounds,
        activeRound: nextActive,
        activePanelist: null,
      };
    }
    case 'ship':
      return {
        phase: 'shipped',
        runId: state.runId,
        config: state.config,
        rounds: state.rounds,
        warnings: state.warnings,
        final: {
          composite: action.composite,
          round: action.round,
          status: action.status,
          artifactRef: action.artifactRef,
          summary: action.summary,
        },
      };
    case 'degraded':
      return {
        phase: 'degraded',
        runId: state.runId,
        config: state.config,
        rounds: state.rounds,
        warnings: state.warnings,
        degraded: { reason: action.reason, adapter: action.adapter },
      };
    case 'interrupted':
      return {
        phase: 'interrupted',
        runId: state.runId,
        config: state.config,
        rounds: state.rounds,
        warnings: state.warnings,
        bestRound: action.bestRound,
        composite: action.composite,
      };
    case 'failed':
      return {
        phase: 'failed',
        runId: state.runId,
        config: state.config,
        rounds: state.rounds,
        warnings: state.warnings,
        cause: action.cause,
      };
    case 'parser_warning':
      return {
        ...state,
        warnings: [
          ...state.warnings,
          { kind: action.kind, position: action.position },
        ],
      };
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
