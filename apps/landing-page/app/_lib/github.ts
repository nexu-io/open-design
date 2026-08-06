import { RELEASE_METADATA_UPSTREAM_URL, formatStableReleaseVersion } from './release-metadata';

export interface GithubRepoMeta {
  starsLabel: string;
  contributorsCount: number;
  versionLabel: string;
}

const REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const FALLBACK_META: GithubRepoMeta = {
  starsLabel: '83.3K+',
  contributorsCount: 387,
  // Build-time fallback when the GitHub releases API is unavailable / rate
  // limited. Keep in step with the latest published release.
  versionLabel: 'v0.9.0',
};

let repoMetaPromise: Promise<GithubRepoMeta> | null = null;

function formatStars(count: unknown): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K+`;
}

async function fetchContributorCount(): Promise<number> {
  const response = await fetch(`${REPO_API}/contributors?per_page=1`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`Request returned ${response.status}: ${response.url}`);
  }

  const link = response.headers.get('link') ?? '';
  const lastPage = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (lastPage?.[1]) return Number.parseInt(lastPage[1], 10);

  const contributors = (await response.json()) as unknown;
  return Array.isArray(contributors) ? contributors.length : 0;
}

// Parse a display version (e.g. "v0.9.0") from a GitHub /releases/latest object.
// getLatestRelease() reads the raw release (it also needs the asset list for the
// download matrix), so it parses tag_name/name directly rather than going
// through the release-metadata endpoint used for the header/home version chips.
function formatVersion(release: unknown): string | null {
  if (!release || typeof release !== 'object') return null;
  const record = release as { name?: unknown; tag_name?: unknown };
  const fromName = (name: unknown) => {
    if (typeof name !== 'string') return null;
    const match = name.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
    return match ? `v${match[1]}` : null;
  };
  const fromTag = (tag: unknown) => {
    if (typeof tag !== 'string') return null;
    const cleaned = tag.replace(/^open-design[-_]?v?/i, '').trim();
    return cleaned ? `v${cleaned.replace(/^v/, '')}` : null;
  };
  return fromName(record.name) ?? fromTag(record.tag_name);
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) throw new Error(`Request returned ${response.status}: ${url}`);
  return response.json();
}

export function getGithubRepoMeta(): Promise<GithubRepoMeta> {
  repoMetaPromise ??= (async () => {
    const [repoResult, contributorsResult, releaseMetadataResult] = await Promise.allSettled([
      fetchJson(REPO_API, { Accept: 'application/vnd.github+json' }),
      fetchContributorCount(),
      fetchJson(RELEASE_METADATA_UPSTREAM_URL, { Accept: 'application/json' }),
    ]);

    const repo = repoResult.status === 'fulfilled' ? repoResult.value : null;
    const contributorsCount =
      contributorsResult.status === 'fulfilled' && contributorsResult.value > 0
        ? contributorsResult.value
        : null;
    const releaseMetadata = releaseMetadataResult.status === 'fulfilled' ? releaseMetadataResult.value : null;
    const starsLabel = formatStars((repo as { stargazers_count?: unknown } | null)?.stargazers_count);
    const versionLabel = formatStableReleaseVersion(releaseMetadata);

    return {
      starsLabel: starsLabel ?? FALLBACK_META.starsLabel,
      contributorsCount: contributorsCount ?? FALLBACK_META.contributorsCount,
      versionLabel: versionLabel ?? FALLBACK_META.versionLabel,
    };
  })();

  return repoMetaPromise;
}

/* ------------------------------------------------------------------ *
 * Latest-release assets — powers the dedicated /download page.
 *
 * Build-time fetch of `releases/latest` resolved into a per-platform
 * matrix so the page renders complete, indexable download links without
 * client JS. The client-side enhancer (download-enhancer.astro) refetches
 * live and patches hrefs, so the page stays correct between rebuilds.
 * Mirrors the asset-name conventions used by header-enhancer.astro.
 * ------------------------------------------------------------------ */

const REPO_RELEASES = 'https://github.com/nexu-io/open-design/releases';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  sha256Url: string | null;
}

export interface ReleaseMatrix {
  macArm64Dmg: ReleaseAsset | null;
  macArm64Zip: ReleaseAsset | null;
  macX64Dmg: ReleaseAsset | null;
  macX64Zip: ReleaseAsset | null;
  winSetup: ReleaseAsset | null;
  winPortable: ReleaseAsset | null;
  linux: ReleaseAsset | null;
}

export interface LatestRelease {
  /** Clean version, e.g. "0.9.0" (no leading v). */
  version: string;
  /** Display label, e.g. "v0.9.0". */
  versionLabel: string;
  /** Raw git tag, e.g. "open-design-v0.9.0". */
  tagName: string | null;
  /** ISO date string, or null if unknown. */
  publishedAt: string | null;
  /** Human release page (tag-specific when available). */
  releaseUrl: string;
  matrix: ReleaseMatrix;
  /** Whether the matrix came from a live fetch (vs. fallback). */
  resolved: boolean;
}

interface RawAsset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

const EMPTY_MATRIX: ReleaseMatrix = {
  macArm64Dmg: null,
  macArm64Zip: null,
  macX64Dmg: null,
  macX64Zip: null,
  winSetup: null,
  winPortable: null,
  linux: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stableArtifact(value: unknown): ReleaseAsset | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.url !== 'string') {
    return null;
  }

  return {
    name: value.name,
    url: value.url,
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : 0,
    sha256Url: typeof value.sha256Url === 'string' ? value.sha256Url : null,
  };
}

function stablePlatformArtifact(
  metadata: unknown,
  platformKey: string,
  artifactKey: string,
): ReleaseAsset | null {
  if (!isRecord(metadata) || !isRecord(metadata.platforms)) return null;
  const platform = metadata.platforms[platformKey];
  if (!isRecord(platform) || !isRecord(platform.artifacts)) return null;
  return stableArtifact(platform.artifacts[artifactKey]);
}

/**
 * Parse the canonical stable-release manifest served from releases.open-design.ai.
 * Unlike the unauthenticated GitHub API, this endpoint is not constrained by the
 * shared 60-request rate limit, so high-intent download links stay direct even
 * when GitHub metadata cannot be resolved during a build.
 */
export function buildMatrixFromStableMetadata(metadata: unknown): ReleaseMatrix {
  return {
    macArm64Dmg: stablePlatformArtifact(metadata, 'mac', 'dmg'),
    macArm64Zip: stablePlatformArtifact(metadata, 'mac', 'zip'),
    macX64Dmg: stablePlatformArtifact(metadata, 'macIntel', 'dmg'),
    macX64Zip: stablePlatformArtifact(metadata, 'macIntel', 'zip'),
    winSetup: stablePlatformArtifact(metadata, 'win', 'installer'),
    winPortable: stablePlatformArtifact(metadata, 'win', 'portableZip'),
    linux:
      stablePlatformArtifact(metadata, 'linux', 'appImage') ??
      stablePlatformArtifact(metadata, 'linux', 'appimage'),
  };
}

type ReleaseMetadataFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Resolve the canonical public stable release from one complete R2 manifest.
 * Download-page version labels and artifacts must never be assembled from
 * independent GitHub and R2 snapshots.
 */
export async function fetchLatestStableRelease(
  fetchImpl: ReleaseMetadataFetch = fetch,
): Promise<LatestRelease> {
  const response = await fetchImpl(RELEASE_METADATA_UPSTREAM_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Request returned ${response.status}: ${RELEASE_METADATA_UPSTREAM_URL}`);
  }

  const metadata: unknown = await response.json();
  if (!isRecord(metadata) || metadata.channel !== 'stable' || metadata.releaseState !== 'complete') {
    throw new Error('Stable release metadata is not complete');
  }

  const versionLabel = formatStableReleaseVersion(metadata);
  if (!versionLabel) throw new Error('Stable release metadata has no valid version');

  const matrix = buildMatrixFromStableMetadata(metadata);
  if (!matrix.macArm64Dmg || !matrix.macX64Dmg || !matrix.winSetup) {
    throw new Error('Stable release metadata is missing required desktop installers');
  }
  const releaseVersion = cleanVersion(versionLabel);
  const versionPrefix = `/stable/versions/${releaseVersion}`;
  const mismatchedArtifact = Object.values(matrix).find((asset) => {
    if (!asset) return false;
    try {
      const url = new URL(asset.url);
      return (
        url.origin !== 'https://releases.open-design.ai' ||
        (url.pathname !== versionPrefix &&
          !url.pathname.startsWith(`${versionPrefix}/`) &&
          !url.pathname.startsWith(`${versionPrefix}.`))
      );
    } catch {
      return true;
    }
  });
  if (mismatchedArtifact) {
    throw new Error(
      `Stable release artifact ${mismatchedArtifact.name} does not match release version ${releaseVersion}`,
    );
  }
  const expectedTagName = `open-design-v${releaseVersion}`;
  if (metadata.versionTag !== expectedTagName) {
    throw new Error(`Stable release tag does not match version ${releaseVersion}`);
  }
  const tagName = expectedTagName;

  return {
    version: releaseVersion,
    versionLabel,
    tagName,
    publishedAt:
      typeof metadata.publishedAt === 'string'
        ? metadata.publishedAt
        : typeof metadata.generatedAt === 'string'
          ? metadata.generatedAt
          : null,
    releaseUrl: tagName
      ? `${REPO_RELEASES}/tag/${encodeURIComponent(tagName)}`
      : REPO_RELEASES,
    matrix,
    resolved: Object.values(matrix).some((asset) => asset !== null),
  };
}

