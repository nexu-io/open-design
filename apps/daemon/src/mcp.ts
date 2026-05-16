// `od mcp` - stdio MCP server that proxies read-only tool calls to the
// running daemon's HTTP API. Lets a coding agent in a *different* repo
// (Claude Code, Cursor, Zed) pull files from a local Open Design
// project without the export-zip-import dance.
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

const SERVER_NAME = 'open-design';
const SERVER_VERSION = '0.2.0';

type JsonObject = Record<string, unknown>;
interface RunMcpOptions { daemonUrl: string | URL }
interface CatalogItem { id: string; name?: string; title?: string; description?: string; summary?: string }
interface SkillsPayload { skills?: CatalogItem[] }
interface DesignSystemsPayload { designSystems?: CatalogItem[] }
interface ResourcePayload { skill?: { body?: string; content?: string }; designSystem?: { body?: string; content?: string }; body?: string; content?: string }
interface ProjectSummary { id: string; name: string; metadata?: JsonObject }
interface ProjectsPayload { projects?: ProjectSummary[] }
interface ProjectPayload { project?: ProjectSummary; id?: string; name?: string; metadata?: JsonObject }
interface ActiveContext { active?: boolean; projectId?: string; projectName?: string | null; fileName?: string | null; ageMs?: number | null }
type ResolvedProject = { id: string; name: string; source: 'uuid' | 'exact' | 'slug' | 'substring' };
interface ProjectListCache { baseUrl: string; t: number; list: ProjectSummary[] }
interface McpArgs extends JsonObject { project?: unknown; entry?: unknown; include?: unknown; maxBytes?: unknown; path?: unknown; offset?: unknown; limit?: unknown; since?: unknown; query?: unknown; pattern?: unknown; max?: unknown }
interface ProjectFileBundleEntry { name: string; mime: string; size: number | null; content: string | null; binary: boolean }
interface BundleInput { project: ProjectPayload | ProjectSummary; entry: string; files: ProjectFileBundleEntry[]; truncated: boolean; active: ActiveContext | null; resolved?: ResolvedProject | null }
interface ErrorWithCode { message?: string; code?: string; cause?: { code?: string } }

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

// Description style: short, one purpose-line per tool. Active-context
// fallback is documented once in the server `instructions` block, so
// per-tool descriptions just say "project optional" and don't repeat
// the rationale - that saves ~150 tokens per tools/list response,
// shipped to the model on every session.
const PROJECT_ARG = {
  type: 'string',
  description: 'Project id (UUID) or name substring. Optional; defaults to the active project (expires after ~5 minutes of no Open Design activity).',
} as const;

const TOOL_DEFS = [
  {
    name: 'list_projects',
    description: 'List every Open Design project on this daemon.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { ...READ_ANNOTATIONS, title: 'List Open Design projects' },
  },
  {
    name: 'get_active_context',
    description:
      'Project + file the user has open in Open Design right now. Returns {active:false, hint:"..."} when no project is active so the agent can ask the user to interact with Open Design (the active context expires ~5 minutes after the last user interaction). Most tools default to this when project is omitted, so you rarely need to call this directly.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
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
      },
      additionalProperties: false,
    },
    annotations: { ...READ_ANNOTATIONS, title: 'Pull design bundle' },
  },
  {
    name: 'get_project',
    description:
      'Single project metadata: name, active skill/design-system ids, entryFile, kind, timestamps.',
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
  // Catalog (skills, design systems) is intentionally NOT exposed as
  // MCP tools. Skills are recipes that Open Design itself uses to
  // generate artifacts; an external coding agent consuming Open
  // Design's output can't run them. Design systems are reference material a
  // user can opt into via the resource URIs (od://design-systems/...)
  // when they actually want them, instead of paying tool-description
  // tokens on every turn.
];

export async function runMcpStdio({ daemonUrl }: RunMcpOptions): Promise<void> {
  const baseUrl = String(daemonUrl).replace(/\/$/, '');

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: [
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
        ' - list_projects to discover what is available on this daemon.',
        ' - get_active_context() if you want the active project/file',
        '    explicitly without making any other tool call.',
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const [skillsData, dsData] = await Promise.all([
      getJson<SkillsPayload>(`${baseUrl}/api/skills`).catch((): SkillsPayload => ({ skills: [] })),
      getJson<DesignSystemsPayload>(`${baseUrl}/api/design-systems`).catch((): DesignSystemsPayload => ({ designSystems: [] })),
    ]);
    const resources = [
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
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params?.uri;
    if (uri === 'od://focus/active') {
      const data = await getJson<ActiveContext>(`${baseUrl}/api/active`);
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
    const data = await getJson<ResourcePayload>(
      `${baseUrl}/api/${route}/${encodeURIComponent(decodeURIComponent(id))}`,
    );
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
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params?.name;
    const args: McpArgs = (req.params?.arguments ?? {}) as McpArgs;
    try {
      switch (name) {
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
          return ok(
            withActiveEcho(
              {
                ...project,
                entryFile: project?.metadata?.entryFile ?? null,
                kind: project?.metadata?.kind ?? null,
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
          // When both project and path are omitted, fall back to the
          // active file. The agent saying "read this file" without
          // specifying anything is the most natural call site.
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
        default:
          return errorResult(`unknown tool: ${name}`);
      }
    } catch (err) {
      return errorResult(formatError(err, baseUrl));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // server.connect() only *starts* the transport; it resolves once the
  // stdio reader is wired up, not when the stream closes. Hold the
  // process open until the client disconnects (stdin EOF) so the cli.ts
  // top-level `process.exit(0)` doesn't kill us mid-handshake.
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    transport.onclose = done;
    process.stdin.once('end', done);
    process.stdin.once('close', done);
  });
}

function ok(payload: unknown) {
  const text =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function requireString(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${name} is required (string).`);
  }
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
      ...extra.map((t) => ({ type: 'text', text: t })),
      { type: 'text', text: slice.join('\n') },
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
    if (!f.binary && typeof f.content === 'string') n += f.content.length;
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
    return okBundle({ project, entry, files: [file], truncated: false, active, resolved });
  }

  if (include === 'all') {
    const meta = await getJson<{ files?: Array<{ name: string }> }>(`${baseUrl}/api/projects/${encodeURIComponent(id)}/files`);
    const allFiles = Array.isArray(meta?.files) ? meta.files : [];
    const fetched: ProjectFileBundleEntry[] = [];
    let truncated = false;
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
        // Skip files that fail to fetch; keep going.
      }
    }
    return okBundle({ project, entry, files: fetched, truncated, active, resolved });
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
  return okBundle({ project, entry, files: fetched, truncated, active, resolved });
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
  return { name: relPath, mime, size: size ?? content.length, content, binary: false };
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
export { extractRelativeRefs, resolveProjectId, resolveProjectArg, withActiveEcho, fetchProjectFile, getArtifact, getFile };
