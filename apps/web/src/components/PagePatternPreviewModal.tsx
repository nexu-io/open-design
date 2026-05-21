import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { fetchPagePatternExample } from '../providers/registry';
import type { PagePatternSummary } from '@open-design/contracts';
import { PreviewModal } from './PreviewModal';

interface Props {
  pattern: PagePatternSummary;
  onClose: () => void;
}

// Wraps the shared PreviewModal with a single "Preview" view backed by
// /api/page-patterns/:id/example. Mirrors how DesignSystemPreviewModal
// composes its showcase + tokens views so positioning, fullscreen,
// share, and dismissal behavior stay consistent across all gallery
// preview modals.
export function PagePatternPreviewModal({ pattern, onClose }: Props) {
  const t = useT();
  const [html, setHtml] = useState<string | null | undefined>(undefined);

  const handleView = useCallback(
    (viewId: string) => {
      if (viewId !== 'preview' || html !== undefined) return;
      setHtml(null);
      void fetchPagePatternExample(pattern.id).then((value) => setHtml(value));
    },
    [pattern.id, html],
  );

  useEffect(() => {
    setHtml(undefined);
  }, [pattern.id]);

  return (
    <PreviewModal
      title={pattern.name}
      subtitle={pattern.pageType || pattern.description}
      views={[{ id: 'preview', label: t('pagePatterns.previewAction'), html }]}
      initialViewId="preview"
      onView={handleView}
      exportTitleFor={() => pattern.name}
      onClose={onClose}
    />
  );
}
