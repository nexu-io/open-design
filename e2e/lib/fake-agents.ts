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

export type FakeAgentRuntime = {
  agentId: FakeAgentId;
  bin: string;
  envKey: string;
  env: Record<string, string>;
};

export type FakeAgentRuntimeOptions = {
  root?: string;
  runtimeIds?: FakeAgentId[];
};

const AGENT_BIN_NAMES: Record<FakeAgentId, string> = {
  claude: 'claude-e2e.cjs',
  codex: 'codex-e2e.cjs',
  copilot: 'copilot-e2e.cjs',
  'cursor-agent': 'cursor-agent-e2e.cjs',
  deepseek: 'deepseek-e2e.cjs',
  gemini: 'gemini-e2e.cjs',
  opencode: 'opencode-e2e.cjs',
  qoder: 'qodercli-e2e.cjs',
  qwen: 'qwen-e2e.cjs',
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
  'opencode',
  'cursor-agent',
  'qwen',
  'qoder',
  'copilot',
];

export async function createFakeAgentRuntimes(
  runtimeIds?: FakeAgentId[],
): Promise<Record<FakeAgentId, FakeAgentRuntime>>;
export async function createFakeAgentRuntimes(
  options?: FakeAgentRuntimeOptions,
): Promise<Record<FakeAgentId, FakeAgentRuntime>>;
export async function createFakeAgentRuntimes(
  input: FakeAgentId[] | FakeAgentRuntimeOptions = {},
): Promise<Record<FakeAgentId, FakeAgentRuntime>> {
  const runtimeIds = Array.isArray(input)
    ? input
    : (input.runtimeIds ?? ['codex', ...FAKE_AGENT_RUNTIME_IDS]);
  const root = Array.isArray(input)
    ? path.join(tmpdir(), `open-design-fake-agents-${process.pid}`)
    : (input.root ?? path.join(tmpdir(), `open-design-fake-agents-${process.pid}`));
  await mkdir(root, { recursive: true });

  const runtimes = {} as Record<FakeAgentId, FakeAgentRuntime>;
  for (const agentId of runtimeIds) {
    const script = path.join(root, AGENT_BIN_NAMES[agentId]);
    const parsedScript = path.parse(script);
    const bin = process.platform === 'win32'
      ? path.join(parsedScript.dir, `${parsedScript.name}.cmd`)
      : script;
    await writeFile(script, renderFakeAgentScript(agentId), 'utf8');
    if (process.platform === 'win32') {
      await writeFile(bin, '@echo off\r\nnode "%~dp0%~n0.cjs" %*\r\n', 'utf8');
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
const { mkdir, writeFile: writeFileFs } = require('node:fs/promises');
const { join } = require('node:path');

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
let emitTimer = null;
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  prompt += chunk;
  if (emitted) return;
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    void emitRun(prompt).catch(failUnhandled);
  }, 25);
});
process.stdin.on('end', () => {
  void emitRun(prompt).catch(failUnhandled);
});
if (process.stdin.isTTY || agentId === 'deepseek') {
  prompt = args.join(' ');
  void emitRun(prompt).catch(failUnhandled);
}

