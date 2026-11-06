import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  type PluginManifest,
} from '@open-design/contracts';

// Adapter from a `.claude-plugin/plugin.json` file to a synthesized
// PluginManifest. Phase 1 keeps the mapping minimal — name / version /
// description / commands count — and lets Phase 2A enrich the result with
// command/agent/hook context once the plugin runtime supports the full
// claude-plugin schema. The point of this adapter today is to make a
// claude-plugin folder installable through OD without crashing.

export interface ClaudePluginAdapterOptions {
  folderId: string;
  compatPath?: string;
}

export interface ClaudePluginAdapterResult {
  manifest: PluginManifest;
  warnings: string[];
}

export function adaptClaudePlugin(
  rawJson: string,
  opts: ClaudePluginAdapterOptions,
): ClaudePluginAdapterResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      manifest: synthesizeFallback(opts.folderId, opts.compatPath ?? './.claude-plugin/plugin.json'),
      warnings: [`Failed to parse .claude-plugin/plugin.json: ${(err as Error).message}`],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      manifest: synthesizeFallback(opts.folderId, opts.compatPath ?? './.claude-plugin/plugin.json'),
      warnings: ['.claude-plugin/plugin.json must be a JSON object'],
    };
  }
  const obj = parsed as Record<string, unknown>;
  const compatPath = opts.compatPath ?? './.claude-plugin/plugin.json';
  const name = typeof obj['name'] === 'string' && obj['name'].trim().length > 0
    ? obj['name'].trim()
    : opts.folderId;
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[._-]+/, '') || opts.folderId;
  if (safeName !== name) {
    warnings.push(`claude-plugin name '${name}' was sanitized to '${safeName}' to fit the OD plugin id pattern`);
  }
  const version = typeof obj['version'] === 'string' ? obj['version'] : '0.0.0';
  const description = typeof obj['description'] === 'string' ? obj['description'] : undefined;
  const commands = Array.isArray(obj['commands']) ? obj['commands'].length : 0;
  if (commands > 0) {
    warnings.push(`claude-plugin declares ${commands} command(s); v1 OD apply does not auto-register hooks. Add them via od.context.claudePlugins[].`);
  }
  const manifest: PluginManifest = {
    specVersion: OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    name: safeName,
    title: typeof obj['title'] === 'string' ? obj['title'] : safeName,
    version,
    description: description ?? undefined,
    compat: { claudePlugins: [{ path: compatPath }] },
    od: {
      kind: 'skill',
      taskKind: 'new-generation',
    },
  };
  return { manifest, warnings };
}

function synthesizeFallback(folderId: string, compatPath: string): PluginManifest {
  return {
    specVersion: OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    name: folderId,
    title: folderId,
    version: '0.0.0',
    compat: { claudePlugins: [{ path: compatPath }] },
    od: { kind: 'skill', taskKind: 'new-generation' },
  };
}
