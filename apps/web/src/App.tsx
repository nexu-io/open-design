import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EntryView } from './components/EntryView';
import type { CreateInput } from './components/NewProjectPanel';
import { PetOverlay } from './components/pet/PetOverlay';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { ProjectView } from './components/ProjectView';
import {
  SettingsDialog,
  type SettingsSection,
} from './components/SettingsDialog';
import {
  daemonIsLive,
  fetchAppVersionInfo,
  fetchAgents,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from './providers/registry';
import { navigate, useRoute } from './router';
import {
  fetchDaemonConfig,
  DEFAULT_PET,
  hasAnyConfiguredProvider,
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import { applyAppearanceToDocument } from './state/appearance';
import {
  createProject,
  deleteProject as deleteProjectApi,
  importClaudeDesignZip,
  importFolderProject,
  listProjects,
  listTemplates,
  patchProject,
} from './state/projects';
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

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base.onboardingCompleted ? base : { ...base, onboardingCompleted: true };
}

export function App() {
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
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    PromptTemplateSummary[]
  >([]);
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    null,
  );
  // Goes false once the bootstrap effect has finished its initial round of
  // fetches. The entry view uses this to show shimmer / skeleton states
  // instead of an "empty" page that flickers before data lands.
  const [bootstrapping, setBootstrapping] = useState(true);
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

  // Bootstrap — detect daemon, load pickers, seed sensible defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      const [
        agentList,
        skillList,
        dsList,
        projectList,
        templateList,
        promptTemplateList,
        versionInfo,
        daemonConfig,
        daemonComposioConfig,
      ] = await Promise.all([
        alive ? fetchAgents() : Promise.resolve([] as AgentInfo[]),
        alive ? fetchSkills() : Promise.resolve([] as SkillSummary[]),
        alive
          ? fetchDesignSystems()
          : Promise.resolve([] as DesignSystemSummary[]),
        alive ? listProjects() : Promise.resolve([] as Project[]),
        alive ? listTemplates() : Promise.resolve([] as ProjectTemplate[]),
        alive
          ? fetchPromptTemplates()
          : Promise.resolve([] as PromptTemplateSummary[]),
        alive ? fetchAppVersionInfo() : Promise.resolve(null),
        alive ? fetchDaemonConfig() : Promise.resolve(null),
        alive ? fetchComposioConfigFromDaemon() : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setAgents(agentList);
      setSkills(skillList);
      setDesignSystems(dsList);
      setProjects(projectList);
      setTemplates(templateList);
      setPromptTemplates(promptTemplateList);
      setAppVersionInfo(versionInfo);

      setConfig((prev) => {
        // Merge daemon-persisted config — daemon values win for the fields
        // it tracks so that the choice survives origin/storage resets.
        const next = mergeDaemonConfig(prev, daemonConfig);

        if (alive) {
          const hasLocalComposioKey = Boolean(next.composio?.apiKey?.trim());
          if (!hasLocalComposioKey && daemonComposioConfig) {
            next.composio = daemonComposioConfig;
          }
          if (!next.agentId) {
            const firstAvailable = agentList.find((a) => a.available);
            if (firstAvailable) next.agentId = firstAvailable.id;
          }
          if (!next.designSystemId && dsList.length > 0) {
            next.designSystemId =
              dsList.find((d) => d.id === 'default')?.id ?? dsList[0]!.id;
          }
        }
        saveConfig(next);
        if (alive && hasAnyConfiguredProvider(next.mediaProviders)) {
          void syncMediaProvidersToDaemon(next.mediaProviders);
        }
        // Migrate localStorage prefs to daemon on first boot with the new
        // endpoint. If daemon already had values the merge above used them;
        // writing back is idempotent and ensures both sides stay in sync.
        if (alive) {
          void syncConfigToDaemon(next);
          void syncComposioConfigToDaemon(next.composio);
        }

        // Pop the onboarding modal only on the first run. Once the user has
        // saved or skipped past it once, we trust their stored config and
        // let them re-open Settings explicitly via the env pill.
        if (!next.onboardingCompleted) {
          setSettingsWelcome(true);
          setSettingsOpen(true);
        }
        return next;
      });
      setBootstrapping(false);
      // Composio hydration is part of the same Promise.all above — by the
      // time we land here either the daemon returned the saved-key shape
      // (apiKeyConfigured + tail) or the daemon was offline and we kept
      // whatever localStorage held. Either way it is safe to drop the
      // skeleton: the input now reflects the source of truth.
      setComposioConfigLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    await Promise.all([
      shouldSyncMediaProvidersOnSave(persisted.mediaProviders, {
        force: options?.forceMediaProviderSync,
      })
        ? syncMediaProvidersToDaemon(persisted.mediaProviders, {
            force: options?.forceMediaProviderSync,
            throwOnError: options?.forceMediaProviderSync,
          })
        : Promise.resolve(),
      syncConfigToDaemon(persisted),
    ]);
  }, []);

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
      const result = await createProject({
        name: input.name,
        skillId: input.skillId,
        designSystemId: input.designSystemId,
        pendingPrompt: input.pendingPrompt,
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
    void patchProject(projectId, { pendingPrompt: undefined });
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

  const enabledSkills = useMemo(
    () => skills.filter((s) => !(config.disabledSkills ?? []).includes(s.id)),
    [skills, config.disabledSkills],
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
          skills={skills}
          designSystems={designSystems}
          daemonLive={daemonLive}
          onModeChange={handleModeChange}
          onAgentChange={handleAgentChange}
          onAgentModelChange={handleAgentModelChange}
          onRefreshAgents={refreshAgents}
          onOpenSettings={openSettings}
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
          designSystems={enabledDS}
          projects={projects}
          templates={templates}
          promptTemplates={promptTemplates}
          defaultDesignSystemId={config.designSystemId}
          config={config}
          agents={agents}
          loading={bootstrapping}
          onCreateProject={handleCreateProject}
          onImportClaudeDesign={handleImportClaudeDesign}
          onImportFolder={handleImportFolder}
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
        />
      ) : null}
    </>
  );
}
