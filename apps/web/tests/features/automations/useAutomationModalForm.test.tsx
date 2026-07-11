// @vitest-environment jsdom
//
// The automation-modal form hook against hand-written fake `AutomationSubmitPort`
// / `AutomationDomPort` implementations — no global fetch mock, no real DOM
// event listeners. Pins the open/initial hydration effect (routine-with-context,
// routine-without-context skillId fallback, template, and reset), the
// "@mention" pick/remove flow, prompt-Escape handling, the Escape-key bridge's
// mention > popover > close priority, and submit (validation, create, edit,
// and transport failure).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail, InstalledPluginRecord, McpServerConfig, Routine } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import {
  useAutomationModalForm,
  type UseAutomationModalFormOptions,
} from '../../../src/features/automations/hooks/useAutomationModalForm.hooks';
import type { AutomationDomPort, AutomationSubmitPort } from '../../../src/features/automations/ports';
import type { AutomationTemplate } from '../../../src/features/automations/types';
import type { SkillSummary } from '../../../src/types';

function makeSubmitPort(over: Partial<AutomationSubmitPort> = {}): AutomationSubmitPort {
  return {
    createRoutine: vi.fn(async () => ({ id: 'created' }) as Routine),
    updateRoutine: vi.fn(async () => ({ id: 'updated' }) as Routine),
    ...over,
  };
}

function makeDomPort(): AutomationDomPort & { escapeCallback: (() => void) | null } {
  const port = {
    escapeCallback: null as (() => void) | null,
    subscribeEscapeKey: vi.fn((onEscape: () => void) => {
      port.escapeCallback = onEscape;
      return () => {
        port.escapeCallback = null;
      };
    }),
    lockBodyScroll: vi.fn(() => vi.fn()),
    scheduleTimeout: vi.fn(() => vi.fn()),
    confirmDialog: vi.fn(() => true),
  };
  return port;
}

const routine: Routine = {
  id: 'routine-1',
  name: 'Existing routine',
  prompt: 'Do the thing.',
  schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
  target: { mode: 'create_each_run' },
  skillId: null,
  agentId: null,
  enabled: true,
  nextRunAt: null,
  lastRun: null,
  createdAt: 1000,
  updatedAt: 1000,
};

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
  examplePrompt: 'Run it',
  aggregatesExamples: false,
};

const plugin: InstalledPluginRecord = {
  id: 'plugin-1',
  title: 'Plugin One',
  version: '1.0.0',
  trust: 'restricted',
  sourceKind: 'local',
  source: '/x',
  capabilitiesGranted: [],
  manifest: { name: 'plugin-1', title: 'Plugin One', version: '1.0.0', description: 'desc' },
  fsPath: '/x',
  installedAt: 0,
  updatedAt: 0,
};

const mcpServer: McpServerConfig = { id: 'mcp-1', label: 'MCP One', transport: 'stdio', enabled: true, command: 'run' };

const connector: ConnectorDetail = {
  id: 'conn-1',
  name: 'Connector One',
  provider: 'composio',
  category: 'work',
  description: 'desc',
  status: 'connected',
  accountLabel: 'acct',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider initial="en">{children}</I18nProvider>;

function baseOptions(over: Partial<UseAutomationModalFormOptions> = {}): UseAutomationModalFormOptions {
  return {
    open: true,
    initial: null,
    templates: [],
    projects: [],
    skills: [skill],
    plugins: [plugin],
    mcpServers: [mcpServer],
    connectors: [connector],
    locale: 'en',
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...over,
  };
}

function renderForm(
  submitPort: AutomationSubmitPort,
  domPort: AutomationDomPort,
  options: UseAutomationModalFormOptions,
) {
  return renderHook(() => useAutomationModalForm(submitPort, domPort, options), { wrapper });
}

describe('useAutomationModalForm: hydration effect', () => {
  it('resets to an empty form when there is no initial state', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    expect(result.current.form.name).toBe('');
    expect(result.current.selectedContextItems).toEqual([]);
  });

  it('hydrates the form + explicit context from an initial routine', () => {
    const { result } = renderForm(
      makeSubmitPort(),
      makeDomPort(),
      baseOptions({
        initial: {
          routine: {
            ...routine,
            context: { skillIds: ['skill-1'], pluginIds: ['plugin-1'], mcpServerIds: ['mcp-1'], connectorIds: ['conn-1'] },
          },
        },
      }),
    );
    expect(result.current.form.name).toBe('Existing routine');
    expect(result.current.editingId).toBe('routine-1');
    expect(result.current.selectedContextItems.map((item) => item.kind)).toEqual(['skills', 'plugins', 'mcp', 'connectors']);
  });

  it('falls back to the routine skillId when context is absent', () => {
    const { result } = renderForm(
      makeSubmitPort(),
      makeDomPort(),
      baseOptions({ initial: { routine: { ...routine, skillId: 'skill-1', context: undefined } } }),
    );
    expect(result.current.selectedContextItems).toEqual([
      { kind: 'skills', id: 'skill-1', label: 'Skill One', meta: 'Skill', icon: 'file' },
    ]);
  });

  it('selects no capabilities when both context and skillId are absent', () => {
    const { result } = renderForm(
      makeSubmitPort(),
      makeDomPort(),
      baseOptions({ initial: { routine: { ...routine, skillId: null, context: undefined } } }),
    );
    expect(result.current.selectedContextItems).toEqual([]);
  });

  it('applies an initial template', () => {
    const template: AutomationTemplate = {
      id: 'tpl-1',
      category: 'memory',
      kind: 'routine',
      icon: 'history',
      title: 'Template title',
      description: '',
      prompt: 'Template prompt',
      defaultName: 'Template name',
      skillId: 'skill-1',
    };
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions({ initial: { template } }));
    expect(result.current.form.name).toBe('Template name');
    expect(result.current.form.prompt).toBe('Template prompt');
    expect(result.current.selectedTemplateId).toBe('tpl-1');
  });

  it('does not hydrate while closed', () => {
    const { result } = renderForm(
      makeSubmitPort(),
      makeDomPort(),
      baseOptions({ open: false, initial: { routine } }),
    );
    expect(result.current.form.name).toBe('');
  });
});

