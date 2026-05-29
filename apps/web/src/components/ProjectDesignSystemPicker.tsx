// Project-page design-system picker — small dropdown rendered in the
// project chrome header next to the title. It binds to an existing
// project: changing the selection PATCHes
// `project.designSystemId` so the next chat run carries the new
// design-system metadata into the agent's system prompt (the daemon
// already threads `designSystemId` from project state through
// `/api/runs` — see providers/daemon.ts).
//
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DesignSystemSummary } from '@open-design/contracts';
import { useI18n } from '../i18n';
import {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
} from '../i18n/content';
import { fetchDesignSystemPreview } from '../providers/registry';
import { Icon } from './Icon';

interface PopoverAnchor {
  top: number;
  left: number;
  width: number;
}

interface Props {
  designSystems: DesignSystemSummary[];
  selectedId: string | null;
  loading?: boolean;
  onChange: (id: string | null) => void;
}

export function ProjectDesignSystemPicker({
  designSystems,
  selectedId,
  loading,
  onChange,
}: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hovered, setHovered] = useState<DesignSystemSummary | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  const selected = useMemo(
    () => designSystems.find((d) => d.id === selectedId) ?? null,
    [designSystems, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (fullscreenPreview) return;
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (fullscreenPreview) return;
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreenPreview, open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    function updateAnchor() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popoverWidth = Math.min(640, Math.max(300, window.innerWidth * 0.86));
      const viewport = window.innerWidth;
      const left = Math.max(8, Math.min(viewport - popoverWidth - 8, rect.left));
      setAnchor({ top: rect.bottom + 6, left, width: popoverWidth });
    }
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setHovered(null);
      setFullscreenPreview(false);
    }
  }, [open]);

  useEffect(() => {
    if (!fullscreenPreview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreenPreview(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreenPreview]);

  const previewTarget = open ? hovered ?? selected : null;

  useEffect(() => {
    if (!previewTarget) {
      setPreviewHtml(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void fetchDesignSystemPreview(previewTarget.id)
      .then((html) => {
        if (cancelled) return;
        setPreviewHtml(html);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewHtml(null);
      })
      .finally(() => {
        if (cancelled) return;
        setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewTarget?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return designSystems;
    return designSystems.filter((d) => {
      const localizedSummary = localizeDesignSystemSummary(locale, d);
      const localizedCategory = localizeDesignSystemCategory(locale, d.category);
      const haystack = `${d.title} ${d.category} ${d.summary} ${localizedCategory} ${localizedSummary}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, designSystems, locale]);

  return (
    <div
      ref={wrapRef}
      className={`project-ds-picker${open ? ' open' : ''}`}
      data-testid="project-ds-picker"
    >
      <button
        ref={triggerRef}
        type="button"
        className={`project-ds-picker-trigger${selected ? ' picked' : ''}`}
        data-testid="project-ds-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        title={selected?.title ?? t('designSystemPicker.select')}
      >
        {selected && selected.swatches && selected.swatches.length > 0 ? (
          <span className="project-ds-picker-swatches" aria-hidden>
            {selected.swatches.slice(0, 3).map((sw, i) => (
              <span
                key={`pdsp-sw-${i}`}
                className="project-ds-picker-swatch"
                style={{ background: sw }}
              />
            ))}
          </span>
        ) : (
          <Icon name="palette" size={13} />
        )}
        <span className="project-ds-picker-label">
          {loading
            ? t('designSystemPicker.loading')
            : selected?.title ?? t('designSystemPicker.select')}
        </span>
        <Icon name="chevron-down" size={11} />
      </button>
      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="project-ds-picker-popover"
              data-testid="project-ds-picker-popover"
              style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
            >
              <div className="project-ds-picker-search">
                <Icon name="search" size={12} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('designSystemPicker.searchCompactPlaceholder')}
                  data-testid="project-ds-picker-search"
                />
              </div>
              <div className="project-ds-picker-body">
                <div className="project-ds-picker-list" role="listbox">
                  <button
                    type="button"
                    className={`project-ds-picker-option${selectedId == null ? ' active' : ''}`}
                    role="option"
                    aria-selected={selectedId == null}
                    onMouseEnter={() => setHovered(null)}
                    onFocus={() => setHovered(null)}
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <div className="project-ds-picker-option-head">
                      <span className="project-ds-picker-option-title">{t('designSystemPicker.noneTitle')}</span>
                      {selectedId == null ? (
                        <span
                          className="project-ds-picker-option-check"
                          data-testid="project-ds-picker-option-none-check"
                        >
                          <Icon name="check" size={13} strokeWidth={2} />
                        </span>
                      ) : null}
                    </div>
                    <span className="project-ds-picker-option-summary">
                      {t('designSystemPicker.noneSummary')}
                    </span>
                  </button>
                  {filtered.map((d) => {
                    const active = d.id === selectedId;
                    const localizedCategory = localizeDesignSystemCategory(locale, d.category);
                    const localizedSummary = localizeDesignSystemSummary(locale, d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`project-ds-picker-option${active ? ' active' : ''}`}
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setHovered(d)}
                        onFocus={() => setHovered(d)}
                        onClick={() => {
                          onChange(d.id);
                          setOpen(false);
                        }}
                        data-testid={`project-ds-picker-option-${d.id}`}
                      >
                        <div className="project-ds-picker-option-head">
                          <span className="project-ds-picker-option-title">{d.title}</span>
                          {d.category ? (
                            <span className="project-ds-picker-option-cat">{localizedCategory}</span>
                          ) : null}
                          {active ? (
                            <span
                              className="project-ds-picker-option-check"
                              data-testid={`project-ds-picker-option-${d.id}-check`}
                            >
                              <Icon name="check" size={13} strokeWidth={2} />
                            </span>
                          ) : null}
                        </div>
                        {d.swatches && d.swatches.length > 0 ? (
                          <div className="project-ds-picker-option-swatches">
                            {d.swatches.slice(0, 6).map((sw, i) => (
                              <span
                                key={`${d.id}-sw-${i}`}
                                className="project-ds-picker-option-swatch"
                                style={{ background: sw }}
                              />
                            ))}
                          </div>
                        ) : null}
                        {localizedSummary ? (
                          <span className="project-ds-picker-option-summary">{localizedSummary}</span>
                        ) : null}
                      </button>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <div className="project-ds-picker-empty">{t('designSystemPicker.empty')}</div>
                  ) : null}
                </div>
                <div className="project-ds-picker-preview" data-testid="project-ds-picker-preview">
                  {previewTarget ? (
                    <>
                      <div className="project-ds-picker-preview-head">
                        <strong>{previewTarget.title}</strong>
                        {previewTarget.category ? (
                          <span className="project-ds-picker-preview-cat">
                            {localizeDesignSystemCategory(locale, previewTarget.category)}
                          </span>
                        ) : null}
                        {previewHtml ? (
                          <button
                            type="button"
                            className="project-ds-picker-preview-expand"
                            data-testid="project-ds-picker-preview-expand"
                            onClick={() => setFullscreenPreview(true)}
                            title={t('designSystemPicker.openPreview')}
                            aria-label={t('designSystemPicker.openPreview')}
                          >
                            <Icon name="eye" size={16} strokeWidth={1.9} />
                          </button>
                        ) : null}
                      </div>
                      {previewTarget.summary ? (
                        <p className="project-ds-picker-preview-summary">
                          {localizeDesignSystemSummary(locale, previewTarget)}
                        </p>
                      ) : null}
                      {previewTarget.swatches && previewTarget.swatches.length > 0 ? (
                        <div className="project-ds-picker-preview-swatches">
                          {previewTarget.swatches.slice(0, 12).map((sw, i) => (
                            <span
                              key={`${previewTarget.id}-pv-sw-${i}`}
                              className="project-ds-picker-preview-swatch"
                              style={{ background: sw }}
                              title={sw}
                            />
                          ))}
                        </div>
                      ) : null}
                      {previewLoading ? (
                        <div className="project-ds-picker-preview-loading">
                          {t('designSystemPicker.loadingPreview')}
                        </div>
                      ) : previewHtml ? (
                        <iframe
                          className="project-ds-picker-preview-frame"
                          data-testid="project-ds-picker-preview-frame"
                          srcDoc={previewHtml}
                          sandbox="allow-same-origin"
                          title={t('designSystemPicker.previewFrameTitle', { title: previewTarget.title })}
                        />
                      ) : (
                        <div className="project-ds-picker-preview-empty">
                          {t('designSystemPicker.noPreview')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="project-ds-picker-preview-empty">
                      {t('designSystemPicker.previewHint')}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {fullscreenPreview && previewTarget && previewHtml && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="project-ds-picker-fullscreen"
              role="dialog"
              aria-label={t('designSystemPicker.fullscreenAria', { title: previewTarget.title })}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setFullscreenPreview(false);
                }
              }}
            >
              <div className="project-ds-picker-fullscreen-frame">
                <div className="project-ds-picker-fullscreen-head">
                  <div className="project-ds-picker-fullscreen-title">
                    <strong>{previewTarget.title}</strong>
                    {previewTarget.category ? (
                      <span className="project-ds-picker-preview-cat">
                        {localizeDesignSystemCategory(locale, previewTarget.category)}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="project-ds-picker-fullscreen-close"
                    onClick={() => setFullscreenPreview(false)}
                    aria-label={t('designSystemPicker.closeFullscreen')}
                    title={t('designSystemPicker.closeEsc')}
                  >
                    <Icon name="close" size={18} strokeWidth={2.1} />
                  </button>
                </div>
                <iframe
                  className="project-ds-picker-fullscreen-iframe"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  title={t('designSystemPicker.fullscreenFrameTitle', { title: previewTarget.title })}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
