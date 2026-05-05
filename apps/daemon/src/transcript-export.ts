// One-shot dump of a project's conversation history to disk in a structured,
// LLM-friendly JSON Lines file at <projectDir>/.transcript.jsonl.
//
// This is the input primitive for downstream synthesis features (e.g. the
// "finalize design package" endpoint), kept deliberately decoupled from any
// HTTP route or LLM call. The file is produced on demand; SQLite remains the
// source of truth for chat history, so there's no live mirror to keep in
// sync.
//
// Format choice — JSONL with header line, per-conversation marker lines, and
// per-message lines — keeps the dump compact (no indentation), streamable,
// and `jq -c`/`tail`-friendly. A `schemaVersion` field on the header reserves
// room for incompatible changes later.
//
// Persisted event shape: see `packages/contracts/src/api/chat.ts` →
// `PersistedAgentEvent` (the discriminator field is `kind`, NOT `type`). The
// daemon's claude-stream emits a `type:`-shaped wire format; the web app
// translates those into `kind:`-shaped AgentEvents before PUTting them back
// to be persisted. The export reads what is actually on disk, so it speaks
// the `kind:` shape.
//
// Coalescing rules:
//   * `kind: 'text'` runs concatenate their `text` field into one terminal
//     text block.
//   * `kind: 'thinking'` runs concatenate their `text` field into one
//     terminal thinking block (the field is `text`, not `thinking` — see
//     contract above).
//   * `kind: 'tool_use'` and `kind: 'tool_result'` flush any pending text /
//     thinking accumulator and emit verbatim.
//   * `kind: 'status'` with `label === 'thinking'` is the daemon's translated
//     thinking_start marker; it flushes the prior accumulator so adjacent
//     thinking segments preserve their original block boundaries. Other
//     `status` labels and `kind: 'usage' | 'raw'` drop (telemetry).
//   * Type-change between text ↔ thinking flushes the prior accumulator.
//
// Content fallback: user-typed messages persist as plain text in
// `messages.content` with events_json = NULL (the user input never flowed
// through the streaming-event pipeline). When event-derived blocks come back
// empty we fall back to a single text block from content so a typed prompt
// is not silently lost.
//
// Attachments handling: the per-message `attachments_json` and
// `comment_attachments_json` columns are surfaced as references (path/name/
// kind/size, NOT inlined bytes). The header carries `attachmentCount`,
// `commentAttachmentCount`, and an explicit `attachmentsInlined: false`
// signal so a synthesis consumer can distinguish a complete transcript from
// one with silently omitted inputs.
//
// Concurrency: a per-project lockfile (`.transcript.lock`) is acquired with
// `openSync(..., 'wx')` and released in `finally`. A second concurrent
// export throws `TranscriptExportLockedError`. Stale-lock recovery (e.g.
// after a crash) is out of scope; the operator can clear the file manually
// via `rm .od/projects/<id>/.transcript.lock`.

import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { projectDir } from './projects.js';

const SCHEMA_VERSION = 2;
const TRANSCRIPT_FILENAME = '.transcript.jsonl';
const LOCK_FILENAME = '.transcript.lock';

// Inline copy of the PersistedAgentEvent discriminated union from
// `packages/contracts/src/api/chat.ts`. The daemon tsconfig does not resolve
// the `./api/chat` subpath export, so the union is restated here. Kept
// structurally identical to the contract; if the contract diverges, this
// file will fail behaviorally first (events drop into the default branch)
// and the schema-mismatch tests will catch it.
type PersistedAgentEvent =
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: 'raw'; line: string };

type Db = Database.Database;

interface ConversationRow {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string | null;
  position: number;
  eventsJson: string | null;
  createdAt: number;
  attachmentsJson: string | null;
  commentAttachmentsJson: string | null;
}

interface AttachmentRef {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
}

interface CommentAttachmentRef {
  id: string;
  filePath: string;
  label: string;
  comment: string;
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean };

export interface TranscriptExportOptions {
  now?: () => Date;
}

export interface TranscriptExportResult {
  path: string;
  conversationCount: number;
  messageCount: number;
  bytesWritten: number;
}

export class TranscriptExportLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptExportLockedError';
  }
}

