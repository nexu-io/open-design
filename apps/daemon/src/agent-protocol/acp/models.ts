/** @module agent-protocol/acp/models
 * ACP model detection, normalisation, and config-option selection. The primary
 * export `detectAcpModels` spawns an ACP subprocess, performs the
 * `initialize` + `session/new` handshake, and returns the available model list.
 * Consumed by runtime adapter definitions (runtimes/defs/shared.ts). Depends
 * on the core JSON-line stream and acp/types, acp/constants, acp/json,
 * acp/rpc, and acp/session-params.
 */
import { spawn } from 'node:child_process';
import { createJsonLineStream } from '../core/index.js';
import type { JsonRpcId, JsonObject, TimerHandle } from './types.js';
import { ACP_PROTOCOL_VERSION, DEFAULT_TIMEOUT_MS, MODEL_CONFIG_OPTION_IDS } from './constants.js';
import { errorMessage, resolveAcpTimeoutMs, asObject } from './json.js';
import { sendRpc, rpcErrorMessage } from './rpc.js';
import { buildAcpSessionNewParams } from './session-params.js';

/** A single model entry exposed to the daemon's model-selection UI and to `session/set_model` calls. */
export interface ModelOption {
  id: string;
  label: string;
}
/** Parsed model-selection config option extracted from an ACP `session/new` result's `configOptions` array. */
export interface AcpModelConfigOption {
  configId: string;
  currentValue: string | null;
  values: unknown[];
}
/** Options accepted by `detectAcpModels` to control how the probe subprocess is launched and identified. */
export interface DetectAcpModelsOptions {
  bin: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  defaultModelOption?: ModelOption;
}
/**
 * Normalises a raw config-option field value to a lowercase, whitespace- and
 * punctuation-stripped token for fuzzy matching against `MODEL_CONFIG_OPTION_IDS`.
 *
 * @param value - A raw field value from an ACP config option object.
 * @returns A normalised token string, or `''` when `value` is not a string.
 */
export function normalizeConfigOptionToken(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}
/**
 * Returns `true` when the given `option` object from `configOptions` represents
 * a model-selection config option, using a cascade of category, id, and name
 * normalisation checks against `MODEL_CONFIG_OPTION_IDS`.
 *
 * @param option - A single item from the `configOptions` array.
 * @param configId - The trimmed `id` field of that item.
 */
export function isModelConfigOption(option: JsonObject, configId: string): boolean {
  const category = normalizeConfigOptionToken(option.category);
  if (category === 'model') return true;
  const id = normalizeConfigOptionToken(configId);
  if (id === 'model') return true;
  if (category) return false;
  const name = normalizeConfigOptionToken(option.name);
  return MODEL_CONFIG_OPTION_IDS.has(id) || name === 'model';
}
/**
 * Scans the `configOptions` array from an ACP `session/new` result and returns
 * the first entry that passes `isModelConfigOption`. Returns `null` when no
 * model config option is found, so callers can fall back to the `models` field.
 *
 * @param configOptions - The raw `result.configOptions` value from a session response.
 * @returns A parsed `AcpModelConfigOption` or `null` when absent.
 */
export function findModelConfigOption(configOptions: unknown): AcpModelConfigOption | null {
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
/**
 * Extracts and normalises the available models list from an ACP
 * `configOptions` array (preferred) into a `ModelOption[]`. Prepends
 * `defaultModelOption` and deduplicates by id. Returns `null` when no model
 * config option is found in `configOptions`.
 *
 * @param configOptions - The raw `result.configOptions` from a session response.
 * @param defaultModelOption - The fallback option to prepend to the list.
 * @returns `{ currentModelId, models }` or `null` when no config option is found.
 */
export function normalizeModelConfigOptions(
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
/**
 * Produces the final ordered `ModelOption[]` for a session, merging the
 * `configOptions` path (preferred when it yields more than one option) with
 * the legacy `models.availableModels` path. Always includes `defaultModelOption`
 * at position zero and deduplicates by id.
 *
 * @param models - The raw `result.models` value from a `session/new` response.
 * @param defaultModelOption - The fallback option to prepend.
 * @param configOptions - Optional `result.configOptions` for the config-option path.
 * @returns A deduplicated array of `ModelOption` items.
 */
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
/**
 * Returns `true` for JSON-RPC error codes that indicate a model-selection
 * failure from which the session can recover by falling back to the default
 * model and sending the prompt anyway.
 *
 * @param code - The `error.code` value from a JSON-RPC error response.
 */
export function modelSelectionErrorIsRecoverable(code: unknown): boolean {
  return code === -32603 || code === -32602 || code === -32601 || code === -32002;
}
/**
 * Reads the currently active model id from a `session/new` (or
 * `session/set_model`) result object, checking `configOptions` first and
 * falling back to `models.currentModelId`. Returns `null` when neither is set.
 *
 * @param result - The parsed `result` object from a session handshake response.
 */
export function currentModelFromSessionResult(result: JsonObject): string | null {
  const configCurrent = findModelConfigOption(result.configOptions)?.currentValue;
  if (configCurrent) return configCurrent;
  const models = asObject(result.models);
  return typeof models?.currentModelId === 'string' && models.currentModelId.trim()
    ? models.currentModelId.trim()
    : null;
}
/**
 * Probes a running ACP binary by spawning it, performing the
 * `initialize` → `session/new` handshake, and reading the model list from the
 * session result. The child is killed with `SIGTERM` once the list is
 * extracted or the timeout expires.
 *
 * Used by runtime adapter definitions to populate the model-selection dropdown
 * without waiting for an actual prompt run.
 *
 * @param options.bin - Absolute path or `$PATH`-resolvable name of the ACP binary.
 * @param options.args - CLI arguments to pass to the binary.
 * @param options.cwd - Working directory for the probe subprocess.
 * @param options.env - Environment for the probe subprocess (default: `process.env`).
 * @param options.timeoutMs - Hard timeout for the probe; subject to `MAX_TIMEOUT_MS`.
 * @param options.clientName - Client name sent in the `initialize` handshake.
 * @param options.clientVersion - Client version sent in the `initialize` handshake.
 * @param options.defaultModelOption - Fallback option prepended to the result list.
 * @returns A promise resolving to the available `ModelOption[]`.
 */
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
