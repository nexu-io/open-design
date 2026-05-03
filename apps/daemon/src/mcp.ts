// @ts-nocheck
//
// `od mcp` — stdio MCP server that proxies read-only tool calls to the
// running daemon's HTTP API. Lets a coding agent in a *different* repo
// (Claude Code, Cursor, Zed) pull files from a local Open Design
// project without the export-zip-import dance.
//
// The server itself holds no state and never touches the filesystem;
// every tool resolves to a fetch() against `OD_DAEMON_URL`. Spawn the
// MCP server with no daemon running and tool calls return a clear
// "daemon not reachable" error — the server itself still launches so
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

const TOOL_DEFS = [
  {
    name: 'list_projects',
    description:
      'List every Open Design project on this daemon. Call this first to discover available project ids before using other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_project',
    description:
      'Fetch a single project by id, including its name, active skill id, active design system id, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project id (UUID) or name substring.',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    description:
      'List the files in a project. Each entry includes name, path (relative), mime, kind, size, mtime, and (when present) artifactManifest with sourceSkillId / designSystemId so the caller can know which skill + brand produced the file. Optional `since` filters to files modified after the given Unix-ms timestamp — useful for cheap polling.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project id (UUID) or name substring.' },
        since: {
          type: 'number',
          description: 'Unix-ms; only return files with mtime > since.',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_file',
    description:
      'Read the current contents of a project file. Returns text content for textual mimes (HTML, JSX, CSS, JSON, SVG, Markdown, etc.). Binary files return a clear error — use list_files to inspect their metadata, or extract them via the OD UI for now.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project id (UUID) or name substring.' },
        path: {
          type: 'string',
          description:
            'File path relative to the project root, e.g. "landing.html" or "subdir/file.html". Forward slashes only.',
        },
      },
      required: ['project', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_skills',
    description:
      'List the skills installed in this OD instance. A skill is a brand-aware recipe (HTML/JSX scaffold + checklists + DESIGN.md hooks) like "dating-web", "blog-post", "guizang-ppt".',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_skill',
    description: 'Fetch a single skill\'s metadata and SKILL.md body by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Skill id (slug, from list_skills).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_design_systems',
    description:
      'List the design systems installed in this OD instance. Each is a single DESIGN.md file describing one brand\'s visual language.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_design_system',
    description: 'Fetch a single design system\'s metadata and DESIGN.md body by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Design system id (slug).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description:
      'Substring-search across every textual file in a project. Returns up to N matches with file, 1-indexed line, and snippet. Use this to find where a class, component, token, or copy string is defined without fetching every file.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project id (UUID) or name substring.' },
        query: {
          type: 'string',
          description:
            'Substring to search (case-insensitive, treated as a literal — not a regex).',
        },
        pattern: {
          type: 'string',
          description: 'Optional glob filter on file name, e.g. "*.jsx".',
        },
        max: {
          type: 'number',
          description: 'Cap on matches returned (default 200, hard cap 1000).',
        },
      },
      required: ['project', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_artifact',
    description:
      'Pull a design artifact bundle: the entry file plus every sibling asset it references (tokens CSS, JSX modules, images, fonts) in one call. Default mode (auto) parses the entry HTML/JSX and follows relative imports / script-src / link-href / img-src / css url() up to depth 3, skipping CDN urls. include="all" returns every textual file in the project; include="shallow" returns just the entry file. PREFER THIS over multiple get_file calls when extending an OD design.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project id (UUID) or name substring.',
        },
        entry: {
          type: 'string',
          description:
            'Entry file path relative to project root. Defaults to project metadata.entryFile.',
        },
        include: {
          type: 'string',
          enum: ['auto', 'all', 'shallow'],
          description: 'auto (default) | all | shallow',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
];

