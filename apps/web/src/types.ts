import type {
  AgentInfo,
  AgentCliEnvPrefs,
  AgentModelPrefs,
  AgentTestRequest,
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ConnectionTestKind,
  ConnectionTestProtocol,
  ConnectionTestRequest,
  ConnectionTestResponse,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  LiveArtifact,
  LiveArtifactDetailResponse,
  LiveArtifactListResponse,
  LiveArtifactPreview,
  LiveArtifactRefreshLogEntry,
  LiveArtifactRefreshStatus,
  LiveArtifactStatus,
  LiveArtifactSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  ProviderTestRequest,
  PersistedAgentEvent,
  Project,
  PreviewCommentMember,
  PreviewCommentSelectionKind,
  PreviewComment,
  PreviewCommentStatus,
  PreviewCommentTarget,
  PreviewCommentUpsertRequest,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  CodexPetSummary,
  CodexPetsResponse,
  SyncCommunityPetsRequest,
  SyncCommunityPetsResponse,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
} from '@open-design/contracts';

export type {
  CloudflarePagesDeploySelection,
  CloudflarePagesDeploymentInfo,
  CloudflarePagesZonesResponse,
  PreviewCommentMember,
  PreviewCommentSelectionKind,
} from '@open-design/contracts';

export type ExecMode = 'daemon' | 'api';
export type ApiProtocol = 'anthropic' | 'openai' | 'azure' | 'google';

export type LiveArtifactTabId = `live:${string}`;
export type ProjectWorkspaceTabId = string | LiveArtifactTabId;

export function liveArtifactTabId(artifactId: string): LiveArtifactTabId {
  return `live:${artifactId}`;
}

export function isLiveArtifactTabId(tabId: string): tabId is LiveArtifactTabId {
  return tabId.startsWith('live:') && tabId.length > 'live:'.length;
}

export function liveArtifactIdFromTabId(tabId: LiveArtifactTabId): string {
  return tabId.slice('live:'.length);
}

export type LiveArtifactViewerTab =
  | 'preview'
  | 'code'
  | 'data'
  | 'refresh-history';

export interface ProjectFileWorkspaceEntry {
  kind: 'file';
  tabId: string;
  name: string;
  file: ProjectFile;
}

export interface LiveArtifactWorkspaceEntry {
  kind: 'live-artifact';
  tabId: LiveArtifactTabId;
  artifactId: string;
  projectId: string;
  title: string;
  slug: string;
  status: LiveArtifactStatus;
  refreshStatus: LiveArtifactRefreshStatus;
  pinned: boolean;
  preview: LiveArtifactPreview;
  hasDocument: boolean;
  updatedAt: string;
  lastRefreshedAt?: string;
}

export type ProjectWorkspaceEntry = ProjectFileWorkspaceEntry | LiveArtifactWorkspaceEntry;

export function liveArtifactSummaryToWorkspaceEntry(
  liveArtifact: LiveArtifactSummary,
): LiveArtifactWorkspaceEntry {
  const entry: LiveArtifactWorkspaceEntry = {
    kind: 'live-artifact',
    tabId: liveArtifactTabId(liveArtifact.id),
    artifactId: liveArtifact.id,
    projectId: liveArtifact.projectId,
    title: liveArtifact.title,
    slug: liveArtifact.slug,
    status: liveArtifact.status,
    refreshStatus: liveArtifact.refreshStatus,
    pinned: liveArtifact.pinned,
    preview: liveArtifact.preview,
    hasDocument: liveArtifact.hasDocument,
    updatedAt: liveArtifact.updatedAt,
  };
  if (liveArtifact.lastRefreshedAt) entry.lastRefreshedAt = liveArtifact.lastRefreshedAt;
  return entry;
}

export interface LiveArtifactPreviewRequest {
  projectId: string;
  artifactId: string;
  previewUrl: string;
}

export interface MediaProviderCredentials {
  apiKey: string;
  baseUrl: string;
  model?: string;
}

export interface ApiProtocolConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiVersion?: string;
  apiProviderBaseUrl?: string | null;
}

