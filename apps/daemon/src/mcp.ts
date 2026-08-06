// `od mcp` - stdio MCP server that proxies project tool calls to the
// running daemon's HTTP API. Lets a coding agent in a *different* repo
// (Claude Code, Cursor, Zed) pull files from a local Open Design
// project and create project-scoped artifacts without the
// export-zip-import dance.
//
// The server itself holds no state and never touches the filesystem;
// every tool resolves to a fetch() against `OD_DAEMON_URL`. Spawn the
// MCP server with no daemon running and tool calls return a clear
// "daemon not reachable" error - the server itself still launches so
// the client can list its tool schema.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ANALYTICS_HEADER_ATTRIBUTION_QUALITY,
  ANALYTICS_HEADER_CLIENT_TYPE,
  ANALYTICS_HEADER_DEVICE_ID,
  ANALYTICS_HEADER_DISTRIBUTION_MECHANISM,
  ANALYTICS_HEADER_ENTRY_SURFACE,
  ANALYTICS_HEADER_EXTERNAL_PLUGIN_ID,
  ANALYTICS_HEADER_EXTERNAL_PLUGIN_VERSION,
  ANALYTICS_HEADER_HOST_PRODUCT,
  ANALYTICS_HEADER_LOCALE,
  ANALYTICS_HEADER_MCP_SESSION_ID,
  ANALYTICS_HEADER_PUBLISHER_CLASS,
  ANALYTICS_HEADER_REQUEST_ID,
  ANALYTICS_HEADER_SESSION_ID,
  buildProjectRawFileUrl,
  type McpAnalyticsContextResponse,
} from '@open-design/contracts';
import { randomUUID } from 'node:crypto';

import { postCreateArtifactRequest } from './artifacts/create.js';
import {
  createLocalMcpBriefStore as createBriefStore,
  localMcpBriefResponseCopy,
  type LocalMcpBriefStore,
} from './mcp-brief.js';
import {
  OPEN_DESIGN_BRIEF_APP_HTML,
  OPEN_DESIGN_BRIEF_APP_VERSION,
} from './mcp-apps/brief-resource.js';
import { DEFAULT_AMR_RECHARGE_URL } from './integrations/vela-errors.js';
import {
  type ExternalPluginContext,
  logicalPluginRequestDigest,
  mapMcpHostProduct,
  normalizeExternalPluginRunAnalyticsHints,
  OPEN_DESIGN_PLUGIN_ID,
  pluginContractError,
  resolvePluginGenerationSloWindowMs,
  validateExternalPluginContext,
  validatePluginRequestId,
  validatePluginWorkflowId,
} from './mcp-observability.js';

const SERVER_NAME = 'open-design';
const SERVER_VERSION = '0.2.0';
const MCP_STDIO_IDLE_EXIT_MS = 30 * 60 * 1000;
const OPEN_DESIGN_BRIEF_APP_RESOURCE =
  'ui://open-design/artifact-card-v8.html';

export const MCP_SERVER_INSTRUCTIONS = [
  'Use only these product names in user-facing replies: Open Design Cloud and Local Codex.',
  'Tool names, runtime ids, endpoints, and correlation values are machine protocol. Never repeat them as product copy.',
].join('\n');

type JsonObject = Record<string, unknown>;
interface RunMcpOptions {
  daemonUrl: string | URL;
  resolveDaemonUrl?: () => Promise<string | URL>;
}
interface CatalogItem { id: string; name?: string; title?: string; description?: string; summary?: string }
interface SkillsPayload { skills?: CatalogItem[] }
interface PluginsPayload { plugins?: CatalogItem[] }
interface DesignSystemsPayload { designSystems?: CatalogItem[] }
interface ResourcePayload { skill?: { body?: string; content?: string }; designSystem?: { body?: string; content?: string }; body?: string; content?: string }
interface ProjectSummary { id: string; name: string; metadata?: JsonObject }
interface ProjectsPayload { projects?: ProjectSummary[] }
interface ProjectPayload { project?: ProjectSummary; id?: string; name?: string; metadata?: JsonObject; resolvedDir?: string }
interface ActiveContext { active?: boolean; projectId?: string; projectName?: string | null; fileName?: string | null; ageMs?: number | null }
type ResolvedProject = { id: string; name: string; source: 'uuid' | 'id' | 'exact' | 'slug' | 'substring' };
interface ProjectListCache { baseUrl: string; t: number; list: ProjectSummary[] }
interface McpArgs extends JsonObject { project?: unknown; entry?: unknown; include?: unknown; maxBytes?: unknown; path?: unknown; offset?: unknown; limit?: unknown; since?: unknown; query?: unknown; pattern?: unknown; max?: unknown; name?: unknown; content?: unknown; encoding?: unknown; artifactManifest?: unknown; confirm?: unknown; prompt?: unknown; plugin?: unknown; inputs?: unknown; agent?: unknown; model?: unknown; serviceTier?: unknown; apiKey?: unknown; requestId?: unknown; resume?: unknown; runId?: unknown; id?: unknown; designSystem?: unknown; skill?: unknown; includeUnavailable?: unknown; artifactType?: unknown; projectTitle?: unknown; locale?: unknown; knownAnswers?: unknown; skip?: unknown; briefDraftId?: unknown; nonce?: unknown; answers?: unknown; externalPluginContext?: unknown; pluginWorkflowId?: unknown }
interface ProjectFileBundleEntry { name: string; mime: string; size: number | null; content: string | null; binary: boolean }
interface BundleInput { project: ProjectPayload | ProjectSummary; entry: string; files: ProjectFileBundleEntry[]; truncated: boolean; skippedFileCount?: number; active: ActiveContext | null; resolved?: ResolvedProject | null }
interface ErrorWithCode { message?: string; code?: string; cause?: { code?: string } }
interface HandleMcpToolCallOptions {
  briefStore?: LocalMcpBriefStore;
  analyticsHeaders?: Record<string, string>;
  pluginAttribution?: McpPluginAttribution | null;
  briefState?: 'confirmed' | 'skipped' | 'not_applicable';
}
interface McpPluginAttribution {
  context: ExternalPluginContext;
  pluginWorkflowId: string;
}
interface McpToolCallResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: JsonObject;
  isError?: boolean;
}

const SAFE_MCP_DAEMON_RETRY_CALLS = new Set([
  'get_active_context',
  'get_artifact',
  'get_file',
  'get_project',
  'get_run',
  'get_vela_login_status',
  'list_agents',
  'list_files',
  'list_plugins',
  'list_projects',
  'list_resources',
  'list_skills',
  'read_resource',
  'search_files',
]);

function normalizeDaemonUrl(value: string | URL): string {
  return String(value).replace(/\/$/, '');
}

function isDaemonUnreachableResult(result: McpToolCallResult): boolean {
  return result.isError === true
    && result.content.some((item) =>
      item.text.includes('cannot reach the Open Design daemon'),
    );
}

export function createMcpDaemonTarget(options: RunMcpOptions): {
  call(
    name: string,
    args: McpArgs,
    handler: (baseUrl: string) => Promise<McpToolCallResult>,
  ): Promise<McpToolCallResult>;
  currentUrl(): string;
  refresh(): Promise<string>;
} {
  let current = normalizeDaemonUrl(options.daemonUrl);
  let refreshTask: Promise<string> | null = null;

  const refresh = async (): Promise<string> => {
    if (!options.resolveDaemonUrl) return current;
    refreshTask ??= options.resolveDaemonUrl()
      .then((url) => {
        current = normalizeDaemonUrl(url);
        return current;
      })
      .catch(() => current)
      .finally(() => {
        refreshTask = null;
      });
    return await refreshTask;
  };

  return {
    currentUrl: () => current,
    refresh,
    async call(name, _args, handler) {
      const invoke = async (baseUrl: string): Promise<McpToolCallResult> => {
        try {
          return await handler(baseUrl);
        } catch (error) {
          return errorResult(formatError(error, baseUrl));
        }
      };
      const firstUrl = await refresh();
      const first = await invoke(firstUrl);
      if (!isDaemonUnreachableResult(first) || !options.resolveDaemonUrl) {
        return first;
      }

      const recoveredUrl = await refresh();
      if (!SAFE_MCP_DAEMON_RETRY_CALLS.has(name)) {
        // A failed write is ambiguous: the daemon may have committed it before
        // the transport broke. Refresh the target for the next request, but do
        // not replay a mutation and risk duplicate projects/runs/files.
        return first;
      }
      return await invoke(recoveredUrl);
    },
  };
}

