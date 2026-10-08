/**
 * I1 — A persisted run event never carries an unbounded payload.
 *
 * Every event the daemon stores for a chat turn (`messages.events_json`,
 * `message_event_batches.events_json`) — and every `raw` line it streams to the
 * browser — fits {@link RUN_EVENT_JSON_BUDGET_BYTES}. An event that would not
 * fit has its payload shortened here, deterministically, with an explicit
 * inline marker (`[open-design: …]`) naming how many bytes were cut, and a
 * `truncated: { originalBytes }` field on the event itself.
 *
 * Why a budget exists at all (incident 2026-09-14): cursor-agent's
 * `tool_call` completion lines carry the whole edited file twice and its
 * `user` line echoes the whole composed prompt. Nothing parses those lines —
 * they fall through to `raw` — yet they were streamed and stored verbatim at
 * ~1.4 MB per turn, until the renderer, the daemon and `GET …/messages` (V8's
 * maximum string length) all ran out of room on one long conversation.
 *
 * Why 64 KiB per event, and 16 KiB per shortened string:
 * - Nothing renders more than a few KB of any tool payload: the chat's tool
 *   rows show at most 4,000 characters of output, and `raw` lines are never
 *   rendered at all. The size-sensitive client heuristic
 *   (`LARGE_TOOL_RESULT_CHARS = 8_000` in `apps/web/src/providers/daemon.ts`)
 *   still sees a shortened result as "large".
 * - Consumers that parse payloads read small, head-anchored structures —
 *   media-generation JSON lines, file paths, commands, TodoWrite snapshots —
 *   all of which fit untouched. Events are only shortened when they exceed the
 *   64 KiB budget, so e.g. a 40 KB tool result is stored exactly as before.
 * - 16 KiB keeps hundreds of lines of head and tail context for a human
 *   reading a transcript, while a turn with dozens of oversized tool events
 *   stays in the low MBs instead of growing with every file the agent touches.
 *
 * What is never shortened: `text` and `thinking`. They are the assistant's
 * answer and reasoning — the transcript itself, mirrored into
 * `messages.content` — bounded by the model's output, not by tool payloads.
 *
 * Shortening preserves what downstream code relies on: the event count (no
 * event is ever dropped — client/daemon merge guards compare counts), the
 * event kind and identity fields (`id`, `name`, `toolUseId`, `isError`), JSON
 * validity of structured payloads, and the `+N −M` line counts of Write/Edit
 * rows (carried as `od_diff_stat`, the field the web's `diffStat` already
 * honours). Output is a pure function of the input, so the live stream, the
 * write path and the one-time heal of old rows all store the same bytes, and
 * shortening an already-bounded event returns it unchanged.
 */
import { createHash } from 'node:crypto';

import type { AgentEventPayloadTruncation } from '@open-design/contracts';

/** Maximum UTF-8 size of one stored run event's JSON. */
export const RUN_EVENT_JSON_BUDGET_BYTES = 64 * 1024;

/** Size a string payload is shortened to when its event exceeds the budget. */
export const RUN_EVENT_STRING_PAYLOAD_BUDGET_BYTES = 16 * 1024;

/** Floor for the adaptive per-string budget (shapes with many large strings). */
const MIN_STRING_PAYLOAD_BYTES = 256;

/** Largest scalar kept verbatim when an input has to be summarized. */
const SUMMARY_SCALAR_MAX_BYTES = 1024;

/** Values smaller than this are never worth replacing with a marker. */
const OMIT_FIELD_MIN_BYTES = 512;

/** Nesting depth beyond which structured payloads are summarized instead. */
const MAX_WALK_DEPTH = 64;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * True when `json` fits `budget` UTF-8 bytes. A UTF-16 code unit encodes to
 * 1–3 bytes, so the character count brackets the byte count and the exact
 * (linear) byte count is only taken when the bracket is inconclusive.
 */
function jsonFitsBudget(json: string, budget = RUN_EVENT_JSON_BUDGET_BYTES): boolean {
  if (json.length * 3 <= budget) return true;
  if (json.length > budget) return false;
  return utf8Bytes(json) <= budget;
}

