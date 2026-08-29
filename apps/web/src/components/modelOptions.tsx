import { createPortal } from 'react-dom';
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AgentModelOption } from '../types';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { modelProviderIconSrc } from './modelProviderIcon';
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

// Canonical company/provider display names for the two-level model picker.
// Keyed by the model id's leading token (before the first `-`, or before a
// BYOK `provider/model` slash).
const MODEL_COMPANY_NAMES: Record<string, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  glm: 'GLM',
  kimi: 'Kimi',
  qwen: 'Qwen',
  openai: 'OpenAI',
  gpt: 'OpenAI',
  o1: 'OpenAI',
  o3: 'OpenAI',
  grok: 'Grok',
  llama: 'Llama',
  mistral: 'Mistral',
  doubao: 'Doubao',
  minimax: 'MiniMax',
  moonshot: 'Moonshot',
};

/** Company key + display name for a model id (deepseek-v4-flash → deepseek /
 *  "DeepSeek"; openai/gpt-5 → openai / "OpenAI"). */
export function modelCompany(id: string): { key: string; name: string } {
  const slash = id.indexOf('/');
  const key = (slash > 0 ? id.slice(0, slash) : id.split('-')[0] ?? id).toLowerCase();
  const name = MODEL_COMPANY_NAMES[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : id);
  return { key, name };
}

interface ModelCompanyGroup {
  key: string;
  name: string;
  options: AgentModelOption[];
}