let latestStableReleasePromise: Promise<LatestRelease> | null = null;

export function getLatestStableRelease(): Promise<LatestRelease> {
  latestStableReleasePromise ??= fetchLatestStableRelease();
  return latestStableReleasePromise;
}

function mergeMatrices(preferred: ReleaseMatrix, fallback: ReleaseMatrix): ReleaseMatrix {
  return {
    macArm64Dmg: preferred.macArm64Dmg ?? fallback.macArm64Dmg,
    macArm64Zip: preferred.macArm64Zip ?? fallback.macArm64Zip,
    macX64Dmg: preferred.macX64Dmg ?? fallback.macX64Dmg,
    macX64Zip: preferred.macX64Zip ?? fallback.macX64Zip,
    winSetup: preferred.winSetup ?? fallback.winSetup,
    winPortable: preferred.winPortable ?? fallback.winPortable,
    linux: preferred.linux ?? fallback.linux,
  };
}

function cleanVersion(versionLabel: string): string {
  return versionLabel.replace(/^v/, '');
}

function buildMatrix(rawAssets: RawAsset[]): ReleaseMatrix {
  const assets = rawAssets.filter(
    (a): a is { name: string; browser_download_url: string; size?: unknown } =>
      !!a && typeof a.name === 'string' && typeof a.browser_download_url === 'string',
  );

  const sha256For = (name: string): string | null => {
    const sib = assets.find((a) => a.name === `${name}.sha256`);
    return sib ? sib.browser_download_url : null;
  };

  const pick = (match: (name: string) => boolean): ReleaseAsset | null => {
    const a = assets.find((x) => !x.name.endsWith('.sha256') && match(x.name));
    if (!a) return null;
    return {
      name: a.name,
      url: a.browser_download_url,
      size: typeof a.size === 'number' && Number.isFinite(a.size) ? a.size : 0,
      sha256Url: sha256For(a.name),
    };
  };

  return {
    macArm64Dmg: pick((n) => n.endsWith('mac-arm64.dmg')),
    macArm64Zip: pick((n) => n.endsWith('mac-arm64.zip')),
    macX64Dmg: pick((n) => n.endsWith('mac-x64.dmg')),
    macX64Zip: pick((n) => n.endsWith('mac-x64.zip')),
    winSetup: pick((n) => /win.*setup\.exe$/.test(n)),
    winPortable: pick((n) => /win.*portable\.zip$/.test(n)),
    linux: pick((n) => /\.appimage$/i.test(n)),
  };
}

