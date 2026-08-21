import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const kiloAgentDef = {
    id: 'kilo',
    name: 'Kilo',
    bin: 'kilo',
    // @kilocode/cli installs both names on every supported npm platform.
    // Standalone release archives use `kilo`, while existing user shims may
    // still expose the package's `kilocode` alias.
    fallbackBins: ['kilocode'],
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    // Kilo's ACP session id is its persisted backing-session id, not a
    // process-local wrapper id. Preserve it and use session/load on follow-up
    // turns so Kilo keeps its native context instead of receiving a flattened
    // transcript on every spawn.
    resumesSessionViaAcpLoad: true,
    acpSessionIdIsDurable: true,
    // Kilo only accepts models advertised by the ACP model config option.
    supportsCustomModel: false,
    // ACP resource links are URIs. Kilo intentionally treats a bare path as
    // text, so attachment paths must be converted to file:// URLs.
    supportsImagePaths: true,
    acpImagePathFormat: 'file-url',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    acpMcpEnvFormat: 'array',
} satisfies RuntimeAgentDef;
