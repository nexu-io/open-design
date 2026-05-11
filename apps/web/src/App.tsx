import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EntryView } from './components/EntryView';
import type { CreateInput } from './components/NewProjectPanel';
import { MemoryToast } from './components/MemoryToast';
import { PetOverlay } from './components/pet/PetOverlay';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { ProjectView } from './components/ProjectView';
import {
  SettingsDialog,
  type SettingsSection,
} from './components/SettingsDialog';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import {
  daemonIsLive,
  fetchAppVersionInfo,
  fetchAgents,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from './providers/registry';
import { navigate, useRoute } from './router';
import {
  fetchDaemonConfig,
  DEFAULT_PET,
  fetchMediaProvidersFromDaemon,
  hasAnyConfiguredProvider,
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  mergeDaemonMediaProviders,
  saveConfig,
  shouldSyncLocalMediaProvidersToDaemon,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import { applyAppearanceToDocument } from './state/appearance';
import { isMacPlatform } from './utils/platform';
import {
  createProject,
  deleteProject as deleteProjectApi,
  importClaudeDesignZip,
  importFolderProject,
  listProjects,
  listTemplates,
  patchProject,
} from './state/projects';
import { useI18n } from './i18n';
import { liveArtifactTabId } from './types';
import type {
  AgentInfo,
  AppConfig,
  AppVersionInfo,
  DesignSystemSummary,
  Project,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from './types';

export function shouldSyncMediaProvidersOnSave(
  mediaProviders: AppConfig['mediaProviders'],
  options?: { force?: boolean },
): boolean {
  return Boolean(options?.force) || hasAnyConfiguredProvider(mediaProviders);
}

function normalizeSavedComposioConfig(config: AppConfig['composio']): AppConfig['composio'] {
  const apiKey = config?.apiKey?.trim() ?? '';
  if (apiKey) {
    return {
      ...config,
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: apiKey.slice(-4),
    };
  }
  return { ...(config ?? {}) };
}

export async function persistComposioConfigChange(
  current: AppConfig,
  composio: AppConfig['composio'],
  sync: (config: AppConfig['composio']) => Promise<boolean> = syncComposioConfigToDaemon,
): Promise<AppConfig> {
  const saved = await sync(composio);
  if (!saved) throw new Error('Composio config save failed');
  return {
    ...current,
    composio: normalizeSavedComposioConfig(composio),
  };
}

export function buildPersistedConfig(next: AppConfig, current: AppConfig): AppConfig {
  return {
    ...next,
    onboardingCompleted: current.onboardingCompleted ? true : next.onboardingCompleted,
    composio: next.composio
      ? {
          apiKey: '',
          apiKeyConfigured: Boolean(next.composio.apiKeyConfigured),
          apiKeyTail: next.composio.apiKeyTail ?? '',
        }
      : next.composio,
  };
}

/**
 * True when `next` and `last` produce an identical persisted shape —
 * i.e. the only diffs between them are fields that buildPersistedConfig
 * intentionally strips before disk/daemon writes (the Composio API key
 * draft today; any future save-on-explicit-confirm secrets later).
 *
 * The autosave loop in Settings uses this to skip the "All changes
 * saved" indicator transition when the user has only typed an unsaved
 * secret. Without it, autosave completes a no-op write and flashes
 * "Saved" — misleading users into trusting that a sensitive key has
 * been persisted when in fact only the section-local "Save key"
 * gesture commits it.
 */
export function isAutosaveDraftOnlyChange(next: AppConfig, last: AppConfig): boolean {
  return (
    JSON.stringify(buildPersistedConfig(next, next))
    === JSON.stringify(buildPersistedConfig(last, last))
  );
}

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base.onboardingCompleted ? base : { ...base, onboardingCompleted: true };
}

export function App() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const configRef = useRef(config);
  configRef.current = config;
  const latestPersistedConfigRef = useRef(config);
  latestPersistedConfigRef.current = config;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');
  const [daemonLive, setDaemonLive] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  // Functional skills (capabilities the agent invokes mid-task) — stays
  // small and lives under the Settings → Skills surface.
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  // Design templates (rendering catalogue: decks, prototypes, image/video/
  // audio templates) — sourced from /api/design-templates and shown in the
  // EntryView Templates tab. See specs/current/skills-and-design-templates.md.
  const [designTemplates, setDesignTemplates] = useState<SkillSummary[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    PromptTemplateSummary[]
  >([]);
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    null,
  );
  const [daemonMediaProviders, setDaemonMediaProviders] = useState<
    AppConfig['mediaProviders'] | null
  >(null);
  const [daemonMediaProvidersFetchState, setDaemonMediaProvidersFetchState] = useState<
    'idle' | 'ok' | 'error'
  >('idle');
  const [mediaProvidersNotice, setMediaProvidersNotice] = useState<string | null>(null);
  // Per-resource loading flags. Each goes false the moment its own fetch
  // resolves so each entry-view tab can render as its data lands instead of
  // every tab waiting on the slowest endpoint (typically `/api/agents`,
  // which probes CLI versions and can take seconds on cold start). The entry
  // view picks the right flag for whichever tab the user is currently on.
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [dsLoading, setDsLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [promptTemplatesLoading, setPromptTemplatesLoading] = useState(true);
  // Goes true once the daemon-persisted config (agentId/designSystemId/etc.)
  // has merged into local state. Auto-selection effects below wait on this
  // so they don't race ahead of the daemon-stored choice and overwrite it
  // with a freshly picked first-available agent.
  const [daemonConfigLoaded, setDaemonConfigLoaded] = useState(false);
  // Narrower flag dedicated to the Composio API key hydration. The key is
  // persisted by the daemon (and only reflected back via apiKeyConfigured
  // + apiKeyTail), so after a dev-server restart there is a window where
  // the dialog can render an empty Composio input even though a saved key
  // exists. Settings → Connectors uses this to render a skeleton over the
  // input + buttons instead of an empty input that the user might
  // mistake for "no key saved" — and to disable Save/Clear so a misclick
  // can't overwrite the saved state with `''` before hydration lands.
  const [composioConfigLoading, setComposioConfigLoading] = useState(true);
  const route = useRoute();

  // Sync theme preference to the <html> element so CSS variables pick it up.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so a
  // live theme switch in Settings applies atomically — no 1-frame flash of
  // the old theme. Safe here because the component tree is ssr:false.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: config.theme ?? 'system',
      accentColor: config.accentColor,
    });
  }, [config.theme, config.accentColor]);

  // Tell the daemon what the user is currently looking at, so the MCP
  // server can surface it as `get_active_context` to a coding agent in
  // another repo. Best-effort fire-and-forget; the daemon holds it in
  // memory with a short TTL and the MCP layer falls back to
  // {active:false} if this hasn't run.
  const activeProjectId = route.kind === 'project' ? route.projectId : null;
  const activeFileName = route.kind === 'project' ? route.fileName : null;
  const showPrivacyConsent =
    daemonConfigLoaded && config.privacyDecisionAt == null && !settingsOpen;
  useEffect(() => {
    const body = activeProjectId
      ? { projectId: activeProjectId, fileName: activeFileName }
      : { active: false };
    fetch('/api/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Daemon down or transient network — not worth surfacing.
    });
  }, [activeProjectId, activeFileName]);

  // Bootstrap — detect daemon, then fan out independent fetches so each
  // entry-view tab can render the moment its own data lands. Earlier this
  // was one Promise.all behind a global "Loading workspace…" placeholder,
  // which made the slowest endpoint (typically `/api/agents` on cold start)
  // gate every tab including the ones that don't need agents at all.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      if (!alive) {
        // No daemon — clear every loading flag so empty states render
        // instead of the entry view sitting on indefinite spinners.
        setAgentsLoading(false);
        setSkillsLoading(false);
        setDsLoading(false);
        setProjectsLoading(false);
        setPromptTemplatesLoading(false);
        setDaemonConfigLoaded(true);
        // Composio hydration also depends on the daemon. With no daemon
        // we just keep whatever localStorage already held; drop the
        // skeleton so the Settings → Connectors input reflects state.
        setComposioConfigLoading(false);
        return;
      }

      void fetchAgents().then((list) => {
        if (cancelled) return;
        setAgents(list);
        setAgentsLoading(false);
      });

      // Functional skills + design templates land independently. Both
      // gate `skillsLoading` together so the EntryView stops rendering
      // its loader once both registries respond — neither tab would have
      // a complete picture if we cleared the flag on the first reply.
      let functionalReady = false;
      let templatesReady = false;
      const maybeClearLoading = () => {
        if (functionalReady && templatesReady) setSkillsLoading(false);
      };
      void fetchSkills().then((list) => {
        if (cancelled) return;
        setSkills(list);
        functionalReady = true;
        maybeClearLoading();
      });

      void fetchDesignTemplates().then((list) => {
        if (cancelled) return;
        setDesignTemplates(list);
        templatesReady = true;
        maybeClearLoading();
      });

      void fetchDesignSystems().then((list) => {
        if (cancelled) return;
        setDesignSystems(list);
        setDsLoading(false);
      });

      void listProjects().then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectsLoading(false);
      });

      void listTemplates().then((list) => {
        if (cancelled) return;
        setTemplates(list);
      });

      void fetchPromptTemplates().then((list) => {
        if (cancelled) return;
        setPromptTemplates(list);
        setPromptTemplatesLoading(false);
      });

      void fetchAppVersionInfo().then((info) => {
        if (cancelled) return;
        setAppVersionInfo(info);
      });

      // Daemon-persisted config + composio config + media provider config land
      // together so the welcome-modal decision and daemon-backed settings
      // apply in one merge, avoiding a flash where local-only state is shown
      // before daemon overrides it.
      void Promise.all([
        fetchDaemonConfig(),
        fetchComposioConfigFromDaemon(),
        fetchMediaProvidersFromDaemon(),
      ]).then(([
        daemonConfig,
        daemonComposioConfig,
        daemonMediaProvidersResult,
      ]) => {
        if (cancelled) return;
        const daemonMediaProvidersLoaded =
          daemonMediaProvidersResult.status === 'ok'
            ? daemonMediaProvidersResult.providers
            : null;
        setDaemonMediaProviders(daemonMediaProvidersLoaded);
        setDaemonMediaProvidersFetchState(daemonMediaProvidersResult.status);
        setMediaProvidersNotice(
          daemonMediaProvidersResult.status === 'error'
            ? t('settings.mediaProviderLoadError')
            : null,
        );
        setConfig((prev) => {
          const migratedLocalMediaProviders = shouldSyncLocalMediaProvidersToDaemon(
            prev.mediaProviders,
            daemonMediaProvidersLoaded,
          );
          const next = mergeDaemonMediaProviders(
            mergeDaemonConfig(prev, daemonConfig),
            daemonMediaProvidersLoaded,
          );
          const hasLocalComposioKey = Boolean(next.composio?.apiKey?.trim());
          if (!hasLocalComposioKey && daemonComposioConfig) {
            next.composio = daemonComposioConfig;
          }
          saveConfig(next);
          if (
            daemonMediaProvidersResult.status === 'ok' &&
            migratedLocalMediaProviders &&
            hasAnyConfiguredProvider(next.mediaProviders)
          ) {
            void syncMediaProvidersToDaemon(next.mediaProviders, {
              daemonProviders: daemonMediaProvidersLoaded,
            });
          }
          // Migrate localStorage prefs to daemon on first boot with the new
          // endpoint. If daemon already had values the merge above used them;
          // writing back is idempotent and keeps both sides in sync.
          void syncConfigToDaemon(next);
          void syncComposioConfigToDaemon(next.composio);

          // Pop the onboarding modal only on the first run. Once the user
          // has saved or skipped past it once, we trust their stored config
          // and let them re-open Settings explicitly via the env pill. Hold
          // the welcome modal until the privacy decision is resolved; the
          // installation id can rotate later without re-opening the banner.
          if (!next.onboardingCompleted && next.privacyDecisionAt != null) {
            setSettingsWelcome(true);
            setSettingsOpen(true);
          }
          return next;
        });
        setDaemonConfigLoaded(true);
        // Composio key hydration is part of this same daemon-config
        // fetch — by the time we land here the daemon has either
        // returned the saved-key shape (apiKeyConfigured + tail) or
        // it errored and we kept whatever localStorage held. Either
        // way it is safe to drop the skeleton.
        setComposioConfigLoading(false);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-pick the first available agent once both the daemon-stored config
  // and the agents listing have landed. Splitting this out of bootstrap
  // avoids racing the local-config initial value against a slow agents
  // probe — by the time this runs, daemonConfig has already overlaid the
  // user's previous choice, so we only fill an empty slot.
  useEffect(() => {
    if (!daemonConfigLoaded || agentsLoading) return;
    if (config.agentId) return;
    const firstAvailable = agents.find((a) => a.available);
    if (!firstAvailable) return;
    setConfig((prev) => {
      if (prev.agentId) return prev;
      const next: AppConfig = { ...prev, agentId: firstAvailable.id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [daemonConfigLoaded, agentsLoading, agents, config.agentId]);

  // Auto-pick the default design system the same way — only after daemon
  // config has merged so we never overwrite a daemon-stored selection.
  useEffect(() => {
    if (!daemonConfigLoaded || dsLoading) return;
    if (config.designSystemId) return;
    if (designSystems.length === 0) return;
    const id =
      designSystems.find((d) => d.id === 'default')?.id ?? designSystems[0]!.id;
    setConfig((prev) => {
      if (prev.designSystemId) return prev;
      const next: AppConfig = { ...prev, designSystemId: id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [daemonConfigLoaded, dsLoading, designSystems, config.designSystemId]);

  // One-shot self-healing migration for pets adopted before the
  // overlay learned atlas-row switching. If the stored pet is a
  // custom / codex pet whose imageUrl is a single-row strip
  // (no atlas), we silently re-download the full spritesheet so
  // hover, drag, and idle-ambient variety all light up on next render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const upgraded = await migrateCustomPetAtlas(config);
      if (!upgraded || cancelled) return;
      setConfig((prev) => {
        if (!prev.pet) return prev;
        const next: AppConfig = {
          ...prev,
          pet: { ...prev.pet, custom: upgraded },
        };
        saveConfig(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot the config at mount; migration is one-shot per session
    // and should not re-run every time config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
  }, []);

  const refreshTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const reloadMediaProvidersFromDaemon = useCallback(async () => {
    const result = await fetchMediaProvidersFromDaemon();
    if (result.status !== 'ok') {
      setDaemonMediaProvidersFetchState('error');
      setMediaProvidersNotice(
        t('settings.mediaProviderLoadError'),
      );
      return null;
    }
    setDaemonMediaProviders(result.providers);
    setDaemonMediaProvidersFetchState('ok');
    setMediaProvidersNotice(null);
    setConfig((prev) => {
      const merged = mergeDaemonMediaProviders(prev, result.providers);
      saveConfig(merged);
      return merged;
    });
    return result.providers;
  }, []);

  /**
   * Autosave-driven persistence path. The settings dialog calls this on
   * every committed edit (via a debounced effect) so localStorage and
   * the daemon stay in lock-step with the user's draft. We deliberately
   * do NOT touch the Composio secret here — it has its own gesture
   * (handleConfigPersistComposioKey) so partial keys never leave the
   * browser. Onboarding is also left alone; the dialog's close path
   * is the canonical "I'm done" signal.
   */
  const handleConfigPersist = useCallback(async (
    next: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => {
    // Strip the in-flight Composio secret before anything hits disk so
    // a half-typed key can't survive in localStorage. If the dialog is
    // closing, preserve any onboarding completion that the close gesture
    // already committed so an unmount autosave cannot re-open the welcome flow.
    const persisted = buildPersistedConfig(next, configRef.current);
    latestPersistedConfigRef.current = persisted;
    saveConfig(persisted);
    setConfig(persisted);
    const shouldSyncMediaProviders =
      daemonMediaProvidersFetchState === 'ok'
      && shouldSyncMediaProvidersOnSave(persisted.mediaProviders, {
        force: options?.forceMediaProviderSync,
      });
    await Promise.all([
      shouldSyncMediaProviders
        ? syncMediaProvidersToDaemon(persisted.mediaProviders, {
            force: options?.forceMediaProviderSync,
            daemonProviders: daemonMediaProviders,
            throwOnError: options?.forceMediaProviderSync,
          })
        : Promise.resolve(),
      syncConfigToDaemon(persisted),
    ]);
  }, [daemonMediaProviders, daemonMediaProvidersFetchState]);

  /**
   * Explicit Composio API-key save. Called from the section-local
   * "Save key" button so secrets never ride the autosave keystroke
   * loop. Once the daemon confirms, we normalize the saved config
   * (strip the secret, store apiKeyConfigured + apiKeyTail) and feed
   * it back into local state so the saved-key badge appears.
   */
  const handleConfigPersistComposioKey = useCallback(
    async (composio: AppConfig['composio']) => {
      const next = await persistComposioConfigChange(config, composio);
      setConfig((curr) => {
        const merged: AppConfig = { ...curr, composio: next.composio };
        saveConfig(merged);
        return merged;
      });
    },
    [config],
  );

  const handleModeChange = useCallback(
    (mode: AppConfig['mode']) => {
      const next = { ...config, mode };
      saveConfig(next);
      setConfig(next);
    },
    [config],
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      const next = { ...config, agentId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleAgentModelChange = useCallback(
    (agentId: string, choice: { model?: string; reasoning?: string }) => {
      const prev = config.agentModels?.[agentId] ?? {};
      const merged = { ...prev, ...choice };
      const nextAgentModels = {
        ...(config.agentModels ?? {}),
        [agentId]: merged,
      };
      const next = { ...config, agentModels: nextAgentModels };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string) => {
      const next = { ...config, designSystemId };
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const refreshAgents = useCallback(
    async (options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'agentCliEnv')) {
        const nextConfig = { ...config, agentCliEnv: options.agentCliEnv ?? {} };
        saveConfig(nextConfig);
        await syncConfigToDaemon(nextConfig);
        setConfig(nextConfig);
      }
      const next = await fetchAgents({ throwOnError: options?.throwOnError });
      setAgents(next);
      return next;
    },
    [config],
  );

  const handleCreateProject = useCallback(
    async (input: CreateInput & { pendingPrompt?: string }) => {
      // Honor an explicit `null` design system — the create panel defaults
      // to "None" for every kind now, and the user expects that to land
      // as a no-design-system project rather than silently inheriting the
      // workspace default.
      const derivedPendingPrompt =
      input.pendingPrompt ??
      (input.metadata?.promptTemplate?.prompt?.trim() || undefined);

      const result = await createProject({
        name: input.name,
        skillId: input.skillId,
        designSystemId: input.designSystemId,
        pendingPrompt: derivedPendingPrompt,
        metadata: input.metadata,
      });
      if (!result) return;
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        fileName: null,
      });
    },
    [],
  );

  const handleImportClaudeDesign = useCallback(async (file: File) => {
    const result = await importClaudeDesignZip(file);
    if (!result) return;
    setProjects((curr) => [
      result.project,
      ...curr.filter((p) => p.id !== result.project.id),
    ]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: result.entryFile,
    });
  }, []);

  const handleImportFolder = useCallback(async (baseDir: string) => {
    const result = await importFolderProject({ baseDir });
    if (!result) return;
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: result.entryFile,
    });
  }, []);

  // PR #974: on Electron, the desktop main process owns the picker and
  // the import POST atomically (`pickAndImport`). The renderer never
  // sees the path or the HMAC token; it just receives the same
  // ImportFolderResponse shape that `importFolderProject` would
  // produce on web, and the App-level state update is identical.
  const handleImportFolderResponse = useCallback(async (result: import('@open-design/contracts').ImportFolderResponse) => {
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: result.entryFile,
    });
  }, []);

  const handleOpenProject = useCallback((id: string) => {
    navigate({ kind: 'project', projectId: id, fileName: null });
  }, []);

  const handleOpenLiveArtifact = useCallback((projectId: string, artifactId: string) => {
    navigate({ kind: 'project', projectId, fileName: liveArtifactTabId(artifactId) });
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    const ok = await deleteProjectApi(id);
    if (!ok) return;
    setProjects((curr) => curr.filter((p) => p.id !== id));
    if (route.kind === 'project' && route.projectId === id) {
      navigate({ kind: 'home' });
    }
  }, [route]);

  const handleBack = useCallback(() => {
    navigate({ kind: 'home' });
  }, []);

  const handleClearPendingPrompt = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    setProjects((curr) =>
      curr.map((p) =>
        p.id === projectId ? { ...p, pendingPrompt: undefined } : p,
      ),
    );
    void patchProject(projectId, { pendingPrompt: null });
  }, [route]);

  const handleTouchProject = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    const updatedAt = Date.now();
    setProjects((curr) =>
      curr.map((p) => (p.id === projectId ? { ...p, updatedAt } : p)),
    );
    void patchProject(projectId, { updatedAt });
  }, [route]);

  const handleProjectChange = useCallback((updated: Project) => {
    setProjects((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const activeProject =
    route.kind === 'project'
      ? (projects.find((p) => p.id === route.projectId) ?? null)
      : null;

  // Deep-linked route to a project we don't have yet (e.g. after a refresh
  // that finishes after the project list comes back). Fetch it in the
  // background so the view can render rather than bouncing to home.
  useEffect(() => {
    if (route.kind !== 'project') return;
    if (activeProject) return;
    if (!projects.length && !daemonLive) return;
    if (projects.some((p) => p.id === route.projectId)) return;
    let cancelled = false;
    (async () => {
      const list = await listProjects();
      if (cancelled) return;
      setProjects(list);
      if (!list.find((p) => p.id === route.projectId)) {
        navigate({ kind: 'home' }, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, activeProject, projects, daemonLive]);

  const openSettings = useCallback((section: SettingsSection = 'execution') => {
    setSettingsWelcome(false);
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

  const openPetSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsInitialSection('pet');
    setSettingsOpen(true);
  }, []);

  const openMcpSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsInitialSection('mcpClient');
    setSettingsOpen(true);
  }, []);

  // Cmd+, (mac) / Ctrl+, (win/linux) opens Settings. Capture phase so we
  // beat the browser's default Preferences dialog. Platform-gated so
  // meta/ctrl don't conflict across OS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key === ',') {
        if (e.isComposing) return;
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [openSettings]);

  // Explicit enabled toggle — true = wake, false = tuck. Persists to
  // localStorage so the overlay state survives across reloads. We keep
  // `adopted` untouched so the entry-view CTA does not regress to
  // "adopt me" once the user has already chosen.
  const handleSetPetEnabled = useCallback((enabled: boolean) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = { ...curr, pet: { ...prev, enabled } };
      saveConfig(next);
      return next;
    });
  }, []);

  const handleTuckPet = useCallback(
    () => handleSetPetEnabled(false),
    [handleSetPetEnabled],
  );

  // Toggle wake/tuck — used by the pet rail and the composer button.
  const handleTogglePet = useCallback(() => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, enabled: !prev.enabled },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // Inline adopt — the right-hand pet rail and the composer's pet menu
  // both call this to switch pets without bouncing the user into
  // Settings. It always wakes the overlay so the change is visible.
  const handleAdoptPet = useCallback((petId: string) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, adopted: true, enabled: true, petId },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // When the user lands on the entry view (route.kind === 'home'), pull
  // a fresh template list. The template store is global — if they just
  // saved a template inside a project, returning home should reflect it
  // immediately in the From-template tab without forcing a page reload.
  useEffect(() => {
    if (route.kind !== 'home') return;
    void refreshTemplates();
  }, [route.kind, refreshTemplates]);

  // Existing card grids (DesignsTab, ProjectView), pickers (NewProjectPanel,
  // ChatComposer mention) all look skills up by id without caring whether
  // the id resolves to a functional skill or a design template. Pass them
  // the union so the post-split refactor stays invisible to those callers.
  const allSkillSummaries = useMemo(
    () => [...skills, ...designTemplates],
    [skills, designTemplates],
  );
  const enabledSkills = useMemo(
    () =>
      allSkillSummaries.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [allSkillSummaries, config.disabledSkills],
  );
  // Functional-skills-only enabled subset — what ProjectView's chat
  // composer @-picker should see. Without this, a skill the user has
  // disabled in Settings still appears in an existing project's @-mention
  // popover and can ride along to the daemon via skillIds, breaking the
  // Library toggle for projects opened on the post-split branch.
  const enabledFunctionalSkills = useMemo(
    () =>
      skills.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [skills, config.disabledSkills],
  );
  // Templates-only enabled subset — what the EntryView Templates gallery
  // actually renders. Filtering in App keeps the EntryView prop surface
  // narrow ("here are the templates the user has not disabled").
  const enabledDesignTemplates = useMemo(
    () =>
      designTemplates.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [designTemplates, config.disabledSkills],
  );
  const enabledDS = useMemo(
    () =>
      designSystems.filter(
        (d) => !(config.disabledDesignSystems ?? []).includes(d.id),
      ),
    [designSystems, config.disabledDesignSystems],
  );

  return (
    <>
      {activeProject ? (
        <ProjectView
          key={activeProject.id}
          project={activeProject}
          routeFileName={route.kind === 'project' ? route.fileName : null}
          config={config}
          agents={agents}
          skills={enabledFunctionalSkills}
          designTemplates={designTemplates}
          designSystems={designSystems}
          daemonLive={daemonLive}
          onModeChange={handleModeChange}
          onAgentChange={handleAgentChange}
          onAgentModelChange={handleAgentModelChange}
          onRefreshAgents={refreshAgents}
          onOpenSettings={openSettings}
          onOpenMcpSettings={openMcpSettings}
          onAdoptPetInline={handleAdoptPet}
          onTogglePet={handleTogglePet}
          onOpenPetSettings={openPetSettings}
          onBack={handleBack}
          onClearPendingPrompt={handleClearPendingPrompt}
          onTouchProject={handleTouchProject}
          onProjectChange={handleProjectChange}
          onProjectsRefresh={refreshProjects}
        />
      ) : (
        <EntryView
          skills={enabledSkills}
          designTemplates={enabledDesignTemplates}
          designSystems={enabledDS}
          projects={projects}
          templates={templates}
          promptTemplates={promptTemplates}
          defaultDesignSystemId={config.designSystemId}
          config={config}
          agents={agents}
          skillsLoading={skillsLoading}
          designSystemsLoading={dsLoading}
          projectsLoading={projectsLoading}
          promptTemplatesLoading={promptTemplatesLoading}
          onCreateProject={handleCreateProject}
          onImportClaudeDesign={handleImportClaudeDesign}
          onImportFolder={handleImportFolder}
          onImportFolderResponse={handleImportFolderResponse}
          onOpenProject={handleOpenProject}
          onOpenLiveArtifact={handleOpenLiveArtifact}
          onDeleteProject={handleDeleteProject}
          onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
          onOpenSettings={openSettings}
          onAdoptPet={openPetSettings}
          onAdoptPetInline={handleAdoptPet}
          onTogglePet={handleTogglePet}
        />
      )}
      <PetOverlay
        pet={config.pet?.enabled ? config.pet : undefined}
        onTuck={handleTuckPet}
        onOpenSettings={openPetSettings}
      />
      {settingsOpen ? (
        <SettingsDialog
          initial={config}
          agents={agents}
          daemonLive={daemonLive}
          appVersionInfo={appVersionInfo}
          welcome={settingsWelcome}
          initialSection={settingsInitialSection}
          composioConfigLoading={composioConfigLoading}
          onPersist={handleConfigPersist}
          onPersistComposioKey={handleConfigPersistComposioKey}
          onClose={() => {
            // Closing the dialog is the canonical "I'm done" gesture
            // now that there is no global Save button. We mark
            // onboardingCompleted on close so the welcome modal stops
            // re-prompting on every refresh, regardless of whether
            // the user changed anything during the session.
            const next = resolveSettingsCloseConfig(config, latestPersistedConfigRef.current);
            if (!next.onboardingCompleted || !config.onboardingCompleted) {
              latestPersistedConfigRef.current = next;
              saveConfig(next);
              void syncConfigToDaemon(next);
              setConfig(next);
            }
            setSettingsOpen(false);
          }}
          onRefreshAgents={refreshAgents}
          daemonMediaProviders={daemonMediaProviders}
          daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
          mediaProvidersNotice={mediaProvidersNotice}
          onReloadMediaProviders={reloadMediaProvidersFromDaemon}
        />
      ) : null}
      <MemoryToast onOpenMemory={() => openSettings('memory')} />
      {/* First-run privacy consent banner. It waits for daemon config
          hydration because privacyDecisionAt is daemon-owned and stripped
          from localStorage. It also yields while Settings is open so the
          floating banner never intercepts modal interactions. */}
      {showPrivacyConsent ? (
        <PrivacyConsentModal
          onShare={() => {
            const installationId = generateInstallationIdSafe();
            void handleConfigPersist({
              ...latestPersistedConfigRef.current,
              installationId,
              privacyDecisionAt: Date.now(),
              telemetry: { metrics: true, content: true, artifactManifest: false },
            });
            // Hand the foreground over to the welcome modal now that the
            // privacy decision is recorded — bootstrap deferred opening
            // it while consent was pending.
            if (!latestPersistedConfigRef.current.onboardingCompleted) {
              setSettingsWelcome(true);
              setSettingsOpen(true);
            }
          }}
          onDecline={() => {
            void handleConfigPersist({
              ...latestPersistedConfigRef.current,
              installationId: null,
              privacyDecisionAt: Date.now(),
              telemetry: { metrics: false, content: false, artifactManifest: false },
            });
            if (!latestPersistedConfigRef.current.onboardingCompleted) {
              setSettingsWelcome(true);
              setSettingsOpen(true);
            }
          }}
        />
      ) : null}
    </>
  );
}

function generateInstallationIdSafe(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
