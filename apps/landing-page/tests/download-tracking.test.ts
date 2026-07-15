import { test } from 'node:test';
import assert from 'node:assert/strict';

import { posthogHeadHtml } from '../app/_lib/posthog-analytics.ts';
import { googleAnalyticsHeadHtml } from '../app/_lib/google-analytics.ts';
import { pageNameFromPath } from '../app/i18n.ts';

/**
 * The landing-site trackers are emitted as inline-script STRINGS, so neither
 * `astro check` nor a plain import exercises their runtime branches. These
 * tests extract the real emitted script and run it against a minimal DOM shim,
 * proving that download CTAs which route to the /download/ installer-matrix
 * page (the header nav button + sub-page CTAs) still emit a download event —
 * the gap this change closes — distinguished by `download_target`.
 */

type CaptureCall = { name: string; props: Record<string, unknown> };

function makeLink(opts: {
  href: string;
  pathname: string;
  attrs?: Record<string, string>;
  text?: string;
}) {
  const attrs = opts.attrs ?? {};
  const el: any = {
    href: opts.href,
    pathname: opts.pathname,
    textContent: opts.text ?? '',
    getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
    // Only resolve as the clicked anchor; every discriminator selector
    // (locale, share, carousel, nav-primary, sections) must miss.
    closest: (sel: string) => (sel === 'a[href]' ? el : null),
  };
  return el;
}

function runPosthogTracker(pageName?: string) {
  const html = posthogHeadHtml('phc_test_key', 'https://us.i.posthog.com', pageName);
  const start = html.indexOf('(function () {');
  const end = html.lastIndexOf('})();') + '})();'.length;
  assert.ok(start !== -1 && end > start, 'tracker IIFE not found in emitted script');
  const iife = html.slice(start, end);

  const captures: CaptureCall[] = [];
  const handlers: Record<string, (ev: any) => void> = {};
  const win: any = {
    location: {
      href: 'https://open-design.dev/?utm_source=twitter&utm_content=readme_download',
    },
    posthog: {
      capture: (name: string, props: any) => captures.push({ name, props }),
      get_distinct_id: () => 'web-anon-1',
    },
  };
  const doc: any = {
    documentElement: { getAttribute: () => 'zh' },
    referrer: 'https://referrer.example/',
    addEventListener: (type: string, fn: (ev: any) => void) => {
      handlers[type] = fn;
    },
  };
  const nav: any = { userAgent: 'mozilla mac os x', platform: 'MacIntel' };
  const fetchStub = async () => new Response(JSON.stringify({
    downloadUrl: 'https://download.open-design.ai/mac/arm64/odtoken_123456/Open.dmg',
  }), { status: 200 });

  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', iife)(win, doc, nav);
  return {
    captures,
    click: (target: any) => {
      const oldFetch = globalThis.fetch;
      (globalThis as any).fetch = fetchStub;
      let ev: any;
      ev = { target, defaultPrevented: false, preventDefault: () => { ev.defaultPrevented = true; } };
      try {
        handlers.click?.(ev);
        return ev;
      } finally {
        (globalThis as any).fetch = oldFetch;
      }
    },
    win,
  };
}

test('posthog: page_view fires on load', () => {
  const { captures } = runPosthogTracker();
  const pv = captures.find((c) => c.name === 'page_view');
  assert.ok(pv, 'expected a page_view capture on load');
  assert.equal(pv!.props.page_name, 'landing_home');
});

test('posthog: hero direct download (rewritten to .dmg) → direct + placement=hero', () => {
  const { captures, click } = runPosthogTracker();
  // After the enhancer rewrites the hero CTA, its href is a direct .dmg asset.
  click(
    makeLink({
      href: 'https://github.com/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      pathname: '/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      attrs: { 'data-download-placement': 'hero' },
      text: '下载桌面端',
    }),
  );
  const dl = captures.find((c) => c.name === 'ui_click' && c.props.element === 'download_desktop');
  assert.ok(dl, 'expected a download_desktop click event');
  assert.equal(dl!.props.download_target, 'direct');
  assert.equal(dl!.props.placement, 'hero');
  assert.equal(dl!.props.platform, 'macos');
  const ev = click(
    makeLink({
      href: 'https://github.com/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      pathname: '/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      attrs: { 'data-download-placement': 'hero' },
      text: '下载桌面端',
    }),
  );
  assert.equal(ev.defaultPrevented, true, 'direct download should be routed through attribution mint');
});

