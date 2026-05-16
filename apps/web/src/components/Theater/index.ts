/**
 * Public surface of the Critique Theater component package
 * (Phase 8). Only what an external consumer like `ProjectWorkspace`
 * needs to mount the feature lives here. Internal helpers
 * (state/reducer.ts internals, sub-components like RoundDivider,
 * PanelistLane, ScoreTicker) are reachable directly from their own
 * paths when the Phase 9 wire-up needs them, but the barrel keeps
 * the canonical mount surface narrow so adding/removing internals
 * does not churn callers.
 */
export { CritiqueTheaterMount } from './CritiqueTheaterMount';
export { TheaterStage } from './TheaterStage';
export { TheaterCollapsed } from './TheaterCollapsed';
export { TheaterDegraded } from './TheaterDegraded';
export { TheaterTranscript } from './TheaterTranscript';
export { InterruptButton } from './InterruptButton';
export { useCritiqueStream } from './hooks/useCritiqueStream';
export { useCritiqueReplay } from './hooks/useCritiqueReplay';
export {
  useCritiqueTheaterEnabled,
  setCritiqueTheaterEnabled,
} from './hooks/useCritiqueTheaterEnabled';
export type {
  CritiqueState,
  CritiqueAction,
  CritiqueRound,
  CritiqueRunConfig,
  CritiqueShipped,
  CritiqueDegradedInfo,
  CritiquePanelistView,
  CritiqueDimScore,
} from './state/reducer';
