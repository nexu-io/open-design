import { describe, expect, it } from 'vitest';

import { type ChatRunCreateRequest, type McpRunCreateRequest } from '../src/api/chat';

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
      model: 'gpt-5.5',
      serviceTier: 'priority',
    };
    expect(full.projectId).toBe('proj-2');
    expect(full.message).toBe('Build a pitch deck');
    expect(full.agentId).toBe('claude');
    expect(full.model).toBe('gpt-5.5');
    expect(full.serviceTier).toBe('priority');
  });

  it('accepts projectId + message with agentId omitted (daemon resolves default)', () => {
    const withoutAgent: McpRunCreateRequest = {
      projectId: 'proj-3',
      message: 'Make a landing page',
    };
    expect(withoutAgent.agentId).toBeUndefined();
    expect(withoutAgent.message).toBe('Make a landing page');
  });

  it('accepts conversationId without assistantMessageId (daemon mints pin)', () => {
    const omitPin: McpRunCreateRequest = {
      projectId: 'proj-4',
      conversationId: 'conv-4',
      message: 'Eval multi-turn without client pin',
    };
    expect(omitPin.conversationId).toBe('conv-4');
    expect(omitPin.assistantMessageId).toBeUndefined();
  });

  it('accepts conversationId + client-supplied assistantMessageId', () => {
    const withPin: McpRunCreateRequest = {
      projectId: 'proj-5',
      conversationId: 'conv-5',
      assistantMessageId: 'asst-5',
      message: 'Turn with client pin',
    };
    expect(withPin.assistantMessageId).toBe('asst-5');
  });
});

describe('ChatRunCreateRequest contract', () => {
  it('accepts conversationId without assistantMessageId (daemon mints pin)', () => {
    const omitPin: ChatRunCreateRequest = {
      agentId: 'claude',
      message: 'Web or API omit-pin turn',
      projectId: 'proj-chat-1',
      conversationId: 'conv-chat-1',
      clientRequestId: 'req-1',
    };
    expect(omitPin.conversationId).toBe('conv-chat-1');
    expect(omitPin.assistantMessageId).toBeUndefined();
  });

  it('accepts client-supplied assistantMessageId when present', () => {
    const withPin: ChatRunCreateRequest = {
      agentId: 'claude',
      message: 'Pinned turn',
      projectId: 'proj-chat-2',
      conversationId: 'conv-chat-2',
      assistantMessageId: 'asst-chat-2',
      clientRequestId: 'req-2',
    };
    expect(withPin.assistantMessageId).toBe('asst-chat-2');
  });
});
