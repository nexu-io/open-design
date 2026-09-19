import { OD_NEXT_AGENT_DECLARED_BLOCK_REASON } from '@open-design/contracts';

/**
 * The slice of a strategy-task projection this decision reads. Structural on
 * purpose: `server.ts` holds the run's projected task, the coordinator holds
 * the durable row, and both carry these fields under the same names.
 */
export interface BlockedRunOutcomeInput {
  outcome: string;
  blockedContext?: {
    reasonCodes: readonly string[];
    visibleText: string | null;
  } | null;
}

/**
 * Whether a `blocked` strategy verdict settles the physical run as a finished
 * turn rather than a failed one.
 *
 * The invariant: a block the agent declared on itself, with an explanation the
 * user can read, is the turn's outcome — not a failure to report. The OD Next
 * contract tells the agent to answer a turn it cannot act on in visible prose
 * and declare `outcome: blocked` ("your reply is what the user reads, the task
 * settles there"). Failing the run on top of that put the agent's finished
 * answer under a red card, and because the physical process exited 0 the
 * failure classifier could only call it an unexplained crash (OPEND-2565).
 *
 * Every other block is a gate the agent did not ask for — a missing Runtime
 * State, an unresolvable deliverable, an unproven session — and keeps failing
 * the run so the user is told something went wrong (OPEND-2953). The check is
 * keyed on the reason code, never on the presence of prose: a cheerful reply
 * next to a real protocol failure is the agent's ordinary answer, not an
 * account of the stop.
 */
export function agentDeclaredBlockSettlesRun(
  strategyTask: BlockedRunOutcomeInput | null | undefined,
): boolean {
  if (strategyTask?.outcome !== 'blocked') return false;
  const context = strategyTask.blockedContext;
  if (!context) return false;
  if (!context.reasonCodes.includes(OD_NEXT_AGENT_DECLARED_BLOCK_REASON)) return false;
  return (context.visibleText?.trim().length ?? 0) > 0;
}
