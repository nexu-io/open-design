import { describe, expect, it } from 'vitest';
import {
  historyWithPreviewContext,
  messageContentWithPreviewContext,
  samePreviewChatContext,
} from '../src/preview-chat-context';
import type { ChatMessage } from '../src/types';

describe('preview chat context', () => {
  it('adds the current visible preview page to a user message', () => {
    const content = messageContentWithPreviewContext('현재 보이는 페이지가 뭐야?', {
      activeFilePath: 'index.html',
      visibleFilePath: 'screens/kiosk/k1-waiting.html',
      hash: '#step-2',
    });

    expect(content).toContain('<current-preview-context>');
    expect(content).toContain('activeFile: index.html');
    expect(content).toContain('visibleFile: screens/kiosk/k1-waiting.html');
    expect(content).toContain('hash: #step-2');
  });

  it('injects preview context only into the current user turn sent to the model', () => {
    const history: ChatMessage[] = [
      { id: 'old', role: 'user', content: 'old' },
      { id: 'assistant', role: 'assistant', content: 'reply' },
      { id: 'new', role: 'user', content: 'new' },
    ];

    const next = historyWithPreviewContext(history, 'new', {
      activeFilePath: 'index-v1.html',
      visibleFilePath: 'index-v1.html',
    });

    expect(next[0]?.content).toBe('old');
    expect(next[1]?.content).toBe('reply');
    expect(next[2]?.content).toContain('visibleFile: index-v1.html');
  });

  it('compares preview contexts by value', () => {
    expect(samePreviewChatContext(
      { activeFilePath: 'index.html', visibleFilePath: 'a.html' },
      { activeFilePath: 'index.html', visibleFilePath: 'a.html', hash: '' },
    )).toBe(true);
    expect(samePreviewChatContext(
      { activeFilePath: 'index.html', visibleFilePath: 'a.html' },
      { activeFilePath: 'index.html', visibleFilePath: 'b.html' },
    )).toBe(false);
  });
});
