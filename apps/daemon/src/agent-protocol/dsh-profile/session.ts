/** @module agent-protocol/dsh-profile/session
 * One-run controller for `dsh --profile open-design --stdio`.
 */
import type { ChildProcess } from 'node:child_process';
import { createDshProfileJsonlStream } from './stream.js';
import type {
  DshProfileExecuteCommand,
  DshProfileResultStatus,
  DshProfileRuntimeFrame,
} from './types.js';

export type AttachDshProfileSessionOptions = {
  child: ChildProcess;
  requestId: string;
  prompt: string;
  cwd: string;
  model?: string | null;
  reasoningEffort?: string | null;
  resumeSessionId?: string | null;
  send: (event: string, payload: unknown) => void;
  onReady?: () => void;
  onSession?: () => void;
  onComplete?: () => void;
};

function modelSelection(value: string | null | undefined): { provider: string; id: string } | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === 'default') return undefined;
  const separator = normalized.indexOf('/');
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error('DeepSeek Harness model must use provider/model format.');
  }
  return {
    provider: normalized.slice(0, separator),
    id: normalized.slice(separator + 1),
  };
}

function toolInput(argumentsJson: string): Record<string, unknown> {
  try {
    const value = JSON.parse(argumentsJson) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Preserve opaque arguments without echoing them into a protocol error.
  }
  return { raw: argumentsJson };
}

