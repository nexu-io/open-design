// Shared builder for the plugin detail modal's "Use plugin" split-button
// menu. Mirrors the home plugin-card use-menu (`plugins-home/PluginCard`):
// when a plugin ships an `od.useCase.query`, the primary CTA grows a caret
// that offers two variants —
//   • "Use plugin"      → attach the plugin chip only (action 'use')
//   • "Use with query"  → attach the chip AND load the example prompt into
//                          the composer (action 'use-with-query')
// Plugins without a usable query keep the plain single-action button, so the
// menu is `undefined` in that case.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { PluginUseAction } from '../plugins-home/useActions';
import type { PreviewPrimaryActionMenuItem } from '../PreviewModal';

type TranslateUseMenu = (
  key:
    | 'preview.usePluginOnly'
    | 'preview.usePluginOnlyDesc'
    | 'preview.replicateContent'
    | 'preview.replicateContentDesc',
) => string;

export function buildPluginUseMenu(
  record: InstalledPluginRecord,
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void,
  t: TranslateUseMenu,
): PreviewPrimaryActionMenuItem[] | undefined {
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  if (!hasQuery) return undefined;
  return [
    {
      label: t('preview.usePluginOnly'),
      description: t('preview.usePluginOnlyDesc'),
      onClick: () => onUse(record, 'use'),
      testId: `plugin-details-use-option-${record.id}`,
    },
    {
      label: t('preview.replicateContent'),
      description: t('preview.replicateContentDesc'),
      onClick: () => onUse(record, 'use-with-query'),
      testId: `plugin-details-use-with-query-${record.id}`,
    },
  ];
}
