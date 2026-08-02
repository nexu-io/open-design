/**
 * `od run cost` copy for the cases where there is no report to print.
 *
 * WHY THIS IS NOT IN `cli.ts`. That file carries `// @ts-nocheck`, so a type
 * annotation written there is decorative — it cannot make the compiler enforce
 * anything. Declaring the map here, in a checked module, means the `Record` over
 * the contract's reason union is a REAL exhaustiveness guard: adding a new
 * `unavailableReason` to `RunCostResponse` fails `pnpm typecheck` until this
 * map explains it, instead of silently degrading to a generic one-liner.
 *
 * It also removes the TDZ hazard that forced the map to be hoisted to the top of
 * `cli.ts`: an imported binding is initialized before the importing module's
 * body runs, so the dispatch table can reach it whenever it likes.
 */
import type { RunCostResponse } from '@open-design/contracts';

export const RUN_COST_UNAVAILABLE: Record<
  NonNullable<RunCostResponse['unavailableReason']>,
  string
> = {
  'no-event-log':
    'no event log on disk for this run (pruned, or it predates event persistence)',
  // Zero frames has two causes and this must not assert the wrong one: the run
  // may never have reached a model call, OR the agent's stream family may not
  // report usage at all.
  'no-usage-frames':
    'the event log carries no usage at all — either the run made no model call, or this agent stream does not report usage',
  // Usage WAS reported, but once for the whole run, so there is no per-call
  // context curve to decompose. Naming the agent's stream family as the cause
  // matters: this is not a property of the run, and re-running it changes
  // nothing. Only the json-event-stream family (OpenCode) reports per call.
  'aggregate-usage-only':
    'this agent reports usage once per run, not per model call, so there is no context curve to decompose — cost decomposition currently needs an OpenCode-family run',
};

/** Fallback for a body whose reason is absent or unrecognized at runtime. */
export const RUN_COST_UNAVAILABLE_FALLBACK = 'no cost data available';

/**
 * The line `od run cost` prints instead of a report. Kept next to the map so a
 * new reason cannot be added without deciding what the CLI says about it.
 */
export function runCostUnavailableMessage(reason: unknown): string {
  if (typeof reason !== 'string') return RUN_COST_UNAVAILABLE_FALLBACK;
  return (
    (RUN_COST_UNAVAILABLE as Record<string, string | undefined>)[reason] ??
    RUN_COST_UNAVAILABLE_FALLBACK
  );
}
