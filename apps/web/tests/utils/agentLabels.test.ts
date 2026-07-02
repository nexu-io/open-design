import { describe, expect, it } from 'vitest';

import {
  agentDisplayName,
  agentModelDisplayName,
  exactAgentDisplayName,
} from '../../src/utils/agentLabels';

describe('agentDisplayName', () => {
  it('returns the canonical label for known agent ids', () => {
    expect(agentDisplayName('claude')).toBe('Claude');
    expect(agentDisplayName('codex')).toBe('Codex');
    expect(agentDisplayName('cursor-agent')).toBe('Cursor');
  });

  it('resolves common aliases like "claude code" and "qodercli"', () => {
    expect(agentDisplayName('Claude Code')).toBe('Claude');
    expect(agentDisplayName('qodercli')).toBe('Qoder');
  });

  it('matches embedded substrings such as cursor-agent in a longer path', () => {
    expect(agentDisplayName('/opt/bin/cursor-agent')).toBe('Cursor');
  });

  it('falls back to a trimmed name when the id is unknown but the fallback is safe', () => {
    expect(agentDisplayName('unknown-id', '  My Bot  ')).toBe('My Bot');
  });

  it('rejects path-like id and fallback so unknown filesystem hints do not leak', () => {
    expect(agentDisplayName('/opt/unknown/runner', 'C:\\Tools\\runner.exe')).toBeNull();
  });

  it('returns null when both id and fallback are missing', () => {
    expect(agentDisplayName(undefined, null)).toBeNull();
  });
});

describe('exactAgentDisplayName', () => {
  it('returns the label only when the exact normalized key is a known agent', () => {
    expect(exactAgentDisplayName('Qoder CLI')).toBe('Qoder');
    expect(exactAgentDisplayName('qodercli.cmd')).toBe('Qoder');
    expect(exactAgentDisplayName('cursor-agent-fork')).toBeNull();
  });

  it('returns null for empty or nullish input', () => {
    expect(exactAgentDisplayName(null)).toBeNull();
    expect(exactAgentDisplayName('')).toBeNull();
  });
});

describe('agentModelDisplayName', () => {
  it('omits the model when it is undefined or the literal "default"', () => {
    expect(agentModelDisplayName('claude', 'Claude Code', undefined)).toBe('Claude');
    expect(agentModelDisplayName('claude', 'Claude Code', 'default')).toBe('Claude');
  });

  it('joins the agent label and model with a middle dot', () => {
    expect(agentModelDisplayName('codex', null, 'gpt-5.4')).toBe('Codex · gpt-5.4');
  });

  it('returns just the model id when no agent label can be derived', () => {
    expect(agentModelDisplayName(null, null, 'sonnet-4-6')).toBe('sonnet-4-6');
  });
});
