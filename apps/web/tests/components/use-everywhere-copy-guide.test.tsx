// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UseEverywhereGuidePanel } from '../../src/components/UseEverywhereModal';

const originalFetch = globalThis.fetch;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

describe('UseEverywhereGuidePanel copy guide', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    }
    vi.restoreAllMocks();
  });

  it('copies the daemon install-info launch spec into the agent guide', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        command: 'C:\\Program Files\\Open Design\\Open Design.exe',
        args: [
          'C:\\Program Files\\Open Design\\resources\\app\\apps\\daemon\\dist\\cli.js',
          'mcp',
        ],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          OD_DATA_DIR: 'C:\\Users\\Ada\\AppData\\Roaming\\Open Design',
        },
        daemonUrl: 'http://127.0.0.1:7456',
        platform: 'win32',
        cliExists: true,
        nodeExists: true,
        buildHint: null,
      }),
    } satisfies Partial<Response>) as typeof fetch;

    render(<UseEverywhereGuidePanel daemonUrl="http://127.0.0.1:7456" />);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/mcp/install-info'),
    );
    fireEvent.click(screen.getByTestId('use-everywhere-copy-guide'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('"command": "C:\\\\Program Files\\\\Open Design\\\\Open Design.exe"');
    expect(copied).toContain(
      '"C:\\\\Program Files\\\\Open Design\\\\resources\\\\app\\\\apps\\\\daemon\\\\dist\\\\cli.js"',
    );
    expect(copied).toContain('"ELECTRON_RUN_AS_NODE": "1"');
    expect(copied).not.toContain('"command": "od"');
  });

  it('waits for daemon install-info before copying the guide', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    let resolveFetch: (response: Partial<Response>) => void = () => {};
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as typeof fetch;

    render(<UseEverywhereGuidePanel daemonUrl="http://127.0.0.1:7456" />);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/mcp/install-info'),
    );
    fireEvent.click(screen.getByTestId('use-everywhere-copy-guide'));
    await Promise.resolve();

    expect(writeText).not.toHaveBeenCalled();

    resolveFetch({
      ok: true,
      json: async () => ({
        command: 'C:\\Program Files\\Open Design\\Open Design.exe',
        args: [
          'C:\\Program Files\\Open Design\\resources\\app\\apps\\daemon\\dist\\cli.js',
          'mcp',
        ],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          OD_DATA_DIR: 'C:\\Users\\Ada\\AppData\\Roaming\\Open Design',
        },
      }),
    } satisfies Partial<Response>);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('"command": "C:\\\\Program Files\\\\Open Design\\\\Open Design.exe"');
    expect(copied).not.toContain('"command": "od"');
  });

  it('waits for daemon install-info before copying the MCP tab snippet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    let resolveFetch: (response: Partial<Response>) => void = () => {};
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as typeof fetch;

    render(<UseEverywhereGuidePanel daemonUrl="http://127.0.0.1:7456" />);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/mcp/install-info'),
    );
    fireEvent.click(screen.getByTestId('use-everywhere-tab-mcp'));
    fireEvent.click(screen.getByRole('button', {
      name: /copy snippet: generic mcp client config/i,
    }));
    await Promise.resolve();

    expect(writeText).not.toHaveBeenCalled();

    resolveFetch({
      ok: true,
      json: async () => ({
        command: 'C:\\Program Files\\Open Design\\Open Design.exe',
        args: [
          'C:\\Program Files\\Open Design\\resources\\app\\apps\\daemon\\dist\\cli.js',
          'mcp',
        ],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          OD_DATA_DIR: 'C:\\Users\\Ada\\AppData\\Roaming\\Open Design',
        },
      }),
    } satisfies Partial<Response>);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('"command": "C:\\\\Program Files\\\\Open Design\\\\Open Design.exe"');
    expect(copied).toContain(
      '"C:\\\\Program Files\\\\Open Design\\\\resources\\\\app\\\\apps\\\\daemon\\\\dist\\\\cli.js"',
    );
    expect(copied).toContain('"ELECTRON_RUN_AS_NODE": "1"');
    expect(copied).not.toContain('"command": "od"');

    await waitFor(() => {
      const mcpSection = screen.getByTestId('use-everywhere-section-mcp');
      expect(mcpSection.textContent).toContain(
        '"command": "C:\\\\Program Files\\\\Open Design\\\\Open Design.exe"',
      );
      expect(mcpSection.textContent).not.toContain('"command": "od"');
    });
  });
});
