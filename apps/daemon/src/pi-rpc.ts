/**
 * Drives pi's `--mode rpc` JSON-RPC protocol over stdio and maps agent
 * events into the daemon's typed UI events (the same set that
 * claude-stream.js / copilot-stream.js / acp.js emit).
 *
 * Lifecycle:
 *   1. Daemon spawns `pi --mode rpc [--model ...]`
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

import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';
import { createJsonLineStream } from './acp.js';

type JsonRecord = Record<string, unknown>;

type SendAgentEvent = (channel: string, payload: JsonRecord) => void;

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_read_tokens?: number;
  cached_write_tokens?: number;
  total_tokens?: number;
};

type PiImagePayload = {
  type: 'image';
  data: string;
  mimeType: string;
};

type PiRpcParams = JsonRecord;

type PiRpcSessionOptions = {
  child: ChildProcess;
  prompt: string;
  cwd?: string;
  model?: string | null;
  send: SendAgentEvent;
  imagePaths?: string[];
  uploadRoot?: string;
  parentSession?: string;
};

type PiRpcSession = {
  hasFatalError(): boolean;
  abort(): void;
  getLastSessionPath(): string | null;
};

type PiRpcContext = {
  runStartedAt: number;
  sentFirstToken: { value: boolean };
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorCode(err: unknown): string | undefined {
  return isRecord(err) && typeof err.code === 'string' ? err.code : undefined;
}

function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

// Image forwarding budgets to prevent large synchronous base64 work.
const MAX_IMAGE_COUNT = 10;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

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

function replyExtensionUi(writable: Writable, raw: JsonRecord): void {
  if (raw?.id == null) return;

  // Fire-and-forget: no response expected. Silently consume.
  if (typeof raw.method === 'string' && FIRE_AND_FORGET_METHODS.has(raw.method)) return;

  // Dialog methods: auto-resolve to keep pi unblocked.
  // confirm → true, select/input/editor → empty-ish default
  let result;
  if (raw.method === 'confirm') {
    result = { confirmed: true };
  } else {
    // select: pick first option if available, else cancel
    const params = getRecord(raw.params);
    const opts = params?.options ?? raw.options;
    if (Array.isArray(opts) && opts.length > 0) {
      const first = opts[0];
      result =
        typeof first === 'string'
          ? { value: first }
          : { value: getRecord(first)?.label ?? getRecord(first)?.value ?? '' };
    } else {
      result = { cancelled: true };
    }
  }
  writable.write(
    `${JSON.stringify({ type: 'extension_ui_response', id: raw.id, ...result })}\n`,
  );
}

/**
 * Map a single pi RPC event to zero or more daemon UI events.
 *
 * No I/O or child process interaction; mutates `ctx.sentFirstToken`
 * to track streaming state.
 * `send` callback and `ctx` are provided by the caller.
 *
 * @param {object} raw        - parsed JSON from pi's stdout
 * @param {function} send     - (channel, payload) emitter
 * @param {object} ctx        - session context
 * @param {number} ctx.runStartedAt - Date.now() at session start
 * @param {{ value: boolean }} ctx.sentFirstToken - mutable flag
 * @returns {string|null} 'agent_end' if the agent is done, null otherwise
 */