export function _localeFromMcpToolMetadata(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const record = meta as Record<string, unknown>;
  for (const candidate of [record['openai/locale'], record.locale]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

interface McpIdleExitControllerOptions {
  idleMs: number;
  onIdle: () => void;
}

export function _createMcpIdleExitController({
  idleMs,
  onIdle,
}: McpIdleExitControllerOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = 0;
  let disposed = false;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    if (disposed) return;
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (disposed) return;
      if (inFlight > 0) {
        schedule();
        return;
      }
      disposed = true;
      onIdle();
    }, idleMs);
  };

  schedule();

  return {
    noteActivity() {
      schedule();
    },
    async trackRequest<T>(fn: () => T | Promise<T>): Promise<T> {
      if (disposed) {
        return fn();
      }
      inFlight += 1;
      schedule();
      try {
        return await fn();
      } finally {
        inFlight -= 1;
        if (inFlight === 0) {
          schedule();
        }
      }
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

// Mimes whose body we surface as MCP `text` content. Everything else
// returns a clear error directing the caller at list_files for
// metadata, until phase 2 adds binary support.
const TEXTUAL_MIME_PATTERNS = [
  /^text\//i,
  /^application\/json\b/i,
  /^application\/javascript\b/i,
  /^application\/typescript\b/i,
  /^application\/xml\b/i,
  /^application\/x-(yaml|toml|httpd-php|sh)\b/i,
  /\+json\b/i,
  /\+xml\b/i,
  /^image\/svg\+xml\b/i,
];

// Every tool here is a read against a local daemon owned by the
// current user, so they're all read-only, idempotent, and operate on
// a closed (project-scoped) namespace. Pull these into one constant
// so each tool def doesn't repeat them.
const READ_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

// Description style: short, one purpose-line per tool. Active-context
// fallback is documented once in the server `instructions` block, so
// per-tool descriptions just say "project optional" and don't repeat
// the rationale - that saves ~150 tokens per tools/list response,
// shipped to the model on every session.
const PROJECT_ARG = {
  type: 'string',
  description: 'Project id (UUID) or name substring. Optional; defaults to the active project (expires after ~5 minutes of no Open Design activity).',
} as const;

const PLUGIN_WORKFLOW_ID_ARG = {
  type: 'string',
  description:
    'Opaque workflow id issued by the local Open Design MCP after the first attributed call. Reuse it for later plugin-attributed calls; never invent or display it.',
} as const;

const EXTERNAL_PLUGIN_CONTEXT_ARG = {
  type: 'object',
  properties: {
    id: { type: 'string', const: OPEN_DESIGN_PLUGIN_ID },
    version: { type: 'string' },
    distributionMechanism: {
      type: 'string',
      enum: ['git_marketplace', 'local_repo', 'manual', 'unknown'],
    },
    publisherClass: {
      type: 'string',
      enum: ['open_design_first_party', 'third_party', 'unknown'],
    },
  },
  required: [
    'id',
    'version',
    'distributionMechanism',
    'publisherClass',
  ],
  additionalProperties: false,
  description:
    'Bounded self-reported distribution context. Used for product analytics only, never authorization or billing.',
} as const;

export const TOOL_DEFS = [
  {
    name: 'collect_brief',
    description:
      'Open an interactive Open Design brief card for a new artifact. Use the returned human-readable confirmation with any explicit execution mode; never ask the user to copy an internal draft id or nonce.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactType: {
          type: 'string',
          enum: [
            'website',
            'product-prototype',
            'presentation',
            'document',
            'image',
            'video',
            'audio',
            'design-system',
          ],
          description: 'Artifact workflow whose brief should be collected.',
        },
        projectTitle: {
          type: 'string',
          description: 'Concise human-readable project title.',
        },
        locale: {
          type: 'string',
          description:
            'BCP-47 language of the current user request. Prefer the request language over the host UI language; supported values are en, zh-CN, zh-TW, and ja, with English fallback.',
        },
        knownAnswers: {
          type: 'object',
          additionalProperties: true,
          description: 'Optional stable question-id answers already supplied by the user.',
        },
        skip: {
          type: 'boolean',
          description: 'Use recommended defaults without asking. Defaults to false.',
        },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
        externalPluginContext: EXTERNAL_PLUGIN_CONTEXT_ARG,
      },
      required: ['artifactType'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Collect Open Design brief' },
    _meta: {
      ui: { resourceUri: OPEN_DESIGN_BRIEF_APP_RESOURCE },
      'ui/resourceUri': OPEN_DESIGN_BRIEF_APP_RESOURCE,
      'openai/outputTemplate': OPEN_DESIGN_BRIEF_APP_RESOURCE,
    },
  },
  {
    name: 'confirm_brief',
    description:
      'Confirm the choices from the rendered Open Design brief card. Returns a readable summary; draft ids and nonces are internal widget data, never user-facing copy.',
    inputSchema: {
      type: 'object',
      properties: {
        briefDraftId: {
          type: 'string',
          description: 'Internal draft id returned by collect_brief.',
        },
        nonce: {
          type: 'string',
          description: 'Internal nonce returned by collect_brief.',
        },
        answers: {
          type: 'object',
          additionalProperties: true,
          description: 'Question-id to selected stable option values.',
        },
        locale: {
          type: 'string',
          description:
            'BCP-47 Host locale used only when collect_brief had no request or tool-call locale.',
        },
      },
      required: ['briefDraftId', 'nonce', 'answers'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Confirm Open Design brief' },
  },
  {
    name: 'list_projects',
    description: 'List every Open Design project on this daemon.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'List Open Design projects' },
  },
  {
    name: 'get_active_context',
    description:
      'Project + file the user has open in Open Design right now. Returns {active:false, hint:"..."} when no project is active so the agent can ask the user to interact with Open Design (the active context expires ~5 minutes after the last user interaction). Most tools default to this when project is omitted, so you rarely need to call this directly.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'What is the user looking at?' },
  },
  {
    name: 'get_artifact',
    description:
      'PREFER THIS over multiple get_file calls. Bundles the entry file plus every sibling it references (HTML <script>/<link>/<img>/srcset, JSX import/require, CSS url()/@import) up to depth 3, skipping CDN/data URLs. include="all" returns every file in the project; include="shallow" returns just the entry.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        entry: {
          type: 'string',
          description:
            "Entry file path relative to project root. Defaults to the active file or project's metadata.entryFile. Active-file fallback expires after ~5 minutes of no Open Design activity.",
        },
        include: {
          type: 'string',
          enum: ['auto', 'all', 'shallow'],
          description: 'auto (default) | all | shallow',
        },
        maxBytes: {
          type: 'number',
          description:
            'Soft cap on total text bytes (default 1_500_000). Also capped at 200 files. Excess files are dropped and truncated:true is set.',
        },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Pull design bundle' },
  },
  {
    name: 'get_project',
    description:
      'Single project metadata: name, active skill/design-system ids, entryFile, kind, timestamps, resolvedDir, and (when it has an entry file) a browser-openable previewUrl.',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Get Open Design project' },
  },
  {
    name: 'get_file',
    description:
      'Read one project file. Text mimes only (HTML, JSX, CSS, JSON, SVG, Markdown). Binary files return an error; use list_files for metadata. Returns up to `limit` lines starting at `offset` (defaults: offset=0, limit=2000), mirroring Claude Code\'s Read tool. For files longer than the slice, the response carries an `[od:file-window ...]` marker with totalLines so you can page by re-calling with the next offset. For multi-file designs prefer get_artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        path: {
          type: 'string',
          description:
            'File path relative to project root, forward slashes. Optional; defaults to the active file when project is also omitted. Active-file fallback expires after ~5 minutes of no Open Design activity.',
        },
        offset: {
          type: 'number',
          description: '0-indexed starting line of the slice to return. Defaults to 0.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to return. Defaults to 2000.',
        },
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Read project file' },
  },
  {
    name: 'search_files',
    description:
      'Case-insensitive literal-substring search across textual files in a project. Returns up to max matches with file, 1-indexed line, and snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        query: {
          type: 'string',
          description: 'Literal substring (not a regex), case-insensitive.',
        },
        pattern: {
          type: 'string',
          description: 'Optional glob on file name, e.g. "*.jsx".',
        },
        max: {
          type: 'number',
          description: 'Cap on matches (default 200, hard cap 1000).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Search project files' },
  },
  {
    name: 'list_files',
    description:
      'Project file metadata: name, path, mime, kind, size, mtime, optional artifactManifest. Pass since=<unix-ms> to cheap-poll for changes.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        since: {
          type: 'number',
          description: 'Unix-ms; only return files with mtime > since.',
        },
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'List project files' },
  },
  {
    name: 'create_artifact',
    description:
      'Create one normal Open Design project artifact entry file. Writes name+content, rejects existing targets, and persists artifactManifest when supplied. HTML, Markdown, and SVG entries get a default manifest when omitted. Project optional; defaults to the active project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        name: {
          type: 'string',
          description: 'Output path relative to the project root, for example "codex-product/index.html" or "deck.html".',
        },
        content: {
          type: 'string',
          description: 'Entry file contents. Use encoding="base64" for base64 content.',
        },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          description: 'utf8 (default) | base64',
        },
        artifactManifest: {
          type: 'object',
          additionalProperties: true,
          description: 'Optional ArtifactManifest sidecar. If omitted, Open Design infers one for HTML, Markdown, or SVG entry files.',
        },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Create Open Design artifact' },
  },
  {
    name: 'write_file',
    description:
      'Write (or overwrite) a project file. Unlike create_artifact this does not require an ArtifactManifest and tolerates existing targets, so it is the right tool for iterating on a file the agent (or the user) already created. Project optional; defaults to the active project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        path: {
          type: 'string',
          description: 'Output path relative to the project root, e.g. "deck.html" or "components/Hero.tsx".',
        },
        content: {
          type: 'string',
          description: 'File contents. Use encoding="base64" for binary payloads.',
        },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          description: 'utf8 (default) | base64',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Write Open Design project file' },
  },
  {
    name: 'delete_file',
    description:
      'Delete one file from a project. Supports nested paths (e.g. "codex-product/index.html"). Project optional; defaults to the active project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        path: {
          type: 'string',
          description: 'Project-relative path of the file to delete.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, destructiveHint: true, title: 'Delete Open Design project file' },
  },
  {
    name: 'delete_project',
    description:
      'Permanently delete an Open Design project including its files and conversations. Requires both an explicit project id/name AND confirm:true — there is no active-project fallback because the operation is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project id (UUID) or name substring. Required — active-context fallback is intentionally disabled.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be literally true. Guards against an agent accidentally deleting a project while cleaning up.',
        },
      },
      required: ['project', 'confirm'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, destructiveHint: true, title: 'Delete Open Design project' },
  },
  {
    name: 'create_project',
    description:
      'Create a new empty Open Design project to generate into, then call start_run against it. Returns the project (with its id) plus a conversationId. The id is derived from name unless you pass one explicitly.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable project name.' },
        id: {
          type: 'string',
          description: 'Optional project id slug ([A-Za-z0-9._-], <=128 chars). Derived from name when omitted.',
        },
        designSystem: {
          type: 'string',
          description: 'Optional design system id to attach (see the od://design-systems/... resources).',
        },
        skill: { type: 'string', description: 'Optional skill id to seed the project with.' },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Create Open Design project' },
  },
  // Discovery + generation. An external coding agent does NOT run a
  // skill itself — it commissions Open Design to, via start_run. The
  // daemon then spawns ITS OWN agent (Claude Code / API fallback /…)
  // to do the work. So list_skills / list_plugins exist purely so the
  // caller can discover what it can ask OD to generate; start_run
  // kicks off the run and get_run polls it to completion. Design
  // systems stay resource-only (od://design-systems/...) since they're
  // reference material the caller opts into, not something to run.
  {
    name: 'list_skills',
    description: 'List Open Design skills you can pass to start_run as a recipe. Discovery only — Open Design runs the skill, not you.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'List Open Design skills' },
  },
  {
    name: 'list_plugins',
    description: 'List installed Open Design plugins (packaged design workflows) you can pass to start_run as plugin + inputs.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'List Open Design plugins' },
  },
  {
    name: 'start_vela_login',
    description:
      'Start Open Design Cloud browser sign-in through the local Open Design daemon. Returns the activation URL and user code when manual browser completion is needed. The tool name is an internal compatibility identifier and must not be repeated to the user.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: {
      ...WRITE_ANNOTATIONS,
      openWorldHint: true,
      title: 'Sign in to Open Design Cloud',
    },
  },
  {
    name: 'get_vela_login_status',
    description:
      'Check whether Open Design Cloud browser sign-in is complete. Does not expose credentials. The tool name is an internal compatibility identifier and must not be repeated to the user.',
    inputSchema: {
      type: 'object',
      properties: { pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG },
      additionalProperties: false,
    },
    annotations: {
      ...READ_ANNOTATIONS,
      openWorldHint: true,
      title: 'Check Open Design Cloud sign-in',
    },
  },
  {
    name: 'start_run',
    description:
      'Commission Open Design to generate or refine a design. Open Design spawns its own agent to do the work and returns a runId immediately. Poll get_run(runId) until status is terminal; its Preview/Studio reference is the default delivery. Call get_artifact only when source context is genuinely needed. Project optional; defaults to the active project. Requires an existing project (create one first with create_project).',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        prompt: {
          type: 'string',
          description: 'What to make or change, in natural language. Optional when a plugin supplies its own brief.',
        },
        skill: {
          type: 'string',
          description: 'Skill id from list_skills to drive the run. Optional.',
        },
        plugin: {
          type: 'string',
          description: 'Plugin id from list_plugins to drive the run. Optional.',
        },
        inputs: {
          type: 'object',
          additionalProperties: true,
          description: 'Plugin inputs object (only meaningful with plugin). Optional.',
        },
        agent: {
          type: 'string',
          description:
            'Internal runtime id returned by list_agents. Optional; defaults to the configured runtime. Never display the id as user-facing mode copy.',
        },
        model: {
          type: 'string',
          description: 'Model id override for the run. Optional.',
        },
        serviceTier: {
          type: 'string',
          description: "Service tier override for the selected model, e.g. 'priority' for Codex Fast. Optional.",
        },
        requestId: {
          type: 'string',
          description:
            'Stable canonical UUID or ULID for this confirmed generation action. Generate it once before calling start_run and reuse it verbatim if the tool response is lost or retried; a different payload with the same id is rejected.',
        },
        resume: {
          type: 'boolean',
          description:
            'Set true only after the user has topped up a paused Open Design Cloud run. Reuse the exact original requestId and payload; Open Design resumes the same logical run.',
        },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
      },
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Generate with Open Design' },
  },
  {
    name: 'get_run',
    description:
      'Poll a run started by start_run. Returns status (queued|running|succeeded|failed|canceled) plus error info. On success, adds previewUrl (open it in a browser to view the rendered design) and agentMessage (the inner agent\'s textual output reassembled from the event stream — show this when there is no previewUrl, e.g. when the agent asked the user a clarifying question instead of producing files).',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run id returned by start_run.' },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
      },
      required: ['runId'],
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Check Open Design run' },
  },
  {
    name: 'cancel_run',
    description: 'Request cancellation of an in-flight run started by start_run.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run id returned by start_run.' },
      },
      required: ['runId'],
      additionalProperties: false,
    },
    annotations: { ...WRITE_ANNOTATIONS, title: 'Cancel Open Design run' },
  },
  {
    name: 'list_agents',
    description:
      'List the agent CLIs Open Design can run for start_run.agent. Returns only installed (available) agents by default — pass includeUnavailable:true to also see agents we know about but that are not on PATH (each carries an installUrl for the user). Each entry includes id, name, version, and up to 10 sample models (modelsCount carries the real total).',
    inputSchema: {
      type: 'object',
      properties: {
        includeUnavailable: {
          type: 'boolean',
          description: 'When true, include agents whose binary is not installed. Defaults to false.',
        },
        pluginWorkflowId: PLUGIN_WORKFLOW_ID_ARG,
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'List Open Design agents' },
  },
];

export function localMcpToolDefinitions() {
  return TOOL_DEFS;
}

type RuntimeJsonSchema = {
  type?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, RuntimeJsonSchema>;
  items?: RuntimeJsonSchema;
  additionalProperties?: boolean;
};

function validateRuntimeJsonSchema(
  value: unknown,
  schema: RuntimeJsonSchema,
  path: string,
): void {
  if (schema.enum && !schema.enum.includes(value)) {
    throw pluginContractError(`${path} is not an allowed value`);
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    throw pluginContractError(`${path} must be a string`);
  }
  if (
    schema.type === 'number'
    && (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw pluginContractError(`${path} must be a finite number`);
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    throw pluginContractError(`${path} must be a boolean`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      throw pluginContractError(`${path} must be an array`);
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateRuntimeJsonSchema(item, schema.items!, `${path}[${index}]`));
    }
    return;
  }
  if (schema.type !== 'object') return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw pluginContractError(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const required of schema.required ?? []) {
    if (!(required in record)) {
      throw pluginContractError(`${path}.${required} is required`);
    }
  }
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false) {
    const unsupported = Object.keys(record).find((key) => !(key in properties));
    if (unsupported) {
      throw pluginContractError(`${path}.${unsupported} is unsupported`);
    }
  }
  for (const [key, nested] of Object.entries(properties)) {
    if (record[key] !== undefined) {
      validateRuntimeJsonSchema(record[key], nested, `${path}.${key}`);
    }
  }
}

function validateMcpToolArgs(name: string, args: McpArgs): void {
  const definition = TOOL_DEFS.find((tool) => tool.name === name);
  if (!definition) {
    throw pluginContractError(`unknown MCP tool: ${name}`);
  }
  validateRuntimeJsonSchema(
    args,
    definition.inputSchema as RuntimeJsonSchema,
    name,
  );
}

export function localMcpResourceDefinitions() {
  return [
    {
      uri: OPEN_DESIGN_BRIEF_APP_RESOURCE,
      name: 'Open Design brief',
      title: 'Choose the artifact direction',
      description:
        'Interactive local Open Design brief card shared by Open Design Cloud and Local Codex modes.',
      mimeType: 'text/html;profile=mcp-app',
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
        'ui/prefersBorder': true,
        'ui/csp': {
          connectDomains: [],
          resourceDomains: [],
        },
        'openai/widgetPrefersBorder': true,
      },
    },
  ];
}

export function createLocalMcpBriefStore() {
  return createBriefStore();
}

interface McpObservedCall {
  attribution: McpPluginAttribution | null;
  attemptNumber: number;
  pollAttemptCount?: number;
}

class BoundedLruMap<K, V> {
  private readonly values = new Map<K, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.values.has(key);
  }

  set(key: K, value: V): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

interface PersistedPluginWorkflowBinding {
  runId: string;
  projectId: string | null;
  pluginWorkflowId: string;
  logicalRequestDigest: string;
  logicalRequestDigestVersion: 1;
  externalPluginContext: ExternalPluginContext;
}

