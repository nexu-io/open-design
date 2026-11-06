/* ─────────────────────────────────────────────────────────────────────────
 * scripts/normalize-plugin-scenarios.ts
 *
 * Phase 3 dry-run: propose a `od.scenario` value for every visible plugin
 * manifest under `plugins/_official/**`, mapped onto the 7 scenario lanes
 * derived from the user-query analysis report.
 *
 *   business-system  | 业务系统 / 后台 / 数据看板
 *   presentation     | 演示文稿 / 报告 / 课程
 *   app-prototype    | App / 多屏产品原型
 *   landing          | 官网 / Landing / 营销页
 *   brand-visual     | 品牌视觉 / Logo / 设计系统
 *   dev-tool         | 开发者工具 / 工程协作
 *   media-asset      | 图片 / 视频 / 展示素材
 *   general          | 兜底：现有信号无法稳定归类
 *
 * The script is intentionally read-only. It emits:
 *   - stdout: a markdown report grouped by proposed scenario so a human
 *     can scan whether assignments look right.
 *   - .tmp/plugin-scenario-mapping.json: machine-readable mapping the
 *     follow-up writer step will consume.
 *
 * Run: `pnpm exec tsx scripts/normalize-plugin-scenarios.ts`
 * ─────────────────────────────────────────────────────────────────── */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialRoot = path.join(repoRoot, 'plugins', '_official');
const outDir = path.join(repoRoot, '.tmp');
const outFile = path.join(outDir, 'plugin-scenario-mapping.json');

type Scenario =
  | 'business-system'
  | 'presentation'
  | 'app-prototype'
  | 'landing'
  | 'brand-visual'
  | 'dev-tool'
  | 'media-asset'
  | 'general';

const SCENARIO_LABEL: Record<Scenario, string> = {
  'business-system': '业务系统 / 后台 / 数据看板',
  presentation: '演示文稿 / 报告 / 课程',
  'app-prototype': 'App / 多屏产品原型',
  landing: '官网 / Landing / 营销页',
  'brand-visual': '品牌视觉 / Logo / 设计系统',
  'dev-tool': '开发者工具 / 工程协作',
  'media-asset': '图片 / 视频 / 展示素材',
  general: '兜底（待人工复核）',
};

interface Manifest {
  name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  od?: {
    kind?: string;
    taskKind?: string;
    mode?: string;
    scenario?: string;
    surface?: string;
    platform?: string;
  };
}

interface Candidate {
  manifestPath: string;
  relPath: string;
  id: string;
  title: string;
  currentScenario: string;
  currentMode: string;
  currentTaskKind: string;
  tags: string[];
  proposedScenario: Scenario;
  reason: string;
}

async function listManifests(): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name === 'open-design.json') {
        out.push(full);
      }
    }
  }
  await walk(officialRoot);
  return out.sort();
}

function toTagSet(tags: string[] | undefined): Set<string> {
  return new Set((tags ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean));
}

const BUSINESS_SYSTEM_TAGS = [
  'dashboard',
  'admin-panel',
  'admin',
  'analytics',
  'control-panel',
  'crm',
  'erp',
  'operations',
  'reporting',
  'workspace',
  'kanban',
  'inventory',
  'logistics',
  'fleet',
  'finance-admin',
];

const PRESENTATION_TAGS = [
  'slides',
  'deck',
  'presentation',
  'pitch',
  'pitch-deck',
  'keynote',
  'course',
  'training',
  'lecture',
  'lesson',
  'report-deck',
  'editorial-deck',
];

const APP_TAGS = [
  'mobile',
  'ios',
  'android',
  'wechat',
  'miniapp',
  'mini-program',
  'tablet',
  'app',
  'mobile-app',
  'multi-screen',
  'screen-flow',
  'onboarding',
];

const LANDING_TAGS = [
  'landing',
  'landing-page',
  'saas',
  'marketing',
  'marketing-site',
  'hero',
  'cta',
  'pricing',
  'b2b',
  'product-site',
  'homepage',
  'portfolio',
  'agency',
  'studio',
  'consulting',
];

const BRAND_VISUAL_TAGS = [
  'design-system',
  'brand',
  'brand-visual',
  'logo',
  'typography',
  'color-system',
  'visual-language',
  'identity',
  'guideline',
  'style-guide',
];

const DEV_TOOL_TAGS = [
  'developer',
  'developer-tool',
  'cli',
  'ide',
  'agent',
  'mcp',
  'connector',
  'plugin-authoring',
  'automation',
  'devops',
  'runbook',
  'figma-migration',
  'code-migration',
  'export',
  'handoff',
];

