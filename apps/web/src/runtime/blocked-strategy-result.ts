import {
  OD_NEXT_AGENT_DECLARED_BLOCK_REASON,
  type ChatRunStatus,
  type StrategyTaskProjectionV2,
} from '@open-design/contracts';

/** Existing provider exceptions, shared with post-stream artifact recovery. */
export function canRetainSuccessfulRunForBlockedStrategy(
  status: ChatRunStatus,
  strategyTask: StrategyTaskProjectionV2 | undefined,
  deliverableValid: boolean | undefined,
): boolean {
  if (status !== 'succeeded') return false;
  if (deliverableValid === true) return true;
  return strategyTask?.blockedContext?.reasonCodes.includes(OD_NEXT_AGENT_DECLARED_BLOCK_REASON) === true
    && (strategyTask.blockedContext.visibleText?.trim().length ?? 0) > 0;
}
