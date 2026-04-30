import type {
  AgentInfo,
  ChatAttachment,
  ChatMessage,
  Conversation,
  DesignSystemDetail,
  DesignSystemSummary,
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
} from '@open-design/contracts';

export type ExecMode = 'daemon' | 'api';

// Per-CLI model + reasoning the user picked in the model menu. Each agent
// keeps its own slot so flipping between Codex and Gemini doesn't reset the
// other one's choice. Missing entries fall back to the agent's first
// declared model (`'default'` — let the CLI pick).
export interface AgentModelChoice {
  model?: string;
  reasoning?: string;
}

export interface AppConfig {
  mode: ExecMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: string | null;
  designSystemId: string | null;
  // True once the user has been through the welcome onboarding modal at
  // least once (saved or skipped). Bootstrap skips the auto-popup when
  // this is set so refreshing the page doesn't re-prompt.
  onboardingCompleted?: boolean;
  // Per-CLI model picker state, keyed by agent id (e.g. `gemini`, `codex`).
  // Pre-existing configs without this field fall through to the agent's
  // declared default.
  agentModels?: Record<string, AgentModelChoice>;
}

export type AgentEvent = PersistedAgentEvent;

export type { ChatAttachment, ChatMessage };

export interface Artifact {
  identifier: string;
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

export type {
  AgentInfo,
  Conversation,
  DesignSystemDetail,
  DesignSystemSummary,
  Project,
  ProjectDisplayStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  SkillDetail,
  SkillSummary,
};

export interface OpenTabsState {
  tabs: string[];
  active: string | null;
}
