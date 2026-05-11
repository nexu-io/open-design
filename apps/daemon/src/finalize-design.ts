// One-shot synthesis of a project's design intent into a `DESIGN.md` artifact
// at <projectDir>/DESIGN.md. The endpoint takes the SQLite-backed transcript
// (via `exportProjectTranscript` from PR #493), the project's active design
// system body, and the project's "current artifact" (active artifact tab,
// fallback to newest .artifact.json by manifest.updatedAt, fallback null),
// runs them through Claude's Messages API, and writes the synthesized
// Markdown back to disk atomically.
//
// Per-project lockfile semantics (`.finalize.lock`) mirror PR #493's
// transcript-export hygiene. A second concurrent finalize throws
// `FinalizePackageLockedError`. Stale-lock recovery (e.g. after a crash)
// is out of scope; operators clear via `rm <projectDir>/.finalize.lock`.
//
// API key, base URL, and model flow in via the route's request body
// (matching the proxy at `apps/daemon/src/server.ts`'s
// `/api/proxy/anthropic/stream`). The daemon does NOT store provider
// credentials. `baseUrl` is optional here (intentional divergence from
// the proxy, which requires it) so standard Anthropic users don't need
// to set it; Bedrock / self-hosted-proxy users still can.
//
// Inline `PersistedAgentEvent` shape is restated in this file (the daemon
// tsconfig does not resolve the `@open-design/contracts/api/chat` subpath
// export — verified during PR #493). Schema-mismatch tests in the test
// file would catch any drift between this restated union and the contract.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import type {
  FinalizeAnthropicRequest,
  FinalizeAnthropicResponse,
  FinalizeArtifactRef,
} from '@open-design/contracts/api/finalize';
import { getProject } from './db.js';
import { readDesignSystem } from './design-systems.js';
import {
  listFiles,
  readProjectFile,
  resolveProjectDir,
  validateProjectPath,
} from './projects.js';
import { exportProjectTranscript } from './transcript-export.js';

// Re-export the request/response types so existing daemon-internal
// imports (and the route handler) keep their referenced names. The
// canonical definitions live in @open-design/contracts/api/finalize
// per @lefarcen's P2 review feedback on PR #832, with a real runtime
// entrypoint per @mrcfps's review feedback on the same PR.
export type {
  FinalizeAnthropicRequest,
  FinalizeAnthropicResponse,
  FinalizeArtifactRef,
};

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 16000;
const INPUT_BODY_CAP_BYTES = 384 * 1024;
const LOCK_FILENAME = '.finalize.lock';
const OUTPUT_FILENAME = 'DESIGN.md';
const DEFAULT_TIMEOUT_MS = 120_000;

export interface FinalizeOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  now?: () => Date;
  fetchImpl?: typeof globalThis.fetch;
  signal?: AbortSignal;
  // Override the helper-internal upstream-call timeout. Production callers
  // omit this so the helper bounds at DEFAULT_TIMEOUT_MS; tests pass a
  // smaller value to exercise the AbortSignal.any composition without
  // depending on fake timers.
  timeoutMs?: number;
}

export class FinalizePackageLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalizePackageLockedError';
  }
}

/**
 * Upstream Anthropic call failure with a meaningful HTTP status the route
 * handler can map to one of the documented error codes (401/429/502).
 */
export class FinalizeUpstreamError extends Error {
  status: number;
  rawText: string;
  constructor(status: number, rawText: string, message?: string) {
    super(message || `upstream Anthropic returned ${status}`);
    this.name = 'FinalizeUpstreamError';
    this.status = status;
    this.rawText = rawText;
  }
}

type Db = Database.Database;

interface ResolvedArtifact {
  name: string;
  body: string;
  manifest: { kind?: string; updatedAt?: string; title?: string; entry?: string } | null;
}

/**
 * Resolve the project's "current artifact" for the synthesis prompt.
 *
 * Priority order:
 *   1. The file referenced by `tabs.is_active = 1` IF it has an
 *      `<name>.artifact.json` sidecar present on disk. "Sidecar
 *      presence" is the discriminator: an inferred manifest (e.g. for
 *      a bare `.html` file with no sidecar) does NOT count, and an
 *      active tab pointing at a non-artifact file (`.md`, `.txt`)
 *      falls through.
 *   2. The newest project file with a real `.artifact.json` sidecar,
 *      sorted by `manifest.updatedAt` descending. Files without an
 *      `updatedAt` (legacy pre-streaming manifests) sort last.
 *   3. `null` — no artifact in scope. Caller emits `artifact: null`
 *      in the response and the prompt's "Current artifact" section
 *      reads "none".
 *
 * `metadata` is the project row's `metadata` field (from `getProject`).
 * For imported-folder projects, `metadata.baseDir` redirects file IO
 * to the user's actual folder; without it, this resolver would only
 * look under `.od/projects/<id>` and miss the real artifacts.
 *
 * Sidecar presence is checked via `existsSync` on the on-disk path so
 * the resolver does not depend on `inferLegacyManifest`'s heuristic.
 */
