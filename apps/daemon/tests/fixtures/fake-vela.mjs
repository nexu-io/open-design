#!/usr/bin/env node
/**
 * Fake vela CLI used by AMR integration tests. Routes by the first argv:
 *
 *   `vela model preset --format json`   → prints the local AMR picker seed.
 *   `vela model list --all --format json` → prints the authoritative remote
 *                                         AMR model catalog.
 *
 *   `vela login`                        → writes ~/.amr/config.json (the
 *                                         active VELA_PROFILE only) and
 *                                         exits 0. Mirrors the real
 *                                         device-authorization flow's
 *                                         on-disk side-effect without the
 *                                         interactive browser approval —
 *                                         tests for OpenDesign's daemon
 *                                         login route only care that the
 *                                         config file appears.
 *
 *   `vela run terminal ... --json`      → emits a terminal receipt or a stable
 *                                         JSON error envelope.
 *
 *   `vela models`                       → prints production-shaped public
 *                                         model ids from the Vela catalog.
 *
 *   `vela agent run --runtime opencode` → ACP stdio runtime. Speaks just
 *                                         enough of the protocol to drive
 *                                         OpenDesign's `detectAcpModels`
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
 *   FAKE_VELA_TERMINAL_MODE       – success, replay, transient, unsupported,
 *                                   auth, forbidden, or invalid
 *   FAKE_VELA_TERMINAL_LOG        – optional JSONL argv/environment log
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
 *   FAKE_VELA_PROMPT_ERROR_ON_LOAD – when set, session/prompt errors only after session/load
 *   FAKE_VELA_STALL_AFTER_PROMPT – when set to '1', session/prompt never completes
 *                                   and emits non-substantive heartbeat updates
 *   FAKE_VELA_STALL_HEARTBEAT_MS – heartbeat interval for the stall above
 *                                   (default 20). '0' = emit nothing at all,
 *                                   i.e. a bridge that goes silent on stdout
 *                                   while the process stays alive
 *   FAKE_VELA_TEXT_BEFORE_STALL  – when set to '1', stream the assistant text
 *                                   once before stalling
 *   FAKE_VELA_OPEN_TOOL_BEFORE_STALL – when set to '1', open a concrete
 *                                   (non-think) tool call that never reaches a
 *                                   terminal status before stalling. Models an
 *                                   agent that goes silent WITH a tool in
 *                                   flight, which is the shape that makes the
 *                                   host synthesize terminal tool events on the
 *                                   failure path
 *   FAKE_VELA_STDERR_ON_SIGTERM  – when set to '1', log a shutdown line to
 *                                   stderr on SIGTERM and exit 143, the way a
 *                                   real CLI does when the host kills it
 *   FAKE_VELA_IGNORE_SIGTERM     – when set to '1', swallow SIGTERM and stay
 *                                   alive, modelling a CLI (or a wrapper shim)
 *                                   that is slow to die or never honours the
 *                                   signal at all
 *   FAKE_VELA_DESCENDANT_ACTIVITY_FILE – when set, spawn a SIGTERM-ignoring
 *                                   descendant that appends activity ticks to
 *                                   this file while the ACP prompt is stalled
 *   FAKE_VELA_DESCENDANT_PID_FILE – optional file that receives that
 *                                   descendant's pid for leak-safe test cleanup
 *   FAKE_VELA_PROMPT_RESULT_DELAY_MS – delay the terminal session/prompt result
 *                                      after streaming substantive output
 *   FAKE_VELA_MODELS             – newline-separated `vela models` stdout
 *   FAKE_VELA_MODEL_PRESET_JSON  – JSON stdout for `model preset --format json`
 *   FAKE_VELA_MODEL_LIST_JSON    – JSON stdout for `model list --all --format json`
 *   FAKE_VELA_REQUIRE_SET_MODEL  – strict gate (default on); set to '0' to
 *                                   accept session/prompt without prior
 *                                   session/set_model (legacy behaviour)
 *   FAKE_VELA_LOG_SET_MODEL      – when set to '1', include session/set_model
 *                                   entries in FAKE_VELA_INVOCATION_LOG
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn as spawnChild } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, stdin, stdout, stderr, env, exit } from 'node:process';

const SESSION_ID = env.FAKE_VELA_SESSION_ID || 'fake-vela-session-1';
// Durable upstream (OpenCode) session handle reported on session/new and
// session/load — the value the daemon captures and replays to resume.
const OPENCODE_SESSION_ID = env.FAKE_VELA_OPENCODE_SESSION_ID || 'oc-fake-1';
// When set, a resumed session/prompt fails with the structured resume_failed
// error (modelling vela's pre-prompt probe finding the session gone).
const RESUME_FAILED = env.FAKE_VELA_RESUME_FAILED || '';
const ASSISTANT_TEXT = Object.prototype.hasOwnProperty.call(env, 'FAKE_VELA_TEXT')
  ? env.FAKE_VELA_TEXT
  : 'Hello from fake vela.';
const THOUGHT_TEXT = env.FAKE_VELA_THOUGHT || '';
const SESSION_NEW_ERROR = env.FAKE_VELA_SESSION_NEW_ERROR || '';
const SET_MODEL_ERROR = env.FAKE_VELA_SET_MODEL_ERROR || '';
const PROMPT_ERROR = env.FAKE_VELA_PROMPT_ERROR || '';
const PROMPT_ERROR_ON_LOAD = env.FAKE_VELA_PROMPT_ERROR_ON_LOAD || '';
const STALL_AFTER_PROMPT = env.FAKE_VELA_STALL_AFTER_PROMPT === '1';
const STALL_HEARTBEAT_MS = env.FAKE_VELA_STALL_HEARTBEAT_MS === undefined
  ? 20
  : Number(env.FAKE_VELA_STALL_HEARTBEAT_MS) || 0;
const TEXT_BEFORE_STALL = env.FAKE_VELA_TEXT_BEFORE_STALL === '1';
const OPEN_TOOL_BEFORE_STALL = env.FAKE_VELA_OPEN_TOOL_BEFORE_STALL === '1';
const STDERR_ON_SIGTERM = env.FAKE_VELA_STDERR_ON_SIGTERM === '1';
const IGNORE_SIGTERM = env.FAKE_VELA_IGNORE_SIGTERM === '1';
const DESCENDANT_ACTIVITY_FILE = env.FAKE_VELA_DESCENDANT_ACTIVITY_FILE || '';
const DESCENDANT_PID_FILE = env.FAKE_VELA_DESCENDANT_PID_FILE || '';
const PROMPT_RESULT_DELAY_MS = Number(env.FAKE_VELA_PROMPT_RESULT_DELAY_MS) || 0;
const OMIT_PROMPT_USAGE = env.FAKE_VELA_OMIT_PROMPT_USAGE === '1';
const STAY_ALIVE_AFTER_PROMPT_MS = Number(env.FAKE_VELA_STAY_ALIVE_AFTER_PROMPT_MS) || 0;
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
// Whether THIS process bound a resumed upstream session via session/load.
// vela spawns one process per turn, so a fresh session/new turn and a resumed
// session/load turn are distinct processes — `didLoad` lets the RESUME_FAILED
// branch fire ONLY on the resume turn (mirroring a session that vanished
// upstream), so a daemon that clears the dead handle and reseeds with a fresh
// session/new on the next turn recovers instead of failing forever.
let didLoad = false;

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

// Real agent CLIs log a line or two while shutting down after the host kills
// them. Modelling that is the only way a spec can cover what the daemon does
// with agent bytes that arrive AFTER it has already given up on the turn.
// The two knobs compose. `STDERR_ON_SIGTERM` alone models a CLI that logs a
// shutdown line and exits; `IGNORE_SIGTERM` alone models one that never honours
// the signal; together they model the worst case for the host — a child that
// keeps talking on stderr while refusing to die, so every one of those late
// bytes reaches the daemon's raw stderr handler after the verdict.
if (STDERR_ON_SIGTERM || IGNORE_SIGTERM) {
  // Logged once, like a real CLI announcing shutdown, not once per signal —
  // repeating it on every SIGTERM would keep pushing the host's timers out and
  // hide the race this models.
  let announcedShutdown = false;
  process.on('SIGTERM', () => {
    if (STDERR_ON_SIGTERM && !announcedShutdown) {
      announcedShutdown = true;
      logDiag('shutting down after SIGTERM');
    }
    if (!IGNORE_SIGTERM) exit(143);
  });
}

// Append one line per session-bind method (`new` / `load`) to the file named by
// FAKE_VELA_INVOCATION_LOG, so a multi-turn server test can assert the resume
// sequence across the separate per-turn vela processes (e.g. ['new','load','new']).
function logInvocation(method) {
  const file = env.FAKE_VELA_INVOCATION_LOG;
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify({ method })}\n`);
  } catch {
    /* best-effort diagnostics only */
  }
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
      logInvocation('new');
      if (SESSION_NEW_ERROR) {
        writeError(id, SESSION_NEW_ERROR);
        return;
      }
      writeResult(id, {
        sessionId: SESSION_ID,
        // FAKE_VELA_OMIT_OPENCODE_SESSION_ID models an older vela (or a handshake
        // that never surfaced the durable handle): the daemon captures a null
        // handle, which must CLEAR the row so the next turn opens a fresh session
        // instead of resuming a non-existent one.
        ...(env.FAKE_VELA_OMIT_OPENCODE_SESSION_ID ? {} : { openCodeSessionId: OPENCODE_SESSION_ID }),
        models: {
          currentModelId,
          availableModels: AVAILABLE_MODELS,
        },
      });
      return;
    case 'session/load': {
      // Resume: bind the prior upstream session, echoing back the durable
      // handle. (vela validates existence before the first prompt, so a missing
      // session surfaces as resume_failed on session/prompt, not here.)
      const durable = typeof params?.sessionId === 'string' ? params.sessionId : OPENCODE_SESSION_ID;
      logInvocation('load');
      didLoad = true;
      writeResult(id, { sessionId: SESSION_ID, openCodeSessionId: durable });
      return;
    }
    case 'session/set_model': {
      if (SET_MODEL_ERROR) {
        writeError(id, SET_MODEL_ERROR, -32099);
        return;
      }
      const next = typeof params?.modelId === 'string' ? params.modelId.trim() : '';
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      if (next) currentModelId = next;
      if (env.FAKE_VELA_LOG_SET_MODEL === '1') {
        logInvocation(`set_model:${next || '<empty>'}`);
      }
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
      if (RESUME_FAILED && didLoad) {
        // Structured resume-miss: the resumed session is gone. Mirrors vela's
        // pre-prompt probe emitting resume_failed BEFORE any model call. Gated on
        // `didLoad` so it fires only on a resume turn — a fresh session/new turn
        // (e.g. the daemon reseeding after it cleared the dead handle) succeeds.
        writeMessage({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32600,
            message: 'the resumed session could not be loaded',
            data: { kind: 'resume_failed', phase: 'session_load', retryable: true },
          },
        });
        return;
      }
      const promptError = PROMPT_ERROR || (didLoad ? PROMPT_ERROR_ON_LOAD : '');
      if (promptError) {
        writeError(id, promptError, -32602);
        return;
      }
      const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      if (STRICT_SET_MODEL && !sessionsWithModel.has(sessionId)) {
        writeError(id, 'session/set_model must be called before session/prompt', -32602);
        return;
      }
      if (STALL_AFTER_PROMPT) {
        if (TEXT_BEFORE_STALL) emitSessionUpdates(sessionId);
        if (DESCENDANT_ACTIVITY_FILE) {
          const descendant = spawnChild(process.execPath, [
            '-e',
            `const fs = require('node:fs');
const activityFile = ${JSON.stringify(DESCENDANT_ACTIVITY_FILE)};
process.on('SIGTERM', () => {});
const tick = () => fs.appendFileSync(activityFile, String(Date.now()) + '\\n');
tick();
setInterval(tick, 25);`,
          ], { stdio: 'ignore' });
          if (DESCENDANT_PID_FILE) writeFileSync(DESCENDANT_PID_FILE, String(descendant.pid));
        }
        // A concrete tool the agent never closes. `kind: 'read'` is a
        // recognized non-think, non-write family, and `in_progress` is not a
        // terminal status, so the host keeps this call open in
        // `acpToolRunEventState` for the whole stall.
        if (OPEN_TOOL_BEFORE_STALL) {
          writeNotification('session/update', {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'fake-vela-open-tool-1',
              kind: 'read',
              title: 'Read design tokens',
              status: 'in_progress',
              rawInput: { path: 'tokens.json' },
            },
          });
        }
        // Keep both the ACP stage watchdog and the outer chat inactivity
        // watchdog fed without producing text, thinking, tools, artifacts, or
        // a terminal prompt result. This models a provider bridge that stays
        // transport-alive forever while never returning a first model output.
        //
        // `FAKE_VELA_STALL_HEARTBEAT_MS=0` drops the heartbeats entirely: the
        // bridge goes completely silent on stdout while the process stays
        // alive. That is the shape of the 2026-07-28 AMR stall — vela stopped
        // writing ACP lines while still holding the turn open — and it is the
        // only way to let a watchdog actually fire in a spec.
        if (STALL_HEARTBEAT_MS > 0) {
          setInterval(() => {
            writeNotification('session/update', {
              sessionId,
              update: { sessionUpdate: 'heartbeat' },
            });
          }, STALL_HEARTBEAT_MS);
        } else {
          // Hold the event loop open without writing anything.
          setInterval(() => {}, 60_000);
        }
        return;
      }
      emitSessionUpdates(sessionId);
      const finishPrompt = () => {
        writeResult(id, {
          stopReason: 'end_turn',
          ...(OMIT_PROMPT_USAGE
            ? {}
            : { usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } }),
        });
        if (STAY_ALIVE_AFTER_PROMPT_MS > 0) setTimeout(() => {}, STAY_ALIVE_AFTER_PROMPT_MS);
      };
      if (PROMPT_RESULT_DELAY_MS > 0) {
        setTimeout(finishPrompt, PROMPT_RESULT_DELAY_MS);
      } else {
        finishPrompt();
      }
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
// and just writes the file so OpenDesign's status reader and AmrLoginPill
// poller see the same on-disk projection production produces. The stdin EOF
// handler above ignores login mode so delayed login tests can keep this
// process alive without opening the ACP stdio bridge.
function loginAndExit() {
  const logLoginLifecycle = (event) => {
    if (!env.FAKE_VELA_LOGIN_INVOCATION_LOG) return;
    appendFileSync(env.FAKE_VELA_LOGIN_INVOCATION_LOG, `${JSON.stringify({
      event,
      route: (env.VELA_API_URL ?? '').trim() ? 'proxy' : 'direct',
    })}\n`);
  };
  logLoginLifecycle('start');
  if (
    env.FAKE_VELA_LOGIN_ACTIVATION_THEN_EXIT_DELAY_MS
    && !(env.VELA_API_URL ?? '').trim()
  ) {
    const delayMs = Number(env.FAKE_VELA_LOGIN_ACTIVATION_THEN_EXIT_DELAY_MS) || 1;
    const exitCode = Number(env.FAKE_VELA_LOGIN_ACTIVATION_THEN_EXIT_CODE) || 0;
    const activationBlock = [
      'Open this URL to continue:',
      'https://fake-vela.example/cli/activate?deviceId=activation-then-exit',
      '',
      'Code: ACTIVATE-EXIT',
      '',
    ].join('\n');
    setTimeout(() => {
      stdout.write(activationBlock, () => {
        logLoginLifecycle('exit');
        exit(exitCode);
      });
    }, delayMs);
    return;
  }
  if (
    env.FAKE_VELA_LOGIN_ACTIVATION_AFTER_PARENT_EXIT_MS
    && !(env.VELA_API_URL ?? '').trim()
  ) {
    const delayMs = Number(env.FAKE_VELA_LOGIN_ACTIVATION_AFTER_PARENT_EXIT_MS) || 50;
    const activationBlock = [
      'Open this URL to continue:',
      'https://fake-vela.example/cli/activate?deviceId=late-drain',
      '',
      'Code: LATE-DRAIN',
      '',
    ].join('\n');
    const exitParent = () => {
      const grandchild = spawnChild(
        process.execPath,
        ['-e', `setTimeout(() => process.stdout.write(${JSON.stringify(activationBlock)}), ${delayMs})`],
        { stdio: ['ignore', stdout, stderr] },
      );
      grandchild.unref();
      exit(0);
    };
    const parentDelayMs = Number(env.FAKE_VELA_LOGIN_PARENT_EXIT_DELAY_MS) || 0;
    if (parentDelayMs > 0) setTimeout(exitParent, parentDelayMs);
    else exitParent();
    return;
  }
  if (env.FAKE_VELA_LOGIN_FAIL) {
    stderr.write(`${env.FAKE_VELA_LOGIN_FAIL}\n`);
    exit(1);
  }
  // Models a host whose direct amr-api device-authorization path is broken
  // (#3726): fail unless the daemon routed login through its IPv4 API proxy
  // (which sets VELA_API_URL). Lets tests assert the direct-first / proxy-
  // fallback contract of the login route.
  if (
    env.FAKE_VELA_LOGIN_EXIT_ZERO_WITHOUT_API_URL_DELAY_MS &&
    !(env.VELA_API_URL ?? '').trim()
  ) {
    const delayMs = Number(env.FAKE_VELA_LOGIN_EXIT_ZERO_WITHOUT_API_URL_DELAY_MS) || 0;
    setTimeout(() => {
      logLoginLifecycle('exit');
      exit(0);
    }, delayMs);
    return;
  }
  if (
    env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL &&
    !(env.VELA_API_URL ?? '').trim()
  ) {
    // FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL_DELAY_MS models a direct attempt that
    // survives the daemon's 250ms startup grace and only then errors out before
    // printing an activation URL — the pre-activation failure the proxy fallback
    // must still catch.
    const failDelayMs = Number(env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL_DELAY_MS) || 0;
    if (failDelayMs > 0) {
      setTimeout(() => {
        stderr.write(`${env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL}\n`);
        logLoginLifecycle('exit');
        exit(1);
      }, failDelayMs);
      return;
    }
    stderr.write(`${env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL}\n`);
    logLoginLifecycle('exit');
    exit(1);
  }
  if (env.FAKE_VELA_ENV_DUMP_PATH) {
    writeFileSync(env.FAKE_VELA_ENV_DUMP_PATH, JSON.stringify(env, null, 2), 'utf8');
  }
  const profile = (env.VELA_PROFILE || 'prod').trim() || 'prod';
  const allowed = new Set(['prod', 'test', 'feature-test', 'local']);
  if (!allowed.has(profile)) {
    stderr.write(`[fake-vela] unknown profile ${profile}; expected prod, test, feature-test, or local\n`);
    exit(1);
  }
  const profileName = profile;
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
  // Print the device-auth activation block first (what real `vela login` emits
  // and what the daemon's waitForActivation keys off to detect steady state),
  // then write config after the optional delay so the in-flight window is real.
  stdout.write('Open this URL to continue:\n');
  stdout.write('https://fake-vela.example/cli/activate?deviceId=fake-device\n\n');
  stdout.write('Code: FAKE-CODE\n');
  if (delayMs > 0) setTimeout(finish, delayMs);
  else finish();
}

