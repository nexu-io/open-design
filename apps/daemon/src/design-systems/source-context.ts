import type { UserDesignSystemInput } from './index.js';

export type DesignSystemSourceContext = {
  github: GitHubRepositoryContext[];
  notes: string;
};

export type GitHubRepositoryContext = {
  url: string;
  owner: string;
  repo: string;
  description?: string;
  homepage?: string;
  defaultBranch?: string;
  language?: string;
  stars?: number;
  topics?: string[];
  readmeExcerpt?: string;
  packageName?: string;
  packageDescription?: string;
  error?: string;
};

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type SourceContextOptions = {
  fetch?: FetchLike;
  maxRepos?: number;
  maxReadmeChars?: number;
  timeoutMs?: number;
};

type ParsedGitHubRepo = {
  owner: string;
  repo: string;
  url: string;
};

const DEFAULT_MAX_REPOS = 3;
const DEFAULT_MAX_README_CHARS = 720;
const DEFAULT_FETCH_TIMEOUT_MS = 3500;

export async function collectDesignSystemSourceContext(
  input: UserDesignSystemInput,
  options: SourceContextOptions = {},
): Promise<DesignSystemSourceContext> {
  const githubUrls = input.provenance?.githubUrls ?? [];
  const repos = uniqueRepositories(githubUrls).slice(0, options.maxRepos ?? DEFAULT_MAX_REPOS);
  if (repos.length === 0) return { github: [], notes: '' };

  const fetchFn = options.fetch ?? defaultFetch;
  const github = await Promise.all(
    repos.map((repo) => readGitHubRepositoryContext(repo, {
      fetch: fetchFn,
      maxReadmeChars: options.maxReadmeChars ?? DEFAULT_MAX_README_CHARS,
      timeoutMs: options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    })),
  );

  return {
    github,
    notes: formatGithubContextNotes(github),
  };
}

export function mergeSourceContextIntoInput(
  input: UserDesignSystemInput,
  context: DesignSystemSourceContext,
): UserDesignSystemInput {
  const contextNotes = cleanMultiline(context.notes);
  if (!contextNotes) return input;

  const topLevelSourceNotes = joinUniqueBlocks([
    input.sourceNotes,
    contextNotes,
  ]);
  const provenanceSourceNotes = joinUniqueBlocks([
    provenanceOnlySourceNotes(input),
    contextNotes,
  ]);
  const provenance = {
    ...(input.provenance ?? {}),
    sourceNotes: provenanceSourceNotes,
  };

  return {
    ...input,
    sourceNotes: topLevelSourceNotes,
    provenance,
  };
}

function provenanceOnlySourceNotes(input: UserDesignSystemInput): string {
  const provenanceSourceNotes = cleanMultiline(input.provenance?.sourceNotes);
  const topLevelSourceNotes = cleanMultiline(input.sourceNotes);
  if (!provenanceSourceNotes || provenanceSourceNotes === topLevelSourceNotes) return '';
  return provenanceSourceNotes;
}

async function readGitHubRepositoryContext(
  repo: ParsedGitHubRepo,
  options: { fetch: FetchLike; maxReadmeChars: number; timeoutMs: number },
): Promise<GitHubRepositoryContext> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  const api = await fetchJson(options.fetch, apiUrl, options.timeoutMs);
  if (!api.ok) {
    return {
      ...repo,
      error: `GitHub repository metadata unavailable (${api.error})`,
    };
  }

  const payload = asRecord(api.value);
  const description = readOptionalString(payload.description);
  const homepage = readOptionalString(payload.homepage);
  const defaultBranch = readOptionalString(payload.default_branch) ?? 'main';
  const language = readOptionalString(payload.language);
  const stars = readOptionalNumber(payload.stargazers_count);
  const topics = parseTopics(payload.topics);
  const [readme, packageJson] = await Promise.all([
    readRawFile(options.fetch, repo, branchCandidates(defaultBranch), ['README.md', 'readme.md'], options.timeoutMs),
    readRawFile(options.fetch, repo, branchCandidates(defaultBranch), ['package.json'], options.timeoutMs),
  ]);
  const packageInfo = parsePackageInfo(packageJson);

  return {
    ...repo,
    ...(description ? { description } : {}),
    ...(homepage ? { homepage } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
    ...(language ? { language } : {}),
    ...(typeof stars === 'number' ? { stars } : {}),
    ...(topics.length > 0 ? { topics } : {}),
    ...(readme ? { readmeExcerpt: excerptMarkdown(readme, options.maxReadmeChars) } : {}),
    ...(packageInfo.name ? { packageName: packageInfo.name } : {}),
    ...(packageInfo.description ? { packageDescription: packageInfo.description } : {}),
  };
}

