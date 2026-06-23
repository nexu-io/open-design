import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type FakeVelaOptions = {
  assistantText?: string;
  endpoints?: VelaEndpoints;
  failAuthAtPrompt?: boolean;
  failBalanceAtPrompt?: boolean;
  failModelListInvalidApiKey?: boolean;
  requireLoginConfig?: boolean;
};

export type VelaEndpoints = {
  apiUrl: string;
  linkUrl: string;
};

export type FakeAmrRecoveryRequest = {
  body: Record<string, unknown>;
  method: string;
  pathname: string;
};

export type FakeAmrRecoveryApi = {
  close: () => Promise<void>;
  requests: FakeAmrRecoveryRequest[];
  url: string;
};

type FakeRecoveryContext = {
  mode: 'manual_topup';
  operationId: string;
  recoveryUrl: string | null;
  retryToken: string;
  status: 'active' | 'waiting_payment' | 'retry_available' | 'resuming' | 'completed' | 'failed' | 'canceled';
  version: number;
};

const DEFAULT_ASSISTANT_TEXT = 'Hello from the e2e fake vela.';
const PRESET_MODELS_JSON = JSON.stringify({
  source: 'preset',
  data: [
    { id: 'glm-5' },
  ],
});
const REMOTE_MODELS_JSON = JSON.stringify({
  source: 'remote',
  data: [
    { id: 'glm-5' },
  ],
});
const DEFAULT_RECOVERY_URL =
  'https://open-design.ai/amr/wallet?source=open_design&od_origin=open_design&od_entry_source=chat_error_recharge';

export async function writeFakeVelaBin(root: string, options: FakeVelaOptions = {}): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'vela');
  await writeFile(bin, renderFakeVelaScript(options), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

export async function startFakeAmrRecoveryApi(endpoints?: VelaEndpoints): Promise<FakeAmrRecoveryApi> {
  const requests: FakeAmrRecoveryRequest[] = [];
  const contexts = new Map<string, FakeRecoveryContext>();
  const listenUrl = endpoints ? new URL(endpoints.apiUrl) : null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const body = await readJsonBody(req);
    requests.push({ body, method: req.method ?? 'GET', pathname: url.pathname });

    if (req.method === 'POST' && url.pathname === '/api/v1/billing/recoveries') {
      const operationId = `op-${readString(body.runId) ?? randomUUID()}`;
      const context: FakeRecoveryContext = {
        mode: 'manual_topup',
        operationId,
        recoveryUrl: null,
        retryToken: 'test-retry-token',
        status: 'active',
        version: 1,
      };
      contexts.set(operationId, context);
      writeJson(res, 200, context);
      return;
    }

    const match = /^\/api\/v1\/billing\/recoveries\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) {
      writeJson(res, 404, { error: 'not_found' });
      return;
    }

    const operationId = decodeURIComponent(match[1] ?? '');
    const action = match[2] ?? null;
    const context = contexts.get(operationId);
    if (!context) {
      writeJson(res, 404, { error: 'unknown_recovery_operation' });
      return;
    }

    if (req.method === 'GET' && !action) {
      writeJson(res, 200, context);
      return;
    }

    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (action === 'insufficient-balance') {
      const next = {
        ...context,
        recoveryUrl: DEFAULT_RECOVERY_URL,
        status: 'waiting_payment' as const,
        version: context.version + 1,
      };
      contexts.set(operationId, next);
      writeJson(res, 200, next);
      return;
    }

    if (action === 'resume') {
      const next = {
        ...context,
        status: 'resuming' as const,
        version: context.version + 1,
      };
      contexts.set(operationId, next);
      writeJson(res, 200, next);
      return;
    }

    if (action === 'complete' || action === 'fail' || action === 'cancel') {
      const status: FakeRecoveryContext['status'] =
        action === 'complete'
          ? 'completed'
          : action === 'cancel'
            ? 'canceled'
            : 'failed';
      const next = {
        ...context,
        status,
        version: context.version + 1,
      };
      contexts.set(operationId, next);
      writeJson(res, 200, next);
      return;
    }

    writeJson(res, 404, { error: 'unknown_recovery_action' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(
      listenUrl?.port ? Number(listenUrl.port) : 0,
      listenUrl?.hostname || '127.0.0.1',
      () => {
        server.off('error', reject);
        resolve();
      },
    );
  });

  const address = server.address() as AddressInfo;
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    requests,
    url: `http://127.0.0.1:${address.port}`,
  };
}

