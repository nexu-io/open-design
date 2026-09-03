/** @module agent-protocol/acp/session-params
 * Builds the `session/new` parameter object and prompt blocks sent to an ACP
 * agent subprocess at session start. Handles MCP server descriptor normalisation
 * and env-format conversion (array vs map). Consumed by acp/session.ts and
 * acp/models.ts; depends only on Node path.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loose descriptor for a single MCP server entry as supplied by a caller.
 * All fields are typed `unknown` so the builder can safely normalise them
 * without trusting the caller's type discipline.
 */
export interface AcpMcpServerInput {
  type?: unknown;
  name?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
}
/**
 * Options accepted by `buildAcpSessionNewParams` controlling optional MCP
 * server injection and the env-field wire format used by the target agent.
 */
export interface AcpSessionOptions {
  mcpServers?: AcpMcpServerInput[];
  // How the `env` field of each mcpServer entry is shaped.
  // `'array'` (default) → `[{name, value}]` (Hermes, Kimi, …).
  // `'map'`   → `{"KEY": "val"}` (reasonix 1.x Go, standard MCP).
  envFormat?: 'array' | 'map';
}
/**
 * Builds the params object for an ACP `session/new` JSON-RPC call. Resolves
 * `cwd` to an absolute path and normalises each MCP server entry's `env` field
 * between `'array'` format (`[{name, value}]`, default, used by Hermes/Kimi)
 * and `'map'` format (`{"KEY": "val"}`, used by reasonix and standard MCP).
 *
 * MCP is optional — omit `mcpServers` to run without it. Never auto-installs
 * or mutates user/global MCP config.
 *
 * @param cwd - The working directory to pass to the ACP agent subprocess.
 * @param options - Optional MCP server list and env-format selector.
 * @returns The `session/new` params object ready for JSON-RPC serialisation.
 */
export function buildAcpSessionNewParams(cwd: string, { mcpServers, envFormat = 'array' }: AcpSessionOptions = {}) {
  const servers = Array.isArray(mcpServers) ? mcpServers : [];
  const wantsMap = envFormat === 'map';
  return {
    cwd: path.resolve(cwd),
    // MCP is an optional compatibility layer. Default to no MCP servers so ACP
    // agents can run through the skill + CLI path without MCP support. Do not
    // auto-install or mutate user/global MCP config; callers must pass an
    // explicit per-session MCP descriptor when a compatible agent supports it.
    mcpServers: servers.map((s) => {
      const rawEnv = s?.env;
      // Already a plain object — pass through in map mode, convert to
      // array in array mode (e.g. live-artifacts MCP from
      // buildLiveArtifactsMcpServersForAgent which already respects
      // acpMcpEnvFormat).
      const isPlainObject =
        rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv);
      if (wantsMap && isPlainObject) {
        return {
          type: typeof s?.type === 'string' ? s.type : 'stdio',
          name: typeof s?.name === 'string' ? s.name : '',
          command: typeof s?.command === 'string' ? s.command : '',
          args: Array.isArray(s?.args) ? s.args : [],
          env: rawEnv,
        };
      }
      const envArr = Array.isArray(rawEnv) ? rawEnv : [];
      const env = wantsMap
        ? Object.fromEntries(envArr.map((e: any) => [e?.name ?? '', e?.value ?? '']))
        : isPlainObject
          ? Object.entries(rawEnv as Record<string, string>).map(
              ([name, value]) => ({ name, value }),
            )
          : envArr;
      return {
        type: typeof s?.type === 'string' ? s.type : 'stdio',
        name: typeof s?.name === 'string' ? s.name : '',
        command: typeof s?.command === 'string' ? s.command : '',
        args: Array.isArray(s?.args) ? s.args : [],
        env,
      };
    }),
  };
}

/**
 * Builds the params for ACP `session/load`. The current ACP SDK requires the
 * same cwd and MCP descriptors as `session/new`; forwarding only the session id
 * leaves strict agents such as Kilo with an invalid-params error.
 */
