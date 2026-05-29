import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildProxyMessages, streamProxyEndpoint } from '../../src/providers/api-proxy';
import type { ChatMessage } from '../../src/types';

describe('buildProxyMessages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes image attachments as Anthropic image content blocks', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/references/logo.png',
      { cache: 'no-store' },
    );
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the attached image' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw==',
            },
          },
        ],
      },
    ]);
  });

  it('keeps non-Anthropic proxy messages as plain text', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const messages = await buildProxyMessages(
      '/api/proxy/openai/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(messages).toEqual([
      { role: 'user', content: 'Describe the attached image' },
    ]);
  });

  it('sends Anthropic image content blocks in the proxy request body', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('event: end\ndata: {}\n\n'),
            );
            controller.close();
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await streamProxyEndpoint(
      '/api/proxy/anthropic/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://anthropic-compatible.example',
        model: 'vision-model',
      } as any,
      'System prompt',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      new AbortController().signal,
      {
        onDelta: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      { projectId: 'project-1' },
    );

    const proxyInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(proxyInit.body))).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the attached image' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'iVBORw==',
              },
            },
          ],
        },
      ],
      projectId: 'project-1',
    });
  });

  it('keeps a text fallback when a supported Anthropic image cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the attached image' },
          {
            type: 'text',
            text: 'Attached image could not be sent as native image content: path: references/logo.png | name: logo.png',
          },
        ],
      },
    ]);
  });
});

function userMessage(
  content: string,
  attachments: NonNullable<ChatMessage['attachments']>,
): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content,
    createdAt: 1,
    attachments,
  };
}
