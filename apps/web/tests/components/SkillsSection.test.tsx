// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillsSection } from '../../src/components/SkillsSection';
import type { AppConfig } from '../../src/types';
import type { SkillSummary } from '@open-design/contracts';

const originalFetch = globalThis.fetch;

const TEST_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
  disabledSkills: [],
};

function makeSkill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'skill',
    name: 'Skill',
    description: 'A skill',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    source: 'built-in',
    ...overrides,
  };
}

function renderSkillsSection(
  skills: SkillSummary[],
  options?: {
    onSkillsRefresh?: () => void | Promise<void>;
    onSkillsChanged?: (id?: string) => void;
  },
) {
  const setCfg = vi.fn();
  const onSkillsRefresh = options?.onSkillsRefresh;
  const onSkillsChanged = options?.onSkillsChanged;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/skills' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills/import' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          skill: makeSkill({
            id: 'new-skill',
            name: 'New skill',
            source: 'user',
          }),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url.startsWith('/api/skills/') && init?.method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('/api/skills/') && init?.method === 'PUT') {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      const payload = init.body
        ? (JSON.parse(init.body as string) as { name?: string; description?: string; body?: string; triggers?: string[] })
        : {};
      const updated = makeSkill({
        id,
        name: payload.name ?? id,
        description: payload.description ?? '',
        triggers: payload.triggers ?? [],
        source: 'user',
      });
      return new Response(JSON.stringify({ skill: updated }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.match(/^\/api\/skills\/[^/]+\/files$/) && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.match(/^\/api\/skills\/[^/]+$/) && (!init || init.method === undefined)) {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      const summary = makeSkill({ id });
      return new Response(JSON.stringify({ ...summary, body: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  render(
    <SkillsSection
      cfg={TEST_CONFIG}
      setCfg={setCfg}
      onSkillsRefresh={onSkillsRefresh}
      onSkillsChanged={onSkillsChanged}
    />,
  );
  return {
    fetchMock: globalThis.fetch as ReturnType<typeof vi.fn>,
    setCfg,
    onSkillsRefresh,
    onSkillsChanged,
  };
}

describe('SkillsSection', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not expose delete actions for built-in skills', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'builtin-skill',
        name: 'Built-in skill',
        source: 'built-in',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-builtin-skill');

    expect(within(row).queryByTestId('skills-delete')).toBeNull();
    expect(within(row).queryByTestId('skills-delete-confirm')).toBeNull();
  });

  it('keeps delete confirmation and commit available for user skills', async () => {
    const { fetchMock } = renderSkillsSection([
      makeSkill({
        id: 'user-skill',
        name: 'User skill',
        source: 'user',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-delete'));
    fireEvent.click(within(row).getByTestId('skills-delete-confirm'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/user-skill', {
        method: 'DELETE',
      });
    });
  });

  it('warns before editing a built-in skill creates a user override', async () => {
    const { fetchMock } = renderSkillsSection([
      makeSkill({
        id: 'builtin-skill',
        name: 'Built-in skill',
        source: 'built-in',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-builtin-skill');
    fireEvent.click(within(row).getByTestId('skills-edit'));

    const warning = await within(row).findByTestId('skills-edit-builtin-warning');
    expect(warning.textContent).toMatch(/override/i);
    expect(within(row).queryByTestId('skills-edit-form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/skills/builtin-skill',
      expect.objectContaining({ method: 'PUT' }),
    );

    fireEvent.click(within(row).getByTestId('skills-edit-builtin-cancel'));
    expect(within(row).queryByTestId('skills-edit-builtin-warning')).toBeNull();
    expect(within(row).queryByTestId('skills-edit-form')).toBeNull();

    fireEvent.click(within(row).getByTestId('skills-edit'));
    fireEvent.click(
      await within(row).findByTestId('skills-edit-builtin-confirm'),
    );
    expect(await within(row).findByTestId('skills-edit-form')).toBeTruthy();
  });

  it('skips the override warning when editing a user skill', async () => {
    renderSkillsSection([
      makeSkill({
        id: 'user-skill',
        name: 'User skill',
        source: 'user',
      }),
    ]);

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-edit'));

    expect(within(row).queryByTestId('skills-edit-builtin-warning')).toBeNull();
    expect(await within(row).findByTestId('skills-edit-form')).toBeTruthy();
  });

  it('refreshes app-level skills after creating a skill', async () => {
    const onSkillsRefresh = vi.fn();
    renderSkillsSection([], { onSkillsRefresh });

    fireEvent.click(await screen.findByTestId('skills-new'));
    const form = await screen.findByTestId('skills-create-form');
    fireEvent.change(within(form).getByPlaceholderText('my-skill'), {
      target: { value: 'New skill' },
    });
    fireEvent.change(within(form).getAllByRole('textbox').at(-1)!, {
      target: { value: '# New skill\n\nDo the thing.' },
    });
    fireEvent.click(within(form).getByTestId('skills-save'));

    await waitFor(() => {
      expect(onSkillsRefresh).toHaveBeenCalledTimes(1);
    });
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([url, init]) =>
          url.toString() === '/api/skills/import' && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  // Regression for the mrcfps follow-up on PR #2190: when a user edits
  // only the body of a skill (no name/description/trigger changes), the
  // SkillSummary fields ProjectView hashes do not move and the
  // signature-driven eviction misses the change. SkillsSection must
  // notify the App shell so the preview keep-alive pool can drop any
  // entry whose project uses this skill.
  it('notifies onSkillsChanged after a body-only edit', async () => {
    const onSkillsChanged = vi.fn();
    renderSkillsSection(
      [
        makeSkill({
          id: 'user-skill',
          name: 'User skill',
          description: 'Original description',
          triggers: ['ping'],
          source: 'user',
        }),
      ],
      { onSkillsChanged },
    );

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-edit'));
    const form = await within(row).findByTestId('skills-edit-form');
    const bodyField = within(form).getAllByRole('textbox').at(-1) as HTMLTextAreaElement;
    fireEvent.change(bodyField, { target: { value: 'A fresh body that did not exist before.' } });
    fireEvent.click(within(form).getByTestId('skills-save'));

    await waitFor(() => {
      expect(onSkillsChanged).toHaveBeenCalledWith('user-skill');
    });
  });

  it('notifies onSkillsChanged after a delete', async () => {
    const onSkillsChanged = vi.fn();
    renderSkillsSection(
      [
        makeSkill({
          id: 'user-skill',
          name: 'User skill',
          source: 'user',
        }),
      ],
      { onSkillsChanged },
    );

    const row = await screen.findByTestId('skill-row-user-skill');
    fireEvent.click(within(row).getByTestId('skills-delete'));
    fireEvent.click(within(row).getByTestId('skills-delete-confirm'));

    await waitFor(() => {
      expect(onSkillsChanged).toHaveBeenCalledWith('user-skill');
    });
  });
});
