import { describe, expect, it } from 'vitest';
import { latestUserPromptText } from '../../src/runtime/latest-user-prompt';
import type { ChatMessage } from '../../src/types';

function message(role: ChatMessage['role'], content: string, id = content): ChatMessage {
  return { id, role, content };
}

describe('latestUserPromptText', () => {
  it('returns null for an empty conversation', () => {
    expect(latestUserPromptText([])).toBeNull();
  });

  it('returns null when the assistant has spoken but the user has not', () => {
    expect(latestUserPromptText([message('assistant', 'Ready when you are.')])).toBeNull();
  });

  it('picks the most recent user turn, not the first', () => {
    const messages = [
      message('user', 'Build a portfolio'),
      message('assistant', 'On it.'),
      message('user', 'Actually make it a landing page'),
    ];
    expect(latestUserPromptText(messages)).toBe('Actually make it a landing page');
  });

  it('collapses hard-wrapped whitespace into one line', () => {
    expect(latestUserPromptText([message('user', '  Build   a\n\nportfolio  ')])).toBe(
      'Build a portfolio',
    );
  });

  it('skips a blank user turn and falls back to the previous one', () => {
    const messages = [message('user', 'Build a portfolio'), message('user', '   ', 'blank')];
    expect(latestUserPromptText(messages)).toBe('Build a portfolio');
  });

  it('elides a prompt that would overrun the empty state', () => {
    const long = 'a'.repeat(400);
    const result = latestUserPromptText([message('user', long)]);
    expect(result).toHaveLength(161);
    expect(result?.endsWith('…')).toBe(true);
  });
});