export function mapPiRpcEvent(
  raw: JsonRecord,
  send: SendAgentEvent,
  ctx: PiRpcContext,
): 'agent_end' | null {
  if (raw.type === 'agent_start') {
    send('agent', { type: 'status', label: 'working' });
    return null;
  }

  if (raw.type === 'agent_end') {
    return 'agent_end';
  }

  if (raw.type === 'turn_start') {
    send('agent', { type: 'status', label: 'thinking' });
    return null;
  }

  if (raw.type === 'turn_end') {
    const message = getRecord(raw.message);
    const messageUsage = getRecord(message?.usage);
    if (messageUsage) {
      const u = messageUsage;
      const usage: TokenUsage = {};
      if (typeof u.input === 'number') usage.input_tokens = u.input;
      if (typeof u.output === 'number') usage.output_tokens = u.output;
      if (typeof u.cacheRead === 'number') usage.cached_read_tokens = u.cacheRead;
      if (typeof u.cacheWrite === 'number') usage.cached_write_tokens = u.cacheWrite;
      if (typeof u.totalTokens === 'number') usage.total_tokens = u.totalTokens;
      if (Object.keys(usage).length > 0) {
        const cost = getRecord(u.cost);
        send('agent', {
          type: 'usage',
          usage,
          costUsd: cost?.total ?? cost?.totalCost ?? null,
          durationMs: Date.now() - ctx.runStartedAt,
        });
      }
    }

    if (message?.stopReason === 'error') {
      const messageText =
        typeof message.errorMessage === 'string' && message.errorMessage.length > 0
          ? message.errorMessage
          : 'Pi agent error';
      send('agent', { type: 'error', message: messageText, raw });
    }
    return null;
  }

  const assistantMessageEvent = getRecord(raw.assistantMessageEvent);
  if (raw.type === 'message_update' && assistantMessageEvent) {
    const ev = assistantMessageEvent;

    if (ev.type === 'text_delta' && typeof ev.delta === 'string') {
      if (!ctx.sentFirstToken.value) {
        ctx.sentFirstToken.value = true;
        send('agent', {
          type: 'status',
          label: 'streaming',
          ttftMs: Date.now() - ctx.runStartedAt,
        });
      }
      send('agent', { type: 'text_delta', delta: ev.delta });
      return null;
    }

    if (ev.type === 'thinking_delta' && typeof ev.delta === 'string') {
      send('agent', { type: 'thinking_delta', delta: ev.delta });
      return null;
    }

    if (ev.type === 'thinking_start') {
      send('agent', { type: 'thinking_start' });
      return null;
    }

    if (ev.type === 'thinking_end') {
      send('agent', { type: 'thinking_end' });
      return null;
    }

    // pi's RPC protocol emits a message_update with error delta when
    // the model returns an error (e.g. aborted, context overflow).
    // Surface it so sendAgentEvent's error-handling path sets
    // agentStreamError and the run flips to `failed` on close.
    if (ev.type === 'error') {
      const message =
        typeof ev.reason === 'string' && ev.reason.length > 0
          ? ev.reason
          : typeof ev.delta === 'string' && ev.delta.length > 0
            ? ev.delta
            : 'Agent error';
      send('agent', { type: 'error', message, raw });
      return null;
    }

    return null;
  }

  if (raw.type === 'message_end') {
    // message_end carries usage (already emitted from turn_end) and
    // tool call blocks (already emitted from tool_execution_start).
    // Nothing to extract here.
    return null;
  }

  if (raw.type === 'tool_execution_start') {
    send('agent', {
      type: 'tool_use',
      id: raw.toolCallId ?? null,
      name: raw.toolName ?? null,
      input: raw.args ?? null,
    });
    return null;
  }

  if (raw.type === 'tool_execution_end') {
    const result = getRecord(raw.result);
    const content = result?.content;
    const text =
      Array.isArray(content)
        ? content
            .map((c: unknown) => {
              const item = getRecord(c);
              return item?.type === 'text' ? String(item.text ?? '') : JSON.stringify(c);
            })
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
    return null;
  }

  // pi's RPC protocol can emit `extension_error` when an extension
  // throws during a tool call or event handler. Surface it so the
  // daemon's error-handling path (sendAgentEvent → agentStreamError)
  // can flip the run to `failed` and forward a visible SSE error.
  if (raw.type === 'extension_error') {
    const message =
      typeof raw.error === 'string' && raw.error.length > 0
        ? raw.error
        : 'Extension error';
    send('agent', { type: 'error', message, raw });
    return null;
  }

  if (raw.type === 'compaction_start') {
    send('agent', { type: 'status', label: 'compacting' });
    return null;
  }
  if (raw.type === 'auto_retry_start') {
    send('agent', { type: 'status', label: 'retrying' });
    return null;
  }

  if (raw.type === 'auto_retry_end' && raw.success === false) {
    // Auto-retry exhausted — the agent is about to give up. Surface
    // the final error so the daemon marks the run as failed rather
    // than silently succeeding with empty output.
    const message =
      typeof raw.finalError === 'string' && raw.finalError.length > 0
        ? raw.finalError
        : 'Auto-retry exhausted';
    send('agent', { type: 'error', message, raw });
    return null;
  }

  return null;
}

