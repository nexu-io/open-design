import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

interface CliError {
  code?: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  requestId?: string;
}

interface ToolCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  connectorId?: string;
  toolName?: string;
  inputPath?: string;
  localPath?: string;
  repo?: string;
  ref?: string;
  outputPath?: string;
  maxFiles?: number;
  requireConnector?: boolean;
  referencePackage?: boolean;
  failOnWarnings?: boolean;
  useCase?: 'personal_daily_digest';
  format: 'compact' | 'json';
  help: boolean;
}

const CONNECTORS_USAGE = `Usage:
  od tools connectors list [--use-case personal_daily_digest] [--format compact]
  od tools connectors execute --connector <id> --tool <name> --input input.json
  od tools connectors github-design-context --repo owner/repo [--ref main] [--output context/github/owner-repo.md] [--max-files 48] [--require-connector]
  od tools connectors local-design-context --path /path/to/project [--output context/local-code/project.md] [--max-files 48]
  od tools connectors design-system-package-audit --path /path/to/project [--reference-package] [--fail-on-warnings]

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          Open Design CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools connectors list --use-case personal_daily_digest --format compact
`;

const GITHUB_CONNECTOR_ID = 'github';
const GITHUB_GET_REPOSITORY_TOOL = 'github.github_get_a_repository';
const GITHUB_GET_TREE_TOOL = 'github.github_get_a_tree';
const GITHUB_GET_README_TOOL = 'github.github_get_a_repository_readme';
const GITHUB_GET_RAW_CONTENT_TOOL = 'github.github_get_raw_repository_content';
const GITHUB_GET_REPOSITORY_CONTENT_TOOL = 'github.github_get_repository_content';

const DEFAULT_GITHUB_CONTEXT_MAX_FILES = 48;
const MAX_GITHUB_CONTEXT_FILES = 80;
const DEFAULT_LOCAL_CONTEXT_MAX_FILES = 64;
const MAX_LOCAL_CONTEXT_FILES = 120;
const MAX_CONTEXT_FILE_BYTES = 120_000;
const MAX_CONTEXT_ASSET_BYTES = 1_500_000;
const MAX_MARKDOWN_EXCERPT_CHARS = 2_400;
const MAX_CONNECTOR_DIRECTORY_SCAN_DIRS = 48;
const GITHUB_CLONE_TIMEOUT_MS = 120_000;
const GH_AUTH_TIMEOUT_MS = 10_000;
const MAX_PROCESS_OUTPUT_CHARS = 8_000;
const UI_KIT_ENTRY_GUIDANCE = [
  '- Claude-style UI-kit entry skeleton for direct JSX kits:',
  '  - `<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>`',
  '  - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>`',
  '  - `<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>`',
  '  - `<link rel="stylesheet" href="../../colors_and_type.css">`',
  '  - `<div id="root"></div>`',
  '  - Load role components from `components/*.jsx` with `<script type="text/babel" src="components/ComponentName.jsx"></script>`.',
  '  - Mount with `const { App } = window; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App />);`.',
];

interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  source: string;
}

interface GithubSnapshotFile {
  repoPath: string;
  outputPath?: string;
  content: string | Buffer;
  bytes: number;
  source: 'connector' | 'git-clone' | 'local-folder';
  binary?: boolean;
}

interface GithubDesignEvidence {
  repo: ParsedGitHubRepo;
  ref?: string;
  resolvedRef?: string;
  method: 'connector' | 'git-clone';
  localCloneMethod?: 'git' | 'gh-cli';
  repositoryMetadata?: JsonObject;
  readme?: { path: string; content: string };
  treePaths: string[];
  files: GithubSnapshotFile[];
  materializedFiles?: string[];
  warnings: string[];
}

type GithubEvidenceInventoryCategory =
  | 'Product docs and manifests'
  | 'Brand assets and icons'
  | 'Fonts'
  | 'Theme, tokens, and styling'
  | 'App shell and navigation'
  | 'Chat and input surfaces'
  | 'Reusable components'
  | 'Other design evidence';

interface GithubEvidenceInventorySection {
  title: GithubEvidenceInventoryCategory;
  description: string;
  files: GithubSnapshotFile[];
}

interface LocalDesignEvidence {
  sourcePath: string;
  sourceName: string;
  method: 'local-folder';
  treePaths: string[];
  files: GithubSnapshotFile[];
  materializedFiles?: string[];
  readme?: { path: string; content: string };
  warnings: string[];
}

export type DesignSystemAuditSeverity = 'error' | 'warning';

export interface DesignSystemAuditIssue {
  severity: DesignSystemAuditSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface DesignSystemPackageAudit {
  ok: boolean;
  projectPath: string;
  filesInspected: number;
  errors: DesignSystemAuditIssue[];
  warnings: DesignSystemAuditIssue[];
}

interface ProcessRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code?: number | null;
  timedOut?: boolean;
  error?: string;
}

interface LocalGitHubCloneResult {
  method: 'git' | 'gh-cli';
  warnings: string[];
}

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, details?: unknown): ToolCliResult {
  writeJson({ ok: false, error: { message, ...(details === undefined ? {} : { details }) } }, process.stderr);
  return { exitCode: 1 };
}

function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    format: 'compact',
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--connector') {
      const value = rest[++index];
      if (!value) return { error: '--connector requires a connector id' };
      options.connectorId = value;
    } else if (arg === '--tool') {
      const value = rest[++index];
      if (!value) return { error: '--tool requires a tool name' };
      options.toolName = value;
    } else if (arg === '--input') {
      const value = rest[++index];
      if (!value) return { error: '--input requires a file path' };
      options.inputPath = value;
    } else if (arg === '--path') {
      const value = rest[++index];
      if (!value) return { error: '--path requires a local folder path' };
      options.localPath = value;
    } else if (arg === '--repo') {
      const value = rest[++index];
      if (!value) return { error: '--repo requires owner/repo or a GitHub repository URL' };
      options.repo = value;
    } else if (arg === '--ref') {
      const value = rest[++index];
      if (!value) return { error: '--ref requires a branch, tag, or commit' };
      options.ref = value;
    } else if (arg === '--output') {
      const value = rest[++index];
      if (!value) return { error: '--output requires a file path' };
      options.outputPath = value;
    } else if (arg === '--max-files') {
      const value = rest[++index];
      const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) return { error: '--max-files must be a positive integer' };
      options.maxFiles = Math.min(
        parsed,
        options.command === 'local-design-context' ? MAX_LOCAL_CONTEXT_FILES : MAX_GITHUB_CONTEXT_FILES,
      );
    } else if (arg === '--require-connector') {
      options.requireConnector = true;
    } else if (arg === '--reference-package') {
      options.referencePackage = true;
    } else if (arg === '--fail-on-warnings') {
      options.failOnWarnings = true;
    } else if (arg === '--format') {
      const value = rest[++index];
      if (value !== 'compact' && value !== 'json') return { error: '--format must be compact or json' };
      options.format = value;
    } else if (arg === '--use-case') {
      const value = rest[++index];
      if (value !== 'personal_daily_digest') return { error: '--use-case must be personal_daily_digest' };
      options.useCase = value;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      return { error: `unknown option: ${arg}` };
    }
  }

  return options;
}

function daemonUrl(): URL | { error: string } {
  const rawUrl = process.env.OD_DAEMON_URL;
  if (!rawUrl) return { error: 'OD_DAEMON_URL is required' };
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/\/+$/u, '');
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return { error: 'OD_DAEMON_URL must be a valid URL' };
  }
}

function toolToken(): string | { error: string } {
  const token = process.env.OD_TOOL_TOKEN;
  if (!token) return { error: 'OD_TOOL_TOKEN is required' };
  return token;
}

function endpoint(baseUrl: URL, pathname: string): string {
  const url = new URL(baseUrl.toString());
  const [pathPart, searchPart] = pathname.split('?');
  url.pathname = `${url.pathname}${pathPart ?? ''}`.replace(/\/+/gu, '/');
  url.search = searchPart === undefined ? '' : `?${searchPart}`;
  return url.toString();
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const resolved = path.resolve(filePath);
  const text = await readFile(resolved, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in ${resolved}: ${message}`);
  }
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  const value = await readJsonFile(filePath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path.resolve(filePath)} must contain a JSON object`);
  }
  return value as JsonObject;
}

function parseGithubRepo(input: string): ParsedGitHubRepo {
  const raw = input.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/iu.exec(raw);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: stripGitSuffix(sshMatch[2]), source: raw };
  }

  if (/^https?:\/\//iu.test(raw)) {
    const url = new URL(raw);
    if (url.hostname.toLowerCase() !== 'github.com') {
      throw new Error('--repo must point to github.com');
    }
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/gu, '').split('/');
    if (!owner || !repo) throw new Error('--repo URL must include owner and repository');
    return { owner, repo: stripGitSuffix(repo), source: raw };
  }

  const [owner, repo] = raw.replace(/^\/+|\/+$/gu, '').split('/');
  if (!owner || !repo) {
    throw new Error('--repo must be owner/repo or a GitHub repository URL');
  }
  return { owner, repo: stripGitSuffix(repo), source: raw };
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/iu, '');
}

function repoSlug(repo: ParsedGitHubRepo): string {
  return `${safePathSegment(repo.owner)}-${safePathSegment(repo.repo)}`;
}

function safePathSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '');
  return normalized || 'repo';
}

function safeRepoRelativePath(repoPath: string): string {
  return repoPath
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map(safePathSegment)
    .join('/');
}

function defaultGithubContextOutputPath(repo: ParsedGitHubRepo): string {
  return path.join('context', 'github', `${repoSlug(repo)}.md`);
}

function githubSnapshotRoot(outputPath: string, repo: ParsedGitHubRepo): string {
  const dir = path.dirname(outputPath);
  return path.join(dir, repoSlug(repo), 'files');
}

function localSourceName(sourcePath: string): string {
  return safePathSegment(path.basename(path.resolve(sourcePath)) || 'local-source');
}

function defaultLocalContextOutputPath(sourcePath: string): string {
  return path.join('context', 'local-code', `${localSourceName(sourcePath)}.md`);
}

function localSnapshotRoot(outputPath: string, sourcePath: string): string {
  const dir = path.dirname(outputPath);
  return path.join(dir, localSourceName(sourcePath), 'files');
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function isAbsenceError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

async function requestJsonOrThrow(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<unknown> {
  const response = await requestJson(baseUrl, token, pathname, init);
  if (response.status >= 200 && response.status < 300) return response.body;
  const error = normalizeCliError(response.body);
  throw new Error(`${error.code ? `${error.code}: ` : ''}${error.message}`);
}

async function executeConnectorReadTool(
  baseUrl: URL,
  token: string,
  toolName: string,
  input: JsonObject,
): Promise<unknown> {
  const body = await requestJsonOrThrow(baseUrl, token, '/api/tools/connectors/execute', {
    method: 'POST',
    body: JSON.stringify({ connectorId: GITHUB_CONNECTOR_ID, toolName, input }),
  });
  if (!body || typeof body !== 'object') return body;
  const output = (body as JsonObject).output;
  if (output && typeof output === 'object' && !Array.isArray(output) && 'data' in output) {
    return (output as JsonObject).data;
  }
  return output;
}

async function assertGithubConnectorIsListable(baseUrl: URL, token: string): Promise<void> {
  const body = await requestJsonOrThrow(baseUrl, token, '/api/tools/connectors/list', { method: 'GET' });
  const connectors = body && typeof body === 'object' && Array.isArray((body as JsonObject).connectors)
    ? (body as { connectors: JsonObject[] }).connectors
    : [];
  const github = connectors.find((connector) => connector.id === GITHUB_CONNECTOR_ID);
  if (!github) throw new Error('GitHub connector is not connected or has no auto-approved read tools');
  const status = typeof github.status === 'string' ? github.status.toLowerCase() : '';
  if (status && status !== 'connected') {
    throw new Error(`GitHub connector status is ${status}; connect GitHub before repository intake`);
  }
}

function getStringAtKeys(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonObject;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct;
  }
  for (const child of Object.values(record)) {
    const found = getStringAtKeys(child, keys);
    if (found) return found;
  }
  return undefined;
}

function getDefaultBranch(metadata: unknown): string | undefined {
  return getStringAtKeys(metadata, ['default_branch', 'defaultBranch']);
}

function decodeContentPayload(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonObject;
  const content = typeof record.content === 'string'
    ? record.content
    : typeof record.data === 'string'
      ? record.data
      : undefined;
  if (content !== undefined) {
    const encoding = typeof record.encoding === 'string' ? record.encoding.toLowerCase() : '';
    if (encoding === 'base64') return decodeBase64Content(content);
    return content;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'mimetype' || key === 'name' || key === 's3url') continue;
    const decoded = decodeContentPayload(child);
    if (decoded !== undefined) return decoded;
  }
  return undefined;
}

function decodeBase64Content(value: string): string {
  return decodeBase64Buffer(value).toString('utf8');
}

function decodeBase64Buffer(value: string): Buffer {
  return Buffer.from(value.replace(/\s+/gu, ''), 'base64');
}

function decodeBinaryContentPayload(value: unknown): Buffer | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const decoded = decodeBinaryContentPayload(item);
      if (decoded) return decoded;
    }
    return undefined;
  }
  const record = value as JsonObject;
  const content = typeof record.content === 'string'
    ? record.content
    : typeof record.data === 'string'
      ? record.data
      : undefined;
  if (content !== undefined) {
    const encoding = typeof record.encoding === 'string' ? record.encoding.toLowerCase() : '';
    if (encoding === 'base64') return decodeBase64Buffer(content);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'mimetype' || key === 'name' || key === 's3url') continue;
    const decoded = decodeBinaryContentPayload(child);
    if (decoded) return decoded;
  }
  return undefined;
}

function findConnectorSignedContentUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findConnectorSignedContentUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonObject;
  if (typeof record.s3url === 'string' && /^https:\/\//iu.test(record.s3url)) return record.s3url;
  for (const child of Object.values(record)) {
    const found = findConnectorSignedContentUrl(child);
    if (found) return found;
  }
  return undefined;
}

async function readConnectorTextContent(value: unknown): Promise<string | undefined> {
  const decoded = decodeContentPayload(value);
  if (decoded !== undefined) return decoded;
  const signedUrl = findConnectorSignedContentUrl(value);
  if (!signedUrl) return undefined;
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`connector content download failed with HTTP ${response.status}`);
  }
  const text = await response.text();
  return text.slice(0, MAX_CONTEXT_FILE_BYTES);
}

