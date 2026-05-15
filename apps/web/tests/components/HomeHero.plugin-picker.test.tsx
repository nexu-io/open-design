// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  InputFieldSpec,
  InstalledPluginRecord,
  McpServerConfig,
  PluginSourceKind,
  SkillSummary,
  TrustTier,
} from '@open-design/contracts';
import { HomeHero } from '../../src/components/HomeHero';

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

afterEach(() => {
  cleanup();
});

describe('HomeHero plugin picker', () => {
  it('opens plugin search from an @ token across community and my plugins', () => {
    const onPromptChange = vi.fn();
    const onPickPlugin = vi.fn();
    render(
      <HomeHero
        prompt="Make @sam"
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

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.getByText('My plugin')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('option', { name: /sample user plugin/i }));

    expect(onPickPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sample-user-plugin' }),
      'Make @Sample User Plugin',
    );
  });

  it('renders selected @ plugins inside the prompt and opens their details', () => {
    const onOpenPluginDetails = vi.fn();
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
        onOpenPluginDetails={onOpenPluginDetails}
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

    fireEvent.click(screen.getByTestId('home-hero-prompt-plugin-sample-plugin'));
    expect(onOpenPluginDetails).toHaveBeenCalledWith(sample);
    expect(screen.getByTestId('home-hero-prompt-plugin-helper-plugin')).toBeTruthy();
  });

  it('opens the context picker for a bare @ token even before results arrive', () => {
    render(
      <HomeHero
        prompt="@"
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

    expect(screen.getByTestId('home-hero-plugin-picker')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /plugins/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /skills/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /mcp/i })).toBeTruthy();
    expect(screen.getByText('Search plugins, skills, and MCP servers.')).toBeTruthy();
  });

  it('can pick skills and MCP servers from the home @ picker', () => {
    const onPickSkill = vi.fn();
    const onPickMcp = vi.fn();
    const skill = makeSkill('prototype-lab', 'Prototype Lab');
    const mcp = makeMcp('linear', 'Linear');
    const { rerender } = render(
      <HomeHero
        prompt="Make @proto"
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

    fireEvent.mouseDown(screen.getByRole('option', { name: /prototype lab/i }));
    expect(onPickSkill).toHaveBeenCalledWith(skill, 'Make @Prototype Lab');

    rerender(
      <HomeHero
        prompt="@lin"
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

    fireEvent.mouseDown(screen.getByRole('option', { name: /linear/i }));
    expect(onPickMcp).toHaveBeenCalledWith(mcp, '@Linear');
  });

  it('does not submit while an IME composition is confirming text with Enter', () => {
    const onSubmit = vi.fn();
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

    const input = screen.getByTestId('home-hero-input');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not pick a plugin while an IME composition is active', () => {
    const onPickPlugin = vi.fn();
    const onSubmit = vi.fn();
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

    const input = screen.getByTestId('home-hero-input');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onPickPlugin).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('highlights rendered plugin input values inside the prompt surface', () => {
    const fields: InputFieldSpec[] = [
      {
        name: 'source',
        label: 'Import source',
        type: 'select',
        options: ['folder', 'zip', 'github', 'marketplace'],
        default: 'marketplace',
      },
    ];
    const prompt =
      'Create a compact import receipt for community-import-smoke-test installed from marketplace.';

    const { rerender } = render(
      <HomeHero
        prompt={prompt}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle="Community Import Smoke Test"
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginInputFields={fields}
        pluginInputValues={{ source: 'marketplace' }}
        pluginInputTemplate="Create a compact import receipt for community-import-smoke-test installed from {{source}}."
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

    const slot = screen.getByTestId('home-hero-prompt-slot-source') as HTMLSelectElement;
    expect(slot.value).toBe('marketplace');
    expect(slot.getAttribute('data-filled')).toBe('true');
    expect(screen.getByDisplayValue('marketplace')).toBeTruthy();
    expect(screen.queryByTestId('plugin-inputs-form')).toBeNull();

    rerender(
      <HomeHero
        prompt={`${prompt} Extra user edit.`}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        activePluginTitle="Community Import Smoke Test"
        activeChipId={null}
        onClearActivePlugin={() => undefined}
        pluginInputFields={fields}
        pluginInputValues={{ source: 'marketplace' }}
        pluginInputTemplate="Create a compact import receipt for community-import-smoke-test installed from {{source}}."
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

    expect(screen.queryByTestId('home-hero-prompt-slot-source')).toBeNull();
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
  });
});