/**
 * True when `value`'s JSON is certainly within `limit` bytes, decided without
 * serializing it: every UTF-16 unit of a string or key encodes to at most 6
 * bytes of JSON (``), a scalar to at most 24. Walks iteratively and stops
 * as soon as the bound passes `limit`, so a typical small event costs a few
 * property reads. `false` only means "measure exactly".
 */
function jsonCertainlyWithin(value: unknown, limit: number): boolean {
  let total = 0;
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === 'string') {
      total += next.length * 6 + 2;
    } else if (next === null || typeof next !== 'object') {
      total += 24;
    } else if (typeof (next as { toJSON?: unknown }).toJSON === 'function') {
      return false;
    } else if (Array.isArray(next)) {
      total += 2 + next.length;
      for (const entry of next) pending.push(entry);
    } else {
      for (const [key, entry] of Object.entries(next)) {
        total += key.length * 6 + 4;
        pending.push(entry);
      }
      total += 2;
    }
    if (total > limit) return false;
  }
  return true;
}

function eventFitsBudget(event: unknown): boolean {
  if (jsonCertainlyWithin(event, RUN_EVENT_JSON_BUDGET_BYTES)) return true;
  return jsonFitsBudget(JSON.stringify(event) ?? 'null');
}

function payloadDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}

function truncationMarker(originalBytes: number, omittedBytes: number, digest: string): string {
  return `\n…[open-design: truncated ${omittedBytes} of ${originalBytes} bytes, sha256 ${digest}]…\n`;
}

function omittedFieldMarker(value: string): string {
  return `[open-design: omitted ${utf8Bytes(value)} bytes of full content, sha256 ${payloadDigest(value)}]`;
}

