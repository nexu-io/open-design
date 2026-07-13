import {
  resolveLocalizedText,
  type InstalledPluginRecord,
  type LocalizedText,
} from '@open-design/contracts';

export function localizePluginTitle(locale: string, record: InstalledPluginRecord): string {
  return resolveLocalizedText(localizedText(record.manifest?.title_i18n), locale) || record.title;
}

export function localizePluginDescription(locale: string, record: InstalledPluginRecord): string {
  return resolveLocalizedText(localizedText(record.manifest?.description_i18n), locale)
    || record.manifest?.description
    || '';
}

export function localizedText(value: unknown): LocalizedText | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  if (!entries.every(([, text]) => typeof text === 'string')) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}