let latestReleasePromise: Promise<LatestRelease> | null = null;

export function getLatestRelease(): Promise<LatestRelease> {
  latestReleasePromise ??= (async () => {
    const [releaseResult, stableMetadataResult] = await Promise.allSettled([
      fetchJson(`${REPO_API}/releases/latest`, { Accept: 'application/vnd.github+json' }),
      fetchJson(RELEASE_METADATA_UPSTREAM_URL, { Accept: 'application/json' }),
    ]);
    const release = releaseResult.status === 'fulfilled' ? releaseResult.value : null;
    const stableMetadata =
      stableMetadataResult.status === 'fulfilled' ? stableMetadataResult.value : null;

    const rec = (release && typeof release === 'object' ? release : {}) as {
      tag_name?: unknown;
      html_url?: unknown;
      published_at?: unknown;
      assets?: unknown;
    };

    const stableRec = isRecord(stableMetadata) ? stableMetadata : {};
    const versionLabel =
      formatVersion(release) ??
      formatStableReleaseVersion(stableMetadata) ??
      FALLBACK_META.versionLabel;
    const rawAssets = Array.isArray(rec.assets) ? (rec.assets as RawAsset[]) : [];
    const githubMatrix = release ? buildMatrix(rawAssets) : EMPTY_MATRIX;
    const stableMatrix = buildMatrixFromStableMetadata(stableMetadata);
    const matrix = mergeMatrices(stableMatrix, githubMatrix);
    const resolved = Object.values(matrix).some((asset) => asset !== null);
    const tagName =
      typeof rec.tag_name === 'string'
        ? rec.tag_name
        : typeof stableRec.versionTag === 'string'
          ? stableRec.versionTag
          : null;

    return {
      version: cleanVersion(versionLabel),
      versionLabel,
      tagName,
      publishedAt:
        typeof rec.published_at === 'string'
          ? rec.published_at
          : typeof stableRec.generatedAt === 'string'
            ? stableRec.generatedAt
            : null,
      releaseUrl:
        typeof rec.html_url === 'string'
          ? rec.html_url
          : tagName
            ? `${REPO_RELEASES}/tag/${encodeURIComponent(tagName)}`
            : REPO_RELEASES,
      matrix,
      resolved,
    };
  })();

  return latestReleasePromise;
}
