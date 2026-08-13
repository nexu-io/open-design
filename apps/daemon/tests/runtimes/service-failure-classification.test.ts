import { describe, expect, it } from 'vitest';
import { classifyAgentServiceFailure } from '../../src/runtimes/auth.js';

describe('classifyAgentServiceFailure', () => {
  it('classifies auth failures (Claude Code / codex style)', () => {
    for (const text of [
      'Error: 401 {"type":"authentication_error","message":"invalid x-api-key"}',
      'Incorrect API key provided: sk-***. ',
      'Please run /login to authenticate.',
      'Unauthorized: OAuth token has expired',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('AGENT_AUTH_REQUIRED');
    }
  });

  it('classifies quota / rate-limit / balance failures', () => {
    for (const text of [
      'Error: 429 Too Many Requests',
      'rate_limit_error: rate limit exceeded',
      'You exceeded your current quota, please check your plan and billing details.',
      'Your credit balance is too low to access the Anthropic API.',
      'insufficient_quota',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('RATE_LIMITED');
    }
  });

  // Refs #6143. A bare `quota` alternative used to sit in the rate matcher, so
  // this classifier reported the daemon's own generic empty-output fallback as
  // a provider rate limit — on every surface that consumes it (chat error text,
  // connection test, opencode log parsing, and `classifyRunFailure`).
  it('does not treat a bare, uncorroborated `quota` mention as a rate limit', () => {
    for (const text of [
      // The daemon's fallback, verbatim (apps/daemon/src/server.ts).
      'Agent completed without producing any output. The model or provider may ' +
        'have returned an empty response. Check the agent logs for upstream ' +
        'errors, then try re-authenticating the agent, checking quota, or ' +
        'switching models.',
      'Run `agent quota` to see current usage.',
      'quota.ts:42 TypeError: cannot read properties of undefined',
    ]) {
      expect(classifyAgentServiceFailure(text), text).toBeNull();
    }
  });

  it('still classifies quota mentions that are exhaustion phrases or corroborated', () => {
    for (const text of [
      'quota exhausted',
      'quota exceeded',
      'Quota depleted for this account.',
      'You have exceeded your monthly quota.',
      'Your plan has no quota left for this model.',
      'Wallet quota unavailable — top up to continue.',
    ]) {
      expect(classifyAgentServiceFailure(text), text).toBe('RATE_LIMITED');
    }
  });

  it('classifies upstream/provider failures', () => {
    for (const text of [
      'Error: 529 {"type":"overloaded_error"}',
      'Service temporarily unavailable (503)',
      'Bad gateway',
      'The model is currently overloaded. Please try again later.',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('UPSTREAM_UNAVAILABLE');
    }
  });

  it('classifies a 5xx only with status context, not a bare number', () => {
    for (const text of [
      'HTTP 500 from provider',
      'status 503',
      'server error 502',
      '502 Bad Gateway',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('UPSTREAM_UNAVAILABLE');
    }
  });

  it('requires status context for auth/rate numbers too', () => {
    expect(classifyAgentServiceFailure('HTTP 401 Unauthorized')).toBe('AGENT_AUTH_REQUIRED');
    expect(classifyAgentServiceFailure('status code 429')).toBe('RATE_LIMITED');
  });

  it('checks auth before rate/upstream so a 401 is never misread', () => {
    expect(
      classifyAgentServiceFailure('401 unauthorized — also saw a 503 earlier'),
    ).toBe('AGENT_AUTH_REQUIRED');
  });

  it('returns null for ordinary process failures and empty text', () => {
    expect(classifyAgentServiceFailure('')).toBeNull();
    expect(classifyAgentServiceFailure('spawn ENOENT')).toBeNull();
    expect(
      classifyAgentServiceFailure('Segmentation fault (core dumped)'),
    ).toBeNull();
    expect(
      classifyAgentServiceFailure('TypeError: cannot read properties of undefined'),
    ).toBeNull();
  });

  it('does not misread unrelated numbers (line/size/duration) as a provider outage', () => {
    for (const text of [
      'Compiled 500 modules in 503ms; read 502 bytes at line 529',
      'Build failed at line 500 (exit code 1)',
      'Processed 4290 rows, 401 skipped, took 4290ms',
      'wrote 502 files',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBeNull();
    }
  });

  it('does not treat a process exit code as an HTTP status', () => {
    for (const text of [
      'exit code 401',
      'process exited with code 429',
      'command failed: exit code 503',
      'child process exited with code 500',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBeNull();
    }
  });
});