describe('useAutomationModalForm: capability picking', () => {
  it('picks a skill, plugin, mcp server, and connector, inserting a mention token each time', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());

    act(() => result.current.pickSkill(skill));
    expect(result.current.form.prompt).toContain('@Skill One');

    act(() => result.current.pickPlugin(plugin));
    expect(result.current.form.prompt).toContain('@Plugin One');

    act(() => result.current.pickMcp(mcpServer));
    expect(result.current.form.prompt).toContain('@MCP One');

    act(() => result.current.pickConnector(connector));
    expect(result.current.form.prompt).toContain('@Connector One');

    expect(result.current.selectedContextItems).toHaveLength(4);
  });

  it('does not duplicate an already-selected capability', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    act(() => result.current.pickSkill(skill));
    act(() => result.current.pickSkill(skill));
    expect(result.current.selectedContextItems.filter((item) => item.kind === 'skills')).toHaveLength(1);
  });

  it('removes a selected capability by kind + id', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    act(() => result.current.pickSkill(skill));
    expect(result.current.selectedContextItems).toHaveLength(1);
    act(() => result.current.removeSelectedContext('skills', skill.id));
    expect(result.current.selectedContextItems).toHaveLength(0);
  });

  it('inserts a mention at an active @query instead of appending', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    act(() => result.current.updatePrompt('Run @sk', 7));
    expect(result.current.mention).toMatchObject({ query: 'sk' });
    act(() => result.current.pickSkill(skill));
    expect(result.current.form.prompt).toBe('Run @Skill One ');
    expect(result.current.mention).toBeNull();
  });
});

describe('useAutomationModalForm: prompt Escape handling', () => {
  it('clears an active mention on Escape and prevents default', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    act(() => result.current.updatePrompt('Run @sk', 7));
    const preventDefault = vi.fn();
    act(() => result.current.handlePromptKeyDown({ key: 'Escape', preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.mention).toBeNull();
  });

  it('ignores Escape when there is no active mention', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    const preventDefault = vi.fn();
    act(() => result.current.handlePromptKeyDown({ key: 'Escape', preventDefault }));
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', () => {
    const { result } = renderForm(makeSubmitPort(), makeDomPort(), baseOptions());
    act(() => result.current.updatePrompt('Run @sk', 7));
    act(() => result.current.handlePromptKeyDown({ key: 'Enter', preventDefault: vi.fn() }));
    expect(result.current.mention).not.toBeNull();
  });
});

