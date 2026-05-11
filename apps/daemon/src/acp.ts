import { spawn, type ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';
import path from 'node:path';

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_STAGE_TIMEOUT_MS = 180_000;

type JsonRpcId = string | number;
type JsonObject = Record<string, unknown>;
type RpcWritable = Pick<Writable, 'write' | 'end'>;
type AcpChildProcess = ChildProcess;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface AcpMcpServerInput {
  type?: unknown;
  name?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
}

interface AcpSessionOptions {
  mcpServers?: AcpMcpServerInput[];
}

export interface ModelOption {
  id: string;
  label: string;
}

interface AcpModelConfigOption {
  configId: string;
  currentValue: string | null;
  values: unknown[];
}

const MODEL_CONFIG_OPTION_IDS = new Set(['model', 'models', 'modelid', 'modelids']);

interface DetectAcpModelsOptions {
  bin: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  defaultModelOption?: ModelOption;
}

interface AttachAcpSessionOptions {
  child: AcpChildProcess;
  prompt: string;
  cwd?: string;
  model?: string | null;
  mcpServers?: AcpMcpServerInput[];
  send: (event: string, payload: unknown) => void;
  clientName?: string;
  clientVersion?: string;
  stageTimeoutMs?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' ? value as JsonObject : null;
}

export function buildAcpSessionNewParams(cwd: string, { mcpServers }: AcpSessionOptions = {}) {
  const servers = Array.isArray(mcpServers) ? mcpServers : [];
  return {
    cwd: path.resolve(cwd),
    // MCP is an optional compatibility layer. Default to no MCP servers so ACP
    // agents can run through the skill + CLI path without MCP support. Do not
    // auto-install or mutate user/global MCP config; callers must pass an
    // explicit per-session MCP descriptor when a compatible agent supports it.
    // Normalize to the ACP stdio server shape expected by Kimi/Hermes.
    mcpServers: servers.map((s) => ({
      type: typeof s?.type === 'string' ? s.type : 'stdio',
      name: typeof s?.name === 'string' ? s.name : '',
      command: typeof s?.command === 'string' ? s.command : '',
      args: Array.isArray(s?.args) ? s.args : [],
      env: Array.isArray(s?.env) ? s.env : [],
    })),
  };
}

function sendRpc(writable: RpcWritable, id: JsonRpcId, method: string, params: unknown): void {
  writable.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
  );
}

function sendRpcResult(writable: RpcWritable, id: JsonRpcId, result: unknown): void {
  writable.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'number' || typeof value === 'string';
}

function rpcErrorMessage(raw: unknown): string {
  const obj = asObject(raw);
  const error = asObject(obj?.error);
  if (!obj || !error) {
    return '';
  }
  const message =
    typeof error.message === 'string'
      ? error.message
      : typeof error.code === 'number'
        ? String(error.code)
        : 'json-rpc error';
  return typeof obj.id === 'number'
    ? `json-rpc id ${obj.id}: ${message}`
    : message;
}

interface FormattedUsage {
  input_tokens?: number;
  output_tokens?: number;
  cached_read_tokens?: number;
  thought_tokens?: number;
  total_tokens?: number;
}

function formatUsage(usage: unknown): FormattedUsage | null {
  const src = asObject(usage);
  if (!src) return null;
  const out: FormattedUsage = {};
  if (typeof src.inputTokens === 'number') out.input_tokens = src.inputTokens;
  if (typeof src.outputTokens === 'number') out.output_tokens = src.outputTokens;
  if (typeof src.cachedReadTokens === 'number') {
    out.cached_read_tokens = src.cachedReadTokens;
  }
  if (typeof src.thoughtTokens === 'number') out.thought_tokens = src.thoughtTokens;
  if (typeof src.totalTokens === 'number') out.total_tokens = src.totalTokens;
  return Object.keys(out).length > 0 ? out : null;
}

