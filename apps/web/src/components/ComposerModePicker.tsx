// Composer footer "mode" picker — sits just left of the model selector.
// Three modes (Plan / Design / Ask); the trigger shows a neutral grid+sparkle
// glyph until a mode is chosen, then flips to that mode's icon. The dropdown
// mirrors the "+" menu surface: each row shows its name + an always-visible
// description, and the selected row carries a check.
//
// Ported from #5517 (demo `ComposerModePicker`) but wired to the REAL
// `ChatSessionMode` ('design' | 'chat' | 'plan') instead of the demo's
// app-wide mock store: the component is controlled via `mode`/`onModeChange`,
// so the home composer and the project chat composer each reflect their own
// conversation's persisted mode. `design` is the app default AND it is shown
// as selected by default: the composer opens carrying the 「设计 ×」 pill, so
// the mode the request will actually run in is stated on screen instead of
// being an invisible default behind a neutral glyph. The × still clears it
// back to the neutral trigger.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import type { ChatSessionMode } from '@open-design/contracts';
import { useT } from '../i18n';
import { Icon } from './Icon';

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
} as const;

// Unselected / neutral state.
const ICON_DEFAULT: ReactElement = (
  <svg {...iconProps}>
    <path d="M10.0001 13C10.5523 13 11 13.4478 11.0001 14V20C11.0001 20.5523 10.5524 21 10.0001 21H4.00001C3.44772 21 3 20.5523 3 20V14C3.00011 13.4478 3.44778 13 4.00001 13H10.0001ZM20.0002 13C20.5524 13 21.0001 13.4478 21.0002 14V20C21.0002 20.5523 20.5525 21 20.0002 21H14.0001C13.4478 21 13.0001 20.5523 13.0001 20V14C13.0002 13.4478 13.4479 13 14.0001 13H20.0002ZM5.00002 19H9.00006V15H5.00002V19ZM15.0001 19H19.0002V15H15.0001V19ZM16.5294 3.31933C16.7059 2.89329 17.2944 2.89329 17.4708 3.31933L17.7238 3.93066C18.1558 4.97348 18.9617 5.80619 19.9748 6.25683L20.6926 6.57617C21.1027 6.75908 21.1029 7.35627 20.6926 7.53906L19.9328 7.87695C18.945 8.31627 18.1535 9.11932 17.714 10.1279L17.4669 10.6934C17.2865 11.1075 16.7138 11.1075 16.5333 10.6934L16.2872 10.1279C15.8477 9.11929 15.0553 8.31628 14.0675 7.87695L13.3077 7.53906C12.8975 7.35629 12.8976 6.75906 13.3077 6.57617L14.0255 6.25683C15.0386 5.80619 15.8446 4.9735 16.2765 3.93066L16.5294 3.31933ZM10.0001 3C10.5523 3 11 3.4478 11.0001 4V10C11.0001 10.5523 10.5524 11 10.0001 11H4.00001C3.44772 11 3 10.5523 3 10V4C3.00011 3.4478 3.44778 3 4.00001 3H10.0001ZM5.00002 9H9.00006V5H5.00002V9Z" />
  </svg>
);

const ICON_PLAN: ReactElement = (
  <svg {...iconProps}>
    <path d="M4 6.14286V18.9669L9.06476 16.7963L15.0648 19.7963L20 17.6812V4.85714L21.303 4.2987C21.5569 4.18992 21.8508 4.30749 21.9596 4.56131C21.9862 4.62355 22 4.69056 22 4.75827V19L15 22L9 19L2.69696 21.7013C2.44314 21.8101 2.14921 21.6925 2.04043 21.4387C2.01375 21.3765 2 21.3094 2 21.2417V7L4 6.14286ZM16.2426 11.2426L12 15.4853L7.75736 11.2426C5.41421 8.89949 5.41421 5.10051 7.75736 2.75736C10.1005 0.414214 13.8995 0.414214 16.2426 2.75736C18.5858 5.10051 18.5858 8.89949 16.2426 11.2426ZM12 12.6569L14.8284 9.82843C16.3905 8.26633 16.3905 5.73367 14.8284 4.17157C13.2663 2.60948 10.7337 2.60948 9.17157 4.17157C7.60948 5.73367 7.60948 8.26633 9.17157 9.82843L12 12.6569Z" />
  </svg>
);