async function readConnectorBinaryContent(value: unknown): Promise<Buffer | undefined> {
  const decoded = decodeBinaryContentPayload(value);
  if (decoded) return decoded;
  const signedUrl = findConnectorSignedContentUrl(value);
  if (!signedUrl) return undefined;
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`connector content download failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readConnectorSnapshotContent(
  repoPath: string,
  value: unknown,
): Promise<{ content: string | Buffer; bytes: number; binary?: boolean } | undefined> {
  const normalizedPath = repoPath.toLowerCase();
  if (isBinaryDesignAssetPath(normalizedPath)) {
    const binaryContent = await readConnectorBinaryContent(value);
    if (!binaryContent) return undefined;
    if (binaryContent.length > MAX_CONTEXT_ASSET_BYTES) {
      throw new Error(`binary asset exceeds ${MAX_CONTEXT_ASSET_BYTES} bytes`);
    }
    return { content: binaryContent, bytes: binaryContent.length, binary: true };
  }
  const textContent = await readConnectorTextContent(value);
  if (textContent === undefined) return undefined;
  const content = textContent.slice(0, MAX_CONTEXT_FILE_BYTES);
  return { content, bytes: Buffer.byteLength(content, 'utf8') };
}

function extractTreePaths(value: unknown): string[] {
  const paths = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as JsonObject;
    const rawPath = typeof record.path === 'string' ? record.path : undefined;
    const rawType = typeof record.type === 'string' ? record.type.toLowerCase() : '';
    if (rawPath && rawType !== 'tree' && rawType !== 'dir') {
      paths.add(rawPath);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...paths].sort((left, right) => left.localeCompare(right));
}

interface GithubDirectoryEntry {
  path: string;
  type: 'file' | 'dir';
}

function extractDirectoryEntries(value: unknown): GithubDirectoryEntry[] {
  const entries = new Map<string, GithubDirectoryEntry>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as JsonObject;
    const rawPath = typeof record.path === 'string' ? record.path : undefined;
    const rawType = typeof record.type === 'string' ? record.type.toLowerCase() : '';
    if (rawPath && (rawType === 'file' || rawType === 'dir')) {
      entries.set(rawPath, { path: rawPath, type: rawType });
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function scoreDesignFile(repoPath: string): number {
  const normalized = repoPath.toLowerCase();
  if (shouldSkipRepoPath(normalized)) return -1;
  let score = 0;
  // Native / non-web design-token source. Without this, a SwiftUI, Kotlin, or
  // other non-JS repo has every source file score 0, so config dotfiles (which
  // hit the generic text bonus below) win the ranking and the real source is
  // never snapshotted. Design-token files (ColorSystem.swift, Typography.kt,
  // Spacing.swift, ...) get the high boost; other native source gets a solid
  // floor so it outranks config noise.
  if (/(^|\/)(color|colors|colour|colours|theme|themes|palette|palettes|typography|type|fonts?|spacing|sizing|metrics|dimens|tokens?|designsystem|design-?system|design|styles?|styling|appearance|brand|branding)[a-z0-9_]*\.(swift|kt|kts|java|dart|scala|cs|m|mm)$/u.test(normalized)) score += 95;
  if (/\.(swift|kt|kts|java|scala|go|rs|rb|py|php|cs|dart|vue|svelte|astro|ex|exs|elm|c|cc|cpp|cxx|h|hpp|hh|m|mm)$/u.test(normalized)) score += 40;
  if (/(^|\/)readme\.(md|mdx|txt|rst)$/u.test(normalized)) score += 100;
  if (/(^|\/)package\.json$/u.test(normalized)) score += 95;
  if (/(^|\/)(tailwind|theme|themes?|themeprovider|antdprovider|tokens?|colors?|typography|design-system|design|constant|constants|env|style|styles)\.(config\.)?(ts|tsx|js|jsx|json|css|scss|less|md)$/u.test(normalized)) score += 95;
  if (/(^|\/)(globals?|index|style|styles|app|root)\.(css|scss|less)$/u.test(normalized)) score += 88;
  if (/^(build|assets?|public|resources)\/(cherry[-_])?(logo|icon|tray[_-]?icon|avatar|wordmark|brand|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) score += 150;
  if (/^(fonts?|assets?\/fonts?|public\/fonts?|resources\/fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized)) score += 145;
  if (/\/assets\/fonts?\/.*\.(ttf|otf|woff2?|css)$/u.test(normalized)) score += 145;
  if (/\/assets\/fonts?\/.*ubuntu.*\.(ttf|otf|woff2?|css)$/u.test(normalized)) score += 18;
  if (/(^|\/)(build|assets?|public|resources|fonts?)\/.*(logo|icon|avatar|tray|brand|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) score += 86;
  if (/(^|\/)(build|assets?|public|resources|fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized)) score += 84;
  if (/\/(context|providers?|theme|styles?|config|utils?)\//u.test(normalized)) score += 70;
  if (/\/(app|layout|shell|navbar|sidebar|home|chat|settings|inputbar|assistants?|topics?)\//u.test(normalized)) score += 68;
  if (/\/(components?|ui|design-system|primitives?)\//u.test(normalized)) score += 65;
  if (/(button|card|dialog|modal|input|form|nav|navbar|sidebar|table|badge|avatar|toast|menu|tabs|layout|shell|composer|message|assistant|model|provider|settings)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) score += 58;
  if (/\/components\/app\/(navbar|sidebar)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) score += 150;
  if (/\/pages\/home\/(homepage|chat|navbar)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 155;
  if (/\/pages\/home\/(inputbar|messages|tabs)\/(inputbar|inputbarcore|messages|message|messagegroup|messagecontent|assistantlist|assistantitem|assistantstab|topicstab|index)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 145;
  if (/\/pages\/home\/tabs\/components\/(assistantlist|assistantitem|topics?)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 90;
  if (/\/pages\/home\/inputbar\/(components\/inputbarcore|sendmessagebutton|attachmentpreview)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 80;
  if (/\/pages\/home\/components\/chatnavbar\/(index|chatnavbarcontent\/index|chatnavbarcontent\/topiccontent)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 115;
  if (/(^|\/)(app|pages|src)\/(layout|page|app|index|main)\.(tsx|ts|jsx|js|css)$/u.test(normalized)) score += 45;
  if (isDesignAssetPath(normalized)) score += 42;
  if (/\.(css|scss|less|tsx|ts|jsx|js|md|mdx|json|svg)$/u.test(normalized)) score += 10;
  if (isBinaryDesignAssetPath(normalized)) score += 6;
  if (/\/pages\/home\/inputbar\/tools\/components\//u.test(normalized)) score -= 80;
  if (/\/pages\/settings\//u.test(normalized)) score -= 120;
  if (/\/assets\/images\/providers?\//u.test(normalized)) score -= 72;
  return score;
}

function scoreDesignDirectory(repoPath: string): number {
  const normalized = repoPath.toLowerCase();
  if (shouldSkipRepoPath(`${normalized}/`)) return -1;
  const segments = normalized.split('/');
  const basename = segments.at(-1) ?? normalized;
  let score = 0;
  if (/^(apps?|packages?|src|source|frontend|web|client|ui|components?|design-system|styles?|theme|themes|tokens?|assets?|public|resources|build|fonts?)$/u.test(basename)) {
    score += 80;
  }
  if (/(^|\/)(apps?|packages?)\//u.test(normalized)) score += 35;
  if (/(^|\/)(components?|ui|design-system|primitives?|styles?|theme|tokens?|assets?|public|resources|build|fonts?)$/u.test(normalized)) score += 45;
  if (segments.length <= 2) score += 10;
  if (segments.length > 5) score -= 20;
  return score;
}

export function shouldSkipRepoPath(normalizedPath: string): boolean {
  if (isDesignAssetDirectory(normalizedPath) || isDesignAssetPath(normalizedPath)) return false;
  // Editor / CI / agent-tooling directories are never design evidence, but
  // their .md / .json files otherwise score on the generic text bonus and crowd
  // out real source (this is what filled a SwiftUI import with .zenflow, .zed,
  // and .vscode files instead of the Swift token source).
  if (/(^|\/)\.(vscode|zed|idea|fleet|zenflow|github|husky|gradle|vs|turbo|cache|devcontainer)\//u.test(normalizedPath)) return true;
  return /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.nuxt|\.git|out|target|storybook-static)\//u.test(normalizedPath)
    || /(^|\/)(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb)$/u.test(normalizedPath)
    || /(^|\/)(__tests__|__snapshots__|test|tests)\//u.test(normalizedPath)
    || /\.(test|spec|bench)\.(tsx|ts|jsx|js)$/u.test(normalizedPath)
    || /\.(gif|avif|mp4|mov|zip|tar|gz|pdf)$/u.test(normalizedPath)
    || (/\.(png|jpe?g|webp|ico|woff2?|ttf|otf)$/u.test(normalizedPath) && !isDesignAssetPath(normalizedPath));
}

function isDesignAssetDirectory(normalizedPath: string): boolean {
  return /(^|\/)(assets?|public|resources|build|fonts?)\/$/u.test(normalizedPath)
    || /(^|\/)src\/renderer\/src\/assets\//u.test(normalizedPath);
}

function isDesignAssetPath(normalizedPath: string): boolean {
  return /(^|\/)(assets?|public|resources|build|fonts?)\/.*(logo|icon|avatar|tray|brand|wordmark|mark|font|ubuntu)[^/]*\.(svg|png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath)
    || /(^|\/)src\/renderer\/src\/assets\/.*\.(svg|png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath);
}

function isBinaryDesignAssetPath(normalizedPath: string): boolean {
  return /\.(png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath);
}

export function isTextSnapshotPath(normalizedPath: string): boolean {
  return /\.(css|scss|less|tsx|ts|jsx|js|mjs|cjs|md|mdx|json|jsonc|svg|txt|rst|yaml|yml|toml|xml|swift|kt|kts|java|scala|go|rs|rb|py|php|cs|dart|vue|svelte|astro|ex|exs|elm|c|cc|cpp|cxx|h|hpp|hh|m|mm)$/u.test(normalizedPath);
}

function selectDesignFiles(paths: string[], maxFiles: number): string[] {
  return paths
    .map((repoPath) => ({ repoPath, score: scoreDesignFile(repoPath) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.repoPath.localeCompare(right.repoPath))
    .slice(0, maxFiles)
    .map((entry) => entry.repoPath);
}

function selectDesignFilesWithPreferredReadme(paths: string[], maxFiles: number): string[] {
  const selected = selectDesignFiles(paths, maxFiles);
  const preferredReadme = preferredReadmePath(paths);
  if (!preferredReadme || selected.includes(preferredReadme)) return selected;
  return [preferredReadme, ...selected.filter((repoPath) => repoPath !== preferredReadme)].slice(0, maxFiles);
}

function preferredReadmePath(paths: string[]): string | undefined {
  return paths
    .filter((repoPath) => /(^|\/)readme\.(md|mdx|txt|rst)$/iu.test(repoPath))
    .sort((left, right) => {
      const leftSegments = left.split('/').length;
      const rightSegments = right.split('/').length;
      return leftSegments - rightSegments || left.localeCompare(right);
    })[0];
}

async function collectGithubTreePathsWithConnector(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  resolvedRef: string,
  warnings: string[],
): Promise<string[]> {
  try {
    const treePayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_TREE_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
      tree_sha: resolvedRef,
      recursive: true,
    });
    return extractTreePaths(treePayload);
  } catch (error) {
    warnings.push(
      `Recursive tree connector read failed; falling back to bounded directory browsing: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return collectGithubTreePathsFromDirectoryListings(baseUrl, token, repo, resolvedRef, warnings);
  }
}

