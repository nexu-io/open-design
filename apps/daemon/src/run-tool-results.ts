export type SubmitToolResultReason =
  | 'run_terminal'
  | 'stdin_closed'
  | 'stdin_text_mode'
  | 'bad_tool_use_id'
  | 'write_failed';

export type SubmitToolResultResult =
  | { ok: true }
  | { ok: false; reason: SubmitToolResultReason; error?: string };

interface WritableStdin {
  destroyed?: boolean;
  write(chunk: string, encoding?: BufferEncoding): unknown;
}

interface ToolResultRunState {
  child?: { stdin?: WritableStdin | null } | null;
  pendingHostAnswers?: Set<string> | null;
  stdinOpen?: boolean;
}

export interface SubmitToolResultInput {
  content: unknown;
  isError?: boolean;
  isTerminal: boolean;
  toolUseId: unknown;
}

export function submitToolResultToRunState(
  run: ToolResultRunState,
  input: SubmitToolResultInput,
): SubmitToolResultResult {
  if (input.isTerminal) {
    return { ok: false, reason: 'run_terminal' };
  }
  if (!run.child?.stdin || run.child.stdin.destroyed) {
    return { ok: false, reason: 'stdin_closed' };
  }
  if (!run.stdinOpen) {
    return { ok: false, reason: 'stdin_text_mode' };
  }
  if (typeof input.toolUseId !== 'string' || input.toolUseId.length === 0) {
    return { ok: false, reason: 'bad_tool_use_id' };
  }
  if (!run.pendingHostAnswers?.has(input.toolUseId)) {
    return { ok: false, reason: 'bad_tool_use_id' };
  }

  const safeContent =
    typeof input.content === 'string' ? input.content : String(input.content ?? '');
  const userMessage = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: input.toolUseId,
          content: safeContent,
          is_error: input.isError === true,
        },
      ],
    },
  });

  try {
    run.child.stdin.write(`${userMessage}\n`, 'utf8');
  } catch (err) {
    return {
      ok: false,
      reason: 'write_failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  run.pendingHostAnswers.delete(input.toolUseId);

  return { ok: true };
}
