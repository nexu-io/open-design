// File-system markdown memory store.
//
// One .md file per fact under <dataDir>/memory/, plus an index file at
// <dataDir>/memory/MEMORY.md. The index is a hand-edited Table of
// Contents — one bullet per fact. The per-fact file holds the body
// itself plus a small frontmatter block (`name`, `description`, `type`).
//
// Inspired by the pattern Claude Code's auto-memory skill uses; see also
// llm_wiki, gbrain, memU. Kept deliberately small so every read/write
// stays a plain `cat` / `editor` round trip — no DB, no fancy schema.

import type { MemoryTreeNode } from './automations.js';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export const MEMORY_TYPES: readonly MemoryType[] = [
  'user',
  'feedback',
  'project',
  'reference',
] as const;

// Listing payload — frontmatter only, no body. The settings panel pulls
// the full body lazily through `GET /api/memory/:id` when the user
// opens the preview/edit drawer.
export interface MemoryEntrySummary {
  /** File slug, without the `.md` suffix. e.g., "user_role" or "feedback_tests". */
  id: string;
  /** Human display title pulled from frontmatter `name`. */
  name: string;
  /** One-line description pulled from frontmatter `description`. */
  description: string;
  /** Category — drives the filename prefix and the system-prompt section it lands in. */
  type: MemoryType;
  /** Unix milliseconds — file mtime. */
  updatedAt: number;
}

export interface MemoryEntry extends MemoryEntrySummary {
  /** Markdown body, frontmatter stripped. */
  body: string;
}

export interface MemorySuggestion {
  /** Stable id for this suggestion batch, not the final memory file id. */
  id: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
  source?: {
    kind: 'connector';
    connectorId?: string;
    connectorName?: string;
    accountLabel?: string;
    toolName?: string;
    toolTitle?: string;
  };
}

// GET /api/memory
export interface MemoryListResponse {
  /** True when the daemon will inject memory into the next system prompt. */
  enabled: boolean;
  /** True when new chat turns may create memory suggestions/extractions. */
  chatExtractionEnabled: boolean;
  /** Absolute path to the memory directory (informational, for the settings UI). */
  rootDir: string;
  /** The MEMORY.md index body — usually a list of `- [Name](file.md) — hook` lines. */
  index: string;
  entries: MemoryEntrySummary[];
  /** User-supplied override for the LLM extraction provider. `null` when
   *  the daemon should auto-pick (env var → media-config fallback). API
   *  keys returned here are masked — only the last 4 characters are
   *  echoed back so the UI can show a "configured" affordance without
   *  leaking the secret into the DOM. */
  extraction: MemoryExtractionMaskedConfig | null;
}

/** Provider/protocol the memory extractor calls. Mirrors the chat
 *  BYOK form's protocols — anthropic + openai-compatible + azure
 *  (openai-compatible at a different URL/header) + google gemini +
 *  ollama (also openai-compatible, just hosted on Ollama Cloud) +
 *  senseaudio (also openai-compatible, SenseAudio's OpenAI-shaped
 *  /v1/chat/completions gateway) — so the memory picker can offer the
 *  same options as the chat picker above it. The daemon routes both
 *  ollama and senseaudio through the same callOpenAI path since the
 *  wire protocol is identical. */
export type MemoryExtractionProvider =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'senseaudio';

/** Masked version of MemoryExtractionConfig returned by GET endpoints —
 *  the api key field is replaced with a 4-char tail so the settings UI
 *  can render "•••• abcd" without echoing the secret back into the DOM. */
export interface MemoryExtractionMaskedConfig {
  provider: MemoryExtractionProvider;
  model: string;
  baseUrl: string;
  /** Azure-only: the `?api-version=…` query param value. Empty for the
   *  other providers. The daemon falls back to a sensible default when
   *  this is empty even on azure. */
  apiVersion: string;
  /** Last 4 chars of the configured key, or empty when unset. */
  apiKeyTail: string;
  /** True when an apiKey is stored in the override config. */
  apiKeyConfigured: boolean;
}

// GET /api/memory/:id
export interface MemoryEntryResponse {
  entry: MemoryEntry;
}

// GET /api/memory/tree — tree-aware view over the same markdown store.
// Folder nodes are derived from entry type buckets; entry nodes point at
// the underlying <id>.md files and remain editable through the normal
// memory entry API. This gives agents a stable tree contract without
// introducing a second memory persistence layer.
export interface MemoryTreeListResponse {
  enabled: boolean;
  rootDir: string;
  tree: MemoryTreeNode[];
}