async function collectGithubTreePathsFromDirectoryListings(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  resolvedRef: string,
  warnings: string[],
): Promise<string[]> {
  const filePaths = new Set<string>();
  const seenDirs = new Set<string>();
  const queue: string[] = [''];

  while (queue.length > 0 && seenDirs.size < MAX_CONNECTOR_DIRECTORY_SCAN_DIRS) {
    const currentDir = queue.shift() ?? '';
    if (seenDirs.has(currentDir)) continue;
    seenDirs.add(currentDir);

    let entries: GithubDirectoryEntry[] = [];
    try {
      const payload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_REPOSITORY_CONTENT_TOOL, {
        owner: repo.owner,
        repo: repo.repo,
        ref: resolvedRef,
        path: currentDir,
      });
      entries = extractDirectoryEntries(payload);
    } catch (error) {
      warnings.push(`Skipped directory ${currentDir || '.'}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (const entry of entries) {
      if (entry.type === 'file') {
        if (!shouldSkipRepoPath(entry.path.toLowerCase())) filePaths.add(entry.path);
        continue;
      }
      if (entry.type === 'dir' && !seenDirs.has(entry.path) && scoreDesignDirectory(entry.path) > 0) {
        queue.push(entry.path);
      }
    }

    queue.sort((left, right) => scoreDesignDirectory(right) - scoreDesignDirectory(left) || left.localeCompare(right));
  }

  if (queue.length > 0) {
    warnings.push(`Directory browsing stopped after ${MAX_CONNECTOR_DIRECTORY_SCAN_DIRS} directories; evidence is a bounded connector snapshot.`);
  }
  return [...filePaths].sort((left, right) => left.localeCompare(right));
}

async function collectGithubEvidenceWithConnector(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  options: { ref?: string; maxFiles: number },
): Promise<GithubDesignEvidence> {
  await assertGithubConnectorIsListable(baseUrl, token);
  const warnings: string[] = [];
  let metadata: unknown;
  try {
    metadata = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_REPOSITORY_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
    });
  } catch (error) {
    if (!connectorIntakeIsRecoverable(error)) throw error;
    warnings.push(
      `Repository metadata connector read failed; continuing with ${
        options.ref ?? 'main'
      } as the ref: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const resolvedRef = options.ref ?? getDefaultBranch(metadata) ?? 'main';

  let readme: GithubDesignEvidence['readme'];
  try {
    const readmePayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_README_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
      ref: resolvedRef,
    });
    const content = await readConnectorTextContent(readmePayload);
    if (content) {
      readme = {
        path: getStringAtKeys(readmePayload, ['path', 'name']) ?? 'README.md',
        content,
      };
    }
  } catch (error) {
    warnings.push(`README connector read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const treePaths = await collectGithubTreePathsWithConnector(baseUrl, token, repo, resolvedRef, warnings);
  const selectedPaths = selectDesignFiles(treePaths, options.maxFiles);
  const files: GithubSnapshotFile[] = [];
  for (const repoPath of selectedPaths) {
    if (readme?.path === repoPath) continue;
    try {
      const contentPayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_RAW_CONTENT_TOOL, {
        owner: repo.owner,
        repo: repo.repo,
        ref: resolvedRef,
        path: repoPath,
      });
      const snapshot = await readConnectorSnapshotContent(repoPath, contentPayload);
      if (snapshot === undefined) {
        warnings.push(`Skipped ${repoPath}: connector returned no readable content`);
        continue;
      }
      files.push({
        repoPath,
        content: snapshot.content,
        bytes: snapshot.bytes,
        source: 'connector',
        ...(snapshot.binary ? { binary: true } : {}),
      });
    } catch (error) {
      warnings.push(`Skipped ${repoPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!readme && files.length === 0) {
    throw new Error(
      [
        'GitHub connector did not produce readable repository evidence through bounded intake.',
        warnings.length ? `Warnings: ${warnings.join(' | ')}` : '',
      ].filter(Boolean).join(' '),
    );
  }

  const metadataObject = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as JsonObject
    : undefined;
  return {
    repo,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
    resolvedRef,
    method: 'connector',
    ...(metadataObject === undefined ? {} : { repositoryMetadata: metadataObject }),
    ...(readme === undefined ? {} : { readme }),
    treePaths,
    files,
    warnings,
  };
}

async function collectGithubEvidenceWithGitClone(
  repo: ParsedGitHubRepo,
  options: { ref?: string; maxFiles: number; reason?: string; warnings?: string[] },
): Promise<GithubDesignEvidence> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-github-context-'));
  const cloneDir = path.join(tmpDir, 'repo');
  try {
    const clone = await cloneGithubRepository(repo, cloneDir, options.ref);
    const paths = await listLocalRepoFiles(cloneDir);
    const selectedPaths = selectDesignFilesWithPreferredReadme(paths, options.maxFiles);
    const files: GithubSnapshotFile[] = [];
    let readme: GithubDesignEvidence['readme'];
    const preferredReadme = preferredReadmePath(paths);
    for (const repoPath of selectedPaths) {
      const absolutePath = path.join(cloneDir, repoPath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) continue;
      const normalizedPath = repoPath.toLowerCase();
      const binary = isBinaryDesignAssetPath(normalizedPath);
      if (binary) {
        if (fileStat.size > MAX_CONTEXT_ASSET_BYTES) continue;
        files.push({
          repoPath,
          content: await readFile(absolutePath),
          bytes: fileStat.size,
          source: 'git-clone',
          binary: true,
        });
        continue;
      }
      if (!isTextSnapshotPath(normalizedPath) || fileStat.size > MAX_CONTEXT_FILE_BYTES) continue;
      const content = await readFile(absolutePath, 'utf8');
      if (!readme && repoPath === preferredReadme) {
        readme = { path: repoPath, content };
        continue;
      }
      files.push({
        repoPath,
        content,
        bytes: Buffer.byteLength(content, 'utf8'),
        source: 'git-clone',
      });
    }
    return {
      repo,
      ...(options.ref === undefined ? {} : { ref: options.ref }),
      ...(options.ref === undefined ? {} : { resolvedRef: options.ref }),
      method: 'git-clone',
      localCloneMethod: clone.method,
      ...(readme === undefined ? {} : { readme }),
      treePaths: paths,
      files,
      warnings: [
        ...(options.warnings ?? []),
        ...clone.warnings,
        ...(options.reason ? [`This-device GitHub intake note: ${options.reason}`] : []),
      ],
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function collectLocalDesignEvidence(
  sourcePath: string,
  options: { maxFiles: number },
): Promise<LocalDesignEvidence> {
  const resolvedSourcePath = path.resolve(sourcePath);
  const sourceStat = await stat(resolvedSourcePath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`local-design-context requires --path to be a directory: ${resolvedSourcePath}`);
  }
  const paths = await listLocalRepoFiles(resolvedSourcePath);
  const selectedPaths = selectDesignFilesWithPreferredReadme(paths, options.maxFiles);
  const files: GithubSnapshotFile[] = [];
  const warnings: string[] = [];
  let readme: LocalDesignEvidence['readme'];
  const preferredReadme = preferredReadmePath(paths);

  for (const repoPath of selectedPaths) {
    const absolutePath = path.join(resolvedSourcePath, repoPath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) continue;
    const normalizedPath = repoPath.toLowerCase();
    const binary = isBinaryDesignAssetPath(normalizedPath);
    if (binary) {
      if (fileStat.size > MAX_CONTEXT_ASSET_BYTES) {
        warnings.push(`Skipped ${repoPath}: binary asset exceeds ${MAX_CONTEXT_ASSET_BYTES} bytes`);
        continue;
      }
      files.push({
        repoPath,
        content: await readFile(absolutePath),
        bytes: fileStat.size,
        source: 'local-folder',
        binary: true,
      });
      continue;
    }
    if (!isTextSnapshotPath(normalizedPath)) continue;
    if (fileStat.size > MAX_CONTEXT_FILE_BYTES) {
      warnings.push(`Skipped ${repoPath}: text file exceeds ${MAX_CONTEXT_FILE_BYTES} bytes`);
      continue;
    }
    const content = await readFile(absolutePath, 'utf8');
    if (!readme && repoPath === preferredReadme) {
      readme = { path: repoPath, content };
      continue;
    }
    files.push({
      repoPath,
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
      source: 'local-folder',
    });
  }

  if (!readme && files.length === 0) {
    throw new Error(`No design-relevant local evidence was selected from ${resolvedSourcePath}`);
  }

  return {
    sourcePath: resolvedSourcePath,
    sourceName: localSourceName(resolvedSourcePath),
    method: 'local-folder',
    treePaths: paths,
    files,
    ...(readme === undefined ? {} : { readme }),
    warnings,
  };
}

function connectorIntakeIsRecoverable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(ACCESS_DENIED|NOT_FOUND|FORBIDDEN|UNAUTHORIZED)\b|access denied|repository not found|not found|forbidden|permission|unauthorized|\b40[134]\b/iu.test(message)) {
    return false;
  }
  return /\b(CONNECTOR_OUTPUT_TOO_LARGE|CONNECTOR_RATE_LIMITED)\b/u.test(message)
    || /did not produce readable repository evidence/iu.test(message)
    || /produced no snapshot files/iu.test(message);
}

function connectorEvidenceNeedsCloneFallback(evidence: GithubDesignEvidence): boolean {
  return evidence.files.length === 0;
}

async function cloneGithubRepository(
  repo: ParsedGitHubRepo,
  cloneDir: string,
  ref: string | undefined,
): Promise<LocalGitHubCloneResult> {
  const repoUrl = /^https?:\/\//iu.test(repo.source) || repo.source.startsWith('git@')
    ? repo.source
    : `https://github.com/${repo.owner}/${repo.repo}.git`;
  const gitArgs = ['clone', '--depth=1', '--single-branch'];
  if (ref) gitArgs.push('--branch', ref);
  gitArgs.push(repoUrl, cloneDir);

  const gitResult = await runProcessBuffered('git', gitArgs, {
    timeoutMs: GITHUB_CLONE_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  if (gitResult.ok) return { method: 'git', warnings: [] };

  await rm(cloneDir, { recursive: true, force: true });
  const gitFailure = summarizeProcessFailure('git clone', gitResult);
  const gh = await checkGitHubCliAuthentication();
  if (!gh.installed) {
    throw new Error(
      `${gitFailure}; GitHub CLI is not installed. Install GitHub CLI or configure local git credentials, then rerun github-design-context.`,
    );
  }
  if (!gh.authenticated) {
    throw new Error(
      `${gitFailure}; GitHub CLI is installed but not authenticated. Run \`gh auth login --web\`, grant this repository, then rerun github-design-context.`,
    );
  }

  const ghArgs = ['repo', 'clone', `${repo.owner}/${repo.repo}`, cloneDir, '--', '--depth=1', '--single-branch'];
  if (ref) ghArgs.push('--branch', ref);
  const ghResult = await runProcessBuffered('gh', ghArgs, {
    timeoutMs: GITHUB_CLONE_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  if (ghResult.ok) {
    return {
      method: 'gh-cli',
      warnings: [
        `Plain git clone could not read the repository, so the intake used authenticated GitHub CLI clone instead. ${gitFailure}`,
      ],
    };
  }

  throw new Error(`${gitFailure}; ${summarizeProcessFailure('gh repo clone', ghResult)}`);
}

async function checkGitHubCliAuthentication(): Promise<{ installed: boolean; authenticated: boolean }> {
  const version = await runProcessBuffered('gh', ['--version'], { timeoutMs: GH_AUTH_TIMEOUT_MS });
  if (!version.ok) return { installed: false, authenticated: false };
  const auth = await runProcessBuffered('gh', ['auth', 'status', '--hostname', 'github.com'], {
    timeoutMs: GH_AUTH_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  return { installed: true, authenticated: auth.ok };
}

async function runProcessBuffered(
  command: string,
  args: string[],
  options: { timeoutMs: number; env?: Record<string, string> },
): Promise<ProcessRunResult> {
  return await new Promise<ProcessRunResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: ProcessRunResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        ...result,
        stdout: redactSensitiveProcessOutput(result.stdout),
        stderr: redactSensitiveProcessOutput(result.stderr),
        ...(result.error === undefined ? {} : { error: redactSensitiveProcessOutput(result.error) }),
      });
    };
    const resolvedCommand = resolveProcessCommand(command);
    const child = spawn(resolvedCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env ?? {}) },
      shell: process.platform === 'win32' && /\.(?:bat|cmd)$/iu.test(resolvedCommand),
    });
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 2_000).unref();
    }, options.timeoutMs);
    timeout.unref();
    child.stdout.on('data', (chunk) => {
      stdout = appendProcessOutput(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendProcessOutput(stderr, chunk);
    });
    child.on('error', (error) => {
      settle({ ok: false, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
      settle({ ok: code === 0 && !timedOut, stdout, stderr, code, ...(timedOut ? { timedOut } : {}) });
    });
  });
}

function resolveProcessCommand(command: string): string {
  if (process.platform !== 'win32' || path.extname(command)) return command;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of ['.cmd', '.exe', '.bat', '']) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

function appendProcessOutput(current: string, chunk: unknown): string {
  return `${current}${String(chunk)}`.slice(-MAX_PROCESS_OUTPUT_CHARS);
}

function summarizeProcessFailure(label: string, result: ProcessRunResult): string {
  const details = [
    result.timedOut ? `timed out after ${Math.round(GITHUB_CLONE_TIMEOUT_MS / 1000)}s` : '',
    result.error,
    result.stderr.trim(),
    result.stdout.trim(),
    result.code === undefined || result.code === 0 ? '' : `exit code ${result.code}`,
  ].filter(Boolean);
  return `${label} failed${details.length ? `: ${details.join(' | ')}` : ''}`;
}

function redactSensitiveProcessOutput(value: string): string {
  return value
    .replace(/https?:\/\/[^@\s]+@github\.com/giu, 'https://***@github.com')
    .replace(/(gh[opsu]_[A-Za-z0-9_]+)/gu, '***');
}

async function listLocalRepoFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const normalized = relativePath.toLowerCase();
      if (entry.isDirectory()) {
        if (shouldSkipRepoPath(`${normalized}/`)) continue;
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && !shouldSkipRepoPath(normalized)) files.push(relativePath);
    }
  };
  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function listAuditFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const normalized = relativePath.toLowerCase();
      if (entry.isDirectory()) {
        if (shouldSkipAuditPath(`${normalized}/`)) continue;
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && !shouldSkipAuditPath(normalized)) files.push(relativePath);
    }
  };
  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function shouldSkipAuditPath(normalizedPath: string): boolean {
  return /(^|\/)(node_modules|vendor|dist|coverage|\.next|\.nuxt|\.git|out|target|storybook-static)\//u.test(normalizedPath)
    || /(^|\/)(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb|\.ds_store)$/u.test(normalizedPath);
}

async function writeGithubDesignEvidence(outputPath: string, evidence: GithubDesignEvidence): Promise<GithubDesignEvidence> {
  const resolvedOutputPath = path.resolve(outputPath);
  const snapshotRoot = githubSnapshotRoot(resolvedOutputPath, evidence.repo);
  const writtenFiles: GithubSnapshotFile[] = [];
  for (const file of evidence.files) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const fileOutputPath = path.join(snapshotRoot, safeRelativePath);
    await ensureParentDirectory(fileOutputPath);
    if (file.binary) {
      await writeFile(fileOutputPath, file.content);
    } else {
      await writeFile(fileOutputPath, file.content, 'utf8');
    }
    writtenFiles.push({ ...file, outputPath: path.relative(process.cwd(), fileOutputPath).split(path.sep).join('/') });
  }
  const materializedFiles = await materializePackageEvidenceArtifacts(writtenFiles);
  const nextEvidence = { ...evidence, files: writtenFiles, materializedFiles };
  await ensureParentDirectory(resolvedOutputPath);
  await writeFile(resolvedOutputPath, renderGithubDesignEvidenceMarkdown(nextEvidence), 'utf8');
  return nextEvidence;
}

async function writeLocalDesignEvidence(outputPath: string, evidence: LocalDesignEvidence): Promise<LocalDesignEvidence> {
  const resolvedOutputPath = path.resolve(outputPath);
  const snapshotRoot = localSnapshotRoot(resolvedOutputPath, evidence.sourcePath);
  const writtenFiles: GithubSnapshotFile[] = [];
  for (const file of evidence.files) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const fileOutputPath = path.join(snapshotRoot, safeRelativePath);
    await ensureParentDirectory(fileOutputPath);
    if (file.binary) {
      await writeFile(fileOutputPath, file.content);
    } else {
      await writeFile(fileOutputPath, file.content, 'utf8');
    }
    writtenFiles.push({ ...file, outputPath: path.relative(process.cwd(), fileOutputPath).split(path.sep).join('/') });
  }
  const materializedFiles = await materializePackageEvidenceArtifacts(writtenFiles);
  const nextEvidence = { ...evidence, files: writtenFiles, materializedFiles };
  await ensureParentDirectory(resolvedOutputPath);
  await writeFile(resolvedOutputPath, renderLocalDesignEvidenceMarkdown(nextEvidence), 'utf8');
  return nextEvidence;
}

async function materializePackageEvidenceArtifacts(files: GithubSnapshotFile[]): Promise<string[]> {
  const materialized: string[] = [];
  for (const file of packageBuildAssetCandidates(files)) {
    const target = packageBuildAssetTarget(file.repoPath);
    if (target === undefined) continue;
    if (await writePackageFileIfMissing(target, file.content, file.binary === true)) {
      materialized.push(target);
    }
  }
  for (const file of packageFontAssetCandidates(files)) {
    const target = packageFontAssetTarget(file.repoPath);
    if (target === undefined) continue;
    if (await writePackageFileIfMissing(target, file.content, file.binary === true)) {
      materialized.push(target);
    }
  }
  for (const file of packageSourceExampleCandidates(files)) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const target = path.join('source_examples', safeRelativePath).split(path.sep).join('/');
    if (await writePackageFileIfMissing(target, file.content, false)) {
      materialized.push(target);
    }
  }
  return materialized;
}

function packageBuildAssetCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  return files
    .filter((file) => file.binary === true && packageBuildAssetTarget(file.repoPath) !== undefined)
    .slice(0, 8);
}

