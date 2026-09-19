import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectGroup {
  label: string;
  options: CustomSelectOption[];
}

export type CustomSelectItem = CustomSelectOption | CustomSelectGroup;

interface Props {
  value: string;
  options: CustomSelectItem[];
  onChange: (value: string) => void;
  ariaLabel: string;
  labelledBy?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  menuMinWidth?: number;
  disabled?: boolean;
  placeholder?: string;
  portal?: boolean;
  title?: string;
  onFocus?: () => void;
}

interface FlatOption extends CustomSelectOption {
  group?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function isGroup(item: CustomSelectItem): item is CustomSelectGroup {
  return 'options' in item;
}

function flattenOptions(items: CustomSelectItem[]): FlatOption[] {
  return items.flatMap((item) =>
    isGroup(item)
      ? item.options.map((option) => ({ ...option, group: item.label }))
      : [item],
  );
}

export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  className,
  triggerClassName,
  menuClassName,
  menuMinWidth = 0,
  disabled = false,
  placeholder,
  portal = true,
  title,
  onFocus,
}: Props) {
  const reactId = useId();
  const idBase = reactId.replace(/:/g, '');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const activeSourceValueRef = useRef(value);
  const keyboardActiveRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const flatOptions = useMemo(() => flattenOptions(options), [options]);
  const selected = flatOptions.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder ?? value;
  const enabledOptions = useMemo(
    () => flatOptions.filter((option) => !option.disabled),
    [flatOptions],
  );
  const flatOptionsRef = useRef(flatOptions);
  const enabledOptionsRef = useRef(enabledOptions);
  flatOptionsRef.current = flatOptions;
  enabledOptionsRef.current = enabledOptions;
  const optionIdByValue = useMemo(
    () => new Map(flatOptions.map((option, index) => [option.value, `${idBase}-option-${index}`])),
    [flatOptions, idBase],
  );
  const activeOptionId = open && activeValue ? optionIdByValue.get(activeValue) : undefined;

  const scrollOptionIntoMenuView = useCallback((optionId: string | undefined) => {
    const menu = menuRef.current;
    const option = optionId ? document.getElementById(optionId) : null;
    if (!menu || !option || !menu.contains(option)) return;
    const menuBounds = menu.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    const visibleTop = menuBounds.top + menu.clientTop;
    const visibleBottom = visibleTop + menu.clientHeight;
    // Update this scroll container alone; scrollIntoView may also move the
    // workspace behind a portaled menu.
    if (optionBounds.top < visibleTop) {
      menu.scrollTop += optionBounds.top - visibleTop;
    } else if (optionBounds.bottom > visibleBottom) {
      menu.scrollTop += optionBounds.bottom - visibleBottom;
    }
  }, []);

  useLayoutEffect(() => {
    if (open && keyboardActiveRef.current) scrollOptionIntoMenuView(activeOptionId);
    // A portal mounts after its first position measurement, so retry then.
  }, [open, activeOptionId, position, scrollOptionIntoMenuView]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 4;
    const viewportPad = 12;
    const menuWidth = Math.min(Math.max(rect.width, menuMinWidth), window.innerWidth - viewportPad * 2);
    const below = window.innerHeight - rect.bottom - viewportPad;
    const above = rect.top - viewportPad;
    const maxHeight = Math.max(160, Math.min(300, Math.max(below, above) - gap));
    const openAbove = below < 180 && above > below;
    setPosition({
      top: openAbove ? Math.max(viewportPad, rect.top - maxHeight - gap) : rect.bottom + gap,
      left: Math.min(
        Math.max(viewportPad, rect.left),
        Math.max(viewportPad, window.innerWidth - menuWidth - viewportPad),
      ),
      width: menuWidth,
      maxHeight,
    });
  }, [menuMinWidth]);

  useEffect(() => {
    if (!portal) return;
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, portal, updatePosition]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      activeSourceValueRef.current = value;
      return;
    }
    if (wasOpenRef.current && activeSourceValueRef.current === value) return;
    const selectedOption = flatOptionsRef.current.find((option) => option.value === value && !option.disabled);
    keyboardActiveRef.current = true;
    setActiveValue(selectedOption?.value ?? enabledOptionsRef.current[0]?.value ?? '');
    wasOpenRef.current = true;
    activeSourceValueRef.current = value;
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => {
      if (portal) updatePosition();
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, portal]);

  const choose = (nextValue: string) => {
    const next = flatOptions.find((option) => option.value === nextValue);
    if (!next || next.disabled) return;
    onChange(next.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    const nextValue = enabledOptions[nextIndex]!.value;
    setActiveValue(nextValue);
    if (nextValue === activeValue) scrollOptionIntoMenuView(optionIdByValue.get(nextValue));
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      keyboardActiveRef.current = true;
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      keyboardActiveRef.current = true;
      const next = event.key === 'Home' ? enabledOptions[0] : enabledOptions[enabledOptions.length - 1];
      if (next) {
        setActiveValue(next.value);
        if (next.value === activeValue) scrollOptionIntoMenuView(optionIdByValue.get(next.value));
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      keyboardActiveRef.current = true;
      if (open) {
        choose(activeValue || value);
      } else {
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Tab' && open) {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const onPointerActive = (nextValue: string) => {
    keyboardActiveRef.current = false;
    setActiveValue(nextValue);
  };

  const menu = (
    <div
      ref={menuRef}
      id={`${idBase}-menu`}
      className={[
        'od-select-menu',
        portal ? 'portal' : 'inline',
        menuClassName,
      ].filter(Boolean).join(' ')}
      role="listbox"
      aria-label={ariaLabel}
      style={
        portal && position
          ? {
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }
          : undefined
      }
    >
      {options.map((item) => {
        if (isGroup(item)) {
          return (
            <div className="od-select-group" key={`group:${item.label}`}>
              <div className="od-select-group-label">{item.label}</div>
              {item.options.map((option) => (
                <SelectOptionButton
                  key={option.value}
                  option={option}
                  selected={option.value === value}
                  active={option.value === activeValue}
                  id={optionIdByValue.get(option.value)}
                  onChoose={choose}
                  onActive={onPointerActive}
                />
              ))}
            </div>
          );
        }
        return (
          <SelectOptionButton
            key={item.value}
            option={item}
            selected={item.value === value}
            active={item.value === activeValue}
            id={optionIdByValue.get(item.value)}
            onChoose={choose}
            onActive={onPointerActive}
          />
        );
      })}
    </div>
  );

  return (
    <div className={['od-select', className].filter(Boolean).join(' ')}>
      <button
        ref={buttonRef}
        type="button"
        className={['od-select-trigger', triggerClassName].filter(Boolean).join(' ')}
        role="combobox"
        value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${idBase}-menu`}
        aria-activedescendant={activeOptionId}
        aria-describedby={labelledBy}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        disabled={disabled}
        title={title}
        onClick={() => {
          keyboardActiveRef.current = true;
          setOpen((current) => !current);
        }}
        onKeyDown={onButtonKeyDown}
        onFocus={onFocus}
      >
        <span id={`${idBase}-value`} className="od-select-value">
          {selectedLabel}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (portal ? (position ? createPortal(menu, document.body) : null) : menu) : null}
    </div>
  );
}

function SelectOptionButton({
  option,
  selected,
  active,
  id,
  onChoose,
  onActive,
}: {
  option: CustomSelectOption;
  selected: boolean;
  active: boolean;
  id?: string;
  onChoose: (value: string) => void;
  onActive: (value: string) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      className={[
        'od-select-option',
        selected ? 'selected' : '',
        active ? 'active' : '',
      ].filter(Boolean).join(' ')}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      disabled={option.disabled}
      onMouseEnter={() => onActive(option.value)}
      onClick={() => onChoose(option.value)}
    >
      <span className="od-select-option-label">{option.label}</span>
      <span className="od-select-option-check" aria-hidden>
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}
