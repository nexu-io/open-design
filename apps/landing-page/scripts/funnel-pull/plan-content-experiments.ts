import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

type PopularPath = {
  path: string;
  title: string;
  count: number;
  uniques: number;
};

type Snapshot = {
  collectedAt: string;
  traffic?: {
    popularPaths?: PopularPath[] | { error: string };
  };
};

const reportDir = path.resolve(process.cwd(), arg('--out') ?? 'out/seo-funnel');
const snapshotPath = path.join(reportDir, 'github-funnel-latest.json');
const snapshot = existsSync(snapshotPath)
  ? (JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot)
  : null;

const popularPaths = Array.isArray(snapshot?.traffic?.popularPaths)
  ? snapshot.traffic.popularPaths
  : [];

const repoTopicBacklog = popularPaths
  .filter((item) => item.path.includes('/tree/') || item.path.includes('/blob/'))
  .slice(0, 20)
  .map((item) => {
    const normalized = item.path
      .replace(/^\/nexu-io\/open-design\/(?:tree|blob)\/main\//, '')
      .replace(/\/README\.md$/, '')
      .replace(/\.md$/, '');
    return {
      repoPath: item.path,
      traffic: item.count,
      uniques: item.uniques,
      suggestedTopic: `Turn ${normalized} into a search landing page or deep guide`,
    };
  });

const report = {
  generatedAt: new Date().toISOString(),
  sourceSnapshot: snapshot?.collectedAt ?? null,
  heroExperimentBacklog: [
    {
      name: 'hero-primary-star-vs-download',
      hypothesis: 'Visitors arriving from high-intent product queries may convert better when the primary CTA is Download desktop and Star is secondary.',
      variants: ['Star us on GitHub', 'Download desktop'],
      prerequisite: 'At least 14 days of outbound click data with utm_campaign=hero-primary and hero-secondary.',
    },
    {
      name: 'hero-copy-agent-workspace-vs-skill-layer',
      hypothesis: 'Search users comparing alternatives may respond better to a concrete workspace promise than the abstract skill-layer framing.',
      variants: [
        'Open-source design studio for your coding agent',
        'Turn Claude, Codex, Cursor, and Qwen into a design engine',
      ],
      prerequisite: 'At least 1,000 landing-page sessions or 100 outbound hero clicks.',
    },
  ],
  blogCtrReview: {
    note: 'Rank blog posts once OUTBOUND_EVENTS is exported or aggregated into out/seo-funnel/outbound-*.json.',
    sortKeys: ['utm.medium starts with blog-', 'outbound_clicks / GSC clicks', 'bottom CTA clicks'],
  },
  repoTopicBacklog,
};

writeFileSync(path.join(reportDir, 'content-experiment-backlog.json'), JSON.stringify(report, null, 2));
writeFileSync(
  path.join(reportDir, 'content-experiment-backlog.md'),
  [
    '# Content + Experiment Backlog',
    '',
    `Generated: ${report.generatedAt}`,
    `Source snapshot: ${report.sourceSnapshot ?? 'not available'}`,
    '',
    '## Hero Experiments',
    '',
    ...report.heroExperimentBacklog.flatMap((item) => [
      `- ${item.name}`,
      `  Hypothesis: ${item.hypothesis}`,
      `  Variants: ${item.variants.join(' / ')}`,
      `  Prerequisite: ${item.prerequisite}`,
    ]),
    '',
    '## Blog CTR Review',
    '',
    report.blogCtrReview.note,
    '',
    '## Repo Path Topic Backlog',
    '',
    ...(repoTopicBacklog.length > 0
      ? repoTopicBacklog.map((item) => `- ${item.repoPath}: ${item.suggestedTopic} (${item.traffic} views, ${item.uniques} unique)`)
      : ['No GitHub popular path data available yet.']),
    '',
  ].join('\n'),
);

console.log(`Content experiment backlog written to ${path.relative(process.cwd(), reportDir)}.`);
