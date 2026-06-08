import {
  getBundledPlugins,
  resolveBundledDescription,
  resolveBundledTitle,
  type BundledPluginRecord,
} from './bundled-plugins';
import {
  PLUGIN_CATEGORIES,
  PLUGIN_SUBCATEGORIES,
  bundledRecordOf,
  categorizePlugin,
  categorizeSubcategory,
  type PluginCategorySlug,
} from './plugin-facets';
import { DEFAULT_LOCALE, type LandingLocaleCode } from '../i18n';

export interface TemplateMarketingEntry {
  record: BundledPluginRecord;
  slug: string;
  path: string;
  category: PluginCategorySlug;
  categoryLabel: string;
  categoryDescription: string;
  subcategorySlug: string | null;
  subcategoryLabel: string | null;
  subcategoryDescription: string | null;
}

const PREFIXES_TO_DROP = [
  'example-',
  'image-template-',
  'video-template-',
  'template-',
  'html-ppt-',
];

function templateSlugSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'template'
  );
}

function stripRegistryPrefix(value: string): string {
  let out = value;
  for (const prefix of PREFIXES_TO_DROP) {
    if (out.startsWith(prefix)) out = out.slice(prefix.length);
  }
  return out;
}

function hasTemplateIntent(value: string): boolean {
  return /\b(template|templates|deck|slides|landing|dashboard|resume|report|poster|card|mockup|prototype|video|image|audio)\b/i.test(
    value.replaceAll('-', ' '),
  );
}

function baseTemplateSlug(record: BundledPluginRecord): string {
  const titleSlug = templateSlugSegment(resolveBundledTitle(record, DEFAULT_LOCALE));
  const cleanedTitle = stripRegistryPrefix(titleSlug);
  if (cleanedTitle && cleanedTitle !== 'plugin') {
    return hasTemplateIntent(cleanedTitle) ? cleanedTitle : `${cleanedTitle}-template`;
  }

  const cleanedId = stripRegistryPrefix(templateSlugSegment(record.manifestId));
  return hasTemplateIntent(cleanedId) ? cleanedId : `${cleanedId}-template`;
}

let cachedEntries: ReadonlyArray<TemplateMarketingEntry> | null = null;

export function getTemplateMarketingEntries(): ReadonlyArray<TemplateMarketingEntry> {
  if (cachedEntries) return cachedEntries;

  const taken = new Map<string, number>();
  const entries: TemplateMarketingEntry[] = [];

  for (const record of getBundledPlugins()) {
    if (record.bucket === 'design-systems') continue;
    const category = categorizePlugin(bundledRecordOf(record));
    if (!category) continue;

    const baseSlug = baseTemplateSlug(record);
    const seen = taken.get(baseSlug) ?? 0;
    taken.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${templateSlugSegment(record.detailSlug)}`;

    const categoryDef = PLUGIN_CATEGORIES.find((item) => item.slug === category);
    const subcategorySlug = categorizeSubcategory(bundledRecordOf(record), category);
    const subcategoryDef = subcategorySlug
      ? PLUGIN_SUBCATEGORIES.find((item) => item.slug === subcategorySlug)
      : undefined;

    entries.push({
      record,
      slug,
      path: `/templates/${slug}/`,
      category,
      categoryLabel: categoryDef?.label ?? category,
      categoryDescription: categoryDef?.description ?? '',
      subcategorySlug,
      subcategoryLabel: subcategoryDef?.label ?? null,
      subcategoryDescription: subcategoryDef?.description ?? null,
    });
  }

  cachedEntries = entries;
  return cachedEntries;
}

export function templateMarketingEntryForRecord(
  record: BundledPluginRecord,
): TemplateMarketingEntry | undefined {
  return getTemplateMarketingEntries().find(
    (entry) => entry.record.manifestId === record.manifestId,
  );
}

export function templateMarketingPath(record: BundledPluginRecord): string {
  return templateMarketingEntryForRecord(record)?.path ?? record.detailHref;
}

export function templateLandingTitle(
  entry: TemplateMarketingEntry,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): string {
  const title = resolveBundledTitle(entry.record, locale);
  return hasTemplateIntent(title) ? title : `${title} Template`;
}

export function templateLandingDescription(
  entry: TemplateMarketingEntry,
  locale: LandingLocaleCode = DEFAULT_LOCALE,
): string {
  const description = resolveBundledDescription(entry.record, locale);
  const suffix = `Fork it in Open Design, remix the prompt, and ship the ${entry.categoryLabel.toLowerCase()} with your local agent.`;
  if (!description) return suffix;
  return `${description} ${suffix}`;
}
