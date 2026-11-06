// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Reconnect } from '../../src/components/chat/Reconnect';
import { I18nProvider } from '../../src/i18n';
import {
  nextChatReconnectView,
  type ChatReconnectView,
} from '../../src/runtime/chat/reconnect-state';

afterEach(cleanup);

// OPEND-2849, S29: Feishu S1Ucd1frUo7opCxGLbRcj3XTnvh revision 171.
// The authorized body supplements the existing reconnect row. Its state,
// manual reconnect action, and disappearance on recovery remain unchanged.
const owner = { runId: 's29-run', conversationId: 's29-conversation' };

function surface(view: ChatReconnectView | null, onReconnect?: () => void) {
  return (
    <I18nProvider initial="zh-CN">
      {view ? <Reconnect {...view} onReconnect={onReconnect} /> : null}
    </I18nProvider>
  );
}

describe('S29 authorized reconnect copy', () => {
  it.each([
    { attempt: 2, max: 5 },
    { attempt: 3, max: 7 },
  ])('uses the current transport attempt $attempt/$max in the body', ({ attempt, max }) => {
    const signal = { kind: 'transport', ...owner, attempt, max, phase: 'reconnecting' } as const;
    const view = nextChatReconnectView(null, signal);
    const { rerender } = render(surface(view));

    expect(screen.getByTestId('chat-reconnect').textContent).toContain('正在恢复网络连接');
    expect.soft(screen.getByTestId('chat-reconnect').textContent).toContain(
      `正在进行第 ${attempt}/${max} 次连接尝试，请稍候。`,
    );
    expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull();

    const lastAttempt = nextChatReconnectView(view, { ...signal, attempt: max });
    rerender(surface(lastAttempt));

    const text = screen.getByTestId('chat-reconnect').textContent;
    expect(text).toContain('正在恢复网络连接');
    expect(text).toContain(`正在进行第 ${max}/${max} 次连接尝试，请稍候。`);
    expect(text).not.toContain(`正在进行第 ${attempt}/${max} 次连接尝试，请稍候。`);
  });

  it('shows the exhausted title and body while retaining manual reconnect', () => {
    const onReconnect = vi.fn();
    const view = nextChatReconnectView(null, {
      kind: 'transport', ...owner, attempt: 5, max: 5, phase: 'exhausted',
    });
    render(surface(view, onReconnect));

    const text = screen.getByTestId('chat-reconnect').textContent;
    expect(text).toContain('网络连接未能恢复');
    expect.soft(text).toContain('请确认网络连接正常后再试。');
    expect(text).not.toContain('正在进行第');

    // The copy change must not turn the existing recovery action into a dead end.
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('removes the whole row when the active transport reports recovery', () => {
    const view = nextChatReconnectView(null, {
      kind: 'transport', ...owner, attempt: 2, max: 5, phase: 'reconnecting',
    });
    const { container, rerender } = render(surface(view));
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();

    const recovered = nextChatReconnectView(view, {
      kind: 'transport', ...owner, attempt: 0, max: 5, phase: 'cleared',
    });
    rerender(surface(recovered));

    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull();
  });
});
