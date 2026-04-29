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

export type AgentEvent =
  | { kind: 'status'; label: string; detail?: string | undefined }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: 'raw'; line: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: AgentEvent[];
  startedAt?: number;
  endedAt?: number;
  // Files staged by the user on this turn (uploaded into the project
  // folder). Persisted on the message so re-renders show the same chips.
  attachments?: ChatAttachment[];
  // Files that appeared in the project folder during this assistant turn.
  // Rendered as download / open chips at the end of the message so the
  // user can grab a generated artifact (.pptx, .zip, etc.) in one click.
  producedFiles?: ProjectFile[];
}

// Reference to a file that lives in the active project folder. The user
// stages these by paste / drop / picker / @-mention; the daemon receives
// `path` on the chat call and the agent reads them from cwd.
export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
}

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

export interface AgentInfo {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  path?: string;
  version?: string | null;
  // Models surfaced in the model picker for this CLI. The first entry is
  // treated as the default (typically the synthetic `'default'` option,
  // meaning "let the CLI use whatever's in its own config").
  models?: AgentModelOption[];
  // Reasoning-effort presets — currently only Codex exposes this.
  reasoningOptions?: AgentModelOption[];
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode: 'prototype' | 'deck' | 'template' | 'design-system';
  platform?: 'desktop' | 'mobile' | null;
  scenario?: string | null;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  /** Lower number = higher priority in the Examples gallery. `null` keeps
   *  the skill in its natural alphabetical position below all featured
   *  entries. Set via `od.featured` in the SKILL.md frontmatter. */
  featured?: number | null;
  /** Optional metadata hints, parsed from `od.fidelity`,
   *  `od.speaker_notes`, and `od.animations` in SKILL.md. Used by the
   *  Examples gallery's "Use this prompt" fast-create path to mirror the
   *  shipped `example.html` (e.g. wireframe-sketch declares
   *  `fidelity: wireframe`). Missing hints fall back to the same defaults
   *  the new-project form would apply. */
  fidelity?: 'wireframe' | 'high-fidelity' | null;
  speakerNotes?: boolean | null;
  animations?: boolean | null;
  hasBody: boolean;
  examplePrompt: string;
}

export interface SkillDetail extends SkillSummary {
  body: string;
}

export interface DesignSystemSummary {
  id: string;
  title: string;
  category: string;
  summary: string;
  /** 4 representative hex strings extracted from DESIGN.md: [bg, support, fg, accent].
   *  Empty when DESIGN.md doesn't expose its tokens in the bold-and-hex format. */
  swatches?: string[];
}

export interface DesignSystemDetail extends DesignSystemSummary {
  body: string;
}

export type ProjectFileKind =
  | 'html'
  | 'image'
  | 'sketch'
  | 'text'
  | 'code'
  | 'binary';

export interface ProjectFile {
  name: string;
  // Project-relative path. Today the project folder is flat so `path`
  // equals `name` for every file — but components that want to think in
  // path terms (the @-mention picker, the staged-attachment chips) can
  // read this without caring whether subdirs exist.
  path?: string;
  // Discriminator for code that wants to filter files vs dirs in a tree
  // listing. The current listing is files-only; we always set this to
  // 'file' so the discriminator is meaningful.
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
}

// Per-project metadata captured at creation time. The agent reads this
// during chat (via the system prompt) and the question-form re-asks for
// any field that's missing. Each `kind` carries a different shape.
export type ProjectKind = 'prototype' | 'deck' | 'template' | 'other';

export interface ProjectMetadata {
  kind: ProjectKind;
  // Prototype: 'wireframe' | 'high-fidelity'. Drives the visual ambition.
  fidelity?: 'wireframe' | 'high-fidelity';
  // Slide deck: whether the user wants speaker notes (less text per slide).
  speakerNotes?: boolean;
  // Template: whether motion/animation should be part of the design.
  // Defaults `false` so a static template stays static unless asked.
  animations?: boolean;
  // Template: id of the user-saved template chosen at creation time.
  // Only set on `kind === 'template'` projects (the other kinds dropped
  // template selection entirely). The built-in 'animation' starter no
  // longer ships — every template here is user-created via Share menu.
  templateId?: string;
  // Template: human-readable label of the source template, kept separate
  // from `templateId` so the agent surface can name it without re-fetching.
  templateLabel?: string;
  // Multi-select design-system "inspirations". The first pick still goes to
  // `Project.designSystemId` (the primary system that controls tokens); any
  // additional ids land here and are passed to the agent as references the
  // generated artifact should *also* draw from. Empty / undefined when the
  // user stayed in single-select mode.
  inspirationDesignSystemIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
  // The prompt that should be prefilled into the chat composer when the
  // project is opened. Cleared the first time the project is opened so it
  // doesn't keep re-populating on subsequent visits.
  pendingPrompt?: string;
  // Optional structured metadata captured by the new-project panel. The
  // shape varies by `kind`. Older projects created before this field
  // existed will have it `undefined`.
  metadata?: ProjectMetadata;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  // Source project the template was captured from (so we can show "based
  // on …" in the picker). Optional because some templates are seeded.
  sourceProjectId?: string;
  // Snapshot of HTML files at the moment the template was saved. Each
  // entry is a basename → text content pair.
  files: Array<{ name: string; content: string }>;
  // Free-form description shown in the picker.
  description?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface OpenTabsState {
  tabs: string[];
  active: string | null;
}
