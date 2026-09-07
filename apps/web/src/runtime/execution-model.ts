import type { ChatMessage } from '../types';
import { containsQuestionFormAsk } from '../artifacts/question-form';

/** The daemon's resolved start model outranks a mutable composer selection. */
export function executionModel(message: ChatMessage): string | null {
  const events = message.events ?? [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind === 'status' && event.label === 'starting' && event.model?.trim()) {
      return event.model.trim();
    }
  }
  // Older transcripts did not retain the start model.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind === 'status' && event.label === 'initializing'
      && event.detail?.trim() && event.detail.trim() !== 'default') {
      return event.detail.trim();
    }
  }
  return null;
}

/** Only the current conversation's unfinished strategy task owns this notice. */
export function activeStrategyModel(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== 'assistant') continue;
    if (!message.strategyTaskExecutionId || message.strategyTaskBlocked
      || message.strategyTaskDelivered || message.runStatus === 'canceled'
      || message.runStatus === 'failed') return null;
    if (message.runStatus !== 'running' && message.runStatus !== 'queued'
      && !containsQuestionFormAsk(message.content)) return null;
    const taskId = message.strategyTaskExecutionId;
    for (let j = i; j >= 0; j -= 1) {
      const predecessor = messages[j];
      if (predecessor?.strategyTaskExecutionId !== taskId) continue;
      const model = executionModel(predecessor);
      if (model) return model;
    }
    return null;
  }
  return null;
}
