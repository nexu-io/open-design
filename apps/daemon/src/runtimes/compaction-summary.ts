// Manual context compaction (#5991) — summary prompt builder.
//
// The summary run is a self-contained, zero-quota internal turn: it never
// becomes a chat message, never registers artifacts, and its prompt must
// carry everything the summarizer needs (the API-mode runtimes re-send the
// full transcript every turn, so nothing else is available in context).
//
// Deliberately no new *system* prompt text lands in this path: the packed
// transcript keeps `## compact checkpoint` as its only new heading
// (mirroring the `## context warning` precedent), and this user-request
// prompt is consumed once by the summarizer, never by the design agent.

export interface CompactionSummaryPromptInput {
  /** Rendered `## role` transcript of the span being compacted. */
  transcript: string;
  /**
   * Machine-washed workspace ledger rendered as lines
   * (`- <identifier>: <description>`). The summarizer must trust these
   * over its own reading of the transcript.
   */
  ledgerLines: readonly string[];
}

/**
 * Builds the one-shot user request for the compaction summary run.
 * The model is instructed to emit nothing but the summary text, which is
 * stored verbatim as the checkpoint's `summaryText`.
 */
export function buildCompactionSummaryPrompt(input: CompactionSummaryPromptInput): string {
  const ledgerBlock =
    input.ledgerLines.length > 0
      ? `\n\n## Workspace ledger (machine-extracted; trust it over the transcript)\n${input.ledgerLines.join('\n')}`
      : '';
  return [
    'You are compacting an OpenDesign conversation so the next turn can continue without the full history.',
    'Write a single markdown summary of the conversation transcript below. Rules:',
    '- Preserve every design decision, user requirement, constraint, file/artifact path and unresolved question; drop greetings, retries, errors and dead ends.',
    '- Fold the workspace ledger entries into the summary verbatim (identifiers and file names exactly as listed).',
    '- Do not ask questions, do not add commentary, and do not output anything except the summary.',
    '',
    '## Full conversation transcript',
    input.transcript,
    ledgerBlock,
  ].join('\n');
}

/**
 * A message row as produced by `listMessages` / `normalizeMessage`. Only the
 * fields the transcript renderer needs are required; the shapes of the rich
 * fields (`producedFiles`, `artifactRefs`, …) are handled by the ledger
 * collector, never by this renderer.
 */
export interface CompactionTranscriptMessage {
  role?: unknown;
  content?: unknown;
}

/**
 * Renders a chronological message span as `## role` blocks for the summary
 * prompt. Messages without a usable role or without text content are skipped
 * (they carry no information the summarizer can read), and trailing
 * whitespace-only lines are collapsed so the packed transcript stays as
 * small as the model actually benefits from.
 */
export function renderCompactionSpanTranscript(
  messages: readonly CompactionTranscriptMessage[],
): string {
  const blocks: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const role = typeof message.role === 'string' ? message.role.trim() : '';
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!role || !content) continue;
    blocks.push(`## ${role}\n${content}`);
  }
  return blocks.join('\n\n');
}

/**
 * Extracts the summarizer's final answer from a terminal run's in-memory
 * event ring. The summary run persists no assistant message
 * (`assistantMessageId` unset), so the text must be recovered from events —
 * the same source Orbit uses for its no-artifact explanation. Both the
 * structured `text_delta` shape (Claude/Codex/Gemini/ACP/… streams) and the
 * plain `text` shape (legacy runtimes) are accepted.
 */
export function extractCompactionSummaryText(
  events: readonly unknown[],
): string | null {
  let text = '';
  for (const record of events) {
    if (!record || typeof record !== 'object') continue;
    const { event, data } = record as { event?: unknown; data?: unknown };
    if (data && typeof data === 'object') {
      const { type, delta, text: chunk, chunk: stdoutChunk } = data as {
        type?: unknown;
        delta?: unknown;
        text?: unknown;
        chunk?: unknown;
      };
      // Structured agents (Claude/Codex/ACP) report user-visible text as
      // `agent` text_delta; the plain/BYOK/antigravity family reports it as
      // raw `stdout` chunks. A compaction summary round runs on antigravity,
      // so the stdout channel is the primary source.
      if (event === 'agent' && type === 'text_delta' && typeof delta === 'string') {
        text += delta;
      } else if (event === 'agent' && type === 'text' && typeof chunk === 'string') {
        text += chunk;
      } else if (event === 'stdout' && typeof stdoutChunk === 'string') {
        text += stdoutChunk;
      }
    }
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}