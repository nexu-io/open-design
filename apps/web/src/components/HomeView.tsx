// Composed Home view — the top-down layout the entry view renders
// when the left nav rail's "Home" tab is active.
//
// Owns the prompt state + active plugin lifecycle and stitches
// together the smaller pieces (HomeHero, RecentProjectsStrip,
// PluginsHomeSection). Replaces the older left-side `PluginLoopHome`
// surface by lifting its plugin orchestration up here so the prompt
// textarea can live centered in the hero.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApplyResult,
  InputFieldSpec,
  McpServerConfig,
  InstalledPluginRecord,
  ProjectKind,
} from '@open-design/contracts';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import {
  applyPlugin,
  listPlugins,
  renderPluginBriefTemplate,
  resolvePluginQueryFallback,
} from '../state/projects';
import { fetchMcpServers } from '../state/mcp';
import { useI18n } from '../i18n';
import type { Project, SkillSummary } from '../types';
import { inlineMentionToken } from '../utils/inlineMentions';
import { HomeHero } from './HomeHero';
import { findChip, type HomeHeroChip } from './home-hero/chips';
import {
  buildPluginAuthoringInputs,
  buildPluginAuthoringPromptForInputs,
  PLUGIN_AUTHORING_PROMPT,
  PLUGIN_AUTHORING_PROMPT_TEMPLATE,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import type { PluginLoopSubmit } from './PluginLoopHome';
import type { PluginUseAction } from './plugins-home/useActions';
import { RecentProjectsStrip } from './RecentProjectsStrip';

interface ActivePlugin {
  record: InstalledPluginRecord;
  // `result` is `null` during the optimistic window — set on chip
  // click before applyPlugin's roundtrip finishes — and is filled in
  // once the daemon returns the snapshot + resolved context. submit()
  // and contextItemCount both null-coalesce, so an in-flight active
  // is safe to render without a result.
  result: ApplyResult | null;
  inputs: Record<string, unknown>;
  inputFields: InputFieldSpec[];
  inputsValid: boolean;
  queryTemplate: string | null;
  lastRenderedPrompt: string | null;
  // Stage B of plugin-driven-flow-plan: when the user applied this
  // plugin through the Home chip rail, the chip carries the project
  // kind we should stamp on the resulting create payload. `null` =
  // applied through the search picker / PluginsHomeSection, where the
  // kind defaults to the historical 'prototype' value.
  projectKind: ProjectKind | null;
  chipId: string | null;
}

interface SelectedPluginContext {
  record: InstalledPluginRecord;
}

interface PendingReplacement {
  title: string;
  confirm: () => void;
}

interface PendingPluginUseHandoff {
  pluginId: string;
  action: PluginUseAction;
  inputs?: Record<string, unknown>;
}

const AUTHORING_DEFAULT_SCENARIO_INPUTS = {
  artifactKind: 'Open Design plugin',
  audience: 'Open Design plugin authors',
  topic: 'packaging a reusable workflow as an Open Design plugin',
};

interface Props {
  projects: Project[];
  projectsLoading?: boolean;
  onSubmit: (payload: PluginLoopSubmit) => void;
  onOpenProject: (id: string) => void;
  onViewAllProjects: () => void;
  onBrowseRegistry?: () => void;
  // Stage B: optional callbacks the rail's migration chips need.
  // HomeView itself never imports them; EntryShell threads them
  // through so the dispatcher can stay declarative.
  onImportFolder?: () => Promise<void> | void;
  onOpenNewProject?: (tab: 'template') => void;
  promptHandoff?: HomePromptHandoff | null;
  skills?: SkillSummary[];
  skillsLoading?: boolean;
}

export function HomeView({
  projects,
  projectsLoading,
  onSubmit,
  onOpenProject,
  onViewAllProjects,
  onBrowseRegistry,
  onImportFolder,
  onOpenNewProject,
  promptHandoff,
  skills = [],
  skillsLoading = false,
}: Props) {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingChipId, setPendingChipId] = useState<string | null>(null);
  const [pendingAuthoringChipId, setPendingAuthoringChipId] = useState<string | null>(null);
  const [pendingAuthoringPrompt, setPendingAuthoringPrompt] = useState(PLUGIN_AUTHORING_PROMPT);
  const [pendingAuthoringInputs, setPendingAuthoringInputs] = useState<Record<string, unknown>>(
    () => buildPluginAuthoringInputs(undefined),
  );
  const [pendingPluginUseHandoff, setPendingPluginUseHandoff] =
    useState<PendingPluginUseHandoff | null>(null);
  const [fallbackProjectKind, setFallbackProjectKind] = useState<ProjectKind | null>(null);
  const [active, setActive] = useState<ActivePlugin | null>(null);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  const [selectedPluginContexts, setSelectedPluginContexts] = useState<SelectedPluginContext[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const consumedHandoffIdRef = useRef<number | null>(null);
  const pendingPromptFocusEndRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setPlugins(rows);
        setPluginsLoading(false);
      });
    };
    load();
    window.addEventListener('open-design:plugins-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('open-design:plugins-changed', load);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMcpServers().then((result) => {
      if (cancelled) return;
      setMcpServers(result?.servers ?? []);
      setMcpLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingPromptFocusEndRef.current) return;
    pendingPromptFocusEndRef.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const position = input.value.length;
    input.setSelectionRange(position, position);
    input.scrollTop = input.scrollHeight;
  }, [prompt]);

  useEffect(() => {
    if (!promptHandoff || consumedHandoffIdRef.current === promptHandoff.id) return;
    consumedHandoffIdRef.current = promptHandoff.id;
    setError(null);
    if (promptHandoff.source === 'plugin-use') {
      setPendingPluginUseHandoff({
        pluginId: promptHandoff.pluginId,
        action: promptHandoff.action ?? 'use',
        ...(promptHandoff.inputs ? { inputs: promptHandoff.inputs } : {}),
      });
      if (promptHandoff.focus) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }

    setActive(null);
    setActiveSkill(null);
    setSelectedPluginContexts([]);
    setFallbackProjectKind('other');
    setPrompt(promptHandoff.prompt);
    setPendingAuthoringPrompt(promptHandoff.prompt);
    setPendingAuthoringInputs(promptHandoff.inputs);
    if (promptHandoff.focus) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setPendingAuthoringChipId('create-plugin');
  }, [promptHandoff]);

  const contextItemCount = useMemo(
    () =>
      (active?.result?.contextItems?.length ?? 0) +
      selectedPluginContexts.length +
      stagedFiles.length,
    [active, selectedPluginContexts, stagedFiles.length],
  );

  // When the active plugin was bound through a chip, the badge shows
  // the chip label (e.g. "Prototype") instead of the underlying plugin
  // record title (e.g. "New generation (default scenario)"). Several
  // chips share od-new-generation, so surfacing the raw plugin title
  // would mislabel what the user actually picked.
  const activeBadgeTitle = useMemo(() => {
    if (!active) return null;
    if (active.chipId) {
      const chip = findChip(active.chipId);
      if (chip) return chip.label;
    }
    return active.record.title;
  }, [active]);

  const selectableSkills = useMemo(
    () => skills.filter((skill) => !skill.aggregatesExamples),
    [skills],
  );

  const enabledMcpServers = useMemo(
    () => mcpServers.filter((server) => server.enabled),
    [mcpServers],
  );

  async function usePlugin(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: {
      projectKind?: ProjectKind;
      chipId?: string;
      inputs?: Record<string, unknown>;
      queryTemplate?: string | null;
    },
  ) {
    const inputFields = record.manifest?.od?.inputs ?? [];
    const optimisticInputs = hydratePluginInputs(inputFields, options?.inputs);
    const inputsValid = pluginInputsAreValid(inputFields, optimisticInputs);
    const queryTemplate =
      options?.queryTemplate !== undefined
        ? options.queryTemplate
        : nextPrompt !== undefined && nextPrompt !== null
        ? null
        : resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale) || null;
    const optimisticPrompt =
      nextPrompt !== undefined && nextPrompt !== null
        ? nextPrompt
        : queryTemplate
          ? renderPluginBriefTemplate(queryTemplate, optimisticInputs)
          : null;
    if (options?.chipId) setPendingChipId(options.chipId);
    setError(null);
    // Optimistic update: the chip already carries the inputs and the
    // plugin record's manifest already carries the query template, so
    // we can render the brief locally without waiting for the apply
    // roundtrip. The active badge + prompt appear on the same frame as
    // the click; applyPlugin then resolves the snapshot id and context
    // items in the background and we reconcile in place. Without this
    // the user sees a ~100-500ms freeze before the input back-fills,
    // which feels like the UI is jammed.
    setActive({
      record,
      result: null,
      inputs: optimisticInputs,
      inputFields,
      inputsValid,
      queryTemplate,
      lastRenderedPrompt: optimisticPrompt,
      projectKind: options?.projectKind ?? null,
      chipId: options?.chipId ?? null,
    });
    setFallbackProjectKind(null);
    setDetailsRecord(null);
    if (optimisticPrompt !== null) setPrompt(optimisticPrompt);
    requestAnimationFrame(() => inputRef.current?.focus());

    if (!inputsValid) {
      setPendingChipId(null);
      return;
    }

    const result = await resolveActivePlugin(record, optimisticInputs);
    if (!result) {
      // Roll back the optimistic active so submit can't fire against a
      // plugin that never bound. Only clear when the in-flight apply
      // still matches the visible active state — concurrent clicks
      // would otherwise stomp a successful later apply.
      setActive((prev) => (prev?.record.id === record.id ? { ...prev, inputsValid: false } : prev));
      setError(`Failed to apply ${record.title}. Make sure the daemon is reachable.`);
      return;
    }
    const reconciledInputs: Record<string, unknown> = { ...optimisticInputs };
    for (const field of result.inputs ?? []) {
      if (field.default !== undefined && reconciledInputs[field.name] === undefined) {
        reconciledInputs[field.name] = field.default;
      }
    }
    setActive((prev) =>
      prev && prev.record.id === record.id
        ? {
            ...prev,
            result,
            inputs: reconciledInputs,
            inputFields: result.inputs ?? inputFields,
            inputsValid: pluginInputsAreValid(result.inputs ?? inputFields, reconciledInputs),
          }
        : prev,
    );
    // The daemon may have filled in `topic`/`audience` defaults the
    // optimistic render didn't know about (the manifest is inspected
    // client-side but field.default lives on the apply result). Re-
    // render the brief using the reconciled inputs, but only if the
    // user hasn't edited the prompt in the meantime — if they have,
    // current !== optimisticPrompt and the functional setter is a
    // no-op so their edits survive.
    if (nextPrompt === undefined || nextPrompt === null) {
      const reconciledQuery =
        result.query ||
        resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
      if (reconciledQuery) {
        const reconciledPrompt = renderPluginBriefTemplate(reconciledQuery, reconciledInputs);
        if (reconciledPrompt !== optimisticPrompt) {
          setPrompt((current) => (current === optimisticPrompt ? reconciledPrompt : current));
          setActive((prev) =>
            prev && prev.record.id === record.id
              ? { ...prev, lastRenderedPrompt: reconciledPrompt }
              : prev,
          );
        }
      }
    }
  }

  async function resolveActivePlugin(
    record: InstalledPluginRecord,
    inputs: Record<string, unknown>,
  ): Promise<ApplyResult | null> {
    setPendingApplyId(record.id);
    const result = await applyPlugin(record.id, { locale, inputs });
    setPendingApplyId(null);
    setPendingChipId(null);
    return result;
  }

  function requestActivePlugin(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: {
      projectKind?: ProjectKind;
      chipId?: string;
      inputs?: Record<string, unknown>;
      queryTemplate?: string | null;
    },
  ) {
    const replacement = previewPluginReplacement(record, nextPrompt, options?.inputs);
    runWithReplacementConfirmation(record.title, replacement, () => {
      void usePlugin(record, nextPrompt, options);
    });
  }

  function requestPluginContextUse(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
    inputs?: Record<string, unknown>,
  ) {
    let shouldFocusOnly = true;
    setSelectedPluginContexts((prev) => {
      if (prev.some((item) => item.record.id === record.id)) return prev;
      return [...prev, { record }];
    });
    if (action === 'use-with-query') {
      const queryPrompt = renderPluginContextPrompt(record, inputs);
      if (queryPrompt) {
        shouldFocusOnly = false;
        pendingPromptFocusEndRef.current = true;
        setPrompt((current) => appendPromptQuery(current, queryPrompt));
      }
    }
    setError(null);
    setDetailsRecord(null);
    if (shouldFocusOnly) requestAnimationFrame(() => inputRef.current?.focus());
  }

  function runWithReplacementConfirmation(
    title: string,
    replacementPrompt: string | null,
    confirm: () => void,
  ) {
    if (
      replacementPrompt !== null &&
      prompt.trim().length > 0 &&
      prompt.trim() !== replacementPrompt.trim()
    ) {
      setPendingReplacement({ title, confirm });
      return;
    }
    confirm();
  }

  function previewPluginReplacement(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    inputs?: Record<string, unknown>,
  ): string | null {
    if (nextPrompt !== undefined && nextPrompt !== null) return nextPrompt;
    const query = resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
    if (!query) return null;
    return renderPluginBriefTemplate(query, hydratePluginInputs(record.manifest?.od?.inputs ?? [], inputs));
  }

  function renderPluginContextPrompt(
    record: InstalledPluginRecord,
    inputs?: Record<string, unknown>,
  ): string | null {
    const query = resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
    if (!query) return null;
    return renderPluginBriefTemplate(
      query,
      hydratePluginInputs(record.manifest?.od?.inputs ?? [], inputs),
    );
  }

  useEffect(() => {
    if (!pendingPluginUseHandoff || pluginsLoading) return;
    const record = plugins.find((plugin) => plugin.id === pendingPluginUseHandoff.pluginId);
    setPendingPluginUseHandoff(null);
    if (!record) {
      setError(
        `Plugin "${pendingPluginUseHandoff.pluginId}" is not installed. Refresh Plugins and try again.`,
      );
      return;
    }
    requestPluginContextUse(
      record,
      pendingPluginUseHandoff.action,
      pendingPluginUseHandoff.inputs,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPluginUseHandoff, pluginsLoading, plugins]);

  function addPluginContext(record: InstalledPluginRecord, nextPrompt: string | null) {
    setSelectedPluginContexts((prev) => {
      if (prev.some((item) => item.record.id === record.id)) return prev;
      return [...prev, { record }];
    });
    if (nextPrompt !== null) setPrompt(nextPrompt);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function removePluginContext(pluginId: string) {
    const record = selectedPluginContexts.find((item) => item.record.id === pluginId)?.record ?? null;
    setSelectedPluginContexts((prev) => prev.filter((item) => item.record.id !== pluginId));
    if (record) {
      setPrompt((current) => removePluginMentionFromPrompt(current, record));
    }
  }

  function handlePromptChange(nextPrompt: string) {
    setPrompt(nextPrompt);
    if (!active?.queryTemplate) return;
    const extracted = extractPluginInputsFromPrompt(
      active.queryTemplate,
      nextPrompt,
      active.inputFields,
    );
    if (!extracted) return;
    const nextInputs = { ...active.inputs, ...extracted };
    const inputsValid = pluginInputsAreValid(active.inputFields, nextInputs);
    const inputsChanged = !inputsEqual(active.inputs, nextInputs);
    setActive({
      ...active,
      inputs: nextInputs,
      inputsValid,
      result:
        inputsChanged && !inputsEqual(active.result?.appliedPlugin?.inputs, nextInputs)
          ? null
          : active.result,
      lastRenderedPrompt: nextPrompt,
    });
  }

  function stageFiles(files: File[]) {
    if (files.length === 0) return;
    setStagedFiles((current) => [...current, ...files]);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function removeStagedFile(index: number) {
    setStagedFiles((current) => current.filter((_, i) => i !== index));
  }

  function updateActiveInputs(next: Record<string, unknown>) {
    if (!active) return;
    const inputsValid = pluginInputsAreValid(active.inputFields, next);
    const nextRendered =
      active.queryTemplate !== null
        ? renderPluginBriefTemplate(active.queryTemplate, next)
        : active.lastRenderedPrompt;
    if (
      active.queryTemplate !== null &&
      nextRendered !== null &&
      (prompt === active.lastRenderedPrompt || prompt.trim().length === 0)
    ) {
      setPrompt(nextRendered);
    }
    setActive({
      ...active,
      inputs: next,
      inputsValid,
      result: inputsEqual(active.result?.appliedPlugin?.inputs, next) ? active.result : null,
      lastRenderedPrompt: nextRendered,
    });
  }

  function clearActivePlugin() {
    setActive(null);
    setFallbackProjectKind(null);
    setPrompt('');
  }

  function useSkill(skill: SkillSummary, nextPrompt: string | null) {
    setActiveSkill(skill);
    setError(null);
    const replacement = nextPrompt ?? skill.examplePrompt ?? '';
    if (replacement.trim().length > 0) setPrompt(replacement);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function useMcpServer(_server: McpServerConfig, nextPrompt: string) {
    setPrompt(nextPrompt);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function queuePluginAuthoring(chipId: string | null, goal?: string) {
    const nextInputs = buildPluginAuthoringInputs(goal);
    const nextPrompt = buildPluginAuthoringPromptForInputs(nextInputs);
    runWithReplacementConfirmation('Plugin authoring', nextPrompt, () => {
      setActive(null);
      setActiveSkill(null);
      setFallbackProjectKind('other');
      setError(null);
      setPrompt(nextPrompt);
      setPendingAuthoringPrompt(nextPrompt);
      setPendingAuthoringInputs(nextInputs);
      setPendingAuthoringChipId(chipId ?? 'create-plugin');
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }

  useEffect(() => {
    if (!pendingAuthoringChipId || pluginsLoading) return;
    const authoringRecord = plugins.find((plugin) => plugin.id === 'od-plugin-authoring');
    const record = authoringRecord ?? plugins.find((plugin) => plugin.id === 'od-new-generation');
    setPendingAuthoringChipId(null);
    if (!record) {
      // The authoring scenario can be absent in a long-running dev
      // daemon that started before the bundled plugin was added. If
      // even the default scenario is missing, do not block the user:
      // keep the prompt in place and submit as a naked `other`
      // project so the server-side fallback can still attempt to bind.
      return;
    }
    void usePlugin(record, pendingAuthoringPrompt, {
      projectKind: 'other',
      chipId: pendingAuthoringChipId,
      inputs: authoringRecord ? pendingAuthoringInputs : AUTHORING_DEFAULT_SCENARIO_INPUTS,
      ...(authoringRecord ? { queryTemplate: PLUGIN_AUTHORING_PROMPT_TEMPLATE } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthoringChipId, pendingAuthoringPrompt, pendingAuthoringInputs, pluginsLoading, plugins]);

  // Stage B of plugin-driven-flow-plan: the chip rail dispatcher.
  // Pure UI-state mapping — the heavy lifting (apply / import) is
  // delegated back to existing handlers. Migration chips that don't
  // have a bound plugin (`import-folder`, `open-template-picker`)
  // forward to callbacks threaded in from EntryShell.
  function pickChip(chip: HomeHeroChip) {
    setError(null);
    switch (chip.action.kind) {
      case 'apply-scenario':
      case 'apply-figma-migration': {
        const targetId = chip.action.pluginId;
        const record = plugins.find((p) => p.id === targetId);
        if (!record) {
          setError(
            `Bundled scenario "${targetId}" is not installed. Reinstall the daemon to restore the default plugin set.`,
          );
          return;
        }
        requestActivePlugin(record, undefined, {
          projectKind: chip.action.projectKind,
          chipId: chip.id,
          inputs: chip.action.inputs,
        });
        return;
      }
      case 'create-plugin': {
        queuePluginAuthoring(chip.id);
        return;
      }
      case 'import-folder': {
        if (!onImportFolder) {
          setError('Folder import is not available in this shell.');
          return;
        }
        void onImportFolder();
        return;
      }
      case 'open-template-picker': {
        if (!onOpenNewProject) {
          setError('Template picker is not available in this shell.');
          return;
        }
        onOpenNewProject('template');
        return;
      }
    }
  }

  async function submit() {
    const trimmed = prompt.trim();
    if (!trimmed && stagedFiles.length === 0) return;
    let submittedActive = active;
    if (submittedActive && !submittedActive.inputsValid) {
      setError('Fill the required plugin parameters before running.');
      return;
    }
    if (submittedActive && !submittedActive.result) {
      const result = await resolveActivePlugin(submittedActive.record, submittedActive.inputs);
      if (!result) {
        setError(`Failed to apply ${submittedActive.record.title}. Check the plugin parameters and try again.`);
        return;
      }
      submittedActive = { ...submittedActive, result };
      setActive(submittedActive);
    }
    const contextPlugins = selectedPluginContexts.map((item) => ({
      id: item.record.id,
      title: item.record.title,
      ...(item.record.manifest?.description
        ? { description: item.record.manifest.description }
        : {}),
    }));
    const defaultInputs = { prompt: trimmed };
    onSubmit({
      prompt: trimmed,
      pluginId: submittedActive?.record.id ?? DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: activeSkill?.id ?? null,
      appliedPluginSnapshotId: submittedActive?.result?.appliedPlugin?.snapshotId ?? null,
      pluginTitle: submittedActive?.record.title ?? null,
      taskKind: submittedActive?.result?.appliedPlugin?.taskKind ?? null,
      pluginInputs: submittedActive ? submittedActive.inputs : defaultInputs,
      projectKind: submittedActive?.projectKind ?? fallbackProjectKind ?? projectKindForSkill(activeSkill) ?? 'other',
      contextPlugins,
      attachments: stagedFiles,
    });
  }

  return (
    <div className="home-view" data-testid="home-view">
      <HomeHero
        ref={inputRef}
        prompt={prompt}
        onPromptChange={handlePromptChange}
        onSubmit={submit}
        activePluginTitle={activeBadgeTitle}
        activePluginRecord={active?.record ?? null}
        activeSkillId={activeSkill?.id ?? null}
        activeSkillTitle={activeSkill?.name ?? null}
        activeChipId={active?.chipId ?? null}
        onClearActivePlugin={clearActivePlugin}
        onClearActiveSkill={() => setActiveSkill(null)}
        selectedPluginContexts={selectedPluginContexts.map((item) => item.record)}
        onRemovePluginContext={removePluginContext}
        onOpenPluginDetails={setDetailsRecord}
        pluginInputFields={active?.inputFields ?? []}
        pluginInputValues={active?.inputs ?? {}}
        pluginInputTemplate={active?.queryTemplate ?? null}
        onPluginInputValuesChange={updateActiveInputs}
        onPluginInputValidityChange={(valid) => {
          setActive((prev) => (
            prev && prev.inputsValid !== valid ? { ...prev, inputsValid: valid } : prev
          ));
        }}
        stagedFiles={stagedFiles}
        onAddFiles={stageFiles}
        onRemoveFile={removeStagedFile}
        pluginOptions={plugins}
        pluginsLoading={pluginsLoading}
        skillOptions={selectableSkills}
        skillsLoading={skillsLoading}
        mcpOptions={enabledMcpServers}
        mcpLoading={mcpLoading}
        pendingPluginId={pendingApplyId}
        pendingChipId={pendingChipId}
        submitDisabled={
          Boolean(pendingApplyId) ||
          Boolean(pendingAuthoringChipId) ||
          Boolean(active && !active.inputsValid)
        }
        onPickPlugin={(record, nextPrompt) => addPluginContext(record, nextPrompt)}
        onPickSkill={useSkill}
        onPickMcp={useMcpServer}
        onPickChip={pickChip}
        contextItemCount={contextItemCount}
        error={error}
      />

      <RecentProjectsStrip
        projects={projects}
        {...(projectsLoading !== undefined ? { loading: projectsLoading } : {})}
        onOpen={onOpenProject}
        onViewAll={onViewAllProjects}
      />

      <PluginsHomeSection
        plugins={plugins}
        loading={pluginsLoading}
        activePluginId={active?.record.id ?? null}
        pendingApplyId={pendingApplyId}
        onUse={(record, action) => requestPluginContextUse(record, action)}
        onOpenDetails={setDetailsRecord}
        onCreatePlugin={(goal) => queuePluginAuthoring(null, goal)}
        onBrowseRegistry={onBrowseRegistry}
      />

      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={() => setDetailsRecord(null)}
          onUse={(record) => requestPluginContextUse(record, 'use')}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
      {pendingReplacement ? (
        <div className="home-hero-confirm__backdrop" role="presentation">
          <div
            className="home-hero-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-hero-confirm-title"
          >
            <h2 id="home-hero-confirm-title">Replace current prompt?</h2>
            <p>
              Using {pendingReplacement.title} will replace the text currently in the input.
            </p>
            <div className="home-hero-confirm__actions">
              <button
                type="button"
                className="home-hero-confirm__secondary"
                onClick={() => setPendingReplacement(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="home-hero-confirm__primary"
                onClick={() => {
                  const action = pendingReplacement.confirm;
                  setPendingReplacement(null);
                  action();
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function projectKindForSkill(skill: SkillSummary | null): ProjectKind | null {
  if (!skill) return null;
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}

function hydratePluginInputs(
  fields: InputFieldSpec[],
  provided: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(provided ?? {}) };
  for (const field of fields) {
    if (next[field.name] === undefined && field.default !== undefined) {
      next[field.name] = field.default;
    }
  }
  return next;
}

function pluginInputsAreValid(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): boolean {
  return fields.every((field) => {
    if (!field.required) return true;
    const value = values[field.name];
    return value !== undefined && value !== null && value !== '';
  });
}

const TEMPLATE_INPUT_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

function extractPluginInputsFromPrompt(
  template: string,
  prompt: string,
  fields: InputFieldSpec[],
): Record<string, unknown> | null {
  TEMPLATE_INPUT_PATTERN.lastIndex = 0;
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  const keys: string[] = [];
  let pattern = '^';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_INPUT_PATTERN.exec(template)) !== null) {
    const placeholder = match[0];
    const key = match[1];
    if (!key) continue;
    pattern += escapeRegExp(template.slice(lastIndex, match.index));
    pattern += '([\\s\\S]*?)';
    keys.push(key);
    lastIndex = match.index + placeholder.length;
  }
  if (keys.length === 0) return null;
  pattern += escapeRegExp(template.slice(lastIndex));
  const renderedMatch = new RegExp(pattern + '$').exec(prompt);
  if (!renderedMatch) return null;
  const next: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    const field = fieldByName.get(key);
    if (!field) return;
    const raw = renderedMatch[index + 1] ?? '';
    next[key] = coercePromptInputValue(raw, field);
  });
  return next;
}

function coercePromptInputValue(raw: string, field: InputFieldSpec): unknown {
  const rawType = (field as { type?: unknown }).type;
  const type = typeof rawType === 'string' ? rawType : 'string';
  const trimmed = raw.trim();
  if (type === 'number') {
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (type === 'boolean') {
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
  }
  if (type === 'select' && Array.isArray(field.options) && field.options.includes(trimmed)) {
    return trimmed;
  }
  return raw;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removePluginMentionFromPrompt(prompt: string, record: InstalledPluginRecord): string {
  const token = inlineMentionToken(record.title);
  return prompt
    .replace(new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'g'), ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function appendPromptQuery(current: string, query: string): string {
  const next = query.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  return `${current.trimEnd()}\n\n${next}`;
}

function inputsEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown>,
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, idx) => key === rightKeys[idx] && left[key] === right[key]);
}
