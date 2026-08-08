import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { getInfoPageCopy } from '../app/info-page-i18n.ts';
import { LANDING_LOCALES } from '../app/i18n.ts';

const downloadPagePath = new URL('../app/pages/download/index.astro', import.meta.url);

type FakeElement = {
  href: string;
  hidden: boolean;
  textContent: string;
  attributes: Map<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeElement | null;
};

function element(options: Partial<Pick<FakeElement, 'href' | 'hidden' | 'textContent'>> = {}): FakeElement {
  const children = new Map<string, FakeElement>();
  const attributes = new Map<string, string>();
  return {
    href: options.href ?? '',
    hidden: options.hidden ?? false,
    textContent: options.textContent ?? '',
    attributes,
    getAttribute(name) {
      if (name === 'href') return this.href;
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    querySelector(selector) {
      return children.get(selector) ?? null;
    },
  };
}

function extractEnhancer(page: string): string {
  const scriptTag = page.indexOf('<script', page.indexOf('</article>'));
  const start = page.indexOf('    (() => {', scriptTag);
  const scriptEnd = page.indexOf('  </script>', start);
  const endMarker = '    })();';
  const end = page.lastIndexOf(endMarker, scriptEnd);
  assert.ok(scriptTag >= 0 && start >= 0 && end > start, 'download release enhancer not found');
  return page.slice(start, end + endMarker.length);
}

test('download page refreshes the complete stable release snapshot on entry', async () => {
  const page = await readFile(downloadPagePath, 'utf8');
  const enhancer = extractEnhancer(page);

  const hero = element({ href: 'https://releases.open-design.ai/stable/versions/0.17.0/open-design-0.17.0-mac-arm64.dmg' });
  const notice = element({ hidden: true });
  const osSlot = element({ hidden: true });
  const labelSlot = element({ textContent: 'Download' });
  const versionSlots = [element({ textContent: 'v0.17.0' }), element({ textContent: 'v0.17.0' })];
  const dateSlot = element({ textContent: '2026-08-03' });
  const releaseLink = element({ href: 'https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0' });
  const sizeSlot = element({ textContent: '280 MB' });
  const macDownload = element({
    href: 'https://releases.open-design.ai/stable/versions/0.17.0/open-design-0.17.0-mac-arm64.dmg',
  });
  macDownload.setAttribute('data-dl-key', 'mac-arm64-dmg');
  macDownload.querySelector = (selector) => (selector === '[data-dl-size]' ? sizeSlot : null);

  const cardRecommendation = element({ hidden: true });
  const card = element();
  card.setAttribute('data-dl-match', 'mac-arm64');
  card.querySelector = (selector) => (selector === '[data-dl-rec]' ? cardRecommendation : null);

  const selectors = new Map<string, FakeElement[]>([
    ['[data-dl-card]', [card]],
    ['[data-release-version]', versionSlots],
    ['[data-release-date]', [dateSlot]],
    ['[data-release-notes-link]', [releaseLink]],
    ['[data-dl-key]', [macDownload]],
    ['[data-dl-key="mac-arm64-dmg"]', [macDownload]],
    ['[data-dl-key="mac-x64-dmg"]', []],
    ['[data-dl-key="win-setup"]', []],
    ['[data-dl-key="linux-appimage"]', []],
  ]);
  const document = {
    addEventListener() {},
    querySelector(selector: string) {
      if (selector === '[data-dl-mobile-notice]') return notice;
      if (selector === '[data-dl-auto]') return hero;
      if (selector === '[data-dl-auto-os]') return osSlot;
      if (selector === '[data-dl-auto-label]') return labelSlot;
      return null;
    },
    querySelectorAll(selector: string) {
      return selectors.get(selector) ?? [];
    },
    createElement() {
      return {
        getContext: () => ({
          getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
          getParameter: () => 'Apple GPU',
        }),
      };
    },
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    __odTrack: undefined,
    posthog: undefined,
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  };
  const requestedUrls: string[] = [];
  let responseMetadata = {
    channel: 'stable',
    releaseState: 'complete',
    releaseVersion: '0.18.0',
    versionTag: 'open-design-v0.18.0',
    generatedAt: '2026-08-05T17:31:11.878Z',
    platforms: {
      mac: {
        artifacts: {
          dmg: {
            name: 'open-design-0.18.0-mac-arm64.dmg',
            size: 300_329_080,
            url: 'https://releases.open-design.ai/stable/versions/0.18.0/open-design-0.18.0-mac-arm64.dmg',
          },
        },
      },
    },
  };
  const fetch = async (url: string) => {
    requestedUrls.push(url);
    return {
      ok: true,
      async json() {
        return responseMetadata;
      },
    };
  };

  const runEnhancer = () => {
    // Execute the production inline enhancer against the current static snapshot.
    // eslint-disable-next-line no-new-func
    new Function(
      'window',
      'navigator',
      'document',
      'fetch',
      'autoPrefix',
      'directAssets',
      'releaseMetadataUrl',
      enhancer,
    )(
      window,
      navigator,
      document,
      fetch,
      'Download for',
      { macArm64: hero.href },
      '/release-metadata',
    );
  };

  runEnhancer();

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(requestedUrls, ['/release-metadata']);
  assert.deepEqual(versionSlots.map((slot) => slot.textContent), ['v0.18.0', 'v0.18.0']);
  assert.equal(dateSlot.textContent, '2026-08-05');
  assert.match(releaseLink.href, /open-design-v0\.18\.0$/);
  assert.match(macDownload.href, /stable\/versions\/0\.18\.0\/open-design-0\.18\.0-mac-arm64\.dmg$/);
  assert.equal(sizeSlot.textContent, '286 MB');
  assert.equal(hero.href, macDownload.href);

  responseMetadata = {
    ...responseMetadata,
    releaseVersion: '0.19.0',
    versionTag: 'open-design-v0.18.0',
    platforms: {
      mac: {
        artifacts: {
          dmg: {
            name: 'open-design-0.19.0-mac-arm64.dmg',
            size: 310_000_000,
            url: 'https://releases.open-design.ai/stable/versions/0.19.0/open-design-0.19.0-mac-arm64.dmg',
          },
        },
      },
    },
  };
  runEnhancer();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(versionSlots.map((slot) => slot.textContent), ['v0.18.0', 'v0.18.0']);
  assert.match(macDownload.href, /stable\/versions\/0\.18\.0\//);

  responseMetadata = {
    ...responseMetadata,
    versionTag: 'open-design-v0.19.0',
    platforms: {
      mac: {
        artifacts: {
          dmg: {
            name: 'open-design-0.18.0-mac-arm64.dmg',
            size: 300_329_080,
            url: 'https://releases.open-design.ai/stable/versions/0.18.0/open-design-0.18.0-mac-arm64.dmg',
          },
        },
      },
    },
  };
  runEnhancer();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(requestedUrls.length, 3);
  assert.deepEqual(versionSlots.map((slot) => slot.textContent), ['v0.18.0', 'v0.18.0']);
  assert.match(macDownload.href, /stable\/versions\/0\.18\.0\//);
});

test('download page keeps the static snapshot when stable metadata is incomplete', async () => {
  const page = await readFile(downloadPagePath, 'utf8');
  const enhancer = extractEnhancer(page);

  const hero = element({ href: 'https://releases.open-design.ai/stable/versions/0.17.0/open-design-0.17.0-mac-arm64.dmg' });
  const versionSlot = element({ textContent: 'v0.17.0' });
  const dateSlot = element({ textContent: '2026-08-03' });
  const releaseLink = element({ href: 'https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0' });
  const sizeSlot = element({ textContent: '280 MB' });
  const macDownload = element({ href: hero.href });
  macDownload.setAttribute('data-dl-key', 'mac-arm64-dmg');
  macDownload.querySelector = (selector) => (selector === '[data-dl-size]' ? sizeSlot : null);

  const selectors = new Map<string, FakeElement[]>([
    ['[data-dl-card]', []],
    ['[data-release-version]', [versionSlot]],
    ['[data-release-date]', [dateSlot]],
    ['[data-release-notes-link]', [releaseLink]],
    ['[data-dl-key]', [macDownload]],
    ['[data-dl-key="mac-arm64-dmg"]', [macDownload]],
    ['[data-dl-key="mac-x64-dmg"]', []],
    ['[data-dl-key="win-setup"]', []],
    ['[data-dl-key="linux-appimage"]', []],
  ]);
  const document = {
    addEventListener() {},
    querySelector(selector: string) {
      if (selector === '[data-dl-auto]') return hero;
      return null;
    },
    querySelectorAll(selector: string) {
      return selectors.get(selector) ?? [];
    },
    createElement() {
      return {
        getContext: () => ({
          getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
          getParameter: () => 'Apple GPU',
        }),
      };
    },
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    __odTrack: undefined,
    posthog: undefined,
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  };
  const fetch = async () => ({
    ok: true,
    async json() {
      return {
        channel: 'stable',
        releaseState: 'complete',
        releaseVersion: '0.18.0',
        versionTag: 'open-design-v0.18.0',
        generatedAt: '2026-08-05T17:31:11.878Z',
        platforms: { mac: { artifacts: {} } },
      };
    },
  });

  // eslint-disable-next-line no-new-func
  new Function(
    'window',
    'navigator',
    'document',
    'fetch',
    'autoPrefix',
    'directAssets',
    'releaseMetadataUrl',
    enhancer,
  )(
    window,
    navigator,
    document,
    fetch,
    'Download for',
    { macArm64: hero.href },
    '/release-metadata',
  );

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(versionSlot.textContent, 'v0.17.0');
  assert.equal(dateSlot.textContent, '2026-08-03');
  assert.match(releaseLink.href, /open-design-v0\.17\.0$/);
  assert.match(macDownload.href, /stable\/versions\/0\.17\.0\//);
  assert.equal(sizeSlot.textContent, '280 MB');
  assert.equal(hero.href, macDownload.href);
});

test('download page does not expose checksum actions', async () => {
  const page = await readFile(downloadPagePath, 'utf8');

  assert.doesNotMatch(page, /class="dl-sha"/);
  assert.doesNotMatch(page, /row\.asset\.sha256Url/);
  assert.doesNotMatch(page, /page\.checksum/);
});

test('localized download links do not advertise checksums', () => {
  const checksumTerms =
    /checksum|チェックサム|체크섬|prüfsumm|sommes? de contrôle|контрольн|sumas? de verificación|somas? de verificação|sağlama toplam/iu;

  for (const locale of LANDING_LOCALES) {
    assert.doesNotMatch(
      [
        getInfoPageCopy(locale.code).download.allReleasesTitle,
        getInfoPageCopy(locale.code).download.allReleasesBody,
      ].join(' '),
      checksumTerms,
      `download release copy exposes checksums for ${locale.code}`,
    );
  }
});

test('download page refreshes the neutral release link when no desktop platform is detected', async () => {
  const page = await readFile(downloadPagePath, 'utf8');
  const enhancer = extractEnhancer(page);
  const hero = element({ href: 'https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0' });
  const versionSlot = element({ textContent: 'v0.17.0' });
  const requestedUrls: string[] = [];
  const document = {
    addEventListener() {},
    querySelector(selector: string) {
      if (selector === '[data-dl-auto]') return hero;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === '[data-release-version]') return [versionSlot];
      return [];
    },
    createElement() {
      throw new Error('mobile platform detection must not probe WebGL');
    },
  };
  const window = {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    __odTrack: undefined,
    posthog: undefined,
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
    platform: 'iPhone',
    maxTouchPoints: 5,
  };
  const fetch = async (url: string) => {
    requestedUrls.push(url);
    return {
      ok: true,
      async json() {
        return {
          channel: 'stable',
          releaseState: 'complete',
          releaseVersion: '0.18.0',
          versionTag: 'open-design-v0.18.0',
          generatedAt: '2026-08-05T17:31:11.878Z',
          platforms: {},
        };
      },
    };
  };

  // eslint-disable-next-line no-new-func
  new Function(
    'window',
    'navigator',
    'document',
    'fetch',
    'autoPrefix',
    'directAssets',
    'releaseMetadataUrl',
    enhancer,
  )(
    window,
    navigator,
    document,
    fetch,
    'Download for',
    {},
    '/release-metadata',
  );

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(requestedUrls, ['/release-metadata']);
  assert.equal(versionSlot.textContent, 'v0.18.0');
  assert.match(hero.href, /open-design-v0\.18\.0$/);
  assert.equal(hero.attributes.has('download'), false);
});
