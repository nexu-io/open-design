// @vitest-environment jsdom
//
// Renders NewAutomationModal with an injected fake `useForm` controller to
// pin render-only branches that are awkward to reach by driving the real
// hook through many interactions: the error banner, submitting/editing
// button copy, popover open<->close toggles, and the mention list's
// meta-field fallback chains (skill/plugin description, MCP label/url/
// command, connector accountLabel/provider/id).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail, InstalledPluginRecord, McpServerConfig } from '@open-design/contracts';

import { NewAutomationModal } from '../../../src/features/automations/components/NewAutomationModal';
import { emptyForm } from '../../../src/features/automations/rules';
import type { AutomationModalFormController } from '../../../src/features/automations/hooks/useAutomationModalForm.hooks';
import type { AutomationCapabilitiesController } from '../../../src/features/automations/hooks/useAutomationCapabilities.hooks';
import type { SkillSummary } from '../../../src/types';

afterEach(() => cleanup());

function makeController(overrides: Partial<AutomationModalFormController> = {}): AutomationModalFormController {
  return {
    editingId: null,
    form: emptyForm(),
    setForm: vi.fn(),
    submitting: false,
    error: null,
    popover: null,
    setPopover: vi.fn(),
    mentionTab: 'all',
    setMentionTab: vi.fn(),
    mention: null,
    titleRef: { current: null },
    promptRef: { current: null },
    timezones: ['UTC'],
    selectedTemplate: null,
    selectedTemplateId: null,
    scheduleLabel: 'Runs daily',
    scheduleParts: { kind: 'daily', kindLabel: 'Daily', time: '9:00 AM', tz: 'UTC' },
    projectLabel: 'New project each run',
    filteredSkills: [],
    filteredPlugins: [],
    filteredMcp: [],
    filteredConnectors: [],
    showSkills: true,
    showPlugins: true,
    showMcp: true,
    showConnectors: true,
    hasMentionResults: false,
    selectedContextItems: [],
    applyTemplate: vi.fn(),
    updatePrompt: vi.fn(),
    refreshMentionFromPrompt: vi.fn(),
    handlePromptKeyDown: vi.fn(),
    pickSkill: vi.fn(),
    pickPlugin: vi.fn(),
    pickMcp: vi.fn(),
    pickConnector: vi.fn(),
    removeSelectedContext: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

function renderModal(controller: AutomationModalFormController) {
  const useCapabilities = (): AutomationCapabilitiesController => ({ plugins: [], mcpServers: [] });
  render(
    <NewAutomationModal
      open
      templates={[]}
      projects={[]}
      skills={[]}
      connectors={[]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      useCapabilities={useCapabilities}
      useForm={() => controller}
    />,
  );
}

describe('NewAutomationModal render states', () => {
  it('shows the error banner when the form has a validation/submit error', () => {
    renderModal(makeController({ error: 'Add a title for this automation.' }));
    expect(screen.getByRole('alert').textContent).toBe('Add a title for this automation.');
  });

  it('hides the error banner when there is no error', () => {
    renderModal(makeController({ error: null }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows Save + Loading copy while editing and submitting', () => {
    renderModal(makeController({ editingId: 'r1', submitting: true }));
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeTruthy();
  });

  it('shows Save copy while editing and idle', () => {
    renderModal(makeController({ editingId: 'r1', submitting: false }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('shows Create + Loading copy while creating and submitting', () => {
    renderModal(makeController({ editingId: null, submitting: true }));
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeTruthy();
  });

  it('shows Create copy while creating and idle', () => {
    renderModal(makeController({ editingId: null, submitting: false }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('shows the selected-context chip row only once an item is selected', () => {
    const skill: SkillSummary = {
      id: 'skill-1',
      name: 'Skill One',
      description: 'A skill.',
      triggers: [],
      mode: 'prototype',
      previewType: 'html',
      designSystemRequired: false,
      defaultFor: [],
      upstream: null,
      hasBody: true,
      examplePrompt: '',
      aggregatesExamples: false,
    };
    renderModal(
      makeController({
        selectedContextItems: [{ kind: 'skills', id: 'skill-1', label: skill.name, meta: 'Skill', icon: 'file' }],
      }),
    );
    expect(screen.getByTitle('Remove Skill One')).toBeTruthy();
  });

  it('toggles the template popover open and closed on repeated clicks', () => {
    const setPopover = vi.fn();
    const { rerender } = render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: null, setPopover })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));
    expect(setPopover).toHaveBeenCalledWith('template');

    rerender(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: 'template', setPopover })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));
    expect(setPopover).toHaveBeenCalledWith(null);
  });

  it('toggles the project popover open and closed on repeated clicks', () => {
    const setPopover = vi.fn();
    const { rerender } = render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: null, setPopover })}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /New project each run/i })[0]!);
    expect(setPopover).toHaveBeenCalledWith('project');

    rerender(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: 'project', setPopover })}
      />,
    );
    // With the popover open, the trigger is the FIRST match (the fixed
    // "New project each run" PopoverItem is the second).
    fireEvent.click(screen.getAllByRole('button', { name: /New project each run/i })[0]!);
    expect(setPopover).toHaveBeenCalledWith(null);
  });

  it('toggles the schedule popover open and closed on repeated clicks', () => {
    const setPopover = vi.fn();
    const { rerender } = render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: null, setPopover })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Runs daily/ }));
    expect(setPopover).toHaveBeenCalledWith('schedule');

    rerender(
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        useCapabilities={() => ({ plugins: [], mcpServers: [] })}
        useForm={() => makeController({ popover: 'schedule', setPopover })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Runs daily/ }));
    expect(setPopover).toHaveBeenCalledWith(null);
  });

  it('shows an empty query prompt in the mention list when the query is blank', () => {
    renderModal(makeController({ mention: { start: 0, end: 1, query: '' }, hasMentionResults: false }));
    expect(screen.getByTestId('automation-mention-popover').textContent).toContain(
      'Search Design Files, tabs, plugins, skills, MCP servers, and connectors.',
    );
  });

  it('shows a no-results message keyed to the query when it has content', () => {
    renderModal(makeController({ mention: { start: 0, end: 5, query: 'zzz' }, hasMentionResults: false }));
    expect(screen.getByTestId('automation-mention-popover').textContent).toContain('zzz');
  });

  it('falls back to skill.mode when a skill has no description', () => {
    const skill: SkillSummary = {
      id: 'skill-1',
      name: 'Skill One',
      description: '',
      triggers: [],
      mode: 'deck',
      previewType: 'html',
      designSystemRequired: false,
      defaultFor: [],
      upstream: null,
      hasBody: true,
      examplePrompt: '',
      aggregatesExamples: false,
    };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 's' },
        hasMentionResults: true,
        filteredSkills: [skill],
      }),
    );
    expect(screen.getByText('deck')).toBeTruthy();
  });

  it('falls back to plugin.id when a plugin has no description', () => {
    const plugin: InstalledPluginRecord = {
      id: 'plugin-1',
      title: 'Plugin One',
      version: '1.0.0',
      trust: 'restricted',
      sourceKind: 'local',
      source: '/x',
      capabilitiesGranted: [],
      manifest: { name: 'plugin-1', title: 'Plugin One', version: '1.0.0' },
      fsPath: '/x',
      installedAt: 0,
      updatedAt: 0,
    };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 'p' },
        hasMentionResults: true,
        filteredPlugins: [plugin],
      }),
    );
    expect(screen.getByText('plugin-1')).toBeTruthy();
  });

  it('falls back to the id when a server has no label', () => {
    const server: McpServerConfig = { id: 'mcp-1', label: '', transport: 'stdio', enabled: true, command: 'run-me' };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 'm' },
        hasMentionResults: true,
        filteredMcp: [server],
      }),
    );
    expect(screen.getByText('mcp-1')).toBeTruthy();
  });

  it('falls back through the server url -> command -> transport meta chain', () => {
    const withCommand: McpServerConfig = { id: 'mcp-1', label: 'One', transport: 'stdio', enabled: true, command: 'run-me' };
    const bare: McpServerConfig = { id: 'mcp-2', label: 'Two', transport: 'sse', enabled: true };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 'x' },
        hasMentionResults: true,
        filteredMcp: [withCommand, bare],
      }),
    );
    expect(screen.getByText('run-me')).toBeTruthy();
    expect(screen.getByText('sse')).toBeTruthy();
  });

  it('falls back through the connector accountLabel -> provider chain', () => {
    const connector: ConnectorDetail = {
      id: 'conn-1',
      name: 'Connector One',
      provider: 'composio',
      category: 'work',
      description: undefined,
      status: 'connected',
      accountLabel: undefined,
      auth: { provider: 'composio', configured: true },
      tools: [],
    };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 'c' },
        hasMentionResults: true,
        filteredConnectors: [connector],
      }),
    );
    expect(screen.getByText('composio')).toBeTruthy();
  });

  it('falls back to the id when a connector has neither accountLabel nor provider', () => {
    const connector: ConnectorDetail = {
      id: 'conn-2',
      name: 'Connector Two',
      provider: undefined as unknown as string,
      category: 'work',
      description: undefined,
      status: 'connected',
      accountLabel: undefined,
      auth: { provider: 'composio', configured: true },
      tools: [],
    };
    renderModal(
      makeController({
        mention: { start: 0, end: 1, query: 'c' },
        hasMentionResults: true,
        filteredConnectors: [connector],
      }),
    );
    expect(screen.getByText('conn-2')).toBeTruthy();
  });
});