function issuePluginWorkflowId(callerValue: unknown): string {
  if (callerValue !== undefined) {
    throw pluginContractError(
      'pluginWorkflowId must be omitted when externalPluginContext starts a workflow',
    );
  }
  return randomUUID();
}

export class McpObservabilitySession {
  readonly id = randomUUID();
  readonly hostProduct;
  private readonly workflows = new BoundedLruMap<string, ExternalPluginContext>(2_048);
  private readonly runWorkflows = new BoundedLruMap<string, string>(2_048);
  private readonly workflowRuns = new BoundedLruMap<string, string>(2_048);
  private readonly workflowProjects = new BoundedLruMap<string, string>(2_048);
  private readonly attempts = new BoundedLruMap<string, number>(4_096);
  private readonly polls = new BoundedLruMap<string, number>(4_096);

  private constructor(
    private baseUrl: string,
    private readonly identity: McpAnalyticsContextResponse,
    clientInfo: { name?: unknown; version?: unknown } | null | undefined,
  ) {
    this.hostProduct = mapMcpHostProduct(clientInfo);
  }

  updateBaseUrl(baseUrl: string): void {
    this.baseUrl = normalizeDaemonUrl(baseUrl);
  }

  static async create(
    baseUrl: string,
    clientInfo: { name?: unknown; version?: unknown } | null | undefined,
  ): Promise<McpObservabilitySession> {
    let identity: McpAnalyticsContextResponse = {
      enabled: false,
      deviceId: null,
      locale: 'en',
    };
    try {
      identity = await postJson<McpAnalyticsContextResponse>(
        `${baseUrl}/api/analytics/mcp/context`,
        {},
      );
    } catch {
      // A telemetry bootstrap failure must not block the MCP server.
    }
    const session = new McpObservabilitySession(baseUrl, identity, clientInfo);
    await session.emit('mcp_session_initialized', null, {
      mcp_session_id: session.id,
      host_product: session.hostProduct,
    });
    return session;
  }

  private async restoreAcceptedWorkflow(
    pluginWorkflowId: string,
  ): Promise<void> {
    const binding = await getJson<PersistedPluginWorkflowBinding>(
      `${this.baseUrl}/api/runs/by-plugin-workflow/${encodeURIComponent(pluginWorkflowId)}`,
    );
    if (
      binding.pluginWorkflowId !== pluginWorkflowId
      || typeof binding.runId !== 'string'
      || binding.runId.length === 0
      || (
        binding.projectId !== null
        && (typeof binding.projectId !== 'string' || binding.projectId.length === 0)
      )
      || binding.logicalRequestDigestVersion !== 1
      || !/^[0-9a-f]{64}$/u.test(binding.logicalRequestDigest)
    ) {
      throw pluginContractError(
        'persisted plugin workflow binding is invalid',
      );
    }
    const context = validateExternalPluginContext(
      binding.externalPluginContext,
    );
    this.workflows.set(pluginWorkflowId, context);
    this.rememberRun(
      binding.runId,
      binding.projectId ?? undefined,
      { context, pluginWorkflowId },
    );
  }

  async resolveAttribution(
    name: unknown,
    args: McpArgs,
    briefStore: LocalMcpBriefStore,
  ): Promise<McpPluginAttribution | null> {
    if (args.externalPluginContext !== undefined) {
      if (name !== 'collect_brief') {
        throw pluginContractError(
          'externalPluginContext may only start a workflow on collect_brief',
        );
      }
      const context = validateExternalPluginContext(
        args.externalPluginContext,
      );
      const pluginWorkflowId = issuePluginWorkflowId(args.pluginWorkflowId);
      args.pluginWorkflowId = pluginWorkflowId;
      this.workflows.set(pluginWorkflowId, context);
      return { context, pluginWorkflowId };
    }

    if (name === 'confirm_brief') {
      const inherited = briefStore.attributionForDraft(args.briefDraftId);
      if (inherited) {
        this.workflows.set(
          inherited.pluginWorkflowId,
          inherited.externalPluginContext,
        );
        return {
          context: inherited.externalPluginContext,
          pluginWorkflowId: inherited.pluginWorkflowId,
        };
      }
    }

    if (args.pluginWorkflowId !== undefined) {
      const pluginWorkflowId = validatePluginWorkflowId(
        args.pluginWorkflowId,
      );
      let context = this.workflows.get(pluginWorkflowId);
      if (!context) {
        await this.restoreAcceptedWorkflow(pluginWorkflowId);
        context = this.workflows.get(pluginWorkflowId);
      }
      if (!context) {
        throw pluginContractError(
          'pluginWorkflowId is unknown in this MCP session',
        );
      }
      return { context, pluginWorkflowId };
    }

    if (name === 'get_run' && typeof args.runId === 'string') {
      const pluginWorkflowId = this.runWorkflows.get(args.runId);
      const context = pluginWorkflowId
        ? this.workflows.get(pluginWorkflowId)
        : undefined;
      if (pluginWorkflowId && context) {
        return { context, pluginWorkflowId };
      }
    }
    return null;
  }

  beginCall(
    name: string,
    args: McpArgs,
    attribution: McpPluginAttribution | null,
  ): McpObservedCall {
    const attemptKey = `${attribution?.pluginWorkflowId ?? 'ordinary'}:${name}`;
    const attemptNumber = (this.attempts.get(attemptKey) ?? 0) + 1;
    this.attempts.set(attemptKey, attemptNumber);
    let pollAttemptCount: number | undefined;
    if (name === 'get_run' && typeof args.runId === 'string') {
      pollAttemptCount = (this.polls.get(args.runId) ?? 0) + 1;
      this.polls.set(args.runId, pollAttemptCount);
    }
    return {
      attribution,
      attemptNumber,
      ...(pollAttemptCount !== undefined ? { pollAttemptCount } : {}),
    };
  }

  rememberRun(
    runId: string,
    projectId: string | undefined,
    attribution: McpPluginAttribution,
  ): void {
    this.runWorkflows.set(runId, attribution.pluginWorkflowId);
    this.workflowRuns.set(attribution.pluginWorkflowId, runId);
    if (projectId) {
      this.workflowProjects.set(attribution.pluginWorkflowId, projectId);
    }
  }

  attributionQuality(
    name: string,
    args: McpArgs,
    attribution: McpPluginAttribution | null,
    payload: JsonObject | null,
  ): 'self_reported' | 'session_correlated' {
    if (!attribution || payload?.analyticsAttributionMismatch === true) {
      return 'self_reported';
    }
    if (name === 'start_run') {
      return this.workflowRuns.has(attribution.pluginWorkflowId)
        ? 'session_correlated'
        : 'self_reported';
    }
    if (name === 'get_run' && typeof args.runId === 'string') {
      return this.runWorkflows.get(args.runId) === attribution.pluginWorkflowId
        ? 'session_correlated'
        : 'self_reported';
    }
    if (name === 'get_artifact') {
      return this.workflowProjects.has(attribution.pluginWorkflowId)
        ? 'session_correlated'
        : 'self_reported';
    }
    return 'self_reported';
  }

  correlationFacts(
    name: string,
    args: McpArgs,
    attribution: McpPluginAttribution | null,
    payload: JsonObject | null,
  ): Record<string, unknown> {
    if (!attribution) return {};
    if (payload?.analyticsAttributionMismatch === true) {
      return {
        correlation_status: 'run_mismatch',
        error_code: 'PLUGIN_ATTRIBUTION_MISMATCH',
      };
    }
    if (name === 'get_run' && typeof args.runId === 'string') {
      return {
        correlation_status:
          this.runWorkflows.get(args.runId) === attribution.pluginWorkflowId
            ? 'matched'
            : 'run_mismatch',
      };
    }
    if (name === 'get_artifact') {
      const expectedProject = this.workflowProjects.get(
        attribution.pluginWorkflowId,
      );
      if (!expectedProject) return { correlation_status: 'missing_workflow' };
      return {
        correlation_status:
          payload?.projectId === expectedProject
            ? 'matched'
            : 'project_mismatch',
      };
    }
    return { correlation_status: 'matched' };
  }

  async emit(
    event:
      | 'mcp_session_initialized'
      | 'mcp_tool_started'
      | 'mcp_tool_finished',
    attribution: McpPluginAttribution | null,
    properties: Record<string, unknown>,
  ): Promise<void> {
    if (!this.identity.enabled || !this.identity.deviceId) return;
    try {
      const attributionQuality =
        properties.attribution_quality === 'session_correlated'
          ? 'session_correlated'
          : 'self_reported';
      await postJson(
        `${this.baseUrl}/api/analytics/mcp/event`,
        {
          event,
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          properties,
        },
        this.headers(attribution, undefined, attributionQuality),
      );
    } catch {
      // Analytics is deliberately best-effort.
    }
  }

  headers(
    attribution: McpPluginAttribution | null,
    requestId?: string,
    attributionQuality: 'self_reported' | 'session_correlated' = 'self_reported',
  ): Record<string, string> {
    if (!this.identity.enabled || !this.identity.deviceId) return {};
    return {
      [ANALYTICS_HEADER_DEVICE_ID]: this.identity.deviceId,
      [ANALYTICS_HEADER_SESSION_ID]: this.id,
      [ANALYTICS_HEADER_CLIENT_TYPE]: 'external_mcp',
      [ANALYTICS_HEADER_ENTRY_SURFACE]: 'external_mcp',
      [ANALYTICS_HEADER_HOST_PRODUCT]: this.hostProduct,
      [ANALYTICS_HEADER_LOCALE]: this.identity.locale || 'en',
      [ANALYTICS_HEADER_MCP_SESSION_ID]: this.id,
      ...(requestId ? { [ANALYTICS_HEADER_REQUEST_ID]: requestId } : {}),
      ...(attribution
        ? {
            [ANALYTICS_HEADER_EXTERNAL_PLUGIN_ID]:
              attribution.context.id,
            [ANALYTICS_HEADER_EXTERNAL_PLUGIN_VERSION]:
              attribution.context.version,
            [ANALYTICS_HEADER_DISTRIBUTION_MECHANISM]:
              attribution.context.distributionMechanism,
            [ANALYTICS_HEADER_PUBLISHER_CLASS]:
              attribution.context.publisherClass,
            [ANALYTICS_HEADER_ATTRIBUTION_QUALITY]: attributionQuality,
          }
        : {}),
    };
  }
}

function mcpSourceProperties(
  session: McpObservabilitySession,
  attribution: McpPluginAttribution | null,
  attributionQuality: 'self_reported' | 'session_correlated' = 'self_reported',
): Record<string, unknown> {
  return {
    mcp_session_id: session.id,
    host_product: session.hostProduct,
    ...(attribution
      ? {
          external_plugin_id: attribution.context.id,
          external_plugin_version: attribution.context.version,
          distribution_mechanism:
            attribution.context.distributionMechanism,
          publisher_class: attribution.context.publisherClass,
          attribution_quality: attributionQuality,
          plugin_workflow_id: attribution.pluginWorkflowId,
        }
      : {}),
  };
}

