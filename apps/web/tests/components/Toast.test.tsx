// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '../../src/components/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
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

  it('auto-dismisses after ttlMs when code is not present', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="folder opened" ttlMs={2000} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2001);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a Dismiss button when both code and onDismiss are present', () => {
    render(<Toast message="manual copy" code="x" onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /Dismiss/i })).not.toBeNull();
  });
});