export async function runMcpStdio({ daemonUrl }) {
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
        'Pulling design context:',
        '  - list_projects to discover what is available on this daemon.',
        '  - get_artifact(project) to pull the entry file PLUS its referenced',
        '    sibling assets (tokens CSS, component JSX, imported modules) in',
        '    one call. PREFER THIS over get_file when the user wants to',
        '    understand or extend a design.',
        '  - get_file(project, path) for a single known file.',
        '  - list_files for metadata only.',
        '',
        'Project arguments accept either a UUID or a name substring',
        '(e.g. "recaptr"); the server resolves the latter.',
        '',
        'Catalog reads (skills, design systems) are reference material — call',
        'them when the user asks about brand or skill, not on every request.',
        'Skills and design systems are also exposed as MCP resources at',
        '`od://skills/<id>/SKILL.md` and `od://design-systems/<id>/DESIGN.md`;',
        'clients that surface them passively can read them without an explicit',
        'tool call.',
        '',
        'When extending an OD design in another codebase, pull the full bundle',
        'once with get_artifact and work from those files locally — do not',
        'fetch files one-by-one if you can avoid it.',
      ].join('\n'),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const [skillsData, dsData] = await Promise.all([
      getJson(`${baseUrl}/api/skills`).catch(() => ({ skills: [] })),
      getJson(`${baseUrl}/api/design-systems`).catch(() => ({ designSystems: [] })),
    ]);
    const resources = [];
    for (const s of skillsData?.skills || []) {
      resources.push({
        uri: `od://skills/${encodeURIComponent(s.id)}/SKILL.md`,
        name: `Skill: ${s.name || s.id}`,
        description: oneLine(s.description),
        mimeType: 'text/markdown',
      });
    }
    for (const d of dsData?.designSystems || []) {
      resources.push({
        uri: `od://design-systems/${encodeURIComponent(d.id)}/DESIGN.md`,
        name: `Design system: ${d.title || d.name || d.id}`,
        description: oneLine(d.summary),
        mimeType: 'text/markdown',
      });
    }
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params?.uri;
    const m = String(uri || '').match(/^od:\/\/(skills|design-systems)\/([^/]+)\/(.+)$/);
    if (!m) {
      throw new Error(`unsupported resource URI: ${uri}`);
    }
    const [, kind, id] = m;
    const route = kind === 'skills' ? 'skills' : 'design-systems';
    const data = await getJson(
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
    const args = req.params?.arguments ?? {};
    try {
      switch (name) {
        case 'list_projects':
          return ok(await getJson(`${baseUrl}/api/projects`));
        case 'get_project': {
          const id = await resolveProjectId(baseUrl, args.project);
          const data = await getJson(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
          const project = data?.project ?? data;
          return ok({
            ...project,
            entryFile: project?.metadata?.entryFile ?? null,
            kind: project?.metadata?.kind ?? null,
          });
        }
        case 'list_files': {
          const id = await resolveProjectId(baseUrl, args.project);
          const params = new URLSearchParams();
          if (Number.isFinite(args.since)) params.set('since', String(args.since));
          const qs = params.toString();
          const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}/files${qs ? `?${qs}` : ''}`;
          return ok(await getJson(url));
        }
        case 'get_file': {
          const id = await resolveProjectId(baseUrl, args.project);
          requireString(args.path, 'path');
          return await getFile(baseUrl, id, args.path);
        }
        case 'list_skills':
          return ok(await getJson(`${baseUrl}/api/skills`));
        case 'get_skill':
          requireString(args.id, 'id');
          return ok(await getJson(`${baseUrl}/api/skills/${encodeURIComponent(args.id)}`));
        case 'list_design_systems':
          return ok(await getJson(`${baseUrl}/api/design-systems`));
        case 'get_design_system':
          requireString(args.id, 'id');
          return ok(
            await getJson(`${baseUrl}/api/design-systems/${encodeURIComponent(args.id)}`),
          );
        case 'get_artifact':
          return await getArtifact(baseUrl, args.project, args.entry, args.include);
        case 'search_files': {
          const id = await resolveProjectId(baseUrl, args.project);
          requireString(args.query, 'query');
          const params = new URLSearchParams({ q: String(args.query) });
          if (args.pattern) params.set('pattern', String(args.pattern));
          if (args.max) params.set('max', String(args.max));
          return ok(
            await getJson(
              `${baseUrl}/api/projects/${encodeURIComponent(id)}/search?${params.toString()}`,
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

function ok(payload) {
  const text =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function requireString(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${name} is required (string).`);
  }
}

// Resource description renderers in some MCP UIs collapse whitespace
// poorly; keep our descriptions on a single line so they don't break
// the catalog list layout.
function oneLine(s) {
  if (typeof s !== 'string') return undefined;
  return s.replace(/\s+/g, ' ').trim().slice(0, 200) || undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Short-lived cache for the project list. A typical agent session
// makes several name-based lookups in quick succession; without this
// each one re-fetches /api/projects. The TTL is short so a project
// renamed in the OD UI shows up within a few seconds.
const PROJECT_LIST_TTL_MS = 5000;
let projectListCache = null;

async function fetchProjectList(baseUrl) {
  const now = Date.now();
  if (
    projectListCache &&
    projectListCache.baseUrl === baseUrl &&
    now - projectListCache.t < PROJECT_LIST_TTL_MS
  ) {
    return projectListCache.list;
  }
  const data = await getJson(`${baseUrl}/api/projects`);
  const list = Array.isArray(data?.projects) ? data.projects : [];
  projectListCache = { baseUrl, t: now, list };
  return list;
}

async function resolveProjectId(baseUrl, arg) {
  if (typeof arg !== 'string' || !arg) {
    throw new Error('project is required (string).');
  }
  if (UUID_RE.test(arg)) return arg;

  const list = await fetchProjectList(baseUrl);
  if (list.length === 0) {
    throw new Error('no projects on this daemon');
  }

  const lower = arg.toLowerCase();
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/[\s_-]+/g, '-');
  const target = norm(arg);

  const exact = list.filter((p) => String(p.name || '').toLowerCase() === lower);
  if (exact.length === 1) return exact[0].id;

  const slugged = list.filter((p) => norm(p.name) === target);
  if (slugged.length === 1) return slugged[0].id;

  const subs = list.filter((p) =>
    String(p.name || '').toLowerCase().includes(lower),
  );
  if (subs.length === 1) return subs[0].id;
  if (subs.length > 1) {
    const opts = subs.map((p) => `${p.name} (${p.id})`).join(', ');
    throw new Error(
      `multiple projects match "${arg}": ${opts}. Pass the UUID instead.`,
    );
  }
  throw new Error(`no project matches "${arg}"`);
}

async function getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await safeText(resp);
    throw new Error(`daemon ${resp.status} on ${url}: ${body || resp.statusText}`);
  }
  return await resp.json();
}

