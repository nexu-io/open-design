import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MCP_TEMPLATES,
  buildAcpMcpServers,
  buildClaudeMcpJson,
  isManagedProjectCwd,
  readMcpConfig,
  sanitizeMcpServer,
  writeMcpConfig,
} from '../src/mcp-config.js';

describe('mcp-config storage', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcpconfig-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns empty servers when no config file exists', async () => {
    const cfg = await readMcpConfig(dataDir);
    expect(cfg).toEqual({ servers: [] });
  });

  it('returns empty config for a corrupt JSON file', async () => {
    await writeFile(path.join(dataDir, 'mcp-config.json'), '{not valid');
    const cfg = await readMcpConfig(dataDir);
    expect(cfg).toEqual({ servers: [] });
  });

  it('persists and re-reads a valid stdio server', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        {
          id: 'github',
          label: 'GitHub',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx' },
        },
      ],
    });
    expect(written.servers).toHaveLength(1);
    expect(written.servers[0]?.id).toBe('github');

    const reread = await readMcpConfig(dataDir);
    expect(reread.servers[0]?.command).toBe('npx');
    expect(reread.servers[0]?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_xxx');
  });

  it('persists and re-reads a valid SSE server with headers', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        {
          id: 'higgsfield',
          transport: 'sse',
          enabled: true,
          url: 'https://mcp.higgsfield.ai',
          headers: { Authorization: 'Bearer abc' },
        },
      ],
    });
    expect(written.servers[0]?.url).toBe('https://mcp.higgsfield.ai/');
    expect(written.servers[0]?.headers?.Authorization).toBe('Bearer abc');
  });

  it('drops invalid entries silently', async () => {
    const written = await writeMcpConfig(dataDir, {
      servers: [
        { id: 'bad' /* missing transport-required fields */ },
        { id: 'NOT VALID id', transport: 'stdio', command: 'x' },
        { id: 'good', transport: 'stdio', command: 'echo' },
        // Duplicate id is dropped on second occurrence.
        { id: 'good', transport: 'stdio', command: 'other' },
      ],
    });
    expect(written.servers.map((s) => s.id)).toEqual(['good']);
  });

  it('rejects non-http(s) URLs', () => {
    const out = sanitizeMcpServer({
      id: 'sneaky',
      transport: 'http',
      url: 'file:///etc/passwd',
    });
    expect(out).toBeNull();
  });

  it('drops disabled flag default to enabled when explicit', () => {
    const out = sanitizeMcpServer({
      id: 'a',
      transport: 'stdio',
      command: 'echo',
      enabled: false,
    });
    expect(out?.enabled).toBe(false);
  });

  it('writes JSON in a deterministic shape', async () => {
    await writeMcpConfig(dataDir, {
      servers: [
        { id: 'a', transport: 'stdio', enabled: true, command: 'echo' },
      ],
    });
    const raw = await readFile(path.join(dataDir, 'mcp-config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      servers: [
        { id: 'a', transport: 'stdio', enabled: true, command: 'echo' },
      ],
    });
  });
});

