// Inspector-style detail surface for plain scenario plugins.
//
// Used as the fallback when `inferPluginPreview` returns `text` —
// the plugin ships no image/video poster, no runnable HTML preview,
// and no design-system signal. The body delegates to
// `PluginMetaSections` so the same manifest-driven inspector surface
// is reused by every other variant; this file owns the modal shell
// (backdrop, header, byline, hero, footer with Use plugin CTA).

import { useEffect, useMemo, useRef } from 'react';
import type {
  InstalledPluginRecord,
  PluginManifest,
} from '@open-design/contracts';
import { Icon } from '../Icon';
import { PluginPreviewHero } from './PluginPreviewHero';
import { PluginMetaSections } from './PluginMetaSections';
import { PluginShareMenu } from './PluginShareMenu';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

export function PluginScenarioDetail({
  record,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus to the close button on mount so keyboard users land
  // somewhere sensible without trapping them inside the long body.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const manifest: PluginManifest = record.manifest ?? ({} as PluginManifest);
  const od = manifest.od ?? {};
  const query = od.useCase?.query ?? '';
  const examples = useMemo(
    () => (od.useCase?.exampleOutputs ?? []) as Array<{ path: string; title?: string }>,
    [od.useCase?.exampleOutputs],
  );
  const tags = manifest.tags ?? [];

  return (
    <div
      className="plugin-details-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${record.title} details`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="plugin-details-modal"
      data-plugin-id={record.id}
      data-detail-variant="scenario"
    >
      <div className="plugin-details-modal">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{record.title}</h2>
              <span
                className={`plugin-details-modal__trust trust-${record.trust}`}
              >
                {record.trust}
              </span>
            </div>
            <div className="plugin-details-modal__meta">
              <span>v{record.version}</span>
              {od.taskKind ? <span>· {od.taskKind}</span> : null}
              {od.kind ? <span>· {od.kind}</span> : null}
              <span>· {record.sourceKind}</span>
              {tags.length > 0 ? (
                <span className="plugin-details-modal__meta-tags">
                  {tags.slice(0, 4).map((t) => (
                    <span key={t} className="plugin-details-modal__tag">
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
          <div className="plugin-details-modal__head-actions">
            <PluginShareMenu record={record} variant="default" />
            <button
              ref={closeRef}
              type="button"
              className="plugin-details-modal__close"
              onClick={onClose}
              aria-label="Close details"
              title="Close (Esc)"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="plugin-details-modal__body">
          {examples.length > 0 ? (
            <PluginPreviewHero
              pluginId={record.id}
              pluginTitle={record.title}
              examples={examples}
            />
          ) : null}

          <PluginMetaSections record={record} />
        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={() => onUse(record)}
            disabled={isApplying}
            aria-busy={isApplying ? 'true' : undefined}
            data-testid={`plugin-details-use-${record.id}`}
          >
            {isApplying
              ? 'Applying…'
              : query
                ? 'Use example query'
                : 'Use plugin'}
          </button>
        </footer>
      </div>
    </div>
  );
}