function choosePermissionOutcome(options: unknown): string | null {
  const list = Array.isArray(options) ? options : [];
  const approveForSession = list.find((option) => option?.optionId === 'approve_for_session');
  if (approveForSession) return 'approve_for_session';
  const allowAlways = list.find((option) => option?.kind === 'allow_always');
  if (allowAlways?.optionId) return allowAlways.optionId;
  const allowOnce = list.find((option) => option?.kind === 'allow_once');
  if (allowOnce?.optionId) return allowOnce.optionId;
  return null;
}

function normalizeConfigOptionToken(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}

function isModelConfigOption(option: JsonObject, configId: string): boolean {
  const category = normalizeConfigOptionToken(option.category);
  if (category === 'model') return true;
  const id = normalizeConfigOptionToken(configId);
  if (id === 'model') return true;
  if (category) return false;
  const name = normalizeConfigOptionToken(option.name);
  return MODEL_CONFIG_OPTION_IDS.has(id) || name === 'model';
}

function findModelConfigOption(configOptions: unknown): AcpModelConfigOption | null {
  const options = Array.isArray(configOptions) ? configOptions : [];
  for (const rawOption of options) {
    const option = asObject(rawOption);
    if (!option) continue;
    const configId = typeof option.id === 'string' ? option.id.trim() : '';
    if (!configId) continue;
    const type = typeof option.type === 'string' ? option.type.trim() : '';
    if (type && type !== 'select') continue;
    if (!isModelConfigOption(option, configId)) continue;
    const currentValue =
      typeof option.currentValue === 'string' && option.currentValue.trim()
        ? option.currentValue.trim()
        : null;
    return {
      configId,
      currentValue,
      values: Array.isArray(option.options) ? option.options : [],
    };
  }
  return null;
}

function normalizeModelConfigOptions(
  configOptions: unknown,
  defaultModelOption: ModelOption,
): { currentModelId: string | null; models: ModelOption[] } | null {
  const modelConfig = findModelConfigOption(configOptions);
  if (!modelConfig) return null;
  const seen = new Set([defaultModelOption.id]);
  const out = [defaultModelOption];
  for (const rawValue of modelConfig.values) {
    const value = asObject(rawValue);
    if (!value) continue;
    const id =
      typeof value.value === 'string' && value.value.trim()
        ? value.value.trim()
        : typeof value.id === 'string'
          ? value.id.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const isCurrent = id === modelConfig.currentValue;
    const labelBase = name && name !== id ? `${name} (${id})` : id;
    out.push({ id, label: isCurrent ? `${labelBase} • current` : labelBase });
  }
  return { currentModelId: modelConfig.currentValue, models: out };
}

export function normalizeModels(
  models: unknown,
  defaultModelOption: ModelOption,
  configOptions?: unknown,
): ModelOption[] {
  const configModels = normalizeModelConfigOptions(configOptions, defaultModelOption);
  if (configModels && configModels.models.length > 1) {
    return configModels.models;
  }
  const modelsObj = asObject(models);
  const available = Array.isArray(modelsObj?.availableModels) ? modelsObj.availableModels : [];
  const currentModelId =
    typeof modelsObj?.currentModelId === 'string' ? modelsObj.currentModelId : null;
  const seen = new Set([defaultModelOption.id]);
  const out = [defaultModelOption];
  for (const model of available) {
    const id = typeof model?.modelId === 'string' ? model.modelId.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof model?.name === 'string' ? model.name.trim() : '';
    const isCurrent = id === currentModelId;
    const labelBase = name && name !== id ? `${name} (${id})` : id;
    out.push({ id, label: isCurrent ? `${labelBase} • current` : labelBase });
  }
  return out.length > 1 || !configModels ? out : configModels.models;
}

function modelSelectionErrorIsRecoverable(code: unknown): boolean {
  return code === -32603 || code === -32602 || code === -32601 || code === -32002;
}

