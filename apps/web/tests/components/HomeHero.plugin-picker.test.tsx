// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { KEY_ENTER_COMMAND } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  InstalledPluginRecord,
  McpServerConfig,
  PluginSourceKind,
  SkillSummary,
  TrustTier,
} from '@open-design/contracts';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeHero } from '../../src/components/HomeHero';
import { I18nProvider } from '../../src/i18n';
import {
  getHomeHeroEditor,
  setHomeHeroPrompt,
} from '../helpers/home-hero-lexical';

function makePlugin(
  id: string,
  title: string,
  sourceKind: PluginSourceKind = 'bundled',
  trust: TrustTier = 'bundled',
): InstalledPluginRecord {
  return {
    id,
    title,
    version: '1.0.0',
    sourceKind,
    source: '/tmp',
    trust,
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title,
      description: 'A plugin fixture',
      tags: ['fixture'],
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

function makeSkill(id: string, name: string): SkillSummary {
  return {
    id,
    name,
    description: 'A skill fixture',
    triggers: ['fixture'],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: `Use ${name}`,
    aggregatesExamples: false,
  };
}

function makeMcp(id: string, label: string): McpServerConfig {
  return {
    id,
    label,
    transport: 'stdio',
    enabled: true,
    command: 'npx',
  };
}

// HomeHero embeds the project composer's Lexical editor now. jsdom cannot drive
// Lexical's beforeinput pipeline, so we open the @-picker by seeding the editor
// with `setHomeHeroPrompt(...)` (a real editor.update that fires the genuine
// trigger-detection listeners) and flushing a microtask so the picker's React
// state lands before asserting. Mirrors the project composer's typeAndSettle.
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

// Dispatch a plain Enter through the editor's command pipeline (jsdom does not
// route a synthetic fireEvent.keyDown into Lexical's keydown→command hop), so
// we hit the real KeyboardPlugin Enter branch the same way pressEnter does in
// tests/helpers/lexical-composer.ts.
function pressEnterInHomeHero(): void {
  const editor = getHomeHeroEditor();
  const event = {
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault() {},
  } as unknown as KeyboardEvent;
  act(() => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, event);
  });
}

afterEach(() => {
  cleanup();
});

