import type Database from 'better-sqlite3';
import type { CritiqueConfig, PanelEvent } from '@open-design/contracts/critique';
import { panelEventToSse } from '@open-design/contracts/critique';
import type { CritiqueSseEvent } from '@open-design/contracts/critique';
import { parseCritiqueStream } from './parser.js';
import {
  computeComposite,
  decideRound,
  selectFallbackRound,
  type RoundState,
} from './scoreboard.js';
import {
  insertCritiqueRun,
  updateCritiqueRun,
  type CritiqueRunRow,
} from './persistence.js';
import { writeTranscript } from './transcript.js';
import {
  MalformedBlockError,
  OversizeBlockError,
  MissingArtifactError,
} from './errors.js';

/**
 * SSE bus contract: the orchestrator emits CritiqueSseEvent variants here so
 * the existing /api/projects/:id/events stream can fan them out unchanged.
 * Implementations should be non-blocking; backpressure is the caller's job.
 */
export interface CritiqueSseBus {
  emit(event: CritiqueSseEvent): void;
}

export interface OrchestratorParams {
  runId: string;
  projectId: string;
  conversationId: string | null;
  artifactId: string;
  artifactDir: string;
  adapter: string;
  cfg: CritiqueConfig;
  db: Database.Database;
  bus: CritiqueSseBus;
  /**
   * Source of CLI stdout. The orchestrator is transport-agnostic: a real
   * spawn wrapper passes the child process stdout, tests pass a synthetic
   * iterable.
   */
  stdout: AsyncIterable<string>;
  /**
   * Optional abort signal. Aborting causes the orchestrator to flush
   * best-so-far state and emit critique.interrupted before returning.
   */
  signal?: AbortSignal;
}

export interface OrchestratorResult {
  status: CritiqueRunRow['status'];
  composite: number | null;
  rounds: CritiqueRunRow['rounds'];
  transcriptPath: string | null;
  artifactPath: string | null;
}

/**
 * Drives one Critique Theater run end-to-end:
 *   parse stdout -> collect events -> score per round -> persist -> emit SSE.
 *
 * @see specs/current/critique-theater.md § Wire protocol parser invariants
 *      and § Failure modes (recovery)
 */
