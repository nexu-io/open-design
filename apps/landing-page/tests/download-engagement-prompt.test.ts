import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDownloadPromptCopy } from '../app/download-prompt-i18n.ts';
import { getHomeExtra } from '../app/home-translations.ts';
import { getInfoPageCopy } from '../app/info-page-i18n.ts';
import { LANDING_LOCALES } from '../app/i18n.ts';
import { buildMatrixFromStableMetadata } from '../app/_lib/github.ts';

const componentSource = readFileSync(
  new URL('../app/_components/download-engagement-prompt.astro', import.meta.url),
  'utf8',
);
const headerEnhancerSource = readFileSync(
  new URL('../app/_components/header-enhancer.astro', import.meta.url),
  'utf8',
);
const homePageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const homeIndexSource = readFileSync(new URL('../app/pages/index.astro', import.meta.url), 'utf8');
const homeStylesSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const downloadPageSource = readFileSync(
  new URL('../app/pages/download/index.astro', import.meta.url),
  'utf8',
);

const enhancerStart = componentSource.indexOf('    (() => {');
const enhancerEndMarker = '    })();';
const enhancerEnd = componentSource.indexOf(enhancerEndMarker, enhancerStart);
assert.ok(enhancerStart >= 0 && enhancerEnd > enhancerStart, 'prompt enhancer script not found');
const enhancerSource = componentSource.slice(
  enhancerStart,
  enhancerEnd + enhancerEndMarker.length,
);
const headerDownloadEnhancerStart = headerEnhancerSource.indexOf(
  '    const navDownload = document.querySelector(',
);
const headerDownloadEnhancerEnd = headerEnhancerSource.indexOf(
  '    const chrome = document.querySelector(',
  headerDownloadEnhancerStart,
);
assert.ok(
  headerDownloadEnhancerStart >= 0 && headerDownloadEnhancerEnd > headerDownloadEnhancerStart,
  'header download enhancer not found',
);
const headerDownloadEnhancerSource = headerEnhancerSource.slice(
  headerDownloadEnhancerStart,
  headerDownloadEnhancerEnd,
);
const homeDownloadEnhancerStart = homeIndexSource.indexOf(
  '        const enhanceDownloadCta = () => {',
);
const homeDownloadEnhancerEnd = homeIndexSource.indexOf(
  '        // Labs artifact switcher.',
  homeDownloadEnhancerStart,
);
assert.ok(
  homeDownloadEnhancerStart >= 0 && homeDownloadEnhancerEnd > homeDownloadEnhancerStart,
  'homepage download enhancer not found',
);
const homeDownloadEnhancerSource = `${homeIndexSource.slice(
  homeDownloadEnhancerStart,
  homeDownloadEnhancerEnd,
)}\n        enhanceDownloadCta();`;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };
}