function uniqueRepositories(urls: string[]): ParsedGitHubRepo[] {
  const seen = new Set<string>();
  const repos: ParsedGitHubRepo[] = [];
  for (const url of urls) {
    const parsed = parseGitHubRepositoryUrl(url);
    if (!parsed) continue;
    const key = `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push(parsed);
  }
  return repos;
}

function parseGitHubRepositoryUrl(raw: string): ParsedGitHubRepo | null {
  const clean = raw.trim();
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:[#?].*)?$/.exec(clean);
  if (ssh?.[1] && ssh[2]) {
    return {
      owner: ssh[1],
      repo: stripGitSuffix(ssh[2]),
      url: `https://github.com/${ssh[1]}/${stripGitSuffix(ssh[2])}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') return null;
  const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  return {
    owner,
    repo: stripGitSuffix(repo),
    url: `https://github.com/${owner}/${stripGitSuffix(repo)}`,
  };
}

async function fetchJson(
  fetchFn: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetchWithTimeout(fetchFn, url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'open-design-local',
      },
    }, timeoutMs);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, value: await response.json() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function readRawFile(
  fetchFn: FetchLike,
  repo: ParsedGitHubRepo,
  branches: string[],
  filePaths: string[],
  timeoutMs: number,
): Promise<string> {
  for (const branch of branches) {
    for (const filePath of filePaths) {
      const url = rawGithubUrl(repo, branch, filePath);
      try {
        const response = await fetchWithTimeout(fetchFn, url, {
          headers: {
            accept: 'text/plain',
            'user-agent': 'open-design-local',
          },
        }, timeoutMs);
        if (response.ok) return response.text();
      } catch {
        // Try the next candidate.
      }
    }
  }
  return '';
}

async function fetchWithTimeout(
  fetchFn: FetchLike,
  url: string,
  init: { headers?: Record<string, string> },
  timeoutMs: number,
): ReturnType<FetchLike> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function rawGithubUrl(repo: ParsedGitHubRepo, branch: string, filePath: string): string {
  const parts = [
    encodeURIComponent(repo.owner),
    encodeURIComponent(repo.repo),
    encodeURIComponent(branch),
    ...filePath.split('/').map(encodeURIComponent),
  ];
  return `https://raw.githubusercontent.com/${parts.join('/')}`;
}

function branchCandidates(defaultBranch: string): string[] {
  const out: string[] = [];
  for (const branch of [defaultBranch, 'main', 'master']) {
    const clean = branch.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function parsePackageInfo(raw: string): { name?: string; description?: string } {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    const record = asRecord(value);
    const name = readOptionalString(record.name);
    const description = readOptionalString(record.description);
    return {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    };
  } catch {
    return {};
  }
}

function formatGithubContextNotes(repos: GitHubRepositoryContext[]): string {
  if (repos.length === 0) return '';
  const lines = ['Fetched GitHub context:'];
  for (const repo of repos) {
    const headline = repo.description || repo.error || 'No repository description found.';
    lines.push(`- ${repo.owner}/${repo.repo}: ${headline}`);
    const metadata = [
      repo.language ? `language ${repo.language}` : '',
      typeof repo.stars === 'number' ? `${repo.stars} stars` : '',
      repo.defaultBranch ? `default branch ${repo.defaultBranch}` : '',
    ].filter(Boolean).join(', ');
    if (metadata) lines.push(`  Metadata: ${metadata}.`);
    if (repo.homepage) lines.push(`  Homepage: ${repo.homepage}`);
    if (repo.topics?.length) lines.push(`  Topics: ${repo.topics.join(', ')}`);
    if (repo.packageName || repo.packageDescription) {
      lines.push(`  package.json: ${[repo.packageName, repo.packageDescription].filter(Boolean).join(' - ')}`);
    }
    if (repo.readmeExcerpt) lines.push(`  README excerpt: ${repo.readmeExcerpt}`);
  }
  return lines.join('\n');
}

function excerptMarkdown(raw: string, maxChars: number): string {
  const cleaned = raw
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, Math.max(0, maxChars - 3)).trim()}...` : cleaned;
}

function cleanMultiline(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function joinUniqueBlocks(blocks: Array<string | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const clean = cleanMultiline(block);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.join('\n\n');
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '');
}

function parseTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function defaultFetch(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) {
  return fetch(url, init);
}
