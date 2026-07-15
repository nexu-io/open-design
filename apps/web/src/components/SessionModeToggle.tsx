import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ChatSessionMode } from '@open-design/contracts';
import { useT } from '../i18n';
import { Icon } from './Icon';

interface Props {
  mode: ChatSessionMode;
  onChange?: (mode: ChatSessionMode) => void;
  disabled?: boolean;
}

type CostLevel = 'low' | 'medium' | 'high';

// Filled segments in the usage meter, per tier (out of 3).
const COST_FILLED: Record<CostLevel, number> = { low: 1, medium: 2, high: 3 };

const MODE_META: Array<{
  mode: ChatSessionMode;
  icon: 'comment' | 'file' | 'sparkles';
  cost: CostLevel;
  labelKey: ModeCopyKey;
  titleKey: ModeCopyKey;
  summaryKey: ModeCopyKey;
  solvesKey: ModeCopyKey;
  costKey: ModeCopyKey;
  costNoteKey: ModeCopyKey;
  queryKeys: [ModeCopyKey, ModeCopyKey, ModeCopyKey];
}> = [
  {
    mode: 'chat',
    icon: 'comment',
    cost: 'low',
    labelKey: 'chat.mode.chat.label',
    titleKey: 'chat.mode.chat.title',
    summaryKey: 'chat.mode.chat.summary',
    solvesKey: 'chat.mode.chat.solves',
    costKey: 'chat.mode.chat.cost',
    costNoteKey: 'chat.mode.chat.costNote',
    queryKeys: ['chat.mode.chat.query1', 'chat.mode.chat.query2', 'chat.mode.chat.query3'],
  },
  {
    mode: 'plan',
    icon: 'file',
    cost: 'medium',
    labelKey: 'chat.mode.plan.label',
    titleKey: 'chat.mode.plan.title',
    summaryKey: 'chat.mode.plan.summary',
    solvesKey: 'chat.mode.plan.solves',
    costKey: 'chat.mode.plan.cost',
    costNoteKey: 'chat.mode.plan.costNote',
    queryKeys: ['chat.mode.plan.query1', 'chat.mode.plan.query2', 'chat.mode.plan.query3'],
  },
  {
    mode: 'design',
    icon: 'sparkles',
    cost: 'high',
    labelKey: 'chat.mode.design.label',
    titleKey: 'chat.mode.design.title',
    summaryKey: 'chat.mode.design.summary',
    solvesKey: 'chat.mode.design.solves',
    costKey: 'chat.mode.design.cost',
    costNoteKey: 'chat.mode.design.costNote',
    queryKeys: ['chat.mode.design.query1', 'chat.mode.design.query2', 'chat.mode.design.query3'],
  },
];

type ModeCopyKey =
  | 'chat.mode.chat.label'
  | 'chat.mode.chat.title'
  | 'chat.mode.chat.summary'
  | 'chat.mode.chat.solves'
  | 'chat.mode.chat.cost'
  | 'chat.mode.chat.costNote'
  | 'chat.mode.chat.query1'
  | 'chat.mode.chat.query2'
  | 'chat.mode.chat.query3'
  | 'chat.mode.plan.label'
  | 'chat.mode.plan.title'
  | 'chat.mode.plan.summary'
  | 'chat.mode.plan.solves'
  | 'chat.mode.plan.cost'
  | 'chat.mode.plan.costNote'
  | 'chat.mode.plan.query1'
  | 'chat.mode.plan.query2'
  | 'chat.mode.plan.query3'
  | 'chat.mode.design.label'
  | 'chat.mode.design.title'
  | 'chat.mode.design.summary'
  | 'chat.mode.design.solves'
  | 'chat.mode.design.cost'
  | 'chat.mode.design.costNote'
  | 'chat.mode.design.query1'
  | 'chat.mode.design.query2'
  | 'chat.mode.design.query3';

interface ModeView {
  mode: ChatSessionMode;
  icon: 'comment' | 'file' | 'sparkles';
  cost: CostLevel;
  label: string;
  title: string;
  summary: string;
  solves: string;
  costLabel: string;
  costNote: string;
  queries: string[];
}

// Signal-bar style usage meter: how much a run in this mode typically costs,
// so the user has an expectation before switching. `aria-hidden` because the
// adjacent text label already carries the meaning.
function ModeCostTag({
  cost,
  label,
  variant,
  ariaLabel,
}: {
  cost: CostLevel;
  label: string;
  variant: 'menu' | 'card';
  ariaLabel?: string;
}) {
  const filled = COST_FILLED[cost];
  return (
    <span
      className={`session-mode-cost session-mode-cost--${cost} session-mode-cost--${variant}`}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <span className="session-mode-cost__meter" aria-hidden={ariaLabel ? undefined : true}>
        {[0, 1, 2].map((index) => (
          <span key={index} className={`session-mode-cost__bar${index < filled ? ' is-on' : ''}`} />
        ))}
      </span>
      <span className="session-mode-cost__label">{label}</span>
    </span>
  );
}

