import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { fetchPromptTemplate } from '../providers/registry';
import type {
  PromptTemplateDetail,
  PromptTemplateSummary,
} from '../types';
import { Icon } from './Icon';

interface Props {
  summary: PromptTemplateSummary;
  onClose: () => void;
}

// Modal preview for a curated prompt template. The summary payload from
// /api/prompt-templates carries enough to render the header (title,
// description, category, tags, attribution) and the preview asset; the
// prompt body is fetched lazily so the gallery list stays cheap.
export function PromptTemplatePreviewModal({ summary, onClose }: Props) {
  const t = useT();
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Immersive fullscreen preview state. Layered ABOVE the modal so the
  // user can dive into the asset without losing the prompt context they
  // came from — closing the lightbox restores the modal underneath.
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setCopied(false);
    setLightboxOpen(false);
    void fetchPromptTemplate(summary.surface, summary.id).then((d) => {
      if (cancelled) return;
      if (!d) {
        setError(t('promptTemplates.fetchError'));
        return;
      }
      setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [summary.id, summary.surface, t]);

  // Close on Escape — when the lightbox is open, ESC closes only the
  // lightbox (preserving the modal beneath); otherwise it closes the
  // modal itself. Mirrors the design-system preview modal's pattern so
  // the two gallery views feel consistent.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (lightboxOpen) {
        setLightboxOpen(false);
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightboxOpen]);

  function handleCopy() {
    if (!detail) return;
    void navigator.clipboard.writeText(detail.prompt).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  const sourceLabel = summary.source.author
    ? `${summary.source.author} · ${summary.source.repo}`
    : summary.source.repo;

  const hasAsset = !!(summary.previewVideoUrl || summary.previewImageUrl);
  const fullscreenLabel = t('promptTemplates.openFullscreen');
  const closeFullscreenLabel = t('promptTemplates.closeFullscreen');

  return (
    <>
    <div
      className="prompt-template-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="prompt-template-modal">
        <header className="prompt-template-modal-head">
          <div className="prompt-template-modal-titles">
            <h2>{summary.title}</h2>
            <p>{summary.summary}</p>
          </div>
          <button
            type="button"
            className="ghost prompt-template-modal-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="prompt-template-modal-tags">
          <span className="prompt-template-category">{summary.category}</span>
          {(summary.tags ?? []).map((tag) => (
            <span key={tag} className="prompt-template-tag">
              {tag}
            </span>
          ))}
          {summary.model ? (
            <span className="prompt-template-model">
              {t('promptTemplates.modelHint', { model: summary.model })}
            </span>
          ) : null}
          {summary.aspect ? (
            <span className="prompt-template-model">{summary.aspect}</span>
          ) : null}
        </div>
        <div className="prompt-template-modal-body">
          {hasAsset ? (
            <div className="prompt-template-modal-asset">
              {summary.previewVideoUrl ? (
                <video
                  src={summary.previewVideoUrl}
                  poster={summary.previewImageUrl}
                  controls
                  preload="none"
                  playsInline
                />
              ) : summary.previewImageUrl ? (
                // Image is click-to-expand — the whole thumbnail acts as
                // the trigger so it feels natural (cursor: zoom-in). The
                // floating pill below also opens fullscreen and is the
                // primary path for video previews where clicks land on
                // the native <video controls> instead.
                <button
                  type="button"
                  className="prompt-template-modal-asset-image-trigger"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={fullscreenLabel}
                >
                  <img
                    src={summary.previewImageUrl}
                    alt={summary.title}
                    loading="lazy"
                  />
                </button>
              ) : null}
              <button
                type="button"
                className="prompt-template-modal-asset-expand"
                onClick={() => setLightboxOpen(true)}
                aria-label={fullscreenLabel}
                title={fullscreenLabel}
              >
                <Icon name="eye" size={12} />
                <span>{fullscreenLabel}</span>
              </button>
            </div>
          ) : null}
          <div className="prompt-template-modal-prompt">
            <div className="prompt-template-modal-prompt-head">
              <span className="prompt-template-modal-prompt-label">
                {t('promptTemplates.promptLabel')}
              </span>
              <button
                type="button"
                className="ghost"
                onClick={handleCopy}
                disabled={!detail}
              >
                <Icon name="copy" size={12} />
                {copied
                  ? t('promptTemplates.copyDone')
                  : t('promptTemplates.copyPrompt')}
              </button>
            </div>
            <pre className="prompt-template-modal-prompt-body">
              {detail
                ? detail.prompt
                : error
                  ? error
                  : t('common.loading')}
            </pre>
          </div>
        </div>
        <footer className="prompt-template-modal-foot">
          <span>
            {t('promptTemplates.sourcePrefix')} {sourceLabel} ·{' '}
            <span className="prompt-template-license">
              {summary.source.license}
            </span>
          </span>
          {summary.source.url ? (
            <a
              href={summary.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('promptTemplates.openSource')}
            </a>
          ) : null}
        </footer>
      </div>
    </div>
    {lightboxOpen && hasAsset ? (
      // Immersive lightbox — full viewport, dark backdrop, centered
      // media. Rendered as a sibling of the modal backdrop so its
      // backdrop click is independent (clicking the lightbox backdrop
      // closes only the lightbox, not the modal beneath).
      <div
        className="prompt-template-lightbox-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={fullscreenLabel}
        onClick={(e) => {
          if (e.target === e.currentTarget) setLightboxOpen(false);
        }}
      >
        {summary.previewVideoUrl ? (
          <video
            className="prompt-template-lightbox-media"
            src={summary.previewVideoUrl}
            poster={summary.previewImageUrl}
            controls
            autoPlay
            playsInline
          />
        ) : summary.previewImageUrl ? (
          <img
            className="prompt-template-lightbox-media"
            src={summary.previewImageUrl}
            alt={summary.title}
          />
        ) : null}
        <button
          type="button"
          className="prompt-template-lightbox-close"
          onClick={() => setLightboxOpen(false)}
          aria-label={closeFullscreenLabel}
          title={closeFullscreenLabel}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    ) : null}
    </>
  );
}
