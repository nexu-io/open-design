/* ─────────────────────────────────────────────────────────────────────────
 * scripts/refresh-plugin-popularity.ts
 *
 * Rebuilds apps/web/src/components/plugins-home/pluginPopularity.generated.ts
 * from PostHog usage, so the plugin/example grid and the Home rail lead each
 * category and sub-category with the templates users actually reach for
 * (OPEND-449).
 *
 *   1. Query PostHog `run_finished` for the trailing-window per-plugin_id counts
 *      (total runs + distinct users).
 *   2. Join against the live bundled catalog (the open-design.json manifests
 *      under plugins/_official → the daemon's plugin ids); drop retired ids.
 *   3. Blend distinct-users + runs into one [0,1] score and rewrite the
 *      generated file.
 *
 * Run weekly by .github/workflows/refresh-plugin-popularity.yml, which opens a
 * PR with the regenerated file. The transform is deterministic and creds-free;
 * only the fetch needs a PostHog personal API key, injected as a repo secret.
 *
 *   pnpm exec tsx scripts/refresh-plugin-popularity.ts            # dry run
 *   pnpm exec tsx scripts/refresh-plugin-popularity.ts --write    # rewrite file
 * ───────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
function getArg(name: string, dflt: string | number | boolean): string | number | boolean {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
}

const WRITE = Boolean(getArg('write', false));
const WINDOW_DAYS = Number(getArg('window', 28));
const OD_REPO = String(getArg('od-repo', process.env.OD_REPO || REPO_ROOT));
const WEIGHT_USERS = Number(getArg('w-users', 0.6));
const WEIGHT_RUNS = Number(getArg('w-runs', 0.4));
const MIN_USERS = Number(getArg('min-users', 20));

const POSTHOG_HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const PROJECT_OD =
  process.env.POSTHOG_PROJECT_OD || process.env.POSTHOG_CLI_PROJECT_ID || process.env.POSTHOG_PROJECT_ID || '420348';
const API_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY ||
  process.env.POSTHOG_CLI_API_KEY ||
  process.env.POSTHOG_API_KEY ||
  process.env.POSTHOG_TOKEN;

interface Counts {
  [id: string]: { runs: number; users: number };
}

async function hogql(query: string): Promise<unknown[]> {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_OD}/query/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const json = (await res.json()) as { results?: unknown[]; result?: unknown[] };
  if (!res.ok) throw new Error(`PostHog query failed: ${JSON.stringify(json).slice(0, 200)}`);
  return json.results || json.result || [];
}

// 1. trailing-window plugin_id counts. An explicit ORDER BY + high LIMIT is
// required: PostHog caps HogQL at 100 rows by default and, without an order,
// returns an arbitrary 100 — which silently drops the head templates.
async function fetchCounts(): Promise<Counts> {
  const rows = (await hogql(`
    SELECT properties.plugin_id AS plugin, count() AS runs,
           count(DISTINCT properties.device_id) AS users
    FROM events
    WHERE event = 'run_finished'
      AND timestamp >= now() - interval ${WINDOW_DAYS} day
      AND coalesce(properties.plugin_id, '') != ''
    GROUP BY plugin
    ORDER BY runs DESC
    LIMIT 10000
  `)) as Array<[string, number, number]>;
  const counts: Counts = {};
  for (const [plugin, runs, users] of rows) {
    if (plugin) counts[plugin] = { runs: Number(runs), users: Number(users) };
  }
  return counts;
}

// 2. live catalog from the bundled first-party manifests. Their bare `name`
// matches the telemetry plugin_id; the marketplace registry is not used (its
// names are `open-design/<id>`-prefixed and do not match plugin_id).
interface CatalogEntry {
  dir: string;
  od: Record<string, unknown>;
}

function liveCatalog(): Map<string, CatalogEntry> {
  const catalog = new Map<string, CatalogEntry>();
  const officialRoot = join(OD_REPO, 'plugins/_official');
  if (!existsSync(officialRoot)) return catalog;
  for (const bucket of readdirSync(officialRoot)) {
    let entries: string[];
    try {
      entries = readdirSync(join(officialRoot, bucket));
    } catch {
      continue; // not a directory
    }
    for (const dir of entries) {
      const dirPath = join(officialRoot, bucket, dir);
      const mf = join(dirPath, 'open-design.json');
      if (!existsSync(mf)) continue;
      try {
        const j = JSON.parse(readFileSync(mf, 'utf8')) as { name?: string; od?: Record<string, unknown> };
        if (j.name) catalog.set(j.name, { dir: dirPath, od: j.od ?? {} });
      } catch {
        /* skip unreadable manifest */
      }
    }
  }
  return catalog;
}

