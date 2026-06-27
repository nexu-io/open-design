// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillsSection } from '../../src/components/SkillsSection';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { zhCN } from '../../src/i18n/locales/zh-CN';
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
    locale?: 'en' | 'zh-CN';
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

  const section = (
    <SkillsSection
      cfg={TEST_CONFIG}
      setCfg={setCfg}
      onSkillsRefresh={onSkillsRefresh}
      onSkillsChanged={onSkillsChanged}
    />
  );
  render(
    options?.locale ? (
      <I18nProvider initial={options.locale}>{section}</I18nProvider>
    ) : section,
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

  // Regression for the nettee / lefarcen follow-up on PR #4793: editing a
  // built-in skill must read as an explicit "user override" flow in every
  // locale, never a hardcoded-English or plain "Edit" / "Save" affordance.
  // Lock the override wording end to end — edit tooltip → confirmation →
  // form heading → submit — in the default English locale and one translated
  // zh-CN path, so a regression to the old wording (or to a missing locale
  // key) goes red.
  describe.each([
    { locale: 'en' as const, dict: en },
    { locale: 'zh-CN' as const, dict: zhCN },
  ])('built-in skill override wording ($locale)', ({ locale, dict }) => {
    it('frames the edit affordance, confirmation, form, and submit as a user override', async () => {
      renderSkillsSection(
        [
          makeSkill({
            id: 'builtin-skill',
            name: 'Built-in skill',
            source: 'built-in',
          }),
        ],
        { locale },
      );

      const row = await screen.findByTestId('skill-row-builtin-skill');

      // The edit (pencil) tooltip reads "Create user override".
      expect(within(row).getByTestId('skills-edit').title).toBe(
        dict['settings.skillsOverrideCreate'],
      );

      fireEvent.click(within(row).getByTestId('skills-edit'));

      // The inline confirmation shows the localized override warning and an
      // override-framed confirm button — not the plain "Edit" label.
      expect(
        await within(row).findByText(dict['settings.skillsBuiltInOverrideWarning']),
      ).toBeTruthy();
      expect(
        within(row).getByTestId('skills-edit-builtin-confirm').textContent,
      ).toBe(dict['settings.skillsOverrideCreate']);

      fireEvent.click(within(row).getByTestId('skills-edit-builtin-confirm'));

      // The override form heading and submit both read as "user override".
      const form = await within(row).findByTestId('skills-edit-form');
      expect(within(form).getByRole('heading', { level: 4 }).textContent).toBe(
        dict['settings.skillsOverrideCreate'],
      );
      expect(within(form).getByTestId('skills-save').textContent).toBe(
        dict['settings.skillsOverrideSave'],
      );
    });
  });

  // The override wording must stay scoped to built-in skills: editing a
  // user-authored skill keeps the plain Edit / Save affordance and never
  // surfaces the override confirmation.
  it('keeps the plain edit/save wording for user skills', async () => {
    renderSkillsSection(
      [
        makeSkill({
          id: 'user-skill',
          name: 'User skill',
          source: 'user',
        }),
      ],
      { locale: 'en' },
    );

    const row = await screen.findByTestId('skill-row-user-skill');
    expect(within(row).getByTestId('skills-edit').title).toBe(
      en['settings.skillsEdit'],
    );

    fireEvent.click(within(row).getByTestId('skills-edit'));
    expect(within(row).queryByTestId('skills-edit-builtin-warning')).toBeNull();

    const form = await within(row).findByTestId('skills-edit-form');
    expect(within(form).getByRole('heading', { level: 4 }).textContent).toBe(
      en['settings.skillsEdit'],
    );
    expect(within(form).getByTestId('skills-save').textContent).toBe(
      en['settings.skillsSave'],
    );
  });

  it('matches localized built-in skill names and descriptions in search', async () => {
    renderSkillsSection(
      [
        makeSkill({
          id: 'localized-skill',
          name: 'localized-skill',
          displayName: {
            en: 'Localized Skill',
            'zh-CN': '本地化技能',
          },
          description: 'English description',
          descriptionI18n: {
            en: 'English description',
            'zh-CN': '中文能力描述',
          },
          source: 'built-in',
        }),
        makeSkill({
          id: 'other-skill',
          name: 'other-skill',
          displayName: {
            en: 'Other Skill',
            'zh-CN': '其他技能',
          },
          description: 'Other description',
          source: 'built-in',
        }),
      ],
      { locale: 'zh-CN' },
    );

    expect(await screen.findByText('本地化技能')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('搜索...'), {
      target: { value: '中文能力' },
    });

    expect(screen.getByTestId('skill-row-localized-skill')).toBeTruthy();
    expect(screen.queryByTestId('skill-row-other-skill')).toBeNull();
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
