export interface AgentModelOption {
  id: string;
  label: string;
}

/**
 * A typed "what should the UI do to fix this" intent attached to an
 * {@link AgentDiagnostic}. The UI renders a button per intent and owns the
 * concrete handler (open a URL, re-run detection, write an env override,
 * launch the OAuth terminal flow). Keeping the intent typed — rather than a
 * pre-baked button label + URL — means the Settings card, the unavailable
 * grid, and (PR-B) the `od agent healthcheck` CLI / health-check panel all
 * render the same fix affordances from one source of truth instead of each
 * re-deriving copy and wiring.
 */
export type AgentFixIntent =
  /** Open the agent's configuration / auth docs (`AgentInfo.docsUrl`). */
  | { kind: 'openDocs' }
  /** Open the agent's install / download page (`AgentInfo.installUrl`). */
  | { kind: 'openInstall' }
  /** Re-run agent detection (the Settings "Rescan" affordance). */
  | { kind: 'rescan' }
  /**
   * Prompt the user to point Open Design at an explicit binary by writing
   * `envKey` (e.g. `CURSOR_AGENT_BIN`) into `agentCliEnv`. Used when the CLI
   * is installed somewhere PATH detection can't reach.
   */
  | { kind: 'setEnv'; envKey: string }
  /** Clear a previously-set binary override so detection falls back to PATH. */
  | { kind: 'clearEnv'; envKey: string }
  /**
   * Launch the agent's interactive sign-in in a system terminal (today only
   * Antigravity's `agy`, via POST /api/agents/:id/oauth-launch).
   */
  | { kind: 'launchOAuth'; agentId: string };

/**
 * Why a CLI agent is unavailable or only partially usable, in a shape the UI
 * can render as "one-line reason + fix button(s)" instead of a silent grey
 * card. Emitted by daemon detection (PATH / executable resolution + the auth
 * probe) and reused by the connection-test / health-check surfaces so a
 * failure is always actionable.
 */
export type AgentDiagnosticReason =
  /** The binary (and any fallback names) was not found on PATH. */
  | 'not-on-path'
  /** A file matched but is not executable (missing +x / wrong PATHEXT). */
  | 'not-executable'
  /** A wrapper/shim was found but its target is gone (exit 126/127). */
  | 'shim-broken'
  /** A user-set `*_BIN` override points at a missing/invalid file. */
  | 'configured-bin-invalid'
  /** Installed and invocable, but the CLI is not authenticated. */
  | 'auth-missing'
  /** Installed, but auth status could not be verified. */
  | 'auth-unknown';

export type AgentDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface AgentDiagnostic {
  reason: AgentDiagnosticReason;
  severity: AgentDiagnosticSeverity;
  /** Short, human-readable, single-sentence explanation. */
  message: string;
  /** Optional longer context (e.g. the probe's stderr tail). */
  detail?: string;
  /**
   * Directories PATH detection searched, surfaced verbatim for the
   * `not-on-path` case so the user can see where we looked before being
   * asked to set an explicit binary path. Sourced from the daemon resolver,
   * never recomputed in the client.
   */
  searchedDirs?: string[];
  /** Ordered fix affordances the UI should offer for this diagnostic. */
  fixActions?: AgentFixIntent[];
}

