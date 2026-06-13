// Shared builder for the plugin detail modal's "Use plugin" split-button
// menu. Mirrors the home plugin-card use-menu (`plugins-home/PluginCard`):
// when a plugin ships an `od.useCase.query`, the primary CTA grows a caret
// that offers two variants (replicate-content first) —
//   • "Use with query"  → attach the chip AND load the example prompt into
//                          the composer (action 'use-with-query')
//   • "Use plugin"      → attach the plugin chip only (action 'use')
// Plugins without a usable query keep the plain single-action button, so the
// menu is `undefined` in that case.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { PluginUseAction } from '../plugins-home/useActions';
import type { PreviewPrimaryActionMenuItem } from '../PreviewModal';

type TranslateUseMenu = (
  key:
    | 'preview.usePlugin'
    | 'preview.usePluginOnly'
    | 'preview.usePluginOnlyDesc'
    | 'preview.replicateContent'
    | 'preview.replicateContentDesc',
) => string;

// Primary CTA for the detail modal's Use split button. When the plugin
// ships an example query the headline action IS replicate-content — the
// caret menu still offers both variants, with structure-only Use as the
// secondary path. Querless plugins keep the plain "Use plugin" button.
export function pluginUsePrimaryAction(
  record: InstalledPluginRecord,
  t: TranslateUseMenu,
): { label: string; action: PluginUseAction } {
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  return hasQuery
    ? { label: t('preview.replicateContent'), action: 'use-with-query' }
    : { label: t('preview.usePlugin'), action: 'use' };
}

export function buildPluginUseMenu(
  record: InstalledPluginRecord,
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void,
  t: TranslateUseMenu,
): PreviewPrimaryActionMenuItem[] | undefined {
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  if (!hasQuery) return undefined;
  // Replicate-content leads: the menu only exists when the plugin ships an
  // example query, and reproducing the previewed result is what most users
  // open it for — structure-only use is the secondary path.
  return [
    {
      label: t('preview.replicateContent'),
      description: t('preview.replicateContentDesc'),
      onClick: () => onUse(record, 'use-with-query'),
      testId: `plugin-details-use-with-query-${record.id}`,
    },
    {
      label: t('preview.usePluginOnly'),
      description: t('preview.usePluginOnlyDesc'),
      onClick: () => onUse(record, 'use'),
      testId: `plugin-details-use-option-${record.id}`,
    },
  ];
}
