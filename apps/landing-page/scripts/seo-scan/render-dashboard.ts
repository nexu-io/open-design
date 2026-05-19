import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

const reportDir = path.resolve(process.cwd(), arg('--out') ?? 'out/seo-funnel');

const seo = readJson<{ scannedAt: string; totals: Record<string, number>; pageCount: number; sitemapUrlCount: number }>(
  path.join(reportDir, 'seo-scan-report.json'),
);
const live = readJson<{ scannedAt: string; totals: Record<string, number>; urlsChecked: number }>(
  path.join(reportDir, 'seo-live-report.json'),
);
const enrichment = readJson<{ enrichedAt: string; urls: string[]; schema?: { localJsonLdFindings?: unknown[] } }>(
  path.join(reportDir, 'seo-enrichment-report.json'),
);
const funnel = readJson<{ collectedAt: string; repository: string; releaseAssets?: Array<{ tagName: string; assets: Array<{ name: string; downloadCount: number }> }> }>(
  path.join(reportDir, 'github-funnel-latest.json'),
);
const experiments = readJson<{ generatedAt: string; repoTopicBacklog?: unknown[] }>(
  path.join(reportDir, 'content-experiment-backlog.json'),
);

const lines = [
  '# SEO + Funnel Dashboard',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Static SEO',
  '',
  seo
    ? `Scanned ${seo.pageCount} pages and ${seo.sitemapUrlCount} sitemap URLs. Critical: ${seo.totals.critical ?? 0}; warnings: ${seo.totals.warning ?? 0}.`
    : 'No static SEO scan report found.',
  '',
  '## Live Probe',
  '',
  live
    ? `Checked ${live.urlsChecked} live URLs. Critical: ${live.totals.critical ?? 0}; warnings: ${live.totals.warning ?? 0}.`
    : 'No live probe report found.',
  '',
  '## Enrichment',
  '',
  enrichment
    ? `Enriched ${enrichment.urls.length} URLs. Local JSON-LD findings: ${enrichment.schema?.localJsonLdFindings?.length ?? 0}.`
    : 'No enrichment report found.',
  '',
  '## GitHub Funnel',
  '',
  funnel
    ? `Collected GitHub funnel data for ${funnel.repository} at ${funnel.collectedAt}. Release assets tracked: ${funnel.releaseAssets?.flatMap((release) => release.assets).length ?? 0}.`
    : 'No GitHub funnel snapshot found.',
  '',
  '## Content Backlog',
  '',
  experiments
    ? `Experiment backlog generated at ${experiments.generatedAt}. Repo-path topics: ${experiments.repoTopicBacklog?.length ?? 0}.`
    : 'No content experiment backlog found.',
  '',
  '## Report Files',
  '',
  '- `seo-scan-report.md`',
  '- `seo-live-report.md`',
  '- `seo-enrichment-report.md`',
  '- `funnel-report.md`',
  '- `content-experiment-backlog.md`',
  '',
];

writeFileSync(path.join(reportDir, 'dashboard.md'), lines.join('\n'));
console.log(`Dashboard written to ${path.relative(process.cwd(), path.join(reportDir, 'dashboard.md'))}.`);