async function emitRun(promptText) {
  if (emitted) return;
  emitted = true;
  if (promptText.includes('Hold the daemon run open until canceled')) {
    // Stay running (busy) without ever emitting a terminal result, so a test
    // can queue a follow-up turn and interrupt it via send-now. Keep the event
    // loop alive indefinitely; the daemon kills this child (SIGTERM) when the
    // run is canceled.
    setInterval(() => {}, 1 << 30);
    return;
  }
  if (promptText.includes('Return an intentional daemon smoke failure')) {
    emitFailure();
    return;
  }
  if (promptText.includes('Return a daemon 429 service failure')) {
    emitServiceFailure(429);
    return;
  }
  if (promptText.includes('Return a daemon 503 service failure')) {
    emitServiceFailure(503);
    return;
  }
  if (promptText.includes('Return a daemon socket-drop failure')) {
    emitSocketDropFailure();
    return;
  }
  if (promptText.includes('Return an empty daemon smoke response')) {
    emitEmptySuccess();
    return;
  }
  if (promptText.includes('Return a stderr-only daemon smoke failure')) {
    process.stderr.write('stderr-only daemon smoke failure from fake ' + agentId + '\\n');
    process.exitCode = 1;
    exitSoon(1);
    return;
  }
  if (
    promptText.includes('Create an Open Design plugin for:') &&
    promptText.includes('produce a folder named generated-plugin')
  ) {
    await emitPluginAuthoringRun();
    return;
  }
  if (promptText.includes('Create a deterministic plan document')) {
    await emitPlanDocumentRun();
    return;
  }
  // Work-completeness fixtures (#1247 / #1060): drive a Claude run that ends its
  // turn while its TodoWrite plan still has unfinished tasks (or is truncated by
  // max_tokens), so tests can assert the run reports endedWithUnfinishedWork.
  if (promptText.includes('Emit an unfinished-todo run')) {
    emitClaudeTodoRun([
      { content: 'Draft layout', status: 'completed' },
      { content: 'Build components', status: 'in_progress' },
      { content: 'Run QA', status: 'pending' },
    ], 'end_turn');
    return;
  }
  if (promptText.includes('Emit a stopped-todo run')) {
    emitClaudeTodoRun([{ content: 'Build components', status: 'stopped' }], 'end_turn');
    return;
  }
  if (promptText.includes('Emit a max-tokens truncated run')) {
    // All todos look done, but the turn was cut off — truncation alone must flag
    // the run incomplete.
    emitClaudeTodoRun([{ content: 'Draft layout', status: 'completed' }], 'max_tokens');
    return;
  }
  if (promptText.includes('Emit an all-completed-todo run')) {
    emitClaudeTodoRun([
      { content: 'Draft layout', status: 'completed' },
      { content: 'Build components', status: 'completed' },
    ], 'end_turn');
    return;
  }
  if (promptText.includes('Edit the existing deterministic smoke artifact')) {
    await emitExistingArtifactEditRun(promptText);
    return;
  }
  const isSlowReload = promptText.includes('Create a slow reload deterministic smoke artifact');
  const isDelayed = promptText.includes('Create a delayed deterministic smoke artifact');
  const isChunked = promptText.includes('Create a chunked deterministic smoke artifact');
  const isFollowUp = promptText.includes('Create a follow-up deterministic smoke artifact');
  const isDefaultSmoke = promptText.includes('Create a deterministic smoke artifact');
  const isOrbit = promptText.includes("Create today's Orbit daily digest as a Live Artifact.");
  if (isOrbit) {
    await emitOrbitRun();
    return;
  }
  const isRuntime = promptText.match(/Fake runtime smoke for ([a-z0-9-]+)/i);
  const runtimeId = isRuntime ? isRuntime[1] : agentId;
  const heading = isSlowReload ? 'Slow Reload Daemon Smoke' : isDelayed ? 'Delayed Daemon Smoke' : isChunked ? 'Chunked Daemon Smoke' : isFollowUp ? 'Follow-up Daemon Smoke' : isDefaultSmoke ? 'Real Daemon Smoke' : 'Fake Agent Runtime ' + runtimeId;
  const identifier = isSlowReload ? 'slow-reload-daemon-smoke' : isDelayed ? 'delayed-daemon-smoke' : isChunked ? 'chunked-daemon-smoke' : isFollowUp ? 'follow-up-daemon-smoke' : isDefaultSmoke ? 'real-daemon-smoke' : 'fake-agent-runtime-' + runtimeId;
  const text = isSlowReload ? 'Generated after a reload while the daemon run was active.' : isDelayed ? 'Generated after a delayed daemon turn.' : isChunked ? 'Chunked through the daemon run path.' : isFollowUp ? 'Generated after an earlier daemon turn.' : isDefaultSmoke ? 'Generated through the daemon run path.' : 'Generated through fake ' + runtimeId + ' runtime.';
  const html = '<!doctype html><html><body><main><h1>' + heading + '</h1><p>' + text + '</p></main></body></html>';
  const artifact = '<artifact identifier="' + identifier + '" type="text/html" title="' + heading + '">' + html + '</artifact>';
  const assistantText = isSlowReload
    ? 'I stayed attached after the reload and will persist the artifact now.\\n\\n' + artifact
    : isDelayed
    ? 'I recovered the delayed reasoning path and will persist the artifact now.\\n\\n' + artifact
    : artifact;
  if (isSlowReload) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  if (isDelayed) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  emitSuccess(assistantText, isChunked, isDelayed || isSlowReload);
  process.exitCode = 0;
  exitSoon(0);
}

