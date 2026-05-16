import type { ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type Database from 'better-sqlite3';
import type { CritiqueConfig, PanelEvent } from '@open-design/contracts/critique';
import { panelEventToSse } from '@open-design/contracts/critique';
import type { CritiqueSseEvent } from '@open-design/contracts/critique';
import { parseCritiqueStream, type ShipArtifactPayload } from './parser.js';
import {
  ArtifactEmptyError,
  ArtifactTooLargeError,
  writeShipArtifact,
} from './artifact-writer.js';
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
  type CritiqueRunStatus,
} from './persistence.js';
import { writeTranscript } from './transcript.js';
import {
  MalformedBlockError,
  OversizeBlockError,
  MissingArtifactError,
} from './errors.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  critiqueCompositeScore,
  critiqueInterruptedTotal,
  critiqueMustFixTotal,
  critiqueParserErrorsTotal,
  critiqueProtocolVersion,
  critiqueRoundDurationMs,
  critiqueRoundsTotal,
  critiqueRunsTotal,
} from '../metrics/index.js';
import { logCritique } from '../logging/critique.js';

const tracer = trace.getTracer('@open-design/daemon/critique');

/**
 * Tolerance used when comparing the agent-supplied composite attribute on
 * <ROUND_END> / <SHIP> against the daemon's computed composite. Composites
 * are weighted floats so a tiny FP delta is normal; anything larger than this
 * is reported as a composite_mismatch parser warning.
 */
const COMPOSITE_TOLERANCE = 0.01;

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
  /**
   * SKILL.md id for the run, used as a Prometheus label so the dashboard
   * can break adapter performance down by skill. Optional because not
   * every spawn site has threaded it yet (Phase 12 follow-up). Defaults
   * to 'unknown' so the series shape stays stable.
   */
  skill?: string;
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
  /**
   * Optional handle to the spawned child process. When provided the
   * orchestrator calls child.kill('SIGTERM') on every non-clean termination
   * path (timeout, abort, parser error, child non-zero exit).
   */
  child?: Pick<ChildProcess, 'kill'>;
  /**
   * Resolves when the child process exits. Used to race parser completion
   * against an early child exit so a non-zero exit code is classified as
   * 'failed' rather than waiting for the parser to time out.
   */
  childExitPromise?: Promise<{ code: number | null; signal: string | null }>;
}

export interface OrchestratorResult {
  // The orchestrator only ever returns after a run reaches a terminal
  // outcome, so this is the public terminal-only union, not the wider
  // CritiquePersistedStatus that admits 'running' for live DB rows.
  status: CritiqueRunStatus;
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
  const skill = params.skill ?? 'unknown';
  // Phase 12 round-duration histogram needs the wall-clock time the first
  // panelist_open landed for each round, so we can subtract at round_end.
  const roundStartMs = new Map<number, number>();

  // Phase 12 outer trace span. No-op without an exporter wired; operators
  // who attach OTLP / Tempo / Honeycomb / Jaeger pick the span up
  // automatically through the existing `trace.getTracer` registry. Inner
  // per-round / per-chunk spans are a follow-up; the outer span alone
  // gives the trace a duration + final status + adapter/skill attributes,
  // which is what 80% of dashboards correlate runs by.
  const span = tracer.startSpan('critique.run', {
    attributes: {
      'critique.run_id': runId,
      'critique.adapter': adapter,
      'critique.skill': skill,
    },
  });

