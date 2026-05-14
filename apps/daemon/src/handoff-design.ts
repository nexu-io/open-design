// One-shot synthesis of a project's chat session into a self-contained
// "first user message" prompt for `POST /api/projects/:id/handoff`. The
// resulting Markdown body is meant to seed a fresh conversation so the
// user can continue the work without replaying the prior chat.
//
// Unlike `finalize-design.ts`, handoff is read-only:
//   - no lockfile (concurrent handoff calls are safe — each one synthesises
//     against the same transcript snapshot and returns its own body),
//   - no on-disk write of the synthesised body (the caller seeds the
//     composer with it — disk storage is the next conversation's
//     responsibility),
//   - no design system or artifact loading (the issue body and lefarcen's
//     2026-05-12 invite scoped this slice to transcript-only synthesis;
//     adding design-system / artifact inputs is a follow-up).
//
// API key, base URL, and model flow in via the route's request body
// (matching `finalize-design.ts`'s BYOK posture). The daemon does NOT
// store provider credentials.

import type Database from 'better-sqlite3';
import type {
  HandoffRequest,
  HandoffResponse,
} from '@open-design/contracts/api/handoff';
import fs from 'node:fs';
import { getProject } from './db.js';
import {
  callAnthropicWithRetry,
  DEFAULT_TIMEOUT_MS,
  extractDesignMd,
  FinalizeUpstreamError,
  truncateTranscriptForPrompt,
  type AnthropicCallParams,
} from './finalize-design.js';
import { exportProjectTranscript } from './transcript-export.js';

// Re-export the request/response types so the route handler and other
// daemon-internal consumers reference the canonical contracts shape via
// this module. Mirrors `finalize-design.ts`'s re-export of
// FinalizeAnthropicRequest/Response.
export type { HandoffRequest, HandoffResponse };

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 4096;

export interface HandoffOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  now?: () => Date;
  fetchImpl?: typeof globalThis.fetch;
  signal?: AbortSignal;
  /**
   * Override the helper-internal upstream-call timeout. Production
   * callers omit this so the helper bounds at DEFAULT_TIMEOUT_MS; tests
   * pass a smaller value to exercise the AbortSignal.any composition
   * without depending on fake timers.
   */
  timeoutMs?: number;
}

export const HANDOFF_SYSTEM_PROMPT = `You are summarizing an in-flight multi-turn design session so a fresh
conversation can resume work without replaying the full chat. Your
output is a single user-style prompt the next conversation will send
as its first message.

Output structure (Markdown, exactly these headings):
## Context
## Decisions made
## Open questions
## Current focus
## Provenance

- Context: 2-4 sentences naming what the session was about and where it left off.
- Decisions made: bulleted list of choices the user committed to (one bullet each).
- Open questions: bulleted list of unresolved questions the prior session surfaced.
- Current focus: 1-2 sentences naming the artifact, file, or task in progress.
- Provenance bullets (plain "- Field: value", no Markdown emphasis on labels):
  - Project ID
  - Transcript message count
  - Generated UTC timestamp

Output the prompt body only. No preamble, no chat-style framing, no
"Here is the prompt" prefix. Do not invent facts not supported by the
transcript; if a section has no content, write "(none)" rather than
fabricating.`;

export interface HandoffPromptInput {
  projectId: string;
  transcriptJsonl: string;
  transcriptMessageCount: number;
  now: Date;
}

export interface HandoffPromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Build the system + user prompts for the Anthropic Messages API call.
 * The transcript JSONL is included verbatim (the caller has already
 * passed it through `truncateTranscriptForPrompt`); generation-context
 * fields (project id, message count, ISO UTC timestamp) feed the
 * Provenance section the system prompt requires.
 */
export function buildHandoffPrompt(input: HandoffPromptInput): HandoffPromptOutput {
  const userPrompt =
    `The following transcript captures the in-flight design session for project ${input.projectId}.\n\n` +
    `## Transcript (JSONL)\n${input.transcriptJsonl}\n\n` +
    `## Generation context\n` +
    `- Generated at: ${input.now.toISOString()}\n` +
    `- Project ID: ${input.projectId}\n` +
    `- Transcript message count: ${input.transcriptMessageCount}\n\n` +
    `Synthesize the resume-conversation prompt per the system instructions.`;

  return { systemPrompt: HANDOFF_SYSTEM_PROMPT, userPrompt };
}

type Db = Database.Database;

/**
 * Run the full handoff synthesis pipeline:
 *   1. export the project's transcript via PR #493's primitive,
 *   2. truncate it to fit the prompt budget,
 *   3. build the system + user prompts,
 *   4. call Anthropic with the same retry posture as finalize,
 *   5. extract the synthesised body + token usage.
 *
 * Network / parse failures rewrap as `FinalizeUpstreamError(502)` so the
 * route handler maps them to UPSTREAM_FAILED uniformly. A caller-supplied
 * `AbortSignal` is composed with an internal `DEFAULT_TIMEOUT_MS` bound
 * via `AbortSignal.any` so neither cancel path replaces the other.
 */
export async function synthesizeHandoffPrompt(
  db: Db,
  projectsRoot: string,
  projectId: string,
  options: HandoffOptions,
): Promise<HandoffResponse> {
  const project = getProject(db, projectId);
  if (!project) {
    throw new Error(`project not found: ${projectId}`);
  }

  const now = options.now ?? (() => new Date());
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const transcriptResult = exportProjectTranscript(db, projectsRoot, projectId, { now });
  const transcriptJsonl = fs.readFileSync(transcriptResult.path, 'utf8');
  const truncatedJsonl = truncateTranscriptForPrompt(transcriptJsonl);

  const { systemPrompt, userPrompt } = buildHandoffPrompt({
    projectId,
    transcriptJsonl: truncatedJsonl,
    transcriptMessageCount: transcriptResult.messageCount,
    now: now(),
  });

  const timeoutController = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  let response: Response;
  try {
    const callParams: AnthropicCallParams = {
      apiKey: options.apiKey,
      baseUrl,
      model: options.model,
      maxTokens,
      systemPrompt,
      userPrompt,
    };
    callParams.signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;
    if (options.fetchImpl) callParams.fetchImpl = options.fetchImpl;
    try {
      response = await callAnthropicWithRetry(callParams);
    } catch (err: unknown) {
      if (err instanceof FinalizeUpstreamError) throw err;
      const errName =
        err && typeof err === 'object' && 'name' in err
          ? (err as { name?: unknown }).name
          : '';
      if (errName === 'AbortError') throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new FinalizeUpstreamError(502, '', `upstream network error: ${message}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FinalizeUpstreamError(
      502,
      '',
      `upstream Anthropic returned non-JSON body: ${message}`,
    );
  }

  const prompt = extractDesignMd(payload);
  const usage = (payload as {
    usage?: { input_tokens?: number; output_tokens?: number };
  }).usage ?? {};
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;

  return {
    prompt,
    model: options.model,
    inputTokens,
    outputTokens,
    transcriptMessageCount: transcriptResult.messageCount,
  };
}
