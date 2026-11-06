// OD-faithful vela renderer for AMR (Agent Management Runtime).
//
// vela is the bin OD's AMR runtime spawns; `bin: 'vela'` in
// apps/daemon/src/runtimes/defs/amr.ts. The protocol is ACP JSON-RPC
// over stdio, but vela's spec extends the generic ACP shape with:
//
//   1. `initialize` response carries `agentCapabilities` and `models`
//      (currentModelId + availableModels).
//   2. `session/new` response carries the same `models` block.
//   3. `session/prompt` is REJECTED unless `session/set_model` (or
//      `session/set_config_option`) has been called for the current
//      sessionId — the strict-set_model gate. This is the contract real
//      vela 0.0.1 enforces; we mirror it so a regression in
//      attachAcpSession that silently skips set_model gets caught.
//   4. Final prompt response includes `usage.{inputTokens, outputTokens,
//      totalTokens}` (no cachedReadTokens — vela doesn't surface those).
//
// Error-injection envs (mirror apps/daemon/tests/fixtures/fake-vela.mjs):
//   FAKE_VELA_SESSION_NEW_ERROR — fail session/new with this message
//   FAKE_VELA_SET_MODEL_ERROR   — fail session/set_model
//   FAKE_VELA_PROMPT_ERROR      — fail session/prompt
//   FAKE_VELA_REQUIRE_SET_MODEL='0' — disable the strict gate (legacy)
//
// Content envs:
//   FAKE_VELA_SESSION_ID  — the sessionId returned by session/new
//   FAKE_VELA_TEXT        — override the assistant text (defaults to recording's
//                           report content)
//   FAKE_VELA_THOUGHT     — optional thought_chunk emitted before text

import { writeFile } from 'node:fs/promises';

const PROTOCOL_VERSION = 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DEFAULT_AVAILABLE_MODELS = [
  { modelId: 'openai/gpt-5.4-mini',         name: 'gpt-5.4-mini' },
  { modelId: 'anthropic/claude-3.7-sonnet', name: 'claude-3.7-sonnet' },
  { modelId: 'deepseek-v3.2',               name: 'deepseek-v3.2' },
  { modelId: 'glm-5.1',                     name: 'glm-5.1' },
];

function writeRpcResult(out, id, result) {
  out.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function writeRpcError(out, id, message, code = -32603) {
  out.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function writeNotification(out, method, params) {
  out.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

/** Split long text on word boundaries — chunk size mirrors the real vela
 *  agent server's typical streaming cadence (the existing fake-vela.mjs
 *  uses 16-char chunks; we use 400 to match the higher-throughput
 *  recordings without flooding the test harness). */
function chunkText(text, target = 400) {
  if (text.length <= target) return [text];
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + target);
    if (end < text.length) {
      const ws = text.indexOf(' ', end);
      if (ws !== -1 && ws - end < 200) end = ws + 1;
    }
    chunks.push(text.slice(pos, end));
    pos = end;
  }
  return chunks;
}

/**
 * Run the vela ACP server on stdin/stdout. Returns a promise that
 * resolves when stdin closes or the prompt round-trip completes.
 */
export async function runVelaAcpServer(events, opts = {}) {
  const out = opts.emit ?? process.stdout;
  const meta = events.find(e => e.type === 'meta');
  const reportEvent = events.find(e => e.type === 'report');
  const reportText = process.env.FAKE_VELA_TEXT ?? reportEvent?.content ?? '';
  const thoughtText = process.env.FAKE_VELA_THOUGHT ?? '';

  const sessionId = opts.sessionId ?? process.env.FAKE_VELA_SESSION_ID ?? `fake-vela-session-${Date.now()}`;
  const strict = process.env.FAKE_VELA_REQUIRE_SET_MODEL !== '0';
  const SESSION_NEW_ERROR = process.env.FAKE_VELA_SESSION_NEW_ERROR ?? '';
  const SET_MODEL_ERROR   = process.env.FAKE_VELA_SET_MODEL_ERROR   ?? '';
  const PROMPT_ERROR      = process.env.FAKE_VELA_PROMPT_ERROR      ?? '';

  let currentModelId = null;
  const sessionsWithModel = new Set();
  let buf = '';
  let aborted = false;

  const startPromptResponse = async (id, sid) => {
    if (thoughtText) {
      writeNotification(out, 'session/update', {
        sessionId: sid,
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: thoughtText },
        },
      });
    }
    const chunks = chunkText(reportText, 400);
    for (const chunk of chunks) {
      if (aborted) break;
      if (!opts.noDelay) await sleep(30);
      writeNotification(out, 'session/update', {
        sessionId: sid,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: chunk },
        },
      });
    }
    writeRpcResult(out, id, {
      stopReason: 'end_turn',
      usage: {
        inputTokens: 12,
        outputTokens: meta?.total_tokens ?? 7,
        totalTokens: (meta?.total_tokens ?? 7) + 12,
      },
    });
    if (opts.reportFile) await writeFile(opts.reportFile, reportText).catch(() => {});
  };

  const handleRpc = async (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const { id, method, params } = obj;
    switch (method) {
      case 'initialize':
        writeRpcResult(out, id, {
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: { promptCapabilities: { embeddedContext: false } },
          models: {
            currentModelId,
            availableModels: DEFAULT_AVAILABLE_MODELS,
          },
        });
        return;
      case 'session/new': {
        if (SESSION_NEW_ERROR) {
          writeRpcError(out, id, SESSION_NEW_ERROR);
          return;
        }
        writeRpcResult(out, id, {
          sessionId,
          models: { currentModelId, availableModels: DEFAULT_AVAILABLE_MODELS },
        });
        return;
      }
      case 'session/set_model': {
        if (SET_MODEL_ERROR) {
          writeRpcError(out, id, SET_MODEL_ERROR, -32099);
          return;
        }
        const next = typeof params?.modelId === 'string' ? params.modelId.trim() : '';
        const sid = typeof params?.sessionId === 'string' ? params.sessionId : sessionId;
        if (next) currentModelId = next;
        sessionsWithModel.add(sid);
        writeRpcResult(out, id, {});
        return;
      }
      case 'session/set_config_option': {
        // Treat config-option model selection as set_model for the
        // strict-set_model gate.
        const sid = typeof params?.sessionId === 'string' ? params.sessionId : sessionId;
        sessionsWithModel.add(sid);
        writeRpcResult(out, id, {});
        return;
      }
      case 'session/prompt': {
        if (PROMPT_ERROR) {
          writeRpcError(out, id, PROMPT_ERROR, -32602);
          return;
        }
        const sid = typeof params?.sessionId === 'string' ? params.sessionId : sessionId;
        if (strict && !sessionsWithModel.has(sid)) {
          writeRpcError(out, id, 'session/set_model must be called before session/prompt', -32602);
          return;
        }
        void startPromptResponse(id, sid);
        return;
      }
      case 'session/cancel':
        aborted = true;
        return;
      default:
        if (id !== undefined && id !== null) {
          writeRpcError(out, id, `unknown method: ${method}`, -32601);
        }
    }
  };

  return new Promise((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', async (data) => {
      buf += data;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        await handleRpc(obj);
      }
    });
    process.stdin.on('end', () => resolve());
    process.stdin.on('error', () => resolve());

    const onSig = () => { aborted = true; resolve(); };
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);

    // 30s safety timeout; .unref() so a completed session exits promptly.
    setTimeout(() => {
      process.stderr.write('[mock-vela] no prompt received within 30s; exiting\n');
      resolve();
    }, 30_000).unref();
  });
}
