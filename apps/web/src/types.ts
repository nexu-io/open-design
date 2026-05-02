import type {
  AgentInfo,
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  ChatAttachment,
  ChatMessage,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  PersistedAgentEvent,
  Project,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
} from '@open-design/contracts';

export type ExecMode = 'daemon' | 'api';

export interface MediaProviderCredentials {
  apiKey: string;
  baseUrl: string;
}

// Per-CLI model + reasoning the user picked in the model menu. Each agent
// keeps its own slot so flipping between Codex and Gemini doesn't reset the
// other one's choice. Missing entries fall back to the agent's first
// declared model (`'default'` — let the CLI pick).
export interface AgentModelChoice {
  model?: string;
  reasoning?: string;
}

export type AppTheme = 'system' | 'light' | 'dark';

export interface AppConfig {
  mode: ExecMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: string | null;
  designSystemId: string | null;
  theme?: AppTheme;
  // True once the user has been through the welcome onboarding modal at
  // least once (saved or skipped). Bootstrap skips the auto-popup when
  // this is set so refreshing the page doesn't re-prompt.
  onboardingCompleted?: boolean;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  // Per-CLI model picker state, keyed by agent id (e.g. `gemini`, `codex`).
  // Pre-existing configs without this field fall through to the agent's
  // declared default.
  agentModels?: Record<string, AgentModelChoice>;
  // Caps the upstream completion length in API mode. Defaults to 8192 when
  // unset; raise it for providers (e.g. MiMo) that allow longer responses.
  maxTokens?: number;
}

export type AgentEvent = PersistedAgentEvent;

export type { ChatAttachment, ChatMessage };

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
  AppVersionInfo,
  AppVersionResponse,
  AudioKind,
  Conversation,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DesignSystemDetail,
  DesignSystemSummary,
  MediaAspect,
  ProjectDeploymentsResponse,
  Project,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  SkillDetail,
  SkillSummary,
  UpdateDeployConfigRequest,
};

export interface OpenTabsState {
  tabs: string[];
  active: string | null;
}
