// Import a shadcn registry item as an Open Design design system.
//
// A shadcn registry item carries a `cssVars` theme (`theme` / `light` /
// `dark`) plus optional component `files`. That maps almost 1:1 onto an OD
// design system's `tokens.css`, so this importer reuses the existing local
// importer wholesale: it fetches the registry item, materializes its
// `cssVars` (and any inline/raw component files) into a temp directory, and
// hands that directory to `importLocalDesignSystemProject` with a
// `source: { type: 'shadcn', … }` override. The local importer already
// scans CSS custom properties, generates a schema-valid DESIGN.md +
// tokens.css + manifest.json, and copies component snippets — mirroring the
// GitHub importer's "clone → import local project" shape.
//
// Reference forms (matching the shadcn CLI `add` syntax):
//   - `<owner>/<repo>/<item>[#<branch|tag|sha>]` — resolved against the
//     repository's root `registry.json` on GitHub (following the `include`
//     layout if present).
//   - `https://…/<item>.json` — a direct registry-item document. A
//     `registry.json` index URL is also accepted when an item is selected
//     with a `#<item>` fragment.
//
// Network safety: every URL we contact is validated against an egress policy
// (see `assertFetchableUrl`) — `http://` is allowed only for loopback hosts,
// and private / link-local / non-routable IP literals are refused for both
// schemes. Redirects are disabled, every fetch is size- and time-bounded, and
// the whole import shares one overall request/time budget.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

import {
  LocalDesignSystemImportError,
  type LocalDesignSystemImportOptions,
  type LocalDesignSystemImportResult,
  importLocalDesignSystemProject,
} from './design-system-import.js';

const FETCH_TIMEOUT_MS = 15_000;
// Whole-import wall-clock ceiling, independent of the per-request timeout.
const OVERALL_TIMEOUT_MS = 60_000;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 100;
const MAX_INCLUDE_DEPTH = 4;
const MAX_INCLUDE_BREADTH = 100;
// Hard ceiling on total network requests across resolution + file fetches, so
// a hostile registry can't fan out into thousands of sequential fetches.
const MAX_TOTAL_FETCHES = 200;
// Tried in order when the shorthand omits an explicit ref. GitHub's raw host
// needs a concrete branch/tag/sha (it does not resolve a symbolic HEAD), and
// these two cover virtually every default branch.
const DEFAULT_GITHUB_REFS = ['main', 'master'] as const;
// Registry files are materialized under this subdirectory of the temp project
// so a hostile `files[].target` (e.g. "package.json") can never overwrite the
// importer-generated files at the temp root.
const SHADCN_FILES_SUBDIR = 'registry-files';

export type ShadcnFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
};

export type ShadcnFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<ShadcnFetchResponse>;

export type ShadcnDesignSystemImportOptions = Pick<
  LocalDesignSystemImportOptions,
  'craftApplies' | 'importMode' | 'name' | 'now' | 'reservedIds'
> & {
  /** Injectable fetch for tests / self-hosted registries. Defaults to global fetch. */
  fetchImpl?: ShadcnFetch;
};

export type ParsedShadcnReference =
  | { kind: 'url'; url: string; item?: string }
  | { kind: 'github'; owner: string; repo: string; item: string; ref?: string };

type ShadcnCssVars = {
  theme?: Record<string, unknown>;
  light?: Record<string, unknown>;
  dark?: Record<string, unknown>;
};

type ShadcnRegistryFile = {
  path?: string;
  target?: string;
  type?: string;
  content?: string;
};

type ShadcnRegistryItem = {
  name?: string;
  type?: string;
  title?: string;
  description?: string;
  author?: string;
  homepage?: string;
  cssVars?: ShadcnCssVars;
  dependencies?: unknown;
  registryDependencies?: unknown;
  files?: ShadcnRegistryFile[];
};

type ShadcnRegistry = {
  name?: string;
  homepage?: string;
  items?: ShadcnRegistryItem[];
  /** Relative paths to nested registry.json files (shadcn `include` layout). */
  include?: unknown;
};

type RegistryItemMatch = {
  item: ShadcnRegistryItem;
  /** URL of the registry.json that actually declared the item. */
  declaringUrl: string;
  homepage?: string;
};

