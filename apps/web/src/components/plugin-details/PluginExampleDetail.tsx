// HTML-preview detail surface for plugins that ship a runnable
// `od.preview` entry or example output (the same surface ExamplesTab
// uses for skill cards). Wraps the shared PreviewModal so the user
// gets the full chrome — sandboxed iframe, Fullscreen, Share menu
// (Export PDF / HTML / Zip / Open in new tab) — plus a primary
// "Use plugin" action that routes through the home applyPlugin flow.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { useT } from '../../i18n';
import {
  fetchPluginExampleHtml,
  fetchPluginPreviewHtml,
  type SkillExampleResult,
} from '../../providers/registry';
import { PreviewModal } from '../PreviewModal';
import { PluginShareMenu } from './PluginShareMenu';
import { PluginMetaSections } from './PluginMetaSections';

interface Props {
  record: InstalledPluginRecord;
  /** When set, fetch this specific example stem; otherwise hit /preview. */
  exampleStem?: string | null;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

export function PluginExampleDetail({
  record,
  exampleStem,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const t = useT();
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setHtml(null);
      setError(null);
      const result: SkillExampleResult = exampleStem
        ? await fetchPluginExampleHtml(record.id, exampleStem)
        : await fetchPluginPreviewHtml(record.id);
      if ('html' in result) {
        setHtml(result.html);
      } else if ('error' in result) {
        setError(result.error);
        setHtml(undefined);
      } else {
        // unavailable: skill declares a non-HTML preview; treat as a
        // calm empty state rather than an error (see registry.ts §897).
        setError(null);
        setHtml(undefined);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [record.id, exampleStem]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable identity for PreviewModal's onView so its mount-time
  // effect doesn't re-fire on every render.
  const onView = useCallback(() => {
    void load();
  }, [load]);

  const description = record.manifest?.description ?? '';
  const isDeck = record.manifest?.od?.mode === 'deck';

  return (
    <PreviewModal
      title={record.title}
      subtitle={description || undefined}
      views={[
        {
          id: 'preview',
          label: t('examples.previewLabel'),
          html,
          error,
          deck: isDeck,
        },
      ]}
      onView={onView}
      exportTitleFor={() => record.title}
      onClose={onClose}
      sidebar={{
        // Surface every plugin-common manifest field — workflow, context
        // bundles, connectors, file paths, source provenance — alongside
        // the rendered HTML preview, so the example modal carries the
        // same inspector depth the scenario fallback already shows.
        // Default open so users see the metadata without an extra click;
        // the iframe stage scales down to fit and Fullscreen still gives
        // them an immersive view when needed.
        label: 'Plugin info',
        defaultOpen: true,
        contentKey: record.id,
        content: (
          <div className="plugin-info-pane">
            <PluginMetaSections
              record={record}
              omit={{ description: true }}
              compact
              heading="Plugin info"
            />
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
