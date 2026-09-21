/**
 * The transcript a chat turn hands to a local CLI agent.
 *
 * Local CLIs are single-turn print-mode programs, so the whole conversation is
 * collapsed into one Markdown string of `## user` / `## assistant` sections.
 * ONE builder, shared by the web client (which assembles it for every user
 * turn) and the daemon (which assembles it for the rounds it starts on its own,
 * such as the OD Next build round on an agent that cannot continue its native
 * session). If the two drifted, a daemon-started round would read a different
 * history than the user's next message, so the builder lives here and both
 * sides import it.
 *
 * The only agent-specific rule is `scopeHistoryToAgent`: history is cut at the
 * last assistant message a different agent family produced, so an agent never
 * inherits another family's working narration. BYOK OpenCode and the API-mode
 * providers count as one family.
 */
import type { ChatMessage } from './chat.js';
import {
  summarizeArtifactsForTranscript,
  type PersistedArtifactFileRef,
} from '../artifacts/artifact-transcript.js';

export const MAX_TRANSCRIPT_MESSAGE_CHARS = 12_000;
const LARGE_TOOL_RESULT_CHARS = 8_000;
const HIGH_INPUT_TOKEN_WARNING_THRESHOLD = 200_000;
const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';
const API_MODE_AGENT_IDS = new Set([
  'anthropic-api',
  'openai-api',
  'openai-compatible-api',
  'azure-openai-api',
  'google-gemini-api',
  'ollama-cloud-api',
  'senseaudio-api',
  'aihubmix-api',
  'bedrock-api',
]);

/** The subset of a chat message the transcript builder reads. */
export type TranscriptMessage = Pick<
  ChatMessage,
  'role' | 'content' | 'agentId' | 'events' | 'producedFiles'
> & { id?: string };

export function latestUserPromptFromHistory(history: ReadonlyArray<TranscriptMessage>): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function truncateForTranscript(content: string): string {
  if (content.length <= MAX_TRANSCRIPT_MESSAGE_CHARS) return content;
  const omitted = content.length - MAX_TRANSCRIPT_MESSAGE_CHARS;
  return `${content.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS)}\n\n[OpenDesign truncated ${omitted} chars from this prior message before sending it to the agent. Full content remains in persisted history.]`;
}