// Pre-baked hover-pan clips the daemon attaches to gallery tiles.
function bakedPreviewIds(): Set<string> {
  const mf = join(OD_REPO, 'data/plugin-previews/manifest.json');
  if (!existsSync(mf)) return new Set<string>();
  try {
    const previews =
      (JSON.parse(readFileSync(mf, 'utf8')) as { previews?: Record<string, unknown> }).previews ?? {};
    return new Set(Object.keys(previews));
  } catch {
    return new Set<string>();
  }
}

// A template earns a spot in the usage-ordered gallery only if it renders a real
// visual preview — a baked clip, a media/html `od.preview`, or example outputs.
// Mode-seed entries with no preview (the generic Live Artifact / HyperFrames
// options picked from the composer, not styled templates) would otherwise be
// floated up by usage and show as an empty letter card, so they are excluded
// from the score and keep their fallback order.
function hasRenderablePreview(id: string, entry: CatalogEntry, baked: Set<string>): boolean {
  if (baked.has(id)) return true;
  const preview = entry.od.preview as Record<string, unknown> | undefined;
  if (preview && typeof preview === 'object') {
    const type = String(preview.type ?? '').toLowerCase();
    if (preview.video || preview.audio || preview.poster || preview.gif) return true;
    if (type === 'html' && typeof preview.entry === 'string' && existsSync(join(entry.dir, preview.entry))) {
      return true;
    }
  }
  const examplesDir = join(entry.dir, 'examples');
  if (existsSync(examplesDir)) {
    try {
      if (readdirSync(examplesDir).some((f) => f.endsWith('.html') || f.endsWith('.htm'))) return true;
    } catch {
      /* ignore unreadable examples dir */
    }
  }
  return Boolean(entry.od.exampleOutputs);
}

const isTemplate = (id: string): boolean => id.startsWith('example-') || id.includes('template');

