// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { composerText, flushMounts, typeAndSettle } from '../helpers/lexical-composer';

/*
 * Multi-select next-step suggestions toggle whole lines in the real composer
 * draft. Covers the review findings on #9518: overlapping user text, image
 * fallback payloads ("label\n\npath", which the editor stores with the blank
 * line collapsed), and the draft view the rows derive their selection from.
 */

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  const ref = createRef<ChatComposerHandle>();
  render(
    <ChatComposer
      ref={ref}
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
  return ref;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), { status: 200 });
      }
      if (url === '/api/plugins') return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      if (url === '/api/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 });
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // storage unavailable
  }
});

describe('ChatComposer · toggleDraftSuggestion', () => {
  it('removes only the inserted line, never words the user typed (overlapping text)', async () => {
    const ref = renderComposer();
    await flushMounts();
    await typeAndSettle('Please do not Add dark mode yet');

    act(() => ref.current!.toggleDraftSuggestion('Add dark mode', true));
    expect(composerText()).toBe('Please do not Add dark mode yet\nAdd dark mode');

    act(() => ref.current!.toggleDraftSuggestion('Add dark mode', false));
    expect(composerText()).toBe('Please do not Add dark mode yet');
  });

  it('deselecting a suggestion that was never inserted deletes nothing', async () => {
    const ref = renderComposer();
    await flushMounts();
    await typeAndSettle('Please do not Add dark mode yet');

    act(() => ref.current!.toggleDraftSuggestion('Add dark mode', false));
    expect(composerText()).toBe('Please do not Add dark mode yet');
  });

  it('handles an image fallback payload: select, deselect, reselect without duplicates', async () => {
    const ref = renderComposer();
    await flushMounts();
    const payload = 'Make variants\n\nimages/a.png\nimages/b.png';

    act(() => ref.current!.toggleDraftSuggestion(payload, true));
    expect(composerText()).toBe('Make variants\nimages/a.png\nimages/b.png');

    act(() => ref.current!.toggleDraftSuggestion(payload, false));
    // (an empty editor renders as a bare line break in the DOM; ask the editor)
    expect(ref.current!.getDraftText()).toBe('');

    act(() => ref.current!.toggleDraftSuggestion(payload, true));
    act(() => ref.current!.toggleDraftSuggestion(payload, true));
    expect(composerText()).toBe('Make variants\nimages/a.png\nimages/b.png');
  });

  it('keeps two selected suggestions as separate lines and removes just one', async () => {
    const ref = renderComposer();
    await flushMounts();

    act(() => ref.current!.toggleDraftSuggestion('Add a pricing page', true));
    act(() => ref.current!.toggleDraftSuggestion('Add a pricing page toggle', true));
    expect(composerText()).toBe('Add a pricing page\nAdd a pricing page toggle');

    act(() => ref.current!.toggleDraftSuggestion('Add a pricing page', false));
    expect(composerText()).toBe('Add a pricing page toggle');
  });
});

describe('ChatComposer · draft view for suggestion rows', () => {
  it('reports the current draft and notifies subscribers when it changes', async () => {
    const ref = renderComposer();
    await flushMounts();
    const listener = vi.fn();
    const unsubscribe = ref.current!.subscribeDraft(listener);

    act(() => ref.current!.toggleDraftSuggestion('Add a page', true));
    expect(ref.current!.getDraftText()).toBe('Add a page');
    expect(listener).toHaveBeenCalled();

    // manual edit: the draft view follows (this is what un-selects a pressed row)
    listener.mockClear();
    await typeAndSettle('');
    expect(ref.current!.getDraftText()).toBe('');
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    await typeAndSettle('again');
    expect(listener).not.toHaveBeenCalled();
  });
});
