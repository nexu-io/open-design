// New / edit automation modal. The persistence layer is /api/routines; the
// user-facing model is a scheduled agent conversation that can start in a new
// project or append a new conversation to an existing project.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type {
  CreateRoutineRequest,
  ConnectorDetail,
  InstalledPluginRecord,
  Routine,
  RoutineProjectTarget,
  RoutineSchedule,
  Weekday,
} from '@open-design/contracts';

import { Icon, type IconName } from './Icon';
import type { SkillSummary } from '../types';
import { listPlugins } from '../state/projects';
import { fetchMcpServers, type McpServerConfig } from '../state/mcp';
import { inlineMentionToken } from '../utils/inlineMentions';

type ProjectSummary = { id: string; name: string };
type ScheduleKind = RoutineSchedule['kind'];
type CapabilityKind = 'skills' | 'plugins' | 'mcp' | 'connectors';
type CapabilityPickerTab = 'all' | CapabilityKind;

type ContextMention = {
  start: number;
  end: number;
  query: string;
};

type SelectedContextItem = {
  kind: CapabilityKind;
  id: string;
  label: string;
  meta: string;
  icon: IconName;
};

const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'hourly', label: 'Hourly' },
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekdays', label: 'Weekdays' },
  { kind: 'weekly', label: 'Weekly' },
];

const WEEKDAY_LABELS: { value: Weekday; short: string; long: string }[] = [
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
];

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];

function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function listSupportedTimezones(): string[] {
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') {
      const list = fn('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list.includes('UTC') ? list : ['UTC', ...list];
      }
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_TIMEZONES;
}

function tzCityLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC';
  const last = timezone.split('/').pop() ?? timezone;
  return last.replace(/_/g, ' ');
}

function formatTime12h(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

/**
 * Shared schedule display parts — single source of truth for both the
 * string formatter (describeScheduleSummary) and the node builder
 * (buildScheduleSummaryNode). Any change to labels, time format, or
 * weekday names only needs to happen here.
 */
type ScheduleParts =
  | { kind: 'hourly'; minute: string }
  | { kind: 'timed'; freq: string; time: string; tz: string };

function decomposeSchedule(schedule: RoutineSchedule): ScheduleParts {
  if (schedule.kind === 'hourly') {
    return { kind: 'hourly', minute: String(schedule.minute).padStart(2, '0') };
  }
  const tz = tzCityLabel(schedule.timezone);
  const time = formatTime12h(schedule.time);
  const freq =
    schedule.kind === 'daily'
      ? 'Daily'
      : schedule.kind === 'weekdays'
        ? 'Weekdays'
        : WEEKDAY_LABELS.find((w) => w.value === schedule.weekday)?.long ?? 'Sunday';
  return { kind: 'timed', freq, time, tz };
}

export function describeScheduleSummary(schedule: RoutineSchedule): string {
  const parts = decomposeSchedule(schedule);
  if (parts.kind === 'hourly') return `Hourly at :${parts.minute}`;
  return `${parts.freq} at ${parts.time} · ${parts.tz}`;
}

/** Renders the schedule summary as structured pill segments for better visual hierarchy. */
function buildScheduleSummaryNode(schedule: RoutineSchedule): ReactNode {
  const parts = decomposeSchedule(schedule);
  if (parts.kind === 'hourly') {
    return (
      <span className="automation-pill__segments">
        <span className="automation-pill__freq">Hourly</span>
        <span className="automation-pill__sep">·</span>
        <span className="automation-pill__time">:{parts.minute}</span>
      </span>
    );
  }
  return (
    <span className="automation-pill__segments">
      <span className="automation-pill__freq">{parts.freq}</span>
      <span className="automation-pill__sep">·</span>
      <span className="automation-pill__time">{parts.time}</span>
      <span className="automation-pill__sep">·</span>
      <span className="automation-pill__tz">{parts.tz}</span>
    </span>
  );
}

type FormState = {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  minute: number;
  time: string;
  weekday: Weekday;
  timezone: string;
  mode: 'create_each_run' | 'reuse';
  projectId: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    prompt: '',
    kind: 'daily',
    minute: 0,
    time: '09:00',
    weekday: 1,
    timezone: detectLocalTimezone(),
    mode: 'create_each_run',
    projectId: '',
  };
}

