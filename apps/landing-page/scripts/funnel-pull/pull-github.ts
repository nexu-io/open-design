import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OWNER = process.env.GITHUB_REPOSITORY_OWNER ?? 'nexu-io';
const REPO = process.env.OD_GITHUB_REPO ?? 'open-design';
const API = 'https://api.github.com';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function github<T>(pathName: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const res = await fetch(`${API}${pathName}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${pathName} returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function maybeGithub<T>(pathName: string): Promise<T | { error: string }> {
  try {
    return await github<T>(pathName);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

type ReleaseAsset = {
  id: number;
  name: string;
  download_count: number;
  browser_download_url: string;
};

type Release = {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  assets: ReleaseAsset[];
};

const outDir = path.resolve(process.cwd(), arg('--out') ?? 'out/seo-funnel');
const today = new Date().toISOString().slice(0, 10);
const repoPath = `/repos/${OWNER}/${REPO}`;

const [views, clones, popularReferrers, popularPaths, releases] = await Promise.all([
  maybeGithub(`${repoPath}/traffic/views`),
  maybeGithub(`${repoPath}/traffic/clones`),
  maybeGithub(`${repoPath}/traffic/popular/referrers`),
  maybeGithub(`${repoPath}/traffic/popular/paths`),
  maybeGithub<Release[]>(`${repoPath}/releases`),
]);

const releaseAssets = Array.isArray(releases)
  ? releases.map((release) => ({
      id: release.id,
      tagName: release.tag_name,
      name: release.name,
      publishedAt: release.published_at,
      url: release.html_url,
      assets: release.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        downloadCount: asset.download_count,
        url: asset.browser_download_url,
      })),
    }))
  : [];

const snapshot = {
  collectedAt: new Date().toISOString(),
  repository: `${OWNER}/${REPO}`,
  traffic: {
    views,
    clones,
    popularReferrers,
    popularPaths,
  },
  releases,
  releaseAssets,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `github-funnel-${today}.json`), JSON.stringify(snapshot, null, 2));
writeFileSync(path.join(outDir, 'github-funnel-latest.json'), JSON.stringify(snapshot, null, 2));

const assetDownloads = releaseAssets.flatMap((release) =>
  release.assets.map((asset) => ({
    release: release.tagName,
    name: asset.name,
    downloadCount: asset.downloadCount,
  })),
);

writeFileSync(
  path.join(outDir, 'funnel-report.md'),
  [
    '# Funnel Report',
    '',
    `Generated: ${snapshot.collectedAt}`,
    `Repository: ${snapshot.repository}`,
    '',
    '## GitHub Traffic',
    '',
    `- Views: ${'error' in views ? views.error : JSON.stringify(views.count ?? 0)}`,
    `- Unique viewers: ${'error' in views ? 'n/a' : JSON.stringify(views.uniques ?? 0)}`,
    `- Clones: ${'error' in clones ? clones.error : JSON.stringify(clones.count ?? 0)}`,
    `- Unique cloners: ${'error' in clones ? 'n/a' : JSON.stringify(clones.uniques ?? 0)}`,
    '',
    '## Release Downloads',
    '',
    ...('error' in releases ? [`- ${releases.error}`] : []),
    ...assetDownloads.map((asset) => `- ${asset.release} / ${asset.name}: ${asset.downloadCount}`),
    '',
  ].join('\n'),
);

console.log(`GitHub funnel snapshot written to ${path.relative(process.cwd(), outDir)}.`);
