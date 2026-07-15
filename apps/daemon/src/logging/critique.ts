/**
 * Critique Theater structured logger (Phase 12).
 *
 * Six events, one JSON object per line on stdout, namespaced
 * `critique`. Matches the JSON-line convention `cli.ts` and
 * `mcp-live-artifacts-server.ts` already write so an operator's
 * existing log pipeline (Loki, Cloudwatch, Datadog, etc.) ingests
 * critique events without a new adapter.
 *
 * Why a discriminated union instead of pino / winston: the daemon
 * already does JSON-per-line writes through `process.stdout`; adding
 * pino would either wrap that surface (a refactor outside Phase 12's
 * scope) or run two logger systems side by side. The thin wrapper
 * below tests via `process.stdout.write` capture and a future system
 * swap can replace the implementation without touching the call sites.
 */

export type CritiqueLogEvent =
  | {
      event: 'run_started';
      runId: string;
      adapter: string;
      skill: string;
      protocolVersion: number;
    }
  | {
      event: 'round_closed';
      runId: string;
      round: number;
      composite: number;
      mustFix: number;
      decision: 'continue' | 'ship';
    }
  | {
      event: 'run_shipped';
      runId: string;
      round: number;
      composite: number;
      status: string;
    }
  | {
      event: 'degraded';
      runId: string;
      reason: string;
      adapter: string;
    }
  | {
      event: 'parser_recover';
      runId: string;
      kind: string;
      position: number;
    }
  | {
      event: 'run_failed';
      runId: string;
      cause: string;
      error?: string;
    }
  // --- Loop Engine events (Phase 12: Loop Engineering) ---
  | {
      event: 'loop_disabled';
      projectId: string;
      runId: string;
    }
  | {
      event: 'loop_enabled';
      projectId: string;
      maxIterations: number;
      strategy: string;
    }
  | {
      event: 'loop_started';
      projectId: string;
      adapter: string;
      maxIterations: number;
      strategy: string;
    }
  | {
      event: 'loop_aborted';
      projectId: string;
      iteration: number;
      reason: string;
    }
  | {
      event: 'loop_iteration_start';
      projectId: string;
      iteration: number;
    }
  | {
      event: 'loop_fix_triggered';
      projectId: string;
      iteration: number;
      mustFixCount: number;
    }
  | {
      event: 'loop_fix_completed';
      projectId: string;
      iteration: number;
      fixDurationMs: number;
      artifactMime?: string;
    }
  | {
      event: 'loop_fix_failed';
      projectId: string;
      iteration: number;
      error: string;
    }
  | {
      event: 'loop_iteration_end';
      projectId: string;
      iteration: number;
      status: string;
      composite: number | null;
      converged: boolean;
      runDurationMs?: number;
    }
  | {
      event: 'loop_iteration_error';
      projectId: string;
      iteration: number;
      error: string;
    }
  | {
      event: 'loop_exhausted';
      projectId: string;
      totalIterations: number;
    }
  | {
      event: 'loop_lessons_loaded';
      projectId: string;
      adapter: string;
    }
  | {
      event: 'loop_lessons_persist_error';
      projectId: string;
      error: string;
    }
  | {
      event: 'loop_skills_distilled';
      projectId: string;
      lessonCount: number;
      categories: string[];
      outputPath: string;
    }
  | {
      event: 'loop_skills_distill_error';
      projectId: string;
      error: string;
    };

/**
 * Emit one JSON line for the given critique event. The timestamp is
 * ISO-8601 with millisecond precision so an aggregator that ingests
 * multiple log streams can stable-sort across them.
 */
export function logCritique(e: CritiqueLogEvent): void {
  const line = JSON.stringify({
    ...e,
    namespace: 'critique',
    timestamp: new Date().toISOString(),
  });
  process.stdout.write(line + '\n');
}