export function exportProjectTranscript(
  db: Db,
  projectsRoot: string,
  projectId: string,
  options: TranscriptExportOptions = {},
): TranscriptExportResult {
  const dir = projectDir(projectsRoot, projectId);
  // The project may have DB rows but no on-disk directory yet (a synthesis
  // caller can hit this immediately after `insertProject`). mkdirSync with
  // recursive is idempotent; cheaper than guarding via existsSync.
  fs.mkdirSync(dir, { recursive: true });

  const finalPath = path.join(dir, TRANSCRIPT_FILENAME);
  const tmpPath = path.join(
    dir,
    `${TRANSCRIPT_FILENAME}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`,
  );
  const lockPath = path.join(dir, LOCK_FILENAME);
  const now = options.now ?? (() => new Date());

  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw new TranscriptExportLockedError(
        `transcript export for project ${projectId} is already in progress`,
      );
    }
    throw err;
  }

  try {
    // Conversations ordered chronologically (oldest first) — easiest for an
    // LLM to follow as a single sequence. db.listConversations sorts by
    // updated_at DESC for the sidebar; we re-sort here.
    const conversations = db
      .prepare(
        `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
           FROM conversations
          WHERE project_id = ?
          ORDER BY created_at ASC`,
      )
      .all(projectId) as ConversationRow[];

    const messageStmt = db.prepare(
      `SELECT id, role, content, position,
              events_json AS eventsJson,
              created_at AS createdAt,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson
         FROM messages
        WHERE conversation_id = ?
        ORDER BY position ASC`,
    );

    // Build the body in two passes: first build messages so the header has
    // the right totals, then emit header → for each conversation { marker →
    // messages }.
    interface BuiltMessage {
      kind: 'message';
      conversationId: string;
      id: string;
      role: 'user' | 'assistant';
      position: number;
      createdAt: number;
      blocks: Block[];
      attachments?: AttachmentRef[];
      commentAttachments?: CommentAttachmentRef[];
    }

    const bodyParts: { conv: ConversationRow; messages: BuiltMessage[] }[] = [];
    let messageCount = 0;
    let attachmentCount = 0;
    let commentAttachmentCount = 0;

    for (const conv of conversations) {
      const rows = messageStmt.all(conv.id) as MessageRow[];
      const messages: BuiltMessage[] = rows.map((row) => {
        const parsed = parseEvents(row.eventsJson);
        if (parsed.reason === 'malformed' || parsed.reason === 'not_array') {
          // Surface a data-quality signal on stderr so corrupted rows are
          // visible in daemon logs. Best-effort fallback to content still
          // fires; the export must remain a one-shot best-effort dump
          // rather than aborting on a single bad row.
          console.warn(
            `[transcript-export] message ${row.id} (project ${projectId}): ` +
              `events_json is non-null but ${parsed.reason}; falling back to content.`,
          );
        }
        const blocks = coalesceBlocks(parsed.events);
        if (blocks.length === 0 && typeof row.content === 'string' && row.content.length > 0) {
          blocks.push({ type: 'text', text: row.content });
        }

        const attachments = parseAttachments(row.attachmentsJson);
        const commentAttachments = parseCommentAttachments(row.commentAttachmentsJson);
        attachmentCount += attachments.length;
        commentAttachmentCount += commentAttachments.length;

        const built: BuiltMessage = {
          kind: 'message',
          conversationId: conv.id,
          id: row.id,
          role: row.role,
          position: Number(row.position),
          createdAt: Number(row.createdAt),
          blocks,
        };
        if (attachments.length > 0) built.attachments = attachments;
        if (commentAttachments.length > 0) built.commentAttachments = commentAttachments;
        return built;
      });
      messageCount += messages.length;
      bodyParts.push({ conv, messages });
    }

    const lines: string[] = [
      JSON.stringify({
        kind: 'header',
        schemaVersion: SCHEMA_VERSION,
        projectId,
        exportedAt: now().toISOString(),
        conversationCount: conversations.length,
        messageCount,
        attachmentCount,
        commentAttachmentCount,
        // Explicit signal: attachment metadata is referenced by path; the
        // bytes themselves remain on disk under the project directory and
        // are not inlined into the transcript.
        attachmentsInlined: false,
      }),
    ];
    for (const { conv, messages } of bodyParts) {
      lines.push(
        JSON.stringify({
          kind: 'conversation',
          id: conv.id,
          title: conv.title ?? null,
          createdAt: Number(conv.createdAt),
          updatedAt: Number(conv.updatedAt),
        }),
      );
      for (const m of messages) lines.push(JSON.stringify(m));
    }

    const encoded = Buffer.from(lines.join('\n') + '\n', 'utf8');

    // Atomic write: writeFileSync with the 'wx' flag loops internally until
    // the entire buffer is written or it throws. We then reopen the file
    // just to fsync data to disk before the rename, addressing the partial-
    // write durability concern flagged in review.
    try {
      fs.writeFileSync(tmpPath, encoded, { flag: 'wx' });
      const fsyncFd = fs.openSync(tmpPath, 'r+');
      try {
        fs.fsyncSync(fsyncFd);
      } finally {
        fs.closeSync(fsyncFd);
      }
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // tmp may not exist if writeFileSync threw before creating it
      }
      throw err;
    }

    return {
      path: finalPath,
      conversationCount: conversations.length,
      messageCount,
      bytesWritten: encoded.length,
    };
  } finally {
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
      } catch {
        // ignore close-after-error
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // lock may already be gone if the disk vanished; not fatal
      }
    }
  }
}