export async function seedVelaLoginConfig(
  homeDir: string,
  options: {
    endpoints?: VelaEndpoints;
    apiUrl?: string;
    profile?: string;
    email?: string;
    linkUrl?: string;
    runtimeKey?: string;
    controlKey?: string;
  } = {},
): Promise<string> {
  const profile = options.profile ?? 'local';
  const fallbackEndpoints = defaultVelaEndpoints();
  const endpoints = options.endpoints ?? {
    apiUrl: options.apiUrl ?? fallbackEndpoints.apiUrl,
    linkUrl: options.linkUrl ?? fallbackEndpoints.linkUrl,
  };
  const configDir = join(homeDir, '.amr');
  const file = join(configDir, 'config.json');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        profiles: {
          [profile]: {
            runtimeKey: options.runtimeKey ?? 'fake-runtime-key',
            controlKey: options.controlKey ?? 'fake-control-key',
            apiUrl: endpoints.apiUrl,
            linkUrl: endpoints.linkUrl,
            user: {
              id: 'fake-user-id',
              email: options.email ?? 'e2e@example.com',
              plan: 'free',
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  return file;
}

export async function clearVelaLoginConfig(homeDir: string): Promise<void> {
  await rm(join(homeDir, '.amr', 'config.json'), { force: true });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function writeJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function renderFakeVelaScript(options: FakeVelaOptions): string {
  const endpoints = options.endpoints ?? defaultVelaEndpoints();
  return `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, stdin, stdout, stderr, env, exit } from 'node:process';

const ASSISTANT_TEXT = ${JSON.stringify(options.assistantText ?? DEFAULT_ASSISTANT_TEXT)};
const SESSION_ID = env.FAKE_VELA_SESSION_ID || 'fake-amr-session-1';
const AUTH_FAIL = ${options.failAuthAtPrompt === true ? 'true' : 'false'};
const BALANCE_FAIL = ${options.failBalanceAtPrompt === true ? 'true' : 'false'};
const MODEL_LIST_INVALID_API_KEY = ${options.failModelListInvalidApiKey === true ? 'true' : 'false'};
const REQUIRE_LOGIN = ${options.requireLoginConfig === false ? 'false' : 'true'};

function writeMessage(obj) {
  stdout.write(JSON.stringify(obj) + '\\n');
}
function writeResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}
function writeError(id, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code: -32001, message } });
}
function writeNotification(method, params) {
  writeMessage({ jsonrpc: '2.0', method, params });
}
function currentProfile() {
  return (env.OPEN_DESIGN_AMR_PROFILE || env.VELA_PROFILE || 'local').trim() || 'local';
}
function readLoginConfig() {
  const file = join(homedir(), '.amr', 'config.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function hasRuntimeKey() {
  const profile = currentProfile();
  const cfg = readLoginConfig();
  return Boolean(cfg && cfg.profiles && cfg.profiles[profile] && cfg.profiles[profile].runtimeKey);
}

if (argv[2] === 'login') {
  const file = join(homedir(), '.amr', 'config.json');
  mkdirSync(dirname(file), { recursive: true });
  const profile = currentProfile();
  writeFileSync(file, JSON.stringify({
    profiles: {
      [profile]: {
        runtimeKey: 'fake-runtime-key-0000000000000000000000',
        controlKey: 'fake-control-key-0000000000000000000000',
        apiUrl: env.VELA_API_URL || ${JSON.stringify(endpoints.apiUrl)},
        linkUrl: env.VELA_LINK_URL || ${JSON.stringify(endpoints.linkUrl)},
        user: { id: 'fake-user-id', email: env.FAKE_VELA_LOGIN_USER_EMAIL || 'e2e@example.com', plan: 'free' },
      },
    },
  }, null, 2), 'utf8');
  exit(0);
}

if (argv[2] === 'models') {
  stdout.write('public_model_glm_5    vela\\n');
  exit(0);
}

if (argv[2] === 'model' && argv[3] === 'preset' && argv[4] === '--format' && argv[5] === 'json') {
  stdout.write(${JSON.stringify(PRESET_MODELS_JSON)} + '\\n');
  exit(0);
}

if (argv[2] === 'model' && argv[3] === 'list' && argv[4] === '--format' && argv[5] === 'json') {
  if (MODEL_LIST_INVALID_API_KEY) {
    stderr.write('Error: list Link models: API request failed with status 401: invalid_api_key\\n');
    exit(1);
  }
  stdout.write(${JSON.stringify(REMOTE_MODELS_JSON)} + '\\n');
  exit(0);
}

if (REQUIRE_LOGIN && !hasRuntimeKey()) {
  stderr.write('AMR login missing or expired. Please sign in again.\\n');
  exit(1);
}

const sessionsWithModel = new Set();
let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});
stdin.on('end', () => { stdout.end(); exit(0); });

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    writeResult(id, {
      protocolVersion: 1,
      agentCapabilities: { promptCapabilities: { text: true } },
      models: {
        currentModelId: 'glm-5',
        availableModels: [{ modelId: 'glm-5', name: 'glm-5' }],
      },
    });
    return;
  }
  if (method === 'session/new') {
    writeResult(id, {
      sessionId: SESSION_ID,
      models: {
        currentModelId: 'glm-5',
        availableModels: [{ modelId: 'glm-5', name: 'glm-5' }],
      },
    });
    return;
  }
  if (method === 'session/set_model' || method === 'session/set_config_option') {
    const sid = (params && params.sessionId) || SESSION_ID;
    sessionsWithModel.add(sid);
    writeResult(id, {});
    return;
  }
  if (method === 'session/prompt') {
    const sid = (params && params.sessionId) || SESSION_ID;
    if (!sessionsWithModel.has(sid)) {
      writeError(id, 'session/set_model must be called before session/prompt');
      return;
    }
    if (AUTH_FAIL) {
      writeError(id, 'Your authentication token has expired. Please sign in again.');
      return;
    }
    if (BALANCE_FAIL) {
      writeMessage({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'HTTP 429: {"code":"insufficient_balance","message":"insufficient balance"}',
        },
      });
      return;
    }
    writeNotification('session/update', {
      sessionId: sid,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ASSISTANT_TEXT } },
    });
    writeResult(id, {
      stopReason: 'end_turn',
      usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12 },
    });
    return;
  }
  if (typeof id !== 'undefined') {
    writeMessage({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown method ' + method } });
  }
}
`;
}

function defaultVelaEndpoints(): VelaEndpoints {
  return {
    apiUrl: 'http://localhost:18080',
    linkUrl: 'http://localhost:18081',
  };
}