type ResolvedShadcnItem = {
  item: ShadcnRegistryItem;
  /** The registry entry-point URL that was fetched (registry.json or item.json). */
  registryUrl: string;
  homepage?: string;
  /**
   * Base URL for resolving the item's relative `files[].path`: the directory of
   * the registry.json (or item.json) that declared the item, so `include`d
   * items resolve their files relative to the included file, per the shadcn spec.
   */
  rawBaseUrl?: string;
};

export async function importShadcnDesignSystemProject(
  reference: string,
  tmpRoot: string,
  userDesignSystemsRoot: string,
  options: ShadcnDesignSystemImportOptions = {},
): Promise<LocalDesignSystemImportResult> {
  // One shared budget across every fetch this import makes (resolution +
  // include recursion + file fetches): a request count cap and a wall-clock
  // deadline, layered on top of the per-request timeout.
  const fetchImpl = withFetchBudget(options.fetchImpl ?? defaultShadcnFetch());
  const parsed = parseShadcnReference(reference);
  const importedAt = (options.now ?? new Date()).toISOString();
  const resolved = await resolveShadcnItem(parsed, fetchImpl);
  const item = resolved.item;

  const itemName = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined;
  const hasFiles = Array.isArray(item.files) && item.files.length > 0;
  if (!itemName && !item.cssVars && !hasFiles) {
    throw new LocalDesignSystemImportError(
      'BAD_REQUEST',
      'shadcn reference did not resolve to a usable registry item (no name, cssVars, or files)',
    );
  }

  const materializeRoot = path.join(tmpRoot, 'shadcn-design-system-imports');
  await mkdir(materializeRoot, { recursive: true });
  const tempDir = await mkdtemp(path.join(materializeRoot, 'item-'));

  try {
    await materializeShadcnItem(item, tempDir, resolved, fetchImpl);
    const fallbackName = cleanShadcnName(item.title ?? itemName ?? 'shadcn design system');
    return await importLocalDesignSystemProject(tempDir, userDesignSystemsRoot, {
      now: new Date(importedAt),
      fallbackName,
      ...(options.name ? { name: options.name } : {}),
      ...(options.reservedIds ? { reservedIds: options.reservedIds } : {}),
      ...(options.importMode ? { importMode: options.importMode } : {}),
      ...(options.craftApplies ? { craftApplies: options.craftApplies } : {}),
      source: {
        type: 'shadcn',
        reference,
        registryUrl: resolved.registryUrl,
        importedAt,
        ...(itemName ? { item: itemName } : {}),
        ...(resolved.homepage ? { homepage: resolved.homepage } : {}),
      },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------

export function parseShadcnReference(input: string): ParsedShadcnReference {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'a shadcn registry reference is required');
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw badReference('reference is not a valid URL');
    }
    assertFetchableUrl(url);
    let fragment = '';
    if (url.hash) {
      // decodeURIComponent throws URIError on malformed percent-encoding (e.g.
      // "#%E0%A4%A"); surface it as a 400, not an uncaught 500.
      try {
        fragment = decodeURIComponent(url.hash.replace(/^#/, '')).trim();
      } catch {
        throw badReference('reference fragment is not valid percent-encoding');
      }
    }
    const clean = `${url.origin}${url.pathname}${url.search}`;
    return { kind: 'url', url: clean, ...(fragment ? { item: fragment } : {}) };
  }

  // `<owner>/<repo>/<item>[#<ref>]`
  const hashIndex = trimmed.indexOf('#');
  const pathPart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const refPart = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length !== 3) {
    throw badReference(
      'reference must be "<owner>/<repo>/<item>" or an https URL to a registry item',
    );
  }
  const [owner, repo, item] = segments as [string, string, string];
  for (const [label, segment] of [
    ['owner', owner],
    ['repo', repo],
    ['item', item],
  ] as const) {
    if (!isShadcnSegment(segment)) {
      throw badReference(`reference ${label} contains unsupported characters`);
    }
  }
  const ref = refPart.trim();
  if (ref && !isGitRef(ref)) {
    throw badReference('reference git ref contains unsupported characters');
  }
  return { kind: 'github', owner, repo, item, ...(ref ? { ref } : {}) };
}

// ---------------------------------------------------------------------------
// Egress policy (SSRF protection)
// ---------------------------------------------------------------------------

type HostClass = 'loopback' | 'blocked' | 'public';

// Allow loopback over http or https (self-hosted local registry / tests).
// Refuse private, link-local, ULA, and non-routable internal addresses for
// both schemes. Require https for any other (public) host.
function assertFetchableUrl(url: URL): void {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw badReference('only http(s) registry URLs are supported');
  }
  const hostClass = classifyHost(url.hostname);
  if (hostClass === 'blocked') {
    throw badReference(
      `refusing to fetch "${url.hostname}": private, loopback-internal, link-local, and other non-routable addresses are not allowed`,
    );
  }
  if (hostClass === 'loopback') return;
  if (protocol !== 'https:') {
    throw badReference(
      'only https:// is allowed for non-loopback registry hosts (http:// is allowed for localhost only)',
    );
  }
}

function classifyHost(rawHost: string): HostClass {
  let host = rawHost.trim().toLowerCase();
  if (!host) return 'blocked';
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  // Pure-decimal or hex hosts are obfuscated IP encodings, never real registry
  // hostnames — refuse them rather than let the resolver normalize a bypass.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return 'blocked';

  const kind = isIP(host);
  if (kind === 4) return classifyIpv4(host);
  if (kind === 6) return classifyIpv6(host);
  // A DNS hostname we can't classify statically. redirect:'error' plus the
  // IP-literal denials above cover the common SSRF vectors; closing DNS
  // rebinding fully would require socket-level IP pinning.
  return 'public';
}

function classifyIpv4(ip: string): HostClass {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return 'blocked';
  }
  const a = parts[0] as number;
  const b = parts[1] as number;
  if (a === 127) return 'loopback';
  if (a === 0) return 'blocked'; // 0.0.0.0/8 "this host"
  if (a === 10) return 'blocked'; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return 'blocked'; // 172.16.0.0/12
  if (a === 192 && b === 168) return 'blocked'; // 192.168.0.0/16
  if (a === 169 && b === 254) return 'blocked'; // 169.254.0.0/16 (incl. cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return 'blocked'; // 100.64.0.0/10 (CGNAT)
  return 'public';
}

