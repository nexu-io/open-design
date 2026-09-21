import {
  OD_NEXT_AGENT_DECLARED_BLOCK_REASON,
  type ChatRunStatus,
  type StrategyTaskProjectionV2,
} from '@open-design/contracts';

/**
 * Whether a physical Run that succeeded keeps that success on screen although
 * the strategy task it ran for ended `blocked`. `responseText` must belong to
 * this physical Run.
 *
 * Three cases keep the success:
 *
 * - the Run wrote the canonical deliverable, or the project already holds one
 *   and this turn said something — the user has the file they asked for;
 * - the agent declared the block itself and explained it in its reply;
 * - the task was refused before it reached production and the agent replied.
 *   A greeting, an off-topic question, a request the agent declined to plan a
 *   build for: the reply is the whole outcome of that turn, the daemon keeps
 *   the Run's own clean exit, and nothing was owed that a red card could
 *   restore.
 *
 * A production block with prose beside it does not qualify. There the user
 * asked for a deliverable, the plan was frozen, and the gate refused the turn
 * because nothing usable was written; the prose next to that verdict is not an
 * account of the stop. Neither does an empty reply at any stage: a turn that
 * said nothing and produced nothing leaves the user with a blank, and the
 * failure card is the only thing telling them what happened.
 */
export function canRetainSuccessfulRunForBlockedStrategy(
  status: ChatRunStatus,
  strategyTask: StrategyTaskProjectionV2 | undefined,
  deliverableValid: boolean | undefined,
  projectDeliverableValid: boolean | undefined,
  responseText: string,
): boolean {
  if (status !== 'succeeded') return false;
  if (deliverableValid === true) return true;
  const replied = responseText.trim().length > 0;
  if (projectDeliverableValid === true && replied) return true;
  if (strategyTask !== undefined && strategyTask.inputStage !== 'production' && replied) return true;
  return strategyTask?.blockedContext?.reasonCodes.includes(OD_NEXT_AGENT_DECLARED_BLOCK_REASON) === true
    && (strategyTask.blockedContext.visibleText?.trim().length ?? 0) > 0;
}
