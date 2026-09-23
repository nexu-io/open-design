// @vitest-environment jsdom

// Red spec for OPEND-2250: a skill card in 插件 → 技能 rendered its title
// through `localizeSkillName` but handed the raw English frontmatter
// `description` straight to the card, so a zh-CN user saw a Chinese title
// stacked on an English summary in the same card (screenshot: 「杂志文章」 +
// "Huashu / huashu-md-html-inspired magazine article layout…").
//
// The neighbouring plugin card has always resolved BOTH halves through the
// locale (`localizePluginTitle` + `localizePluginDescription`); only the skill
// card builder was half-wired.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

// Spread the real module — see the note in ExtensionsMarketplace.team-scope.test.tsx.
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({ context: null, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => null,
}));

// Mirrors `skills/article-magazine/SKILL.md`, the card in the OPEND-2250
// screenshot: it carries `zh_name` / `zh_description` frontmatter, which the
// daemon projects onto `displayName` / `descriptionI18n` (apps/daemon/src/skills.ts).
const LOCALIZED_SKILL = {
  id: 'article-magazine-fixture',
  name: 'article-magazine-fixture',
  displayName: { en: 'Magazine Article', 'zh-CN': '杂志文章' },
  description: 'Magazine article layout for turning Markdown into a long-form HTML essay.',
  descriptionI18n: {
    en: 'Magazine article layout for turning Markdown into a long-form HTML essay.',
    'zh-CN': '杂志文章版式，将 Markdown 或笔记转成精排长文 HTML。',
  },
  triggers: [],
  mode: 'prototype',
  surface: 'web',
  source: 'built-in',
  category: 'documents',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  examplePrompt: 'Turn these notes into a magazine article.',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/skills') return jsonResponse({ skills: [LOCALIZED_SKILL] });
    if (url.startsWith('/api/plugins')) return jsonResponse({ plugins: [] });
    if (url.startsWith('/api/marketplaces')) return jsonResponse({ marketplaces: [] });
    if (url.includes('/api/workspace/')) return jsonResponse({ ids: [], resources: [] });
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Switches the catalog from 专家套件 to 技能; the landing scope stays official. */
async function showOfficialSkills(container: HTMLElement) {
  const modeButtons = container.querySelectorAll('.plugin-marketplace__switch button');
  const skillsTab = modeButtons[modeButtons.length - 1] as HTMLElement;
  skillsTab.click();
  await waitFor(() => {
    expect(container.querySelector('.plugin-marketplace__item--skill')).toBeTruthy();
  });
}

describe('OPEND-2250 — skill card title and description share one locale', () => {
  it('renders the zh-CN description alongside the zh-CN title', async () => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );

    await showOfficialSkills(container);

    const card = container.querySelector('.plugin-marketplace__item--skill') as HTMLElement;
    expect(card.textContent).toContain('杂志文章');
    // The defect: the summary line stayed on the English frontmatter string.
    expect(card.textContent).toContain('杂志文章版式，将 Markdown 或笔记转成精排长文 HTML。');
    expect(card.textContent).not.toContain(
      'Magazine article layout for turning Markdown into a long-form HTML essay.',
    );
  });

  it('keeps the English description for an English UI', async () => {
    const { container } = render(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );

    await showOfficialSkills(container);

    const card = container.querySelector('.plugin-marketplace__item--skill') as HTMLElement;
    expect(card.textContent).toContain('Magazine Article');
    expect(card.textContent).toContain(
      'Magazine article layout for turning Markdown into a long-form HTML essay.',
    );
  });
});
