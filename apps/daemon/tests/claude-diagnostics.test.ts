import { describe, expect, it } from 'vitest';
import { diagnoseClaudeCliFailure } from '../src/claude-diagnostics.js';

describe('diagnoseClaudeCliFailure', () => {
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
});