function parseMcpResult(result: McpToolCallResult): JsonObject | null {
  const text = result.content[0]?.text;
  if (typeof text !== 'string') return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function mcpFailureFacts(
  name: string,
  result: McpToolCallResult,
): Record<string, unknown> {
  if (result.isError !== true) return {};
  const message = result.content[0]?.text ?? '';
  const errorCode = message.includes('PLUGIN_CONTRACT_REJECTED')
    ? 'PLUGIN_CONTRACT_REJECTED'
    : message.includes('cannot reach the Open Design daemon')
      ? 'DAEMON_UNREACHABLE'
      : message.includes('DELIVERABLE_MISSING')
        ? 'DELIVERABLE_MISSING'
      : 'MCP_TOOL_FAILED';
  const failureStage =
    name === 'collect_brief' || name === 'confirm_brief'
      ? 'brief'
      : name.includes('vela_login')
        ? 'auth'
        : name.includes('project')
          ? 'project'
        : name === 'start_run'
          ? 'run_accept'
          : name === 'get_artifact' && errorCode === 'DELIVERABLE_MISSING'
            ? 'artifact_validation'
          : name === 'get_run'
            ? 'delivery'
            : name === 'get_artifact'
              ? 'delivery'
              : 'mcp_initialize';
  const failureSource =
    errorCode === 'PLUGIN_CONTRACT_REJECTED'
      ? 'local_mcp'
      : errorCode === 'DAEMON_UNREACHABLE'
        ? 'open_design_daemon'
        : errorCode === 'DELIVERABLE_MISSING'
          ? 'artifact_store'
          : message.includes('VELA_') || message.includes('AMR_')
            ? 'vela_api'
            : 'open_design_daemon';
  return {
    error_code: errorCode,
    failure_stage: failureStage,
    failure_source: failureSource,
    failure_category:
      errorCode === 'PLUGIN_CONTRACT_REJECTED'
        ? 'invalid_request'
        : errorCode === 'DAEMON_UNREACHABLE'
          ? 'availability'
          : 'unknown',
    retryable: errorCode === 'DAEMON_UNREACHABLE',
    user_action:
      errorCode === 'PLUGIN_CONTRACT_REJECTED'
        ? 'fix_plugin'
        : errorCode === 'DAEMON_UNREACHABLE'
          ? 'start_open_design'
          : 'retry',
  };
}

async function observeMcpToolCall(
  session: McpObservabilitySession,
  briefStore: LocalMcpBriefStore,
  daemonTarget: ReturnType<typeof createMcpDaemonTarget>,
  nameValue: unknown,
  args: McpArgs,
): Promise<McpToolCallResult> {
  const name = typeof nameValue === 'string' ? nameValue : 'unknown';
  const startedAt = Date.now();
  const toolAttemptId = randomUUID();
  let attribution: McpPluginAttribution | null = null;
  try {
    attribution = await session.resolveAttribution(name, args, briefStore);
    if (attribution) validateMcpToolArgs(name, args);
    if (
      attribution
      && name === 'get_artifact'
      && (typeof args.project !== 'string' || args.project.length === 0)
    ) {
      throw pluginContractError(
        'plugin get_artifact must identify the run project explicitly',
      );
    }
  } catch (error) {
    const observed = session.beginCall(name, args, null);
    const rawPlugin =
      args.externalPluginContext
      && typeof args.externalPluginContext === 'object'
      && !Array.isArray(args.externalPluginContext)
      && (args.externalPluginContext as JsonObject).id
        === OPEN_DESIGN_PLUGIN_ID;
    const rejected = errorResult(errorMessage(error));
    const common = {
      ...mcpSourceProperties(session, null),
      ...(rawPlugin
        ? {
            external_plugin_id: OPEN_DESIGN_PLUGIN_ID,
            attribution_quality: 'self_reported',
          }
        : {}),
      tool_name: name,
      tool_attempt_id: toolAttemptId,
      attempt_number: observed.attemptNumber,
    };
    await session.emit('mcp_tool_started', null, common);
    await session.emit('mcp_tool_finished', null, {
      ...common,
      result: 'failed',
      duration_ms: Math.max(0, Date.now() - startedAt),
      ...mcpFailureFacts(name, rejected),
    });
    return rejected;
  }

  const observed = session.beginCall(name, args, attribution);
  const requestId =
    typeof args.requestId === 'string' && args.requestId ? args.requestId : undefined;
  const logical =
    attribution && requestId
      ? logicalPluginRequestDigest(requestId)
      : null;
  const startedAttributionQuality = session.attributionQuality(
    name,
    args,
    attribution,
    null,
  );
  const common = {
    ...mcpSourceProperties(
      session,
      attribution,
      startedAttributionQuality,
    ),
    tool_name: name,
    tool_attempt_id: toolAttemptId,
    attempt_number: observed.attemptNumber,
    ...(typeof args.runId === 'string' ? { run_id: args.runId } : {}),
    ...(logical
      ? {
          logical_request_digest: logical.digest,
          logical_request_digest_version: logical.version,
        }
      : {}),
  };
  await session.emit('mcp_tool_started', attribution, common);

  const result = await daemonTarget.call(name, args, async (baseUrl) => {
    session.updateBaseUrl(baseUrl);
    return await handleMcpToolCall(baseUrl, name, args, {
      briefStore,
      analyticsHeaders: session.headers(attribution, requestId),
      pluginAttribution: attribution,
      ...(attribution
        ? {
            briefState: briefStore.briefStateForWorkflow(
              attribution.pluginWorkflowId,
            ),
          }
        : {}),
    });
  });
  const payload = parseMcpResult(result);
  if (
    name === 'start_run'
    && attribution
    && typeof payload?.runId === 'string'
    && payload.analyticsAttributionMismatch !== true
  ) {
    session.rememberRun(
      payload.runId,
      typeof payload.projectId === 'string' ? payload.projectId : undefined,
      attribution,
    );
  }
  const delivery = mcpDeliveryFacts(
    name,
    result,
    payload,
    observed.pollAttemptCount,
  );
  const finishedAttributionQuality = session.attributionQuality(
    name,
    args,
    attribution,
    payload,
  );
  await session.emit('mcp_tool_finished', attribution, {
    ...common,
    ...(attribution
      ? { attribution_quality: finishedAttributionQuality }
      : {}),
    result: result.isError === true ? 'failed' : 'success',
    duration_ms: Math.max(0, Date.now() - startedAt),
    ...(observed.pollAttemptCount
      ? { poll_attempt_count: observed.pollAttemptCount }
      : {}),
    ...mcpFailureFacts(name, result),
    ...delivery,
    ...session.correlationFacts(name, args, attribution, payload),
  });
  return result;
}

function mcpDeliveryFacts(
  name: string,
  result: McpToolCallResult,
  payload: JsonObject | null,
  pollAttemptCount?: number,
): Record<string, unknown> {
  if (
    name === 'start_run'
    && payload?.analyticsAttributionMismatch === true
  ) {
    return {
      correlation_status: 'run_mismatch',
      error_code: 'PLUGIN_ATTRIBUTION_MISMATCH',
    };
  }
  if (name === 'get_artifact') {
    if (result.isError === true || !payload) {
      return {
        delivery_kind: 'artifact_context_bundle',
        delivery_result: 'failed',
      };
    }
    const partial =
      payload.truncated === true
      || (typeof payload.skippedFileCount === 'number'
        && payload.skippedFileCount > 0);
    return {
      delivery_kind: 'artifact_context_bundle',
      delivery_result: partial ? 'partial' : 'complete',
      truncated: payload.truncated === true,
      skipped_file_count:
        typeof payload.skippedFileCount === 'number'
          ? payload.skippedFileCount
          : 0,
      ...(typeof payload.projectId === 'string'
        ? { project_id: payload.projectId }
        : {}),
    };
  }
  if (name !== 'get_run' || !payload) return {};
  const status = payload.status;
  const terminal =
    status === 'succeeded' || status === 'failed' || status === 'canceled';
  if (!terminal) {
    return {
      poll_state: 'non_terminal',
    };
  }
  const hasPreviewReference =
    typeof payload.previewUrl === 'string'
    && payload.previewUrl.length > 0
    && typeof payload.entryFile === 'string'
    && payload.entryFile.length > 0;
  const hasStudioReference =
    typeof payload.studioUrl === 'string'
    && payload.studioUrl.length > 0;
  const artifactCount =
    typeof payload.artifactCount === 'number'
    && Number.isFinite(payload.artifactCount)
      ? Math.max(0, Math.floor(payload.artifactCount))
      : null;
  const hasAuthoritativeValidation =
    typeof payload.deliverableValid === 'boolean'
    || typeof payload.deliverableValidation === 'string';
  const canonicalEntryMatches =
    typeof payload.deliverableEntryFile === 'string'
    && payload.deliverableEntryFile.length > 0
    && (!hasPreviewReference
      || payload.deliverableEntryFile === payload.entryFile);
  // Compatible daemons validate the canonical entry against the filesystem and
  // project kind. artifactCount alone only proves that this run touched
  // something; it cannot promote a stale metadata entry or an unrelated file
  // into a deliverable. The preview fallback is retained only for older,
  // non-plugin MCP clients that predate the authoritative fields.
  const hasValidatedArtifact = hasAuthoritativeValidation
    ? payload.deliverableValid === true
      && payload.deliverableValidation === 'valid'
      && canonicalEntryMatches
    : artifactCount === null
      ? hasPreviewReference
      : artifactCount > 0 && hasPreviewReference;
  const complete =
    status === 'succeeded'
    && hasValidatedArtifact
    && (hasPreviewReference || hasStudioReference);
  return {
    poll_state: 'terminal',
    delivery_kind: 'preview_studio_reference',
    delivery_result: complete ? 'complete' : 'failed',
    deliverable_validation: complete ? 'valid' : 'invalid',
    ...(pollAttemptCount ? { poll_attempt_count: pollAttemptCount } : {}),
    ...(!complete && status === 'succeeded'
      ? {
          error_code: 'DELIVERABLE_MISSING',
          failure_stage: 'artifact_validation',
          failure_source: 'artifact_store',
          failure_category: 'invalid_output',
          retryable: true,
          user_action: 'retry',
        }
      : {}),
  };
}

export async function runMcpStdio(options: RunMcpOptions): Promise<void> {
  const daemonTarget = createMcpDaemonTarget(options);
  const briefStore = createLocalMcpBriefStore();
  let observabilityPromise: Promise<McpObservabilitySession> | null = null;
  let closeTransportForIdle: (() => void) | null = null;
  const idleExit = _createMcpIdleExitController({
    idleMs: MCP_STDIO_IDLE_EXIT_MS,
    onIdle: () => closeTransportForIdle?.(),
  });
  const withMcpActivity =
    <Args extends unknown[], Result>(handler: (...args: Args) => Result | Promise<Result>) =>
      (...args: Args) =>
        idleExit.trackRequest(() => handler(...args));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: [
        MCP_SERVER_INSTRUCTIONS,
        '',
        'Open Design (OD) is a local-first design workspace. The user typically',
        'has OD running on their machine; each project contains a rendered',
        'artifact (HTML/JSX/CSS) plus its source files.',
        '',
        'Active context: get_artifact, get_project, get_file, search_files,',
        'and list_files all accept project as OPTIONAL. When omitted, they',
        'default to the project the user has open in OD right now; get_file',
        'and get_artifact additionally default to the active file. So when',
        'the user says "this file" / "the design I have open" / "find X",',
        'just call the tool without project - no need to ask first. The',
        'response carries usedActiveContext so you can confirm which',
        'project/file you hit. Pass project explicitly to override.',
        '',
        'Pulling design context:',
        ' - get_artifact() - entry file PLUS every referenced sibling',
        '    (tokens CSS, JSX modules, imported assets) in one call.',
        '    PREFER THIS over multiple get_file calls when the user',
        '    wants to understand or extend a design.',
        ' - get_file(path) for a single known file. Returns up to 2000',
        '    lines starting at offset (default 0) and stamps a',
        '    [od:file-window ...] marker when the file is longer; page',
        '    by re-calling with the next offset.',
        ' - search_files(query) to find a class/component/copy string',
        '    without fetching every file.',
        ' - list_files for metadata only.',
        ' - create_artifact(name, content) to create one normal artifact',
        '    entry file in the active or specified project. It rejects',
        '    existing targets and can accept an artifactManifest sidecar.',
        ' - write_file(path, content) to overwrite or freshly create any',
        '    project file when an ArtifactManifest is not required.',
        '    Use this to iterate on a file create_artifact already wrote.',
        ' - delete_file(path) to remove one project file (nested paths ok).',
        ' - delete_project(project, confirm:true) for irreversible project',
        '    removal — requires explicit project + confirm:true.',
        ' - list_projects to discover what is available on this daemon.',
        ' - get_active_context() if you want the active project/file',
        '    explicitly without making any other tool call.',
        '',
        'To make Open Design GENERATE or refine a design (rather than just',
        'read/edit files), commission a run - you do not run skills yourself:',
        ' - collect_brief first for a new artifact unless the user explicitly',
        '    asks to skip questions. Let the user complete the rendered card;',
        '    confirm_brief returns the readable brief to reuse with Open Design',
        '    Cloud or Local Codex. Never print or ask the user to copy',
        '    briefDraftId, nonce, or any other internal correlation value.',
        ' - list_skills / list_plugins to see what you can ask OD to make.',
        ' - for Open Design Cloud, call the Cloud login-status tool first.',
        '    If signed out, call the Cloud sign-in tool once, show its activation',
        '    URL/code when present, and poll login status until loggedIn:true.',
        '    The tool and runtime ids are internal protocol; never show them.',
        ' - list_agents when you need to pass start_run.agent — do not',
        '    guess "claude" / "codex" / "opencode"; only agents in the',
        '    returned list will actually spawn on this machine.',
        ' - create_project(name) first if you need a fresh project to',
        '    generate into; start_run requires an existing project.',
        ' - start_run(prompt, requestId, [skill], [plugin], [inputs]) kicks off',
        '    generation in the active or named project and returns a runId.',
        '    Generate a canonical UUID or ULID requestId once per confirmed',
        '    user action and reuse the exact same value after a timeout/lost',
        '    response. Do not call',
        '    start_run again while get_run reports the original run in flight.',
        '    If get_run returns failureAction:"recharge", show rechargeUrl;',
        '    after the user confirms top-up, call the exact original start_run',
        '    once with the same requestId and resume:true.',
        '    Open Design spawns its own agent to do the work.',
        ' - get_run(runId) polls until status is succeeded/failed/canceled;',
        '    on success it returns a previewUrl you can open in a browser',
        '    and a hint to pull the files with get_artifact.',
        ' - cancel_run(runId) aborts an in-flight run.',
        '',
        'Generation patience: Open Design runs typically take 5–30',
        'minutes. Polls returning status:running with unchanged file',
        'mtimes is the inner agent thinking, not a hang. Do NOT cancel',
        'and substitute write_file as a "faster" workaround — that',
        'throws away the pipeline\'s design quality and is exactly the',
        'failure mode this surface is meant to avoid. Poll every 30–60',
        'seconds, tell the user "still working" between polls, and let',
        'the run finish. Only call cancel_run if the user explicitly',
        'asks you to abort.',
        '',
        'Ambiguous-format requests: words like "PPT" / "deck" / "slides" /',
        '"presentation" / "document" / "PDF" / "doc" map to two different',
        'deliverables — Open Design natively produces browser-viewable',
        'HTML/SVG (including HTML-rendered decks), but the user may want a',
        'real binary file (.pptx / .docx / .pdf) which Open Design does NOT',
        'produce and which you would have to export yourself from OD\'s',
        'output. When the user\'s request is ambiguous, ASK them which one',
        'they want before kicking off work; do not silently pick one and do',
        'not run both paths in parallel.',
        '',
        'Project arguments accept either a UUID or a name substring',
        '(e.g. "recaptr"); the server resolves the latter. When a project',
        'is matched by slug or substring the response carries',
        'resolvedProject:{id,name} so you can confirm which project was',
        'resolved. Verify with the user if the match was unexpected.',
        '',
        'Reference material is exposed as MCP resources, not tools - read',
        'od://design-systems/<id>/DESIGN.md when you need the brand spec',
        'for a design (palette, typography, voice). Skills are similarly',
        'available at od://skills/<id>/SKILL.md but are mostly relevant',
        'when the user asks about how a particular artifact was generated.',
        '',
        'When extending an Open Design design in another codebase, pull',
        'the full bundle once with get_artifact and work from those files',
        'locally - do not fetch files one-by-one if you can avoid it.',
      ].join('\n'),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, withMcpActivity(async () => ({
    tools: TOOL_DEFS,
  })));

  server.setRequestHandler(ListResourcesRequestSchema, withMcpActivity(async () => {
    const catalog = await daemonTarget.call(
      'list_resources',
      {},
      async (baseUrl) => {
        const [skillsData, dsData] = await Promise.all([
          getJson<SkillsPayload>(`${baseUrl}/api/skills`).catch((): SkillsPayload => ({ skills: [] })),
          getJson<DesignSystemsPayload>(`${baseUrl}/api/design-systems`).catch((): DesignSystemsPayload => ({ designSystems: [] })),
        ]);
        return ok({ skillsData, dsData });
      },
    );
    const catalogPayload = parseMcpResult(catalog);
    const skillsData = (catalogPayload?.skillsData ?? {}) as SkillsPayload;
    const dsData = (catalogPayload?.dsData ?? {}) as DesignSystemsPayload;
    const resources = [
      ...localMcpResourceDefinitions(),
      {
        uri: 'od://focus/active',
        name: 'Active Open Design context',
        description: 'The project/file the user has open in Open Design right now.',
        mimeType: 'application/json',
      },
    ];
    for (const s of skillsData?.skills || []) {
      resources.push({
        uri: `od://skills/${encodeURIComponent(s.id)}/SKILL.md`,
        name: `Skill: ${s.name || s.id}`,
        description: oneLine(s.description) ?? '',
        mimeType: 'text/markdown',
      });
    }
    for (const d of dsData?.designSystems || []) {
      resources.push({
        uri: `od://design-systems/${encodeURIComponent(d.id)}/DESIGN.md`,
        name: `Design system: ${d.title || d.name || d.id}`,
        description: oneLine(d.summary) ?? '',
        mimeType: 'text/markdown',
      });
    }
    return { resources };
  }));

  server.setRequestHandler(ReadResourceRequestSchema, withMcpActivity(async (req) => {
    const uri = req.params?.uri;
    if (uri === OPEN_DESIGN_BRIEF_APP_RESOURCE) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: OPEN_DESIGN_BRIEF_APP_HTML,
            _meta: {
              version: OPEN_DESIGN_BRIEF_APP_VERSION,
            },
          },
        ],
      };
    }
    if (uri === 'od://focus/active') {
      const result = await daemonTarget.call('read_resource', {}, async (baseUrl) =>
        ok(await getJson<ActiveContext>(`${baseUrl}/api/active`)),
      );
      if (result.isError === true) throw new Error(result.content[0]?.text);
      const data = parseMcpResult(result);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
    const m = String(uri || '').match(/^od:\/\/(skills|design-systems)\/([^/]+)\/(.+)$/);
    if (!m) {
      throw new Error(`unsupported resource URI: ${uri}`);
    }
    const [, kind, id] = m as [string, 'skills' | 'design-systems', string, string];
    const route = kind === 'skills' ? 'skills' : 'design-systems';
    const result = await daemonTarget.call('read_resource', {}, async (baseUrl) =>
      ok(await getJson<ResourcePayload>(
        `${baseUrl}/api/${route}/${encodeURIComponent(decodeURIComponent(id))}`,
      )),
    );
    if (result.isError === true) throw new Error(result.content[0]?.text);
    const data = parseMcpResult(result) as ResourcePayload | null;
    const text =
      data?.skill?.body ??
      data?.skill?.content ??
      data?.designSystem?.body ??
      data?.designSystem?.content ??
      data?.body ??
      data?.content ??
      '';
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text,
        },
      ],
    };
  }));

  server.setRequestHandler(CallToolRequestSchema, withMcpActivity(async (req) => {
    const name = req.params?.name;
    const args: McpArgs = {
      ...((req.params?.arguments ?? {}) as McpArgs),
    };
    if (name === 'collect_brief' && args.locale === undefined) {
      const locale = _localeFromMcpToolMetadata(
        (req.params as { _meta?: unknown } | undefined)?._meta,
      );
      if (locale) args.locale = locale;
    }
    const baseUrl = await daemonTarget.refresh();
    observabilityPromise ??= McpObservabilitySession.create(
      baseUrl,
      server.getClientVersion(),
    );
    const observability = await observabilityPromise;
    observability.updateBaseUrl(baseUrl);
    return observeMcpToolCall(
      observability,
      briefStore,
      daemonTarget,
      name,
      args,
    );
  }));

  const transport = new StdioServerTransport();
  try {
    closeTransportForIdle = () => {
      void transport.close().catch(() => {});
    };
    await server.connect(transport);

    const sdkOnMessage = transport.onmessage;
    transport.onmessage = (...args) => {
      idleExit.noteActivity();
      sdkOnMessage?.(...args);
    };

    // server.connect() only *starts* the transport; it resolves once the
    // stdio reader is wired up, not when the stream closes. Hold the
    // process open until the client disconnects (stdin EOF) so the cli.ts
    // top-level `process.exit(0)` doesn't kill us mid-handshake.
    await new Promise<void>((resolve) => {
      const sdkOnClose = transport.onclose;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        idleExit.dispose();
        resolve();
      };
      transport.onclose = () => {
        sdkOnClose?.();
        done();
      };
      const closeTransportForStdin = () => {
        void transport.close().catch(() => done());
      };
      process.stdin.once('end', closeTransportForStdin);
      process.stdin.once('close', closeTransportForStdin);
    });
  } finally {
    idleExit.dispose();
    closeTransportForIdle = null;
  }
}

