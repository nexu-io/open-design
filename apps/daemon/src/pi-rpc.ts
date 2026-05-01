// @ts-nocheck
/**
 * Drives pi's `--mode rpc` JSON-RPC protocol over stdio and maps agent
 * events into the daemon's typed UI events (the same set that
 * claude-stream.js / copilot-stream.js / acp.js emit).
 *
 * Lifecycle:
 *   1. Daemon spawns `pi --mode rpc [--no-session] [--model ...]`
 *   2. This module sends `prompt` on stdin
 *   3. pi streams events on stdout (agent_start, message_update, …)
 *   4. We translate them to: status, text_delta, thinking_delta,
 *      tool_use, tool_result, usage
 *   5. On `agent_end` we finish the SSE stream
 *
 * Extension UI requests from pi are auto-resolved (the web UI has no
 * dialog surfaces), and fire-and-forget notifications are silently
 * consumed to keep the protocol clean.
 */

import { createJsonLineStream } from './acp.js';

// sendCommand is scoped inside attachPiRpcSession to avoid sharing
// the RPC id counter across concurrent sessions.

// Auto-approve any extension UI dialog (select/confirm/input/editor).
// The web UI has no surface for these; resolving them keeps pi unblocked.
// Fire-and-forget methods (setStatus, setWidget, notify, setTitle, set_editor_text)
// are silently consumed — no response is expected.
const FIRE_AND_FORGET_METHODS = new Set([
  'setStatus',
  'setWidget',
  'notify',
  'setTitle',
  'set_editor_text',
]);

function replyExtensionUi(writable, raw) {
  if (raw?.id == null) return;

  // Fire-and-forget: no response expected. Silently consume.
  if (FIRE_AND_FORGET_METHODS.has(raw.method)) return;

  // Dialog methods: auto-resolve to keep pi unblocked.
  // confirm → true, select/input/editor → empty-ish default
  let result;
  if (raw.method === 'confirm') {
    result = { confirmed: true };
  } else {
    // select: pick first option if available, else cancel
    const opts = raw.params?.options ?? raw.options;
    if (Array.isArray(opts) && opts.length > 0) {
      const first = opts[0];
      result =
        typeof first === 'string'
          ? { value: first }
          : { value: first?.label ?? first?.value ?? '' };
    } else {
      result = { cancelled: true };
    }
  }
  writable.write(
    `${JSON.stringify({ type: 'extension_ui_response', id: raw.id, ...result })}\n`,
  );
}

/**
 * Attach a pi RPC session to a spawned child process.
 *
 * @param {object} opts
 * @param {import('node:child_process').ChildProcess} opts.child  - spawned pi process
 * @param {string} opts.prompt   - composed user message
 * @param {string} [opts.cwd]    - working directory
 * @param {string|null} [opts.model] - model id (null = default)
 * @param {function} opts.send   - SSE send function
 * @returns {{ hasFatalError(): boolean }}
 */