function isUtf8Continuation(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

/**
 * `value` cut to at most `budgetBytes` UTF-8 bytes: its head, an explicit
 * marker (bytes omitted, original size, a digest of the original), its tail.
 * Cuts land on code-point boundaries. The digest makes two different originals
 * that share a head and tail shorten to different strings, so downstream
 * adjacent-duplicate folding can never merge them.
 */
export function truncateTextToUtf8Budget(value: string, budgetBytes: number): string {
  const originalBytes = utf8Bytes(value);
  if (originalBytes <= budgetBytes) return value;
  const digest = payloadDigest(value);
  const reserve = utf8Bytes(truncationMarker(originalBytes, originalBytes, digest));
  const keep = Math.max(0, budgetBytes - reserve);
  const buffer = Buffer.from(value, 'utf8');
  let headEnd = Math.ceil(keep / 2);
  while (headEnd > 0 && isUtf8Continuation(buffer[headEnd])) headEnd -= 1;
  let tailStart = buffer.length - (keep - Math.ceil(keep / 2));
  while (tailStart < buffer.length && isUtf8Continuation(buffer[tailStart])) tailStart += 1;
  if (tailStart < headEnd) tailStart = headEnd;
  return (
    buffer.toString('utf8', 0, headEnd)
    + truncationMarker(originalBytes, tailStart - headEnd, digest)
    + buffer.toString('utf8', tailStart)
  );
}

/**
 * Every string inside `value` longer than `leafBudget` bytes, shortened. The
 * structure — and every untouched branch, by reference — is preserved, so the
 * result stays valid JSON of the same shape.
 */
function capStringLeaves(value: unknown, leafBudget: number, depth = 0): unknown {
  if (typeof value === 'string') {
    if (value.length * 3 <= leafBudget) return value;
    return utf8Bytes(value) > leafBudget ? truncateTextToUtf8Budget(value, leafBudget) : value;
  }
  if (depth >= MAX_WALK_DEPTH) return value;
  if (Array.isArray(value)) {
    let copy: unknown[] | null = null;
    for (let index = 0; index < value.length; index += 1) {
      const next = capStringLeaves(value[index], leafBudget, depth + 1);
      if (next !== value[index]) {
        copy ??= value.slice();
        copy[index] = next;
      }
    }
    return copy ?? value;
  }
  if (isRecord(value)) {
    let copy: JsonRecord | null = null;
    for (const [key, entry] of Object.entries(value)) {
      const next = capStringLeaves(entry, leafBudget, depth + 1);
      if (next !== entry) {
        copy ??= { ...value };
        copy[key] = next;
      }
    }
    return copy ?? value;
  }
  return value;
}

/** Halving per-string budgets, largest first. */
function* stringBudgets(): Generator<number> {
  for (
    let budget = RUN_EVENT_STRING_PAYLOAD_BUDGET_BYTES;
    budget >= MIN_STRING_PAYLOAD_BYTES;
    budget = Math.floor(budget / 2)
  ) {
    yield budget;
  }
}

// ---------------------------------------------------------------------------
// raw lines
// ---------------------------------------------------------------------------

/**
 * Fields of a cursor-agent `tool_call` result that hold a full copy of a file:
 * `editToolCall` returns the file before AND after the edit (the ~1.2 MB of
 * the incident), `readToolCall` returns what it read. The diff summary, path,
 * line counts and outcome sit beside them and are what a reader needs, so an
 * oversized line drops these first and only then shortens what is left.
 */
const CURSOR_FULL_CONTENT_FIELDS_ANY_TOOL = ['beforeFullFileContent', 'afterFullFileContent'];
const CURSOR_FULL_CONTENT_FIELDS_BY_TOOL: Record<string, readonly string[]> = {
  readToolCall: ['content'],
};

function omitCursorFullContentFields(line: JsonRecord): JsonRecord {
  if (line.type !== 'tool_call' || !isRecord(line.tool_call)) return line;
  let toolCall: JsonRecord | null = null;
  for (const [toolName, call] of Object.entries(line.tool_call)) {
    if (!isRecord(call) || !isRecord(call.result) || !isRecord(call.result.success)) continue;
    const success = call.result.success;
    const fields = [
      ...CURSOR_FULL_CONTENT_FIELDS_ANY_TOOL,
      ...(CURSOR_FULL_CONTENT_FIELDS_BY_TOOL[toolName] ?? []),
    ];
    let nextSuccess: JsonRecord | null = null;
    for (const field of fields) {
      const value = success[field];
      if (typeof value !== 'string' || utf8Bytes(value) < OMIT_FIELD_MIN_BYTES) continue;
      nextSuccess ??= { ...success };
      nextSuccess[field] = omittedFieldMarker(value);
    }
    if (!nextSuccess) continue;
    toolCall ??= { ...line.tool_call };
    toolCall[toolName] = { ...call, result: { ...call.result, success: nextSuccess } };
  }
  return toolCall ? { ...line, tool_call: toolCall } : line;
}

function parseJsonLine(line: string): unknown {
  const first = line.trimStart()[0];
  if (first !== '{' && first !== '[') return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function rawEventFits(line: string, truncated?: AgentEventPayloadTruncation): boolean {
  return eventFitsBudget(truncated ? { kind: 'raw', line, truncated } : { kind: 'raw', line });
}

/**
 * A stdout line no parser recognised, bounded so that the `raw` event carrying
 * it fits the per-event budget. `parsed` is the line's already-parsed JSON when
 * the caller has it (the stream parsers do), so it is not parsed twice.
 *
 * A JSON line stays valid JSON: known full-content fields are replaced by a
 * marker first, then long strings are shortened. Only a line that is not JSON
 * (or whose structure alone is too large) is cut as plain text.
 */
export function boundRawAgentLine(
  line: string,
  parsed?: unknown,
): { line: string; truncated?: AgentEventPayloadTruncation } {
  if (rawEventFits(line)) return { line };
  const truncated = { originalBytes: utf8Bytes(line) };
  const structured = parsed !== undefined ? parsed : parseJsonLine(line);
  if (isRecord(structured) || Array.isArray(structured)) {
    const slim = isRecord(structured) ? omitCursorFullContentFields(structured) : structured;
    for (const budget of stringBudgets()) {
      const candidate = JSON.stringify(capStringLeaves(slim, budget));
      if (rawEventFits(candidate, truncated)) return { line: candidate, truncated };
    }
  }
  for (const budget of stringBudgets()) {
    const candidate = truncateTextToUtf8Budget(line, budget);
    if (rawEventFits(candidate, truncated) || budget === MIN_STRING_PAYLOAD_BYTES) {
      return { line: candidate, truncated };
    }
  }
  return { line: truncateTextToUtf8Budget(line, MIN_STRING_PAYLOAD_BYTES), truncated };
}

/** The SSE `agent` payload for an unrecognised stdout line, already bounded. */
export function boundedRawAgentEvent(
  line: string,
  parsed?: unknown,
): { type: 'raw'; line: string; truncated?: AgentEventPayloadTruncation } {
  const bounded = boundRawAgentLine(line, parsed);
  return bounded.truncated
    ? { type: 'raw', line: bounded.line, truncated: bounded.truncated }
    : { type: 'raw', line: bounded.line };
}

// ---------------------------------------------------------------------------
// tool_use / tool_result / everything else
// ---------------------------------------------------------------------------

function lineCount(value: string): number {
  let count = 1;
  for (let index = value.indexOf('\n'); index !== -1; index = value.indexOf('\n', index + 1)) {
    count += 1;
  }
  return count;
}

/**
 * The `+N −M` a Write/Edit row shows, computed from the ORIGINAL input before
 * its text is shortened, and carried as `od_diff_stat` — the field
 * `diffStat` in `apps/web/src/runtime/chat/format.ts` already prefers (codex
 * patches use it the same way). Mirrors that function's two branches exactly
 * (same tool names, same `split('\n').length` count) so a shortened row shows
 * the same numbers it showed before; tools it never counted get nothing.
 */
function withOriginalDiffStat(name: unknown, original: unknown, shortened: unknown): unknown {
  if (!isRecord(original) || !isRecord(shortened) || original.od_diff_stat !== undefined) {
    return shortened;
  }
  const tool = String(name ?? '').toLowerCase();
  if ((tool === 'write' || tool === 'write_file') && typeof original.content === 'string') {
    if (shortened.content === original.content) return shortened;
    return { ...shortened, od_diff_stat: { added: lineCount(original.content), removed: 0 } };
  }
  if (tool === 'edit' && typeof original.old_string === 'string') {
    if (shortened.old_string === original.old_string && shortened.new_string === original.new_string) {
      return shortened;
    }
    const next = typeof original.new_string === 'string' ? original.new_string : '';
    return {
      ...shortened,
      od_diff_stat: { added: lineCount(next), removed: lineCount(original.old_string) },
    };
  }
  return shortened;
}

/**
 * Last resort for a record whose STRUCTURE (not its strings) exceeds the
 * budget: keep, in order, the small scalar fields a reader identifies it by
 * (paths, commands, ids, flags) until half the budget is used.
 */
function summarizeRecord(value: unknown, keep: JsonRecord = {}): JsonRecord {
  const summary: JsonRecord = { ...keep };
  let bytes = utf8Bytes(JSON.stringify(summary));
  if (!isRecord(value)) return summary;
  for (const [key, entry] of Object.entries(value)) {
    if (key in summary) continue;
    const small =
      (typeof entry === 'string' && utf8Bytes(entry) <= SUMMARY_SCALAR_MAX_BYTES)
      || typeof entry === 'number'
      || typeof entry === 'boolean'
      || entry === null;
    if (!small) continue;
    const entryBytes = utf8Bytes(JSON.stringify({ [key]: entry }));
    if (bytes + entryBytes > RUN_EVENT_JSON_BUDGET_BYTES / 2) break;
    summary[key] = entry;
    bytes += entryBytes;
  }
  return summary;
}

function withTruncation(event: JsonRecord, originalBytes: number): JsonRecord {
  const previous = isRecord(event.truncated) && typeof event.truncated.originalBytes === 'number'
    ? event.truncated.originalBytes
    : 0;
  return { ...event, truncated: { originalBytes: Math.max(previous, originalBytes) } };
}

function boundToolUse(event: JsonRecord): JsonRecord {
  const input = event.input;
  const inputJson = JSON.stringify(input) ?? 'null';
  const originalBytes = utf8Bytes(inputJson);
  for (const budget of stringBudgets()) {
    const shortened = withOriginalDiffStat(event.name, input, capStringLeaves(input, budget));
    const candidate = withTruncation({ ...event, input: shortened }, originalBytes);
    if (eventFitsBudget(candidate)) return candidate;
  }
  const diffStat = withOriginalDiffStat(event.name, input, {});
  const summary = summarizeRecord(input, {
    ...(isRecord(diffStat) && diffStat.od_diff_stat ? { od_diff_stat: diffStat.od_diff_stat } : {}),
    od_truncated_input: omittedFieldMarker(inputJson),
  });
  return withTruncation({ ...event, input: summary }, originalBytes);
}

function boundToolResult(event: JsonRecord): JsonRecord {
  const content = typeof event.content === 'string' ? event.content : String(event.content ?? '');
  const originalBytes = utf8Bytes(content);
  let candidate = event;
  for (const budget of stringBudgets()) {
    candidate = withTruncation({ ...event, content: truncateTextToUtf8Budget(content, budget) }, originalBytes);
    if (eventFitsBudget(candidate)) return candidate;
  }
  return candidate;
}

function boundRaw(event: JsonRecord): JsonRecord {
  const line = typeof event.line === 'string' ? event.line : String(event.line ?? '');
  const bounded = boundRawAgentLine(line);
  const originalBytes = bounded.truncated?.originalBytes ?? utf8Bytes(line);
  return withTruncation({ ...event, line: bounded.line }, originalBytes);
}

function boundGeneric(event: JsonRecord): JsonRecord {
  const originalBytes = utf8Bytes(JSON.stringify(event));
  for (const budget of stringBudgets()) {
    const shortened = capStringLeaves(event, budget) as JsonRecord;
    const candidate = withTruncation({ ...shortened, kind: event.kind }, originalBytes);
    if (eventFitsBudget(candidate)) return candidate;
  }
  return withTruncation(summarizeRecord(event, { kind: event.kind }), originalBytes);
}

/**
 * `event` as it may be stored: returned unchanged (same reference) when it
 * fits the per-event budget or is a `text`/`thinking` event; otherwise a copy
 * whose payload is shortened until it fits (see the module comment).
 */
export function boundPersistedAgentEvent<T>(event: T): T {
  if (!isRecord(event)) return event;
  if (event.kind === 'text' || event.kind === 'thinking') return event;
  if (eventFitsBudget(event)) return event;
  let bounded: JsonRecord;
  try {
    switch (event.kind) {
      case 'raw':
        bounded = boundRaw(event);
        break;
      case 'tool_result':
        bounded = boundToolResult(event);
        break;
      case 'tool_use':
        bounded = boundToolUse(event);
        break;
      default:
        bounded = boundGeneric(event);
    }
  } catch {
    // Pathological input (e.g. nesting deeper than the engine's stack) must
    // still come out bounded rather than stored whole.
    bounded = summarizedEvent(event);
  }
  // The per-kind strategies cover every shape the runtimes produce; this is
  // the guarantee for anything else (an oversized identity field, extra
  // fields on a client-written event).
  return (eventFitsBudget(bounded) ? bounded : summarizedEvent(event)) as T;
}

function summarizedEvent(event: JsonRecord): JsonRecord {
  let originalBytes = 0;
  try {
    originalBytes = utf8Bytes(JSON.stringify(event) ?? '');
  } catch {
    originalBytes = 0;
  }
  return withTruncation(summarizeRecord(event, { kind: event.kind }), originalBytes);
}

/** {@link boundPersistedAgentEvent} over a list; the same array when nothing changed. */
export function boundPersistedAgentEvents<T>(events: readonly T[]): readonly T[] {
  let copy: T[] | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as T;
    const bounded = boundPersistedAgentEvent(event);
    if (bounded !== event) {
      copy ??= events.slice();
      copy[index] = bounded;
    }
  }
  return copy ?? events;
}

/**
 * The `events_json` text for a list of run events, every event bounded. Byte
 * for byte what `JSON.stringify(events)` produces whenever every event already
 * fits, and it serializes each event once in that case.
 */
export function serializeRunEventsForStorage(events: readonly unknown[]): string {
  const parts: string[] = new Array(events.length);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    let json = JSON.stringify(event) ?? 'null';
    if (
      isRecord(event)
      && event.kind !== 'text'
      && event.kind !== 'thinking'
      && !jsonFitsBudget(json)
    ) {
      json = JSON.stringify(boundPersistedAgentEvent(event));
    }
    parts[index] = json;
  }
  return `[${parts.join(',')}]`;
}
