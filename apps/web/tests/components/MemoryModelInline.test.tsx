// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryModelInline } from '../../src/components/MemoryModelInline';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

function renderPicker(overrides: Partial<ComponentProps<typeof MemoryModelInline>> = {}) {
  const props = {
    mode: 'api' as const,
    apiProtocol: 'openai' as const,
    chatApiKey: 'test-key',
    chatBaseUrl: 'https://api.example.test/v1',
    chatApiVersion: '',
    chatModel: 'chat-model',
    apiModelOptions: [
      { id: 'old-model', label: 'Old model' },
      { id: 'new-model', label: 'New model' },
    ],
    ...overrides,
  };
  return render(
    <I18nProvider initial="en">
      <MemoryModelInline {...props} />
    </I18nProvider>,
  );
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('MemoryModelInline', () => {
  it('shows a visible error when a user save receives a malformed successful response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === '/api/memory' && !init?.method) {
        return response({ extraction: null });
      }
      if (input.toString() === '/api/memory/config' && init?.method === 'PATCH') {
        // `ok` alone is not a successful extraction-config response.
        return response({ enabled: true });
      }
      return response({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPicker();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Memory model' }));
    fireEvent.click(await screen.findByRole('option', { name: 'new-model' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save changes. The local daemon may be offline.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/memory/config',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('does not let a late mount read overwrite a user-selected model', async () => {
    const read = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === '/api/memory' && !init?.method) return read.promise;
      if (input.toString() === '/api/memory/config' && init?.method === 'PATCH') {
        return Promise.resolve(response({
          extraction: {
            provider: 'openai',
            model: 'new-model',
            baseUrl: 'https://api.example.test/v1',
            apiVersion: '',
            apiKeyConfigured: true,
            apiKeyTail: '-key',
          },
        }));
      }
      return Promise.resolve(response({}));
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPicker();

    fireEvent.click(screen.getByRole('combobox', { name: 'Memory model' }));
    fireEvent.click(await screen.findByRole('option', { name: 'new-model' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/memory/config',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    read.resolve(response({
      extraction: {
        provider: 'openai',
        model: 'old-model',
        baseUrl: 'https://old.example.test/v1',
        apiVersion: '',
        apiKeyConfigured: true,
        apiKeyTail: '-key',
      },
    }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Memory model' })).toHaveTextContent('new-model');
    });
  });

  it('converts a malformed debounced re-sync response into the same visible error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === '/api/memory' && !init?.method) {
        return response({
          extraction: {
            provider: 'openai',
            model: 'old-model',
            baseUrl: 'https://old.example.test/v1',
            apiVersion: '',
            apiKeyConfigured: true,
            apiKeyTail: '-key',
          },
        });
      }
      if (input.toString() === '/api/memory/config' && init?.method === 'PATCH') {
        return response({ enabled: true });
      }
      return response({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const view = renderPicker({ chatBaseUrl: 'https://old.example.test/v1' });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Memory model' })).toHaveTextContent('old-model');
    });

    view.rerender(
      <I18nProvider initial="en">
        <MemoryModelInline
          mode="api"
          apiProtocol="openai"
          chatApiKey="test-key"
          chatBaseUrl="https://new.example.test/v1"
          chatApiVersion=""
          chatModel="chat-model"
          apiModelOptions={[
            { id: 'old-model', label: 'Old model' },
            { id: 'new-model', label: 'New model' },
          ]}
        />
      </I18nProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save changes. The local daemon may be offline.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/memory/config',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