function packageBuildAssetTarget(repoPath: string): string | undefined {
  const safeRelativePath = safeRepoRelativePath(repoPath);
  if (!safeRelativePath) return undefined;
  if (!/\.(svg|png|jpe?g|webp|ico)$/iu.test(safeRelativePath)) return undefined;
  if (!/(^|\/)[^/]*(logo|icon|tray|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/iu.test(safeRelativePath)) return undefined;
  const parts = safeRelativePath.split('/');
  const buildIndex = parts.findIndex((part) => /^build$/iu.test(part));
  const assetRootIndex = buildIndex === -1
    ? parts.findIndex((part) => /^(resources|public-resources)$/iu.test(part))
    : buildIndex;
  if (assetRootIndex === -1 || assetRootIndex === parts.length - 1) return undefined;
  return path.join('build', ...parts.slice(assetRootIndex + 1)).split(path.sep).join('/');
}

function packageFontAssetCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  return files
    .filter((file) => packageFontAssetTarget(file.repoPath) !== undefined)
    .slice(0, 8);
}

function packageFontAssetTarget(repoPath: string): string | undefined {
  const safeRelativePath = safeRepoRelativePath(repoPath);
  if (!safeRelativePath) return undefined;
  const isFontBinary = /\.(ttf|otf|woff2?)$/iu.test(safeRelativePath);
  const isFontStylesheet = /(^|\/)(fonts?|assets\/fonts?|public\/fonts?|resources\/fonts?)\//iu.test(safeRelativePath)
    && /\.css$/iu.test(safeRelativePath);
  if (!isFontBinary && !isFontStylesheet) return undefined;
  const parts = safeRelativePath.split('/');
  const fontRootIndex = parts.findIndex((part) => /^fonts?$/iu.test(part));
  if (fontRootIndex !== -1 && fontRootIndex < parts.length - 1) {
    return path.join('fonts', ...parts.slice(fontRootIndex + 1)).split(path.sep).join('/');
  }
  const assetFontIndex = parts.findIndex((part, index) =>
    /^(assets?|public|resources)$/iu.test(part) && /^fonts?$/iu.test(parts[index + 1] ?? ''),
  );
  if (assetFontIndex !== -1 && assetFontIndex < parts.length - 2) {
    return path.join('fonts', ...parts.slice(assetFontIndex + 2)).split(path.sep).join('/');
  }
  if (!isFontBinary) return undefined;
  return path.join('fonts', path.basename(safeRelativePath)).split(path.sep).join('/');
}

function packageSourceExampleCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  const seen = new Set<string>();
  const candidates = files
    .filter((file) => !file.binary && typeof file.content === 'string')
    .filter((file) => /\.(tsx|ts|jsx|js)$/iu.test(file.repoPath))
    .filter((file) => {
      const name = sourceComponentNameFromPath(file.repoPath);
      if (name === undefined || !isSourceSurfaceComponentName(name)) return false;
      const key = normalizeAnchorText(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => sourceExamplePriority(right.repoPath) - sourceExamplePriority(left.repoPath));
  return candidates.slice(0, 6);
}

function sourceExamplePriority(repoPath: string): number {
  const category = designEvidenceInventoryCategory(repoPath);
  if (category === 'App shell and navigation') return 4;
  if (category === 'Chat and input surfaces') return 3;
  if (category === 'Reusable components') return 2;
  return 1;
}

async function writePackageFileIfMissing(relativePath: string, content: string | Buffer, binary: boolean): Promise<boolean> {
  const safeRelativePath = safeRepoRelativePath(relativePath);
  if (!safeRelativePath) return false;
  const targetPath = path.resolve(process.cwd(), safeRelativePath);
  const cwd = path.resolve(process.cwd());
  if (targetPath !== cwd && !targetPath.startsWith(`${cwd}${path.sep}`)) return false;
  try {
    await stat(targetPath);
    return false;
  } catch (error) {
    if (!isAbsenceError(error)) throw error;
  }
  await ensureParentDirectory(targetPath);
  if (binary) {
    await writeFile(targetPath, content);
  } else {
    await writeFile(targetPath, content, 'utf8');
  }
  return true;
}

function renderGithubDesignEvidenceMarkdown(evidence: GithubDesignEvidence): string {
  const inventory = buildDesignEvidenceInventory(evidence.files);
  const lines = [
    `# GitHub Design Evidence: ${evidence.repo.owner}/${evidence.repo.repo}`,
    '',
    `Source: ${evidence.repo.source}`,
    `Read method: ${evidence.method}`,
    ...(evidence.localCloneMethod ? [`Local clone method: ${evidence.localCloneMethod === 'gh-cli' ? 'GitHub CLI authenticated clone' : 'git clone'}`] : []),
    `Ref: ${evidence.resolvedRef ?? evidence.ref ?? 'default branch'}`,
    `Repository paths discovered: ${evidence.treePaths.length}`,
    `Snapshot files written: ${evidence.files.length}`,
    '',
    '## Intake Status',
    '',
    evidence.method === 'connector'
      ? '- Connector platform fallback was used through `od tools connectors`.'
      : '- This-device intake was used through local git or GitHub CLI.',
  ];
  if (evidence.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...evidence.warnings.map((warning) => `- ${warning}`));
  }
  if (evidence.readme) {
    lines.push('', `## README (${evidence.readme.path})`, '', '```md', excerpt(evidence.readme.content), '```');
  }
  if (inventory.length > 0) {
    lines.push('', '## Source Evidence Inventory', '');
    for (const section of inventory) {
      lines.push(`### ${section.title}`, '', section.description, '');
      for (const file of section.files) {
        const kind = file.binary ? 'binary asset' : 'source';
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${kind})`);
      }
      lines.push('');
    }
  }
  if (evidence.files.length > 0) {
    lines.push('', '## Files Inspected', '');
    for (const file of evidence.files) {
      const kind = file.binary ? ', binary asset' : '';
      lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${file.bytes} bytes, ${file.source}${kind})`);
    }
    const binaryFiles = evidence.files.filter((file) => file.binary);
    if (binaryFiles.length > 0) {
      lines.push('', '## Binary Assets Preserved', '');
      for (const file of binaryFiles) {
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''}`);
      }
    }
    const textFiles = evidence.files.filter((file): file is GithubSnapshotFile & { content: string } => !file.binary && typeof file.content === 'string');
    if (textFiles.length > 0) {
      lines.push('', '## Design-Relevant Excerpts', '');
      for (const file of textFiles.slice(0, 12)) {
        lines.push(`### ${file.repoPath}`, '', fencedExcerpt(file.repoPath, file.content), '');
      }
    }
  }
  if (evidence.materializedFiles && evidence.materializedFiles.length > 0) {
    lines.push('', '## Package Files Materialized', '');
    for (const file of evidence.materializedFiles) {
      lines.push(`- \`${file}\``);
    }
  }
  lines.push(
    '',
    '## Next Design-System Work',
    '',
    '- Use these source paths and snapshots as evidence before writing `DESIGN.md`.',
    '- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.',
    '- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.',
    '- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.',
    ...UI_KIT_ENTRY_GUIDANCE,
    '- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.',
    '- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.',
    '- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.',
    '- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.',
    '- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.',
    '',
  );
  return lines.join('\n');
}

function renderLocalDesignEvidenceMarkdown(evidence: LocalDesignEvidence): string {
  const inventory = buildDesignEvidenceInventory(evidence.files);
  const lines = [
    `# Local Design Evidence: ${evidence.sourceName}`,
    '',
    `Source path: ${evidence.sourcePath}`,
    `Read method: ${evidence.method}`,
    `Local paths discovered: ${evidence.treePaths.length}`,
    `Snapshot files written: ${evidence.files.length}`,
    '',
    '## Intake Status',
    '',
    '- Local source folder was read through bounded `od tools connectors local-design-context` intake.',
  ];
  if (evidence.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...evidence.warnings.map((warning) => `- ${warning}`));
  }
  if (evidence.readme) {
    lines.push('', `## README (${evidence.readme.path})`, '', '```md', excerpt(evidence.readme.content), '```');
  }
  if (inventory.length > 0) {
    lines.push('', '## Source Evidence Inventory', '');
    for (const section of inventory) {
      lines.push(`### ${section.title}`, '', section.description, '');
      for (const file of section.files) {
        const kind = file.binary ? 'binary asset' : 'source';
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${kind})`);
      }
      lines.push('');
    }
  }
  if (evidence.files.length > 0) {
    lines.push('', '## Files Inspected', '');
    for (const file of evidence.files) {
      const kind = file.binary ? ', binary asset' : '';
      lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${file.bytes} bytes, ${file.source}${kind})`);
    }
    const binaryFiles = evidence.files.filter((file) => file.binary);
    if (binaryFiles.length > 0) {
      lines.push('', '## Binary Assets Preserved', '');
      for (const file of binaryFiles) {
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''}`);
      }
    }
    const textFiles = evidence.files.filter((file): file is GithubSnapshotFile & { content: string } => !file.binary && typeof file.content === 'string');
    if (textFiles.length > 0) {
      lines.push('', '## Design-Relevant Excerpts', '');
      for (const file of textFiles.slice(0, 12)) {
        lines.push(`### ${file.repoPath}`, '', fencedExcerpt(file.repoPath, file.content), '');
      }
    }
  }
  if (evidence.materializedFiles && evidence.materializedFiles.length > 0) {
    lines.push('', '## Package Files Materialized', '');
    for (const file of evidence.materializedFiles) {
      lines.push(`- \`${file}\``);
    }
  }
  lines.push(
    '',
    '## Next Design-System Work',
    '',
    '- Use these local source paths and snapshots as evidence before writing `DESIGN.md`.',
    '- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.',
    '- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.',
    '- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.',
    ...UI_KIT_ENTRY_GUIDANCE,
    '- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.',
    '- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.',
    '- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.',
    '- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.',
    '- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.',
    '',
  );
  return lines.join('\n');
}

function buildDesignEvidenceInventory(files: GithubSnapshotFile[]): GithubEvidenceInventorySection[] {
  const descriptions: Record<GithubEvidenceInventoryCategory, string> = {
    'Product docs and manifests': 'Use these to understand product purpose, dependency stack, scripts, and public naming.',
    'Brand assets and icons': 'Preserve source build/runtime paths: files under `build/` should be copied back into root `build/` with their original filenames, while non-build logos, avatars, or wordmarks can be copied into `assets/`. Reflect the preserved files in `preview/brand-assets.html`.',
    Fonts: 'Preserve source font files or declarations into `fonts/` and bind them in `colors_and_type.css` when applicable.',
    'Theme, tokens, and styling': 'Extract concrete color, typography, spacing, radius, shadow, and theme-variable values from these files.',
    'App shell and navigation': 'Use these to recreate the product frame, navigation density, sidebars, window chrome, and layout rhythm.',
    'Chat and input surfaces': 'Use these for the applied UI-kit surface and interaction model when the product includes chat or composer flows.',
    'Reusable components': 'Use these to derive buttons, inputs, cards, dialogs, avatars, selectors, menus, and feedback states.',
    'Other design evidence': 'Inspect these only after the primary design evidence above has been used.',
  };
  const order: GithubEvidenceInventoryCategory[] = [
    'Product docs and manifests',
    'Brand assets and icons',
    'Fonts',
    'Theme, tokens, and styling',
    'App shell and navigation',
    'Chat and input surfaces',
    'Reusable components',
    'Other design evidence',
  ];
  const grouped = new Map<GithubEvidenceInventoryCategory, GithubSnapshotFile[]>();
  for (const file of files) {
    const category = designEvidenceInventoryCategory(file.repoPath);
    const files = grouped.get(category) ?? [];
    files.push(file);
    grouped.set(category, files);
  }
  return order
    .map((title) => {
      const files = grouped.get(title) ?? [];
      return { title, description: descriptions[title], files };
    })
    .filter((section) => section.files.length > 0);
}

function designEvidenceInventoryCategory(repoPath: string): GithubEvidenceInventoryCategory {
  const normalized = repoPath.toLowerCase();
  if (/(^|\/)(readme\.(md|mdx|txt|rst)|package\.json)$/u.test(normalized)) {
    return 'Product docs and manifests';
  }
  if (/(^|\/)(assets?|public|resources|build)\/.*(logo|icon|avatar|tray|brand|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) {
    return 'Brand assets and icons';
  }
  if (/(^|\/)(fonts?|assets?\/fonts?|public\/fonts?|resources\/fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized) || /\.(ttf|otf|woff2?)$/u.test(normalized)) {
    return 'Fonts';
  }
  if (/(^|\/)(tailwind|theme|themes?|themeprovider|antdprovider|tokens?|colors?|typography|design-system|design|constant|constants|env|style|styles)\.(config\.)?(ts|tsx|js|jsx|json|css|scss|less|md)$/u.test(normalized)
    || /\/(context|providers?|theme|styles?|config|utils?)\//u.test(normalized)
    || /\.(css|scss|less)$/u.test(normalized)) {
    return 'Theme, tokens, and styling';
  }
  if (/\/(app|layout|shell|navbar|sidebar|nav|chrome)\//u.test(normalized)
    || /\/pages\/home\/(homepage|navbar)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)
    || /(navbar|sidebar|layout|shell|window|workspace)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'App shell and navigation';
  }
  if (/\/(chat|inputbar|composer|messages?|assistants?|topics?|models?)\//u.test(normalized)
    || /(chat|inputbar|composer|message|assistant|topic|selectmodel|updateapp|model)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'Chat and input surfaces';
  }
  if (/\/(components?|ui|primitives?)\//u.test(normalized)
    || /(button|card|dialog|modal|input|form|table|badge|avatar|toast|menu|tabs|popover|select|settings)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'Reusable components';
  }
  return 'Other design evidence';
}

function excerpt(content: string): string {
  return content.length > MAX_MARKDOWN_EXCERPT_CHARS
    ? `${content.slice(0, MAX_MARKDOWN_EXCERPT_CHARS)}\n...`
    : content;
}

function fencedExcerpt(repoPath: string, content: string): string {
  const ext = path.extname(repoPath).replace('.', '').toLowerCase();
  const info = ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'js' ? ext : ext === 'json' ? 'json' : ext === 'css' || ext === 'scss' || ext === 'less' ? ext : '';
  return `\`\`\`${info}\n${excerpt(content)}\n\`\`\``;
}