async function emitPluginAuthoringRun() {
  const folder = join(projectDir(), 'generated-plugin');
  await mkdir(join(folder, 'examples'), { recursive: true });
  await writeFileFs(
    join(folder, 'open-design.json'),
    JSON.stringify({
      specVersion: 1,
      name: 'generated-plugin',
      version: '0.1.0',
      description: 'Fake plugin authoring smoke scaffold.',
      mode: 'agent',
      taskKind: 'new-generation',
      inputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
    }, null, 2) + '\\n',
    'utf8',
  );
  await writeFileFs(
    join(folder, 'SKILL.md'),
    '# Generated Plugin\\n\\nThis fake plugin exists for plugin authoring smoke coverage.\\n',
    'utf8',
  );
  await writeFileFs(
    join(folder, 'examples', 'demo.md'),
    '# Demo\\n\\nGenerated by the fake plugin authoring runtime.\\n',
    'utf8',
  );
  const summary = [
    'Created generated-plugin with open-design.json, SKILL.md, and examples/demo.md.',
    'od plugin validate: passed',
    'od plugin pack: generated-plugin-0.1.0.tgz',
    'od plugin install --source: passed',
  ].join('\\n');
  emitSuccess(summary, false, false);
  process.exitCode = 0;
  exitSoon(0);
}

async function emitPlanDocumentRun() {
  await writeFileFs(
    join(projectDir(), 'plan.md'),
    [
      '# Deterministic Plan',
      '',
      '## Scope',
      '- Confirm the target workflow.',
      '- Draft the project milestones.',
      '',
      '## Risks',
      '- Keep the plan editable before design handoff.',
      '',
    ].join('\\n'),
    'utf8',
  );
  emitSuccess('Created plan.md with a deterministic planning outline.', false, false);
  process.exitCode = 0;
  exitSoon(0);
}

async function emitExistingArtifactEditRun(promptText) {
  const projectId = process.env.OD_PROJECT_ID || projectIdFromPrompt(promptText);
  const daemonUrl = process.env.OD_DAEMON_URL;
  if (!projectId || !daemonUrl) {
    throw new Error('fake artifact edit requires OD_PROJECT_ID and OD_DAEMON_URL');
  }
  const response = await fetch(new URL('/api/projects/' + encodeURIComponent(projectId) + '/files', daemonUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'real-daemon-smoke.html',
      content: '<!doctype html><html><body><main><h1>Real Daemon Smoke Edited</h1><p>Edited in place by a follow-up daemon run.</p></main></body></html>',
    }),
  });
  if (!response.ok) {
    throw new Error('fake artifact edit write failed: HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
  }
  emitSuccess('Updated real-daemon-smoke.html in place with a deterministic follow-up edit.', false, false);
  process.exitCode = 0;
  exitSoon(0);
}

function projectIdFromPrompt(promptText = '') {
  const marker = '.od/projects/';
  const idx = promptText.indexOf(marker);
  if (idx === -1) return '';
  return promptText
    .slice(idx + marker.length)
    .split(/[\\s/]/)[0]
    .replace(/[^a-zA-Z0-9_-].*$/, '');
}

