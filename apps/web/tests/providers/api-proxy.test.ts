import { afterEach, describe, expect, it, vi } from 'vitest';

import { historyWithApiAttachmentContext } from '../../src/api-attachment-context';
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

  it('does not send preview-unavailable text alongside sketch raster image blocks', async () => {
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

    const history = await historyWithApiAttachmentContext(
      [
        userMessage('Describe this image', [
          { path: 'sketch-hero.png', name: 'sketch-hero.png', kind: 'image', size: 4 },
        ]),
      ],
      'msg-1',
      'project-1',
      [
        {
          name: 'sketch-hero.png',
          path: 'sketch-hero.png',
          type: 'file',
          size: 4,
          mtime: 123,
          kind: 'sketch',
          mime: 'image/png',
        },
      ],
      { omitNativeImageAttachments: true },
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      history,
      { projectId: 'project-1' },
    );

    expect(JSON.stringify(messages)).not.toContain('Content preview unavailable');
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
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