const MEDIA_ASSET_TAGS = [
  'image-asset',
  'poster',
  'screenshot',
  'app-store-screenshot',
  'render',
  'thumbnail',
  'storyboard',
  'banner',
];

function anyTag(tags: Set<string>, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (tags.has(candidate)) return candidate;
  }
  return null;
}

function classify(manifest: Manifest, relPath: string): { scenario: Scenario; reason: string } {
  const od = manifest.od ?? {};
  const mode = String(od.mode ?? '').toLowerCase();
  const taskKind = String(od.taskKind ?? '').toLowerCase();
  const scenario = String(od.scenario ?? '').toLowerCase();
  const tags = toTagSet(manifest.tags);
  const id = (manifest.name ?? '').toLowerCase();
  const description = (manifest.description ?? '').toLowerCase();

  // 1. Hard infrastructure scenarios go straight to dev-tool. These are
  // the platform's own routing scenarios (figma migration, code migration,
  // exports, plugin authoring, refine/tune), not artifact builders.
  if (
    taskKind === 'figma-migration' ||
    taskKind === 'code-migration' ||
    taskKind === 'tune-collab' ||
    id === 'od-plugin-authoring' ||
    id === 'od-design-refine' ||
    id.endsWith('-export') ||
    id.startsWith('od-')
      && (id.includes('export') || id.includes('migration') || id.includes('tune') || id.includes('refine'))
  ) {
    return { scenario: 'dev-tool', reason: `infra:${taskKind || id}` };
  }

  // 2. Mode-based fast paths.
  if (mode === 'design-system') {
    return { scenario: 'brand-visual', reason: 'mode:design-system' };
  }
  if (mode === 'image' || mode === 'video' || mode === 'audio') {
    return { scenario: 'media-asset', reason: `mode:${mode}` };
  }
  if (mode === 'deck') {
    return { scenario: 'presentation', reason: 'mode:deck' };
  }

  // 3. Tag-based classification for the remaining prototype/utility plugins.
  const businessHit = anyTag(tags, BUSINESS_SYSTEM_TAGS);
  if (businessHit) return { scenario: 'business-system', reason: `tag:${businessHit}` };

  const presentationHit = anyTag(tags, PRESENTATION_TAGS);
  if (presentationHit) return { scenario: 'presentation', reason: `tag:${presentationHit}` };

  const brandHit = anyTag(tags, BRAND_VISUAL_TAGS);
  if (brandHit) return { scenario: 'brand-visual', reason: `tag:${brandHit}` };

  const devHit = anyTag(tags, DEV_TOOL_TAGS);
  if (devHit) return { scenario: 'dev-tool', reason: `tag:${devHit}` };

  const landingHit = anyTag(tags, LANDING_TAGS);
  if (landingHit) return { scenario: 'landing', reason: `tag:${landingHit}` };

  const appHit = anyTag(tags, APP_TAGS);
  if (appHit) return { scenario: 'app-prototype', reason: `tag:${appHit}` };

  const mediaAssetHit = anyTag(tags, MEDIA_ASSET_TAGS);
  if (mediaAssetHit) return { scenario: 'media-asset', reason: `tag:${mediaAssetHit}` };

  // 4. Path-based defaults for directories that are uniformly one scenario.
  if (relPath.includes('/image-templates/')) {
    return { scenario: 'media-asset', reason: 'path:image-templates' };
  }
  if (relPath.includes('/video-templates/')) {
    return { scenario: 'media-asset', reason: 'path:video-templates' };
  }
  if (relPath.includes('/design-systems/')) {
    return { scenario: 'brand-visual', reason: 'path:design-systems' };
  }

  // 5. Description heuristics for prototype-mode plugins that didn't tag
  // themselves. A dashboard-shaped description should still land in
  // business-system even when the author forgot to tag it.
  if (mode === 'prototype') {
    if (/dashboard|admin|console|analytics|kpi|control panel/.test(description)) {
      return { scenario: 'business-system', reason: 'desc:dashboard-ish' };
    }
    if (/landing|hero|cta|pricing|marketing/.test(description)) {
      return { scenario: 'landing', reason: 'desc:landing-ish' };
    }
    if (/mobile|app screen|onboarding|sign[- ]?up flow/.test(description)) {
      return { scenario: 'app-prototype', reason: 'desc:mobile-ish' };
    }
    if (/slide|deck|presentation|pitch/.test(description)) {
      return { scenario: 'presentation', reason: 'desc:deck-ish' };
    }
    // The legacy "scenario": "operations" is a strong signal but we
    // already caught it via the BUSINESS_SYSTEM_TAGS set when tags carry
    // it. As a final hint, treat the literal scenario field if present.
    if (scenario === 'operations') {
      return { scenario: 'business-system', reason: 'scenario-field:operations' };
    }
    // Generic prototype with no other signal — most likely an app shell
    // since the curated default for HomeHero's `Prototype` chip is
    // example-web-prototype, which is closer to a web app/landing than a
    // dashboard. We mark it as `general` so the human review step can
    // re-route precisely instead of guessing.
    return { scenario: 'general', reason: 'mode:prototype no-signal' };
  }

  return { scenario: 'general', reason: 'no-signal' };
}

