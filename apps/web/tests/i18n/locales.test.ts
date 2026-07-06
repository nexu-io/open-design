import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSystemLocale } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { id } from '../../src/i18n/locales/id';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import { LOCALES, LOCALE_LABEL, type Dict, type Locale } from '../../src/i18n/types';

const EXPECTED_LOCALES = ['en', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it'];

function placeholders(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names.sort();
}

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) {
    throw new Error(`No dictionary export found for locale ${locale}`);
  }
  return dict;
}

function explicitLocaleKeys(locale: Locale): string[] {
  const source = readFileSync(new URL(`../../src/i18n/locales/${locale}.ts`, import.meta.url), 'utf8');
  return Array.from(source.matchAll(/^\s*['"]([^'"]+)['"]:/gm), (match) => match[1] ?? '').filter(Boolean);
}

describe('i18n locales', () => {
  it('resolves the initial locale from browser language preferences', () => {
    expect(resolveSystemLocale(['zh-Hans-CN', 'en-US'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-Hant-HK', 'en-US'])).toBe('zh-TW');
    expect(resolveSystemLocale(['pt-PT', 'en-US'])).toBe('pt-BR');
    expect(resolveSystemLocale(['es-MX', 'en-US'])).toBe('es-ES');
    expect(resolveSystemLocale(['nl-NL', 'en-US'])).toBe('en');
    expect(resolveSystemLocale(['nl-NL'])).toBeNull();
  });

  it('registers every supported locale in the language menu', () => {
    expect(LOCALES).toEqual(EXPECTED_LOCALES);
    expect((LOCALE_LABEL as Record<string, string>).id).toBe('Bahasa Indonesia');
    expect((LOCALE_LABEL as Record<string, string>).de).toBe('Deutsch');
    expect((LOCALE_LABEL as Record<string, string>).it).toBe('Italiano');
    expect((LOCALE_LABEL as Record<string, string>).ja).toBe('日本語');
  });

  it('keeps locale dictionaries aligned with English keys and placeholders', async () => {
    const englishKeys = Object.keys(en).sort();

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      expect(Object.keys(dict).sort()).toEqual(englishKeys);

      for (const key of englishKeys) {
        const dictKey = key as keyof Dict;
        expect(placeholders(dict[dictKey]), `${locale}.${key}`).toEqual(
          placeholders(en[dictKey]),
        );
      }
    }
  });

  it('keeps Indonesian connector settings copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'settings.connectorsNavHint',
      'settings.connectorsHint',
      'settings.connectorsComposioApiKey',
      'settings.connectorsSavedTitle',
      'settings.connectorsSaved',
      'settings.connectorsGetApiKey',
      'settings.connectorsApiKeyPlaceholder',
      'settings.connectorsClear',
      'settings.connectorsSaveKey',
      'settings.connectorsKeyError',
      'settings.connectorsHelpEmpty',
      'settings.connectorsLoadingSavedKey',
      'settings.autosaveSaving',
      'settings.autosaveSaved',
      'settings.autosaveError',
      'settings.orbit.eyebrow',
      'settings.orbit.navHint',
      'settings.orbit.lede',
      'settings.orbit.statusOnTitle',
      'settings.orbit.statusOffTitle',
      'settings.orbit.runTitle',
      'settings.orbit.running',
      'settings.orbit.runOpen',
      'settings.orbit.dailySummaryTitle',
      'settings.orbit.dailySummarySub',
      'settings.orbit.runTimeTitle',
      'settings.orbit.runTimeSub',
      'settings.orbit.nextRun',
      'settings.orbit.nextRunScheduledAfterSave',
      'settings.orbit.schedule',
      'settings.orbit.pausedManualOnly',
      'settings.orbit.templateTitle',
      'settings.orbit.templateMissing',
      'settings.orbit.templateMissingOption',
      'settings.orbit.templateMissingInstall',
      'settings.orbit.templateMissingPickAnother',
      'settings.orbit.templateResetTitle',
      'settings.orbit.templateReset',
      'settings.orbit.templateHelp',
      'settings.orbit.templatesLoading',
      'settings.orbit.templatesOptgroup',
      'settings.orbit.lastRun',
      'settings.orbit.countChecked',
      'settings.orbit.countSucceeded',
      'settings.orbit.countSkipped',
      'settings.orbit.countFailed',
      'settings.orbit.runError',
      'settings.orbit.artifactKickerLive',
    ];

    for (const key of translatedKeys) {
      expect(id[key], key).not.toBe(en[key]);
    }
  });

  it('keeps Chinese integrations copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'entry.navIntegrations',
      'integrations.kicker',
      'integrations.lede',
      'integrations.agentReady',
      'integrations.tabLabel.mcp',
      'integrations.tabLabel.skills',
      'integrations.tabHint.mcp',
      'integrations.tabHint.connectors',
      'integrations.tabHint.useEverywhere',
      'integrations.skillsTitle',
      'integrations.skillsBody',
      'mcpClient.title',
      'mcpClient.subtitle',
      'mcpClient.addServer',
      'mcpClient.emptyTitle',
      'mcpClient.emptyBody',
      'mcpClient.saveChanges',
      'mcpClient.storedAt',
      'mcpClient.daemonError',
      'mcpClient.saveFailed',
      'tasks.comingSoon',
    ];

    for (const key of translatedKeys) {
      expect(zhCN[key], `zh-CN.${key}`).not.toBe(en[key]);
      expect(zhTW[key], `zh-TW.${key}`).not.toBe(en[key]);
    }
  });

  it('keeps Routines settings page copy translated in Chinese (issue #1372)', () => {
    const translatedKeys: Array<keyof Dict> = [
      'routines.title',
      'routines.subtitle',
      'routines.newAutomation',
      'routines.runNow',
      'routines.pause',
      'routines.resume',
      'routines.history',
      'routines.delete',
      'routines.describe.daily',
      'routines.describe.weekly',
      'routines.status.succeeded',
      'routines.status.failed',
      'routines.modeCreate',
      'routines.confirmDelete',
      'routines.errorPickProject',
    ];

    for (const key of translatedKeys) {
      expect(zhCN[key], `zh-CN.${key}`).not.toBe(en[key]);
      expect(zhTW[key], `zh-TW.${key}`).not.toBe(en[key]);
    }
  });

  it('declares CI-sensitive Indonesian fallback keys explicitly', () => {
    const explicitKeys = new Set(explicitLocaleKeys('id'));
    const requiredExplicitKeys = Object.keys(en).filter((key) => {
      return key.startsWith('connectors.category.') || key.startsWith('liveArtifact.viewer.');
    });

    expect(requiredExplicitKeys.filter((key) => !explicitKeys.has(key))).toEqual([]);
  });

  it('avoids brittle per-key English lookups in the Indonesian locale source', () => {
    const source = readFileSync(new URL('../../src/i18n/locales/id.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/en\['(?:connectors\.category\.|liveArtifact\.viewer\.)/);
  });

  // Tier-1 locale parity lock (issue #1894):
  //
  // Most locale modules use `...en` spread so missing translations silently
  // fall back to English at runtime — that satisfies the dictionary-shape
  // test above (`Object.keys(dict)` is complete) but hides drift between
  // English and the rendered locale. `zh-CN` is the one locale today that
  // declares every key explicitly with no `...en` spread, so a new English
  // key without a matching `zh-CN` entry is a *real* hole, not a benign
  // fallback. The two cases below lock that property in place: any future
  // PR that lets `zh-CN` drift, or reintroduces an implicit spread, fails
  // CI loudly instead of regressing translation coverage in silence.
  it('keeps zh-CN explicitly translated for every English key (tier-1 parity lock)', () => {
    const englishKeys = Object.keys(en).sort();
    const explicit = explicitLocaleKeys('zh-CN').sort();

    expect(
      explicit,
      'zh-CN must explicitly declare every English key (no implicit `...en` spread fallback). ' +
        'Add the missing translations to `apps/web/src/i18n/locales/zh-CN.ts` rather than re-introducing the spread.',
    ).toEqual(englishKeys);
  });

  it('keeps the zh-CN locale source free of the `...en` spread fallback', () => {
    const source = readFileSync(
      new URL('../../src/i18n/locales/zh-CN.ts', import.meta.url),
      'utf8',
    );

    expect(
      source,
      'zh-CN.ts must not use `...en` spread — every key must be explicitly translated. ' +
        'If you need to add new keys, declare them with their Chinese values directly.',
    ).not.toMatch(/\.\.\.en\b/);
  });

  // Tier-1 locale parity lock for Japanese (matches the zh-CN guarantee above):
  // `ja` is now fully localized — every English key has an explicit Japanese
  // value with no `...en` spread fallback. These two cases keep that property
  // from regressing: a new English key without a matching `ja` entry, or a
  // reintroduced spread, fails CI loudly instead of silently rendering English
  // to Japanese users.
  it('keeps ja explicitly translated for every English key (tier-1 parity lock)', () => {
    const englishKeys = Object.keys(en).sort();
    const explicit = explicitLocaleKeys('ja').sort();

    expect(
      explicit,
      'ja must explicitly declare every English key (no implicit `...en` spread fallback). ' +
        'Add the missing translations to `apps/web/src/i18n/locales/ja.ts` rather than re-introducing the spread.',
    ).toEqual(englishKeys);
  });

  it('keeps the ja locale source free of the `...en` spread fallback', () => {
    const source = readFileSync(
      new URL('../../src/i18n/locales/ja.ts', import.meta.url),
      'utf8',
    );

    expect(
      source,
      'ja.ts must not use `...en` spread — every key must be explicitly translated. ' +
        'If you need to add new keys, declare them with their Japanese values directly.',
    ).not.toMatch(/\.\.\.en\b/);
  });

  // Brand / proper-noun lock: these labels are product or technical proper
  // nouns and must stay verbatim English in EVERY locale, never translated.
  // (e.g. the plugin-details "Integrity" field was wrongly localized to
  // 完整性 / Integrität / etc.; lock it so a future translation pass can't
  // re-localize it.)
  it('keeps brand/proper-noun labels verbatim English across every locale', async () => {
    const verbatim: Array<{ key: keyof Dict; value: string }> = [
      { key: 'plugins.availableDetails.integrity', value: 'Integrity' },
    ];
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      for (const { key, value } of verbatim) {
        expect(dict[key], `${locale}.${String(key)}`).toBe(value);
      }
    }
  });
});
