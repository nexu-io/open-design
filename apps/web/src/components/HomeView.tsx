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
  ConnectorDetail,
  InputFieldSpec,
  McpServerConfig,
  InstalledPluginRecord,
  ProjectKind,
  AudioVoiceOption,
} from '@open-design/contracts';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeChatComposerClick,
  trackPageView,
  trackPluginReplacementModalClick,
  trackPluginReplacementModalSurfaceView,
  trackPluginReplacementResult,
  trackRecentProjectsClick,
} from '../analytics/events';
import {
  applyPlugin,
  listPlugins,
  renderPluginBriefTemplate,
  resolvePluginQueryFallback,
} from '../state/projects';
import { fetchMcpServers } from '../state/mcp';
import { useI18n } from '../i18n';
import { fetchElevenLabsVoiceOptions } from '../providers/elevenlabs-voices';
import { fetchProjectFiles, projectFileUrl } from '../providers/registry';
import type {
  DesignSystemSummary,
  Project,
  ProjectFile,
  ProjectMetadata,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { inlineMentionToken } from '../utils/inlineMentions';
import { HomeHero } from './HomeHero';
import { findChip, HOME_HERO_CHIPS, type HomeHeroChip } from './home-hero/chips';
import {
  buildHomeMediaComposer,
  homeMediaSurfaceForChipId,
  metadataForHomeMediaComposer,
  normalizeHomeMediaInputs,
  type HomeComposerMediaSurface,
} from './home-hero/media-surfaces';
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
import type { FacetSelection } from './plugins-home/facets';
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
  mediaSurface: HomeComposerMediaSurface | null;
  projectMetadata: ProjectMetadata | null;
  editableInputNames: string[];
  preserveInputFields: boolean;
  // True when the active plugin was bound through a type chip.
  // In that mode we never push the rendered useCase.query into the
  // textarea — the user keeps full control over the prompt and the
  // plugin preset cards are the explicit opt-in for a starter
  // sentence. Without this flag the media composer
  // effect (which fires on external list reloads like ElevenLabs
  // voices) and updateActiveInputs (fires on inline form edits)
  // would back-fill the textarea, defeating the suppression that
  // the chip click set up.
  suppressPromptSync: boolean;
}

interface SelectedPluginContext {
  record: InstalledPluginRecord;
}

interface SelectedMcpContext {
  server: McpServerConfig;
}

interface SelectedConnectorContext {
  connector: ConnectorDetail;
}

interface PendingReplacement {
  title: string;
  // Returns a promise resolving when the underlying plugin apply has
  // finished (or rejecting on failure) so the modal's success/failure
  // analytics fire on the real outcome, not on the synchronous
  // queue-the-apply step.
  confirm: () => Promise<void>;
  // Plugin ids surrounding the replacement so the result event can
  // report which plugin owned the existing prompt and which plugin is
  // about to take over. `pluginBefore` is null when nothing was active
  // (e.g. a manually typed prompt that should be replaced by a plugin
  // selection).
  pluginBefore: string | null;
  pluginAfter: string;
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

type HomeDesignSystemOption = {
  id: string;
  title: string;
  isDefault: boolean;
  auto?: boolean;
  group?: 'Personal' | 'Official preset' | 'Enterprise';
  category?: string;
  summary?: string;
  swatches?: string[];
  logoUrl?: string;
};

const AUTO_DESIGN_SYSTEM_OPTION_ID = '__auto-design-system__';
const LEGACY_AUTO_DESIGN_SYSTEM_TITLES = new Set(['自动选择风格参考']);

interface Props {
  projects: Project[];
  projectsLoading?: boolean;
  designSystems?: DesignSystemSummary[];
  defaultDesignSystemId?: string | null;
  onSubmit: (payload: PluginLoopSubmit) => void;
  onOpenProject: (id: string) => void;
  onViewAllProjects: () => void;
  onBrowseRegistry?: () => void;
  // Stage B: optional callbacks the rail's migration chips need.
  // HomeView itself never imports them; EntryShell threads them
  // through so the dispatcher can stay declarative.
  onOpenNewProject?: (tab: 'template') => void;
  promptHandoff?: HomePromptHandoff | null;
  skills?: SkillSummary[];
  skillsLoading?: boolean;
  connectors?: ConnectorDetail[];
  promptTemplates?: PromptTemplateSummary[];
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_CONNECTORS: ConnectorDetail[] = [];
const EMPTY_PROMPT_TEMPLATES: PromptTemplateSummary[] = [];

export function HomeView({
  projects,
  projectsLoading,
  designSystems = EMPTY_DESIGN_SYSTEMS,
  defaultDesignSystemId = null,
  onSubmit,
  onOpenProject,
  onViewAllProjects,
  onBrowseRegistry,
  onOpenNewProject,
  promptHandoff,
  skills = EMPTY_SKILLS,
  skillsLoading = false,
  connectors = EMPTY_CONNECTORS,
  promptTemplates = EMPTY_PROMPT_TEMPLATES,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  // P0 page_view page_name=home — fire once on mount. ref-keyed to survive
  // re-renders that flip parent state without remounting HomeView.
  const homePageViewFiredRef = useRef(false);
  useEffect(() => {
    if (homePageViewFiredRef.current) return;
    homePageViewFiredRef.current = true;
    trackPageView(analytics.track, { page_name: 'home' });
  }, [analytics.track]);
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
  const [selectedMcpContexts, setSelectedMcpContexts] = useState<SelectedMcpContext[]>([]);
  const [selectedConnectorContexts, setSelectedConnectorContexts] = useState<SelectedConnectorContext[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [promptEditedByUser, setPromptEditedByUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [designSystemLogoById, setDesignSystemLogoById] = useState<Record<string, string>>({});
  const [elevenLabsVoices, setElevenLabsVoices] = useState<AudioVoiceOption[]>([]);
  const [elevenLabsVoicesLoading, setElevenLabsVoicesLoading] = useState(false);
  const [elevenLabsVoicesLoaded, setElevenLabsVoicesLoaded] = useState(false);
  const [elevenLabsVoicesError, setElevenLabsVoicesError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null);
  // Surface_view fires when the replacement modal becomes visible. Tied
  // to the {before, after} pair so reopening with the same pair after a
  // close doesn't double-fire, but a fresh pair always does.
  const lastPluginReplacementViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingReplacement) {
      lastPluginReplacementViewRef.current = null;
      return;
    }
    const key = `${pendingReplacement.pluginBefore ?? ''}->${pendingReplacement.pluginAfter}`;
    if (lastPluginReplacementViewRef.current === key) return;
    lastPluginReplacementViewRef.current = key;
    trackPluginReplacementModalSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'plugin_replacement_modal',
    });
  }, [pendingReplacement, analytics.track]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const consumedHandoffIdRef = useRef<number | null>(null);
  const pendingPromptFocusEndRef = useRef(false);
  const activePluginApplyRequestRef = useRef(0);

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
    if (active?.mediaSurface !== 'audio' || active.inputs.model !== 'elevenlabs-v3') return;
    if (elevenLabsVoicesLoaded) return;
    const controller = new AbortController();
    setElevenLabsVoicesLoading(true);
    setElevenLabsVoicesError(null);
    void fetchElevenLabsVoiceOptions(controller.signal)
      .then((voices) => {
        if (controller.signal.aborted) return;
        setElevenLabsVoices(voices);
        setElevenLabsVoicesLoaded(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setElevenLabsVoices([]);
        setElevenLabsVoicesLoaded(true);
        setElevenLabsVoicesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setElevenLabsVoicesLoading(false);
      });
    return () => controller.abort();
  }, [active?.mediaSurface, active?.inputs.model, elevenLabsVoicesLoaded]);

