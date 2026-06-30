// Shared design-system picker — the two-column popover (searchable list +
// live preview) used in BOTH the project chrome header and the home composer
// footer. It binds to a single design-system id: changing the selection calls
// `onChange(id | null)` where `null` means "不指定 / No design system".
//
// `variant` only swaps the trigger pill styling:
//   - 'project' (default): the chrome-header pill (`project-ds-picker-*`).
//   - 'footer': the home composer footer pill (`home-hero__footer-*`), so it
//     sits flush with the other footer options.
// The popover body is identical for both variants.
//
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DesignSystemSummary } from '@open-design/contracts';
import { useI18n } from '../i18n';
import {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
} from '../i18n/content';
import { navigate } from '../router';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
import { useBrandsByDesignSystemId } from '../runtime/brands';
import { DesignSystemKitPreview } from './DesignSystemKitPreview';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { Icon } from './Icon';

// Mirror DesignSystemsTab's user/official split so the picker's grouping lines
// up exactly with the "你的体系 / 官方预设" tabs in the Design Systems tab.
function isUserSystem(system: DesignSystemSummary): boolean {
  return system.source === 'user' || system.isEditable === true;
}

interface PopoverAnchor {
  left: number;
  width: number;
  maxHeight: number;
  // Vertical placement: when the trigger sits near the bottom of the
  // viewport (e.g. the composer-top picker) the popover opens upward,
  // anchored by `bottom`; otherwise it opens downward, anchored by `top`.
  top?: number;
  bottom?: number;
}

interface Props {
  designSystems: DesignSystemSummary[];
  selectedId: string | null;
  loading?: boolean;
  onChange: (id: string | null) => void;
  /**
   * Trigger styling only; the popover is identical across variants.
   *   - 'project' (default): the chrome-header pill (`project-ds-picker-*`).
   *   - 'footer': the home composer input-card footer pill.
   *   - 'home': the borderless trigger in the home composer's row below the
   *     card, sitting flush with the working-directory picker.
   */
  variant?: 'project' | 'footer' | 'home';
  /** Footer variant: visually-hidden label for the trigger button. */
  label?: string;
  /** Hide the recursive "Create" action when the picker is already on create. */
  showCreateAction?: boolean;
}

