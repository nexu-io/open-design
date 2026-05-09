// External MCP server configuration storage + spawn-time wiring.
//
// Open Design acts as an MCP CLIENT to one or more external MCP servers
// (Higgsfield openclaw, GitHub, filesystem, anything the user configures).
// At spawn time we hand those servers to whichever agent is being launched
// (Claude Code via a project-cwd `.mcp.json`, ACP agents via the existing
// `mcpServers` parameter) so the agent surfaces their tools to the model.
//
// Storage: <dataDir>/mcp-config.json with shape `{ servers: [...] }`. The
// dataDir resolution mirrors app-config.ts so OD_DATA_DIR / packaged daemon
// runtime layouts route this file alongside the rest of the runtime state.
//
// We deliberately keep the schema close to Claude Code's `.mcp.json` and
// Cursor's MCP config — those are the de-facto interchange formats — so
// users can copy-paste between Open Design and other tools without
// translation.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// Wire-level MCP types. Mirrors `packages/contracts/src/api/mcp.ts` — the
// daemon and web import-from-contracts side both round-trip the same JSON
// shape, but NodeNext + the contracts package's mixed bundler-emit setup
// would force a `./api/mcp` subpath export here. Keeping the canonical
// definitions in `contracts` (consumed by the web app) and re-stating the
// minimal mirror in the daemon keeps the existing module-resolution shape
// for the rest of the codebase intact. Both sides MUST stay in sync.
export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  id: string;
  label?: string;
  templateId?: string;
  transport: McpTransport;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpConfig {
  servers: McpServerConfig[];
}

export interface McpTemplateField {
  key: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  secret?: boolean;
}

// Mirrors `McpTemplateCategory` in `packages/contracts/src/api/mcp.ts`.
// Stable string union; both sides MUST stay in sync (the web UI uses this
// to group + order entries in the picker).
export type McpTemplateCategory =
  | 'image-generation'
  | 'image-editing'
  | 'web-capture'
  | 'design-systems'
  | 'ui-components'
  | 'data-viz'
  | 'publishing'
  | 'utilities';

export interface McpTemplate {
  id: string;
  label: string;
  description: string;
  transport: McpTransport;
  category: McpTemplateCategory;
  homepage?: string;
  // One-liner prompt shown in the UI so the user has a concrete starting
  // example for each preset. Mirrors the field in `packages/contracts`.
  example?: string;
  command?: string;
  args?: string[];
  envFields?: McpTemplateField[];
  url?: string;
  headerFields?: McpTemplateField[];
}

const VALID_TRANSPORTS: ReadonlySet<McpTransport> = new Set([
  'stdio',
  'sse',
  'http',
]);

// Slug rule for server ids. The id flows into agent-facing config files
// (Claude Code's `mcpServers` map keys, ACP `name`) and in some cases into
// argv / env, so we keep it strictly alphanumeric + `-` / `_`.
const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function configFile(dataDir: string): string {
  return path.join(dataDir, 'mcp-config.json');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeStringMap(raw: unknown): Record<string, string> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (typeof k !== 'string' || !k.trim()) continue;
    if (typeof v !== 'string') continue;
    // Drop empty / whitespace-only values. Persisting them is worse than
    // omitting them: the spawn-time merge treats a present header as
    // "user pinned this", which would block our daemon-issued OAuth
    // Bearer from being injected. The UI also has placeholder fields
    // (e.g. an "Authorization=" template row) the user can leave blank
    // — those should never make it into the saved config.
    if (v.trim() === '') continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((v): v is string => typeof v === 'string');
  return out.length > 0 ? out : undefined;
}

/**
 * Validate a single user-supplied entry. Drops invalid fields so a typo in
 * one server doesn't tank the whole config. Returns null when the entry is
 * unsalvageable (no id, or no transport-required fields).
 */
export function sanitizeMcpServer(raw: unknown): McpServerConfig | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!SERVER_ID_PATTERN.test(id)) return null;
  const transport = typeof raw.transport === 'string' ? (raw.transport as McpTransport) : 'stdio';
  if (!VALID_TRANSPORTS.has(transport)) return null;

  const next: McpServerConfig = {
    id,
    transport,
    enabled: raw.enabled !== false,
  };
  if (typeof raw.label === 'string' && raw.label.trim()) {
    next.label = raw.label.trim();
  }
  if (typeof raw.templateId === 'string' && raw.templateId.trim()) {
    next.templateId = raw.templateId.trim();
  }

  if (transport === 'stdio') {
    if (typeof raw.command !== 'string' || !raw.command.trim()) return null;
    next.command = raw.command.trim();
    const args = sanitizeStringArray(raw.args);
    if (args) next.args = args;
    const env = sanitizeStringMap(raw.env);
    if (env) next.env = env;
  } else {
    if (typeof raw.url !== 'string' || !raw.url.trim()) return null;
    // Reject anything that isn't an http(s) URL — protects against accidental
    // `file://` / `javascript:` slipping into a config file.
    let parsed: URL;
    try {
      parsed = new URL(raw.url.trim());
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    next.url = parsed.toString();
    const headers = sanitizeStringMap(raw.headers);
    if (headers) next.headers = headers;
  }
  return next;
}

export function sanitizeMcpConfig(raw: unknown): McpConfig {
  if (!isPlainObject(raw)) return { servers: [] };
  const list = Array.isArray(raw.servers) ? raw.servers : [];
  const seen = new Set<string>();
  const out: McpServerConfig[] = [];
  for (const entry of list) {
    const ok = sanitizeMcpServer(entry);
    if (!ok) continue;
    if (seen.has(ok.id)) continue; // de-dupe by id
    seen.add(ok.id);
    out.push(ok);
  }
  return { servers: out };
}

