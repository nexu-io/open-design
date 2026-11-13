import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Locale = 'en' | 'zh-CN';
export interface MotionReference {
  id: string;
  code: string;
  sortOrder: number;
  brand: string;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  coverUrl: string;
  previewUrl: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  guideUrl: Record<Locale, string>;
  packageUrl: Record<Locale, string>;
  pageUrl: Record<Locale, string>;
  kind: 'reference';
}
export interface MotionReadmeCatalog {
  schemaVersion: 1;
  source: { url: string; publicationId: string; generation: number; versionRevision: number; version: string; sha256: string; checkedOn: string };
  featuredSelection: { source: string; sha256: string; codes: string[] };
  templates: MotionReference[];
}

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const catalogPath = path.join(repoRoot, 'docs/motion-templates/catalog.json');
export const resourceUrl = /^https:\/\/r\.open-design\.ai\/files\/([a-f0-9]{64})$/;

export async function loadCatalog(): Promise<MotionReadmeCatalog> {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as MotionReadmeCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.templates) || !catalog.templates.length) throw new Error('Invalid Motion catalog.');
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const item of catalog.templates) {
    if (!/^V\d{3}$/.test(item.code) || codes.has(item.code) || ids.has(item.id) || item.kind !== 'reference') throw new Error(`Invalid or duplicate template: ${item.code}`);
    codes.add(item.code);
    ids.add(item.id);
    for (const locale of ['en', 'zh-CN'] as const) {
      if (!item.title[locale]?.trim() || !resourceUrl.test(item.packageUrl[locale]) || !resourceUrl.test(item.guideUrl[locale])) throw new Error(`Missing published content: ${item.code}/${locale}`);
      const page = new URL(item.pageUrl[locale]);
      const prefix = locale === 'zh-CN' ? '/zh/templates/' : '/templates/';
      if (page.origin !== 'https://open-design.ai' || !page.pathname.startsWith(prefix) || !page.pathname.endsWith('/')) throw new Error(`Invalid public page: ${item.code}/${locale}`);
    }
    if (!resourceUrl.test(item.coverUrl) || !resourceUrl.test(item.previewUrl) || !item.sourceUrl.startsWith('https://')) throw new Error(`Invalid reference URL: ${item.code}`);
  }
  const featured = catalog.featuredSelection.codes;
  if (featured.length !== 40 || new Set(featured).size !== 40 || featured.some(code => !codes.has(code))) throw new Error('The featured selection must contain 40 distinct published references.');
  return catalog;
}

export function orderedTemplates(catalog: MotionReadmeCatalog): MotionReference[] {
  const ranks = new Map(catalog.featuredSelection.codes.map((code, index) => [code, index]));
  return [...catalog.templates].sort((left, right) => {
    const leftRank = ranks.get(left.code);
    const rightRank = ranks.get(right.code);
    if (leftRank !== undefined || rightRank !== undefined) return (leftRank ?? Infinity) - (rightRank ?? Infinity);
    return left.sortOrder - right.sortOrder;
  });
}

export function agentPrompt(item: MotionReference, locale: Locale, format: 'full' | 'card' = 'full'): string {
  const title = item.title[locale].replace(/\s+/g, ' ').replaceAll('```', "'''");
  const install = 'https://releases.open-design.ai/open-motion/install.md';
  if (format === 'card') {
    const reference = item.id.replace(/^motion-/, '');
    return locale === 'zh-CN'
      ? `复刻 ${reference}`
      : `Remix ${reference}`;
  }
  if (locale === 'zh-CN') return `请使用 OpenMotion 插件；如未安装，请先读取 ${install}。\n指定模板：${title}（${item.code}）\n模板 ID：${item.id}\n参考与制作说明：${item.guideUrl[locale]}\n结合我的要求和附件创作，保留主要动效与风格，交付可编辑工程及 HTML、MP4。\n我的要求：`;
  return `Use OpenMotion. If it is not installed, read ${install} first.\nSelected reference: ${title} (${item.code})\nTemplate ID: ${item.id}\nReference and adaptation guide: ${item.guideUrl[locale]}\nAdapt the motion and style to my brief and attachments. Deliver an editable project, HTML and MP4.\nMy brief:`;
}
