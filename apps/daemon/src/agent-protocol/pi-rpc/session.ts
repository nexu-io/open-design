/** @module agent-protocol/pi-rpc/session
 * Attaches a pi `--mode rpc` session to an already-spawned child process.
 * Owns prompt delivery, session-file capture, image forwarding (with count and
 * byte budgets), extension-UI auto-resolution, and abort signalling.
 * Consumes `createJsonLineStream` from core/ and `mapPiRpcEvent` from pi-rpc/events.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';
import { createJsonLineStream } from '../core/index.js';
import { mapPiRpcEvent } from './events.js';
import type { JsonRecord, SendAgentEvent } from './internal.js';
import { isRecord, errorMessage, errorCode, getRecord } from './internal.js';

/** A base64-encoded image object in pi's RPC prompt format. */
export type PiImagePayload = {
  type: 'image';
  data: string;
  mimeType: string;
};
/** Generic parameter bag for a pi RPC command written to child stdin. */
export type PiRpcParams = JsonRecord;
/** Options for `attachPiRpcSession`. All fields map directly to the pi RPC protocol. */
export type PiRpcSessionOptions = {
  child: ChildProcess;
  prompt: string;
  cwd?: string;
  model?: string | null;
  send: SendAgentEvent;
  imagePaths?: string[];
  uploadRoot?: string;
  parentSession?: string;
};
/** Handle returned by `attachPiRpcSession` for querying run state and requesting abort. */
export type PiRpcSession = {
  hasFatalError(): boolean;
  abort(): void;
  getLastSessionPath(): string | null;
};
// Image forwarding budgets to prevent large synchronous base64 work.
/** Maximum number of images forwarded per prompt turn. */
export const MAX_IMAGE_COUNT = 10;
/** Total byte ceiling for all images forwarded in one prompt turn. */
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
/** File extensions accepted in pi's `images` RPC field. */
export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
/** Extension UI methods that expect no response — silently consumed without reply. */
export const FIRE_AND_FORGET_METHODS = new Set([
  'setStatus',
  'setWidget',
  'notify',
  'setTitle',
  'set_editor_text',
]);
/**
 * Writes a JSON-RPC response to pi's stdin for an `extension_ui_request` event,
 * keeping pi unblocked without surfacing an interactive dialog to the daemon caller.
 * Fire-and-forget methods are silently consumed. Dialog methods are auto-resolved:
 * `confirm` → `{ confirmed: true }`; select/input/editor → first option or cancelled.
 *
 * @param writable - The child process stdin stream.
 * @param raw      - The parsed `extension_ui_request` RPC object from pi's stdout.
 */
export function replyExtensionUi(writable: Writable, raw: JsonRecord): void {
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
/** Snapshot of `.pi/sessions/` file metadata taken before a prompt is sent. */
export type PiSessionFileSnapshot = Map<string, { mtimeMs: number; size: number }>;
/**
 * Reads `.pi/sessions/*.jsonl` entries from the given working directory,
 * returning file paths with their mtime and size. Returns an empty array
 * when the directory is absent, empty, or unreadable.
 *
 * @param cwd - Absolute path to the pi working directory; may be undefined.
 */
export function readPiSessionFiles(cwd: string | undefined): Array<{ path: string; mtimeMs: number; size: number }> {
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
/**
 * Takes a before-snapshot of `.pi/sessions/` to enable changed-file detection
 * after the prompt completes.
 *
 * @param cwd - Absolute path to the pi working directory; may be undefined.
 */
export function snapshotPiSessionFiles(cwd: string | undefined): PiSessionFileSnapshot {
  const snapshot: PiSessionFileSnapshot = new Map();
  for (const file of readPiSessionFiles(cwd)) {
    snapshot.set(file.path, { mtimeMs: file.mtimeMs, size: file.size });
  }
  return snapshot;
}
/**
 * Compares the current `.pi/sessions/` directory against a before-snapshot
 * and returns the path of the single changed file. Returns `null` when zero
 * or more than one file changed — concurrent pi processes are detected this
 * way to avoid associating the wrong session with this run.
 *
 * @param cwd    - Absolute path to the pi working directory; may be undefined.
 * @param before - Snapshot taken before the prompt was sent.
 * @returns Absolute path of the changed session file, or `null`.
 */
export function resolveSessionPathChangedSince(
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
 * Attaches the daemon's run lifecycle to an already-spawned `pi --mode rpc` child process.
 *
 * Responsibilities:
 * - Sends a `new_session` RPC command (with `parentSession`) before the prompt when
 *   resuming a prior conversation, waiting for acknowledgement before the prompt is sent.
 *   This preserves conversation history across edit rounds; if the parent session is
 *   rejected, the run is failed immediately rather than continuing without prior context.
 * - Encodes and forwards `imagePaths` as base64 in the `prompt` RPC command, subject to
 *   `MAX_IMAGE_COUNT` and `MAX_TOTAL_IMAGE_BYTES` budgets. Symlinks are resolved via
 *   `realpathSync` and re-verified against `uploadRoot` to prevent path-escape attacks.
 * - Streams pi's stdout through `createJsonLineStream`, delegating each parsed object to
 *   `mapPiRpcEvent` for typed SSE event dispatch, and auto-resolving extension-UI requests
 *   via `replyExtensionUi` so pi does not block waiting for interactive dialogs.
 * - On `agent_end`, captures the changed `.pi/sessions/` file path for conversational
 *   resume, closes stdin, and schedules a SIGTERM fallback after
 *   `PI_GRACEFUL_SHUTDOWN_MS` ms (default 5000).
 *
 * @param options - Session parameters: child process, prompt string, optional model,
 *                  image paths, upload root for symlink verification, and optional
 *                  parent session path for conversation resume.
 * @returns A `PiRpcSession` handle with `hasFatalError`, `getLastSessionPath`, and `abort`.
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
