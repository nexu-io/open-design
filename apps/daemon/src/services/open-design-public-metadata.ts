export interface OpenDesignGithubRepoStats {
  stargazersCount: number;
  fetchedAt: number;
  stale: boolean;
}

export interface OpenDesignGithubLatestReleaseInfo {
  tagName: string;
  htmlUrl: string;
  fetchedAt: number;
  stale: boolean;
}

export interface OpenDesignDiscordPresence {
  onlineCount: number;
  memberCount: number;
  fetchedAt: number;
  stale: boolean;
}

export interface OpenDesignPublicMetadataService {
  readGithubRepoStats(): Promise<OpenDesignGithubRepoStats>;
  readLatestReleaseInfo(): Promise<OpenDesignGithubLatestReleaseInfo>;
  readDiscordPresence(): Promise<OpenDesignDiscordPresence>;
}

interface CachedGithubRepoStats {
  stargazersCount: number;
  fetchedAt: number;
}

interface CachedGithubLatestReleaseInfo {
  tagName: string;
  htmlUrl: string;
  fetchedAt: number;
}

interface CachedDiscordPresence {
  onlineCount: number;
  memberCount: number;
  fetchedAt: number;
}

interface GithubRepoMetadataPayload {
  stargazers_count?: unknown;
}

interface GithubLatestReleasePayload {
  tag_name?: unknown;
  html_url?: unknown;
}

interface DiscordInviteProfilePayload {
  online_count?: unknown;
  member_count?: unknown;
}

interface DiscordInvitePayload {
  approximate_presence_count?: unknown;
  approximate_member_count?: unknown;
  profile?: unknown;
}

export interface OpenDesignPublicMetadataServiceOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const OPEN_DESIGN_GITHUB_REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const OPEN_DESIGN_GITHUB_RELEASE_LATEST_API = 'https://api.github.com/repos/nexu-io/open-design/releases/latest';
const OPEN_DESIGN_GITHUB_CACHE_TTL_MS = 60 * 60 * 1000;
const OPEN_DESIGN_GITHUB_TIMEOUT_MS = 4_000;
const OPEN_DESIGN_DISCORD_INVITE_CODE = '9ptkbbqRu';
export const OPEN_DESIGN_DISCORD_INVITE_URL = `https://discord.gg/${OPEN_DESIGN_DISCORD_INVITE_CODE}`;
const OPEN_DESIGN_DISCORD_INVITE_API = `https://discord.com/api/v10/invites/${OPEN_DESIGN_DISCORD_INVITE_CODE}?with_counts=true`;
const OPEN_DESIGN_DISCORD_CACHE_TTL_MS = 5 * 60 * 1000;
const OPEN_DESIGN_DISCORD_TIMEOUT_MS = 4_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readFiniteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function withFreshness<T extends { fetchedAt: number }>(
  value: T,
  stale: boolean,
): T & { stale: boolean } {
  return { ...value, stale };
}

