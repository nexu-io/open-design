// @vitest-environment jsdom
//
// The editors-cluster hook against hand-written fake `HandoffEditorsPort` /
// `HandoffPreferencesPort` — no global `fetch`/`localStorage` mock. Pins the
// load success/failure, the available/unavailable/primary derivations, the
// zero-editors fallback target, and both launch actions (success, failure +
// the Finder reveal-bridge fallback, and the launchFallback path that never
// writes a preference or closes the menu).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HostEditor, HostEditorId, HostEditorsResponse } from '@open-design/contracts';

import {
  useHandoffEditors,
  type UseHandoffEditorsOptions,
} from '../../../src/features/handoff/hooks/useHandoffEditors.hooks';
import type { HandoffEditorsPort, HandoffPreferencesPort } from '../../../src/features/handoff/ports';
import { I18nProvider } from '../../../src/i18n';

function editor(over: Partial<HostEditor> = {}): HostEditor {
  return { id: 'cursor', label: 'Cursor', available: true, ...over };
}
function response(over: Partial<HostEditorsResponse> = {}): HostEditorsResponse {
  return { editors: [editor()], platform: 'darwin', ...over };
}
function makePort(over: Partial<HandoffEditorsPort> = {}): HandoffEditorsPort {
  return {
    fetchHostEditors: vi.fn(async () => response()),
    openProjectInEditor: vi.fn(async () => ({ ok: true, editorId: 'cursor' }) as never),
    ...over,
  };
}
function makePreferences(over: Partial<HandoffPreferencesPort> = {}): HandoffPreferencesPort {
  return {
    readPreferredEditor: vi.fn(() => null),
    writePreferredEditor: vi.fn(),
    readPreferredFramework: vi.fn(() => 'react'),
    writePreferredFramework: vi.fn(),
    ...over,
  };
}
function makeOptions(over: Partial<UseHandoffEditorsOptions> = {}): UseHandoffEditorsOptions {
  return {
    fireHandoff: vi.fn(),
    projectId: 'p1',
    setError: vi.fn(),
    clearError: vi.fn(),
    closeMenu: vi.fn(),
    openMenuOnEditorTab: vi.fn(),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderEditors(
  port: HandoffEditorsPort,
  preferencesPort: HandoffPreferencesPort,
  options: UseHandoffEditorsOptions,
) {
  return renderHook(() => useHandoffEditors(port, preferencesPort, options), { wrapper });
}

describe('useHandoffEditors', () => {
  it('loads editors + platform and marks loaded', async () => {
    const { result } = renderEditors(makePort(), makePreferences(), makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.editors).toHaveLength(1);
    expect(result.current.platform).toBe('darwin');
  });

  it('falls back to an empty editor list when the load throws', async () => {
    const port = makePort({ fetchHostEditors: vi.fn(async () => { throw new Error('boom'); }) });
    const { result } = renderEditors(port, makePreferences(), makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.editors).toEqual([]);
  });

  it('splits available vs unavailable and picks the preferred as primary', async () => {
    const port = makePort({
      fetchHostEditors: vi.fn(async () =>
        response({ editors: [editor({ id: 'cursor' }), editor({ id: 'vscode', available: false })] }),
      ),
    });
    const preferences = makePreferences({ readPreferredEditor: vi.fn(() => 'cursor' as HostEditorId) });
    const { result } = renderEditors(port, preferences, makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.available.map((e) => e.id)).toEqual(['cursor']);
    expect(result.current.unavailable.map((e) => e.id)).toEqual(['vscode']);
    expect(result.current.primary?.id).toBe('cursor');
    expect(result.current.primaryTitle).toContain('Cursor');
  });

  it('falls back to the first available editor when there is no preference match', async () => {
    const port = makePort({
      fetchHostEditors: vi.fn(async () => response({ editors: [editor({ id: 'vscode' })] })),
    });
    const preferences = makePreferences({ readPreferredEditor: vi.fn(() => 'nonexistent' as HostEditorId) });
    const { result } = renderEditors(port, preferences, makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.primary?.id).toBe('vscode');
  });

  it('reports no primary and a generic title when nothing is available', async () => {
    const port = makePort({ fetchHostEditors: vi.fn(async () => response({ editors: [] })) });
    const { result } = renderEditors(port, makePreferences(), makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.primary).toBeNull();
    expect(result.current.primaryTitle).toBeTruthy();
  });

  it.each([
    ['win32', 'explorer'],
    ['linux', 'file-manager'],
    ['darwin', 'finder'],
  ] as const)('derives the %s fallback target', async (platform, id) => {
    const port = makePort({ fetchHostEditors: vi.fn(async () => response({ platform })) });
    const { result } = renderEditors(port, makePreferences(), makeOptions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.fallback.id).toBe(id);
  });

  describe('launch', () => {
    it('fires the analytics event, persists the preference, launches, and closes the menu', async () => {
      const port = makePort();
      const preferences = makePreferences();
      const options = makeOptions();
      const { result } = renderEditors(port, preferences, options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await act(async () => {
        await result.current.launch(editor({ id: 'cursor' }));
      });

      expect(options.fireHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ element: 'open_editor', handoff_tab: 'editor' }),
      );
      expect(preferences.writePreferredEditor).toHaveBeenCalledWith('cursor');
      expect(port.openProjectInEditor).toHaveBeenCalledWith('p1', 'cursor');
      expect(options.closeMenu).toHaveBeenCalled();
      expect(result.current.busy).toBeNull();
    });

    it('sets the error, reopens the editor tab, and tries the Finder reveal bridge on failure', async () => {
      const port = makePort({
        openProjectInEditor: vi.fn(async () => { throw new Error('daemon refused'); }),
      });
      const onRequestRevealInFinder = vi.fn();
      const options = makeOptions({ onRequestRevealInFinder });
      const { result } = renderEditors(port, makePreferences(), options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await act(async () => {
        await result.current.launch(editor({ id: 'finder' }));
      });

      expect(options.setError).toHaveBeenCalledWith('daemon refused');
      expect(options.openMenuOnEditorTab).toHaveBeenCalled();
      expect(onRequestRevealInFinder).toHaveBeenCalled();
      expect(result.current.busy).toBeNull();
    });

    it('does not try the reveal bridge for a non-finder editor failure', async () => {
      const port = makePort({
        openProjectInEditor: vi.fn(async () => { throw new Error('nope'); }),
      });
      const onRequestRevealInFinder = vi.fn();
      const options = makeOptions({ onRequestRevealInFinder });
      const { result } = renderEditors(port, makePreferences(), options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await act(async () => {
        await result.current.launch(editor({ id: 'cursor' }));
      });

      expect(onRequestRevealInFinder).not.toHaveBeenCalled();
    });

    it('swallows a throwing reveal-bridge callback', async () => {
      const port = makePort({
        openProjectInEditor: vi.fn(async () => { throw new Error('daemon refused'); }),
      });
      const onRequestRevealInFinder = vi.fn(() => { throw new Error('bridge exploded'); });
      const options = makeOptions({ onRequestRevealInFinder });
      const { result } = renderEditors(port, makePreferences(), options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await expect(
        act(async () => {
          await result.current.launch(editor({ id: 'finder' }));
        }),
      ).resolves.toBeUndefined();
    });

    it('stringifies a non-Error rejection', async () => {
      const port = makePort({
        openProjectInEditor: vi.fn(async () => { throw 'raw string failure'; }),
      });
      const options = makeOptions();
      const { result } = renderEditors(port, makePreferences(), options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      await act(async () => {
        await result.current.launch(editor({ id: 'cursor' }));
      });

      expect(options.setError).toHaveBeenCalledWith('raw string failure');
    });
  });

  describe('launchFallback', () => {
    it('launches the derived fallback id without writing a preference or closing a menu', async () => {
      const port = makePort({ fetchHostEditors: vi.fn(async () => response({ platform: 'linux', editors: [] })) });
      const preferences = makePreferences();
      const options = makeOptions();
      const { result } = renderEditors(port, preferences, options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      act(() => {
        result.current.launchFallback();
      });
      await waitFor(() => expect(port.openProjectInEditor).toHaveBeenCalledWith('p1', 'file-manager'));

      expect(preferences.writePreferredEditor).not.toHaveBeenCalled();
      expect(options.closeMenu).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.busy).toBeNull());
    });

    it('sets the error and unconditionally calls the reveal bridge on failure', async () => {
      const port = makePort({
        fetchHostEditors: vi.fn(async () => response({ editors: [] })),
        openProjectInEditor: vi.fn(async () => { throw new Error('spawn failed'); }),
      });
      const onRequestRevealInFinder = vi.fn();
      const options = makeOptions({ onRequestRevealInFinder });
      const { result } = renderEditors(port, makePreferences(), options);
      await waitFor(() => expect(result.current.loaded).toBe(true));

      act(() => {
        result.current.launchFallback();
      });

      await waitFor(() => expect(options.setError).toHaveBeenCalledWith('spawn failed'));
      expect(onRequestRevealInFinder).toHaveBeenCalled();
    });
  });
});
