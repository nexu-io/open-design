// OpenCode swallows provider failures in headless `run --format json` mode:
// on a 429 usage-limit (and similar), it marks the error retryable, retries
// silently, and emits NOTHING on stdout/stderr — so the daemon only sees an
// inactivity-watchdog timeout with no reason. The real error is recorded
// only in OpenCode's own session log (`service=llm … error={…}`). This
// module recovers that signal so the chat UI can show "usage limit reached"
// instead of a bare timeout. OpenCode-specific by design; see issue #982.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { classifyAgentServiceFailure, type AgentServiceFailureCode } from './auth.js';

export interface OpenCodeServiceFailure {
  code: AgentServiceFailureCode;
  message: string;
  retryable: boolean;
  statusCode: number | null;
}

// OpenCode resolves its data dir as `$XDG_DATA_HOME/opencode` (when set) or
// `$HOME/.local/share/opencode`, with session logs under `log/`. Mirror that
// so we read the same files the spawned CLI wrote. Null when neither var is
// set (we have no basis to guess a path).
export function resolveOpenCodeLogDir(
  env: Record<string, string | undefined>,
): string | null {
  const xdg = typeof env.XDG_DATA_HOME === 'string' ? env.XDG_DATA_HOME.trim() : '';
  const home = typeof env.HOME === 'string' ? env.HOME.trim() : '';
  const base = xdg || (home ? path.join(home, '.local', 'share') : '');
  if (!base) return null;
  return path.join(base, 'opencode', 'log');
}

// Read the tail of OpenCode's most recent session log. Filenames are
// `<ISO-like-timestamp>.log`, so a lexicographic sort orders them by recency.
// `since` (when provided) binds the lookup to the current run: a file last
// written before the run started can only belong to an earlier session, so
// it is skipped rather than risk surfacing a stale provider error for this
// run. (This does not disambiguate two OpenCode runs writing into the same
// HOME concurrently — OpenCode only emits its session id on the stdout
// stream, which is empty in the silent-stall case, so mtime is the only
// run-binding signal available here.) The 2 MB tail comfortably holds the
// final error frame even though
// OpenCode embeds the entire request body (system prompt + tool schemas) in
// each `service=llm` line. Synchronous on purpose: the only callers are the
// (non-async) run close handler and the inactivity watchdog, once per failed
// OpenCode run. Returns null on any fs error (no dir yet, perms).
export function readLatestOpenCodeLogTail(
  logDir: string,
  options: { maxBytes?: number; since?: number } = {},
): string | null {
  const { maxBytes = 2_000_000, since } = options;
  let names: string[];
  try {
    names = readdirSync(logDir).filter((name) => name.endsWith('.log'));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  names.sort().reverse(); // newest filename first
  for (const name of names) {
    const full = path.join(logDir, name);
    if (since != null) {
      try {
        if (statSync(full).mtimeMs < since) continue;
      } catch {
        continue;
      }
    }
    try {
      const buf = readFileSync(full, 'utf8');
      return buf.length > maxBytes ? buf.slice(-maxBytes) : buf;
    } catch {
      continue;
    }
  }
  return null;
}

// Only treat a `"message":"…"` value as the failure reason when it reads
// like a service error. The embedded request body uses `"content":` for
// prompt text, but tool schemas and user prompts could still contain a
// stray `"message"` key, so this keyword gate keeps unrelated payload text
// from masquerading as the error.
const SERVICE_ERROR_MESSAGE_RE =
  /usage limit|rate[ _-]?limit|quota|limit reached|insufficient|credit|balance|overloaded|unavailable|unauthor|authenticat|invalid[ _-]?(?:api[ _-]?)?key|api key|\/login|exhaust|too many requests/i;

const HARD_QUOTA_MESSAGE_RE =
  /\b(session limit|usage limit|limit reached|quota|billing (?:hard )?limit|insufficient[ _-]?(?:quota|credit|funds)|exceeded your current quota)\b/i;

function pickServiceErrorMessage(line: string): string | null {
  const re = /"message":"((?:[^"\\]|\\.)*)"/g;
  let fallback: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    let value: string;
    try {
      value = JSON.parse(`"${match[1]}"`);
    } catch {
      value = match[1]!;
    }
    value = value.trim();
    if (SERVICE_ERROR_MESSAGE_RE.test(value)) return value;
    if (!fallback) fallback = value;
  }
  return fallback && SERVICE_ERROR_MESSAGE_RE.test(fallback) ? fallback : null;
}

function codeFromStatus(statusCode: number): AgentServiceFailureCode | null {
  if (statusCode === 401 || statusCode === 403) return 'AGENT_AUTH_REQUIRED';
  if (statusCode === 429) return 'RATE_LIMITED';
  if (statusCode >= 500 && statusCode <= 599) return 'UPSTREAM_UNAVAILABLE';
  return null;
}

function defaultMessageForCode(code: AgentServiceFailureCode): string {
  switch (code) {
    case 'AGENT_AUTH_REQUIRED':
      return 'OpenCode could not authenticate with the model provider.';
    case 'RATE_LIMITED':
      return 'OpenCode hit a provider usage or rate limit.';
    case 'UPSTREAM_UNAVAILABLE':
      return "OpenCode's model provider is temporarily unavailable.";
  }
}

// Classify the latest `service=llm` provider error in an OpenCode log tail.
// We scope to that single line so the huge request body of *other* lines
// can't leak in, key the classification on the unambiguous HTTP `statusCode`
// first, and fall back to keyword matching the extracted message only.
export function extractOpenCodeServiceFailure(
  logTail: string,
): OpenCodeServiceFailure | null {
  if (!logTail || !logTail.trim()) return null;
  const lines = logTail.split(/\r?\n/);
  let line: string | null = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i]!;
    if (
      candidate.includes('service=llm') &&
      /\bERROR\b/.test(candidate) &&
      candidate.includes('error=')
    ) {
      line = candidate;
      break;
    }
  }
  if (!line) return null;

  const statusMatch = /"statusCode":\s*(\d{3})/.exec(line);
  const statusCode = statusMatch ? Number(statusMatch[1]) : null;
  const message = pickServiceErrorMessage(line);

  let code: AgentServiceFailureCode | null =
    statusCode != null ? codeFromStatus(statusCode) : null;
  if (!code && message) code = classifyAgentServiceFailure(message);
  if (!code) return null;
  const retryable = code === 'UPSTREAM_UNAVAILABLE' || (
    code === 'RATE_LIMITED' && !HARD_QUOTA_MESSAGE_RE.test(message ?? '')
  );

  return { code, message: message || defaultMessageForCode(code), retryable, statusCode };
}

// Convenience for the run close handler / inactivity watchdog: resolve the
// log dir from the spawned agent's env, read the newest log tail (bound to
// the current run via `since`), and classify it.
export function readOpenCodeServiceFailure(
  env: Record<string, string | undefined>,
  options: { since?: number } = {},
): OpenCodeServiceFailure | null {
  const logDir = resolveOpenCodeLogDir(env);
  if (!logDir) return null;
  const tail = readLatestOpenCodeLogTail(logDir, options);
  if (!tail) return null;
  return extractOpenCodeServiceFailure(tail);
}