async function getFile(baseUrl, project, relPath) {
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
  const mime = (resp.headers.get('content-type') || 'application/octet-stream')
    .split(';')[0]
    .trim();
  if (!isTextualMime(mime)) {
    return errorResult(
      `file at "${relPath}" has mime "${mime}"; binary content is not yet supported by od mcp. Use list_files to inspect its metadata.`,
    );
  }
  const text = await resp.text();
  return { content: [{ type: 'text', text }] };
}

const VALID_INCLUDE_MODES = new Set(['auto', 'all', 'shallow']);

async function getArtifact(baseUrl, projectArg, entryArg, includeMode) {
  const include = includeMode == null || includeMode === '' ? 'auto' : includeMode;
  if (!VALID_INCLUDE_MODES.has(include)) {
    return errorResult(
      `invalid include "${includeMode}"; expected one of: auto, all, shallow`,
    );
  }
  const id = await resolveProjectId(baseUrl, projectArg);
  const data = await getJson(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
  const project = data?.project ?? data;
  const entry =
    typeof entryArg === 'string' && entryArg.length > 0
      ? entryArg
      : project?.metadata?.entryFile;
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
      return errorResult(err && err.message ? err.message : String(err));
    }
    return okBundle({ project, entry, files: [file] });
  }

  if (include === 'all') {
    const meta = await getJson(`${baseUrl}/api/projects/${encodeURIComponent(id)}/files`);
    const allFiles = Array.isArray(meta?.files) ? meta.files : [];
    const fetched = [];
    for (const f of allFiles) {
      try {
        fetched.push(await fetchProjectFile(baseUrl, id, f.name));
      } catch {
        // Skip files that fail to fetch; keep going.
      }
    }
    return okBundle({ project, entry, files: fetched });
  }

  // Auto mode: BFS from entry. The entry's own fetch must succeed —
  // a 404 there almost always means the agent typo'd `entry:`, and
  // returning an empty bundle would hide that.
  let entryFile;
  try {
    entryFile = await fetchProjectFile(baseUrl, id, entry);
  } catch (err) {
    return errorResult(err && err.message ? err.message : String(err));
  }
  const MAX_DEPTH = 3;
  const visited = new Set([entry]);
  const fetched = [entryFile];
  let frontier = [];
  if (isTextualMime(entryFile.mime)) {
    frontier = extractRelativeRefs(entryFile.content || '', entry, entryFile.mime).filter(
      (r) => !visited.has(r),
    );
  }
  for (let depth = 1; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next = [];
    for (const refPath of frontier) {
      if (visited.has(refPath)) continue;
      visited.add(refPath);
      let file;
      try {
        file = await fetchProjectFile(baseUrl, id, refPath);
      } catch {
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
  return okBundle({ project, entry, files: fetched });
}

async function fetchProjectFile(baseUrl, projectId, relPath) {
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
  const mime = (resp.headers.get('content-type') || 'application/octet-stream')
    .split(';')[0]
    .trim();
  const headerSize = Number(resp.headers.get('content-length'));
  const size = Number.isFinite(headerSize) && headerSize >= 0 ? headerSize : null;
  if (!isTextualMime(mime)) {
    return { name: relPath, mime, size, content: null, binary: true };
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

// JS/TS only — running these on prose creates false positives on words
// like "imported from 'X'".
const JS_REF_PATTERNS = [
  /\bimport\s+[^'"]*?['"]([^'"]+)['"]/g,
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// `srcset` can list multiple comma-separated candidates.
const SRCSET_PATTERN = /\bsrcset=["']([^"']+)["']/gi;

function isJsLike(mime, fromPath) {
  if (mime && /javascript|typescript/i.test(mime)) return true;
  return /\.(?:m?jsx?|tsx?|cjs)$/i.test(fromPath);
}

function isCssLike(mime, fromPath) {
  if (mime && /^text\/css\b/i.test(mime)) return true;
  return /\.css$/i.test(fromPath);
}

function isHtmlLike(mime, fromPath) {
  if (mime && /^text\/html\b/i.test(mime)) return true;
  return /\.html?$/i.test(fromPath);
}

function extractRelativeRefs(text, fromPath, fromMime) {
  if (!text) return [];
  const refs = new Set();
  const runPatterns = [];
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

  const candidates = [];
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
    const clean = resolved.replace(/[?#].*$/, '').replace(/^\.\//, '');
    if (!clean || clean.includes('..')) continue;
    refs.add(clean);
  }
  return [...refs];
}

function okBundle(bundle) {
  return ok({
    entryFile: bundle.entry,
    projectId: bundle.project?.id,
    projectName: bundle.project?.name,
    files: bundle.files.map((f) => ({
      name: f.name,
      mime: f.mime,
      size: f.size,
      binary: f.binary === true,
      content: f.binary ? null : f.content,
    })),
    manifest: bundle.project?.metadata ?? null,
  });
}

function isTextualMime(mime) {
  if (!mime) return false;
  return TEXTUAL_MIME_PATTERNS.some((re) => re.test(mime));
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function formatError(err, daemonUrl) {
  const code = err && (err.cause?.code || err.code);
  const msg = err && err.message ? err.message : String(err);
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return `cannot reach OD daemon at ${daemonUrl}. Is it running? Start it with \`pnpm tools-dev\` or \`od\`.`;
  }
  return msg;
}
