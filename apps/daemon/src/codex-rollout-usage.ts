// codex reports only a cumulative `turn.completed` usage on the exec/json
// stream the daemon consumes, so the stream cannot tell us the cache-hit rate
// of a turn's OPENING model call — the signal session-reuse moves. codex does
// record per-call usage in its rollout JSONL though: each `token_count`
// `event_msg` carries `info.last_token_usage` (the most recent single call,
// OpenAI-style where `input_tokens` INCLUDES the `cached_input_tokens` subset).
//
// A rollout accumulates every turn of a session, one `task_started` per turn.
// The first `token_count` after the LAST `task_started` is the opening call of
// the turn the daemon just finished — exactly the first-call number we want.
// This module is the pure extractor; locating the rollout file for a run lives
// at the call site (it needs CODEX_HOME + the captured session id).

import os from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface CodexFirstCallUsage {
  first_call_input_tokens: number;
  first_call_cache_read_input_tokens: number;
  first_call_cache_hit_ratio: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Recover the codex thread/session uuid captured for a run from its stored
 * event stream. json-event-stream emits it as `sessionId` on the first
 * `initializing` status event (mirroring claude). Returns the first one found,
 * or null. Matches the `{ event: 'agent', data: {...} }` envelope the run uses.
 */
export function codexSessionIdFromRunEvents(events: unknown): string | null {
  if (!Array.isArray(events)) return null;
  for (const ev of events) {
    const record = asRecord(ev);
    const data = asRecord(record?.data);
    if (record?.event !== 'agent' || data?.type !== 'status') continue;
    const sessionId = data.sessionId;
    if (typeof sessionId === 'string' && sessionId.trim()) return sessionId;
  }
  return null;
}

/**
 * Extract the first-call usage of the rollout's LAST turn — the turn the daemon
 * has just finished. Returns null when the rollout has no completed first call
 * to read (no `last_token_usage`, or an empty/zero-input call), so callers can
 * cleanly fall back to leaving the codex first-call fields unset rather than
 * reporting a bogus ratio.
 */
export function extractCodexLastTurnFirstCallUsage(
  rolloutJsonl: string,
): CodexFirstCallUsage | null {
  let firstCall: CodexFirstCallUsage | null = null;

  for (const line of rolloutJsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const record = asRecord(parsed);
    if (!record) continue;
    const payload = asRecord(record.payload);
    const payloadType = payload?.type;

    if (payloadType === 'task_started') {
      // A new turn opens; reset so we capture THIS turn's opening call and let
      // the last turn in the file win.
      firstCall = null;
      continue;
    }

    if (payloadType !== 'token_count' || firstCall !== null) continue;

    const info = asRecord(payload?.info);
    const last = asRecord(info?.last_token_usage);
    if (!last) continue;
    const input = finiteNumber(last.input_tokens);
    // codex's input_tokens already includes the cached subset; a zero-input
    // token_count is a placeholder (e.g. an interrupted call) with no usable
    // ratio, so skip it and keep scanning for the turn's real first call.
    if (input === undefined || input <= 0) continue;
    const cached = finiteNumber(last.cached_input_tokens) ?? 0;

    firstCall = {
      first_call_input_tokens: input,
      first_call_cache_read_input_tokens: cached,
      first_call_cache_hit_ratio: cached / input,
    };
  }

  return firstCall;
}

// codex names each rollout `rollout-<timestamp>-<thread_id>.jsonl` under
// `$CODEX_HOME/sessions/<year>/<month>/<day>/`. We match on the thread id
// suffix (captured from the run's `thread.started`) so concurrent runs can't
// collide.
function rolloutFileMatchesSession(fileName: string, sessionId: string): boolean {
  return fileName.startsWith('rollout-') && fileName.endsWith(`-${sessionId}.jsonl`);
}

async function findCodexRolloutPath(
  codexHome: string,
  sessionId: string,
): Promise<string | null> {
  const sessionsDir = path.join(codexHome, 'sessions');
  // Walk year/month/day newest-first so this run's just-written rollout is hit
  // almost immediately instead of scanning the whole history.
  const descend = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a));
  };
  // The rollout we want was written by the run that just finished, so it lives
  // in one of the most recent day-dirs. Cap how many we scan: on a HIT we stop
  // at the first match (today, usually the first dir), and on a MISS (session
  // captured but file relocated/deleted) this bounds the walk to a handful of
  // readdirs instead of the user's entire codex history.
  const MAX_DAY_DIRS = 8;
  let dayDirsScanned = 0;
  for (const year of await descend(sessionsDir)) {
    const yearDir = path.join(sessionsDir, year);
    for (const month of await descend(yearDir)) {
      const monthDir = path.join(yearDir, month);
      for (const day of await descend(monthDir)) {
        const dayDir = path.join(monthDir, day);
        const files = await readdir(dayDir).catch(() => []);
        const match = files.find((f) => rolloutFileMatchesSession(f, sessionId));
        if (match) return path.join(dayDir, match);
        if (++dayDirsScanned >= MAX_DAY_DIRS) return null;
      }
    }
  }
  return null;
}

/**
 * Locate and read this run's codex rollout, returning the first-call usage of
 * its last turn. Fully best-effort: any failure (no CODEX_HOME, no session id,
 * missing rollout, unreadable file, partial turn) resolves to null so the
 * run_finished analytics path simply omits codex first-call fields rather than
 * failing the capture.
 */
export async function readCodexRolloutFirstCall(opts: {
  codexHome: string | null | undefined;
  sessionId: string | null | undefined;
}): Promise<CodexFirstCallUsage | null> {
  // codex resolves its home as `$CODEX_HOME || ~/.codex`. The daemon only sets
  // CODEX_HOME when sandbox mode relocates it; with sandbox off the resolver
  // returns empty and codex writes under ~/.codex, so mirror that default here
  // rather than giving up (which silently dropped every non-sandboxed run).
  const codexHome = opts.codexHome?.trim() || path.join(os.homedir(), '.codex');
  const sessionId = opts.sessionId?.trim();
  if (!sessionId) return null;
  try {
    const rolloutPath = await findCodexRolloutPath(codexHome, sessionId);
    if (!rolloutPath) return null;
    const contents = await readFile(rolloutPath, 'utf8');
    return extractCodexLastTurnFirstCallUsage(contents);
  } catch {
    return null;
  }
}
