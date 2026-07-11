// @vitest-environment jsdom
//
// The CLI-tab hook against hand-written fake `HandoffClipboardPort` /
// `HandoffPreferencesPort` — no global clipboard/localStorage mock. Pins the
// merged CLI catalogue, both copy actions (success, missing-projectDir,
// clipboard failure), the framework picker + its persistence, and the
// "copied" flash timer (including the same-target repeat-copy reset the
// original ref-based timer gave for free).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useHandoffCli,
  type UseHandoffCliOptions,
} from '../../../src/features/handoff/hooks/useHandoffCli.hooks';
import type { HandoffClipboardPort, HandoffPreferencesPort } from '../../../src/features/handoff/ports';
import type { CliTarget } from '../../../src/features/handoff/types';
import { I18nProvider } from '../../../src/i18n';

function makeClipboard(over: Partial<HandoffClipboardPort> = {}): HandoffClipboardPort {
  return { copy: vi.fn(async () => true), ...over };
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
function makeOptions(over: Partial<UseHandoffCliOptions> = {}): UseHandoffCliOptions {
  return {
    fireHandoff: vi.fn(),
    projectId: 'p1',
    projectName: 'Landing',
    projectDir: '/tmp/open-design/Landing',
    setError: vi.fn(),
    clearError: vi.fn(),
    ...over,
  };
}
const claude: CliTarget = { id: 'claude', name: 'Claude Code', bin: 'claude', available: true };

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderCli(
  clipboardPort: HandoffClipboardPort,
  preferencesPort: HandoffPreferencesPort,
  options: UseHandoffCliOptions,
) {
  return renderHook(() => useHandoffCli(clipboardPort, preferencesPort, options), { wrapper });
}

describe('useHandoffCli', () => {
  it('merges the fallback + reported agents into the CLI catalogue', () => {
    const { result } = renderCli(makeClipboard(), makePreferences(), makeOptions({ agents: [claude] }));
    expect(result.current.cliTargets.length).toBeGreaterThan(0);
    expect(result.current.availableCliTargets.map((c) => c.id)).toContain('claude');
    expect(result.current.unavailableCliTargets.every((c) => !c.available)).toBe(true);
  });

  it('initializes the framework from the preferences port', () => {
    const preferences = makePreferences({ readPreferredFramework: vi.fn(() => 'vue') });
    const { result } = renderCli(makeClipboard(), preferences, makeOptions());
    expect(result.current.selectedFramework.id).toBe('vue');
  });

  it('falls back to the default framework when the stored id matches nothing', () => {
    // A stale/corrupted localStorage value (e.g. a framework removed from a
    // later release) must not crash the picker — it silently falls back.
    const preferences = makePreferences({ readPreferredFramework: vi.fn(() => 'no-longer-offered') });
    const { result } = renderCli(makeClipboard(), preferences, makeOptions());
    expect(result.current.selectedFramework.id).toBe('react');
  });

  describe('copyCliPrompt', () => {
    it('builds and copies a prompt containing the project dir, framework, and cli name', async () => {
      const clipboard = makeClipboard();
      const options = makeOptions();
      const { result } = renderCli(clipboard, makePreferences(), options);

      await act(async () => {
        await result.current.copyCliPrompt(claude);
      });

      expect(options.fireHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ element: 'copy_cli_prompt', handoff_tab: 'cli' }),
      );
      expect(clipboard.copy).toHaveBeenCalledTimes(1);
      const prompt = (clipboard.copy as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(prompt).toContain('/tmp/open-design/Landing');
      expect(prompt).toContain('Claude Code');
      expect(result.current.copiedCliId).toBe('claude');
      expect(result.current.copyBusy).toBeNull();
    });

    it('sets an error and never touches the clipboard when projectDir is missing', async () => {
      const clipboard = makeClipboard();
      const options = makeOptions({ projectDir: null });
      const { result } = renderCli(clipboard, makePreferences(), options);

      await act(async () => {
        await result.current.copyCliPrompt(claude);
      });

      expect(options.setError).toHaveBeenCalled();
      expect(clipboard.copy).not.toHaveBeenCalled();
    });

    it('sets an error when the clipboard write fails', async () => {
      const clipboard = makeClipboard({ copy: vi.fn(async () => false) });
      const options = makeOptions();
      const { result } = renderCli(clipboard, makePreferences(), options);

      await act(async () => {
        await result.current.copyCliPrompt(claude);
      });

      expect(options.setError).toHaveBeenCalled();
      expect(result.current.copiedCliId).toBeNull();
      expect(result.current.copyBusy).toBeNull();
    });
  });

  describe('copyProjectPath', () => {
    it('copies the raw project dir', async () => {
      const clipboard = makeClipboard();
      const options = makeOptions();
      const { result } = renderCli(clipboard, makePreferences(), options);

      await act(async () => {
        await result.current.copyProjectPath();
      });

      expect(clipboard.copy).toHaveBeenCalledWith('/tmp/open-design/Landing');
      expect(result.current.copiedCliId).toBe('project-path');
    });

    it('sets an error when projectDir is missing', async () => {
      const options = makeOptions({ projectDir: undefined });
      const { result } = renderCli(makeClipboard(), makePreferences(), options);

      await act(async () => {
        await result.current.copyProjectPath();
      });

      expect(options.setError).toHaveBeenCalled();
    });

    it('sets an error when the clipboard write fails', async () => {
      const clipboard = makeClipboard({ copy: vi.fn(async () => false) });
      const options = makeOptions();
      const { result } = renderCli(clipboard, makePreferences(), options);

      await act(async () => {
        await result.current.copyProjectPath();
      });

      expect(options.setError).toHaveBeenCalled();
      expect(result.current.copiedCliId).toBeNull();
    });
  });

  describe('chooseFramework', () => {
    it('persists the choice, fires analytics, clears the error, and clears any copied flash', async () => {
      const preferences = makePreferences();
      const options = makeOptions();
      const { result } = renderCli(makeClipboard(), preferences, options);

      await act(async () => {
        await result.current.copyProjectPath();
      });
      expect(result.current.copiedCliId).toBe('project-path');

      act(() => result.current.chooseFramework('vue'));

      expect(options.fireHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ element: 'framework', framework: 'vue' }),
      );
      expect(preferences.writePreferredFramework).toHaveBeenCalledWith('vue');
      expect(options.clearError).toHaveBeenCalled();
      expect(result.current.selectedFramework.id).toBe('vue');
      expect(result.current.copiedCliId).toBeNull();
    });
  });

  describe('copied flash timer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('clears the copied id after 1800ms', async () => {
      const { result } = renderCli(makeClipboard(), makePreferences(), makeOptions());

      await act(async () => {
        await result.current.copyProjectPath();
      });
      expect(result.current.copiedCliId).toBe('project-path');

      act(() => vi.advanceTimersByTime(1800));
      expect(result.current.copiedCliId).toBeNull();
    });

    it('resets the window on a repeat copy of the same target instead of expiring early', async () => {
      const { result } = renderCli(makeClipboard(), makePreferences(), makeOptions()) ;

      await act(async () => {
        await result.current.copyProjectPath();
      });
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.copiedCliId).toBe('project-path');

      // A second copy of the SAME target within the window must restart the
      // 1800ms clock rather than being swallowed by React's same-value bail-out.
      await act(async () => {
        await result.current.copyProjectPath();
      });
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.copiedCliId).toBe('project-path');

      act(() => vi.advanceTimersByTime(800));
      expect(result.current.copiedCliId).toBeNull();
    });
  });
});