// PATCH /api/memory/tree/:id — edit an entry node from tree-aware callers.
// Folder nodes are currently derived, so only entry ids are patchable.
export interface UpdateMemoryTreeNodeRequest {
  name?: string;
  description?: string;
  type?: MemoryType;
  body?: string;
}

export interface UpdateMemoryTreeNodeResponse {
  entry: MemoryEntry;
  tree: MemoryTreeNode[];
}

// POST /api/memory      → upsert (id supplied → update; missing → create)
// PUT  /api/memory/:id  → update by id
export interface UpsertMemoryRequest {
  /** Optional on create — daemon derives a slug from `type` + `name`. */
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

export interface UpsertMemoryResponse {
  entry: MemoryEntry;
}

// PUT /api/memory/index — overwrite MEMORY.md with arbitrary content. The
// settings UI uses this when the user hand-edits the index in the textarea.
export interface UpdateMemoryIndexRequest {
  index: string;
}

// PATCH /api/memory/config — toggle whether memory is folded into prompts,
// and/or override the LLM extraction provider.
export interface UpdateMemoryConfigRequest {
  enabled?: boolean;
  chatExtractionEnabled?: boolean;
  /** Pass `null` to clear the override and fall back to auto-pick. Pass an
   *  object to commit a custom provider. Omit to leave unchanged. */
  extraction?: MemoryExtractionConfig | null;
}

export interface MemoryConfigResponse {
  enabled: boolean;
  chatExtractionEnabled: boolean;
  extraction: MemoryExtractionConfig | null;
}

// User-supplied override for the LLM extraction model. When `null`/absent,
// the daemon falls back to its auto-pick: ANTHROPIC_API_KEY env var →
// OPENAI_API_KEY env var → the OpenAI key configured under Settings →
// Media providers. When set, every field is honored verbatim.
//
// Fields are deliberately optional past `provider` so the daemon can fall
// back per-field to environment defaults when the user hasn't typed them
// in (e.g., they pasted a model name but want to keep using the
// ANTHROPIC_API_KEY in their env). Empty strings are treated as "not set".
export interface MemoryExtractionConfig {
  provider: MemoryExtractionProvider;
  /** Override model id. When empty, the daemon picks a provider default
   *  (`claude-haiku-4-5` for anthropic; `gpt-4o-mini` for openai/azure;
   *  `gemini-2.0-flash` for google). For azure this is the deployment
   *  name, not the underlying model family. */
  model?: string;
  /** Override base URL. When empty, the daemon uses the provider default
   *  (no default for azure — the user must supply their resource URL). */
  baseUrl?: string;
  /** Override API key. When empty, the daemon falls back to env vars and
   *  the media-config OpenAI key (openai provider only). */
  apiKey?: string;
  /** Azure-only: `?api-version=…` query string. Ignored for other providers. */
  apiVersion?: string;
}

export interface DeleteMemoryResponse {
  ok: true;
}

// POST /api/memory/extract — fired by the chat run after each user turn.
// The daemon also calls this internally; exposing it as an HTTP endpoint
// makes it cheap to test with `curl` and lets a future settings UI replay
// extraction over an old turn.
export interface ExtractMemoryRequest {
  userMessage: string;
  assistantMessage?: string;
  projectId?: string | null;
  conversationId?: string | null;
  /** BYOK chat config snapshot. The web app sends this with every
   *  BYOK / API-mode extraction call so the daemon can run LLM
   *  extraction against the *current* chat provider/key/baseUrl/
   *  apiVersion when no explicit memory model override is set —
   *  i.e. the picker is on "Same as chat". Without it the daemon's
   *  `pickProvider()` falls back to env vars or the media-config
   *  OpenAI key, which is wrong for BYOK chats whose creds the
   *  daemon never persists.
   *
   *  When the user has set an explicit memory model (override
   *  exists), the override always wins and this field is ignored.
   *  CLI-mode extraction calls leave this empty — the agent-id
   *  constrained branch in `pickProvider()` handles those.
   *
   *  An empty `apiKey` (or missing field) is treated as "no usable
   *  BYOK config" and falls through to the legacy provider chain so
   *  a half-configured BYOK form doesn't silently break extraction. */
  chatProvider?: {
    provider: MemoryExtractionProvider;
    apiKey?: string;
    baseUrl?: string;
    /** Azure-only `?api-version=…` value. Ignored for other providers. */
    apiVersion?: string;
    /** Optional — the daemon prefers a fast/cheap default per protocol
     *  (`claude-haiku-4-5` / `gpt-4o-mini` / etc.) over the chat model
     *  the user is paying for. Pass this only when the caller
     *  explicitly wants the same model used for both. */
    model?: string;
  };
}

export interface ExtractMemoryResponse {
  /** Entries created or updated by this extraction pass. Empty when the
   *  heuristic found nothing worth saving. */
  changed: MemoryEntrySummary[];
  /** True when the daemon also kicked off the background LLM extractor
   *  for this turn — i.e. the caller supplied both a non-empty
   *  `userMessage` and `assistantMessage`. The LLM extractor runs out
   *  of band; observe `MemoryExtractionEvent` on `/api/memory/events`
   *  for its result. */
  attemptedLLM?: boolean;
}

// GET /api/memory/system-prompt — composed markdown block the daemon
// would fold into the chat system prompt for a CLI run. Returns ''
// when memory is disabled, missing, or nothing in the index is linked
// in. BYOK / API-mode chats fetch this before each turn so the same
// memory the daemon-side chat enjoys is also injected when
// `ProjectView` composes the prompt locally.
export interface MemorySystemPromptResponse {
  body: string;
}

// SSE feed payload — emitted on `/api/memory/events` whenever the daemon
// mutates memory (chat-driven extraction, manual settings edits, LLM
// extractor, or `curl` POSTs). The web UI subscribes to this so changes
// in any tab show up in any other open tab without polling.
export type MemoryChangeKind =
  | 'upsert'
  | 'delete'
  | 'index'
  | 'config'
  | 'extract';

export interface MemoryChangeEvent {
  kind: MemoryChangeKind;
  /** Present on `upsert` and `delete`. */
  id?: string;
  /** Mirrored from the entry frontmatter on `upsert`. */
  name?: string;
  description?: string;
  type?: MemoryType;
  /** Number of entries written in this pass — only on `kind: 'extract'`. */
  count?: number;
  /** Where the change came from. Useful for UX (e.g., suppress toasts on
   *  manual edits since the user just clicked Save themselves). */
  source?: 'heuristic' | 'llm' | 'manual' | 'connector';
  /** Only on `kind: 'config'` — the new enabled flag. */
  enabled?: boolean;
  /** Unix milliseconds. */
  at: number;
}

// ----- Extraction observability -------------------------------------------
//
// Two extractors share this surface:
//
//   - 'heuristic' — the regex pack in `apps/daemon/src/memory.ts`. Runs
//     synchronously in the chat route before the prompt is composed.
//   - 'llm'       — the small-model extractor in `apps/daemon/src/memory-llm.ts`.
//     Runs in the background after the run finishes.
//
// Both used to be silent — if either was skipped (no API key, message
// empty) or returned 0 hits, the user had no way to tell whether their
// turn was processed at all. The records below are written by both
// extractors so the settings panel can render a single "recent
// extractions" list with `kind` badges, surfacing skips, failures, and
// zero-match runs.

/** Which extractor produced the attempt. `'llm'` is the legacy default
 *  for records written before this field existed. */
export type MemoryExtractionKind = 'heuristic' | 'llm' | 'connector';

// POST /api/memory/connectors/suggest and /extract — read approved,
// read-only data from selected connected apps and feed the compacted result
// through the memory extractor. The daemon chooses safe read tools per
// connector; the UI only supplies connector ids and an optional search hint.
export interface ConnectorMemoryExtractionRequest {
  connectorIds?: string[];
  query?: string;
  projectId?: string | null;
  /** Current Local CLI agent selected for chat. Connector memory uses this
   *  to keep "Same as chat" extraction on the user's active CLI even before
   *  the debounced settings save reaches the daemon. */
  chatAgentId?: string | null;
  /** Current chat model for `chatAgentId`, forwarded with connector memory
   *  requests for the same reason as `chatAgentId`. */
  chatModel?: string | null;
}

export interface ConnectorMemoryExtractionResult {
  connectorId: string;
  connectorName: string;
  accountLabel?: string;
  status: 'succeeded' | 'skipped' | 'failed';
  toolName?: string;
  toolTitle?: string;
  summary: string;
  error?: string;
}

export interface ConnectorMemoryExtractionResponse {
  changed: MemoryEntrySummary[];
  attemptedLLM: boolean;
  connectors: ConnectorMemoryExtractionResult[];
  contextBytes: number;
}

export interface ConnectorMemorySuggestionResponse {
  suggestions: MemorySuggestion[];
  attemptedLLM: boolean;
  connectors: ConnectorMemoryExtractionResult[];
  contextBytes: number;
}

export type MemoryExtractionPhase =
  | 'running'
  | 'success'
  | 'skipped'
  | 'failed'
  // Pseudo-phase emitted only on the SSE `extraction` channel when a row
  // is removed from the buffer (manual delete or full clear). Persisted
  // records never carry these phases — the daemon evicts them straight
  // out of the ring buffer rather than rewriting them in place.
  | 'deleted'
  | 'cleared';

/** Why an attempt was skipped before any LLM call (or, for the regex
 *  extractor, before any pattern was tested). Surface this in the UI so
 *  the user can see "we'd run extraction but no API key is configured"
 *  instead of staring at a memory list that mysteriously stopped
 *  growing. `'no-match'` is heuristic-only — the regex ran but every
 *  pattern produced 0 captures. */
export type MemoryExtractionSkipReason =
  | 'no-provider'
  | 'memory-disabled'
  | 'chat-disabled'
  | 'empty-message'
  | 'no-match';

export interface MemoryExtractionRecord {
  /** Stable id for the attempt. UUID-ish; safe to use as a React key. */
  id: string;
  /** Which extractor wrote this record. Optional for backwards compat
   *  with daemons that predate the heuristic surfacing — the UI treats
   *  a missing kind as `'llm'` since that was the only writer. */
  kind?: MemoryExtractionKind;
  /** Unix milliseconds — when the attempt was queued. */
  startedAt: number;
  /** Unix milliseconds — when the attempt reached a terminal phase. */
  finishedAt?: number;
  phase: MemoryExtractionPhase;
  /** Populated when phase === 'skipped'. */
  reason?: MemoryExtractionSkipReason;
  /** Provider+model resolved at attempt time. Absent when kind ===
   *  'heuristic' (the regex pack has no provider) or when the LLM
   *  attempt was skipped before provider selection. */
  provider?: {
    kind: MemoryExtractionProvider;
    model: string;
    /** Where the credential came from. `'memory-config'` = the explicit
     *  override under Settings → Memory; `'env'` = ANTHROPIC_API_KEY /
     *  OPENAI_API_KEY in the daemon's environment; `'media-config'` =
     *  the OpenAI key the user configured under Settings → Media
     *  providers; `'chat-byok'` = the live BYOK chat provider/key/
     *  baseUrl threaded through `/api/memory/extract` for "Same as
     *  chat" extraction in API mode; `'chat-cli'` = the current Local
     *  CLI run in background one-shot mode for "Same as chat"
     *  extraction in CLI mode. */
    credentialSource:
      | 'memory-config'
      | 'env'
      | 'media-config'
      | 'chat-byok'
      | 'chat-cli';
  };
  /** First ~120 chars of the user's message for display in the list. */
  userMessagePreview: string;
  /** How many entries the model proposed (after JSON parse + type filter).
   *  Heuristic records never set this — they go straight from match to write. */
  proposedCount?: number;
  /** How many entries actually landed on disk (proposed minus already-known dedupes). */
  writtenCount?: number;
  /** Slugs of entries written in this attempt — clickable in the UI. */
  writtenIds?: string[];
  /** Populated when phase === 'failed'. Single-line, ≤ 240 chars. */
  error?: string;
}

// GET /api/memory/extractions — most-recent-first. Capped server-side.
export interface MemoryExtractionsResponse {
  /** Most recent first. */
  extractions: MemoryExtractionRecord[];
}

// DELETE /api/memory/extractions/:id — remove one history record.
// DELETE /api/memory/extractions      — clear the whole buffer.
// Returns the number of records removed (0 when the id was already gone).
export interface DeleteMemoryExtractionResponse {
  removed: number;
}

// SSE event name `extraction` on /api/memory/events. Emitted on every
// phase transition; the latest record for a given id supersedes earlier
// ones. The frontend deduplicates by id so a buffered burst of phase
// updates collapses into a single visible row.
export interface MemoryExtractionEvent extends MemoryExtractionRecord {}