function classifyIpv6(ip: string): HostClass {
  const host = ip.toLowerCase();
  if (host === '::1') return 'loopback';
  if (host === '::') return 'blocked'; // unspecified
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mapped && mapped[1]) return classifyIpv4(mapped[1]);
  const head = host.split(':')[0] ?? '';
  if (head.startsWith('fc') || head.startsWith('fd')) return 'blocked'; // fc00::/7 ULA
  if (/^fe[89ab]/.test(head)) return 'blocked'; // fe80::/10 link-local
  return 'public';
}

function isShadcnSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.');
}

function isGitRef(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes('..') && !value.startsWith('/');
}

// ---------------------------------------------------------------------------
// Resolution (network)
// ---------------------------------------------------------------------------

async function resolveShadcnItem(
  parsed: ParsedShadcnReference,
  fetchImpl: ShadcnFetch,
): Promise<ResolvedShadcnItem> {
  if (parsed.kind === 'url') {
    const doc = await fetchJsonDocument(parsed.url, fetchImpl);
    const registry = doc as ShadcnRegistry;
    const isIndex = Array.isArray(registry.items) || Array.isArray(registry.include);
    if (isIndex) {
      if (!parsed.item) {
        throw badReference('that URL is a registry index; append "#<item>" to choose an item');
      }
      const match = await locateItemInRegistry(parsed.url, parsed.item, fetchImpl, new Set(), 0);
      if (!match) {
        throw badReference(`registry has no item named "${parsed.item}"`);
      }
      return {
        item: match.item,
        registryUrl: parsed.url,
        rawBaseUrl: registryFileDir(match.declaringUrl),
        ...(match.homepage ? { homepage: match.homepage } : {}),
      };
    }
    const item = doc as ShadcnRegistryItem;
    if (!isUsableItem(item)) {
      throw badReference('URL did not return a shadcn registry item');
    }
    // A direct item document: its relative file paths resolve against the
    // item document's own directory (shadcn spec).
    return {
      item,
      registryUrl: parsed.url,
      rawBaseUrl: registryFileDir(parsed.url),
      ...(typeof item.homepage === 'string' ? { homepage: item.homepage } : {}),
    };
  }

  const refs = parsed.ref ? [parsed.ref] : [...DEFAULT_GITHUB_REFS];
  let lastError: unknown;
  for (const ref of refs) {
    // Encode per path segment so a valid slashed ref (e.g. "feature/foo")
    // survives instead of becoming "feature%2Ffoo".
    const encodedRef = ref.split('/').map(encodeURIComponent).join('/');
    const registryUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodedRef}/registry.json`;
    let match: RegistryItemMatch | undefined;
    try {
      match = await locateItemInRegistry(registryUrl, parsed.item, fetchImpl, new Set(), 0);
    } catch (err) {
      lastError = err;
      continue;
    }
    if (!match) {
      lastError = badReference(
        `registry for ${parsed.owner}/${parsed.repo} has no item named "${parsed.item}"`,
      );
      continue;
    }
    return {
      item: match.item,
      registryUrl,
      rawBaseUrl: registryFileDir(match.declaringUrl),
      homepage: match.homepage ?? `https://github.com/${parsed.owner}/${parsed.repo}`,
    };
  }
  if (lastError instanceof LocalDesignSystemImportError) throw lastError;
  throw new LocalDesignSystemImportError(
    'BAD_REQUEST',
    `could not load registry.json for ${parsed.owner}/${parsed.repo}: ${formatError(lastError)}`,
  );
}

