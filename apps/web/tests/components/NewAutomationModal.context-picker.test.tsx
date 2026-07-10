// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail, InstalledPluginRecord } from '@open-design/contracts';

import { NewAutomationModal } from '../../src/components/NewAutomationModal';
import type { AutomationTemplate } from '../../src/components/NewAutomationModal';
import { I18nProvider } from '../../src/i18n';
import type { SkillSummary } from '../../src/types';
import { listPlugins } from '../../src/state/projects';
import { fetchMcpServers } from '../../src/state/mcp';

vi.mock('../../src/state/projects', () => ({
  listPlugins: vi.fn(),
}));

vi.mock('../../src/state/mcp', () => ({
  fetchMcpServers: vi.fn(),
}));

const plugin: InstalledPluginRecord = {
  id: 'release-plugin',
  title: 'Release Plugin',
  version: '1.0.0',
  trust: 'restricted',
  sourceKind: 'local',
  source: '/plugins/release-plugin',
  capabilitiesGranted: ['prompt:inject'],
  manifest: {
    name: 'release-plugin',
    title: 'Release Plugin',
    version: '1.0.0',
    description: 'Draft release notes.',
  },
  fsPath: '/plugins/release-plugin',
  installedAt: 0,
  updatedAt: 0,
};

const skill: SkillSummary = {
  id: 'memory-refresh',
  name: 'Memory Refresh',
  description: 'Update project memory.',
  triggers: ['memory'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Refresh memory',
  aggregatesExamples: false,
};

const connector: ConnectorDetail = {
  id: 'linear',
  name: 'Linear',
  provider: 'composio',
  category: 'work',
  description: 'Issues and cycles.',
  status: 'connected',
  accountLabel: 'Design team',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

const mcpServer = {
  id: 'figma',
  label: 'Figma MCP',
  transport: 'stdio' as const,
  enabled: true,
  command: 'figma-mcp',
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('NewAutomationModal context picker', () => {
  const templateWithLocalizedTitle: AutomationTemplate = {
    id: 'memory-refresh-template',
    category: 'memory',
    kind: 'routine',
    icon: 'history',
    title: 'Refresh project memory from recent work.',
    description: 'Use recent changes to refresh your memory index.',
    defaultName: 'Memory refresh',
    prompt: 'Use Automation template "memory-refresh-template".',
  };

  const liveArtifactTemplate: AutomationTemplate = {
    id: 'live-artifact-template',
    category: 'memory',
    kind: 'live-artifact',
    icon: 'sparkles',
    title: 'Refresh artifact from recent work.',
    description: 'Use recent changes to refresh an artifact.',
    defaultName: 'Artifact refresh',
    prompt: 'Use Automation template "live-artifact-template".',
  };

  it('picks skills, plugins, MCP servers, and connectors from @ in the prompt', async () => {
    vi.mocked(listPlugins).mockResolvedValue([plugin]);
    vi.mocked(fetchMcpServers).mockResolvedValue({ servers: [mcpServer], templates: [] });

    render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[skill]}
        connectors={[connector]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );

    const prompt = screen.getByTestId('automation-modal-prompt') as HTMLTextAreaElement;

    fireEvent.change(prompt, {
      target: { value: 'Run @memory', selectionStart: 'Run @memory'.length },
    });
    const mentionPopover = screen.getByTestId('automation-mention-popover');
    const promptWrap = prompt.closest('.automation-modal__prompt-wrap');
    expect(mentionPopover).toBeTruthy();
    expect(promptWrap?.classList.contains('is-mentioning')).toBe(true);
    expect(mentionPopover.closest('.automation-modal__prompt-wrap')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Connectors' })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('option', { name: /Memory Refresh/i }));
    expect(prompt.value).toContain('@Memory Refresh');

    await waitFor(() => expect(listPlugins).toHaveBeenCalled());
    fireEvent.change(prompt, {
      target: { value: `${prompt.value} @release`, selectionStart: `${prompt.value} @release`.length },
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Release Plugin/i }));
    expect(prompt.value).toContain('@Release Plugin');

    fireEvent.change(prompt, {
      target: { value: `${prompt.value} @figma`, selectionStart: `${prompt.value} @figma`.length },
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Figma MCP/i }));
    expect(prompt.value).toContain('@Figma MCP');

    fireEvent.change(prompt, {
      target: { value: `${prompt.value} @linear`, selectionStart: `${prompt.value} @linear`.length },
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Linear/i }));
    expect(prompt.value).toContain('@Linear');

    expect(screen.getByTitle('Remove Memory Refresh')).toBeTruthy();
    expect(screen.getByTitle('Remove Release Plugin')).toBeTruthy();
    expect(screen.getByTitle('Remove Figma MCP')).toBeTruthy();
    expect(screen.getByTitle('Remove Linear')).toBeTruthy();
  });

  it('uses template title for picker visibility but seeds default name on selection', () => {
    vi.mocked(listPlugins).mockResolvedValue([]);
    vi.mocked(fetchMcpServers).mockResolvedValue({ servers: [], templates: [] });

    render(
      <NewAutomationModal
        open
        templates={[templateWithLocalizedTitle]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );

    const templateTrigger = screen.getByRole('button', { name: 'Use template' });
    fireEvent.click(templateTrigger);
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Refresh project memory from recent work\./,
      }),
    );

    expect((screen.getByTestId('automation-modal-title') as HTMLInputElement).value).toBe('Memory refresh');
  });

  it('localizes template kind labels in the picker', () => {
    vi.mocked(listPlugins).mockResolvedValue([]);
    vi.mocked(fetchMcpServers).mockResolvedValue({ servers: [], templates: [] });

    render(
      <I18nProvider initial="zh-CN">
        <NewAutomationModal
          open
          templates={[liveArtifactTemplate]}
          projects={[]}
          skills={[]}
          connectors={[]}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '使用模板' }));

    expect(screen.getByText('实时看板')).toBeTruthy();
    expect(screen.queryByText('Live artifact')).toBeNull();
  });
});
