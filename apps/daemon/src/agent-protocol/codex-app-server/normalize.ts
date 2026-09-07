/** @module agent-protocol/codex-app-server/normalize
 *
 * Translates codex `app-server` JSON-RPC notifications into the OpenDesign
 * agent-event stream.
 *
 * The design rule here is "one mapping, not two". Everything the daemon already
 * knows how to render from a codex turn — command execution, file changes, MCP
 * calls, web search, todo snapshots, in-stream warnings, fatal errors — is
 * translated back into the `exec --json` FRAME shape and routed through the
 * shipping codex branch of `json-event-stream.ts` (`createCodexFrameHandler`).
 * A second hand-written copy of those ~275 lines would drift from the original
 * the first time either side is touched; going through the original makes
 * transport parity a property of the code rather than a claim in a PR body.
 *
 * "Same frame shape" is not "same information". Where this wire carries MORE
 * than `exec --json` ever did, the extra field rides along on the synthesized
 * frame and the codex branch decides what to do with it — a file change's
 * `diff` is the one such field today (`FileUpdateChange.diff`, required here,
 * absent there). Dropping it to keep the frame narrow is what made codex file
 * rows show elapsed time where Claude's showed `+N −M`.
 *
 * Exactly four things cannot round-trip through an `exec --json` frame,
 * because that stream has no shape for them, and are therefore owned here:
 *
 *   - assistant text deltas (`item/agentMessage/delta`)
 *   - reasoning summary deltas (`item/reasoning/summaryTextDelta`)
 *   - raw reasoning deltas (`item/reasoning/textDelta`), used by local models
 *   - token usage (`thread/tokenUsage/updated` carries two counters the
 *     `exec --json` parser has never read)
 *
 * Unknown methods, unknown item types, and unknown extra fields are ignored
 * rather than raised: the app-server protocol ships no version negotiation and
 * no changelog, so a codex upgrade that adds a notification must degrade to
 * "we render one thing less", never to "the run fails".
 */
import { createCodexFrameHandler } from '../../runtimes/json-event-stream.js';

type JsonObject = Record<string, unknown>;
type AgentEvent = Record<string, unknown>;
export type CodexAppServerEventHandler = (event: AgentEvent) => void;

function isRecord(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Item lifecycle status is passed through verbatim on purpose.
 *
 * `exec --json` spells the in-flight state `in_progress` and app-server spells
 * it `inProgress`, but the codex branch only ever compares status to `failed` —
 * which both wires spell identically — so a camelCase-to-snake_case rewrite
 * here would be code no test could distinguish. If that branch ever starts
 * reading the in-flight spelling, add the mapping together with the assertion
 * that needs it.
 */

/**
 * app-server models a patch kind as a tagged object (`{"type":"update",
 * "move_path":null}`); `exec --json` uses the bare tag string. Anything without
 * a readable tag stays unnamed, which makes `codexFileChanges` reject the whole
 * item — the same conservative behaviour `exec --json` has for an unknown kind.
 */
function execPatchKind(kind: unknown): string {
  if (typeof kind === 'string') return kind;
  return isRecord(kind) ? str(kind.type) : '';
}

/** Item types whose `exec --json` branch ends an assistant-message run. */
const BOUNDARY_CLEARING_ITEM_TYPES = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'web_search',
  'todo_list',
]);

/**
 * Convert one app-server `ThreadItem` into the `exec --json` item shape, or
 * null when this module has no honest translation for it.
 *
 * `agentMessage` and `reasoning` deliberately return null: their text is
 * delta-driven and owned by the normalizer directly.
 */
function toExecItem(item: JsonObject): JsonObject | null {
  const id = str(item.id);
  switch (item.type) {
    case 'commandExecution':
      if (!id) return null;
      return {
        id,
        type: 'command_execution',
        command: str(item.command),
        aggregated_output: str(item.aggregatedOutput),
        exit_code: num(item.exitCode) ?? null,
        status: str(item.status),
      };
    case 'fileChange': {
      if (!id || !Array.isArray(item.changes)) return null;
      return {
        id,
        type: 'file_change',
        changes: item.changes.map((change) =>
          isRecord(change)
            ? {
                path: str(change.path),
                kind: execPatchKind(change.kind),
                // `diff` is app-server-only and REQUIRED there (`FileUpdateChange`
                // in codex's generated protocol, 0.151.0); `exec --json` has no
                // such field. Forwarding it is what lets the codex branch report
                // `+N −M` instead of an elapsed time, and forwarding it only when
                // present keeps the synthesized frame identical to the exec wire
                // on the rollback transport. The frame is transient — the branch
                // counts the lines and drops the patch, so nothing this large
                // reaches the event stream or the message store.
                ...(typeof change.diff === 'string' && change.diff.length > 0
                  ? { diff: change.diff }
                  : {}),
              }
            : {},
        ),
        status: str(item.status),
      };
    }
    case 'mcpToolCall':
      if (!id) return null;
      return {
        id,
        type: 'mcp_tool_call',
        server: str(item.server),
        tool: str(item.tool),
        arguments: isRecord(item.arguments) ? item.arguments : {},
        result: item.result ?? null,
        error: isRecord(item.error) ? item.error : null,
        status: str(item.status),
      };
    case 'webSearch':
      if (!id) return null;
      return {
        id,
        type: 'web_search',
        query: str(item.query),
        action: isRecord(item.action) ? item.action : null,
      };
    default:
      return null;
  }
}

