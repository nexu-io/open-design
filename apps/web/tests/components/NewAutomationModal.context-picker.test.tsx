// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail, InstalledPluginRecord } from '@open-design/contracts';

import { NewAutomationModal } from '../../src/components/NewAutomationModal';
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
});
