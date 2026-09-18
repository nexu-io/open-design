import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../src/types';
import { listMessages, saveMessage } from '../../src/state/projects';

type OriginMessage = ChatMessage & { messageOrigin?: 'host_memory' };

describe('message provenance across the existing web message transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends producer provenance on PUT and retains authoritative GET provenance', async () => {
    const message: OriginMessage = {
      id: 'host-memory', role: 'assistant', content: 'Memory protocol payload',
      messageOrigin: 'host_memory',
    };
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json(init?.method === 'PUT' ? { message } : { messages: [message] });
    }));
    expect(await saveMessage('project', 'conversation', message)).toEqual(message);
    expect(await listMessages('project', 'conversation')).toEqual([message]);
    const request = requests[0];
    expect(request?.url).toBe('/api/projects/project/conversations/conversation/messages/host-memory');
    expect(request?.init?.method).toBe('PUT');
    expect(JSON.parse(String(request?.init?.body)).messageOrigin).toBe('host_memory');
  });

  it('does not infer provenance from an unmarked response body', async () => {
    const message: ChatMessage = { id: 'legacy', role: 'assistant',
      content: '<od-card type="memory-applied">{"summary":"Memory","used":[]}</od-card>' };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ messages: [message] })));
    const [read] = await listMessages('project', 'conversation');
    expect(read?.content).toBe(message.content);
    expect((read as OriginMessage).messageOrigin).toBeUndefined();
  });
});