function currentModelFromSessionResult(result: JsonObject): string | null {
  const configCurrent = findModelConfigOption(result.configOptions)?.currentValue;
  if (configCurrent) return configCurrent;
  const models = asObject(result.models);
  return typeof models?.currentModelId === 'string' && models.currentModelId.trim()
    ? models.currentModelId.trim()
    : null;
}

export function createJsonLineStream(onMessage: (message: unknown, rawLine: string) => void) {
  let buffer = '';
  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onMessage(JSON.parse(trimmed), trimmed);
        } catch {
          // Ignore non-JSON log lines on stdout.
        }
      }
    },
    flush() {
      const trimmed = buffer.trim();
      buffer = '';
      if (!trimmed) return;
      try {
        onMessage(JSON.parse(trimmed), trimmed);
      } catch {
        // Ignore trailing non-JSON log lines on stdout.
      }
    },
  };
}

export async function detectAcpModels({
  bin,
  args,
  cwd = process.cwd(),
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clientName = 'open-design-detect',
  clientVersion = 'runtime-adapter',
  defaultModelOption = { id: 'default', label: 'Default (CLI config)' },
}: DetectAcpModelsOptions): Promise<ModelOption[]> {
  return await new Promise<ModelOption[]>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env },
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let settled = false;
    let stderrBuf = '';
    let expectedId = 1;
    let nextId = 2;

    let timer: TimerHandle;
    const finish = <T extends ModelOption[] | Error>(fn: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {}
      fn(value);
    };

    const fail = (message: string) => {
      finish(reject, new Error(message));
      if (!child.killed) child.kill('SIGTERM');
    };

    const writeRpc = (id: JsonRpcId, method: string, params: unknown) => {
      try {
        sendRpc(child.stdin, id, method, params);
      } catch (err) {
        fail(`stdin write failed: ${errorMessage(err)}`);
      }
    };

    const sendSessionNew = () => {
      expectedId = nextId;
      writeRpc(nextId, 'session/new', buildAcpSessionNewParams(cwd));
      nextId += 1;
    };

    const parser = createJsonLineStream((raw) => {
      const obj = asObject(raw);
      const error = asObject(obj?.error);
      const result = asObject(obj?.result);
      const rpcErr = rpcErrorMessage(raw);
      if (rpcErr) {
        // JSON-RPC -32603 "Internal error" during model detection:
        // If this is for the current expected-id (initialize/session/new),
        // it's a real probe failure — reject immediately.
        // Otherwise it's cleanup noise — suppress it.
        if (error?.code === -32603 && obj?.id !== expectedId) return;
        fail(rpcErr);
        return;
      }
      if (obj?.id !== expectedId || !result) return;
      if (expectedId === 1) {
        sendSessionNew();
        return;
      }
      if (expectedId === 2) {
        const models = normalizeModels(result.models, defaultModelOption, result.configOptions);
        finish(resolve, models);
        if (!child.killed) child.kill('SIGTERM');
      }
    });

    child.stdout.on('data', (chunk) => parser.feed(chunk));
    child.stdout.on('close', () => parser.flush());
    child.stdin.on('error', (err) => fail(`stdin error: ${err.message}`));
    child.stderr.on('data', (chunk) => {
      stderrBuf = `${stderrBuf}${chunk}`.slice(-16_000);
    });
    child.on('error', (err) => fail(`spawn failed: ${err.message}`));
    child.on('close', (code, signal) => {
      parser.flush();
      if (!settled) {
        const errTail = stderrBuf.trim();
        const suffix = errTail ? ` stderr=${errTail}` : '';
        fail(`ACP model detection exited code=${code} signal=${signal ?? 'none'}${suffix}`);
      }
    });

    timer = setTimeout(() => {
      fail(`ACP model detection timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    writeRpc(1, 'initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { terminal: false },
      clientInfo: { name: clientName, version: clientVersion },
    });
  });
}

export function attachAcpSession({
  child,
  prompt,
  cwd,
  model,
  mcpServers,
  send,
  clientName = 'open-design',
  clientVersion = 'runtime-adapter',
  stageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
}: AttachAcpSessionOptions) {
  const runStartedAt = Date.now();
  const effectiveCwd = path.resolve(cwd || process.cwd());
  if (!child.stdin || !child.stdout) {
    throw new Error('ACP child process must expose stdin and stdout streams');
  }
  const stdin = child.stdin;
  const stdout = child.stdout;
  let expectedId = 1;
  let nextId = 2;
  let promptRequestId: JsonRpcId | null = null;
  let setModelRequestId: JsonRpcId | null = null;
  let sessionId: string | null = null;
  let activeModel: string | null = null;
  let modelConfigId: string | null = null;
  let emittedThinkingStart = false;
  let emittedFirstTokenStatus = false;
  let finished = false;
  let fatal = false;
  let aborted = false;
  let stageTimer: TimerHandle | null = null;

  const resetStageTimer = (label: string) => {
    if (stageTimer) clearTimeout(stageTimer);
    stageTimer = setTimeout(() => {
      fail(`ACP ${label} timed out after ${stageTimeoutMs}ms`);
    }, stageTimeoutMs);
  };

  const clearStageTimer = () => {
    if (stageTimer) clearTimeout(stageTimer);
    stageTimer = null;
  };

  const fail = (message: string) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
    send('error', { message });
    if (!child.killed) child.kill('SIGTERM');
  };

  const writeRpc = (id: JsonRpcId, method: string, params: unknown, timeoutLabel: string) => {
    resetStageTimer(timeoutLabel);
    try {
      sendRpc(stdin, id, method, params);
    } catch (err) {
      fail(`stdin write failed: ${errorMessage(err)}`);
    }
  };

  const sendPrompt = () => {
    promptRequestId = nextId;
    expectedId = promptRequestId;
    writeRpc(
      promptRequestId,
      'session/prompt',
      {
        sessionId,
        prompt: [{ type: 'text', text: prompt }],
      },
      'session/prompt',
    );
    nextId += 1;
  };

  const replyPermission = (raw: JsonObject) => {
    const params = asObject(raw.params);
    const optionId = choosePermissionOutcome(params?.options);
    if (!optionId || !isJsonRpcId(raw.id)) {
      fail(`unhandled ACP permission request: ${JSON.stringify(raw)}`);
      return;
    }
    resetStageTimer('session/request_permission');
    try {
      sendRpcResult(stdin, raw.id, {
        outcome: { outcome: 'selected', optionId },
      });
    } catch (err) {
      fail(`stdin write failed: ${errorMessage(err)}`);
    }
  };

  const recoverFromModelSelectionError = () => {
    setModelRequestId = null;
    activeModel = activeModel || 'default';
    send('agent', { type: 'status', label: 'model', model: activeModel });
    sendPrompt();
  };

  const parser = createJsonLineStream((raw, rawLine) => {
    if (aborted) return;
    resetStageTimer('response');
    const obj = asObject(raw);
    if (!obj) return;
    const error = asObject(obj.error);
    const params = asObject(obj.params);
    const result = asObject(obj.result);
    const rpcErr = rpcErrorMessage(obj);
    if (rpcErr) {
      // After response completion, any late-arriving errors from the agent
      // (pipe-broken, cleanup race conditions, etc.) are safe to ignore.
      if (finished) return;
      // JSON-RPC error handling:
      // -32603 unexpected-id errors are cleanup noise. Expected-id model
      // selection failures are recoverable; all other RPC errors are real
      // protocol failures for initialize/session/new/session/prompt.
      if (
        obj.id === setModelRequestId &&
        modelSelectionErrorIsRecoverable(error?.code) &&
        promptRequestId === null
      ) {
        recoverFromModelSelectionError();
        return;
      }
      if (error?.code === -32603 && obj.id !== expectedId) {
        return;
      }
      fail(rpcErr);
      return;
    }
    if (obj.method === 'session/request_permission') {
      replyPermission(obj);
      return;
    }
    const update = asObject(params?.update);
    if (obj.method === 'session/update' && update) {
      if (update.sessionUpdate === 'agent_thought_chunk') {
        const text = asObject(update.content)?.text;
        if (typeof text === 'string' && text.length > 0) {
          if (!emittedThinkingStart) {
            emittedThinkingStart = true;
            send('agent', { type: 'thinking_start' });
          }
          send('agent', { type: 'thinking_delta', delta: text });
        }
        return;
      }
      if (update.sessionUpdate === 'agent_message_chunk') {
        const text = asObject(update.content)?.text;
        if (typeof text === 'string' && text.length > 0) {
          if (!emittedFirstTokenStatus) {
            emittedFirstTokenStatus = true;
            send('agent', {
              type: 'status',
              label: 'streaming',
              ttftMs: Date.now() - runStartedAt,
            });
          }
          send('agent', { type: 'text_delta', delta: text });
        }
        return;
      }
      return;
    }
    if (obj.id !== expectedId || !result) {
      return;
    }
    if (expectedId === 1) {
      expectedId = nextId;
      writeRpc(
        nextId,
        'session/new',
        buildAcpSessionNewParams(
          effectiveCwd,
          mcpServers ? { mcpServers } : {},
        ),
        'session/new',
      );
      nextId += 1;
      return;
    }
    if (expectedId === 2) {
      sessionId = typeof result.sessionId === 'string' ? result.sessionId : null;
      const modelConfig = findModelConfigOption(result.configOptions);
      modelConfigId = modelConfig?.configId ?? null;
      activeModel = currentModelFromSessionResult(result);
      if (sessionId && activeModel) {
        send('agent', { type: 'status', label: 'model', model: activeModel });
      }
      if (sessionId && model && model !== 'default') {
        setModelRequestId = nextId;
        expectedId = nextId;
        const setModelMethod = modelConfigId ? 'session/set_config_option' : 'session/set_model';
        const setModelParams = modelConfigId
          ? { sessionId, configId: modelConfigId, value: model }
          : { sessionId, modelId: model };
        writeRpc(
          nextId,
          setModelMethod,
          setModelParams,
          setModelMethod,
        );
        nextId += 1;
        return;
      }
      if (!sessionId) {
        fail(`invalid session/new response: ${rawLine}`);
        return;
      }
      sendPrompt();
      return;
    }
    if (promptRequestId !== null && obj.id === promptRequestId) {
      const usage = formatUsage(result.usage);
      if (usage) {
        send('agent', {
          type: 'usage',
          usage,
          durationMs: Date.now() - runStartedAt,
        });
      }
      finished = true;
      clearStageTimer();
      stdin.end();
      return;
    }
    if (sessionId && model && model !== 'default' && obj.id === expectedId) {
      activeModel = currentModelFromSessionResult(result) ?? model;
      send('agent', { type: 'status', label: 'model', model: activeModel });
      sendPrompt();
    }
  });

  stdout.on('data', (chunk: string) => parser.feed(chunk));
  child.on('close', () => {
    clearStageTimer();
    parser.flush();
  });
  child.on('error', (err: Error) => fail(err.message));
  stdin.on('error', (err: Error) => fail(`stdin error: ${err.message}`));

  writeRpc(1, 'initialize', {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { terminal: false },
    clientInfo: { name: clientName, version: clientVersion },
  }, 'initialize');

  return {
    hasFatalError() {
      return fatal;
    },
    abort() {
      if (aborted || finished) return;
      aborted = true;
      finished = true;
      clearStageTimer();
      if (!sessionId || !child.stdin || child.stdin.destroyed || child.stdin.writableEnded) return;
      try {
        sendRpc(child.stdin, nextId, 'session/cancel', { sessionId });
        nextId += 1;
      } catch {
        // The caller owns process-signal fallback if the ACP transport is gone.
      }
    },
  };
}