function formFromRoutine(routine: Routine): FormState {
  const base = emptyForm();
  base.name = routine.name;
  base.prompt = routine.prompt;
  const schedule = routine.schedule;
  if (schedule.kind === 'hourly') {
    base.kind = 'hourly';
    base.minute = schedule.minute;
  } else if (schedule.kind === 'weekly') {
    base.kind = 'weekly';
    base.weekday = schedule.weekday;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  } else {
    base.kind = schedule.kind;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  }
  if (routine.target.mode === 'reuse') {
    base.mode = 'reuse';
    base.projectId = routine.target.projectId;
  }
  return base;
}

function buildSchedule(form: FormState): RoutineSchedule {
  if (form.kind === 'hourly') return { kind: 'hourly', minute: form.minute };
  if (form.kind === 'weekly') {
    return { kind: 'weekly', weekday: form.weekday, time: form.time, timezone: form.timezone };
  }
  return { kind: form.kind, time: form.time, timezone: form.timezone };
}

export type AutomationTemplateKind = 'routine' | 'orbit' | 'live-artifact';

export type AutomationTemplate = {
  id: string;
  category: string;
  kind: AutomationTemplateKind;
  icon: IconName;
  title: string;
  description: string;
  prompt: string;
  defaultName?: string;
  skillId?: string | null;
};

interface Props {
  open: boolean;
  initial?: { template?: AutomationTemplate; routine?: Routine } | null;
  templates: AutomationTemplate[];
  projects: ProjectSummary[];
  skills: SkillSummary[];
  connectors?: ConnectorDetail[];
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}

