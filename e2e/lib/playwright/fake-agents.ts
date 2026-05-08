import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type FakeAgentId =
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'cursor-agent'
  | 'deepseek'
  | 'gemini'
  | 'opencode'
  | 'qoder'
  | 'qwen';

type FakeAgentRuntime = {
  agentId: FakeAgentId;
  bin: string;
  envKey: string;
  env: Record<string, string>;
};

const AGENT_BIN_NAMES: Record<FakeAgentId, string> = {
  claude: 'claude-e2e.js',
  codex: 'codex-e2e.js',
  copilot: 'copilot-e2e.js',
  'cursor-agent': 'cursor-agent-e2e.js',
  deepseek: 'deepseek-e2e.js',
  gemini: 'gemini-e2e.js',
  opencode: 'opencode-e2e.js',
  qoder: 'qodercli-e2e.js',
  qwen: 'qwen-e2e.js',
};

const AGENT_BIN_ENV_KEYS: Record<FakeAgentId, string> = {
  claude: 'CLAUDE_BIN',
  codex: 'CODEX_BIN',
  copilot: 'COPILOT_BIN',
  'cursor-agent': 'CURSOR_AGENT_BIN',
  deepseek: 'DEEPSEEK_BIN',
  gemini: 'GEMINI_BIN',
  opencode: 'OPENCODE_BIN',
  qoder: 'QODER_BIN',
  qwen: 'QWEN_BIN',
};

export const FAKE_AGENT_RUNTIME_IDS: FakeAgentId[] = [
  'claude',
  'gemini',
  'opencode',
  'cursor-agent',
  'qwen',
  'qoder',
  'copilot',
];

export async function createFakeAgentRuntimes(
  runtimeIds: FakeAgentId[] = ['codex', ...FAKE_AGENT_RUNTIME_IDS],
): Promise<Record<FakeAgentId, FakeAgentRuntime>> {
  const root = path.join(tmpdir(), `open-design-playwright-fake-agents-${process.pid}`);
  await mkdir(root, { recursive: true });

  const runtimes = {} as Record<FakeAgentId, FakeAgentRuntime>;
  for (const agentId of runtimeIds) {
    const script = path.join(root, AGENT_BIN_NAMES[agentId]);
    const bin = process.platform === 'win32'
      ? script.replace(/\.js$/i, '.cmd')
      : script;
    await writeFile(script, renderFakeAgentScript(agentId), 'utf8');
    if (process.platform === 'win32') {
      await writeFile(bin, '@echo off\r\nnode "%~dp0%~n0.js" %*\r\n', 'utf8');
    } else {
      await chmod(bin, 0o755);
    }
    const envKey = AGENT_BIN_ENV_KEYS[agentId];
    runtimes[agentId] = { agentId, bin, envKey, env: { [envKey]: bin } };
  }
  return runtimes;
}

