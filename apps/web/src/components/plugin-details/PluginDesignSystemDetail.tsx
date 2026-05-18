// Design-system detail surface for plugins that ship as part of the
// design-systems family. Mirrors the existing DesignSystemPreviewModal:
//
//   - Showcase tab — the marketing-style HTML page rendered from the
//     referenced design system (`/api/design-systems/:slug/showcase`)
//   - Tokens tab   — the palette / typography / components inspector
//     (`/api/design-systems/:slug/preview`)
//   - Plugin info sidebar — manifest metadata first, with the raw
//     DESIGN.md spec included as a section underneath
//     (`/api/plugins/:id/asset/DESIGN.md`)
//
// Falls back gracefully when the plugin does not reference an
// upstream design system (some bundles ship DESIGN.md only): the
// tabs collapse and the modal renders the spec sidebar by default.

import { useCallback, useEffect, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { useT } from '../../i18n';
import {
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
  fetchPluginAssetText,
} from '../../providers/registry';
import { DesignSpecView } from '../DesignSpecView';
import { PreviewModal, type PreviewView } from '../PreviewModal';
import { PluginShareMenu } from './PluginShareMenu';
import { PluginMetaSections } from './PluginMetaSections';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

interface ContextRef {
  ref?: string;
  path?: string;
  primary?: boolean;
}

function designSystemRef(record: InstalledPluginRecord): string | null {
  const ds = (record.manifest?.od?.context as { designSystem?: ContextRef } | undefined)
    ?.designSystem;
  if (!ds) return null;
  if (typeof ds.ref === 'string' && ds.ref.length > 0) return ds.ref;
  return null;
}

function specAssetPath(record: InstalledPluginRecord): string {
  // Most design-system plugins ship `DESIGN.md` at the bundle root,
  // but `od.context.assets[0]` may point at a different relpath when
  // the bundle has co-located docs. Prefer the assets entry when it
  // smells like a markdown spec; otherwise fall back to the canonical
  // filename so the sidebar still has something to load.
  const assets = (record.manifest?.od?.context?.assets ?? []) as string[];
  const md = assets.find((a) => /\.md$/i.test(a));
  return md ?? './DESIGN.md';
}

export function PluginDesignSystemDetail({
  record,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const t = useT();
  const dsRef = designSystemRef(record);
  const assetPath = specAssetPath(record);

  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);

  // Reset caches when the modal swaps to a different plugin.
  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [record.id]);

  const handleView = useCallback(
    (viewId: string) => {
      if (!dsRef) return;
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        setShowcaseHtml(null);
        void fetchDesignSystemShowcase(dsRef).then((html) => setShowcaseHtml(html));
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        setTokensHtml(null);
        void fetchDesignSystemPreview(dsRef).then((html) => setTokensHtml(html));
      }
    },
    [dsRef, showcaseHtml, tokensHtml],
  );

  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      setSpecBody(null);
      void fetchPluginAssetText(record.id, assetPath).then((body) =>
        setSpecBody(body),
      );
    },
    [record.id, assetPath, specBody],
  );

  // When no upstream design system is referenced we still need a view
  // for the iframe stage so PreviewModal has something to render. Fall
  // back to a minimal placeholder that explains the design spec lives
  // in the plugin-info sidebar; the user can still apply the plugin
  // from the primary CTA.
  const views: PreviewView[] = dsRef
    ? [
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('ds.tokens'), html: tokensHtml },
      ]
    : [
        {
          id: 'spec',
          label: 'Spec',
          html: '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;color:#666;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:0 24px;margin:0;">This plugin ships only the design spec — open Plugin info to read DESIGN.md.</body>',
        },
      ];

  return (
    <PreviewModal
      title={record.title}
      subtitle={record.manifest?.description || dsRef || undefined}
      views={views}
      initialViewId={dsRef ? 'showcase' : 'spec'}
      onView={handleView}
      exportTitleFor={(viewId) => `${record.title} — ${viewId}`}
      onClose={onClose}
      sidebar={{
        label: 'Plugin info',
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        contentKey: record.id,
        // Design-system plugins are still plugins, so the inspector
        // comes first. DESIGN.md remains available in the same sidebar,
        // but as a spec section below the plugin-common metadata.
        content: (
          <div className="plugin-design-sidebar">
            <div className="plugin-info-pane">
              <PluginMetaSections
                record={record}
                omit={{ description: true }}
                compact
                heading="Plugin info"
              />
            </div>
            <section className="plugin-design-sidebar__spec">
              <div className="plugin-design-sidebar__spec-head">
                <h3>DESIGN.md</h3>
                <span>{assetPath.replace(/^\.\//, '')}</span>
              </div>
              <DesignSpecView
                source={specBody}
                loadingLabel={t('ds.specLoading')}
              />
            </section>
          </div>
        ),
      }}
      primaryAction={{
        label: 'Use plugin',
        onClick: () => onUse(record),
        busy: !!isApplying,
        busyLabel: 'Applying…',
        testId: `plugin-details-use-${record.id}`,
      }}
      headerExtras={<PluginShareMenu record={record} variant="inline" />}
    />
  );
}