async function main() {
  const manifests = await listManifests();
  const candidates: Candidate[] = [];

  for (const manifestPath of manifests) {
    const relPath = path.relative(repoRoot, manifestPath).split(path.sep).join('/');
    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (err) {
      console.error(`[skip] ${relPath}: ${(err as Error).message}`);
      continue;
    }
    let manifest: Manifest;
    try {
      manifest = JSON.parse(raw) as Manifest;
    } catch (err) {
      console.error(`[skip] ${relPath}: ${(err as Error).message}`);
      continue;
    }
    // Skip atoms — they don't show up on the home grid and don't need a
    // scenario assignment. The current facets.ts excludes them via
    // `od.kind !== 'atom'` so this matches the visible-plugin contract.
    if (manifest.od?.kind === 'atom') continue;

    const { scenario, reason } = classify(manifest, relPath);
    candidates.push({
      manifestPath,
      relPath,
      id: manifest.name ?? '(unknown)',
      title: manifest.title ?? manifest.name ?? '(untitled)',
      currentScenario: String(manifest.od?.scenario ?? ''),
      currentMode: String(manifest.od?.mode ?? ''),
      currentTaskKind: String(manifest.od?.taskKind ?? ''),
      tags: manifest.tags ?? [],
      proposedScenario: scenario,
      reason,
    });
  }

  // Group by proposed scenario for the human report.
  const byScenario = new Map<Scenario, Candidate[]>();
  for (const candidate of candidates) {
    const list = byScenario.get(candidate.proposedScenario) ?? [];
    list.push(candidate);
    byScenario.set(candidate.proposedScenario, list);
  }

  const scenarioOrder: Scenario[] = [
    'business-system',
    'presentation',
    'app-prototype',
    'landing',
    'brand-visual',
    'dev-tool',
    'media-asset',
    'general',
  ];

  const total = candidates.length;
  console.log(`# Plugin scenario mapping preview\n`);
  console.log(`Scanned ${manifests.length} manifests, classified ${total} visible plugins (atoms skipped).\n`);

  console.log(`## Distribution\n`);
  console.log(`| Scenario | Count | Share |`);
  console.log(`|---|---:|---:|`);
  for (const scenario of scenarioOrder) {
    const count = byScenario.get(scenario)?.length ?? 0;
    const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    console.log(`| ${SCENARIO_LABEL[scenario]} (\`${scenario}\`) | ${count} | ${share}% |`);
  }
  console.log('');

  for (const scenario of scenarioOrder) {
    const list = byScenario.get(scenario) ?? [];
    if (list.length === 0) continue;
    console.log(`## ${SCENARIO_LABEL[scenario]} (\`${scenario}\`) — ${list.length}\n`);
    console.log(`| id | title | mode | tags (first 4) | reason |`);
    console.log(`|---|---|---|---|---|`);
    for (const candidate of list) {
      const tagsPreview = candidate.tags.slice(0, 4).join(', ');
      console.log(
        `| \`${candidate.id}\` | ${candidate.title} | ${candidate.currentMode || '—'} | ${tagsPreview || '—'} | ${candidate.reason} |`,
      );
    }
    console.log('');
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total,
        distribution: Object.fromEntries(
          scenarioOrder.map((scenario) => [scenario, byScenario.get(scenario)?.length ?? 0]),
        ),
        mappings: candidates.map((c) => ({
          id: c.id,
          path: c.relPath,
          title: c.title,
          currentScenario: c.currentScenario,
          currentMode: c.currentMode,
          currentTaskKind: c.currentTaskKind,
          tags: c.tags,
          proposedScenario: c.proposedScenario,
          reason: c.reason,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.error(`\nMapping JSON written to ${path.relative(repoRoot, outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
