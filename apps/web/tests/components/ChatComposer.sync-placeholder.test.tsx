// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, flushMounts, typeAndSettle } from '../helpers/lexical-composer';

const message = 'Project is syncing. Please wait.';

beforeEach(() => {
  window.localStorage.clear(); window.sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const name = String(url);
    if (name === '/api/mcp/servers') return Response.json({ servers: [], templates: [] });
    if (name === '/api/plugins') return Response.json({ plugins: [] });
    if (name === '/api/skills') return Response.json({ skills: [] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe('product-confirmed project sync composer hint', () => {
  it('shows the explicit disabled-input hint ahead of the active file placeholder', async () => {
    const props = {
      projectId: 'sync-hint-project', projectFiles: [], streaming: false,
      activeProjectFileName: 'index.html', skills: [],
      onEnsureProject: async () => 'sync-hint-project', onSend: vi.fn(), onStop: vi.fn(),
    };
    const view = render(<ChatComposer {...props} inputDisabled sendDisabled composerPlaceholder={message} />);
    await flushMounts();
    expect(screen.getByTestId('chat-composer-input')).toHaveAttribute('aria-placeholder', message);
    for (const placeholder of screen.getAllByText(message, { exact: true })) expect(placeholder).toBeVisible();
    expect(screen.getByTestId('chat-composer-input')).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    view.rerender(<ChatComposer {...props} inputDisabled={false} sendDisabled={false} />);
    await waitFor(() => expect(screen.queryAllByText(message, { exact: true })).toHaveLength(0));
    expect(screen.getByTestId('chat-composer-input')).toHaveAttribute('contenteditable', 'true');
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('keeps a typed draft across sync disable and recovery without submitting it', async () => {
    const props = {
      projectId: 'sync-draft-project', projectFiles: [], streaming: false,
      activeProjectFileName: 'index.html', skills: [],
      onEnsureProject: async () => 'sync-draft-project', onSend: vi.fn(), onStop: vi.fn(),
    };
    const view = render(<ChatComposer {...props} />);
    await flushMounts();
    await typeAndSettle('Keep my unsent draft');
    view.rerender(<ChatComposer {...props} inputDisabled sendDisabled composerPlaceholder={message} />);
    expect(composerText()).toBe('Keep my unsent draft');
    expect(screen.getByTestId('chat-composer-input')).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    view.rerender(<ChatComposer {...props} inputDisabled={false} sendDisabled={false} />);
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeEnabled());
    expect(composerText()).toBe('Keep my unsent draft');
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
