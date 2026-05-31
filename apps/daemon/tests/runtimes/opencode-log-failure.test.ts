import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractOpenCodeServiceFailure,
  readLatestOpenCodeLogTail,
  readOpenCodeServiceFailure,
  resolveOpenCodeLogDir,
} from '../../src/runtimes/opencode-log.js';

// Faithful `service=llm` error line for an over-quota opencode-go call. The
// embedded request body carries decoy phrases ("api key", "rate limit")
// inside a `"content"` field to prove the classifier keys on the error's
// statusCode + `"message"`, never arbitrary prompt text.
const USAGE_LIMIT_LINE =
  'ERROR 2026-05-29T10:00:00 +5ms service=llm providerID=opencode-go modelID=deepseek-v4-pro session.id=ses_x ' +
  'error={"error":{"name":"AI_APICallError",' +
  '"requestBodyValues":{"messages":[{"role":"system","content":"Provide your api key and mind the rate limit."}]},' +
  '"statusCode":429,"isRetryable":true,' +
  '"message":"Monthly usage limit reached. Resets in 6 days. Enable usage at https://opencode.ai/workspace/wrk_x/go"}}';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-opencode-log-'));
}

describe('extractOpenCodeServiceFailure', () => {
  it('classifies a 429 usage-limit line as RATE_LIMITED with the real message', () => {
    const failure = extractOpenCodeServiceFailure(USAGE_LIMIT_LINE);
    expect(failure).not.toBeNull();
    expect(failure!.code).toBe('RATE_LIMITED');
    expect(failure!.statusCode).toBe(429);
    expect(failure!.message).toContain('Monthly usage limit reached');
    expect(failure!.message).toContain('Resets in 6 days');
    // Decoy text in the request body must not leak into the reason.
    expect(failure!.message).not.toContain('api key');
  });

  it('classifies a 401 line as AGENT_AUTH_REQUIRED', () => {
    const line =
      'ERROR 2026-05-29T10:00:00 +5ms service=llm providerID=openai ' +
      'error={"error":{"name":"AI_APICallError","statusCode":401,"message":"Unauthorized: invalid API key"}}';
    const failure = extractOpenCodeServiceFailure(line);
    expect(failure!.code).toBe('AGENT_AUTH_REQUIRED');
    expect(failure!.statusCode).toBe(401);
  });

  it('classifies a 503 line as UPSTREAM_UNAVAILABLE', () => {
    const line =
      'ERROR 2026-05-29T10:00:00 +5ms service=llm providerID=opencode-go ' +
      'error={"error":{"name":"AI_APICallError","statusCode":503,"message":"Service temporarily unavailable"}}';
    expect(extractOpenCodeServiceFailure(line)!.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('falls back to message keywords when no statusCode is present', () => {
    const line =
      'ERROR 2026-05-29T10:00:00 +5ms service=llm providerID=opencode-go ' +
      'error={"error":{"name":"ProviderError","message":"You have exceeded your current quota."}}';
    expect(extractOpenCodeServiceFailure(line)!.code).toBe('RATE_LIMITED');
  });

  it('picks the most recent llm error when several are present', () => {
    const tail = [
      'ERROR 2026-05-29T10:00:00 +5ms service=llm error={"error":{"statusCode":503,"message":"unavailable"}}',
      'ERROR 2026-05-29T10:00:10 +5ms service=llm error={"error":{"statusCode":429,"message":"usage limit reached"}}',
    ].join('\n');
    const failure = extractOpenCodeServiceFailure(tail);
    expect(failure!.code).toBe('RATE_LIMITED');
    expect(failure!.statusCode).toBe(429);
  });

  it('returns null for ordinary (non-error) log output', () => {
    const tail = [
      'INFO 2026-05-29T10:00:00 +1ms service=bus type=message.part.delta publishing',
      'INFO 2026-05-29T10:00:00 +1ms service=bus type=message.part.updated publishing',
    ].join('\n');
    expect(extractOpenCodeServiceFailure(tail)).toBeNull();
    expect(extractOpenCodeServiceFailure('')).toBeNull();
  });
});

describe('resolveOpenCodeLogDir', () => {
  it('prefers XDG_DATA_HOME, falls back to HOME, else null', () => {
    expect(resolveOpenCodeLogDir({ XDG_DATA_HOME: '/x' })).toBe(
      path.join('/x', 'opencode', 'log'),
    );
    expect(resolveOpenCodeLogDir({ HOME: '/home/u' })).toBe(
      path.join('/home/u', '.local', 'share', 'opencode', 'log'),
    );
    expect(resolveOpenCodeLogDir({})).toBeNull();
  });
});

describe('readLatestOpenCodeLogTail', () => {
  it('reads the lexicographically-newest .log file', () => {
    const dir = fresh();
    writeFileSync(path.join(dir, '2026-05-29T090000.log'), 'OLD');
    writeFileSync(path.join(dir, '2026-05-29T100000.log'), 'NEWEST');
    expect(readLatestOpenCodeLogTail(dir)).toBe('NEWEST');
  });

  it('returns only the tail when the file exceeds maxBytes', () => {
    const dir = fresh();
    writeFileSync(path.join(dir, 'a.log'), 'X'.repeat(100) + 'TAIL');
    expect(readLatestOpenCodeLogTail(dir, { maxBytes: 4 })).toBe('TAIL');
  });

  it('returns null when the log dir does not exist', () => {
    expect(readLatestOpenCodeLogTail(path.join(fresh(), 'missing'))).toBeNull();
  });

  it('skips a log last written before `since` (binds to the current run)', () => {
    const dir = fresh();
    const stale = path.join(dir, '2026-05-29T080000.log');
    writeFileSync(stale, 'STALE');
    const runStart = Date.now();
    // Backdate the file to before the run started → it belongs to an
    // earlier session and must not be read for this run.
    const before = new Date(runStart - 60_000);
    utimesSync(stale, before, before);
    expect(readLatestOpenCodeLogTail(dir, { since: runStart })).toBeNull();
  });

  it('returns a log written at/after `since`', () => {
    const dir = fresh();
    const current = path.join(dir, '2026-05-29T100000.log');
    writeFileSync(current, 'CURRENT');
    expect(readLatestOpenCodeLogTail(dir, { since: Date.now() - 5_000 })).toBe(
      'CURRENT',
    );
  });
});

describe('readOpenCodeServiceFailure (end to end from env)', () => {
  it('resolves HOME → log dir → newest tail → classification', () => {
    const home = fresh();
    const logDir = path.join(home, '.local', 'share', 'opencode', 'log');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(path.join(logDir, '2026-05-29T100000.log'), USAGE_LIMIT_LINE);

    const failure = readOpenCodeServiceFailure({ HOME: home });
    expect(failure!.code).toBe('RATE_LIMITED');
    expect(failure!.message).toContain('Monthly usage limit reached');
  });

  it('returns null when env carries no usable home', () => {
    expect(readOpenCodeServiceFailure({})).toBeNull();
  });

  it('does not attribute a stale session error to the current run (since gate)', () => {
    const home = fresh();
    const logDir = path.join(home, '.local', 'share', 'opencode', 'log');
    mkdirSync(logDir, { recursive: true });
    const stale = path.join(logDir, '2026-05-29T080000.log');
    writeFileSync(stale, USAGE_LIMIT_LINE);
    const runStart = Date.now();
    const before = new Date(runStart - 60_000);
    utimesSync(stale, before, before);
    expect(
      readOpenCodeServiceFailure({ HOME: home }, { since: runStart }),
    ).toBeNull();
  });
});
