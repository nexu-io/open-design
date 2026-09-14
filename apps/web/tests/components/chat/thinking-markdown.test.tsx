// @vitest-environment jsdom
/**
 * OPEND-2403: thinking 正文和普通 assistant 正文一样支持 Markdown,但高速
 * thinking_delta 不能让整段 Markdown 在每一个 delta 上重解析、重交 DOM。
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import {
  ThinkingMarkdown,
  THINKING_MARKDOWN_COMMIT_MS,
} from '../../../src/components/chat/ThinkingMarkdown';
import { I18nProvider } from '../../../src/i18n';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });

function shell(text: string, live = false): Shell {
  return {
    kind: 'shell',
    id: 'thinking-markdown-shell',
    status: live ? 'running' : 'done',
    items: [think(text)],
    segments: [],
    thinking: live,
    stopped: false,
    elapsedMs: null,
    quietMs: null,
  };
}

const show = (value: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={value} deferCollapsedBodies={false} />
  </I18nProvider>
);

function openFinishedThinking(root: HTMLElement): void {
  const outer = root.querySelector('details[class*="flat"]');
  if (!(outer instanceof HTMLDetailsElement)) throw new Error('missing execution shell');
  outer.open = true;
  const thought = screen.getByText('思考过程').closest('details');
  if (!(thought instanceof HTMLDetailsElement)) throw new Error('missing thinking fold');
  thought.open = true;
}

describe('OPEND-2403 thinking Markdown', () => {
  it('renders Markdown structure instead of leaking the source markers', () => {
    const { container } = render(show(shell([
      '### 方案',
      '',
      '**先确认约束**',
      '',
      '- 收集事实',
      '- 再做判断',
    ].join('\n'))));
    openFinishedThinking(container);

    expect(screen.getByRole('heading', { name: '方案', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('先确认约束').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.textContent).not.toContain('**先确认约束**');
  });

  it('keeps model-authored HTML inert while rendering surrounding Markdown', () => {
    const { container } = render(show(shell([
      '<script>globalThis.__thinkingPwned = true</script>',
      '',
      '**安全正文**',
      '',
      '[bad](javascript:alert(1))',
    ].join('\n'))));
    openFinishedThinking(container);

    expect(container.querySelector('script')).toBeNull();
    expect((globalThis as typeof globalThis & { __thinkingPwned?: boolean }).__thinkingPwned).toBeUndefined();
    expect(screen.getByText('安全正文').tagName).toBe('STRONG');
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('coalesces a burst of live deltas into one bounded Markdown commit', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(show(shell('**0**', true)));
    expect(container.querySelector('strong')?.textContent).toBe('0');

    for (let i = 1; i <= 100; i += 1) {
      rerender(show(shell(`**${i}**`, true)));
    }

    // The input prop has changed 100 times, but the parsed/committed tree stays
    // at the previous snapshot until the single coalescing deadline.
    expect(container.querySelector('strong')?.textContent).toBe('0');
    act(() => { vi.advanceTimersByTime(THINKING_MARKDOWN_COMMIT_MS - 1); });
    expect(container.querySelector('strong')?.textContent).toBe('0');
    act(() => { vi.advanceTimersByTime(1); });
    expect(container.querySelector('strong')?.textContent).toBe('100');
  });

  it('resumes a later live phase from the final snapshot, not stale throttled text', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<ThinkingMarkdown texts={['**start**']} live />);

    rerender(<ThinkingMarkdown texts={['**final**']} live={false} />);
    expect(container.querySelector('strong')?.textContent).toBe('final');
    // Allow the completion effect to synchronize the retained snapshot.
    act(() => { vi.advanceTimersByTime(0); });

    rerender(<ThinkingMarkdown texts={['**next**']} live />);
    expect(container.querySelector('strong')?.textContent).toBe('final');
    act(() => { vi.advanceTimersByTime(THINKING_MARKDOWN_COMMIT_MS); });
    expect(container.querySelector('strong')?.textContent).toBe('next');
  });
});
