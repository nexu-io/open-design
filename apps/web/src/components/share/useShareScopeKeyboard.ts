import { useEffect, useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';

/** Both viewer chromes share focus-only navigation; activation stays with native buttons. */
export function useShareScopeKeyboard({
  open,
  disabled,
  setOpen,
}: {
  open: boolean;
  disabled: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const scopeOptionsRef = useRef<HTMLDivElement>(null);

  // Focus only when the controlled list opens, never on unrelated host renders.
  useEffect(() => {
    if (open) {
      scopeOptionsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')?.focus();
    }
  }, [open]);

  function handleScopeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation(); // Close the nested list, not the surrounding Share panel.
      setOpen(false);
      scopeTriggerRef.current?.focus();
      return;
    }
    if (disabled) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!open) {
      setOpen(true);
      return;
    }
    const options = Array.from(scopeOptionsRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!options.length) return;
    const current = options.findIndex((option) => option === document.activeElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % options.length
      : (current - 1 + options.length) % options.length;
    options[next]?.focus();
  }

  return { scopeTriggerRef, scopeOptionsRef, handleScopeKeyDown };
}