async function runGithubDesignContext(options: ParsedOptions): Promise<ToolCliResult> {
  if (!options.repo) return fail('github-design-context requires --repo owner/repo');
  const repo = parseGithubRepo(options.repo);
  const maxFiles = options.maxFiles ?? DEFAULT_GITHUB_CONTEXT_MAX_FILES;
  const outputPath = options.outputPath ?? defaultGithubContextOutputPath(repo);
  const baseUrl = daemonUrl();
  const token = toolToken();
  let evidence: GithubDesignEvidence;

  try {
    evidence = await collectGithubEvidenceWithGitClone(repo, {
      ...(options.ref === undefined ? {} : { ref: options.ref }),
      maxFiles,
    });
  } catch (localError) {
    const localReason = localError instanceof Error ? localError.message : String(localError);
    const connectorReady = !('error' in baseUrl) && typeof token === 'string';
    if (connectorReady) {
      let connectorReason: string | undefined;
      try {
        evidence = await collectGithubEvidenceWithConnector(baseUrl, token, repo, {
          ...(options.ref === undefined ? {} : { ref: options.ref }),
          maxFiles,
        });
        if (connectorEvidenceNeedsCloneFallback(evidence)) {
          throw new Error('GitHub connector bounded intake produced no snapshot files.');
        }
        evidence.warnings.unshift(
          `This-device GitHub intake failed; used Composio GitHub connector fallback. Reason: ${localReason}`,
        );
      } catch (connectorError) {
        connectorReason = connectorError instanceof Error ? connectorError.message : String(connectorError);
        if (options.requireConnector) {
          return fail('Required GitHub repository intake could not read the repository through git, GitHub CLI, or connector', {
            repo: `${repo.owner}/${repo.repo}`,
            localReason,
            connectorReason,
            nextStep: 'Run `gh auth login --web`, configure local git credentials, or connect GitHub through Composio with access to this repository. Do not draft design-system files from URL text alone.',
          });
        }
        throw new Error(
          `GitHub repository intake failed through this device and connector fallback. This device: ${localReason}; Connector: ${connectorReason}`,
        );
      }
    } else {
      const connectorReason = 'error' in baseUrl
        ? baseUrl.error
        : typeof token === 'string'
          ? 'OD_TOOL_TOKEN is not available'
          : token.error;
      if (options.requireConnector) {
        return fail('Required GitHub repository intake could not read the repository through git, GitHub CLI, or connector', {
          repo: `${repo.owner}/${repo.repo}`,
          localReason,
          connectorReason,
          nextStep: 'Run `gh auth login --web`, configure local git credentials, or connect GitHub through Composio with access to this repository. Do not draft design-system files from URL text alone.',
        });
      }
      throw localError;
    }
  }

  const written = await writeGithubDesignEvidence(outputPath, evidence);
  writeJson({
    ok: true,
    repo: `${repo.owner}/${repo.repo}`,
    method: written.method,
    ...(written.localCloneMethod === undefined ? {} : { localCloneMethod: written.localCloneMethod }),
    outputPath: path.relative(process.cwd(), path.resolve(outputPath)).split(path.sep).join('/'),
    snapshotFiles: written.files.map((file) => file.outputPath).filter(Boolean),
    materializedFiles: written.materializedFiles ?? [],
    warnings: written.warnings,
  });
  return { exitCode: 0 };
}

async function runLocalDesignContext(options: ParsedOptions): Promise<ToolCliResult> {
  if (!options.localPath) return fail('local-design-context requires --path /path/to/project');
  const maxFiles = options.maxFiles ?? DEFAULT_LOCAL_CONTEXT_MAX_FILES;
  const outputPath = options.outputPath ?? defaultLocalContextOutputPath(options.localPath);
  const evidence = await collectLocalDesignEvidence(options.localPath, { maxFiles });
  const written = await writeLocalDesignEvidence(outputPath, evidence);
  writeJson({
    ok: true,
    sourcePath: written.sourcePath,
    method: written.method,
    outputPath: path.relative(process.cwd(), path.resolve(outputPath)).split(path.sep).join('/'),
    snapshotFiles: written.files.map((file) => file.outputPath).filter(Boolean),
    materializedFiles: written.materializedFiles ?? [],
    warnings: written.warnings,
  });
  return { exitCode: 0 };
}

async function runDesignSystemPackageAudit(options: ParsedOptions): Promise<ToolCliResult> {
  const projectPath = path.resolve(options.localPath ?? '.');
  const audit = await auditDesignSystemPackage(projectPath, { referencePackage: options.referencePackage === true });
  const ok = audit.ok && (options.failOnWarnings !== true || audit.warnings.length === 0);
  writeJson(options.failOnWarnings === true ? { ...audit, ok } : audit);
  return { exitCode: ok ? 0 : 1 };
}

