import type { Translate } from './I18n';

// Translate system descriptions without changing persisted history or file paths.
export function historyEntryLabel(label: string, t: Translate): string {
  if (label === 'Changed outside the app') return t('External change');
  if (label.startsWith('Undid: ')) return t('Undo: {label}', { label: historyEntryLabel(label.slice(7), t) });
  if (label.startsWith('Redid: ')) return t('Redo: {label}', { label: historyEntryLabel(label.slice(7), t) });
  const property = /^Edit (muted|volume|opacity|color|font-size|text|width|height|position)$/.exec(label)?.[1];
  return property ? t('Edit {property}', { property: t(property) }) : t(label);
}