  // Phase 12 parser-warning helper. Three orchestrator-side checks emit
  // composite_mismatch / duplicate_ship as parser warnings; routing each
  // through this helper guarantees the metric bump, the log line, and
  // the SSE fan-out stay in lockstep. Parser-yielded warnings (from
  // `parseCritiqueStream` directly) hit the matching switch case below.
  const emitParserWarning = (
    kind: Extract<PanelEvent, { type: 'parser_warning' }>['kind'],
    position: number,
    collected: PanelEvent[],
  ): void => {
    const warning: Extract<PanelEvent, { type: 'parser_warning' }> = {
      type: 'parser_warning',
      runId,
      kind,
      position,
    };
    collected.push(warning);
    bus.emit(panelEventToSse(warning));
    critiqueParserErrorsTotal.inc({ kind, adapter });
    logCritique({ event: 'parser_recover', runId, kind, position });
  };
  const signal = params.signal;
  const child = params.child;
  const childExitPromise = params.childExitPromise;

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
    status: 'running',
    protocolVersion: cfg.protocolVersion,
  });

  const collectedEvents: PanelEvent[] = [];
  const roundStates = new Map<number, RoundState>();
  const completedRounds: RoundState[] = [];
  let artifactPath: string | null = null;
  let shipEvent: Extract<PanelEvent, { type: 'ship' }> | null = null;
  // Buffered SHIP artifact body coming from the parser side-channel. The
  // body intentionally never travels on the SSE wire (the SHIP PanelEvent
  // doesn't carry it), so the orchestrator captures it here, writes it to
  // disk after decideRound runs, and pins artifactPath on the run row.
  //
  // Wrapped in a single-property box rather than a `let pendingArtifact`
  // so TypeScript's control-flow analysis doesn't narrow it to `never`
  // at the read site below. The parser callback only mutates the box's
  // `value` field; without the box, tsc with strict / noImplicitAny would
  // see the closure assignment as opaque and conclude the field is
  // unreachable.
  const artifactBuffer: { value: ShipArtifactPayload | null } = { value: null };
  let finalStatus: CritiqueRunStatus = 'failed';
  let finalComposite: number | null = null;
  let transcriptPath: string | null = null;

  // Total deadline.
  const totalDeadline = Date.now() + cfg.totalTimeoutMs;

  // Helper: SIGTERM the child on non-clean termination paths.
  const killChild = () => { child?.kill('SIGTERM'); };

  // Build a rejection promise for early child exit with non-zero code or
  // signal-terminated exit. Resolves (not rejects) only for a clean code 0
  // exit with no signal so the parser loop can finish naturally. A non-null
  // signal means the child was killed (by us, by the user via /cancel, by
  // the OS, etc.) and is treated as terminal so the orchestrator can persist
  // 'interrupted' instead of falling through to the no-SHIP fallback path
  // and reporting below_threshold for a user-cancelled run.
  const childExitRace: Promise<never> | null = childExitPromise
    ? childExitPromise.then(({ code, signal: exitSignal }) => {
        if (exitSignal !== null) {
          return Promise.reject(new ChildSignaledError(exitSignal));
        }
        if (code !== 0 && code !== null) {
          return Promise.reject(new ChildExitError(code));
        }
        // Clean exit with no signal: let the parser finish naturally.
        return new Promise<never>(() => { /* intentionally pending */ });
      })
    : null;

  try {
    // Per-round timeout tracking.
    let roundDeadline: number | null = null;
    let currentRoundN: number | null = null;

    // Wrap parser with abort + total-timeout awareness.
    const timedSource = applyTimeouts(stdout, {
      signal,
      totalDeadline,
      getPerRoundDeadline: () => roundDeadline,
      childExitRace,
    });

    const parserOpts = {
      runId,
      adapter,
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
      projectId,
      artifactId: params.artifactId,
      // Side-channel for the SHIP <ARTIFACT> body. The parser invokes this
      // synchronously right before yielding the ship PanelEvent, so the
      // orchestrator has the body in hand by the time decideRound runs.
      // Only the LAST artifact is retained: the parser already enforces
      // that a second SHIP becomes a parser_warning, so this branch is only
      // hit on the legitimate first SHIP per run.
      onArtifact: (payload: ShipArtifactPayload) => {
        artifactBuffer.value = payload;
      },
    };

    for await (const event of parseCritiqueStream(timedSource, parserOpts)) {
      // Ship events are buffered, not emitted raw. The normalized ship event
      // (with daemon-authoritative status/composite from decideRound(...))
      // is emitted after the loop so SSE clients and the transcript only
      // ever see daemon-scored ship payloads, not the agent's raw claim.
      if (event.type !== 'ship') {
        collectedEvents.push(event);
        bus.emit(panelEventToSse(event));
      }

      switch (event.type) {
        case 'run_started': {
          logCritique({
            event: 'run_started',
            runId,
            adapter,
            skill,
            protocolVersion: event.protocolVersion,
          });
          critiqueProtocolVersion.set(
            { version: String(event.protocolVersion) },
            event.protocolVersion,
          );
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
          // Track first panelist_open wall-clock per round for the
          // round_duration_ms histogram. Subsequent panelist_open events
          // in the same round leave the start time untouched.
          if (!roundStartMs.has(event.round)) {
            roundStartMs.set(event.round, Date.now());
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
          // The wire-level panelist_must_fix event carries `text` but no
          // dim name. Bump with `dim: 'unspecified'` so the dashboard
          // panel stays stable: when a future parser revision adds a
          // `dim` field, the label flips to the real value without a
          // breaking metric rename.
          critiqueMustFixTotal.inc({
            panelist: event.role,
            dim: 'unspecified',
            adapter,
            skill,
          });
          break;
        }

        case 'round_end': {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            // Daemon-side composite (computed via configured weights from
            // panelist_close events) is the source of truth. The agent's
            // <ROUND_END composite="..."> attribute is advisory: if it
            // diverges beyond COMPOSITE_TOLERANCE we emit a composite_mismatch
            // parser_warning, but the daemon value is what scores and persists.
            // Same policy for mustFix, which is tallied from panelist_must_fix
            // events.
            if (Math.abs(event.composite - rs.composite) > COMPOSITE_TOLERANCE
              || event.mustFix !== rs.mustFix) {
              emitParserWarning('composite_mismatch', 0, collectedEvents);
            }
            completedRounds.push({ ...rs });
          }
          roundDeadline = null;
          // Siri-Ray P2 on PR #1485: observe / log the daemon-authoritative
          // round values (rs.composite, rs.mustFix), not the agent's
          // <ROUND_END composite=...> attribute. If they disagree the
          // composite_mismatch warning above already flagged it; persistence
          // and ship decisions use rs, so dashboards must too. Skip the
          // bumps entirely when rs is missing (degenerate round_end with no
          // matching panelist_open): a metric series labeled with an
          // untrusted composite is worse than one missing sample.
          if (rs !== undefined) {
            critiqueRoundsTotal.inc({ adapter, skill });
            critiqueCompositeScore.observe({ adapter, skill }, rs.composite);
            const startedAtMs = roundStartMs.get(event.round);
            if (startedAtMs !== undefined) {
              critiqueRoundDurationMs.observe(
                { adapter, skill, round: String(event.round) },
                Date.now() - startedAtMs,
              );
            }
            logCritique({
              event: 'round_closed',
              runId,
              round: event.round,
              composite: rs.composite,
              mustFix: rs.mustFix,
              decision: event.decision,
            });
          }
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

        case 'parser_warning': {
          // Parser-yielded warnings (score_clamped, unknown_role, etc.).
          // Orchestrator-side warnings go through `emitParserWarning`
          // and never re-enter this loop.
          critiqueParserErrorsTotal.inc({ kind: event.kind, adapter });
          logCritique({
            event: 'parser_recover',
            runId,
            kind: event.kind,
            position: event.position,
          });
          break;
        }

        default:
          break;
      }
    }

    // 3. Determine final status and composite.
    //
    // The agent's raw <SHIP> was buffered (not emitted) by the parser loop
    // above. We resolve it here against the daemon scoreboard, then emit a
    // single normalized ship event so the transcript and SSE bus reflect the
    // daemon-authoritative status/composite, not the agent's claim.
    let resolvedShip = shipEvent;
    if (resolvedShip !== null) {
      const shippedRound = completedRounds.find((r) => r.n === resolvedShip!.round);
      if (shippedRound === undefined) {
        // The agent claimed a SHIP for a round that was never closed by the
        // daemon. Trusting it would re-open the scoring-integrity hole this
        // patch is meant to close, so we drop the agent ship, emit a
        // parser_warning, and fall through to the no-SHIP fallback policy.
        emitParserWarning('duplicate_ship', 0, collectedEvents);
        resolvedShip = null;
      }
    }

    if (resolvedShip !== null) {
      // Daemon-authoritative scoring: derive status from decideRound(...)
      // using the daemon's computed composite/mustFix rather than the
      // agent's <SHIP composite=... status=...> attributes. A composite
      // divergence larger than COMPOSITE_TOLERANCE emits composite_mismatch.
      const ship = resolvedShip;
      const shippedRound = completedRounds.find((r) => r.n === ship.round)!;
      if (Math.abs(ship.composite - shippedRound.composite) > COMPOSITE_TOLERANCE) {
        emitParserWarning('composite_mismatch', 0, collectedEvents);
      }
      const decision = decideRound(shippedRound.composite, shippedRound.mustFix, cfg);
      finalStatus = decision === 'ship' ? 'shipped' : 'below_threshold';
      finalComposite = shippedRound.composite;

      // Build the daemon-authoritative ship event payload now, but DO NOT
      // emit it yet. SSE clients react to critique.ship by fetching the
      // artifact endpoint, so the file must be on disk AND the row's
      // artifactPath must be populated before the event goes out;
      // otherwise the client races us and gets a 404 against a row that
      // is about to gain its path on the next finalize call. Order:
      //   write file -> persist artifactPath on row -> emit ship event.
      // (lefarcen P1 on PR #1085.)
      const normalizedShip: Extract<PanelEvent, { type: 'ship' }> = {
        type: 'ship',
        runId,
        round: shippedRound.n,
        composite: shippedRound.composite,
        status: finalStatus,
        artifactRef: { projectId, artifactId: params.artifactId },
        summary: ship.summary,
      };

      // Persist the SHIP artifact body now that the row is being finalized.
      // Failures here are logged but do not block finalization: the run
      // still goes terminal so the orchestrator's caller can drive the chat
      // run lifecycle, and the artifact endpoint will return 404 instead of
      // pointing at a missing file. Phase 14 (artifact backfill) will fill
      // in older rows that were created before this code path existed.
      const captured = artifactBuffer.value;
      if (captured !== null) {
        try {
          await fs.mkdir(artifactDir, { recursive: true });
          const written = await writeShipArtifact(
            artifactDir,
            captured.body,
            captured.mime,
            { maxBytes: cfg.parserMaxBlockBytes },
          );
          artifactPath = written.absPath;
          // Pin artifactPath on the row BEFORE we emit critique.ship,
          // so the GET /artifact endpoint sees the path the moment a
          // client reacts to the SSE event. Without this incremental
          // patch the row stays at artifactPath=null until the
          // bottom-of-orchestrator updateCritiqueRun fires, which is
          // after any client request triggered by critique.ship.
          updateCritiqueRun(db, runId, { artifactPath });
        } catch (err) {
          // ArtifactTooLargeError / ArtifactEmptyError are agent-side
          // problems (the parser already validated non-empty, so empty
          // here means the agent shipped a CDATA-only body). Filesystem
          // errors are environment problems. Either way, leaving
          // artifactPath null makes the run still finalize and the ship
          // event still emit; the artifact endpoint will 404 instead of
          // claiming bytes that don't exist.
          if (
            err instanceof ArtifactTooLargeError
            || err instanceof ArtifactEmptyError
          ) {
            console.warn(
              `[critique] runId=${runId}: refusing to persist ship artifact (${err.code}): ${err.message}`,
            );
          } else {
            console.warn(
              `[critique] runId=${runId}: ship artifact write failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
          artifactPath = null;
        }
      } else {
        // SHIP arrived without an <ARTIFACT> side-channel payload. The
        // parser refuses to yield a ship event in this state (it throws
        // MissingArtifactError), so reaching this branch means the parser
        // contract is violated. Surface as a warning rather than crashing
        // the orchestrator; the transcript still records the ship event.
        console.warn(
          `[critique] runId=${runId}: ship event reached orchestrator without an artifact payload; parser contract violated`,
        );
        artifactPath = null;
      }

      // File is on disk, row knows about it. Now emit critique.ship so
      // SSE subscribers can fetch /artifact without racing the writer.
      collectedEvents.push(normalizedShip);
      bus.emit(panelEventToSse(normalizedShip));
    } else {
      // No SHIP arrived (or the agent SHIP was rejected as malformed above).
      // Apply fallback policy over the daemon's closed rounds.
      killChild();
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
    // All non-clean termination paths: SIGTERM the child.
    killChild();

    // Classify the error.
    if (err instanceof AbortError) {
      finalStatus = 'interrupted';
      // Defect 7: ship best-so-far when at least one round completed.
      const fallback = completedRounds.length > 0
        ? selectFallbackRound(completedRounds, cfg.fallbackPolicy)
        : null;
      if (fallback !== null) {
        finalComposite = fallback.composite;
        const syntheticShip: Extract<PanelEvent, { type: 'ship' }> = {
          type: 'ship',
          runId,
          round: fallback.n,
          composite: fallback.composite,
          status: 'interrupted',
          artifactRef: { projectId, artifactId: params.artifactId },
          summary: `Interrupted after round ${fallback.n}, best composite ${fallback.composite.toFixed(2)}`,
        };
        collectedEvents.push(syntheticShip);
        bus.emit(panelEventToSse(syntheticShip));
      }
      const interruptedEvent: Extract<PanelEvent, { type: 'interrupted' }> = {
        type: 'interrupted',
        runId,
        bestRound: completedRounds.length > 0 ? (completedRounds[completedRounds.length - 1]?.n ?? 0) : 0,
        composite: finalComposite ?? 0,
      };
      collectedEvents.push(interruptedEvent);
      bus.emit(panelEventToSse(interruptedEvent));
    } else if (err instanceof TimeoutError) {
      finalStatus = 'timed_out';
      // Defect 7: ship best-so-far when at least one round completed.
      const fallback = completedRounds.length > 0
        ? selectFallbackRound(completedRounds, cfg.fallbackPolicy)
        : null;
      if (fallback !== null) {
        finalComposite = fallback.composite;
        const syntheticShip: Extract<PanelEvent, { type: 'ship' }> = {
          type: 'ship',
          runId,
          round: fallback.n,
          composite: fallback.composite,
          status: 'timed_out',
          artifactRef: { projectId, artifactId: params.artifactId },
          summary: `Timed out after round ${fallback.n}, best composite ${fallback.composite.toFixed(2)}`,
        };
        collectedEvents.push(syntheticShip);
        bus.emit(panelEventToSse(syntheticShip));
      }
      const failedEvent: Extract<PanelEvent, { type: 'failed' }> = {
        type: 'failed',
        runId,
        cause: err.cause,
      };
      collectedEvents.push(failedEvent);
      bus.emit(panelEventToSse(failedEvent));
    } else if (err instanceof ChildExitError) {
      finalStatus = 'failed';
      const failedEvent: Extract<PanelEvent, { type: 'failed' }> = {
        type: 'failed',
        runId,
        cause: 'cli_exit_nonzero',
      };
      collectedEvents.push(failedEvent);
      bus.emit(panelEventToSse(failedEvent));
    } else if (err instanceof ChildSignaledError) {
      // Signal-terminated child (e.g. SIGTERM from /api/runs/:id/cancel)
      // is classified as 'interrupted' so the persisted critique row
      // reflects the actual cause (user/operator interruption) rather
      // than getting flushed through the no-SHIP fallback as
      // 'below_threshold'. If at least one round closed cleanly, ship
      // the best-so-far via selectFallbackRound, mirroring the abort path.
      finalStatus = 'interrupted';
      const fallback = completedRounds.length > 0
        ? selectFallbackRound(completedRounds, cfg.fallbackPolicy)
        : null;
      if (fallback !== null) {
        finalComposite = fallback.composite;
        const syntheticShip: Extract<PanelEvent, { type: 'ship' }> = {
          type: 'ship',
          runId,
          round: fallback.n,
          composite: fallback.composite,
          status: 'interrupted',
          artifactRef: { projectId, artifactId: params.artifactId },
          summary: `Child terminated by signal ${err.signal} after round ${fallback.n}, best composite ${fallback.composite.toFixed(2)}`,
        };
        collectedEvents.push(syntheticShip);
        bus.emit(panelEventToSse(syntheticShip));
      }
      const interruptedEvent: Extract<PanelEvent, { type: 'interrupted' }> = {
        type: 'interrupted',
        runId,
        bestRound: completedRounds.length > 0
          ? (completedRounds[completedRounds.length - 1]?.n ?? 0)
          : 0,
        composite: finalComposite ?? 0,
      };
      collectedEvents.push(interruptedEvent);
      bus.emit(panelEventToSse(interruptedEvent));
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

  // Phase 12 terminal-status observability. Bumps runs_total once per
  // run with the resolved status; runs that took the interrupt path
  // also bump interrupted_total so the dashboard's user-interrupt
  // panel reads off a labeled counter rather than a status filter.
  // Logs the matching structured event so an ingest pipeline can key
  // on namespace=critique + event=run_shipped/run_failed/degraded.
  critiqueRunsTotal.inc({ status: finalStatus, adapter, skill });
  switch (finalStatus) {
    case 'shipped':
    case 'below_threshold': {
      logCritique({
        event: 'run_shipped',
        runId,
        round: completedRounds.length > 0
          ? (completedRounds[completedRounds.length - 1]?.n ?? 0)
          : 0,
        composite: finalComposite ?? 0,
        status: finalStatus,
      });
      break;
    }
    case 'interrupted': {
      critiqueInterruptedTotal.inc({ adapter });
      logCritique({ event: 'run_failed', runId, cause: 'interrupted' });
      break;
    }
    case 'timed_out': {
      logCritique({ event: 'run_failed', runId, cause: 'timed_out' });
      break;
    }
    case 'failed': {
      logCritique({ event: 'run_failed', runId, cause: 'orchestrator_internal' });
      break;
    }
    case 'degraded': {
      logCritique({
        event: 'degraded',
        runId,
        reason: 'orchestrator_classified',
        adapter,
      });
      break;
    }
    default:
      break;
  }

  // Persist final state.
  updateCritiqueRun(db, runId, {
    status: finalStatus,
    score: finalComposite,
    rounds: roundsSummary,
    transcriptPath,
    artifactPath,
  });

  // Stamp the OTel span with the resolved terminal status before ending
  // it, so a downstream tracing UI can filter by status without joining
  // back to the Prometheus runs_total counter.
  span.setAttribute('critique.final_status', finalStatus);
  if (finalComposite !== null) {
    span.setAttribute('critique.final_composite', finalComposite);
  }
  if (finalStatus === 'failed' || finalStatus === 'timed_out') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: finalStatus });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();

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

/** Thrown when the child process exits with a non-zero code before the parser finishes. */
class ChildExitError extends Error {
  constructor(public readonly code: number) {
    super(`child exited with code ${code}`);
    this.name = 'ChildExitError';
  }
}

/**
 * Thrown when the child process is signal-terminated (SIGTERM, SIGINT, etc.)
 * before the parser finishes. From the orchestrator's perspective this is
 * always treated as 'interrupted': the daemon kills the child via
 * /api/runs/:id/cancel, the user kills it manually, or the OS terminates it.
 * Either way the run was cut short externally and shouldn't fall through to
 * the no-SHIP fallback path that would persist below_threshold.
 */
class ChildSignaledError extends Error {
  constructor(public readonly signal: string) {
    super(`child terminated by signal ${signal}`);
    this.name = 'ChildSignaledError';
  }
}

interface TimeoutOptions {
  signal: AbortSignal | undefined;
  totalDeadline: number;
  getPerRoundDeadline: () => number | null;
  /** When provided, races each iteration against a child-exit rejection. */
  childExitRace: Promise<never> | null;
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

        // Child-exit race: if the child exits non-zero before the parser
        // finishes, surface ChildExitError so the run is classified as
        // 'failed' with cause 'cli_exit_nonzero' rather than waiting for
        // the total timeout.
        if (opts.childExitRace !== null) {
          races.push(opts.childExitRace);
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
    // Give the underlying iterator a chance to clean up. Use a 200ms timeout
    // so a stalling generator (e.g. one stuck in await new Promise(() => {}))
    // never blocks the orchestrator teardown path indefinitely.
    if (typeof iter.return === 'function') {
      await Promise.race([
        iter.return().catch(() => { /* ignore cleanup errors */ }),
        new Promise<void>((resolve) => setTimeout(resolve, 200)),
      ]);
    }
  }

  // Final abort check after source exhausted.
  if (opts.signal?.aborted) {
    throw new AbortError();
  }
}
