/** @module source-context
 * Fetches GitHub repository metadata (description, README excerpt, package.json) for user design system inputs.
 * Used to enrich generation prompts with upstream source context before creating or revising a design system.
 * All network calls are timeout-bounded and failures are non-fatal — callers receive empty context on error.
 */

import type { UserDesignSystemInput } from '../core/index.js';

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

/**
 * Fetches GitHub repository metadata (description, README, package.json) for design system source URLs.
 * Returns empty context on network errors; all failures are non-fatal.
 */
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

/**
 * Merges fetched GitHub context (description, README excerpt, package metadata) into the user input's source notes.
 * Deduplicates repeated context blocks and preserves existing user notes.
 */
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

/**
 * Extracts provenance-level source notes when they differ from top-level notes.
 * Returns an empty string if provenance notes are absent or identical to top-level notes.
 */
function provenanceOnlySourceNotes(input: UserDesignSystemInput): string {
  const provenanceSourceNotes = cleanMultiline(input.provenance?.sourceNotes);
  const topLevelSourceNotes = cleanMultiline(input.sourceNotes);
  if (!provenanceSourceNotes || provenanceSourceNotes === topLevelSourceNotes) return '';
  return provenanceSourceNotes;
}

/**
 * Fetches GitHub repository metadata (description, README excerpt, package.json) for a single repository.
 * Returns error details when API calls fail; all failures are non-fatal.
 */
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

/**
 * Deduplicates and parses GitHub repository URLs, returning a list of unique repositories.
 * Duplicate URLs are silently skipped; unparseable URLs are ignored.
 */
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

/**
 * Parses GitHub repository URLs (both SSH and HTTPS formats) into owner/repo/url components.
 * Returns null when the URL cannot be parsed or does not match a GitHub domain.
 */
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

/**
 * Fetches and parses JSON from a URL with a timeout constraint.
 * Returns a success envelope with parsed JSON or an error envelope with HTTP status or exception message.
 */
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

/**
 * Attempts to fetch a raw file from GitHub across multiple branches and file paths.
 * Returns the file content on first success; returns an empty string if all attempts fail.
 */
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

/**
 * Wraps a fetch call with an AbortSignal timeout.
 * Aborts the request if it exceeds timeoutMs; always clears the timeout in a finally block.
 */
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

/**
 * Constructs a raw.githubusercontent.com URL for fetching a file from a GitHub repository.
 * All path components are URL-encoded to ensure safe transmission.
 */
function rawGithubUrl(repo: ParsedGitHubRepo, branch: string, filePath: string): string {
  const parts = [
    encodeURIComponent(repo.owner),
    encodeURIComponent(repo.repo),
    encodeURIComponent(branch),
    ...filePath.split('/').map(encodeURIComponent),
  ];
  return `https://raw.githubusercontent.com/${parts.join('/')}`;
}

/**
 * Returns a list of candidate branch names, starting with the default branch and falling back to common names.
 * Deduplicates branches and skips empty values.
 */
function branchCandidates(defaultBranch: string): string[] {
  const out: string[] = [];
  for (const branch of [defaultBranch, 'main', 'master']) {
    const clean = branch.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * Extracts name and description fields from a package.json content string.
 * Returns an empty object when parsing fails or input is empty.
 */
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

/**
 * Formats fetched GitHub repository metadata into a human-readable text block.
 * Returns an empty string when there are no repositories; includes error messages when API calls fail.
 */
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

/**
 * Strips Markdown formatting (images, links, headings, code) and truncates to a maximum character count.
 * Adds ellipsis when the content exceeds maxChars.
 */
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

/**
 * Normalizes whitespace in multiline strings: collapses extra spaces, removes empty lines, standardizes line endings.
 * Returns an empty string when input is not a string.
 */
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

/**
 * Merges multiline text blocks, deduplicating identical blocks after whitespace normalization.
 * Skips empty blocks and joins non-empty unique blocks with double newlines.
 */
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

/**
 * Removes the `.git` suffix from a string (case-insensitive).
 * Returns the original string if it does not end with `.git`.
 */
function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '');
}

/**
 * Extracts an array of trimmed topic strings from raw input, capping at 12 items.
 * Returns an empty array when input is not an array; filters out non-string and empty values.
 */
function parseTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Coerces a value to a trimmed string if it is a non-empty string; returns undefined otherwise.
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Coerces a value to a number if it is finite; returns undefined if non-numeric or not finite.
 */
function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Coerces a value to a record object if it is an object (not array); returns an empty object otherwise.
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Wrapper around the global `fetch` function, allowing dependency injection for testing.
 */
function defaultFetch(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) {
  return fetch(url, init);
}
