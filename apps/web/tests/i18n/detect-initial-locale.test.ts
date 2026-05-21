// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectInitialLocale } from '../../src/i18n';

const LS_KEY = 'open-design:locale';

function setNavigatorLanguages(languages: readonly string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    get: () => languages,
  });
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => languages[0] ?? 'en',
  });
}

function clearDesktopHost(): void {
  delete (window as { __od__?: unknown }).__od__;
}

function setDesktopHostOsLocale(value: unknown): void {
  (window as { __od__?: unknown }).__od__ = {
    client: { type: 'desktop', osLocale: value },
  };
}

describe('detectInitialLocale priority chain', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearDesktopHost();
    setNavigatorLanguages(['en-US']);
  });

  afterEach(() => {
    window.localStorage.clear();
    clearDesktopHost();
  });

  it('prefers the user pick saved to localStorage over everything else', () => {
    window.localStorage.setItem(LS_KEY, 'ja');
    setDesktopHostOsLocale('zh-CN');
    setNavigatorLanguages(['fr-FR']);

    expect(detectInitialLocale()).toBe('ja');
  });

  it('falls through to navigator when an unsupported locale was stored', () => {
    window.localStorage.setItem(LS_KEY, 'xx-YY');
    setNavigatorLanguages(['de-DE']);

    expect(detectInitialLocale()).toBe('de');
  });

  it('uses the desktop host OS locale when no localStorage pick exists', () => {
    setDesktopHostOsLocale('zh-CN');
    setNavigatorLanguages(['en-US']);

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('routes packaged OS locale strings through resolveSystemLocale (zh-Hant → zh-TW)', () => {
    setDesktopHostOsLocale('zh-Hant-TW');
    setNavigatorLanguages(['en-US']);

    expect(detectInitialLocale()).toBe('zh-TW');
  });

  it('falls back to navigator when host osLocale is missing or not a string', () => {
    setDesktopHostOsLocale(undefined);
    setNavigatorLanguages(['ko-KR']);
    expect(detectInitialLocale()).toBe('ko');

    setDesktopHostOsLocale(42);
    setNavigatorLanguages(['fr-FR']);
    expect(detectInitialLocale()).toBe('fr');
  });

  it('falls back to navigator when host osLocale is not in the supported set', () => {
    setDesktopHostOsLocale('nl-NL');
    setNavigatorLanguages(['pt-PT']);

    expect(detectInitialLocale()).toBe('pt-BR');
  });

  it('falls back to en when nothing else is available', () => {
    clearDesktopHost();
    setNavigatorLanguages([]);

    expect(detectInitialLocale()).toBe('en');
  });
});
