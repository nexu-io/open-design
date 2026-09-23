// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '../../src/components/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it.each(['bottom', 'top'] as const)(
    'keeps an explicitly global %s toast outside the animated app and cleans up its body layer',
    (placement) => {
      const onDismiss = vi.fn();
      const onAction = vi.fn();
      const { rerender } = render(
        <div className="app" data-testid="animated-app">
          <Toast
            message="评论保存失败"
            details="本次评论未保存成功，请重新尝试。"
            placement={placement}
            portalToBody
            tone="error"
            ttlMs={0}
            onDismiss={onDismiss}
            actionLabel="Open file"
            onAction={onAction}
          />
        </div>,
      );
      const toast = screen.getByRole('status');
      // The browser red proves the .app animation traps this layer below the
      // body-portaled composer. jsdom guards the owning DOM layer, not pixels.
      expect.soft(toast.parentElement).toBe(document.body);
      expect(toast).toHaveTextContent('评论保存失败');
      expect(toast).toHaveTextContent('本次评论未保存成功，请重新尝试。');
      fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
      expect(onAction).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);

      rerender(<div className="app" data-testid="animated-app" />);
      expect(screen.queryByRole('status')).toBeNull();
      expect(document.body.contains(toast)).toBe(false);
    },
  );

  it('keeps a toast in its original owner by default', () => {
    render(<div data-testid="toast-owner"><Toast message="Local feedback" ttlMs={0} /></div>);
    expect(screen.getByTestId('toast-owner').contains(screen.getByRole('status'))).toBe(true);
  });

  it('preserves the existing chat-pane anchor when body mounting is not requested', () => {
    render(
      <div className="app">
        <div className="project-actions-toast-anchor" data-testid="toast-anchor">
          <Toast message="Anchored feedback" details="Keep the pane context." ttlMs={0} />
        </div>
      </div>,
    );
    // The owner chooses local positioning; Toast does not infer intent from
    // this ancestor's class name or move an unopted caller into a global layer.
    expect(screen.getByTestId('toast-anchor').contains(screen.getByRole('status'))).toBe(true);
  });

  it('keeps modal feedback inside its dialog interaction scope', () => {
    render(
      <div role="dialog" aria-label="Settings">
        <Toast message="Settings feedback" ttlMs={0} onDismiss={() => {}} />
      </div>,
    );
    expect(screen.getByRole('dialog').contains(screen.getByRole('status'))).toBe(true);
    expect(screen.getByRole('dialog').contains(screen.getByRole('button', { name: /Dismiss/i }))).toBe(true);
  });

  it('renders the message and primary line by default', () => {
    render(<Toast message="Folder opened." />);
    expect(screen.getByText('Folder opened.')).not.toBeNull();
  });

  it('renders the optional secondary details line beneath the message', () => {
    render(<Toast message="Upstream issue" details="Account cap until 2026-06-01" />);
    expect(screen.getByText('Account cap until 2026-06-01')).not.toBeNull();
  });

  it('renders the code body in a <pre> when copy fails so users can manually copy the prompt', () => {
    const prompt = '# Continue in CLI — Acme\n\nWorking directory:\n/Users/me/projects/acme\n';
    render(<Toast message="Clipboard unavailable. Copy this prompt manually." code={prompt} />);
    const pre = screen.getByText((_content, node) => node?.tagName === 'PRE');
    expect(pre.textContent).toBe(prompt);
  });

  it('does not auto-dismiss when code is present (user needs time to copy)', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="manual copy" code="some prompt" ttlMs={100} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('auto-dismisses at ttlMs when code is not present, with the exit fade playing inside the window', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(
      <Toast message="folder opened" ttlMs={2000} onDismiss={onDismiss} />,
    );
    // The fade-out begins before the deadline (ttlMs - exit), so the toast is
    // already in its leaving state just shy of ttlMs but has not unmounted yet.
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(container.querySelector('.od-toast.leaving')).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
    // onDismiss (which unmounts the toast) fires at exactly ttlMs, so the exit
    // animation does not extend the toast's lifetime beyond ttlMs.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('lets users dismiss non-code toasts manually', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Browser opened" details="Use Download Page." onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a leading status glyph for the success tone', () => {
    const { container } = render(<Toast message="Screenshot copied to clipboard" tone="success" />);
    expect(container.querySelector('.od-toast.tone-success .od-toast-icon')).not.toBeNull();
  });

  it('distinguishes the error status glyph from the dismiss icon', () => {
    const { container } = render(<Toast message="Could not read the page" tone="error" onDismiss={() => {}} />);
    expect(
      // The error glyph is the Remix `error-warning-line` circle (inline SVG
      // icon language from #5517) — distinct from the close-line dismiss glyph.
      container.querySelector('.od-toast.tone-error .od-toast-icon path[d^="M12 22C6.47715"]'),
    ).not.toBeNull();
  });

  it('renders a Dismiss button when both code and onDismiss are present', () => {
    render(<Toast message="manual copy" code="x" onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /Dismiss/i })).not.toBeNull();
  });

  it('renders an optional action button', () => {
    const onAction = vi.fn();
    render(<Toast message="Image saved" actionLabel="Open file" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
