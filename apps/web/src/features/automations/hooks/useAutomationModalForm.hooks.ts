// Feature-local hook for the create/edit automation modal's form, template
// picker, schedule picker, and "@mention" capability picker state. Its
// transport dependency is INJECTED as the slice port, so it holds no provider
// import and unit-tests against hand-written fake ports.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ConnectorDetail, InstalledPluginRecord, McpServerConfig, Routine } from '@open-design/contracts';

import { useT } from '../../../i18n';
import type { SkillSummary } from '../../../types';
import { inlineMentionToken } from '../../../utils/inlineMentions';
import { localizePluginDescription, localizePluginTitle } from '../../../components/plugins-home/localization';
import type { AutomationDomPort, AutomationSubmitPort } from '../ports';
import { automationDomPort, automationSubmitPort } from '../dependencies';
import {
  buildCreateRoutineRequest,
  buildSchedule,
  buildSelectedContextItems,
  buildUpdateRoutineRequest,
  emptyForm,
  filterCapabilities,
  formFromRoutine,
  readContextMention,
  removeSelectedContextId,
  type SelectedContextIds,
} from '../rules';
import { buildTimezoneOptions, describeRoutineSchedule, describeRoutineScheduleParts } from '../formatters';
import type {
  AutomationFormState,
  AutomationTemplate,
  CapabilityKind,
  CapabilityPickerTab,
  ContextMention,
  RoutineProjectSummary,
  SelectedContextItem,
} from '../types';

const FOCUS_TITLE_DELAY_MS = 30;

const EMPTY_SELECTED: SelectedContextIds = { skillIds: [], pluginIds: [], mcpIds: [], connectorIds: [] };