function parseEvents(raw: string | null): {
  events: PersistedAgentEvent[];
  reason: 'ok' | 'null' | 'malformed' | 'not_array';
} {
  if (raw == null) return { events: [], reason: 'null' };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { events: [], reason: 'malformed' };
  }
  if (!Array.isArray(v)) return { events: [], reason: 'not_array' };
  return { events: v as PersistedAgentEvent[], reason: 'ok' };
}

function parseAttachments(raw: string | null): AttachmentRef[] {
  if (raw == null) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: AttachmentRef[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.path !== 'string' || typeof a.name !== 'string') continue;
    if (a.kind !== 'image' && a.kind !== 'file') continue;
    const ref: AttachmentRef = {
      path: a.path,
      name: a.name,
      kind: a.kind,
    };
    if (typeof a.size === 'number') ref.size = a.size;
    out.push(ref);
  }
  return out;
}

function parseCommentAttachments(raw: string | null): CommentAttachmentRef[] {
  if (raw == null) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: CommentAttachmentRef[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== 'string') continue;
    if (typeof c.filePath !== 'string') continue;
    out.push({
      id: c.id,
      filePath: c.filePath,
      label: typeof c.label === 'string' ? c.label : '',
      comment: typeof c.comment === 'string' ? c.comment : '',
    });
  }
  return out;
}

// Walk arrival-order. Maintain a single accumulator for the current run of
// text or thinking events; flush on type change, on any tool block, on a
// status thinking-start marker, and at end-of-stream. Pure telemetry events
// (status with non-thinking label, usage, raw) drop without flushing — they
// neither contribute content nor signal a content boundary.
//
// Both `kind: 'text'` and `kind: 'thinking'` carry their content in a `text`
// field per PersistedAgentEvent; the output blocks rename thinking's field
// to `thinking` so a downstream consumer can tell text apart from thinking
// without consulting `type`.
function coalesceBlocks(events: PersistedAgentEvent[]): Block[] {
  const blocks: Block[] = [];
  let active: 'text' | 'thinking' | null = null;
  let buf = '';

  const flush = () => {
    if (active === 'text' && buf.length > 0) {
      blocks.push({ type: 'text', text: buf });
    } else if (active === 'thinking' && buf.length > 0) {
      blocks.push({ type: 'thinking', thinking: buf });
    }
    active = null;
    buf = '';
  };

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    switch (ev.kind) {
      case 'text': {
        if (typeof ev.text !== 'string') break;
        if (active !== 'text') {
          flush();
          active = 'text';
        }
        buf += ev.text;
        break;
      }
      case 'thinking': {
        if (typeof ev.text !== 'string') break;
        if (active !== 'thinking') {
          flush();
          active = 'thinking';
        }
        buf += ev.text;
        break;
      }
      case 'tool_use': {
        flush();
        blocks.push({
          type: 'tool_use',
          id: ev.id,
          name: ev.name,
          input: ev.input ?? null,
        });
        break;
      }
      case 'tool_result': {
        flush();
        blocks.push({
          type: 'tool_result',
          toolUseId: ev.toolUseId,
          content: typeof ev.content === 'string' ? ev.content : String(ev.content ?? ''),
          isError: Boolean(ev.isError),
        });
        break;
      }
      case 'status': {
        // status with label === 'thinking' is the daemon's translated
        // thinking_start marker (apps/web/src/providers/daemon.ts:367-369).
        // It signals a new thinking segment, so flush the prior accumulator
        // — without this, two thinking segments separated only by the
        // marker would merge into one block and synthesis could not recover
        // the original boundaries. Other status labels are pure telemetry
        // and drop without flushing.
        if (ev.label === 'thinking') flush();
        break;
      }
      // Telemetry: usage, raw — intentional drop, neither contributes
      // content nor signals a content boundary.
      default:
        break;
    }
  }

  flush();
  return blocks;
}