export async function auditDesignSystemPackage(
  projectPath: string,
  options: { referencePackage?: boolean } = {},
): Promise<DesignSystemPackageAudit> {
  const projectStat = await stat(projectPath);
  if (!projectStat.isDirectory()) {
    throw new Error(`design-system-package-audit requires --path to be a directory: ${projectPath}`);
  }
  const files = await listAuditFiles(projectPath);
  const fileSet = new Set(files);
  const issues: DesignSystemAuditIssue[] = [];
  const addIssue = (severity: DesignSystemAuditSeverity, code: string, message: string, issuePath?: string) => {
    issues.push({
      severity,
      code,
      message,
      ...(issuePath === undefined ? {} : { path: issuePath }),
    });
  };
  const requireFile = (filePath: string, message: string) => {
    if (!fileSet.has(filePath)) addIssue('error', 'missing_required_file', message, filePath);
  };
  const requireContent = async (
    filePath: string,
    minBytes: number,
    code: string,
    message: string,
    validate?: (text: string) => string | undefined,
  ) => {
    if (!fileSet.has(filePath)) return;
    const text = await readAuditText(projectPath, filePath);
    if (text === undefined) return;
    if (Buffer.byteLength(text, 'utf8') < minBytes) {
      addIssue('error', code, message, filePath);
      return;
    }
    const validationMessage = validate?.(text);
    if (validationMessage) addIssue('error', code, validationMessage, filePath);
  };

  if (options.referencePackage === true) {
    if (!fileSet.has('DESIGN.md')) {
      addIssue('warning', 'missing_open_design_rules', 'Reference packages may omit DESIGN.md, but generated Open Design packages must include it as the canonical rules file.', 'DESIGN.md');
    }
  } else {
    requireFile('DESIGN.md', 'Claude Design-style packages need DESIGN.md as the canonical system rules.');
  }
  requireFile('README.md', 'Claude Design-style packages need README.md so the system is reusable outside the current run.');
  requireFile('SKILL.md', 'Claude Design-style packages need SKILL.md with agent-facing usage instructions.');
  requireFile('colors_and_type.css', 'Claude Design-style packages need colors_and_type.css for reusable color, type, spacing, radius, and state tokens.');
  await requireContent('DESIGN.md', 800, 'thin_design_rules', 'DESIGN.md is too thin to be a reusable rules document; include source-backed context, foundations, tokens, components, motion, voice, and anti-patterns.', validateDesignRules);
  await requireContent('README.md', 600, 'thin_readme', 'README.md is too thin to explain the package, source evidence, generated files, and reuse workflow.', requireMarkdownHeading);
  await requireContent('SKILL.md', 500, 'thin_skill', 'SKILL.md is too thin to guide future agents on how to use this design system.', validateSkillInstructions);
  await requireContent('colors_and_type.css', 500, 'thin_token_css', 'colors_and_type.css is too thin to carry reusable color, typography, spacing, radius, and state tokens.', validateTokenCss);
  if (fileSet.has('SKILL.md')) {
    const skillText = await readAuditText(projectPath, 'SKILL.md');
    if (skillText !== undefined && !skillHasAgentFrontmatter(skillText)) {
      addIssue(
        'warning',
        'missing_skill_frontmatter',
        'SKILL.md should include Claude-style YAML frontmatter with name, description, and user-invocable so future agents can discover and invoke the design system package.',
        'SKILL.md',
      );
    }
    if (skillText !== undefined && !skillHasReusableSections(skillText)) {
      addIssue(
        'warning',
        'skill_missing_reuse_sections',
        'SKILL.md should read like a reusable Claude Design skill package: include What is inside, Source context, When to use, How to use, and design-system highlights grounded in source evidence.',
        'SKILL.md',
      );
    }
  }
  const readmeText = fileSet.has('README.md') ? await readAuditText(projectPath, 'README.md') : undefined;
  if (fileSet.has('README.md')) {
    if (readmeText !== undefined && !readmeHasProductOverview(readmeText)) {
      addIssue(
        'warning',
        'readme_missing_product_overview',
        'README.md should include a Claude-style Product Overview or Product Context section that explains the source product, primary surfaces, and core capabilities instead of only listing tokens or generated files.',
        'README.md',
      );
    }
    if (readmeText !== undefined && !readmeHasPackageReuseGuide(readmeText)) {
      addIssue(
        'warning',
        'readme_missing_package_reuse_guide',
        'README.md should work as a Claude Design package guide: list source/context references, package contents, preview cards, preserved assets/fonts/build artifacts, ui_kits/app, and a concrete reuse or review workflow.',
        'README.md',
      );
    }
  }
  for (const docPath of ['DESIGN.md', 'README.md', 'SKILL.md', 'ui_kits/app/README.md']) {
    if (!fileSet.has(docPath)) continue;
    const text = await readAuditText(projectPath, docPath);
    const staleReferences = text ? stalePackageReferences(text) : [];
    if (staleReferences.length > 0) {
      addIssue(
        options.referencePackage === true ? 'warning' : 'error',
        'stale_package_manifest_references',
        `Package documentation still references old scaffold paths: ${staleReferences.join(', ')}. Rewrite it to point at preview/* focused cards and ui_kits/app/.`,
        docPath,
      );
    }
  }
  for (const filePath of protocolTitleAuditFiles(files)) {
    const text = await readAuditText(projectPath, filePath);
    const protocolTitle = text ? protocolDerivedDesignSystemTitle(text) : undefined;
    if (!protocolTitle) continue;
    addIssue(
      options.referencePackage === true ? 'warning' : 'error',
      'protocol_derived_title',
      `${filePath} uses "${protocolTitle}" as a product/design-system title. Derive the package title from source evidence or repository slug instead of URL protocol text.`,
      filePath,
    );
  }

  const previewFiles = files.filter((filePath) => /^preview\/.+\.html$/u.test(filePath));
  if (previewFiles.length < 6) {
    addIssue('error', 'insufficient_preview_cards', `Expected at least 6 focused preview HTML cards, found ${previewFiles.length}.`, 'preview/');
  }
  requirePreviewCategory(previewFiles, /^preview\/colors-[^/]+\.html$/u, 'missing_color_preview', 'Expected at least one focused color preview card such as preview/colors-primary.html.', addIssue);
  requirePreviewCategory(previewFiles, /^preview\/typography-specimens\.html$/u, 'missing_typography_preview', 'Expected preview/typography-specimens.html.', addIssue);
  requirePreviewCategory(previewFiles, /^preview\/spacing-[^/]+\.html$/u, 'missing_spacing_preview', 'Expected at least one focused spacing preview card such as preview/spacing-tokens.html.', addIssue);
  requirePreviewCategory(previewFiles, /^preview\/components-[^/]+\.html$/u, 'missing_component_preview', 'Expected at least one focused component preview card such as preview/components-buttons.html.', addIssue);
  if (readmeText !== undefined && !readmeHasPreviewManifest(readmeText, previewFiles)) {
    addIssue(
      'warning',
      'readme_missing_preview_manifest',
      'README.md should include a concrete preview manifest that lists the generated preview/*.html cards so reviewers and future agents know what to inspect.',
      'README.md',
    );
  }

  const oldPreviewFiles = previewFiles.filter((filePath) => /preview\/(colors-node-types|colors-ui-palette|typography-scale|spacing-system|logo-variants)\.html$/u.test(filePath));
  if (oldPreviewFiles.length > 0) {
    addIssue('warning', 'old_generic_preview_names', `Replace old generic preview names with Claude-style focused cards: ${oldPreviewFiles.join(', ')}.`, 'preview/');
  }
  if (files.some((filePath) => filePath.startsWith('ui_kits/generated_interface/'))) {
    const level = fileSet.has('ui_kits/app/index.html') ? 'warning' : 'error';
    addIssue(level, 'old_generated_interface', 'Replace ui_kits/generated_interface/ with the reusable Claude-style ui_kits/app/ package.', 'ui_kits/generated_interface/');
  }

  requireFile('ui_kits/app/index.html', 'Claude Design-style packages need an applied interface kit at ui_kits/app/index.html.');
  await requireContent('ui_kits/app/index.html', 900, 'thin_ui_kit', 'ui_kits/app/index.html is too thin; include an applied interface example with real layout, components, and states.', validateHtmlDocument);
  if (!fileSet.has('ui_kits/app/README.md')) {
    addIssue('warning', 'missing_ui_kit_readme', 'Add ui_kits/app/README.md so future projects know how to reuse the applied UI kit.', 'ui_kits/app/README.md');
  } else {
    const uiKitReadmeText = await readAuditText(projectPath, 'ui_kits/app/README.md');
    if (uiKitReadmeText !== undefined && !uiKitReadmeHasReuseGuide(uiKitReadmeText)) {
      addIssue(
        'warning',
        'ui_kit_readme_missing_reuse_guide',
        'ui_kits/app/README.md should document the applied kit structure, component files, usage workflow, design notes, and source basis so future agents can reuse it like a Claude Design package.',
        'ui_kits/app/README.md',
      );
    }
  }
  await Promise.all(previewFiles.map((filePath) =>
    requireContent(filePath, 900, 'thin_preview_card', `${filePath} is too thin to be a reviewable focused preview card.`, validateHtmlDocument),
  ));

  const sourceManifest = await readAuditText(projectPath, 'context/source-context.md');
  const evidenceNotes = files.filter((filePath) => /^context\/(github|local-code)\/[^/]+\.md$/u.test(filePath));
  const evidenceTexts = await Promise.all(evidenceNotes.map(async (filePath) => ({
    filePath,
    text: await readAuditText(projectPath, filePath) ?? '',
  })));
  const evidenceText = evidenceTexts.map((item) => item.text).join('\n');
  if (sourceManifest !== undefined) {
    if (manifestHasLinkedGithub(sourceManifest) && !evidenceNotes.some((filePath) => filePath.startsWith('context/github/'))) {
      addIssue('error', 'missing_github_evidence', 'Linked GitHub repositories require context/github/*.md evidence notes before final design-system files are trusted.', 'context/github/');
    }
    if (manifestHasLinkedLocalFolder(sourceManifest) && !evidenceNotes.some((filePath) => filePath.startsWith('context/local-code/'))) {
      addIssue('error', 'missing_local_evidence', 'Linked local folders require context/local-code/*.md evidence notes before final design-system files are trusted.', 'context/local-code/');
    }
  }
  for (const evidence of evidenceTexts) {
    if (/Snapshot files written:\s*0\b/iu.test(evidence.text)) {
      addIssue('error', 'empty_evidence_snapshot', 'Evidence note reports zero snapshot files; rerun bounded intake before drafting final artifacts.', evidence.filePath);
    }
  }
  if (evidenceNotes.length > 0 && !files.some((filePath) => /^context\/(github|local-code)\/[^/]+\/files\//u.test(filePath))) {
    addIssue('error', 'missing_evidence_snapshot_files', 'Evidence notes exist but no command-written snapshot files were found under context/github/*/files/ or context/local-code/*/files/.', 'context/');
  }

  const hasAssetEvidence = evidenceHasAssets(evidenceText) || files.some((filePath) => /^context\/(github|local-code)\/.+\/files\/.+\.(svg|png|jpe?g|webp|ico)$/iu.test(filePath));
  const hasFontEvidence = evidenceHasFonts(evidenceText) || files.some((filePath) => /^context\/(github|local-code)\/.+\/files\/.+\.(ttf|otf|woff2?)$/iu.test(filePath));
  const evidenceAssetFiles = evidenceSnapshotFiles(files, evidenceText, /\.(svg|png|jpe?g|webp|ico)$/iu);
  const evidenceBuildAssetFiles = evidenceSnapshotFiles(files, evidenceText, /(^|\/)(build|resources|public-resources)\/[^`\s)]*(logo|icon|tray|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/iu);
  const evidenceFontFiles = evidenceSnapshotFiles(files, evidenceText, /\.(ttf|otf|woff2?)$/iu);
  const preservedAssetFiles = files.filter((filePath) => /^assets\/.+\.(svg|png|jpe?g|webp|ico)$/iu.test(filePath));
  const preservedBuildAssetFiles = files.filter((filePath) => /^build\/.+\.(svg|png|jpe?g|webp|ico)$/iu.test(filePath));
  const preservedFontFiles = files.filter((filePath) => /^fonts\/.+\.(ttf|otf|woff2?|css)$/iu.test(filePath));
  const evidenceComponentNames = sourceComponentNamesFromEvidence(files, evidenceText);
  const evidenceSurfaceComponentNames = evidenceComponentNames.filter(isSourceSurfaceComponentName);
  const suggestedComponentNames = evidenceSurfaceComponentNames.length >= 3
    ? evidenceSurfaceComponentNames
    : evidenceComponentNames;
  const visualSourceAnchors = await sourceComponentAnchorsInVisualArtifacts(projectPath, files, evidenceComponentNames);
  const componentPreviewGaps = await sourceComponentPreviewGaps(projectPath, previewFiles, evidenceSurfaceComponentNames);
  const sourceExampleAnchors = sourceComponentExamplesInPackage(files, evidenceComponentNames);
  const hasComponentEvidence = evidenceHasReusableComponents(evidenceText)
    || files.some((filePath) => /^context\/(github|local-code)\/.+\/files\/.+(?:\/|^)(components?|ui|app|layout|shell|navbar|sidebar|chat|input|composer|assistant|message|model)[^/]*\/?.*\.(tsx|ts|jsx|js|css|scss|less)$/iu.test(filePath));
  const hasChatUiEvidence = evidenceHasChatInterface(evidenceText)
    || files.some((filePath) => /^context\/(github|local-code)\/.+\/files\/.+(?:pages\/home|components\/app|inputbar|messages?|chat|assistants?|sidebar).*\.(tsx|ts|jsx|js|css|scss|less)$/iu.test(filePath));
  const uiKitComponentFiles = files.filter((filePath) => /^ui_kits\/app\/components\/.+\.(jsx|tsx|js|ts|css|html)$/iu.test(filePath));
  const uiKitScriptComponentFiles = uiKitComponentFiles.filter((filePath) => /\.(jsx|tsx|js|ts)$/iu.test(filePath));
  const uiKitIndexText = await readAuditText(projectPath, 'ui_kits/app/index.html');
  if (fileSet.has('colors_and_type.css') && uiKitIndexText !== undefined && !/colors_and_type\.css/iu.test(uiKitIndexText)) {
    addIssue(
      'error',
      'ui_kit_missing_token_stylesheet',
      'ui_kits/app/index.html must load colors_and_type.css so the applied interface kit uses the extracted design tokens.',
      'ui_kits/app/index.html',
    );
  }
  if (uiKitComponentFiles.length >= 3 && uiKitIndexText !== undefined) {
    const referencedComponents = uiKitComponentFiles.filter((filePath) =>
      uiKitIndexText.includes(path.basename(filePath)),
    );
    const requiredReferences = Math.min(3, uiKitComponentFiles.length);
    if (referencedComponents.length < requiredReferences) {
      addIssue(
        'error',
        'ui_kit_index_missing_component_references',
        `ui_kits/app/index.html must load or import at least ${requiredReferences} modular UI-kit component file(s) from ui_kits/app/components/. Found ${referencedComponents.length}.`,
        'ui_kits/app/index.html',
      );
    }
  }
  if (uiKitScriptComponentFiles.length >= 3 && uiKitIndexText !== undefined) {
    if (!uiKitIndexHasRuntimeBootstrap(uiKitIndexText)) {
      addIssue(
        'error',
        'ui_kit_index_missing_runtime_bootstrap',
        'ui_kits/app/index.html must mount or render the applied UI kit so reviewers see a real composed interface, not only disconnected component files.',
        'ui_kits/app/index.html',
      );
    }
    const composedComponents = componentNamesComposedInUiKitIndex(uiKitIndexText, uiKitScriptComponentFiles);
    if (composedComponents.length === 0) {
      addIssue(
        'error',
        'ui_kit_index_missing_component_composition',
        'ui_kits/app/index.html must compose at least one modular UI-kit component in the rendered entry surface, not only list component filenames.',
        'ui_kits/app/index.html',
      );
    }
    if (uiKitIndexLoadsJsxComponents(uiKitIndexText, uiKitScriptComponentFiles) && !uiKitIndexHasBrowserJsxRuntime(uiKitIndexText)) {
      addIssue(
        'error',
        'ui_kit_index_missing_jsx_runtime',
        'ui_kits/app/index.html directly loads JSX/TSX component files, so it must include React, ReactDOM, and Babel standalone scripts or use compiled browser-ready JavaScript instead.',
        'ui_kits/app/index.html',
      );
    }
    const directlyLoadedJsxComponents = directScriptLoadedJsxComponents(uiKitIndexText, uiKitScriptComponentFiles);
    for (const filePath of directlyLoadedJsxComponents) {
      const componentText = await readAuditText(projectPath, filePath);
      const componentName = componentNameFromUiKitFile(filePath);
      if (componentText !== undefined && componentName !== undefined && !componentTextExposesBrowserGlobal(componentText, componentName)) {
        addIssue(
          'error',
          'ui_kit_component_missing_browser_global',
          `${filePath} is loaded by ui_kits/app/index.html as a browser script, so it must assign \`window.${componentName}\` or \`globalThis.${componentName}\` for the entry renderer to compose it.`,
          filePath,
        );
      }
    }
  }
  if (hasComponentEvidence && uiKitComponentFiles.length < 3) {
    addIssue(
      'error',
      'missing_modular_ui_kit',
      `Source evidence includes reusable product components; add at least 3 reusable files under ui_kits/app/components/. Found ${uiKitComponentFiles.length}.`,
      'ui_kits/app/components/',
    );
  }
  if (hasComponentEvidence && uiKitComponentFiles.length >= 3) {
    const componentByteTotal = await totalAuditBytes(projectPath, uiKitComponentFiles);
    if (componentByteTotal < 3000) {
      addIssue(
        'error',
        'thin_modular_ui_kit',
        `ui_kits/app/components/ is too thin for source-backed component evidence; expected at least 3000 bytes across reusable components, found ${componentByteTotal}.`,
        'ui_kits/app/components/',
      );
    }
  }
  if (hasChatUiEvidence) {
    const missingRoles = missingUiKitComponentRoles(uiKitComponentFiles);
    if (missingRoles.length > 0) {
      addIssue(
        'error',
        'missing_ui_kit_component_roles',
        `Chat/workspace evidence requires UI kit components covering these roles: ${missingRoles.join(', ')}.`,
        'ui_kits/app/components/',
      );
    }
    const appShellFiles = uiKitScriptComponentFiles.filter(isUiKitAppShellComponent);
    if (appShellFiles.length > 0 && uiKitScriptComponentFiles.length >= 4) {
      const bestComposition = await bestUiKitAppShellComposition(projectPath, appShellFiles, uiKitScriptComponentFiles);
      const requiredComposedRoles = Math.min(3, uiKitScriptComponentFiles.length - 1);
      if (bestComposition.composed.length < requiredComposedRoles) {
        addIssue(
          'error',
          'ui_kit_app_missing_role_composition',
          `Chat/workspace UI kits need an app shell component that composes at least ${requiredComposedRoles} role component(s) such as Sidebar, AssistantsList, ChatArea, InputBar, or MessageBubble. Found ${bestComposition.composed.length}.`,
          bestComposition.filePath ?? 'ui_kits/app/components/',
        );
      }
    }
  }
  if (hasComponentEvidence && evidenceComponentNames.length >= 6 && visualSourceAnchors.length < 3) {
    addIssue(
      'warning',
      'generic_visual_artifacts',
      `Source evidence includes ${evidenceComponentNames.length} component snapshots, but preview/UI-kit visuals only reference ${visualSourceAnchors.length} source component name(s). Model or label at least 3 source-backed components such as ${suggestedComponentNames.slice(0, 5).join(', ')}.`,
      'preview/',
    );
  }
  if (hasComponentEvidence && evidenceSurfaceComponentNames.length >= 3 && componentPreviewGaps.length > 0) {
    addIssue(
      'warning',
      'preview_cards_missing_source_component_context',
      `Focused component/spacing preview cards should model or label real source components, not only abstract token swatches. Add source-backed examples to ${componentPreviewGaps.slice(0, 6).join(', ')} using components such as ${evidenceSurfaceComponentNames.slice(0, 5).join(', ')}.`,
      'preview/',
    );
  }
  if (hasComponentEvidence && evidenceComponentNames.length >= 6 && sourceExampleAnchors.length < 3) {
    addIssue(
      'warning',
      'missing_source_component_examples',
      `Source evidence includes ${evidenceComponentNames.length} component snapshots, but the package preserves only ${sourceExampleAnchors.length} source-backed component example(s) outside context/. Copy at least 3 high-signal examples such as ${suggestedComponentNames.slice(0, 5).join(', ')} into source_examples/, a component examples folder, or root/nested TSX files like Claude Design exports.`,
      'source_examples/',
    );
  }
  if (hasComponentEvidence && evidenceComponentNames.length >= 6 && sourceExampleAnchors.length >= 3) {
    const sourceExampleBytes = await totalAuditBytes(projectPath, sourceExampleAnchors);
    if (sourceExampleBytes < 2400) {
      addIssue(
        'warning',
        'thin_source_component_examples',
        `Source examples should preserve substantive component code, not filename-only stubs. Found ${sourceExampleAnchors.length} source-backed example file(s) totaling ${sourceExampleBytes} bytes; preserve larger high-signal examples from the original evidence, similar to Claude Design exports.`,
        'source_examples/',
      );
    }
  }
  if (hasAssetEvidence) {
    if (preservedAssetFiles.length === 0) {
      addIssue('error', 'missing_preserved_assets', 'Source evidence includes brand assets; preserve selected logos/icons/avatars under assets/.', 'assets/');
    }
    if (evidenceAssetFiles.length >= 3 && preservedAssetFiles.length < 3) {
      addIssue(
        'error',
        'insufficient_preserved_assets',
        `Source evidence includes ${evidenceAssetFiles.length} brand asset snapshots; preserve at least 3 representative logos/icons/avatars under assets/. Found ${preservedAssetFiles.length}.`,
        'assets/',
      );
    }
    if (!fileSet.has('preview/brand-assets.html')) {
      addIssue('error', 'missing_brand_assets_preview', 'Source evidence includes brand assets; add preview/brand-assets.html.', 'preview/brand-assets.html');
    }
  }
  const preservedBrandAssetFiles = [...preservedAssetFiles, ...preservedBuildAssetFiles];
  if (preservedBrandAssetFiles.length > 0 && fileSet.has('preview/brand-assets.html')) {
    const brandAssetPreview = await readAuditText(projectPath, 'preview/brand-assets.html');
    const referencedAssets = brandAssetPreview === undefined ? [] : preservedAssetsReferencedInPreview(brandAssetPreview, preservedBrandAssetFiles);
    const requiredAssetReferences = Math.min(2, preservedBrandAssetFiles.length);
    if (referencedAssets.length < requiredAssetReferences) {
      addIssue(
        'warning',
        'brand_assets_preview_not_using_preserved_assets',
        `preview/brand-assets.html should visibly reference at least ${requiredAssetReferences} preserved asset file(s) from assets/ or build/ so the review card shows real logos/icons instead of generated placeholders. Found ${referencedAssets.length}.`,
        'preview/brand-assets.html',
      );
    }
  }
  if (evidenceBuildAssetFiles.length > 0 && preservedBuildAssetFiles.length === 0) {
    addIssue(
      'warning',
      'missing_build_assets',
      `Source evidence includes ${evidenceBuildAssetFiles.length} build/runtime icon asset(s); preserve representative app, installer, tray, or wordmark files under build/ like Claude Design exports instead of collapsing them into prose.`,
      'build/',
    );
  }
  if (evidenceBuildAssetFiles.length > 0 && preservedBuildAssetFiles.length > 0) {
    const sourceBackedBuildAssets = await sourceBackedBuildAssetFiles(projectPath, fileSet, evidenceBuildAssetFiles);
    if (sourceBackedBuildAssets.length === 0) {
      addIssue(
        'warning',
        'build_assets_not_source_backed',
        `Root build/ contains preserved-looking runtime assets, but none match the captured build/resource snapshots byte-for-byte. Copy representative originals such as ${evidenceBuildAssetFiles.slice(0, 3).join(', ')} into build/ with original filenames instead of redrawing or re-encoding placeholders.`,
        'build/',
      );
    }
  }
  if (hasFontEvidence) {
    if (preservedFontFiles.length === 0) {
      addIssue('error', 'missing_preserved_fonts', 'Source evidence includes font files; preserve selected fonts under fonts/ and bind them in colors_and_type.css.', 'fonts/');
    }
    const tokenCss = await readAuditText(projectPath, 'colors_and_type.css');
    if (preservedFontFiles.length > 0 && tokenCss !== undefined && !tokenCssBindsPreservedFonts(tokenCss, preservedFontFiles)) {
      addIssue(
        'error',
        'font_tokens_not_bound',
        'Source font files are preserved under fonts/, but colors_and_type.css does not bind them with @font-face, @import, or a url(...) reference to the preserved font files.',
        'colors_and_type.css',
      );
    }
    if (evidenceFontFiles.length >= 3 && preservedFontFiles.length < 3) {
      addIssue(
        'error',
        'insufficient_preserved_fonts',
        `Source evidence includes ${evidenceFontFiles.length} font snapshots; preserve at least 3 representative font files or declarations under fonts/. Found ${preservedFontFiles.length}.`,
        'fonts/',
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    ok: errors.length === 0,
    projectPath,
    filesInspected: files.length,
    errors,
    warnings,
  };
}

function requirePreviewCategory(
  previewFiles: string[],
  pattern: RegExp,
  code: string,
  message: string,
  addIssue: (severity: DesignSystemAuditSeverity, code: string, message: string, path?: string) => void,
): void {
  if (!previewFiles.some((filePath) => pattern.test(filePath))) {
    addIssue('error', code, message, 'preview/');
  }
}

async function readAuditText(projectPath: string, relativePath: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(projectPath, relativePath), 'utf8');
  } catch {
    return undefined;
  }
}

