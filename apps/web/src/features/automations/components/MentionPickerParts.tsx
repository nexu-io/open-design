import type { ReactNode } from 'react';

import { Icon, type IconName } from '../../../components/Icon';

export function MentionSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="automation-mention-section">
      <div className="automation-mention-section__label">{label}</div>
      <div className="automation-mention-section__items">{children}</div>
    </div>
  );
}

export function MentionItem({
  icon,
  label,
  meta,
  selected,
  onPick,
}: {
  icon: IconName;
  label: string;
  meta: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`automation-mention-item${selected ? ' is-selected' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      <span className="automation-mention-item__icon">
        {selected ? <Icon name="check" size={11} /> : <Icon name={icon} size={11} />}
      </span>
      <span className="automation-mention-item__body">
        <span className="automation-mention-item__title">{label}</span>
        <span className="automation-mention-item__meta">{meta}</span>
      </span>
    </button>
  );
}