export function buildAcpSessionLoadParams(
  sessionId: string,
  cwd: string,
  options: AcpSessionOptions = {},
) {
  return {
    sessionId,
    ...buildAcpSessionNewParams(cwd, options),
  };
}

export type AcpResourceMimePolicy = 'generic-image' | 'kilo';

export interface AcpPromptBlockOptions {
  imagePathFormat?: 'path' | 'file-url';
  /**
   * MIME lookup used when `imagePathFormat` is `file-url`. `generic-image`
   * labels common image extensions (including AVIF/SVG). `kilo` is the
   * measured @kilocode/cli 7.4.23 decoder: PNG/GIF/JPEG/WebP plus PDF as a
   * binary resource. Unsupported Kilo files are omitted so they are not
   * rewritten as `text/plain`.
   */
  resourceMimePolicy?: AcpResourceMimePolicy;
}

/**
 * Formats Kilo's ACP `resource_link` adapter accepts with a real MIME type.
 * Kilo 7.4.23 decodes PNG/GIF/JPEG/WebP images and reads PDF as binary;
 * AVIF/SVG/BMP and other binaries become `text/plain` when mimeType is
 * omitted, so they must not be advertised as images.
 */
export const KILO_ACP_RESOURCE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
} as const;

const GENERIC_IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export function acpResourceMimeType(
  resourcePath: string,
  policy: AcpResourceMimePolicy = 'generic-image',
): string | undefined {
  const ext = path.extname(resourcePath).toLowerCase();
  if (policy === 'kilo') {
    return KILO_ACP_RESOURCE_MIME_BY_EXT[ext as keyof typeof KILO_ACP_RESOURCE_MIME_BY_EXT];
  }
  return GENERIC_IMAGE_MIME_BY_EXT[ext];
}

export function isKiloAcpResourceSupported(resourcePath: string): boolean {
  return acpResourceMimeType(resourcePath, 'kilo') !== undefined;
}

export function isKiloAcpImageResource(resourcePath: string): boolean {
  const mimeType = acpResourceMimeType(resourcePath, 'kilo');
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

/**
 * Assembles the `prompt` array for a `session/prompt` ACP call. Always
 * includes a leading `{ type: 'text', text: prompt }` block, followed by
 * one `{ type: 'resource_link', uri: resourcePath }` block per non-empty
 * attachment path. Empty and non-string paths are skipped. Duplicate paths
 * retain their caller-provided order for ordinary ACP compatibility.
 *
 * @param prompt - The text prompt to send as the first block.
 * @param resourcePaths - Optional file/image attachment paths to append.
 * @param options - Selects whether local attachment paths remain legacy raw
 * paths or become standard file URLs. Strict ACP agents such as Kilo treat a
 * bare path as text, so `file-url` is required for those runtimes.
 * @returns An array of prompt blocks ready for inclusion in `session/prompt` params.
 */
export function buildPromptBlocks(
  prompt: string,
  resourcePaths: string[],
  {
    imagePathFormat = 'path',
    resourceMimePolicy = 'generic-image',
  }: AcpPromptBlockOptions = {},
): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = [{ type: 'text', text: prompt }];
  for (const resourcePath of resourcePaths) {
    if (typeof resourcePath !== 'string' || resourcePath.trim().length === 0) continue;
    const mimeType = imagePathFormat === 'file-url'
      ? acpResourceMimeType(resourcePath, resourceMimePolicy)
      : undefined;
    // Kilo rewrites a resource_link without mimeType to text/plain. Skip
    // unsupported binaries rather than send a link the decoder will mishandle.
    if (imagePathFormat === 'file-url' && resourceMimePolicy === 'kilo' && !mimeType) {
      continue;
    }
    blocks.push({
      type: 'resource_link',
      uri: imagePathFormat === 'file-url'
        ? pathToFileURL(path.resolve(resourcePath)).href
        : resourcePath,
      ...(mimeType ? { mimeType } : {}),
    });
  }
  return blocks;
}