async function sourceBackedBuildAssetFiles(
  projectPath: string,
  fileSet: Set<string>,
  evidenceBuildAssetFiles: string[],
): Promise<string[]> {
  const matchedFiles: string[] = [];
  const seenTargets = new Set<string>();
  for (const evidenceFilePath of evidenceBuildAssetFiles) {
    if (!fileSet.has(evidenceFilePath)) continue;
    const repoPath = repoPathFromEvidenceSnapshot(evidenceFilePath);
    if (repoPath === undefined) continue;
    const target = packageBuildAssetTarget(repoPath);
    if (target === undefined || seenTargets.has(target) || !fileSet.has(target)) continue;
    seenTargets.add(target);
    try {
      const [sourceBytes, targetBytes] = await Promise.all([
        readFile(path.join(projectPath, evidenceFilePath)),
        readFile(path.join(projectPath, target)),
      ]);
      if (sourceBytes.equals(targetBytes)) matchedFiles.push(target);
    } catch {
      // Missing or unreadable files are already covered by structural audit checks.
    }
  }
  return matchedFiles;
}

function repoPathFromEvidenceSnapshot(filePath: string): string | undefined {
  const match = /^context\/(?:github|local-code)\/[^/]+\/files\/(.+)$/u.exec(filePath);
  return match?.[1];
}

async function totalAuditBytes(projectPath: string, relativePaths: string[]): Promise<number> {
  let total = 0;
  for (const relativePath of relativePaths) {
    try {
      const info = await stat(path.join(projectPath, relativePath));
      if (info.isFile()) total += info.size;
    } catch {
      // Missing files are reported by the caller's structural checks.
    }
  }
  return total;
}

function requireMarkdownHeading(text: string): string | undefined {
  return /^#\s+\S+/mu.test(text) ? undefined : 'Expected a top-level markdown heading.';
}

function validateSkillInstructions(text: string): string | undefined {
  if (requireMarkdownHeading(text) === undefined) return undefined;
  if (/^---\n[\s\S]*?\n---/u.test(text) && /^description:\s+\S+/mu.test(text) && /\*\*How to use:\*\*/iu.test(text)) {
    return undefined;
  }
  return 'Expected a top-level markdown heading or skill frontmatter with usage instructions.';
}

function skillHasAgentFrontmatter(text: string): boolean {
  const match = /^---\n([\s\S]*?)\n---/u.exec(text);
  if (!match) return false;
  const frontmatter = match[1] ?? '';
  return /^name:\s+\S+/mu.test(frontmatter)
    && /^description:\s+\S+/mu.test(frontmatter)
    && /^user-invocable:\s+(true|false)/imu.test(frontmatter);
}

