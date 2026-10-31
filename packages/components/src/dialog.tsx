import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type FormEventHandler,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { joinClassNames } from './class-names';
import { getModalDialogsInStackOrder, getTopModalDialog, observeModalStack } from './modal-stack';
import styles from './dialog.module.css';

type DialogTag = 'div' | 'form';

type DialogLayout = 'default' | 'sectioned';

export interface DialogProps {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  backdropClassName?: string;
  includeChromeClassName?: boolean;
  id?: string;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Keep background inert and body scrolling locked until this modal closes. */
  inertBackground?: boolean;
  layout?: DialogLayout;
  as?: DialogTag;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  [key: `data-${string}`]: string | number | undefined;
}

type DialogSectionProps = ComponentPropsWithoutRef<'div'>;

type DialogHeadingProps = ComponentPropsWithoutRef<'h2'>;

type DialogDescriptionProps = ComponentPropsWithoutRef<'p'>;

const focusableSelector = 'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]';

// Background ownership is shared between nested dialogs. A pre-existing inert
// attribute belongs to its caller and must never be removed by this primitive.
const inertOwners = new WeakMap<Element, number>();
const scrollOwners = new WeakMap<Document, { count: number; previous: string }>();

function isolateBackground(panel: HTMLElement): () => void {
  const doc = panel.ownerDocument;
  const backdrop = panel.parentElement;
  const owned: Element[] = [];
  const modals = getModalDialogsInStackOrder(doc, { includeInert: true });
  const higherModals = modals.slice(modals.indexOf(panel) + 1);
  for (const sibling of doc.body.children) {
    // All portals for a commit are attached before layout effects. An outer
    // dialog must not inert a child dialog that is already mounted above it.
    if (sibling === backdrop || higherModals.some(modal => sibling.contains(modal))) continue;
    const count = inertOwners.get(sibling);
    if (count !== undefined) {
      inertOwners.set(sibling, count + 1);
    } else {
      if (sibling.hasAttribute('inert')) continue;
      sibling.setAttribute('inert', '');
      inertOwners.set(sibling, 1);
    }
    owned.push(sibling);
  }
  const scrolling = scrollOwners.get(doc);
  if (scrolling) scrolling.count += 1;
  else scrollOwners.set(doc, { count: 1, previous: doc.body.style.overflow });
  doc.body.style.overflow = 'hidden';

  return () => {
    for (const sibling of owned) {
      const count = inertOwners.get(sibling);
      if (count === undefined) continue;
      if (count > 1) inertOwners.set(sibling, count - 1);
      else {
        inertOwners.delete(sibling);
        sibling.removeAttribute('inert');
      }
    }
    const scrolling = scrollOwners.get(doc);
    if (!scrolling) return;
    scrolling.count -= 1;
    if (scrolling.count === 0) {
      scrollOwners.delete(doc);
      if (doc.body.style.overflow === 'hidden') doc.body.style.overflow = scrolling.previous;
    }
  };
}

function isTopDialog(panel: HTMLElement): boolean {
  return getTopModalDialog(panel.ownerDocument) === panel;
}

function isFocusableControl(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.matches(':disabled')
    || element.closest('[hidden], [inert], [aria-hidden="true"]')
    || getComputedStyle(element).visibility === 'hidden') return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).display === 'none') return false;
  }
  return true;
}

export function Dialog({
  children,
  onClose,
  className,
  backdropClassName,
  includeChromeClassName = true,
  id,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = false,
  inertBackground = false,
  layout = 'default',
  as = 'div',
  onSubmit,
  ...dataAttributes
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | HTMLFormElement | null>(null);
  const setPanelRef = useCallback((panel: HTMLDivElement | HTMLFormElement | null) => {
    panelRef.current = panel;
  }, []);
  // A child's autoFocus commits before this layout effect. Retain the opener
  // before that focus change so closing a nested form can return to it.
  const focusBeforeMountRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const doc = panel.ownerDocument;
    const previous = panel.contains(doc.activeElement)
      ? focusBeforeMountRef.current : doc.activeElement;
    const restoreBackground = inertBackground ? isolateBackground(panel) : undefined;
    const focusPanel = () => panel.focus({ preventScroll: true });
    let wasTop = isTopDialog(panel);
    if (wasTop && !panel.contains(doc.activeElement)) focusPanel();
    const stopObserving = observeModalStack(doc, () => {
      const isTop = isTopDialog(panel);
      if (isTop && !wasTop && !panel.contains(doc.activeElement)) focusPanel();
      wasTop = isTop;
    });

    const keepFocusInside = (event: FocusEvent) => {
      if (isTopDialog(panel) && event.target instanceof Node && !panel.contains(event.target)) focusPanel();
    };
    const trapTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Tab' || !isTopDialog(panel)) return;
      const controls = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(isFocusableControl);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        focusPanel();
      } else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === panel)) {
        event.preventDefault();
        first.focus();
      }
    };
    doc.addEventListener('focusin', keepFocusInside);
    doc.addEventListener('keydown', trapTab);
    return () => {
      stopObserving();
      doc.removeEventListener('focusin', keepFocusInside);
      doc.removeEventListener('keydown', trapTab);
      // Release this layer before focusing its opener, which may be in the
      // outer modal. No passive cleanup or scheduled task owns this order.
      restoreBackground?.();
      if (previous instanceof HTMLElement && previous.isConnected
        && (panel.contains(doc.activeElement) || doc.activeElement === doc.body)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [inertBackground]);

  useEffect(() => {
    if (!onClose || !closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape' || !panelRef.current || !isTopDialog(panelRef.current)) return;
      event.preventDefault();
      onClose?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose]);

  const sharedProps = {
    ref: setPanelRef,
    tabIndex: -1,
    id,
    className: joinClassNames(
      styles.focusTarget,
      includeChromeClassName ? styles.dialog : undefined,
      includeChromeClassName && layout === 'sectioned' ? styles.dialogSectioned : undefined,
      includeChromeClassName ? 'modal' : undefined,
      className,
    ),
    onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
    role,
    'aria-modal': 'true' as const,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    ...dataAttributes,
  };

  const overlay = (
    <div
      className={joinClassNames(
        includeChromeClassName ? styles.backdrop : undefined,
        includeChromeClassName ? 'modal-backdrop' : undefined,
        backdropClassName,
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      {as === 'form' ? (
        <form {...sharedProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...sharedProps}>{children}</div>
      )}
    </div>
  );

  // Mounted on <body>, not where the dialog is used: the scrim's z-index only
  // outranks app chrome (tabs row 120, the floating account cluster 150) if it
  // competes in the ROOT stacking context. Rendered in place, any ancestor that
  // opens a stacking context traps it — the scrim then stopped at the content
  // area and that chrome floated over the dialog. React events still bubble
  // through the React tree, so callers see no difference.
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}

export function DialogHeader({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.header, className)} {...props} />;
}

export function DialogBody({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.body, className)} {...props} />;
}

export function DialogFooter({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.footer, className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogHeadingProps) {
  return <h2 className={joinClassNames(styles.title, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return <p className={joinClassNames(styles.description, className)} {...props} />;
}
