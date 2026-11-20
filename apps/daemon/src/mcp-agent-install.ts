// Per-agent MCP registration planner.
//
// `od mcp install <agent>` (and the hosted `install.sh | sh -s <agent>`
// bootstrap that calls it) wires OpenDesign's stdio MCP server into a
// coding agent's own configuration. Each agent stores MCP servers
// differently, so this module maps a single resolved launch spec
// (command/args/env — the same shape buildMcpInstallPayload produces and
// the Settings → MCP panel pastes) onto one of four registration
// strategies:
//
//   - 'cli'    : the agent ships its own `<bin> mcp add/remove/get`. We
//                shell out to it (like codex-cli.ts) so we inherit the
//                agent's merge/validation rules instead of editing its
//                config by hand. Used for claude / codex / kimi / reasonix.
//   - 'json'   : the agent reads a JSON config file with a known schema.
//                We deep-merge one server entry, never clobbering the
//                rest of the file. Used for cursor / copilot / cline /
//                opencode / openclaw / antigravity / kiro / raven / trae /
//                claude-desktop.
//   - 'yaml'   : the agent reads a YAML config file with a known schema.
//                We merge one server entry through the yaml Document API,
//                preserving comments and unrelated keys. Used for hermes
//                (mcp_servers.<name> in ~/.hermes/config.yaml, verified
//                against the official Hermes MCP documentation).
//   - 'manual' : we could not verify the agent's config path/format
//                authoritatively (pi / vibe). We refuse to write
//                a guessed path and instead print a ready-to-paste
//                snippet plus the best-known location. Writing a wrong
//                path risks corrupting a user-owned config, so this stays
//                a print-only path until the format is confirmed.
//
// The planning functions are pure (no fs / spawn) so they unit-test
// against fixed launch specs + a fake home dir; the executor in cli.ts
// performs the IO.

import path from 'node:path';
import { Document, isMap, parseDocument, YAMLMap, type ParsedNode } from 'yaml';

