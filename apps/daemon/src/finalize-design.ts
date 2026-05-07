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

import * as path from 'node:path';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 16000;
const INPUT_BODY_CAP_BYTES = 384 * 1024;
const LOCK_FILENAME = '.finalize.lock';
const OUTPUT_FILENAME = 'DESIGN.md';
const DEFAULT_TIMEOUT_MS = 120_000;

export interface FinalizeAnthropicRequest {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

export interface FinalizeArtifactRef {
  name: string;
  updatedAt: string | null;
}

export interface FinalizeAnthropicResponse {
  designMdPath: string;
  bytesWritten: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  artifact: FinalizeArtifactRef | null;
  transcriptMessageCount: number;
  designSystemId: string | null;
}

export interface FinalizeOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  now?: () => Date;
  fetchImpl?: typeof globalThis.fetch;
  signal?: AbortSignal;
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

interface Db {
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): unknown;
  };
}

export async function finalizeDesignPackage(
  _db: Db,
  _projectsRoot: string,
  _designSystemsRoot: string,
  _projectId: string,
  _options: FinalizeOptions,
): Promise<FinalizeAnthropicResponse> {
  // Phase D body still pending — synthesis pipeline lands in Phase H.
  // Path constants referenced here stay reachable for incremental phases.
  void DEFAULT_BASE_URL;
  void DEFAULT_MAX_TOKENS;
  void LOCK_FILENAME;
  void OUTPUT_FILENAME;
  void DEFAULT_TIMEOUT_MS;
  void path;
  throw new Error('finalizeDesignPackage not yet implemented (phase D scaffold)');
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