function projectDir(promptText = '') {
  const marker = 'current working directory: \`';
  const idx = promptText.toLowerCase().indexOf(marker);
  const fromPrompt = idx === -1
    ? ''
    : promptText.slice(idx + marker.length).split('\`')[0] || '';
  const fromEnv = process.env.OD_DATA_DIR && process.env.OD_PROJECT_ID
    ? join(process.env.OD_DATA_DIR, 'projects', process.env.OD_PROJECT_ID)
    : '';
  const cwdFlagIndex = args.indexOf('-C');
  const fromArgs = cwdFlagIndex >= 0 && typeof args[cwdFlagIndex + 1] === 'string'
    ? args[cwdFlagIndex + 1]
    : '';
  return process.env.OD_PROJECT_DIR || fromEnv || fromArgs || fromPrompt || process.cwd();
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value) + '\\n');
}

function exitSoon(code) {
  setTimeout(() => process.exit(code), 10);
}

// Emit a Claude stream-json turn that carries a TodoWrite tool_use snapshot and
// a chosen terminal stop_reason. The turn ends cleanly (exit 0 -> succeeded), but
// its declared work is left in whatever state the todos describe — the fixture the
// #1247 / #1060 completeness tests drive. Only the claude runtime models a
// content-level tool_use + per-turn stop_reason, so these fixtures use it.
function emitClaudeTodoRun(todos, stopReason) {
  if (agentId !== 'claude') {
    throw new Error('emitClaudeTodoRun fixtures require the claude fake runtime, got ' + agentId);
  }
  writeJson({ type: 'system', subtype: 'init', model: 'fake-claude', session_id: 'fake-session' });
  writeJson({
    type: 'assistant',
    message: {
      id: 'msg-1',
      stop_reason: stopReason,
      content: [
        { type: 'tool_use', id: 'tw-1', name: 'TodoWrite', input: { todos } },
        { type: 'text', text: 'Here is the plan.' },
      ],
    },
  });
  writeJson({ type: 'result', usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0, duration_ms: 1, stop_reason: stopReason });
  process.exitCode = 0;
  exitSoon(0);
}

function emitSuccess(artifact, isChunked, includeThinking) {
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
      writeJson({
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            ...(includeThinking ? [{ type: 'thinking', thinking: 'Recovered delayed reasoning trace.' }] : []),
            { type: 'text', text: artifact },
          ],
        },
      });
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

async function emitOrbitRun() {
  const artifact = await createOrbitLiveArtifact();
  const text = 'Orbit fake digest registered live artifact ' + artifact.id + ' for project ' + artifact.projectId + '.';
  emitSuccess(text, false);
  process.exitCode = 0;
  exitSoon(0);
}

async function createOrbitLiveArtifact() {
  const baseUrl = process.env.OD_DAEMON_URL;
  const token = process.env.OD_TOOL_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('Orbit fake run requires OD_DAEMON_URL and OD_TOOL_TOKEN');
  }
  const url = new URL('/api/tools/live-artifacts/create', baseUrl);
  const payload = {
    input: {
      title: 'Orbit Daily Digest',
      slug: 'orbit-daily-digest',
      preview: { type: 'html', entry: 'index.html' },
      document: {
        format: 'html_template_v1',
        templatePath: 'template.html',
        generatedPreviewPath: 'index.html',
        dataPath: 'data.json',
        dataJson: {
          headline: 'Orbit daily digest',
          takeaway1: 'Fake connector activity was summarized through the daemon Orbit path.',
          takeaway2: 'The live artifact tool token was accepted.',
          takeaway3: 'The digest can be opened and previewed from the Orbit project.',
          checked: 'fake activity feed and fake task updates',
        },
      },
    },
    templateHtml: '<!doctype html><html><body><main><h1>{{data.headline}}</h1><ul><li>{{data.takeaway1}}</li><li>{{data.takeaway2}}</li><li>{{data.takeaway3}}</li></ul><p>{{data.checked}}</p></main></body></html>',
    provenanceJson: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'agent',
      sources: [{ label: 'Fake Orbit e2e data', type: 'derived' }],
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || !body.artifact) {
    throw new Error('Orbit live artifact create failed: HTTP ' + response.status + ' ' + text.slice(0, 500));
  }
  return body.artifact;
}