function ModeDescriptionCard({
  item,
  bestForLabel,
  tryLabel,
  costLabel,
  className,
  id,
  role,
  maxHeight,
}: {
  item: ModeView;
  bestForLabel: string;
  tryLabel: string;
  costLabel: string;
  className: string;
  id?: string;
  role?: 'tooltip';
  maxHeight?: number | null;
}) {
  return (
    <div
      className={`session-mode-card ${className}`}
      id={id}
      role={role}
      style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      <div className="session-mode-card__head">
        <span className="session-mode-card__icon" aria-hidden>
          <Icon name={item.icon} size={14} />
        </span>
        <div className="session-mode-card__heading">
          <div className="session-mode-card__title">{item.title}</div>
          <div className="session-mode-card__label">{item.label}</div>
        </div>
        <ModeCostTag
          cost={item.cost}
          label={item.costLabel}
          variant="card"
          ariaLabel={`${costLabel}: ${item.costLabel}`}
        />
      </div>
      <p className="session-mode-card__summary">{item.summary}</p>
      <div className="session-mode-card__section">
        <div className="session-mode-card__section-label">{costLabel}</div>
        <p className="session-mode-card__section-text">{item.costNote}</p>
      </div>
      <div className="session-mode-card__section">
        <div className="session-mode-card__section-label">{bestForLabel}</div>
        <p className="session-mode-card__section-text">{item.solves}</p>
      </div>
      <div className="session-mode-card__section">
        <div className="session-mode-card__section-label">{tryLabel}</div>
        <ul className="session-mode-card__queries">
          {item.queries.map((query) => (
            <li key={query} className="session-mode-card__query">
              {query}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SessionModeToggle({ mode, onChange, disabled = false }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<ChatSessionMode | null>(null);
  const [cardMaxHeight, setCardMaxHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardId = useId();
  const modes = MODE_META.map<ModeView>((item) => ({
    mode: item.mode,
    icon: item.icon,
    cost: item.cost,
    label: t(item.labelKey),
    title: t(item.titleKey),
    summary: t(item.summaryKey),
    solves: t(item.solvesKey),
    costLabel: t(item.costKey),
    costNote: t(item.costNoteKey),
    queries: item.queryKeys.map((queryKey) => t(queryKey)),
  }));
  const active = modes.find((item) => item.mode === mode) ?? modes.find((item) => item.mode === 'design') ?? modes[0]!;
  const preview = modes.find((item) => item.mode === (previewMode ?? mode)) ?? active;
  const disabledState = disabled || !onChange;
  const showCard = open && !disabledState;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPreviewMode(null);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, open]);

  // The popover opens upward (CSS bottom: 100% + 6px). A tall description card
  // would otherwise run up under the project tab bar / off the top of the
  // screen, so cap its height to the space above the trigger while reserving a
  // clearance band at the top of the viewport (tab bar + breathing room).
  useLayoutEffect(() => {
    if (!showCard) {
      setCardMaxHeight(null);
      return;
    }
    const POPOVER_GAP = 6; // matches CSS bottom: calc(100% + 6px)
    const TOP_CLEARANCE = 80; // keep the card below the top tab bar
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const topSpace = Math.floor(root.getBoundingClientRect().top - POPOVER_GAP - TOP_CLEARANCE);
      setCardMaxHeight(Math.max(200, Math.min(360, topSpace)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showCard]);

  return (
    <div
      className="session-mode-toggle"
      ref={rootRef}
      onPointerLeave={() => {
        if (!open) setPreviewMode(null);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) return;
        if (!open) setPreviewMode(null);
      }}
    >
      <button
        type="button"
        className={`session-mode-toggle__trigger od-tooltip${open ? ' is-open' : ''}`}
        disabled={disabledState}
        aria-label={active.title}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active.title}
        data-tooltip={active.title}
        data-testid="session-mode-trigger"
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          setOpen(true);
          setPreviewMode(mode);
        }}
      >
        <Icon name={active.icon} size={13} />
        <span className="session-mode-toggle__label">{active.label}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open ? (
        <div className="session-mode-toggle__popover">
          <div className="session-mode-toggle__menu" role="menu">
            <div className="session-mode-toggle__options">
              {modes.map((item) => {
                const itemActive = item.mode === mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={itemActive}
                    className={`session-mode-toggle__option${itemActive ? ' is-active' : ''}`}
                    aria-label={item.title}
                    onPointerEnter={() => {
                      setPreviewMode(item.mode);
                    }}
                    onFocus={() => {
                      setPreviewMode(item.mode);
                    }}
                    onClick={() => {
                      if (!itemActive) onChange?.(item.mode);
                      closeMenu();
                    }}
                  >
                    <Icon name={item.icon} size={13} />
                    <span className="session-mode-toggle__label">{item.label}</span>
                    <ModeCostTag cost={item.cost} label={item.costLabel} variant="menu" />
                    <span className="session-mode-toggle__check" aria-hidden>
                      {itemActive ? <Icon name="check" size={13} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {showCard ? (
            <ModeDescriptionCard
              item={preview}
              bestForLabel={t('chat.mode.cardBestFor')}
              tryLabel={t('chat.mode.cardTry')}
              costLabel={t('chat.mode.cardCost')}
              className="session-mode-toggle__popover-card"
              id={cardId}
              role="tooltip"
              maxHeight={cardMaxHeight}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