export function createOpenDesignPublicMetadataService({
  fetchImpl = fetch,
  now = () => Date.now(),
}: OpenDesignPublicMetadataServiceOptions = {}): OpenDesignPublicMetadataService {
  let githubRepoCache: CachedGithubRepoStats | null = null;
  let githubRepoInflight: Promise<OpenDesignGithubRepoStats> | null = null;
  let githubLatestReleaseCache: CachedGithubLatestReleaseInfo | null = null;
  let githubLatestReleaseInflight: Promise<OpenDesignGithubLatestReleaseInfo> | null = null;
  let discordPresenceCache: CachedDiscordPresence | null = null;
  let discordPresenceInflight: Promise<OpenDesignDiscordPresence> | null = null;

  async function readGithubRepoStats(): Promise<OpenDesignGithubRepoStats> {
    const currentTime = now();
    if (
      githubRepoCache &&
      currentTime - githubRepoCache.fetchedAt < OPEN_DESIGN_GITHUB_CACHE_TTL_MS
    ) {
      return withFreshness(githubRepoCache, false);
    }

    if (githubRepoInflight) return githubRepoInflight;

    githubRepoInflight = (async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_GITHUB_TIMEOUT_MS);
      try {
        const response = await fetchImpl(OPEN_DESIGN_GITHUB_REPO_API, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'open-design-daemon',
          },
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`GitHub repo metadata request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as GithubRepoMetadataPayload;
        const stargazersCount = readFiniteNonNegativeNumber(payload.stargazers_count);
        if (stargazersCount == null) {
          throw new Error('GitHub repo metadata did not include a numeric stargazers_count');
        }
        githubRepoCache = { stargazersCount, fetchedAt: now() };
        return withFreshness(githubRepoCache, false);
      } catch (error) {
        if (githubRepoCache) return withFreshness(githubRepoCache, true);
        throw error;
      } finally {
        clearTimeout(timeout);
        githubRepoInflight = null;
      }
    })();

    return githubRepoInflight;
  }

  async function readLatestReleaseInfo(): Promise<OpenDesignGithubLatestReleaseInfo> {
    const currentTime = now();
    if (
      githubLatestReleaseCache &&
      currentTime - githubLatestReleaseCache.fetchedAt < OPEN_DESIGN_GITHUB_CACHE_TTL_MS
    ) {
      return withFreshness(githubLatestReleaseCache, false);
    }

    if (githubLatestReleaseInflight) return githubLatestReleaseInflight;

    githubLatestReleaseInflight = (async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_GITHUB_TIMEOUT_MS);
      try {
        const response = await fetchImpl(OPEN_DESIGN_GITHUB_RELEASE_LATEST_API, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'open-design-daemon',
          },
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`GitHub latest release request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as GithubLatestReleasePayload;
        const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : null;
        const htmlUrl = typeof payload.html_url === 'string' ? payload.html_url : null;
        if (!tagName || !htmlUrl) {
          throw new Error('GitHub latest release metadata did not include tag_name/html_url');
        }
        githubLatestReleaseCache = { tagName, htmlUrl, fetchedAt: now() };
        return withFreshness(githubLatestReleaseCache, false);
      } catch (error) {
        if (githubLatestReleaseCache) return withFreshness(githubLatestReleaseCache, true);
        throw error;
      } finally {
        clearTimeout(timeout);
        githubLatestReleaseInflight = null;
      }
    })();

    return githubLatestReleaseInflight;
  }

  async function readDiscordPresence(): Promise<OpenDesignDiscordPresence> {
    const currentTime = now();
    if (
      discordPresenceCache &&
      currentTime - discordPresenceCache.fetchedAt < OPEN_DESIGN_DISCORD_CACHE_TTL_MS
    ) {
      return withFreshness(discordPresenceCache, false);
    }

    if (discordPresenceInflight) return discordPresenceInflight;

    discordPresenceInflight = (async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), OPEN_DESIGN_DISCORD_TIMEOUT_MS);
      try {
        const response = await fetchImpl(OPEN_DESIGN_DISCORD_INVITE_API, {
          headers: {
            accept: 'application/json',
            'user-agent': 'open-design-daemon',
          },
          signal: ctrl.signal,
        });
        if (!response.ok) {
          throw new Error(`Discord invite metadata request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as DiscordInvitePayload;
        const profile = isObject(payload.profile)
          ? (payload.profile as DiscordInviteProfilePayload)
          : null;
        const onlineCount =
          readFiniteNonNegativeNumber(payload.approximate_presence_count) ??
          readFiniteNonNegativeNumber(profile?.online_count);
        const memberCount =
          readFiniteNonNegativeNumber(payload.approximate_member_count) ??
          readFiniteNonNegativeNumber(profile?.member_count);

        if (onlineCount == null || memberCount == null) {
          throw new Error('Discord invite metadata did not include numeric member counts');
        }

        discordPresenceCache = { onlineCount, memberCount, fetchedAt: now() };
        return withFreshness(discordPresenceCache, false);
      } catch (error) {
        if (discordPresenceCache) return withFreshness(discordPresenceCache, true);
        throw error;
      } finally {
        clearTimeout(timeout);
        discordPresenceInflight = null;
      }
    })();

    return discordPresenceInflight;
  }

  return {
    readGithubRepoStats,
    readLatestReleaseInfo,
    readDiscordPresence,
  };
}