// `vela run terminal`: idempotent AMR terminal report fixture. It logs no
// secrets and returns the same receipt fields the delivery worker validates.
if (argv[2] === 'run' && argv[3] === 'terminal') {
  const flag = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const runId = flag('--run-id');
  const outcome = flag('--outcome');
  const terminalAt = flag('--terminal-at');
  if (env.FAKE_VELA_TERMINAL_LOG) {
    appendFileSync(env.FAKE_VELA_TERMINAL_LOG, `${JSON.stringify({
      args: argv.slice(2),
      invocationSource: env.VELA_INVOCATION_SOURCE || null,
    })}\n`);
  }
  const mode = env.FAKE_VELA_TERMINAL_MODE || 'success';
  const failures = {
    transient: { error: 'server_error', retryable: true },
    unsupported: { error: 'unsupported', retryable: false },
    auth: { error: 'auth_required', retryable: false },
    forbidden: { error: 'forbidden', retryable: false },
    invalid: { error: 'invalid_input', retryable: false },
  };
  if (failures[mode]) {
    stdout.write(`${JSON.stringify(failures[mode])}\n`);
    exit(1);
  }
  stdout.write(`${JSON.stringify({ runId, outcome, terminalAt, recorded: mode !== 'replay' })}\n`);
  exit(0);
}

