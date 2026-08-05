import { emittedRenderableQuestionForm } from '../question-form-detect.js';

export interface AssistantMessageContentReader {
  get(id: string): { content?: unknown } | null | undefined;
}

export function assistantMessageEmittedQuestionForm(
  messages: AssistantMessageContentReader,
  assistantMessageId: string | null | undefined,
): boolean {
  if (!assistantMessageId) return false;
  const row = messages.get(assistantMessageId);
  return emittedRenderableQuestionForm(row?.content);
}
