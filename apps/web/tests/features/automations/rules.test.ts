import { describe, expect, it } from 'vitest';
import type {
  AutomationEvolutionProposal,
  AutomationTemplate as ContractAutomationTemplate,
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  Routine,
} from '@open-design/contracts';

import {
  automationTemplateCategory,
  automationTemplateIcon,
  automationTemplatePrompt,
  buildAutomationTemplates,
  buildCreateRoutineRequest,
  buildModalInitial,
  buildRoutineTarget,
  buildRunContextSelection,
  buildSchedule,
  buildSelectedContextItems,
  buildStaticTemplates,
  buildUpdateRoutineRequest,
  clampMinute,
  dedupeTemplates,
  emptyForm,
  errorMessage,
  fallbackLiveTemplate,
  fallbackOrbitTemplate,
  filterCapabilities,
  filterTemplates,
  formFromRoutine,
  isContextSelected,
  kindIcon,
  kindLabel,
  mergeAutomationProposals,
  nextRunLabel,
  proposalActionLabel,
  proposalTargetLabel,
  readContextMention,
  removeSelectedContextId,
  routineTargetLabel,
  scheduleStatusLabel,
  sortRoutinesNewestFirst,
  statusLabel,
  templateFilters,
  templateFromAutomationCatalog,
  templateFromSkill,
  type SelectedContextIds,
} from '../../../src/features/automations/rules';
import type { AutomationTemplate } from '../../../src/features/automations/types';
import type { SkillSummary } from '../../../src/types';

const t = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as Parameters<typeof buildStaticTemplates>[0];

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'Test routine',
    prompt: 'Do something.',
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
    target: { mode: 'create_each_run' },
    skillId: null,
    agentId: null,
    enabled: true,
    nextRunAt: null,
    lastRun: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
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
    examplePrompt: 'Example prompt',
    aggregatesExamples: false,
    ...overrides,
  };
}

function makeContractTemplate(overrides: Partial<ContractAutomationTemplate> = {}): ContractAutomationTemplate {
  return {
    id: 'daemon-tpl',
    title: 'Daemon template',
    description: 'A daemon template.',
    purpose: 'Purpose text',
    triggerKinds: ['manual'],
    sourceKinds: ['upload'],
    stages: [{ id: 's1', kind: 'ingest', title: 'Ingest' }],
    outputSinks: ['memory'],
    reviewPolicy: 'always',
    tokenCompression: 'balanced',
    tags: [],
    ...overrides,
  };
}

function makeProposal(overrides: Partial<AutomationEvolutionProposal> = {}): AutomationEvolutionProposal {
  return {
    id: 'p1',
    title: 'Proposal',
    summary: 'Summary',
    targetKind: 'memory-node',
    action: 'create',
    status: 'pending-review',
    reviewPolicy: 'always',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sourcePacketIds: [],
    patch: { format: 'markdown', after: 'x' },
    ...overrides,
  };
}

