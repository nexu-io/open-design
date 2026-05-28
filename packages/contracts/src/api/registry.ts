import { z } from 'zod';

export interface AgentModelOption {
  id: string;
  label: string;
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
}

export interface AgentsResponse {
  agents: AgentInfo[];
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

export const SkillSummarySchema: z.ZodType<SkillSummary> = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.record(z.string()).optional(),
  description: z.string(),
  descriptionI18n: z.record(z.string()).optional(),
  triggers: z.array(z.string()),
  mode: z.enum([
    'prototype',
    'deck',
    'template',
    'design-system',
    'image',
    'video',
    'audio',
  ]),
  surface: z.enum(['web', 'image', 'video', 'audio']).optional(),
  platform: z.enum(['desktop', 'mobile']).nullable().optional(),
  scenario: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  source: z.enum(['built-in', 'user']).optional(),
  previewType: z.string(),
  designSystemRequired: z.boolean(),
  defaultFor: z.array(z.string()),
  upstream: z.string().nullable(),
  featured: z.number().nullable().optional(),
  fidelity: z.enum(['wireframe', 'high-fidelity']).nullable().optional(),
  speakerNotes: z.boolean().nullable().optional(),
  animations: z.boolean().nullable().optional(),
  craftRequires: z.array(z.string()).optional(),
  hasBody: z.boolean(),
  examplePrompt: z.string(),
  examplePromptI18n: z.record(z.string()).optional(),
  aggregatesExamples: z.boolean(),
}).passthrough() as z.ZodType<SkillSummary>;

export const SkillSummaryArraySchema = z.array(SkillSummarySchema);

export function parseSkillSummaries(value: unknown): SkillSummary[] {
  return SkillSummaryArraySchema.parse(value);
}

export function isSkillSummaries(value: unknown): value is SkillSummary[] {
  return SkillSummaryArraySchema.safeParse(value).success;
}

export interface SkillCatalogTreeSkill {
  id: string;
  name: string;
  description: string;
  mode: SkillSummary['mode'];
  scenario: string;
  platform: SkillSummary['platform'];
  previewType: string;
  designSystemRequired: boolean;
  examplePrompt: string;
  source: SkillSummary['source'];
  featured: number | null;
  defaultFor: string[];
  category: string | null;
  skill: SkillSummary;
}

export interface SkillCatalogTreeScenario {
  id: string;
  label: string;
  count: number;
  skills: SkillCatalogTreeSkill[];
}

export interface SkillCatalogTreeMode {
  id: SkillSummary['mode'];
  label: string;
  count: number;
  scenarios: SkillCatalogTreeScenario[];
}

export interface SkillCatalogTree {
  total: number;
  modes: SkillCatalogTreeMode[];
}

const SKILL_MODE_ORDER: readonly SkillSummary['mode'][] = [
  'prototype',
  'deck',
  'template',
  'design-system',
  'image',
  'video',
  'audio',
];

export function buildSkillCatalogTree(
  skills: readonly SkillSummary[],
): SkillCatalogTree {
  const modeBuckets = new Map<SkillSummary['mode'], Map<string, SkillCatalogTreeSkill[]>>();

  for (const skill of skills) {
    const scenario = normalizeTreeScenario(skill.scenario);
    let scenarioBuckets = modeBuckets.get(skill.mode);
    if (!scenarioBuckets) {
      scenarioBuckets = new Map<string, SkillCatalogTreeSkill[]>();
      modeBuckets.set(skill.mode, scenarioBuckets);
    }
    const bucket = scenarioBuckets.get(scenario) ?? [];
    bucket.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      mode: skill.mode,
      scenario,
      platform: skill.platform ?? null,
      previewType: skill.previewType,
      designSystemRequired: skill.designSystemRequired,
      examplePrompt: skill.examplePrompt,
      source: skill.source,
      featured: skill.featured ?? null,
      defaultFor: skill.defaultFor ?? [],
      category: skill.category ?? null,
      skill,
    });
    scenarioBuckets.set(scenario, bucket);
  }

  const modes = [...modeBuckets.entries()]
    .sort(([a], [b]) => compareMode(a, b))
    .map(([mode, scenarioBuckets]) => {
      const scenarios = [...scenarioBuckets.entries()]
        .sort(([a], [b]) => compareScenario(a, b))
        .map(([scenario, scenarioSkills]) => {
          const sortedSkills = [...scenarioSkills].sort(compareTreeSkill);
          return {
            id: scenario,
            label: labelFromSlug(scenario),
            count: sortedSkills.length,
            skills: sortedSkills,
          };
        });
      return {
        id: mode,
        label: labelFromSlug(mode),
        count: scenarios.reduce((total, scenario) => total + scenario.count, 0),
        scenarios,
      };
    });

  return {
    total: skills.length,
    modes,
  };
}

function normalizeTreeScenario(scenario: SkillSummary['scenario']): string {
  const normalized = typeof scenario === 'string' ? scenario.trim() : '';
  return normalized.length > 0 ? normalized : 'general';
}

function compareMode(a: SkillSummary['mode'], b: SkillSummary['mode']): number {
  const aIndex = SKILL_MODE_ORDER.indexOf(a);
  const bIndex = SKILL_MODE_ORDER.indexOf(b);
  if (aIndex !== bIndex) return aIndex - bIndex;
  return a.localeCompare(b);
}

function compareScenario(a: string, b: string): number {
  if (a === 'general' && b !== 'general') return -1;
  if (b === 'general' && a !== 'general') return 1;
  return a.localeCompare(b);
}

function compareTreeSkill(
  a: SkillCatalogTreeSkill,
  b: SkillCatalogTreeSkill,
): number {
  const rankDiff = treeSkillRank(a) - treeSkillRank(b);
  if (rankDiff !== 0) return rankDiff;
  if (a.featured !== null || b.featured !== null) {
    const featuredDiff = (a.featured ?? Number.MAX_SAFE_INTEGER) - (b.featured ?? Number.MAX_SAFE_INTEGER);
    if (featuredDiff !== 0) return featuredDiff;
  }
  const nameDiff = a.name.localeCompare(b.name);
  if (nameDiff !== 0) return nameDiff;
  return a.id.localeCompare(b.id);
}

function treeSkillRank(skill: SkillCatalogTreeSkill): number {
  if (skill.defaultFor.length > 0) return 0;
  if (skill.featured !== null) return 1;
  return 2;
}

function labelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
