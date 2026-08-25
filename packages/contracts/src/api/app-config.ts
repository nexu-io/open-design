import type { OdNextRolloutMode } from './strategy-rollout.js';

export interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
  serviceTier?: string;
}

export type AgentCliEnvPrefs = Record<string, Record<string, string>>;
export type AgentCliEnvIntentPrefs = Record<string, { apiKeyOverride?: boolean }>;

export interface TelemetryPrefs {
  metrics?: boolean;
  content?: boolean;
  artifactManifest?: boolean;
}

export interface OrbitConfigPrefs {
  enabled: boolean;
  /** Local 24-hour clock time in HH:mm format. Defaults to 08:00. */
  time: string;
  /** Optional skill id from the examples gallery where scenario === "orbit". */
  templateSkillId?: string | null;
  /**
   * Workspace selected in the tab that configured Orbit. The daemon verifies
   * this pair when saving and again before every unattended run.
   */
  workspaceScope?: AutomationWorkspaceScope | null;
}

export interface AutomationWorkspaceScope {
  workspaceId: string;
  workspaceMemberId: string;
}

export interface ProjectLocationPrefs {
  id: string;
  name: string;
  path: string;
}

export interface AppConfigPrefs {
  onboardingCompleted?: boolean;
  agentId?: string | null;
  agentModels?: Record<string, AgentModelPrefs>;
  agentCliEnv?: AgentCliEnvPrefs;
  agentCliEnvIntent?: AgentCliEnvIntentPrefs;
  skillId?: string | null;
  designSystemId?: string | null;
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
  installationId?: string | null;
  telemetry?: TelemetryPrefs;
  /**
   * Unix-millis timestamp of when the user resolved the first-run privacy
   * consent surface (Share or Decline). Set on first decision and on
   * subsequent toggles in Settings → Privacy. Independent of
   * installationId so that "Delete my data" can rotate the id without
   * re-popping the consent banner.
   */
  privacyDecisionAt?: number | null;
  allowSilentUpdates?: boolean;
  orbit?: OrbitConfigPrefs;
  customInstructions?: string | null;
  /** External project library roots. The daemon adds its built-in .od/projects location at read time. */
  projectLocations?: ProjectLocationPrefs[];
  /** Project location id used for new projects when the create request does not choose one explicitly. */
  defaultProjectLocationId?: string | null;
  /**
   * Whether this installation opts into the OD Next design strategy, and in
   * which mode.
   *
   * OD Next is opt-in: an installation that never chose runs the ordinary
   * strategy route, so absent (and `null`) mean `off`. Setting this to
   * `'active'` is the whole configuration step — the next run admits through
   * the strategy without restarting the daemon, because the run route reads
   * this field per request rather than latching it at boot.
   *
   * `OD_NEXT_STRATEGY_ROLLOUT` still outranks this when it is set, so an
   * operator, a packaged smoke run, or a test can pin a mode for one process
   * without overwriting what the user saved.
   */
  odNextStrategyMode?: OdNextRolloutMode | null;
  /**
   * Most-recently-used local working directories the user granted the agent
   * read access to (via the Home composer's working-directory picker). These
   * become a new project's `metadata.linkedDirs` — the agent perceives them
   * through `--add-dir`; they are NOT imported into Design Files. Stored
   * most-recent-first and capped by the daemon.
   */
  recentLinkedDirs?: string[];
}

export interface AppConfigResponse {
  config: AppConfigPrefs;
}

export type UpdateAppConfigRequest = Partial<AppConfigPrefs>;

/** Response body for `GET /api/recent-dirs` — recent working directories
 *  pruned to those that still exist on disk, most-recent-first. */
export interface RecentLinkedDirsResponse {
  dirs: string[];
}
