export * from "../../../types";
import type { ChatMessage as ExistingChatMessage } from "../../../types";
import type { RunFailureCategory, RunFailureDetail, RunFailureAction } from "@open-design/contracts";
export type PersistedAgentEvent =
  // `code` carries the structured API error code for `label: 'error'`
  // status events (e.g. AGENT_AUTH_REQUIRED, RATE_LIMITED). Clients use it to
  // decide error-specific affordances such as the hosted-AMR nudge.
  // `failureCategory` / `failureDetail` carry the daemon's finer classification
  // for the same failure, so the error card can name a specific type + fix even
  // when many causes share one `code` (e.g. hard_quota vs a transient 429).
  // `retryable` / `failureAction` carry the daemon's VERDICT on that same
  // failure — whether re-running can help, and what the user should do instead.
  // The card reads them off this persisted event, so a reloaded conversation
  // resolves to the same button the live stream did. Both absent on events
  // written before they existed; see the note on `ChatRunStatusResponse` for why
  // absence must not be read as `retryable: false`.
  | {
      kind: 'status';
      label: string;
      detail?: string;
      code?: string;
      failureCategory?: RunFailureCategory;
      failureDetail?: RunFailureDetail;
      failureAction?: RunFailureAction;
      retryable?: boolean;
      /**
       * `label: 'error'` only. Bounded, secret-redacted tail of the agent
       * process's stderr for this run — the original cause behind a generic
       * `detail`. Kept separate from `detail` on purpose: `detail` is the
       * string the failure classifiers pattern-match on, so mixing raw agent
       * output into it would change which card a failure resolves to.
       * Absent when the run wrote no stderr.
       */
      stderrTail?: string;
      /**
       * `code: 'AMR_INSUFFICIENT_BALANCE'` only. The USD wallet balance read
       * for the turn this error ended — **the reading, archived**, not a live
       * quote.
       *
       * The upgrade card under a turn that died on money is that turn's
       * evidence, not a balance widget (T61, product 2026-09-07: 「它就好像
       * 历史记录一样,存档在当时状态了」). The failure itself carries no
       * balance — the daemon's `classifyAmrAccountFailure` yields only an error
       * code — so the client reads the wallet once when the turn stops and
       * writes the number down HERE. Without that, every reload re-quotes the
       * wallet and the card ends up pairing today's number with the sentence
       * that explained a failure days ago: after a top-up the turn that ran out
       * of credit reads 「剩余额度 $20.00」, which is worse than showing nothing.
       *
       * Stamped once and never re-read; a turn recorded before this field
       * existed simply has none, and its card falls back to a live read.
       * Absent on every other failure — no other card names a balance.
       */
      amrBalanceUsd?: number;
    }
  | { kind: 'text'; text: string }
  /**
   * This turn's one-time done key. The daemon mints it per run, injects it into
   * the system prompt, and emits this event BEFORE any model output; the chat
   * client then only accepts `<od-done key="…"/>` markers carrying this exact
   * value as the process/conclusion boundary.
   *
   * It exists because the boundary used to be a bare `<done/>` that no prompt
   * ever taught — so any turn whose content happened to contain that string
   * (agent quoting HTML, explaining the tag) flipped the boundary and threw the
   * rest of the answer out of the execution shell. A model cannot reproduce a
   * nonce it was never shown, which is what makes the keyed form unforgeable.
   *
   * Persisted with the turn's other events so a reloaded conversation validates
   * against the same key it was recorded with. Messages from before this event
   * existed simply have none — clients MUST fall back to the legacy bare-marker
   * heuristic there rather than treating "no key" as "no boundary".
   */
  | { kind: 'done_key'; key: string }
  /**
   * This turn's follow-up suggestions — the three one-line actions the chat
   * offers under a delivered answer. Parsed by the daemon out of the agent's
   * `<od-next key="…">` marker and validated against the turn's nonce, so the
   * client stores conclusions, never raw protocol.
   *
   * Persisted with the turn's other events so a reloaded conversation shows
   * the same three rows it showed live. Turns recorded before this event
   * existed have none, and MUST render no next-step row at all — there is no
   * legacy fallback, because the suggestions are about the specific thing that
   * turn built and cannot be reconstructed after the fact.
   */
  | { kind: 'next_steps'; suggestions: string[] }
  /**
   * This turn's display intent — which file the preview opened and which
   * produced files earned a card. Parsed by the daemon out of the agent's
   * `<od-focus …/>` marker, key-checked against the turn nonce, and resolved to
   * project-relative paths inside the project root, so the client stores
   * conclusions and never raw protocol.
   *
   * Persisted with the turn's other events so a reloaded conversation shows the
   * same card set it showed live. Turns recorded before this event existed have
   * none, and MUST fall back to the host's own produced-file inference —
   * unlike `next_steps`, "no event" here has a well-defined legacy meaning and
   * rendering nothing would blank a panel that used to work.
   *
   * More than one may be persisted for a turn; fold last-wins per field with
   * `foldArtifactFocusSelections`.
   */
  | { kind: 'artifact_focus'; open?: string; show?: string[] }
  | { kind: 'conversation_title'; title: string }
  | { kind: 'thinking'; text: string }
  /**
   * Live-only reasoning progress: the cumulative token estimate for the
   * thinking block currently running. See the `thinking_tokens` SSE event for
   * where the number comes from, why it is cumulative rather than a delta, and
   * why it is an estimate rather than the bill.
   *
   * **Never persisted**, so this never appears in a stored transcript — the
   * union is shared with the live path, which is the only producer.
   *
   * `at` is the **client's** arrival time, not the daemon's. The only consumer
   * compares it against the chat panel's own `nowMs` to decide whether the
   * count is still moving, and those two clocks have to be the same clock —
   * same reason `BuildTurnInput.lastEventAtMs` is observed rather than
   * transported.
   */
  | { kind: 'thinking_tokens'; tokens: number; at?: number }
  | {
      kind: 'live_artifact';
      action: 'created' | 'updated' | 'deleted';
      projectId: string;
      artifactId: string;
      title: string;
      refreshStatus?: string;
    }
  | {
      kind: 'live_artifact_refresh';
      phase: 'started' | 'succeeded' | 'failed';
      projectId: string;
      artifactId: string;
      refreshId?: string;
      title?: string;
      refreshedSourceCount?: number;
      error?: string;
    }
  | {
      kind: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      /** Optional wall-clock ms when the tool first started (e.g. ACP first frame). */
      startedAt?: number;
    }
  | {
      kind: 'tool_result';
      toolUseId: string;
      content: string;
      isError: boolean;
      /**
       * Wall-clock ms when the call finished. Pairs with `tool_use.startedAt` so the
       * UI can show a per-call duration. Optional on purpose: several adapters emit
       * `tool_use` only once the call has already completed (codex sends it at
       * `item.completed`), so a difference computed there would be ~0 — which means
       * "unknown", not "fast". Consumers must render nothing when either end is
       * missing rather than showing `0.0s`.
       */
      completedAt?: number;
    }
  | {
      kind: 'diagnostic';
      name: string;
      source?: string;
      elapsedMs?: number;
      reason?: string;
      suppressedChars?: number;
      suppressedChunks?: number;
      openedBlocks?: number;
      closedBlocks?: number;
      fileCount?: number;
      files?: string[];
      pendingCandidateChars?: number;
      suppressing?: boolean;
      shape?: Record<string, unknown>;
    }
  | {
      kind: 'plugin_candidate';
      candidateId: string;
      title: string;
      description?: string;
      confidence?: number;
      draftPath?: string | null;
    }
  | {
      kind: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      durationMs?: number;
      /** Terminal turn stop reason (e.g. `max_tokens`). Persisted so the project
       *  projection can read a truncation as incomplete after reload (#1247). */
      stopReason?: string;
    }
  | { kind: 'raw'; line: string };
export type AgentEvent = PersistedAgentEvent;
export interface ChatMessage extends Omit<ExistingChatMessage,"events"> {
 events?: AgentEvent[];
strategyTaskExecutionId?: string;
strategyTaskRunIndex?: number;
strategyTaskPrefixLength?: number;
strategyTaskPrefixEventCount?: number;
strategyTaskBlocked?: boolean;
strategyTaskBlockedText?: string | null;
strategyTaskDelivered?: boolean;
sendFailed?: boolean;
forkedInto?: {
    /** 新会话的标题(认领的就是老会话的题目) */
    title: string;
    /** 新会话 id —— 之后要跳过去看靠它 */
    conversationId?: string;
  };
}

/** Pass only fields understood by the unchanged host's event consumers. */
export function toHostMessage(message: ChatMessage): ExistingChatMessage {
  return {...message, events: message.events?.filter((event): event is import('../../../types').AgentEvent =>
    event.kind !== 'done_key' && event.kind !== 'next_steps' && event.kind !== 'artifact_focus' && event.kind !== 'thinking_tokens')};
}