export interface UseAutomationModalFormOptions {
  open: boolean;
  initial?: { template?: AutomationTemplate; routine?: Routine } | null;
  templates: AutomationTemplate[];
  projects: RoutineProjectSummary[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  locale: string;
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}

export interface AutomationModalFormController {
  editingId: string | null;
  form: AutomationFormState;
  setForm: (updater: (current: AutomationFormState) => AutomationFormState) => void;
  submitting: boolean;
  error: string | null;
  popover: 'template' | 'project' | 'schedule' | null;
  setPopover: (next: 'template' | 'project' | 'schedule' | null) => void;
  mentionTab: CapabilityPickerTab;
  setMentionTab: (tab: CapabilityPickerTab) => void;
  mention: ContextMention | null;
  titleRef: RefObject<HTMLInputElement>;
  promptRef: RefObject<HTMLTextAreaElement>;
  timezones: string[];
  selectedTemplate: AutomationTemplate | null;
  selectedTemplateId: string | null;
  scheduleLabel: string;
  scheduleParts: ReturnType<typeof describeRoutineScheduleParts>;
  projectLabel: string;
  filteredSkills: SkillSummary[];
  filteredPlugins: InstalledPluginRecord[];
  filteredMcp: McpServerConfig[];
  filteredConnectors: ConnectorDetail[];
  showSkills: boolean;
  showPlugins: boolean;
  showMcp: boolean;
  showConnectors: boolean;
  hasMentionResults: boolean;
  selectedContextItems: SelectedContextItem[];
  applyTemplate: (template: AutomationTemplate, options: { closePopover: boolean }) => void;
  updatePrompt: (nextPrompt: string, cursor: number) => void;
  refreshMentionFromPrompt: () => void;
  handlePromptKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  pickSkill: (skill: SkillSummary) => void;
  pickPlugin: (plugin: InstalledPluginRecord) => void;
  pickMcp: (server: McpServerConfig) => void;
  pickConnector: (connector: ConnectorDetail) => void;
  removeSelectedContext: (kind: CapabilityKind, id: string) => void;
  submit: (event: { preventDefault: () => void }) => void;
}

export function useAutomationModalForm(
  port: AutomationSubmitPort,
  domPort: AutomationDomPort,
  options: UseAutomationModalFormOptions,
): AutomationModalFormController {
  const { open, initial, templates, projects, skills, plugins, mcpServers, connectors, locale, onClose, onSaved } =
    options;
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const editingId = initial?.routine?.id ?? null;

  const [form, setFormState] = useState<AutomationFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<'template' | 'project' | 'schedule' | null>(null);
  const [mentionTab, setMentionTab] = useState<CapabilityPickerTab>('all');
  const [mention, setMention] = useState<ContextMention | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedContextIds>(EMPTY_SELECTED);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const setForm = useCallback((updater: (current: AutomationFormState) => AutomationFormState) => {
    setFormState(updater);
  }, []);

  const timezones = useMemo(() => buildTimezoneOptions(), []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const applyTemplate = useCallback((template: AutomationTemplate, applyOptions: { closePopover: boolean }) => {
    setFormState({
      ...emptyForm(),
      name: template.defaultName ?? template.title,
      prompt: template.prompt,
    });
    setSelectedTemplateId(template.id);
    setSelected((current) => ({ ...current, skillIds: template.skillId ? [template.skillId] : [] }));
    if (applyOptions.closePopover) setPopover(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initial?.routine) {
      setFormState(formFromRoutine(initial.routine));
      setSelectedTemplateId(null);
      setSelected({
        skillIds: initial.routine.context?.skillIds ?? (initial.routine.skillId ? [initial.routine.skillId] : []),
        pluginIds: initial.routine.context?.pluginIds ?? [],
        mcpIds: initial.routine.context?.mcpServerIds ?? [],
        connectorIds: initial.routine.context?.connectorIds ?? [],
      });
    } else if (initial?.template) {
      applyTemplate(initial.template, { closePopover: false });
    } else {
      setFormState(emptyForm());
      setSelectedTemplateId(null);
      setSelected(EMPTY_SELECTED);
    }
    setError(null);
    setPopover(null);
    setMentionTab('all');
    setMention(null);
  }, [applyTemplate, initial, open]);

  // Escape priority is mention > popover > close. The bridge callback reads
  // the live `mention`/`popover` state, so the subscription is re-armed
  // whenever either changes.
  useEffect(() => {
    if (!open) return;
    return domPort.subscribeEscapeKey(() => {
      if (mention) {
        setMention(null);
        return;
      }
      if (popover) {
        setPopover(null);
        return;
      }
      onClose();
    });
  }, [domPort, mention, onClose, open, popover]);

  useEffect(() => {
    if (!open) return;
    return domPort.lockBodyScroll();
  }, [domPort, open]);

  useEffect(() => {
    if (!open) return;
    return domPort.scheduleTimeout(() => titleRef.current?.focus(), FOCUS_TITLE_DELAY_MS);
  }, [domPort, open]);

  const updatePrompt = useCallback((nextPrompt: string, cursor: number) => {
    setFormState((current) => ({ ...current, prompt: nextPrompt }));
    setMention(readContextMention(nextPrompt, cursor));
  }, []);

  const refreshMentionFromPrompt = useCallback(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    // A mounted <textarea>'s selectionStart is always a number, never null.
    setMention(readContextMention(textarea.value, textarea.selectionStart!));
  }, []);

  const replaceMentionWithLabel = useCallback((label: string) => {
    const token = `${inlineMentionToken(label)} `;
    const textarea = promptRef.current;
    setFormState((current) => {
      const activeMention = mention;
      const nextPrompt = (() => {
        if (!activeMention) {
          const spacer = current.prompt.trim().length > 0 ? '\n' : '';
          return `${current.prompt}${spacer}${token}`;
        }
        const before = current.prompt.slice(0, activeMention.start);
        const after = current.prompt.slice(activeMention.end).replace(/^\s+/, '');
        return `${before}${token}${after}`;
      })();
      const cursor = activeMention
        ? current.prompt.slice(0, activeMention.start).length + token.length
        : nextPrompt.length;
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
      return { ...current, prompt: nextPrompt };
    });
    setMention(null);
  }, [mention]);

  const pickSkill = useCallback((skill: SkillSummary) => {
    setSelected((current) => (current.skillIds.includes(skill.id) ? current : { ...current, skillIds: [...current.skillIds, skill.id] }));
    replaceMentionWithLabel(skill.name);
  }, [replaceMentionWithLabel]);

  const pickPlugin = useCallback((plugin: InstalledPluginRecord) => {
    const pluginLabel = localizePluginTitle(locale, plugin);
    setSelected((current) => (current.pluginIds.includes(plugin.id) ? current : { ...current, pluginIds: [...current.pluginIds, plugin.id] }));
    replaceMentionWithLabel(pluginLabel);
  }, [locale, replaceMentionWithLabel]);

  const pickMcp = useCallback((server: McpServerConfig) => {
    setSelected((current) => (current.mcpIds.includes(server.id) ? current : { ...current, mcpIds: [...current.mcpIds, server.id] }));
    replaceMentionWithLabel(server.label || server.id);
  }, [replaceMentionWithLabel]);

  const pickConnector = useCallback((connector: ConnectorDetail) => {
    setSelected((current) => (current.connectorIds.includes(connector.id) ? current : { ...current, connectorIds: [...current.connectorIds, connector.id] }));
    replaceMentionWithLabel(connector.name);
  }, [replaceMentionWithLabel]);

  const removeSelectedContext = useCallback((kind: CapabilityKind, id: string) => {
    setSelected((current) => removeSelectedContextId(current, kind, id));
  }, []);

  const handlePromptKeyDown = useCallback((event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Escape' && mention) {
      event.preventDefault();
      setMention(null);
    }
  }, [mention]);