export function attachDshProfileSession({
  child,
  requestId,
  prompt,
  cwd,
  model,
  reasoningEffort,
  resumeSessionId,
  send,
  onReady,
  onSession,
  onComplete,
}: AttachDshProfileSessionOptions) {
  if (!child.stdin || !child.stdout) {
    throw new Error('DeepSeek Harness profile child must expose stdin and stdout.');
  }
  const stdin = child.stdin;
  const stdout = child.stdout;
  const selectedModel = modelSelection(model);
  let ready = false;
  let executeSent = false;
  let sessionId: string | null = null;
  let terminalStatus: DshProfileResultStatus | null = null;
  let fatal = false;
  let aborted = false;
  let finished = false;
  let thinkingStarted = false;
  let ignoredRequestFrames = 0;

  const sendCommand = (command: unknown): boolean => {
    if (stdin.destroyed || !stdin.writable) return false;
    return stdin.write(`${JSON.stringify(command)}\n`);
  };

  const fail = (message: string, code = 'DSH_PROFILE_PROTOCOL_ERROR') => {
    if (finished) return;
    fatal = true;
    finished = true;
    terminalStatus = 'failed';
    send('error', {
      message,
      error: { code, message, retryable: false },
    });
    stdin.end();
  };

  const finish = (status: DshProfileResultStatus) => {
    if (finished) {
      fatal = true;
      return;
    }
    finished = true;
    terminalStatus = status;
    if (thinkingStarted) send('agent', { type: 'thinking_end' });
    stdin.end();
    if (status === 'completed') onComplete?.();
  };

  const sendExecute = () => {
    const command: DshProfileExecuteCommand = {
      v: 1,
      type: 'execute',
      request_id: requestId,
      cwd,
      prompt,
      ...(resumeSessionId ? { resume_session_id: resumeSessionId } : {}),
      ...(selectedModel ? { model: selectedModel } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      mcp_servers: [],
    };
    executeSent = true;
    sendCommand(command);
  };

  const requireSession = (): boolean => {
    if (sessionId) return true;
    fail('DeepSeek Harness profile emitted run content before establishing a session.');
    return false;
  };

  const handleRunFrame = (frame: Exclude<DshProfileRuntimeFrame, { type: 'ready' | 'probe' }>) => {
    if (frame.request_id && frame.request_id !== requestId) {
      ignoredRequestFrames += 1;
      return;
    }
    switch (frame.type) {
      case 'session':
        if (sessionId) {
          fail('DeepSeek Harness profile emitted more than one session frame.');
          return;
        }
        if (resumeSessionId && (!frame.resumed || frame.session_id !== resumeSessionId)) {
          fail('DeepSeek Harness profile resumed a different session.', 'DSH_PROFILE_RESUME_MISMATCH');
          return;
        }
        if (!resumeSessionId && frame.resumed) {
          fail('DeepSeek Harness profile reported an unexpected resumed session.');
          return;
        }
        sessionId = frame.session_id;
        send('agent', { type: 'status', label: 'working', sessionId });
        onSession?.();
        return;
      case 'thinking':
        if (!requireSession()) return;
        if (!thinkingStarted) {
          thinkingStarted = true;
          send('agent', { type: 'thinking_start' });
        }
        if (frame.content) send('agent', { type: 'thinking_delta', delta: frame.content });
        return;
      case 'text':
        if (!requireSession()) return;
        if (frame.content) send('agent', { type: 'text_delta', delta: frame.content });
        return;
      case 'tool_call':
        if (!requireSession()) return;
        send('agent', {
          type: 'tool_use',
          id: frame.call_id,
          name: frame.name,
          input: toolInput(frame.arguments),
        });
        return;
      case 'tool_result':
        if (!requireSession()) return;
        send('agent', {
          type: 'tool_result',
          toolUseId: frame.call_id,
          content: frame.output,
          isError: frame.is_error,
        });
        return;
      case 'usage':
        if (!requireSession()) return;
        send('agent', {
          type: 'usage',
          provider: frame.provider,
          model: frame.model,
          usage: {
            input_tokens: frame.input_tokens,
            output_tokens: frame.output_tokens,
            cached_read_tokens: frame.cache_read_tokens ?? 0,
            cached_write_tokens: frame.cache_write_tokens ?? 0,
            total_tokens: frame.input_tokens + frame.output_tokens,
          },
        });
        return;
      case 'protocol_error':
        fail('DeepSeek Harness profile reported a protocol error.', frame.code);
        return;
      case 'result':
        if (resumeSessionId && frame.resume_rejected) {
          if (frame.session_id !== resumeSessionId) {
            fail('DeepSeek Harness profile rejected a different session.', 'DSH_PROFILE_RESUME_MISMATCH');
            return;
          }
          fail('DeepSeek Harness could not resume the saved session.', frame.error?.code ?? 'DSH_PROFILE_RESUME_REJECTED');
          return;
        }
        if (!sessionId && frame.status === 'failed') {
          fail(frame.error?.message ?? 'DeepSeek Harness profile could not start a session.', frame.error?.code);
          return;
        }
        if (!requireSession()) return;
        if (frame.session_id !== sessionId) {
          fail('DeepSeek Harness profile terminal result changed the session id.', 'DSH_PROFILE_SESSION_MISMATCH');
          return;
        }
        if (frame.status === 'failed') {
          fail(frame.error?.message ?? 'DeepSeek Harness profile run failed.', frame.error?.code);
          return;
        }
        if (frame.status === 'cancelled' && !aborted) {
          fail('DeepSeek Harness profile cancelled a run that Open Design did not cancel.');
          return;
        }
        finish(frame.status);
        return;
    }
  };

  const parser = createDshProfileJsonlStream({
    onFrame(frame) {
      if (finished) {
        fatal = true;
        return;
      }
      if (!ready) {
        if (frame.type !== 'ready') {
          fail('DeepSeek Harness profile did not begin with a ready frame.');
          return;
        }
        ready = true;
        onReady?.();
        if (aborted) {
          finish('cancelled');
          return;
        }
        sendExecute();
        return;
      }
      if (frame.type === 'ready' || frame.type === 'probe') {
        fail('DeepSeek Harness profile emitted an unexpected identity frame.');
        return;
      }
      handleRunFrame(frame);
    },
    onError(error) {
      fail(error.message, error.code);
    },
  });

  stdout.on('data', (chunk: Buffer | string) => parser.feed(chunk));
  stdout.on('end', () => {
    parser.flush();
    if (!finished) fail('DeepSeek Harness profile exited without a terminal result.', 'DSH_PROFILE_MISSING_RESULT');
  });

  return {
    abort() {
      if (finished || aborted) return;
      aborted = true;
      sendCommand({ v: 1, type: 'cancel', request_id: requestId });
    },
    hasFatalError() {
      return fatal;
    },
    completedSuccessfully() {
      return terminalStatus === 'completed' && !fatal;
    },
    getDurableSessionId() {
      return sessionId;
    },
    getTerminalStatus() {
      return terminalStatus;
    },
    ignoredRequestFrameCount() {
      return ignoredRequestFrames;
    },
    executeWasSent() {
      return executeSent;
    },
  };
}
