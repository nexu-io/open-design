// @vitest-environment jsdom

// Acceptance regressions for the #5517 扩展 marketplace port:
//
//   #129 — plugin AND skill cards were inert markup. The port kept the row
//          chrome but dropped `is-clickable` + the click handler, so nothing in
//          扩展 opened a detail view.
//   #131 — a skill card carried `action: { kind: 'none' }`, so there was no
//          affordance anywhere in the app to actually run a skill from 扩展.
//   #132 — an import always lands in the user's own registry, which only the
//          个人的 scope lists. The catalog stayed on whatever tab it was on, so
//          a successful import looked like a no-op.
//   #109 — the daemon-side lockfile write is now serialized per-path
//          (apps/daemon/src/plugins/lockfile.ts), so distinct plugins can
//          install at the same time without racing; each card only tracks
//          its own pending state and no longer blocks its neighbors.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

const TEAM_CONTEXT = {
  workspaceId: 'ws-team',
  workspaceType: 'team',
  workspaceMemberId: 'mem-owner',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team-pro',
  teamId: 'ws-team',
  permissions: {
    canManageMembers: true,
    canManageBilling: true,
    canInviteMembers: true,
    canManageAutoRecharge: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: true,
  },
  seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
  providerMode: 'cloud',
};

let workspaceContext: unknown = null;

// Spread the real module — see the note in ExtensionsMarketplace.team-scope.test.tsx.
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({ context: workspaceContext, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => null,
}));

const USER_SKILL = {
  id: 'deck-polish',
  name: 'deck-polish',
  description: 'Tidy up a slide deck.',
  triggers: [],
  mode: 'prototype',
  surface: 'web',
  source: 'user',
  category: null,
  examplePrompt: 'Polish this deck',
};

const OFFICIAL_SKILL = { ...USER_SKILL, id: 'brand-kit', name: 'brand-kit', source: 'builtin' };

const MARKETPLACE = {
  id: 'official',
  url: 'https://example.com/marketplace.json',
  trust: 'official',
  manifest: {
    name: 'Official',
    plugins: [
      { name: 'alpha-plugin', version: '1.0.0', description: 'First plugin' },
      { name: 'beta-plugin', version: '1.0.0', description: 'Second plugin' },
    ],
  },
};

const IMPORT_URL = 'https://example.com/imported-plugin';
const SKILL_MARKDOWN = [
  '# Heading',
  '',
  '```md',
  '# code',
  '```',
  '',
  '## Child heading',
].join('\n');