// Per-CLI model + reasoning the user picked in the model menu. Each agent
// keeps its own slot so flipping between Codex and Gemini doesn't reset the
// other one's choice. Missing entries fall back to the agent's first
// declared model (`'default'` — let the CLI pick).
export type AgentModelChoice = AgentModelPrefs;
export type AgentCliEnvConfig = AgentCliEnvPrefs;

export type AppTheme = 'system' | 'light' | 'dark';

// One animation row inside a pet's sprite atlas. Mirrors the Codex
// hatch-pet `animation-rows.md` reference — `id` lets the overlay map
// interaction states (idle / hover / drag direction / waiting) to the
// correct row regardless of how many rows a particular pet ships.
export interface PetAtlasRowDef {
  // Row index in the atlas, top to bottom.
  index: number;
  // Stable id used by the interaction state machine and i18n keys.
  // Matches the canonical Codex row ids: 'idle', 'running-right', etc.
  id: string;
  // Number of leading frames the row uses. The remaining cells in the
  // row are expected to be transparent / empty.
  frames: number;
  // Frames-per-second the row plays at. Per-row tuning lets idle stay
  // calm while running-* / jumping feel snappy.
  fps: number;
}

// Sprite atlas layout — when present on `PetCustom`, `imageUrl` is the
// full grid (cols × rows) instead of a single horizontal strip. The
// overlay then picks one row to render based on user interaction.
export interface PetAtlasLayout {
  cols: number;
  rows: number;
  // Per-row playback definitions. Order matches the row index.
  rowsDef: PetAtlasRowDef[];
}

// User-tunable companion that floats over the workspace. The full catalog
// lives in `components/pet/pets.ts`; this shape is what gets persisted to
// localStorage so we can roundtrip a customized pet across reloads.
export interface PetCustom {
  // Display name shown in the overlay tooltip and settings card.
  name: string;
  // Single emoji or 1–2 char glyph rendered as the sprite. We render text,
  // not an image, so any user keyboard input works without uploads.
  glyph: string;
  // Hex color used as the overlay halo accent.
  accent: string;
  // Short greeting line shown in the speech bubble on hover / first wake.
  greeting: string;
  // Optional uploaded sprite. Stored as a base64 data URL so it survives
  // localStorage roundtrips without depending on daemon storage. When
  // present, the overlay / rail / settings render the image instead of
  // the text glyph. Cleared when the user picks "Remove image".
  imageUrl?: string;
  // Legacy single-row spritesheet config — when `frames > 1` we treat
  // `imageUrl` as a horizontal strip of `frames` equally-sized cells and
  // step through them at `fps` frames per second using a CSS `steps()`
  // animation, matching the codex-pets-react sheet shape (e.g.
  // tater/spritesheet). `frames === 1` (default) renders the image as a
  // single static cell with the same gentle float animation as the
  // emoji glyph. Ignored when `atlas` is set.
  frames?: number;
  fps?: number;
  // Optional sprite atlas layout. When present, `imageUrl` is the full
  // atlas grid and the overlay renders the active row chosen by the
  // interaction state machine (idle / hover → wave / drag → run / etc.).
  atlas?: PetAtlasLayout;
}

export interface NotificationsConfig {
  // Master switch for the completion sound. Default false — first-run users
  // hear nothing until they opt in.
  soundEnabled: boolean;
  // Sound id played when a turn ends with `runStatus === 'succeeded'`.
  successSoundId: string;
  // Sound id played when a turn ends with `runStatus === 'failed'`.
  failureSoundId: string;
  // Master switch for the browser Notification API banner. Default false.
  desktopEnabled: boolean;
}

export interface PetConfig {
  // True once the user has explicitly picked a pet (built-in or custom).
  // Until then, the entry view shows an "adopt" callout to drive discovery.
  adopted: boolean;
  // Floating overlay visibility — the wake/tuck toggle lives in Settings
  // and on the overlay itself. Defaults to true after adoption.
  enabled: boolean;
  // 'custom' or a built-in id from `BUILT_IN_PETS`. We tolerate unknown ids
  // (e.g. older builds) and fall back to the first built-in.
  petId: string;
  // Free-form custom pet definition. Always present so the customize panel
  // has stable state to bind against, even when a built-in is active.
  custom: PetCustom;
}

