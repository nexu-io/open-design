import { describe, expect, it } from 'vitest';

import {
  HANDOFF_SCHEMA_VERSION,
  type HandoffRequest,
  type HandoffResponse,
} from '../src/api/handoff';
import { API_ERROR_CODES } from '../src/errors';

describe('handoff contract', () => {
  it('exports a runtime schema-version marker so esbuild emits a .mjs (NodeNext requires it)', () => {
    // v2: conversationId became a required request field.
    expect(HANDOFF_SCHEMA_VERSION).toBe(2);
  });

  it('registers the handoff-specific error codes in the shared API error union', () => {
    // The handoff route emits these; they must be canonical ApiErrorCode
    // members so typed callers and contract-driven tests can represent the
    // responses and the daemon route cannot drift from the contract.
    expect(API_ERROR_CODES).toContain('CONVERSATION_NOT_FOUND');
    expect(API_ERROR_CODES).toContain('EMPTY_TRANSCRIPT');
  });

  it('HandoffRequest round-trips through JSON with the full shape preserved', () => {
    const original: HandoffRequest = {
      conversationId: 'conv-123',
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      maxTokens: 4096,
    };
    const restored = JSON.parse(JSON.stringify(original)) as HandoffRequest;

    expect(Object.keys(restored).sort()).toEqual([
      'apiKey',
      'baseUrl',
      'conversationId',
      'maxTokens',
      'model',
    ]);
    expect(restored.conversationId).toBe(original.conversationId);
    expect(restored.apiKey).toBe(original.apiKey);
    expect(restored.baseUrl).toBe(original.baseUrl);
    expect(restored.model).toBe(original.model);
    expect(restored.maxTokens).toBe(original.maxTokens);
  });

  it('HandoffRequest accepts the minimal shape (conversationId + BYOK + model; baseUrl + maxTokens optional)', () => {
    const minimal: HandoffRequest = {
      conversationId: 'conv-123',
      apiKey: 'sk-ant-test',
      model: 'claude-opus-4-7',
    };

    expect(Object.keys(minimal).sort()).toEqual(['apiKey', 'conversationId', 'model']);
  });

  it('HandoffResponse round-trips through JSON with the full shape preserved', () => {
    const original: HandoffResponse = {
      prompt: '## Context\n…',
      model: 'claude-opus-4-7',
      inputTokens: 1234,
      outputTokens: 567,
      transcriptMessageCount: 42,
    };
    const restored = JSON.parse(JSON.stringify(original)) as HandoffResponse;

    expect(Object.keys(restored).sort()).toEqual([
      'inputTokens',
      'model',
      'outputTokens',
      'prompt',
      'transcriptMessageCount',
    ]);
    expect(restored.prompt).toBe(original.prompt);
    expect(restored.model).toBe(original.model);
    expect(restored.inputTokens).toBe(original.inputTokens);
    expect(restored.outputTokens).toBe(original.outputTokens);
    expect(restored.transcriptMessageCount).toBe(original.transcriptMessageCount);
  });
});