export function DesignSystemPicker({
  designSystems,
  selectedId,
  loading,
  onChange,
  variant = 'project',
  label,
  showCreateAction = true,
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
  // Tracks whether the "不指定 / No design system" row is the active preview
  // target (hovered), so its right-pane blurb shows instead of a system preview.
  const [hoveredNone, setHoveredNone] = useState(false);
  const [previewModalSystem, setPreviewModalSystem] = useState<DesignSystemSummary | null>(null);

  const selected = useMemo(
    () => designSystems.find((d) => d.id === selectedId) ?? null,
    [designSystems, selectedId],
  );

  // Map each `user:<id>` design system to its backing brand so a selected /
  // hovered brand previews the rich Brand Kit card instead of the thin
  // design-system summary. Fetched lazily on first open; a non-brand system
  // (bundled / imported) is absent from the map and keeps the thin preview.
  const brandsByDesignSystem = useBrandsByDesignSystemId(open);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    function updateAnchor() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.innerWidth;
      const popoverWidth = Math.min(640, Math.max(320, viewport - 24));
      const left = Math.max(8, Math.min(viewport - popoverWidth - 8, rect.left));
      const gap = 6;
      const margin = 12;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      // Open upward when there isn't enough room below (the composer-top
      // picker is near the viewport bottom) but there is more room above.
      const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      if (openUp) {
        setAnchor({
          bottom: window.innerHeight - rect.top + gap,
          left,
          width: popoverWidth,
          maxHeight: Math.max(220, Math.min(420, spaceAbove)),
        });
      } else {
        setAnchor({
          top: rect.bottom + gap,
          left,
          width: popoverWidth,
          maxHeight: Math.max(220, Math.min(420, spaceBelow)),
        });
      }
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
      setHoveredNone(false);
    }
  }, [open]);

  // Resolve what the right pane previews. Priority: a hovered system, the
  // hovered "不指定" row, the selected system, then "不指定" when nothing is
  // selected (so opening with "不指定" active shows its blurb, not the hint).
  let previewSystem: DesignSystemSummary | null = null;
  let previewNone = false;
  if (open) {
    if (hovered) previewSystem = hovered;
    else if (hoveredNone) previewNone = true;
    else if (selectedId != null) previewSystem = selected;
    else previewNone = true;
  }

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

  // Split the filtered list into the same two groups the Design Systems tab
  // uses, so the picker reads as "your systems" then "official presets".
  const { userSystems, officialSystems } = useMemo(() => {
    const mine: DesignSystemSummary[] = [];
    const official: DesignSystemSummary[] = [];
    for (const d of filtered) (isUserSystem(d) ? mine : official).push(d);
    return { userSystems: mine, officialSystems: official };
  }, [filtered]);

  const selectDesignSystem = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const selectDesignSystemOnKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: string | null) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectDesignSystem(id);
  };

  const renderOption = (d: DesignSystemSummary) => {
    const active = d.id === selectedId;
    return (
      <button
        key={d.id}
        type="button"
        className={`project-ds-picker-option${active ? ' active' : ''}`}
        role="option"
        aria-selected={active}
        onMouseEnter={() => {
          setHovered(d);
          setHoveredNone(false);
        }}
        onFocus={() => {
          setHovered(d);
          setHoveredNone(false);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          selectDesignSystem(d.id);
        }}
        onKeyDown={(event) => selectDesignSystemOnKeyDown(event, d.id)}
        data-testid={`project-ds-picker-option-${d.id}`}
      >
        <div className="project-ds-picker-option-head">
          <span className="project-ds-picker-option-title">{d.title}</span>
          {active ? (
            <span
              className="project-ds-picker-option-check"
              data-testid={`project-ds-picker-option-${d.id}-check`}
            >
              <Icon name="check" size={13} strokeWidth={2} />
            </span>
          ) : null}
        </div>
      </button>
    );
  };

  // Clear: reset the search query and deselect any chosen system (back to "No
  // design system") without closing, so the user can keep browsing. Create:
  // jump to the standalone design-system creation page, closing the popover.
  const clearSelection = () => {
    setQuery('');
    onChange(null);
    inputRef.current?.focus();
  };
  const createDesignSystem = () => {
    setOpen(false);
    setPendingDesignSystemCreateEntry('composer_picker');
    navigate({ kind: 'design-system-create' });
  };

  const openSystemPreview = (system: DesignSystemSummary) => {
    setOpen(false);
    setPreviewModalSystem(system);
  };

  // The trigger shows a neutral palette icon rather than a few swatches: a 3-dot
  // slice of a system's palette often grabs only its neutrals (background/ink)
  // and drops the brand accent, so the pill read as a different colour scheme
  // than the full preview. The name + on-open preview convey the system instead.
  const triggerSwatches = <Icon name="palette" size={13} />;

  const popover: ReactNode =
    open && anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            className="project-ds-picker-popover"
            data-testid="project-ds-picker-popover"
            data-placement={anchor.bottom !== undefined ? 'up' : 'down'}
            style={{
              top: anchor.top,
              bottom: anchor.bottom,
              left: anchor.left,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
            }}
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
              <button
                type="button"
                className="project-ds-picker-action"
                data-testid="project-ds-picker-clear"
                onClick={clearSelection}
              >
                {t('common.clear')}
              </button>
              {showCreateAction ? (
                <button
                  type="button"
                  className="project-ds-picker-action project-ds-picker-action--primary"
                  data-testid="project-ds-picker-create"
                  onClick={createDesignSystem}
                >
                  <Icon name="plus" size={12} strokeWidth={2} />
                  <span>{t('common.create')}</span>
                </button>
              ) : null}
            </div>
            <div className="project-ds-picker-body">
              <div className="project-ds-picker-list" role="listbox">
                <button
                  type="button"
                  className={`project-ds-picker-option${selectedId == null ? ' active' : ''}`}
                  role="option"
                  aria-selected={selectedId == null}
                  onMouseEnter={() => {
                    setHovered(null);
                    setHoveredNone(true);
                  }}
                  onFocus={() => {
                    setHovered(null);
                    setHoveredNone(true);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectDesignSystem(null);
                  }}
                  onKeyDown={(event) => selectDesignSystemOnKeyDown(event, null)}
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
                </button>
                {userSystems.length > 0 ? (
                  <div
                    className="project-ds-picker-group-label"
                    role="presentation"
                    data-testid="project-ds-picker-group-mine"
                  >
                    {t('dsManager.yourSystems')}
                  </div>
                ) : null}
                {userSystems.map(renderOption)}
                {officialSystems.length > 0 ? (
                  <div
                    className="project-ds-picker-group-label"
                    role="presentation"
                    data-testid="project-ds-picker-group-official"
                  >
                    {t('dsManager.officialPresets')}
                  </div>
                ) : null}
                {officialSystems.map(renderOption)}
                {filtered.length === 0 ? (
                  <div className="project-ds-picker-empty">{t('designSystemPicker.empty')}</div>
                ) : null}
              </div>
              <div className="project-ds-picker-preview" data-testid="project-ds-picker-preview">
                {previewNone ? (
                  <div data-testid="project-ds-picker-preview-none">
                    <div className="project-ds-picker-preview-head">
                      <strong>{t('designSystemPicker.noneTitle')}</strong>
                    </div>
                    <p className="project-ds-picker-preview-summary">
                      {t('designSystemPicker.noneSummary')}
                    </p>
                  </div>
                ) : previewSystem ? (
                  <div
                    className="project-ds-picker-preview-kit-wrap"
                    data-testid="project-ds-picker-preview-kit-wrap"
                  >
                    <DesignSystemKitPreview
                      system={previewSystem}
                      brandSummary={brandsByDesignSystem.get(previewSystem.id) ?? null}
                      variant="compact"
                      showCover={false}
                      className="project-ds-picker-preview-kit"
                      dataTestId="project-ds-picker-preview-kit"
                    />
                    <button
                      type="button"
                      className="project-ds-picker-preview-open"
                      data-testid="project-ds-picker-preview-expand"
                      onClick={() => openSystemPreview(previewSystem)}
                    >
                      <Icon name="eye" size={13} strokeWidth={1.9} />
                      <span>{t('designSystemPicker.openPreview')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="project-ds-picker-preview-stage">
                    <div className="project-ds-picker-preview-empty">
                      {t('designSystemPicker.previewHint')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const previewModal: ReactNode = previewModalSystem ? (
    <DesignSystemPreviewModal
      system={previewModalSystem}
      onClose={() => setPreviewModalSystem(null)}
    />
  ) : null;

  if (variant === 'home') {
    return (
      <div
        ref={wrapRef}
        className="home-hero__ds-row-picker"
        data-testid="home-hero-design-system-picker"
      >
        <button
          ref={triggerRef}
          type="button"
          className="home-hero__ds-row-trigger"
          data-testid="home-hero-design-system-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={loading}
          title={selected?.title ?? t('designSystemPicker.noneTitle')}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="palette" size={13} className="home-hero__ds-row-trigger-icon" />
          <span className="home-hero__ds-row-trigger-label">
            {loading
              ? t('designSystemPicker.loading')
              : selected?.title ?? t('designSystemPicker.noneTitle')}
          </span>
          <Icon name="chevron-down" size={11} className="home-hero__ds-row-trigger-chevron" />
        </button>
        {popover}
        {previewModal}
      </div>
    );
  }

  if (variant === 'footer') {
    return (
      <div
        ref={wrapRef}
        className={`home-hero__footer-option home-hero__footer-option--select${open ? ' is-open' : ''}`}
        data-field-name="designSystem"
      >
        <span>{label ?? t('designSystemPicker.select')}</span>
        <button
          ref={triggerRef}
          type="button"
          className="home-hero__footer-select-trigger"
          data-testid="home-hero-footer-option-designSystem"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={loading}
          onClick={() => setOpen((v) => !v)}
        >
          {triggerSwatches}
          <span className="home-hero__footer-select-label">
            {loading
              ? t('designSystemPicker.loading')
              : selected?.title ?? t('designSystemPicker.noneTitle')}
          </span>
          <Icon name="chevron-down" size={12} aria-hidden />
        </button>
        {popover}
        {previewModal}
      </div>
    );
  }

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
        {triggerSwatches}
        <span className="project-ds-picker-label">
          {loading
            ? t('designSystemPicker.loading')
            : selected?.title ?? t('designSystemPicker.select')}
        </span>
        <Icon name="chevron-down" size={11} />
      </button>
      {popover}
      {previewModal}
    </div>
  );
}