function renderFakeAgentScript(agentId: FakeAgentId): string {
  return `#!/usr/bin/env node
const agentId = ${JSON.stringify(agentId)};
const args = process.argv.slice(2);

if (args.includes('--version')) {
  process.stdout.write(agentId + '-e2e 0.0.0\\n');
  process.exitCode = 0;
} else if (agentId === 'claude' && args[0] === '-p' && args.includes('--help')) {
  process.stdout.write('--add-dir --include-partial-messages\\n');
  process.exitCode = 0;
} else if ((agentId === 'opencode' || agentId === 'cursor-agent') && args[0] === 'models') {
  process.stdout.write('fake/default\\n');
  process.exitCode = 0;
} else {

let prompt = '';
let emitted = false;
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  emitRun(prompt);
});
if (process.stdin.isTTY || agentId === 'deepseek') {
  prompt = args.join(' ');
  emitRun(prompt);
}

function emitRun(promptText) {
  if (emitted) return;
  emitted = true;
  if (promptText.includes('Return an intentional daemon smoke failure')) {
    emitFailure();
    return;
  }
  const isChunked = promptText.includes('Create a chunked deterministic smoke artifact');
  const isFollowUp = promptText.includes('Create a follow-up deterministic smoke artifact');
  const isDefaultSmoke = promptText.includes('Create a deterministic smoke artifact');
  const isRuntime = promptText.match(/Fake runtime smoke for ([a-z0-9-]+)/i);
  const runtimeId = isRuntime ? isRuntime[1] : agentId;
  const heading = isChunked ? 'Chunked Daemon Smoke' : isFollowUp ? 'Follow-up Daemon Smoke' : isDefaultSmoke ? 'Real Daemon Smoke' : 'Fake Agent Runtime ' + runtimeId;
  const identifier = isChunked ? 'chunked-daemon-smoke' : isFollowUp ? 'follow-up-daemon-smoke' : isDefaultSmoke ? 'real-daemon-smoke' : 'fake-agent-runtime-' + runtimeId;
  const text = isChunked ? 'Chunked through the daemon run path.' : isFollowUp ? 'Generated after an earlier daemon turn.' : isDefaultSmoke ? 'Generated through the daemon run path.' : 'Generated through fake ' + runtimeId + ' runtime.';
  const html = '<!doctype html><html><body><main><h1>' + heading + '</h1><p>' + text + '</p></main></body></html>';
  const artifact = '<artifact identifier="' + identifier + '" type="text/html" title="' + heading + '">' + html + '</artifact>';
  emitSuccess(artifact, isChunked);
  process.exitCode = 0;
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value) + '\\n');
}

function emitSuccess(artifact, isChunked) {
  const first = artifact.slice(0, Math.ceil(artifact.length / 2));
  const second = artifact.slice(Math.ceil(artifact.length / 2));
  switch (agentId) {
    case 'codex':
      writeJson({ type: 'thread.started' });
      writeJson({ type: 'turn.started' });
      if (isChunked) {
        writeJson({ type: 'item.completed', item: { type: 'agent_message', text: first } });
        writeJson({ type: 'item.completed', item: { type: 'agent_message', text: second } });
      } else {
        writeJson({ type: 'item.completed', item: { type: 'agent_message', text: artifact } });
      }
      writeJson({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
      return;
    case 'claude':
      writeJson({ type: 'system', subtype: 'init', model: 'fake-claude', session_id: 'fake-session' });
      writeJson({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: artifact }] } });
      writeJson({ type: 'result', usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0, duration_ms: 1, stop_reason: 'end_turn' });
      return;
    case 'gemini':
      writeJson({ type: 'init', session_id: 'fake-gemini', model: 'fake-gemini' });
      writeJson({ type: 'message', role: 'assistant', content: artifact, delta: true });
      writeJson({ type: 'result', status: 'success', stats: { input_tokens: 1, output_tokens: 1, cached: 0, duration_ms: 1 } });
      return;
    case 'opencode':
      writeJson({ type: 'step_start', sessionID: 'fake-opencode', part: { type: 'step-start' } });
      writeJson({ type: 'text', sessionID: 'fake-opencode', part: { type: 'text', text: artifact } });
      writeJson({ type: 'step_finish', sessionID: 'fake-opencode', part: { type: 'step-finish', tokens: { input: 1, output: 1 }, cost: 0 } });
      return;
    case 'cursor-agent':
      writeJson({ type: 'system', subtype: 'init', model: 'fake-cursor' });
      writeJson({ type: 'assistant', timestamp_ms: 1, message: { role: 'assistant', content: [{ type: 'text', text: artifact }] } });
      writeJson({ type: 'result', duration_ms: 1, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } });
      return;
    case 'qoder':
      writeJson({ type: 'system', subtype: 'init', qodercli_version: '0.0.0', model: 'fake-qoder', session_id: 'fake-qoder' });
      writeJson({ type: 'assistant', message: { content: [{ type: 'text', text: artifact }] }, session_id: 'fake-qoder' });
      writeJson({ type: 'result', subtype: 'success', duration_ms: 1, is_error: false, stop_reason: 'end_turn', total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
      return;
    case 'copilot':
      writeJson({ type: 'session.tools_updated', data: { model: 'fake-copilot' } });
      writeJson({ type: 'assistant.turn_start', data: {} });
      writeJson({ type: 'assistant.message_delta', data: { deltaContent: artifact } });
      writeJson({ type: 'result', success: true, exitCode: 0, usage: { input_tokens: 1, output_tokens: 1, sessionDurationMs: 1 } });
      return;
    case 'qwen':
    case 'deepseek':
      process.stdout.write(artifact + '\\n');
      return;
    default:
      process.stdout.write(artifact + '\\n');
  }
}

function emitFailure() {
  switch (agentId) {
    case 'codex':
      writeJson({ type: 'thread.started' });
      writeJson({ type: 'turn.started' });
      writeJson({ type: 'turn.failed', error: { message: 'intentional fake codex failure' } });
      process.exitCode = 0;
      return;
    case 'opencode':
      writeJson({ type: 'error', error: { data: { message: 'intentional fake opencode failure' } } });
      process.exitCode = 0;
      return;
    case 'qoder':
      writeJson({ type: 'assistant', message: { content: [] }, error: { message: 'intentional fake qoder failure' } });
      process.exitCode = 0;
      return;
    default:
      process.stderr.write('intentional fake ' + agentId + ' failure\\n');
      process.exitCode = 1;
  }
}
}
`;
}