  const submit = useCallback((event: { preventDefault: () => void }) => {
    event.preventDefault();
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
    void (async () => {
      try {
        const isEdit = editingId !== null;
        const routine = isEdit
          ? await port.updateRoutine(editingId, buildUpdateRoutineRequest(form, selected))
          : await port.createRoutine(buildCreateRoutineRequest(form, selected));
        onSaved(routine);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    })();
  }, [editingId, form, onClose, onSaved, port, selected]);

  const projectName = projects.find((p) => p.id === form.projectId)?.name ?? null;
  const routineNextRunAt = initial?.routine?.nextRunAt ?? null;
  const projectLabel = form.mode === 'reuse' && projectName ? projectName : tRef.current('automations.targetCreateEachRun');
  const schedule = useMemo(() => buildSchedule(form), [form]);
  const scheduleLabel = useMemo(() => describeRoutineSchedule(schedule, tRef.current, routineNextRunAt), [routineNextRunAt, schedule]);
  const scheduleParts = useMemo(
    () => describeRoutineScheduleParts(schedule, tRef.current, routineNextRunAt),
    [routineNextRunAt, schedule],
  );

  const mentionQueryNorm = (mention?.query ?? '').trim().toLowerCase();
  const filteredSkills = useMemo(
    () => filterCapabilities(skills, mentionQueryNorm, (skill) => `${skill.name} ${skill.id} ${skill.description}`).slice(0, 10),
    [mentionQueryNorm, skills],
  );
  const filteredPlugins = useMemo(
    () =>
      filterCapabilities(plugins, mentionQueryNorm, (plugin) => {
        const title = localizePluginTitle(locale, plugin);
        const description = localizePluginDescription(locale, plugin);
        return `${title} ${plugin.id} ${description}`;
      }).slice(0, 10),
    [locale, mentionQueryNorm, plugins],
  );
  const filteredMcp = useMemo(
    () =>
      filterCapabilities(
        mcpServers,
        mentionQueryNorm,
        (server) => `${server.label || ''} ${server.id} ${server.url || ''} ${server.command || ''}`,
      ).slice(0, 10),
    [mcpServers, mentionQueryNorm],
  );
  const connectedConnectors = useMemo(() => connectors.filter((connector) => connector.status === 'connected'), [connectors]);
  const filteredConnectors = useMemo(
    () =>
      filterCapabilities(
        connectedConnectors,
        mentionQueryNorm,
        (connector) =>
          `${connector.name} ${connector.id} ${connector.provider} ${connector.category} ${connector.description ?? ''} ${connector.accountLabel ?? ''}`,
      ).slice(0, 10),
    [connectedConnectors, mentionQueryNorm],
  );
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
  const hasMentionResults =
    (showSkills && filteredSkills.length > 0) ||
    (showPlugins && filteredPlugins.length > 0) ||
    (showMcp && filteredMcp.length > 0) ||
    (showConnectors && filteredConnectors.length > 0);

  const selectedContextItems = useMemo(
    () => buildSelectedContextItems({ skills, plugins, mcpServers, connectors }, selected, locale, tRef.current),
    [connectors, locale, mcpServers, plugins, selected, skills],
  );

  return {
    editingId,
    form,
    setForm,
    submitting,
    error,
    popover,
    setPopover,
    mentionTab,
    setMentionTab,
    mention,
    titleRef,
    promptRef,
    timezones,
    selectedTemplate,
    selectedTemplateId,
    scheduleLabel,
    scheduleParts,
    projectLabel,
    filteredSkills,
    filteredPlugins,
    filteredMcp,
    filteredConnectors,
    showSkills,
    showPlugins,
    showMcp,
    showConnectors,
    hasMentionResults,
    selectedContextItems,
    applyTemplate,
    updatePrompt,
    refreshMentionFromPrompt,
    handlePromptKeyDown,
    pickSkill,
    pickPlugin,
    pickMcp,
    pickConnector,
    removeSelectedContext,
    submit,
  };
}

export function useWiredAutomationModalForm(
  options: UseAutomationModalFormOptions,
): AutomationModalFormController {
  return useAutomationModalForm(automationSubmitPort, automationDomPort, options);
}