// Resolve an item by name from a registry document, following the shadcn
// `include` layout (a root registry.json may delegate to nested registry.json
// files instead of listing items inline). The item's relative file paths are
// resolved against the registry.json that declares it, so we surface that
// declaring URL for the caller's rawBaseUrl.
async function locateItemInRegistry(
  registryUrl: string,
  itemName: string,
  fetchImpl: ShadcnFetch,
  visited: Set<string>,
  depth: number,
  inheritedHomepage?: string,
): Promise<RegistryItemMatch | undefined> {
  if (depth > MAX_INCLUDE_DEPTH || visited.has(registryUrl)) return undefined;
  visited.add(registryUrl);

  const registry = (await fetchJsonDocument(registryUrl, fetchImpl)) as ShadcnRegistry;
  const homepage =
    inheritedHomepage ?? (typeof registry.homepage === 'string' ? registry.homepage : undefined);

  if (Array.isArray(registry.items)) {
    const item = registry.items.find((entry) => entry?.name === itemName);
    if (item) return { item, declaringUrl: registryUrl, ...(homepage ? { homepage } : {}) };
  }

  if (Array.isArray(registry.include)) {
    if (registry.include.length > MAX_INCLUDE_BREADTH) {
      throw badReference(
        `registry at ${registryUrl} declares ${registry.include.length} includes, exceeding the ${MAX_INCLUDE_BREADTH}-include limit`,
      );
    }
    for (const entry of registry.include) {
      if (typeof entry !== 'string' || !entry.trim()) continue;
      let includedUrl: string;
      try {
        includedUrl = new URL(entry, registryUrl).toString();
      } catch {
        continue;
      }
      const match = await locateItemInRegistry(includedUrl, itemName, fetchImpl, visited, depth + 1, homepage);
      if (match) return match;
    }
  }

  return undefined;
}

// Directory URL of a registry.json / item.json (drops the trailing filename),
// used as the base for resolving the item's relative file paths.
function registryFileDir(url: string): string {
  try {
    return new URL('.', url).toString().replace(/\/+$/, '');
  } catch {
    return url.replace(/\/[^/]*$/, '');
  }
}

function isUsableItem(item: unknown): item is ShadcnRegistryItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as ShadcnRegistryItem;
  return (
    typeof candidate.name === 'string' ||
    candidate.cssVars !== undefined ||
    Array.isArray(candidate.files)
  );
}

async function fetchJsonDocument(url: string, fetchImpl: ShadcnFetch): Promise<unknown> {
  const text = await fetchText(url, fetchImpl);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LocalDesignSystemImportError('BAD_REQUEST', `registry document at ${url} is not valid JSON`);
  }
}

