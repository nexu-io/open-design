import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
  loadConfig,
  saveConfig,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import {
  createProject,
  deleteProject as deleteProjectApi,
  importClaudeDesignZip,
  listProjects,
  listTemplates,
  patchProject,
} from './state/projects';
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

export function App() {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    SettingsSection | undefined
  >(undefined);
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
  const route = useRoute();

  // Sync theme preference to the <html> element so CSS variables pick it up.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so a
  // live theme switch in Settings applies atomically — no 1-frame flash of
  // the old theme. Safe here because the component tree is ssr:false.
  useLayoutEffect(() => {
    const theme = config.theme ?? 'system';
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [config.theme]);

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
        const next = { ...prev };

        // Merge daemon-persisted config — daemon values win for the fields
        // it tracks so that the choice survives origin/storage resets.
        if (daemonConfig) {
          if (daemonConfig.onboardingCompleted != null) {
            next.onboardingCompleted = daemonConfig.onboardingCompleted;
          }
          if (daemonConfig.agentId !== undefined) {
            next.agentId = daemonConfig.agentId;
          }
          if (daemonConfig.skillId !== undefined) {
            next.skillId = daemonConfig.skillId;
          }
          if (daemonConfig.designSystemId !== undefined) {
            next.designSystemId = daemonConfig.designSystemId;
          }
          if (daemonConfig.agentModels) {
            next.agentModels = {
              ...(next.agentModels ?? {}),
              ...daemonConfig.agentModels,
            };
          }
        }

        if (alive) {
          if (!next.agentId) {
            const firstAvailable = agentList.find((a) => a.available);
            if (firstAvailable) next.agentId = firstAvailable.id;
          }
          if (!next.designSystemId && dsList.length > 0) {
            next.designSystemId =
              dsList.find((d) => d.id === 'default')?.id ?? dsList[0]!.id;
          }
        } else {
          next.mode = 'api';
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

  const handleConfigSave = useCallback((next: AppConfig) => {
    // Saving from any settings dialog (welcome or regular) counts as
    // having completed onboarding — the user has actively chosen a
    // configuration, so future page loads can skip the auto-popup.
    const withOnboarding: AppConfig = { ...next, onboardingCompleted: true };
    saveConfig(withOnboarding);
    void syncMediaProvidersToDaemon(withOnboarding.mediaProviders, {
      force: true,
    });
    void syncConfigToDaemon(withOnboarding);
    setConfig(withOnboarding);
    setSettingsOpen(false);
  }, []);

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
    async (options?: { throwOnError?: boolean }) => {
      const next = await fetchAgents(options);
      setAgents(next);
      return next;
    },
    [],
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

  const handleOpenProject = useCallback((id: string) => {
    navigate({ kind: 'project', projectId: id, fileName: null });
  }, []);

  const handleDeleteProject = useCallback(
    async (id: string) => {
      const ok = await deleteProjectApi(id);
      if (!ok) return;
      setProjects((curr) => curr.filter((p) => p.id !== id));
      if (route.kind === 'project' && route.projectId === id) {
        navigate({ kind: 'home' });
      }
    },
    [route],
  );

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

  const openSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsSection(undefined);
    setSettingsOpen(true);
  }, []);

  const openPetSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsSection('pet');
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
          skills={skills}
          designSystems={designSystems}
          projects={projects}
          templates={templates}
          promptTemplates={promptTemplates}
          defaultDesignSystemId={config.designSystemId}
          config={config}
          agents={agents}
          loading={bootstrapping}
          onCreateProject={handleCreateProject}
          onImportClaudeDesign={handleImportClaudeDesign}
          onOpenProject={handleOpenProject}
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
          defaultSection={settingsSection}
          onSave={handleConfigSave}
          onClose={() => {
            // Dismissing the welcome modal (Skip for now / backdrop click)
            // also counts as onboarding-done; we don't want to keep
            // re-prompting on every refresh just because the user opted
            // not to save.
            if (settingsWelcome && !config.onboardingCompleted) {
              const next: AppConfig = { ...config, onboardingCompleted: true };
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