function runPromptEnhancer(options: {
  sessionStorage: ReturnType<typeof createMemoryStorage>;
  pageName?: string;
  runPageCountTimeout?: boolean;
  runHeaderFirst?: boolean;
  device?: { userAgent: string; platform: string; maxTouchPoints: number };
}) {
  const attributes = new Map<string, string>();
  const cta = {
    setAttribute(name: string, value: string) { attributes.set(name, value); },
    addEventListener() {},
  };
  const dialog = {
    open: false,
    returnValue: '',
    querySelector: () => cta,
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    showModal() { this.open = true; },
    close(value: string) { this.returnValue = value; this.open = false; },
  };
  const linkAttributes = new Map<string, string>();
  const directLink = {
    href: '/download/',
    setAttribute(name: string, value: string) { linkAttributes.set(name, value); },
    removeAttribute(name: string) { linkAttributes.delete(name); },
    hasAttribute(name: string) { return linkAttributes.has(name); },
    querySelector() { return null; },
    appendChild() {},
  };
  const document = {
    visibilityState: 'visible',
    documentElement: { classList: { add() {}, remove() {} } },
    querySelector: (selector: string) => {
      if (selector === '[data-download-engagement-prompt]') return dialog;
      if (selector === '[data-direct-download][data-download-placement="nav"]') {
        return directLink;
      }
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector === '[data-direct-download]' || selector.startsWith('[data-download-cta]')
        ? [directLink]
        : [],
    createElement: () => ({
      getContext: () => ({
        getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
        getParameter: () => 'Apple GPU',
      }),
    }),
  };
  const window = {
    location: { search: '' },
    matchMedia: () => ({ matches: true }),
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback: () => void, delay: number) {
      if (options.runPageCountTimeout && delay === 1200) callback();
      return 1;
    },
    __odTrack: undefined,
    __odDownloadPrompt: undefined,
  };
  const navigator = {
    userAgent: options.device?.userAgent ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1',
    platform: options.device?.platform ?? 'MacIntel',
    maxTouchPoints: options.device?.maxTouchPoints ?? 5,
  };
  const directAssets = {
    macArm64: 'https://example.com/open-design-mac-arm64.dmg',
    macX64: 'https://example.com/open-design-mac-x64.dmg',
    windows: 'https://example.com/open-design-win-x64-setup.exe',
    linux: 'https://example.com/open-design-x86_64.AppImage',
  };
  const fetch = async () => ({ ok: true, json: async () => ({ assets: [] }) });

  if (options.runHeaderFirst) {
    // Execute the production header download block first, matching page order.
    // eslint-disable-next-line no-new-func
    new Function('document', 'navigator', 'directAssets', headerDownloadEnhancerSource)(
      document,
      navigator,
      directAssets,
    );
  }

  // Execute the production prompt enhancer after the header block. The default
  // fixture is wide iPadOS; matrix tests can supply other browser signatures.
  // eslint-disable-next-line no-new-func
  new Function(
    'window',
    'document',
    'navigator',
    'sessionStorage',
    'localStorage',
    'pageName',
    'locale',
    'ACTIVE_SECONDS_THRESHOLD',
    'PAGE_COUNT_THRESHOLD',
    'DISMISS_COOLDOWN_MS',
    'DOWNLOAD_COOLDOWN_MS',
    'directAssets',
    'fetch',
    'Element',
    enhancerSource,
  )(
    window,
    document,
    navigator,
    options.sessionStorage,
    createMemoryStorage(),
    options.pageName ?? 'solutions_prototype',
    'en',
    35,
    3,
    7 * 24 * 60 * 60 * 1000,
    30 * 24 * 60 * 60 * 1000,
    directAssets,
    fetch,
    class Element {},
  );

  return {
    dialog,
    ctaAttributes: attributes,
    directLink,
    linkAttributes,
    document,
    navigator,
    window,
  };
}

async function runHomepageDownloadEnhancerAfterPrompt(
  result: ReturnType<typeof runPromptEnhancer>,
) {
  const fetch = async () => ({
    ok: true,
    json: async () => ({
      assets: [{
        name: 'open-design-0.16.1-mac-arm64.dmg',
        browser_download_url: 'https://example.com/open-design-mac-arm64.dmg',
      }],
    }),
  });

  // Execute the production homepage enhancer after the production prompt
  // enhancer, matching their document order on the generated homepage.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', 'fetch', homeDownloadEnhancerSource)(
    result.window,
    result.document,
    result.navigator,
    fetch,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  return result;
}

test('download prompt: every active locale has complete, localized copy', () => {
  assert.deepEqual(
    LANDING_LOCALES.map(({ code }) => code),
    ['en', 'zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr'],
  );

  const english = getDownloadPromptCopy('en');
  for (const { code } of LANDING_LOCALES) {
    const copy = getDownloadPromptCopy(code);
    assert.match(copy.body, /Vibe Design Workspace/, `${code}: positioning is missing`);
    assert.equal(copy.benefits.length, 3, `${code}: expected three benefits`);
    for (const value of [
      copy.eyebrow,
      copy.title,
      copy.body,
      ...copy.benefits,
      copy.primary,
      copy.secondary,
      copy.platformNote,
      copy.closeLabel,
    ]) {
      assert.ok(value.trim().length > 0, `${code}: prompt copy must be non-empty`);
    }
    if (code !== 'en') {
      assert.notEqual(copy.body, english.body, `${code}: body must not fall back to English`);
      assert.notEqual(copy.primary, english.primary, `${code}: CTA must not fall back to English`);
    }
  }
  assert.equal(getDownloadPromptCopy('zh').primary, '免费下载');
});