const ICON_DESIGN: ReactElement = (
  <svg {...iconProps}>
    <path d="M4.7134 7.12811L4.46682 7.69379C4.28637 8.10792 3.71357 8.10792 3.53312 7.69379L3.28656 7.12811C2.84706 6.11947 2.05545 5.31641 1.06767 4.87708L0.308047 4.53922C-0.102682 4.35653 -0.102682 3.75881 0.308047 3.57612L1.0252 3.25714C2.03838 2.80651 2.84417 1.97373 3.27612 0.930828L3.52932 0.319534C3.70578 -0.106511 4.29417 -0.106511 4.47063 0.319534L4.72382 0.930828C5.15577 1.97373 5.96158 2.80651 6.9748 3.25714L7.69188 3.57612C8.10271 3.75881 8.10271 4.35653 7.69188 4.53922L6.93228 4.87708C5.94451 5.31641 5.15288 6.11947 4.7134 7.12811ZM15.3144 9.53285L15.4565 9.67491C16.7513 11.018 17.3306 12.9868 16.8126 14.9201C16.1644 17.3393 13.9702 18.9984 11.5016 18.9984C9.46572 18.9984 6.78847 18.3726 4.5286 17.4841C5.73449 16.0696 6.17423 14.675 6.3285 12.805C6.36574 12.3536 6.38901 12.1741 6.43185 12.0142C7.22541 9.05261 10.0168 7.40515 12.9235 8.18399C13.8549 8.43357 14.6661 8.90783 15.3144 9.53285ZM18.2278 2.3713L13.2886 6.21289C9.34224 5.23923 5.55843 7.54646 4.5 11.4966C4.39826 11.8763 4.36647 12.262 4.33317 12.666C4.21829 14.0599 4.08554 15.6707 1 17.9966C3.5 19.4966 8 20.9984 11.5016 20.9984C14.8142 20.9984 17.8463 18.7896 18.7444 15.4377C19.0836 14.1719 19.0778 12.895 18.7847 11.7067L22.6253 6.76879C22.9349 6.3707 22.8997 5.80435 22.543 5.44774L19.5488 2.45355C19.1922 2.09694 18.6259 2.06168 18.2278 2.3713ZM16.8952 8.2852C16.8319 8.21952 16.7673 8.15494 16.7015 8.09149L15.5769 6.96685L18.7589 4.49198L20.5046 6.23774L18.0297 9.41972L16.8952 8.2852Z" />
  </svg>
);

const ICON_ASK: ReactElement = (
  <svg {...iconProps}>
    <path d="M14 4.99997H4V17H10.5908L12 19.0117L13.4092 17H20V11H22V18C22 18.5445 21.5445 19 21 19H14.4502L12 22.5L9.5498 19H3C2.45547 19 2 18.5445 2 18V3.99997C2.00002 3.45544 2.45546 2.99996 3 2.99996H14V4.99997ZM19.5293 1.3193C19.7058 0.893513 20.2942 0.8935 20.4707 1.3193L20.7236 1.93063C21.1555 2.97343 21.9615 3.80614 22.9746 4.2568L23.6914 4.57614C24.1022 4.75882 24.1022 5.35635 23.6914 5.53903L22.9326 5.87692C21.945 6.3162 21.1534 7.11943 20.7139 8.1279L20.4668 8.69333C20.2863 9.10747 19.7136 9.10747 19.5332 8.69333L19.2861 8.1279C18.8466 7.11942 18.0551 6.3162 17.0674 5.87692L16.3076 5.53903C15.8974 5.35618 15.8974 4.75895 16.3076 4.57614L17.0254 4.2568C18.0384 3.80614 18.8445 2.97343 19.2764 1.93063L19.5293 1.3193Z" />
  </svg>
);

type ModeCopyKey =
  | 'chat.mode.plan.label'
  | 'chat.mode.plan.summary'
  | 'chat.mode.design.label'
  | 'chat.mode.design.summary'
  | 'chat.mode.chat.label'
  | 'chat.mode.chat.summary';

interface ModeDef {
  id: ChatSessionMode;
  nameKey: ModeCopyKey;
  descKey: ModeCopyKey;
  icon: ReactElement;
}

// Menu order mirrors #5517: 规划 / 设计 / 提问. The demo's `ask` id is the real
// `chat` session mode.
const MODES: ModeDef[] = [
  {
    id: 'plan',
    nameKey: 'chat.mode.plan.label',
    descKey: 'chat.mode.plan.summary',
    icon: ICON_PLAN,
  },
  {
    id: 'design',
    nameKey: 'chat.mode.design.label',
    descKey: 'chat.mode.design.summary',
    icon: ICON_DESIGN,
  },
  {
    id: 'chat',
    nameKey: 'chat.mode.chat.label',
    descKey: 'chat.mode.chat.summary',
    icon: ICON_ASK,
  },
];

const MENU_WIDTH = 300;
const MENU_MARGIN = 12;
const MENU_GAP = 8;
// Natural height of the 3-mode list; used to decide whether the menu fits
// below the trigger before flipping it above.
const MENU_EST_HEIGHT = 290;

