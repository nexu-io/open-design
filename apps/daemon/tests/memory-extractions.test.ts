import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetExtractionsForTests,
  captureExtractionOrigin,
  listExtractions,
  markFailed,
  startExtraction,
} from '../src/memory-extractions.js';

afterEach(() => {
  __resetExtractionsForTests();
});

describe('captureExtractionOrigin', () => {
  it('keeps a complete origin and drops blank optional ids', () => {
    expect(captureExtractionOrigin({
      projectId: 'project-a',
      conversationId: 'conversation-a',
      runId: 'run-a',
      assistantMessageId: 'draft-a',
    })).toEqual({
      projectId: 'project-a',
      conversationId: 'conversation-a',
      runId: 'run-a',
      assistantMessageId: 'draft-a',
    });

    expect(captureExtractionOrigin({
      projectId: 'project-a',
      conversationId: 'conversation-a',
      runId: '   ',
      assistantMessageId: '',
    })).toEqual({ projectId: 'project-a', conversationId: 'conversation-a' });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'project-a/conversation-a'],
    ['a missing project id', { conversationId: 'conversation-a' }],
    ['a blank project id', { projectId: '  ', conversationId: 'conversation-a' }],
    ['a missing conversation id', { projectId: 'project-a' }],
    ['a non-string conversation id', { projectId: 'project-a', conversationId: 7 }],
  ])('rejects %s', (_label, value) => {
    expect(captureExtractionOrigin(value)).toBeUndefined();
  });
});

describe('markFailed failure text', () => {
  it('uses the thrown error message and flattens its newlines', () => {
    const id = startExtraction({ userMessage: 'hello' });
    markFailed(id, new Error('provider said no\nsecond line'));
    expect(listExtractions()[0]).toMatchObject({ phase: 'failed', error: 'provider said no second line' });
  });

  it('falls back to the thrown value itself', () => {
    const id = startExtraction({ userMessage: 'hello' });
    markFailed(id, 'plain failure');
    expect(listExtractions()[0]).toMatchObject({ phase: 'failed', error: 'plain failure' });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('uses the placeholder when the thrown value is %s', (_label, thrown) => {
    const id = startExtraction({ userMessage: 'hello' });
    markFailed(id, thrown);
    expect(listExtractions()[0]).toMatchObject({ phase: 'failed', error: 'unknown error' });
  });

  it('caps the recorded error text', () => {
    const id = startExtraction({ userMessage: 'hello' });
    markFailed(id, new Error('x'.repeat(400)));
    const error = listExtractions()[0]?.error ?? '';
    expect(error).toHaveLength(240);
    expect(error.endsWith('…')).toBe(true);
  });
});