function ok(payload: unknown): McpToolCallResult {
  const text =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): McpToolCallResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function requireString(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${name} is required (string).`);
  }
}

const MCP_CREDENTIAL_FIELD_PATTERN =
  /^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password)$/iu;

function containsMcpCredentialField(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsMcpCredentialField(entry, depth + 1));
  }
  return Object.entries(value as JsonObject).some(([key, entry]) =>
    MCP_CREDENTIAL_FIELD_PATTERN.test(key)
    || containsMcpCredentialField(entry, depth + 1),
  );
}

function publicVelaLoginStatus(status: unknown): unknown {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return status;
  const { configPath: _configPath, ...publicStatus } = status as JsonObject;
  return publicStatus;
}

async function handleMcpToolCall(
  baseUrl: string,
  name: unknown,
  args: McpArgs,
  options: HandleMcpToolCallOptions = {},
): Promise<McpToolCallResult> {
  try {
    switch (name) {
      case 'collect_brief': {
        const collected = (options.briefStore ?? createLocalMcpBriefStore())
          .collect(args);
        const copy = localMcpBriefResponseCopy(collected.locale);
        return {
          content: [
            {
              type: 'text' as const,
              text: copy.completeCard,
            },
          ],
          structuredContent: collected as unknown as JsonObject,
        };
      }
      case 'confirm_brief': {
        if (!options.briefStore) {
          throw new Error(
            'confirm_brief requires the same local MCP session that created the draft',
          );
        }
        const confirmed = options.briefStore.confirm(args);
        const copy = localMcpBriefResponseCopy(confirmed.locale);
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                copy.confirmed,
                '',
                confirmed.summary,
                '',
                copy.continueWithBrief,
              ].join('\n'),
            },
          ],
          structuredContent: confirmed as unknown as JsonObject,
        };
      }
      case 'list_projects':
        return ok(await getJson<ProjectsPayload>(`${baseUrl}/api/projects`));
      case 'get_active_context': {
        const data = await getJson<ActiveContext>(`${baseUrl}/api/active`);
        if (!data || data.active === false) {
          return ok({
            active: false,
            hint: 'Open Design has no active project right now. The active context expires about 5 minutes after the last user interaction with Open Design, so the user may need to click into a project (or switch tabs inside one) to wake it up. Alternatively, pass project="<id-or-name>" to other tools to bypass active context entirely.',
          });
        }
        return ok(data);
      }
      case 'get_project': {
        const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
        const data = await getJson<ProjectPayload>(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
        const project = data?.project ?? data;
        const resolvedDir = typeof data?.resolvedDir === 'string' ? data.resolvedDir : null;
        const declaredEntry = project?.metadata?.entryFile ?? null;
        const entryFile = await resolveProjectEntry(baseUrl, id, declaredEntry);
        const previewUrl = rawPreviewUrl(baseUrl, id, entryFile);
        // Build the studio deep link too — needs the project's
        // default conversation, which we look up once. Cheap to skip
        // when the daemon has no webBaseUrl configured.
        const webBase = await getWebBaseUrl(baseUrl);
        const conversationId = webBase ? await getDefaultConversationId(baseUrl, id) : null;
        const studioUrl = buildStudioUrl(webBase, id, conversationId, entryFile);
        return ok(
          withActiveEcho(
            {
              ...project,
              entryFile,
              kind: project?.metadata?.kind ?? null,
              resolvedDir,
              // previewUrl: open in a browser to view the rendered
              // design directly (HTML entries render; see
              // rawPreviewUrl). studioUrl: open the OD studio page
              // that shows the rendered file alongside the chat
              // history for the project. Both omitted when their
              // prerequisites aren't met.
              ...(previewUrl ? { previewUrl } : {}),
              ...(previewUrl
                ? {
                    artifactRef: { projectId: id, entryFile },
                    previewUrlLifetime: 'current_daemon_session',
                  }
                : {}),
              ...(studioUrl
                ? {
                    studioUrl,
                    studioUrlLifetime: 'current_daemon_session',
                  }
                : {}),
            },
            active,
            resolved,
          ),
        );
      }
      case 'list_files': {
        const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
        const params = new URLSearchParams();
        if (typeof args.since === 'number' && Number.isFinite(args.since)) params.set('since', String(args.since));
        const qs = params.toString();
        const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}/files${qs ? `?${qs}` : ''}`;
        return ok(withActiveEcho(await getJson(url), active, resolved));
      }
      case 'get_file': {
        const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
        let path = typeof args.path === 'string' ? args.path : '';
        if (!path && active && active.fileName) {
          path = active.fileName;
        }
        requireString(path, 'path');
        const offset = typeof args.offset === 'number' && Number.isFinite(args.offset) ? Math.max(0, Math.floor(args.offset)) : 0;
        const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.floor(args.limit)) : 2000;
        return await getFile(baseUrl, id, path, active, resolved, offset, limit);
      }
      case 'get_artifact':
        return await getArtifact(
          baseUrl,
          args.project,
          args.entry,
          args.include,
          args.maxBytes,
        );
      case 'search_files': {
        const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
        requireString(args.query, 'query');
        const params = new URLSearchParams({ q: String(args.query) });
        if (args.pattern) params.set('pattern', String(args.pattern));
        if (args.max) params.set('max', String(args.max));
        return ok(
          withActiveEcho(
            await getJson(
              `${baseUrl}/api/projects/${encodeURIComponent(id)}/search?${params.toString()}`,
            ),
            active,
            resolved,
          ),
        );
      }
      case 'create_artifact':
        return await createArtifact(baseUrl, args);
      case 'write_file':
        return await writeFile(baseUrl, args);
      case 'delete_file':
        return await deleteFile(baseUrl, args);
      case 'delete_project':
        return await deleteProject(baseUrl, args);
      case 'create_project':
        return await createProject(baseUrl, args);
      case 'list_skills':
        return ok(await getJson<SkillsPayload>(`${baseUrl}/api/skills`));
      case 'list_plugins':
        return ok(await listPlugins(baseUrl));
      case 'list_agents':
        return ok(await listAgents(baseUrl, args.includeUnavailable === true));
      case 'start_vela_login': {
        const started = await postJson<JsonObject>(
          `${baseUrl}/api/integrations/vela/login`,
          options.pluginAttribution
            ? { pluginWorkflowId: options.pluginAttribution.pluginWorkflowId }
            : {},
          options.analyticsHeaders,
        );
        const status = publicVelaLoginStatus(
          await getJson<JsonObject>(`${baseUrl}/api/integrations/vela/status`),
        );
        return ok({ started, status });
      }
      case 'get_vela_login_status':
        return ok(
          publicVelaLoginStatus(
            await getJson<JsonObject>(`${baseUrl}/api/integrations/vela/status`),
          ),
        );
      case 'start_run':
        return await startRun(baseUrl, args, options);
      case 'get_run':
        return await getRun(baseUrl, args);
      case 'cancel_run': {
        requireString(args.runId, 'runId');
        return ok(
          await postJson<JsonObject>(
            `${baseUrl}/api/runs/${encodeURIComponent(args.runId)}/cancel`,
            {},
          ),
        );
      }
      default:
        return errorResult(`unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResult(formatError(err, baseUrl));
  }
}

async function writeFile(baseUrl: string, args: McpArgs) {
  const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
  // The daemon route requires its argv field to be called `name`; the
  // MCP-facing surface uses `path` to match the rest of the file tools.
  requireString(args.path, 'path');
  requireString(args.content, 'content');
  const encoding = args.encoding === 'base64' ? 'base64' : 'utf8';
  // No `artifact: true` and no `overwrite: false`: the route then takes
  // the default writeProjectFile path, which overwrites the target. This
  // is the exact shape `od files write` uses (see apps/daemon/src/cli.ts).
  const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}/files`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: args.path, content: args.content, encoding }),
  });
  if (!resp.ok) {
    return errorResult(await formatDaemonError(resp, url));
  }
  const json = (await resp.json()) as JsonObject;
  return ok(withActiveEcho(json, active, resolved));
}