function failUnhandled(error) {
  process.stderr.write((error && error.stack ? error.stack : String(error)) + '\\n');
  process.exitCode = 1;
  exitSoon(1);
}

function emitFailure() {
  switch (agentId) {
    case 'codex':
      writeJson({ type: 'thread.started' });
      writeJson({ type: 'turn.started' });
      writeJson({ type: 'turn.failed', error: { message: 'intentional fake codex failure' } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    case 'opencode':
      writeJson({ type: 'error', error: { data: { message: 'intentional fake opencode failure' } } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    case 'qoder':
      writeJson({ type: 'assistant', message: { content: [] }, error: { message: 'intentional fake qoder failure' } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    default:
      process.stderr.write('intentional fake ' + agentId + ' failure\\n');
      process.exitCode = 1;
      exitSoon(1);
  }
}

function emitServiceFailure(statusCode) {
  const message =
    statusCode === 429
      ? 'HTTP 429 Too Many Requests: rate limit exceeded for the current provider.'
      : 'HTTP 503 Service Unavailable: upstream model provider is temporarily unavailable.';
  switch (agentId) {
    case 'codex':
      writeJson({ type: 'thread.started' });
      writeJson({ type: 'turn.started' });
      writeJson({ type: 'turn.failed', error: { message } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    case 'opencode':
      writeJson({ type: 'error', error: { data: { message } } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    default:
      process.stderr.write(message + '\\n');
      process.exitCode = 1;
      exitSoon(1);
  }
}

// Reproduces a connection that dropped mid-response. This shape is NOT guessed:
// it was captured by pointing the real Claude Code CLI (2.1.168) at a fake
// Anthropic endpoint that accepts the request, starts streaming, then destroys
// the TCP socket. The real CLI exhausts its internal retries and then, on
// STDOUT (not stderr), emits the SDK error as a synthetic assistant text block
// plus a result frame carrying is_error:true with subtype "success", and exits
// 1. The daemon's claude diagnostic reads the stdout tail and classifies it as
// a retryable connection drop.
//
// Only claude is modeled here: the daemon connection-drop diagnostic is
// claude-specific, and the real Codex CLI fails this class differently (it
// streams "Reconnecting... N/5" and a turn.failed event over its own
// transport), so a faithful Codex case belongs with Codex-specific handling,
// not this claude reproduction.
function emitSocketDropFailure() {
  const sdkError =
    'API Error: The socket connection was closed unexpectedly. For more information, pass \`verbose: true\` in the second argument to fetch()';
  if (agentId === 'claude') {
    writeJson({ type: 'system', subtype: 'init', model: 'fake-claude', session_id: 'fake-session' });
    writeJson({
      type: 'assistant',
      message: {
        id: 'msg-1',
        model: '<synthetic>',
        role: 'assistant',
        stop_reason: 'stop_sequence',
        content: [{ type: 'text', text: sdkError }],
      },
      error: 'unknown',
    });
    writeJson({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: sdkError,
      stop_reason: 'stop_sequence',
      duration_ms: 1,
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    process.exitCode = 1;
    exitSoon(1);
    return;
  }
  // Other runtimes are not the subject of the claude connection diagnostic;
  // surface a generic non-zero exit carrying the same SDK error text.
  process.stderr.write(sdkError + '\\n');
  process.exitCode = 1;
  exitSoon(1);
}

function emitEmptySuccess() {
  switch (agentId) {
    case 'codex':
      writeJson({ type: 'thread.started' });
      writeJson({ type: 'turn.started' });
      writeJson({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 0 } });
      process.exitCode = 0;
      exitSoon(0);
      return;
    default:
      process.exitCode = 0;
      exitSoon(0);
  }
}
}
`;
}
