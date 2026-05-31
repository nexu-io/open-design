import { describe, expect, it } from 'vitest';

import { type McpRunCreateRequest } from '../src/api/chat';

describe('McpRunCreateRequest contract', () => {
  it('accepts projectId-only shape (typed callers need no cast)', () => {
    const minimal: McpRunCreateRequest = { projectId: 'proj-1' };
    expect(minimal.projectId).toBe('proj-1');
    expect(minimal.agentId).toBeUndefined();
    expect(minimal.message).toBeUndefined();
  });

  it('accepts projectId + message + agentId shape', () => {
    const full: McpRunCreateRequest = {
      projectId: 'proj-2',
      message: 'Build a pitch deck',
      agentId: 'claude',
    };
    expect(full.projectId).toBe('proj-2');
    expect(full.message).toBe('Build a pitch deck');
    expect(full.agentId).toBe('claude');
  });

  it('accepts projectId + message with agentId omitted (daemon resolves default)', () => {
    const withoutAgent: McpRunCreateRequest = {
      projectId: 'proj-3',
      message: 'Make a landing page',
    };
    expect(withoutAgent.agentId).toBeUndefined();
    expect(withoutAgent.message).toBe('Make a landing page');
  });
});