  const elevenLabsVoiceWarning = useMemo(() => {
    if (active?.mediaSurface !== 'audio' || active.inputs.model !== 'elevenlabs-v3') return null;
    if (elevenLabsVoicesError) return elevenLabsVoicesError;
    if (elevenLabsVoicesLoaded && elevenLabsVoices.length === 0) {
      return 'No configured ElevenLabs voices were returned. Using Rachel (default).';
    }
    return null;
  }, [
    active?.mediaSurface,
    active?.inputs.model,
    elevenLabsVoicesError,
    elevenLabsVoicesLoaded,
    elevenLabsVoices.length,
  ]);

  useEffect(() => {
    if (!active?.mediaSurface) return;
    const composer = buildHomeMediaComposer(
      active.mediaSurface,
      promptTemplates,
      active.inputs,
      elevenLabsVoices,
      {
        elevenLabsVoiceWarning,
        elevenLabsVoicesLoading,
      },
    );
    const nextRendered = renderPluginBriefTemplate(composer.queryTemplate, composer.inputs);
    // When the plugin was bound through a type chip the user owns the
    // textarea; never back-fill from this effect even if external
    // lists (ElevenLabs voices, prompt templates) reload after the
    // chip click. lastRenderedPrompt stays null in that mode so we
    // don't mis-detect "the user hasn't typed" via the empty-string
    // branch either.
    if (
      !active.suppressPromptSync &&
      (prompt === active.lastRenderedPrompt || prompt.trim().length === 0)
    ) {
      setPrompt(nextRendered);
      setPromptEditedByUser(false);
    }
    setActive((prev) => {
      if (!prev?.mediaSurface) return prev;
      return {
        ...prev,
        inputs: composer.inputs,
        inputFields: composer.fields,
        queryTemplate: composer.queryTemplate,
        editableInputNames: composer.editableFieldNames,
        inputsValid: pluginInputsAreValid(composer.fields, composer.inputs),
        result: inputsEqual(prev.result?.appliedPlugin?.inputs, composer.inputs) ? prev.result : null,
        lastRenderedPrompt: prev.suppressPromptSync ? prev.lastRenderedPrompt : nextRendered,
        projectMetadata: metadataForHomeMediaComposer(prev.mediaSurface, composer.inputs, promptTemplates),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptTemplates, elevenLabsVoices, elevenLabsVoiceWarning, elevenLabsVoicesLoading]);

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
        focusPromptAtEnd();
      }
      return;
    }

    setActive(null);
    setActiveSkill(null);
    setSelectedPluginContexts([]);
    setSelectedMcpContexts([]);
    setSelectedConnectorContexts([]);
    setFallbackProjectKind('other');
    if (promptHandoff.focus) {
      pendingPromptFocusEndRef.current = true;
    }
    setPrompt(promptHandoff.prompt);
    setPromptEditedByUser(false);
    setPendingAuthoringPrompt(promptHandoff.prompt);
    setPendingAuthoringInputs(promptHandoff.inputs);
    setPendingAuthoringChipId('create-plugin');
    setPendingChipId('create-plugin');
  }, [promptHandoff]);

  const activeContextItemCount = useMemo(
    () =>
      active
        ? active.result?.contextItems?.length ??
          estimatePluginContextItemCount(active.record)
        : 0,
    [active],
  );
  const contextItemCount = useMemo(
    () =>
      activeContextItemCount +
      selectedPluginContexts.length +
      selectedMcpContexts.length +
      selectedConnectorContexts.length +
      stagedFiles.length,
    [
      activeContextItemCount,
      selectedConnectorContexts.length,
      selectedMcpContexts.length,
      selectedPluginContexts.length,
      stagedFiles.length,
    ],
  );

  // The Home chip rail and the Community grid share a mental
  // model — "Prototype" up top is the same artifact intent as the
  // `prototype` slice down below. When the user picks a chip,
  // we drive the starters' FacetSelection from it so they get a
  // pre-filtered shelf of templates for the same intent without having
  // to scroll and re-pick. `pendingChipId` (set on click, before apply
  // resolves) is preferred over `active?.chipId` so the filter snaps on
  // the same frame as the click.
  const presetStartersSelection = useMemo<FacetSelection | null>(() => {
    const chipId = pendingChipId ?? active?.chipId ?? null;
    if (!chipId) return null;
    return facetSelectionForChip(chipId);
  }, [pendingChipId, active?.chipId]);

  // When the active plugin was bound through a chip, the badge shows
  // the chip label (e.g. "Prototype") instead of the underlying plugin
  // record title (e.g. "New generation (default scenario)"). Several
  // chips share od-new-generation, so surfacing the raw plugin title
  // would mislabel what the user actually picked.
  const activeBadgeTitle = useMemo(() => {
    if (!active) return null;
    if (active.chipId) {
      const defaultPluginId = defaultPluginIdForChip(active.chipId);
      const chip = findChip(active.chipId);
      if (chip && (defaultPluginId === null || defaultPluginId === active.record.id)) {
        return homeHeroChipLabelForId(chip.id, t);
      }
    }
    return active.record.title;
  }, [active, t]);
  const showActivePluginChip = useMemo(
    () => shouldShowActivePluginChip(active),
    [active],
  );

  const selectableSkills = useMemo(
    () => skills.filter((skill) => !skill.aggregatesExamples),
    [skills],
  );

  const enabledMcpServers = useMemo(
    () => mcpServers.filter((server) => server.enabled),
    [mcpServers],
  );

  useEffect(() => {
    let cancelled = false;
    const personalSystems = designSystems.filter((system) => (
      system.projectId &&
      designSystemOptionGroup(system) === 'Personal' &&
      (system.status ?? 'draft') === 'published'
    ));
    if (personalSystems.length === 0) {
      setDesignSystemLogoById((current) => (
        Object.keys(current).length === 0 ? current : {}
      ));
      return;
    }

    void Promise.all(
      personalSystems.map(async (system) => {
        const projectId = system.projectId;
        if (!projectId) return [system.id, null] as const;
        const files = await fetchProjectFiles(projectId);
        const logo = findDesignSystemLogoFile(files);
        if (!logo) return [system.id, null] as const;
        return [system.id, projectFileUrl(projectId, logo.path ?? logo.name)] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, logoUrl] of entries) {
        if (logoUrl) next[id] = logoUrl;
      }
      setDesignSystemLogoById(next);
    });

    return () => {
      cancelled = true;
    };
  }, [designSystems]);

  const designSystemOptions = useMemo(
    () => designSystemOptionsForHome(designSystems, defaultDesignSystemId, designSystemLogoById, t),
    [defaultDesignSystemId, designSystemLogoById, designSystems, t],
  );

  function focusPromptAtEnd() {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const position = input.value.length;
      input.setSelectionRange(position, position);
      input.scrollTop = input.scrollHeight;
    });
  }

  async function usePlugin(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: {
      projectKind?: ProjectKind;
      chipId?: string;
      inputs?: Record<string, unknown>;
      inputFields?: InputFieldSpec[];
      queryTemplate?: string | null;
      mediaSurface?: HomeComposerMediaSurface | null;
      projectMetadata?: ProjectMetadata | null;
      editableInputNames?: string[];
      preserveInputFields?: boolean;
      replaceWithoutConfirmation?: boolean;
      // When true, applying the plugin updates the active badge +
      // context items but does NOT push the rendered useCase.query
      // into the textarea. The user keeps whatever they had typed
      // (or empty); the preset cards are the surfaced opt-in to seed
      // the textarea instead. Used by the top type-chip rail: picking
      // Slide deck binds the plugin context, leaving the user's draft
      // alone.
      suppressPromptUpdate?: boolean;
      // Type chips are a mode switch, not a commitment to run. Keeping
      // their apply deferred makes Prototype <-> Deck <-> Media changes
      // feel instant; submit() still resolves the snapshot before sending.
      deferApply?: boolean;
    },
  ) {
    const applyRequestId = activePluginApplyRequestRef.current + 1;
    activePluginApplyRequestRef.current = applyRequestId;
    const shouldResolveImmediately = options?.deferApply !== true;
    const inputFields = options?.inputFields ?? record.manifest?.od?.inputs ?? [];
    const optimisticInputs = hydratePluginInputs(
      inputFields,
      withHomeDesignSystemDefault(options?.inputs, inputFields, designSystemOptions),
    );
    const inputsValid = pluginInputsAreValid(inputFields, optimisticInputs);
    const queryTemplate =
      options?.queryTemplate !== undefined
        ? options.queryTemplate
        : nextPrompt !== undefined && nextPrompt !== null
        ? null
        : resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale) || null;
    const suppressPromptUpdate = options?.suppressPromptUpdate === true;
    const optimisticPrompt =
      nextPrompt !== undefined && nextPrompt !== null
        ? nextPrompt
        : queryTemplate
          ? renderPluginBriefTemplate(queryTemplate, optimisticInputs)
          : null;
    if (options?.chipId && shouldResolveImmediately) setPendingChipId(options.chipId);
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
      // When prompt updates are suppressed we leave lastRenderedPrompt
      // null so the inline pattern-extraction in handlePromptChange
      // doesn't claim ownership of the user's typed text.
      lastRenderedPrompt: suppressPromptUpdate ? null : optimisticPrompt,
      projectKind: options?.projectKind ?? null,
      chipId: options?.chipId ?? null,
      mediaSurface: options?.mediaSurface ?? null,
      projectMetadata: homeCreateProjectMetadata(
        options?.projectKind ?? null,
        optimisticInputs,
        options?.projectMetadata ?? null,
      ),
      editableInputNames: options?.editableInputNames ?? [],
      preserveInputFields: options?.preserveInputFields === true,
      suppressPromptSync: suppressPromptUpdate,
    });
    setFallbackProjectKind(null);
    setDetailsRecord(null);
    if (!suppressPromptUpdate && optimisticPrompt !== null) {
      setPrompt(optimisticPrompt);
      setPromptEditedByUser(false);
    }
    focusPromptAtEnd();

    if (!inputsValid) {
      setPendingChipId(null);
      return;
    }
    if (!shouldResolveImmediately) return;

    const result = await resolveActivePlugin(record, optimisticInputs, applyRequestId);
    if (activePluginApplyRequestRef.current !== applyRequestId) return;
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
            inputFields: options?.preserveInputFields ? inputFields : result.inputs ?? inputFields,
            inputsValid: pluginInputsAreValid(
              options?.preserveInputFields ? inputFields : result.inputs ?? inputFields,
              reconciledInputs,
            ),
            projectMetadata: homeCreateProjectMetadata(
              prev.projectKind,
              reconciledInputs,
              prev.projectMetadata,
            ),
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
    if (!suppressPromptUpdate && (nextPrompt === undefined || nextPrompt === null)) {
      const reconciledQuery =
        options?.queryTemplate !== undefined
          ? options.queryTemplate
          : result.query || resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
      if (reconciledQuery) {
        const reconciledPrompt = renderPluginBriefTemplate(reconciledQuery, reconciledInputs);
        if (reconciledPrompt !== optimisticPrompt) {
          setPrompt((current) => {
            if (current !== optimisticPrompt) return current;
            setPromptEditedByUser(false);
            return reconciledPrompt;
          });
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
    applyRequestId?: number,
  ): Promise<ApplyResult | null> {
    setPendingApplyId(record.id);
    const result = await applyPlugin(record.id, { locale, inputs });
    if (applyRequestId === undefined || activePluginApplyRequestRef.current === applyRequestId) {
      setPendingApplyId(null);
      setPendingChipId(null);
    }
    return result;
  }

  function requestActivePlugin(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: {
      projectKind?: ProjectKind;
      chipId?: string;
      inputs?: Record<string, unknown>;
      inputFields?: InputFieldSpec[];
      queryTemplate?: string | null;
      mediaSurface?: HomeComposerMediaSurface | null;
      projectMetadata?: ProjectMetadata | null;
      editableInputNames?: string[];
      preserveInputFields?: boolean;
      replaceWithoutConfirmation?: boolean;
      suppressPromptUpdate?: boolean;
      deferApply?: boolean;
    },
  ) {
    const replacement = previewPluginReplacement(record, nextPrompt, {
      inputs: withHomeDesignSystemDefault(options?.inputs, options?.inputFields ?? record.manifest?.od?.inputs ?? [], designSystemOptions),
      inputFields: options?.inputFields,
      queryTemplate: options?.queryTemplate,
    });
    const confirm = () => usePlugin(record, nextPrompt, options);
    if (options?.replaceWithoutConfirmation) {
      void confirm();
      return;
    }
    runWithReplacementConfirmation(record.title, replacement, confirm, {
      before: active?.record.id ?? null,
      after: record.id,
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
        setPromptEditedByUser(true);
        setPrompt((current) => appendPromptQuery(current, queryPrompt));
      }
    }
    setError(null);
    setDetailsRecord(null);
    if (shouldFocusOnly) focusPromptAtEnd();
  }

  function runWithReplacementConfirmation(
    title: string,
    replacementPrompt: string | null,
    confirm: () => Promise<void>,
    pluginIds: { before: string | null; after: string },
  ) {
    if (
      replacementPrompt !== null &&
      promptEditedByUser &&
      prompt.trim().length > 0 &&
      prompt.trim() !== replacementPrompt.trim()
    ) {
      setPendingReplacement({
        title,
        confirm,
        pluginBefore: pluginIds.before,
        pluginAfter: pluginIds.after,
      });
      return;
    }
    void confirm();
  }

  function previewPluginReplacement(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: {
      inputs?: Record<string, unknown>;
      inputFields?: InputFieldSpec[];
      queryTemplate?: string | null;
    },
  ): string | null {
    if (nextPrompt !== undefined && nextPrompt !== null) return nextPrompt;
    const query =
      options?.queryTemplate !== undefined
        ? options.queryTemplate
        : resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
    if (!query) return null;
    const fields = options?.inputFields ?? record.manifest?.od?.inputs ?? [];
    return renderPluginBriefTemplate(query, hydratePluginInputs(fields, options?.inputs));
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
    focusPromptAtEnd();
  }

  function useExamplePlugin(record: InstalledPluginRecord, chipId: string, promptText: string) {
    const projectKind = projectKindForExamplePlugin(record, chipId);
    requestActivePlugin(record, promptText, {
      projectKind,
      chipId,
      inputs: {},
      inputFields: [],
      queryTemplate: null,
      replaceWithoutConfirmation: true,
    });
  }

  function removePluginContext(pluginId: string) {
    const record = selectedPluginContexts.find((item) => item.record.id === pluginId)?.record ?? null;
    setSelectedPluginContexts((prev) => prev.filter((item) => item.record.id !== pluginId));
    if (record) {
      setPrompt((current) => removePluginMentionFromPrompt(current, record));
      setPromptEditedByUser(true);
    }
  }

  function handlePromptChange(nextPrompt: string) {
    setPrompt(nextPrompt);
    setPromptEditedByUser(true);
    if (!active?.queryTemplate) return;
    const extracted = extractPluginInputsFromPrompt(
      active.queryTemplate,
      nextPrompt,
      active.inputFields,
    );
    if (!extracted) return;
    const nextInputs = { ...active.inputs, ...extracted };
    const normalizedInputs = active.mediaSurface
      ? normalizeHomeMediaInputs(active.mediaSurface, nextInputs, promptTemplates, elevenLabsVoices)
      : nextInputs;
    const inputsValid = pluginInputsAreValid(active.inputFields, normalizedInputs);
    const inputsChanged = !inputsEqual(active.inputs, normalizedInputs);
    setActive({
      ...active,
      inputs: normalizedInputs,
      inputsValid,
      projectMetadata: active.mediaSurface
        ? metadataForHomeMediaComposer(active.mediaSurface, normalizedInputs, promptTemplates)
        : homeCreateProjectMetadata(active.projectKind, normalizedInputs, active.projectMetadata),
      result:
        inputsChanged && !inputsEqual(active.result?.appliedPlugin?.inputs, normalizedInputs)
          ? null
          : active.result,
      lastRenderedPrompt: nextPrompt,
    });
  }

  function stageFiles(files: File[]) {
    if (files.length === 0) return;
    setStagedFiles((current) => [...current, ...files]);
    setError(null);
    focusPromptAtEnd();
  }

  function removeStagedFile(index: number) {
    setStagedFiles((current) => current.filter((_, i) => i !== index));
  }

  function updateActiveInputs(next: Record<string, unknown>) {
    if (!active) return;
    const normalized = active.mediaSurface
      ? normalizeHomeMediaInputs(active.mediaSurface, next, promptTemplates, elevenLabsVoices)
      : next;
    const mediaComposer = active.mediaSurface
      ? buildHomeMediaComposer(active.mediaSurface, promptTemplates, normalized, elevenLabsVoices, {
          elevenLabsVoiceWarning,
          elevenLabsVoicesLoading,
        })
      : null;
    const inputFields = mediaComposer?.fields ?? active.inputFields;
    const queryTemplate = mediaComposer?.queryTemplate ?? active.queryTemplate;
    const projectMetadata = active.mediaSurface
      ? metadataForHomeMediaComposer(active.mediaSurface, normalized, promptTemplates)
      : homeCreateProjectMetadata(active.projectKind, normalized, active.projectMetadata);
    const inputsValid = pluginInputsAreValid(inputFields, normalized);
    const nextRendered =
      queryTemplate !== null
        ? renderPluginBriefTemplate(queryTemplate, normalized)
        : active.lastRenderedPrompt;
    if (
      !active.suppressPromptSync &&
      queryTemplate !== null &&
      nextRendered !== null &&
      (prompt === active.lastRenderedPrompt || prompt.trim().length === 0)
    ) {
      setPrompt(nextRendered);
      setPromptEditedByUser(false);
    }
    setActive({
      ...active,
      inputs: normalized,
      inputFields,
      queryTemplate,
      projectMetadata,
      editableInputNames: mediaComposer?.editableFieldNames ?? active.editableInputNames,
      inputsValid,
      result: inputsEqual(active.result?.appliedPlugin?.inputs, normalized) ? active.result : null,
      lastRenderedPrompt: active.suppressPromptSync ? active.lastRenderedPrompt : nextRendered,
    });
  }

  function clearActivePlugin() {
    activePluginApplyRequestRef.current += 1;
    setActive(null);
    setFallbackProjectKind(null);
    setPendingApplyId(null);
    setPendingChipId(null);
    setPrompt('');
    setPromptEditedByUser(false);
  }

  function clearActiveChipSelection() {
    activePluginApplyRequestRef.current += 1;
    setActive(null);
    setFallbackProjectKind(null);
    setPendingApplyId(null);
    setPendingChipId(null);
    setError(null);
    setPromptEditedByUser(prompt.trim().length > 0);
    focusPromptAtEnd();
  }

  function useSkill(skill: SkillSummary, nextPrompt: string | null) {
    setActiveSkill(skill);
    setError(null);
    const replacement = nextPrompt ?? skill.examplePrompt ?? '';
    if (replacement.trim().length > 0) {
      setPrompt(replacement);
      setPromptEditedByUser(false);
    }
    focusPromptAtEnd();
  }

  function useMcpServer(_server: McpServerConfig, nextPrompt: string) {
    setSelectedMcpContexts((current) => (
      current.some((item) => item.server.id === _server.id)
        ? current
        : [...current, { server: _server }]
    ));
    setPrompt(nextPrompt);
    setError(null);
    focusPromptAtEnd();
  }

  function useConnector(connector: ConnectorDetail, nextPrompt: string) {
    setSelectedConnectorContexts((current) => (
      current.some((item) => item.connector.id === connector.id)
        ? current
        : [...current, { connector }]
    ));
    setPrompt(nextPrompt);
    setPromptEditedByUser(false);
    setError(null);
    focusPromptAtEnd();
  }

  function queuePluginAuthoring(chipId: string | null, goal?: string) {
    const nextInputs = buildPluginAuthoringInputs(goal);
    const nextPrompt = buildPluginAuthoringPromptForInputs(nextInputs);
    runWithReplacementConfirmation('Plugin authoring', nextPrompt, async () => {
      setActive(null);
      setActiveSkill(null);
      setFallbackProjectKind('other');
      setError(null);
      setPrompt(nextPrompt);
      setPromptEditedByUser(false);
      setPendingAuthoringPrompt(nextPrompt);
      setPendingAuthoringInputs(nextInputs);
      setPendingAuthoringChipId(chipId ?? 'create-plugin');
      setPendingChipId(chipId ?? 'create-plugin');
      focusPromptAtEnd();
    }, {
      before: active?.record.id ?? null,
      after: 'od-plugin-authoring',
    });
  }

  useEffect(() => {
    if (!pendingAuthoringChipId || pluginsLoading) return;
    const authoringRecord = plugins.find((plugin) => plugin.id === 'od-plugin-authoring');
    const record = authoringRecord ?? plugins.find((plugin) => plugin.id === 'od-new-generation');
    setPendingAuthoringChipId(null);
    if (!record) {
      setPendingChipId(null);
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
  // Pure UI-state mapping — the heavy lifting is delegated back to
  // existing handlers. Migration chips that don't have a bound plugin
  // (`open-template-picker`) forward to callbacks threaded in from EntryShell.
  function pickChip(chip: HomeHeroChip) {
    setError(null);
    // P0 ui_click area=chat_composer element=plugin_chip|action_chip. The
    // chip's `action.kind` discriminates: plugin-bound chips
    // (apply-scenario / apply-figma-migration) route to a plugin; the rest
    // (create-plugin, open-template-picker) are action
    // shortcuts. Failure paths below still fire because the user did pick
    // the chip — error state belongs in the run lifecycle event.
    const chipElement: 'plugin_chip' | 'action_chip' =
      chip.action.kind === 'apply-scenario' || chip.action.kind === 'apply-figma-migration'
        ? 'plugin_chip'
        : 'action_chip';
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: chipElement,
      chip_id: chip.id,
    });
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
        const mediaSurface = homeMediaSurfaceForChipId(chip.id);
        if (mediaSurface) {
          const composer = buildHomeMediaComposer(
            mediaSurface,
            promptTemplates,
            chip.action.inputs,
            elevenLabsVoices,
            {
              elevenLabsVoiceWarning,
              elevenLabsVoicesLoading,
            },
          );
          requestActivePlugin(record, undefined, {
            projectKind: composer.projectKind,
            chipId: chip.id,
            inputs: composer.inputs,
            inputFields: composer.fields,
            queryTemplate: composer.queryTemplate,
            mediaSurface,
            projectMetadata: metadataForHomeMediaComposer(mediaSurface, composer.inputs, promptTemplates),
            editableInputNames: composer.editableFieldNames,
            preserveInputFields: true,
            // Media chips are a mode switch, just like Prototype and
            // Slide deck: keep their inline model/ratio/duration options
            // visible, but leave the textarea alone until the user picks
            // a concrete template/preset or types their own prompt.
            suppressPromptUpdate: true,
            replaceWithoutConfirmation: true,
          });
          return;
        }
        const pluginOptions = {
          projectKind: chip.action.projectKind,
          chipId: chip.id,
          inputs: chip.action.inputs,
          projectMetadata: chip.action.projectMetadata ?? null,
        };
        // Output-type tabs (create group) are mode-selection gestures:
        // switching between them should never prompt for confirmation,
        // and they should NOT pre-fill the textarea with the rendered
        // useCase.query — the preset cards are the explicit opt-in
        // for that. Migrate-group chips (From Figma, etc.) still carry
        // a meaningful prompt the user wants dropped in, so they keep
        // the historical behavior.
        if (chip.group === 'create') {
          void usePlugin(record, undefined, {
            ...pluginOptions,
            suppressPromptUpdate: true,
            deferApply: true,
          });
        } else {
          requestActivePlugin(record, undefined, pluginOptions);
        }
        return;
      }
      case 'create-plugin': {
        queuePluginAuthoring(chip.id);
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
    // P0 ui_click area=chat_composer element=send_button. Fires before the
    // async plugin-apply roundtrip so the click count reflects user intent
    // even when the run is rejected (missing inputs, apply failure). The
    // subsequent run_created/run_finished events carry the result detail.
    trackHomeChatComposerClick(analytics.track, {
      page_name: 'home',
      area: 'chat_composer',
      element: 'send_button',
    });
    let submittedActive = active;
    if (submittedActive && !submittedActive.inputsValid) {
      setError('Fill the required plugin parameters before running.');
      return;
    }
    const defaultInputs = { prompt: trimmed };
    const submittedDesignSystemSelection = homeDesignSystemSelectionForInputs(
      submittedActive?.inputs ?? null,
      designSystemOptions,
      trimmed,
    );
    const submittedPluginInputs = submittedActive
      ? applyHomeDesignSystemSelectionToInputs(
          submittedActive.inputs,
          submittedDesignSystemSelection,
          designSystemOptions,
        )
      : defaultInputs;
    const activeInputsChangedForSubmit = submittedActive
      ? !inputsEqual(submittedActive.inputs, submittedPluginInputs)
      : false;
    if (submittedActive && (!submittedActive.result || activeInputsChangedForSubmit)) {
      const result = await resolveActivePlugin(submittedActive.record, submittedPluginInputs);
      if (!result) {
        setError(`Failed to apply ${submittedActive.record.title}. Check the plugin parameters and try again.`);
        return;
      }
      submittedActive = { ...submittedActive, result, inputs: submittedPluginInputs };
      setActive(submittedActive);
    }
    const contextPlugins = selectedPluginContexts.map((item) => ({
      id: item.record.id,
      title: item.record.title,
      ...(item.record.manifest?.description
        ? { description: item.record.manifest.description }
        : {}),
    }));
    const contextMcpServers = selectedMcpContexts.map((item) => ({
      id: item.server.id,
      ...(item.server.label ? { label: item.server.label } : {}),
      ...(item.server.transport ? { transport: item.server.transport } : {}),
      ...(item.server.url ? { url: item.server.url } : {}),
      ...(item.server.command ? { command: item.server.command } : {}),
    }));
    const contextConnectors = selectedConnectorContexts.map((item) => ({
      id: item.connector.id,
      name: item.connector.name,
      provider: item.connector.provider,
      category: item.connector.category,
      status: item.connector.status,
      ...(item.connector.accountLabel ? { accountLabel: item.connector.accountLabel } : {}),
    }));
    const submittedProjectKind =
      submittedActive?.projectKind ?? fallbackProjectKind ?? projectKindForSkill(activeSkill) ?? 'other';
    const submittedProjectMetadata = submittedActive?.mediaSurface
      ? metadataForHomeMediaComposer(submittedActive.mediaSurface, submittedActive.inputs, promptTemplates)
      : homeCreateProjectMetadata(
          submittedProjectKind,
          submittedActive?.inputs ?? null,
          submittedActive?.projectMetadata ?? null,
        );
    onSubmit({
      prompt: trimmed,
      pluginId: submittedActive?.record.id ?? DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
      skillId: activeSkill?.id ?? null,
      appliedPluginSnapshotId: submittedActive?.result?.appliedPlugin?.snapshotId ?? null,
      pluginTitle: submittedActive?.record.title ?? null,
      taskKind: submittedActive?.result?.appliedPlugin?.taskKind ?? null,
      pluginInputs: submittedPluginInputs,
      projectKind: submittedProjectKind,
      projectMetadata: submittedProjectMetadata,
      designSystemId: submittedDesignSystemSelection?.id ?? null,
      contextPlugins,
      contextMcpServers,
      contextConnectors,
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
        showActivePluginChip={showActivePluginChip}
        onClearActivePlugin={clearActivePlugin}
        onClearActiveChip={clearActiveChipSelection}
        onClearActiveSkill={() => setActiveSkill(null)}
        selectedPluginContexts={selectedPluginContexts.map((item) => item.record)}
        onRemovePluginContext={removePluginContext}
        onOpenPluginDetails={setDetailsRecord}
        pluginInputFields={active?.inputFields ?? []}
        pluginInputValues={active?.inputs ?? {}}
        pluginInputTemplate={active?.queryTemplate ?? null}
        onPluginInputValuesChange={updateActiveInputs}
        inlineEditableInputNames={active?.editableInputNames ?? []}
        footerInputNames={footerInputNamesForChip(active?.chipId ?? null)}
        designSystemOptions={designSystemOptions}
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
        connectorOptions={connectors.filter((connector) => connector.status === 'connected')}
        pendingPluginId={pendingApplyId}
        pendingChipId={pendingChipId}
        submitDisabled={
          Boolean(pendingApplyId) ||
          Boolean(pendingAuthoringChipId) ||
          Boolean(active && !active.inputsValid)
        }
        onPickPlugin={(record, nextPrompt) => addPluginContext(record, nextPrompt)}
        onPickExamplePlugin={useExamplePlugin}
        onPickSkill={useSkill}
        onPickMcp={useMcpServer}
        onPickConnector={useConnector}
        onPickChip={pickChip}
        contextItemCount={contextItemCount}
        error={error}
      />

      <RecentProjectsStrip
        projects={projects}
        {...(projectsLoading !== undefined ? { loading: projectsLoading } : {})}
        onOpen={(id) => {
          // P0 ui_click area=recent_projects element=project_card — emit
          // before navigation so the event isn't lost when the host
          // re-renders into the project view.
          const project = projects.find((p) => p.id === id);
          const projectKind = projectKindToTracking(project?.metadata?.kind);
          trackRecentProjectsClick(analytics.track, {
            page_name: 'home',
            area: 'recent_projects',
            element: 'project_card',
            project_id: id,
            ...(projectKind ? { project_kind: projectKind } : {}),
          });
          onOpenProject(id);
        }}
        onViewAll={() => {
          trackRecentProjectsClick(analytics.track, {
            page_name: 'home',
            area: 'recent_projects',
            element: 'view_all',
          });
          onViewAllProjects();
        }}
      />

      <PluginsHomeSection
        plugins={plugins}
        loading={pluginsLoading}
        activePluginId={active?.record.id ?? null}
        pendingApplyId={pendingApplyId}
        onUse={(record, action) => requestPluginContextUse(record, action)}
        onOpenDetails={setDetailsRecord}
        onBrowseRegistry={onBrowseRegistry}
        preferDefaultFacet={false}
        presetSelection={presetStartersSelection}
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
            <h2 id="home-hero-confirm-title">{t('homeHero.confirmReplaceTitle')}</h2>
            <p>
              {t('homeHero.confirmReplaceBody', { title: pendingReplacement.title })}
            </p>
            <div className="home-hero-confirm__actions">
              <button
                type="button"
                className="home-hero-confirm__secondary"
                onClick={() => {
                  trackPluginReplacementModalClick(analytics.track, {
                    page_name: 'home',
                    area: 'plugin_replacement_modal',
                    element: 'cancel',
                  });
                  setPendingReplacement(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="home-hero-confirm__primary"
                onClick={() => {
                  trackPluginReplacementModalClick(analytics.track, {
                    page_name: 'home',
                    area: 'plugin_replacement_modal',
                    element: 'replace',
                  });
                  const pluginBefore = pendingReplacement.pluginBefore;
                  const pluginAfter = pendingReplacement.pluginAfter;
                  const action = pendingReplacement.confirm;
                  setPendingReplacement(null);
                  // `action()` now returns a promise that resolves when
                  // the underlying plugin apply finishes (or rejects on
                  // failure). Emitting the result event off the promise
                  // settle is the only way to capture real success /
                  // failure — the synchronous path used to mark every
                  // attempt as a success and never observed the catch
                  // branch.
                  void (async () => {
                    try {
                      await action();
                      trackPluginReplacementResult(analytics.track, {
                        page_name: 'home',
                        area: 'plugin_replacement',
                        plugin_before: pluginBefore ?? '',
                        plugin_after: pluginAfter,
                        result: 'success',
                      });
                    } catch (err) {
                      trackPluginReplacementResult(analytics.track, {
                        page_name: 'home',
                        area: 'plugin_replacement',
                        plugin_before: pluginBefore ?? '',
                        plugin_after: pluginAfter,
                        result: 'failed',
                        error_code:
                          err instanceof Error ? err.message : String(err),
                      });
                    }
                  })();
                }}
              >
                {t('homeHero.confirmReplace')}
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

function projectKindForExamplePlugin(
  record: InstalledPluginRecord,
  chipId: string,
): ProjectKind {
  const mode = homePluginManifestField(record, 'mode');
  const surface = homePluginManifestField(record, 'surface');
  if (mode === 'deck') return 'deck';
  if (mode === 'prototype') return 'prototype';
  if (mode === 'image' || surface === 'image') return 'image';
  if (mode === 'video' || surface === 'video') return 'video';
  if (mode === 'audio' || surface === 'audio') return 'audio';
  const chip = findChip(chipId);
  if (
    chip?.action.kind === 'apply-scenario' ||
    chip?.action.kind === 'apply-figma-migration'
  ) {
    return chip.action.projectKind;
  }
  return 'other';
}

function homePluginManifestField(
  record: InstalledPluginRecord,
  key: string,
): string | null {
  const value = (record.manifest?.od ?? {})[key];
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function defaultPluginIdForChip(chipId: string | null): string | null {
  if (!chipId) return null;
  const chip = findChip(chipId);
  if (
    chip?.action.kind === 'apply-scenario' ||
    chip?.action.kind === 'apply-figma-migration'
  ) {
    return chip.action.pluginId;
  }
  return null;
}

function shouldShowActivePluginChip(active: ActivePlugin | null): boolean {
  if (!active) return false;
  if (!active.chipId) return true;
  return active.record.id !== defaultPluginIdForChip(active.chipId);
}

// Maps a Home hero chip id to the Community facet slice the
// user most likely wants to browse next. The chip rail is intent
// ("I want to design a slide deck"); the starters grid is the catalog
// for that intent, so pinning the same `deck` slice lets the
// user keep scanning examples without re-picking the same artifact
// kind in a different control. The list mirrors the `apply-scenario`
// and `apply-figma-migration` chip ids in `home-hero/chips.ts`; any
// new chip there should add a row here too.
function facetSelectionForChip(chipId: string): FacetSelection | null {
  switch (chipId) {
    case 'prototype': return { category: 'prototype', subcategory: null };
    case 'live-artifact': return { category: 'prototype', subcategory: 'business-dashboards' };
    case 'deck': return { category: 'deck', subcategory: null };
    case 'image': return { category: 'image', subcategory: null };
    case 'video': return { category: 'video', subcategory: null };
    case 'hyperframes': return { category: 'hyperframes', subcategory: null };
    case 'audio': return { category: 'audio', subcategory: null };
    default: return null;
  }
}

function homeHeroChipLabelForId(chipId: string, t: ReturnType<typeof useI18n>['t']): string {
  switch (chipId) {
    case 'prototype': return t('homeHero.chip.prototype');
    case 'live-artifact': return t('homeHero.chip.liveArtifact');
    case 'deck': return t('homeHero.chip.deck');
    case 'image': return t('homeHero.chip.image');
    case 'video': return t('homeHero.chip.video');
    case 'hyperframes': return t('homeHero.chip.hyperframes');
    case 'audio': return t('homeHero.chip.audio');
    case 'create-plugin': return t('homeHero.chip.createPlugin');
    case 'figma': return t('homeHero.chip.figma');
    case 'template': return t('homeHero.chip.template');
    default: return chipId;
  }
}

function footerInputNamesForChip(chipId: string | null): string[] {
  if (chipId === 'prototype') return ['designSystem', 'fidelity'];
  if (chipId === 'deck') return ['designSystem', 'speakerNotes'];
  if (chipId === 'image') return ['designSystem', 'model', 'ratio', 'resolution'];
  if (chipId === 'video') return ['designSystem', 'model', 'ratio', 'duration', 'resolution'];
  if (chipId === 'audio') return ['audioType', 'model', 'duration'];
  if (chipId === 'hyperframes') return ['ratio', 'duration'];
  return [];
}

function homeCreateProjectMetadata(
  projectKind: ProjectKind | null,
  inputs: Record<string, unknown> | null,
  existing: ProjectMetadata | null,
): ProjectMetadata | null {
  const kind = projectKind ?? existing?.kind ?? null;
  if (!kind) return existing;

  const next: ProjectMetadata = {
    ...(existing ?? {}),
    kind,
  };
  const fidelity = normalizeHomeFidelity(inputs?.fidelity);
  if (fidelity) next.fidelity = fidelity;
  const speakerNotes = normalizeHomeSpeakerNotes(inputs?.speakerNotes);
  if (speakerNotes !== null) next.speakerNotes = speakerNotes;
  return next;
}

function normalizeHomeFidelity(value: unknown): ProjectMetadata['fidelity'] | null {
  if (value === 'wireframe' || value === 'high-fidelity') return value;
  return null;
}

function normalizeHomeSpeakerNotes(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'include' ||
    normalized.includes('include')
  ) {
    return true;
  }
  if (
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'none' ||
    normalized.includes('no speaker')
  ) {
    return false;
  }
  return null;
}

function designSystemOptionsForHome(
  systems: DesignSystemSummary[],
  defaultDesignSystemId: string | null,
  logoById: Record<string, string>,
  t: ReturnType<typeof useI18n>['t'],
): HomeDesignSystemOption[] {
  const selectable = systems.filter((system) => {
    if (!system.title) return false;
    if (system.source === 'user') return (system.status ?? 'draft') === 'published';
    return true;
  });
  const systemOptions = selectable
    .map((system) => ({
      id: system.id,
      title: system.title,
      isDefault: system.id === defaultDesignSystemId,
      group: designSystemOptionGroup(system),
      category: system.category,
      summary: system.summary,
      swatches: system.swatches,
      logoUrl: logoById[system.id],
    }))
    .sort((a, b) => {
      const groupDelta = designSystemGroupOrder(a.group) - designSystemGroupOrder(b.group);
      if (groupDelta !== 0) return groupDelta;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  return [
    {
      id: AUTO_DESIGN_SYSTEM_OPTION_ID,
      title: t('homeHero.footer.autoDesignSystem'),
      isDefault: false,
      auto: true,
      summary: t('homeHero.footer.autoDesignSystemSummary'),
    },
    ...systemOptions,
  ];
}

function designSystemOptionGroup(
  system: DesignSystemSummary,
): 'Personal' | 'Official preset' | 'Enterprise' {
  if (system.source === 'user' || system.isEditable === true) return 'Personal';
  if (system.source === 'installed') return 'Enterprise';
  return 'Official preset';
}

function designSystemGroupOrder(group: 'Personal' | 'Official preset' | 'Enterprise'): number {
  if (group === 'Personal') return 0;
  if (group === 'Official preset') return 1;
  return 2;
}

function findDesignSystemLogoFile(files: ProjectFile[]): ProjectFile | null {
  const logoCandidates = files
    .filter((file) => file.type !== 'dir')
    .filter((file) => {
      const name = file.path ?? file.name;
      return file.kind === 'image' || /\.(svg|png|jpe?g|webp|gif)$/iu.test(name);
    });
  return (
    logoCandidates.find((file) => (file.path ?? file.name).toLowerCase() === 'assets/logo.svg') ??
    logoCandidates.find((file) => /(^|\/)(logo|wordmark|brand-mark|brandmark|mark|icon|favicon)[^/]*\.(svg|png|jpe?g|webp|gif)$/iu.test(file.path ?? file.name)) ??
    null
  );
}

function withHomeDesignSystemDefault(
  provided: Record<string, unknown> | undefined,
  fields: InputFieldSpec[],
  designSystemOptions: HomeDesignSystemOption[],
): Record<string, unknown> | undefined {
  if (!fields.some((field) => field.name === 'designSystem')) return provided;
  const current = provided?.designSystem;
  const currentText = current === undefined || current === null ? '' : String(current).trim();
  if (currentText.length > 0 && currentText !== 'the active project design system') {
    return provided;
  }
  const selected = designSystemOptions[0];
  if (!selected) return provided;
  return {
    ...(provided ?? {}),
    designSystem: selected.title,
  };
}

function homeDesignSystemSelectionForInputs(
  inputs: Record<string, unknown> | null,
  designSystemOptions: HomeDesignSystemOption[],
  prompt: string,
): HomeDesignSystemOption | null {
  const value = inputs?.designSystem;
  if (typeof value !== 'string') return null;
  const selectedTitle = value.trim();
  if (!selectedTitle || selectedTitle === 'the active project design system') return null;
  const selected = designSystemOptions.find((option) => option.title === selectedTitle);
  if (selected?.auto || isAutoDesignSystemTitle(selectedTitle, designSystemOptions)) {
    return autoSelectHomeDesignSystem(prompt, designSystemOptions);
  }
  return selected ?? null;
}

function applyHomeDesignSystemSelectionToInputs(
  inputs: Record<string, unknown>,
  selected: HomeDesignSystemOption | null,
  designSystemOptions: HomeDesignSystemOption[],
): Record<string, unknown> {
  if (!selected) return inputs;
  const current = inputs.designSystem;
  if (typeof current !== 'string' || !isAutoDesignSystemTitle(current, designSystemOptions)) return inputs;
  return {
    ...inputs,
    designSystem: selected.title,
  };
}

function isAutoDesignSystemTitle(
  value: string,
  designSystemOptions: HomeDesignSystemOption[],
): boolean {
  const title = value.trim();
  if (LEGACY_AUTO_DESIGN_SYSTEM_TITLES.has(title)) return true;
  return designSystemOptions.some((option) => option.auto && option.title === title);
}

function autoSelectHomeDesignSystem(
  prompt: string,
  designSystemOptions: HomeDesignSystemOption[],
): HomeDesignSystemOption | null {
  const candidates = designSystemOptions.filter((option) => !option.auto);
  if (candidates.length === 0) return null;
  const promptText = normalizeAutoDesignSystemText(prompt);
  const promptTokens = autoDesignSystemTokens(promptText);
  let best: { option: HomeDesignSystemOption; score: number } | null = null;
  for (const option of candidates) {
    const title = normalizeAutoDesignSystemText(option.title);
    const category = normalizeAutoDesignSystemText(option.category ?? '');
    const summary = normalizeAutoDesignSystemText(option.summary ?? '');
    const haystack = `${title} ${category} ${summary}`;
    let score = 0;
    if (title && promptText.includes(title)) score += 18;
    if (category && promptText.includes(category)) score += 8;
    for (const token of promptTokens) {
      if (title.includes(token)) score += 5;
      if (category.includes(token)) score += 3;
      if (summary.includes(token)) score += 2;
      if (haystack.includes(token)) score += 1;
    }
    if (!best || score > best.score) best = { option, score };
  }
  if (best && best.score > 0) return best.option;
  return candidates.find((option) => option.isDefault) ?? candidates[0] ?? null;
}

function normalizeAutoDesignSystemText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function autoDesignSystemTokens(value: string): string[] {
  const seen = new Set<string>();
  const tokens = value
    .split(/[^a-z0-9\u4e00-\u9fff]+/iu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !AUTO_DESIGN_SYSTEM_STOP_WORDS.has(token));
  return tokens.filter((token) => {
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

const AUTO_DESIGN_SYSTEM_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'using',
  'create',
  'make',
  'build',
  'page',
  'site',
  'app',
  'web',
  'design',
  'system',
  'style',
  '一个',
  '这个',
  '使用',
  '生成',
  '设计',
  '页面',
  '网站',
  '应用',
]);

function estimatePluginContextItemCount(
  record: InstalledPluginRecord,
): number {
  const context = record.manifest?.od?.context;
  if (!context) return 0;
  const assetCount = context.assets?.length ?? 0;
  const mcpCount = context.mcp?.length ?? 0;
  const claudePluginCount = context.claudePlugins?.length ?? 0;
  const atomCount = context.atoms?.length ?? 0;
  const craftCount = context.craft?.length ?? 0;
  return assetCount + mcpCount + claudePluginCount + atomCount + craftCount;
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
