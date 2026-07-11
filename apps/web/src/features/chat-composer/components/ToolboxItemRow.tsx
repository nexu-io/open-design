import { useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/Icon';

// A single toolbox row, styled like the Connectors/Plugins submenu rows
// (single line: icon + name). Clicking applies the entry; hovering shows a
// third-level detail panel (title / description / @skill / badge). The detail
// panel is PORTALED to <body> because the parent flyout uses `overflow-y: auto`
// (height-capped scroll) which would otherwise clip a nested panel.
// The hover detail panel is owned by the PARENT
// (DesignToolboxPanel) as ONE shared panel — not per-row — so sweeping across
// rows swaps the single panel in place instead of stacking several portaled
// panels that briefly coexist (the close delay would otherwise leave 2-4 of
// them on screen at once, reading as ghosting). The row just reports hover
// enter/leave with its rect + detail node.
export function ToolboxItemRow({
  icon,
  name,
  active,
  detailKey,
  detail,
  onHover,
  onLeave,
  onPick,
}: {
  icon: IconName;
  name: string;
  active?: boolean;
  detailKey: string;
  detail: ReactNode;
  onHover: (key: string, rect: DOMRect, detail: ReactNode) => void;
  onLeave: (key: string) => void;
  onPick: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rowRef}
      className="plus-menu__subitem"
      onMouseEnter={() => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) onHover(detailKey, r, detail);
      }}
      onMouseLeave={() => onLeave(detailKey)}
    >
      <button
        type="button"
        role="menuitem"
        className={`plus-menu__item${active ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <Icon name={icon} size={14} className="plus-menu__item-icon" />
        <span>{name}</span>
      </button>
    </div>
  );
}
