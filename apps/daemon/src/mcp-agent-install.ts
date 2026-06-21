// Per-agent MCP registration planner.
//
// `od mcp install <agent>` (and the hosted `install.sh | sh -s <agent>`
// bootstrap that calls it) wires Open Design's stdio MCP server into a
// coding agent's own configuration. Each agent stores MCP servers
// differently, so this module maps a single resolved launch spec
// (command/args/env — the same shape buildMcpInstallPayload produces and
// the Settings → MCP panel pastes) onto one of three registration
// strategies:
//
//   - 'cli'    : the agent ships its own `<bin> mcp add/remove/get`. We
//                shell out to it (like codex-cli.ts) so we inherit the
//                agent's merge/validation rules instead of editing its
//                config by hand. Used for claude / codex / gemini / kimi.
//   - 'json'   : the agent reads a JSON config file with a known schema.
//                We deep-merge one server entry, never clobbering the
//                rest of the file. Used for cursor / copilot / cline /
//                opencode / openclaw / antigravity / trae.
//   - 'manual' : we could not verify the agent's config path/format
//                authoritatively (pi / hermes / vibe). We refuse to write
//                a guessed path and instead print a ready-to-paste
//                snippet plus the best-known location. Writing a wrong
//                path risks corrupting a user-owned config, so this stays
//                a print-only path until the format is confirmed.
//
// The planning functions are pure (no fs / spawn) so they unit-test
// against fixed launch specs + a fake home dir; the executor in cli.ts
// performs the IO.

import path from 'node:path';

export const AGENT_SLUGS = [
  'claude',
  'codex',
  'cursor',
  'copilot',
  'openclaw',
  'antigravity',
  'gemini',
  'pi',
  'vibe',
  'hermes',
  'cline',
  'kimi',
  'trae',
  'opencode',
] as const;

export type AgentSlug = (typeof AGENT_SLUGS)[number];

export function isAgentSlug(value: string): value is AgentSlug {
  return (AGENT_SLUGS as readonly string[]).includes(value);
}

/** The resolved stdio launch spec — mirrors the relevant fields of
 *  McpInstallPayload (command/args/env). */
export interface McpLaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface PlanContext {
  /** Absolute home directory (os.homedir()). Injected for testability. */
  home: string;
  /** Node platform — selects per-OS config paths (cline / trae). */
  platform: NodeJS.Platform;
  /** MCP server name as it appears in the agent config. */
  serverName: string;
}

/** Agent owns a `<bin> mcp add/remove/get`; we drive it. */
export interface CliInstallPlan {
  kind: 'cli';
  slug: AgentSlug;
  bin: string;
  addArgv: string[];
  removeArgv: string[];
  /** Argv that exits 0 iff the server is already registered. */
  getArgv: string[];
}

/** Agent reads a JSON config file with a known schema. */
export interface JsonInstallPlan {
  kind: 'json';
  slug: AgentSlug;
  /** Absolute path to the config file we merge into. */
  configPath: string;
  /** Nested object path to the server map, e.g. ['mcpServers'] or
   *  ['mcp', 'servers'] or ['mcp']. */
  keyPath: string[];
  serverKey: string;
  /** Value stored under keyPath → serverKey. */
  entry: unknown;
}

/** Unverified format — print a snippet, never write. */
export interface ManualInstallPlan {
  kind: 'manual';
  slug: AgentSlug;
  format: 'json' | 'yaml' | 'toml';
  /** Best-known config location, or null when even that is unknown. */
  configPath: string | null;
  snippet: string;
  reason: string;
}

export type InstallPlan = CliInstallPlan | JsonInstallPlan | ManualInstallPlan;

function envFlags(env: Record<string, string>, flag: string): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    out.push(flag, `${k}=${v}`);
  }
  return out;
}

/** JSON server entry shared by the `env`-style agents (cursor / copilot /
 *  cline / openclaw / antigravity / trae). `extra` carries per-agent
 *  fields; env is only attached when non-empty so configs stay clean. */
function jsonEntry(
  spec: McpLaunchSpec,
  extra: Record<string, unknown> = {},
  envKey: 'env' | 'environment' = 'env',
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    command: spec.command,
    args: spec.args,
    ...extra,
  };
  if (Object.keys(spec.env).length > 0) {
    entry[envKey] = spec.env;
  }
  return entry;
}

