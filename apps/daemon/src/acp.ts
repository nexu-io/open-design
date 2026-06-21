import { spawn, type ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';
import path from 'node:path';
import {
  createDsmlArtifactTextSuppressor,
  type ArtifactTextSuppressor,
} from './artifacts/text-suppression.js';

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
// Gap-between-chunks watchdog for an ACP session stage. The timer resets on
// every line received from the agent, so this bounds *silent* periods, not
// total runtime. Default kept in line with the outer chat-run inactivity
// watchdog (10 min) so agents that spend several minutes silently writing
// large artifacts do not get killed before the outer watchdog can apply.
// Callers can override via `stageTimeoutMs`; the chat server reads
// `OD_ACP_STAGE_TIMEOUT_MS` from the environment.
// A non-positive `stageTimeoutMs` (`<= 0`) disables the watchdog entirely,
// mirroring the outer chat watchdog's escape-hatch semantics — without this,
// `OD_ACP_STAGE_TIMEOUT_MS=0` would call `setTimeout(..., 0)` and fail every
// ACP session on the next tick instead of disabling the watchdog.
const DEFAULT_STAGE_TIMEOUT_MS = 600_000;
const ACP_ARTIFACT_OPEN_PATTERN = String.raw`<\s*(?:\|?\s*DSML[\s,]+artifact\b|artifact\b)`;
const ACP_GENERATED_FILE_PREFIX_PATTERN =
  String.raw`(?:here\s+is|here'?s)\s+the\s+generated\s+file\s*:?\s*(?:\r?\n|\s)*`;
const ACP_ARTIFACT_ECHO_START_RE = new RegExp(
  String.raw`^\s*(?:${ACP_ARTIFACT_OPEN_PATTERN}|${ACP_GENERATED_FILE_PREFIX_PATTERN}${ACP_ARTIFACT_OPEN_PATTERN})`,
  'i',
);

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
  // How the `env` field of each mcpServer entry is shaped.
  // `'array'` (default) → `[{name, value}]` (Hermes, Kimi, …).
  // `'map'`   → `{"KEY": "val"}` (reasonix 1.x Go, standard MCP).
  envFormat?: 'array' | 'map';
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
  imagePaths?: string[];
  mcpServers?: AcpMcpServerInput[];
  // Passed through to buildAcpSessionNewParams — see AcpSessionOptions.
  envFormat?: 'array' | 'map';
  send: (event: string, payload: unknown) => void;
  clientName?: string;
  clientVersion?: string;
  stageTimeoutMs?: number;
  modelUnavailableErrorCode?: 'AMR_MODEL_UNAVAILABLE';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function resolveAcpTimeoutMs(env: NodeJS.ProcessEnv, fallbackMs: number): number {
  const raw = Number(env.OD_ACP_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' ? value as JsonObject : null;
}

export function buildAcpSessionNewParams(cwd: string, { mcpServers, envFormat = 'array' }: AcpSessionOptions = {}) {
  const servers = Array.isArray(mcpServers) ? mcpServers : [];
  const wantsMap = envFormat === 'map';
  return {
    cwd: path.resolve(cwd),
    // MCP is an optional compatibility layer. Default to no MCP servers so ACP
    // agents can run through the skill + CLI path without MCP support. Do not
    // auto-install or mutate user/global MCP config; callers must pass an
    // explicit per-session MCP descriptor when a compatible agent supports it.
    mcpServers: servers.map((s) => {
      const rawEnv = s?.env;
      // Already a plain object — pass through in map mode, convert to
      // array in array mode (e.g. live-artifacts MCP from
      // buildLiveArtifactsMcpServersForAgent which already respects
      // acpMcpEnvFormat).
      const isPlainObject =
        rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv);
      if (wantsMap && isPlainObject) {
        return {
          type: typeof s?.type === 'string' ? s.type : 'stdio',
          name: typeof s?.name === 'string' ? s.name : '',
          command: typeof s?.command === 'string' ? s.command : '',
          args: Array.isArray(s?.args) ? s.args : [],
          env: rawEnv,
        };
      }
      const envArr = Array.isArray(rawEnv) ? rawEnv : [];
      const env = wantsMap
        ? Object.fromEntries(envArr.map((e: any) => [e?.name ?? '', e?.value ?? '']))
        : isPlainObject
          ? Object.entries(rawEnv as Record<string, string>).map(
              ([name, value]) => ({ name, value }),
            )
          : envArr;
      return {
        type: typeof s?.type === 'string' ? s.type : 'stdio',
        name: typeof s?.name === 'string' ? s.name : '',
        command: typeof s?.command === 'string' ? s.command : '',
        args: Array.isArray(s?.args) ? s.args : [],
        env,
      };
    }),
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

function buildPromptBlocks(prompt: string, imagePaths: string[]): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [{ type: 'text', text: prompt }];
  for (const imagePath of imagePaths) {
    if (typeof imagePath !== 'string' || imagePath.trim().length === 0) continue;
    blocks.push({ type: 'resource_link', uri: imagePath });
  }
  return blocks;
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

function rpcErrorData(raw: unknown): unknown {
  const obj = asObject(raw);
  const error = asObject(obj?.error);
  return error && 'data' in error ? error.data : undefined;
}

function rpcErrorRetryable(data: unknown): boolean | undefined {
  const details = asObject(data);
  return typeof details?.retryable === 'boolean' ? details.retryable : undefined;
}

function promotedOpenCodeSessionErrorPayload(data: unknown, fallbackMessage: string) {
  const details = asObject(data);
  if (
    details?.kind !== 'opencode_session_error' ||
    details.source !== 'opencode' ||
    details.code !== 'ROLE_MARKER_HALLUCINATION'
  ) {
    return null;
  }
  const message =
    typeof details.message === 'string' && details.message.trim()
      ? details.message.trim()
      : fallbackMessage;
  return {
    message,
    error: {
      code: 'ROLE_MARKER_HALLUCINATION',
      message,
      retryable: typeof details.retryable === 'boolean' ? details.retryable : true,
      details: {
        ...details,
        promoted_by: 'open_design_acp',
      },
    },
  };
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

function acpUpdateStatus(update: JsonObject): string {
  return typeof update.status === 'string'
    ? update.status.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}

function isAcpCompletedStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'completed' || status === 'complete' || status === 'succeeded' || status === 'success';
}

function isAcpTerminalFailureStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'failed' || status === 'failure' || status === 'error' || status === 'cancelled' || status === 'canceled';
}

function acpToolCallId(update: JsonObject): string | null {
  return typeof update.toolCallId === 'string' && update.toolCallId.trim()
    ? update.toolCallId.trim()
    : null;
}

function isAcpArtifactWriteLabel(update: JsonObject): boolean {
  const label = [
    typeof update.title === 'string' ? update.title : '',
    typeof update.name === 'string' ? update.name : '',
  ].join(' ');
  return /\b(?:edit|write|create|update|save|patch|replace)\b/i.test(label);
}

function isAcpArtifactWriteUpdate(update: JsonObject, writeToolCallIds: Set<string>): boolean {
  if (!isAcpCompletedStatus(update)) return false;
  const toolCallId = acpToolCallId(update);
  return isAcpArtifactWriteLabel(update) || (toolCallId ? writeToolCallIds.has(toolCallId) : false);
}

// Best-effort file path for an ACP artifact-write tool call. ACP can carry a
// `locations: [{ path }]` array and/or `content: [{ type:'diff', path }]`
// entries, but many agents omit both and send only a human `title` ("edit").
// Returns null when no concrete path is present; the caller then falls back to
// the toolCallId as a dedup key.
function acpArtifactWritePath(update: JsonObject): string | null {
  // 1. ACP `locations: [{ path }]` and `content: [{ path }]` (diff entries).
  for (const field of [update.locations, update.content]) {
    if (!Array.isArray(field)) continue;
    for (const entry of field) {
      const path = asObject(entry)?.path;
      if (typeof path === 'string' && path.trim()) return path.trim();
    }
  }
  // 2. Tool input echoed by some agents as `rawInput.{path,file_path,filename}`.
  const rawInput = asObject(update.rawInput);
  for (const key of ['path', 'file_path', 'filename']) {
    const value = rawInput?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // 3. A filename token embedded in the human title, e.g. "Write index.html".
  // Keeping the real extension lets `isArtifactPath` correctly EXCLUDE
  // non-artifact writes (e.g. "edit config.json"), matching the claude path.
  const title = typeof update.title === 'string' ? update.title : '';
  const match = title.match(/[\w./-]+\.[A-Za-z0-9]+/);
  if (match?.[0]) return match[0];
  return null;
}

export function createJsonLineStream(onMessage: (message: unknown, rawLine: string) => void) {
  let buffer = '';
  let pendingJson = '';
  let pendingJsonLineCount = 0;

  const emit = (candidate: string): boolean => {
    try {
      onMessage(JSON.parse(candidate), candidate);
      return true;
    } catch {
      return false;
    }
  };

  const startPendingJson = (line: string) => {
    pendingJson = line;
    pendingJsonLineCount = 1;
  };

  const resetPendingJson = () => {
    pendingJson = '';
    pendingJsonLineCount = 0;
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (pendingJson) {
      const nextCandidate = `${pendingJson}\n${trimmed}`;
      if (emit(nextCandidate)) {
        resetPendingJson();
        return;
      }
      pendingJsonLineCount += 1;
      const state = classifyJsonCandidate(nextCandidate);
      if (
        state === 'incomplete' &&
        nextCandidate.length <= 128_000 &&
        pendingJsonLineCount <= 256
      ) {
        pendingJson = nextCandidate;
        return;
      }
      resetPendingJson();
      handleLine(trimmed);
      return;
    }
    if (emit(trimmed)) return;
    // ACP is line-delimited JSON-RPC, but a few bridges have emitted
    // pretty-printed JSON during startup. Keep a bounded aggregate so an
    // otherwise valid multiline initialize response does not get discarded
    // line-by-line and leave the session stuck in spawn pending.
    if (
      (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      classifyJsonCandidate(trimmed) === 'incomplete'
    ) {
      startPendingJson(trimmed);
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    },
    flush() {
      const trimmed = buffer.trim();
      buffer = '';
      if (trimmed) {
        handleLine(trimmed);
      }
      if (pendingJson && emit(pendingJson)) {
        pendingJson = '';
      }
      // Ignore trailing non-JSON log lines on stdout.
    },
  };
}

function classifyJsonCandidate(value: string): 'complete' | 'incomplete' | 'invalid' {
  type Frame =
    | { kind: 'object'; expect: 'keyOrEnd' | 'colon' | 'value' | 'commaOrEnd' }
    | { kind: 'array'; expect: 'valueOrEnd' | 'commaOrEnd' };
  const stack: Frame[] = [];
  let rootComplete = false;

  const afterValue = () => {
    const parent = stack.at(-1);
    if (!parent) {
      rootComplete = true;
      return;
    }
    parent.expect = 'commaOrEnd';
  };

  const closeFrame = (kind: 'object' | 'array'): boolean => {
    const current = stack.pop();
    if (!current || current.kind !== kind) return false;
    afterValue();
    return true;
  };

  const parseString = (start: number): number | null => {
    for (let index = start + 1; index < value.length; index += 1) {
      const char = value[index];
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '"') return index;
    }
    return null;
  };

  const parseLiteral = (start: number, literal: string): number | null | false => {
    for (let offset = 0; offset < literal.length; offset += 1) {
      const char = value[start + offset];
      if (char === undefined) return null;
      if (char !== literal[offset]) return false;
    }
    return start + literal.length - 1;
  };

  const parseNumber = (start: number): number | false => {
    let index = start;
    if (value[index] === '-') index += 1;
    if (value[index] === '0') {
      index += 1;
    } else if (/[1-9]/.test(value[index] ?? '')) {
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    } else {
      return false;
    }
    if (value[index] === '.') {
      index += 1;
      if (!/[0-9]/.test(value[index] ?? '')) return false;
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    }
    if (value[index] === 'e' || value[index] === 'E') {
      index += 1;
      if (value[index] === '+' || value[index] === '-') index += 1;
      if (!/[0-9]/.test(value[index] ?? '')) return false;
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    }
    return index - 1;
  };

  const parseValue = (index: number): number | null | false => {
    const char = value[index];
    if (char === '"') {
      const end = parseString(index);
      if (end === null) return null;
      afterValue();
      return end;
    }
    if (char === '{') {
      stack.push({ kind: 'object', expect: 'keyOrEnd' });
      return index;
    }
    if (char === '[') {
      stack.push({ kind: 'array', expect: 'valueOrEnd' });
      return index;
    }
    if (char === 't') {
      const end = parseLiteral(index, 'true');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === 'f') {
      const end = parseLiteral(index, 'false');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === 'n') {
      const end = parseLiteral(index, 'null');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === '-' || /[0-9]/.test(char ?? '')) {
      const end = parseNumber(index);
      if (end === false) return false;
      afterValue();
      return end;
    }
    return false;
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === undefined) break;
    if (/\s/.test(char)) continue;

    const current = stack.at(-1);
    if (!current) {
      if (rootComplete) return 'invalid';
      const end = parseValue(index);
      if (end === false) return 'invalid';
      if (end === null) return 'incomplete';
      index = end;
      continue;
    }

    if (current.kind === 'object') {
      if (current.expect === 'keyOrEnd') {
        if (char === '}') {
          if (!closeFrame('object')) return 'invalid';
          continue;
        }
        if (char !== '"') return 'invalid';
        const end = parseString(index);
        if (end === null) return 'incomplete';
        current.expect = 'colon';
        index = end;
        continue;
      }
      if (current.expect === 'colon') {
        if (char !== ':') return 'invalid';
        current.expect = 'value';
        continue;
      }
      if (current.expect === 'value') {
        const end = parseValue(index);
        if (end === false) return 'invalid';
        if (end === null) return 'incomplete';
        index = end;
        continue;
      }
      if (char === '}') {
        if (!closeFrame('object')) return 'invalid';
        continue;
      }
      if (char !== ',') return 'invalid';
      current.expect = 'keyOrEnd';
      continue;
    }

    if (current.expect === 'valueOrEnd') {
      if (char === ']') {
        if (!closeFrame('array')) return 'invalid';
        continue;
      }
      const end = parseValue(index);
      if (end === false) return 'invalid';
      if (end === null) return 'incomplete';
      index = end;
      continue;
    }
    if (char === ']') {
      if (!closeFrame('array')) return 'invalid';
      continue;
    }
    if (char !== ',') return 'invalid';
    current.expect = 'valueOrEnd';
  }

  return rootComplete && stack.length === 0 ? 'complete' : 'incomplete';
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
  const effectiveTimeoutMs = resolveAcpTimeoutMs(env, timeoutMs);
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

    let timer: TimerHandle | null = null;
    const finish = <T extends ModelOption[] | Error>(fn: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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

    if (effectiveTimeoutMs > 0) {
      timer = setTimeout(() => {
        fail(`ACP model detection timed out after ${effectiveTimeoutMs}ms`);
      }, effectiveTimeoutMs);
    }

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
  imagePaths = [],
  mcpServers,
  envFormat = 'array',
  send,
  clientName = 'open-design',
  clientVersion = 'runtime-adapter',
  stageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
  modelUnavailableErrorCode,
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
  let emittedTextChunk = false;
  let emittedVisibleTextChunk = false;
  let emittedToolCall = false;
  let emittedTextBuffer = '';
  let finished = false;
  let fatal = false;
  let aborted = false;
  let stageTimer: TimerHandle | null = null;
  let dsmlArtifactSuppressor: ArtifactTextSuppressor | null = null;
  let dsmlArtifactSuppressorToolCallId: string | null = null;
  let dsmlArtifactSuppressorArmedAfterText = false;
  let dsmlArtifactSuppressorSawIncrementalProse = false;
  const acpArtifactWriteToolCallIds = new Set<string>();
  // Per artifact-write tool call, accumulate the best concrete file path seen
  // across its frames and whether we have already mirrored it into canonical
  // tool_use/tool_result events. Emission is deferred to the terminal frame so
  // a `locations`/`rawInput` path that ACP only sends on a later update is used
  // for classification, instead of locking in a first-frame guess.
  const acpArtifactRunEventState = new Map<string, { path: string | null; emitted: boolean }>();

  const stageWatchdogDisabled = stageTimeoutMs <= 0;
  const resetStageTimer = (label: string) => {
    if (stageTimer) clearTimeout(stageTimer);
    // `stageTimeoutMs <= 0` disables the watchdog. Mirrors the outer chat
    // inactivity watchdog escape hatch (see server.ts → inactivityTimer).
    // Without this, an operator setting `OD_ACP_STAGE_TIMEOUT_MS=0` would
    // schedule a 0ms timeout that fires on the next tick and kills the
    // session immediately.
    if (stageWatchdogDisabled) return;
    stageTimer = setTimeout(() => {
      fail(`ACP ${label} timed out after ${stageTimeoutMs}ms`);
    }, stageTimeoutMs);
  };

  const clearStageTimer = () => {
    if (stageTimer) clearTimeout(stageTimer);
    stageTimer = null;
  };

  const amrModelUnavailablePayload = (message: string) => ({
    message,
    error: {
      code: 'AMR_MODEL_UNAVAILABLE',
      message,
      retryable: false,
      details: { kind: 'amr_model', action: 'choose_model' },
    },
  });

  const isModelUnavailableError = (message: string) => {
    const value = message.toLowerCase();
    return (
      value.includes('model not found') ||
      value.includes('providermodelnotfounderror') ||
      value.includes('unknown model') ||
      value.includes('invalid model')
    );
  };

  const failWithPayload = (payload: unknown) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
    send('error', payload);
    if (!child.killed) child.kill('SIGTERM');
  };

  const fail = (
    message: string,
    options: { forceModelUnavailable?: boolean; details?: unknown; retryable?: boolean } = {},
  ) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
    const useModelUnavailable =
      modelUnavailableErrorCode &&
      (options.forceModelUnavailable || isModelUnavailableError(message));
    send(
      'error',
      useModelUnavailable
        ? amrModelUnavailablePayload(message)
        : options.details === undefined && options.retryable === undefined
          ? { message }
          : {
              message,
              error: {
                code: 'AGENT_EXECUTION_FAILED',
                message,
                retryable: options.retryable ?? false,
                ...(options.details === undefined ? {} : { details: options.details }),
              },
            },
    );
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
        prompt: buildPromptBlocks(prompt, imagePaths),
      },
      'session/prompt',
    );
    send('agent', {
      type: 'status',
      label: 'waiting_for_first_output',
      elapsedMs: Date.now() - runStartedAt,
    });
    nextId += 1;
  };

  const finishCleanPrompt = (usageSource?: unknown) => {
    if (finished) return;
    const flushedText = dsmlArtifactSuppressor?.flush() ?? '';
    if (flushedText) {
      emittedVisibleTextChunk = true;
      send('agent', { type: 'text_delta', delta: flushedText });
    }
    const usage = formatUsage(usageSource);
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
    // Some ACP agents keep the child process alive after stdin closes,
    // waiting for another prompt. Each Open Design run owns one process per
    // turn, so close it once this prompt is cleanly complete.
    const cleanExitTimer = setTimeout(() => {
      if (!child.killed) child.kill('SIGTERM');
    }, 500);
    child.once('close', () => clearTimeout(cleanExitTimer));
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
    if (aborted || finished) return;
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
      const details = rpcErrorData(obj);
      const promotedPayload = promotedOpenCodeSessionErrorPayload(details, rpcErr);
      if (promotedPayload) {
        failWithPayload(promotedPayload);
        return;
      }
      const retryable = rpcErrorRetryable(details);
      fail(rpcErr, {
        details,
        ...(retryable === undefined ? {} : { retryable }),
      });
      return;
    }
    if (obj.method === 'session/request_permission') {
      replyPermission(obj);
      return;
    }
    const update = asObject(params?.update);
    if (obj.method === 'session/update' && update) {
      if (update.sessionUpdate !== 'agent_message_chunk' && update.sessionUpdate !== 'agent_thought_chunk') {
        send('agent', {
          type: 'status',
          label: String(update.sessionUpdate || 'session_update'),
          elapsedMs: Date.now() - runStartedAt,
        });
      }
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
          const isCumulativeSnapshot = text.startsWith(emittedTextBuffer);
          const delta = isCumulativeSnapshot
            ? text.slice(emittedTextBuffer.length)
            : text;
          if (delta.length > 0) {
            emittedTextChunk = true;
            emittedTextBuffer += delta;
            if (!emittedFirstTokenStatus) {
              emittedFirstTokenStatus = true;
              send('agent', {
                type: 'status',
                label: 'streaming',
                ttftMs: Date.now() - runStartedAt,
              });
            }
            if (dsmlArtifactSuppressor) {
              const wasSuppressingArtifact = dsmlArtifactSuppressor.isSuppressing();
              const hadPendingArtifactCandidate = dsmlArtifactSuppressor.hasPendingCandidate();
              const strippedDelta = dsmlArtifactSuppressor.strip(delta);
              const hasOpenArtifactCandidate =
                dsmlArtifactSuppressor.isSuppressing() || dsmlArtifactSuppressor.hasPendingCandidate();
              const consumedArtifactText = wasSuppressingArtifact || strippedDelta !== delta;
              const shouldPreserveIncrementalProse =
                !isCumulativeSnapshot &&
                !wasSuppressingArtifact &&
                !hadPendingArtifactCandidate &&
                !hasOpenArtifactCandidate &&
                (
                  strippedDelta === delta ||
                  (
                    !dsmlArtifactSuppressorArmedAfterText &&
                    dsmlArtifactSuppressorSawIncrementalProse &&
                    !ACP_ARTIFACT_ECHO_START_RE.test(delta)
                  )
                );
              const outputDelta = shouldPreserveIncrementalProse ? delta : strippedDelta;
              if (outputDelta) {
                emittedVisibleTextChunk = true;
                send('agent', { type: 'text_delta', delta: outputDelta });
              }
              if (
                strippedDelta === delta &&
                !wasSuppressingArtifact &&
                !hadPendingArtifactCandidate &&
                !hasOpenArtifactCandidate
              ) {
                dsmlArtifactSuppressorSawIncrementalProse = true;
              }
              if (consumedArtifactText && !hasOpenArtifactCandidate) {
                dsmlArtifactSuppressor = null;
                dsmlArtifactSuppressorToolCallId = null;
                dsmlArtifactSuppressorArmedAfterText = false;
                dsmlArtifactSuppressorSawIncrementalProse = false;
              }
            } else {
              emittedVisibleTextChunk = true;
              send('agent', { type: 'text_delta', delta });
            }
          }
        }
        return;
      }
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        // The turn did real work (a tool call / file edit), which is valid output even
        // when the model emits no closing assistant text. Track it so the prompt-complete
        // handler does not misreport such a turn as "no output / model unavailable".
        emittedToolCall = true;
        const toolCallId = acpToolCallId(update);
        if (toolCallId && isAcpArtifactWriteLabel(update)) {
          acpArtifactWriteToolCallIds.add(toolCallId);
        }
        // Mirror artifact-write tool calls into the daemon's canonical
        // tool_use/tool_result event shape so `countNewArtifacts`
        // (run-artifacts.ts) can see ACP file writes. Without this, every ACP
        // agent (AMR, Hermes, Kilo, Kiro, Devin, Vibe, …) reported
        // run_finished.artifact_count: 0 even when the run wrote artifacts,
        // because the ACP adapter emitted only text/status/thinking events and
        // never the tool_use/tool_result pair the counter scans for.
        //
        // This path only feeds the NO-PROJECT fallback (project runs use the
        // filesystem snapshot). Two correctness rules, both learned the hard
        // way in review:
        //   1. Defer emission to the TERMINAL frame and accumulate the best
        //      concrete path across frames — ACP often sends `locations` only
        //      on the completing update, and emitting on the first frame would
        //      lock in a wrong/empty guess that a later path can't correct.
        //   2. Never fabricate an artifact extension. `isArtifactPath` is what
        //      decides whether a write counts; feeding it a real path lets it
        //      correctly EXCLUDE non-artifact edits (`config.json`, `README.md`)
        //      and INCLUDE real artifacts. A write that never carries a concrete
        //      path stays keyed on its (extension-less) toolCallId, so it is
        //      simply not counted rather than inflating the metric with a
        //      synthetic `.html` — under-counting a truly opaque write is
        //      acceptable; a false-positive artifact is not.
        if (toolCallId) {
          const isWriteCall =
            isAcpArtifactWriteLabel(update) || acpArtifactWriteToolCallIds.has(toolCallId);
          if (isWriteCall) {
            let st = acpArtifactRunEventState.get(toolCallId);
            if (!st) {
              st = { path: null, emitted: false };
              acpArtifactRunEventState.set(toolCallId, st);
            }
            if (!st.path) st.path = acpArtifactWritePath(update);
            const failed = isAcpTerminalFailureStatus(update);
            if (!st.emitted && (failed || isAcpCompletedStatus(update))) {
              st.emitted = true;
              send('agent', {
                type: 'tool_use',
                id: toolCallId,
                name: 'Write',
                input: { file_path: st.path ?? toolCallId },
              });
              send('agent', { type: 'tool_result', toolUseId: toolCallId, isError: failed });
            }
          }
        }
        if (isAcpArtifactWriteUpdate(update, acpArtifactWriteToolCallIds)) {
          dsmlArtifactSuppressor = createDsmlArtifactTextSuppressor();
          dsmlArtifactSuppressorToolCallId = toolCallId;
          dsmlArtifactSuppressorArmedAfterText = emittedTextBuffer.length > 0;
          dsmlArtifactSuppressorSawIncrementalProse = false;
          if (toolCallId) acpArtifactWriteToolCallIds.delete(toolCallId);
        } else if (toolCallId && isAcpTerminalFailureStatus(update)) {
          const ownsPendingWriteSuppression = toolCallId === dsmlArtifactSuppressorToolCallId;
          const ownsPendingWriteCall = acpArtifactWriteToolCallIds.has(toolCallId);
          acpArtifactWriteToolCallIds.delete(toolCallId);
          if (ownsPendingWriteSuppression || ownsPendingWriteCall) {
            dsmlArtifactSuppressor = null;
            dsmlArtifactSuppressorToolCallId = null;
            dsmlArtifactSuppressorArmedAfterText = false;
            dsmlArtifactSuppressorSawIncrementalProse = false;
          }
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
          mcpServers ? { mcpServers, envFormat } : { envFormat },
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
      if (!emittedTextChunk && !emittedToolCall && modelUnavailableErrorCode) {
        fail(
          'ACP session completed without producing any assistant text. Refresh the AMR model list, choose a supported model, and retry this run.',
          { forceModelUnavailable: true },
        );
        return;
      }
      finishCleanPrompt(result.usage);
      return;
    }
    if (sessionId && model && model !== 'default' && obj.id === expectedId) {
      activeModel = currentModelFromSessionResult(result) ?? model;
      send('agent', { type: 'status', label: 'model', model: activeModel });
      sendPrompt();
    }
  });

  stdout.on('data', (chunk: string) => parser.feed(chunk));
  child.on('close', (code, signal) => {
    clearStageTimer();
    parser.flush();
    if (!finished && !aborted && !fatal) {
      fail(`ACP session exited before completion (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    }
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
    completedSuccessfully() {
      // Returns true when the prompt request resolved without a fatal error
      // and was not aborted. The chat consumer treats this as a successful
      // run even if the child process subsequently exited via SIGTERM
      // (which is expected for agents that don't shut down on stdin.end()).
      return finished && !fatal && !aborted;
    },
    abort() {
      if (aborted || finished) return;
      aborted = true;
      finished = true;
      clearStageTimer();
      if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded)
        return;
      // Only cancel an established session; before session/new resolves there
      // is no sessionId to cancel, but we must still close stdin below.
      if (sessionId) {
        try {
          sendRpc(child.stdin, nextId, 'session/cancel', { sessionId });
          nextId += 1;
        } catch {
          // The caller owns process-signal fallback if the ACP transport is gone.
        }
      }
      // Always close stdin so the agent receives EOF and shuts down its own
      // runtime — the vela ACP bridge tears down its private OpenCode server on
      // EOF — instead of lingering (and leaking that server) until the caller's
      // SIGTERM fallback fires. This also covers aborts during ACP startup,
      // before session/new returns. Mirrors the clean-completion path above.
      try {
        child.stdin.end();
      } catch {
        // Best effort; the caller still owns the SIGTERM/SIGKILL fallback.
      }
    },
  };
}
