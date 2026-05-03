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
  ListToolsRequestSchema,
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
      'List the files in a project. Each entry includes name, path (relative), mime, kind, size, mtime, and (when present) artifactManifest with sourceSkillId / designSystemId so the caller can know which skill + brand produced the file.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project id (UUID) or name substring.' },
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
];

export async function runMcpStdio({ daemonUrl }) {
  const baseUrl = String(daemonUrl).replace(/\/$/, '');

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
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

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params?.name;
    const args = req.params?.arguments ?? {};
    try {
      switch (name) {
        case 'list_projects':
          return ok(await getJson(`${baseUrl}/api/projects`));
        case 'get_project': {
          const id = await resolveProjectId(baseUrl, args.project);
          return ok(await getJson(`${baseUrl}/api/projects/${encodeURIComponent(id)}`));
        }
        case 'list_files': {
          const id = await resolveProjectId(baseUrl, args.project);
          return ok(
            await getJson(`${baseUrl}/api/projects/${encodeURIComponent(id)}/files`),
          );
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveProjectId(baseUrl, arg) {
  if (typeof arg !== 'string' || !arg) {
    throw new Error('project is required (string).');
  }
  if (UUID_RE.test(arg)) return arg;

  const data = await getJson(`${baseUrl}/api/projects`);
  const list = Array.isArray(data?.projects) ? data.projects : [];
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