async function deleteFile(baseUrl: string, args: McpArgs) {
  const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
  requireString(args.path, 'path');
  // /api/projects/:id/raw/* accepts nested paths; /api/projects/:id/files/:name
  // does not. Mirror the create_artifact surface, which already lets agents
  // address files like "codex-product/index.html".
  const segments = args.path
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeURIComponent);
  const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}/raw/${segments.join('/')}`;
  const resp = await fetch(url, { method: 'DELETE' });
  if (!resp.ok) {
    return errorResult(await formatDaemonError(resp, url));
  }
  const json = (await resp.json()) as JsonObject;
  return ok(withActiveEcho(json, active, resolved));
}

async function deleteProject(baseUrl: string, args: McpArgs) {
  // Active-context fallback is intentionally disabled: the daemon's
  // DELETE /api/projects/:id is irreversible (purges the row and the
  // on-disk project directory), so we never want it to fire against the
  // wrong project just because the user happened to have one open. The
  // confirm flag is a second belt for agents that auto-clean.
  if (typeof args.project !== 'string' || args.project.length === 0) {
    return errorResult('project is required (no active-context fallback for delete_project).');
  }
  if (args.confirm !== true) {
    return errorResult('confirm:true is required to delete a project (this cannot be undone).');
  }
  const { id, resolved } = await resolveProjectArg(baseUrl, args.project);
  const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}`;
  const resp = await fetch(url, { method: 'DELETE' });
  if (!resp.ok) {
    return errorResult(await formatDaemonError(resp, url));
  }
  const json = (await resp.json()) as JsonObject;
  // The tool accepts a name substring (see resolveProjectId), so the
  // caller needs the resolvedProject echo to confirm which project was
  // actually destroyed — same contract write_file/delete_file follow
  // via withActiveEcho. active is always null here because the
  // active-context fallback is intentionally disabled above.
  return ok(withActiveEcho(json, null, resolved));
}

async function formatDaemonError(resp: Response, url: string): Promise<string> {
  const body = await safeText(resp);
  let detail = body || resp.statusText;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
    if (parsed?.error?.message) {
      detail = `${parsed.error.code ?? 'error'}: ${parsed.error.message}`;
    }
  } catch {
    // body wasn't JSON; fall through with the raw text.
  }
  return `daemon ${resp.status} on ${url}: ${detail}`;
}

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  if (!resp.ok) {
    throw new Error(await formatDaemonError(resp, url));
  }
  return (await resp.json()) as T;
}

// Create an empty project to generate into. start_run needs an existing
// project; without this an external agent could only work on projects
// the user had already created in Open Design.
//
// skipDiscoveryBrief defaults to true: the outer agent (Codex, Cursor,
// …) IS the user-facing surface, so OD's own interactive discovery
// stage would create a confusing nested-clarification loop where OD's
// <question-form> output ends up dropped from the MCP response because
// no project file is produced. Better to let the outer agent gather
// requirements directly and pass a precise prompt to start_run.
async function createProject(baseUrl: string, args: McpArgs) {
  requireString(args.name, 'name');
  const id =
    typeof args.id === 'string' && args.id.length > 0
      ? args.id
      : slugifyProjectId(args.name);
  const body: JsonObject = { id, name: args.name, skipDiscoveryBrief: true };
  if (typeof args.designSystem === 'string' && args.designSystem.length > 0) {
    body.designSystemId = args.designSystem;
  }
  if (typeof args.skill === 'string' && args.skill.length > 0) {
    body.skillId = args.skill;
  }
  return ok(await postJson<JsonObject>(`${baseUrl}/api/projects`, body));
}

// Flatten daemon's plugin record into the few fields an external agent
// needs to pick a plugin: id, title, description, kind, tags. The raw
// record carries 16+ fields (fsPath, sourceMarketplaceId, installedAt,
// resolvedSource, …) that an agent never reasons about, and the
// human-readable description / kind live one level deeper in
// `manifest.description` / `manifest.od.kind`.
async function listPlugins(baseUrl: string): Promise<JsonObject> {
  const raw = await getJson<{ plugins?: JsonObject[] }>(`${baseUrl}/api/plugins`);
  const plugins = (raw?.plugins ?? []).map((p) => {
    const manifest = (p?.manifest as JsonObject | undefined) ?? {};
    const od = (manifest.od as JsonObject | undefined) ?? {};
    const result: JsonObject = {
      id: p?.id,
      title: manifest.title ?? p?.title ?? p?.id,
    };
    if (typeof manifest.description === 'string') result.description = manifest.description;
    const kind = od.taskKind ?? od.kind;
    if (typeof kind === 'string') result.kind = kind;
    if (Array.isArray(manifest.tags)) result.tags = manifest.tags;
    return result;
  });
  return { plugins };
}

// Flatten daemon's agent definition into the few fields an external
// agent needs to pick a value for start_run.agent. Default filters to
// `available: true` (only installed CLIs) so the outer agent doesn't
// pick an agent it can't actually run — the failure mode that left us
// with zombie "running" runs whose inner Claude binary never spawned.
// Models are truncated to 10 with `modelsCount` carrying the full
// total; that keeps the response token-economical even for agents
// (e.g. opencode) that expose 100+ models.
async function listAgents(baseUrl: string, includeUnavailable: boolean): Promise<JsonObject> {
  const raw = await getJson<{ agents?: JsonObject[] }>(`${baseUrl}/api/agents`);
  const all = raw?.agents ?? [];
  const filtered = includeUnavailable
    ? all
    : all.filter((a) => a?.available === true);
  const MAX_MODELS = 10;
  const agents = filtered.map((a) => {
    const models = Array.isArray(a?.models) ? (a.models as unknown[]) : [];
    const out: JsonObject = {
      id: a?.id,
      name: a?.name,
      models: models.slice(0, MAX_MODELS),
      modelsCount: models.length,
    };
    if (typeof a?.version === 'string' && a.version.length > 0) out.version = a.version;
    if (includeUnavailable) {
      out.available = Boolean(a?.available);
      if (typeof a?.installUrl === 'string') out.installUrl = a.installUrl;
    }
    return out;
  });
  return { agents };
}

// Derive a valid project id ([A-Za-z0-9._-], <=128) from a display name,
// with a short random suffix so repeated creates with the same name
// don't collide on the daemon's primary key.
function slugifyProjectId(name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) ||
    'project';
  return `${base}-${randomUUID().replace(/-/g, '').slice(0, 4)}`;
}

// Commission a generation run. The caller never runs the skill/plugin
// itself; we POST to /api/runs and the daemon spawns its own agent.
// Returns the runId immediately so the caller can poll get_run —
// start+poll because MCP is request/response and generation is
// minutes-long.
async function startRun(
  baseUrl: string,
  args: McpArgs,
  options: HandleMcpToolCallOptions = {},
) {
  if (
    Object.prototype.hasOwnProperty.call(args, 'apiKey')
    || Object.prototype.hasOwnProperty.call(args, 'byokProvider')
    || containsMcpCredentialField(args.inputs)
  ) {
    throw new Error(
      'raw API keys are not accepted by Open Design MCP. Configure Local BYOK in the Open Design UI and start that run from the local product instead.',
    );
  }
  const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
  if (args.requestId !== undefined) requireString(args.requestId, 'requestId');
  if (
    options.pluginAttribution
    && (typeof args.requestId !== 'string' || args.requestId.length === 0)
  ) {
    throw pluginContractError(
      'requestId is required for attributed start_run calls so a lost response can be retried without starting a second logical run',
    );
  }
  const requestId =
    typeof args.requestId === 'string' && args.requestId.length > 0
      ? args.requestId
      : randomUUID();
  const body: JsonObject = { projectId: id, clientRequestId: requestId };
  if (options.pluginAttribution) {
    validatePluginRequestId(requestId);
    const logical = logicalPluginRequestDigest(requestId);
    body.analyticsHints = {
      entrySurface: 'external_mcp',
      hostProduct:
        options.analyticsHeaders?.[ANALYTICS_HEADER_HOST_PRODUCT] ?? 'unknown',
      externalPluginId: options.pluginAttribution.context.id,
      externalPluginVersion:
        options.pluginAttribution.context.version,
      distributionMechanism:
        options.pluginAttribution.context.distributionMechanism,
      publisherClass: options.pluginAttribution.context.publisherClass,
      // This payload is client-supplied. The daemon validates it against the
      // request identity/digest and upgrades to session_correlated only after
      // the Run/workflow binding is accepted.
      attributionQuality: 'self_reported',
      pluginWorkflowId: options.pluginAttribution.pluginWorkflowId,
      logicalRequestDigest: logical.digest,
      logicalRequestDigestVersion: logical.version,
      briefState: options.briefState ?? 'not_applicable',
    };
  }
  if (args.resume !== undefined) {
    if (typeof args.resume !== 'boolean') throw new Error('resume must be a boolean');
    body.resume = args.resume;
  }
  if (typeof args.prompt === 'string' && args.prompt.length > 0) {
    body.message = args.prompt;
    body.currentPrompt = args.prompt;
  }
  if (typeof args.skill === 'string' && args.skill.length > 0) body.skillId = args.skill;
  if (typeof args.plugin === 'string' && args.plugin.length > 0) body.pluginId = args.plugin;
  if (typeof args.agent === 'string' && args.agent.length > 0) body.agentId = args.agent;
  if (typeof args.model === 'string' && args.model.length > 0) body.model = args.model;
  if (typeof args.serviceTier === 'string' && args.serviceTier.length > 0) {
    body.serviceTier = args.serviceTier;
  }
  if (args.inputs !== undefined) {
    if (args.inputs === null || typeof args.inputs !== 'object' || Array.isArray(args.inputs)) {
      throw new Error('inputs must be an object');
    }
    body.pluginInputs = args.inputs;
  }
  const created = await postJson<JsonObject>(
    `${baseUrl}/api/runs`,
    body,
    options.analyticsHeaders,
  );
  // Build studioUrl (conversation-level — no entry file yet) so the
  // outer agent has a URL to give the user right away. The daemon
  // returns conversationId in the response now that POST /api/runs
  // falls back to the project's default conversation for MCP callers.
  const webBase = await getWebBaseUrl(baseUrl);
  const studioUrl = buildStudioUrl(webBase, id, created?.conversationId, null);
  return ok(
    withActiveEcho(
      {
        ...created,
        projectId: id,
        requestId,
        ...(options.pluginAttribution
          ? {
              pluginWorkflowId:
                options.pluginAttribution.pluginWorkflowId,
            }
          : {}),
        ...(studioUrl
          ? {
              studioUrl,
              studioUrlLifetime: 'current_daemon_session',
            }
          : {}),
        hint: 'Run started. Open Design generation normally takes 5–30 minutes. Polls showing status:running with no new files / unchanged file mtimes is the inner agent thinking, NOT a hang — DO NOT cancel_run out of impatience and DO NOT substitute write_file to produce the design yourself; OD\'s pipeline is what gives the result its design quality. Poll get_run(runId) every 30–60 seconds; report "still working" to the user between polls and keep waiting. On terminal status, artifactRef is the durable identity; previewUrl and studioUrl are browser links for the current Open Design runtime and must be refreshed with get_run after Open Design restarts.',
      },
      active,
      resolved,
    ),
  );
}

// Poll a run. On terminal status we enrich the daemon's status body
// with three things the outer agent needs to actually close the loop:
// (1) previewUrl when there's an entry file — open this in a browser,
// (2) agentMessage = the inner agent's textual output reassembled from
//     the SSE event stream, so when the inner agent asked a discovery
//     question back instead of producing files, the outer agent can
//     relay it to the user (without this, the run looks like a
//     "succeeded with empty output" mystery), and
// (3) a hint that tells the outer agent how to surface both.
async function getRun(baseUrl: string, args: McpArgs) {
  requireString(args.runId, 'runId');
  const status = await getJson<JsonObject>(
    `${baseUrl}/api/runs/${encodeURIComponent(args.runId)}`,
  );
  if (status.status !== 'succeeded' || typeof status.projectId !== 'string' || !status.projectId) {
    // Non-terminal (or terminal-but-failed) status. Surface
    // eventsLogPath with a tail hint so the outer agent can watch live
    // progress in its own shell instead of cancelling because polling
    // shows nothing changing.
    const webBase = await getWebBaseUrl(baseUrl);
    const studioUrl = buildStudioUrl(webBase, status.projectId, status.conversationId, null);
    const enriched: JsonObject = { ...status };
    if (studioUrl) enriched.studioUrl = studioUrl;
    if (status.failureAction === 'recharge') {
      enriched.rechargeUrl = DEFAULT_AMR_RECHARGE_URL;
      enriched.hint =
        'Open Design Cloud paused this logical run because the account balance is insufficient. Preserve the brief and project, show rechargeUrl to the user, and do not switch modes. After the user confirms the top-up, call start_run once with the exact original payload, the same requestId, and resume:true; Open Design Cloud will resume the existing run and billing operation. Do not expose internal runtime or tool identifiers.';
    }
    if (typeof status.eventsLogPath === 'string' && status.eventsLogPath.length > 0) {
      if (status.failureAction !== 'recharge') {
        enriched.hint = 'Run still in flight. Tail eventsLogPath in your own shell (e.g. `tail -n 50 -f "' + status.eventsLogPath + '"`) to see live text_delta / tool_use events from the inner agent — that is your in-flight progress signal. Keep polling get_run every 30–60s; do not cancel because file mtimes look static, that is the agent thinking between writes.';
      }
      if (studioUrl) {
        enriched.hint += ` While the run is in flight, studioUrl can be used as an optional workspace progress link — render it as \`[Watch progress in Open Design studio](${studioUrl})\` if you choose to show it. This URL is valid for the current Open Design runtime; call get_run again after Open Design restarts.`;
      }
    }
    return ok(enriched);
  }
  const hasAuthoritativeDeliverable =
    typeof status.deliverableValid === 'boolean'
    || typeof status.deliverableValidation === 'string';
  let entryFile =
    status.deliverableValid === true
    && status.deliverableValidation === 'valid'
    && typeof status.deliverableEntryFile === 'string'
      ? status.deliverableEntryFile
      : null;
  // Older daemons do not expose the authoritative deliverable fields. Keep
  // their established preview behavior for ordinary MCP compatibility, while
  // never overriding an explicit invalid verdict from a compatible daemon.
  if (!hasAuthoritativeDeliverable) {
    entryFile = await resolveLegacyRunEntry(
      baseUrl,
      status.projectId,
    );
  }
  const [agentMessage, webBase] = await Promise.all([
    fetchRunAgentMessage(baseUrl, String(status.id ?? args.runId)),
    getWebBaseUrl(baseUrl),
  ]);
  const previewUrl = entryFile
    ? rawPreviewUrl(baseUrl, status.projectId, entryFile)
    : null;
  const studioUrl = buildStudioUrl(webBase, status.projectId, status.conversationId, entryFile);
  const enriched: JsonObject = { ...status };
  if (previewUrl) enriched.previewUrl = previewUrl;
  if (entryFile) enriched.entryFile = entryFile;
  if (previewUrl && entryFile) {
    enriched.artifactRef = { projectId: status.projectId, entryFile };
    enriched.previewUrlLifetime = 'current_daemon_session';
  }
  if (agentMessage) enriched.agentMessage = agentMessage;
  if (studioUrl) {
    enriched.studioUrl = studioUrl;
    enriched.studioUrlLifetime = 'current_daemon_session';
  }
  enriched.hint = previewUrl
    ? `Run finished. artifactRef is the durable project/file identity. previewUrl and studioUrl are browser links for the current Open Design runtime only; if either stops working after Open Design restarts, call get_run again with this runId to obtain current links. Render previewUrl as a clickable link now. agentMessage carries the inner agent's explanation; show it alongside the link. Call get_artifact({ project: "${status.projectId}" }) when you need the source files — always pass project explicitly; omitting it falls back to the active project, which may differ. eventsLogPath, when present, holds the full inner-agent event log for forensics.`
    : 'Run finished but produced no files. The inner agent\'s output is in agentMessage — relay it to the user verbatim. Most often this is a clarifying question (e.g. a <question-form>) you should answer by calling start_run again with a more specific prompt or a chosen plugin. When studioUrl is present, show it as a clickable markdown link (`[Open Open Design studio](STUDIO_URL)`) so the user can navigate to the OD page that shows the chat history — never render it as inline code. eventsLogPath, when present, holds the full event log if you need to inspect what happened.';
  return ok(enriched);
}

