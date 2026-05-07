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
  // Phase C scaffold — body fills in across phases D-H.
  // Reference path constants here so they are reachable from the route
  // handler's import (which only currently uses the function and the
  // error classes). Without this the constants would lint as unused
  // until Phase H wires them into the real body.
  void DEFAULT_BASE_URL;
  void DEFAULT_MAX_TOKENS;
  void INPUT_BODY_CAP_BYTES;
  void LOCK_FILENAME;
  void OUTPUT_FILENAME;
  void DEFAULT_TIMEOUT_MS;
  void path;
  throw new Error('finalizeDesignPackage not yet implemented (phase C scaffold)');
}
