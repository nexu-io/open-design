import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WHATS_NEW_URL,
  createWhatsNewService,
  parseWhatsNewDocument,
  whatsNewSourceUrl,
} from '../src/services/whats-new.js';

const DOC = {
  id: '0.13.0',
  title: 'Design system sync',
  body: 'Import, edit and sync design systems.',
  imageUrl: 'https://whatsnew.open-design.ai/0.13.0.png',
  linkUrl: 'https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0',
  locales: { 'zh-CN': { title: '设计系统同步' } },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('whatsNewSourceUrl', () => {
  it('uses the dedicated hosted document on release channels', () => {
    expect(whatsNewSourceUrl({}, 'stable')).toBe(DEFAULT_WHATS_NEW_URL);
    expect(whatsNewSourceUrl({}, 'beta')).toBe(DEFAULT_WHATS_NEW_URL);
  });

  it('resolves to null on non-release channels (development/CI show no card)', () => {
    expect(whatsNewSourceUrl({}, 'development')).toBeNull();
    expect(whatsNewSourceUrl({}, '')).toBeNull();
  });

  it('honors OD_WHATS_NEW_URL for fixtures and tests regardless of channel', () => {
    expect(whatsNewSourceUrl({ OD_WHATS_NEW_URL: 'https://fixture.local/whats-new.json' }, 'development')).toBe(
      'https://fixture.local/whats-new.json',
    );
  });
});

describe('parseWhatsNewDocument', () => {
  it('parses a well-formed document', () => {
    const { id, content } = parseWhatsNewDocument(DOC);
    expect(id).toBe('0.13.0');
    expect(content?.title).toBe('Design system sync');
    expect(content?.imageUrl).toBe(DOC.imageUrl);
    expect(content?.locales?.['zh-CN']?.title).toBe('设计系统同步');
  });

  it('rejects a document without an id (no show-once key)', () => {
    const { id, content } = parseWhatsNewDocument({ ...DOC, id: '' });
    expect(id).toBeNull();
    expect(content).toBeNull();
  });

  it('drops malformed documents instead of propagating shape errors', () => {
    expect(parseWhatsNewDocument({ id: 'x', title: 'only-title' }).content).toBeNull();
    expect(parseWhatsNewDocument('not-an-object').content).toBeNull();
    expect(parseWhatsNewDocument(null).content).toBeNull();
  });

  it('strips non-HTTPS urls but keeps the copy', () => {
    const { content } = parseWhatsNewDocument({ ...DOC, imageUrl: 'http://insecure.example/x.png' });
    expect(content?.imageUrl).toBeUndefined();
    expect(content?.title).toBe('Design system sync');
  });
});

describe('createWhatsNewService', () => {
  it('caches the parsed result and reuses it within the TTL', async () => {
    let calls = 0;
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(DOC);
      },
    });
    const first = await service.readWhatsNew('stable');
    const second = await service.readWhatsNew('stable');
    expect(first.id).toBe('0.13.0');
    expect(first.content?.title).toBe('Design system sync');
    expect(second.content?.title).toBe('Design system sync');
    expect(calls).toBe(1);
  });

  it('skips the network entirely on non-release channels', async () => {
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });
    const result = await service.readWhatsNew('development');
    expect(result.id).toBeNull();
    expect(result.content).toBeNull();
    expect(result.stale).toBe(false);
  });

  it('resolves to null content instead of failing when the document is unreachable', async () => {
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    const result = await service.readWhatsNew('stable');
    expect(result.id).toBeNull();
    expect(result.content).toBeNull();
    expect(result.stale).toBe(true);
  });

  it('resolves to null content on a non-OK response', async () => {
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => jsonResponse({ error: 'nope' }, 404),
    });
    const result = await service.readWhatsNew('stable');
    expect(result.content).toBeNull();
    expect(result.stale).toBe(true);
  });
});