export async function readMcpConfig(dataDir: string): Promise<McpConfig> {
  try {
    const raw = await readFile(configFile(dataDir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return sanitizeMcpConfig(parsed);
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return { servers: [] };
    if (e.name === 'SyntaxError') {
      console.error('[mcp-config] Corrupted JSON, returning empty:', e.message);
      return { servers: [] };
    }
    throw err;
  }
}

const writeLocks = new Map<string, Promise<unknown>>();

export async function writeMcpConfig(
  dataDir: string,
  body: unknown,
): Promise<McpConfig> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(() => doWrite(dataDir, body));
  writeLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

async function doWrite(dataDir: string, body: unknown): Promise<McpConfig> {
  const next = sanitizeMcpConfig(body);
  const file = configFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  return next;
}

// ───────────────────────────────────────────────────────────────────────
// Spawn-time wiring helpers.
// ───────────────────────────────────────────────────────────────────────

/**
 * True when `cwd` is a daemon-managed project directory under PROJECTS_DIR
 * (= safe to write `.mcp.json` into without risk of clobbering a user-owned
 * file). Git-linked projects whose cwd points at the user's own repo, and
 * the no-project fallback that resolves to PROJECT_ROOT, both return false
 * — the daemon must NOT write external-MCP config into either of those.
 */
export function isManagedProjectCwd(
  cwd: string | null | undefined,
  projectsDir: string,
): boolean {
  if (!cwd || typeof cwd !== 'string') return false;
  if (typeof projectsDir !== 'string' || projectsDir.length === 0) return false;
  if (cwd === projectsDir) return false; // PROJECTS_DIR root, not a project
  return cwd.startsWith(projectsDir + path.sep);
}

/**
 * Project-cwd `.mcp.json` shape that Claude Code auto-loads on spawn (the
 * same format Claude Desktop and Cursor use). Returns null when the user
 * has no enabled servers — in that case the caller should NOT write the
 * file (and should clean up any stale one).
 *
 * `tokens` is an optional map of `serverId -> bearer access token`, used
 * for HTTP/SSE servers that completed the daemon's web OAuth flow. When a
 * token is present we inject `Authorization: Bearer <token>` into the
 * server's headers — this is what bypasses the per-spawn `mcp-remote`
 * dance and lets Claude Code talk directly to the upstream MCP using
 * pre-authenticated credentials. User-supplied headers always win on
 * conflict so they can pin a specific token if they really want to.
 */
export function buildClaudeMcpJson(
  servers: McpServerConfig[],
  tokens: Record<string, string> = {},
): unknown | null {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const s of enabled) {
    if (s.transport === 'stdio') {
      const entry: Record<string, unknown> = { command: s.command };
      if (s.args && s.args.length > 0) entry.args = s.args;
      if (s.env && Object.keys(s.env).length > 0) entry.env = s.env;
      out[s.id] = entry;
    } else {
      const entry: Record<string, unknown> = {
        type: s.transport, // 'sse' | 'http'
        url: s.url,
      };
      const headers = mergeAuthHeader(s.headers, tokens[s.id]);
      if (headers && Object.keys(headers).length > 0) entry.headers = headers;
      out[s.id] = entry;
    }
  }
  return { mcpServers: out };
}

/** Build a headers object that includes the daemon-issued bearer token when
 * the user hasn't already supplied a NON-EMPTY Authorization header. A
 * blank Authorization (empty string / whitespace only) is treated as
 * "not pinned" — historically the template UI persisted empty values from
 * unfilled fields, and we never want a blank Authorization to suppress a
 * valid OAuth Bearer (the upstream MCP would refuse the connection and
 * fall back to its in-tool re-auth dance). Real user-pinned values still
 * win so manually-set PATs aren't silently overwritten. */
function mergeAuthHeader(
  existing: Record<string, string> | undefined,
  bearer: string | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  let userAuth: string | null = null;
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (k.toLowerCase() === 'authorization') {
      if (typeof v === 'string' && v.trim() !== '') {
        userAuth = v;
        merged[k] = v;
      }
      // empty / whitespace authorization is ignored, NOT carried through
      continue;
    }
    merged[k] = v;
  }
  if (bearer && !userAuth) {
    merged['Authorization'] = `Bearer ${bearer}`;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Convert user-configured external MCP servers into the ACP `mcpServers`
 * shape that Hermes/Kimi accept (already in use by buildLiveArtifactsMcpServersForAgent).
 * SSE/HTTP servers are dropped — ACP currently models stdio only — but we
 * surface a warning so the UI can hint at it.
 */
export interface AcpMcpServer {
  type: 'stdio';
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export function buildAcpMcpServers(servers: McpServerConfig[]): AcpMcpServer[] {
  const enabled = servers.filter((s) => s.enabled && s.transport === 'stdio');
  const out: AcpMcpServer[] = [];
  for (const s of enabled) {
    const envEntries: Array<{ name: string; value: string }> = [];
    if (s.env) {
      for (const [name, value] of Object.entries(s.env)) {
        if (typeof value !== 'string') continue;
        envEntries.push({ name, value });
      }
    }
    out.push({
      type: 'stdio',
      name: s.id,
      command: s.command ?? '',
      args: Array.isArray(s.args) ? [...s.args] : [],
      env: envEntries,
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Built-in templates surfaced in the Settings "Add MCP server" picker.
// Picking one fills the form with defaults; the resulting McpServerConfig
// flows through the same persistence path as a fully-custom entry.
// ───────────────────────────────────────────────────────────────────────

export const MCP_TEMPLATES: McpTemplate[] = [
  // ── image-generation ────────────────────────────────────────────────
  {
    id: 'higgsfield-openclaw',
    label: 'Higgsfield (OpenClaw)',
    description:
      'Image and video generation MCP from higgsfield.ai. Exposes Soul, Nano Banana, Flux, Kling, Veo, Seedance, and 25+ other models. Endpoint is streamable HTTP at /mcp; click "Connect" after saving — Open Design completes OAuth and stores the token server-side, so no terminal step is needed and the connection survives across chat turns and cloud deployments.',
    transport: 'http',
    category: 'image-generation',
    homepage: 'https://higgsfield.ai/mcp?tab=openclaw',
    example:
      'Generate an image of a cat astronaut on Mars in retro pixel-art style.',
    url: 'https://mcp.higgsfield.ai/mcp',
    headerFields: [
      {
        key: 'Authorization',
        label: 'Authorization (override)',
        placeholder: 'Bearer <token>  ← only set this if you want to pin a manual token',
        secret: true,
      },
    ],
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    description:
      'Free / freemium multimodal generation: images (Flux, GPT Image, Nano Banana, Seedream…), videos (Veo, Seedance, WAN, Grok Video…), text and 35+ TTS voices. Complements Higgsfield by giving the agent a no-cost fallback path and access to text + audio outputs. A publishable key (pk_*) at enter.pollinations.ai unlocks higher rate limits — leave POLLINATIONS_API_KEY empty for the anonymous tier.',
    transport: 'stdio',
    category: 'image-generation',
    homepage: 'https://github.com/pollinations/pollinations/tree/main/packages/mcp',
    example:
      'Generate a photorealistic image of a moss-covered stone statue at golden hour using the flux model.',
    command: 'npx',
    args: ['-y', '@pollinations_ai/mcp'],
    envFields: [
      {
        key: 'POLLINATIONS_API_KEY',
        label: 'API key (optional)',
        placeholder: 'pk_… or sk_…',
        secret: true,
      },
    ],
  },
  {
    id: 'allyson',
    label: 'Allyson (animated SVG)',
    description:
      'Turn a static image (PNG / JPG / SVG) into an animated SVG component using natural-language prompts. Fills the vector / motion gap that Higgsfield and other raster generators do not cover — the output is a TSX / SVG file the agent can drop directly into a design artifact. Get an API key at allyson.ai.',
    transport: 'stdio',
    category: 'image-generation',
    homepage: 'https://github.com/isaiahbjork/allyson-mcp',
    example:
      'Animate the SVG at /absolute/path/to/logo.svg so it pulses gently and save the result as /absolute/path/to/Logo.tsx.',
    command: 'npx',
    args: ['-y', 'allyson-mcp'],
    envFields: [
      {
        key: 'API_KEY',
        label: 'Allyson API key',
        required: true,
        placeholder: '<allyson-api-key>',
        secret: true,
      },
    ],
  },
  {
    id: 'bedrock-image',
    label: 'AWS Bedrock Image (Nova Canvas / SD 3.5)',
    description:
      'AWS Labs–blessed replacement for the deprecated Nova Canvas MCP. Wraps Amazon Nova Canvas + Stable Diffusion 3.5 with text-to-image, color-guided generation, image editing and upscaling — useful when you want brand-color enforcement (point it at a hex from your design-systems/<brand>/DESIGN.md). Requires the `uvx` Python launcher and AWS credentials with Bedrock + Nova access.',
    transport: 'stdio',
    category: 'image-generation',
    homepage: 'https://github.com/kalleeh/bedrock-image-mcp-server',
    example:
      'Generate a hero image of a modern workspace with the brand color #FF5722 as the dominant accent, 16:9 ratio.',
    command: 'uvx',
    args: ['bedrock-image-mcp-server@latest'],
    envFields: [
      {
        key: 'AWS_PROFILE',
        label: 'AWS profile',
        placeholder: 'default',
      },
      {
        key: 'AWS_REGION',
        label: 'AWS region (Bedrock-enabled)',
        placeholder: 'us-east-1',
      },
      {
        key: 'FASTMCP_LOG_LEVEL',
        label: 'Log level (optional)',
        placeholder: 'ERROR',
      },
    ],
  },
  {
    id: 'prompt-to-asset',
    label: 'Prompt-to-Asset (icons / favicons / OG / logos)',
    description:
      'Turn one brief into app icons, favicons, OG images, logos, splash screens, SVGs and full platform bundles (iOS AppIconSet, Android adaptive, PWA, visionOS). Routes across 30+ image models with **free-first ranking** — Cloudflare Workers AI / NVIDIA NIM / HF / Stable Horde / Pollinations and inline SVG fall first; paid providers are last-resort. No required API key for the inline-SVG and free-tier paths. Fills the brand-asset (icon / favicon / wordmark) lane Higgsfield + Pollinations leave open.',
    transport: 'stdio',
    category: 'image-generation',
    homepage: 'https://github.com/MohamedAbdallah-14/prompt-to-asset',
    example:
      'Make a transparent flat-vector logo for "Forge", a developer-tools brand, in warm orange — and fan it out to iOS / Android / PWA / favicon bundles.',
    command: 'npx',
    args: ['-y', 'prompt-to-asset'],
  },
  {
    id: 'nanobanana',
    label: 'Nano Banana (AceDataCloud)',
    description:
      'Hosted streamable-HTTP MCP wrapping Google Nano Banana for image generation, editing, virtual try-on and product placement. The endpoint is managed by AceDataCloud — no local install, just paste your platform API token as the Authorization header (acquire at platform.acedata.cloud). Complements Higgsfield by giving the agent virtual-try-on and "place product in scene" tools that the OpenClaw catalog does not expose directly.',
    transport: 'http',
    category: 'image-generation',
    homepage: 'https://github.com/AceDataCloud/MCPNanoBanana',
    example:
      'Place this product photo on a marble kitchen counter with morning light streaming in from the left.',
    url: 'https://nanobanana.mcp.acedata.cloud/mcp',
    headerFields: [
      {
        key: 'Authorization',
        label: 'Authorization (Bearer <AceDataCloud token>)',
        required: true,
        placeholder: 'Bearer <acedatacloud-api-token>',
        secret: true,
      },
    ],
  },
  {
    id: 'seedream',
    label: 'Seedream (AceDataCloud)',
    description:
      'Hosted streamable-HTTP MCP wrapping ByteDance Seedream v3 / v4 / v4.5 / v5 (text-to-image) and SeedEdit v3 (image-to-image). Strongest free-form Chinese-prompt support of any image model in the picker, plus reproducible-seed control on v3. Use this when Higgsfield / Nano Banana misses the aesthetic you want.',
    transport: 'http',
    category: 'image-generation',
    homepage: 'https://github.com/AceDataCloud/MCPSeedream',
    example:
      '生成一幅中国山水画，远山隐于云雾，松树点缀前景，水墨风格。',
    url: 'https://seedream.mcp.acedata.cloud/mcp',
    headerFields: [
      {
        key: 'Authorization',
        label: 'Authorization (Bearer <AceDataCloud token>)',
        required: true,
        placeholder: 'Bearer <acedatacloud-api-token>',
        secret: true,
      },
    ],
  },
  {
    id: 'fal-ai',
    label: 'fal.ai (600+ models)',
    description:
      'Catch-all MCP for the fal.ai model catalog: 600+ image / video / audio models including FLUX (schnell / dev / pro / ultra), SDXL, Stable Diffusion 3, Kling Video, Hunyuan, MusicGen, Whisper and more. Includes editing tools (background removal, upscaling, inpainting, smart resize for IG / TikTok / YouTube) — a single gateway to most of the open-source generation ecosystem. Requires the `uvx` Python launcher and a free fal.ai API key.',
    transport: 'stdio',
    category: 'image-generation',
    homepage: 'https://github.com/raveenb/fal-mcp-server',
    example:
      'Generate a 1024×1024 image of a misty Japanese garden using flux_dev, then upscale 2× and remove the background.',
    command: 'uvx',
    args: ['--from', 'fal-mcp-server', 'fal-mcp'],
    envFields: [
      {
        key: 'FAL_KEY',
        label: 'fal.ai API key',
        required: true,
        placeholder: '<fal-key>',
        secret: true,
      },
    ],
  },

  // ── image-editing ───────────────────────────────────────────────────
  {
    id: 'imagician',
    label: 'Imagician (image post-processing)',
    description:
      'Local sharp-based image editor: resize, crop, rotate, flip, format conversion (JPEG / PNG / WebP / AVIF), compression and batch operations. Pairs naturally with the generation MCPs above so the agent can polish a freshly rendered artifact before saving it under .od/artifacts/. No auth, no network — all operations run locally on absolute file paths.',
    transport: 'stdio',
    category: 'image-editing',
    homepage: 'https://github.com/flowy11/imagician',
    example:
      'Resize /absolute/path/to/banner.png to 1600px wide and convert it to WebP at quality 85.',
    command: 'npx',
    args: ['-y', '@flowy11/imagician'],
  },
  {
    id: 'imagesorcery',
    label: 'ImageSorcery (CV-based editing)',
    description:
      'OpenCV / Ultralytics-powered local image MCP. Goes beyond Imagician with object detection (YOLO), keypoint extraction, masking, OCR and shape-based crops. Useful when the agent needs to *understand* a reference image (find the logo, isolate a product) before editing or regenerating it. Runs entirely offline.',
    transport: 'stdio',
    category: 'image-editing',
    homepage: 'https://github.com/sunriseapps/imagesorcery-mcp',
    example:
      'Detect the main subject in /absolute/path/to/photo.jpg, crop it tightly, and save as /absolute/path/to/subject.png.',
    command: 'npx',
    args: ['-y', '@sunriseapps/imagesorcery-mcp'],
  },
  {
    id: 'photopea',
    label: 'Photopea (layered editor)',
    description:
      'Bridges your agent to Photopea (a free, browser-based Photoshop alternative) over a local WebSocket, exposing 34 layered-editor tools: documents, layers, text, shape, fill, gradient, selection, adjustment (brightness/contrast/curves/levels), filters (gaussian blur, sharpen, motion blur, noise), transform (scale/rotate/flip), and export to PNG/JPG/WebP/PSD/SVG. Closes the "PSD-style editing" gap that Imagician (raw pixels) and ImageSorcery (CV) leave open. **Note**: opens a Photopea browser tab automatically on first tool call.',
    transport: 'stdio',
    category: 'image-editing',
    homepage: 'https://github.com/attalla1/photopea-mcp-server',
    example:
      'Create a 1920×1080 dark-blue document, add the title "Hello World" in white 72px Arial, then export as PNG to ~/Desktop/poster.png.',
    command: 'npx',
    args: ['-y', 'photopea-mcp-server'],
  },
  {
    id: 'topaz-labs',
    label: 'Topaz Labs (AI upscale / denoise / sharpen)',
    description:
      'Official Topaz Labs MCP wrapping their AI image-enhancement pipeline: Standard V2 / Wonder 2 upscaling, Bloom denoising, Recover 3 detail restoration. Use this as the polish step *after* a generation MCP — fix soft hair, recover skin micro-texture, push a 1024² render to a print-ready 4K asset. Requires a Topaz Labs API key from developer.topazlabs.com.',
    transport: 'stdio',
    category: 'image-editing',
    homepage: 'https://github.com/TopazLabs/topaz-mcp',
    example:
      'Upscale /absolute/path/to/portrait.png 4× with Standard V2 and apply Bloom denoise at medium strength, then save as portrait-4k.png.',
    command: 'npx',
    args: ['-y', '@topazlabs/mcp'],
    envFields: [
      {
        key: 'TOPAZ_API_KEY',
        label: 'Topaz Labs API key',
        required: true,
        placeholder: '<topaz-api-key>',
        secret: true,
      },
    ],
  },
  {
    id: 'transloadit',
    label: 'Transloadit (media pipelines)',
    description:
      '86+ "Robots" for industrial media processing: smart_crop, watermarking, OCR, format transcoding (image / video / audio), face detection, document conversion, AI tagging — composable into multi-step pipelines ("Assemblies"). Pairs naturally with Imagician / ImageSorcery for the heavier "build a real production pipeline" workflows. Needs a free Transloadit account.',
    transport: 'stdio',
    category: 'image-editing',
    homepage: 'https://github.com/transloadit/node-sdk/tree/main/packages/mcp-server',
    example:
      'Smart-crop /absolute/path/to/hero.jpg to a 1:1 square focused on the subject, watermark it with /absolute/path/to/logo.png, and export as a 90-quality WebP.',
    command: 'npx',
    args: ['-y', '@transloadit/mcp-server', 'stdio'],
    envFields: [
      {
        key: 'TRANSLOADIT_KEY',
        label: 'Transloadit auth key',
        required: true,
        placeholder: '<transloadit-key>',
        secret: true,
      },
      {
        key: 'TRANSLOADIT_SECRET',
        label: 'Transloadit auth secret',
        required: true,
        placeholder: '<transloadit-secret>',
        secret: true,
      },
    ],
  },

  // ── web-capture ─────────────────────────────────────────────────────
  {
    id: 'screenshot-website-fast',
    label: 'Screenshot Website (fast)',
    description:
      'Capture full-page or viewport screenshots of any URL using Puppeteer, automatically tiled into 1072×1072 chunks tuned for Claude / GPT Vision. Closes the loop for design work: the agent can render an HTML artifact, screenshot it, and visually verify the result against the brief. No auth required.',
    transport: 'stdio',
    category: 'web-capture',
    homepage: 'https://github.com/just-every/mcp-screenshot-website-fast',
    example:
      'Take a full-page screenshot of https://stripe.com and describe the hero section layout, typography and color palette.',
    command: 'npx',
    args: ['-y', '@just-every/mcp-screenshot-website-fast'],
  },
  {
    id: 'screenshotone',
    label: 'ScreenshotOne (managed)',
    description:
      'Hosted screenshot rendering API with device emulation, ad-blocking, scroll-to-element and dark-mode support. Use this instead of the puppeteer-based fast variant when you need pixel-perfect cross-browser captures or want to offload the headless Chrome cost. Get an API key at dash.screenshotone.com.',
    transport: 'stdio',
    category: 'web-capture',
    homepage: 'https://github.com/screenshotone/mcp',
    example:
      'Capture a 1440×900 light-mode screenshot of https://linear.app, ad-blocked, and save the URL of the result.',
    command: 'npx',
    args: ['-y', '@screenshotone/mcp'],
    envFields: [
      {
        key: 'SCREENSHOTONE_API_KEY',
        label: 'ScreenshotOne API key',
        required: true,
        placeholder: '<screenshotone-api-key>',
        secret: true,
      },
    ],
  },
  {
    id: 'pagecast',
    label: 'Pagecast (browser → demo GIF / MP4)',
    description:
      'Records the agent driving a real Chromium browser and exports a polished demo GIF / MP4 / WebM with auto-zoom on every interaction. Two effect modes: tooltip (magnified inset on each click) and cinematic (camera pans between targets). Platform presets size for GitHub README, Twitter, Reels, TikTok. Closes the loop for "ship a demo of the artifact you just built". **Note**: needs Node ≥20 and `ffmpeg`; first run downloads Chromium via `npx playwright install`.',
    transport: 'stdio',
    category: 'web-capture',
    homepage: 'https://github.com/mcpware/pagecast',
    example:
      'Record a demo of localhost:3000 walking through the sign-up flow, then export it as a 1280×720 GIF for the GitHub README.',
    command: 'npx',
    args: ['-y', '@mcpware/pagecast'],
  },

  // ── design-systems ──────────────────────────────────────────────────
  {
    id: 'figma-context',
    label: 'Figma Context (read designs → code)',
    description:
      'Framelink MCP for Figma — paste a Figma file / frame / group URL into chat and the agent gets back simplified Figma metadata (layout, typography, colors, components) tailored for code generation. The "designs → code" workhorse: way more accurate than feeding screenshots back to the model. Get a Figma personal access token at help.figma.com → Manage personal access tokens.',
    transport: 'stdio',
    category: 'design-systems',
    homepage: 'https://github.com/GLips/Figma-Context-MCP',
    example:
      'Look at this Figma frame: https://figma.com/file/<file>/<name>?node-id=<n> — implement it as a Tailwind + React component.',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp', '--stdio'],
    envFields: [
      {
        key: 'FIGMA_API_KEY',
        label: 'Figma personal access token',
        required: true,
        placeholder: 'figd_…',
        secret: true,
      },
    ],
  },
  {
    id: 'design-token-bridge',
    label: 'Design Token Bridge',
    description:
      'Translates design tokens between Tailwind, plain CSS variables, Figma Variables and W3C DTCG JSON, then generates native themes for Material 3 (Kotlin), SwiftUI (with optional Liquid Glass), Tailwind config and CSS variables. Includes a `validate_contrast` tool for WCAG AA / AAA pass-fail checks. Use this when a brand sits in `design-systems/<brand>/DESIGN.md` and you want the agent to materialize it across web / iOS / Android consistently.',
    transport: 'stdio',
    category: 'design-systems',
    homepage: 'https://github.com/kenneives/design-token-bridge-mcp',
    example:
      'Extract tokens from this tailwind.config.js and emit a Material 3 Kotlin theme + SwiftUI Color extensions + CSS variables block.',
    command: 'npx',
    args: ['-y', 'design-token-bridge-mcp'],
  },
  {
    id: 'design-system-extractor',
    label: 'Design System Extractor (Storybook)',
    description:
      'Connects to a running Storybook instance and extracts component HTML, variants, computed styles, theme tokens and dependency graphs. Perfect when an existing app already has a design system in Storybook — point this at it and the agent stops guessing component APIs. Defaults to `http://localhost:6006`; override with STORYBOOK_URL.',
    transport: 'stdio',
    category: 'design-systems',
    homepage: 'https://github.com/freema/mcp-design-system-extractor',
    example:
      'List all button variants in our Storybook, then extract the HTML for the primary disabled state.',
    command: 'npx',
    args: ['-y', 'mcp-design-system-extractor@latest'],
    envFields: [
      {
        key: 'STORYBOOK_URL',
        label: 'Storybook URL',
        placeholder: 'http://localhost:6006',
      },
      {
        key: 'NODE_TLS_REJECT_UNAUTHORIZED',
        label: 'Skip TLS check (only for self-signed Storybook)',
        placeholder: '0',
      },
    ],
  },
  {
    id: 'figma-use',
    label: 'figma-use (write designs from chat)',
    description:
      'Companion to Figma-Context: where Framelink reads, figma-use *writes* — 90+ tools to create frames, text, components, variants, set layouts, render JSX into the canvas, export PNG/SVG, query nodes via XPath, lint for WCAG / auto-layout / hardcoded colors, and analyze design systems. Runs as a local HTTP MCP server on port 38451; no API key. Two prerequisites the user owns: (1) start Figma with remote debugging — macOS: `open -a Figma --args --remote-debugging-port=9222` (Figma 126+ needs `figma-use daemon start --pipe` instead), and (2) leave `npx figma-use mcp serve` running in a terminal. Then this template wires the daemon to that endpoint.',
    transport: 'http',
    category: 'design-systems',
    homepage: 'https://github.com/dannote/figma-use',
    example:
      'Render this JSX into the Figma file at (100, 200): <Frame style={{p: 24, bg: "#3B82F6", rounded: 12}}><Text style={{size: 18, color: "#FFF"}}>Hello</Text></Frame>',
    url: 'http://localhost:38451/mcp',
  },
  {
    id: 'aesthetics-wiki',
    label: 'Aesthetics Wiki (moodboard / inspiration)',
    description:
      'Read-only access to the Aesthetics Wiki (cottagecore, dark academia, y2k, goblincore, brutalism, vaporwave… thousands more) — search styles, fetch summaries + main image, list related aesthetics, pull image galleries for a moodboard, or grab a random aesthetic to break creative block. No API key required. Requires the `uvx` Python launcher.',
    transport: 'stdio',
    category: 'design-systems',
    homepage: 'https://github.com/leonardoca1/aesthetics-wiki-mcp',
    example:
      'Find aesthetics related to "dark academia", show me a moodboard of 12 reference images, and list 5 adjacent styles to consider.',
    command: 'uvx',
    args: ['aesthetics-wiki-mcp'],
  },

  // ── ui-components ───────────────────────────────────────────────────
  {
    id: '21st-dev-magic',
    label: '21st.dev Magic (UI components)',
    description:
      'Generates polished, designer-grade UI components from natural-language prompts using the 21st.dev component library. Strongest match for the "good-looking craft" lane — feed it a brief and it returns React/TSX you can paste into an artifact. The API key is passed as a positional argument; replace `__YOUR_API_KEY__` in the Args field after saving (get one at 21st.dev/magic/console).',
    transport: 'stdio',
    category: 'ui-components',
    homepage: 'https://github.com/21st-dev/magic-mcp',
    example:
      'Generate a pricing table component with three tiers (Free / Pro / Team) in a clean modern style.',
    command: 'npx',
    args: ['-y', '@21st-dev/magic@latest', 'API_KEY=__YOUR_API_KEY__'],
  },
  {
    id: 'shadcn-ui',
    label: 'shadcn/ui',
    description:
      'Direct access to shadcn/ui component source, demos, blocks and metadata across React, Svelte, Vue and React Native. Lets the agent install, copy and adapt components instead of guessing the API. Adding a GitHub PAT via `--github-api-key` raises the upstream rate limit from 60 → 5000 requests/hour — edit the Args field after saving to inject yours.',
    transport: 'stdio',
    category: 'ui-components',
    homepage: 'https://github.com/Jpisnice/shadcn-ui-mcp-server',
    example:
      'Show me the source of the shadcn DataTable block and adapt it to use my own User type.',
    command: 'npx',
    args: ['-y', '@jpisnice/shadcn-ui-mcp-server'],
  },
  {
    id: 'flyonui',
    label: 'FlyonUI (blocks & landing pages)',
    description:
      'TailwindCSS-native UI blocks and full landing-page templates from FlyonUI. Pairs nicely with shadcn/ui when the agent needs marketing-page chrome (heros, feature grids, pricing) instead of single components. No auth required.',
    transport: 'stdio',
    category: 'ui-components',
    homepage: 'https://github.com/themeselection/flyonui-mcp',
    example:
      'Generate a Tailwind landing page with a centered hero, a 3-column features section and a CTA strip.',
    command: 'npx',
    args: ['-y', 'flyonui-mcp'],
  },

  // ── data-viz ────────────────────────────────────────────────────────
  {
    id: 'antv-chart',
    label: 'AntV Chart',
    description:
      'AntV-powered chart generator covering 26+ chart types: bar, line, pie, area, dual-axes, sankey, treemap, word cloud, district / pin / path maps, fishbone diagrams and more. Use whenever a design artifact needs a real chart instead of a sketched placeholder.',
    transport: 'stdio',
    category: 'data-viz',
    homepage: 'https://github.com/antvis/mcp-server-chart',
    example:
      'Plot monthly active users for the last 12 months as a smooth line chart with markers.',
    command: 'npx',
    args: ['-y', '@antv/mcp-server-chart'],
  },
  {
    id: 'mermaid',
    label: 'Mermaid diagrams',
    description:
      'Render Mermaid (flowchart, sequence, class, state, gantt, ER…) diagrams to PNG / SVG via Puppeteer. Natural extension of the markdown rendering in chat — gives the agent a way to materialize architecture / process diagrams as proper image artifacts.',
    transport: 'stdio',
    category: 'data-viz',
    homepage: 'https://github.com/peng-shawn/mermaid-mcp-server',
    example:
      'Render a sequence diagram of: user → web → daemon → SQLite for the "save artifact" flow.',
    command: 'npx',
    args: ['-y', '@peng-shawn/mermaid-mcp-server'],
  },
  {
    id: 'mcp-dashboards',
    label: 'MCP Dashboards (45+ chart types)',
    description:
      'Renders 45+ interactive chart types as HTML directly in chat: bar, line, pie, candlestick, sankey, geo maps, radar, funnel, treemap and more — plus full KPI dashboards with drill-down, live API polling, 20 themes, and export to PNG / PPT / A4. Goes wider than AntV for "dashboard"-shaped artifacts; use it when a static chart is not enough.',
    transport: 'stdio',
    category: 'data-viz',
    homepage: 'https://github.com/KyuRish/mcp-dashboards',
    example:
      'Build a 4-card KPI dashboard with monthly revenue, churn, MAU, and a sankey of acquisition funnels — export it as PNG.',
    command: 'npx',
    args: ['-y', 'mcp-dashboards', '--stdio'],
  },
  {
    id: 'excalidraw-architect',
    label: 'Excalidraw Architect (hand-drawn diagrams)',
    description:
      'Hand-drawn-style architecture diagrams via Excalidraw + a Sugiyama auto-layout engine — no overlapping boxes, no tangled arrows. Built-in styling for 50+ technologies (Kafka, Postgres, Redis, S3, Lambda, K8s…). Iterate with natural language ("add a cache in front of the DB"), then export to SVG / PNG. Different aesthetic from Mermaid: warmer, less "generated". Requires the `uvx` Python launcher.',
    transport: 'stdio',
    category: 'data-viz',
    homepage: 'https://github.com/BV-Venky/excalidraw-architect-mcp',
    example:
      'Create a high-level diagram of a microservices e-commerce backend: API Gateway, Auth, Users, Orders, Postgres, Redis, Kafka.',
    command: 'uvx',
    args: ['excalidraw-architect-mcp'],
  },

  // ── publishing ──────────────────────────────────────────────────────
  {
    id: 'edgeone-pages',
    label: 'EdgeOne Pages (publish HTML)',
    description:
      'Deploy raw HTML to Tencent EdgeOne Pages and get back a public URL. Lets the agent ship a generated landing page or design preview as a shareable link in one tool call — no account or token needed for the basic deploy_html flow. Provide an EDGEONE_PAGES_API_TOKEN if you want deploy_folder / project-update tools as well.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://github.com/TencentEdgeOne/edgeone-pages-mcp',
    example:
      'Deploy this HTML page to EdgeOne Pages and reply with the public URL.',
    command: 'npx',
    args: ['-y', 'edgeone-pages-mcp@latest'],
    envFields: [
      {
        key: 'EDGEONE_PAGES_API_TOKEN',
        label: 'API token (optional, enables folder deploys)',
        placeholder: 'EdgeOne Pages API token',
        secret: true,
      },
      {
        key: 'EDGEONE_PAGES_PROJECT_NAME',
        label: 'Project name (optional, updates an existing project)',
        placeholder: 'my-existing-project',
      },
    ],
  },
  {
    id: 'pagedrop',
    label: 'PageDrop (instant HTML hosting)',
    description:
      'Deploy raw HTML, Markdown, PDF or a ZIP archive to a permanent public URL — no signup, no key, no account. Complements EdgeOne Pages for users who want a true zero-friction publish path. Optional password protection, custom slug, OG tags and TTL.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://pagedrop.dev/',
    example:
      'Deploy this HTML to PageDrop with the slug "demo-2026" and reply with the public URL.',
    command: 'npx',
    args: ['-y', 'pagedrop-mcp'],
  },
  {
    id: 'pdfspark',
    label: 'PDFSpark (HTML / URL → PDF)',
    description:
      'Free HTML-to-PDF and URL-to-PDF conversion via Playwright — no signup, no key. Supports merging, splitting, page formatting (A4 / Letter / margins / orientation), watermarks, headers, footers, AES-256 encryption and metadata. Pairs naturally with the publishing flow when the agent needs a downloadable PDF version of a generated page.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://pdfspark.dev/',
    example:
      'Convert https://example.com/blog-post to an A4 PDF with 18mm margins and add a "DRAFT" watermark.',
    command: 'npx',
    args: ['-y', 'pdfspark-api'],
  },
  {
    id: 'ogforge',
    label: 'OGForge (Open Graph image generator)',
    description:
      'Free, no-signup MCP for generating Open Graph / share-card images. 6 built-in themes (dark, light, gradient, cyberpunk, minimal, bold), all 1,668 Lucide icons, multiple output formats (PNG / WebP / JPEG / SVG), sizes from 200px to 2400px. The "share-preview image" lane in your publishing pipeline.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://ogforge.dev/',
    example:
      'Generate a 1200×630 dark-theme OG image titled "Open Design 1.0" with a subtitle "Design with agents", with a Lucide "sparkles" icon.',
    command: 'npx',
    args: ['-y', 'ogforge-api'],
  },
  {
    id: 'qrmint',
    label: 'QRMint (styled QR codes)',
    description:
      'Free, no-signup MCP for styled QR codes: custom colors, embedded logos, frames, batch generation. Drop on a poster, a slide, a print bundle, a packaging mockup — wherever a flat-black QR would look out of place.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://qrmcp.dev/',
    example:
      'Generate a brand-orange (#FF5722) QR code pointing to https://opendesign.app, with our logo at /absolute/path/to/logo.png embedded in the center.',
    command: 'npx',
    args: ['-y', 'qr-mcp'],
  },
  {
    id: 'slideshot',
    label: 'Slideshot (HTML → PDF / PNG / WebP / PPTX)',
    description:
      'Convert AI-generated HTML carousels into high-resolution PNG / WebP / PDF / PPTX. 7 built-in themes (generic, branded, instagram-carousel, infographic, pitch-deck, dark-modern, editorial). Killer companion for "design a slide deck" or "build an Instagram carousel" workflows — and the rendered output is real Puppeteer pixels, not a screenshot.',
    transport: 'stdio',
    category: 'publishing',
    homepage: 'https://github.com/06ketan/slideshot',
    example:
      'Generate a 6-slide pitch-deck about "AI-native design tools" and render it as both PDF and 4× PNG.',
    command: 'npx',
    args: ['-y', 'slideshot-mcp'],
  },
  {
    id: 'deckrun',
    label: 'Deckrun (Markdown → PDF / video / audio)',
    description:
      'Hosted MCP that converts Deckrun Markdown into pixel-perfect branded PDFs, narrated MP4 videos, and MP3 audio from one source. The free tier exposes `get_slide_format` + `generate_slide_deck` (PDF) with no API key required and no signup — just connect and go. Add a paid `DECKRUN_API_KEY` later for video / audio generation, themes, voices and async jobs.',
    transport: 'http',
    category: 'publishing',
    homepage: 'https://agenticdecks.com',
    example:
      'Create a 6-slide deck about the future of edge computing as a branded PDF, then reply with the public URL.',
    url: 'https://deckrun-mcp-free.agenticdecks.com/mcp/',
    headerFields: [
      {
        key: 'Authorization',
        label: 'Authorization (override, e.g. paid tier Bearer token)',
        placeholder: 'Bearer dk_live_…  ← only needed for the paid tier',
        secret: true,
      },
    ],
  },

  // ── utilities ───────────────────────────────────────────────────────
  {
    id: 'filesystem',
    label: 'Filesystem',
    description:
      'Read, write and list files in a sandboxed directory. Useful for letting the agent operate on a folder outside your Open Design project.',
    transport: 'stdio',
    category: 'utilities',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    example:
      'List the markdown files under the allowed directory and tell me what each one is about.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '<allowed-dir>'],
  },
  {
    id: 'github',
    label: 'GitHub',
    description:
      'Read repos, issues, PRs and write back via the GitHub API. Requires a personal access token with the scopes you want the agent to use.',
    transport: 'stdio',
    category: 'utilities',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    example:
      'Show me the 5 most recent open issues labeled "bug" in modelcontextprotocol/servers.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envFields: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        required: true,
        placeholder: 'ghp_…',
        secret: true,
      },
    ],
  },
  {
    id: 'fetch',
    label: 'Fetch (HTTP)',
    description:
      'Lets the agent fetch arbitrary URLs and convert HTML to markdown. Read-only.',
    transport: 'stdio',
    category: 'utilities',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    example:
      'Fetch https://news.ycombinator.com and summarize the top front-page stories.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
  {
    id: 'a11y',
    label: 'A11y (Web accessibility / WCAG)',
    description:
      'Web accessibility testing via Deque axe-core + Puppeteer: test any URL or HTML snippet against WCAG 2.0 / 2.1 / 2.2 (A / AA / AAA), check color-contrast pairs, validate ARIA usage and detect orientation lock. Closes the craft loop — agent renders an artifact, captures it, runs an a11y check, then fixes what fails.',
    transport: 'stdio',
    category: 'utilities',
    homepage: 'https://github.com/ronantakizawa/a11ymcp',
    example:
      'Test https://stripe.com against WCAG 2.1 AA at a 1280×800 viewport and list every violation grouped by impact.',
    command: 'npx',
    args: ['-y', 'a11y-mcp-server'],
  },
];
