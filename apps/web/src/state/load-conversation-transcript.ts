import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { ChatMessage } from '../types';
import { listMessages, ProjectMessageListError } from './projects';

const RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const LOAD_BUDGET_MS = 15_000;

function canRetry(error: unknown): boolean {
  if (!(error instanceof ProjectMessageListError) || !error.retryable) return false;
  // Repeating the same identity cannot resolve an authorization refusal or a
  // missing conversation. A changed authority starts a new effect instead.
  return error.status === null
    || error.status === 408
    || error.status === 429
    || (error.status >= 500 && error.status <= 599);
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * One authoritative transcript read, including bounded recovery from a
 * transient failure. The original project/conversation/authority lifetime owns
 * every attempt. Neither a retry nor a hanging request may extend its budget.
 */
export async function loadConversationTranscript(
  projectId: string,
  conversationId: string,
  workspaceContext: WorkspaceCollabContext | null,
  signal: AbortSignal,
): Promise<ChatMessage[]> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  // An empty error selects ProjectView's existing failed-read fallback. This
  // internal timeout policy does not introduce another user-facing sentence.
  const timer = setTimeout(() => {
    controller.abort(new ProjectMessageListError('', null, null, true));
  }, LOAD_BUDGET_MS);
  let rejectAborted!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
  const onAbort = () => rejectAborted(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });

  async function load(): Promise<ChatMessage[]> {
    let attempt = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      try {
        return await listMessages(projectId, conversationId, workspaceContext, controller.signal);
      } catch (error) {
        controller.signal.throwIfAborted();
        const delay = RETRY_DELAYS_MS[attempt];
        if (!canRetry(error) || delay === undefined) throw error;
        attempt += 1;
        await waitForRetry(delay, controller.signal);
      }
    }
  }

  try {
    // Settle on cancellation even if a transport has not acknowledged abort.
    return await Promise.race([load(), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