describe('buildClaudeMcpJson', () => {
  it('returns null when no enabled servers', () => {
    expect(buildClaudeMcpJson([])).toBeNull();
    expect(
      buildClaudeMcpJson([
        {
          id: 'x',
          transport: 'stdio',
          enabled: false,
          command: 'echo',
        },
      ]),
    ).toBeNull();
  });

  it('emits a stdio entry with command/args/env', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'github',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp' },
      },
    ]);
    expect(out).toEqual({
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp' },
        },
      },
    });
  });

  it('emits an sse / http entry with url + headers + transport type', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'higgsfield',
        transport: 'sse',
        enabled: true,
        url: 'https://mcp.higgsfield.ai',
        headers: { Authorization: 'Bearer abc' },
      },
    ]) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield).toEqual({
      type: 'sse',
      url: 'https://mcp.higgsfield.ai',
      headers: { Authorization: 'Bearer abc' },
    });
  });

  it('skips disabled servers', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
      {
        id: 'b',
        transport: 'stdio',
        enabled: false,
        command: 'rm',
      },
    ]) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(out.mcpServers)).toEqual(['a']);
  });

  it('injects an Authorization Bearer header when a stored OAuth token is supplied', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer access-tok-xyz',
    });
  });

  it("does NOT overwrite a user-pinned Authorization header even when a token exists", () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
          headers: { authorization: 'Bearer manual-token' },
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      authorization: 'Bearer manual-token',
    });
  });

  it('overwrites a blank/whitespace Authorization header with the OAuth Bearer (template-default-not-filled bug)', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
          headers: { Authorization: '   ' },
        },
      ],
      { higgsfield: 'access-tok-xyz' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer access-tok-xyz',
    });
  });

  it('drops a blank Authorization header when no token is available either', () => {
    const out = buildClaudeMcpJson([
      {
        id: 'higgsfield',
        transport: 'http',
        enabled: true,
        url: 'https://mcp.higgsfield.ai/mcp',
        headers: { Authorization: '' },
      },
    ]) as { mcpServers: Record<string, Record<string, unknown>> };
    // Empty Authorization is worse than missing — should be omitted.
    expect(out.mcpServers.higgsfield?.headers).toBeUndefined();
  });
});

describe('sanitizeMcpServer headers', () => {
  it('strips empty / whitespace-only header values at persist time', () => {
    const sanitized = sanitizeMcpServer({
      id: 'higgsfield',
      transport: 'http',
      enabled: true,
      url: 'https://mcp.higgsfield.ai/mcp',
      headers: {
        Authorization: '',
        'X-Real-Header': 'kept',
        ' ': 'invalid-key',
        Whitespace: '   ',
      },
    });
    expect(sanitized?.headers).toEqual({ 'X-Real-Header': 'kept' });
  });

  it('omits the headers field entirely when every value is blank', () => {
    const sanitized = sanitizeMcpServer({
      id: 'higgsfield',
      transport: 'http',
      enabled: true,
      url: 'https://mcp.higgsfield.ai/mcp',
      headers: { Authorization: '' },
    });
    expect(sanitized?.headers).toBeUndefined();
  });

  it('only injects the Bearer for the matching server id', () => {
    const out = buildClaudeMcpJson(
      [
        {
          id: 'higgsfield',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.higgsfield.ai/mcp',
        },
        {
          id: 'untouched',
          transport: 'http',
          enabled: true,
          url: 'https://mcp.example.com/mcp',
        },
      ],
      { higgsfield: 'tok' },
    ) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(out.mcpServers.higgsfield?.headers).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(out.mcpServers.untouched?.headers).toBeUndefined();
  });
});

describe('buildAcpMcpServers', () => {
  it('drops sse / http servers (ACP descriptor is stdio-only)', () => {
    const out = buildAcpMcpServers([
      {
        id: 'a',
        transport: 'stdio',
        enabled: true,
        command: 'echo',
      },
      {
        id: 'b',
        transport: 'sse',
        enabled: true,
        url: 'https://example.com',
      },
    ]);
    expect(out.map((s) => s.name)).toEqual(['a']);
  });

  it('flattens env to ACP {name,value} array shape', () => {
    const out = buildAcpMcpServers([
      {
        id: 'gh',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { TOKEN: 'x' },
      },
    ]);
    expect(out[0]).toEqual({
      type: 'stdio',
      name: 'gh',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: [{ name: 'TOKEN', value: 'x' }],
    });
  });
});