export async function runOrchestrator(
  params: OrchestratorParams,
): Promise<OrchestratorResult> {
  const { runId, projectId, conversationId, artifactDir, adapter, cfg, db, bus, stdout } = params;
  const signal = params.signal;

  // Defensive entry: validate every CritiqueConfig numeric field before any side effect.
  if (!Number.isFinite(cfg.maxRounds) || cfg.maxRounds < 1) {
    throw new RangeError(`runOrchestrator: cfg.maxRounds must be a positive integer, got ${cfg.maxRounds}`);
  }
  if (!Number.isFinite(cfg.scoreScale) || cfg.scoreScale < 1) {
    throw new RangeError(`runOrchestrator: cfg.scoreScale must be a positive integer, got ${cfg.scoreScale}`);
  }
  if (!Number.isFinite(cfg.scoreThreshold) || cfg.scoreThreshold < 0) {
    throw new RangeError(`runOrchestrator: cfg.scoreThreshold must be >= 0, got ${cfg.scoreThreshold}`);
  }
  if (!Number.isFinite(cfg.perRoundTimeoutMs) || cfg.perRoundTimeoutMs < 1) {
    throw new RangeError(`runOrchestrator: cfg.perRoundTimeoutMs must be positive, got ${cfg.perRoundTimeoutMs}`);
  }
  if (!Number.isFinite(cfg.totalTimeoutMs) || cfg.totalTimeoutMs < 1) {
    throw new RangeError(`runOrchestrator: cfg.totalTimeoutMs must be positive, got ${cfg.totalTimeoutMs}`);
  }
  if (!Number.isFinite(cfg.parserMaxBlockBytes) || cfg.parserMaxBlockBytes < 1) {
    throw new RangeError(`runOrchestrator: cfg.parserMaxBlockBytes must be positive, got ${cfg.parserMaxBlockBytes}`);
  }

  // 1. Insert a 'running' row.
  insertCritiqueRun(db, {
    id: runId,
    projectId,
    conversationId,
    status: 'running' as CritiqueRunRow['status'],
    protocolVersion: cfg.protocolVersion,
  });

  const collectedEvents: PanelEvent[] = [];
  const roundStates = new Map<number, RoundState>();
  const completedRounds: RoundState[] = [];
  let artifactPath: string | null = null;
  let shipEvent: Extract<PanelEvent, { type: 'ship' }> | null = null;
  let finalStatus: CritiqueRunRow['status'] = 'failed';
  let finalComposite: number | null = null;
  let transcriptPath: string | null = null;

  // Total deadline.
  const totalDeadline = Date.now() + cfg.totalTimeoutMs;

  try {
    // Per-round timeout tracking.
    let roundDeadline: number | null = null;
    let currentRoundN: number | null = null;

    // Wrap parser with abort + total-timeout awareness.
    const timedSource = applyTimeouts(stdout, {
      signal,
      totalDeadline,
      getPerRoundDeadline: () => roundDeadline,
    });

    const parserOpts = {
      runId,
      adapter,
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
    };

    for await (const event of parseCritiqueStream(timedSource, parserOpts)) {
      collectedEvents.push(event);
      bus.emit(panelEventToSse(event));

      switch (event.type) {
        case 'run_started': {
          break;
        }

        case 'panelist_open': {
          if (!roundStates.has(event.round)) {
            roundStates.set(event.round, {
              n: event.round,
              scores: {},
              mustFix: 0,
              composite: 0,
            });
          }
          if (event.round !== currentRoundN) {
            currentRoundN = event.round;
            roundDeadline = Date.now() + cfg.perRoundTimeoutMs;
          }
          break;
        }

        case 'panelist_close': {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            rs.scores[event.role] = event.score;
            rs.composite = computeComposite(rs.scores, cfg.weights);
          }
          break;
        }

        case 'panelist_must_fix': {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            rs.mustFix += 1;
          }
          break;
        }

        case 'round_end': {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            rs.composite = event.composite;
            rs.mustFix = event.mustFix;
            completedRounds.push({ ...rs });
          }
          roundDeadline = null;
          break;
        }

        case 'ship': {
          shipEvent = event;
          break;
        }

        case 'panelist_dim': {
          // Extract designer round-1 ARTIFACT reference from dimNote is not
          // our job here; artifact path comes from the ship event's artifactRef
          // or from a panelist block. We store the artifactId from the ship event below.
          break;
        }

        default:
          break;
      }
    }

    // 3. Determine final status and composite.
    if (shipEvent !== null) {
      finalStatus = shipEvent.status;
      finalComposite = shipEvent.composite;
      artifactPath = `${artifactDir}/${shipEvent.artifactRef.artifactId || 'artifact'}`;
    } else {
      // No SHIP arrived - apply fallback policy.
      const fallback = selectFallbackRound(completedRounds, cfg.fallbackPolicy);
      if (fallback !== null) {
        finalStatus = 'below_threshold';
        finalComposite = fallback.composite;
        // Emit a synthetic ship event.
        const syntheticShip: Extract<PanelEvent, { type: 'ship' }> = {
          type: 'ship',
          runId,
          round: fallback.n,
          composite: fallback.composite,
          status: 'below_threshold',
          artifactRef: { projectId, artifactId: params.artifactId },
          summary: `Fallback: best round ${fallback.n} composite ${fallback.composite.toFixed(2)}`,
        };
        collectedEvents.push(syntheticShip);
        bus.emit(panelEventToSse(syntheticShip));
      } else {
        finalStatus = 'failed';
        finalComposite = null;
        const failedEvent: Extract<PanelEvent, { type: 'failed' }> = {
          type: 'failed',
          runId,
          cause: 'orchestrator_internal',
        };
        collectedEvents.push(failedEvent);
        bus.emit(panelEventToSse(failedEvent));
      }
    }
  } catch (err) {
    // Classify the error.
    if (err instanceof AbortError) {
      finalStatus = 'interrupted';
      const interruptedEvent: Extract<PanelEvent, { type: 'interrupted' }> = {
        type: 'interrupted',
        runId,
        bestRound: completedRounds.length > 0 ? (completedRounds[completedRounds.length - 1]?.n ?? 0) : 0,
        composite: completedRounds.length > 0 ? (completedRounds[completedRounds.length - 1]?.composite ?? 0) : 0,
      };
      collectedEvents.push(interruptedEvent);
      bus.emit(panelEventToSse(interruptedEvent));
    } else if (err instanceof TimeoutError) {
      finalStatus = 'timed_out';
      const failedEvent: Extract<PanelEvent, { type: 'failed' }> = {
        type: 'failed',
        runId,
        cause: err.cause,
      };
      collectedEvents.push(failedEvent);
      bus.emit(panelEventToSse(failedEvent));
    } else if (
      err instanceof MalformedBlockError ||
      err instanceof OversizeBlockError ||
      err instanceof MissingArtifactError
    ) {
      finalStatus = 'degraded';
      const reason =
        err instanceof MalformedBlockError ? 'malformed_block' :
        err instanceof OversizeBlockError ? 'oversize_block' :
        'missing_artifact';
      const degradedEvent: Extract<PanelEvent, { type: 'degraded' }> = {
        type: 'degraded',
        runId,
        reason,
        adapter,
      };
      collectedEvents.push(degradedEvent);
      bus.emit(panelEventToSse(degradedEvent));
    } else {
      finalStatus = 'failed';
      const failedEvent: Extract<PanelEvent, { type: 'failed' }> = {
        type: 'failed',
        runId,
        cause: 'orchestrator_internal',
      };
      collectedEvents.push(failedEvent);
      bus.emit(panelEventToSse(failedEvent));
    }
  }

  // Write transcript for all non-trivially-failed runs.
  if (finalStatus !== 'failed' || collectedEvents.length > 0) {
    try {
      const result = await writeTranscript(artifactDir, collectedEvents);
      transcriptPath = result.path;
    } catch {
      // Transcript write failure must not mask the primary outcome.
      transcriptPath = null;
    }
  }

  // Build rounds summary for persistence.
  const roundsSummary = completedRounds.map((r) => ({
    n: r.n,
    composite: r.composite,
    mustFix: r.mustFix,
    decision: decideRound(r.composite, r.mustFix, cfg) as 'continue' | 'ship',
  }));

  // Persist final state.
  updateCritiqueRun(db, runId, {
    status: finalStatus,
    score: finalComposite,
    rounds: roundsSummary,
    transcriptPath,
    artifactPath,
  });

  return {
    status: finalStatus,
    composite: finalComposite,
    rounds: roundsSummary,
    transcriptPath,
    artifactPath,
  };
}