export interface ComposerModePickerProps {
  /** The conversation's real session mode. `design` (the app default) renders
   *  as a SELECTED pill from first paint; clearing it with the × returns the
   *  trigger to neutral without changing the session mode. */
  mode: ChatSessionMode;
  onModeChange?: (mode: ChatSessionMode) => void;
  /** Collapse the selected pill to icon + clear only (hide the mode name) —
   *  used when the composer row is space-constrained, e.g. while a run streams
   *  and the wide "思考中" button is showing. */
  labelHidden?: boolean;
}

export function ComposerModePicker({ mode, onModeChange, labelHidden = false }: ComposerModePickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // 设计 is the default mode AND the default selection, so the pill is showing
  // when the composer first paints. This is INITIAL state only — the user's own
  // choice (picking another mode, or clearing with ×) flips it and is never
  // re-forced on a later render, which is why it is `useState`'s initial value
  // and not an effect that resyncs on `mode`.
  const [designExplicit, setDesignExplicit] = useState(true);
  const selected: ChatSessionMode | null =
    mode !== 'design' ? mode : designExplicit ? 'design' : null;
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Auto-flip: open BELOW the trigger when there's room (home composer sits
  // mid-screen with space beneath it), and flip ABOVE when there isn't (the
  // project chat composer is docked at the viewport bottom). maxHeight caps the
  // menu to the room on whichever side so it scrolls internally rather than
  // getting squashed off-screen. `left` is clamped against both viewport edges
  // (same fix family as SessionModeToggle's #100 popoverShift), so the 300px
  // menu never runs past the right screen edge in a narrow window.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const vh = window.innerHeight || document.documentElement.clientHeight || 768;
      const width = Math.min(MENU_WIDTH, Math.max(0, vw - MENU_MARGIN * 2));
      const left = Math.min(
        Math.max(MENU_MARGIN, rect.left),
        Math.max(MENU_MARGIN, vw - MENU_MARGIN - width),
      );
      const spaceBelow = vh - rect.bottom - MENU_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - MENU_MARGIN;
      const openDown = spaceBelow >= MENU_EST_HEIGHT || spaceBelow >= spaceAbove;
      if (openDown) {
        const top = rect.bottom + MENU_GAP;
        setPos({ left, top, width, maxHeight: Math.max(0, vh - top - MENU_MARGIN) });
      } else {
        const bottom = Math.max(MENU_MARGIN, vh - rect.top + MENU_GAP);
        setPos({ left, bottom, width, maxHeight: Math.max(0, spaceAbove) });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeMode = selected ? MODES.find((m) => m.id === selected) ?? null : null;
  const triggerIcon = activeMode ? activeMode.icon : ICON_DEFAULT;
  const activeName = activeMode ? t(activeMode.nameKey) : null;

  return (
    <div className={`composer-mode${activeMode ? ' is-selected' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`composer-mode__trigger${open ? ' is-open' : ''}${selected ? ' is-selected' : ''}`}
        data-testid="composer-mode-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={activeName ? t('chat.modePicker.current', { name: activeName }) : t('chat.modePicker.choose')}
        title={activeName ?? t('chat.modePicker.mode')}
      >
        <span className="composer-mode__icon" aria-hidden>{triggerIcon}</span>
        {activeName && !labelHidden ? (
          <span className="composer-mode__label">{activeName}</span>
        ) : null}
      </button>
      {activeMode ? (
        <button
          type="button"
          className="composer-mode__clear"
          data-testid="composer-mode-clear"
          aria-label={t('chat.modePicker.clear')}
          title={t('common.clear')}
          onClick={() => {
            setDesignExplicit(false);
            // Clearing returns to the app default (design without the pill).
            if (mode !== 'design') onModeChange?.('design');
          }}
        >
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="composer-mode-menu"
              role="menu"
              style={pos ?? undefined}
              data-testid="composer-mode-menu"
            >
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected === m.id}
                  className={`composer-mode-menu__item${selected === m.id ? ' is-selected' : ''}`}
                  data-testid={`composer-mode-menu-${m.id}`}
                  onClick={() => {
                    setDesignExplicit(m.id === 'design');
                    if (m.id !== mode) onModeChange?.(m.id);
                    setOpen(false);
                  }}
                >
                  <span className="composer-mode-menu__head">
                    <span className="composer-mode-menu__icon" aria-hidden>{m.icon}</span>
                    <span className="composer-mode-menu__name">{t(m.nameKey)}</span>
                    {selected === m.id ? (
                      <span className="composer-mode-menu__check" aria-hidden>
                        <Icon name="check" size={16} />
                      </span>
                    ) : null}
                  </span>
                  <span className="composer-mode-menu__desc">{t(m.descKey)}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
