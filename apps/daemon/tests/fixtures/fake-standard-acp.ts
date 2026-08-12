#!/usr/bin/env node
/**
 * Minimal standard ACP executable for session/load integration tests.
 *
 * This stays TypeScript-first even though the daemon launches it as a CLI: the
 * test wrapper runs it with Node 24's type stripping. Its first session/load
 * can emit a non-session JSON-RPC failure plus deliberately misleading stderr,
 * allowing the full daemon close path to prove it trusts the ACP protocol over
 * generic CLI text.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { argv, env, exit, stdin, stderr, stdout } from 'node:process';

type JsonObject = Record<string, unknown>;

const SESSION_ID = 'standard-acp-session-1';
const invocationLog = env.FAKE_STANDARD_ACP_INVOCATION_LOG ?? '';
let modelDetectionProbe = false;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function writeMessage(value: JsonObject): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function writeResult(id: unknown, result: JsonObject): void {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function logInvocation(method: 'new' | 'load'): void {
  if (!invocationLog) return;
  appendFileSync(invocationLog, `${JSON.stringify({ method })}\n`);
}

function priorLoadCount(): number {
  if (!invocationLog) return 0;
  try {
    return readFileSync(invocationLog, 'utf8')
      .split('\n')
      .filter((line) => line.includes('"method":"load"'))
      .length;
  } catch (error) {
    if (
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return 0;
    }
    throw error;
  }
}

function handleRequest(value: unknown): void {
  const request = asObject(value);
  if (!request || typeof request.method !== 'string') return;
  const params = asObject(request.params);

  switch (request.method) {
    case 'initialize':
      modelDetectionProbe =
        asObject(params?.clientInfo)?.name === 'open-design-detect';
      writeResult(request.id, {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      });
      return;
    case 'session/new':
      // Runtime model discovery also opens a disposable ACP session. It is not
      // part of the conversation resume path under test, so keep it out of the
      // causal invocation trace.
      if (!modelDetectionProbe) logInvocation('new');
      writeResult(request.id, { sessionId: SESSION_ID });
      return;
    case 'session/load': {
      const loadsBeforeThisRequest = priorLoadCount();
      logInvocation('load');
      if (
        env.FAKE_STANDARD_ACP_FAIL_FIRST_LOAD === '1'
        && loadsBeforeThisRequest === 0
      ) {
        // This phrase matches the legacy Claude detector, but the authoritative
        // ACP response says the failure belongs to MCP setup, not session
        // identity. The daemon must preserve the stored session handle.
        stderr.write('No session found while reconnecting an MCP helper\n');
        writeMessage({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: 'MCP server failed to reconnect',
            data: { kind: 'mcp_connection_failed', retryable: true },
          },
        });
        return;
      }
      const requestedSessionId =
        typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      writeResult(request.id, { sessionId: requestedSessionId });
      return;
    }
    case 'session/prompt': {
      const sessionId =
        typeof params?.sessionId === 'string' ? params.sessionId : SESSION_ID;
      writeMessage({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello from standard ACP.' },
          },
        },
      });
      writeResult(request.id, {
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      return;
    }
    case 'session/cancel':
      return;
    default:
      writeMessage({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `unknown method: ${request.method}` },
      });
  }
}

if (argv.includes('--version')) {
  stdout.write('fake-standard-acp 1.0.0\n');
  exit(0);
}

let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      handleRequest(JSON.parse(line));
    } catch (error) {
      stderr.write(`invalid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
});

stdin.on('end', () => {
  stdout.end();
  exit(0);
});