describe('isManagedProjectCwd', () => {
  const projectsDir = '/abs/.od/projects';

  it('accepts a real per-project subdir', () => {
    expect(isManagedProjectCwd('/abs/.od/projects/abc', projectsDir)).toBe(true);
    expect(
      isManagedProjectCwd('/abs/.od/projects/abc/sub', projectsDir),
    ).toBe(true);
  });

  it('rejects the projects-dir root itself (no per-project id)', () => {
    expect(isManagedProjectCwd(projectsDir, projectsDir)).toBe(false);
  });

  it('rejects a git-linked baseDir outside of projects-dir', () => {
    expect(isManagedProjectCwd('/home/me/code/repo', projectsDir)).toBe(false);
  });

  it('rejects PROJECT_ROOT-shaped fallback', () => {
    expect(isManagedProjectCwd('/abs', projectsDir)).toBe(false);
  });

  it('rejects null / undefined cwd', () => {
    expect(isManagedProjectCwd(null, projectsDir)).toBe(false);
    expect(isManagedProjectCwd(undefined, projectsDir)).toBe(false);
    expect(isManagedProjectCwd('', projectsDir)).toBe(false);
  });

  it('rejects path-prefix collisions (different sibling dir)', () => {
    // `/abs/.od/projects-other` starts with `/abs/.od/projects` as a string,
    // but is NOT a child of `/abs/.od/projects/`. Strict-separator check
    // makes sure we don't accidentally write to an unrelated tree.
    expect(
      isManagedProjectCwd('/abs/.od/projects-other/x', projectsDir),
    ).toBe(false);
  });
});

