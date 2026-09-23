import { describe, expect, it } from 'vitest';
import { classifyAgentServiceFailure } from '../../src/runtimes/auth.js';

describe('classifyAgentServiceFailure', () => {
  it('classifies the official DeepSeek Harness missing-credential failure', () => {
    expect(
      classifyAgentServiceFailure(
        'dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; export DEEPSEEK_API_KEY',
      ),
    ).toBe('AGENT_AUTH_REQUIRED');
  });

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

  // R-053 (`specs/current/run-error-catalog.md:215`). vela's link gateway maps
  // an upstream 401/403 onto its own HTTP 500 with a code that names WHOSE
  // credentials failed: `upstream_provider_unauthenticated` /
  // `upstream_provider_forbidden`
  // (`services/link/internal/handlers/openai.go:2074`). They are the gateway's
  // configured credentials, not the caller's. The message vela pairs with the
  // code — "Upstream provider credentials are missing or invalid." — matches
  // this classifier's `credentials (?:are )?missing` alternative, so before
  // this the platform's own misconfiguration was reported to the user as
  // `AGENT_AUTH_REQUIRED` and rendered as "Sign-in required".
  //
  // The code, not the sentence, decides: a self-identifying machine code
  // outranks a guess read off prose, which is the same precedence the daemon
  // already applies through `evidenceLevel: 'structured_code'`.
  it('reads the gateway own provider-credential codes as a service outage, not the caller signed out', () => {
    for (const text of [
      'API request failed with status 500: upstream_provider_unauthenticated',
      '[code=upstream_provider_unauthenticated] Upstream provider credentials are missing or invalid.',
      '[code=upstream_provider_forbidden] Upstream provider rejected access for the configured credentials.',
      'json-rpc id 4: opencode event stream: {"properties":{"error":{"data":{"message":"\\"[code=upstream_provider_unauthenticated] Upstream provider credentials are missing or invalid.\\""}}}}',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('UPSTREAM_UNAVAILABLE');
    }
  });

  // The reverse guard. The rule above keys on the gateway's compound code, so
  // it must not swallow the caller's own 401 — including the one whose body is
  // the bare `unauthenticated` code that the compound one ends with.
  it('still reads the caller own credential failures as auth', () => {
    for (const text of [
      'API request failed with status 401: unauthenticated',
      'API request failed with status 401: invalid_api_key',
      'API request failed with status 401: missing_api_key',
      'HTTP 401 Unauthorized',
      'Error: 401 {"type":"authentication_error","message":"invalid x-api-key"}',
    ]) {
      expect(classifyAgentServiceFailure(text)).toBe('AGENT_AUTH_REQUIRED');
    }
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