/**
 * Build the registration plan for one agent. Pure — all IO happens in the
 * executor. Throws on an unknown slug so callers surface a clear error.
 */
export function planAgentInstall(
  slug: AgentSlug,
  spec: McpLaunchSpec,
  ctx: PlanContext,
): InstallPlan {
  const { home, platform, serverName } = ctx;

  switch (slug) {
    // ----- CLI-driven agents (idempotent via the agent's own tool) -----
    case 'claude':
      return {
        kind: 'cli',
        slug,
        bin: 'claude',
        addArgv: [
          'mcp', 'add', '--scope', 'user',
          serverName,
          ...envFlags(spec.env, '-e'),
          '--', spec.command, ...spec.args,
        ],
        removeArgv: ['mcp', 'remove', '--scope', 'user', serverName],
        getArgv: ['mcp', 'get', serverName],
      };
    case 'codex':
      return {
        kind: 'cli',
        slug,
        bin: 'codex',
        addArgv: [
          'mcp', 'add', serverName,
          ...envFlags(spec.env, '--env'),
          '--', spec.command, ...spec.args,
        ],
        removeArgv: ['mcp', 'remove', serverName],
        getArgv: ['mcp', 'get', serverName],
      };
    case 'gemini':
      return {
        kind: 'cli',
        slug,
        bin: 'gemini',
        addArgv: [
          'mcp', 'add', '-s', 'user', '-t', 'stdio',
          ...envFlags(spec.env, '-e'),
          serverName, spec.command, ...spec.args,
        ],
        removeArgv: ['mcp', 'remove', serverName],
        getArgv: ['mcp', 'list'],
      };
    case 'kimi':
      return {
        kind: 'cli',
        slug,
        bin: 'kimi',
        addArgv: [
          'mcp', 'add', '--transport', 'stdio',
          ...envFlags(spec.env, '--env'),
          serverName, '--', spec.command, ...spec.args,
        ],
        removeArgv: ['mcp', 'remove', serverName],
        getArgv: ['mcp', 'get', serverName],
      };

    // ----- JSON config-file agents (safe deep-merge) -----
    case 'cursor':
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.cursor', 'mcp.json'),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec, { type: 'stdio' }),
      };
    case 'copilot':
      // GitHub Copilot CLI: ~/.copilot/mcp-config.json, type "local".
      // (VS Code Copilot uses a different `servers` key in
      // .vscode/mcp.json; the terminal installer targets the CLI.)
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.copilot', 'mcp-config.json'),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec, { type: 'local', tools: ['*'] }),
      };
    case 'cline':
      return {
        kind: 'json',
        slug,
        configPath: clineConfigPath(home, platform),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec, { disabled: false, autoApprove: [] }),
      };
    case 'opencode':
      // OpenCode nests under `mcp`, folds command+args into one array,
      // and gates the server with `enabled`.
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.config', 'opencode', 'opencode.json'),
        keyPath: ['mcp'],
        serverKey: serverName,
        entry: (() => {
          const e: Record<string, unknown> = {
            type: 'local',
            command: [spec.command, ...spec.args],
            enabled: true,
          };
          if (Object.keys(spec.env).length > 0) e.environment = spec.env;
          return e;
        })(),
      };
    case 'openclaw':
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.openclaw', 'openclaw.json'),
        keyPath: ['mcp', 'servers'],
        serverKey: serverName,
        entry: jsonEntry(spec),
      };
    case 'antigravity':
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec),
      };
    case 'trae':
      return {
        kind: 'json',
        slug,
        configPath: traeConfigPath(home, platform),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec),
      };

    // ----- Unverified formats: print-only, never write -----
    case 'vibe':
      return {
        kind: 'manual',
        slug,
        format: 'toml',
        configPath: path.join(home, '.vibe', 'config.toml'),
        snippet: vibeTomlSnippet(spec, serverName),
        reason:
          'Mistral Vibe uses a TOML array-of-tables ([[mcp_servers]]); ' +
          'its exact schema is unverified, so append this block by hand ' +
          'to avoid corrupting an existing config.',
      };
    case 'pi':
      return {
        kind: 'manual',
        slug,
        format: 'json',
        configPath: path.join(home, '.pi', 'agent', 'mcp.json'),
        snippet: genericMcpServersSnippet(spec, serverName),
        reason:
          'The pi coding agent exposes MCP, but its config path/schema is ' +
          'not authoritatively documented. Paste this into pi’s MCP ' +
          'config (check `pi --help` for the exact location).',
      };
    case 'hermes':
      return {
        kind: 'manual',
        slug,
        format: 'yaml',
        configPath: path.join(home, '.hermes', 'config.yaml'),
        snippet: hermesYamlSnippet(spec, serverName),
        reason:
          'Hermes config format is unverified. Add this under your Hermes ' +
          'MCP server configuration by hand.',
      };
    default: {
      const exhaustive: never = slug;
      throw new Error(`unknown agent slug: ${String(exhaustive)}`);
    }
  }
}