// ---------------------------------------------------------------------------
// Internal timeout / abort utilities
// ---------------------------------------------------------------------------

class AbortError extends Error {
  constructor() {
    super('run aborted');
    this.name = 'AbortError';
  }
}

class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly cause: 'per_round_timeout' | 'total_timeout',
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

interface TimeoutOptions {
  signal: AbortSignal | undefined;
  totalDeadline: number;
  getPerRoundDeadline: () => number | null;
}

/**
 * Builds a Promise that rejects with TimeoutError after delayMs, or resolves
 * immediately when delayMs <= 0. Returns a cancel function to clear the timer.
 */
function makeTimeoutRace(
  delayMs: number,
  cause: 'per_round_timeout' | 'total_timeout',
): { promise: Promise<never>; cancel: () => void } {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let rejectFn!: (e: TimeoutError) => void;
  const promise = new Promise<never>((_, reject) => {
    rejectFn = reject;
    if (delayMs <= 0) {
      reject(new TimeoutError(`${cause} exceeded`, cause));
    } else {
      timerId = setTimeout(() => reject(new TimeoutError(`${cause} exceeded`, cause)), delayMs);
    }
  });
  const cancel = () => {
    if (timerId !== undefined) clearTimeout(timerId);
    // Prevent unhandled rejection after cancel.
    promise.catch(() => { /* intentionally swallowed */ });
  };
  void rejectFn; // suppress unused-variable warning
  return { promise, cancel };
}

/**
 * Wraps a source AsyncIterable<string> with abort and real-timer timeout
 * enforcement. Each call to iterator.next() is raced against the total-
 * deadline timer and the current per-round deadline timer so stalling
 * sources (no chunks arriving) are caught even when the source never yields.
 */
async function* applyTimeouts(
  source: AsyncIterable<string>,
  opts: TimeoutOptions,
): AsyncIterable<string> {
  const iter = source[Symbol.asyncIterator]();

  // Keep a single total timer running for the full lifetime of the source.
  const totalDelayMs = opts.totalDeadline - Date.now();
  const totalTimer = makeTimeoutRace(totalDelayMs, 'total_timeout');

  try {
    while (true) {
      // Check abort eagerly before each iteration.
      if (opts.signal?.aborted) {
        throw new AbortError();
      }

      // Build per-round timer for this iteration.
      const roundDeadline = opts.getPerRoundDeadline();
      const roundDelayMs = roundDeadline !== null ? roundDeadline - Date.now() : null;
      let roundTimer: { promise: Promise<never>; cancel: () => void } | null = null;
      if (roundDelayMs !== null) {
        roundTimer = makeTimeoutRace(roundDelayMs, 'per_round_timeout');
      }

      let iterResult: IteratorResult<string>;
      try {
        const races: Promise<unknown>[] = [iter.next(), totalTimer.promise];
        if (roundTimer !== null) races.push(roundTimer.promise);

        // AbortSignal race: if signal fires, reject immediately.
        if (opts.signal) {
          const abortPromise = new Promise<never>((_, reject) => {
            if (opts.signal!.aborted) {
              reject(new AbortError());
            } else {
              opts.signal!.addEventListener('abort', () => reject(new AbortError()), { once: true });
            }
          });
          races.push(abortPromise);
        }

        iterResult = await Promise.race(races) as IteratorResult<string>;
      } finally {
        roundTimer?.cancel();
      }

      if (iterResult.done) {
        break;
      }
      yield iterResult.value;
    }
  } finally {
    totalTimer.cancel();
    // Give the underlying iterator a chance to clean up.
    if (typeof iter.return === 'function') {
      await iter.return().catch(() => { /* ignore cleanup errors */ });
    }
  }

  // Final abort check after source exhausted.
  if (opts.signal?.aborted) {
    throw new AbortError();
  }
}
