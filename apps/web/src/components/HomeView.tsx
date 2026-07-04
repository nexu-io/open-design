// Composed Home view — the top-down layout the entry view renders
// when the left nav rail's "Home" tab is active.
//
// Owns the prompt state + active plugin lifecycle and stitches
// together the smaller pieces (HomeHero, RecentProjectsStrip,
// PluginsHomeSection). Replaces the older left-side `PluginLoopHome`
// surface by lifting its plugin orchestration up here so the prompt
// textarea can live centered in the hero.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogFooter, DialogTitle } from '@open-design/components';
import type {
  ApplyResult,
  ChatSessionMode,
  ConnectorDetail,
  InputFieldSpec,
  McpServerConfig,
  InstalledPluginRecord,
  ProjectKind,
  AudioVoiceOption,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import { projectKindFromMetadataToTracking } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackCommunityGalleryClick,
  trackHomeChatComposerClick,
  trackPageView,
  trackPluginDetailModalClick,
  trackPluginDetailModalSharePopoverClick,
  trackPluginDetailModalSurfaceView,
  trackPluginReplacementModalClick,
  trackPluginReplacementModalSurfaceView,
  trackPluginReplacementResult,
  trackRecentProjectsClick,
} from '../analytics/events';
import {
  applyPlugin,
  createProject,
  duplicatePluginAsProject,
  listPlugins,
  patchProject,
  renderPluginBriefTemplate,
  resolvePluginQueryFallback,
} from '../state/projects';
import { FigmaImportModal } from './FigmaImportModal';
import { fetchMcpServers } from '../state/mcp';
import { takeHomeComposerAssetSeed } from '../state/libraryHandoff';
import { useI18n, useT } from '../i18n';
import {
  localizeSkillName,
  localizeSkillPrompt,
} from '../i18n/content';
import { fetchElevenLabsVoiceOptions } from '../providers/elevenlabs-voices';
import { IMAGE_MODELS } from '../media/models';
import {
  mergeAihubmixImageModels,
  useAIHubMixImageModels,
} from '../media/aihubmix-image-models';
import {
  dirExists,
  fetchRecentLinkedDirs,
  openFolderDialog,
  pushRecentLinkedDir,
} from '../providers/registry';
import { isOpenDesignHostAvailable, pickHostWorkingDir } from '@open-design/host';
import type {
  DesignSystemSummary,
  Project,
  ProjectMetadata,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { inlineMentionToken, mentionTokenPresent } from '../utils/inlineMentions';
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
import { missingRequiredInputs, pluginInputsAreValid } from '../utils/pluginRequiredInputs';
import { HomeHero, type ExamplePromptInfo, type HomeHeroHandle } from './HomeHero';
import { findChip, HOME_HERO_CHIPS, type HomeHeroChip } from './home-hero/chips';
import { homeHeroChipLabel } from './home-hero/chip-labels';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import { consumePendingHomeChip, HOME_CHIP_INTENT_EVENT } from '../runtime/home-intent';
import { navigate } from '../router';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { workspaceContextLinkedDirs } from './workspace-context';
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
import { SkillDetailsModal } from './SkillDetailsModal';
import { HomeTemplatesReveal } from './HomeTemplatesReveal';
import { PluginsHomeSection } from './PluginsHomeSection';
import type { PluginLoopSubmit } from './PluginLoopHome';
import { localizePluginTitle } from './plugins-home/localization';
import type { PluginUseAction } from './plugins-home/useActions';
import { examplePresetSeedPrompt } from './plugins-home/presetSeedPrompt';
import { localizePluginDescription } from './plugins-home/localization';
import { RecentProjectsStrip } from './RecentProjectsStrip';
import { AnimatePresence } from 'motion/react';

export interface ActivePlugin {
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
  // True when `queryTemplate` covers only a suffix of the prompt (the plugin
  // query appended after a user-owned draft), so input extraction must allow
  // an arbitrary mutable prefix instead of anchoring at the start. Set by the
  // use-with-query route.
  queryTemplateAllowsPrefix?: boolean;
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
  // True when the user explicitly picked THIS plugin — an example-prompt preset
  // card or a Community card / detail modal — rather than a type chip binding
  // its default plugin. Drives the active chip's clear (×) affordance. Persisted
  // rather than re-derived from id equality, because a preset's plugin can
  // legitimately equal the chip's default plugin id (e.g. the prototype rail's
  // `example-web-prototype`).
  explicitPick: boolean;
}

// `inlineBacked` distinguishes a context inserted as an inline `@mention` pill
// (added through the mention picker / plus menu, which writes a token into the
// prompt) from a context-only selection made through the plain `Use` action
// (which stages the context without touching the prompt). Inline-backed
// contexts are dropped once their `@` token is deleted; context-only ones stay
// selected until explicitly removed. Conflating the two drops plain `Use`
// selections from the submit payload because they never carry a token.
interface SelectedPluginContext {
  record: InstalledPluginRecord;
  inlineBacked: boolean;
}

interface SelectedMcpContext {
  server: McpServerConfig;
  inlineBacked: boolean;
}

interface SelectedConnectorContext {
  connector: ConnectorDetail;
  inlineBacked: boolean;
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


interface Props {
  isActive?: boolean;
  projects: Project[];
  projectsLoading?: boolean;
  designSystems?: DesignSystemSummary[];
  defaultDesignSystemId?: string | null;
  onSubmit: (payload: PluginLoopSubmit) => Promise<boolean> | boolean | void;
  onOpenProject: (id: string, fileName?: string) => void;
  onViewAllProjects: () => void;
  onDeleteProject?: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicateProject?: (id: string) => Promise<void> | void;
  onRenameProject?: (id: string, name: string) => void;
  onBrowseRegistry?: () => void;
  onOpenIntegrations?: () => void;
  onOpenMcp?: () => void;
  // Stage B: optional callbacks the rail's migration chips need.
  // HomeView itself never imports them; EntryShell threads them
  // through so the dispatcher can stay declarative.
  onOpenNewProject?: (tab: 'template') => void;
  onStartBlankProject?: () => Promise<void> | void;
  promptHandoff?: HomePromptHandoff | null;
  skills?: SkillSummary[];
  skillsLoading?: boolean;
  connectors?: ConnectorDetail[];
  promptTemplates?: PromptTemplateSummary[];
  executionSwitcher?: ReactNode;
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];
const EMPTY_SKILLS: SkillSummary[] = [];
const EMPTY_CONNECTORS: ConnectorDetail[] = [];
const EMPTY_PROMPT_TEMPLATES: PromptTemplateSummary[] = [];

// The Home composer lives inside EntryView, which App.tsx fully UNMOUNTS the
// moment the user opens a project tab (the single `appMain` slot swaps
// EntryView → ProjectView). Plain useState would therefore be discarded on
// every tab switch, so a half-typed prompt and the chosen design system vanish
// when the user steps away and comes back. Persist those two serializable,
// user-visible fields to localStorage so they survive the unmount/remount,
// mirroring ChatComposer's draft persistence. Object-valued selections (active
// template, skill, staged files, working directory) are intentionally NOT
// persisted here — they reference live catalogue records / File handles / a
// desktop auth token that cannot round-trip through JSON safely.
const HOME_COMPOSER_PROMPT_KEY = 'open-design:home-composer:prompt';
const HOME_COMPOSER_DESIGN_SYSTEM_KEY = 'open-design:home-composer:design-system';

function readHomeComposerDraft(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeHomeComposerDraft(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode / quota exceeded) — degrade silently to
    // in-memory-only state; the composer still works for this session.
  }
}

// Drop the persisted draft once a run is actually created, so the just-sent
// prompt and pick don't resurrect the next time the Home tab mounts.
function clearHomeComposerDraft(): void {
  writeHomeComposerDraft(HOME_COMPOSER_PROMPT_KEY, null);
  writeHomeComposerDraft(HOME_COMPOSER_DESIGN_SYSTEM_KEY, null);
}

export function HomeView({
  isActive = true,
  projects,
  projectsLoading,
  designSystems = EMPTY_DESIGN_SYSTEMS,
  defaultDesignSystemId = null,
  onSubmit,
  onOpenProject,
  onViewAllProjects,
  onDeleteProject,
  onDuplicateProject,
  onRenameProject,
  onBrowseRegistry,
  onOpenIntegrations,
  onOpenMcp,
  onOpenNewProject,
  onStartBlankProject,
  promptHandoff,
  skills = EMPTY_SKILLS,
  skillsLoading = false,
  connectors = EMPTY_CONNECTORS,
  promptTemplates = EMPTY_PROMPT_TEMPLATES,
  executionSwitcher,
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
  const [pendingDuplicatePluginId, setPendingDuplicatePluginId] = useState<string | null>(null);
  const [pendingChipId, setPendingChipId] = useState<string | null>(null);
  const [pendingAuthoringChipId, setPendingAuthoringChipId] = useState<string | null>(null);
  const [pendingAuthoringPrompt, setPendingAuthoringPrompt] = useState(PLUGIN_AUTHORING_PROMPT);
  const [pendingAuthoringInputs, setPendingAuthoringInputs] = useState<Record<string, unknown>>(
    () => buildPluginAuthoringInputs(undefined),
  );
  const [pendingPluginUseHandoff, setPendingPluginUseHandoff] =
    useState<PendingPluginUseHandoff | null>(null);
  const [fallbackProjectKind, setFallbackProjectKind] = useState<ProjectKind | null>(null);
  const [fallbackProjectMetadata, setFallbackProjectMetadata] =
    useState<ProjectMetadata | null>(null);
  const [active, setActive] = useState<ActivePlugin | null>(null);
  // A placeholder-carousel scenario the user submitted on an empty composer.
  // We seed the prompt + bind the template synchronously, then let an effect
  // fire submit() once both have committed (submit() reads state, not args).
  const [pendingCarouselSubmit, setPendingCarouselSubmit] = useState<{
    text: string;
    chipId: string | null;
  } | null>(null);
  const [sessionMode, setSessionMode] = useState<ChatSessionMode>('design');
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  const [selectedPluginContexts, setSelectedPluginContexts] = useState<SelectedPluginContext[]>([]);
  const [selectedMcpContexts, setSelectedMcpContexts] = useState<SelectedMcpContext[]>([]);
  const [selectedConnectorContexts, setSelectedConnectorContexts] = useState<SelectedConnectorContext[]>([]);
  const [contextWorkspaceItems, setContextWorkspaceItems] = useState<WorkspaceContextItem[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  // Token paired with `workingDir` when picked through the desktop host's
  // native dialog. Spent on the post-creation working-dir POST so the
  // daemon's desktop-auth gate accepts the path. Null for web picks.
  const [workingDirToken, setWorkingDirToken] = useState<string | null>(null);
  // Global design-system selection for the home composer. Persistent and
  // independent of the active plugin / type chip so EVERY product kind (not
  // just prototype/deck) can pick a design system; the choice is forwarded as
  // the new project's `designSystemId`. Seeded from the user's published
  // Personal default and re-seeded if that resolves async, until the user picks
  // one explicitly (tracked by `designSystemTouchedRef` so a later default
  // change never clobbers an explicit selection).
  // Read the persisted composer draft exactly once per mount (see the module
  // note above). Restoring here is what makes the prompt + design-system pick
  // survive a tab switch, since the whole view is torn down on every switch.
  const restoredDraftRef = useRef<{
    prompt: string;
    designSystemId: string | null;
  } | null>(null);
  if (restoredDraftRef.current === null) {
    restoredDraftRef.current = {
      prompt: readHomeComposerDraft(HOME_COMPOSER_PROMPT_KEY) ?? '',
      designSystemId: readHomeComposerDraft(HOME_COMPOSER_DESIGN_SYSTEM_KEY),
    };
  }
  const restoredDraft = restoredDraftRef.current;
  const [designSystemId, setDesignSystemId] = useState<string | null>(() =>
    restoredDraft.designSystemId ??
    homeDefaultDesignSystemId(designSystems, defaultDesignSystemId),
  );
  // A restored pick counts as user-touched so the async default re-seed effect
  // below does not overwrite it once the catalogue resolves.
  const designSystemTouchedRef = useRef(restoredDraft.designSystemId != null);
  // Global most-recently-used working directories, surfaced in the picker's
  // "Recent folders" submenu. Loaded from the daemon's app-config and bumped
  // whenever the user picks a folder.
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchRecentLinkedDirs().then((dirs) => {
      if (!cancelled) setRecentDirs(dirs);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const rememberRecentDir = useCallback(async (dir: string) => {
    // Optimistically promote the dir to the front so the submenu updates
    // immediately; the daemon also trims/de-dupes/caps the persisted list.
    setRecentDirs((prev) => [dir, ...prev.filter((d) => d !== dir)].slice(0, 5));
    const persisted = await pushRecentLinkedDir(dir);
    setRecentDirs(persisted);
  }, []);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [prompt, setPrompt] = useState(() => restoredDraft.prompt);
  // Treat a restored non-empty prompt as user-edited so the plugin/skill
  // replacement guard still asks before clobbering it.
  const [promptEditedByUser, setPromptEditedByUser] = useState(
    () => restoredDraft.prompt.trim().length > 0,
  );
  // Persist the composer draft on every change so it survives the unmount that
  // a tab switch triggers (see the module note above). Empty values clear the
  // key rather than storing "".
  useEffect(() => {
    writeHomeComposerDraft(HOME_COMPOSER_PROMPT_KEY, prompt);
  }, [prompt]);
  useEffect(() => {
    writeHomeComposerDraft(HOME_COMPOSER_DESIGN_SYSTEM_KEY, designSystemId);
  }, [designSystemId]);
  const [figmaModalOpen, setFigmaModalOpen] = useState(false);
  const examplePromptInfoRef = useRef<ExamplePromptInfo | null>(null);
  const handleExamplePromptStatusChange = useCallback((info: ExamplePromptInfo | null) => {
    examplePromptInfoRef.current = info;
  }, []);
  const [error, setError] = useState<string | null>(null);
  // Composer in-flight guard: disables the send button, shows Sending…, and
  // swallows repeat clicks across the whole async create tail.
  const [sending, setSending] = useState(false);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<AudioVoiceOption[]>([]);
  const [elevenLabsVoicesLoading, setElevenLabsVoicesLoading] = useState(false);
  // Live AIHubMix image catalogue merged into the home media composer's model
  // picker (replaces the static aihubmix seeds when the fetch resolves).
  const aihubmixImageModels = useAIHubMixImageModels();
  const composerImageModels = useMemo(
    () => mergeAihubmixImageModels(IMAGE_MODELS, aihubmixImageModels),
    [aihubmixImageModels],
  );
  const [elevenLabsVoicesLoaded, setElevenLabsVoicesLoaded] = useState(false);
  const [elevenLabsVoicesError, setElevenLabsVoicesError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [detailsSkill, setDetailsSkill] = useState<SkillSummary | null>(null);
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
  // Community gallery analytics. Opening a tile fires both a ui_click on
  // the card (the funnel's denominator) and a surface_view on the detail
  // modal it reveals (the numerator); the ↗ that jumps straight to the
  // real example page is its own ui_click so "go to the finished thing"
  // stays distinct from "open the detail modal". plugin_id / plugin_type
  // mirror PluginsView so the two surfaces join on the same keys.
  const handleCommunityOpenDetails = useCallback(
    (record: InstalledPluginRecord) => {
      const pluginId = record.sourceMarketplaceEntryName ?? record.id;
      const pluginType = record.marketplaceTrust ?? 'official';
      trackCommunityGalleryClick(analytics.track, {
        page_name: 'home',
        area: 'community_gallery',
        element: 'card',
        plugin_id: pluginId,
        plugin_type: pluginType,
      });
      trackPluginDetailModalSurfaceView(analytics.track, {
        page_name: 'home',
        area: 'plugin_detail_modal',
        plugin_id: pluginId,
        plugin_type: pluginType,
      });
      setDetailsRecord(record);
    },
    [analytics.track],
  );
  const inputRef = useRef<HomeHeroHandle | null>(null);
  const homeViewRef = useRef<HTMLDivElement | null>(null);
  const consumedHandoffIdRef = useRef<number | null>(null);
  const pendingPromptFocusEndRef = useRef(false);
  const activePluginApplyRequestRef = useRef(0);
  const scrollHomeToTop = useCallback(() => {
    requestAnimationFrame(() => {
      const scrollContainer = homeViewRef.current?.closest('.entry-main--scroll');
      if (!(scrollContainer instanceof HTMLElement)) return;
      smoothScrollToTop(scrollContainer);
    });
  }, []);
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
        imageModels: composerImageModels,
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
  }, [promptTemplates, elevenLabsVoices, elevenLabsVoiceWarning, elevenLabsVoicesLoading, composerImageModels]);

  useEffect(() => {
    if (!pendingPromptFocusEndRef.current) return;
    pendingPromptFocusEndRef.current = false;
    inputRef.current?.focusEnd();
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
      scrollHomeToTop();
      return;
    }

    setActive(null);
    setActiveSkill(null);
    setSelectedPluginContexts([]);
    setSelectedMcpContexts([]);
    setSelectedConnectorContexts([]);
    setFallbackProjectKind('other');
    setFallbackProjectMetadata(null);
    if (promptHandoff.focus) {
      pendingPromptFocusEndRef.current = true;
    }
    setPrompt(promptHandoff.prompt);
    setPromptEditedByUser(false);
    setPendingAuthoringPrompt(promptHandoff.prompt);
    setPendingAuthoringInputs(promptHandoff.inputs);
    setPendingAuthoringChipId('create-plugin');
    setPendingChipId('create-plugin');
    scrollHomeToTop();
  }, [promptHandoff, scrollHomeToTop]);

  // "Chat to design" hand-off from the Library multi-select bar: the chosen
  // assets are parked as File objects in a single-shot store, then we navigate
  // here. When this view becomes active, drain the seed and stage the files so
  // they ride the normal upload-on-Run path into the new project. The store is
  // single-shot, so later activations with no pending seed are no-ops.
  useEffect(() => {
    if (!isActive) return;
    const seed = takeHomeComposerAssetSeed();
    if (seed && seed.files.length > 0) stageFiles(seed.files);
  }, [isActive]);

  const activeContextItemCount = useMemo(
    () =>
      active
        ? active.result?.contextItems?.length ??
          estimatePluginContextItemCount(active.record)
        : 0,
    [active],
  );
  // Inline-backed contexts are already represented in the composer as `@mention`
  // pills, so they must NOT also drive the active context row — otherwise
  // selecting only an inline-mentioned connector mounts an empty row (count
  // label, no visible children) above the editor. Context-only `Use` selections
  // have no inline representation, so they are the only ones the row should
  // surface (and count).
  const contextItemCount = useMemo(() => {
    const contextOnlyPlugins = selectedPluginContexts.filter(
      (item) => !item.inlineBacked,
    ).length;
    const contextOnlyMcp = selectedMcpContexts.filter(
      (item) => !item.inlineBacked,
    ).length;
    const contextOnlyConnectors = selectedConnectorContexts.filter(
      (item) => !item.inlineBacked,
    ).length;
    return (
      activeContextItemCount +
      contextOnlyPlugins +
      contextOnlyMcp +
      contextOnlyConnectors +
      contextWorkspaceItems.length +
      stagedFiles.length
    );
  }, [
    activeContextItemCount,
    contextWorkspaceItems.length,
    selectedConnectorContexts,
    selectedMcpContexts,
    selectedPluginContexts,
    stagedFiles.length,
  ]);

  // When the active plugin was bound through a chip, the badge shows
  // the chip label (e.g. "Prototype") instead of the underlying plugin
  // record title (e.g. "New generation (default scenario)"). Several
  // chips share od-new-generation, so surfacing the raw plugin title
  // would mislabel what the user actually picked.
  const activeBadge = useMemo(() => {
    if (!active) return { title: null as string | null, isExplicitPlugin: false };
    // A type-chip's default-plugin binding stands in for the task chip: show the
    // chip label and defer clearing to the footer ActiveTypeChip. An explicit
    // pick (example-prompt preset / Community card / detail modal) always shows
    // its own plugin title and owns the clear (×) button — even when the
    // preset's plugin id equals the chip's default plugin.
    if (!active.explicitPick && active.chipId) {
      const defaultPluginId = defaultPluginIdForChip(active.chipId);
      const chip = findChip(active.chipId);
      if (chip && (defaultPluginId === null || defaultPluginId === active.record.id)) {
        return { title: homeHeroChipLabel(chip.id, t), isExplicitPlugin: false };
      }
    }
    return {
      title: localizePluginTitle(locale, active.record),
      isExplicitPlugin: true,
    };
  }, [active, locale, t]);
  const activeBadgeTitle = activeBadge.title;
  const activePluginIsExplicit = activeBadge.isExplicitPlugin;
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

  const designSystemPickerSystems = useMemo(
    () => selectableHomeDesignSystems(designSystems, defaultDesignSystemId),
    [defaultDesignSystemId, designSystems],
  );
  // Re-seed the default selection when the catalogue or the user's default
  // resolves after mount (async load), unless the user already picked one.
  useEffect(() => {
    if (designSystemTouchedRef.current) return;
    setDesignSystemId(homeDefaultDesignSystemId(designSystems, defaultDesignSystemId));
  }, [designSystems, defaultDesignSystemId]);
  // Title of the globally-selected design system (or the "No design system"
  // label). Seeds the active plugin's `designSystem` input — the apply-template
  // hint the rendered brief references — so it mirrors the persistent picker.
  const selectedDesignSystemTitle = useMemo(
    () =>
      designSystemId
        ? designSystemPickerSystems.find((system) => system.id === designSystemId)?.title
            ?? t('designSystemPicker.noneTitle')
        : t('designSystemPicker.noneTitle'),
    [designSystemId, designSystemPickerSystems, t],
  );

  function focusPromptAtEnd() {
    requestAnimationFrame(() => {
      inputRef.current?.focusEnd();
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
      // When true, `queryTemplate` only covers the trailing plugin-query
      // segment (use-with-query appends it after a mutable user draft), so
      // input extraction must allow an arbitrary prefix instead of anchoring
      // the whole prompt.
      queryTemplateAllowsPrefix?: boolean;
      // Type chips are a mode switch, not a commitment to run. Keeping
      // their apply deferred makes Prototype <-> Deck <-> Media changes
      // feel instant; submit() still resolves the snapshot before sending.
      deferApply?: boolean;
      // True when the user explicitly picked this plugin (example-prompt preset
      // or Community card / detail modal) rather than a type chip's default
      // plugin. Stored on `active.explicitPick`; gates the chip's clear button.
      explicitPick?: boolean;
    },
    // Resolves true when the bound plugin left the composer submittable
    // (inputs valid, apply not failed/superseded) — callers use this to
    // decide whether the Send cue should fire.
  ): Promise<boolean> {
    const applyRequestId = activePluginApplyRequestRef.current + 1;
    activePluginApplyRequestRef.current = applyRequestId;
    setActiveSkill(null);
    const shouldResolveImmediately = options?.deferApply !== true;
    const inputFields = options?.inputFields ?? record.manifest?.od?.inputs ?? [];
    const optimisticInputs = hydratePluginInputs(
      inputFields,
      withHomeDesignSystemDefault(options?.inputs, inputFields, selectedDesignSystemTitle),
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
      queryTemplateAllowsPrefix: options?.queryTemplateAllowsPrefix === true,
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
      explicitPick: options?.explicitPick === true,
    });
    setFallbackProjectKind(null);
    setFallbackProjectMetadata(null);
    setDetailsRecord(null);
    if (!suppressPromptUpdate && optimisticPrompt !== null) {
      setPrompt(optimisticPrompt);
      setPromptEditedByUser(false);
    }
    focusPromptAtEnd();

    if (!inputsValid) {
      setPendingChipId(null);
      // Required inputs without defaults: the inputs form is the next step,
      // not Send.
      return false;
    }
    if (!shouldResolveImmediately) return true;

    const result = await resolveActivePlugin(record, optimisticInputs, applyRequestId);
    if (activePluginApplyRequestRef.current !== applyRequestId) return false;
    if (!result) {
      // Roll back the optimistic active so submit can't fire against a
      // plugin that never bound. Only clear when the in-flight apply
      // still matches the visible active state — concurrent clicks
      // would otherwise stomp a successful later apply.
      setActive((prev) => (prev?.record.id === record.id ? { ...prev, inputsValid: false } : prev));
      setError(`Failed to apply ${record.title}. Make sure the daemon is reachable.`);
      return false;
    }
    const reconciledInputs: Record<string, unknown> = { ...optimisticInputs };
    for (const field of result.inputs ?? []) {
      if (field.default !== undefined && reconciledInputs[field.name] === undefined) {
        reconciledInputs[field.name] = field.default;
      }
    }
    const reconciledInputsValid = pluginInputsAreValid(
      options?.preserveInputFields ? inputFields : result.inputs ?? inputFields,
      reconciledInputs,
    );
    setActive((prev) =>
      prev && prev.record.id === record.id
        ? {
            ...prev,
            result,
            inputs: reconciledInputs,
            inputFields: options?.preserveInputFields ? inputFields : result.inputs ?? inputFields,
            inputsValid: reconciledInputsValid,
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
    return reconciledInputsValid;
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
      inputs: withHomeDesignSystemDefault(options?.inputs, options?.inputFields ?? record.manifest?.od?.inputs ?? [], selectedDesignSystemTitle),
      inputFields: options?.inputFields,
      queryTemplate: options?.queryTemplate,
    });
    const confirm = async () => { await usePlugin(record, nextPrompt, options); };
    if (options?.replaceWithoutConfirmation) {
      void confirm();
      return;
    }
    runWithReplacementConfirmation(record.title, replacement, confirm, {
      before: active?.record.id ?? null,
      after: record.id,
    });
  }

  // Picking "Use" on a plugin (from the library hand-off, the Home plugin
  // section, or the details modal) should make that plugin the routed
  // driver of the next run — i.e. set it as the active plugin so its own
  // pipeline + SKILL.md/asset context are applied — rather than only
  // attaching it as background context. Without this, the submit path
  // falls back to the hidden od-default scenario and the plugin's design
  // brief never reaches the agent.
  //
  // Prompt handling preserves the legacy context-use semantics:
  //   - `use-with-query` APPENDS the rendered plugin query to whatever the
  //     user has already typed (never replaces it), then routes the plugin
  //     with that combined prompt as the explicit seed.
  //   - plain `use` leaves the current draft untouched (suppressPromptUpdate)
  //     while still routing the plugin as the active driver.
  async function routePluginUse(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
    inputs?: Record<string, unknown>,
  ) {
    trackCommunityGalleryClick(analytics.track, {
      page_name: 'home',
      area: 'community_gallery',
      element: 'use_plugin',
      plugin_id: record.sourceMarketplaceEntryName ?? record.id,
      plugin_type: record.marketplaceTrust ?? 'official',
      action: action === 'use-with-query' ? 'use_with_query' : 'use',
    });
    if (action === 'use-with-query') {
      // Prompt-loading "Use" seeds the composer with the SAME human-friendly
      // text the Home example-prompt cards use (examplePresetSeedPrompt), NOT the
      // raw `od.useCase.query` — which for many plugins is a generator-facing
      // meta-instruction ("follow the en field verbatim; start from example.html")
      // that reads as gibberish in the textarea. Fallback: plugin description /
      // title (the Home cards inject their richer structured-preview fallback).
      const seed = examplePresetSeedPrompt(
        record,
        locale,
        () => localizePluginDescription(locale, record).trim() || record.title,
      );
      const trimmedSeed = seed.text.trim();
      const currentDraft = prompt.trim();
      // Append, don't replace: keep the user's draft and add the seed below it.
      const combined = !trimmedSeed
        ? prompt
        : !currentDraft
          ? trimmedSeed
          : `${prompt.trimEnd()}\n\n${trimmedSeed}`;
      // Preserve placeholder write-back ONLY when the seed IS the rendered
      // plugin query (a human-friendly, non-meta-instruction query): keep the
      // raw `{{...}}`-bearing template so editing a hydrated value in the
      // composer still flows back into `active.inputs` and submit resolves the
      // snapshot from what the user sees. When we fell back to a description /
      // meta-instruction seed there are no placeholders to extract, so null the
      // template (mirrors the example-prompt card path).
      const rawQueryTemplate = seed.fromRenderedQuery
        ? resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale) || null
        : null;
      const hasTemplate = Boolean(rawQueryTemplate && trimmedSeed);
      const submittable = await usePlugin(record, combined, {
        ...(inputs ? { inputs } : {}),
        queryTemplate: hasTemplate ? rawQueryTemplate : null,
        // Allow an arbitrary prefix whenever we track the query template, so the
        // placeholder extractor matches the query as a suffix even when the user
        // PREPENDS an intro AFTER the seed was inserted (the empty-draft → add
        // prefix → edit placeholder case). Suffix matching is equally correct
        // when there is no prefix at all.
        queryTemplateAllowsPrefix: hasTemplate,
        explicitPick: true,
      });
      scrollHomeToTop();
      // Plugins with required inputs and no defaults land on the inputs
      // form, not Send — only cue Send when submit is actually unlocked.
      if (submittable) {
        inputRef.current?.pulseSend();
      }
      return;
    }
    const submittable = await usePlugin(record, undefined, {
      ...(inputs ? { inputs } : {}),
      suppressPromptUpdate: true,
      explicitPick: true,
    });
    scrollHomeToTop();
    // Plain Use doesn't seed the composer; with no draft and no staged
    // files (or with required inputs still missing) the send button stays
    // disabled, and flashing a disabled button points at a dead end.
    if (submittable && (prompt.trim().length > 0 || stagedFiles.length > 0)) {
      inputRef.current?.pulseSend();
    }
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
    void routePluginUse(
      record,
      pendingPluginUseHandoff.action,
      pendingPluginUseHandoff.inputs,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPluginUseHandoff, pluginsLoading, plugins]);

  function addPluginContext(record: InstalledPluginRecord, nextPrompt: string | null) {
    setSelectedPluginContexts((prev) => {
      if (prev.some((item) => item.record.id === record.id)) return prev;
      return [...prev, { record, inlineBacked: true }];
    });
    if (nextPrompt !== null) setPrompt(nextPrompt);
    setError(null);
    focusPromptAtEnd();
  }

  function useExamplePlugin(record: InstalledPluginRecord, chipId: string, promptText: string) {
    setError(null);
    // Picking a preset card *binds* the plugin (not just a textarea fill):
    // active switches to this exact preset so submit resolves its snapshot and
    // injects the plugin's SKILL.md + example.html as generation context — the
    // output faithfully recreates the reference. `promptText` is the short,
    // editable seed; the full build spec rides along in the plugin context.
    // deferApply mirrors the chip rail: bind now, resolve the snapshot on
    // submit (submit() already re-resolves), so a preset click stays instant
    // and doesn't fire an /apply roundtrip per card. The chip is already
    // active when preset cards are visible, so reuse its project kind/metadata.
    void usePlugin(record, promptText, {
      chipId,
      projectKind: active?.projectKind ?? undefined,
      projectMetadata: active?.projectMetadata ?? null,
      deferApply: true,
      explicitPick: true,
    }).then((submittable) => {
      if (submittable) inputRef.current?.pulseSend();
    });
    focusPromptAtEnd();
  }

  async function duplicateExamplePlugin(record: InstalledPluginRecord) {
    setError(null);
    setPendingDuplicatePluginId(record.id);
    try {
      const result = await duplicatePluginAsProject(record.id, {
        name: localizePluginTitle(locale, record),
      });
      onOpenProject(result.projectId, result.relPath);
    } catch {
      setError(t('pluginCard.duplicateFailed'));
    } finally {
      setPendingDuplicatePluginId(null);
    }
  }

  // "…or start a blank project": create an empty project directly — no dialog,
  // no design system, template, prompt, or plugin — and enter it.
  async function startBlankProject() {
    setError(null);
    try {
      if (onStartBlankProject) {
        await onStartBlankProject();
        return;
      }
      const { project } = await createProject({
        name: t('common.untitled'),
        skillId: null,
        designSystemId: null,
      });
      onOpenProject(project.id);
    } catch {
      setError('Could not create a blank project. Make sure the daemon is reachable.');
    }
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
      { allowPrefix: active.queryTemplateAllowsPrefix === true },
    );
    if (!extracted) return;
    const nextInputs = { ...active.inputs, ...extracted };
    const normalizedInputs = active.mediaSurface
      ? normalizeHomeMediaInputs(active.mediaSurface, nextInputs, promptTemplates, elevenLabsVoices, composerImageModels)
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

  function addWorkspaceContext(item: WorkspaceContextItem) {
    setContextWorkspaceItems((current) =>
      current.some((candidate) => candidate.id === item.id)
        ? current
        : [...current, item],
    );
    setError(null);
  }

  function removeWorkspaceContext(id: string) {
    setContextWorkspaceItems((current) => current.filter((item) => item.id !== id));
  }

  async function handlePickWorkingDir() {
    // On desktop the working-dir POST is gated behind a host-minted token, so
    // pick through the host bridge to capture { baseDir, token } together.
    if (isOpenDesignHostAvailable()) {
      const result = await pickHostWorkingDir();
      if (result.ok) {
        setWorkingDir(result.baseDir);
        setWorkingDirToken(result.token);
        void rememberRecentDir(result.baseDir);
        return result.baseDir;
      }
      // The user explicitly cancelled the host picker — respect that and do
      // not pop a second dialog.
      if ('canceled' in result && result.canceled) return null;
      // The host is present but could not service the pick (mixed-version
      // upgrade where the preload lacks `project.pickWorkingDir`, or a host
      // error). We must NOT fall back to openFolderDialog() here: the browser
      // dialog yields a raw path with no host-minted token, so the later
      // POST /api/projects/:id/working-dir would be rejected by the desktop
      // auth gate and surface as a confusing late create-time failure.
      // Surface the host error instead and keep the existing working dir.
      setError(
        `Couldn't open the folder picker (${'reason' in result ? result.reason : 'host unavailable'}). Please update Open Design and try again.`,
      );
      return null;
    }
    // Pure web path: no desktop host, so there is no token gate — the raw
    // browser folder path is the expected, working input.
    const picked = await openFolderDialog();
    if (picked) {
      setWorkingDir(picked);
      setWorkingDirToken(null);
      void rememberRecentDir(picked);
      return picked;
    }
    return null;
  }

  async function handlePickLocalCodeDir() {
    if (isOpenDesignHostAvailable()) {
      const result = await pickHostWorkingDir();
      if (result.ok) {
        void rememberRecentDir(result.baseDir);
        return result.baseDir;
      }
      if ('canceled' in result && result.canceled) return null;
      setError(
        `Couldn't open the folder picker (${'reason' in result ? result.reason : 'host unavailable'}). Please update Open Design and try again.`,
      );
      return null;
    }
    const picked = await openFolderDialog();
    if (picked) {
      void rememberRecentDir(picked);
      return picked;
    }
    return null;
  }

  function updateActiveInputs(next: Record<string, unknown>) {
    if (!active) return;
    const normalized = active.mediaSurface
      ? normalizeHomeMediaInputs(active.mediaSurface, next, promptTemplates, elevenLabsVoices, composerImageModels)
      : next;
    const mediaComposer = active.mediaSurface
      ? buildHomeMediaComposer(active.mediaSurface, promptTemplates, normalized, elevenLabsVoices, {
          elevenLabsVoiceWarning,
          elevenLabsVoicesLoading,
          imageModels: composerImageModels,
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

  // Persistent design-system picker change. Records the explicit choice and
  // keeps the active plugin's `designSystem` input (the apply-template hint) in
  // sync so the rendered brief references the picked system even after the user
  // switches design systems mid-compose.
  function handleDesignSystemChange(id: string | null) {
    designSystemTouchedRef.current = true;
    setDesignSystemId(id);
    if (active && active.inputFields.some((field) => field.name === 'designSystem')) {
      const title = id
        ? designSystemPickerSystems.find((system) => system.id === id)?.title
            ?? t('designSystemPicker.noneTitle')
        : t('designSystemPicker.noneTitle');
      updateActiveInputs({ ...active.inputs, designSystem: title });
    }
  }

  function clearActivePlugin() {
    if (active?.explicitPick && active.chipId) {
      const chip = findChip(active.chipId);
      const action = chip?.action;
      if (
        chip &&
        (
          action?.kind === 'apply-scenario' ||
          action?.kind === 'apply-figma-migration'
        )
      ) {
        const record = plugins.find((p) => p.id === action.pluginId);
        if (record) {
          const mediaSurface = homeMediaSurfaceForChipId(chip.id);
          setPromptEditedByUser(prompt.trim().length > 0);
          if (mediaSurface) {
            const composer = buildHomeMediaComposer(
              mediaSurface,
              promptTemplates,
              action.inputs,
              elevenLabsVoices,
              {
                elevenLabsVoiceWarning,
                elevenLabsVoicesLoading,
                imageModels: composerImageModels,
              },
            );
            void usePlugin(record, undefined, {
              projectKind: composer.projectKind,
              chipId: chip.id,
              inputs: composer.inputs,
              inputFields: composer.fields,
              queryTemplate: composer.queryTemplate,
              mediaSurface,
              projectMetadata: metadataForHomeMediaComposer(mediaSurface, composer.inputs, promptTemplates),
              editableInputNames: composer.editableFieldNames,
              preserveInputFields: true,
              suppressPromptUpdate: true,
              deferApply: true,
            });
            return;
          }
          void usePlugin(record, undefined, {
            projectKind: action.projectKind,
            chipId: chip.id,
            inputs: action.inputs,
            projectMetadata: action.projectMetadata ?? null,
            suppressPromptUpdate: true,
            deferApply: true,
          });
          return;
        }
      }
    }
    activePluginApplyRequestRef.current += 1;
    setActive(null);
    setFallbackProjectKind(null);
    setFallbackProjectMetadata(null);
    setPendingApplyId(null);
    setPendingChipId(null);
    setPrompt('');
    setPromptEditedByUser(false);
  }

  function clearActiveChipSelection() {
    activePluginApplyRequestRef.current += 1;
    setActive(null);
    setFallbackProjectKind(null);
    setFallbackProjectMetadata(null);
    setPendingApplyId(null);
    setPendingChipId(null);
    setError(null);
    setPromptEditedByUser(prompt.trim().length > 0);
    focusPromptAtEnd();
  }

  function useSkill(skill: SkillSummary, nextPrompt: string | null) {
    activePluginApplyRequestRef.current += 1;
    setActive(null);
    setPendingChipId(null);
    setPendingApplyId(null);
    setFallbackProjectKind(null);
    setFallbackProjectMetadata(null);
    setActiveSkill(skill);
    setError(null);
    const replacement = nextPrompt ?? localizeSkillPrompt(locale, skill) ?? '';
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
        : [...current, { server: _server, inlineBacked: true }]
    ));
    setPrompt(nextPrompt);
    setError(null);
    focusPromptAtEnd();
  }

  function removeMcpContext(serverId: string) {
    const server = selectedMcpContexts.find((item) => item.server.id === serverId)?.server ?? null;
    setSelectedMcpContexts((current) => current.filter((item) => item.server.id !== serverId));
    if (server) {
      setPrompt((current) => removeContextMentionsFromPrompt(current, [
        server.label || server.id,
        server.id,
      ]));
      setPromptEditedByUser(true);
    }
  }

  function useConnector(connector: ConnectorDetail, nextPrompt: string) {
    setSelectedConnectorContexts((current) => (
      current.some((item) => item.connector.id === connector.id)
        ? current
        : [...current, { connector, inlineBacked: true }]
    ));
    setPrompt(nextPrompt);
    setPromptEditedByUser(false);
    setError(null);
    focusPromptAtEnd();
  }

  function removeConnectorContext(connectorId: string) {
    const connector = selectedConnectorContexts.find((item) => item.connector.id === connectorId)?.connector ?? null;
    setSelectedConnectorContexts((current) => current.filter((item) => item.connector.id !== connectorId));
    if (connector) {
      setPrompt((current) => removeContextMentionsFromPrompt(current, [
        connector.name,
        connector.id,
      ]));
      setPromptEditedByUser(true);
    }
  }

  function queuePluginAuthoring(chipId: string | null, goal?: string) {
    const nextInputs = buildPluginAuthoringInputs(goal);
    const nextPrompt = buildPluginAuthoringPromptForInputs(nextInputs);
    runWithReplacementConfirmation('Plugin authoring', nextPrompt, async () => {
      setActive(null);
      setActiveSkill(null);
      setFallbackProjectKind('other');
      setFallbackProjectMetadata(null);
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
              imageModels: composerImageModels,
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
            // Slide deck: they no longer surface inline model/ratio/duration
            // settings (the agent asks for those during the run), and they
            // leave the textarea alone until the user picks a concrete
            // template/preset or types their own prompt.
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
      case 'create-brand-kit': {
        // Brands merged into Design systems: brand extraction now starts from
        // the unified design-system create wizard (which carries the
        // "start from a brand" picker), rather than a separate Brand Kit tab.
        setPendingDesignSystemCreateEntry('home_card');
        navigate({ kind: 'design-system-create' });
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

  // Consume a one-shot Home composer chip intent (e.g. "Use in new chat" on the
  // Brands tab requesting the Prototype scenario). The entry shell keeps
  // HomeView mounted across view switches, so we react to the intent event
  // rather than to mount.
  //
  // The producer (Brands tab) applies the brand's design system as the default
  // and fires the intent in the same synchronous click handler. Consuming the
  // chip inside the event listener would run `pickChip` before React commits
  // that config change, so the composer would seed its design-system field from
  // the stale (empty) default — showing "No design system" for the brand. We
  // therefore only bump a tick from the listener and consume the chip in a
  // separate effect: by the time that effect runs, the re-render has landed and
  // `selectedDesignSystemTitle` reflects the freshly-applied brand.
  const [chipIntentTick, setChipIntentTick] = useState(0);
  useEffect(() => {
    function bumpChipIntent() {
      setChipIntentTick((tick) => tick + 1);
    }
    window.addEventListener(HOME_CHIP_INTENT_EVENT, bumpChipIntent);
    return () => window.removeEventListener(HOME_CHIP_INTENT_EVENT, bumpChipIntent);
  }, []);
  useEffect(() => {
    // Guard on the plugin catalog being loaded — chip dispatch resolves a
    // bundled plugin — and re-run when `plugins` arrives so an intent queued
    // before the catalog loaded is still honored once it does.
    if (plugins.length === 0) return;
    const chipId = consumePendingHomeChip();
    if (!chipId) return;
    const chip = findChip(chipId);
    if (chip) pickChip(chip);
    // pickChip / selectedDesignSystemTitle are recreated each render; this effect
    // runs after the commit that bumped the tick, so the closure it captures
    // already reflects the latest default design system.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugins, chipIntentTick]);

  // Send pressed on an empty composer while the placeholder carousel showed a
  // scenario. Bind that scenario's template exactly as a rail pick would and
  // seed its text, then defer the create to submit() (which resolves the
  // snapshot and builds the same payload the manual flow does).
  function submitScenario(scenario: PlaceholderScenario) {
    if (sending) return;
    setError(null);
    if (pluginsLoading) return;
    const chip = scenario.chipId ? findChip(scenario.chipId) : null;
    const action = chip?.action ?? null;
    const record =
      action?.kind === 'apply-scenario'
        ? plugins.find((plugin) => plugin.id === action.pluginId) ?? null
        : null;
    // When the user already picked this template (the carousel-over-a-selected-
    // template case), its binding is live -- reuse it instead of re-applying,
    // which would reset the resolved snapshot and re-fire chip analytics.
    const alreadyBound = Boolean(chip && active?.chipId === chip.id && !active.explicitPick);
    if (chip && record && !alreadyBound) {
      pickChip(chip);
    } else if (!chip || !record) {
      // Template unavailable (bundle missing / catalog still loading) -- fall
      // back to a free-form create from the line alone rather than dead-ending.
      setActive(null);
    }
    setPrompt(scenario.text);
    setPromptEditedByUser(true);
    setPendingCarouselSubmit({
      text: scenario.text,
      chipId: chip && (record || alreadyBound) ? scenario.chipId : null,
    });
  }

  // Fire the deferred carousel submit once the seeded prompt AND the bound
  // chip have landed in state, so submit()'s closure reads the real values.
  useEffect(() => {
    const pending = pendingCarouselSubmit;
    if (!pending || sending) return;
    if (prompt.trim() !== pending.text.trim()) return;
    if (pending.chipId !== null && active?.chipId !== pending.chipId) return;
    setPendingCarouselSubmit(null);
    void submit();
    // submit() is a stable in-component declaration; depending on it would add
    // churn without changing behavior (mirrors the chip-intent effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCarouselSubmit, prompt, active, sending]);

  async function submit() {
    // The send button disables itself while sending, but the Enter-to-send
    // path lands here directly — swallow re-entry during the in-flight window.
    if (sending) return;
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
      const missing = missingRequiredInputs(
        submittedActive.inputFields,
        submittedActive.inputs,
      );
      setError(
        missing.length > 0
          ? `Fill the required plugin ${missing.length === 1 ? 'parameter' : 'parameters'} before running: ${missing.join(', ')}.`
          : 'Fill the required plugin parameters before running.',
      );
      return;
    }
    setError(null);
    // Sending covers the whole async tail — a pending plugin apply (when one
    // must resolve first) and the project-creation roundtrip are both windows
    // a second click could otherwise re-enter.
    setSending(true);
    try {
      const defaultInputs = { prompt: trimmed };
      // The persistent picker is the single source of truth for the new project's
      // design system, so every product kind (not just prototype/deck) carries
      // the user's selection — the plugin's `designSystem` input is only the
      // apply-template hint and is kept in sync via handleDesignSystemChange.
      const submittedDesignSystemId = designSystemId;
      // Composer inputs are forwarded as-is; the deferred footer/media fields are
      // stripped from this set just below to form the run-facing inputs.
      const submittedApplyInputs = submittedActive ? submittedActive.inputs : defaultInputs;
      // Inputs forwarded to the run AND used to build the run-facing snapshot:
      // drop every now-hidden footer/media setting so the first-turn
      // question-form flow collects them instead of inheriting a baked-in
      // default (`ratio: 16:9`, `duration: 5`, `audioType: speech`, …). The
      // snapshot is resolved from these stripped inputs too — the daemon renders
      // `## Plugin inputs` from `snapshot.inputs` and tells the agent not to
      // re-ask about anything listed there, so leaving the deferred defaults in
      // the snapshot would suppress the discovery flow even though
      // `onSubmit.pluginInputs` was stripped. Stripping only removes non-required
      // fields (`subject`/`style`/`aspect`/`mediaKind` stay), so the
      // od-media-generation apply still validates.
      const submittedPluginInputs = submittedActive
        ? stripArtifactFooterInputs(submittedApplyInputs)
        : defaultInputs;
      const activeInputsChangedForSubmit = submittedActive
        ? !inputsEqual(submittedActive.result?.appliedPlugin?.inputs ?? submittedActive.inputs, submittedPluginInputs)
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
      // Reconcile each selected context against the serialized prompt text before
      // forwarding it. Inline-backed contexts (inserted as `@mention` pills) are
      // only sent while their token survives in the prompt — the Lexical composer
      // lets users delete a mention pill (backspace, edit), and when they do that
      // plugin/MCP/connector should stop being sent. Context-only `Use`
      // selections never carry a token, so they stay in the payload until the
      // user explicitly clears them.
      const contextPlugins = selectedPluginContexts
        .filter((item) => !item.inlineBacked || mentionTokenPresent(trimmed, item.record.title))
        .map((item) => ({
          id: item.record.id,
          title: item.record.title,
          ...(item.record.manifest?.description
            ? { description: item.record.manifest.description }
            : {}),
        }));
      const contextMcpServers = selectedMcpContexts
        .filter((item) => !item.inlineBacked || mentionTokenPresent(trimmed, item.server.label || item.server.id))
        .map((item) => ({
          id: item.server.id,
          ...(item.server.label ? { label: item.server.label } : {}),
          ...(item.server.transport ? { transport: item.server.transport } : {}),
          ...(item.server.url ? { url: item.server.url } : {}),
          ...(item.server.command ? { command: item.server.command } : {}),
        }));
      const contextConnectors = selectedConnectorContexts
        .filter((item) => !item.inlineBacked || mentionTokenPresent(trimmed, item.connector.name))
        .map((item) => ({
          id: item.connector.id,
          name: item.connector.name,
          provider: item.connector.provider,
          category: item.connector.category,
          status: item.connector.status,
          ...(item.connector.accountLabel ? { accountLabel: item.connector.accountLabel } : {}),
        }));
      // Referenced project / local-code folders are required user-selected
      // inputs. If one disappears before submit, fail loudly instead of sending
      // workspace text the daemon cannot back with `--add-dir` access.
      const contextLinkedDirCandidates = workspaceContextLinkedDirs(contextWorkspaceItems);
      const missingContextLinkedDirs =
        contextLinkedDirCandidates.length === 0
          ? []
          : (
              await Promise.all(
                contextLinkedDirCandidates.map(async (dir) => ((await dirExists(dir)) ? null : dir)),
              )
            ).filter((dir): dir is string => Boolean(dir));
      if (missingContextLinkedDirs.length > 0) {
        setError('A selected reference folder is no longer available. Remove or re-pick it before starting the run.');
        return;
      }
      const contextLinkedDirs = contextLinkedDirCandidates;
      const submittedProjectKind =
        submittedActive?.projectKind ?? fallbackProjectKind ?? projectKindForSkill(activeSkill) ?? 'other';
      const submittedProjectMetadata = submittedActive?.mediaSurface
        ? metadataForHomeMediaComposer(submittedActive.mediaSurface, submittedActive.inputs, promptTemplates)
        : homeCreateProjectMetadata(
            submittedProjectKind,
            submittedActive?.inputs ?? null,
            submittedActive?.projectMetadata ?? fallbackProjectMetadata ?? null,
          );
      // Scenario plugins (chips / preset cards) and explicit skill picks are
      // mutually exclusive routing sources. In Design mode, free-form prompts
      // route through the default design router; in Ask mode they stay plain
      // chat conversations with no hidden router plugin.
      const resolvedSkillId = submittedActive ? null : activeSkill?.id ?? null;
      const routedPluginId =
        sessionMode === 'design'
          ? submittedActive?.record.id ?? DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID
          : submittedActive?.record.id ?? null;
      // The example-prompt override is a one-shot marker. Decide whether to
      // send it now, but defer spending the marker until the create is
      // accepted — a rejected attempt stays retryable and must resend it.
      const examplePromptKey = 'od:example-prompt-used';
      const examplePromptToSend =
        examplePromptInfoRef.current != null && localStorage.getItem(examplePromptKey) == null
          ? examplePromptInfoRef.current
          : null;
      const accepted = await onSubmit({
        prompt: trimmed,
        pluginId: routedPluginId,
        pluginType: submittedActive?.record.marketplaceTrust ?? (routedPluginId ? 'official' : null),
        skillId: resolvedSkillId,
        appliedPluginSnapshotId: submittedActive?.result?.appliedPlugin?.snapshotId ?? null,
        pluginTitle: submittedActive?.record.title ?? null,
        taskKind: submittedActive?.result?.appliedPlugin?.taskKind ?? null,
        pluginInputs: submittedPluginInputs,
        projectKind: submittedProjectKind,
        projectMetadata: submittedProjectMetadata,
        designSystemId: submittedDesignSystemId,
        contextPlugins,
        contextMcpServers,
        contextConnectors,
        ...(contextWorkspaceItems.length > 0
          ? { initialRunContext: { workspaceItems: contextWorkspaceItems } }
          : {}),
        attachments: stagedFiles,
        ...(workingDir ? { workingDir } : {}),
        ...(workingDirToken ? { workingDirToken } : {}),
        ...(contextLinkedDirs.length > 0 ? { linkedDirs: contextLinkedDirs } : {}),
        conversationMode: sessionMode,
        ...(examplePromptToSend ? { examplePromptContext: examplePromptToSend } : {}),
      });
      if (accepted === false) {
        setError('Failed to start the run. Make sure the daemon is reachable, then try again.');
        return;
      }
      // Create accepted — now it is safe to spend the one-shot marker.
      if (examplePromptToSend) localStorage.setItem(examplePromptKey, '1');
      // The draft has become a real run; drop it synchronously (before the
      // navigation unmounts us) so the sent prompt + pick don't reappear the
      // next time the Home tab mounts.
      clearHomeComposerDraft();
      // Only drop the staged contexts once the run actually started — a
      // rejected creation keeps them so the retry sends the same payload.
      setSelectedPluginContexts([]);
      setSelectedMcpContexts([]);
      setSelectedConnectorContexts([]);
      setContextWorkspaceItems([]);
    } catch (err) {
      // A submit handler that throws (instead of resolving false) lands on
      // the same recovery path as a rejected creation.
      console.warn('Home composer submit failed', err);
      setError('Failed to start the run. Make sure the daemon is reachable, then try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="home-view" data-testid="home-view" ref={homeViewRef}>
      <HomeHero
        ref={inputRef}
        active={isActive}
        firstRunGuide={projectsLoading ? undefined : projects.length === 0}
        prompt={prompt}
        onPromptChange={handlePromptChange}
        onSubmit={submit}
        onSubmitScenario={submitScenario}
        sessionMode={sessionMode}
        onSessionModeChange={setSessionMode}
        submitting={sending}
        activePluginTitle={activeBadgeTitle}
        activePluginIsExplicit={activePluginIsExplicit}
        activePluginRecord={active?.record ?? null}
        activeSkillId={activeSkill?.id ?? null}
        activeSkillTitle={activeSkill ? localizeSkillName(locale, activeSkill) : null}
        activeSkillRecord={activeSkill}
        activeChipId={active?.chipId ?? null}
        showActivePluginChip={showActivePluginChip}
        onClearActivePlugin={clearActivePlugin}
        onClearActiveChip={clearActiveChipSelection}
        onClearActiveSkill={() => setActiveSkill(null)}
        selectedPluginContexts={selectedPluginContexts.map((item) => item.record)}
        selectedMcpContexts={selectedMcpContexts.map((item) => item.server)}
        selectedConnectorContexts={selectedConnectorContexts.map((item) => item.connector)}
        contextOnlyPlugins={selectedPluginContexts.filter((item) => !item.inlineBacked).map((item) => item.record)}
        contextOnlyMcpServers={selectedMcpContexts.filter((item) => !item.inlineBacked).map((item) => item.server)}
        contextOnlyConnectors={selectedConnectorContexts.filter((item) => !item.inlineBacked).map((item) => item.connector)}
        contextWorkspaceItems={contextWorkspaceItems}
        onRemovePluginContext={removePluginContext}
        onRemoveMcpContext={removeMcpContext}
        onRemoveConnectorContext={removeConnectorContext}
        onAddWorkspaceContext={addWorkspaceContext}
        onRemoveWorkspaceContext={removeWorkspaceContext}
        onAddPlugin={onBrowseRegistry}
        onAddConnector={onOpenIntegrations}
        onAddMcp={onOpenMcp}
        onOpenPluginDetails={setDetailsRecord}
        onOpenSkillDetails={setDetailsSkill}
        pluginInputFields={(active?.inputFields ?? []).filter(
          (field) => !ARTIFACT_FOOTER_FIELD_NAMES.has(field.name),
        )}
        pluginInputValues={active?.inputs ?? {}}
        pluginInputTemplate={active?.queryTemplate ?? null}
        onPluginInputValuesChange={updateActiveInputs}
        inlineEditableInputNames={active?.editableInputNames ?? []}
        footerInputNames={footerInputNamesForChip(active?.chipId ?? null)}
        designSystems={designSystemPickerSystems}
        selectedDesignSystemId={designSystemId}
        onDesignSystemChange={handleDesignSystemChange}
        stagedFiles={stagedFiles}
        onAddFiles={stageFiles}
        onRemoveFile={removeStagedFile}
        onImportFigma={() => setFigmaModalOpen(true)}
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
        onDuplicateExamplePlugin={duplicateExamplePlugin}
        pendingDuplicatePluginId={pendingDuplicatePluginId}
        onPickSkill={useSkill}
        onPickMcp={useMcpServer}
        onPickConnector={useConnector}
        onPickChip={pickChip}
        contextItemCount={contextItemCount}
        error={error}
        workingDir={workingDir}
        recentDirs={recentDirs}
        onPickWorkingDir={handlePickWorkingDir}
        onPickLocalCodeDir={handlePickLocalCodeDir}
        onSelectRecentWorkingDir={(dir) => {
          setWorkingDir(dir);
          // Recents come from the browser-side picker only; they carry no
          // desktop trust token (and linkedDirs don't need one).
          setWorkingDirToken(null);
          void rememberRecentDir(dir);
        }}
        onClearWorkingDir={() => {
          setWorkingDir(null);
          setWorkingDirToken(null);
        }}
        onExamplePromptStatusChange={handleExamplePromptStatusChange}
        onStartBlankProject={() => {
          void startBlankProject();
        }}
        executionSwitcher={executionSwitcher}
      />

      <RecentProjectsStrip
        projects={projects}
        designSystems={designSystems}
        {...(projectsLoading !== undefined ? { loading: projectsLoading } : {})}
        onOpen={(id) => {
          // P0 ui_click area=recent_projects element=project_card — emit
          // before navigation so the event isn't lost when the host
          // re-renders into the project view.
          const project = projects.find((p) => p.id === id);
          const projectKind = projectKindFromMetadataToTracking(project?.metadata);
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
        {...(onDeleteProject ? { onDelete: onDeleteProject } : {})}
        {...(onDuplicateProject ? { onDuplicate: onDuplicateProject } : {})}
        {...(onRenameProject ? { onRename: onRenameProject } : {})}
      />

      <HomeTemplatesReveal
        enabled={!projectsLoading && projects.length === 0}
      >
        <PluginsHomeSection
          plugins={plugins}
          loading={pluginsLoading}
          activePluginId={active?.record.id ?? null}
          pendingApplyId={pendingApplyId}
          pendingDuplicateId={pendingDuplicatePluginId}
          onUse={(record, action) => void routePluginUse(record, action)}
          onDuplicate={(record) => void duplicateExamplePlugin(record)}
          onOpenDetails={handleCommunityOpenDetails}
          onBrowseRegistry={onBrowseRegistry}
          preferDefaultFacet={false}
          cardLayout="gallery"
        />
      </HomeTemplatesReveal>

      <AnimatePresence>
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => {
              // Covers the close button, Esc and the backdrop — every
              // variant funnels dismissal through this single onClose.
              trackPluginDetailModalClick(analytics.track, {
                page_name: 'home',
                area: 'plugin_detail_modal',
                element: 'close',
                plugin_id: detailsRecord.sourceMarketplaceEntryName ?? detailsRecord.id,
                plugin_type: detailsRecord.marketplaceTrust ?? 'official',
              });
              setDetailsRecord(null);
            }}
            onUse={(record, action) => {
              // Track here (not inside routePluginUse) so the gallery's
              // own onUse keeps its community_gallery attribution; the
              // kebab 'use-with-query' action maps to the dropdown face.
              trackPluginDetailModalClick(analytics.track, {
                page_name: 'home',
                area: 'plugin_detail_modal',
                element: action === 'use-with-query' ? 'use_plugin_dropdown' : 'use_plugin',
                plugin_id: record.sourceMarketplaceEntryName ?? record.id,
                plugin_type: record.marketplaceTrust ?? 'official',
              });
              void routePluginUse(record, action);
            }}
            onDuplicate={(record) => {
              setDetailsRecord(null);
              void duplicateExamplePlugin(record);
            }}
            isApplying={pendingApplyId === detailsRecord.id}
            onSharePopoverItemClick={(item) =>
              trackPluginDetailModalSharePopoverClick(analytics.track, {
                page_name: 'home',
                area: 'plugin_detail_share_popover',
                element: item,
                plugin_id: detailsRecord.sourceMarketplaceEntryName ?? detailsRecord.id,
                plugin_type: detailsRecord.marketplaceTrust ?? 'official',
              })}
          />
        ) : null}
        {detailsSkill ? (
          <SkillDetailsModal
            skillId={detailsSkill.id}
            summary={detailsSkill}
            onClose={() => setDetailsSkill(null)}
          />
        ) : null}
        {figmaModalOpen ? (
          <FigmaImportModal
            onClose={() => setFigmaModalOpen(false)}
            resolveProjectId={async () => {
              // The homepage has no project yet; create a bare one to decode
              // the Figma file into, then navigate into it.
              try {
                const { project } = await createProject({
                  name: 'Imported from Figma',
                  skillId: null,
                  designSystemId: null,
                });
                return project.id;
              } catch {
                return null;
              }
            }}
            onImported={(result, projectId) => {
              void (async () => {
                await patchProject(projectId, { pendingPrompt: result.suggestedPrompt });
                setFigmaModalOpen(false);
                onOpenProject(projectId);
              })();
            }}
            onFigmaUrl={(url, notes) => {
              void (async () => {
                const reshapePrompt = `Migrate the Figma file at ${url} into a responsive webpage using its design system.${notes ? ` ${notes}` : ''}`;
                try {
                  const { project } = await createProject({
                    name: 'Imported from Figma',
                    skillId: null,
                    designSystemId: null,
                    pendingPrompt: reshapePrompt,
                  });
                  setFigmaModalOpen(false);
                  onOpenProject(project.id);
                } catch {
                  setFigmaModalOpen(false);
                }
              })();
            }}
          />
        ) : null}
      </AnimatePresence>
      {pendingReplacement ? (
        <Dialog
          backdropClassName="home-hero-confirm__backdrop"
          className="home-hero-confirm"
          includeChromeClassName={false}
          ariaLabelledBy="home-hero-confirm-title"
          closeOnBackdrop={false}
        >
            <DialogTitle id="home-hero-confirm-title">{t('homeHero.confirmReplaceTitle')}</DialogTitle>
            <p>
              {t('homeHero.confirmReplaceBody', { title: pendingReplacement.title })}
            </p>
            <DialogFooter className="home-hero-confirm__actions">
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
            </DialogFooter>
        </Dialog>
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

export function shouldShowActivePluginChip(active: ActivePlugin | null): boolean {
  if (!active) return false;
  // An explicit pick (example-prompt preset / Community card / detail modal)
  // always surfaces its own plugin chip — even when the preset's plugin id
  // equals the chip's default plugin.
  if (active.explicitPick) return true;
  if (!active.chipId) return true;
  // Otherwise a type chip whose default plugin IS this record stands in for the
  // task chip and suppresses a separate plugin chip.
  return active.record.id !== defaultPluginIdForChip(active.chipId);
}

// Prototype/deck-specific settings (fidelity, slide count, speaker notes) are
// no longer promoted into the home composer footer — the agent asks for those
// via the first-turn discovery flow, so the prototype/deck footer keeps only
// the design-system picker. Media surfaces (image/video/audio/hyperframes)
// now defer the same way: image/video keep only the design-system picker and
// audio/hyperframes keep nothing, with model / ratio / resolution / duration /
// audio type collected by the agent via question-form during the run instead
// of inline pre-flight controls.
const ARTIFACT_FOOTER_FIELD_NAMES = new Set([
  'fidelity',
  'slideCount',
  'speakerNotes',
  // Media surfaces (image/video/audio/hyperframes) defer the same way. These
  // were dropped from the footer but `buildHomeMediaComposer` still seeds them
  // (`model: gpt-image-2`, `ratio: 16:9`, `duration: 5`, `audioType: speech`,
  // …) so they must be stripped before submission — otherwise the run arrives
  // with baked-in defaults and the first-turn question-form flow has nothing
  // left to ask. `subject` / `style` / `aspect` / `mediaKind` are intentionally
  // NOT listed: the od-media-generation apply still validates against them.
  'model',
  'ratio',
  'resolution',
  'duration',
  'audioType',
  'voice',
]);

// The prototype/deck footer no longer exposes these settings, so any plugin
// default for them must NOT be seeded into the Home composer's inputs — that
// would forward a prefilled value (e.g. `fidelity: high-fidelity`) to the run
// instead of leaving it "unknown" for the first-turn discovery flow to ask.
function stripArtifactFooterInputs(
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.keys(inputs).some((key) => ARTIFACT_FOOTER_FIELD_NAMES.has(key))) {
    return inputs;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (ARTIFACT_FOOTER_FIELD_NAMES.has(key)) continue;
    next[key] = value;
  }
  return next;
}

function footerInputNamesForChip(_chipId: string | null): string[] {
  // The design-system picker moved out of the input-card footer to the
  // persistent row below the composer (next to the working-directory picker),
  // so it is selectable for every product kind — not just prototype/deck. No
  // other setting is surfaced inline: the agent asks for fidelity / ratio /
  // duration / model / audio kind via the first-turn question-form flow.
  return [];
}

function homeCreateProjectMetadata(
  projectKind: ProjectKind | null,
  _inputs: Record<string, unknown> | null,
  existing: ProjectMetadata | null,
): ProjectMetadata | null {
  const kind = projectKind ?? existing?.kind ?? null;
  if (!kind) return existing;

  // Artifact-specific settings (fidelity, speaker notes, slide count, …) are no
  // longer collected in the home composer; the agent asks for them via
  // question-form, so we only seed `kind` here and let those fields stay
  // unset (the system prompt then marks them "unknown — ask").
  const next: ProjectMetadata = {
    ...(existing ?? {}),
    kind,
  };
  return next;
}

// Selectable design systems for the home composer, sorted to match the picker:
// a user-owned ("Personal") default first, then by group (Personal → Official
// preset → Enterprise) and title. The shared DesignSystemPicker renders its own
// "不指定 / No design system" row, so it is NOT included here.
function selectableHomeDesignSystems(
  systems: DesignSystemSummary[],
  defaultDesignSystemId: string | null,
): DesignSystemSummary[] {
  const selectable = systems.filter((system) => {
    if (!system.title) return false;
    if (system.source === 'user' || system.isEditable === true) return (system.status ?? 'draft') === 'published';
    return true;
  });
  const sorted = [...selectable].sort((a, b) => {
    const groupDelta =
      designSystemGroupOrder(designSystemOptionGroup(a)) - designSystemGroupOrder(designSystemOptionGroup(b));
    if (groupDelta !== 0) return groupDelta;
    const aDefault = a.id === defaultDesignSystemId;
    const bDefault = b.id === defaultDesignSystemId;
    if (aDefault !== bDefault) return aDefault ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  const defaultSystem = sorted.find(
    (system) => system.id === defaultDesignSystemId && designSystemOptionGroup(system) === 'Personal',
  );
  if (!defaultSystem) return sorted;
  return [defaultSystem, ...sorted.filter((system) => system.id !== defaultSystem.id)];
}

// The composer's default selection id. A user-owned ("Personal") default
// design system stays pre-selected; otherwise the composer defaults to
// "不指定 / No design system" (null) so nothing is imposed implicitly and the
// project opens with an empty Design system.
function homeDefaultDesignSystemId(
  systems: DesignSystemSummary[],
  defaultDesignSystemId: string | null,
): string | null {
  const defaultSystem = systems.find(
    (system) =>
      system.id === defaultDesignSystemId &&
      Boolean(system.title) &&
      designSystemOptionGroup(system) === 'Personal' &&
      (system.status ?? 'draft') === 'published',
  );
  return defaultSystem?.id ?? null;
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

// Seed the composer's `designSystem` plugin input with the default selection
// title when the plugin exposes the field and the user hasn't chosen one yet.
function withHomeDesignSystemDefault(
  provided: Record<string, unknown> | undefined,
  fields: InputFieldSpec[],
  defaultDesignSystemTitle: string,
): Record<string, unknown> | undefined {
  if (!fields.some((field) => field.name === 'designSystem')) return provided;
  const current = provided?.designSystem;
  const currentText = current === undefined || current === null ? '' : String(current).trim();
  if (currentText.length > 0 && currentText !== 'the active project design system') {
    return provided;
  }
  return {
    ...(provided ?? {}),
    designSystem: defaultDesignSystemTitle,
  };
}

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

const TEMPLATE_INPUT_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

function extractPluginInputsFromPrompt(
  template: string,
  prompt: string,
  fields: InputFieldSpec[],
  options?: { allowPrefix?: boolean },
): Record<string, unknown> | null {
  TEMPLATE_INPUT_PATTERN.lastIndex = 0;
  const fieldByName = new Map(fields.map((field) => [field.name, field]));
  const keys: string[] = [];
  // `allowPrefix` matches the template as a suffix of the prompt with any
  // leading text allowed. Used by use-with-query, where the plugin query is
  // appended after a user-owned draft prefix: the prefix is mutable and must
  // not be baked into the anchored template, otherwise editing it would break
  // placeholder extraction and leave pluginInputs stale.
  let pattern = options?.allowPrefix ? '[\\s\\S]*?' : '^';
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

function removeContextMentionsFromPrompt(prompt: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.filter(Boolean)));
  return uniqueLabels.reduce((current, label) => {
    const token = inlineMentionToken(label);
    return current.replace(
      new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
      '$1',
    );
  }, prompt);
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
