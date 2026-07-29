// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, flushMounts, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

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

  it('keeps send available while streaming so the next prompt can queue', async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderComposer({ streaming: true, onSend, onStop });
    await flushMounts();

    typeAndSettle('change the font');

    // The editor's onChange → setDraft settles a tick after typeAndSettle
    // returns; wait for the send button (which only shows once the composer has
    // payload) before asserting Stop is gone.
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(onStop).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('change the font', [], [], undefined);
  });

  it('restores a saved draft for the active conversation', async () => {
    window.localStorage.setItem('od:chat-composer:draft:project-1:conv-1', 'draft before refresh');

    renderComposer({
      draftStorageKey: 'od:chat-composer:draft:project-1:conv-1',
    });
    await flushMounts();

    await waitFor(() => expect(composerText()).toBe('draft before refresh'));
  });

  it('clears the saved draft after submitting it', async () => {
    const key = 'od:chat-composer:draft:project-1:conv-1';
    const onSend = vi.fn();
    renderComposer({
      draftStorageKey: key,
      onSend,
    });
    await flushMounts();

    typeAndSettle('send then clear');

    await waitFor(() => expect(window.localStorage.getItem(key)).toBe('send then clear'));
    pressEnter({ meta: true });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
  });

  it('does not enter an infinite update loop on rapid plain-text typing', async () => {
    // #2097 surfaced as "Maximum update depth exceeded" from a feedback loop
    // between the input and a layout effect. The Lexical editor owns its own
    // text now (no overlay scroll-sync effect), so rapid edits must settle
    // without re-render storms.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderComposer();
      await flushMounts();

      for (const value of ['h', 'he', 'hel', 'hell', 'hello']) {
        typeAndSettle(value);
      }

      const maxDepth = consoleError.mock.calls.find((args) =>
        args.some((a) => typeof a === 'string' && a.includes('Maximum update depth exceeded')),
      );
      expect(maxDepth).toBeUndefined();
      expect(composerText()).toBe('hello');
    } finally {
      consoleError.mockRestore();
    }
  });
});