export interface AppConfig {
  mode: ExecMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  apiProtocol?: ApiProtocol;
  apiVersion?: string;
  apiProtocolConfigs?: Partial<Record<ApiProtocol, ApiProtocolConfig>>;
  /** Internal config schema/migration version for localStorage upgrades. */
  configMigrationVersion?: number;
  /** Base URL of the selected known provider; cleared once the user customizes provider fields. */
  apiProviderBaseUrl?: string | null;
  agentId: string | null;
  skillId: string | null;
  designSystemId: string | null;
  theme?: AppTheme;
  accentColor?: string;
  // True once the user has been through the welcome onboarding modal at
  // least once (saved or skipped). Bootstrap skips the auto-popup when
  // this is set so refreshing the page doesn't re-prompt.
  onboardingCompleted?: boolean;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  composio?: ComposioSettings;
  // Per-CLI model picker state, keyed by agent id (e.g. `gemini`, `codex`).
  // Pre-existing configs without this field fall through to the agent's
  // declared default.
  agentModels?: Record<string, AgentModelChoice>;
  // Per-agent non-secret CLI config locations injected into detection and runs.
  agentCliEnv?: AgentCliEnvConfig;
  // Caps the upstream completion length in API mode. Defaults to 8192 when
  // unset; raise it for providers (e.g. MiMo) that allow longer responses.
  maxTokens?: number;
  // Optional Codex-style animated companion. Older configs that pre-date
  // the feature land at `undefined`, which the loader normalizes to a
  // safe default (un-adopted, hidden until the user opts in).
  pet?: PetConfig;
  // Optional task-completion sound + browser notification settings. Older
  // configs that pre-date the feature land at `undefined`, which the loader
  // normalizes to a safe default (everything off).
  notifications?: NotificationsConfig;
  // IDs of skills/design-systems the user has explicitly disabled.
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
}

export interface ComposioSettings {
  apiKey?: string;
  apiKeyConfigured?: boolean;
  apiKeyTail?: string;
}

export type AgentEvent = PersistedAgentEvent;

export interface LiveArtifactEventItem {
  id: number;
  event: Extract<AgentEvent, { kind: 'live_artifact' | 'live_artifact_refresh' }>;
}

export type { ChatAttachment, ChatCommentAttachment, ChatMessage };

export interface Artifact {
  identifier: string;
  artifactType?: string;
  title: string;
  html: string;
  savedUrl?: string;
}

export interface ExamplePreview {
  source: 'skill' | 'design-system';
  id: string;
  title: string;
  html: string;
}

export interface AgentModelOption {
  id: string;
  label: string;
}

export type Surface = 'web' | 'image' | 'video' | 'audio';

export interface PromptTemplateSource {
  repo: string;
  license: string;
  author?: string;
  url?: string;
}

export interface PromptTemplateSummary {
  id: string;
  surface: 'image' | 'video';
  title: string;
  summary: string;
  category: string;
  tags?: string[];
  model?: string;
  aspect?: MediaAspect;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  source: PromptTemplateSource;
}

export interface PromptTemplateDetail extends PromptTemplateSummary {
  prompt: string;
}

export type {
  AgentInfo,
  AgentTestRequest,
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  ConnectionTestKind,
  ConnectionTestProtocol,
  ConnectionTestRequest,
  ConnectionTestResponse,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  LiveArtifact,
  LiveArtifactDetailResponse,
  LiveArtifactListResponse,
  LiveArtifactRefreshLogEntry,
  LiveArtifactRefreshStatus,
  LiveArtifactStatus,
  LiveArtifactSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  Project,
  PreviewComment,
  PreviewCommentStatus,
  PreviewCommentTarget,
  PreviewCommentUpsertRequest,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  ProviderTestRequest,
  CodexPetSummary,
  CodexPetsResponse,
  SyncCommunityPetsRequest,
  SyncCommunityPetsResponse,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
};

export interface OpenTabsState {
  tabs: ProjectWorkspaceTabId[];
  active: ProjectWorkspaceTabId | null;
}