export const AGENT_SLUGS = [
  'claude',
  'codex',
  'reasonix',
  'raven',
  'cursor',
  'copilot',
  'openclaw',
  'antigravity',
  'pi',
  'vibe',
  'hermes',
  'cline',
  'kimi',
  'kiro',
  'trae',
  'opencode',
  'claude-desktop',
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

/** Shared shape for config-file merge plans ('json' / 'yaml'). */
export interface FileInstallPlan {
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

/** Agent reads a JSON config file with a known schema. */
export interface JsonInstallPlan extends FileInstallPlan {
  kind: 'json';
}

/** Agent reads a YAML config file with a known schema (hermes). */
export interface YamlInstallPlan extends FileInstallPlan {
  kind: 'yaml';
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

export type InstallPlan =
  | CliInstallPlan
  | JsonInstallPlan
  | YamlInstallPlan
  | ManualInstallPlan;

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
    case 'reasonix':
      return {
        kind: 'cli',
        slug,
        bin: 'reasonix',
        addArgv: [
          'mcp', 'add', serverName,
          ...envFlags(spec.env, '--env'),
          spec.command, ...spec.args,
        ],
        removeArgv: ['mcp', 'remove', serverName],
        getArgv: ['mcp', 'get', serverName],
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
    case 'raven':
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.raven', 'config.json'),
        keyPath: ['tools', 'mcpServers'],
        serverKey: serverName,
        entry: { ...jsonEntry(spec, { type: 'stdio' }), env: spec.env },
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
    case 'kiro':
      return {
        kind: 'json',
        slug,
        configPath: path.join(home, '.kiro', 'settings', 'mcp.json'),
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
    case 'claude-desktop':
      if (platform !== 'darwin' && platform !== 'win32') {
        return {
          kind: 'manual',
          slug,
          format: 'json',
          configPath: null,
          snippet: genericMcpServersSnippet(spec, serverName),
          reason:
            'Automatic MCP configuration for Claude Desktop is ' +
            'currently supported only on macOS and Windows.',
        };
      }
      return {
        kind: 'json',
        slug,
        configPath: claudeDesktopConfigPath(home, platform),
        keyPath: ['mcpServers'],
        serverKey: serverName,
        entry: jsonEntry(spec, { type: 'stdio' }),
      };

    case 'hermes':
      // Verified against the official Hermes MCP documentation:
      // https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
      // mcp_servers.<name>.command/args/env in ~/.hermes/config.yaml.
      return {
        kind: 'yaml',
        slug,
        configPath: path.join(home, '.hermes', 'config.yaml'),
        keyPath: ['mcp_servers'],
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

function claudeDesktopConfigPath(home: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  // platform === 'win32' — the planAgentInstall case already guards
  // against unsupported platforms before calling this helper.
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  return path.join(appData, 'Claude', 'claude_desktop_config.json');
}

// --- Pure JSON merge / removal (the heart of the 'json' strategy) -------

/**
 * Merge one server entry into existing config text without disturbing the
 * rest. Missing intermediate objects are created. Returns pretty JSON with
 * a trailing newline. Throws if existing text is non-empty but unparseable
 * (caller decides whether to bail or back up).
 */
export function applyJsonInstall(existingText: string | null, plan: FileInstallPlan): string {
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
export function removeJsonInstall(existingText: string | null, plan: FileInstallPlan): string | null {
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

// --- YAML merge / removal (the 'yaml' strategy, comment-preserving) -----

/**
 * setIn, but any missing path segment is created as a plain mapping.
 * Under the yaml-1.1 schema the library's auto-created collections are
 * !!omap ordered maps (they render as sequences of pairs and reload as
 * arrays), so new nodes are built with the core schema instead; scalar
 * quoting at emit time still follows the document's 1.1 schema.
 */
function setPlainIn(doc: Document, keys: string[], value: unknown): void {
  for (let i = 0; i < keys.length; i++) {
    const sub = keys.slice(0, i + 1);
    if (!doc.hasIn(sub)) {
      doc.setIn(
        sub,
        i === keys.length - 1
          ? new Document(value).contents
          : new YAMLMap<ParsedNode, ParsedNode | null>(),
      );
    }
  }
}

/**
 * Merge one server entry into existing YAML text without disturbing the
 * rest. Uses the yaml Document API so comments and unrelated keys survive
 * (the JSON strategy's parse/stringify round-trip would drop them).
 * Parses/emits with the YAML 1.1 schema to match Hermes (hermes_yaml.py
 * pins version (1, 1)): under the default 1.2 core schema, scalars like
 * `0123` change value (octal 83 → decimal 123) and emitted strings like
 * `yes`/`off` would reload as booleans. Throws if existing text is
 * non-empty but unparseable or not a mapping (caller decides whether to
 * bail or back up).
 */
export function applyYamlInstall(existingText: string | null, plan: FileInstallPlan): string {
  // Seed empty input with a parsed '{}' so the root is a properly-typed
  // parsed mapping (freshly constructed nodes fail the strict Parsed types).
  const isEmpty = existingText == null || existingText.trim() === '';
  const doc = parseDocument(isEmpty ? '{}' : existingText, { schema: 'yaml-1.1' });
  if (doc.errors.length > 0) {
    throw new Error(
      `existing config at ${plan.configPath} is not valid YAML: ${doc.errors[0]?.message ?? 'unknown parse error'}`,
    );
  }
  if (!isMap(doc.contents)) {
    throw new Error(`existing config at ${plan.configPath} is not a YAML mapping`);
  }
  if (isEmpty) doc.contents.flow = false; // emit block style, not inline {}
  setPlainIn(doc, [...plan.keyPath, plan.serverKey], plan.entry);
  return doc.toString();
}

/**
 * Remove the server entry. Returns the new text, or null when the file did
 * not exist / had nothing to remove (caller treats null as a no-op).
 */
export function removeYamlInstall(
  existingText: string | null,
  plan: FileInstallPlan,
): string | null {
  if (existingText == null || existingText.trim() === '') return null;
  // Same YAML 1.1 schema as applyYamlInstall — removal must not re-value
  // existing 1.1 scalars (e.g. octal `0123`) either.
  const doc = parseDocument(existingText, { schema: 'yaml-1.1' });
  if (doc.errors.length > 0) {
    throw new Error(
      `existing config at ${plan.configPath} is not valid YAML: ${doc.errors[0]?.message ?? 'unknown parse error'}`,
    );
  }
  const entryPath = [...plan.keyPath, plan.serverKey];
  if (!doc.hasIn(entryPath)) return null;
  doc.deleteIn(entryPath);
  return doc.toString();
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