export interface AgentInfo {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;
  version?: string | null;
  /**
   * Actionable reasons this agent is unavailable or only partially usable,
   * each carrying typed fix intents. Empty / omitted means "healthy"
   * (available and, where probed, authenticated).
   */
  diagnostics?: AgentDiagnostic[];
  models?: AgentModelOption[];
  /** Whether models came from the installed CLI or Open Design's static fallback. */
  modelsSource?: 'live' | 'fallback';
  reasoningOptions?: AgentModelOption[];
  /** HTTPS URL to install or download the CLI (vendor docs, GitHub README, npm). */
  installUrl?: string;
  /** Optional HTTPS URL for configuration / auth / usage docs. */
  docsUrl?: string;
  /**
   * How the daemon forwards the user's `.od/mcp-config.json` external MCP
   * servers to this runtime at spawn time. Mirrors the field on
   * `RuntimeAgentDef` in the daemon. Undefined means the runtime has no
   * native MCP transport wired yet, in which case the settings UI surfaces
   * a "configure MCP in the agent's own config file" hint instead of
   * silently dropping the servers (issue #2142).
   */
  externalMcpInjection?:
    | 'claude-mcp-json'
    | 'acp-merge'
    | 'opencode-env-content';
  /**
   * When `false`, the Settings model picker hides the "Custom (fill below)"
   * option and the free-text input. Use this for agents whose CLI doesn't
   * accept a model id (e.g. Antigravity `agy` has no `--model` flag yet —
   * upstream issue #35) or rejects free-form ids (AMR validates against the
   * live Vela catalog). Undefined === allow, matching the historical UX.
   */
  supportsCustomModel?: boolean;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export type AmrModelsSource = 'preset' | 'remote';

export interface AmrModelsResponse {
  source: AmrModelsSource;
  models: AgentModelOption[];
  refreshing: boolean;
  stale?: boolean;
  remoteError?: string;
}

export type SkillSource = 'built-in' | 'user';

export interface SkillSummary {
  id: string;
  name: string;
  displayName?: Record<string, string>;
  description: string;
  descriptionI18n?: Record<string, string>;
  triggers: string[];
  mode:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'design-system'
    | 'image'
    | 'video'
    | 'audio';
  surface?: 'web' | 'image' | 'video' | 'audio';
  platform?: 'desktop' | 'mobile' | null;
  scenario?: string | null;
  // Optional human-readable category (e.g. "image-generation", "video",
  // "design-systems"). Surfaced as a filter pill in Settings → Skills so a
  // large pre-loaded catalogue stays scannable. Free-form lowercase slug;
  // not part of system-prompt composition.
  category?: string | null;
  // Origin of the skill: 'built-in' lives under the repo's `skills/`
  // directory and cannot be deleted from the UI; 'user' lives under
  // `<runtimeData>/user-skills/` and is fully owned by the user (delete
  // / re-import allowed). New `import` endpoint always tags `user`.
  source?: SkillSource;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  featured?: number | null;
  fidelity?: 'wireframe' | 'high-fidelity' | null;
  speakerNotes?: boolean | null;
  animations?: boolean | null;
  craftRequires?: string[];
  hasBody: boolean;
  examplePrompt: string;
  examplePromptI18n?: Record<string, string>;
  // True when this skill exists only to group derived `<parent>:<child>`
  // example cards. The Examples gallery hides such cards because their
  // preview would duplicate one of the derived cards and add no extra
  // information, but the entry stays in the listing so `findSkillById`
  // resolves the parent for system-prompt composition and "Use this
  // prompt" fast-create on a derived card still composes the parent's
  // SKILL.md body.
  aggregatesExamples: boolean;
}

// Body shape for POST /api/skills/import. The daemon turns this into a
// SKILL.md under `<runtimeData>/user-skills/<slug>/` and surfaces the
// freshly-listed summary in the response.
export interface SkillImportRequest {
  name: string;
  description?: string;
  body: string;
  triggers?: string[];
}

export interface SkillImportResponse {
  skill: SkillSummary;
}

// Body for PUT /api/skills/:id — update an existing skill's SKILL.md.
// The route param resolves to the canonical skill id; the daemon refuses
// updates whose body `name` differs from that id (rename = delete +
// re-import).
export interface SkillUpdateRequest {
  name?: string;
  description?: string;
  body: string;
  triggers?: string[];
}

export interface SkillUpdateResponse {
  skill: SkillSummary;
}

// Returned by GET /api/skills/:id/files — the on-disk file tree under
// the skill's directory, capped to a small number of entries to keep
// the payload bounded. Used by the Settings → Skills detail panel.
export interface SkillFileEntry {
  path: string;
  kind: 'file' | 'directory';
  size: number | null;
}

export interface SkillFilesResponse {
  files: SkillFileEntry[];
}

export interface SkillDetail extends SkillSummary {
  body: string;
}

export interface SkillsResponse {
  skills: SkillSummary[];
}

export interface SkillResponse {
  skill: SkillDetail;
}

// Design templates share the SkillSummary/Detail shape (same SKILL.md
// frontmatter, same preview behavior) but live under a separate registry
// root so the EntryView Templates surface and the Settings → Skills surface
// stay decoupled. See specs/current/skills-and-design-templates.md.
export type DesignTemplateSummary = SkillSummary;
export type DesignTemplateDetail = SkillDetail;

export interface DesignTemplatesResponse {
  designTemplates: DesignTemplateSummary[];
}

export interface DesignTemplateResponse {
  designTemplate: DesignTemplateDetail;
}

export interface DesignSystemSummary {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches?: string[];
  surface?: 'web' | 'image' | 'video' | 'audio';
  source?: 'built-in' | 'installed' | 'user';
  status?: 'draft' | 'published';
  isEditable?: boolean;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DesignSystemProvenance;
  projectId?: string;
}

export interface DesignSystemDetail extends DesignSystemSummary {
  body: string;
  packageInfo?: DesignSystemPackageInfo;
}

export interface DesignSystemPackageInfo {
  manifest?: {
    schemaVersion: string;
    id: string;
    name: string;
    category: string;
    source?: { type?: string; url?: string; path?: string; branch?: string; commit?: string; importedAt?: string };
    files?: {
      design?: string;
      tokens?: string;
      components?: string;
    };
    usage?: string;
    componentsManifest?: string;
    importMode?: string;
    craft?: {
      applies?: string[];
      suggested?: string[];
      exemptions?: string[];
    };
    fonts?: Array<{ family?: string; weight?: string | number; style?: string; file?: string }>;
    preview?: {
      dir?: string;
      pages?: Array<{ path?: string; role?: string; title?: string }>;
    };
    sourceFiles?: {
      scanned?: string;
      evidence?: string;
      tokens?: string;
      snippets?: string;
    };
    assetsDir?: string;
  };
  sourceEvidence?: {
    scannedFileCount?: number;
    tokenCount?: number;
    snippetCount?: number;
    confidence?: Record<string, string | number>;
    evidenceExcerpt?: string;
  };
}

export interface DesignSystemsResponse {
  designSystems: DesignSystemSummary[];
}

export interface DesignSystemResponse {
  designSystem: DesignSystemDetail;
}

export interface DesignSystemProvenance {
  companyBlurb?: string;
  githubUrls?: string[];
  localCodeFiles?: string[];
  figFiles?: string[];
  assetFiles?: string[];
  notes?: string;
  sourceNotes?: string;
}

export type DesignSystemFileKind =
  | 'folder'
  | 'page'
  | 'stylesheet'
  | 'document'
  | 'image'
  | 'data'
  | 'asset';

export interface DesignSystemFileSummary {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size?: number;
  updatedAt?: string;
}

export interface DesignSystemFileDetail extends DesignSystemFileSummary {
  content: string;
}

export interface DesignSystemFilesResponse {
  files: DesignSystemFileSummary[];
}

export interface DesignSystemFileResponse {
  file: DesignSystemFileDetail;
}

export interface DesignSystemWorkspaceResponse {
  project: import('./projects.js').Project;
  files: import('./files.js').ProjectFile[];
}

export type DesignSystemRevisionStatus = 'pending' | 'accepted' | 'rejected';

export interface DesignSystemRevision {
  id: string;
  designSystemId: string;
  status: DesignSystemRevisionStatus;
  feedback: string;
  baseBody: string;
  proposedBody: string;
  createdAt: string;
  updatedAt: string;
  sectionTitle?: string;
  jobId?: string;
}

export interface DesignSystemRevisionsResponse {
  revisions: DesignSystemRevision[];
}

export interface DesignSystemRevisionResponse {
  revision: DesignSystemRevision;
}

export type DesignSystemGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export type DesignSystemGenerationStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface DesignSystemGenerationStep {
  id: string;
  title: string;
  status: DesignSystemGenerationStepStatus;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DesignSystemGenerationJob {
  id: string;
  kind?: 'generation' | 'revision';
  status: DesignSystemGenerationJobStatus;
  progress: number;
  steps: DesignSystemGenerationStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  designSystemId?: string;
  revisionId?: string;
  error?: string;
  message?: string;
}

export interface DesignSystemGenerationJobResponse {
  job: DesignSystemGenerationJob;
}

export type DesignSystemPackageAuditSeverity = 'error' | 'warning';

export interface DesignSystemPackageAuditIssue {
  severity: DesignSystemPackageAuditSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface DesignSystemPackageAudit {
  ok: boolean;
  projectPath: string;
  filesInspected: number;
  errors: DesignSystemPackageAuditIssue[];
  warnings: DesignSystemPackageAuditIssue[];
}

export interface DesignSystemPackageAuditResponse {
  audit: DesignSystemPackageAudit;
}

export interface DesignSystemRevisionJobRequest {
  feedback: string;
  sectionTitle?: string;
  body?: string;
}

export interface ImportLocalDesignSystemRequest {
  /** Absolute local project directory selected by the user. */
  baseDir: string;
  /** Optional display name override for the generated design-system project. */
  name?: string;
  /** Import structure mode. Defaults to hybrid for real project imports. */
  importMode?: 'normalized' | 'hybrid' | 'verbatim';
  /** Craft sections that should actively apply when this system is used. */
  craftApplies?: string[];
}

export interface ImportLocalDesignSystemResponse {
  designSystem: DesignSystemSummary;
}

export interface ImportGitHubDesignSystemRequest {
  /** Public GitHub repository URL, e.g. https://github.com/owner/repo. */
  githubUrl: string;
  /** Optional branch to clone. Defaults to the repository default branch. */
  branch?: string;
  /** Optional display name override for the generated design-system project. */
  name?: string;
  /** Import structure mode. Defaults to hybrid for real project imports. */
  importMode?: 'normalized' | 'hybrid' | 'verbatim';
  /** Craft sections that should actively apply when this system is used. */
  craftApplies?: string[];
}

export interface ImportGitHubDesignSystemResponse {
  designSystem: DesignSystemSummary;
}

export interface HealthResponse {
  ok: true;
  service?: 'daemon';
  version?: string;
}

// A pet packaged by the upstream Codex `hatch-pet` skill. Each pet is a
// folder under `${CODEX_HOME:-$HOME/.codex}/pets/<id>/` that contains a
// `pet.json` manifest and a `spritesheet.<png|webp>` atlas. The daemon
// surfaces these so the web pet settings can offer one-click adoption
// of recently-hatched pets without asking the user to re-upload the
// file by hand.
export interface CodexPetSummary {
  id: string;
  displayName: string;
  description: string;
  // URL on the daemon that serves the raw spritesheet bytes.
  spritesheetUrl: string;
  // File extension reported by the on-disk spritesheet (png / webp /
  // gif). Useful only as a hint to the client renderer.
  spritesheetExt: string;
  // Unix milliseconds for the spritesheet file's mtime — lets the
  // client sort "most recently hatched" without re-listing.
  hatchedAt: number;
  // True when the pet ships in the repo under `assets/community-pets/`
  // rather than the user's `~/.codex/pets/`. Surfaced so the UI can
  // tag the card with a small "Bundled" pill and avoid prompting the
  // user to re-sync something that is already on disk.
  bundled?: boolean;
}

export interface CodexPetsResponse {
  pets: CodexPetSummary[];
  // Absolute path of the directory we scanned. Surfaced so the UI can
  // tell the user where their pets live (and where to look if a pet
  // they expect is missing).
  rootDir: string;
}

// Body for `POST /api/codex-pets/sync` — triggers the daemon-side port
// of `scripts/sync-community-pets.ts`. Both fields are optional so the
// default call (`syncCommunityPets({})`) downloads every catalog and
// skips pets that already exist on disk.
export interface SyncCommunityPetsRequest {
  // Which catalog(s) to download. Defaults to 'all'.
  source?: 'all' | 'petshare' | 'hatchery';
  // Re-download pets that already have a folder on disk.
  force?: boolean;
}

// Daemon response after a community sync. Matches the script's stdout
// summary so the web UI can show the same "wrote/skipped/failed" line.
export interface SyncCommunityPetsResponse {
  wrote: number;
  skipped: number;
  failed: number;
  total: number;
  rootDir: string;
  // Up to ~10 surfaced error messages (the daemon log keeps the rest).
  errors: string[];
}

export type InstallInput =
  | { source: 'github'; url: string }
  | { source: 'local'; path: string };

export interface InstallSkillResponse {
  skill: SkillSummary;
}

export interface InstallDesignSystemResponse {
  designSystem: DesignSystemSummary;
}

export interface UninstallResponse {
  ok: true;
}
