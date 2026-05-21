// Page pattern preview modal — surfaces the full
// `/api/page-patterns/:id/example` HTML inside a sandboxed iframe.
//
// Mirrors the lightweight design-system overlay we already use
// elsewhere: clicking the backdrop or pressing Escape dismisses;
// clicks that bubble out of the iframe content are stopped by the
// inner wrapper so users can scroll / interact inside without
// accidentally closing the modal.
//
// PR-2 keeps the surface minimal. PR-3 may extend this with the
// same two-tab layout we ship for design systems (showcase + spec),
// but the gallery only needs single-iframe parity for now.

import { useEffect } from 'react';

interface Props {
  patternId: string;
  onClose: () => void;
}

export function PagePatternPreviewModal({ patternId, onClose }: Props) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="ds-preview-backdrop"
      data-testid="page-pattern-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview — ${patternId}`}
      onClick={(event) => {
        // Backdrop click only — don't close when the click started
        // on an inner element (handled by stopPropagation below).
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="ds-preview"
        onClick={(event) => event.stopPropagation()}
      >
        <iframe
          title={`Preview — ${patternId}`}
          sandbox="allow-scripts"
          src={`/api/page-patterns/${encodeURIComponent(patternId)}/example`}
          loading="lazy"
        />
      </div>
    </div>
  );
}
