#!/usr/bin/env node
/**
 * Fake ACP agent CLI that reproduces the Kimi Code 0.37.x / 0.38.0 failure:
 * the CLI answers `initialize` and then rejects `session/new` with a bare
 * JSON-RPC `Internal error`.
 *
 * Routes by the first argv:
 *
 *   `--version` → prints FAKE_ACP_CLI_VERSION so runtime detection can record
 *                 the version the guidance copy is expected to name.
 *   `acp`       → ACP stdio. Replies to `initialize` (request id 1) and then
 *                 fails `session/new` (request id 2) with the JSON-RPC error
 *                 described by FAKE_ACP_SESSION_NEW_ERROR_MESSAGE.
 *
 * Env knobs:
 *   FAKE_ACP_CLI_VERSION                 – `--version` stdout (default 0.38.0)
 *   FAKE_ACP_SESSION_NEW_ERROR_MESSAGE   – JSON-RPC error message for
 *                                          `session/new` (default `Internal error`)
 *   FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE – when '1', the error carries
 *                                          `data.retryable = true`, modelling a
 *                                          CLI that claims its own handshake
 *                                          rejection is transient
 *   FAKE_ACP_PROMPT_ERROR_MESSAGE        – when set, the handshake SUCCEEDS and
 *                                          `session/prompt` is rejected with
 *                                          this JSON-RPC error message instead.
 *                                          Models the post-session failure the
 *                                          ACP path reports as
 *                                          `json-rpc id 4: …` — a live upstream
 *                                          that broke mid-turn, not a CLI that
 *                                          cannot open a session at all.
 *   FAKE_ACP_PROMPT_ERROR_RETRYABLE      – when '1', that prompt error carries
 *                                          `data.retryable = true`
 *   FAKE_ACP_PROMPT_STALL                – when '1', the handshake SUCCEEDS and
 *                                          `session/prompt` is never answered at
 *                                          all, so only the ACP stage watchdog
 *                                          ends the turn.
 *   FAKE_ACP_INVOCATION_LOG              – append one JSON line per handshake
 *                                          request, tagged with the caller's
 *                                          `clientInfo.name`. `attachAcpSession`
 *                                          identifies as `open-design` and
 *                                          `detectAcpModels` as
 *                                          `open-design-detect`, so a test can
 *                                          count real run sessions without
 *                                          counting model-detection probes.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, stdin, stdout, env, exit } from 'node:process';

const CLI_VERSION = env.FAKE_ACP_CLI_VERSION || '0.38.0';
const SESSION_NEW_ERROR_MESSAGE =
  env.FAKE_ACP_SESSION_NEW_ERROR_MESSAGE || 'Internal error';
const SESSION_NEW_ERROR_RETRYABLE = env.FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE === '1';
const PROMPT_ERROR_MESSAGE = env.FAKE_ACP_PROMPT_ERROR_MESSAGE || '';
const PROMPT_STALL = env.FAKE_ACP_PROMPT_STALL === '1';
const PROMPT_ERROR_RETRYABLE = env.FAKE_ACP_PROMPT_ERROR_RETRYABLE === '1';
const INVOCATION_LOG = env.FAKE_ACP_INVOCATION_LOG || '';

function logInvocation(entry) {
  if (!INVOCATION_LOG) return;
  try {
    mkdirSync(dirname(INVOCATION_LOG), { recursive: true });
    appendFileSync(INVOCATION_LOG, `${JSON.stringify(entry)}\n`);
  } catch {
    /* the log is best-effort test instrumentation */
  }
}

function write(message) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

const mode = argv[2] || '';

if (mode === '--version' || mode === 'version') {
  stdout.write(`${CLI_VERSION}\n`);
  exit(0);
}

if (mode !== 'acp') {
  // Unknown subcommand: behave like a CLI that does not implement it.
  exit(0);
}

let clientName = 'unknown';
let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) handleLine(line);
    index = buffer.indexOf('\n');
  }
});
stdin.on('end', () => exit(0));

function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (!message || typeof message !== 'object' || message.id === undefined) return;

  if (message.method === 'initialize') {
    const info = message.params && message.params.clientInfo;
    if (info && typeof info.name === 'string') clientName = info.name;
    // A healthy handshake step: the CLI is installed, invocable, and speaks ACP.
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: false, promptCapabilities: {} },
      },
    });
    return;
  }

  if (message.method === 'session/new' || message.method === 'session/load') {
    logInvocation({ method: message.method, client: clientName, at: Date.now() });
    if (PROMPT_ERROR_MESSAGE || PROMPT_STALL) {
      // Post-session mode: this build opens a session fine. Whatever goes wrong
      // goes wrong afterwards, on the prompt.
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          sessionId: 'fake-acp-session-1',
          models: { currentModelId: null, availableModels: [] },
        },
      });
      return;
    }
    // The broken build: it accepted the connection and then refuses to open a
    // session. `rpcErrorMessage` renders this as `json-rpc id <id>: <message>`.
    write({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32603,
        message: SESSION_NEW_ERROR_MESSAGE,
        ...(SESSION_NEW_ERROR_RETRYABLE ? { data: { retryable: true } } : {}),
      },
    });
    return;
  }

  if (message.method === 'session/prompt' && PROMPT_STALL) {
    logInvocation({ method: message.method, client: clientName, at: Date.now() });
    // Never answers. Models the real 2026 report: a `Write` tool call that sat
    // for 1800s producing zero bytes until the ACP stage watchdog gave up.
    return;
  }

  if (message.method === 'session/prompt' && PROMPT_ERROR_MESSAGE) {
    logInvocation({ method: message.method, client: clientName, at: Date.now() });
    write({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32603,
        message: PROMPT_ERROR_MESSAGE,
        ...(PROMPT_ERROR_RETRYABLE ? { data: { retryable: true } } : {}),
      },
    });
    return;
  }

  write({ jsonrpc: '2.0', id: message.id, result: {} });
}