type PiSessionFileSnapshot = Map<string, { mtimeMs: number; size: number }>;

function readPiSessionFiles(cwd: string | undefined): Array<{ path: string; mtimeMs: number; size: number }> {
  if (typeof cwd !== 'string' || cwd.length === 0) return [];
  const sessionsDir = path.join(cwd, '.pi', 'sessions');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: Array<{ path: string; mtimeMs: number; size: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    try {
      const full = path.join(sessionsDir, entry.name);
      const stat = fs.statSync(full);
      files.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // Skip unreadable entries.
    }
  }
  return files;
}

function snapshotPiSessionFiles(cwd: string | undefined): PiSessionFileSnapshot {
  const snapshot: PiSessionFileSnapshot = new Map();
  for (const file of readPiSessionFiles(cwd)) {
    snapshot.set(file.path, { mtimeMs: file.mtimeMs, size: file.size });
  }
  return snapshot;
}

/**
 * Resolve the session file written by this RPC run.
 *
 * pi stores all sessions for a cwd under one shared `.pi/sessions` directory.
 * Selecting the newest file globally is unsafe because another pi process can
 * write a newer session while this run is ending. Instead, compare the
 * directory against the snapshot taken before we sent `prompt` and accept only
 * the single file that was created or updated during this run. If multiple
 * files changed, return null rather than wiring the next turn to the wrong
 * history.
 */
function resolveSessionPathChangedSince(
  cwd: string | undefined,
  before: PiSessionFileSnapshot,
): string | null {
  const changed = readPiSessionFiles(cwd).filter((file) => {
    const previous = before.get(file.path);
    return !previous || file.mtimeMs > previous.mtimeMs || file.size !== previous.size;
  });
  return changed.length === 1 ? changed[0]?.path ?? null : null;
}

/**
 * Attach a pi RPC session to a spawned child process.
 *
 * Emits `status: initializing` with the model name immediately so the UI
 * can show "pi · claude-sonnet-4-5" like every other adapter. Sends
 * `new_session` with `parentSession` when provided (for conversational
 * continuity across edit rounds), then sends the prompt via RPC and
 * streams events back.
 *
 * The returned `abort()` method sends an RPC `abort` command so pi can
 * clean up gracefully (flush logs, finalize session files, etc.). The
 * caller (runs.cancel()) owns the SIGTERM fallback — abort() does not
 * kill the child process itself.
 *
 * After the session completes, `getLastSessionPath()` returns the path
 * to the .jsonl session file pi wrote to disk, or null if none was found.
 *
 * @param {object} opts
 * @param {import('node:child_process').ChildProcess} opts.child  - spawned pi process
 * @param {string} opts.prompt   - composed user message
 * @param {string} [opts.cwd]    - working directory (used to resolve .pi/sessions/)
 * @param {string|null} [opts.model] - model id (null = default)
 * @param {string[]} [opts.imagePaths] - absolute paths to image files for multimodal input
 * @param {string} [opts.uploadRoot] - root directory that image paths must remain inside after symlink resolution
 * @param {function} opts.send   - SSE send function
 * @param {string} [opts.parentSession] - path to a prior .jsonl session file for conversational continuity
 * @returns {{ hasFatalError(): boolean, abort(): void, getLastSessionPath(): string | null }}
 */