test('homepage hero: every active locale carries the brand-system scenario promise', () => {
  const english = getHomeExtra('en').heroTaskTitle!;
  const englishHighlight = getHomeExtra('en').heroSubHighlight!;
  for (const { code } of LANDING_LOCALES) {
    const home = getHomeExtra(code);
    const title = home.heroTaskTitle;
    const lines = home.heroTaskLines;
    const emphasis = home.heroTaskEmphasis;
    const highlight = home.heroSubHighlight;
    assert.ok(title && title.length > 20, `${code}: hero scenario promise is missing`);
    assert.equal(lines?.length, 2, `${code}: hero promise must have two deliberate lines`);
    assert.ok(lines?.every((line) => line.trim().length > 0), `${code}: hero lines must be non-empty`);
    assert.ok(emphasis, `${code}: design-system emphasis is missing`);
    assert.ok(
      lines?.some((line) => line.includes(emphasis)),
      `${code}: design-system emphasis must match the localized hero promise`,
    );
    assert.match(home.heroTitleSub, /Claude Design/, `${code}: eyebrow positioning is inconsistent`);
    assert.ok(highlight && highlight.length > 10, `${code}: inline value highlight is missing`);
    assert.ok(home.heroSub.includes(highlight), `${code}: inline value highlight must match heroSub`);
    if (code !== 'en') {
      assert.notEqual(title, english, `${code}: hero promise fell back to English`);
      assert.notEqual(
        highlight,
        englishHighlight,
        `${code}: inline value highlight fell back to English`,
      );
    }
  }
  assert.match(english, /design system/i);
  assert.equal(
    english,
    'One design system. Every website, slide, prototype, dashboard, image, and video stays on-brand.',
  );
  assert.equal(
    getHomeExtra('zh').heroTaskTitle,
    '一套设计系统，让网页、PPT、原型、数据看板、图像与视频保持品牌一致',
  );
  assert.equal(getHomeExtra('en').heroTitleSub, 'Best open-source Claude Design alternative');
  assert.equal(getHomeExtra('zh').heroTitleSub, 'Claude Design最佳开源平替');
  assert.equal(getHomeExtra('zh').heroSubHighlight, '把你已有的 Coding Agent 变成设计引擎');
  assert.doesNotMatch(homePageSource, /hero-title-agent-promise/);
  assert.match(homePageSource, /hero-sub-highlight/);
  assert.match(homePageSource, /hero-title-main-line/);
  assert.match(homePageSource, /hero-task-emphasis/);
  assert.match(
    homeStylesSource,
    /\.hero-title-main-line\s*\{[^}]*background:\s*none;[^}]*text-decoration:\s*none;/s,
  );
  assert.match(
    homeStylesSource,
    /\.hero-task-emphasis\s*\{[^}]*display:\s*inline-block;[^}]*background:\s*linear-gradient\(/s,
  );
  assert.match(homePageSource, /hero-download-attention/);
  assert.match(homePageSource, /data-direct-download/);
});

test('download hero: every active locale explains the agent-led design workflow', () => {
  const english = getInfoPageCopy('en').download;
  for (const { code } of LANDING_LOCALES) {
    const copy = getInfoPageCopy(code).download;
    for (const value of [copy.heading, copy.lead, copy.heroVisualAlt]) {
      assert.ok(value.trim().length > 20, `${code}: download hero copy must be complete`);
    }
    assert.match(copy.lead, /Codex/);
    assert.match(copy.lead, /Claude Code/);
    assert.match(copy.lead, /HTML/);
    if (code !== 'en') {
      assert.notEqual(copy.heading, english.heading, `${code}: heading fell back to English`);
      assert.notEqual(copy.lead, english.lead, `${code}: lead fell back to English`);
      assert.notEqual(
        copy.heroVisualAlt,
        english.heroVisualAlt,
        `${code}: visual alt fell back to English`,
      );
    }
  }
  assert.equal(
    getInfoPageCopy('zh').download.heading,
    '免费下载 Open Design，用你的 Agent 开始设计。',
  );
  assert.match(downloadPageSource, /hero-product-1280\.webp/);
  assert.match(downloadPageSource, /hero-download-attention/);
  assert.match(downloadPageSource, /dl-hero-cta-icon/);
  assert.match(downloadPageSource, /data-direct-download/);
  assert.match(downloadPageSource, /directAssets\[platform\.assetKey\]/);
});

