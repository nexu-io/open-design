// Hover preview panel for the composer "+" → Plugins flyout.
//
// The plugin list shows only a sparkle + name; committing to a plugin
// from a bare name is a guess. This panel is the second-level surface
// that fills in the gap: hovering (or arrow-defaulting to) a plugin
// renders its live preview hero plus the title / trust / description /
// tags, so the choice is informed before the user clicks.
//
// It reuses the plugins-home preview stack (`inferPluginPreview` +
// `PreviewSurface`) so the hero looks identical to the gallery tile,
// and the localization helpers so the copy follows the active locale.

import { useMemo } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { PreviewSurface } from './plugins-home/cards/PreviewSurface';
import {
  localizePluginDescription,
  localizePluginTitle,
} from './plugins-home/localization';
import { inferPluginPreview } from './plugins-home/preview';
import { TrustBadge } from './TrustBadge';

const MAX_VISIBLE_TAGS = 4;

const NOISE_TAGS = new Set<string>([
  'first-party',
  'third-party',
  'phase-1',
  'phase-7',
  'untitled',
  'plugin',
]);

export function ComposerPluginPreview({
  record,
  locale,
}: {
  record: InstalledPluginRecord;
  locale: string;
}) {
  const preview = useMemo(() => inferPluginPreview(record), [record]);
  const title = localizePluginTitle(locale, record);
  const description = localizePluginDescription(locale, record);
  const tags = useMemo(
    () =>
      (record.manifest?.tags ?? [])
        .filter((t) => !NOISE_TAGS.has(t.toLowerCase()))
        .slice(0, MAX_VISIBLE_TAGS),
    [record.manifest?.tags],
  );

  return (
    <div className="plus-menu__preview" data-plugin-id={record.id}>
      <div className="plus-menu__preview-meta">
        <div className="plus-menu__preview-title-row">
          <span className="plus-menu__preview-title" title={title}>
            {title}
          </span>
          <TrustBadge trust={record.trust} />
        </div>
        {description ? (
          <p className="plus-menu__preview-desc">{description}</p>
        ) : null}
        {tags.length > 0 ? (
          <div className="plus-menu__preview-tags">
            {tags.map((t) => (
              <span key={t} className="plus-menu__preview-tag">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="plus-menu__preview-hero">
        {/* `eager` mounts media/iframe immediately — the panel is already a
            deliberate hover, so there is no off-screen cost to defer. */}
        <PreviewSurface
          pluginId={record.id}
          pluginTitle={title}
          preview={preview}
          eager
        />
      </div>
    </div>
  );
}
