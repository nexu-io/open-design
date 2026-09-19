import {
  OD_NEXT_AGENT_DECLARED_BLOCK_REASON,
  type ChatRunStatus,
  type StrategyTaskProjectionV2,
} from '@open-design/contracts';

/** Provider success exceptions; responseText must belong to this physical run. */
export function canRetainSuccessfulRunForBlockedStrategy(
  status: ChatRunStatus,
  strategyTask: StrategyTaskProjectionV2 | undefined,
  deliverableValid: boolean | undefined,
  projectDeliverableValid: boolean | undefined,
  responseText: string,
): boolean {
  if (status !== 'succeeded') return false;
  if (deliverableValid === true) return true;
  if (projectDeliverableValid === true && responseText.trim().length > 0) return true;
  return strategyTask?.blockedContext?.reasonCodes.includes(OD_NEXT_AGENT_DECLARED_BLOCK_REASON) === true
    && (strategyTask.blockedContext.visibleText?.trim().length ?? 0) > 0;
}
