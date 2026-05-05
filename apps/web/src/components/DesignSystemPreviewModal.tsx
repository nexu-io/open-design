import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
}

// Two-tab DS preview: a complete Showcase webpage rendered from the system's
// tokens, and the original Tokens view (palette / typography / components +
// rendered DESIGN.md prose). A toggleable side panel surfaces the raw
// DESIGN.md so users can compare spec to render at the same time, mirroring
// the styles.refero.design layout.
export function DesignSystemPreviewModal({ system, onClose }: Props) {
  const t = useT();
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);

  // Lazy-load each view on first reveal. Both endpoints are cheap, but this
  // keeps the network panel quiet when the user only opens one tab.
  const handleView = useCallback(
    (viewId: string) => {
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        setShowcaseHtml(null);
        void fetchDesignSystemShowcase(system.id).then((html) => setShowcaseHtml(html));
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        setTokensHtml(null);
        void fetchDesignSystemPreview(system.id).then((html) => setTokensHtml(html));
      }
    },
    [system.id, showcaseHtml, tokensHtml],
  );

  // Fetch DESIGN.md the first time the side panel opens. Once we have it we
  // never re-fetch unless the underlying system swaps.
  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      setSpecBody(null);
      void fetchDesignSystem(system.id).then((detail) =>
        setSpecBody(detail?.body ?? null),
      );
    },
    [system.id, specBody],
  );

  // If the system swaps under us (rare but possible), wipe all caches.
  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [system.id]);

  return (
    <PreviewModal
      title={system.title}
      subtitle={system.summary || system.category}
      views={[
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('ds.tokens'), html: tokensHtml },
      ]}
      initialViewId="showcase"
      onView={handleView}
      exportTitleFor={(viewId) => `${system.title} — ${viewId}`}
      onClose={onClose}
      sidebar={{
        label: t('ds.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        // Re-fire onToggle when the system swaps under us so the new
        // DESIGN.md fetch starts even if the sidebar never closed.
        contentKey: system.id,
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
          />
        ),
      }}
    />
  );
}
