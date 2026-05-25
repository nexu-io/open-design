import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useAnalytics } from './analytics/provider';
import {
  trackFileUploadResult,
  trackProjectCreateResult,
} from './analytics/events';
import { deriveUploadCohort } from './analytics/upload-tracking';
import { detectClientType } from './analytics/identity';
import {
  deriveConfigureGlobals,
  projectKindToTracking,
  fidelityToTracking,
} from '@open-design/contracts/analytics';
import { EntryView } from './components/EntryView';
import type { IntegrationTab } from './components/IntegrationsView';
import { MarketplaceView } from './components/MarketplaceView';
import { PluginDetailView } from './components/PluginDetailView';
import type { CreateInput } from './components/NewProjectPanel';
import { MemoryToast } from './components/MemoryToast';
import { PetOverlay, type PetTaskCenter } from './components/pet/PetOverlay';
import { buildPetTaskCenter } from './components/pet/taskCenter';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { ProjectView } from './components/ProjectView';
import { openWorkspaceTab, WorkspaceTabsBar } from './components/WorkspaceTabsBar';
import {
  DesignSystemCreationFlow,
  DesignSystemDetailView,
} from './components/DesignSystemFlow';
import {
  SettingsDialog,
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
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
  uploadProjectFiles,
} from './providers/registry';
import { RUNS_CHANGED_EVENT, listProjectRuns } from './providers/daemon';
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
  createPluginShareProject,
  deleteProject as deleteProjectApi,
  getProject,
  importClaudeDesignZip,
  importFolderProject,
  listProjects,
  listTemplates,
  deleteTemplate,
  patchProject,
} from './state/projects';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from './state/projects';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useI18n } from './i18n';
import { liveArtifactTabId } from './types';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppVersionInfo,
  ChatAttachment,
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
  const clientType = useMemo(() => detectClientType(), []);
  // Observability marker. `apps/web/src/observability/white-screen.ts`
  // keys its "app actually mounted" success condition on this attribute
  // because the dynamic-import loading shell (`<div class="od-loading-shell">
  // Loading Open Design…</div>`) is itself >MIN_VISIBLE_TEXT and would
  // otherwise be mistaken for a real mount. Survives subsequent render
  // crashes — once App has mounted at least once, it's no longer a white
  // screen (subsequent failures show up as `$exception`).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-od-app-mounted', '1');
    }
  }, []);
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const configRef = useRef(config);
  configRef.current = config;
  const latestPersistedConfigRef = useRef(config);
  latestPersistedConfigRef.current = config;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');
  const [integrationInitialTab, setIntegrationInitialTab] = useState<IntegrationTab>('mcp');
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
  const [petTaskCenter, setPetTaskCenter] = useState<PetTaskCenter>({
    running: [],
    queued: [],
    recent: [],
  });
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
  const analytics = useAnalytics();

  // v2 schema removed the standalone `app_launch` event; the initial
  // page_view fires from each top-level page surface (home / projects /
  // automations / plugins / design_systems / integrations) instead.
  // `detectClientType` still feeds analytics identity via the provider.
  void detectClientType;

  // Propagate the Privacy toggle through to PostHog without a reload —
  // posthog-js's opt_out_capturing flips a localStorage flag that makes
  // every subsequent capture() a no-op. When the user opts back in we
  // call opt_in_capturing to resume.
  useEffect(() => {
    analytics.setConsent(config.telemetry?.metrics === true);
  }, [analytics.setConsent, config.telemetry?.metrics]);

  // Sync PostHog's distinct_id with the anonymous installationId, both on
  // first opt-in (when the daemon stamps a fresh id) and on Delete-my-data
  // rotation (when PrivacySection.tsx generates a new one). posthog-js
  // caches the previous id in localStorage; identify() alone would stitch
  // the two ids together, so applyIdentity() does reset() first to
  // guarantee the new session is fully decoupled from the deleted one.
  useEffect(() => {
    if (config.telemetry?.metrics !== true) return;
    analytics.setIdentity(config.installationId ?? null);
  }, [analytics.setIdentity, config.installationId, config.telemetry?.metrics]);

  // v2 analytics requires every event to carry the configure-state
  // triplet (has_available_configure_cli / configure_type /
  // configure_availability). We push it into the PostHog global register
  // whenever the user's execution-mode config or the detected agent list
  // changes; the next capture inherits the fresh values, so dashboards
  // can segment by execution setup without per-helper boilerplate.
  //
  // Gated on `agentsLoading` so the cold-start probe (`fetchAgents()`
  // lands asynchronously after this effect's first run) does not stamp
  // the first home/projects/plugins page_view with
  // has_available_configure_cli=false / configure_availability=unavailable
  // on machines that DO have an installed CLI. While the probe is in
  // flight we leave the boot defaults ('unknown'/'unknown') in place,
  // matching what the helper would return for an empty agent list with
  // no mode pinned.
  useEffect(() => {
    if (agentsLoading) return;
    const byokConfigured = (() => {
      const protocols = config.apiProtocolConfigs;
      if (!protocols) return Boolean(config.apiKey?.trim());
      return Object.values(protocols).some(
        (cfg) => Boolean(cfg?.apiKey?.trim()),
      );
    })();
    const globals = deriveConfigureGlobals({
      mode: config.mode,
      agentId: config.agentId,
      agents: agents.map((a) => ({ id: a.id, available: a.available })),
      byokConfigured,
    });
    analytics.setConfigureGlobals(globals);
  }, [
    analytics.setConfigureGlobals,
    agentsLoading,
    config.mode,
    config.agentId,
    config.apiKey,
    config.apiProtocolConfigs,
    agents,
  ]);

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
  // Gate the privacy banner on three things:
  //   1. Daemon config has hydrated (privacyDecisionAt is daemon-owned).
  //   2. The user has not yet made a privacy decision.
  //   3. Onboarding is complete (Skip and design-system creation both flip
  //      onboardingCompleted to true; see handleCompleteOnboarding wiring).
  // Once onboarding is done the banner is allowed on any route — including
  // the project view the design-system finish path drops the user into, so
  // they can read and acknowledge the disclosure while the first generation
  // is running. Settings is irrelevant to visibility; the banner sits above
  // the modal-backdrop layer in index.css so opening Settings does not hide
  // it.
  const showPrivacyConsent =
    daemonConfigLoaded &&
    config.privacyDecisionAt == null &&
    config.onboardingCompleted === true;
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
        // Compute the next config outside the setConfig updater so we can
        // both (a) call navigate() after setConfig returns — calling it
        // inside the updater would trigger a Router setState during React's
        // render phase — and (b) read next.onboardingCompleted synchronously,
        // since React batches setConfig and the updater doesn't run until
        // the next render. latestPersistedConfigRef is kept in sync with
        // the rendered config and is safe to read here.
        const baseConfig = latestPersistedConfigRef.current;
        const migratedLocalMediaProviders = shouldSyncLocalMediaProvidersToDaemon(
          baseConfig.mediaProviders,
          daemonMediaProvidersLoaded,
        );
        const next = mergeDaemonMediaProviders(
          mergeDaemonConfig(baseConfig, daemonConfig),
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
        latestPersistedConfigRef.current = next;
        setConfig(next);

        // Route first-run users through the global onboarding panel.
        // The onboarding panel and the privacy banner have independent
        // lifecycles: onboarding keys off `onboardingCompleted`, the
        // banner keys off `privacyDecisionAt`. They may coexist on the
        // first launch; the banner sits above the modal layer so it
        // stays actionable regardless of the active view.
        if (!next.onboardingCompleted) {
          navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
        }
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

  const refreshDesignSystems = useCallback(async () => {
    const list = await fetchDesignSystems();
    setDesignSystems(list);
  }, []);

  const refreshTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) await refreshTemplates();
    return ok;
  }, [refreshTemplates]);

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

  // Quick theme switch from the settings dropdown in the entry view.
  // Skips the full SettingsDialog round-trip so the appearance flip
  // feels instantaneous; the live preview comes for free because the
  // `useLayoutEffect` above re-runs `applyAppearanceToDocument` the
  // moment `config.theme` changes. We still persist to localStorage
  // and the daemon so the choice survives reloads.
  const handleThemeChange = useCallback(
    (theme: AppConfig['theme']) => {
      const next = { ...config, theme };
      saveConfig(next);
      void syncConfigToDaemon(next);
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

  // BYOK protocol switch — also flips `mode` to 'api' so the user does
  // not have to take a second step after picking a provider from the
  // inline switcher. The helper preserves any per-protocol fields the
  // user had previously configured for the target protocol.
  const handleApiProtocolChange = useCallback(
    (protocol: ApiProtocol) => {
      const next = switchApiProtocolConfig(config, protocol);
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  // BYOK model picker — patches `model` (and the per-protocol shadow
  // copy) without touching apiKey/baseUrl so the user can swap models
  // mid-session without retyping their key.
  const handleApiModelChange = useCallback(
    (model: string) => {
      const next = updateCurrentApiProtocolConfig(config, { model });
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [config],
  );

  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string | null) => {
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
    async (
      input: CreateInput & {
        pendingPrompt?: string;
        pluginId?: string;
        appliedPluginSnapshotId?: string;
        pluginInputs?: Record<string, unknown>;
        autoSendFirstMessage?: boolean;
        requestId?: string;
        pendingFiles?: File[];
      },
    ): Promise<boolean> => {
      // Honor an explicit `null` design system — the create panel defaults
      // to "None" for every kind now, and the user expects that to land
      // as a no-design-system project rather than silently inheriting the
      // workspace default.
      const derivedPendingPrompt =
      input.pendingPrompt ??
      (input.metadata?.promptTemplate?.prompt?.trim() || undefined);

      const kind = input.metadata?.kind ?? null;
      const fidelity = fidelityToTracking(input.metadata?.fidelity ?? null);
      const creationSource: 'blank' | 'template' | 'zip' | 'folder' =
        kind === 'template' ? 'template' : 'blank';
      const result = await createProject({
        name: input.name,
        skillId: input.skillId,
        designSystemId: input.designSystemId,
        pendingPrompt: derivedPendingPrompt,
        metadata: input.metadata,
        ...(input.pluginId ? { pluginId: input.pluginId } : {}),
        ...(input.appliedPluginSnapshotId
          ? { appliedPluginSnapshotId: input.appliedPluginSnapshotId }
          : {}),
        ...(input.pluginInputs ? { pluginInputs: input.pluginInputs } : {}),
      });
      if (!result) {
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: null,
            project_kind: projectKindToTracking(kind),
            fidelity,
            result: 'failed',
            error_code: 'CREATE_REQUEST_FAILED',
          },
          { requestId: input.requestId },
        );
        return false;
      }
      const pendingFiles = Array.isArray(input.pendingFiles)
        ? input.pendingFiles.filter((file): file is File => file instanceof File)
        : [];
      let firstMessageAttachments: ChatAttachment[] = [];
      if (pendingFiles.length > 0) {
        // Home composer attaches stay client-side until submit lands a
        // project; the actual upload happens here. v2 doc wants one
        // file_upload_result per surface — `page_name='home'` /
        // `area='chat_composer'` so it's distinguishable from the
        // file_manager Upload button and the chat_panel composer.
        const cohort = deriveUploadCohort(pendingFiles);
        const uploadResult = await uploadProjectFiles(result.project.id, pendingFiles);
        firstMessageAttachments = uploadResult.uploaded;
        const partial = uploadResult.failed.length > 0;
        if (partial) {
          console.warn('Some Home attachments failed to upload', uploadResult.failed);
        }
        trackFileUploadResult(analytics.track, {
          page_name: 'home',
          area: 'chat_composer',
          project_id: result.project.id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && uploadResult.error
            ? { error_code: uploadResult.error }
            : {}),
        });
      }
      trackProjectCreateResult(
        analytics.track,
        {
          page_name: 'home',
          area: 'new_project',
          project_source: 'create_button',
          project_id: result.project.id,
          project_kind: projectKindToTracking(kind),
          fidelity,
          result: 'success',
        },
        { requestId: input.requestId },
      );
      // PluginLoopHome flow: the user already typed (or accepted) the
      // first message on Home. Mark this project so ProjectView fires
      // sendMessage(pendingPrompt) once on mount instead of just
      // pre-filling the composer. Scoped to sessionStorage so a page
      // reload after the run has started does not refire.
      if (
        input.autoSendFirstMessage &&
        (derivedPendingPrompt !== undefined || firstMessageAttachments.length > 0)
      ) {
        try {
          window.sessionStorage.setItem(
            `od:auto-send-first:${result.project.id}`,
            '1',
          );
          if (firstMessageAttachments.length > 0) {
            window.sessionStorage.setItem(
              `od:auto-send-attachments:${result.project.id}`,
              JSON.stringify(firstMessageAttachments),
            );
          } else {
            window.sessionStorage.removeItem(
              `od:auto-send-attachments:${result.project.id}`,
            );
          }
        } catch {
          /* sessionStorage may be unavailable (e.g. SSR / private mode); fall
             back to manual send. */
        }
      }
      const project = result.appliedPluginSnapshotId
        ? {
            ...result.project,
            appliedPluginSnapshotId: result.appliedPluginSnapshotId,
          }
        : result.project;
      flushSync(() => {
        setProjects((curr) => [
          project,
          ...curr.filter((p) => p.id !== project.id),
        ]);
      });
      const projectRoute = {
        kind: 'project',
        projectId: project.id,
        fileName: null,
      } as const;
      openWorkspaceTab(projectRoute);
      navigate(projectRoute);
      return true;
    },
    [analytics.track],
  );

  const handleCreatePluginShareProject = useCallback(
    async (
      pluginId: string,
      action: PluginShareAction,
      locale?: string,
    ): Promise<PluginShareProjectOutcome> => {
      const outcome = await createPluginShareProject(pluginId, action, locale);
      if (!outcome.ok) return outcome;
      try {
        window.sessionStorage.setItem(
          `od:auto-send-first:${outcome.project.id}`,
          '1',
        );
      } catch {
        // If sessionStorage is unavailable, the project still opens with
        // the prepared prompt in the composer.
      }
      const project = outcome.appliedPluginSnapshotId
        ? {
            ...outcome.project,
            appliedPluginSnapshotId: outcome.appliedPluginSnapshotId,
          }
        : outcome.project;
      setProjects((curr) => [
        project,
        ...curr.filter((p) => p.id !== project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: project.id,
        fileName: null,
      });
      return outcome;
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
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: result.entryFile,
    });
  }, []);

  // PR #974: on desktop, the host bridge owns the picker and import POST
  // atomically. The renderer never sees the path, token, or daemon DTO;
  // it receives host-owned project identifiers and refreshes project state
  // through the normal daemon API.
  const handleImportFolderResponse = useCallback(async (result: OpenDesignHostProjectImportSuccess) => {
    const project = await getProject(result.projectId);
    if (project != null) {
      setProjects((curr) => [project, ...curr.filter((p) => p.id !== project.id)]);
    } else {
      const list = await listProjects();
      setProjects(list);
    }
    navigate({
      kind: 'project',
      projectId: result.projectId,
      fileName: result.entryFile,
    });
  }, []);

  const handleOpenProject = useCallback((id: string) => {
    navigate({ kind: 'project', projectId: id, fileName: null });
  }, []);

  useEffect(() => {
    if (!config.pet?.enabled || !daemonLive) {
      setPetTaskCenter({ running: [], queued: [], recent: [] });
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const runs = await listProjectRuns();
      if (cancelled) return;
      setPetTaskCenter(buildPetTaskCenter(projects, runs));
    };
    const handleRunsChanged = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    const id = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      window.clearInterval(id);
    };
  }, [config.pet?.enabled, daemonLive, projects]);

  const handleOpenLiveArtifact = useCallback((projectId: string, artifactId: string) => {
    navigate({ kind: 'project', projectId, fileName: liveArtifactTabId(artifactId) });
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    const ok = await deleteProjectApi(id);
    if (!ok) return false;
    setProjects((curr) => curr.filter((p) => p.id !== id));
    if (route.kind === 'project' && route.projectId === id) {
      navigate({ kind: 'home', view: 'home' });
    }
    return true;
  }, [route]);

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((curr) =>
      curr.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    );
    void patchProject(id, { name: trimmed });
  }, []);

  const handleBack = useCallback(() => {
    navigate({ kind: 'home', view: 'home' });
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
      const project = await getProject(route.projectId);
      if (cancelled) return;
      if (project) {
        setProjects((curr) => {
          const existingIndex = curr.findIndex((candidate) => candidate.id === project.id);
          if (existingIndex < 0) {
            return [...curr, project];
          }
          return curr.map((candidate) => (candidate.id === project.id ? project : candidate));
        });
        return;
      }
      const list = await listProjects();
      if (cancelled) return;
      setProjects(list);
      if (!list.find((p) => p.id === route.projectId)) {
        navigate({ kind: 'home', view: 'home' }, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, activeProject, projects, daemonLive]);

  const openSettings = useCallback((section: SettingsSection = 'execution') => {
    if (section === 'composio' || section === 'mcpClient' || section === 'integrations') {
      setIntegrationInitialTab(
        section === 'composio'
          ? 'connectors'
          : section === 'mcpClient'
            ? 'mcp'
            : 'use-everywhere',
      );
      navigate({ kind: 'home', view: 'integrations' });
      return;
    }
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
    setIntegrationInitialTab('mcp');
    navigate({ kind: 'home', view: 'integrations' });
  }, []);

  const handleCompleteOnboarding = useCallback(() => {
    const current = latestPersistedConfigRef.current;
    if (current.onboardingCompleted) return;
    const next: AppConfig = { ...current, onboardingCompleted: true };
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    void syncConfigToDaemon(next);
    setConfig(next);
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

  // Phase 2B / spec §11.6 — marketplace deep UI dispatch. The
  // /marketplace and /marketplace/:id routes render outside the
  // EntryView / ProjectView split so the discovery surface stays
  // independent of any active project.
  let appMain: ReactNode;
  if (route.kind === 'marketplace') {
    appMain = <MarketplaceView />;
  } else if (route.kind === 'marketplace-detail') {
    appMain = <PluginDetailView pluginId={route.pluginId} />;
  } else if (route.kind === 'design-system-create') {
    appMain = (
      <DesignSystemCreationFlow
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        onCreated={(projectId, project) => {
          if (project) {
            setProjects((curr) => [
              project,
              ...curr.filter((p) => p.id !== project.id),
            ]);
          }
          navigate({ kind: 'project', projectId, conversationId: null, fileName: null });
        }}
        onProjectPrepared={(project) => {
          setProjects((curr) => [
            project,
            ...curr.filter((p) => p.id !== project.id),
          ]);
        }}
        onSystemsRefresh={refreshDesignSystems}
        config={config}
        onOpenConnectorsTab={() => openSettings('composio')}
      />
    );
  } else if (route.kind === 'design-system-detail') {
    appMain = (
      <DesignSystemDetailView
        id={route.designSystemId}
        selectedId={config.designSystemId}
        config={config}
        agents={agents}
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        onOpenProject={(projectId) => navigate({ kind: 'project', projectId, conversationId: null, fileName: null })}
        onSetDefault={handleChangeDefaultDesignSystem}
        onSystemsRefresh={refreshDesignSystems}
        onProjectsRefresh={refreshProjects}
      />
    );
  } else if (activeProject) {
    appMain = (
      <ProjectView
        key={activeProject.id}
        project={activeProject}
        routeFileName={route.kind === 'project' ? route.fileName : null}
        routeConversationId={route.kind === 'project' ? route.conversationId : null}
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
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onDesignSystemsRefresh={refreshDesignSystems}
      />
    );
  } else {
    appMain = (
      <EntryView
        skills={enabledSkills}
        designTemplates={enabledDesignTemplates}
        designSystems={enabledDS}
        projects={projects}
        templates={templates}
        onDeleteTemplate={handleDeleteTemplate}
        promptTemplates={promptTemplates}
        defaultDesignSystemId={config.designSystemId}
        agents={agents}
        config={config}
        integrationInitialTab={integrationInitialTab}
        composioConfigLoading={composioConfigLoading}
        daemonLive={daemonLive}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiProtocolChange={handleApiProtocolChange}
        onApiModelChange={handleApiModelChange}
        onConfigPersist={handleConfigPersist}
        onRefreshAgents={refreshAgents}
        onThemeChange={handleThemeChange}
        skillsLoading={skillsLoading}
        designSystemsLoading={dsLoading}
        projectsLoading={projectsLoading}
        promptTemplatesLoading={promptTemplatesLoading}
        onCreateProject={handleCreateProject}
        onCreatePluginShareProject={handleCreatePluginShareProject}
        onImportClaudeDesign={handleImportClaudeDesign}
        onImportFolder={handleImportFolder}
        onImportFolderResponse={handleImportFolderResponse}
        onOpenProject={handleOpenProject}
        onOpenLiveArtifact={handleOpenLiveArtifact}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onCreateDesignSystem={() => navigate({ kind: 'design-system-create' })}
        renderDesignSystemCreation={(onBack, hooks) => (
          <DesignSystemCreationFlow
            chrome="embedded"
            onBack={onBack}
            onCreated={(projectId, project) => {
              if (project) {
                setProjects((curr) => [
                  project,
                  ...curr.filter((p) => p.id !== project.id),
                ]);
              }
              // Creating a design system from the onboarding step 2 panel
              // counts as completing onboarding, even though the user is
              // about to leave the entry shell for the project view. The
              // Skip path already marks completion via finishOnboarding;
              // mirror that here so the first-run privacy banner can
              // surface when the user later returns to home.
              handleCompleteOnboarding();
              navigate({ kind: 'project', projectId, conversationId: null, fileName: null });
            }}
            onProjectPrepared={(project) => {
              setProjects((curr) => [
                project,
                ...curr.filter((p) => p.id !== project.id),
              ]);
            }}
            onSystemsRefresh={refreshDesignSystems}
            config={config}
            onOpenConnectorsTab={() => openSettings('composio')}
            {...(hooks?.onBeforeGenerate ? { onBeforeGenerate: hooks.onBeforeGenerate } : {})}
            {...(hooks?.onGenerateSettled ? { onGenerateSettled: hooks.onGenerateSettled } : {})}
          />
        )}
        onOpenDesignSystem={(id: string) => navigate({ kind: 'design-system-detail', designSystemId: id })}
        onDesignSystemsRefresh={refreshDesignSystems}
        onPersistComposioKey={handleConfigPersistComposioKey}
        onOpenSettings={openSettings}
        onCompleteOnboarding={handleCompleteOnboarding}
      />
    );
  }
  return (
    <>
      <div
        className={`workspace-shell workspace-shell--${clientType}`}
        data-client-type={clientType}
      >
        <WorkspaceTabsBar
          route={route}
          projects={projects}
        />
        <div className="workspace-shell__body">{appMain}</div>
      </div>
      {clientType === 'desktop' ? null : (
        <PetOverlay
          pet={config.pet?.enabled ? config.pet : undefined}
          taskCenter={petTaskCenter}
          onOpenProject={handleOpenProject}
        />
      )}
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
          from localStorage. It waits for `onboardingCompleted` so first-run
          users see the welcome panel before the disclosure (Skip and
          finish both flip the flag). Independent of Settings: z-index in
          index.css sits above modal backdrops so opening Settings does
          not hide the banner. */}
      {showPrivacyConsent ? (
        <PrivacyConsentModal
          onAccept={() => {
            // Default opt-in: clicking "I get it" enables the same telemetry
            // surface the previous two-button "Share usage data" path opted
            // into. The banner footer + PrivacySection give the user a
            // one-click path to flip everything off later.
            // The banner owns only the privacy decision; it does not drive
            // navigation. Onboarding is gated by `onboardingCompleted` on
            // its own and runs in parallel.
            const installationId = generateInstallationIdSafe();
            void handleConfigPersist({
              ...latestPersistedConfigRef.current,
              installationId,
              privacyDecisionAt: Date.now(),
              telemetry: { metrics: true, content: true, artifactManifest: false },
            });
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
