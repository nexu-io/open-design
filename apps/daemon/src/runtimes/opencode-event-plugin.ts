import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Generated runtime module, carried in the daemon bundle so packaged users do
// not need another CLI or an npm plugin install. No imports or provider hooks.
export const OPEN_CODE_EVENT_PLUGIN_SOURCE = String.raw`export default async function () {
  const seen = new Map();
  return { event: async (payload) => {
    try {
      const event = payload?.event;
      if (event?.type !== 'message.part.updated') return;
      const p = event.properties?.part;
      if (p?.type !== 'tool' || typeof p.sessionID !== 'string' || typeof p.callID !== 'string' || typeof p.tool !== 'string') return;
      const key = p.sessionID + ':' + p.callID;
      if (p.state?.status === 'completed' || p.state?.status === 'error') { seen.delete(key); return; }
      if (p.state?.status !== 'pending' && p.state?.status !== 'running') return;
      const input = p.state.input;
      const target = ['write', 'edit', 'read'].includes(p.tool) && typeof input?.filePath === 'string' ? input.filePath : undefined;
      const signature = p.tool + ':' + (target || '');
      if (seen.get(key) === signature) return;
      process.stdout.write(JSON.stringify({ type: 'od_opencode_tool', version: 1, sessionID: p.sessionID, callID: p.callID, tool: p.tool, path: target }) + '\n');
      seen.set(key, signature);
    } catch { /* Preview delivery cannot affect tool execution. */ }
  }};
}
`;

/**
 * Parse the version line OpenCode prints. V2 reports `opencode v2.2.6` while
 * earlier builds reported a bare `1.18.x`, so both shapes have to normalize
 * before any generation check can be trusted.
 */
export function parseOpenCodeVersion(
  version: string | undefined | null,
): { major: number; minor: number; patch: number } | null {
  // Anchored on purpose: `1.18.0-dev` and other unverified builds must not
  // parse as stable, and V2 prints the name before the version.
  const match = /^(?:opencode\s+)?v?(\d+)\.(\d+)\.(\d+)$/u.exec(String(version ?? '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function supportsOpenCodeEventPlugin(version: string | undefined): boolean {
  const parsed = parseOpenCodeVersion(version);
  if (!parsed || parsed.major !== 1) return false;
  return parsed.minor > 17 || (parsed.minor === 17 && parsed.patch >= 18);
}

let warnedAboutV2PluginSupport = false;

/** OpenCode waits for its own npm setup even for an import-free file plugin. */
function applyDependencyFetchDefaults(env: NodeJS.ProcessEnv): void {
  const defaults = { npm_config_fetch_retries: '0', npm_config_fetch_timeout: '10000' };
  for (const [key, value] of Object.entries(defaults)) {
    // npm accepts uppercase names too. Preserve explicit per-agent/shell env.
    if (!Object.keys(env).some(name => name.toLowerCase() === key && env[name] !== undefined)) env[key] = value;
  }
}

/** Mutates only this child's config overlay; dataDir is the daemon's resolved root. */
export async function applyOpenCodeEventPlugin(
  env: NodeJS.ProcessEnv,
  dataDir: string,
  version: string | undefined,
  inheritedConfigContent?: string,
): Promise<boolean> {
  const parsedVersion = parseOpenCodeVersion(version);
  if (parsedVersion && parsedVersion.major >= 2 && !warnedAboutV2PluginSupport) {
    // The injected module uses the V1 plugin contract, which OpenCode 2 does
    // not run. Say so once instead of letting the tool-row preview quietly
    // lose file paths; wiring the V2 plugin API is a separate change.
    warnedAboutV2PluginSupport = true;
    console.info('[opencode] optional tool previews disabled: the V1 event plugin does not run on OpenCode 2');
  }
  if (!supportsOpenCodeEventPlugin(version) || /^(1|true)$/iu.test(env.OPENCODE_PURE ?? '')) return false;
  const config: unknown = env.OPENCODE_CONFIG_CONTENT ? JSON.parse(env.OPENCODE_CONFIG_CONTENT) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const overlay = config as Record<string, unknown>;
  if (overlay.plugin !== undefined && !Array.isArray(overlay.plugin)) return false;
  const inherited: unknown = inheritedConfigContent ? JSON.parse(inheritedConfigContent) : {};
  const inheritedPlugins = inherited && typeof inherited === 'object' && 'plugin' in inherited && Array.isArray(inherited.plugin)
    ? inherited.plugin : [];
  const plugins = Array.isArray(overlay.plugin) ? overlay.plugin : [];
  const hash = createHash('sha256').update(OPEN_CODE_EVENT_PLUGIN_SOURCE).digest('hex').slice(0, 16);
  const dir = path.join(dataDir, 'agent-runtime', 'opencode', 'plugins');
  const file = path.join(dir, `tool-events-${hash}.mjs`);
  // Reuse verified content on subsequent turns; repair a truncated/modified
  // module before advertising it to the child.
  if (await readFile(file, 'utf8').catch(() => null) !== OPEN_CODE_EVENT_PLUGIN_SOURCE) {
    await mkdir(dir, { recursive: true });
    // Atomic replacement keeps concurrent launches from loading partial JS.
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, OPEN_CODE_EVENT_PLUGIN_SOURCE, { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    ...overlay, plugin: [...new Set([...inheritedPlugins, ...plugins, pathToFileURL(file).href])],
  });
  applyDependencyFetchDefaults(env);
  return true;
}
