import { describe, expect, it } from 'vitest';
import { diagnoseClaudeCliFailure } from '../src/claude-diagnostics.js';

describe('diagnoseClaudeCliFailure', () => {
  it('maps Claude Not logged in stdout to /login guidance (#1928)', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stdoutTail: 'Not logged in · Please run /login.',
      env: {},
    });

    expect(diagnostic?.message).toContain('/login');
    expect(diagnostic?.detail).toContain('CLAUDE_CONFIG_DIR');
  });

  it('maps Claude auth failures to /login guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '{"apiKeySource":"none","error_status":401}',
      env: {},
    });

    expect(diagnostic?.message).toContain('/login');
    expect(diagnostic?.detail).toContain('CLAUDE_CONFIG_DIR');
  });

  it('maps custom endpoint model access failures to endpoint guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail:
        'Error: The selected model is not available in your current plan or region.',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.com' },
    });

    expect(diagnostic?.message).toContain('custom endpoint');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
  });

  it('maps custom endpoint auth failures to endpoint credential guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '{"apiKeySource":"none","error_status":401}',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.com' },
    });

    expect(diagnostic?.message).toContain('custom Anthropic endpoint');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
    expect(diagnostic?.detail).toContain('proxy credentials');
    expect(diagnostic?.detail).not.toContain('use `/login`');
  });

  it('maps custom endpoint connection refusals before generic auth guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail:
        '{"apiKeySource":"none"} API Error: Unable to connect to API (ConnectionRefused)',
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1337' },
    });

    expect(diagnostic?.message).toContain('could not reach');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
    expect(diagnostic?.detail).toContain('refused the connection');
    expect(diagnostic?.detail).not.toContain('could not authenticate');
    expect(diagnostic?.detail).not.toContain('use `/login`');
  });

  it('maps silent custom endpoint exits to endpoint guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '',
      stdoutTail: '',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.com' },
    });

    expect(diagnostic?.message).toContain('custom Anthropic endpoint');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
    expect(diagnostic?.detail).toContain('proxy credentials');
    expect(diagnostic?.detail).not.toContain('use `/login`');
  });

  it('maps silent configured-profile exits to profile guidance', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '',
      stdoutTail: '',
      env: { CLAUDE_CONFIG_DIR: '/tmp/claude-alt' },
    });

    expect(diagnostic?.message).toContain('configured Claude profile');
    expect(diagnostic?.detail).toContain('Re-run `claude` and `/login` for that profile');
    expect(diagnostic?.detail).toContain('Effective CLAUDE_CONFIG_DIR: /tmp/claude-alt');
  });

  it('includes configured Claude config directory context', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: 'Authentication failed: token expired',
      env: { CLAUDE_CONFIG_DIR: '/tmp/claude-alt' },
    });

    expect(diagnostic?.detail).toContain('Effective CLAUDE_CONFIG_DIR: /tmp/claude-alt');
  });

  it('does not classify unrelated non-Claude failures', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'codex',
      exitCode: 1,
      stderrTail: 'Authentication failed',
      env: {},
    });

    expect(diagnostic).toBeNull();
  });

  it('redacts token-like text from returned details', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '401 Authorization: Bearer abcdef0123456789ABCDEF==',
      env: {},
    });

    expect(diagnostic?.detail).not.toContain('abcdef0123456789ABCDEF');
    expect(diagnostic?.detail).toContain('[REDACTED:bearer_token]');
  });

  it('redacts provider header and query API keys from returned details', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail:
        '401 x-api-key: header-secret-123 url=https://proxy.example.test/v1?key=query-secret-456',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.test' },
    });

    expect(diagnostic?.detail).not.toContain('header-secret-123');
    expect(diagnostic?.detail).not.toContain('query-secret-456');
    expect(diagnostic?.detail).toContain('x-api-key: [REDACTED:api_key_header]');
    expect(diagnostic?.detail).toContain('?key=[REDACTED:api_key_query]');
  });

  it('redacts quoted provider API key headers from returned details', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: '401 {"x-api-key":"secret-value-123"}',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.test' },
    });

    expect(diagnostic?.detail).not.toContain('secret-value-123');
    expect(diagnostic?.detail).toContain('"x-api-key":"[REDACTED:api_key_header]"');
  });

  it('redacts long bearer tokens before taking the diagnostic tail', () => {
    const credential = 'a'.repeat(300);
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: `401 Authorization: Bearer ${credential}`,
      env: {},
    });

    expect(diagnostic?.detail).not.toContain('a'.repeat(80));
    expect(diagnostic?.detail).toContain('[REDACTED:bearer_token]');
  });

  it('redacts long provider API key headers before taking the diagnostic tail', () => {
    const credential = 'b'.repeat(300);
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: `401 x-api-key: ${credential}`,
      env: { ANTHROPIC_BASE_URL: 'https://proxy.example.test' },
    });

    expect(diagnostic?.detail).not.toContain('b'.repeat(80));
    expect(diagnostic?.detail).toContain('x-api-key: [REDACTED:api_key_header]');
  });

  it('maps mid-stream socket drops to a retryable connection diagnostic', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail:
        'API Error: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
      env: {},
    });

    expect(diagnostic?.message).toContain('lost its connection');
    expect(diagnostic?.message).toContain('Anthropic API');
    expect(diagnostic?.detail).toContain('Retry');
    expect(diagnostic?.detail).not.toContain('/login');
    expect(diagnostic?.retryable).toBe(true);
    expect(diagnostic?.code).toBe('AGENT_CONNECTION_DROPPED');
  });

  it('uses OpenClaude copy for OpenClaude mid-stream socket drops', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: 'API Error: The socket connection was closed unexpectedly.',
      env: {},
      resolvedBin: '/usr/local/bin/openclaude',
    });

    expect(diagnostic?.message).toContain('OpenClaude lost its connection');
    expect(diagnostic?.message).toContain('its configured endpoint');
    expect(diagnostic?.detail).not.toContain('Claude Code');
    expect(diagnostic?.detail).not.toContain('Anthropic API');
    expect(diagnostic?.retryable).toBe(true);
  });

  // Captured verbatim from the real Claude Code CLI (2.1.168, official auth,
  // no ANTHROPIC_BASE_URL) driven through a local proxy that reset the TLS
  // tunnel mid-stream. The CLI retried internally for ~3 minutes, then emitted
  // this on stdout as a result frame with is_error:true and exited 1.
  it('classifies the real "Unable to connect to API (ECONNRESET)" transcript', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stdoutTail:
        '{"type":"result","subtype":"success","is_error":true,"result":"API Error: Unable to connect to API (ECONNRESET)","stop_reason":"stop_sequence"}',
      env: {},
    });

    expect(diagnostic?.message).toContain('lost its connection to the Anthropic API');
    expect(diagnostic?.detail).not.toContain('/login');
    expect(diagnostic?.retryable).toBe(true);
    expect(diagnostic?.code).toBe('AGENT_CONNECTION_DROPPED');
  });

  it('does not classify generic first-connect API failures as mid-stream drops', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stdoutTail:
        '{"type":"result","subtype":"success","is_error":true,"result":"API Error: Unable to connect to API (ENOTFOUND)","stop_reason":"stop_sequence"}',
      env: {},
    });

    expect(diagnostic).toBeNull();
  });

  it('classifies ECONNRESET and socket hang up as connection drops', () => {
    for (const tail of ['Error: socket hang up', 'read ECONNRESET', 'TypeError: fetch failed']) {
      const diagnostic = diagnoseClaudeCliFailure({
        agentId: 'claude',
        exitCode: 1,
        stderrTail: tail,
        env: {},
      });
      expect(diagnostic?.message, tail).toContain('lost its connection');
    }
  });

  it('points socket drops at the proxy when a custom endpoint is configured', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: 'API Error: The socket connection was closed unexpectedly.',
      env: { ANTHROPIC_BASE_URL: 'https://relay.example.com' },
    });

    expect(diagnostic?.message).toContain('custom Anthropic endpoint');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
    expect(diagnostic?.detail).toContain('timeout');
  });

  it('uses OpenClaude copy for OpenClaude custom endpoint socket drops', () => {
    const diagnostic = diagnoseClaudeCliFailure({
      agentId: 'claude',
      exitCode: 1,
      stderrTail: 'API Error: The socket connection was closed unexpectedly.',
      env: { ANTHROPIC_BASE_URL: 'https://relay.example.com' },
      resolvedBin: '/usr/local/bin/openclaude',
    });

    expect(diagnostic?.message).toContain('OpenClaude lost its connection');
    expect(diagnostic?.message).toContain('custom Anthropic endpoint');
    expect(diagnostic?.detail).toContain('ANTHROPIC_BASE_URL');
    expect(diagnostic?.detail).toContain('OpenClaude endpoint configuration');
    expect(diagnostic?.detail).not.toContain('Claude Code');
  });
});