async function fetchText(url: string, fetchImpl: ShadcnFetch): Promise<string> {
  // Defense in depth: validate every URL we actually contact — not just the
  // user-supplied entry point, but raw GitHub URLs, `include` targets, and raw
  // file URLs too. Combined with redirect:'error' in defaultShadcnFetch, this
  // closes redirect- and include-based SSRF paths to disallowed hosts.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw badReference(`invalid registry URL: ${url}`);
  }
  assertFetchableUrl(parsedUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response: ShadcnFetchResponse;
    try {
      response = await fetchImpl(url, { signal: controller.signal });
    } catch (err) {
      if (err instanceof LocalDesignSystemImportError) throw err;
      if (isAbortError(err)) {
        throw new LocalDesignSystemImportError('BAD_REQUEST', `timed out fetching ${url}`);
      }
      throw new LocalDesignSystemImportError('BAD_REQUEST', `could not fetch ${url}: ${formatError(err)}`);
    }
    if (!response.ok) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `could not fetch ${url}: HTTP ${response.status} ${response.statusText}`.trimEnd(),
      );
    }
    // Reject before reading when the server already advertises an over-cap body.
    const declaredLength = Number(response.headers?.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `registry document at ${url} exceeds the ${MAX_DOCUMENT_BYTES}-byte limit`,
      );
    }
    // The abort timer stays armed across body consumption, and the body is read
    // with a running byte cap so a stalled or oversized body can neither hang
    // the import nor buffer unbounded memory.
    if (response.body && typeof response.body.getReader === 'function') {
      return await readBoundedStream(response.body, MAX_DOCUMENT_BYTES, url);
    }
    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      if (isAbortError(err)) {
        throw new LocalDesignSystemImportError('BAD_REQUEST', `timed out reading ${url}`);
      }
      throw new LocalDesignSystemImportError('BAD_REQUEST', `could not read ${url}: ${formatError(err)}`);
    }
    if (text.length > MAX_DOCUMENT_BYTES) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `registry document at ${url} exceeds the ${MAX_DOCUMENT_BYTES}-byte limit`,
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  url: string,
): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new LocalDesignSystemImportError(
          'BAD_REQUEST',
          `registry document at ${url} exceeds the ${maxBytes}-byte limit`,
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof LocalDesignSystemImportError) throw err;
    if (isAbortError(err)) {
      throw new LocalDesignSystemImportError('BAD_REQUEST', `timed out reading ${url}`);
    }
    throw new LocalDesignSystemImportError('BAD_REQUEST', `could not read ${url}: ${formatError(err)}`);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

// ---------------------------------------------------------------------------
// Materialization (temp project the local importer can scan)
// ---------------------------------------------------------------------------

