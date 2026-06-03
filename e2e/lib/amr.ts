import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type FakeVelaOptions = {
  assistantText?: string;
  failAuthAtPrompt?: boolean;
  failBalanceAtPrompt?: boolean;
  requireLoginConfig?: boolean;
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

export async function writeFakeVelaBin(root: string, options: FakeVelaOptions = {}): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'vela');
  await writeFile(bin, renderFakeVelaScript(options), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

export async function seedVelaLoginConfig(
  homeDir: string,
  options: {
    profile?: string;
    email?: string;
    runtimeKey?: string;
    controlKey?: string;
  } = {},
): Promise<string> {
  const profile = options.profile ?? 'local';
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
            apiUrl: 'http://localhost:18080',
            linkUrl: 'http://localhost:18081',
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

function renderFakeVelaScript(options: FakeVelaOptions): string {
  return `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, stdin, stdout, stderr, env, exit } from 'node:process';

const ASSISTANT_TEXT = ${JSON.stringify(options.assistantText ?? DEFAULT_ASSISTANT_TEXT)};
const SESSION_ID = env.FAKE_VELA_SESSION_ID || 'fake-amr-session-1';
const AUTH_FAIL = ${options.failAuthAtPrompt === true ? 'true' : 'false'};
const BALANCE_FAIL = ${options.failBalanceAtPrompt === true ? 'true' : 'false'};
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
        apiUrl: 'http://localhost:18080',
        linkUrl: 'http://localhost:18081',
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
