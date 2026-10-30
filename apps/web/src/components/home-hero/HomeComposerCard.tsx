import type {
  CSSProperties,
  DragEventHandler,
  FocusEventHandler,
  ReactNode,
} from 'react';

/** The Home composer surface, shared by its full and docked presentations. */
export function HomeComposerCard({
  docked,
  collapsed,
  focusEditor,
  onExpanded,
  onFocusedChange,
  children,
}: {
  docked: boolean;
  collapsed: boolean;
  focusEditor: () => void;
  onExpanded: () => void;
  onFocusedChange: (focused: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      className="home-hero__composer-card"
      data-testid="home-hero-composer-card"
      data-collapsed={docked && collapsed ? 'true' : undefined}
      onPointerDownCapture={docked ? (event) => {
        // A click on the folded bar opens it. Interactive descendants keep
        // their own action; inert space places the caret in the editor.
        onExpanded();
        const target = event.target;
        if (target instanceof Element && target.closest(
          'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
        )) return;
        focusEditor();
      } : undefined}
      onFocus={() => {
        onFocusedChange(true);
        onExpanded();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onFocusedChange(false);
      }}
    >
      {children}
    </div>
  );
}

/** The input and controls keep the same DOM surface in both composer states. */
export function HomeComposerInputCard({
  compactAuthoring,
  dragActive,
  style,
  onFocus,
  onBlur,
  onDragActiveChange,
  onDrop,
  children,
}: {
  compactAuthoring: boolean;
  dragActive: boolean;
  style?: CSSProperties;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onDragActiveChange: (active: boolean) => void;
  onDrop: DragEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      className={`home-hero__input-card${compactAuthoring ? ' home-hero__input-card--compact-authoring' : ''}${dragActive ? ' is-drag-active' : ''}`}
      style={style}
      onFocus={onFocus}
      onBlur={onBlur}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) onDragActiveChange(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        onDragActiveChange(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        onDragActiveChange(false);
      }}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
