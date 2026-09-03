import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

const KILO_VERSION_RE = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

/**
 * Normalize `kilo --version` / `kilocode --version` output to a semver.
 * Returns null when the probe line has no usable version.
 */
export function parseKiloCliVersion(raw: string): string | null {
  return KILO_VERSION_RE.exec(raw.trim())?.[1] ?? null;
}

/**
 * True when `version` is at or above the MIME-aware Kilo ACP floor (7.4.23).
 * 7.0.30–7.4.22 hard-code resource_link mime as text/plain and ignore the
 * mimeType field this adapter now sends.
 */
export function isKiloMimeAwareVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return (
    major > 7
    || (major === 7 && minor > 4)
    || (major === 7 && minor === 4 && patch >= 23)
  );
}

export const kiloAgentDef = {
    id: 'kilo',
    name: 'Kilo',
    bin: 'kilo',
    // @kilocode/cli installs both names on every supported npm platform.
    // Standalone release archives use `kilo`, while existing user shims may
    // still expose the package's `kilocode` alias.
    fallbackBins: ['kilocode'],
    versionArgs: ['--version'],
    versionPolicy: {
      supportedVersions: ['7.4.23'],
      // MIME-aware ACP resource_link support landed in 7.4.23. Accept that
      // patch line and later 7.x / 8+ releases without pinning every build.
      supportedVersionPattern:
        /^(?:7\.(?:4\.(?:2[3-9]|[3-9]\d+|[1-9]\d{2,})|[5-9]\.\d+|\d{2,}\.\d+)|[8-9]\.\d+\.\d+|[1-9]\d+\.\d+\.\d+)(?:[-+].*)?$/,
      requireVersion: true,
      parse: parseKiloCliVersion,
    },
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
    acpResourceMimePolicy: 'kilo',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    acpMcpEnvFormat: 'array',
} satisfies RuntimeAgentDef;