function clineConfigPath(home: string, platform: NodeJS.Platform): string {
  const rel = path.join(
    'globalStorage',
    'saoudrizwan.claude-dev',
    'settings',
    'cline_mcp_settings.json',
  );
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Code', 'User', rel);
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Code', 'User', rel);
  }
  return path.join(home, '.config', 'Code', 'User', rel);
}

function traeConfigPath(home: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Trae', 'User', 'mcp.json');
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Trae', 'User', 'mcp.json');
  }
  return path.join(home, '.config', 'Trae', 'User', 'mcp.json');
}

// --- Pure JSON merge / removal (the heart of the 'json' strategy) -------

/**
 * Merge one server entry into existing config text without disturbing the
 * rest. Missing intermediate objects are created. Returns pretty JSON with
 * a trailing newline. Throws if existing text is non-empty but unparseable
 * (caller decides whether to bail or back up).
 */
export function applyJsonInstall(existingText: string | null, plan: JsonInstallPlan): string {
  const root = parseJsonObject(existingText, plan.configPath);
  let cursor: Record<string, unknown> = root;
  for (const key of plan.keyPath) {
    const next = cursor[key];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[plan.serverKey] = plan.entry;
  return `${JSON.stringify(root, null, 2)}\n`;
}

/**
 * Remove the server entry. Returns the new text, or null when the file did
 * not exist / had nothing to remove (caller treats null as a no-op).
 */
export function removeJsonInstall(existingText: string | null, plan: JsonInstallPlan): string | null {
  if (existingText == null || existingText.trim() === '') return null;
  const root = parseJsonObject(existingText, plan.configPath);
  let cursor: Record<string, unknown> = root;
  for (const key of plan.keyPath) {
    const next = cursor[key];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      return null;
    }
    cursor = next as Record<string, unknown>;
  }
  if (!(plan.serverKey in cursor)) return null;
  delete cursor[plan.serverKey];
  return `${JSON.stringify(root, null, 2)}\n`;
}

function parseJsonObject(text: string | null, where: string): Record<string, unknown> {
  if (text == null || text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `existing config at ${where} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`existing config at ${where} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

// --- Snippets for the manual (print-only) strategy ----------------------

function genericMcpServersSnippet(spec: McpLaunchSpec, name: string): string {
  const server: Record<string, unknown> = {
    command: spec.command,
    args: spec.args,
  };
  if (Object.keys(spec.env).length > 0) server.env = spec.env;
  return JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
}

function hermesYamlSnippet(spec: McpLaunchSpec, name: string): string {
  const lines = [
    'mcp_servers:',
    `  ${name}:`,
    `    command: ${JSON.stringify(spec.command)}`,
    `    args: ${JSON.stringify(spec.args)}`,
  ];
  if (Object.keys(spec.env).length > 0) {
    lines.push('    env:');
    for (const [k, v] of Object.entries(spec.env)) {
      lines.push(`      ${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.join('\n');
}

function vibeTomlSnippet(spec: McpLaunchSpec, name: string): string {
  const argsToml = `[${spec.args.map((a) => JSON.stringify(a)).join(', ')}]`;
  const lines = [
    '[[mcp_servers]]',
    `name = ${JSON.stringify(name)}`,
    'transport = "stdio"',
    `command = ${JSON.stringify(spec.command)}`,
    `args = ${argsToml}`,
  ];
  return lines.join('\n');
}