describe('rules: templates', () => {
  it('buildStaticTemplates returns 6 fixed templates', () => {
    expect(buildStaticTemplates(t)).toHaveLength(6);
  });

  it('fallbackOrbitTemplate and fallbackLiveTemplate build fixed shapes', () => {
    expect(fallbackOrbitTemplate(t).kind).toBe('orbit');
    expect(fallbackLiveTemplate(t).kind).toBe('live-artifact');
  });

  it('templateFilters enumerates every filter id', () => {
    expect(templateFilters(t).map((f) => f.id)).toEqual([
      'all',
      'orbit',
      'live-artifact',
      'memory',
      'design-system',
      'skills',
      'connectors',
      'compression',
      'release',
      'quality',
    ]);
  });

  it('templateFromSkill builds an orbit template', () => {
    const skill = makeSkill({ examplePrompt: 'Run it' });
    const tpl = templateFromSkill(skill, 'orbit');
    expect(tpl).toMatchObject({ id: 'skill-skill-1', category: 'orbit', icon: 'orbit', prompt: 'Run it' });
  });

  it('templateFromSkill builds a live-artifact template and falls back to description then id for prompt', () => {
    const withDescription = templateFromSkill(makeSkill({ examplePrompt: '' }), 'live-artifact');
    expect(withDescription).toMatchObject({ category: 'live-artifact', icon: 'file-code', prompt: 'A skill.' });

    const withNoDescription = templateFromSkill(
      makeSkill({ examplePrompt: '', description: '', name: 'Bare Skill' }),
      'live-artifact',
    );
    expect(withNoDescription.prompt).toBe('Run Bare Skill.');
  });

  it('templateFromSkill falls back to skill id when description is empty', () => {
    const skill = makeSkill({ description: '' });
    expect(templateFromSkill(skill, 'orbit').description).toBe('skill-1');
  });

  const categoryCases: Array<[Partial<ContractAutomationTemplate>, string]> = [
    [{ outputSinks: ['design-system'] }, 'design-system'],
    [{ outputSinks: ['memory'], tags: ['design-system'] }, 'design-system'],
    [{ outputSinks: ['skill'] }, 'skills'],
    [{ outputSinks: ['memory'], tags: ['skills'] }, 'skills'],
    [{ tags: ['connectors'] }, 'connectors'],
    [{ sourceKinds: ['connector'] }, 'connectors'],
    [{ tokenCompression: 'aggressive' }, 'compression'],
    [{ tags: ['compression'] }, 'compression'],
    [{ tags: ['tokens'] }, 'compression'],
    [{ outputSinks: ['memory'] }, 'memory'],
    [{ outputSinks: ['memory'], tags: ['memory'] }, 'memory'],
    [{ outputSinks: [], sourceKinds: [] }, 'routine'],
    [{ outputSinks: [], sourceKinds: [], tags: undefined }, 'routine'],
  ];

  it.each(categoryCases)('automationTemplateCategory classifies %j as %s', (overrides, expected) => {
    expect(automationTemplateCategory(makeContractTemplate(overrides))).toBe(expected);
  });

  it.each([
    ['design-system', 'sliders'],
    ['skills', 'sparkles'],
    ['connectors', 'link'],
    ['compression', 'reload'],
    ['memory', 'history'],
    ['routine', 'history'],
  ])('automationTemplateIcon(%s) -> %s', (category, icon) => {
    expect(automationTemplateIcon(category)).toBe(icon);
  });

  it('automationTemplatePrompt composes the full instruction block', () => {
    const prompt = automationTemplatePrompt(makeContractTemplate());
    expect(prompt).toContain('Use Automation template "daemon-tpl".');
    expect(prompt).toContain('Pipeline: Ingest.');
    expect(prompt).toContain('Outputs: memory.');
  });

  it('templateFromAutomationCatalog derives category + icon from the catalog entry', () => {
    const tpl = templateFromAutomationCatalog(makeContractTemplate({ outputSinks: ['design-system'] }));
    expect(tpl).toMatchObject({ category: 'design-system', icon: 'sliders', kind: 'routine' });
  });

  it('dedupeTemplates keeps only the first occurrence of each id', () => {
    const a = { id: 'x' } as AutomationTemplate;
    const b = { id: 'x' } as AutomationTemplate;
    const c = { id: 'y' } as AutomationTemplate;
    expect(dedupeTemplates([a, b, c]).map((tpl) => tpl.id)).toEqual(['x', 'y']);
  });

  it('buildAutomationTemplates uses design-template orbit/live entries when present', () => {
    const designTemplates = [
      makeSkill({ id: 'orbit-1', scenario: 'orbit' } as Partial<SkillSummary>),
      makeSkill({ id: 'live-1', scenario: 'live' } as Partial<SkillSummary>),
    ];
    const templates = buildAutomationTemplates(designTemplates, [], t);
    expect(templates.some((tpl) => tpl.id === 'skill-orbit-1')).toBe(true);
    expect(templates.some((tpl) => tpl.id === 'skill-live-1')).toBe(true);
    expect(templates.some((tpl) => tpl.id === 'orbit-daily')).toBe(false);
    expect(templates.some((tpl) => tpl.id === 'live-status-board')).toBe(false);
  });

  it('buildAutomationTemplates falls back to the fixed orbit/live templates when none are provided', () => {
    const templates = buildAutomationTemplates([], [], t);
    expect(templates.some((tpl) => tpl.id === 'orbit-daily')).toBe(true);
    expect(templates.some((tpl) => tpl.id === 'live-status-board')).toBe(true);
  });

  it('filterTemplates supports all/kind/category filters', () => {
    const templates: AutomationTemplate[] = [
      { id: '1', category: 'memory', kind: 'routine', icon: 'history', title: 'A', description: '', prompt: '' },
      { id: '2', category: 'orbit', kind: 'orbit', icon: 'orbit', title: 'B', description: '', prompt: '' },
      { id: '3', category: 'live-artifact', kind: 'live-artifact', icon: 'file-code', title: 'C', description: '', prompt: '' },
    ];
    expect(filterTemplates(templates, 'all')).toHaveLength(3);
    expect(filterTemplates(templates, 'orbit').map((tpl) => tpl.id)).toEqual(['2']);
    expect(filterTemplates(templates, 'live-artifact').map((tpl) => tpl.id)).toEqual(['3']);
    expect(filterTemplates(templates, 'memory').map((tpl) => tpl.id)).toEqual(['1']);
  });

  it.each([
    ['orbit', 'automations.kindOrbit'],
    ['live-artifact', 'automations.kindLiveArtifact'],
    ['routine', 'automations.kindAutomation'],
  ] as const)('kindLabel(%s)', (kind, expected) => {
    expect(kindLabel(kind, t)).toBe(expected);
  });

  it.each([
    ['orbit', 'orbit'],
    ['live-artifact', 'file-code'],
    ['routine', 'history'],
  ] as const)('kindIcon(%s) -> %s', (kind, icon) => {
    expect(kindIcon(kind)).toBe(icon);
  });
});