export function attachPiRpcSession({
  child,
  prompt,
  cwd,
  model,
  send,
  imagePaths,
  uploadRoot,
  parentSession,
}: PiRpcSessionOptions): PiRpcSession {
  const stdin = child.stdin;
  const stdout = child.stdout;
  if (stdin === null) {
    throw new Error('pi RPC child process is missing stdin');
  }
  if (stdout === null) {
    throw new Error('pi RPC child process is missing stdout');
  }

  const runStartedAt = Date.now();
  const sessionFilesBeforePrompt = snapshotPiSessionFiles(cwd);
  let finished = false;
  let fatal = false;
  const sentFirstToken = { value: false };
  let capturedSessionPath: string | null = null;

  let nextRpcId = 1;
  let stdinOpen = true;

  function sendCommand(writable: Writable, type: string, params: PiRpcParams = {}): number | null {
    if (!stdinOpen) return null;
    const id = nextRpcId++;
    writable.write(`${JSON.stringify({ id, type, ...params })}\n`);
    return id;
  }

  // Track RPC ids so resume and prompt failures are attributed to the right
  // request. A resumed turn must not send the trimmed prompt until pi confirms
  // it loaded the parent session.
  let parentSessionRpcId: number | null = null;
  let promptRpcId: number | null = null;

  const fail = (message: string, code?: string): void => {
    if (finished) return;
    finished = true;
    fatal = true;
    send('error', { message, ...(code ? { code } : {}) });
    if (!child.killed) child.kill('SIGTERM');
  };

  // Emit initial status with model name immediately — before pi even
  // responds — so the UI header shows the model name at session start.
  send('agent', {
    type: 'status',
    label: 'initializing',
    model: typeof model === 'string' && model ? model : null,
  });

  // ---- Outbound: send new_session (if parentSession provided) then prompt via RPC ----
  stdin.on('error', (err: unknown) => {
    if (errorCode(err) !== 'EPIPE') {
      fail(`stdin: ${errorMessage(err)}`);
    }
  });
  stdin.on('close', () => {
    stdinOpen = false;
  });

  // If a prior session file path is provided, send new_session with
  // parentSession so pi loads the prior conversation history into the
  // new session, enabling conversational continuity across edit rounds.
  // Build the images array for pi's prompt command. pi's RPC protocol
  // accepts `images` as an array of {type, data, mimeType} objects where
  // `data` is base64-encoded file contents. The daemon's safeImages guard
  // already validated that each path exists under UPLOAD_DIR.
  //
  // Security: realpath resolves symlinks so we re-check that the resolved
  // path is still a regular file (no /proc/self/mem or symlink escape).
  // We also enforce a count and total-byte budget to prevent large
  // synchronous base64 reads from blocking the event loop.
  const images: PiImagePayload[] = [];
  if (Array.isArray(imagePaths) && imagePaths.length > 0) {
    let totalBytes = 0;
    for (const imgPath of imagePaths) {
      if (images.length >= MAX_IMAGE_COUNT) break;
      if (typeof imgPath !== 'string' || !imgPath.length) continue;
      try {
        // Resolve symlinks and verify it's a regular file.
        const realPath = fs.realpathSync(imgPath);
        const stat = fs.statSync(realPath);
        if (!stat.isFile()) continue;

        // Re-verify the resolved path stays inside the upload root.
        // Without this, a path that passed server.ts's safeImages prefix
        // check (under UPLOAD_DIR) could be a symlink pointing to a file
        // outside UPLOAD_DIR, and we'd read/base64-forward it to pi.
        if (uploadRoot) {
          const resolvedRoot = fs.realpathSync(uploadRoot);
          if (realPath !== resolvedRoot && !realPath.startsWith(resolvedRoot + path.sep)) continue;
        }

        const ext = path.extname(realPath).toLowerCase();
        if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;

        // Enforce total byte budget.
        if (totalBytes + stat.size > MAX_TOTAL_IMAGE_BYTES) continue;

        const buf = fs.readFileSync(realPath);
        const mimeType =
          ext === '.png' ? 'image/png' :
          ext === '.gif' ? 'image/gif' :
          ext === '.webp' ? 'image/webp' :
          'image/jpeg'; // .jpg, .jpeg, and unknown
        images.push({
          type: 'image',
          data: buf.toString('base64'),
          mimeType,
        });
        totalBytes += stat.size;
      } catch (_err: unknown) {
        // Skip unreadable images rather than failing the entire run.
      }
    }
  }

  const sendPromptCommand = (): void => {
    promptRpcId = sendCommand(stdin, 'prompt', {
      message: prompt,
      ...(images.length > 0 ? { images } : {}),
    });
  };

  // If a prior session file path is provided, send new_session with
  // parentSession so pi loads the prior conversation history into the
  // new session, enabling conversational continuity across edit rounds.
  // Do not send the prompt until pi acknowledges this RPC: resumed prompts
  // intentionally contain only the latest user turn, so continuing after a
  // failed parent load would silently drop prior conversation context.
  if (parentSession) {
    parentSessionRpcId = sendCommand(stdin, 'new_session', { parentSession });
  } else {
    sendPromptCommand();
  }

  // ---- Inbound: parse stdout events ----
  const parser = createJsonLineStream((raw: unknown) => {
    if (!isRecord(raw)) return;
    // Once finished (agent_end or abort), stop processing — the run is
    // over, so no more agent events should be emitted. We still drain
    // stdout via parser.feed() so the pipe doesn't break; we just skip
    // acting on the parsed objects.
    if (finished) return;

    // Extension UI requests: auto-resolve to keep pi unblocked.
    if (raw.type === 'extension_ui_request') {
      replyExtensionUi(stdin, raw);
      return;
    }

    // RPC responses (prompt accepted, set_model ack, etc.) — not
    // agent events. Log the prompt acceptance, ignore the rest.
    if (raw.type === 'response') {
      if (raw.id === parentSessionRpcId) {
        if (raw.success === false) {
          fail(
            `parent session rejected: ${String(raw.error ?? 'unknown')}`,
            'PI_PARENT_SESSION_FAILED',
          );
          return;
        }
        sendPromptCommand();
        return;
      }
      if (raw.id === promptRpcId && raw.success === false) {
        fail(`prompt rejected: ${String(raw.error ?? 'unknown')}`);
      }
      return;
    }

    // Agent events: delegate to the pure mapper.
    const result = mapPiRpcEvent(raw, send, { runStartedAt, sentFirstToken });

    if (result === 'agent_end') {
      finished = true;
      // Capture only the session file changed by this run. If another pi
      // process wrote to the shared session directory concurrently, the
      // resolver returns null instead of risking cross-conversation resume.
      capturedSessionPath = resolveSessionPathChangedSince(cwd, sessionFilesBeforePrompt);
      // pi's RPC process stays alive after agent_end (designed for
      // multi-prompt sessions). The daemon's /api/chat is single-shot,
      // so close stdin and let the process exit naturally, or kill it
      // after a grace period.
      try {
        stdin.end();
      } catch (err: unknown) {
        fail(`stdin close: ${errorMessage(err)}`);
      }
      // Grace period before SIGTERM. Configurable via PI_GRACEFUL_SHUTDOWN_MS
      // for resource-constrained machines where the event loop drains slowly.
      const shutdownMs = Number(process.env.PI_GRACEFUL_SHUTDOWN_MS) || 5000;
      setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, shutdownMs);
    }
  });

  stdout.on('data', (chunk: Buffer | string) => {
    try {
      parser.feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    } catch (err) {
      fail(`parser: ${errorMessage(err)}`);
    }
  });
  stdout.on('close', () => parser.flush());
  child.on('error', (err: unknown) => fail(errorMessage(err)));

  return {
    hasFatalError() {
      return fatal;
    },
    getLastSessionPath() {
      return capturedSessionPath;
    },
    abort() {
      // Send RPC abort so pi can clean up gracefully (flush logs,
      // finalize session files, etc.). The termination guarantee
      // (SIGTERM fallback) is owned by the caller (runs.cancel()),
      // not by this method.
      if (finished || child.killed) return;
      finished = true;
      sendCommand(stdin, 'abort');
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
type PiModelOption = { id: string; label: string };

export function parsePiModels(stdout: unknown): PiModelOption[] | null {
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
    const line = lines[i];
    if (line === undefined) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const provider = parts[0];
    const modelId = parts[1];
    if (provider === undefined || modelId === undefined) continue;
    // Skip duplicates (some providers list the same model under multiple names).
    const fullId = `${provider}/${modelId}`;
    if (seen.has(fullId)) continue;
    seen.add(fullId);
    entries.push({ id: fullId, label: fullId });
  }

  return entries.length > 1 ? entries : null;
}