async function materializeShadcnItem(
  item: ShadcnRegistryItem,
  tempDir: string,
  resolved: ResolvedShadcnItem,
  fetchImpl: ShadcnFetch,
): Promise<void> {
  await writeFile(path.join(tempDir, 'theme.css'), renderShadcnSourceCss(item.cssVars), 'utf8');

  const description =
    typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : `Imported from the shadcn registry item "${item.name ?? 'unknown'}".`;
  await writeFile(
    path.join(tempDir, 'package.json'),
    `${JSON.stringify({ description }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(tempDir, 'README.md'), renderShadcnReadme(item, resolved), 'utf8');

  await writeShadcnFiles(item, tempDir, resolved, fetchImpl);
}

export function renderShadcnSourceCss(cssVars: ShadcnCssVars | undefined): string {
  const rootLines: string[] = [];
  if (cssVars?.theme) {
    for (const [key, value] of Object.entries(cssVars.theme)) rootLines.push(declaration(key, value));
  }
  if (cssVars?.light) {
    for (const [key, value] of Object.entries(cssVars.light)) rootLines.push(declaration(key, value));
  }
  const darkLines = cssVars?.dark
    ? Object.entries(cssVars.dark).map(([key, value]) => declaration(key, value))
    : [];

  let css = `:root {\n${rootLines.join('\n')}\n}\n`;
  if (darkLines.length > 0) {
    css += `\n.dark {\n${darkLines.join('\n')}\n}\n`;
  }
  return css;
}

function declaration(key: string, value: unknown): string {
  const name = normalizeVarName(key);
  // Reject anything that isn't a clean custom-property ident or whose value
  // could break out of the declaration — otherwise a hostile cssVars entry
  // could inject extra rules or be silently dropped by the token scanner.
  if (!/^--[A-Za-z0-9_-]+$/.test(name)) {
    throw new LocalDesignSystemImportError(
      'BAD_REQUEST',
      `shadcn cssVars key "${key}" is not a valid CSS custom property name`,
    );
  }
  const raw = String(value);
  if (/[;{}]/.test(raw) || /[\r\n]/.test(raw)) {
    throw new LocalDesignSystemImportError(
      'BAD_REQUEST',
      `shadcn cssVars value for "${key}" contains unsafe characters`,
    );
  }
  return `  ${name}: ${wrapShadcnColorValue(raw)};`;
}

function normalizeVarName(key: string): string {
  return `--${key.trim().replace(/^--/, '')}`;
}

// shadcn (Tailwind v3 era) stores colors as bare HSL triplets — e.g.
// `222.2 47.4% 11.2%` — because the Tailwind config wraps them as
// `hsl(var(--token))`. OD's importer only recognizes wrapped colors, so wrap
// bare HSL triplets back into `hsl(...)` to preserve brand fidelity. Values
// that are already functions/hex/keywords (incl. Tailwind v4 `oklch(...)`)
// pass through untouched.
export function wrapShadcnColorValue(value: string): string {
  const trimmed = value.trim();
  if (/^(#|rgb|hsl|hwb|oklch|oklab|lab|lch|color|var|color-mix|calc)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^-?[\d.]+\s+-?[\d.]+%\s+-?[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(trimmed)) {
    return `hsl(${trimmed})`;
  }
  return trimmed;
}

function renderShadcnReadme(item: ShadcnRegistryItem, resolved: ResolvedShadcnItem): string {
  const dependencies = stringArray(item.dependencies);
  const registryDependencies = stringArray(item.registryDependencies);
  return [
    `# ${item.title ?? item.name ?? 'shadcn design system'}`,
    '',
    item.description ?? 'Imported from a shadcn registry item.',
    '',
    '## Source',
    '',
    `- Registry document: ${resolved.registryUrl}`,
    item.name ? `- Item: \`${item.name}\`${item.type ? ` (${item.type})` : ''}` : `- Item type: ${item.type ?? 'unknown'}`,
    resolved.homepage ? `- Registry homepage: ${resolved.homepage}` : '- Registry homepage: not declared',
    dependencies.length > 0 ? `- npm dependencies: ${dependencies.join(', ')}` : '- npm dependencies: none declared',
    registryDependencies.length > 0
      ? `- Registry dependencies: ${registryDependencies.join(', ')}`
      : '- Registry dependencies: none declared',
    '',
  ].join('\n');
}

