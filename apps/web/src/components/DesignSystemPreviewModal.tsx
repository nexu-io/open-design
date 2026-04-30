import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
}

// Two-tab DS preview: a complete Showcase webpage rendered from the system's
// tokens, and the original Tokens view (palette / typography / components +
// rendered DESIGN.md prose).
export function DesignSystemPreviewModal({ system, onClose }: Props) {
  const t = useT();
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);

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

  // If the system swaps under us (rare but possible), wipe both caches.
  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
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
    />
  );
}
