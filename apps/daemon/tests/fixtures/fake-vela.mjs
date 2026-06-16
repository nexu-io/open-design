#!/usr/bin/env node
/**
 * Fake vela CLI used by AMR integration tests. Routes by the first argv:
 *
 *   `vela model preset --format json`   → prints the local AMR picker seed.
 *   `vela model list --format json`     → prints the authoritative remote
 *                                         AMR model catalog.
 *
 *   `vela login`                        → writes ~/.amr/config.json (the
 *                                         active VELA_PROFILE only) and
 *                                         exits 0. Mirrors the real
 *                                         device-authorization flow's
 *                                         on-disk side-effect without the
 *                                         interactive browser approval —
 *                                         tests for Open Design's daemon
 *                                         login route only care that the
 *                                         config file appears.
 *
 *   `vela models`                       → prints production-shaped public
 *                                         model ids from the Vela catalog.
 *
 *   `vela agent run --runtime opencode` → ACP stdio runtime. Speaks just
 *                                         enough of the protocol to drive
 *                                         Open Design's `detectAcpModels`
 *                                         and `attachAcpSession` through a
 *                                         complete turn:
 *
 *     initialize           → { protocolVersion, agentCapabilities, models }
 *     session/new          → { sessionId, models: { currentModelId, availableModels } }
 *     session/set_model    → {}
 *     session/prompt       → emits session/update notifications, then
 *                            { stopReason: 'end_turn', usage }
 *
 * Behaviour can be tweaked through env vars set by the test:
 *   FAKE_VELA_SESSION_ID         – session id returned by session/new
 *   FAKE_VELA_TEXT               – assistant text streamed back to the host
 *   FAKE_VELA_THOUGHT            – optional thought chunk streamed before text
 *   FAKE_VELA_LOGIN_DELAY_MS     – delay before writing config.json on `login`
 *                                   so tests can observe the in-flight state
 *   FAKE_VELA_LOGIN_USER_EMAIL   – email written into the saved profile
 *   FAKE_VELA_LOGIN_USER_PLAN    – plan written into the saved profile
 *   FAKE_VELA_SESSION_NEW_ERROR  – when set, session/new returns a JSON-RPC error
 *   FAKE_VELA_SET_MODEL_ERROR    – when set, session/set_model returns a JSON-RPC error
 *   FAKE_VELA_PROMPT_ERROR       – when set, session/prompt returns a JSON-RPC error
 *   FAKE_VELA_MODELS             – newline-separated `vela models` stdout
 *   FAKE_VELA_MODEL_PRESET_JSON  – JSON stdout for `model preset --format json`
 *   FAKE_VELA_MODEL_LIST_JSON    – JSON stdout for `model list --format json`
 *   FAKE_VELA_REQUIRE_SET_MODEL  – strict gate (default on); set to '0' to
 *                                   accept session/prompt without prior
 *                                   session/set_model (legacy behaviour)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, stdin, stdout, stderr, env, exit } from 'node:process';

const SESSION_ID = env.FAKE_VELA_SESSION_ID || 'fake-vela-session-1';
const ASSISTANT_TEXT = Object.prototype.hasOwnProperty.call(env, 'FAKE_VELA_TEXT')
  ? env.FAKE_VELA_TEXT
  : 'Hello from fake vela.';
const THOUGHT_TEXT = env.FAKE_VELA_THOUGHT || '';
const SESSION_NEW_ERROR = env.FAKE_VELA_SESSION_NEW_ERROR || '';
const SET_MODEL_ERROR = env.FAKE_VELA_SET_MODEL_ERROR || '';
const PROMPT_ERROR = env.FAKE_VELA_PROMPT_ERROR || '';
const AVAILABLE_MODELS = [
  { modelId: 'openai/gpt-5.4-mini', name: 'gpt-5.4-mini' },
  { modelId: 'anthropic/claude-3.7-sonnet', name: 'claude-3.7-sonnet' },
];
const DEFAULT_MODELS_STDOUT = [
  'public_model_deepseek_v3_2    vela',
  'public_model_deepseek_v4_flash    vela',
  'public_model_deepseek_v4_pro  vela',
  'public_model_gemini_2_5_flash    vela',
  'public_model_gemini_3_1_flash_lite_preview    vela',
  'public_model_gemini_3_1_pro_preview    vela',
  'public_model_gpt_5_4    vela',
  'public_model_gpt_5_4_mini    vela',
  'public_model_glm_5    vela',
  'public_model_glm_5_1  vela',
  'public_model_gpt_image_2    vela',
  'public_model_kimi_k2_6    vela',
  'public_model_minimax_m2_7    vela',
  'public_model_qwen3_235b_a22b  vela',
  'public_model_seedance_2    vela',
].join('\n');
const DEFAULT_MODEL_PRESET_JSON = JSON.stringify({
  source: 'preset',
  data: [
    { id: 'deepseek-v4-flash' },
    { id: 'deepseek-v3.2' },
    { id: 'glm-5.1' },
    { id: 'gemini-2.5-flash' },
  ],
});
const DEFAULT_MODEL_LIST_JSON = JSON.stringify({
  source: 'remote',
  data: [
    { id: 'deepseek-v3.2' },
    { id: 'deepseek-v4-flash' },
    { id: 'deepseek-v4-pro' },
    { id: 'gemini-2.5-flash' },
    { id: 'gemini-3.1-flash-lite-preview' },
    { id: 'gemini-3.1-pro-preview' },
    { id: 'gpt-5.4' },
    { id: 'gpt-5.4-mini' },
    { id: 'glm-5' },
    { id: 'glm-5.1' },
    { id: 'gpt-image-2' },
    { id: 'kimi-k2.6' },
    { id: 'minimax-m2.7' },
    { id: 'qwen3-235b-a22b' },
    { id: 'seedance-2' },
  ],
});

// Real `vela agent run --runtime opencode` rejects session/prompt until
// session/set_model has been called for the current session — see the
// AMR runtime def docblock and the integration test for the negative case.
// The stub mirrors that contract so a regression in attachAcpSession that
// silently skips set_model for AMR turns is caught here, not in production.
let currentModelId = null;
const sessionsWithModel = new Set();
const STRICT_SET_MODEL = process.env.FAKE_VELA_REQUIRE_SET_MODEL !== '0';

function writeMessage(obj) {
  stdout.write(`${JSON.stringify(obj)}\n`);
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function writeNotification(method, params) {
  writeMessage({ jsonrpc: '2.0', method, params });
}

function writeError(id, message, code = -32603) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

function logDiag(line) {
  stderr.write(`[fake-vela] ${line}\n`);
}

function emitSessionUpdates(sessionId) {
  if (THOUGHT_TEXT) {
    writeNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: THOUGHT_TEXT },
      },
    });
  }
  const chunks = ASSISTANT_TEXT.match(/.{1,16}/gs) || [ASSISTANT_TEXT];
  for (const chunk of chunks) {
    writeNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: chunk },
      },
    });
  }
}

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      writeResult(id, {
        protocolVersion: 1,
        agentCapabilities: { promptCapabilities: { embeddedContext: false } },
        models: {
          currentModelId,
          availableModels: AVAILABLE_MODELS,
        },
      });
      return;
    case 'session/new':
      if (SESSION_NEW_ERROR) {
        writeError(id, SESSION_NEW_ERROR);
        return;
      }
      writeResult(id, {
        sessionId: SESSION_ID,
        models: {
          currentModelId,
          availableModels: AVAILABLE_MODELS,
        },
      });
      return;
    case 'session/set_model': {
      if (SET_MODEL_ERROR) {
        writeError(id, SET_MODEL_ERROR, -32099);
        return;
      }
      const next = typeof params?.modelId === 'string' ? params.modelId.trim() : '';
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      if (next) currentModelId = next;
      sessionsWithModel.add(sessionId);
      writeResult(id, {});
      return;
    }
    case 'session/set_config_option': {
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      // Treat config-option model selection as set_model for the purposes of
      // the strict-set_model gate so adapters that go through the
      // configOptions branch are not penalized.
      sessionsWithModel.add(sessionId);
      writeResult(id, {});
      return;
    }
    case 'session/prompt': {
      if (PROMPT_ERROR) {
        writeError(id, PROMPT_ERROR, -32602);
        return;
      }
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      if (STRICT_SET_MODEL && !sessionsWithModel.has(sessionId)) {
        writeError(id, 'session/set_model must be called before session/prompt', -32602);
        return;
      }
      emitSessionUpdates(sessionId);
      writeResult(id, {
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      });
      return;
    }
    case 'session/cancel':
      logDiag('session/cancel received');
      return;
    default:
      if (typeof id !== 'undefined') {
        writeMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `unknown method: ${method}` },
        });
      }
      return;
  }
}

let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      logDiag(`bad json on stdin: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    handleMessage(parsed);
  }
});

stdin.on('end', () => {
  if (argv[2] === 'login') return;
  stdout.end();
  // Mirror real ACP runtimes that exit on EOF so the host's child.on('close')
  // fires promptly and the chat run can finalize.
  process.exit(0);
});

// `vela login`: the daemon's /api/integrations/vela/login route spawns this
// without expecting any ACP traffic. Real vela goes through a device-auth
// loop and writes ~/.amr/config.json on success; the stub skips the loop
// and just writes the file so Open Design's status reader and AmrLoginPill
// poller see the same on-disk projection production produces. The stdin EOF
// handler above ignores login mode so delayed login tests can keep this
// process alive without opening the ACP stdio bridge.
function loginAndExit() {
  if (env.FAKE_VELA_LOGIN_FAIL) {
    stderr.write(`${env.FAKE_VELA_LOGIN_FAIL}\n`);
    exit(1);
  }
  // Models a host whose direct amr-api device-authorization path is broken
  // (#3726): fail unless the daemon routed login through its IPv4 API proxy
  // (which sets VELA_API_URL). Lets tests assert the direct-first / proxy-
  // fallback contract of the login route.
  if (
    env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL &&
    !(env.VELA_API_URL ?? '').trim()
  ) {
    stderr.write(`${env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL}\n`);
    exit(1);
  }
  if (env.FAKE_VELA_ENV_DUMP_PATH) {
    writeFileSync(env.FAKE_VELA_ENV_DUMP_PATH, JSON.stringify(env, null, 2), 'utf8');
  }
  const profile = (env.VELA_PROFILE || 'prod').trim() || 'prod';
  const allowed = new Set(['prod', 'test', 'local']);
  if (!allowed.has(profile)) {
    stderr.write(`[fake-vela] unknown profile ${profile}; defaulting to prod\n`);
  }
  const profileName = allowed.has(profile) ? profile : 'prod';
  const delayMs = Number(env.FAKE_VELA_LOGIN_DELAY_MS) || 0;
  const userEmail = env.FAKE_VELA_LOGIN_USER_EMAIL || 'fake-user@example.com';
  const userPlan = env.FAKE_VELA_LOGIN_USER_PLAN || 'free';
  const finish = () => {
    const file = join(homedir(), '.amr', 'config.json');
    mkdirSync(dirname(file), { recursive: true });
    const payload = {
      profiles: {
        [profileName]: {
          controlKey: 'fake-control-key-0000000000000000000000',
          runtimeKey: 'fake-runtime-key-0000000000000000000000',
          apiUrl:
            profileName === 'local' ? 'http://localhost:18080' : '',
          linkUrl:
            profileName === 'local' ? 'http://localhost:18081' : '',
          user: {
            id: 'fake-user-id',
            email: userEmail,
            name: 'Fake User',
            plan: userPlan,
          },
        },
      },
    };
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    stdout.write(`Login successful for ${userEmail}.\n`);
    exit(0);
  };
  if (delayMs > 0) setTimeout(finish, delayMs);
  else finish();
}

if (argv[2] === 'login') {
  loginAndExit();
}

if (argv[2] === 'models') {
  stdout.write(`${env.FAKE_VELA_MODELS || DEFAULT_MODELS_STDOUT}\n`);
  exit(0);
}

if (argv[2] === 'model' && argv[4] === '--format' && argv[5] === 'json') {
  if (argv[3] === 'preset') {
    stdout.write(`${env.FAKE_VELA_MODEL_PRESET_JSON || DEFAULT_MODEL_PRESET_JSON}\n`);
    exit(0);
  }
  if (argv[3] === 'list') {
    stdout.write(`${env.FAKE_VELA_MODEL_LIST_JSON || DEFAULT_MODEL_LIST_JSON}\n`);
    exit(0);
  }
}