describe('MCP_TEMPLATES', () => {
  it('includes the Higgsfield openclaw entry pointing at the streamable HTTP /mcp endpoint', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'higgsfield-openclaw');
    expect(tpl).toBeDefined();
    // The actual MCP endpoint (verified live) is the /mcp path with
    // streamable HTTP transport. The bare host returns 404 on POST and the
    // /sse path returns 404 — only /mcp speaks the protocol.
    expect(tpl?.transport).toBe('http');
    expect(tpl?.url).toBe('https://mcp.higgsfield.ai/mcp');
    // Authorization header is optional — Claude Code attempts OAuth itself
    // when no Bearer token is supplied.
    expect(
      tpl?.headerFields?.some((f) => f.key === 'Authorization' && !f.required),
    ).toBe(true);
  });

  it('includes the GitHub stdio template with required token field', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'github');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(
      tpl?.envFields?.some((f) => f.key === 'GITHUB_PERSONAL_ACCESS_TOKEN' && f.required),
    ).toBe(true);
  });

  it('includes the Pollinations stdio template with optional API key', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'pollinations');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', '@pollinations_ai/mcp']);
    // The free tier works without a key — POLLINATIONS_API_KEY must be
    // surfaced but NOT marked required (would block users from saving an
    // anonymous-tier server).
    const apiKey = tpl?.envFields?.find((f) => f.key === 'POLLINATIONS_API_KEY');
    expect(apiKey).toBeDefined();
    expect(apiKey?.required ?? false).toBe(false);
    expect(apiKey?.secret).toBe(true);
  });

  it('includes the Allyson SVG-animation stdio template with required API_KEY', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'allyson');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', 'allyson-mcp']);
    expect(
      tpl?.envFields?.some((f) => f.key === 'API_KEY' && f.required && f.secret),
    ).toBe(true);
  });

  it('includes the Imagician local-image-editor template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'imagician');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', '@flowy11/imagician']);
    // Local sharp-based editor: must not require any env / auth fields.
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the screenshot-website-fast template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'screenshot-website-fast');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', '@just-every/mcp-screenshot-website-fast']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the EdgeOne Pages template with optional API token', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'edgeone-pages');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', 'edgeone-pages-mcp@latest']);
    // deploy_html flow works token-less; folder / project-update tools
    // need EDGEONE_PAGES_API_TOKEN — surface it but keep optional.
    const token = tpl?.envFields?.find((f) => f.key === 'EDGEONE_PAGES_API_TOKEN');
    expect(token).toBeDefined();
    expect(token?.required ?? false).toBe(false);
    expect(token?.secret).toBe(true);
  });

  it('uses unique template ids and human labels', () => {
    const ids = MCP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of MCP_TEMPLATES) {
      expect(t.label.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every template has a category in the canonical enum', () => {
    const VALID = new Set([
      'image-generation',
      'image-editing',
      'web-capture',
      'design-systems',
      'ui-components',
      'data-viz',
      'publishing',
      'utilities',
    ]);
    for (const t of MCP_TEMPLATES) {
      expect(VALID.has(t.category)).toBe(true);
    }
  });

  it('groups image-generation templates in declaration order', () => {
    const ids = MCP_TEMPLATES.filter((t) => t.category === 'image-generation').map((t) => t.id);
    // Order matters — the picker renders templates in the declared order
    // inside each category bucket, so the most useful default (Higgsfield
    // OpenClaw, the marquee install) needs to stay first.
    expect(ids).toEqual([
      'higgsfield-openclaw',
      'pollinations',
      'allyson',
      'bedrock-image',
      'prompt-to-asset',
      'nanobanana',
      'seedream',
      'fal-ai',
    ]);
  });

  it('groups design-systems templates in declaration order', () => {
    const ids = MCP_TEMPLATES.filter((t) => t.category === 'design-systems').map((t) => t.id);
    expect(ids).toEqual([
      'figma-context',
      'design-token-bridge',
      'design-system-extractor',
      'figma-use',
      'aesthetics-wiki',
    ]);
  });

  it('groups publishing templates in declaration order', () => {
    const ids = MCP_TEMPLATES.filter((t) => t.category === 'publishing').map((t) => t.id);
    expect(ids).toEqual([
      'edgeone-pages',
      'pagedrop',
      'pdfspark',
      'ogforge',
      'qrmint',
      'slideshot',
      'deckrun',
    ]);
  });

  it('includes the ImageSorcery CV-based stdio template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'imagesorcery');
    expect(tpl).toBeDefined();
    expect(tpl?.transport).toBe('stdio');
    expect(tpl?.category).toBe('image-editing');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', '@sunriseapps/imagesorcery-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the ScreenshotOne hosted template with required api key', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'screenshotone');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('web-capture');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', '@screenshotone/mcp']);
    const key = tpl?.envFields?.find((f) => f.key === 'SCREENSHOTONE_API_KEY');
    expect(key?.required).toBe(true);
    expect(key?.secret).toBe(true);
  });

  it('includes the 21st.dev Magic UI-component template (positional API_KEY arg)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === '21st-dev-magic');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('ui-components');
    expect(tpl?.command).toBe('npx');
    // Magic uses a positional `API_KEY=...` arg instead of an env var; the
    // template ships a placeholder the user must edit before saving works.
    expect(tpl?.args).toEqual([
      '-y',
      '@21st-dev/magic@latest',
      'API_KEY=__YOUR_API_KEY__',
    ]);
  });

  it('includes the shadcn/ui template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'shadcn-ui');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('ui-components');
    expect(tpl?.args).toEqual(['-y', '@jpisnice/shadcn-ui-mcp-server']);
  });

  it('includes the FlyonUI template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'flyonui');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('ui-components');
    expect(tpl?.args).toEqual(['-y', 'flyonui-mcp']);
  });

  it('includes the AntV chart template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'antv-chart');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('data-viz');
    expect(tpl?.args).toEqual(['-y', '@antv/mcp-server-chart']);
  });

  it('includes the Mermaid diagram template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'mermaid');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('data-viz');
    expect(tpl?.args).toEqual(['-y', '@peng-shawn/mermaid-mcp-server']);
  });

  it('includes the Bedrock Image template via uvx (Python launcher)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'bedrock-image');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-generation');
    // Bedrock requires the Python `uvx` launcher; the template records it
    // explicitly so users know they need uv installed (vs. Node-only `npx`).
    expect(tpl?.command).toBe('uvx');
    expect(tpl?.args).toEqual(['bedrock-image-mcp-server@latest']);
    expect(tpl?.envFields?.some((f) => f.key === 'AWS_REGION')).toBe(true);
  });

  it('includes the prompt-to-asset template (no required key, free-tier paths)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'prompt-to-asset');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-generation');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', 'prompt-to-asset']);
    // The package routes free-tier providers first (Cloudflare / NVIDIA NIM /
    // HF / Stable Horde / Pollinations / inline SVG) so the template MUST
    // not surface required env fields.
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Nano Banana hosted streamable-HTTP template with required Authorization', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'nanobanana');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-generation');
    expect(tpl?.transport).toBe('http');
    expect(tpl?.url).toBe('https://nanobanana.mcp.acedata.cloud/mcp');
    const auth = tpl?.headerFields?.find((f) => f.key === 'Authorization');
    expect(auth?.required).toBe(true);
    expect(auth?.secret).toBe(true);
  });

  it('includes the Seedream hosted streamable-HTTP template with required Authorization', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'seedream');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-generation');
    expect(tpl?.transport).toBe('http');
    expect(tpl?.url).toBe('https://seedream.mcp.acedata.cloud/mcp');
    const auth = tpl?.headerFields?.find((f) => f.key === 'Authorization');
    expect(auth?.required).toBe(true);
    expect(auth?.secret).toBe(true);
  });

  it('includes the fal.ai template via uvx with required FAL_KEY', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'fal-ai');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-generation');
    expect(tpl?.command).toBe('uvx');
    // `--from` is required because the package name and bin name differ
    // (fal-mcp-server vs fal-mcp).
    expect(tpl?.args).toEqual(['--from', 'fal-mcp-server', 'fal-mcp']);
    const key = tpl?.envFields?.find((f) => f.key === 'FAL_KEY');
    expect(key?.required).toBe(true);
    expect(key?.secret).toBe(true);
  });

  it('includes the Photopea layered-editor template (no auth, opens browser on first call)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'photopea');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-editing');
    expect(tpl?.command).toBe('npx');
    expect(tpl?.args).toEqual(['-y', 'photopea-mcp-server']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Topaz Labs template with required API key', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'topaz-labs');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-editing');
    expect(tpl?.args).toEqual(['-y', '@topazlabs/mcp']);
    const key = tpl?.envFields?.find((f) => f.key === 'TOPAZ_API_KEY');
    expect(key?.required).toBe(true);
    expect(key?.secret).toBe(true);
  });

  it('includes the Transloadit template with both KEY and SECRET required', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'transloadit');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('image-editing');
    // The MCP server bin needs the `stdio` subcommand to select transport
    // (default would expose HTTP locally and require an auth token).
    expect(tpl?.args).toEqual(['-y', '@transloadit/mcp-server', 'stdio']);
    const key = tpl?.envFields?.find((f) => f.key === 'TRANSLOADIT_KEY');
    const secret = tpl?.envFields?.find((f) => f.key === 'TRANSLOADIT_SECRET');
    expect(key?.required).toBe(true);
    expect(secret?.required).toBe(true);
    expect(key?.secret).toBe(true);
    expect(secret?.secret).toBe(true);
  });

  it('includes the pagecast browser-recording template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'pagecast');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('web-capture');
    expect(tpl?.args).toEqual(['-y', '@mcpware/pagecast']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Figma-Context design template with required FIGMA_API_KEY', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'figma-context');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('design-systems');
    // `--stdio` is required — without it the package starts an HTTP listener
    // on a random port and the spawn never produces stdio messages.
    expect(tpl?.args).toEqual(['-y', 'figma-developer-mcp', '--stdio']);
    const key = tpl?.envFields?.find((f) => f.key === 'FIGMA_API_KEY');
    expect(key?.required).toBe(true);
    expect(key?.secret).toBe(true);
  });

  it('includes the Design Token Bridge template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'design-token-bridge');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('design-systems');
    expect(tpl?.args).toEqual(['-y', 'design-token-bridge-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Design System Extractor template with optional STORYBOOK_URL', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'design-system-extractor');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('design-systems');
    expect(tpl?.args).toEqual(['-y', 'mcp-design-system-extractor@latest']);
    // STORYBOOK_URL has a sensible default in the upstream package
    // (http://localhost:6006), so the template surfaces it but does NOT
    // require it — users with a localhost Storybook can save the entry as-is.
    const url = tpl?.envFields?.find((f) => f.key === 'STORYBOOK_URL');
    expect(url).toBeDefined();
    expect(url?.required ?? false).toBe(false);
  });

  it('includes the figma-use HTTP template (writes to Figma, localhost endpoint)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'figma-use');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('design-systems');
    // figma-use only ships an HTTP server (no stdio mode in serve.ts), so the
    // template wires the daemon to its default localhost endpoint and lets
    // the user run `npx figma-use mcp serve` themselves alongside Figma's
    // remote-debugging port.
    expect(tpl?.transport).toBe('http');
    expect(tpl?.url).toBe('http://localhost:38451/mcp');
    expect(tpl?.headerFields ?? []).toEqual([]);
  });

  it('includes the Aesthetics Wiki uvx template (no auth, moodboard MCP)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'aesthetics-wiki');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('design-systems');
    expect(tpl?.command).toBe('uvx');
    expect(tpl?.args).toEqual(['aesthetics-wiki-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the MCP Dashboards template with --stdio arg (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'mcp-dashboards');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('data-viz');
    // `--stdio` flag selects stdio transport — without it the bin starts an
    // HTTP server on :3001 and the spawn never produces stdio messages.
    expect(tpl?.args).toEqual(['-y', 'mcp-dashboards', '--stdio']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Excalidraw Architect uvx template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'excalidraw-architect');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('data-viz');
    expect(tpl?.command).toBe('uvx');
    expect(tpl?.args).toEqual(['excalidraw-architect-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the PageDrop instant-hosting template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'pagedrop');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    expect(tpl?.args).toEqual(['-y', 'pagedrop-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the PDFSpark HTML→PDF template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'pdfspark');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    expect(tpl?.args).toEqual(['-y', 'pdfspark-api']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the OGForge Open-Graph image template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'ogforge');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    expect(tpl?.args).toEqual(['-y', 'ogforge-api']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the QRMint styled-QR template (no auth, package = qr-mcp)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'qrmint');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    // The npm package is `qr-mcp`, not `qrmint` (the brand name is QRMint).
    expect(tpl?.args).toEqual(['-y', 'qr-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Slideshot HTML→PDF/PPTX template (no auth, package = slideshot-mcp)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'slideshot');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    // The npm package for the MCP entry is `slideshot-mcp`; the bare
    // `slideshot` package is the standalone CLI / REST server.
    expect(tpl?.args).toEqual(['-y', 'slideshot-mcp']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });

  it('includes the Deckrun hosted-HTTP template (free tier, no required header)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'deckrun');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('publishing');
    expect(tpl?.transport).toBe('http');
    expect(tpl?.url).toBe('https://deckrun-mcp-free.agenticdecks.com/mcp/');
    // Free-tier endpoint works token-less; Authorization header is exposed
    // for the paid-tier upgrade path but NOT marked required.
    const auth = tpl?.headerFields?.find((f) => f.key === 'Authorization');
    expect(auth).toBeDefined();
    expect(auth?.required ?? false).toBe(false);
    expect(auth?.secret).toBe(true);
  });

  it('includes the A11y axe-core template (no auth)', () => {
    const tpl = MCP_TEMPLATES.find((t) => t.id === 'a11y');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('utilities');
    // The npm package is `a11y-mcp-server`, NOT `a11ymcp` (which is the
    // GitHub repo slug). Getting this wrong silently 404s on the registry.
    expect(tpl?.args).toEqual(['-y', 'a11y-mcp-server']);
    expect(tpl?.envFields ?? []).toEqual([]);
  });
});