export interface CodexAppServerNormalizer {
  /** Route one server-to-client notification. Never throws on bad input. */
  handleNotification(method: string, params: unknown): void;
  /** Counters for notifications/items this build had no mapping for. */
  stats(): { unknownNotifications: number; unknownItems: number };
}

export function createCodexAppServerNormalizer(
  onEvent: CodexAppServerEventHandler,
): CodexAppServerNormalizer {
  let emittedCount = 0;
  const emit = (event: AgentEvent) => {
    emittedCount += 1;
    onEvent(event);
  };
  const codex = createCodexFrameHandler(emit);

  let unknownNotifications = 0;
  let unknownItems = 0;
  let planFrameSeq = 0;
  let warningSeq = 0;
  // High-water mark for the live thinking-token reading; see emitThinkingTokens.
  let highestReasoningTokens = 0;

  // Assistant-message continuity, mirroring the `exec --json` rule: two
  // consecutive assistant messages are separated by a newline, but a tool call
  // between them ends the run and the separator is dropped.
  const messageEmittedChars = new Map<string, number>();
  let previousEventWasMessage = false;
  let lastMessageEndedWithNewline = false;

  // Accumulated reasoning summary per item, indexed by summary part, so the
  // shipping `emitCodexReasoningItem` can do the suffix diffing and the
  // cross-item blank-line join exactly as it does for `exec --json`.
  const reasoningParts = new Map<string, string[]>();
  // Local OSS models may put their reasoning in `content` instead of summary.
  // Keep it under a derived parser item id so a model that emits both forms
  // shows both without one stream's length-based dedupe truncating the other.
  const reasoningContentParts = new Map<string, string[]>();

  /** Route a synthesized `exec --json` frame; report whether it emitted. */
  function routeFrame(frame: JsonObject): boolean {
    const before = emittedCount;
    const consumed = codex.handleFrame(frame);
    return consumed && emittedCount > before;
  }

  function emitMessageText(itemId: string, text: string): void {
    if (!text) return;
    const alreadyEmitted = messageEmittedChars.get(itemId) ?? 0;
    const needsBoundary =
      alreadyEmitted === 0 &&
      previousEventWasMessage &&
      !lastMessageEndedWithNewline &&
      !text.startsWith('\n');
    emit({ type: 'text_delta', delta: needsBoundary ? `\n${text}` : text });
    messageEmittedChars.set(itemId, alreadyEmitted + text.length);
    previousEventWasMessage = true;
    lastMessageEndedWithNewline = text.endsWith('\n');
  }

  function handleAgentMessageDelta(params: JsonObject): void {
    emitMessageText(str(params.itemId), str(params.delta));
  }

  function handleAgentMessageCompleted(item: JsonObject): void {
    const itemId = str(item.id);
    const full = str(item.text);
    const alreadyEmitted = messageEmittedChars.get(itemId) ?? 0;
    if (full.length > alreadyEmitted) {
      emitMessageText(itemId, full.slice(alreadyEmitted));
      return;
    }
    // Nothing new to render, but the message still ended an assistant run.
    if (full.length > 0) {
      previousEventWasMessage = true;
      lastMessageEndedWithNewline = full.endsWith('\n');
    }
  }

  /** Push the accumulated summary of one reasoning item through the parser. */
  function flushReasoning(itemId: string): void {
    if (!itemId) return;
    const parts = reasoningParts.get(itemId) ?? [];
    const text = parts.join('\n');
    if (!text) return;
    codex.handleFrame({
      type: 'item.updated',
      item: { id: itemId, type: 'reasoning', text },
    });
  }

  function handleReasoningDelta(params: JsonObject): void {
    const itemId = str(params.itemId);
    if (!itemId) return;
    const index = num(params.summaryIndex) ?? 0;
    const parts = reasoningParts.get(itemId) ?? [];
    while (parts.length <= index) parts.push('');
    parts[index] = `${parts[index] ?? ''}${str(params.delta)}`;
    reasoningParts.set(itemId, parts);
    flushReasoning(itemId);
  }

  function handleReasoningPartAdded(params: JsonObject): void {
    const itemId = str(params.itemId);
    if (!itemId) return;
    const index = num(params.summaryIndex) ?? 0;
    const parts = reasoningParts.get(itemId) ?? [];
    while (parts.length <= index) parts.push('');
    reasoningParts.set(itemId, parts);
  }

  /** Push raw reasoning content through the same suffix/boundary logic. */
  function flushReasoningContent(itemId: string): void {
    if (!itemId) return;
    const parts = reasoningContentParts.get(itemId) ?? [];
    const text = parts.join('\n');
    if (!text) return;
    codex.handleFrame({
      type: 'item.updated',
      item: { id: `${itemId}:content`, type: 'reasoning', text },
    });
  }

  function handleReasoningTextDelta(params: JsonObject): void {
    const itemId = str(params.itemId);
    if (!itemId) return;
    const index = num(params.contentIndex) ?? 0;
    const parts = reasoningContentParts.get(itemId) ?? [];
    while (parts.length <= index) parts.push('');
    parts[index] = `${parts[index] ?? ''}${str(params.delta)}`;
    reasoningContentParts.set(itemId, parts);
    flushReasoningContent(itemId);
  }

  function handleReasoningCompleted(item: JsonObject): void {
    const itemId = str(item.id);
    if (!itemId) return;
    const summary = Array.isArray(item.summary) ? item.summary.map(str) : [];
    const existing = reasoningParts.get(itemId) ?? [];
    // The completed item is authoritative only when it is longer than what the
    // deltas already produced; a shorter replay must not rewind the stream.
    if (summary.join('\n').length >= existing.join('\n').length) {
      reasoningParts.set(itemId, summary);
    }
    flushReasoning(itemId);

    const content = Array.isArray(item.content) ? item.content.map(str) : [];
    const existingContent = reasoningContentParts.get(itemId) ?? [];
    if (content.join('\n').length >= existingContent.join('\n').length) {
      reasoningContentParts.set(itemId, content);
    }
    flushReasoningContent(itemId);
  }

  function handleItem(params: JsonObject, lifecycle: 'item.started' | 'item.completed'): void {
    const item = isRecord(params.item) ? params.item : null;
    if (!item) return;
    if (item.type === 'agentMessage') {
      if (lifecycle === 'item.completed') handleAgentMessageCompleted(item);
      return;
    }
    if (item.type === 'reasoning') {
      if (lifecycle === 'item.completed') handleReasoningCompleted(item);
      return;
    }
    const execItem = toExecItem(item);
    if (!execItem) {
      unknownItems += 1;
      return;
    }
    const emittedSomething = routeFrame({ type: lifecycle, item: execItem });
    if (emittedSomething && BOUNDARY_CLEARING_ITEM_TYPES.has(str(execItem.type))) {
      previousEventWasMessage = false;
      lastMessageEndedWithNewline = false;
    }
  }

  function handleTokenUsage(params: JsonObject): void {
    const tokenUsage = isRecord(params.tokenUsage) ? params.tokenUsage : null;
    // `total` is the thread-cumulative counter, which is the same semantics
    // `exec --json` reports at `turn.completed` (codex's stream usage has
    // always been cumulative). `last` is per-turn and deliberately unused so a
    // resumed thread keeps reporting the same number the exec path would.
    const total = tokenUsage && isRecord(tokenUsage.total) ? tokenUsage.total : null;
    if (!total) return;
    const usage: Record<string, number> = {};
    const input = num(total.inputTokens);
    const output = num(total.outputTokens);
    const reasoning = num(total.reasoningOutputTokens);
    const cachedRead = num(total.cachedInputTokens);
    const cacheWrite = num(total.cacheWriteInputTokens);
    const totalTokens = num(total.totalTokens);
    if (input !== undefined) usage.input_tokens = input;
    if (output !== undefined) usage.output_tokens = output;
    if (reasoning !== undefined) usage.thought_tokens = reasoning;
    if (cachedRead !== undefined) usage.cached_read_tokens = cachedRead;
    // Codex has always reported cache writes; `exec --json`'s parser simply
    // never read the field. Reporting it here is a strict superset, so the
    // parity comparison holds on every counter the exec path does emit.
    if (cacheWrite !== undefined) usage.cached_write_tokens = cacheWrite;
    if (totalTokens !== undefined) usage.total_tokens = totalTokens;
    if (Object.keys(usage).length === 0) return;
    emit({ type: 'usage', usage });
    emitThinkingTokens(reasoning);
  }

  /**
   * The live 「思考中」 reading, from the same notification the billing counters
   * ride on.
   *
   * codex encrypts its reasoning content, so the shell can never show the words
   * — but the COUNT is in the clear and arrives throughout the turn, which is
   * exactly the progress signal claude's `thinking_tokens` frame supplies on
   * its own wire. Emitting the same event here is what puts codex on the slot
   * `ExecutionShell` already renders; nothing downstream needed a new shape.
   *
   * `total.reasoningOutputTokens` is the thread-cumulative counter and the only
   * honest source. Its sibling `last` is per upstream CALL, not per turn: in one
   * recorded turn (codex-cli 0.153.0, 2026-09-04) it read
   * 28, 15, 0, 14, 8, 62, 0, 0 while `total` read 28, 43, 43, 57, 65, 127, 127,
   * 127. A slot fed from `last` would count down mid-thought.
   *
   * The high-water clamp below is belt-and-braces on top of that: codex's own
   * counter has never been observed to retreat, but this reading is a number
   * the user watches climb, and a single rewind reads as a bug in the software
   * rather than in the wire. Zero is withheld rather than emitted — it is the
   * absence of a progress signal, not a progress signal worth a row.
   */
  function emitThinkingTokens(reasoningTokens: number | undefined): void {
    if (reasoningTokens === undefined || reasoningTokens <= 0) return;
    if (reasoningTokens <= highestReasoningTokens) return;
    highestReasoningTokens = reasoningTokens;
    emit({ type: 'thinking_tokens', tokens: reasoningTokens });
  }

  function handleTurnPlan(params: JsonObject): void {
    if (!Array.isArray(params.plan)) return;
    planFrameSeq += 1;
    const items = params.plan
      .filter(isRecord)
      .map((step) => ({ text: str(step.step), status: str(step.status) }));
    if (items.length === 0) return;
    const emitted = routeFrame({
      type: 'item.updated',
      item: { id: `turn_plan_${planFrameSeq}`, type: 'todo_list', items },
    });
    if (emitted) {
      previousEventWasMessage = false;
      lastMessageEndedWithNewline = false;
    }
  }

  function handleError(params: JsonObject): void {
    const error = isRecord(params.error) ? params.error : null;
    const message = str(error?.message) || 'Codex error';
    // `willRetry` is codex's own statement that the turn is still alive. A
    // retrying frame is a status pill, not a run failure — surfacing it as an
    // error would fail runs that go on to succeed.
    if (params.willRetry === true) {
      emit({ type: 'status', label: message });
      return;
    }
    routeFrame({ type: 'error', message });
  }

  function handleTurnCompleted(params: JsonObject): void {
    const turn = isRecord(params.turn) ? params.turn : null;
    if (!turn || turn.status !== 'failed') return;
    const error = isRecord(turn.error) ? turn.error : null;
    routeFrame({ type: 'turn.failed', error: { message: str(error?.message) } });
  }

  function handleWarning(params: JsonObject): void {
    const message = str(params.message);
    if (!message) return;
    warningSeq += 1;
    // `exec --json` delivers the same notice as an in-stream `error` ITEM,
    // which the codex branch renders as a warning pill.
    codex.handleFrame({
      type: 'item.completed',
      item: { id: `warning_${warningSeq}`, type: 'error', message },
    });
  }

  return {
    handleNotification(method: string, rawParams: unknown): void {
      const params = isRecord(rawParams) ? rawParams : {};
      switch (method) {
        case 'thread/started': {
          const thread = isRecord(params.thread) ? params.thread : null;
          const threadId = str(thread?.id);
          if (!threadId) return;
          routeFrame({ type: 'thread.started', thread_id: threadId });
          return;
        }
        case 'turn/started':
          previousEventWasMessage = false;
          lastMessageEndedWithNewline = false;
          routeFrame({ type: 'turn.started' });
          return;
        case 'item/started':
          handleItem(params, 'item.started');
          return;
        case 'item/completed':
          handleItem(params, 'item.completed');
          return;
        case 'item/agentMessage/delta':
          handleAgentMessageDelta(params);
          return;
        case 'item/reasoning/summaryTextDelta':
          handleReasoningDelta(params);
          return;
        case 'item/reasoning/summaryPartAdded':
          handleReasoningPartAdded(params);
          return;
        case 'item/reasoning/textDelta':
          handleReasoningTextDelta(params);
          return;
        case 'thread/tokenUsage/updated':
          handleTokenUsage(params);
          return;
        case 'turn/plan/updated':
          handleTurnPlan(params);
          return;
        case 'turn/completed':
          handleTurnCompleted(params);
          return;
        case 'error':
          handleError(params);
          return;
        case 'warning':
          handleWarning(params);
          return;
        default:
          unknownNotifications += 1;
      }
    },
    stats() {
      return { unknownNotifications, unknownItems };
    },
  };
}
