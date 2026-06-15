/**
 * Parses Claude Code's `--output-format stream-json --verbose` JSONL stream
 * (with or without `--include-partial-messages`) into a small set of
 * UI-friendly events. With partial messages on, text arrives as
 * `stream_event` deltas; without it (older builds <1.0.86, or any build
 * where the flag isn't passed) text arrives only in the final `assistant`
 * wrapper. We handle both. The UI only needs to know five things:
 *
 *   - status        : high-level lifecycle ("initializing", "requesting",
 *                     "thinking")
 *   - text_delta    : assistant text chunk (gets fed to the artifact parser)
 *   - thinking_delta: extended-thinking chunk (shown in a collapsed block)
 *   - tool_use      : { id, name, input }     (fires when input is complete)
 *   - tool_result   : { tool_use_id, content, is_error }
 *   - usage         : aggregated input/output/cache tokens + cost
 *
 * Callers give us `onEvent({ type, ...payload })`. We track per-content-block
 * state to accumulate partial tool_use input JSON and emit a single
 * `tool_use` event when that block stops.
 */

import { createRoleMarkerGuard, type RoleMarkerGuard } from './role-marker-guard.js';

type StreamEvent = Record<string, unknown>;
type EventSink = (event: StreamEvent) => void;
type BlockState = {
  type?: unknown;
  name?: unknown;
  id?: unknown;
  input: string;
  inputValue?: unknown;
};
type RuntimeTask = {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'stopped';
  activeForm?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface ClaudeStreamHandlerOptions {
  suppressHtmlArtifactsAfterFileWrite?: boolean;
}

export function createClaudeStreamHandler(
  onEvent: EventSink,
  options: ClaudeStreamHandlerOptions = {},
) {
  let buffer = '';

  // Per-content-block scratch, keyed by `${messageId}:${blockIndex}`.
  const blocks = new Map<string, BlockState>();
  // Tool uses already emitted from streamed `input_json_delta` data.
  // Claude Code still repeats them in the final assistant wrapper, often with
  // empty `{}` inputs, so we suppress that duplicate emission.
  const streamedToolUseIds = new Set<string>();
  // Most recent assistant message id so content_block_* events without an id
  // can be attributed correctly.
  let currentMessageId: string | null = null;
  // Message ids that already streamed assistant text/thinking via
  // `stream_event` deltas.
  // When `--include-partial-messages` is OFF (older Claude Code, e.g. 1.0.84
  // pre-flag), no deltas arrive — only the final `assistant` wrapper carries
  // content. The fallback below emits that content once, but we must skip it for
  // newer builds that already streamed deltas, otherwise the message would
  // duplicate.
  const textStreamed = new Set<string>();
  const thinkingStreamed = new Set<string>();
  let currentMessageStreamedText = false;
  let currentMessageStreamedThinking = false;
  // Per-message role-marker guards for cross-chunk detection (#3247).
  const roleGuards = new Map<string, RoleMarkerGuard>();
  const runtimeTasks = new Map<string, RuntimeTask>();
  const canonicalTaskToolUseIds = new Set<string>();
  let nextRuntimeTaskId = 1;
  let suppressNextArtifactText = false;
  let suppressDuplicateArtifactText = false;
  let artifactOpenCandidate = '';
  let pendingArtifactText = '';
  let duplicateArtifactCandidate = '';
  const recentWriteContents: string[] = [];
  let wroteHtmlFileThisTurn = false;

  function normalizeTaskStatus(value: unknown): RuntimeTask['status'] {
    if (value === 'completed' || value === 'in_progress' || value === 'stopped') {
      return value;
    }
    if (value === 'complete' || value === 'done') return 'completed';
    if (value === 'doing' || value === 'active') return 'in_progress';
    if (value === 'failed' || value === 'canceled' || value === 'cancelled') return 'stopped';
    return 'pending';
  }

  function nextGeneratedRuntimeTaskId(): string {
    while (runtimeTasks.has(String(nextRuntimeTaskId))) {
      nextRuntimeTaskId += 1;
    }
    const id = String(nextRuntimeTaskId);
    nextRuntimeTaskId += 1;
    return id;
  }

  function runtimeTaskIdFromCreate(input: Record<string, unknown>): string {
    if (typeof input.taskId === 'string' && input.taskId) {
      const numericId = Number(input.taskId);
      if (Number.isSafeInteger(numericId) && numericId >= nextRuntimeTaskId) {
        nextRuntimeTaskId = numericId + 1;
      }
      return input.taskId;
    }
    return nextGeneratedRuntimeTaskId();
  }

  function emitCanonicalTaskSnapshot(toolUseId: unknown, name: unknown, input: unknown): boolean {
    if (typeof toolUseId !== 'string' || typeof name !== 'string' || !isRecord(input)) return false;
    if (canonicalTaskToolUseIds.has(toolUseId)) return true;
    let changed = false;
    if (name === 'TaskCreate') {
      const content = typeof input.subject === 'string'
        ? input.subject
        : typeof input.description === 'string'
          ? input.description
          : '';
      if (!content) return false;
      const id = runtimeTaskIdFromCreate(input);
      const activeForm = typeof input.activeForm === 'string' ? input.activeForm : undefined;
      runtimeTasks.set(id, {
        id,
        content,
        status: normalizeTaskStatus(input.status),
        ...(activeForm ? { activeForm } : {}),
      });
      changed = true;
    } else if (name === 'TaskUpdate') {
      if (typeof input.taskId !== 'string') return false;
      const existing = runtimeTasks.get(input.taskId);
      if (!existing) return false;
      const content = typeof input.subject === 'string'
        ? input.subject
        : typeof input.description === 'string'
          ? input.description
          : existing.content;
      const activeForm = typeof input.activeForm === 'string' ? input.activeForm : existing.activeForm;
      runtimeTasks.set(input.taskId, {
        ...existing,
        content,
        status: normalizeTaskStatus(input.status),
        ...(activeForm ? { activeForm } : {}),
      });
      changed = true;
    } else {
      return false;
    }
    canonicalTaskToolUseIds.add(toolUseId);
    if (!changed || runtimeTasks.size === 0) return false;
    onEvent({
      type: 'tool_use',
      id: `${toolUseId}:todo-task`,
      name: 'TodoWrite',
      input: {
        todos: Array.from(runtimeTasks.values()).map(({ content, status, activeForm }) => ({
          content,
          status,
          ...(activeForm ? { activeForm } : {}),
        })),
      },
    });
    return true;
  }

  function emitToolUse(id: unknown, name: unknown, input: unknown): void {
    if (emitCanonicalTaskSnapshot(id, name, input)) return;
    if (isFileWriteToolUse(name, input)) {
      suppressNextArtifactText = true;
      const content = fileWriteContent(input);
      if (content) {
        wroteHtmlFileThisTurn = wroteHtmlFileThisTurn || isHtmlWriteToolInput(input);
        recentWriteContents.push(normalizeArtifactEchoContent(content));
        if (recentWriteContents.length > 5) recentWriteContents.shift();
      }
    }
    onEvent({
      type: 'tool_use',
      id,
      name,
      input,
    });
  }

  function blockKey(index: unknown): string {
    return `${currentMessageId ?? 'anon'}:${index}`;
  }

  // Per-message role-marker guard (#3247). Covers text_delta ONLY.
  //
  // Why not thinking_delta: extended thinking is rendered to a
  // separate `kind: 'thinking'` payload and is never folded into
  // `m.content` by `buildDaemonTranscript` (apps/web/src/providers/daemon.ts),
  // so it cannot be re-serialized as a turn boundary on the next
  // round-trip — it is not a #3247 re-injection vector. Models
  // routinely emit literal `## user` / `## assistant` lines in
  // chain-of-thought when reasoning about conversation structure,
  // and with kill-on-detection wired in server.ts a guard on the
  // thinking channel would abort otherwise-legitimate runs without
  // any compensating security benefit. See PR #3303 review
  // r3324xxxxxx. Thinking is passed through unguarded; only the
  // user-visible text channel is policed.
  function emitSafeText(msgId: string | null, text: string, eventType: string = 'text_delta') {
    if (eventType === 'text_delta') {
      text = stripDuplicateArtifactText(text);
      if (!text) return;
    }
    if (eventType !== 'text_delta' || !msgId) {
      onEvent({ type: eventType, delta: text });
      return;
    }
    let guard = roleGuards.get(msgId);
    if (!guard) {
      guard = createRoleMarkerGuard(msgId);
      roleGuards.set(msgId, guard);
    }
    if (guard.contaminated) return;

    const safe = guard.feedText(text);
    if (safe.length > 0) {
      onEvent({ type: eventType, delta: safe });
    }
    if (guard.contaminated) {
      const warn = guard.warningEvent();
      if (warn) onEvent(warn);
    }
  }

  function stripDuplicateArtifactText(text: string): string {
    if (
      !suppressNextArtifactText &&
      !suppressDuplicateArtifactText &&
      artifactOpenCandidate.length === 0 &&
      recentWriteContents.length === 0
    ) {
      return text;
    }
    const openTag = '<artifact';
    const current = `${artifactOpenCandidate}${text}`;
    artifactOpenCandidate = '';
    if (suppressDuplicateArtifactText) {
      duplicateArtifactCandidate += current;
      const closeIndex = duplicateArtifactCandidate.indexOf('</artifact>');
      if (closeIndex === -1) return '';
      const closeEnd = closeIndex + '</artifact>'.length;
      const candidate = duplicateArtifactCandidate.slice(0, closeEnd);
      const rest = duplicateArtifactCandidate.slice(closeEnd);
      duplicateArtifactCandidate = '';
      suppressDuplicateArtifactText = false;
      suppressNextArtifactText = false;
      const duplicate = isRedundantWrittenArtifact(candidate);
      if (options.suppressHtmlArtifactsAfterFileWrite !== true) {
        recentWriteContents.length = 0;
      }
      return `${duplicate ? '' : candidate}${stripDuplicateArtifactText(rest)}`;
    }
    const openIndex = current.indexOf(openTag);
    if (openIndex === -1) {
      const candidateLength = artifactOpenCandidateLength(current, openTag);
      if ((suppressNextArtifactText || recentWriteContents.length > 0) && candidateLength > 0) {
        artifactOpenCandidate = current.slice(-candidateLength);
        return current.slice(0, -candidateLength);
      }
      return current;
    }
    suppressDuplicateArtifactText = true;
    suppressNextArtifactText = false;
    duplicateArtifactCandidate = current.slice(openIndex);
    const prefix = `${pendingArtifactText}${current.slice(0, openIndex)}`;
    pendingArtifactText = '';
    return `${prefix}${stripDuplicateArtifactText('')}`;
  }

  function isRedundantWrittenArtifact(candidate: string): boolean {
    const gt = candidate.indexOf('>');
    const close = candidate.lastIndexOf('</artifact>');
    if (gt === -1 || close === -1 || close <= gt) return false;
    if (
      options.suppressHtmlArtifactsAfterFileWrite === true &&
      isHtmlArtifact(candidate) &&
      wroteHtmlFileThisTurn
    ) return true;
    const body = normalizeArtifactEchoContent(candidate.slice(gt + 1, close));
    return recentWriteContents.some((content) => content === body);
  }

  function isHtmlArtifact(candidate: string): boolean {
    const openTag = candidate.slice(0, Math.max(0, candidate.indexOf('>') + 1));
    return /\btype\s*=\s*["']text\/html["']/i.test(openTag);
  }

  function normalizeArtifactEchoContent(value: string): string {
    return value
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^(?:\s|\\r|\\n)+|(?:\s|\\r|\\n)+$/g, '');
  }

  function artifactOpenCandidateLength(text: string, openTag: string): number {
    const max = Math.min(openTag.length - 1, text.length);
    for (let len = max; len > 0; len -= 1) {
      if (openTag.startsWith(text.slice(-len))) return len;
    }
    return 0;
  }

  function isFileWriteToolUse(name: unknown, input: unknown): boolean {
    if (typeof name !== 'string' || !isRecord(input)) return false;
    const path = typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : '';
    const writesFile = name === 'Write' ||
      name === 'Edit' ||
      name === 'write_file' ||
      name === 'replace';
    if (!writesFile) return false;
    if (/\.(html|htm|css|js|jsx|ts|tsx|md)$/iu.test(path)) return true;
    return typeof input.content === 'string' || typeof input.new_string === 'string';
  }

  function fileWriteContent(input: unknown): string | null {
    if (!isRecord(input)) return null;
    if (typeof input.content === 'string') return input.content;
    if (typeof input.new_string === 'string') return input.new_string;
    return null;
  }

  function isHtmlWriteToolInput(input: unknown): boolean {
    if (!isRecord(input)) return false;
    const rawPath = input.file_path ?? input.filePath;
    if (typeof rawPath === 'string' && /\.(?:html?|xhtml)$/i.test(rawPath)) return true;
    const content = fileWriteContent(input);
    return typeof content === 'string' && /<!doctype\s+html\b|<html\b/i.test(content);
  }

  function feed(chunk: string) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        onEvent({ type: 'raw', line });
        continue;
      }
      handleObject(obj);
    }
  }

  function flush() {
    const rem = buffer.trim();
    buffer = '';
    if (rem) {
      try {
        handleObject(JSON.parse(rem));
      } catch {
        onEvent({ type: 'raw', line: rem });
      }
    }
    flushPendingArtifactText();
  }

  function handleObject(obj: unknown) {
    if (!isRecord(obj)) return;

    if (obj.type === 'system' && obj.subtype === 'init') {
      onEvent({
        type: 'status',
        label: 'initializing',
        model: obj.model ?? null,
        sessionId: obj.session_id ?? null,
      });
      return;
    }

    if (obj.type === 'system' && obj.subtype === 'status') {
      onEvent({ type: 'status', label: obj.status ?? 'working' });
      return;
    }

    if (obj.type === 'stream_event' && isRecord(obj.event)) {
      handleStreamEvent(obj.event);
      return;
    }

    // `assistant` messages are the "block finished" signal for the current
    // content block. For tool_use blocks whose input finished assembling,
    // emit tool_use now with the final parsed input. For text blocks, emit
    // the text as a single delta — but only if no streaming deltas already
    // covered it (older Claude Code without --include-partial-messages
    // delivers text only here; newer builds stream it and would duplicate).
    if (obj.type === 'assistant' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      const explicitMsgId = typeof obj.message.id === 'string' ? obj.message.id : null;
      const textMsgId = explicitMsgId ?? (currentMessageStreamedText ? currentMessageId : null);
      const thinkingMsgId = explicitMsgId ?? (currentMessageStreamedThinking ? currentMessageId : null);
      if (explicitMsgId) currentMessageId = explicitMsgId;
      const textAlreadyStreamed = textMsgId ? textStreamed.has(textMsgId) : false;
      const thinkingAlreadyStreamed = thinkingMsgId ? thinkingStreamed.has(thinkingMsgId) : false;
      // Per-turn `stop_reason` is emitted as `turn_end` AFTER the content
      // blocks have been processed (see below). When `--include-partial-
      // messages` is unsupported, tool_use events surface only from the
      // assistant wrapper here — emitting `turn_end` before that loop would
      // let the daemon's stdin-close handler act on the turn before its
      // tool_use blocks were seen, closing stdin mid-tool. Read the
      // stop_reason now, emit after.
      const stopReason = typeof obj.message.stop_reason === 'string'
        ? obj.message.stop_reason
        : null;
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_use') {
          if (typeof block.id === 'string' && streamedToolUseIds.has(block.id)) {
            streamedToolUseIds.delete(block.id);
            continue;
          }
          emitToolUse(block.id, block.name, block.input ?? null);
        } else if (
          !textAlreadyStreamed &&
          block.type === 'text' &&
          typeof block.text === 'string' &&
          block.text.length > 0
        ) {
          emitSafeText(textMsgId, block.text);
        } else if (
          !thinkingAlreadyStreamed &&
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking.length > 0
        ) {
          emitSafeText(thinkingMsgId, block.thinking, 'thinking_delta');
        }
      }
      // Surface the turn_end signal now that every tool_use in this
      // assistant message has been emitted, so the daemon's stdin-close
      // handler sees the final `stop_reason` before deciding whether to
      // close stream-json input stdin.
      if (stopReason) {
        onEvent({ type: 'turn_end', stopReason });
        if (stopReason !== 'tool_use') {
          recentWriteContents.length = 0;
          wroteHtmlFileThisTurn = false;
        }
      }
      if (typeof obj.error === 'string' && obj.error.trim()) {
        onEvent({
          type: 'error',
          message: assistantText(obj.message.content) || obj.error,
          code: obj.error,
        });
      }
      currentMessageStreamedText = false;
      currentMessageStreamedThinking = false;
      return;
    }

    // `user` messages in a stream-json transcript are usually tool_result
    // wrappers from prior turns.
    if (obj.type === 'user' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_result') {
          onEvent({
            type: 'tool_result',
            toolUseId: block.tool_use_id,
            content: stringifyToolResult(block.content),
            isError: Boolean(block.is_error),
          });
        }
      }
      return;
    }

    if (obj.type === 'result') {
      onEvent({
        type: 'usage',
        usage: obj.usage ?? null,
        costUsd: obj.total_cost_usd ?? null,
        durationMs: obj.duration_ms ?? null,
        stopReason: obj.stop_reason ?? null,
      });
      return;
    }
  }

  function assistantText(content: unknown[]): string {
    const parts: string[] = [];
    for (const block of content) {
      if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('\n').trim();
  }

  function handleStreamEvent(ev: Record<string, unknown>) {
    if (ev.type === 'message_start') {
      flushPendingArtifactText();
      // Clean up per-message role-marker guard from the previous message.
      if (currentMessageId) roleGuards.delete(currentMessageId);
      currentMessageId = isRecord(ev.message) && typeof ev.message.id === 'string' ? ev.message.id : null;
      currentMessageStreamedText = false;
      currentMessageStreamedThinking = false;
      if (typeof ev.ttft_ms === 'number') {
        onEvent({ type: 'status', label: 'streaming', ttftMs: ev.ttft_ms });
      }
      return;
    }

    if (ev.type === 'content_block_start' && isRecord(ev.content_block)) {
      const key = blockKey(ev.index);
      const block = ev.content_block;
      blocks.set(key, {
        type: block.type,
        name: block.name,
        id: block.id,
        input: '',
        inputValue: 'input' in block ? block.input : undefined,
      });
      if (block.type === 'thinking') {
        onEvent({ type: 'thinking_start' });
      }
      return;
    }

    if (ev.type === 'content_block_delta' && isRecord(ev.delta)) {
      const state = blocks.get(blockKey(ev.index));
      const delta = ev.delta;

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        if (currentMessageId) textStreamed.add(currentMessageId);
        currentMessageStreamedText = true;
        emitSafeText(currentMessageId, delta.text);
        return;
      }
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        if (currentMessageId) thinkingStreamed.add(currentMessageId);
        currentMessageStreamedThinking = true;
        emitSafeText(currentMessageId, delta.thinking, 'thinking_delta');
        return;
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        if (state && state.type === 'tool_use') {
          state.input += delta.partial_json;
          if (typeof state.id === 'string' && typeof state.name === 'string') {
            onEvent({
              type: 'tool_input_delta',
              id: state.id,
              name: state.name,
              delta: delta.partial_json,
            });
          }
        }
        return;
      }
    }

    if (ev.type === 'content_block_stop') {
      const key = blockKey(ev.index);
      const state = blocks.get(key);
      if (state && state.type === 'tool_use' && typeof state.id === 'string' && state.input.trim()) {
        try {
          emitToolUse(state.id, state.name, JSON.parse(state.input));
          streamedToolUseIds.add(state.id);
        } catch {
          // Fall through to the final assistant wrapper's input if the
          // streamed JSON is malformed or incomplete.
        }
      } else if (
        state &&
        state.type === 'tool_use' &&
        typeof state.id === 'string' &&
        state.inputValue !== undefined
      ) {
        emitToolUse(state.id, state.name, state.inputValue);
        streamedToolUseIds.add(state.id);
      }
      blocks.delete(key);
      return;
    }
  }

  function flushPendingArtifactText() {
    const text = `${pendingArtifactText}${artifactOpenCandidate}${duplicateArtifactCandidate}`;
    if (!text) return;
    pendingArtifactText = '';
    artifactOpenCandidate = '';
    duplicateArtifactCandidate = '';
    suppressNextArtifactText = false;
    suppressDuplicateArtifactText = false;
    recentWriteContents.length = 0;
    wroteHtmlFileThisTurn = false;
    emitSafeText(currentMessageId, text);
  }

  return { feed, flush };
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (isRecord(c) && c.type === 'text' ? String(c.text) : JSON.stringify(c)))
      .join('\n');
  }
  return JSON.stringify(content);
}