// `vela --version`: the daemon's executable-resolution probe (def.versionArgs)
// expects a version string and a clean exit, NOT the ACP stdio loop.
if (argv[2] === '--version' || (argv.includes('--version') && argv[2] !== 'agent')) {
  stdout.write('vela 0.0.0-fake\n');
  exit(0);
}

if (argv[2] === 'login') {
  loginAndExit();
}

if (argv[2] === 'models') {
  stdout.write(`${env.FAKE_VELA_MODELS || DEFAULT_MODELS_STDOUT}\n`);
  exit(0);
}

// `vela billing summary --format json` → live account projection.
//   FAKE_VELA_BILLING_TIER         – membershipTier (plan) in the JSON
//   FAKE_VELA_BILLING_BALANCE_USD  – balanceUsd in the JSON
// With neither set, behave as if billing is unavailable (exit 1) so the
// route's cold-cache fallback keeps returning config-only as before.
if (argv[2] === 'billing' && argv[3] === 'summary') {
  if (env.FAKE_VELA_BILLING_LOG) {
    appendFileSync(
      env.FAKE_VELA_BILLING_LOG,
      `${Date.now()}\t${env.VELA_RUNTIME_KEY || ''}\n`,
    );
  }
  if (env.FAKE_VELA_BILLING_UNKNOWN_COMMAND) {
    stderr.write('Error: unknown command "billing" for "vela"\n');
    exit(1);
  }
  const delayMs = Number(env.FAKE_VELA_BILLING_DELAY_MS) || 0;
  const finishBilling = () => {
    const tier = env.FAKE_VELA_BILLING_TIER;
    const balance = env.FAKE_VELA_BILLING_BALANCE_USD;
    if (!tier && !balance) {
      stderr.write('billing summary unavailable\n');
      exit(1);
    }
    stdout.write(
      `${JSON.stringify({
        ...(tier ? { membershipTier: tier } : {}),
        balanceUsd: balance ?? null,
      })}\n`,
    );
    exit(0);
  };
  if (delayMs > 0) {
    setTimeout(finishBilling, delayMs);
  } else {
    finishBilling();
  }
}

if (argv[2] === 'model' && argv.includes('--format') && argv.includes('json')) {
  if (argv[3] === 'preset') {
    stdout.write(`${env.FAKE_VELA_MODEL_PRESET_JSON || DEFAULT_MODEL_PRESET_JSON}\n`);
    exit(0);
  }
  if (argv[3] === 'list') {
    stdout.write(`${env.FAKE_VELA_MODEL_LIST_JSON || DEFAULT_MODEL_LIST_JSON}\n`);
    exit(0);
  }
}
