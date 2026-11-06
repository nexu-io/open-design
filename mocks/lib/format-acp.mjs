// OD-faithful ACP (agent-client-protocol) renderer.
//
// Unlike the streaming formats (opencode/codex/claude/gemini/cursor-agent),
// ACP is a real JSON-RPC server over stdio. The mock has to:
//
//   1. Listen on stdin for newline-delimited JSON-RPC messages from OD.
//   2. Respond to `initialize` (id=1) with the protocol version.
//   3. Respond to `session/new` (id=2) with a synthetic sessionId.
//   4. Optionally respond to `session/set_model` (id=3) with {}.
//   5. When `session/prompt` (id=N) arrives, push a series of
//      `session/update` NOTIFICATIONS carrying agent_message_chunk
//      content from the recording, then respond to the prompt request
//      with a final usage stats result.
//   6. Stay alive until OD closes stdin or the request completes.
//
// Verified against the spec implementation at
//   apps/daemon/src/acp.ts (attachAcpSession + ACP_PROTOCOL_VERSION).
//
// Tool events from the recording are dropped — OD's ACP parser only
// recognizes thought_chunk + message_chunk. Tool-use surfaces in the
// real ACP agents (Hermes/Kimi/Kilo/Kiro/Vibe/Devin) come through
// MCP or other side channels, not the stdio protocol.

import { writeFile } from 'node:fs/promises';

const PROTOCOL_VERSION = 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function writeRpcResult(out, id, result) {
  out.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function writeNotification(out, method, params) {
  out.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

/** Split a long text into approximately N-char chunks at word boundaries
 *  so OD's UI sees a streamed message rather than one giant burst. */
function chunkText(text, targetChunkSize = 400) {
  if (text.length <= targetChunkSize) return [text];
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + targetChunkSize);
    if (end < text.length) {
      // Round to the next whitespace so we don't split mid-word
      const ws = text.indexOf(' ', end);
      if (ws !== -1 && ws - end < 200) end = ws + 1;
    }
    chunks.push(text.slice(pos, end));
    pos = end;
  }
  return chunks;
}

/**
 * Run the ACP server on stdin/stdout. Returns a promise that resolves
 * when the prompt round-trip completes.
 */
export async function runAcpServer(events, opts = {}) {
  const out = opts.emit ?? process.stdout;
  const writeFn = typeof out === 'function' ? out : s => out.write(s);
  const writeLine = obj => writeFn(JSON.stringify(obj) + '\n');

  const meta = events.find(e => e.type === 'meta');
  const sessionId = opts.sessionId ?? `mock-acp-${Date.now()}`;
  const reportEvent = events.find(e => e.type === 'report');
  const reportText = reportEvent?.content ?? '';

  // Collect any thought_chunks from tool_call inputs that look like
  // "I should..." style reasoning. For our recordings, the recording
  // doesn't separate thinking from tool calls — so we just stream the
  // final report as message chunks. Future enhancement could split out
  // thinking-style text.
  void meta;

  // Buffer for incoming JSON-RPC lines.
  let buf = '';
  let aborted = false;

  // Track which request we owe a response to.
  let lastPromptId = null;

  // Chunks generator — used after session/prompt arrives.
  const startPromptResponse = async (id) => {
    lastPromptId = id;
    const chunks = chunkText(reportText, 400);
    for (const chunk of chunks) {
      if (aborted) break;
      if (!opts.noDelay) await sleep(50);
      writeLine({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: chunk },
          },
        },
      });
    }
    // Final prompt response carries usage stats. ACP parser reads:
    //   formatUsage({inputTokens, outputTokens, cachedReadTokens, totalTokens})
    writeRpcResult(out, id, {
      stopReason: 'end_of_turn',
      usage: {
        inputTokens: 0,
        outputTokens: meta?.total_tokens ?? 0,
        cachedReadTokens: 0,
        totalTokens: meta?.total_tokens ?? 0,
      },
    });

    if (opts.reportFile) await writeFile(opts.reportFile, reportText).catch(() => {});
  };

  // Dispatch incoming RPC messages.
  const handleRpc = async (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const { id, method } = obj;
    if (method === 'initialize') {
      writeRpcResult(out, id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          loadSession: false,
          // Tool calls aren't supported via stdio in this mock —
          // matches the actual ACP agents on OD's side.
          tools: false,
        },
      });
      return;
    }
    if (method === 'session/new') {
      writeRpcResult(out, id, {
        sessionId,
        configOptions: [
          {
            configId: 'model',
            category: 'model',
            currentValue: meta?.model ?? 'default',
            values: [meta?.model ?? 'default'],
          },
        ],
      });
      return;
    }
    if (method === 'session/set_model' || method === 'session/set_config_option') {
      writeRpcResult(out, id, {});
      return;
    }
    if (method === 'session/prompt') {
      // Fire-and-forget the chunk streaming; the prompt request gets
      // responded to once the last chunk has been streamed.
      void startPromptResponse(id);
      return;
    }
    if (method === 'session/cancel') {
      aborted = true;
      // OD doesn't expect a response to cancel notifications.
      return;
    }
    // Any other method: respond with an empty result to keep the parser happy.
    if (id !== undefined && id !== null) {
      writeRpcResult(out, id, {});
    }
  };

  // Promise that resolves when the prompt response has been written.
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
    process.stdin.on('end', () => {
      // OD closed stdin after our prompt response — graceful shutdown.
      resolve();
    });
    process.stdin.on('error', () => resolve());

    const onSigint = () => { aborted = true; resolve(); };
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigint);

    // Safety timeout — if OD never sends `initialize` within 30s,
    // bail out so we don't hang in CI. .unref() lets the process exit
    // promptly once the prompt round-trip completes normally.
    setTimeout(() => {
      if (lastPromptId === null) {
        process.stderr.write('[mock-acp] no prompt received within 30s; exiting\n');
        resolve();
      }
    }, 30_000).unref();
  });
}