export async function resolveCurrentArtifact(
  db: Db,
  projectsRoot: string,
  projectId: string,
  metadata?: { baseDir?: string } | null,
): Promise<ResolvedArtifact | null> {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata ?? undefined);

  const activeTabRow = db
    .prepare(`SELECT name FROM tabs WHERE project_id = ? AND is_active = 1 LIMIT 1`)
    .get(projectId) as { name?: unknown } | undefined;
  const activeTabName =
    activeTabRow && typeof activeTabRow.name === 'string' ? activeTabRow.name : null;

  if (activeTabName) {
    // Validate the tab name BEFORE composing it into a filesystem path.
    // A malformed tab (e.g. `../../../etc/passwd` written by an attacker
    // with DB write access) would otherwise probe outside the project
    // dir via path.join. validateProjectPath throws on traversal
    // segments, absolute paths, null bytes, and reserved segments.
    // Invalid tab names fall through to the newest-artifact branch
    // rather than aborting finalize. P3 finding from @lefarcen on PR #832.
    let safeTabName: string | null = null;
    try {
      safeTabName = validateProjectPath(activeTabName);
    } catch {
      safeTabName = null;
    }
    if (safeTabName) {
      const sidecarPath = path.join(dir, `${safeTabName}.artifact.json`);
      if (fs.existsSync(sidecarPath)) {
        const file = await readProjectFile(
          projectsRoot,
          projectId,
          safeTabName,
          metadata ?? undefined,
        );
        return {
          name: file.name,
          body: file.buffer.toString('utf8'),
          manifest: file.artifactManifest ?? null,
        };
      }
    }
    // Active tab points at a non-artifact file (or an unsafe name) — fall
    // through to the newest-artifact branch.
  }

  const files = await listFiles(projectsRoot, projectId, { metadata: metadata ?? undefined });
  const candidates = files
    .filter((f) => {
      // Require a real sidecar on disk; an inferred manifest does not count.
      return fs.existsSync(path.join(dir, `${f.name}.artifact.json`));
    })
    .map((f) => {
      const manifest =
        f.artifactManifest && typeof f.artifactManifest === 'object'
          ? f.artifactManifest as { updatedAt?: unknown }
          : null;
      return {
        name: f.name,
        updatedAt: typeof manifest?.updatedAt === 'string' ? manifest.updatedAt : '',
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); // descending; '' sorts last

  if (candidates.length > 0) {
    const newest = await readProjectFile(
      projectsRoot,
      projectId,
      candidates[0]!.name,
      metadata ?? undefined,
    );
    return {
      name: newest.name,
      body: newest.buffer.toString('utf8'),
      manifest: newest.artifactManifest ?? null,
    };
  }

  return null;
}

export async function finalizeDesignPackage(
  db: Db,
  projectsRoot: string,
  designSystemsRoot: string,
  projectId: string,
  options: FinalizeOptions,
): Promise<FinalizeAnthropicResponse> {
  const project = getProject(db, projectId);
  if (!project) {
    // Defensive — the route handler validates this and returns 404 before
    // reaching here. Kept for direct (non-HTTP) callers, e.g. CLI scripts.
    throw new Error(`project not found: ${projectId}`);
  }

  // Imported-folder projects (created via /api/import/folder) carry
  // `metadata.baseDir` and write to the user's actual folder rather than
  // `.od/projects/<id>`. resolveProjectDir handles both shapes; calling
  // bare `projectDir` would silently land DESIGN.md in the hidden daemon
  // data dir for these projects (PR #832 P1 finding from @lefarcen).
  const projectMetadata = (project as { metadata?: { baseDir?: string } | null }).metadata ?? null;
  const dir = resolveProjectDir(projectsRoot, projectId, projectMetadata ?? undefined);
  // For imported-folder projects, `dir` is the user's own directory and
  // already exists; mkdirSync is a no-op (recursive:true is idempotent).
  // For native projects, it lazily creates `.od/projects/<id>`.
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, OUTPUT_FILENAME);
  const lockPath = path.join(dir, LOCK_FILENAME);
  const tmpPath = path.join(
    dir,
    `${OUTPUT_FILENAME}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`,
  );
  const now = options.now ?? (() => new Date());
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw new FinalizePackageLockedError(
        `finalize is already in progress for project ${projectId}`,
      );
    }
    throw err;
  }

  try {
    // Phase 3: export transcript via the PR #493 primitive. Returns the
    // disk path; we read the body and run it through the truncation
    // policy so a 4 MB transcript does not blow Anthropic's context.
    const transcriptResult = exportProjectTranscript(db, projectsRoot, projectId, { now });
    const transcriptJsonl = fs.readFileSync(transcriptResult.path, 'utf8');
    const truncatedJsonl = truncateTranscriptForPrompt(transcriptJsonl);

    // Phase 4: design system. Project may not have one selected; readDesignSystem
    // returns null on missing DESIGN.md so the prompt's design-system section
    // gracefully falls back to "(no design system selected for this project)".
    const designSystemId =
      typeof (project as { designSystemId?: unknown }).designSystemId === 'string'
        ? ((project as { designSystemId: string }).designSystemId)
        : null;
    const designSystemBody = designSystemId
      ? await readDesignSystem(designSystemsRoot, designSystemId)
      : null;

    // Phase 5: current artifact (active tab → newest .artifact.json → null).
    // Thread metadata so imported-folder projects discover the real artifacts
    // under metadata.baseDir rather than the empty `.od/projects/<id>` dir.
    const artifact = await resolveCurrentArtifact(
      db,
      projectsRoot,
      projectId,
      projectMetadata,
    );

    // Phase 6: build prompt.
    const { systemPrompt, userPrompt } = buildSynthesisPrompt({
      projectId,
      transcriptJsonl: truncatedJsonl,
      transcriptMessageCount: transcriptResult.messageCount,
      designSystemId,
      designSystemBody,
      artifact,
      now: now(),
    });

    // Phase 7: Anthropic call with bounded blocking timeout. The timeout
    // controller is always created so DEFAULT_TIMEOUT_MS bounds every call,
    // regardless of whether the caller supplied a request-abort signal.
    // When the caller does pass a signal, both cancel paths are honored via
    // AbortSignal.any so neither replaces the other (per @lefarcen P1 review
    // on PR #974 round 7: passing options.signal alone disabled the timeout).
    //
    // Network errors (DNS, ECONNREFUSED, ECONNRESET) and JSON parse errors
    // on the response body are rewrapped as FinalizeUpstreamError(502) so
    // the route handler maps them to 502 UPSTREAM_FAILED rather than 500
    // INTERNAL. Per @lefarcen P1 review on PR #832: only HTTP-non-OK
    // responses were previously wrapped, leaving DNS/parse failures to
    // surface as generic 500s.
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
        if (errName === 'AbortError') throw err; // route handler maps to 503
        // Network-level failure (TypeError from fetch, ENOTFOUND/ECONNREFUSED
        // via cause.code, etc.) — rewrap as upstream failure so the route
        // handler maps to 502 UPSTREAM_FAILED with redacted details.
        const message = err instanceof Error ? err.message : String(err);
        throw new FinalizeUpstreamError(502, '', `upstream network error: ${message}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Phase 8: extract DESIGN.md body and usage counters. A 200 with a body
    // that isn't valid JSON (or isn't an object) is treated as an upstream
    // failure rather than letting JSON.parse's SyntaxError surface as 500.
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
    const designMd = extractDesignMd(payload);
    const usage = (payload as { usage?: { input_tokens?: number; output_tokens?: number } }).usage ?? {};
    const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;

    // Phase 9: atomic write. Mirror PR #493: writeFileSync({flag:'wx'}) →
    // reopen for fsync → rename. On any failure unlink tmp; rethrow so the
    // route handler maps the error.
    const encoded = Buffer.from(designMd, 'utf8');
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
      designMdPath: finalPath,
      bytesWritten: encoded.length,
      model: options.model,
      inputTokens,
      outputTokens,
      artifact: artifact
        ? {
            name: artifact.name,
            updatedAt:
              artifact.manifest && typeof artifact.manifest.updatedAt === 'string'
                ? artifact.manifest.updatedAt
                : null,
          }
        : null,
      transcriptMessageCount: transcriptResult.messageCount,
      designSystemId,
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
        // lock may already be gone if disk vanished; not fatal
      }
    }
  }
}

/**
 * Append `/v1/<suffix>` to a base URL, but only if the URL does not
 * already include a `/vN` segment. Mirrors the helper inlined in
 * `apps/daemon/src/connectionTest.ts:188-195` (not exported there).
 */
export function appendVersionedApiPath(baseUrl: string, suffix: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(pathname) ? `${pathname}${suffix}` : `${pathname}/v1${suffix}`;
  return url.toString();
}

export interface AnthropicCallParams {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
  fetchImpl?: typeof globalThis.fetch;
  /** Test-only: skip the inter-attempt sleep so retries are instant. */
  _sleepMs?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Call Anthropic's Messages API once, retrying once on a transient
 * upstream failure (HTTP 429 or 5xx). On a terminal failure, throw a
 * `FinalizeUpstreamError` carrying the upstream HTTP status and raw
 * body text — the route handler maps the status to one of
 * AUTH_FAILED / RATE_LIMITED / UPSTREAM_FAILED and runs the raw body
 * through `redactSecrets` before exposing it as `details` on the
 * error JSON.
 *
 * Retry posture (1 retry) is opinionated; the maintainer's
 * "standard exponential backoff" answer was directional and a single
 * retry matches the existing daemon's posture (transcript export and
 * connectionTest do zero retries).
 */
export async function callAnthropicWithRetry(
  params: AnthropicCallParams,
): Promise<Response> {
  const fetchImpl = params.fetchImpl ?? globalThis.fetch;
  const sleep = params._sleepMs ?? defaultSleep;
  const url = appendVersionedApiPath(params.baseUrl, '/messages');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': params.apiKey,
    'anthropic-version': '2023-06-01',
  };
  const body = JSON.stringify({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userPrompt }],
    stream: false,
  });

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const init: RequestInit = { method: 'POST', headers, body };
    if (params.signal) init.signal = params.signal;
    const response = await fetchImpl(url, init);
    if (response.ok) return response;

    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === 1) {
      const text = await response.text().catch(() => '');
      throw new FinalizeUpstreamError(response.status, text);
    }
    // Linear backoff: 1s on attempt 0. Two retries would extend to 2s on
    // attempt 1 — kept at one retry to stay within the daemon's blocking-
    // fast posture for `/finalize`.
    await sleep(1000 * (attempt + 1));
  }
  // Loop above always returns or throws within two iterations. This is
  // unreachable; satisfies TypeScript control-flow analysis.
  throw new Error('callAnthropicWithRetry: unreachable');
}

/**
 * Extract the Markdown body from Anthropic's Messages API response.
 * Concatenates `content[].text` for every block where `type === 'text'`,
 * preserving order. Throws `FinalizeUpstreamError(502)` if the response
 * shape is unexpected (no content array, no text blocks) — synthesis
 * cannot proceed, and the route handler maps the throw to
 * `502 UPSTREAM_FAILED` rather than producing an empty DESIGN.md on disk.
 */
export function extractDesignMd(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new FinalizeUpstreamError(502, '', 'upstream Anthropic response was not an object');
  }
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new FinalizeUpstreamError(
      502,
      '',
      'upstream Anthropic response had no content array',
    );
  }
  let out = '';
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') out += b.text;
  }
  if (out.length === 0) {
    throw new FinalizeUpstreamError(
      502,
      '',
      'upstream Anthropic response contained no text blocks',
    );
  }
  return out;
}

const SYSTEM_PROMPT = `You are a senior product designer synthesizing a finalized design package
from a multi-turn design session. Your output is a single Markdown document
named DESIGN.md that captures the durable design intent of the work so a
fresh contributor (human or LLM) can reconstruct context without replaying
the full chat.

Output structure (Markdown headings exactly as below):
# DESIGN.md
## Summary
## Brand & Voice
## Information Architecture
## Components & Patterns
## Visual System
## Open Questions
## Provenance

The Provenance section MUST list:
- Project ID
- Design system (or "none" if not selected)
- Current artifact (file name, or "none" if not in scope)
- Transcript message count
- Generated UTC timestamp

Output the Markdown body only. No preamble, no chat-style framing, no
"Here's your DESIGN.md" prefix. Do not invent facts not supported by the
inputs; if an input is missing or empty, the corresponding section should
say so explicitly rather than fabricating content.`;

export interface SynthesisPromptInput {
  projectId: string;
  transcriptJsonl: string;
  transcriptMessageCount: number;
  designSystemId: string | null;
  designSystemBody: string | null;
  artifact: ResolvedArtifact | null;
  now: Date;
}

export interface SynthesisPromptOutput {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Build the system + user prompts for the Anthropic Messages API call.
 * Inputs are verbatim except for the transcript (which the caller has
 * already passed through `truncateTranscriptForPrompt` — this function
 * does not re-truncate). Missing inputs (no design system selected, no
 * artifact in scope) produce explicit "none"/parenthetical placeholders
 * so Claude does not hallucinate content for absent sections.
 */
export function buildSynthesisPrompt(input: SynthesisPromptInput): SynthesisPromptOutput {
  const designSystemHeader = input.designSystemId ?? 'none';
  const designSystemBody =
    input.designSystemBody && input.designSystemBody.trim().length > 0
      ? input.designSystemBody
      : '(no design system selected for this project)';

  const artifactHeader = input.artifact ? input.artifact.name : 'none';
  const artifactBody = input.artifact
    ? input.artifact.body
    : '(no artifact in scope for this finalize)';

  const userPrompt =
    `The following inputs describe the design session for project ${input.projectId}.\n\n` +
    `## Transcript (JSONL)\n${input.transcriptJsonl}\n\n` +
    `## Active design system: ${designSystemHeader}\n${designSystemBody}\n\n` +
    `## Current artifact: ${artifactHeader}\n${artifactBody}\n\n` +
    `## Generation context\n` +
    `- Generated at: ${input.now.toISOString()}\n` +
    `- Project ID: ${input.projectId}\n` +
    `- Transcript message count: ${input.transcriptMessageCount}\n\n` +
    `Synthesize DESIGN.md per the system instructions.`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

/**
 * Truncate a JSONL transcript body so it fits inside Claude's context
 * window when fed into a synthesis prompt. The on-disk transcript stays
 * untouched (PR #493's lossless contract); this function operates on a
 * copy that lives only in the prompt.
 *
 * Strategy: keep the header line (line 0); if the remaining body exceeds
 * INPUT_BODY_CAP_BYTES (minus the header + marker reservation), retain
 * head and tail lines in roughly equal byte budgets and drop the middle
 * with a single sentinel JSON line:
 *
 *   {"kind":"truncated","reason":"size","omittedBytes":<N>}
 *
 * `omittedBytes` is the difference between the original UTF-8 byte
 * length and the truncated output's UTF-8 byte length, so a synthesis
 * consumer can detect the gap.
 *
 * If head + tail budgets together cover the whole body (e.g. all message
 * lines are tiny), no marker is emitted; the output is the input
 * verbatim.
 */
export function truncateTranscriptForPrompt(jsonl: string): string {
  const buf = Buffer.from(jsonl, 'utf8');
  if (buf.byteLength <= INPUT_BODY_CAP_BYTES) return jsonl;

  const lines = jsonl.split('\n');
  const header = lines[0] ?? '';
  const body = lines.slice(1);

  const markerLine = '{"kind":"truncated","reason":"size","omittedBytes":__N__}';
  const reservedBytes =
    Buffer.byteLength(header + '\n', 'utf8') +
    Buffer.byteLength(markerLine + '\n', 'utf8') +
    64;
  const perSideBudget = Math.floor((INPUT_BODY_CAP_BYTES - reservedBytes) / 2);

  const headLines: string[] = [];
  let headBytes = 0;
  let headIndex = 0;
  for (; headIndex < body.length; headIndex += 1) {
    const line = body[headIndex] ?? '';
    const lineBytes = Buffer.byteLength(line + '\n', 'utf8');
    if (headBytes + lineBytes > perSideBudget) break;
    headLines.push(line);
    headBytes += lineBytes;
  }

  const tailLines: string[] = [];
  let tailBytes = 0;
  for (let i = body.length - 1; i >= headIndex; i -= 1) {
    const line = body[i] ?? '';
    const lineBytes = Buffer.byteLength(line + '\n', 'utf8');
    if (tailBytes + lineBytes > perSideBudget) break;
    tailLines.unshift(line);
    tailBytes += lineBytes;
  }

  if (headLines.length + tailLines.length >= body.length) {
    // Head + tail covers the whole body — no truncation needed beyond the
    // marker reservation. Return verbatim.
    return [header, ...headLines, ...tailLines].join('\n');
  }

  const without = [header, ...headLines, ...tailLines].join('\n');
  const omittedBytes = buf.byteLength - Buffer.byteLength(without, 'utf8');
  const marker = markerLine.replace('__N__', String(omittedBytes));
  return [header, ...headLines, marker, ...tailLines].join('\n');
}