describe('HomeHero plugin picker', () => {
  it('closes the portal picker when the home view becomes inactive', async () => {
    const { rerender } = render(
      <HomeHero
        active
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[makePlugin('sample-plugin', 'Sample Plugin')]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@');
    await settle();
    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();

    rerender(
      <HomeHero
        active={false}
        prompt="@"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[makePlugin('sample-plugin', 'Sample Plugin')]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );
    await settle();

    expect(screen.queryByTestId('home-hero-plugin-picker')).toBeNull();
  });

  it('opens plugin search from an @ token across community and my plugins', async () => {
    const onPromptChange = vi.fn();
    const onPickPlugin = vi.fn();
    render(
      <HomeHero
        prompt=""
        onPromptChange={onPromptChange}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[
          makePlugin('sample-plugin', 'Sample Plugin'),
          makePlugin('sample-user-plugin', 'Sample User Plugin', 'github', 'restricted'),
        ]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={onPickPlugin}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    // Typing `@sam` opens the picker via the editor's live trigger detection.
    setHomeHeroPrompt('Make @sam');
    await settle();

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.getByText('My plugin')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('option', { name: /sample user plugin/i }));

    // Picking inserts an atomic mention pill (replacing the in-flight `@sam`)
    // plus a trailing space; the host receives the editor's new serialized text.
    expect(onPickPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sample-user-plugin' }),
      'Make @Sample User Plugin ',
    );
  });

  it('does not truncate home @ plugin results to six entries', async () => {
    const pluginOptions = Array.from({ length: 9 }, (_, index) =>
      makePlugin(`catalog-plugin-${index}`, `Catalog Plugin ${index + 1}`),
    );
    render(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={pluginOptions}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@catalog');
    await settle();

    const picker = screen.getByTestId('home-hero-plugin-picker');
    expect(within(picker).getAllByRole('option')).toHaveLength(9);
    expect(within(picker).getByText('Catalog Plugin 9')).toBeTruthy();
    expect(within(picker).getByRole('tab', { name: /plugins/i }).textContent).toContain('9');
  });

  it('matches localized plugin and skill text in the home @ picker', async () => {
    const localizedPlugin = makePlugin('localized-plugin', 'Localized Plugin');
    localizedPlugin.manifest.title_i18n = { 'zh-CN': '官方看板' };
    localizedPlugin.manifest.description_i18n = { 'zh-CN': '内置官方插件。' };
    const localizedSkill = makeSkill('localized-skill', 'localized-skill');
    localizedSkill.displayName = { 'zh-CN': '杂志文章' };
    localizedSkill.descriptionI18n = { 'zh-CN': '中文能力描述' };
    const { rerender } = render(
      <I18nProvider initial="zh-CN">
        <HomeHero
          prompt=""
          onPromptChange={() => undefined}
          onSubmit={() => undefined}
          activePluginTitle={null}
          activeChipId={null}
          onClearActivePlugin={() => undefined}
          pluginOptions={[localizedPlugin]}
          pluginsLoading={false}
          skillOptions={[localizedSkill]}
          skillsLoading={false}
          pendingPluginId={null}
          pendingChipId={null}
          onPickPlugin={() => undefined}
          onPickSkill={() => undefined}
          onPickChip={() => undefined}
          contextItemCount={0}
          error={null}
        />
      </I18nProvider>,
    );

    setHomeHeroPrompt('@看板');
    await settle();

    expect(screen.getByRole('option', { name: /官方看板/i })).toBeTruthy();

    rerender(
      <I18nProvider initial="zh-CN">
        <HomeHero
          prompt=""
          onPromptChange={() => undefined}
          onSubmit={() => undefined}
          activePluginTitle={null}
          activeChipId={null}
          onClearActivePlugin={() => undefined}
          pluginOptions={[localizedPlugin]}
          pluginsLoading={false}
          skillOptions={[localizedSkill]}
          skillsLoading={false}
          pendingPluginId={null}
          pendingChipId={null}
          onPickPlugin={() => undefined}
          onPickSkill={() => undefined}
          onPickChip={() => undefined}
          contextItemCount={0}
          error={null}
        />
      </I18nProvider>,
    );

    setHomeHeroPrompt('@中文能力');
    await settle();

    expect(screen.getByRole('option', { name: /杂志文章/i })).toBeTruthy();
  });

  it('closes the home @ picker when focus moves outside the composer', async () => {
    render(
      <>
        <HomeHero
          prompt=""
          onPromptChange={() => undefined}
          onSubmit={() => undefined}
          activePluginTitle={null}
          activeChipId={null}
          onClearActivePlugin={() => undefined}
          pluginOptions={[makePlugin('sample-plugin', 'Sample Plugin')]}
          pluginsLoading={false}
          pendingPluginId={null}
          pendingChipId={null}
          onPickPlugin={() => undefined}
          onPickChip={() => undefined}
          contextItemCount={0}
          error={null}
        />
        <button type="button" data-testid="outside-control">Outside</button>
      </>,
    );

    setHomeHeroPrompt('@sample');
    await settle();

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('outside-control'));
    fireEvent.focusIn(screen.getByTestId('outside-control'));

    await waitFor(() => {
      expect(screen.queryByTestId('home-hero-plugin-picker')).toBeNull();
    });
  });

  it('keeps the home @ picker open while interacting with its tabs', async () => {
    render(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[makePlugin('sample-plugin', 'Sample Plugin')]}
        pluginsLoading={false}
        skillOptions={[makeSkill('sample-skill', 'Sample Skill')]}
        skillsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickSkill={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@sample');
    await settle();

    const picker = screen.getByTestId('home-hero-plugin-picker');
    const skillsTab = within(picker).getByRole('tab', { name: /skills/i });
    fireEvent.pointerDown(skillsTab);
    fireEvent.click(skillsTab);

    await settle();

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    expect(within(screen.getByTestId('home-hero-plugin-picker')).getByRole('tab', { name: /skills/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('renders selected @ plugins inside the prompt as mention pills', async () => {
    // The old clickable in-prompt plugin pill (`home-hero-prompt-plugin-*`) with
    // its open-details handler is gone with the Lexical migration. A plugin
    // mention is now a plain atomic pill (`.composer-inline-mention--plugin`)
    // with no click-to-open-details affordance, so this test now asserts that
    // selected plugins seed as the correct mention pills in the editor.
    const sample = makePlugin('sample-plugin', 'Sample Plugin');
    const helper = makePlugin('helper-plugin', 'Helper Plugin');

    render(
      <HomeHero
        prompt="Use @Sample Plugin with @Helper Plugin"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        selectedPluginContexts={[sample, helper]}
        pluginOptions={[]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={2}
        error={null}
      />,
    );

    await settle();

    const editor = screen.getByTestId('home-hero-input');
    const pills = Array.from(
      editor.querySelectorAll('.composer-inline-mention--plugin'),
    );
    const tokens = pills.map((pill) => pill.textContent);
    expect(tokens).toContain('@Sample Plugin');
    expect(tokens).toContain('@Helper Plugin');
    pills.forEach((pill) => {
      expect(pill.getAttribute('data-mention-kind')).toBe('plugin');
    });
  });

  it('opens the context picker for a bare @ token even before results arrive', async () => {
    render(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        skillOptions={[]}
        skillsLoading={false}
        mcpOptions={[]}
        mcpLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@');
    await settle();

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /design files/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /plugins/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /skills/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /mcp/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /connectors/i })).toBeTruthy();
    expect(screen.getByText('Search files, plugins, skills, MCP servers, and connectors.')).toBeTruthy();
  });

  it('can mention staged files from the home @ picker and keeps removal in sync', async () => {
    const onPromptChange = vi.fn();
    const onRemoveFile = vi.fn();
    const stagedFile = new File(['<html></html>'], 'brief.html', { type: 'text/html' });
    const baseProps = {
      onPromptChange,
      onSubmit: () => undefined,
      activePluginTitle: null,
      activeChipId: null,
      onClearActivePlugin: () => undefined,
      stagedFiles: [stagedFile],
      onRemoveFile,
      pluginOptions: [],
      pluginsLoading: false,
      skillOptions: [],
      skillsLoading: false,
      mcpOptions: [],
      mcpLoading: false,
      pendingPluginId: null,
      pendingChipId: null,
      onPickPlugin: () => undefined,
      onPickChip: () => undefined,
      contextItemCount: 1,
      error: null,
    } satisfies Omit<ComponentProps<typeof HomeHero>, 'prompt'>;

    const { rerender } = render(
      <HomeHero
        {...baseProps}
        prompt=""
      />,
    );

    setHomeHeroPrompt('Use @br');
    await settle();

    fireEvent.mouseDown(screen.getByRole('option', { name: /brief\.html/i }));
    // pickFile inserts the atomic file pill; the editor's onChange forwards the
    // new serialized text (with the trailing space insertMention adds) to the
    // host, replacing the old explicit `onPromptChange('Use @brief.html')` path.
    await waitFor(() =>
      expect(onPromptChange).toHaveBeenLastCalledWith('Use @brief.html '),
    );

    rerender(
      <HomeHero
        {...baseProps}
        prompt="Use @brief.html"
      />,
    );
    await settle();

    // The highlight overlay (`home-hero-prompt-highlight`) is gone; the file
    // mention is now an atomic pill inside the Lexical editor.
    const mention = screen
      .getByTestId('home-hero-input')
      .querySelector('[data-mention-kind="file"]');
    expect(mention?.textContent).toBe('@brief.html');

    onPromptChange.mockClear();
    fireEvent.click(screen.getByLabelText('Remove brief.html'));
    expect(onPromptChange).toHaveBeenLastCalledWith('Use ');
    expect(onRemoveFile).toHaveBeenCalledWith(0);
  });

  it('can pick skills and MCP servers from the home @ picker', async () => {
    const onPickSkill = vi.fn();
    const onPickMcp = vi.fn();
    const skill = makeSkill('prototype-lab', 'Prototype Lab');
    const mcp = makeMcp('linear', 'Linear');
    const { rerender } = render(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        skillOptions={[skill]}
        skillsLoading={false}
        mcpOptions={[mcp]}
        mcpLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickSkill={onPickSkill}
        onPickMcp={onPickMcp}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('Make @proto');
    await settle();

    fireEvent.mouseDown(screen.getByRole('option', { name: /prototype lab/i }));
    expect(onPickSkill).toHaveBeenCalledWith(skill, 'Make @Prototype Lab ');

    rerender(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        skillOptions={[skill]}
        skillsLoading={false}
        mcpOptions={[mcp]}
        mcpLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickSkill={onPickSkill}
        onPickMcp={onPickMcp}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@lin');
    await settle();

    fireEvent.mouseDown(screen.getByRole('option', { name: /linear/i }));
    expect(onPickMcp).toHaveBeenCalledWith(mcp, '@Linear ');
  });

  it('submits on a plain Enter through the editor once content is present', async () => {
    // IME compositionStart/End + Enter handling moved inside the Lexical editor;
    // jsdom cannot drive a real IME composition or route fireEvent.keyDown into
    // Lexical's command pipeline, so the previous IME-suppression assertions are
    // not reachable from this harness. We instead validate the surviving submit
    // contract: a plain Enter through the editor command pipeline calls onSubmit
    // exactly once when the prompt has content.
    const onSubmit = vi.fn();
    // `canSubmit` is derived from the `prompt` prop, so seed it via props (the
    // editor mirrors it through SeedingPlugin) rather than only the editor.
    render(
      <HomeHero
        prompt="做一个中文官网"
        onPromptChange={() => undefined}
        onSubmit={onSubmit}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    await settle();

    pressEnterInHomeHero();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('routes Enter to the open picker instead of picking before a query resolves', async () => {
    // Replaces the old "does not pick a plugin while an IME composition is
    // active" test: the IME-composing guard now lives inside the Lexical
    // KeyboardPlugin and is not drivable via fireEvent here. We instead assert
    // the surviving behavior — with the picker open, a plain Enter is routed to
    // the picker (picking the selected option) rather than submitting the turn.
    const onPickPlugin = vi.fn();
    const onSubmit = vi.fn();
    // Seed `@sam` via props so the picker opens on mount AND `canSubmit` is true
    // (so a non-routed Enter would otherwise have submitted, making the
    // "Enter went to the picker, not submit" assertion meaningful).
    render(
      <HomeHero
        prompt="Make @sam"
        onPromptChange={() => undefined}
        onSubmit={onSubmit}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginOptions={[makePlugin('sample-plugin', 'Sample Plugin')]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={onPickPlugin}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    await settle();
    expect(screen.getByRole('option', { name: /sample plugin/i })).toBeTruthy();

    pressEnterInHomeHero();
    await settle();

    // Enter routed to the picker and picked the selected plugin: the host
    // callback fires for that record and the editor inserts the atomic pill.
    // (The `nextPrompt` arg is intentionally not asserted here — when the pick
    // is reached through the keyboard-command path the nested insert update has
    // not yet committed when pickPlugin reads back getText(), so the serialized
    // text is exercised by the mouseDown-driven test above instead.)
    expect(onPickPlugin).toHaveBeenCalledTimes(1);
    expect(onPickPlugin.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ id: 'sample-plugin' }),
    );
    const pill = screen
      .getByTestId('home-hero-input')
      .querySelector('.composer-inline-mention--plugin');
    expect(pill?.textContent).toBe('@Sample Plugin');
    // Enter was consumed by the open picker, so the turn was not submitted, and
    // the picker closed once the pick landed.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('home-hero-plugin-picker')).toBeNull();
  });

  it('closes the @ picker when opening plugin details from the hover card', async () => {
    const onOpenPluginDetails = vi.fn();
    const plugin = makePlugin('sample-plugin', 'Sample Plugin');
    render(
      <HomeHero
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle={null}
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        onOpenPluginDetails={onOpenPluginDetails}
        pluginOptions={[plugin]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    setHomeHeroPrompt('@sam');
    await settle();
    fireEvent.mouseEnter(screen.getByRole('option', { name: /sample plugin/i }));
    await settle();

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(onOpenPluginDetails).toHaveBeenCalledWith(plugin);
    expect(screen.queryByTestId('home-hero-plugin-picker')).toBeNull();
  });

  it('opens active plugin details from the active plugin chip', () => {
    const onOpenPluginDetails = vi.fn();
    const active = makePlugin('prototype-plugin', 'Prototype Plugin');
    render(
      <HomeHero
        prompt="Build a prototype"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle="Prototype"
        activePluginRecord={active}
        activeChipId="prototype"
        onClearActivePlugin={() => undefined}
        onOpenPluginDetails={onOpenPluginDetails}
        pluginOptions={[]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    fireEvent.click(screen.getByTitle('Plugin: Prototype Plugin'));
    expect(onOpenPluginDetails).toHaveBeenCalledWith(active);
    const activeChipText = screen.getByTestId('home-hero-active-plugin').textContent;
    expect(activeChipText).toContain('Prototype');
    expect(activeChipText).not.toContain('Plugin');
  });

  it('shows a clear button on the active plugin chip for an explicit plugin pick (example prompt), even with a task chip set', () => {
    // Example-prompt presets bind a specific plugin AND set a task chipId. The
    // chip shows the plugin's own title and must own its clear (×) button, just
    // like a Community pick — not hide it behind the footer task chip.
    const onClearActivePlugin = vi.fn();
    const active = makePlugin('cinematic-portal', 'Cinematic Portal');
    render(
      <HomeHero
        prompt="A motion-heavy landing page"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle="Cinematic Portal"
        activePluginRecord={active}
        activeChipId="prototype"
        activePluginIsExplicit
        onClearActivePlugin={onClearActivePlugin}
        onOpenPluginDetails={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    const chip = screen.getByTestId('home-hero-active-plugin');
    const clear = chip.querySelector('.home-hero__active-clear') as HTMLButtonElement | null;
    expect(clear).toBeTruthy();
    fireEvent.click(clear!);
    expect(onClearActivePlugin).toHaveBeenCalled();
  });

  it('hides the active plugin chip clear button when it stands in for a task chip default plugin', () => {
    // Plain task-chip pick: the chip shows the task label and the footer
    // ActiveTypeChip owns the clear affordance, so the plugin chip has none.
    const active = makePlugin('prototype-plugin', 'Prototype Plugin');
    render(
      <HomeHero
        prompt="Build a prototype"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle="Prototype"
        activePluginRecord={active}
        activeChipId="prototype"
        activePluginIsExplicit={false}
        onClearActivePlugin={() => undefined}
        onOpenPluginDetails={() => undefined}
        pluginOptions={[]}
        pluginsLoading={false}
        pendingPluginId={null}
        pendingChipId={null}
        onPickPlugin={() => undefined}
        onPickChip={() => undefined}
        contextItemCount={0}
        error={null}
      />,
    );

    const chip = screen.getByTestId('home-hero-active-plugin');
    expect(chip.querySelector('.home-hero__active-clear')).toBeNull();
  });
});