let skills: Array<typeof USER_SKILL>;
let installResolvers: Array<() => void>;
let skillDetailFailuresRemaining: number;
let skillDetailRequests: number;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** installPluginSource consumes an SSE stream, not a JSON body. */
function installSuccessStream(id: string): Response {
  const plugin = { id, title: id, version: '1.0.0', sourceKind: 'local', source: IMPORT_URL };
  const payload = `event: success\ndata: ${JSON.stringify({ kind: 'success', plugin })}\n\n`;
  return new Response(payload, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

beforeEach(() => {
  workspaceContext = null;
  skills = [USER_SKILL, OFFICIAL_SKILL];
  installResolvers = [];
  skillDetailFailuresRemaining = 0;
  skillDetailRequests = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/skills/import')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string };
      const imported = { ...USER_SKILL, id: body.name ?? 'imported', name: body.name ?? 'imported' };
      skills = [...skills, imported];
      return jsonResponse({ skill: imported });
    }
    if (url === '/api/skills/install') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { source?: string };
      const imported = {
        ...USER_SKILL,
        id: 'remote-skill',
        name: 'remote-skill',
        upstream: body.source ?? null,
      };
      skills = [...skills, imported];
      return jsonResponse({ skill: imported });
    }
    if (url === '/api/skills') return jsonResponse({ skills });
    if (url.startsWith('/api/skills/')) {
      skillDetailRequests += 1;
      if (skillDetailFailuresRemaining > 0) {
        skillDetailFailuresRemaining -= 1;
        return jsonResponse({}, 503);
      }
      const id = decodeURIComponent(url.slice('/api/skills/'.length));
      const skill = skills.find((row) => row.id === id);
      return skill ? jsonResponse({ ...skill, body: SKILL_MARKDOWN }) : jsonResponse({}, 404);
    }
    if (url.startsWith('/api/plugins/install')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { source?: string };
      // The dialog's URL import completes; a card install is held open so the
      // test can observe the in-flight UI.
      if (body.source === IMPORT_URL) return installSuccessStream('imported-plugin');
      return new Promise<Response>((resolve) => {
        installResolvers.push(() => resolve(installSuccessStream('alpha-plugin')));
      });
    }
    if (url.startsWith('/api/plugins')) return jsonResponse({ plugins: [] });
    if (url.startsWith('/api/marketplaces')) return jsonResponse({ marketplaces: [MARKETPLACE] });
    if (url.includes('/api/workspace/')) return jsonResponse({ ids: [], resources: [] });
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderMarketplace(props: Partial<Parameters<typeof ExtensionsMarketplace>[0]> = {}) {
  return render(
    <I18nProvider initial="en">
      <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

/** Switches the catalog to 技能 / 个人的, where a user skill lives. */
async function showPersonalSkills(container: HTMLElement) {
  const modeButtons = container.querySelectorAll('.plugin-marketplace__switch button');
  fireEvent.click(modeButtons[modeButtons.length - 1]!);
  await waitFor(() => {
    const filters = container.querySelectorAll('.plugin-marketplace__filters button');
    expect(filters.length).toBeGreaterThan(0);
  });
  const filters = [...container.querySelectorAll('.plugin-marketplace__filters button')];
  const personal = filters.find((button) => /personal|mine|个人/i.test(button.textContent ?? ''));
  if (personal) fireEvent.click(personal);
}

describe('ExtensionsMarketplace card affordances', () => {
  it('#129 — marks every card backed by a record as clickable and opens its detail', async () => {
    const { container } = renderMarketplace();

    // The default landing scope is the official plugin catalog.
    await waitFor(() => {
      expect(container.querySelectorAll('.plugin-marketplace__item').length).toBeGreaterThan(0);
    });

    const cards = [...container.querySelectorAll('.plugin-marketplace__item')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.classList.contains('is-clickable')).toBe(true);
      expect(card.getAttribute('role')).toBe('button');
      expect(card.getAttribute('tabindex')).toBe('0');
    }

    fireEvent.click(cards[0]!);
    await waitFor(() => {
      expect(document.querySelector('.plugin-details-modal')).toBeTruthy();
    });
  });

  it('#5517 — a skill card opens the demo-aligned full-page detail and returns to the same list', async () => {
    const { container } = renderMarketplace();
    await showPersonalSkills(container);

    const findSkillCard = async () => waitFor(() => {
      const found = container.querySelector('.plugin-marketplace__item--skill');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    const card = await findSkillCard();
    expect(card.classList.contains('is-clickable')).toBe(true);
    const pathnameBeforeDetail = window.location.pathname;

    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.getByTestId('skill-detail')).toBeTruthy();
    });
    expect(screen.queryByTestId('skill-details-modal')).toBeNull();
    expect(window.location.pathname).toBe(pathnameBeforeDetail);
    expect(screen.getByRole('heading', { level: 1, name: USER_SKILL.name })).toBeTruthy();
    expect(screen.getByText('provided by You')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Child heading' })).toBeTruthy();
    expect(screen.getByText('# code').tagName).toBe('CODE');

    fireEvent.click(screen.getByTestId('skill-detail-back'));
    expect(screen.queryByTestId('skill-detail')).toBeNull();
    const cardAfterBack = await findSkillCard();
    await waitFor(() => expect(document.activeElement).toBe(cardAfterBack));
    expect(window.location.pathname).toBe(pathnameBeforeDetail);

    fireEvent.click(await findSkillCard());
    await waitFor(() => {
      expect(screen.getByTestId('skill-detail')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('skill-detail-close'));
    expect(screen.queryByTestId('skill-detail')).toBeNull();
    const cardAfterClose = await findSkillCard();
    await waitFor(() => expect(document.activeElement).toBe(cardAfterClose));
    expect(window.location.pathname).toBe(pathnameBeforeDetail);
  });

  it('#5517 — the full-page skill detail preserves retry after a load failure', async () => {
    skillDetailFailuresRemaining = 1;
    const { container } = renderMarketplace();
    await showPersonalSkills(container);

    const card = await waitFor(() => {
      const found = container.querySelector('.plugin-marketplace__item--skill');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    fireEvent.click(card);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load this skill’s SKILL.md.',
    );
    expect(skillDetailRequests).toBe(1);
    fireEvent.click(screen.getByTestId('skill-detail-retry'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeTruthy();
    });
    expect(skillDetailRequests).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('#5517 — the full-page skill Use action runs the selected skill and returns to the list', async () => {
    const onUseSkill = vi.fn();
    const { container } = renderMarketplace({ onUseSkill });
    await showPersonalSkills(container);

    const card = await waitFor(() => {
      const found = container.querySelector('.plugin-marketplace__item--skill');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    fireEvent.click(card);
    await waitFor(() => {
      expect(screen.getByTestId('skill-detail')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('skill-detail-use'));
    expect(onUseSkill).toHaveBeenCalledTimes(1);
    expect(onUseSkill.mock.calls[0]![0]).toMatchObject({ id: USER_SKILL.id });
    expect(screen.queryByTestId('skill-detail')).toBeNull();
    expect(screen.queryByTestId('skill-details-modal')).toBeNull();
    expect(container.querySelector('.plugin-marketplace__item--skill')).toBeTruthy();
  });

  it('#131 — a skill card runs the skill instead of offering nothing', async () => {
    const onUseSkill = vi.fn();
    const { container } = renderMarketplace({ onUseSkill });
    await showPersonalSkills(container);

    const useButton = await waitFor(() =>
      screen.getByTestId(`plugins-card-use-skill-${USER_SKILL.id}`),
    );
    fireEvent.click(useButton);

    expect(onUseSkill).toHaveBeenCalledTimes(1);
    expect(onUseSkill.mock.calls[0]![0]).toMatchObject({ id: USER_SKILL.id });
  });

  it('#131 — running a skill from its row does not also open the detail modal', async () => {
    const onUseSkill = vi.fn();
    const { container } = renderMarketplace({ onUseSkill });
    await showPersonalSkills(container);

    const useButton = await waitFor(() =>
      screen.getByTestId(`plugins-card-use-skill-${USER_SKILL.id}`),
    );
    fireEvent.click(useButton);

    expect(onUseSkill).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('skill-details-modal')).toBeNull();
    expect(container).toBeTruthy();
  });

  it('#109 — installing one plugin does not block installing another', async () => {
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelectorAll('.plugin-marketplace__item').length).toBe(2);
    });

    const installButtons = [
      ...container.querySelectorAll<HTMLButtonElement>('.plugin-marketplace__row-action'),
    ];
    expect(installButtons.length).toBe(2);
    expect(installButtons.every((button) => !button.disabled)).toBe(true);

    fireEvent.click(installButtons[0]!);

    await waitFor(() => {
      const buttons = [
        ...container.querySelectorAll<HTMLButtonElement>('.plugin-marketplace__row-action'),
      ];
      // The card that was clicked is busy (own pending state)...
      expect(buttons[0]!.disabled).toBe(true);
      // ...but its neighbor is still live: two distinct plugins install
      // concurrently now that the daemon-side write is serialized, not raced.
      expect(buttons[1]!.disabled).toBe(false);
    });

    // Clicking the still-live second button starts its own install in parallel.
    fireEvent.click(
      container.querySelectorAll<HTMLButtonElement>('.plugin-marketplace__row-action')[1]!,
    );
    await waitFor(() => {
      const buttons = [
        ...container.querySelectorAll<HTMLButtonElement>('.plugin-marketplace__row-action'),
      ];
      expect(buttons.every((button) => button.disabled)).toBe(true);
    });

    installResolvers.forEach((resolve) => resolve());
  });
});

describe('ExtensionsMarketplace import', () => {
  it('#132 — a successful plugin URL import keeps workspace authority and reveals the result', async () => {
    workspaceContext = TEAM_CONTEXT;
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelectorAll('.plugin-marketplace__item').length).toBeGreaterThan(0);
    });

    // Everything the dialog creates is a personal resource, but the catalog
    // lands on the official scope — so before the fix an import left the user
    // staring at a list the new resource is not part of.
    const personalTab = screen.getByTestId('plugins-tab-installed');
    expect(personalTab.classList.contains('is-active')).toBe(false);

    fireEvent.click(container.querySelector('.plugin-marketplace__create')!);
    const urlInput = await waitFor(() =>
      container.querySelector<HTMLInputElement>(
        'input[placeholder="https://github.com/owner/plugin-repo"]',
      )!,
    );
    fireEvent.change(urlInput, { target: { value: IMPORT_URL } });
    fireEvent.click(screen.getByText('Import and upload'));

    await waitFor(() => {
      // Dialog closed and the catalog followed the resource to 个人的.
      expect(container.querySelector('.plugin-marketplace__create-panel')).toBeNull();
      expect(
        screen.getByTestId('plugins-tab-installed').classList.contains('is-active'),
      ).toBe(true);
    });

    const installCall = vi.mocked(globalThis.fetch).mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/plugins/install'
        && JSON.parse(String(init?.body ?? '{}')).source === IMPORT_URL,
    );
    expect(installCall).toBeTruthy();
    expect(installCall?.[1]?.headers).toMatchObject({
      'x-od-workspace-id': TEAM_CONTEXT.workspaceId,
      'x-od-workspace-member-id': TEAM_CONTEXT.workspaceMemberId,
      'x-od-workspace-type': TEAM_CONTEXT.workspaceType,
    });
  });

  it('imports a skill URL through the daemon instead of showing the unsupported placeholder', async () => {
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelectorAll('.plugin-marketplace__item').length).toBeGreaterThan(0);
    });

    fireEvent.click(container.querySelector('.plugin-marketplace__create')!);
    const kindTabs = [
      ...container.querySelectorAll<HTMLButtonElement>('.plugin-marketplace__create-tabs button'),
    ];
    fireEvent.click(kindTabs[1]!);

    const urlInput = await waitFor(() =>
      container.querySelector<HTMLInputElement>(
        'input[placeholder="https://github.com/owner/skill-repo"]',
      )!,
    );
    fireEvent.change(urlInput, {
      target: { value: 'https://github.com/owner/skill-repo' },
    });
    fireEvent.click(screen.getByTestId('plugin-create-import-url'));

    await waitFor(() => {
      const installCall = vi.mocked(globalThis.fetch).mock.calls.find(
        ([input]) => String(input) === '/api/skills/install',
      );
      expect(installCall).toBeTruthy();
      expect(JSON.parse(String(installCall?.[1]?.body))).toEqual({
        source: 'https://github.com/owner/skill-repo',
      });
      expect(container.querySelector('.plugin-marketplace__create-panel')).toBeNull();
      expect(screen.getByTestId('plugins-tab-installed').classList.contains('is-active')).toBe(true);
    });
  });
});
