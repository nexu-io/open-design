import { describe, expect, it } from 'vitest';
import { assistantMessageEmittedQuestionForm } from '../../src/runtimes/question-message.js';

describe('assistantMessageEmittedQuestionForm', () => {
  it('recognizes a renderable question form from the message content', () => {
    const result = assistantMessageEmittedQuestionForm({
      get: () => ({ content: '<question-form>{"questions":[{"id":"name"}]}</question-form>' }),
    }, 'message-1');

    expect(result).toBe(true);
  });

  it('returns false for absent ids, missing messages, and non-renderable content', () => {
    let calls = 0;
    const messages = {
      get: () => {
        calls += 1;
        return null;
      },
    };

    expect(assistantMessageEmittedQuestionForm(messages, null)).toBe(false);
    expect(assistantMessageEmittedQuestionForm(messages, 'message-1')).toBe(false);
    expect(calls).toBe(1);
  });
});