// Reassemble the inner agent's textual output from the SSE event log.
// We pull the events one-shot (the endpoint returns the full history
// for terminal runs and closes), parse out text_delta deltas, and
// concatenate. Best-effort: any HTTP / parse error returns null so the
// caller just omits the field.
async function fetchRunAgentMessage(baseUrl: string, runId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runId)}/events`);
    if (!resp.ok) return null;
    const body = await resp.text();
    const parts: string[] = [];
    for (const block of body.split(/\n\n/)) {
      if (!block.trim()) continue;
      let eventName = '';
      let dataLine = '';
      for (const rawLine of block.split('\n')) {
        if (rawLine.startsWith('event:')) eventName = rawLine.slice(6).trim();
        else if (rawLine.startsWith('data:')) dataLine = rawLine.slice(5).trim();
      }
      if (eventName !== 'agent' || !dataLine) continue;
      try {
        const data = JSON.parse(dataLine) as { type?: string; delta?: unknown };
        if (data?.type === 'text_delta' && typeof data.delta === 'string') {
          parts.push(data.delta);
        }
      } catch {
        // Non-JSON data lines (rare) are skipped silently.
      }
    }
    const message = parts.join('');
    return message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

// Studio deep links (browser-facing OD page that shows the file
// preview alongside the conversation history for a run). Built from
// the daemon's advertised webBaseUrl + project + conversation + entry
// file. The webBaseUrl is exposed by /api/mcp/install-info. Read it for
// every delivery lookup: the endpoint already has a small cache keyed by
// the live packaged web port, while an additional MCP-process cache could
// return a stale localhost URL immediately after the runtime rebinds.
// Returns null when any required piece is missing — callers omit the field
// rather than emit a half-built URL.

async function getWebBaseUrl(daemonBaseUrl: string): Promise<string | null> {
  try {
    const data = await getJson<{ webBaseUrl?: string | null }>(
      `${daemonBaseUrl}/api/mcp/install-info`,
    );
    const url =
      typeof data?.webBaseUrl === 'string' && data.webBaseUrl.length > 0
        ? data.webBaseUrl
        : null;
    return url;
  } catch {
    return null;
  }
}

function buildStudioUrl(
  webBaseUrl: string | null,
  projectId: unknown,
  conversationId: unknown,
  entryFile: unknown,
): string | null {
  if (!webBaseUrl) return null;
  if (typeof projectId !== 'string' || !projectId) return null;
  if (typeof conversationId !== 'string' || !conversationId) return null;
  const base = `${webBaseUrl}/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`;
  if (typeof entryFile === 'string' && entryFile.length > 0) {
    const segments = entryFile
      .split('/')
      .filter((s) => s.length > 0)
      .map(encodeURIComponent)
      .join('/');
    return `${base}/files/${segments}`;
  }
  return base;
}

// For get_project / start_run: pick the project's first / default
// conversation so the studio link lands the user on a coherent page.
// create_project seeds a default conversation per project; this just
// reads the same one back. Returns null on any lookup failure — caller
// omits studioUrl.
async function getDefaultConversationId(baseUrl: string, projectId: string): Promise<string | null> {
  try {
    const data = await getJson<{ conversations?: Array<{ id?: string }> }>(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/conversations`,
    );
    const first = Array.isArray(data?.conversations) ? data.conversations[0] : null;
    return typeof first?.id === 'string' && first.id.length > 0 ? first.id : null;
  } catch {
    return null;
  }
}

