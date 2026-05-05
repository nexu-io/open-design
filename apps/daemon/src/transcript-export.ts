// @ts-nocheck
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
// Coalescing: events_json carries streaming `text_delta` / `thinking_delta`
// chunks plus tool_use / tool_result / thinking_start markers and telemetry
// (status / usage / raw). The export collapses runs of same-type deltas into
// terminal `text` / `thinking` blocks via arrival-order with type-change
// flush, preserving any interleaving with tool blocks. Telemetry is dropped.
//
// Content fallback: user-typed messages persist as plain text in
// `messages.content` with events_json = NULL (the user didn't go through the
// streaming-event pipeline). When event-derived blocks come back empty we
// fall back to a single text block from content so a typed prompt is not
// silently lost. attachments_json / comment_attachments_json are out of
// scope for this PR — call out as a known omission to revisit.

import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { projectDir } from './projects.js';

const SCHEMA_VERSION = 1;
const TRANSCRIPT_FILENAME = '.transcript.jsonl';

export interface TranscriptExportOptions {
  now?: () => Date;
}

export interface TranscriptExportResult {
  path: string;
  conversationCount: number;
  messageCount: number;
  bytesWritten: number;
}

export function exportProjectTranscript(
  db,
  projectsRoot: string,
  projectId: string,
  options: TranscriptExportOptions = {},
): TranscriptExportResult {
  const dir = projectDir(projectsRoot, projectId);
  const finalPath = path.join(dir, TRANSCRIPT_FILENAME);
  const tmpPath = path.join(
    dir,
    `${TRANSCRIPT_FILENAME}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`,
  );
  const now = options.now ?? (() => new Date());

  // Conversations ordered chronologically (oldest first) — easiest for an LLM
  // to follow as a single sequence. db.listConversations sorts by updated_at
  // DESC for the sidebar; we re-sort here.
  const conversations = db
    .prepare(
      `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
         FROM conversations
        WHERE project_id = ?
        ORDER BY created_at ASC`,
    )
    .all(projectId);

  const messageStmt = db.prepare(
    `SELECT id, role, content, position, events_json AS eventsJson,
            created_at AS createdAt
       FROM messages
      WHERE conversation_id = ?
      ORDER BY position ASC`,
  );

  // Build the body in two passes: first count messages so the header has the
  // right total, then emit header → for each conversation { marker → messages }.
  const bodyParts: { conv: any; messages: any[] }[] = [];
  let messageCount = 0;
  for (const conv of conversations) {
    const messages = messageStmt.all(conv.id).map((row) => {
      const blocks = coalesceBlocks(parseEvents(row.eventsJson));
      if (blocks.length === 0 && typeof row.content === 'string' && row.content.length > 0) {
        blocks.push({ type: 'text', text: row.content });
      }
      return {
        kind: 'message',
        conversationId: conv.id,
        id: row.id,
        role: row.role,
        position: Number(row.position),
        createdAt: Number(row.createdAt),
        blocks,
      };
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

  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, 'wx');
    writeSync(fd, encoded, 0, encoded.length, 0);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmpPath, finalPath);
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore close-after-error
      }
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      // tmp may not exist if openSync threw
    }
    throw err;
  }

  return {
    path: finalPath,
    conversationCount: conversations.length,
    messageCount,
    bytesWritten: encoded.length,
  };
}

function parseEvents(raw): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Walk arrival-order. Maintain a single accumulator for the current run of
// text or thinking deltas; flush on type change, on thinking_start, on any
// tool block, and at end-of-stream. Telemetry events drop without flushing
// (they neither contribute content nor signal a content boundary).
function coalesceBlocks(events: any[]) {
  const blocks: any[] = [];
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
    switch (ev.type) {
      case 'text_delta': {
        if (typeof ev.delta !== 'string') break;
        if (active !== 'text') {
          flush();
          active = 'text';
        }
        buf += ev.delta;
        break;
      }
      case 'thinking_delta': {
        if (typeof ev.delta !== 'string') break;
        if (active !== 'thinking') {
          flush();
          active = 'thinking';
        }
        buf += ev.delta;
        break;
      }
      case 'thinking_start': {
        flush();
        break;
      }
      case 'tool_use': {
        flush();
        blocks.push({
          type: 'tool_use',
          id: ev.id,
          name: ev.name,
          input: ev.input ?? {},
        });
        break;
      }
      case 'tool_result': {
        flush();
        blocks.push({
          type: 'tool_result',
          toolUseId: ev.toolUseId,
          content: ev.content,
          isError: Boolean(ev.isError),
        });
        break;
      }
      // Telemetry: status, usage, raw — intentional drop.
      default:
        break;
    }
  }

  flush();
  return blocks;
}
