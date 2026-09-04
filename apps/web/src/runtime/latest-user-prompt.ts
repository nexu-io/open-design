import type { ChatMessage } from '../types';

/** Longest prompt the Design Files empty state will echo before eliding. */
const MAX_PROMPT_CHARS = 160;

/**
 * The last thing the user actually asked for, as a single tidy line.
 *
 * The Design Files panel's empty state echoes this back while the agent works,
 * so the right pane says "working on THIS" instead of sitting blank. Mirrors
 * `latestTodoWriteInputFromMessages` in `./todos.ts`: a pure reducer over the
 * conversation, so the panel needs no chat wiring of its own.
 *
 * Returns null when the conversation has no user turn yet (a freshly created
 * project), which the caller renders as "no prompt line at all" rather than an
 * empty paragraph.
 */
export function latestUserPromptText(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;
    // Pasted prompts routinely carry hard-wrapped newlines and run long; the
    // empty state has one clamped block, so collapse first and elide second.
    const text = (message.content ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    return text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS).trimEnd()}…` : text;
  }
  return null;
}
