import { describe, expect, it } from 'vitest';

import {
  createWhatsNewService,
  parseWhatsNewFromMetadata,
  whatsNewMetadataUrl,
  whatsNewReleaseUrl,
} from '../src/services/whats-new.js';

const INPUT = { version: '0.13.0', channel: 'stable' };

const FEED = {
  releaseVersion: '0.13.0',
  baseVersion: '0.13.0',
  channel: 'stable',
  whatsNew: {
    title: 'Design system sync',
    body: 'Import, edit and sync design systems.',
    imageUrl: 'https://releases.open-design.ai/assets/whats-new/0.13.0.png',
    linkUrl: 'https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0',
    locales: { 'zh-CN': { title: '设计系统同步' } },
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('whatsNewMetadataUrl', () => {
  it('builds the channel feed URL for release channels only', () => {
    expect(whatsNewMetadataUrl(INPUT, {})).toBe('https://releases.open-design.ai/stable/latest/metadata.json');
    expect(whatsNewMetadataUrl({ version: '0.13.0', channel: 'development' }, {})).toBeNull();
  });

  it('honors OD_UPDATE_METADATA_URL regardless of channel', () => {
    const env = { OD_UPDATE_METADATA_URL: 'https://fixture.local/metadata.json' };
    expect(whatsNewMetadataUrl({ version: '0.13.0', channel: 'development' }, env)).toBe('https://fixture.local/metadata.json');
  });
});

describe('whatsNewReleaseUrl', () => {
  it('links the stable tag and the releases index otherwise', () => {
    expect(whatsNewReleaseUrl(INPUT)).toBe('https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0');
    expect(whatsNewReleaseUrl({ version: '0.13.0-beta.2', channel: 'beta' })).toBe('https://github.com/nexu-io/open-design/releases');
  });
});

describe('parseWhatsNewFromMetadata', () => {
  it('forwards a well-formed block when the feed matches the running version', () => {
    const content = parseWhatsNewFromMetadata(FEED, INPUT);
    expect(content?.title).toBe('Design system sync');
    expect(content?.imageUrl).toBe(FEED.whatsNew.imageUrl);
    expect(content?.locales?.['zh-CN']?.title).toBe('设计系统同步');
  });

  it('returns null when the feed describes another version (update not applied yet)', () => {
    expect(parseWhatsNewFromMetadata(FEED, { version: '0.12.1', channel: 'stable' })).toBeNull();
  });

  it('matches counted release versions through releaseVersion', () => {
    const feed = { ...FEED, releaseVersion: '0.13.0-beta.2', baseVersion: '0.13.0' };
    expect(parseWhatsNewFromMetadata(feed, { version: '0.13.0-beta.2', channel: 'beta' })).not.toBeNull();
  });

  it('drops malformed blocks instead of propagating shape errors', () => {
    expect(parseWhatsNewFromMetadata({ ...FEED, whatsNew: { title: 'only-title' } }, INPUT)).toBeNull();
    expect(parseWhatsNewFromMetadata({ ...FEED, whatsNew: 'not-an-object' }, INPUT)).toBeNull();
    expect(parseWhatsNewFromMetadata(null, INPUT)).toBeNull();
  });

  it('strips non-HTTPS urls but keeps the copy', () => {
    const feed = { ...FEED, whatsNew: { ...FEED.whatsNew, imageUrl: 'http://insecure.example/x.png' } };
    const content = parseWhatsNewFromMetadata(feed, INPUT);
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
        return jsonResponse(FEED);
      },
    });
    const first = await service.readWhatsNew(INPUT);
    const second = await service.readWhatsNew(INPUT);
    expect(first.content?.title).toBe('Design system sync');
    expect(second.content?.title).toBe('Design system sync');
    expect(calls).toBe(1);
  });

  it('resolves to null content instead of failing when the feed is unreachable', async () => {
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    const result = await service.readWhatsNew(INPUT);
    expect(result.content).toBeNull();
    expect(result.stale).toBe(true);
  });

  it('skips the network entirely off release channels without an override', async () => {
    const service = createWhatsNewService({
      env: {},
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });
    const result = await service.readWhatsNew({ version: '0.13.0', channel: 'development' });
    expect(result.content).toBeNull();
    expect(result.stale).toBe(false);
  });
});