// 3. blend into a single [0,1] score.
function blend(
  counts: Counts,
  catalog: Map<string, CatalogEntry>,
  baked: Set<string>,
): Array<[string, number, { runs: number; users: number }]> {
  const live = Object.entries(counts).filter(
    ([id]) => catalog.has(id) && isTemplate(id) && hasRenderablePreview(id, catalog.get(id)!, baked),
  );
  const lu = new Map(live.map(([id, c]) => [id, Math.log1p(c.users)]));
  const lr = new Map(live.map(([id, c]) => [id, Math.log1p(c.runs)]));
  const uMax = Math.max(1e-9, ...lu.values());
  const rMax = Math.max(1e-9, ...lr.values());
  const scored: Array<[string, number, { runs: number; users: number }]> = [];
  for (const [id, c] of live) {
    if (c.users < MIN_USERS) continue; // below threshold -> fallback order
    const score = WEIGHT_USERS * (lu.get(id)! / uMax) + WEIGHT_RUNS * (lr.get(id)! / rMax);
    scored.push([id, Math.round(score * 1e4) / 1e4, c]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return scored;
}

// 4. emit the generated TS.
const fmt = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

function render(
  scored: Array<[string, number, unknown]>,
  noPreview: string[],
  generatedAt: string,
): string {
  const head = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Blended template popularity, used to order the plugin/example grid and the
// Home rail so the templates users actually reach for lead each category and
// sub-category (OPEND-449). Higher score = more popular; range [0, 1].
//
// How it is built (deterministic, creds-free transform):
//   score = ${WEIGHT_USERS} * norm(log1p(distinctUsers)) + ${WEIGHT_RUNS} * norm(log1p(runs))
//   • window: trailing ${WINDOW_DAYS} days of \`run_finished\` events (by plugin_id)
//   • distinct users are the anti-gaming signal; runs add engagement depth
//   • log1p tames the head-template scale gap; min-max normalized over the
//     live-catalog template set so both metrics land in [0, 1]
//   • RETIRED plugins (absent from the live catalog) are dropped
//   • templates with no renderable preview are EXCLUDED — mode-seed entries
//     (e.g. the generic Live Artifact / HyperFrames options) live in the
//     composer mode picker, not the gallery, so usage must not float them up
//   • templates below ${MIN_USERS} distinct users are OMITTED so thin-sample
//     tail templates keep their curated/visual fallback order
//
// Regenerate with: pnpm exec tsx scripts/refresh-plugin-popularity.ts --write
// Refreshed weekly by .github/workflows/refresh-plugin-popularity.yml.
// See pluginPopularity.RUNBOOK.md here.

export interface PluginPopularityMeta {
  readonly generatedAt: string;
  readonly windowDays: number;
  readonly weights: { readonly users: number; readonly runs: number };
  readonly minUsers: number;
  readonly count: number;
}

export const PLUGIN_POPULARITY_META: PluginPopularityMeta = {
  generatedAt: '${generatedAt}',
  windowDays: ${WINDOW_DAYS},
  weights: { users: ${WEIGHT_USERS}, runs: ${WEIGHT_RUNS} },
  minUsers: ${MIN_USERS},
  count: ${scored.length},
};

// Plugin id -> blended popularity score in [0, 1], most-popular first.
export const PLUGIN_POPULARITY: Readonly<Record<string, number>> = {
`;
  const body = scored.map(([id, s]) => `  '${id}': ${fmt(s)},\n`).join('');
  const suppressed = [...noPreview].sort();
  const noPreviewBlock = `
// Templates with no renderable preview — suppressed from the visual gallery
// grid so they never show as an empty letter card. They still reach users
// through the composer's mode picker. Repo-derived (baked manifest + on-disk
// \`od.preview\` entry existence), refreshed alongside the scores above.
export const PLUGIN_NO_PREVIEW: readonly string[] = [
${suppressed.map((id) => `  '${id}',\n`).join('')}];
`;
  return `${head}${body}};\n${noPreviewBlock}`;
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.warn('plugin-popularity refresh skipped: no PostHog API key in env.');
    return;
  }
  if (!existsSync(join(OD_REPO, 'plugins/_official'))) {
    throw new Error(`--od-repo does not look like an open-design checkout: ${OD_REPO}`);
  }

  const counts = await fetchCounts();
  const catalog = liveCatalog();
  const baked = bakedPreviewIds();
  const scored = blend(counts, catalog, baked);
  const retired = Object.keys(counts).filter((id) => isTemplate(id) && !catalog.has(id));
  // Suppression list is over the FULL catalog (not just templates with usage) so
  // a zero-traffic no-preview template is hidden from the grid too.
  const noPreview = [...catalog.keys()].filter(
    (id) => isTemplate(id) && !hasRenderablePreview(id, catalog.get(id)!, baked),
  );

  console.log(`window=${WINDOW_DAYS}d  live-catalog ids=${catalog.size}`);
  console.log(`scored templates (>= ${MIN_USERS} users, with preview): ${scored.length}`);
  console.log(`retired template ids dropped: ${retired.length}`);
  console.log(`no-preview templates suppressed from gallery: ${noPreview.length}${noPreview.length ? ` (${noPreview.join(', ')})` : ''}`);
  for (const [id, s, c] of scored.slice(0, 8)) {
    const top = c as { users: number; runs: number };
    console.log(`  ${s.toFixed(4)}  ${id}  (${top.users}u/${top.runs}r)`);
  }

  if (WRITE) {
    const stamp = new Date().toISOString().slice(0, 10);
    const out = join(OD_REPO, 'apps/web/src/components/plugins-home/pluginPopularity.generated.ts');
    writeFileSync(out, render(scored, noPreview, stamp));
    console.log(`\nwrote ${out}`);
  } else {
    console.log('\n(dry run — pass --write to rewrite pluginPopularity.generated.ts)');
  }
}

await main();
