// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('../../src/components/Icon', () => ({
  Icon: () => null,
}));

import { ExportDiagnosticsRow } from '../../src/components/ExportDiagnosticsButton';
import {
  CHAT_SCROLL_FORENSICS_PATH,
  __resetChatScrollForensicsForTest,
} from '../../src/observability/chat-scroll-forensics';

/**
 * Why this file exists
 * --------------------
 * The diagnostics zip is assembled in the daemon, which cannot see the
 * renderer's DOM. The chat-scroll scene therefore has to be pushed across
 * BEFORE the bundle is requested, or the export packages a daemon that has not
 * heard about the incident yet.
 *
 * "Before" is the whole contract, so it is asserted as an ORDER, not as two
 * independent calls.
 */

const EXPORT_PATH = '/api/diagnostics/export';

function mountChatLog(): void {
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('data-testid', 'chat-log');
  log.textContent = 'a stuck transcript';
  document.body.appendChild(log);
}

beforeEach(() => {
  __resetChatScrollForensicsForTest();
  document.body.innerHTML = '';
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:stub' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
});

afterEach(() => {
  cleanup();
  __resetChatScrollForensicsForTest();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Export logs pushes the chat-scroll scene before it asks for the bundle', () => {
  it('posts the capture first, then fetches the zip', async () => {
    mountChatLog();
    const seen: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url === CHAT_SCROLL_FORENSICS_PATH) {
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob(['zip']),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportDiagnosticsRow />);
    screen.getByRole('button').click();

    await waitFor(() => expect(seen).toContain(EXPORT_PATH));
    expect(seen).toEqual([CHAT_SCROLL_FORENSICS_PATH, EXPORT_PATH]);

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as {
      live: { available: boolean; forensics: { dom: { outerHTML: string } } };
    };
    expect(body.live.available).toBe(true);
    expect(body.live.forensics.dom.outerHTML).toContain('a stuck transcript');
  });

  it('still exports when the capture upload fails', async () => {
    mountChatLog();
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        seen.push(url);
        if (url === CHAT_SCROLL_FORENSICS_PATH) throw new Error('daemon says no');
        return {
          ok: true,
          headers: { get: () => null },
          blob: async () => new Blob(['zip']),
        } as unknown as Response;
      }),
    );

    render(<ExportDiagnosticsRow />);
    screen.getByRole('button').click();

    await waitFor(() => expect(seen).toContain(EXPORT_PATH));
    expect(seen).toEqual([CHAT_SCROLL_FORENSICS_PATH, EXPORT_PATH]);
  });

  it('posts a self-explaining envelope even with no chat log on screen', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === CHAT_SCROLL_FORENSICS_PATH) {
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob(['zip']),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportDiagnosticsRow />);
    screen.getByRole('button').click();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as {
      live: { available: boolean; reason: string };
      retained: { available: boolean };
    };
    expect(body.live.available).toBe(false);
    expect(body.live.reason).toMatch(/No chat log was in the DOM/);
    expect(body.retained.available).toBe(false);
  });
});