describe('rules: routines', () => {
  it('sortRoutinesNewestFirst orders by createdAt descending without mutating input', () => {
    const older = makeRoutine({ id: 'a', createdAt: 1 });
    const newer = makeRoutine({ id: 'b', createdAt: 2 });
    const input = [older, newer];
    expect(sortRoutinesNewestFirst(input).map((r) => r.id)).toEqual(['b', 'a']);
    expect(input).toEqual([older, newer]);
  });

  it('sortRoutinesNewestFirst treats a missing createdAt as 0', () => {
    const missing = makeRoutine({ id: 'missing', createdAt: undefined as unknown as number });
    const present = makeRoutine({ id: 'present', createdAt: 5 });
    expect(sortRoutinesNewestFirst([missing, present]).map((r) => r.id)).toEqual(['present', 'missing']);
    // Cover both operands of the `createdAt ?? 0` comparator, not just one.
    expect(sortRoutinesNewestFirst([present, missing]).map((r) => r.id)).toEqual(['present', 'missing']);
  });

  it('scheduleStatusLabel reports paused when disabled, else the schedule description', () => {
    expect(scheduleStatusLabel(makeRoutine({ enabled: false }), t)).toBe('automations.scheduleStatusPaused');
    expect(scheduleStatusLabel(makeRoutine({ enabled: true }), t)).toContain('routines.describe.daily');
  });

  it('nextRunLabel covers disabled, unscheduled, and scheduled routines', () => {
    expect(nextRunLabel(makeRoutine({ enabled: false }), t)).toBe('automations.nextRunManualOnly');
    expect(nextRunLabel(makeRoutine({ enabled: true, nextRunAt: null }), t)).toBe('automations.nextRunScheduled');
    expect(nextRunLabel(makeRoutine({ enabled: true, nextRunAt: Date.now() }), t)).toContain('automations.nextRunAt');
  });

  it.each([
    ['succeeded', 'automations.statusSucceeded'],
    ['failed', 'automations.statusFailed'],
    ['running', 'automations.statusRunning'],
    ['queued', 'automations.statusQueued'],
    ['canceled', 'automations.statusCanceled'],
  ] as const)('statusLabel(%s)', (status, expected) => {
    expect(statusLabel(status, t)).toBe(expected);
  });

  it('errorMessage unwraps an Error and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });

  it('routineTargetLabel resolves a reused project name, falls back to id, or the create-each-run copy', () => {
    const projectsById = new Map([['proj-1', 'My Project']]);
    expect(
      routineTargetLabel(makeRoutine({ target: { mode: 'reuse', projectId: 'proj-1' } }), projectsById, t),
    ).toBe('My Project');
    expect(
      routineTargetLabel(makeRoutine({ target: { mode: 'reuse', projectId: 'unknown' } }), projectsById, t),
    ).toBe('unknown');
    expect(
      routineTargetLabel(makeRoutine({ target: { mode: 'create_each_run' } }), projectsById, t),
    ).toBe('automations.targetNewEachRun');
  });
});

describe('rules: evolution proposals', () => {
  it.each([
    ['memory-node', 'automations.proposalTargetMemory'],
    ['design-system', 'automations.proposalTargetDesignSystem'],
    ['skill', 'automations.proposalTargetSkill'],
    ['automation-template', 'automations.proposalTargetTemplate'],
  ] as const)('proposalTargetLabel(%s)', (target, expected) => {
    expect(proposalTargetLabel(target, t)).toBe(expected);
  });

  it.each([
    ['create', 'automations.proposalActionCreate'],
    ['update', 'automations.proposalActionUpdate'],
    ['merge', 'automations.proposalActionMerge'],
    ['move', 'automations.proposalActionMove'],
    ['delete', 'automations.proposalActionDelete'],
    ['promote', 'automations.proposalActionPromote'],
  ] as const)('proposalActionLabel(%s)', (action, expected) => {
    expect(proposalActionLabel(action, t)).toBe(expected);
  });

  it('mergeAutomationProposals dedupes by id, keeping the incoming version, sorted newest first', () => {
    const current = [
      makeProposal({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeProposal({ id: 'b', createdAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const incoming = [makeProposal({ id: 'a', title: 'Updated A', createdAt: '2026-01-03T00:00:00.000Z' })];
    const merged = mergeAutomationProposals(current, incoming);
    expect(merged.map((p) => p.id)).toEqual(['a', 'b']);
    expect(merged[0]?.title).toBe('Updated A');
  });

  it('mergeAutomationProposals treats an unparsable createdAt as epoch 0', () => {
    const current = [makeProposal({ id: 'a', createdAt: 'not-a-date' })];
    const incoming = [makeProposal({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z' })];
    expect(mergeAutomationProposals(current, incoming).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('mergeAutomationProposals treats an unparsable createdAt as epoch 0 on either side', () => {
    const current = [makeProposal({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })];
    const incoming = [makeProposal({ id: 'b', createdAt: 'also-not-a-date' })];
    expect(mergeAutomationProposals(current, incoming).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('rules: automation modal form <-> wire schedule', () => {
  it('emptyForm seeds sensible daily defaults', () => {
    const form = emptyForm();
    expect(form).toMatchObject({ name: '', prompt: '', kind: 'daily', minute: 0, time: '09:00', weekday: 1, mode: 'create_each_run', projectId: '' });
    expect(typeof form.timezone).toBe('string');
  });

  it('formFromRoutine maps an hourly schedule', () => {
    const form = formFromRoutine(makeRoutine({ schedule: { kind: 'hourly', minute: 15 } }));
    expect(form).toMatchObject({ kind: 'hourly', minute: 15 });
  });

  it('formFromRoutine maps a weekly schedule', () => {
    const form = formFromRoutine(
      makeRoutine({ schedule: { kind: 'weekly', weekday: 3, time: '10:30', timezone: 'UTC' } }),
    );
    expect(form).toMatchObject({ kind: 'weekly', weekday: 3, time: '10:30', timezone: 'UTC' });
  });

  it('formFromRoutine maps a daily/weekdays schedule and a reused project target', () => {
    const form = formFromRoutine(
      makeRoutine({
        schedule: { kind: 'weekdays', time: '08:00', timezone: 'UTC' },
        target: { mode: 'reuse', projectId: 'proj-9' },
      }),
    );
    expect(form).toMatchObject({ kind: 'weekdays', time: '08:00', timezone: 'UTC', mode: 'reuse', projectId: 'proj-9' });
  });

  it('buildSchedule round-trips hourly, weekly, and daily/weekdays forms', () => {
    expect(buildSchedule({ ...emptyForm(), kind: 'hourly', minute: 20 })).toEqual({ kind: 'hourly', minute: 20 });
    expect(buildSchedule({ ...emptyForm(), kind: 'weekly', weekday: 2, time: '11:00', timezone: 'UTC' })).toEqual({
      kind: 'weekly',
      weekday: 2,
      time: '11:00',
      timezone: 'UTC',
    });
    expect(buildSchedule({ ...emptyForm(), kind: 'daily', time: '09:00', timezone: 'UTC' })).toEqual({
      kind: 'daily',
      time: '09:00',
      timezone: 'UTC',
    });
  });

  it('buildRoutineTarget resolves reuse only when a projectId is set, else create_each_run', () => {
    expect(buildRoutineTarget({ ...emptyForm(), mode: 'reuse', projectId: 'proj-1' })).toEqual({
      mode: 'reuse',
      projectId: 'proj-1',
    });
    expect(buildRoutineTarget({ ...emptyForm(), mode: 'reuse', projectId: '' })).toEqual({ mode: 'create_each_run' });
    expect(buildRoutineTarget({ ...emptyForm(), mode: 'create_each_run' })).toEqual({ mode: 'create_each_run' });
  });

  it('filterCapabilities returns everything for an empty query, else a case-insensitive substring match', () => {
    const values = [{ name: 'Alpha' }, { name: 'Beta' }];
    expect(filterCapabilities(values, '', (v) => v.name)).toEqual(values);
    expect(filterCapabilities(values, 'alp', (v) => v.name)).toEqual([{ name: 'Alpha' }]);
    expect(filterCapabilities(values, 'zzz', (v) => v.name)).toEqual([]);
  });

  it('readContextMention finds an active @mention at the cursor and returns null otherwise', () => {
    expect(readContextMention('hello @wor', 10)).toEqual({ start: 6, end: 10, query: 'wor' });
    expect(readContextMention('hello @wor extra', 10)).toEqual({ start: 6, end: 10, query: 'wor' });
    expect(readContextMention('no mention here', 5)).toBeNull();
    expect(readContextMention('@lead', 5)).toEqual({ start: 0, end: 5, query: 'lead' });
  });

  it('clampMinute clamps to [0, 59] and treats non-finite input as 0', () => {
    expect(clampMinute(-5)).toBe(0);
    expect(clampMinute(90)).toBe(59);
    expect(clampMinute(30.6)).toBe(31);
    expect(clampMinute(Number.NaN)).toBe(0);
  });
});

describe('rules: capability selection', () => {
  const skill: SkillSummary = makeSkill({ id: 'skill-1', name: 'Skill One' });
  const plugin: InstalledPluginRecord = {
    id: 'plugin-1',
    title: 'Plugin One',
    version: '1.0.0',
    trust: 'restricted',
    sourceKind: 'local',
    source: '/x',
    capabilitiesGranted: [],
    manifest: { name: 'plugin-1', title: 'Plugin One', version: '1.0.0', description: 'Plugin desc' },
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

  it('buildSelectedContextItems maps every kind, falling back to raw ids when a lookup misses', () => {
    const items = buildSelectedContextItems(
      { skills: [skill], plugins: [plugin], mcpServers: [mcpServer], connectors: [connector] },
      { skillIds: ['skill-1', 'missing-skill'], pluginIds: ['plugin-1'], mcpIds: ['mcp-1'], connectorIds: ['conn-1'] },
      'en',
      t,
    );
    expect(items.map((item) => item.label)).toEqual(['Skill One', 'missing-skill', 'Plugin One', 'MCP One', 'Connector One']);
    expect(items.find((item) => item.kind === 'connectors')?.meta).toContain('acct');
  });

  it('buildSelectedContextItems falls back for unresolved plugin/mcp/connector ids', () => {
    const items = buildSelectedContextItems(
      { skills: [], plugins: [], mcpServers: [], connectors: [] },
      { skillIds: [], pluginIds: ['missing-plugin'], mcpIds: ['missing-mcp'], connectorIds: ['missing-connector'] },
      'en',
      t,
    );
    expect(items).toEqual([
      { kind: 'plugins', id: 'missing-plugin', label: 'missing-plugin', meta: 'missing-plugin', icon: 'sparkles' },
      { kind: 'mcp', id: 'missing-mcp', label: 'missing-mcp', meta: 'chat.designToolbox.kind.mcp', icon: 'link' },
      { kind: 'connectors', id: 'missing-connector', label: 'missing-connector', meta: 'chat.designToolbox.kind.connector', icon: 'link' },
    ]);
  });

  it('buildSelectedContextItems falls back to the connector kind label when accountLabel is absent', () => {
    const items = buildSelectedContextItems(
      { skills: [], plugins: [], mcpServers: [], connectors: [{ ...connector, accountLabel: undefined }] },
      { skillIds: [], pluginIds: [], mcpIds: [], connectorIds: ['conn-1'] },
      'en',
      t,
    );
    expect(items[0]?.meta).toBe('chat.designToolbox.kind.connector');
  });

  it('isContextSelected finds a matching kind+id pair', () => {
    const items = buildSelectedContextItems(
      { skills: [skill], plugins: [], mcpServers: [], connectors: [] },
      { skillIds: ['skill-1'], pluginIds: [], mcpIds: [], connectorIds: [] },
      'en',
      t,
    );
    expect(isContextSelected(items, 'skills', 'skill-1')).toBe(true);
    expect(isContextSelected(items, 'skills', 'other')).toBe(false);
    expect(isContextSelected(items, 'plugins', 'skill-1')).toBe(false);
  });

  it('removeSelectedContextId removes an id from the matching kind bucket only', () => {
    const selected: SelectedContextIds = {
      skillIds: ['a', 'b'],
      pluginIds: ['p'],
      mcpIds: ['m'],
      connectorIds: ['c'],
    };
    expect(removeSelectedContextId(selected, 'skills', 'a').skillIds).toEqual(['b']);
    expect(removeSelectedContextId(selected, 'plugins', 'p').pluginIds).toEqual([]);
    expect(removeSelectedContextId(selected, 'mcp', 'm').mcpIds).toEqual([]);
    expect(removeSelectedContextId(selected, 'connectors', 'c').connectorIds).toEqual([]);
  });

  it('buildRunContextSelection omits empty buckets and includes populated ones', () => {
    expect(buildRunContextSelection({ skillIds: [], pluginIds: [], mcpIds: [], connectorIds: [] })).toEqual({});
    expect(
      buildRunContextSelection({ skillIds: ['s'], pluginIds: ['p'], mcpIds: ['m'], connectorIds: ['c'] }),
    ).toEqual({ skillIds: ['s'], pluginIds: ['p'], mcpServerIds: ['m'], connectorIds: ['c'] });
  });

  it('buildCreateRoutineRequest trims name/prompt and takes the first selected skill id', () => {
    const form = { ...emptyForm(), name: '  My automation  ', prompt: '  Do the thing  ' };
    const body = buildCreateRoutineRequest(form, { skillIds: ['s1', 's2'], pluginIds: [], mcpIds: [], connectorIds: [] });
    expect(body).toMatchObject({ name: 'My automation', prompt: 'Do the thing', skillId: 's1', enabled: true });
  });

  it('buildCreateRoutineRequest sets skillId to null when nothing is selected', () => {
    const body = buildCreateRoutineRequest(emptyForm(), { skillIds: [], pluginIds: [], mcpIds: [], connectorIds: [] });
    expect(body.skillId).toBeNull();
  });

  it('buildUpdateRoutineRequest mirrors the create body minus `enabled`', () => {
    const form = { ...emptyForm(), name: 'Edit me' };
    const selected = { skillIds: [], pluginIds: [], mcpIds: [], connectorIds: [] };
    const body = buildUpdateRoutineRequest(form, selected);
    expect(body).toEqual({
      name: 'Edit me',
      prompt: '',
      schedule: buildSchedule(form),
      target: buildRoutineTarget(form),
      skillId: null,
      context: {},
    });
    expect(body).not.toHaveProperty('enabled');
  });
});

describe('rules: modal state mapping', () => {
  it('buildModalInitial maps edit/create/null modal states', () => {
    const routine = makeRoutine();
    expect(buildModalInitial({ kind: 'edit', routine })).toEqual({ routine });
    const template: AutomationTemplate = {
      id: 't1',
      category: 'memory',
      kind: 'routine',
      icon: 'history',
      title: 'T',
      description: '',
      prompt: '',
    };
    expect(buildModalInitial({ kind: 'create', template })).toEqual({ template });
    expect(buildModalInitial({ kind: 'create' })).toBeNull();
    expect(buildModalInitial(null)).toBeNull();
  });
});