test('posthog: cta-band direct download → direct + placement=cta', () => {
  const { captures, click } = runPosthogTracker();
  click(
    makeLink({
      href: 'https://github.com/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      pathname: '/nexu-io/open-design/releases/download/v1/od-mac-arm64.dmg',
      attrs: { 'data-download-placement': 'cta' },
      text: '下载桌面端',
    }),
  );
  const dl = captures.find((c) => c.name === 'ui_click' && c.props.element === 'download_desktop');
  assert.ok(dl);
  assert.equal(dl!.props.download_target, 'direct');
  assert.equal(dl!.props.placement, 'cta');
});

test('posthog: nav /download/ button → download_page + placement=nav', () => {
  const { captures, click } = runPosthogTracker();
  click(
    makeLink({
      href: 'https://open-design.dev/zh/download/',
      pathname: '/zh/download/',
      attrs: { 'data-download-page': '', 'data-download-placement': 'nav' },
      text: '下载',
    }),
  );
  const dl = captures.find((c) => c.name === 'ui_click' && c.props.element === 'download_desktop');
  assert.ok(dl, 'expected a download_desktop click event for the nav download button');
  assert.equal(dl!.props.download_target, 'download_page');
  assert.equal(dl!.props.placement, 'nav');
});

test('posthog: bare /download/ link (no attr) still matched by path', () => {
  const { captures, click } = runPosthogTracker();
  click(makeLink({ href: 'https://open-design.dev/download/', pathname: '/download/', text: 'Download desktop' }));
  const dl = captures.find((c) => c.name === 'ui_click' && c.props.element === 'download_desktop');
  assert.ok(dl, 'expected a download_desktop click event for a bare /download/ link');
  assert.equal(dl!.props.download_target, 'download_page');
});

test('posthog: unrelated /downloads-guide/ is NOT a download event', () => {
  const { captures, click } = runPosthogTracker();
  click(makeLink({ href: 'https://open-design.dev/downloads-guide/', pathname: '/downloads-guide/', text: 'guide' }));
  const dl = captures.find((c) => c.name === 'ui_click' && c.props.element === 'download_desktop');
  assert.equal(dl, undefined, '/downloads-guide/ must not be treated as a download');
});

test('posthog: page_name is parameterized per page (not hardcoded landing_home)', () => {
  const { captures, click } = runPosthogTracker('download');
  const pv = captures.find((c) => c.name === 'page_view');
  assert.equal(pv!.props.page_name, 'download', 'page_view must report the real page');
  click(makeLink({ href: 'https://open-design.dev/download/', pathname: '/download/', text: 'Download' }));
  const ev = captures.find((c) => c.name === 'ui_click');
  assert.equal(ev!.props.page_name, 'download', 'ui_click must report the real page');
});

test('pageNameFromPath: home, sub-pages, and locale-prefixed routes', () => {
  assert.equal(pageNameFromPath('/'), 'landing_home');
  assert.equal(pageNameFromPath('/download/'), 'download');
  assert.equal(pageNameFromPath('/zh/download/'), 'download');
  assert.equal(pageNameFromPath('/solutions/prototype/'), 'solutions_prototype');
  assert.equal(pageNameFromPath('/ja/solutions/prototype/'), 'solutions_prototype');
  assert.equal(pageNameFromPath('/compare/'), 'compare');
});

test('google-analytics: emits page_name and the /download/ regex matches only the installer path', () => {
  const html = googleAnalyticsHeadHtml('G-TEST', 'download');
  assert.match(html, /page_name: "download"/);
  // The download-page branch must be present in the emitted GA script.
  assert.match(html, /data-download-page/);
  const m = html.match(/\/\\\/download\\\/\?\$\//);
  assert.ok(m, 'expected the emitted /\\/download\\/?$/ regex in the GA script');
  // Reconstruct the same regex the browser will run and check its behavior.
  const re = /\/download\/?$/;
  assert.ok(re.test('/download/'));
  assert.ok(re.test('/zh/download/'));
  assert.ok(re.test('/download'));
  assert.ok(!re.test('/downloads-guide/'));
  assert.ok(!re.test('/blog/'));
});