// Resolve a project's entry file, preferring metadata.entryFile when
// set and falling back to scanning the file list. This matters because
// real-world writes (write_file, half-finished inner-agent runs)
// leave metadata.entryFile null even when a perfectly viewable
// index.html exists at the project root — without the fallback,
// get_project/get_run would silently omit previewUrl and force the
// outer agent to guess a file:// path.
async function resolveProjectEntry(baseUrl: string, projectId: string, declared: unknown): Promise<string | null> {
  if (typeof declared === 'string' && declared.length > 0) return declared;
  try {
    const data = await getJson<{ files?: Array<{ path?: string; name?: string; kind?: string }> }>(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    const files = data?.files ?? [];
    // index.html wins at any level — the conventional entry signal.
    const indexHtml = files.find((f) => f?.path === 'index.html' || f?.name === 'index.html');
    if (indexHtml?.path) return indexHtml.path;
    // Otherwise: if exactly one .html sits at the project root, that
    // is unambiguous enough to pick. Don't guess past one match.
    const htmlAtRoot = files.filter(
      (f) => typeof f?.path === 'string' && !f.path.includes('/') && f.path.toLowerCase().endsWith('.html'),
    );
    if (htmlAtRoot.length === 1 && htmlAtRoot[0]?.path) return htmlAtRoot[0].path;
    return null;
  } catch {
    return null;
  }
}

// Build the raw URL that renders a project's entry file. The raw route
// serves it with the right Content-Type and resolves sibling
// CSS/JS/img relative to the same dir, so this URL opens directly in a
// browser (HTML entries render; bare JSX entries that rely on
// host-injected React/Babel do not — those still need the Open Design
// UI). Returns null when there's no entry file. Pure: no I/O, so
// get_project can call it from project data it already has.
function rawPreviewUrl(baseUrl: string, projectId: string, entry: unknown): string | null {
  return buildProjectRawFileUrl(baseUrl, projectId, entry);
}

async function resolveLegacyRunEntry(
  baseUrl: string,
  projectId: string,
): Promise<string | null> {
  try {
    const data = await getJson<ProjectPayload>(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}`,
    );
    const project = data?.project ?? data;
    const declared = (project as { metadata?: JsonObject } | undefined)
      ?.metadata?.entryFile;
    return resolveProjectEntry(baseUrl, projectId, declared);
  } catch {
    return null;
  }
}

async function createArtifact(baseUrl: string, args: McpArgs) {
  const { id, resolved, active } = await resolveProjectArg(baseUrl, args.project);
  requireString(args.name, 'name');
  requireString(args.content, 'content');
  if (
    args.artifactManifest !== undefined &&
    (args.artifactManifest === null ||
      typeof args.artifactManifest !== 'object' ||
      Array.isArray(args.artifactManifest))
  ) {
    throw new Error('artifactManifest must be an object');
  }
  const artifactManifest =
    args.artifactManifest
      ? args.artifactManifest
      : undefined;
  const payload = await postCreateArtifactRequest({
    baseUrl,
    projectId: id,
    input: {
      name: args.name,
      content: args.content,
      encoding: args.encoding === 'base64' ? 'base64' : 'utf8',
      ...(artifactManifest === undefined ? {} : { artifactManifest }),
    },
  });
  const result = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as JsonObject)
    : { result: payload };
  return ok(withActiveEcho(result, active, resolved));
}

// Resource description renderers in some MCP UIs collapse whitespace
// poorly; keep our descriptions on a single line so they don't break
// the catalog list layout.
function oneLine(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.replace(/\s+/g, ' ').trim().slice(0, 200) || undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Short-lived cache for the project list. A typical agent session
// makes several name-based lookups in quick succession; without this
// each one re-fetches /api/projects. The TTL is short so a project
// renamed in the Open Design UI shows up within a few seconds.
const PROJECT_LIST_TTL_MS = 5000;
let projectListCache: ProjectListCache | null = null;

async function fetchProjectList(baseUrl: string): Promise<ProjectSummary[]> {
  const now = Date.now();
  if (
    projectListCache &&
    projectListCache.baseUrl === baseUrl &&
    now - projectListCache.t < PROJECT_LIST_TTL_MS
  ) {
    return projectListCache.list;
  }
  const data = await getJson<ProjectsPayload>(`${baseUrl}/api/projects`);
  const list = Array.isArray(data?.projects) ? data.projects : [];
  projectListCache = { baseUrl, t: now, list };
  return list;
}

// When the agent omits `project`, fall back to whatever the user has
// open in Open Design. Returns the resolved id plus, for echo-back to the
// caller, the active-context payload that was used. Throws a clear
// error when neither is available so the agent can prompt the user
// rather than guessing.
async function resolveProjectArg(baseUrl: string, arg: unknown): Promise<{ id: string; resolved: ResolvedProject | null; active: ActiveContext | null }> {
  if (typeof arg === 'string' && arg.length > 0) {
    const resolved = await resolveProjectId(baseUrl, arg);
    return { id: resolved.id, resolved, active: null };
  }
  let active: ActiveContext;
  try {
    active = await getJson<ActiveContext>(`${baseUrl}/api/active`);
  } catch (err) {
    throw new Error(
      `project arg omitted and active context lookup failed: ${errorMessage(err)}. Pass project="<id-or-name>".`,
    );
  }
  if (!active || active.active === false || !active.projectId) {
    throw new Error(
      'project arg omitted and Open Design has no active project. The active context expires about 5 minutes after the last user interaction with Open Design - the user may need to click into a project to wake it up. Otherwise pass project="<id-or-name>".',
    );
  }
  return { id: active.projectId, resolved: null, active };
}

async function resolveProjectId(baseUrl: string, arg: unknown): Promise<ResolvedProject> {
  if (typeof arg !== 'string' || !arg) {
    throw new Error('project is required (string).');
  }
  if (UUID_RE.test(arg)) return { id: arg, name: arg, source: 'uuid' as const };

  const list = await fetchProjectList(baseUrl);
  if (list.length === 0) {
    throw new Error('no projects on this daemon');
  }

  const lower = arg.toLowerCase();
  const norm = (s: unknown): string =>
    String(s || '')
      .toLowerCase()
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/[\s_-]+/g, '-');
  const target = norm(arg);

  const idMatch = list.find((p) => p.id === arg);
  if (idMatch) return { id: idMatch.id, name: idMatch.name, source: 'id' as const };

  const exact = list.filter((p) => String(p.name || '').toLowerCase() === lower);
  if (exact.length === 1) { const p = exact[0]!; return { id: p.id, name: p.name, source: 'exact' as const }; }

  const slugged = list.filter((p) => norm(p.name) === target);
  if (slugged.length === 1) { const p = slugged[0]!; return { id: p.id, name: p.name, source: 'slug' as const }; }

  const subs = list.filter((p) =>
    String(p.name || '').toLowerCase().includes(lower),
  );
  if (subs.length === 1) { const p = subs[0]!; return { id: p.id, name: p.name, source: 'substring' as const }; }
  if (subs.length > 1) {
    const opts = subs.map((p) => `${p.name} (${p.id})`).join(', ');
    throw new Error(
      `multiple projects match "${arg}": ${opts}. Pass the UUID instead.`,
    );
  }
  throw new Error(`no project matches "${arg}"`);
}

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await safeText(resp);
    throw new Error(`daemon ${resp.status} on ${url}: ${body || resp.statusText}`);
  }
  return (await resp.json()) as T;
}

async function getFile(baseUrl: string, project: string, relPath: string, active: ActiveContext | null, resolved?: ResolvedProject | null, offset = 0, limit = 2000) {
  const segments = String(relPath)
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeURIComponent);
  const url = `${baseUrl}/api/projects/${encodeURIComponent(project)}/raw/${segments.join('/')}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await safeText(resp);
    return errorResult(
      `daemon ${resp.status} on ${url}: ${body || resp.statusText}`,
    );
  }
  const mime = ((resp.headers.get('content-type') || 'application/octet-stream').split(';')[0] ?? 'application/octet-stream').trim();
  if (!isTextualMime(mime)) {
    return errorResult(
      `file at "${relPath}" has mime "${mime}"; binary content is not yet supported by od mcp. Use list_files to inspect its metadata.`,
    );
  }
  const text = await resp.text();
  const allLines = text.split('\n');
  const totalLines = allLines.length;
  const start = Math.min(offset, totalLines);
  const slice = allLines.slice(start, start + limit);
  const returnedLines = slice.length;
  const truncated = start + returnedLines < totalLines;

  const extra: string[] = [];
  if (active) extra.push(formatActiveEchoLine(active, relPath));
  if (resolved && (resolved.source === 'slug' || resolved.source === 'substring')) {
    extra.push(`[od:resolved-project id="${resolved.id}" name="${resolved.name}" via="${resolved.source}"]`);
  }
  if (truncated || start > 0) {
    const nextOffset = start + returnedLines;
    const next = truncated ? `; call get_file again with offset=${nextOffset} to read more` : '';
    extra.push(
      `[od:file-window offset=${start} returnedLines=${returnedLines} totalLines=${totalLines}${next}]`,
    );
  }
  return {
    content: [
      ...extra.map((t) => ({ type: 'text' as const, text: t })),
      { type: 'text' as const, text: slice.join('\n') },
    ],
  };
}

// Stamp `usedActiveContext` onto JSON tool responses when the
// project came from /api/active. Plain pass-through when the caller
// supplied project explicitly - keeps token overhead at zero for the
// explicit path.
function withActiveEcho<T extends JsonObject>(payload: T, active: ActiveContext | null, resolved?: ResolvedProject | null): T & JsonObject {
  const result = active ? { ...payload, usedActiveContext: activeEchoPayload(active) } : payload;
  if (resolved && (resolved.source === 'slug' || resolved.source === 'substring')) {
    return { ...result, resolvedProject: { id: resolved.id, name: resolved.name } };
  }
  return result;
}

function activeEchoPayload(active: ActiveContext) {
  return {
    projectId: active.projectId,
    projectName: active.projectName ?? null,
    fileName: active.fileName ?? null,
    ageMs: active.ageMs ?? null,
  };
}

function formatActiveEchoLine(active: ActiveContext, resolvedPath: string): string {
  const proj = active.projectName || active.projectId;
  const note = `[od:active-context project="${proj}" file="${resolvedPath}"]`;
  return active.fileName === resolvedPath
    ? note
    : `${note} (active file: ${active.fileName ?? 'none'})`;
}

const VALID_INCLUDE_MODES = new Set(['auto', 'all', 'shallow']);
const DEFAULT_MAX_BYTES = 1_500_000;
const MAX_FILES = 200;

// Tracks total textual content bytes accumulated; binary stubs don't
// count (their content is null). Once we cross the cap the caller
// stops fetching and stamps `truncated: true` on the bundle.
function totalTextBytes(files: ProjectFileBundleEntry[]): number {
  let n = 0;
  for (const f of files) {
    if (!f.binary && typeof f.content === 'string') {
      n += Buffer.byteLength(f.content, 'utf8');
    }
  }
  return n;
}

async function getArtifact(baseUrl: string, projectArg: unknown, entryArg: unknown, includeMode: unknown, maxBytesArg: unknown) {
  const include = includeMode == null || includeMode === '' ? 'auto' : includeMode;
  if (typeof include !== 'string' || !VALID_INCLUDE_MODES.has(include)) {
    return errorResult(
      `invalid include "${includeMode}"; expected one of: auto, all, shallow`,
    );
  }
  const maxBytes =
    typeof maxBytesArg === 'number' && Number.isFinite(maxBytesArg) && maxBytesArg > 0 ? maxBytesArg : DEFAULT_MAX_BYTES;

  const { id, active, resolved } = await resolveProjectArg(baseUrl, projectArg);
  const data = await getJson<ProjectPayload>(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
  const project = (data.project ?? data) as ProjectSummary;
  // Active-file beats project default entry when project also came
  // from active context - if the user is on landing.html and asks
  // "bundle this", they mean landing.html, not whatever
  // metadata.entryFile happens to be.
  const explicitEntry = typeof entryArg === 'string' && entryArg.length > 0;
  const metadataEntry = typeof project.metadata?.entryFile === 'string' ? project.metadata.entryFile : undefined;
  const entry: string | undefined = explicitEntry
    ? String(entryArg)
    : (active && active.fileName) || metadataEntry;
  if (!entry) {
    return errorResult(
      `no entry file: pass entry="..." or set the project's metadata.entryFile`,
    );
  }

  if (include === 'shallow') {
    let file;
    try {
      file = await fetchProjectFile(baseUrl, id, entry);
    } catch (err) {
      return errorResult(errorMessage(err));
    }
    return okBundle({ project, entry, files: [file], truncated: false, skippedFileCount: 0, active, resolved });
  }

  if (include === 'all') {
    const meta = await getJson<{ files?: Array<{ name: string }> }>(`${baseUrl}/api/projects/${encodeURIComponent(id)}/files`);
    const allFiles = Array.isArray(meta?.files) ? meta.files : [];
    const fetched: ProjectFileBundleEntry[] = [];
    let truncated = false;
    let skippedFileCount = 0;
    for (const f of allFiles) {
      if (fetched.length >= MAX_FILES || totalTextBytes(fetched) >= maxBytes) {
        truncated = true;
        break;
      }
      try {
        const remaining = maxBytes - totalTextBytes(fetched);
        fetched.push(await fetchProjectFile(baseUrl, id, f.name, remaining));
      } catch (err) {
        if (err instanceof BudgetExceededError) truncated = true;
        else skippedFileCount += 1;
        // Skip files that fail to fetch; keep going.
      }
    }
    return okBundle({ project, entry, files: fetched, truncated, skippedFileCount, active, resolved });
  }

  // Auto mode: BFS from entry. The entry's own fetch must succeed - 
  // a 404 there almost always means the agent typo'd `entry:`, and
  // returning an empty bundle would hide that.
  let entryFile;
  try {
    entryFile = await fetchProjectFile(baseUrl, id, entry);
  } catch (err) {
    return errorResult(errorMessage(err));
  }
  const MAX_DEPTH = 3;
  const visited = new Set([entry]);
  const fetched = [entryFile];
  let truncated = false;
  let skippedFileCount = 0;
  let frontier: string[] = [];
  if (isTextualMime(entryFile.mime)) {
    frontier = extractRelativeRefs(entryFile.content || '', entry, entryFile.mime).filter(
      (r) => !visited.has(r),
    );
  }
  outer: for (let depth = 1; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const refPath of frontier) {
      if (visited.has(refPath)) continue;
      visited.add(refPath);
      if (fetched.length >= MAX_FILES || totalTextBytes(fetched) >= maxBytes) {
        truncated = true;
        break outer;
      }
      let file;
      try {
        const remaining = maxBytes - totalTextBytes(fetched);
        file = await fetchProjectFile(baseUrl, id, refPath, remaining);
      } catch (err) {
        if (err instanceof BudgetExceededError) truncated = true;
        else skippedFileCount += 1;
        continue;
      }
      fetched.push(file);
      if (!isTextualMime(file.mime)) continue;
      const refs = extractRelativeRefs(file.content || '', refPath, file.mime);
      for (const ref of refs) {
        if (!visited.has(ref)) next.push(ref);
      }
    }
    frontier = next;
  }
  return okBundle({ project, entry, files: fetched, truncated, skippedFileCount, active, resolved });
}

// Thrown by fetchProjectFile when the server-advertised content-length exceeds
// the remaining byte budget. Distinguished from generic fetch errors (404,
// network) so callers can set truncated: true without treating it as a hard
// failure of the whole bundle.
class BudgetExceededError extends Error {}

async function fetchProjectFile(baseUrl: string, projectId: string, relPath: string, remainingBytes = Infinity): Promise<ProjectFileBundleEntry> {
  const segments = String(relPath)
    .split('/')
    .filter((s) => s.length > 0)
    .map(encodeURIComponent);
  const url = `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/${segments.join('/')}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await safeText(resp);
    throw new Error(`daemon ${resp.status} on ${url}: ${body || resp.statusText}`);
  }
  const mime = ((resp.headers.get('content-type') || 'application/octet-stream').split(';')[0] ?? 'application/octet-stream').trim();
  const headerSize = Number(resp.headers.get('content-length'));
  const size = Number.isFinite(headerSize) && headerSize >= 0 ? headerSize : null;
  if (!isTextualMime(mime)) {
    return { name: relPath, mime, size, content: null, binary: true };
  }
  // If the server advertises a size that already exceeds our remaining
  // budget, skip reading the body to avoid a large allocation.
  if (size !== null && size > remainingBytes) {
    throw new BudgetExceededError(`file ${relPath} (${size} bytes) exceeds remaining budget`);
  }
  const content = await resp.text();
  const contentBytes = Buffer.byteLength(content, 'utf8');
  if (contentBytes > remainingBytes) {
    throw new BudgetExceededError(
      `file ${relPath} (${contentBytes} bytes) exceeds remaining budget`,
    );
  }
  return { name: relPath, mime, size: size ?? contentBytes, content, binary: false };
}

// Patterns common to HTML and CSS (also fine to run on plain markdown).
const HTML_REF_PATTERNS = [
  /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<link\b[^>]*\bhref=["']([^"']+)["']/gi,
  /<img\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<source\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<video\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<audio\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi,
];

const CSS_REF_PATTERNS = [
  /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi,
  /@import\s+(?:url\()?\s*["']([^"')]+)["']/gi,
];

// JS/TS only - running these on prose creates false positives on words
// like "imported from 'X'".
const JS_REF_PATTERNS = [
  /\bimport\s+[^'"]*?['"]([^'"]+)['"]/g,
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// `srcset` can list multiple comma-separated candidates.
const SRCSET_PATTERN = /\bsrcset=["']([^"']+)["']/gi;

function isJsLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /javascript|typescript/i.test(mime)) return true;
  return /\.(?:m?jsx?|tsx?|cjs)$/i.test(fromPath);
}

function isCssLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /^text\/css\b/i.test(mime)) return true;
  return /\.css$/i.test(fromPath);
}

function isHtmlLike(mime: string | undefined, fromPath: string): boolean {
  if (mime && /^text\/html\b/i.test(mime)) return true;
  return /\.html?$/i.test(fromPath);
}

function extractRelativeRefs(text: string, fromPath: string, fromMime: string): string[] {
  if (!text) return [];
  const refs = new Set<string>();
  const runPatterns: RegExp[] = [];
  if (isHtmlLike(fromMime, fromPath)) {
    runPatterns.push(...HTML_REF_PATTERNS, ...CSS_REF_PATTERNS);
  }
  if (isCssLike(fromMime, fromPath)) {
    runPatterns.push(...CSS_REF_PATTERNS);
  }
  if (isJsLike(fromMime, fromPath)) {
    runPatterns.push(...JS_REF_PATTERNS);
  }
  // Fallback for unknown textual files: only the safest pattern,
  // url() in case it's a CSS-in-something we don't recognize.
  if (runPatterns.length === 0) {
    runPatterns.push(...CSS_REF_PATTERNS);
  }

  const candidates: string[] = [];
  for (const re of runPatterns) {
    for (const m of text.matchAll(re)) {
      const ref = (m[1] || '').trim();
      if (ref) candidates.push(ref);
    }
  }
  // Pull every candidate URL out of any srcset attributes in HTML.
  if (isHtmlLike(fromMime, fromPath)) {
    for (const m of text.matchAll(SRCSET_PATTERN)) {
      const list = m[1] || '';
      for (const part of list.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) candidates.push(url);
      }
    }
  }

  for (const raw of candidates) {
    if (/^(?:https?:|\/\/|data:|mailto:|tel:|#)/i.test(raw)) continue;
    const dir = fromPath.includes('/')
      ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1)
      : '';
    const resolved = raw.startsWith('/') ? raw.slice(1) : dir + raw;
    const stripped = resolved.replace(/[?#].*$/, '');
    const segs = stripped.split('/').filter(Boolean);
    const out: string[] = [];
    let escaped = false;
    for (const s of segs) {
      if (s === '.') continue;
      if (s === '..') {
        if (out.length === 0) { escaped = true; break; }
        out.pop();
        continue;
      }
      out.push(s);
    }
    if (escaped || out.length === 0) continue;
    refs.add(out.join('/'));
  }
  return [...refs];
}

function okBundle(bundle: BundleInput) {
  const payload = {
    entryFile: bundle.entry,
    projectId: bundle.project?.id,
    projectName: bundle.project?.name,
    truncated: bundle.truncated === true,
    skippedFileCount: bundle.skippedFileCount ?? 0,
    files: bundle.files.map((f) => ({
      name: f.name,
      mime: f.mime,
      size: f.size,
      binary: f.binary === true,
      content: f.binary ? null : f.content,
    })),
    manifest: bundle.project?.metadata ?? null,
  };
  return ok(withActiveEcho(payload, bundle.active, bundle.resolved));
}

function isTextualMime(mime: string | undefined): boolean {
  if (!mime) return false;
  return TEXTUAL_MIME_PATTERNS.some((re) => re.test(mime));
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function formatError(err: unknown, daemonUrl: string): string {
  const e = err as ErrorWithCode | null | undefined;
  const code = e && (e.cause?.code || e.code);
  const msg = errorMessage(err);
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return `cannot reach the Open Design daemon at ${daemonUrl}. Is it running? Start it with \`pnpm tools-dev\`.`;
  }
  return msg;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Exported for unit tests only.
export {
  createArtifact,
  extractRelativeRefs,
  fetchProjectFile,
  getArtifact,
  getFile,
  handleMcpToolCall,
  logicalPluginRequestDigest,
  mapMcpHostProduct,
  normalizeExternalPluginRunAnalyticsHints,
  mcpDeliveryFacts,
  mcpFailureFacts,
  resolvePluginGenerationSloWindowMs,
  resolveProjectArg,
  resolveProjectId,
  validateExternalPluginContext,
  validateMcpToolArgs,
  issuePluginWorkflowId,
  withActiveEcho,
};
