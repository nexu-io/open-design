import { createPortal } from 'react-dom';
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AgentModelOption } from '../types';
import { useT } from '../i18n';
import { Icon } from './Icon';
import {
  getModelCostTier,
  getModelCapabilityTag,
  MODEL_COST_TIER_LABEL_KEYS,
  MODEL_CAPABILITY_TAG_LABEL_KEYS,
} from './modelCapabilityTags';

export function renderModelOptions(models: AgentModelOption[]) {
  const groups = new Map<string, AgentModelOption[]>();
  const flat: AgentModelOption[] = [];
  for (const m of models) {
    const slash = m.id.indexOf('/');
    if (m.id === 'default' || slash <= 0) {
      flat.push(m);
      continue;
    }
    const provider = m.id.slice(0, slash);
    const arr = groups.get(provider) ?? [];
    arr.push(m);
    groups.set(provider, arr);
  }
  flat.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : 0));
  if (groups.size === 0) {
    return (
      <>
        {flat.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {flat.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
      {Array.from(groups.entries()).map(([provider, items]) => (
        <optgroup key={provider} label={provider}>
          {items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label.startsWith(`${provider}/`)
                ? m.label.slice(provider.length + 1)
                : m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function orderModelOptionsByAvailability(
  models: AgentModelOption[],
): AgentModelOption[] {
  const enabled: AgentModelOption[] = [];
  const disabled: AgentModelOption[] = [];
  for (const model of models) {
    if (model.enabled === false) disabled.push(model);
    else enabled.push(model);
  }
  return [...enabled, ...disabled];
}

function matchesModelSearch(model: AgentModelOption, query: string): boolean {
  const haystack = `${model.id}\n${model.label}`.toLowerCase();
  return haystack.includes(query);
}

interface SearchableModelSelectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  models: AgentModelOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder: string;
  searchInputTestId?: string;
  popoverTestId?: string;
  popoverClassName?: string;
  additionalOptions?: Array<{ value: string; label: string }>;
  disabledOptionHint?: (option: AgentModelOption) => string | null | undefined;
  /**
   * When provided together with a `disabledOptionHint`, a disabled option
   * renders a Lock icon at its trailing edge instead of the inline hint text.
   * Hovering the lock surfaces the hint; clicking it invokes this callback
   * (e.g. open the AMR console upgrade destination). Available models are
   * unaffected. Shared by InlineModelSwitcher, SettingsDialog, and AvatarMenu.
   */
  onDisabledOptionUpgrade?: (option: AgentModelOption) => void;
  minSearchableOptions?: number;
  popoverMinWidth?: number;
}

export const SearchableModelSelect = forwardRef<
  HTMLButtonElement,
  SearchableModelSelectProps
>(function SearchableModelSelect(
  {
    models,
    value,
    onChange,
    searchPlaceholder,
    searchInputTestId,
    popoverTestId,
    popoverClassName,
    additionalOptions,
    disabledOptionHint,
    onDisabledOptionUpgrade,
    minSearchableOptions = 8,
    popoverMinWidth,
    className,
    ...buttonProps
  },
  ref,
) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popoverStyle, setPopoverStyle] = useState<({ left: number; width: number; maxHeight: number } & ({ top: number; bottom?: never } | { bottom: number; top?: never })) | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useMemo(
    () => `model-picker-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  const allOptions = useMemo(() => {
    const merged = new Map<string, AgentModelOption>();
    for (const option of models) merged.set(option.id, option);
    for (const option of additionalOptions ?? []) {
      if (!merged.has(option.value)) {
        merged.set(option.value, { id: option.value, label: option.label });
      }
    }
    return Array.from(merged.values());
  }, [additionalOptions, models]);
  const selectedOption =
    allOptions.find((option) => option.id === value) ??
    (value ? { id: value, label: value } : allOptions[0] ?? null);
  const selectedTag = selectedOption
    ? getModelCapabilityTag(selectedOption)
    : null;
  const selectedTagLabel = selectedTag
    ? t(MODEL_CAPABILITY_TAG_LABEL_KEYS[selectedTag])
    : null;
  const selectedTagDescriptionId = selectedTagLabel
    ? `${listboxId}-selected-tag`
    : undefined;
  const buttonDescriptionIds = [
    buttonProps['aria-describedby'],
    selectedTagDescriptionId,
  ].filter(Boolean).join(' ') || undefined;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return allOptions;
    return allOptions.filter(
      (option) =>
        option.id === value ||
        option.id === CUSTOM_MODEL_SENTINEL ||
        matchesModelSearch(option, normalizedQuery),
    );
  }, [allOptions, normalizedQuery, value]);
  const shouldShowSearch = allOptions.length >= minSearchableOptions;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handlePopoverKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect =
        buttonRef.current?.getBoundingClientRect() ??
        wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = typeof window === 'undefined' ? rect.width : window.innerWidth;
      const viewportHeight = typeof window === 'undefined' ? rect.height : window.innerHeight;
      const desiredWidth = Math.max(rect.width, popoverMinWidth ?? 0);
      const maxWidth = Math.max(160, viewportWidth - 16);
      const width = Math.min(desiredWidth, maxWidth);
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, viewportWidth - width - 8),
      );
      const availableBelow = Math.max(140, viewportHeight - rect.bottom - 12);
      const availableAbove = Math.max(140, rect.top - 12);
      const shouldOpenUpward = availableBelow < 260 && availableAbove > availableBelow;
      const maxHeight = Math.min(360, shouldOpenUpward ? availableAbove : availableBelow);
      if (shouldOpenUpward) {
        setPopoverStyle({
          bottom: Math.max(8, viewportHeight - rect.top + 6),
          left,
          width,
          maxHeight,
        });
        return;
      }
      setPopoverStyle({
        top: rect.bottom + 6,
        left,
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, popoverMinWidth]);

  useEffect(() => {
    if (!open || !shouldShowSearch) return;
    searchRef.current?.focus();
  }, [open, shouldShowSearch]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <div className={`model-select-searchable${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        {...buttonProps}
        ref={(node) => {
          buttonRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-describedby={buttonDescriptionIds}
        className={className}
        onClick={(event) => {
          buttonProps.onClick?.(event);
          if (!event.defaultPrevented) setOpen((prev) => !prev);
        }}
      >
        <span className="model-select-searchable__value">
          <span className="model-select-searchable__value-label">
            {selectedOption?.label ?? ''}
          </span>
          {selectedTagLabel ? (
            <span
              className="model-select-searchable__value-badge"
              data-tag={selectedTag}
              id={selectedTagDescriptionId}
            >
              {selectedTagLabel}
            </span>
          ) : null}
        </span>
      </button>
      {open && popoverStyle
        ? createPortal(
            <div
              ref={popoverRef}
              className={`model-select-searchable__popover${popoverClassName ? ` ${popoverClassName}` : ''}`}
              role="presentation"
              data-testid={popoverTestId}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handlePopoverKeyDown}
              style={{
                position: 'fixed',
                top: popoverStyle.top != null ? `${popoverStyle.top}px` : 'auto',
                bottom: popoverStyle.bottom != null ? `${popoverStyle.bottom}px` : 'auto',
                left: `${popoverStyle.left}px`,
                width: `${popoverStyle.width}px`,
                maxHeight: `${popoverStyle.maxHeight}px`,
              }}
            >
              {shouldShowSearch ? (
                <div className="model-select-searchable__search-row">
                  <input
                    ref={searchRef}
                    type="search"
                    className="ds-picker-search model-select-searchable__input"
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    data-testid={searchInputTestId}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              ) : null}
              <div
                className="model-select-searchable__list"
                id={listboxId}
                role="listbox"
                style={{
                  maxHeight: `${Math.max(96, popoverStyle.maxHeight - (shouldShowSearch ? 52 : 12))}px`,
                }}
              >
                {filteredOptions.map((option, index) => {
                  const active = option.id === value;
                  const disabled = option.enabled === false;
                  const disabledHint = disabled ? disabledOptionHint?.(option) : null;
                  const showUpgradeLock =
                    disabled && !!disabledHint && !!onDisabledOptionUpgrade;
                  const tag = getModelCapabilityTag(option);
                  const tagLabel = tag
                    ? t(MODEL_CAPABILITY_TAG_LABEL_KEYS[tag])
                    : null;
                  const costTier = getModelCostTier(option);
                  const costLabel = costTier
                    ? t(MODEL_COST_TIER_LABEL_KEYS[costTier])
                    : null;
                  const optionId = `${listboxId}-option-${index}`;
                  const optionLabelId = `${optionId}-label`;
                  const optionCostId = costLabel ? `${optionId}-cost` : undefined;
                  const optionTagId = tagLabel ? `${optionId}-tag` : undefined;
                  const optionDisabledId = disabledHint ? `${optionId}-disabled` : undefined;
                  const optionDescriptionIds = [optionCostId, optionTagId, optionDisabledId]
                    .filter(Boolean)
                    .join(' ') || undefined;
                  const optionContent = (
                    <span className="model-select-searchable__option-content">
                      <span className="model-select-searchable__option-copy">
                        <span className="model-select-searchable__option-label">
                          <span id={optionLabelId}>{option.label}</span>
                          {showUpgradeLock ? (
                            <button
                              type="button"
                              className="model-select-searchable__option-lock-inline od-tooltip"
                              data-testid="model-option-upgrade-lock"
                              id={optionDisabledId}
                              data-tooltip={disabledHint ?? undefined}
                              data-tooltip-placement="top"
                              title={disabledHint ?? undefined}
                              aria-label={disabledHint ?? undefined}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDisabledOptionUpgrade?.(option);
                              }}
                            >
                              <Icon name="lock" size={13} />
                            </button>
                          ) : null}
                        </span>
                        {costLabel ? (
                          <span
                            className="model-select-searchable__option-meta"
                            id={optionCostId}
                          >
                            {costLabel}
                          </span>
                        ) : null}
                        {disabledHint && !showUpgradeLock ? (
                          <span
                            className="model-select-searchable__option-meta"
                            id={optionDisabledId}
                          >
                            {disabledHint}
                          </span>
                        ) : null}
                      </span>
                      {tagLabel ? (
                        <span
                          className="model-select-searchable__option-badge"
                          data-tag={tag}
                          id={optionTagId}
                        >
                          {tagLabel}
                        </span>
                      ) : null}
                    </span>
                  );
                  if (showUpgradeLock) {
                    return (
                      <div
                        key={option.id}
                        role="option"
                        tabIndex={-1}
                        aria-selected={active}
                        aria-disabled="true"
                        aria-labelledby={optionLabelId}
                        aria-describedby={optionDescriptionIds}
                        className={`model-select-searchable__option${active ? ' is-active' : ''} is-disabled`}
                        data-selected={active ? 'true' : undefined}
                      >
                        {optionContent}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={disabled}
                      aria-labelledby={optionLabelId}
                      aria-describedby={optionDescriptionIds}
                      className={`model-select-searchable__option${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                      data-selected={active ? 'true' : undefined}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        onChange(option.id);
                        setOpen(false);
                      }}
                    >
                      {optionContent}
                    </button>
                  );
                })}
                {filteredOptions.length === 0 ? (
                  <div className="model-select-searchable__empty">No matching models</div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

export function isCustomModel(
  modelId: string | null | undefined,
  models: AgentModelOption[],
): boolean {
  if (!modelId) return false;
  return !models.some((m) => m.id === modelId);
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';
