#!/usr/bin/env node
/**
 * Fake Kimi Code CLI used by the ACP stdio-MCP wiring test.
 *
 * Speaks just enough ACP to let the daemon drive a complete turn, and records
 * every `session/new` params object it is given so the test can assert on the
 * payload that actually reached the wire rather than on a helper's return
 * value.
 *
 *   `kimi --version` → prints FAKE_KIMI_VERSION
 *   `kimi acp`       → initialize → session/new → session/prompt
 *
 * Env:
 *   FAKE_KIMI_VERSION          – version string reported by `--version`
 *   FAKE_KIMI_ACP_VERSION      – version reported in the `initialize` result's
 *                                `agentInfo`; defaults to FAKE_KIMI_VERSION.
 *                                Set it apart from FAKE_KIMI_VERSION to prove
 *                                which of the two signals the daemon trusts.
 *   FAKE_KIMI_SESSION_NEW_LOG  – file each session/new params object is
 *                                appended to, one JSON object per line
 */

import { appendFileSync } from 'node:fs';
import { argv, stdin, stdout, env, exit } from 'node:process';

const VERSION = env.FAKE_KIMI_VERSION || '0.38.0';
const ACP_VERSION = env.FAKE_KIMI_ACP_VERSION || VERSION;
const SESSION_NEW_LOG = env.FAKE_KIMI_SESSION_NEW_LOG || '';

if (argv.includes('--version')) {
  stdout.write(`${VERSION}\n`);
  exit(0);
}

if (!argv.includes('acp')) {
  stdout.write(`fake-kimi ${VERSION}\n`);
  exit(0);
}

const write = (msg) => stdout.write(`${JSON.stringify(msg)}\n`);

let buf = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg);
  }
});

function handle(msg) {
  if (msg.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, embeddedContext: true },
          mcpCapabilities: { http: true, sse: true },
        },
        agentInfo: { name: 'Kimi Code CLI', version: ACP_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'session/new') {
    if (SESSION_NEW_LOG) {
      appendFileSync(SESSION_NEW_LOG, `${JSON.stringify(msg.params ?? {})}\n`);
    }
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId: 'fake-kimi-session-1',
        models: { currentModelId: null, availableModels: [] },
      },
    });
    return;
  }
  if (msg.method === 'session/set_model' || msg.method === 'session/set_config_option') {
    write({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  if (msg.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'fake-kimi-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'ok from fake kimi' },
        },
      },
    });
    write({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
    return;
  }
  if (msg.id !== undefined) {
    write({ jsonrpc: '2.0', id: msg.id, result: {} });
  }
}