async function writeShadcnFiles(
  item: ShadcnRegistryItem,
  tempDir: string,
  resolved: ResolvedShadcnItem,
  fetchImpl: ShadcnFetch,
): Promise<void> {
  const files = Array.isArray(item.files) ? item.files : [];
  // Fail fast instead of silently truncating: a partial design system that
  // looks "imported" but is missing declared source material is worse than a
  // clear error the caller can act on.
  if (files.length > MAX_FILES) {
    throw new LocalDesignSystemImportError(
      'BAD_REQUEST',
      `shadcn registry item declares ${files.length} files, exceeding the ${MAX_FILES}-file limit`,
    );
  }
  const used = new Map<string, string>(); // sanitized destination -> declared source
  for (const file of files) {
    const declared =
      typeof file?.path === 'string' && file.path.trim()
        ? file.path.trim()
        : typeof file?.target === 'string' && file.target.trim()
          ? file.target.trim()
          : undefined;
    const relPath = sanitizeShadcnFilePath(file?.target ?? file?.path);
    if (!relPath) {
      // Every declared file must produce a safe destination. A `files[]` entry
      // with a missing/blank/unsafe path or target is malformed input, not a
      // file to silently skip.
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        declared
          ? `shadcn registry file "${declared}" has no safe destination path`
          : 'shadcn registry declares a file object with no path or target',
      );
    }
    const priorSource = used.get(relPath);
    if (priorSource !== undefined) {
      // A duplicate sanitized destination means the registry item is ambiguous
      // (e.g. "@/button.tsx" + "button.tsx", or two entries sharing a target);
      // dropping the later one would silently lose the author's intended file.
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `shadcn registry files "${priorSource}" and "${declared ?? relPath}" both resolve to "${relPath}"`,
      );
    }
    used.set(relPath, declared ?? relPath);

    let content = typeof file?.content === 'string' ? file.content : undefined;
    if (content === undefined) {
      if (resolved.rawBaseUrl && typeof file?.path === 'string' && file.path.trim()) {
        content = await fetchRawFileContent(resolved.rawBaseUrl, file.path, fetchImpl);
      } else {
        throw new LocalDesignSystemImportError(
          'BAD_REQUEST',
          `shadcn registry file "${declared ?? relPath}" has no inline content and cannot be fetched`,
        );
      }
    }
    if (content.length > MAX_FILE_BYTES) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `shadcn registry file "${declared ?? relPath}" exceeds the ${MAX_FILE_BYTES}-byte limit`,
      );
    }

    // Materialize under a dedicated subdir so a crafted target (e.g.
    // "theme.css" / "package.json") cannot overwrite the importer-generated
    // files at the temp root. The local importer scans recursively, so nested
    // files are still picked up.
    const absPath = path.join(tempDir, SHADCN_FILES_SUBDIR, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf8');
  }
}

async function fetchRawFileContent(
  rawBaseUrl: string,
  filePath: string,
  fetchImpl: ShadcnFetch,
): Promise<string> {
  const safe = filePath
    .split(/[\\/]/)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  if (!safe) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', `shadcn registry file "${filePath}" has no valid path`);
  }
  return await fetchText(`${rawBaseUrl}/${safe}`, fetchImpl);
}

function sanitizeShadcnFilePath(input: string | undefined): string | undefined {
  if (typeof input !== 'string') return undefined;
  let value = input.trim();
  if (!value) return undefined;
  value = value.replace(/^[~@][^/]*\//, ''); // strip `@components/`, `~/`, etc.
  value = value.replace(/^\/+/, '');
  value = value.replace(/^[A-Za-z]:[\\/]/, '');
  const segments = value.split(/[\\/]/).filter((segment) => segment && segment !== '.' && segment !== '..');
  if (segments.length === 0) return undefined;
  return segments.join('/');
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Wrap a fetch with one shared, whole-import budget: a hard request count and
// a wall-clock deadline. Layered on top of fetchText's per-request timeout so
// an `include` tree or a long file list cannot run unbounded.
function withFetchBudget(fetchImpl: ShadcnFetch): ShadcnFetch {
  // Real wall-clock deadline (not the injected `now`, which is only for
  // deterministic output timestamps).
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  let count = 0;
  return (url, init) => {
    if (Date.now() > deadline) {
      throw new LocalDesignSystemImportError('BAD_REQUEST', 'shadcn import exceeded its overall time budget');
    }
    count += 1;
    if (count > MAX_TOTAL_FETCHES) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        `shadcn import exceeded its ${MAX_TOTAL_FETCHES}-request budget`,
      );
    }
    return fetchImpl(url, init);
  };
}

function defaultShadcnFetch(): ShadcnFetch {
  if (typeof fetch !== 'function') {
    throw new LocalDesignSystemImportError('INTERNAL_ERROR', 'global fetch is not available in this runtime');
  }
  // redirect:'error' blocks redirect-based SSRF — a validated https registry URL
  // cannot bounce the daemon to a disallowed internal http target (e.g.
  // 169.254.169.254). Every hop is re-checked by fetchText's host validation.
  return (url, init) => fetch(url, { ...init, redirect: 'error' });
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function cleanShadcnName(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'shadcn design system';
}

function badReference(message: string): LocalDesignSystemImportError {
  return new LocalDesignSystemImportError('BAD_REQUEST', message);
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}