function escapeTranscriptRoleDelimiters(content: string): string {
  return content.replace(/^(## (?:user|assistant)[ \t]*)(\r?)$/gm, '\\$1$2');
}

function compactInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function buildPriorRunContextWarning(history: ReadonlyArray<TranscriptMessage>): string | null {
  let highestInputTokens = 0;
  let largeToolResults = 0;
  let sawAgentBrowserCoreDump = false;

  for (const message of history) {
    for (const event of message.events ?? []) {
      if (event.kind === 'usage' && typeof event.inputTokens === 'number') {
        highestInputTokens = Math.max(highestInputTokens, event.inputTokens);
      }
      if (event.kind === 'tool_result') {
        if (event.content.length > LARGE_TOOL_RESULT_CHARS) largeToolResults += 1;
        if (
          event.content.includes('agent-browser skills get core') ||
          event.content.includes('Agent Browser Core') ||
          event.content.includes('name: core')
        ) {
          sawAgentBrowserCoreDump = true;
        }
      }
      if (event.kind === 'tool_use') {
        const input = compactInput(event.input);
        if (input.includes('agent-browser skills get core')) {
          sawAgentBrowserCoreDump = true;
        }
      }
    }
  }

  const notes: string[] = [];
  if (highestInputTokens >= HIGH_INPUT_TOKEN_WARNING_THRESHOLD) {
    notes.push(`a previous run reported ${highestInputTokens} input tokens`);
  }
  if (largeToolResults > 0) {
    notes.push(`${largeToolResults} large prior tool result${largeToolResults === 1 ? '' : 's'} exist only in persisted event history`);
  }
  if (sawAgentBrowserCoreDump) {
    notes.push('agent-browser documentation output was seen earlier; do not replay it into this turn');
  }
  if (notes.length === 0) return null;

  return [
    '## context warning',
    `OpenDesign detected ${notes.join(', ')}.`,
    'Keep this turn compact: summarize prior tool output, read large references from temp files, and quote only task-relevant lines.',
  ].join('\n');
}

function scopeHistoryToAgent<T extends TranscriptMessage>(
  history: ReadonlyArray<T>,
  targetAgentId?: string,
): ReadonlyArray<T> {
  if (!targetAgentId) return history;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (
      message?.role === 'assistant' &&
      message.agentId &&
      !isSameTranscriptAgentFamily(message.agentId, targetAgentId)
    ) {
      return history.slice(i + 1);
    }
  }
  return history;
}

function isSameTranscriptAgentFamily(agentId: string, targetAgentId: string): boolean {
  if (agentId === targetAgentId) return true;
  if (targetAgentId !== BYOK_OPENCODE_AGENT_ID) return false;
  return API_MODE_AGENT_IDS.has(agentId);
}

// Strip OD-specific markup that the agent emitted on a prior turn but
// that the model would otherwise pattern-match as a template to echo.
// Today this is `<question-form>` blocks (and the `<ask-question>` alias the
// UI parser and the daemon open-tag matcher both accept) and the ```json
// fenced schemas
// some models (GPT-OSS-120B Medium, Gemini 3.5 Flash) emit alongside
// them — leaving those literal in the transcript causes weak/medium
// plain-stream models to re-emit an identical form on the user's
// follow-up turn, looking like the discovery form loop never breaks
// (see PR #3157 form-loop investigation). If we only scrubbed the canonical
// tag, an alias-form turn would replay verbatim and re-trigger that loop.
//
// User content is preserved verbatim — a user message that legitimately
// quotes `<question-form>` (e.g. discussing the markup with the agent)
// must not be mangled.
export function sanitizePriorAssistantTurnForTranscript(
  content: string,
  persistedArtifactFiles: ReadonlyArray<PersistedArtifactFileRef> = [],
): string {
  let sanitized = content.replace(
    // `\1` backreference keeps the open/close tag names matched so we never
    // splice across a `<question-form>…</ask-question>` mismatch.
    /<(question-form|ask-question)\b[^>]*>[\s\S]*?<\/\1>/g,
    '[question-form was emitted here on a prior turn; the user already answered, see their reply below.]',
  );
  // Strip ```json (or plain ```) fenced blocks whose body matches the
  // form schema shape — `"questions": [` is the strongest tell. A
  // generic JSON snippet without that key (e.g. an API response the
  // agent shared) is left intact.
  sanitized = sanitized.replace(
    /```(?:json)?\s*\n([\s\S]*?)\n```/g,
    (match, body: string) => {
      if (/"questions"\s*:\s*\[/.test(body)) {
        return '[form schema was echoed here on a prior turn; stripped to avoid a loop.]';
      }
      return match;
    },
  );
  // Replace prior-turn `<artifact>` HTML with a one-line summary — but ONLY
  // for artifacts whose save to the project files is confirmed by the
  // message's producedFiles record. persistArtifact has refusal and
  // write-failure branches; on those paths the transcript copy is the only
  // surviving artifact body, so an unconfirmed block stays verbatim (the
  // 12K truncation below still bounds it) and a follow-up turn can repair it.
  // For confirmed saves the agent reads/edits the file from disk, never from
  // this transcript copy, so re-sending the whole document each turn is pure
  // waste — the summary keeps identifier/title/type plus the saved file name.
  // Runs before truncateForTranscript so the summarized message no longer
  // trips the 12K cap. Uses markdown-aware detection so a literal
  // `<artifact>` recited in a code fence survives.
  sanitized = summarizeArtifactsForTranscript(sanitized, persistedArtifactFiles);
  return sanitized;
}

// producedFiles → the persistence evidence summarizeArtifactsForTranscript
// matches artifact blocks against. producedFiles is the whole per-turn file
// diff — tool-written files included — so a name collision with an unrelated
// same-turn file must not count as proof the <artifact> body was saved. Only
// artifact-originated saves qualify: persistArtifact always writes an explicit
// (non-inferred) manifest, whereas tool-written files surface with no manifest
// or a daemon-inferred one (`metadata.inferred === true`). Within that
// narrowed set, the manifest identifier is the strongest link (it survives
// `-2`/`-3` collision renames); the file name is the fallback for artifact
// saves whose manifest predates identifier metadata.
function persistedArtifactFilesOf(message: TranscriptMessage): PersistedArtifactFileRef[] {
  return (message.producedFiles ?? [])
    .filter((file) => file.artifactManifest && file.artifactManifest.metadata?.inferred !== true)
    .map((file): PersistedArtifactFileRef => {
      const identifier = file.artifactManifest?.metadata?.identifier;
      return typeof identifier === 'string' && identifier
        ? { name: file.name, identifier }
        : { name: file.name };
    });
}

export function buildDaemonTranscript(
  history: ReadonlyArray<TranscriptMessage>,
  targetAgentId?: string,
): string {
  const scopedHistory = scopeHistoryToAgent(history, targetAgentId);
  const transcript = scopedHistory
    .map((m) => {
      const trimmed = m.content.trim();
      const sanitized =
        m.role === 'assistant'
          ? sanitizePriorAssistantTurnForTranscript(trimmed, persistedArtifactFilesOf(m))
          : trimmed;
      return `## ${m.role}\n${escapeTranscriptRoleDelimiters(truncateForTranscript(sanitized))}`;
    })
    .join('\n\n');
  const warning = buildPriorRunContextWarning(scopedHistory);
  return warning ? `${warning}\n\n${transcript}` : transcript;
}

/** Build only the turns before the latest user message without text subtraction. */
export function buildDaemonPriorTranscript(
  history: ReadonlyArray<TranscriptMessage>,
  targetAgentId?: string,
): string {
  let latestUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  return latestUserIndex < 0
    ? buildDaemonTranscript(history, targetAgentId)
    : buildDaemonTranscript(history.slice(0, latestUserIndex), targetAgentId);
}

/**
 * Append further turns to a transcript that was already built.
 *
 * The daemon uses this for a round it starts itself: the frozen first-round
 * bundle carries the transcript the web client built for that request plus
 * the user's message, and the round that just finished exists only as the
 * visible text the daemon streamed — the web client writes the assistant
 * message back after the fact, so the messages table does not hold it yet.
 * Rendering the extra turns through the same builder keeps the bytes for the
 * earlier part identical to what the client would have sent.
 */
export function appendDaemonTranscript(
  priorTranscript: string,
  turns: ReadonlyArray<TranscriptMessage>,
): string {
  const appended = buildDaemonTranscript(turns);
  if (!priorTranscript.trim()) return appended;
  if (!appended) return priorTranscript;
  return `${priorTranscript}\n\n${appended}`;
}
