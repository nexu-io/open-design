/**
 * Refresh the commercial metadata for Open Design's slide-deck templates.
 *
 * Source of truth for WHICH template becomes WHICH commercial use-case is
 * `assignment.json` (default: `<repo>/.tmp/assignment.json`, override with
 * `OD_SLIDE_ASSIGNMENT`). Each entry pins a template id to a category, a
 * unique title (EN/ZH), a concrete subject, and buyer-facing descriptions.
 *
 * This script ONLY rewrites metadata (`SKILL.md` frontmatter +
 * `open-design.json`) and, for `example.html`, it STRIPS any stale
 * `od-commercial-slide-refresh` overlay and fixes the `<title>`. It never
 * injects slide overlays — the native deck bodies are authored per template
 * so the card preview shows real, on-theme content, not a floating pane.
 *
 * Rerunning is safe and idempotent: metadata is regenerated from the plan and
 * the overlay stripper is a no-op once overlays are gone.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CommercialCategoryId =
  | 'student-coursework'
  | 'corporate-strategy'
  | 'professional-training'
  | 'b2b-sales'
  | 'academic-research'
  | 'marketing-gtm'
  | 'data-finance'
  | 'fundraising-pitch'
  | 'government-policy'
  | 'product-management'
  | 'consulting'
  | 'career'
  | 'ai-literacy'
  | 'life'
  | 'design-craft';

interface CommercialCategory {
  id: CommercialCategoryId;
  enLabel: string;
  zhLabel: string;
  coreQuery: string;
  scenario: string;
  criticRubric: string;
  tags: string[];
}

interface Assignment {
  id: string;
  categoryId: CommercialCategoryId;
  mode: 'od-reframe' | 'diverse';
  titleEn: string;
  titleZh: string;
  subject: string;
  audience: string;
  descEn: string;
  descZh: string;
}

interface RefreshCopy {
  category: CommercialCategory;
  enName: string;
  zhName: string;
  enDescription: string;
  zhDescription: string;
  examplePrompt: string;
  zhExamplePrompt: string;
  tags: string[];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const designTemplatesRoot = path.join(repoRoot, 'design-templates');
const officialExamplesRoot = path.join(repoRoot, 'plugins', '_official', 'examples');
const assignmentPath =
  process.env.OD_SLIDE_ASSIGNMENT ?? path.join(repoRoot, '.tmp', 'assignment.json');

const commercialCategories: CommercialCategory[] = [
  { id: 'student-coursework', enLabel: 'Student coursework', zhLabel: '课业/课程作业', coreQuery: 'senior-capstone-defense-deck', scenario: 'education', criticRubric: 'can a reviewer find the contribution, evidence, and limitation in under 90 seconds', tags: ['coursework', 'defense', 'academic'] },
  { id: 'corporate-strategy', enLabel: 'Corporate strategy', zhLabel: '企业战略/经营管理', coreQuery: 'board-pre-read-deck', scenario: 'strategy', criticRubric: 'would a board member know what to approve and why before page five', tags: ['board', 'strategy', 'business-review'] },
  { id: 'professional-training', enLabel: 'Professional training', zhLabel: '培训/教学交付', coreQuery: 'employee-onboarding-deck', scenario: 'education', criticRubric: 'can a learner perform the target task the next day', tags: ['training-deck', 'workshop', 'course-module'] },
  { id: 'b2b-sales', enLabel: 'B2B sales', zhLabel: 'B2B 销售/续约', coreQuery: 'b2b-saas-sales-proposal', scenario: 'sales', criticRubric: 'can the champion forward this internally without rewriting it', tags: ['sales', 'renewal', 'customer'] },
  { id: 'academic-research', enLabel: 'Academic research', zhLabel: '学术研究/科研申请', coreQuery: 'academic-review-deck', scenario: 'research', criticRubric: 'does the deck prove novelty without overclaiming', tags: ['research', 'grant', 'review'] },
  { id: 'marketing-gtm', enLabel: 'Marketing & GTM', zhLabel: '市场/增长/GTM', coreQuery: 'annual-marketing-plan', scenario: 'marketing', criticRubric: 'can the plan connect creative choices to measurable growth', tags: ['launch', 'campaign', 'pipeline'] },
  { id: 'data-finance', enLabel: 'Data, KPI & finance', zhLabel: '数据/KPI/金融', coreQuery: 'product-analytics-deck', scenario: 'finance', criticRubric: 'does every chart have a decision above it', tags: ['kpi', 'finance', 'metrics'] },
  { id: 'fundraising-pitch', enLabel: 'Fundraising pitch', zhLabel: '融资/路演', coreQuery: 'series-a-pitch-deck', scenario: 'finance', criticRubric: 'would an investor know why this is venture-scale and urgent', tags: ['pitch-deck', 'fundraising', 'investor-deck'] },
  { id: 'government-policy', enLabel: 'Government & policy', zhLabel: '公共政策/监管/非营利', coreQuery: 'policy-briefing-deck', scenario: 'policy', criticRubric: 'does the deck reduce approval risk rather than create rhetorical heat', tags: ['policy', 'regulatory', 'risk-review'] },
  { id: 'product-management', enLabel: 'Product management', zhLabel: '产品/技术管理', coreQuery: 'pm-feature-business-case-deck', scenario: 'product', criticRubric: 'can cross-functional reviewers agree on the next irreversible step', tags: ['product', 'roadmap', 'architecture'] },
  { id: 'consulting', enLabel: 'Consulting', zhLabel: '咨询/客户交付', coreQuery: 'consulting-final-deck', scenario: 'strategy', criticRubric: 'would a client know what to do Monday morning', tags: ['consulting-deliverable', 'strategy', 'client'] },
  { id: 'career', enLabel: 'Career', zhLabel: '职业/个人发展', coreQuery: 'year-end-self-review-deck', scenario: 'personal', criticRubric: 'does the evidence make the claim feel earned', tags: ['portfolio', 'promotion', 'self-review'] },
  { id: 'ai-literacy', enLabel: 'AI literacy', zhLabel: 'AI 素养/企业 AI', coreQuery: 'enterprise-ai-copilot-rollout-brief', scenario: 'ai', criticRubric: 'does the deck make AI implementation concrete enough to fund', tags: ['ai', 'copilot', 'workflow'] },
  { id: 'life', enLabel: 'Life & story', zhLabel: '生活/兴趣/故事', coreQuery: 'travel-photo-essay-deck', scenario: 'personal', criticRubric: 'would someone retell the story after seeing it once', tags: ['story', 'personal', 'photo-essay'] },
  { id: 'design-craft', enLabel: 'Design craft', zhLabel: '设计打磨/视觉系统', coreQuery: 'board-upgrade-deck-rescue', scenario: 'design', criticRubric: 'does the deck feel authored by a senior designer rather than generated', tags: ['design', 'brand', 'visual-system'] },
];

const categoryById = new Map(commercialCategories.map((c) => [c.id, c]));

function loadAssignments(): Map<string, Assignment> {
  if (!existsSync(assignmentPath)) {
    throw new Error(
      `Assignment file not found: ${assignmentPath}. Generate it first (planning stage) or set OD_SLIDE_ASSIGNMENT.`,
    );
  }
  const raw = JSON.parse(readFileSync(assignmentPath, 'utf8')) as Assignment[];
  const map = new Map<string, Assignment>();
  for (const a of raw) {
    if (!categoryById.has(a.categoryId)) {
      throw new Error(`Assignment for "${a.id}" has unknown categoryId "${a.categoryId}".`);
    }
    map.set(a.id, a);
  }
  return map;
}

export function buildCopy(a: Assignment): RefreshCopy {
  const category = categoryById.get(a.categoryId)!;
  const examplePrompt = [
    `Create "${a.titleEn}" as a decision-grade ${category.enLabel} deck in this template's own visual system.`,
    `Subject: ${a.subject}`,
    `Audience: ${a.audience}.`,
    `First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers.`,
    `Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: ${category.criticRubric}.`,
  ].join(' ');
  const zhExamplePrompt = `${a.titleZh}。${a.descZh} 主题：${a.subject} 先确认受众、决策目标、素材来源、截止时间和必须保留的数据，再输出叙事主线、页面规划、逐页文案、视觉方向和按评审标准自检的版本。`;
  const tags = Array.from(new Set([
    a.categoryId,
    category.coreQuery,
    category.scenario,
    ...category.tags,
    'decision-deck',
    'commercial-slide-agent',
    a.id,
  ]));
  return {
    category,
    enName: a.titleEn,
    zhName: a.titleZh,
    enDescription: a.descEn,
    zhDescription: a.descZh,
    examplePrompt,
    zhExamplePrompt,
    tags,
  };
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function yamlBlock(key: string, value: string): string[] {
  return [`${key}: |`, ...value.split('\n').map((line) => `  ${line}`)];
}

function yamlList(key: string, values: readonly string[]): string[] {
  return [`${key}:`, ...values.map((value) => `  - ${yamlScalar(value)}`)];
}

function removeKeyBlock(lines: string[], key: string, indent: number): string[] {
  const prefix = `${' '.repeat(indent)}${key}:`;
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? '';
    if (!line.startsWith(prefix)) {
      out.push(line);
      i += 1;
      continue;
    }
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '') { i += 1; continue; }
      const nextIndent = next.match(/^ */)?.[0].length ?? 0;
      if (nextIndent <= indent) break;
      i += 1;
    }
  }
  return out;
}

