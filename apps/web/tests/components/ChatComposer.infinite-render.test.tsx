// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

let fetchMock: ReturnType<typeof vi.fn>;

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      skills={[]}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

describe('ChatComposer infinite re-render regression (#2097)', () => {
  it('shows only stop while streaming with an empty composer', () => {
    renderComposer({ streaming: true });

    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByTestId('chat-send')).toBeNull();
  });

  it('keeps send available while streaming so the next prompt can queue', () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderComposer({ streaming: true, onSend, onStop });

    const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'change the font', selectionStart: 'change the font'.length },
    });

    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(onStop).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('change the font', [], [], undefined);
  });

  it('restores a saved draft for the active conversation', () => {
    window.localStorage.setItem('od:chat-composer:draft:project-1:conv-1', 'draft before refresh');

    renderComposer({
      draftStorageKey: 'od:chat-composer:draft:project-1:conv-1',
    });

    expect((screen.getByTestId('chat-composer-input') as HTMLTextAreaElement).value).toBe(
      'draft before refresh',
    );
  });

  it('clears the saved draft after submitting it', async () => {
    const key = 'od:chat-composer:draft:project-1:conv-1';
    const onSend = vi.fn();
    renderComposer({
      draftStorageKey: key,
      onSend,
    });
    const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'send then clear', selectionStart: 15, selectionEnd: 15 },
    });

    await waitFor(() => expect(window.localStorage.getItem(key)).toBe('send then clear'));
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
  });
  it('does not re-sync the composer scroll offset on every plain-text keystroke', () => {
    const scrollTopGetter = vi.fn(() => 0);
    const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollTop');
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollTop', {
      configurable: true,
      get: scrollTopGetter,
      set() {},
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderComposer();
      const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
      const baseline = scrollTopGetter.mock.calls.length;

      for (const value of ['h', 'he', 'hel', 'hell', 'hello']) {
        fireEvent.change(textarea, { target: { value, selectionStart: value.length } });
      }

      const maxDepth = consoleError.mock.calls.find((args) =>
        args.some((a) => typeof a === 'string' && a.includes('Maximum update depth exceeded')),
      );
      expect(maxDepth).toBeUndefined();

      const perKeystroke = scrollTopGetter.mock.calls.length - baseline;
      expect(perKeystroke).toBe(0);
    } finally {
      consoleError.mockRestore();
      if (original) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollTop', original);
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollTop?: number }).scrollTop;
      }
    }
  });
});
