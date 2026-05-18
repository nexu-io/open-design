// Plan §3.F5 / spec §11.6 — Home plugin details inspector.
//
// This file used to render a single inspector body for every plugin
// kind. The home gallery now ships type-aware preview tiles
// (image / video / HTML / design-system / fallback), and the user
// expects the detail modal to mirror those tiles with the same
// affordances they get on the curated gallery (DesignSystemPreview
// modal, examples PreviewModal, PromptTemplatePreviewModal):
//
//   media   → image/video player, prompt body, copy, lightbox
//   html    → sandboxed iframe + share menu + fullscreen
//   design  → showcase / tokens tabs + DESIGN.md sidebar
//   text    → original rich inspector (scenario fallback)
//
// We dispatch on `inferPluginPreview` (the same classifier the home
// card uses) so the chrome users see when expanding a tile is the
// natural extension of the tile they clicked. The Use/Apply flow
// stays identical — every variant reaches `usePlugin` through the
// same callback wiring.

import type { InstalledPluginRecord } from '@open-design/contracts';
import { inferPluginPreview } from './plugins-home/preview';
import { PluginScenarioDetail } from './plugin-details/PluginScenarioDetail';
import { PluginExampleDetail } from './plugin-details/PluginExampleDetail';
import { PluginDesignSystemDetail } from './plugin-details/PluginDesignSystemDetail';
import { PluginMediaDetail } from './plugin-details/PluginMediaDetail';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

export function PluginDetailsModal({
  record,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const preview = inferPluginPreview(record);

  if (preview.kind === 'media') {
    return (
      <PluginMediaDetail
        record={record}
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
      />
    );
  }

  if (preview.kind === 'html') {
    return (
      <PluginExampleDetail
        record={record}
        exampleStem={
          preview.source === 'example' ? preview.exampleStem ?? null : null
        }
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
      />
    );
  }

  if (preview.kind === 'design') {
    return (
      <PluginDesignSystemDetail
        record={record}
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
      />
    );
  }

  return (
    <PluginScenarioDetail
      record={record}
      onClose={onClose}
      onUse={onUse}
      isApplying={isApplying}
    />
  );
}