function skillHasReusableSections(text: string): boolean {
  if (text.trim().length < 800) return false;
  const hasInside = (/\*\*What's inside:\*\*/iu.test(text) || /^##\s+(?:What's inside|Contents)\s*$/imu.test(text))
    && /\b(tokens?|assets?|fonts?|preview|ui\s*kit|components?)\b/iu.test(text);
  const hasSourceContext = (/\*\*Source context:\*\*/iu.test(text) || /^##\s+(?:Source Context|Source)\s*$/imu.test(text))
    && /\b(source|repository|github|local|based on|evidence)\b/iu.test(text);
  const hasWhenToUse = (/\*\*When to use(?: this skill)?:\*\*/iu.test(text) || /^##\s+When to use(?: this skill)?\s*$/imu.test(text))
    && /\b(prototypes?|mockups?|interfaces?|artifacts?|production|design|build(?:ing)?)\b/iu.test(text);
  const hasHowToUse = (/\*\*How to use:\*\*/iu.test(text) || /^##\s+(?:How to use|Usage)\s*$/imu.test(text))
    && /\b(README\.md|DESIGN\.md|colors_and_type\.css|preview\/|assets\/|build\/|fonts\/|ui_kits\/app)\b/iu.test(text);
  const hasHighlights = (/\*\*Design system highlights:\*\*/iu.test(text) || /^##\s+(?:(?:Design System|Design) )?Highlights\s*$/imu.test(text))
    && /\b(colors?|typography|spacing|radius|shadows?|icons?|layout|interaction)\b/iu.test(text);
  return hasInside && hasSourceContext && hasWhenToUse && hasHowToUse && hasHighlights;
}

function readmeHasProductOverview(text: string): boolean {
  const section = [
    markdownSection(text, 'Product Overview'),
    markdownSection(text, 'Product Context'),
    markdownSection(text, 'Overview'),
  ].find((value): value is string => value !== undefined && value.trim().length > 0);
  if (section === undefined) return false;
  const body = section.trim();
  return body.length >= 180
    && /\b(product|app|application|workspace|client|platform|tool|service)\b/iu.test(body)
    && /\b(supports?|provides?|features?|includes?|built|designed|helps?|enables?|offers?)\b/iu.test(body);
}

function readmeHasPackageReuseGuide(text: string): boolean {
  const hasPackageContents = /##\s+(?:Package Contents|What's inside|Contents|Files)\b/iu.test(text)
    && /\bDESIGN\.md\b/iu.test(text)
    && /\bcolors_and_type\.css\b/iu.test(text)
    && /\bpreview\//iu.test(text)
    && /\bui_kits\/app\/?\b/iu.test(text);
  const hasSourceContext = /##\s+(?:Source Context|Source Evidence|Sources?|Product Overview|Product Context)\b/iu.test(text)
    && /\b(?:GitHub|repository|source|evidence|context\/|local folder)\b/iu.test(text);
  const hasPreservedArtifacts = /\b(?:assets\/|build\/|fonts\/|source_examples\/)\b/iu.test(text)
    && /\b(?:preserv|source-backed|captured|runtime|brand|font|component)\b/iu.test(text);
  const hasReuseWorkflow = /##\s+(?:Review Workflow|Reuse Workflow|Usage|How to use|Workflow)\b/iu.test(text)
    && /\b(?:reuse|review|inspect|copy|load|compose|start with|open)\b/iu.test(text)
    && /\b(?:preview|DESIGN\.md|colors_and_type\.css|ui_kits\/app|assets\/|fonts\/)\b/iu.test(text);
  return hasPackageContents && hasSourceContext && hasPreservedArtifacts && hasReuseWorkflow;
}

function readmeHasPreviewManifest(text: string, previewFiles: string[]): boolean {
  if (previewFiles.length === 0) return true;
  const previewSection = markdownSection(text, 'Preview Manifest')
    ?? markdownSection(text, 'Preview Cards')
    ?? markdownSection(text, 'Review Previews')
    ?? markdownSection(text, 'Previews');
  if (previewSection === undefined) return false;
  const referencedPreviews = previewFiles.filter((filePath) =>
    new RegExp(`\\b${escapeRegExp(filePath)}\\b`, 'iu').test(previewSection),
  );
  return referencedPreviews.length >= Math.min(4, previewFiles.length);
}

function uiKitReadmeHasReuseGuide(text: string): boolean {
  if (text.trim().length < 350) return false;
  const hasStructure = /##\s+(Structure|Files|Components)\b/iu.test(text)
    && /\bindex\.html\b/iu.test(text)
    && /\bcomponents\//iu.test(text);
  const hasUsage = /##\s+(Usage|How to use|Reuse)\b/iu.test(text)
    && /\b(copy|compose|import|use|build|create)\b/iu.test(text);
  const hasDesignOrSourceNotes = /##\s+(Design Notes|Design|Layout|Source)\b/iu.test(text)
    && /\b(source|based on|layout|colors?|typography|tokens?)\b/iu.test(text);
  const componentMentions = new Set(
    [...text.matchAll(/\b(?:App|Sidebar|AssistantsList|ChatArea|MessageBubble|InputBar|Composer|PreviewCard)\b|components\/[^`\s)]+\.jsx/giu)]
      .map((match) => match[0].toLowerCase()),
  );
  return hasStructure && hasUsage && hasDesignOrSourceNotes && componentMentions.size >= 3;
}

function validateDesignRules(text: string): string | undefined {
  const headings = new Set([...text.matchAll(/^##\s+(.+?)\s*$/gmu)].map((match) => (match[1] ?? '').toLowerCase()));
  const requiredGroups = [
    ['context', 'product'],
    ['color', 'palette'],
    ['typography', 'type'],
    ['spacing', 'layout'],
    ['component'],
    ['motion', 'interaction'],
    ['voice', 'brand'],
    ['anti-pattern'],
  ];
  const missing = requiredGroups.filter((group) =>
    ![...headings].some((heading) => group.some((needle) => heading.includes(needle))),
  );
  return missing.length === 0
    ? undefined
    : `DESIGN.md is missing source-backed sections for ${missing.map((group) => group[0]).join(', ')}.`;
}

function validateTokenCss(text: string): string | undefined {
  const variables = [...text.matchAll(/--[a-z0-9_-]+\s*:/giu)].length;
  if (variables < 12) return `Expected at least 12 CSS custom properties, found ${variables}.`;
  const colors = [...text.matchAll(/#[0-9a-f]{3,8}\b|rgb[a]?\(|hsl[a]?\(/giu)].length;
  if (colors < 4) return `Expected concrete color values in colors_and_type.css, found ${colors}.`;
  if (!/font(-family)?|--[^:]*font/iu.test(text)) return 'Expected font-family or font token declarations.';
  if (!/radius|border-radius/iu.test(text)) return 'Expected radius token declarations.';
  if (!/space|spacing|gap/iu.test(text)) return 'Expected spacing token declarations.';
  return undefined;
}

function validateHtmlDocument(text: string): string | undefined {
  if (!/<!doctype html>|<html[\s>]/iu.test(text)) return 'Expected a complete HTML document.';
  if (!/<style[\s>]/iu.test(text)) return 'Expected embedded CSS styles for review fidelity.';
  if (!/<(main|section|article|aside|header|div)\b/iu.test(text)) return 'Expected real layout markup, not only metadata.';
  return undefined;
}

function tokenCssBindsPreservedFonts(text: string, preservedFontFiles: string[]): boolean {
  const fontAssets = preservedFontFiles.filter((filePath) => /\.(ttf|otf|woff2?)$/iu.test(filePath));
  if (fontAssets.length === 0) {
    return /@import\s+[^;]*fonts\//iu.test(text) || /url\([^)]*fonts\//iu.test(text);
  }
  const hasFontRule = /@font-face/iu.test(text) || /@import\s+[^;]*fonts\//iu.test(text);
  if (!hasFontRule) return false;
  if (/@import\s+[^;]*fonts\/[^;]*\.css/iu.test(text)) return true;
  return fontAssets.some((filePath) => {
    const baseName = escapeRegExp(path.basename(filePath));
    return new RegExp(`url\\([^)]*(?:fonts\\/[^)]*)?${baseName}`, 'iu').test(text)
      || new RegExp(`@import\\s+[^;]*(?:fonts\\/[^;]*)?${baseName}`, 'iu').test(text);
  }) || /url\([^)]*fonts\/[^)]*\.(ttf|otf|woff2?)/iu.test(text);
}

function preservedAssetsReferencedInPreview(text: string, preservedAssetFiles: string[]): string[] {
  return preservedAssetFiles.filter((filePath) => {
    const escapedPath = escapeRegExp(filePath);
    const escapedParentPath = escapeRegExp(`../${filePath}`);
    const escapedBaseName = escapeRegExp(path.basename(filePath));
    return new RegExp(`(?:src|href)=["'][^"']*(?:${escapedPath}|${escapedParentPath}|${escapedBaseName})["']`, 'iu').test(text)
      || new RegExp(`url\\([^)]*(?:${escapedPath}|${escapedParentPath}|${escapedBaseName})`, 'iu').test(text);
  });
}

function evidenceSnapshotFiles(files: string[], evidenceText: string, pattern: RegExp): string[] {
  const fromFiles = files.filter((filePath) => /^context\/(github|local-code)\/.+\/files\//u.test(filePath) && pattern.test(filePath));
  const fromText = [...evidenceText.matchAll(/context\/(?:github|local-code)\/[^`\s)]+\/files\/[^`\s)]+/giu)]
    .map((match) => match[0])
    .filter((filePath) => pattern.test(filePath));
  return [...new Set([...fromFiles, ...fromText])];
}

function sourceComponentNamesFromEvidence(files: string[], evidenceText: string): string[] {
  const paths = [
    ...files.filter((filePath) => /^context\/(github|local-code)\/.+\/files\//u.test(filePath)),
    ...[...evidenceText.matchAll(/context\/(?:github|local-code)\/[^`\s)]+\/files\/[^`\s)]+/giu)].map((match) => match[0]),
  ];
  const names = paths
    .filter((filePath) => /\.(tsx|ts|jsx|js|css|scss|less)$/iu.test(filePath))
    .map(sourceComponentNameFromPath)
    .filter((name): name is string => name !== undefined);
  return [...new Set(names)];
}

function sourceComponentNameFromPath(filePath: string): string | undefined {
  const parts = filePath.split('/').filter(Boolean);
  const fileName = parts.at(-1);
  if (!fileName) return undefined;
  const base = fileName.replace(/\.(tsx|ts|jsx|js|css|scss|less)$/iu, '');
  const name = /^(index|style|styles|constants?|types?|utils?|hooks?)$/iu.test(base)
    ? parts.at(-2)
    : base;
  if (!name || name.length < 4) return undefined;
  if (/^(component|components|page|pages|button|input|card|modal|dialog|index)$/iu.test(name)) return undefined;
  return name;
}

function isSourceSurfaceComponentName(name: string): boolean {
  const normalized = normalizeAnchorText(name);
  if (normalized.length < 4) return false;
  return !/(provider|config|constant|theme|token|style|util|hook|store|locale|schema|type|client|server)$/iu.test(normalized);
}

async function sourceComponentAnchorsInVisualArtifacts(
  projectPath: string,
  files: string[],
  sourceNames: string[],
): Promise<string[]> {
  if (sourceNames.length === 0) return [];
  const visualFiles = files.filter((filePath) =>
    /^preview\/.+\.html$/u.test(filePath)
    || /^ui_kits\/app\/(?:index\.html|components\/.+\.(jsx|tsx|js|ts|css|html))$/u.test(filePath),
  );
  const texts = await Promise.all(visualFiles.map(async (filePath) => await readAuditText(projectPath, filePath) ?? ''));
  const normalizedText = normalizeAnchorText(texts.join('\n'));
  return sourceNames.filter((name) => normalizedText.includes(normalizeAnchorText(name)));
}

async function sourceComponentPreviewGaps(
  projectPath: string,
  previewFiles: string[],
  sourceNames: string[],
): Promise<string[]> {
  if (sourceNames.length === 0) return [];
  const focusedPreviewFiles = previewFiles.filter((filePath) =>
    /^preview\/(?:components|spacing)-.+\.html$/u.test(filePath),
  );
  const normalizedSourceNames = sourceNames.map(normalizeAnchorText);
  const missing: string[] = [];
  for (const filePath of focusedPreviewFiles) {
    const text = await readAuditText(projectPath, filePath);
    const normalizedText = normalizeAnchorText(text ?? '');
    if (!normalizedSourceNames.some((name) => normalizedText.includes(name))) {
      missing.push(filePath);
    }
  }
  return missing;
}

function sourceComponentExamplesInPackage(files: string[], sourceNames: string[]): string[] {
  if (sourceNames.length === 0) return [];
  const sourceNameSet = new Set(sourceNames.map(normalizeAnchorText));
  return files.filter(isPackageSourceExampleFile).filter((filePath) => {
    const name = sourceComponentNameFromPath(filePath);
    return name !== undefined && sourceNameSet.has(normalizeAnchorText(name));
  });
}

function isPackageSourceExampleFile(filePath: string): boolean {
  return /\.(tsx|ts|jsx|js)$/iu.test(filePath)
    && !/^context\//u.test(filePath)
    && !/^preview\//u.test(filePath)
    && !/^ui_kits\/app\//u.test(filePath)
    && !/^assets\//u.test(filePath)
    && !/^fonts\//u.test(filePath)
    && !/^dist\//u.test(filePath)
    && !/^node_modules\//u.test(filePath)
    && !/(^|\/)(package|tsconfig|vite\.config|next\.config|design-system-reference)\.(tsx|ts|jsx|js)$/iu.test(filePath);
}

function normalizeAnchorText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function uiKitIndexHasRuntimeBootstrap(text: string): boolean {
  return /ReactDOM\.createRoot\s*\(|\bcreateRoot\s*\(|ReactDOM\.render\s*\(|\broot\.render\s*\(|\brender\s*\(\s*<|customElements\.define\s*\(|\bmount\s*\(|document\.(?:getElementById|querySelector)\([^)]*\)\.(?:append|appendChild|replaceChildren)\s*\(|document\.(?:getElementById|querySelector)\([^)]*\)\.innerHTML\s*=/iu.test(text);
}

function uiKitIndexLoadsJsxComponents(text: string, componentFiles: string[]): boolean {
  return componentFiles
    .filter((filePath) => /\.(jsx|tsx)$/iu.test(filePath))
    .some((filePath) => text.includes(path.basename(filePath)));
}

function uiKitIndexHasBrowserJsxRuntime(text: string): boolean {
  const hasReact = /\breact(?:\.development|\.production)?\.js\b|\breact@\d|from\s+['"][^'"]*react(?:\/[^'"]*)?['"]|\bReact\./iu.test(text);
  const hasReactDom = /\breact-dom\b|react-dom(?:\.development|\.production)?\.js\b|from\s+['"][^'"]*react-dom(?:\/[^'"]*)?['"]|\bReactDOM\./iu.test(text);
  const hasBabel = /@babel\/standalone|babel\.min\.js|\bBabel\.transform\b/iu.test(text);
  return hasReact && hasReactDom && hasBabel;
}

function directScriptLoadedJsxComponents(text: string, componentFiles: string[]): string[] {
  return componentFiles
    .filter((filePath) => /\.(jsx|tsx)$/iu.test(filePath))
    .filter((filePath) => {
      const fileName = escapeRegExp(path.basename(filePath));
      return new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*components/${fileName}["'][^>]*>`, 'iu').test(text);
    });
}

function componentNameFromUiKitFile(filePath: string): string | undefined {
  const name = path.basename(filePath).replace(/\.(jsx|tsx|js|ts|html)$/iu, '');
  return name.length > 0 ? name : undefined;
}

function componentTextExposesBrowserGlobal(text: string, componentName: string): boolean {
  const escaped = escapeRegExp(componentName);
  return new RegExp(`(?:window|globalThis)\\s*\\.\\s*${escaped}\\s*=|(?:window|globalThis)\\s*\\[\\s*["']${escaped}["']\\s*\\]\\s*=|Object\\.assign\\s*\\(\\s*(?:window|globalThis)\\s*,\\s*\\{[^}]*\\b${escaped}\\b`, 'u').test(text);
}

function componentNamesComposedInUiKitIndex(text: string, componentFiles: string[]): string[] {
  const textWithoutExternalComponentRefs = text
    .replace(/<script\b[^>]*\bsrc=["'][^"']*components\/[^"']+["'][^>]*>\s*<\/script>/giu, ' ')
    .replace(/components\/[a-z0-9_.-]+/giu, ' ');
  return componentNamesInText(textWithoutExternalComponentRefs, componentFiles);
}

function isUiKitAppShellComponent(filePath: string): boolean {
  return /(^|\/)(app|shell|layout|workspace)\.(jsx|tsx|js|ts)$/iu.test(path.basename(filePath));
}

async function bestUiKitAppShellComposition(
  projectPath: string,
  appShellFiles: string[],
  componentFiles: string[],
): Promise<{ filePath?: string; composed: string[] }> {
  let best: { filePath?: string; composed: string[] } = { composed: [] };
  for (const filePath of appShellFiles) {
    const text = await readAuditText(projectPath, filePath);
    if (text === undefined) continue;
    const composed = componentNamesComposedInComponentText(text, componentFiles, path.basename(filePath));
    if (best.filePath === undefined || composed.length > best.composed.length) best = { filePath, composed };
  }
  return best;
}

function componentNamesInText(text: string, componentFiles: string[], excludeBaseName?: string): string[] {
  const excluded = excludeBaseName?.replace(/\.(jsx|tsx|js|ts)$/iu, '');
  const componentNames = componentFiles
    .map((filePath) => path.basename(filePath).replace(/\.(jsx|tsx|js|ts|html)$/iu, ''))
    .filter((componentName) => componentName.length > 0 && componentName !== excluded);
  return componentNames.filter((componentName) =>
    new RegExp(`\\b${escapeRegExp(componentName)}\\b`, 'u').test(text),
  );
}

function componentNamesComposedInComponentText(text: string, componentFiles: string[], excludeBaseName?: string): string[] {
  return componentNamesInText(text, componentFiles, excludeBaseName).filter((componentName) => {
    const escaped = escapeRegExp(componentName);
    return new RegExp(`<\\s*${escaped}(?:\\s|/|>)|React\\.createElement\\s*\\(\\s*${escaped}\\b|\\b${escaped}\\s*\\(`, 'u').test(text);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function stalePackageReferences(text: string): string[] {
  const stalePreviewPaths = [
    'preview/colors-node-types.html',
    'preview/colors-ui-palette.html',
    'preview/typography-scale.html',
    'preview/spacing-system.html',
    'preview/logo-variants.html',
  ];
  const references = stalePreviewPaths.filter((stalePath) => text.includes(stalePath));
  if (text.includes('ui_kits/generated_interface/index.html')) {
    references.push('ui_kits/generated_interface/index.html');
  } else if (text.includes('ui_kits/generated_interface')) {
    references.push('ui_kits/generated_interface/');
  }
  return references;
}

function protocolTitleAuditFiles(files: string[]): string[] {
  return files.filter((filePath) =>
    /^(DESIGN|README|SKILL)\.md$/u.test(filePath)
    || /^preview\/.+\.html$/u.test(filePath)
    || /^ui_kits\/app\/(?:README\.md|index\.html|components\/.+\.(jsx|tsx|js|ts|html))$/u.test(filePath)
    || /^index\.html$/u.test(filePath),
  );
}

function protocolDerivedDesignSystemTitle(text: string): string | undefined {
  const match = /\bhttps?[^\S\r\n]+Design[^\S\r\n]+System(?:[^\S\r\n]+[A-Za-z][A-Za-z ]*)?/iu.exec(text);
  if (!match) return undefined;
  return match[0].trim().replace(/\s+/gu, ' ');
}

function manifestHasLinkedGithub(manifest: string): boolean {
  const section = markdownSection(manifest, 'GitHub Repositories');
  return section !== undefined && /github\.com[:/][^\s]+|^- https?:\/\/github\.com\//imu.test(section) && !/- None linked\./iu.test(section);
}

function manifestHasLinkedLocalFolder(manifest: string): boolean {
  const section = markdownSection(manifest, 'Local Code');
  return section !== undefined
    && /Linked folders readable by the local agent:\s*\n- (?!none\.)(.+)/iu.test(section);
}

function markdownSection(markdown: string, title: string): string | undefined {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/u.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function evidenceHasAssets(evidenceText: string): boolean {
  return /### Brand assets and icons|## Binary Assets Preserved|\.(svg|png|jpe?g|webp|ico)\b/iu.test(evidenceText);
}

function evidenceHasFonts(evidenceText: string): boolean {
  return /### Fonts|\.(ttf|otf|woff2?)\b/iu.test(evidenceText);
}

function evidenceHasReusableComponents(evidenceText: string): boolean {
  return /### Reusable components|### App shell and navigation|### Chat and input surfaces|components?\/|ui_kits?\/|sidebar|navbar|composer|message bubble|assistant row|model selector/iu.test(evidenceText);
}

function evidenceHasChatInterface(evidenceText: string): boolean {
  return /### Chat and input surfaces|pages\/home|inputbar|messages?\/|chat(area)?|assistant(list|item|stab)?|message bubble|composer/iu.test(evidenceText);
}

function missingUiKitComponentRoles(componentFiles: string[]): string[] {
  const normalized = componentFiles.map((filePath) => path.basename(filePath).toLowerCase());
  const roles = [
    ['app shell', /(app|shell|layout|workspace)\.(jsx|tsx|js|ts|html|css)$/u],
    ['navigation/sidebar', /(sidebar|nav|rail)\.(jsx|tsx|js|ts|html|css)$/u],
    ['assistant/list rail', /(assistants?list|assistantitem|list|panel|tabs?)\.(jsx|tsx|js|ts|html|css)$/u],
    ['chat area', /(chatarea|chat|messages?)\.(jsx|tsx|js|ts|html|css)$/u],
    ['message bubble', /(messagebubble|message)\.(jsx|tsx|js|ts|html|css)$/u],
    ['input bar/composer', /(inputbar|composer|input|messageinput)\.(jsx|tsx|js|ts|html|css)$/u],
  ] as const;
  return roles
    .filter(([, pattern]) => !normalized.some((fileName) => pattern.test(fileName)))
    .map(([role]) => role);
}

async function requestJson(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(endpoint(baseUrl, pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  return { status: response.status, body };
}

function compactTool(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const tool = value as JsonObject;
  return {
    name: tool.name,
    description: tool.description,
    safety: tool.safety,
    curation: tool.curation,
    inputSchema: tool.inputSchemaJson ?? tool.inputSchema,
  };
}

function compactConnector(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const connector = value as JsonObject;
  const tools = Array.isArray(connector.tools) ? connector.tools : [];
  return {
    id: connector.id,
    name: connector.name,
    provider: connector.provider,
    category: connector.category,
    status: connector.status,
    accountLabel: connector.accountLabel,
    tools: tools.map(compactTool),
  };
}

function compactList(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const response = value as JsonObject;
  const connectors = Array.isArray(response.connectors) ? response.connectors : [];
  return { connectors: connectors.map(compactConnector) };
}

function compactExecution(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const response = value as JsonObject;
  return {
    connectorId: response.connectorId,
    accountLabel: response.accountLabel,
    toolName: response.toolName,
    safety: response.safety,
    outputSummary: response.outputSummary,
    output: response.output,
    metadata: response.metadata,
  };
}

function compactValidationDetails(details: unknown): unknown {
  if (!details || typeof details !== 'object') return details;
  const record = details as JsonObject;
  if (record.kind !== 'validation' || !Array.isArray(record.issues)) return details;
  return {
    kind: 'validation',
    issues: record.issues.map((issue) => {
      if (!issue || typeof issue !== 'object') return { message: String(issue) };
      const issueRecord = issue as JsonObject;
      return {
        ...(typeof issueRecord.path === 'string' ? { path: issueRecord.path } : {}),
        message: typeof issueRecord.message === 'string' ? issueRecord.message : String(issueRecord.message ?? 'validation failed'),
        ...(typeof issueRecord.code === 'string' ? { code: issueRecord.code } : {}),
      };
    }),
  };
}

function normalizeCliError(body: unknown): CliError {
  const rawError = body && typeof body === 'object' && 'error' in body ? (body as JsonObject).error : body;

  if (typeof rawError === 'string') return { message: rawError };
  if (!rawError || typeof rawError !== 'object') return { message: String(rawError ?? 'request failed') };

  const error = rawError as JsonObject;
  return {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    message: typeof error.message === 'string' ? error.message : String(error.error ?? 'request failed'),
    ...(error.details === undefined ? {} : { details: compactValidationDetails(error.details) }),
    ...(typeof error.retryable === 'boolean' ? { retryable: error.retryable } : {}),
    ...(typeof error.requestId === 'string' ? { requestId: error.requestId } : {}),
  };
}

async function printApiResult(response: { status: number; body: unknown }, compact: (body: unknown) => unknown): Promise<ToolCliResult> {
  if (response.status < 200 || response.status >= 300) {
    writeJson({ ok: false, status: response.status, error: normalizeCliError(response.body) }, process.stderr);
    return { exitCode: 1 };
  }
  const body = compact(response.body);
  writeJson(body && typeof body === 'object' && !Array.isArray(body) ? { ok: true, ...(body as JsonObject) } : { ok: true, result: body });
  return { exitCode: 0 };
}

export async function runConnectorsToolCli(args: string[]): Promise<ToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(CONNECTORS_USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }

  if (options.command === 'github-design-context') {
    try {
      return await runGithubDesignContext(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  if (options.command === 'local-design-context') {
    try {
      return await runLocalDesignContext(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  if (options.command === 'design-system-package-audit') {
    try {
      return await runDesignSystemPackageAudit(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  try {
    if (options.command === 'list') {
      const listPath = options.useCase ? `/api/tools/connectors/list?useCase=${encodeURIComponent(options.useCase)}` : '/api/tools/connectors/list';
      return await printApiResult(
        await requestJson(baseUrl, token, listPath, { method: 'GET' }),
        options.format === 'compact' ? compactList : (body) => body,
      );
    }

    if (options.command === 'execute') {
      if (!options.connectorId) return fail('execute requires --connector <id>');
      if (!options.toolName) return fail('execute requires --tool <name>');
      if (!options.inputPath) return fail('execute requires --input input.json');
      const input = await readJsonObject(options.inputPath);
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/connectors/execute', {
          method: 'POST',
          body: JSON.stringify({ connectorId: options.connectorId, toolName: options.toolName, input }),
        }),
        options.format === 'compact' ? compactExecution : (body) => body,
      );
    }

    return fail(`unknown connectors command: ${options.command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
