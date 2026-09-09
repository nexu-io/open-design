#!/usr/bin/env node
// @ts-nocheck -- copied verbatim to a temporary .mjs executable by the E2E harness.
/**
 * Fake ACP agent CLI that reproduces the Kimi Code 0.37.x / 0.38.0 failure:
 * the CLI answers `initialize` and then rejects `session/new` with a bare
 * JSON-RPC `Internal error`.
 *
 * Routes by the first argv:
 *
 *   `--version` -> prints FAKE_ACP_CLI_VERSION so runtime detection can record
 *                   the version the guidance copy is expected to name.
 *   `acp`       -> ACP stdio. Replies to `initialize` and then fails
 *                   `session/new` with the configured JSON-RPC error.
 *
 * Env knobs:
 *   FAKE_ACP_CLI_VERSION                 - `--version` stdout (default 0.38.0)
 *   FAKE_ACP_SESSION_NEW_ERROR_MESSAGE   - JSON-RPC error message for
 *                                          `session/new` (default `Internal error`)
 *   FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE - when '1', the error carries
 *                                          `data.retryable = true`
 *   FAKE_ACP_INVOCATION_LOG              - append one JSON line per handshake
 *                                          request, tagged with the caller's
 *                                          `clientInfo.name`
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, stdin, stdout, env, exit } from 'node:process';

const CLI_VERSION = env.FAKE_ACP_CLI_VERSION || '0.38.0';
const SESSION_NEW_ERROR_MESSAGE =
  env.FAKE_ACP_SESSION_NEW_ERROR_MESSAGE || 'Internal error';
const SESSION_NEW_ERROR_RETRYABLE = env.FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE === '1';
const INVOCATION_LOG = env.FAKE_ACP_INVOCATION_LOG || '';

function logInvocation(entry) {
  if (!INVOCATION_LOG) return;
  try {
    mkdirSync(dirname(INVOCATION_LOG), { recursive: true });
    appendFileSync(INVOCATION_LOG, `${JSON.stringify(entry)}\n`);
  } catch {
    // The log is best-effort test instrumentation.
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

  write({ jsonrpc: '2.0', id: message.id, result: {} });
}
