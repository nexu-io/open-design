import type {
  ChatMessage,
  ChatTaskExecutionAnalytics,
} from '@open-design/contracts';
import type { TrackingRunRecoveryActionType } from '@open-design/contracts/analytics';

export function runAgentProviderId(agentId: string): string {
  if (agentId === 'amr') return 'amr';
  if (agentId === 'claude') return 'claude_code';
  if (agentId === 'codex') return 'codex_cli';
  return agentId;
}

export function buildInitialTaskAnalytics(
  taskExecutionId: string,
): ChatTaskExecutionAnalytics {
  return { taskExecutionId, taskRunIndex: 0 };
}

export function recoveryActionInstanceId(
  assistantMessageId: string,
  actionType: TrackingRunRecoveryActionType,
): string {
  return `recovery:${assistantMessageId}:${actionType}`;
}

function owningUserMessage(
  messages: ChatMessage[],
  assistantMessage: ChatMessage,
): ChatMessage | undefined {
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessage.id);
  if (assistantIndex < 0) return undefined;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index];
  }
  return undefined;
}

function firstRunIdForOwningTurn(
  messages: ChatMessage[],
  userMessage: ChatMessage | undefined,
  assistantMessage: ChatMessage,
): string | undefined {
  if (!userMessage) return assistantMessage.runId;
  const userIndex = messages.findIndex((message) => message.id === userMessage.id);
  if (userIndex < 0) return assistantMessage.runId;
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role === 'user') break;
    if (message?.role === 'assistant' && message.runId) return message.runId;
  }
  return assistantMessage.runId;
}

export function buildRecoveryTaskAnalytics(
  messages: ChatMessage[],
  assistantMessage: ChatMessage,
  actionType: TrackingRunRecoveryActionType,
): ChatTaskExecutionAnalytics {
  const userMessage = owningUserMessage(messages, assistantMessage);
  const existing = assistantMessage.taskAnalytics ?? userMessage?.taskAnalytics;
  const initialRunId = existing?.initialRunId
    ?? firstRunIdForOwningTurn(messages, userMessage, assistantMessage);
  return {
    taskExecutionId: existing?.taskExecutionId ?? userMessage?.id ?? assistantMessage.id,
    ...(initialRunId ? { initialRunId } : {}),
    ...(assistantMessage.runId ? { sourceRunId: assistantMessage.runId } : {}),
    taskRunIndex: Math.max(0, existing?.taskRunIndex ?? 0) + 1,
    recoveryActionType: actionType,
    recoveryActionInstanceId: recoveryActionInstanceId(assistantMessage.id, actionType),
  };
}
