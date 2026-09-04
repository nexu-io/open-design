import { createInterface } from 'node:readline';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDshProfileHostCommand } from '../../../src/agent-protocol/dsh-profile/frames.js';
import {
  DSH_PROFILE_PROTOCOL_VERSION,
  DSH_PROFILE_RUNTIME,
  type DshProfileCapabilities,
  type DshProfileHostCommand,
} from '../../../src/agent-protocol/dsh-profile/types.js';

const capabilities: DshProfileCapabilities = {
  session_resume: true,
  session_cancel: true,
  structured_events: true,
};

const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : null;
const mode = process.env.OD_DSH_FAKE_MODE || 'normal';

function emit(frame: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ v: DSH_PROFILE_PROTOCOL_VERSION, ...frame })}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (args.includes('--version')) {
  process.stdout.write(`${process.env.OD_DSH_FAKE_VERSION || '0.1.0-rc.6'}\n`);
  process.exit(0);
}

if (profile !== 'open-design') fail('profile unavailable');

if (args.includes('--probe')) {
  if (mode === 'missing-profile') fail('profile unavailable');
  emit({
    type: 'probe',
    runtime: mode === 'bad-identity' ? 'another-runtime' : DSH_PROFILE_RUNTIME,
    protocol_version: mode === 'future-protocol' ? 2 : DSH_PROFILE_PROTOCOL_VERSION,
    plugin_version: 'fixture-1',
    capabilities,
  });
  process.exit(0);
}

if (!args.includes('--stdio')) fail('unsupported fixture invocation');

emit({
  type: 'ready',
  runtime: DSH_PROFILE_RUNTIME,
  protocol_version: DSH_PROFILE_PROTOCOL_VERSION,
  plugin_version: 'fixture-1',
  capabilities,
});

const sessionRoot = process.env.OD_DSH_FAKE_SESSION_ROOT;
if (!sessionRoot) fail('OD_DSH_FAKE_SESSION_ROOT is required');
mkdirSync(sessionRoot, { recursive: true });
const stateFile = path.join(sessionRoot, 'session.json');

let active: { requestId: string; sessionId: string } | null = null;
let input: ReturnType<typeof createInterface> | null = null;

function finish(code = 0): void {
  process.exitCode = code;
  input?.close();
  process.stdin.pause();
}

function sessionState(): { sessionId: string; firstPrompt: string } | null {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8')) as {
      sessionId: string;
      firstPrompt: string;
    };
  } catch {
    return null;
  }
}

function handleExecute(command: Extract<DshProfileHostCommand, { type: 'execute' }>): void {
  if (mode === 'missing-credential') {
    emit({
      type: 'result',
      request_id: command.request_id,
      status: 'failed',
      session_id: 'fixture-missing-credential',
      resume_rejected: false,
      error: {
        code: 'MISSING_CREDENTIAL',
        message: 'No API key for provider route "deepseek-official".',
      },
    });
    finish();
    return;
  }
  const stored = sessionState();
  const requested = command.resume_session_id;
  if (requested) {
    if (!stored || stored.sessionId !== requested || mode === 'resume-missing') {
      emit({
        type: 'result',
        request_id: command.request_id,
        status: 'failed',
        session_id: requested,
        resume_rejected: true,
        error: { code: 'DSH_SESSION_NOT_FOUND', message: 'Session could not be resumed.' },
      });
      finish();
      return;
    }
  }
  const sessionId =
    mode === 'wrong-resume-id' && requested
      ? 'different-session'
      : requested || 'fixture-session-1';
  active = { requestId: command.request_id, sessionId };
  if (!requested) {
    writeFileSync(
      stateFile,
      JSON.stringify({ sessionId, firstPrompt: command.prompt }),
      { mode: 0o600 },
    );
  }
  emit({
    type: 'session',
    request_id: command.request_id,
    session_id: sessionId,
    resumed: Boolean(requested),
  });
  if (mode === 'wait-cancel') return;
  emit({ type: 'thinking', request_id: command.request_id, content: 'checking' });
  emit({
    type: 'tool_call',
    request_id: command.request_id,
    call_id: 'call-1',
    name: 'Write',
    arguments: JSON.stringify({ file_path: 'index.html' }),
  });
  emit({
    type: 'tool_result',
    request_id: command.request_id,
    call_id: 'call-1',
    name: 'Write',
    output: 'created index.html',
    is_error: false,
  });
  emit({ type: 'text', request_id: command.request_id, content: requested ? 'updated' : 'created' });
  emit({
    type: 'usage',
    request_id: command.request_id,
    provider: 'deepseek-official',
    model: 'fixture-model',
    input_tokens: requested ? 7 : 11,
    output_tokens: 3,
    cache_read_tokens: requested ? 5 : 0,
  });
  emit({
    type: 'result',
    request_id: command.request_id,
    status: 'completed',
    session_id: sessionId,
    output: requested ? 'updated' : 'created',
    stop_reason: 'completed',
    resume_rejected: false,
  });
  finish();
}

function handleCommand(command: DshProfileHostCommand): void {
  if (command.type === 'execute') {
    handleExecute(command);
    return;
  }
  if (!active || command.request_id !== active.requestId) return;
  emit({
    type: 'result',
    request_id: active.requestId,
    status: 'cancelled',
    session_id: active.sessionId,
    stop_reason: 'cancelled',
    resume_rejected: false,
  });
  finish();
}

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
input = reader;
reader.on('line', (line) => {
  try {
    handleCommand(parseDshProfileHostCommand(JSON.parse(line) as unknown));
  } catch (error) {
    emit({
      type: 'protocol_error',
      code: 'INVALID_COMMAND',
      message: error instanceof Error ? error.message : 'Invalid command.',
    });
    finish(2);
  }
});
