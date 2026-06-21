import { RELEASE_METADATA_UPSTREAM_URL, formatStableReleaseVersion } from './release-metadata';

export interface GithubRepoMeta {
  starsLabel: string;
  versionLabel: string;
}

const REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const FALLBACK_META: GithubRepoMeta = {
  starsLabel: '40K+',
  // Build-time fallback when the GitHub releases API is unavailable / rate
  // limited. Keep in step with the latest published release.
  versionLabel: 'v0.9.0',
};

let repoMetaPromise: Promise<GithubRepoMeta> | null = null;

function formatStars(count: unknown): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
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
    const [repoResult, releaseMetadataResult] = await Promise.allSettled([
      fetchJson(REPO_API, { Accept: 'application/vnd.github+json' }),
      fetchJson(RELEASE_METADATA_UPSTREAM_URL, { Accept: 'application/json' }),
    ]);

    const repo = repoResult.status === 'fulfilled' ? repoResult.value : null;
    const releaseMetadata = releaseMetadataResult.status === 'fulfilled' ? releaseMetadataResult.value : null;
    const starsLabel = formatStars((repo as { stargazers_count?: unknown } | null)?.stargazers_count);
    const versionLabel = formatStableReleaseVersion(releaseMetadata);

    return {
      starsLabel: starsLabel ?? FALLBACK_META.starsLabel,
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
    let release: unknown = null;
    try {
      release = await fetchJson(`${REPO_API}/releases/latest`);
    } catch {
      release = null;
    }

    const rec = (release && typeof release === 'object' ? release : {}) as {
      tag_name?: unknown;
      html_url?: unknown;
      published_at?: unknown;
      assets?: unknown;
    };

    const versionLabel = formatVersion(release) ?? FALLBACK_META.versionLabel;
    const rawAssets = Array.isArray(rec.assets) ? (rec.assets as RawAsset[]) : [];
    const matrix = release ? buildMatrix(rawAssets) : EMPTY_MATRIX;
    const resolved = Boolean(release) && Object.values(matrix).some((a) => a !== null);

    return {
      version: cleanVersion(versionLabel),
      versionLabel,
      tagName: typeof rec.tag_name === 'string' ? rec.tag_name : null,
      publishedAt: typeof rec.published_at === 'string' ? rec.published_at : null,
      releaseUrl: typeof rec.html_url === 'string' ? rec.html_url : REPO_RELEASES,
      matrix,
      resolved,
    };
  })();

  return latestReleasePromise;
}
