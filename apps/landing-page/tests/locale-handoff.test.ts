import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const LOCALE_SCRIPT_PATH = new URL(
  '../app/_components/locale-switcher-script.astro',
  import.meta.url,
);
const SUB_PAGE_LAYOUT_PATH = new URL(
  '../app/_components/sub-page-layout.astro',
  import.meta.url,
);

async function localeScript(): Promise<string> {
  const source = await readFile(LOCALE_SCRIPT_PATH, 'utf8');
  const match = source.match(/const script = `([\s\S]*?)`;\n---/);
  assert.ok(match?.[1]);
  return match[1]
    .replace('${JSON.stringify(DEFAULT_LOCALE)}', JSON.stringify('en'))
    .replace(
      '${JSON.stringify(localeRoutes)}',
      JSON.stringify([
        { code: 'en', htmlLang: 'en' },
        { code: 'zh', htmlLang: 'zh-CN' },
        { code: 'ja', htmlLang: 'ja' },
      ]),
    )
    .replaceAll('\\`', '`')
    .replaceAll('\\${', '${');
}

async function runLocaleScript(
  initialUrl: string,
  options: { language?: string; referrer?: string; savedLocale?: string } = {},
) {
  const location = new URL(initialUrl, 'https://open-design.ai');
  const assigned: string[] = [];
  const replaced: string[] = [];
  let click: ((event: Record<string, unknown>) => void) | undefined;
  const sessionStorage = new Map<string, string>();
  const link = {
    dataset: { localeCode: 'ja' },
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      if (type === 'click') click = listener;
    },
    closest: () => null,
  };
  const window = {
    location: {
      get href() {
        return location.href;
      },
      get hostname() {
        return location.hostname;
      },
      get pathname() {
        return location.pathname;
      },
      get search() {
        return location.search;
      },
      get hash() {
        return location.hash;
      },
      assign(target: string) {
        assigned.push(target);
      },
    },
    history: {
      state: { fixture: true },
      replaceState(_state: unknown, _title: string, target: string) {
        replaced.push(target);
        const next = new URL(target, location);
        location.pathname = next.pathname;
        location.search = next.search;
        location.hash = next.hash;
      },
    },
    localStorage: {
      getItem: () => options.savedLocale ?? null,
      setItem: () => undefined,
    },
    sessionStorage: {
      getItem: (key: string) => sessionStorage.get(key) ?? null,
      setItem: (key: string, value: string) => sessionStorage.set(key, value),
    },
    matchMedia: () => ({ matches: false }),
    clearTimeout,
    setTimeout,
  };
  const document = {
    documentElement: { getAttribute: () => null },
    referrer: options.referrer ?? '',
    readyState: 'complete',
    querySelectorAll: (selector: string) =>
      selector === '[data-locale-link]' ? [link] : [],
    addEventListener: () => undefined,
  };

  vm.runInNewContext(await localeScript(), {
    document,
    HTMLElement: class {},
    navigator: {
      language: options.language ?? 'en',
      languages: [options.language ?? 'en'],
    },
    Node: class {},
    URLSearchParams,
    URL,
    window,
  });

  return { assigned, click, replaced, sessionStorage };
}

describe('locale handoff', () => {
  it('applies an explicit source locale once and keeps other attribution', async () => {
    const fixture = await runLocaleScript('/pricing/?od_locale=zh&utm_source=amr#plans');

    assert.deepEqual(fixture.assigned, ['/zh/pricing/?utm_source=amr#plans']);
    const raw = fixture.sessionStorage.get('od.localeAttribution');
    assert.ok(raw);
    assert.equal(JSON.parse(raw).redirectReason, 'explicit_handoff');
  });

  it('consumes a matching handoff before a manual language switch', async () => {
    const fixture = await runLocaleScript('/zh/pricing/?od_locale=zh&utm_source=amr#plans');

    assert.deepEqual(fixture.replaced, ['/zh/pricing/?utm_source=amr#plans']);
    assert.ok(fixture.click);
    fixture.click({
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      preventDefault: () => undefined,
      shiftKey: false,
    });
    assert.deepEqual(fixture.assigned, ['/ja/pricing/?utm_source=amr#plans']);

    const reload = await runLocaleScript(fixture.assigned[0]);
    assert.deepEqual(reload.assigned, []);
  });

  it('runs locale adaptation in the head before localized body content paints', async () => {
    const layout = await readFile(SUB_PAGE_LAYOUT_PATH, 'utf8');
    const headEnd = layout.indexOf('</head>');
    const script = layout.indexOf('<LocaleSwitcherScript />');

    assert.ok(script > 0);
    assert.ok(script < headEnd);
    assert.equal(layout.indexOf('<LocaleSwitcherScript />', script + 1), -1);
  });

  it('hands an external acquisition source across an automatic locale redirect', async () => {
    const fixture = await runLocaleScript('/', {
      language: 'zh-CN',
      referrer: 'https://www.google.com/search?q=open+design&token=secret',
    });

    assert.deepEqual(fixture.assigned, ['/zh/']);
    const raw = fixture.sessionStorage.get('od.localeAttribution');
    assert.ok(raw);
    const handoff = JSON.parse(raw);
    assert.deepEqual({
      referrer: handoff.referrer,
      referringDomain: handoff.referringDomain,
      entryPath: handoff.entryPath,
      targetPath: handoff.targetPath,
      redirectReason: handoff.redirectReason,
      detectedLocale: handoff.detectedLocale,
    }, {
      referrer: 'https://www.google.com/search',
      referringDomain: 'www.google.com',
      entryPath: '/',
      targetPath: '/zh/',
      redirectReason: 'browser_detected',
      detectedLocale: 'zh',
    });
    assert.equal(typeof handoff.createdAt, 'number');
  });

  it('hands direct and tagged traffic across an automatic locale redirect', async () => {
    const fixture = await runLocaleScript('/?utm_source=newsletter&gclid=abc&token=secret', {
      language: 'zh-CN',
    });

    const raw = fixture.sessionStorage.get('od.localeAttribution');
    assert.ok(raw);
    const handoff = JSON.parse(raw);
    assert.equal(handoff.referrer, '');
    assert.equal(handoff.referringDomain, '');
    assert.equal(handoff.originalLandingUrl, '/?utm_source=newsletter&gclid=abc');
    assert.deepEqual(handoff.attribution, { utm_source: 'newsletter', gclid: 'abc' });
  });

  it('distinguishes a saved preference from browser detection', async () => {
    const fixture = await runLocaleScript('/', {
      language: 'en',
      savedLocale: 'ja',
    });

    const raw = fixture.sessionStorage.get('od.localeAttribution');
    assert.ok(raw);
    const handoff = JSON.parse(raw);
    assert.equal(handoff.redirectReason, 'saved_preference');
    assert.equal(handoff.detectedLocale, 'ja');
    assert.equal(handoff.redirectTo, '/ja/');
  });

  it('does not replace a genuine same-site continuation with acquisition data', async () => {
    const fixture = await runLocaleScript('/', {
      language: 'zh-CN',
      referrer: 'https://open-design.ai/pricing/',
    });

    assert.deepEqual(fixture.assigned, ['/zh/']);
    assert.equal(fixture.sessionStorage.has('od.localeAttribution'), false);
  });
});
