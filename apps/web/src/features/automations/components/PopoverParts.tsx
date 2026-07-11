import type { ReactNode } from 'react';

import { Icon } from '../../../components/Icon';

export function PillButton({
  icon,
  label,
  active,
  'aria-label': ariaLabel,
  onClick,
  children,
}: {
  icon: 'folder' | 'history';
  label: ReactNode;
  active?: boolean;
  'aria-label'?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="automation-pill__wrap">
      <button
        type="button"
        className={`automation-pill${active ? ' is-active' : ''}`}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        <Icon name={icon} size={12} />
        <span>{label}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      {children}
    </div>
  );
}

export function PopoverMenu({ children }: { children: ReactNode }) {
  return <div className="automation-popover">{children}</div>;
}

export function PopoverItem({
  selected,
  label,
  hint,
  onClick,
  title,
}: {
  selected?: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  // Native hover tooltip surfaced when the visible label is truncated to
  // ellipsis (e.g. long project names in the picker, #3274). Optional so
  // unchanged call sites with short fixed labels don't grow a noisy
  // duplicate tooltip.
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`automation-popover__item${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      title={title}
    >
      <span className="automation-popover__check">
        {selected ? <Icon name="check" size={12} /> : null}
      </span>
      <span className="automation-popover__body">
        <span className="automation-popover__label">{label}</span>
        {hint ? <span className="automation-popover__hint">{hint}</span> : null}
      </span>
    </button>
  );
}