function splitFrontmatter(raw: string): { yaml: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(raw);
  if (!match) return null;
  return { yaml: match[1] ?? '', body: match[2] ?? '' };
}

function updateSkillMarkdown(raw: string, copy: RefreshCopy): string {
  const parts = splitFrontmatter(raw);
  if (!parts) return raw;
  let lines = parts.yaml.split(/\r?\n/u);
  for (const key of ['en_name', 'zh_name', 'description', 'en_description', 'zh_description', 'tags', 'triggers']) {
    lines = removeKeyBlock(lines, key, 0);
  }
  lines = removeKeyBlock(lines, 'scenario', 2);
  lines = removeKeyBlock(lines, 'category', 2);
  lines = removeKeyBlock(lines, 'example_prompt', 2);

  const nameIndex = lines.findIndex((line) => /^name:/u.test(line));
  const displayBlock = [
    `en_name: ${yamlScalar(copy.enName)}`,
    `zh_name: ${yamlScalar(copy.zhName)}`,
    ...yamlBlock('description', copy.enDescription),
    ...yamlBlock('en_description', copy.enDescription),
    ...yamlBlock('zh_description', copy.zhDescription),
    ...yamlList('tags', copy.tags),
    ...yamlList('triggers', Array.from(new Set([
      copy.category.coreQuery,
      copy.category.id,
      copy.enName,
      copy.zhName,
      ...copy.category.tags,
      'html deck',
      'html slides',
    ]))),
  ];
  if (nameIndex >= 0) lines.splice(nameIndex + 1, 0, ...displayBlock);
  else lines.unshift(...displayBlock);

  const odIndex = lines.findIndex((line) => line === 'od:');
  const odBlock = [
    `  category: ${yamlScalar(copy.category.id)}`,
    `  scenario: ${yamlScalar(copy.category.scenario)}`,
    `  example_prompt: ${yamlScalar(copy.examplePrompt)}`,
  ];
  if (odIndex >= 0) {
    let insertAt = odIndex + 1;
    while (insertAt < lines.length) {
      const line = lines[insertAt] ?? '';
      if (line.trim() !== '' && !line.startsWith(' ')) break;
      insertAt += 1;
    }
    lines.splice(insertAt, 0, ...odBlock);
  } else {
    lines.push('od:', '  mode: deck', ...odBlock);
  }

  return `---\n${lines.join('\n').replace(/\n{3,}/gu, '\n\n')}\n---\n${parts.body}`;
}

function objectFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function stringListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((s) => s.trim()).filter(Boolean);
}

function updateOpenDesignJson(raw: string, copy: RefreshCopy): string {
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(raw) as Record<string, unknown>; } catch { return raw; }

  manifest.title = copy.enName;
  manifest.title_i18n = { en: copy.enName, 'zh-CN': copy.zhName, 'zh-TW': copy.zhName };
  manifest.description = copy.enDescription;
  manifest.description_i18n = { en: copy.enDescription, 'zh-CN': copy.zhDescription, 'zh-TW': copy.zhDescription };
  // Drop stale category-id tags from prior passes, then re-add the current set.
  const staleCategoryIds = new Set(commercialCategories.map((c) => c.id));
  const staleCoreQueries = new Set(commercialCategories.map((c) => c.coreQuery));
  const keptTags = stringListFromUnknown(manifest.tags).filter(
    (tItem) => !staleCategoryIds.has(tItem as CommercialCategoryId) && !staleCoreQueries.has(tItem) && tItem !== 'commercial-slide-agent' && tItem !== 'decision-deck',
  );
  manifest.tags = Array.from(new Set([...keptTags, ...copy.tags]));

  const od = objectFromUnknown(manifest.od);
  od.kind = typeof od.kind === 'string' ? od.kind : 'scenario';
  od.taskKind = typeof od.taskKind === 'string' ? od.taskKind : 'new-generation';
  od.mode = 'deck';
  od.category = copy.category.id;
  od.scenario = copy.category.scenario;
  od.surface = typeof od.surface === 'string' ? od.surface : 'web';
  const useCase = objectFromUnknown(od.useCase);
  useCase.query = { en: copy.examplePrompt, 'zh-CN': copy.zhExamplePrompt };
  const exampleOutputs = Array.isArray(useCase.exampleOutputs)
    ? useCase.exampleOutputs.map((entry) => (
        typeof entry === 'object' && entry !== null
          ? { ...(entry as Record<string, unknown>), title: copy.enName, title_i18n: { en: copy.enName, 'zh-CN': copy.zhName, 'zh-TW': copy.zhName } }
          : entry
      ))
    : [];
  if (exampleOutputs.length === 0) {
    exampleOutputs.push({ path: './example.html', title: copy.enName, title_i18n: { en: copy.enName, 'zh-CN': copy.zhName, 'zh-TW': copy.zhName } });
  }
  useCase.exampleOutputs = exampleOutputs;
  od.useCase = useCase;
  manifest.od = od;

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const injectionStart = '<!-- od-commercial-slide-refresh:start -->';
const injectionEnd = '<!-- od-commercial-slide-refresh:end -->';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function stripExistingInjection(html: string): string {
  const pattern = new RegExp(`\\n?${escapeRegExp(injectionStart)}[\\s\\S]*?${escapeRegExp(injectionEnd)}\\n?`, 'u');
  return html.replace(pattern, '\n').replace(/\n{3,}(\s*<\/body>)/iu, '\n\n$1');
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

/** Strip any stale overlay and fix the <title>. Never injects an overlay. */
export function updateExampleHtml(raw: string, copy: RefreshCopy): string {
  const stripped = stripExistingInjection(raw);
  const desiredTitle = `${escapeHtml(copy.enName)} - ${escapeHtml(copy.category.enLabel)}`;
  if (/<title>[\s\S]*?<\/title>/iu.test(stripped)) {
    return stripped.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${desiredTitle}</title>`);
  }
  return stripped;
}

function isDeckSource(skillMd: string, manifestJson: string | null): boolean {
  if (/^\s{2}mode:\s*deck\s*$/mu.test(skillMd) || /^mode:\s*deck\s*$/mu.test(skillMd)) return true;
  if (!manifestJson) return false;
  try {
    const manifest = JSON.parse(manifestJson) as { od?: { mode?: unknown } };
    return manifest.od?.mode === 'deck';
  } catch { return false; }
}

function refreshTemplate(root: string, dir: string, copy: RefreshCopy, isOfficial: boolean, counts: { skill: number; manifest: number; html: number }, touched: string[]): void {
  const skillPath = path.join(root, dir, 'SKILL.md');
  if (existsSync(skillPath)) {
    const rawSkill = readFileSync(skillPath, 'utf8');
    const manifestPath = path.join(root, dir, 'open-design.json');
    const rawManifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
    if (isDeckSource(rawSkill, rawManifest)) {
      const nextSkill = updateSkillMarkdown(rawSkill, copy);
      if (nextSkill !== rawSkill) { writeFileSync(skillPath, nextSkill, 'utf8'); counts.skill += 1; touched.push(path.relative(repoRoot, skillPath)); }
      if (isOfficial && rawManifest !== null) {
        const nextManifest = updateOpenDesignJson(rawManifest, copy);
        if (nextManifest !== rawManifest) { writeFileSync(manifestPath, nextManifest, 'utf8'); counts.manifest += 1; touched.push(path.relative(repoRoot, manifestPath)); }
      }
    }
  }
  const htmlPath = path.join(root, dir, 'example.html');
  if (existsSync(htmlPath)) {
    const rawHtml = readFileSync(htmlPath, 'utf8');
    const nextHtml = updateExampleHtml(rawHtml, copy);
    if (nextHtml !== rawHtml) { writeFileSync(htmlPath, nextHtml, 'utf8'); counts.html += 1; touched.push(path.relative(repoRoot, htmlPath)); }
  }
}

function main(): void {
  const assignments = loadAssignments();
  const counts = { skill: 0, manifest: 0, html: 0 };
  const touched: string[] = [];
  for (const a of assignments.values()) {
    const copy = buildCopy(a);
    refreshTemplate(officialExamplesRoot, a.id, copy, true, counts, touched);
    refreshTemplate(designTemplatesRoot, a.id, copy, false, counts, touched);
  }
  console.log(`Refreshed ${counts.skill} SKILL.md, ${counts.manifest} open-design.json, and stripped/retitled ${counts.html} example.html files across ${assignments.size} templates.`);
  if (touched.length > 0) console.log(touched.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