/** Group model options by company, preserving first-seen order. */
export function groupModelsByCompany(options: AgentModelOption[]): ModelCompanyGroup[] {
  const groups: ModelCompanyGroup[] = [];
  const byKey = new Map<string, ModelCompanyGroup>();
  for (const option of options) {
    const { key, name } = modelCompany(option.id);
    let group = byKey.get(key);
    if (!group) {
      group = { key, name, options: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
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
  /**
   * Opts into the two-level company/model browse (companies on the left,
   * models on the right) once the list is long enough to benefit from it.
   * Explicit opt-in rather than always-on: company identity is derived from
   * the model id's leading token, which only carries real vendor meaning for
   * a genuinely cross-provider catalog (AMR's). A single provider's own raw
   * model ids (e.g. Codex's `o1`/`o3`/`o4-mini` alongside `gpt-*`) would
   * otherwise get split into misleading fake "companies". Callers pass
   * `groupByCompany={agent.id === 'amr'}` or similar.
   */
  groupByCompany?: boolean;
  minSearchableOptions?: number;
  popoverMinWidth?: number;
  getPopoverBoundary?: () => {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  } | null;
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
    groupByCompany = false,
    minSearchableOptions = 8,
    popoverMinWidth,
    getPopoverBoundary,
    className,
    ...buttonProps
  },
  ref,
) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popoverStyle, setPopoverStyle] = useState<{
    placement: 'above' | 'below';
    offset: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const placementRef = useRef<'above' | 'below' | null>(null);
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
  // Two-level browse (companies left, models right) only pays off for a long
  // cross-company list — the case worth "distinguishing companies". Small
  // pickers (a couple of models, or a single provider) stay a flat list, and
  // callers that didn't opt in via `groupByCompany` always stay flat too.
  const allCompanyCount = useMemo(() => groupModelsByCompany(allOptions).length, [allOptions]);
  const useTwoLevel =
    groupByCompany && allOptions.length >= minSearchableOptions && allCompanyCount >= 2;
  // Grouped from the (search-)filtered options.
  const companyGroups = useMemo(() => groupModelsByCompany(filteredOptions), [filteredOptions]);
  const selectedCompanyKey = value ? modelCompany(value).key : companyGroups[0]?.key ?? null;
  const [hoverCompany, setHoverCompany] = useState<string | null>(null);
  // Default the open flyout to the selected model's company (or the first),
  // and keep it valid as the filtered group set changes.
  const activeCompanyKey =
    hoverCompany && companyGroups.some((g) => g.key === hoverCompany)
      ? hoverCompany
      : companyGroups.some((g) => g.key === selectedCompanyKey)
        ? selectedCompanyKey
        : companyGroups[0]?.key ?? null;
  const activeCompany = companyGroups.find((g) => g.key === activeCompanyKey) ?? null;
  useEffect(() => {
    if (!open) setHoverCompany(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Consume Escape in the capture phase so an outer surface's document
      // listener (for example Settings) cannot close before this portalled
      // picker gets a chance to handle the key. This also covers short model
      // lists without a search input, where focus stays on the trigger outside
      // the popover and the React popover handler never sees the event.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
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
      const requestedBoundary = getPopoverBoundary?.();
      const boundaryLeft = Math.min(
        viewportWidth,
        Math.max(0, requestedBoundary?.left ?? 8),
      );
      const boundaryRight = Math.max(
        boundaryLeft,
        Math.min(viewportWidth, requestedBoundary?.right ?? viewportWidth - 8),
      );
      const boundaryTop = Math.min(
        viewportHeight,
        Math.max(0, requestedBoundary?.top ?? 8),
      );
      const boundaryBottom = Math.max(
        boundaryTop,
        Math.min(
          viewportHeight,
          requestedBoundary?.bottom ?? viewportHeight - 8,
        ),
      );

      const referenceHasLayout = rect.width > 0 || rect.height > 0;
      const referenceIsOutsideBoundary =
        referenceHasLayout &&
        (rect.bottom <= boundaryTop ||
          rect.top >= boundaryBottom ||
          rect.right <= boundaryLeft ||
          rect.left >= boundaryRight);
      if (referenceIsOutsideBoundary) {
        setPopoverStyle(null);
        setOpen(false);
        return;
      }

      // Wide triggers (e.g. the settings dialog's full-width model field)
      // must not drag the popover to field width — 560px comfortably fits
      // the two-level company/model browse and the widest model rows; a
      // caller-provided popoverMinWidth beyond that still wins.
      const POPOVER_MAX_WIDTH = 560;
      const desiredWidth = Math.min(
        Math.max(rect.width, popoverMinWidth ?? 0),
        Math.max(POPOVER_MAX_WIDTH, popoverMinWidth ?? 0),
      );
      const maxWidth = Math.max(0, boundaryRight - boundaryLeft);
      const width = Math.min(desiredWidth, maxWidth);
      const left = Math.min(
        Math.max(boundaryLeft, rect.left),
        Math.max(boundaryLeft, boundaryRight - width),
      );
      const gap = 6;
      const availableBelow = Math.max(0, boundaryBottom - rect.bottom - gap);
      const availableAbove = Math.max(0, rect.top - boundaryTop - gap);
      const minimumHeight = shouldShowSearch ? 96 : 52;
      let placement = placementRef.current;
      if (placement === null) {
        placement =
          availableBelow < 260 && availableAbove > availableBelow
            ? 'above'
            : 'below';
      } else {
        const currentAvailable =
          placement === 'above' ? availableAbove : availableBelow;
        const oppositeAvailable =
          placement === 'above' ? availableBelow : availableAbove;
        if (
          currentAvailable < minimumHeight &&
          oppositeAvailable >= minimumHeight
        ) {
          placement = placement === 'above' ? 'below' : 'above';
        }
      }
      const availableHeight =
        placement === 'above' ? availableAbove : availableBelow;
      if ((referenceHasLayout && width <= 0) || availableHeight < minimumHeight) {
        setPopoverStyle(null);
        setOpen(false);
        return;
      }
      placementRef.current = placement;
      const maxHeight = Math.min(360, availableHeight);
      setPopoverStyle({
        placement,
        offset:
          placement === 'above'
            ? viewportHeight - rect.top + gap
            : rect.bottom + gap,
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
  }, [getPopoverBoundary, open, popoverMinWidth, shouldShowSearch]);

  useEffect(() => {
    if (!open || !shouldShowSearch) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [open, shouldShowSearch]);

  useEffect(() => {
    if (!open) {
      placementRef.current = null;
      setQuery('');
    }
  }, [open]);

  /** One option row — shared by the flat list and the two-level browse's
   *  models pane, so cost-tier / capability-tag / upgrade-lock affordances
   *  render identically in either layout. `index` only needs to be unique
   *  within whichever list is currently mounted. */
  function renderModelOption(option: AgentModelOption, index: number) {
    const active = option.id === value;
    const disabled = option.enabled === false;
    const disabledHint = disabled ? disabledOptionHint?.(option) : null;
    const showUpgradeLock = disabled && !!disabledHint && !!onDisabledOptionUpgrade;
    const tag = getModelCapabilityTag(option);
    const tagLabel = tag ? t(MODEL_CAPABILITY_TAG_LABEL_KEYS[tag]) : null;
    const costTier = getModelCostTier(option);
    const costLabel = costTier ? t(MODEL_COST_TIER_LABEL_KEYS[costTier]) : null;
    const optionId = `${listboxId}-option-${index}`;
    const optionLabelId = `${optionId}-label`;
    const optionCostId = costLabel ? `${optionId}-cost` : undefined;
    const optionTagId = tagLabel ? `${optionId}-tag` : undefined;
    const optionDisabledId = disabledHint ? `${optionId}-disabled` : undefined;
    const optionDescriptionIds = [optionCostId, optionTagId, optionDisabledId]
      .filter(Boolean)
      .join(' ') || undefined;
    const optionLogoSrc = modelProviderIconSrc(option.id);
    const optionContent = (
      <span className="model-select-searchable__option-content">
        {optionLogoSrc ? (
          <span className="model-select-searchable__option-logo" aria-hidden="true">
            <img src={optionLogoSrc} alt="" width={16} height={16} />
          </span>
        ) : null}
        <span className="model-select-searchable__option-copy">
          <span className="model-select-searchable__option-label">
            <span id={optionLabelId}>{option.label}</span>
          </span>
          {costLabel ? (
            <span className="model-select-searchable__option-meta" id={optionCostId}>
              {costLabel}
            </span>
          ) : null}
          {disabledHint && !showUpgradeLock ? (
            <span className="model-select-searchable__option-meta" id={optionDisabledId}>
              {disabledHint}
            </span>
          ) : null}
        </span>
        {showUpgradeLock || tagLabel ? (
          <span className="model-select-searchable__option-affordances">
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
  }

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
                top:
                  popoverStyle.placement === 'below'
                    ? `${popoverStyle.offset}px`
                    : 'auto',
                right: 'auto',
                bottom:
                  popoverStyle.placement === 'above'
                    ? `${popoverStyle.offset}px`
                    : 'auto',
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
              {useTwoLevel ? (
                /* Two-level browse: companies on the left, the hovered/selected
                   company's models on the right. Each model keeps the same
                   cost-tier / capability-tag / upgrade-lock affordances the
                   flat list below renders. */
                <div
                  className="model-select-searchable__body"
                  id={listboxId}
                  role="listbox"
                  style={{
                    maxHeight: `${Math.max(96, popoverStyle.maxHeight - (shouldShowSearch ? 68 : 16))}px`,
                  }}
                >
                  {companyGroups.length === 0 ? (
                    <div className="model-select-searchable__empty">No matching models</div>
                  ) : (
                    <>
                      <div className="model-select-searchable__companies">
                        {companyGroups.map((group) => {
                          const isActive = group.key === activeCompanyKey;
                          const hasSelected = group.options.some((o) => o.id === value);
                          const companyLogoSrc = modelProviderIconSrc(
                            group.options[0]?.id ?? group.key,
                          );
                          return (
                            <button
                              key={group.key}
                              type="button"
                              className={`model-select-searchable__company${isActive ? ' is-active' : ''}${hasSelected ? ' has-selected' : ''}`}
                              data-testid={`model-company-${group.key}`}
                              onMouseEnter={() => setHoverCompany(group.key)}
                              onFocus={() => setHoverCompany(group.key)}
                              onClick={() => setHoverCompany(group.key)}
                            >
                              <span className="model-select-searchable__company-name">
                                {companyLogoSrc ? (
                                  <img
                                    className="model-select-searchable__company-logo"
                                    src={companyLogoSrc}
                                    alt=""
                                    width={16}
                                    height={16}
                                  />
                                ) : null}
                                {group.name}
                              </span>
                              <span className="model-select-searchable__company-count" aria-hidden>{group.options.length}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="model-select-searchable__models" role="group">
                        {(activeCompany?.options ?? []).map((option, index) =>
                          renderModelOption(option, index),
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className="model-select-searchable__list"
                  id={listboxId}
                  role="listbox"
                  style={{
                    maxHeight: `${Math.max(0, popoverStyle.maxHeight - (shouldShowSearch ? 68 : 16))}px`,
                  }}
                >
                  {filteredOptions.map((option, index) => renderModelOption(option, index))}
                  {filteredOptions.length === 0 ? (
                    <div className="model-select-searchable__empty">No matching models</div>
                  ) : null}
                </div>
              )}
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