export function NewAutomationModal({
  open,
  initial,
  templates,
  projects,
  skills,
  connectors = [],
  onClose,
  onSaved,
}: Props) {
  const editingId = initial?.routine?.id ?? null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<'template' | 'project' | 'schedule' | null>(null);
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mentionTab, setMentionTab] = useState<CapabilityPickerTab>('all');
  const [mention, setMention] = useState<ContextMention | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedPluginIds, setSelectedPluginIds] = useState<string[]>([]);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const timezones = useMemo(() => {
    const local = detectLocalTimezone();
    const set = new Set<string>([local, ...listSupportedTimezones()]);
    return Array.from(set);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    void (async () => {
      const [pluginResult, mcpResult] = await Promise.allSettled([
        listPlugins(),
        fetchMcpServers(),
      ]);
      if (canceled) return;
      setPlugins(pluginResult.status === 'fulfilled' ? pluginResult.value : []);
      setMcpServers(
        mcpResult.status === 'fulfilled'
          ? (mcpResult.value?.servers ?? []).filter((server) => server.enabled)
          : [],
      );
    })();
    return () => {
      canceled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initial?.routine) {
      setForm(formFromRoutine(initial.routine));
      setSelectedTemplateId(null);
      setSelectedSkillIds(initial.routine.context?.skillIds ?? (initial.routine.skillId ? [initial.routine.skillId] : []));
      setSelectedPluginIds(initial.routine.context?.pluginIds ?? []);
      setSelectedMcpIds(initial.routine.context?.mcpServerIds ?? []);
      setSelectedConnectorIds(initial.routine.context?.connectorIds ?? []);
    } else if (initial?.template) {
      applyTemplate(initial.template, { closePopover: false });
    } else {
      setForm(emptyForm());
      setSelectedTemplateId(null);
      setSelectedSkillIds([]);
      setSelectedPluginIds([]);
      setSelectedMcpIds([]);
      setSelectedConnectorIds([]);
    }
    setError(null);
    setPopover(null);
    setMentionTab('all');
    setMention(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mention) {
        setMention(null);
        return;
      }
      if (popover) {
        setPopover(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mention, onClose, open, popover]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  function applyTemplate(template: AutomationTemplate, options: { closePopover: boolean }) {
    setForm({
      ...emptyForm(),
      name: template.defaultName ?? template.title,
      prompt: template.prompt,
    });
    setSelectedTemplateId(template.id);
    setSelectedSkillIds(template.skillId ? [template.skillId] : []);
    if (options.closePopover) setPopover(null);
  }

  function updatePrompt(nextPrompt: string, cursor: number) {
    setForm((current) => ({ ...current, prompt: nextPrompt }));
    setMention(readContextMention(nextPrompt, cursor));
  }

  function refreshMentionFromPrompt() {
    const textarea = promptRef.current;
    if (!textarea) return;
    setMention(readContextMention(textarea.value, textarea.selectionStart ?? textarea.value.length));
  }

  function replaceMentionWithLabel(label: string) {
    const token = `${inlineMentionToken(label)} `;
    const textarea = promptRef.current;
    const activeMention = mention;
    const nextPrompt = (() => {
      if (!activeMention) {
        const spacer = form.prompt.trim().length > 0 ? '\n' : '';
        return `${form.prompt}${spacer}${token}`;
      }
      const before = form.prompt.slice(0, activeMention.start);
      const after = form.prompt.slice(activeMention.end).replace(/^\s+/, '');
      return `${before}${token}${after}`;
    })();
    const cursor = activeMention
      ? form.prompt.slice(0, activeMention.start).length + token.length
      : nextPrompt.length;
    setForm((current) => ({ ...current, prompt: nextPrompt }));
    setMention(null);
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function pickSkill(skill: SkillSummary) {
    setSelectedSkillIds((current) => current.includes(skill.id) ? current : [...current, skill.id]);
    replaceMentionWithLabel(skill.name);
  }

  function pickPlugin(plugin: InstalledPluginRecord) {
    setSelectedPluginIds((current) => current.includes(plugin.id) ? current : [...current, plugin.id]);
    replaceMentionWithLabel(plugin.title);
  }

  function pickMcp(server: McpServerConfig) {
    setSelectedMcpIds((current) => current.includes(server.id) ? current : [...current, server.id]);
    replaceMentionWithLabel(server.label || server.id);
  }

  function pickConnector(connector: ConnectorDetail) {
    setSelectedConnectorIds((current) => current.includes(connector.id) ? current : [...current, connector.id]);
    replaceMentionWithLabel(connector.name);
  }

  function removeSelectedContext(kind: CapabilityKind, id: string) {
    if (kind === 'skills') setSelectedSkillIds((current) => current.filter((item) => item !== id));
    if (kind === 'plugins') setSelectedPluginIds((current) => current.filter((item) => item !== id));
    if (kind === 'mcp') setSelectedMcpIds((current) => current.filter((item) => item !== id));
    if (kind === 'connectors') setSelectedConnectorIds((current) => current.filter((item) => item !== id));
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && mention) {
      event.preventDefault();
      setMention(null);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Add a title for this automation.');
      titleRef.current?.focus();
      return;
    }
    if (!form.prompt.trim()) {
      setError('Add a prompt for the scheduled conversation.');
      return;
    }
    setSubmitting(true);
    try {
      const target: RoutineProjectTarget =
        form.mode === 'reuse' && form.projectId
          ? { mode: 'reuse', projectId: form.projectId }
          : { mode: 'create_each_run' };
      const body: CreateRoutineRequest = {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        schedule: buildSchedule(form),
        target,
        skillId: selectedSkillIds[0] ?? null,
        context: {
          ...(selectedSkillIds.length > 0 ? { skillIds: selectedSkillIds } : {}),
          ...(selectedPluginIds.length > 0 ? { pluginIds: selectedPluginIds } : {}),
          ...(selectedMcpIds.length > 0 ? { mcpServerIds: selectedMcpIds } : {}),
          ...(selectedConnectorIds.length > 0 ? { connectorIds: selectedConnectorIds } : {}),
        },
        enabled: true,
      };
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/routines/${editingId}` : '/api/routines';
      const payload = isEdit
        ? {
          name: body.name,
          prompt: body.prompt,
          schedule: body.schedule,
          target: body.target,
          skillId: body.skillId,
          context: body.context,
        }
        : body;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${isEdit ? 'update' : 'create'} failed: ${res.status}`);
      }
      const json = await res.json();
      onSaved(json.routine);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const projectName = projects.find((p) => p.id === form.projectId)?.name ?? null;
  const projectLabel =
    form.mode === 'reuse' && projectName ? projectName : 'New project each run';
  const scheduleLabel = describeScheduleSummary(buildSchedule(form));
  const scheduleLabelNode = buildScheduleSummaryNode(buildSchedule(form));
  const mentionQueryNorm = (mention?.query ?? '').trim().toLowerCase();
  const filteredSkills = filterCapabilities(
    skills,
    mentionQueryNorm,
    (skill) => `${skill.name} ${skill.id} ${skill.description}`,
  ).slice(0, 10);
  const filteredPlugins = filterCapabilities(
    plugins,
    mentionQueryNorm,
    (plugin) => `${plugin.title} ${plugin.id} ${plugin.manifest?.description ?? ''}`,
  ).slice(0, 10);
  const filteredMcp = filterCapabilities(
    mcpServers,
    mentionQueryNorm,
    (server) => `${server.label || ''} ${server.id} ${server.url || ''} ${server.command || ''}`,
  ).slice(0, 10);
  const connectedConnectors = connectors.filter((connector) => connector.status === 'connected');
  const filteredConnectors = filterCapabilities(
    connectedConnectors,
    mentionQueryNorm,
    (connector) => `${connector.name} ${connector.id} ${connector.provider} ${connector.category} ${connector.description ?? ''} ${connector.accountLabel ?? ''}`,
  ).slice(0, 10);
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
  const hasMentionResults =
    (showSkills && filteredSkills.length > 0) ||
    (showPlugins && filteredPlugins.length > 0) ||
    (showMcp && filteredMcp.length > 0) ||
    (showConnectors && filteredConnectors.length > 0);
  const selectedContextItems: SelectedContextItem[] = [
    ...selectedSkillIds.map((id) => {
      const skill = skills.find((item) => item.id === id);
      return {
        kind: 'skills' as const,
        id,
        label: skill?.name ?? id,
        meta: 'Skill',
        icon: 'file' as IconName,
      };
    }),
    ...selectedPluginIds.map((id) => {
      const plugin = plugins.find((item) => item.id === id);
      return {
        kind: 'plugins' as const,
        id,
        label: plugin?.title ?? id,
        meta: 'Plugin',
        icon: 'sparkles' as IconName,
      };
    }),
    ...selectedMcpIds.map((id) => {
      const server = mcpServers.find((item) => item.id === id);
      return {
        kind: 'mcp' as const,
        id,
        label: server?.label || id,
        meta: 'MCP',
        icon: 'link' as IconName,
      };
    }),
    ...selectedConnectorIds.map((id) => {
      const connector = connectors.find((item) => item.id === id);
      return {
        kind: 'connectors' as const,
        id,
        label: connector?.name ?? id,
        meta: connector?.accountLabel ? `Connector · ${connector.accountLabel}` : 'Connector',
        icon: 'link' as IconName,
      };
    }),
  ];

  return (
    <div
      className="automation-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={editingId ? 'Edit automation' : 'New automation'}
      data-testid="automation-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseDown={() => setPopover(null)}
    >
      <form
        className="automation-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="automation-modal__head">
          <input
            ref={titleRef}
            type="text"
            className="automation-modal__title-input"
            placeholder="Automation title"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Automation title"
            data-testid="automation-modal-title"
          />
          <div className="automation-modal__head-actions">
            <div className="automation-pill__wrap">
              <button
                type="button"
                className={`automation-template-trigger${popover === 'template' ? ' is-active' : ''}`}
                onClick={() => setPopover((p) => (p === 'template' ? null : 'template'))}
              >
                <Icon name="sparkles" size={13} />
                <span>{selectedTemplate?.defaultName ?? selectedTemplate?.title ?? 'Use template'}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {popover === 'template' ? (
                <TemplatePopover
                  templates={templates}
                  selectedId={selectedTemplateId}
                  onSelect={(template) => applyTemplate(template, { closePopover: true })}
                />
              ) : null}
            </div>
            <button
              type="button"
              className="automation-modal__close"
              onClick={onClose}
              aria-label="Close (Esc)"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="automation-modal__body">
          <div className={`automation-modal__prompt-wrap${mention ? ' is-mentioning' : ''}`}>
            <textarea
              ref={promptRef}
              className="automation-modal__prompt"
              placeholder="Ask the agent what to run on this schedule, or @mention context..."
              value={form.prompt}
              onChange={(e) => updatePrompt(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onClick={refreshMentionFromPrompt}
              onFocus={() => setPopover(null)}
              onKeyDown={handlePromptKeyDown}
              onKeyUp={refreshMentionFromPrompt}
              rows={8}
              aria-controls={mention ? 'automation-context-picker' : undefined}
              aria-expanded={Boolean(mention)}
              data-testid="automation-modal-prompt"
            />
          </div>

          {mention ? (
            <div
              id="automation-context-picker"
              className="automation-mention-popover"
              role="listbox"
              aria-label="Automation context results"
              data-testid="automation-mention-popover"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="automation-mention-tabs" role="tablist" aria-label="Context type">
                {[
                  ['all', 'All'],
                  ['skills', 'Skills'],
                  ['plugins', 'Plugins'],
                  ['mcp', 'MCP'],
                  ['connectors', 'Connectors'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={mentionTab === id}
                    className={`automation-mention-tab${mentionTab === id ? ' is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setMentionTab(id as CapabilityPickerTab);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="automation-mention-results">
                {!hasMentionResults ? (
                  <div className="automation-mention-empty">
                    {mention.query ? `No results for "${mention.query}".` : 'Search skills, plugins, MCP servers, and connectors.'}
                  </div>
                ) : null}
                {showSkills && filteredSkills.length > 0 ? (
                  <MentionSection label="Skills">
                    {filteredSkills.map((skill) => (
                      <MentionItem
                        key={`skill-${skill.id}`}
                        icon="file"
                        label={skill.name}
                        meta={skill.description || skill.mode}
                        selected={selectedSkillIds.includes(skill.id)}
                        onPick={() => pickSkill(skill)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {showPlugins && filteredPlugins.length > 0 ? (
                  <MentionSection label="Plugins">
                    {filteredPlugins.map((plugin) => (
                      <MentionItem
                        key={`plugin-${plugin.id}`}
                        icon="sparkles"
                        label={plugin.title}
                        meta={plugin.manifest?.description ?? plugin.id}
                        selected={selectedPluginIds.includes(plugin.id)}
                        onPick={() => pickPlugin(plugin)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {showMcp && filteredMcp.length > 0 ? (
                  <MentionSection label="MCP">
                    {filteredMcp.map((server) => (
                      <MentionItem
                        key={`mcp-${server.id}`}
                        icon="link"
                        label={server.label || server.id}
                        meta={server.url || server.command || server.transport}
                        selected={selectedMcpIds.includes(server.id)}
                        onPick={() => pickMcp(server)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {showConnectors && filteredConnectors.length > 0 ? (
                  <MentionSection label="Connectors">
                    {filteredConnectors.map((connector) => (
                      <MentionItem
                        key={`connector-${connector.id}`}
                        icon="link"
                        label={connector.name}
                        meta={connector.accountLabel ?? connector.provider ?? connector.id}
                        selected={selectedConnectorIds.includes(connector.id)}
                        onPick={() => pickConnector(connector)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedContextItems.length > 0 ? (
            <div className="automation-selected-context" aria-label="Selected automation context">
              {selectedContextItems.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className={`automation-selected-context__chip is-${item.kind}`}
                  onClick={() => removeSelectedContext(item.kind, item.id)}
                  title={`Remove ${item.label}`}
                >
                  <Icon name={item.icon} size={11} />
                  <span>{item.label}</span>
                  <Icon name="close" size={10} />
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="automation-modal__error" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="automation-modal__foot">
          <div className="automation-modal__pills">
            <PillButton
              icon="folder"
              active={popover === 'project'}
              label={projectLabel}
              onClick={() => setPopover((p) => (p === 'project' ? null : 'project'))}
            >
              {popover === 'project' ? (
                <PopoverMenu>
                  <PopoverItem
                    selected={form.mode === 'create_each_run'}
                    onClick={() => {
                      setForm({ ...form, mode: 'create_each_run', projectId: '' });
                      setPopover(null);
                    }}
                    label="New project each run"
                    hint="Each run starts a fresh project and conversation."
                  />
                  {projects.length > 0 ? (
                    <>
                      <div className="automation-popover__section-label">Existing projects</div>
                      {projects.map((p) => (
                        <PopoverItem
                          key={p.id}
                          selected={form.mode === 'reuse' && form.projectId === p.id}
                          onClick={() => {
                            setForm({ ...form, mode: 'reuse', projectId: p.id });
                            setPopover(null);
                          }}
                          label={p.name}
                        />
                      ))}
                    </>
                  ) : null}
                </PopoverMenu>
              ) : null}
            </PillButton>

            <PillButton
              icon="history"
              active={popover === 'schedule'}
              label={scheduleLabelNode}
              aria-label={scheduleLabel}
              onClick={() =>
                setPopover((p) => (p === 'schedule' ? null : 'schedule'))
              }
            >
              {popover === 'schedule' ? (
                <SchedulePopover
                  form={form}
                  setForm={setForm}
                  timezones={timezones}
                  onDone={() => setPopover(null)}
                />
              ) : null}
            </PillButton>
          </div>

          <div className="automation-modal__actions">
            <button
              type="button"
              className="automation-modal__cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="automation-modal__submit"
              disabled={submitting}
            >
              {editingId
                ? submitting
                  ? 'Saving...'
                  : 'Save'
                : submitting
                  ? 'Creating...'
                  : 'Create'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function filterCapabilities<T>(
  values: T[],
  query: string,
  index: (value: T) => string,
): T[] {
  if (!query) return values;
  return values.filter((value) => index(value).toLowerCase().includes(query));
}

function readContextMention(value: string, cursor: number): ContextMention | null {
  const beforeCursor = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);
  if (!match) return null;
  const prefix = match[1] ?? '';
  return {
    start: match.index + prefix.length,
    end: cursor,
    query: match[2] ?? '',
  };
}

function TemplatePopover({
  templates,
  selectedId,
  onSelect,
}: {
  templates: AutomationTemplate[];
  selectedId: string | null;
  onSelect: (template: AutomationTemplate) => void;
}) {
  return (
    <div className="automation-popover automation-popover--templates">
      {templates.map((template) => (
        <button
          type="button"
          key={template.id}
          className={`automation-template-option${selectedId === template.id ? ' is-selected' : ''}`}
          onClick={() => onSelect(template)}
        >
          <span className={`automation-template-option__icon is-${template.kind}`}>
            <Icon name={template.icon} size={14} />
          </span>
          <span className="automation-template-option__body">
            <span className="automation-template-option__title">{template.defaultName ?? template.title}</span>
            <span className="automation-template-option__meta">{kindLabel(template.kind)}</span>
          </span>
          {selectedId === template.id ? <Icon name="check" size={13} /> : null}
        </button>
      ))}
    </div>
  );
}

function MentionSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="automation-mention-section">
      <div className="automation-mention-section__label">{label}</div>
      <div className="automation-mention-section__items">{children}</div>
    </div>
  );
}

function MentionItem({
  icon,
  label,
  meta,
  selected,
  onPick,
}: {
  icon: IconName;
  label: string;
  meta: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`automation-mention-item${selected ? ' is-selected' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      <span className="automation-mention-item__icon">
        {selected ? <Icon name="check" size={11} /> : <Icon name={icon} size={11} />}
      </span>
      <span className="automation-mention-item__body">
        <span className="automation-mention-item__title">{label}</span>
        <span className="automation-mention-item__meta">{meta}</span>
      </span>
    </button>
  );
}

function PillButton({
  icon,
  label,
  active,
  'aria-label': ariaLabel,
  onClick,
  children,
}: {
  icon: 'folder' | 'history';
  label: ReactNode;
  active?: boolean;
  'aria-label'?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="automation-pill__wrap">
      <button
        type="button"
        className={`automation-pill${active ? ' is-active' : ''}`}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        <Icon name={icon} size={12} />
        <span>{label}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      {children}
    </div>
  );
}

function PopoverMenu({ children }: { children: ReactNode }) {
  return <div className="automation-popover">{children}</div>;
}

function PopoverItem({
  selected,
  label,
  hint,
  onClick,
}: {
  selected?: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`automation-popover__item${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <span className="automation-popover__check">
        {selected ? <Icon name="check" size={12} /> : null}
      </span>
      <span className="automation-popover__body">
        <span className="automation-popover__label">{label}</span>
        {hint ? <span className="automation-popover__hint">{hint}</span> : null}
      </span>
    </button>
  );
}

function SchedulePopover({
  form,
  setForm,
  timezones,
  onDone,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  timezones: string[];
  onDone: () => void;
}) {
  return (
    <div className="automation-popover automation-popover--schedule">
      <div className="automation-popover__kinds" role="tablist">
        {SCHEDULE_KINDS.map((k) => (
          <button
            type="button"
            key={k.kind}
            role="tab"
            aria-selected={form.kind === k.kind}
            className={`automation-popover__kind${form.kind === k.kind ? ' is-active' : ''}`}
            onClick={() => setForm({ ...form, kind: k.kind })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {form.kind === 'hourly' ? (
        <label className="automation-popover__field">
          <span>Minute of every hour</span>
          <input
            type="number"
            min={0}
            max={59}
            step={1}
            value={form.minute}
            onChange={(e) =>
              setForm({
                ...form,
                minute: clampMinute(Number(e.target.value)),
              })
            }
          />
        </label>
      ) : (
        <>
          {form.kind === 'weekly' ? (
            <div className="automation-popover__weekdays" aria-label="Weekday">
              {WEEKDAY_LABELS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`automation-popover__weekday${form.weekday === d.value ? ' is-active' : ''}`}
                  onClick={() => setForm({ ...form, weekday: d.value })}
                  title={d.long}
                >
                  {d.short}
                </button>
              ))}
            </div>
          ) : null}
          <div className="automation-popover__row">
            <label className="automation-popover__field">
              <span>Time</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
            <label className="automation-popover__field">
              <span>Timezone</span>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tzCityLabel(tz)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      <div className="automation-popover__done">
        <button
          type="button"
          className="automation-popover__done-btn"
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(59, Math.round(value)));
}

function kindLabel(kind: AutomationTemplateKind): string {
  if (kind === 'orbit') return 'Orbit';
  if (kind === 'live-artifact') return 'Live artifact';
  return 'Automation';
}