export function attachPiRpcSession({ child, prompt, cwd, model, send }) {
  const runStartedAt = Date.now();
  let finished = false;
  let fatal = false;
  let sentFirstToken = false;

  let nextRpcId = 1;

  function sendCommand(writable, type, params = {}) {
    const id = nextRpcId++;
    writable.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }

  // Track the prompt request id so we know when the prompt response arrives.
  let promptRpcId = null;

  const fail = (message) => {
    if (finished) return;
    finished = true;
    fatal = true;
    send('error', { message });
    if (!child.killed) child.kill('SIGTERM');
  };

  // ---- Outbound: send the prompt via RPC ----
  child.stdin.on('error', (err) => {
    if (err.code !== 'EPIPE') {
      fail(`stdin: ${err.message}`);
    }
  });

  promptRpcId = sendCommand(child.stdin, 'prompt', { message: prompt });

  // ---- Inbound: parse stdout events ----
  const parser = createJsonLineStream((raw) => {
    // Extension UI requests: auto-resolve to keep pi unblocked.
    if (raw.type === 'extension_ui_request') {
      replyExtensionUi(child.stdin, raw);
      return;
    }

    // RPC responses (prompt accepted, set_model ack, etc.) — not
    // agent events. Log the prompt acceptance, ignore the rest.
    if (raw.type === 'response') {
      if (raw.id === promptRpcId && raw.success === false) {
        fail(`prompt rejected: ${raw.error ?? 'unknown'}`);
      }
      return;
    }

    // ---- Agent events ----

    if (raw.type === 'agent_start') {
      send('agent', { type: 'status', label: 'working' });
      return;
    }

    if (raw.type === 'agent_end') {
      finished = true;
      // pi's RPC process stays alive after agent_end (designed for
      // multi-prompt sessions). The daemon's /api/chat is single-shot,
      // so close stdin and let the process exit naturally, or kill it
      // after a grace period.
      try {
        child.stdin.end();
      } catch {}
      // Grace period before SIGTERM. Configurable via PI_GRACEFUL_SHUTDOWN_MS
      // for resource-constrained machines where the event loop drains slowly.
      const shutdownMs = Number(process.env.PI_GRACEFUL_SHUTDOWN_MS) || 5000;
      setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, shutdownMs);
      return;
    }

    if (raw.type === 'turn_start') {
      send('agent', { type: 'status', label: 'thinking' });
      return;
    }

    if (raw.type === 'turn_end') {
      // Extract usage from the completed message if present.
      if (raw.message?.usage) {
        const u = raw.message.usage;
        const usage = {};
        if (typeof u.input === 'number') usage.input_tokens = u.input;
        if (typeof u.output === 'number') usage.output_tokens = u.output;
        if (typeof u.cacheRead === 'number') usage.cached_read_tokens = u.cacheRead;
        if (typeof u.cacheWrite === 'number') usage.cached_write_tokens = u.cacheWrite;
        if (typeof u.totalTokens === 'number') usage.total_tokens = u.totalTokens;
        if (Object.keys(usage).length > 0) {
          const cost = u.cost;
          send('agent', {
            type: 'usage',
            usage,
            costUsd: cost?.total ?? cost?.totalCost ?? null,
            durationMs: Date.now() - runStartedAt,
          });
        }
      }
      return;
    }

    if (raw.type === 'message_update' && raw.assistantMessageEvent) {
      const ev = raw.assistantMessageEvent;

      if (ev.type === 'text_delta' && typeof ev.delta === 'string') {
        if (!sentFirstToken) {
          sentFirstToken = true;
          send('agent', {
            type: 'status',
            label: 'streaming',
            ttftMs: Date.now() - runStartedAt,
          });
        }
        send('agent', { type: 'text_delta', delta: ev.delta });
        return;
      }

      if (ev.type === 'thinking_delta' && typeof ev.delta === 'string') {
        send('agent', { type: 'thinking_delta', delta: ev.delta });
        return;
      }

      if (ev.type === 'thinking_start') {
        send('agent', { type: 'thinking_start' });
        return;
      }

      if (ev.type === 'thinking_end') {
        send('agent', { type: 'thinking_end' });
        return;
      }

      return;
    }

    if (raw.type === 'message_end' && raw.message) {
      // Extract tool calls from the completed assistant message content.
      // Note: usage is NOT emitted here because `turn_end` already
      // emits it. Pi fires both `message_end` and `turn_end` per turn,
      // both carrying usage; emitting from both would double-count.
      const msg = raw.message;

      // Extract tool calls from the completed assistant message content.
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'toolCall') {
            send('agent', {
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.arguments ?? null,
            });
          }
        }
      }
      return;
    }

    if (raw.type === 'tool_execution_start') {
      send('agent', {
        type: 'status',
        label: 'tool',
        toolName: raw.toolName ?? null,
      });
      return;
    }

    if (raw.type === 'tool_execution_end') {
      const content = raw.result?.content;
      const text =
        Array.isArray(content)
          ? content
              .map((c) => (c?.type === 'text' ? c.text : JSON.stringify(c)))
              .join('\n')
          : typeof content === 'string'
            ? content
            : '';
      send('agent', {
        type: 'tool_result',
        toolUseId: raw.toolCallId ?? null,
        content: text,
        isError: raw.isError === true,
      });
      return;
    }

    // Compaction, retry, queue_update — informational only. Forward as
    // status so the UI stays aware, but don't break the main text flow.
    if (raw.type === 'compaction_start') {
      send('agent', { type: 'status', label: 'compacting' });
      return;
    }
    if (raw.type === 'auto_retry_start') {
      send('agent', { type: 'status', label: 'retrying' });
      return;
    }
  });

  child.stdout.on('data', (chunk) => {
    try {
      parser.feed(chunk);
    } catch (err) {
      fail(`parser: ${err.message}`);
    }
  });
  child.stdout.on('close', () => parser.flush());
  child.on('error', (err) => fail(err.message));

  return {
    hasFatalError() {
      return fatal;
    },
  };
}

/**
 * Parse `pi --list-models` tabular output into the model-picker format
 * used by the daemon's /api/agents endpoint.
 *
 * Input lines look like:
 *   provider         model                  context  max-out  thinking  images
 *   anthropic        claude-sonnet-4-5      200K      64K      yes        yes
 *
 * We collapse to `provider/model` ids and prepend the synthetic default.
 */
export function parsePiModels(stdout) {
  const lines = String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return null;

  const DEFAULT_MODEL_OPTION = { id: 'default', label: 'Default (CLI config)' };

  // First line is the header; skip it.
  const entries = [DEFAULT_MODEL_OPTION];
  const seen = new Set(['default']);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 2) continue;
    const provider = parts[0];
    const modelId = parts[1];
    // Skip duplicates (some providers list the same model under multiple names).
    const fullId = `${provider}/${modelId}`;
    if (seen.has(fullId)) continue;
    seen.add(fullId);
    entries.push({ id: fullId, label: fullId });
  }

  return entries.length > 1 ? entries : null;
}