describe('useAutomationModalForm: Escape-key bridge priority', () => {
  it('clears the mention first when both a mention and a popover are open', () => {
    const domPort = makeDomPort();
    const onClose = vi.fn();
    const { result } = renderForm(makeSubmitPort(), domPort, baseOptions({ onClose }));
    act(() => result.current.updatePrompt('Run @sk', 7));
    act(() => result.current.setPopover('template'));

    act(() => domPort.escapeCallback?.());

    expect(result.current.mention).toBeNull();
    expect(result.current.popover).toBe('template');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the popover when there is no mention', () => {
    const domPort = makeDomPort();
    const onClose = vi.fn();
    const { result } = renderForm(makeSubmitPort(), domPort, baseOptions({ onClose }));
    act(() => result.current.setPopover('schedule'));

    act(() => domPort.escapeCallback?.());

    expect(result.current.popover).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when neither a mention nor a popover is open', () => {
    const domPort = makeDomPort();
    const onClose = vi.fn();
    renderForm(makeSubmitPort(), domPort, baseOptions({ onClose }));

    act(() => domPort.escapeCallback?.());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useAutomationModalForm: DOM bridges wired while open', () => {
  it('locks body scroll and schedules the title focus while open', () => {
    const domPort = makeDomPort();
    renderForm(makeSubmitPort(), domPort, baseOptions({ open: true }));
    expect(domPort.lockBodyScroll).toHaveBeenCalledTimes(1);
    expect(domPort.scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 30);
  });

  it('does not lock body scroll or subscribe to Escape while closed', () => {
    const domPort = makeDomPort();
    renderForm(makeSubmitPort(), domPort, baseOptions({ open: false }));
    expect(domPort.lockBodyScroll).not.toHaveBeenCalled();
    expect(domPort.subscribeEscapeKey).not.toHaveBeenCalled();
  });
});

describe('useAutomationModalForm: submit', () => {
  it('rejects an empty name without calling the port', () => {
    const submitPort = makeSubmitPort();
    const { result } = renderForm(submitPort, makeDomPort(), baseOptions());
    act(() => result.current.submit({ preventDefault: vi.fn() }));
    expect(result.current.error).toBe('Add a title for this automation.');
    expect(submitPort.createRoutine).not.toHaveBeenCalled();
  });

  it('rejects an empty prompt without calling the port', () => {
    const submitPort = makeSubmitPort();
    const { result } = renderForm(submitPort, makeDomPort(), baseOptions());
    act(() => result.current.setForm((current) => ({ ...current, name: 'Has a name' })));
    act(() => result.current.submit({ preventDefault: vi.fn() }));
    expect(result.current.error).toBe('Add a prompt for the scheduled conversation.');
    expect(submitPort.createRoutine).not.toHaveBeenCalled();
  });

  it('creates a routine and calls onSaved + onClose on success', async () => {
    const submitPort = makeSubmitPort();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { result } = renderForm(submitPort, makeDomPort(), baseOptions({ onSaved, onClose }));
    act(() => result.current.setForm((current) => ({ ...current, name: 'New automation', prompt: 'Do it' })));

    act(() => result.current.submit({ preventDefault: vi.fn() }));
    expect(result.current.submitting).toBe(true);

    await waitFor(() => expect(result.current.submitting).toBe(false));
    expect(submitPort.createRoutine).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ id: 'created' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('updates the routine instead of creating one when editing', async () => {
    const submitPort = makeSubmitPort();
    const { result } = renderForm(
      submitPort,
      makeDomPort(),
      baseOptions({ initial: { routine: { ...routine, name: 'Existing', prompt: 'Existing prompt' } } }),
    );

    act(() => result.current.submit({ preventDefault: vi.fn() }));
    await waitFor(() => expect(result.current.submitting).toBe(false));

    expect(submitPort.updateRoutine).toHaveBeenCalledWith('routine-1', expect.any(Object));
    expect(submitPort.createRoutine).not.toHaveBeenCalled();
  });

  it('surfaces an Error message on transport failure', async () => {
    const submitPort = makeSubmitPort({ createRoutine: vi.fn(async () => { throw new Error('create boom'); }) });
    const { result } = renderForm(submitPort, makeDomPort(), baseOptions());
    act(() => result.current.setForm((current) => ({ ...current, name: 'X', prompt: 'Y' })));

    act(() => result.current.submit({ preventDefault: vi.fn() }));
    await waitFor(() => expect(result.current.submitting).toBe(false));

    expect(result.current.error).toBe('create boom');
  });

  it('stringifies a non-Error rejection', async () => {
    const submitPort = makeSubmitPort({ createRoutine: vi.fn(async () => { throw 'plain string failure'; }) });
    const { result } = renderForm(submitPort, makeDomPort(), baseOptions());
    act(() => result.current.setForm((current) => ({ ...current, name: 'X', prompt: 'Y' })));

    act(() => result.current.submit({ preventDefault: vi.fn() }));
    await waitFor(() => expect(result.current.submitting).toBe(false));

    expect(result.current.error).toBe('plain string failure');
  });
});