test('download prompt: production rules and suppression windows stay explicit', () => {
  assert.match(componentSource, /ACTIVE_SECONDS_THRESHOLD = 35/);
  assert.match(componentSource, /PAGE_COUNT_THRESHOLD = 3/);
  assert.match(componentSource, /DISMISS_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(componentSource, /DOWNLOAD_COOLDOWN_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(componentSource, /pageName !== 'download'/);
  assert.match(componentSource, /matchMedia\('\(min-width: 768px\)'\)/);
  assert.match(componentSource, /document\.visibilityState !== 'visible'/);
});

test('download prompt: wide iPadOS keeps the neutral download-page fallback', () => {
  const result = runPromptEnhancer({ sessionStorage: createMemoryStorage() });

  assert.equal(result.directLink.href, '/download/');
  assert.equal(result.linkAttributes.has('download'), false);
  assert.equal(result.linkAttributes.has('data-download-platform-label'), false);
});

test('download prompt: later homepage enhancement preserves the wide-iPadOS fallback', async () => {
  const promptResult = runPromptEnhancer({ sessionStorage: createMemoryStorage() });
  const result = await runHomepageDownloadEnhancerAfterPrompt(promptResult);

  assert.equal(result.directLink.href, '/download/');
  assert.equal(result.linkAttributes.has('download'), false);
  assert.equal(result.linkAttributes.has('data-download-platform-label'), false);
});

test('download prompt: header and prompt keep mobile fallbacks aligned in document order', () => {
  const fixtures = [
    {
      name: 'Firefox Android',
      device: {
        userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0',
        platform: 'Linux armv81',
        maxTouchPoints: 5,
      },
      expectedHref: '/download/',
    },
    {
      name: 'Chrome Android without userAgentData',
      device: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      },
      expectedHref: '/download/',
    },
    {
      name: 'iPadOS desktop mode',
      device: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
      expectedHref: '/download/',
    },
    {
      name: 'Windows desktop',
      device: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0,
      },
      expectedHref: 'https://example.com/open-design-win-x64-setup.exe',
    },
    {
      name: 'Linux desktop',
      device: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      },
      expectedHref: 'https://example.com/open-design-x86_64.AppImage',
    },
  ];

  for (const fixture of fixtures) {
    const result = runPromptEnhancer({
      sessionStorage: createMemoryStorage(),
      runHeaderFirst: true,
      device: fixture.device,
    });

    assert.equal(result.directLink.href, fixture.expectedHref, fixture.name);
    assert.equal(
      result.linkAttributes.has('download'),
      fixture.expectedHref !== '/download/',
      fixture.name,
    );
  }
});

test('download prompt: three repeated visits to the same route trigger page-count lifecycle', () => {
  const sessionStorage = createMemoryStorage();
  const first = runPromptEnhancer({ sessionStorage, runPageCountTimeout: true });
  const second = runPromptEnhancer({ sessionStorage, runPageCountTimeout: true });
  const third = runPromptEnhancer({ sessionStorage, runPageCountTimeout: true });

  assert.equal(first.dialog.open, false);
  assert.equal(second.dialog.open, false);
  assert.equal(third.dialog.open, true);
  assert.equal(third.ctaAttributes.get('data-download-prompt-trigger'), 'page_count');
  assert.equal(sessionStorage.getItem('od_download_prompt_page_views_v2'), '3');
});

test('download prompt: CTA attribution and modal lifecycle are tracked', () => {
  assert.match(componentSource, /data-download-placement="engagement_prompt"/);
  assert.match(componentSource, /data-direct-download/);
  assert.doesNotMatch(componentSource, /data-download-page/);
  assert.match(componentSource, /getLatestRelease/);
  assert.match(componentSource, /applyDirectAsset\(directAssets\[platform\.key\]/);
  assert.match(componentSource, /releases\/latest/);
  assert.match(componentSource, /track\('surface_view'/);
  assert.match(componentSource, /element: 'engagement_modal'/);
  assert.match(componentSource, /track\('ui_click', \{ element: 'dismiss'/);
  assert.match(componentSource, /data-download-prompt-trigger/);
  assert.match(componentSource, /download_prompt'\) === 'preview'/);
});

test('download prompt: official stable metadata keeps installer links direct when GitHub is rate-limited', () => {
  const matrix = buildMatrixFromStableMetadata({
    platforms: {
      mac: {
        artifacts: {
          dmg: {
            name: 'open-design-0.16.1-mac-arm64.dmg',
            url: 'https://releases.open-design.ai/stable/versions/0.16.1/open-design-0.16.1-mac-arm64.dmg',
            size: 292_248_232,
            sha256Url: 'https://releases.open-design.ai/mac-arm64.dmg.sha256',
          },
        },
      },
      macIntel: {
        artifacts: {
          dmg: {
            name: 'open-design-0.16.1-mac-x64.dmg',
            url: 'https://releases.open-design.ai/stable/versions/0.16.1/open-design-0.16.1-mac-x64.dmg',
          },
        },
      },
      win: {
        artifacts: {
          installer: {
            name: 'open-design-0.16.1-win-x64-setup.exe',
            url: 'https://releases.open-design.ai/stable/versions/0.16.1/open-design-0.16.1-win-x64-setup.exe',
          },
        },
      },
    },
  });

  assert.match(matrix.macArm64Dmg?.url ?? '', /mac-arm64\.dmg$/);
  assert.match(matrix.macX64Dmg?.url ?? '', /mac-x64\.dmg$/);
  assert.match(matrix.winSetup?.url ?? '', /win-x64-setup\.exe$/);
  assert.equal(matrix.macArm64Dmg?.size, 292_248_232);
  assert.equal(matrix.linux, null);
});
