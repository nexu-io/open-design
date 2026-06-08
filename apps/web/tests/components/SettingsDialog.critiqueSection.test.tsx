// @vitest-environment jsdom

// Tests for the new project-bound design system + skill pickers in
// the Critique Theater settings section. Background: the M1 Settings
// toggle (existing, before this PR) writes `critiqueTheaterEnabled`
// to localStorage AND to the project's metadata via PATCH, but
// `server.ts:10977` only routes a run through the critique pipeline
// when ALL of these hold:
//
//   - critiqueEnabledForRun (the toggle)
//   - critiqueBrand  != undefined  ← requires project.designSystemId
//   - critiqueSkill  != undefined  ← requires project.skillId
//   - !isMediaSurface
//   - isPlainAdapter
//
// The first three are user-controlled. Before this PR the user had no
// UI to set the latter two on an existing project, so the toggle
// silently failed. These tests pin the new PATCH integration: when
// the user picks a design system or a skill, the project field is
// persisted and the next run is eligible.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { CritiqueTheaterSection } from '../../src/components/SettingsDialog';
import {
  fetchDesignSystemsResult,
  fetchSkills,
} from '../../src/providers/registry';
import {
  setCritiqueTheaterEnabled,
  useCritiqueTheaterEnabled,
} from '../../src/components/Theater';

vi.mock('../../src/components/Theater', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/Theater')>(
    '../../src/components/Theater',
  );
  return {
    ...actual,
    useCritiqueTheaterEnabled: vi.fn().mockReturnValue(false),
    setCritiqueTheaterEnabled: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystemsResult: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

const mockedUseCritiqueTheaterEnabled = vi.mocked(useCritiqueTheaterEnabled);
const mockedSetCritiqueTheaterEnabled = vi.mocked(setCritiqueTheaterEnabled);
const mockedFetchDesignSystemsResult = vi.mocked(fetchDesignSystemsResult);
const mockedFetchSkills = vi.mocked(fetchSkills);

const PROJECT_ID = 'p-1234';

const stubDesignSystems = [
  {
    id: 'default',
    title: 'Neutral Modern',
    category: 'Starter',
    summary: 'A clean default.',
  },
  {
    id: 'paper_ink',
    title: 'Paper & Ink',
    category: 'Editorial',
    summary: 'An editorial paper-themed system.',
  },
];

const stubSkills = [
  {
    id: 'web-artifacts-builder',
    name: 'web-artifacts-builder',
    description: 'Builds HTML artifacts.',
    triggers: ['web artifacts'],
    mode: 'prototype' as const,
    previewType: 'web',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: false,
    examplePrompt: '',
    aggregatesExamples: false,
  },
  {
    id: 'imagegen-frontend-web',
    name: 'imagegen-frontend-web',
    description: 'Image gen.',
    triggers: ['image'],
    mode: 'image' as const,
    previewType: 'image',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: false,
    examplePrompt: '',
    aggregatesExamples: false,
  },
];

const PROJECT_WITHOUT_BINDINGS = {
  project: { id: PROJECT_ID, designSystemId: null, skillId: null },
};

const PROJECT_WITH_BINDINGS = {
  project: { id: PROJECT_ID, designSystemId: 'paper_ink', skillId: 'web-artifacts-builder' },
};

interface RouteHandle {
  kind: 'project' | 'home';
  projectId?: string;
  view?: string;
}

let routeMock: RouteHandle = { kind: 'project', projectId: PROJECT_ID };

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => routeMock,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockedUseCritiqueTheaterEnabled.mockReturnValue(false);
  mockedSetCritiqueTheaterEnabled.mockResolvedValue(undefined);
  mockedFetchDesignSystemsResult.mockResolvedValue({
    ok: true,
    designSystems: stubDesignSystems,
  });
  mockedFetchSkills.mockResolvedValue(stubSkills);
  routeMock = { kind: 'project', projectId: PROJECT_ID };
});

describe('<CritiqueTheaterSection> project bindings', () => {
  it('PATCHes project.designSystemId when the user picks a design system', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      // GET /api/projects/:id
      return Promise.resolve({
        ok: true,
        json: async () => PROJECT_WITHOUT_BINDINGS,
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <CritiqueTheaterSection />
      </I18nProvider>,
    );

    // Wait for the design-system select to be populated.
    const select = await waitFor(() =>
      screen.getByTestId('critique-design-system') as HTMLSelectElement,
    );

    // Stubbed design systems: default + paper_ink + unset.
    expect(select.options).toHaveLength(3);
    expect(select.value).toBe(''); // unset, per project state

    fireEvent.change(select, { target: { value: 'paper_ink' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall, 'PATCH call was issued').toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
    )!;
    const [url, init] = patchCall as [string, RequestInit];
    expect(url).toBe(`/api/projects/${encodeURIComponent(PROJECT_ID)}`);
    expect(JSON.parse(init.body as string)).toEqual({ designSystemId: 'paper_ink' });
  });

  it('PATCHes project.skillId when the user picks a skill, and excludes non-prototype skills', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => PROJECT_WITHOUT_BINDINGS,
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <CritiqueTheaterSection />
      </I18nProvider>,
    );

    const select = await waitFor(() =>
      screen.getByTestId('critique-skill') as HTMLSelectElement,
    );

    // Stubbed skills: web-artifacts-builder (prototype, kept) +
    // imagegen-frontend-web (image, excluded) + unset.
    expect(select.options).toHaveLength(2);
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['', 'web-artifacts-builder']);

    fireEvent.change(select, { target: { value: 'web-artifacts-builder' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall, 'PATCH call was issued').toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
    )!;
    const [, init] = patchCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ skillId: 'web-artifacts-builder' });
  });

  it('reflects existing project bindings in the dropdown defaults', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => PROJECT_WITH_BINDINGS,
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <CritiqueTheaterSection />
      </I18nProvider>,
    );

    const dsSelect = (await waitFor(() =>
      screen.getByTestId('critique-design-system'),
    )) as HTMLSelectElement;
    const skillSelect = (await waitFor(() =>
      screen.getByTestId('critique-skill'),
    )) as HTMLSelectElement;

    expect(dsSelect.value).toBe('paper_ink');
    expect(skillSelect.value).toBe('web-artifacts-builder');
  });

  it('does not render the pickers when no project is open', () => {
    routeMock = { kind: 'home' };

    render(
      <I18nProvider initial="en">
        <CritiqueTheaterSection />
      </I18nProvider>,
    );

    // The toggle is still visible, but the project-bound pickers are not.
    expect(screen.queryByTestId('critique-design-system')).toBeNull();
    expect(screen.queryByTestId('critique-skill')).toBeNull();
  });

  it('routes the toggle through setCritiqueTheaterEnabled with the active project id', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => PROJECT_WITHOUT_BINDINGS,
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <CritiqueTheaterSection />
      </I18nProvider>,
    );

    // Wait for the section to render the toggle.
    await waitFor(() => {
      expect(
        screen.getByText(/Show Design Jury during agent runs/i),
      ).not.toBeNull();
    });
    const toggle = screen.getByRole('checkbox', {
      name: /Show Design Jury/i,
    }) as HTMLInputElement;

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockedSetCritiqueTheaterEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ projectId: PROJECT_ID }),
      );
    });
  });
});
