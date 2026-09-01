// @vitest-environment jsdom
//
// The Website-clone chip is the one create chip that writes into the composer:
// an empty composer gets a localized "clone this site:" scaffold, because the
// scenario is meaningless without a target URL. Every other create chip is a
// pure mode switch that preserves whatever draft is already there.
//
// Those two rules collide unless the scaffold is distinguishable from a draft:
// left in place, host-authored text follows the user into Slide deck, Image,
// Document and every other tab it means nothing in.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import type { Dict } from '../../src/i18n/types';
import { ar } from '../../src/i18n/locales/ar';
import { de } from '../../src/i18n/locales/de';
import { en } from '../../src/i18n/locales/en';
import { esES } from '../../src/i18n/locales/es-ES';
import { fa } from '../../src/i18n/locales/fa';
import { fr } from '../../src/i18n/locales/fr';
import { hu } from '../../src/i18n/locales/hu';
import { id } from '../../src/i18n/locales/id';
// Aliased: the bare `it` export would shadow vitest's own `it`.
import { it as itIT } from '../../src/i18n/locales/it';
import { ja } from '../../src/i18n/locales/ja';
import { ko } from '../../src/i18n/locales/ko';
import { pl } from '../../src/i18n/locales/pl';
import { ptBR } from '../../src/i18n/locales/pt-BR';
import { ru } from '../../src/i18n/locales/ru';
import { th } from '../../src/i18n/locales/th';
import { tr } from '../../src/i18n/locales/tr';
import { uk } from '../../src/i18n/locales/uk';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const analyticsMocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      track: analyticsMocks.track,
      newRequestId: () => 'request-1',
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
    }),
  };
});

// en's copy for `homeHero.chip.webClonePromptSeed`. Asserting the rendered
// string (rather than re-deriving it through `t`) is what makes this a test of
// what the user sees in the composer.
const SEED = 'Website URL to clone: ';

// Named individually rather than read off the app's internal dict registry, so
// a locale dropped from that registry still fails here instead of silently
// falling out of the contract.
const NON_ENGLISH_LOCALES: ReadonlyArray<readonly [string, Dict]> = [
  ['ar', ar], ['de', de], ['es-ES', esES], ['fa', fa], ['fr', fr],
  ['hu', hu], ['id', id], ['it', itIT], ['ja', ja], ['ko', ko],
  ['pl', pl], ['pt-BR', ptBR], ['ru', ru], ['th', th], ['tr', tr],
  ['uk', uk], ['zh-CN', zhCN], ['zh-TW', zhTW],
];

function scenarioPlugin(id: string, title: string) {
  return {
    id,
    title,
    version: '0.1.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '0.1.0',
      description: title,
      od: { kind: 'scenario', taskKind: 'new-generation', useCase: { query: `${title} brief.` } },
    },
  };
}

function stubPlugins() {
  const plugins = [
    scenarioPlugin('example-web-clone', 'Website clone'),
    scenarioPlugin('example-simple-deck', 'Slide deck'),
    scenarioPlugin('example-web-prototype', 'Prototype'),
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const href = typeof url === 'string' ? url : url.toString();
    if (href === '/api/plugins') {
      return new Response(JSON.stringify({ plugins }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
}

function renderHome() {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

async function pickTypePill(id: string) {
  const pill = await screen.findByTestId(`home-hero-type-pill-${id}`);
  fireEvent.click(pill);
}

function composerText(): string {
  return (screen.getByTestId('home-hero-input').textContent ?? '');
}

afterEach(() => {
  vi.unstubAllGlobals();
  analyticsMocks.track.mockClear();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Website-clone composer scaffold is host-authored, not a draft', () => {
  it('seeds an empty composer when the Website-clone chip is picked', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    await pickTypePill('web-clone');

    await waitFor(() => expect(composerText()).toContain(SEED));
  });

  it('takes the untouched scaffold back out when another type is picked', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(SEED));

    await pickTypePill('deck');

    // The scaffold stood in for an empty composer, so releasing it restores
    // exactly that — Slide deck must not inherit a prompt about cloning a site.
    await waitFor(() => expect(composerText().trim()).toBe(''));
  });

  it('keeps the draft when the user has typed into the scaffold', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(SEED));

    const typed = `${SEED}https://example.com`;
    setHomeHeroPrompt(typed);
    await waitFor(() => expect(composerText()).toContain('https://example.com'));

    await pickTypePill('deck');

    // Once the user makes it theirs it is a draft like any other, and the
    // draft-preserving rule that governs every other chip applies.
    await waitFor(() => expect(composerText()).toContain('https://example.com'));
  });

  it('still releases the scaffold after Website clone is re-picked', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(SEED));
    // A second pick writes no seed — the composer is no longer empty — so this
    // pass must not be mistaken for the scaffold having been handed back.
    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(SEED));

    await pickTypePill('deck');

    await waitFor(() => expect(composerText().trim()).toBe(''));
  });

  // The scaffold is the one piece of host-authored text this product types into
  // the user's composer, so it has to arrive in their language — and the
  // release above has to recognize it there too, not just in English.
  it('seeds and releases the localized scaffold outside English', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    render(
      <I18nProvider initial="ja">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(ja['homeHero.chip.webClonePromptSeed']));

    await pickTypePill('deck');

    await waitFor(() => expect(composerText().trim()).toBe(''));
  });

  it('seeds again when the user returns to Website clone', async () => {
    writeHomeGuideStage('done');
    stubPlugins();
    renderHome();

    await pickTypePill('web-clone');
    await waitFor(() => expect(composerText()).toContain(SEED));
    await pickTypePill('deck');
    await waitFor(() => expect(composerText().trim()).toBe(''));

    await pickTypePill('web-clone');

    await waitFor(() => expect(composerText()).toContain(SEED));
  });
});

// This key is unusual: most copy is *shown* to the user, but this one is typed
// into their composer and becomes the opening line of the prompt they send. An
// English fallback here doesn't just read as untranslated chrome — it puts
// English into a Japanese user's own message. Lock every locale to real copy.
describe('Website-clone scaffold copy is translated everywhere', () => {
  it('ships no locale still carrying the English fallback', () => {
    const KEY = 'homeHero.chip.webClonePromptSeed' as const;
    const untranslated = NON_ENGLISH_LOCALES.filter(
      ([, dict]) => dict[KEY] === en[KEY],
    ).map(([name]) => name);

    expect(untranslated).toEqual([]);
  });

  it('ships a non-empty scaffold that ends in a separator in every locale', () => {
    const KEY = 'homeHero.chip.webClonePromptSeed' as const;
    // The user pastes a URL directly after this text, so a scaffold that lost
    // its trailing colon/space would run straight into the URL they type.
    const malformed = [['en', en] as const, ...NON_ENGLISH_LOCALES]
      .filter(([, dict]) => !/[:\uff1a]\s*$/.test(dict[KEY]))
      .map(([name]) => name);

    expect(malformed).toEqual([]);
  });
});
