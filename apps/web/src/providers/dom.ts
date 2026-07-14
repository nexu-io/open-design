// Thin browser-global reads shared across slices. Kept as a provider (not
// inlined in a feature) so `features/**` stays DOM-free per the
// `check-web-slice-boundaries` guard — a slice reaches this only through its
// own port + `dependencies.ts`.

export interface ViewportSize {
  width: number;
  height: number;
}

/** The current viewport size, or a zero-size fallback outside the browser (SSR). */
export function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Reads a localStorage-persisted draft; `null` outside the browser (SSR),
 *  with no key, or when storage throws (privacy modes). */
export function readComposerDraft(key: string | undefined): string | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Persists (or clears, for an empty value) a draft to localStorage; a no-op
 *  outside the browser (SSR), with no key, or when storage throws (privacy
 *  modes) — the composer should still work without persistence. */
export function writeComposerDraft(key: string | undefined, draft: string): void {
  if (!key || typeof window === 'undefined') return;
  try {
    if (draft) {
      window.localStorage.setItem(key, draft);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy modes; the composer should still work.
  }
}

/**
 * Opens the mid-chat design-system picker by finding its trigger button
 * inside `container` and clicking/focusing it — the picker itself owns no
 * open state the composer can call directly, so this drives the trigger's
 * own click handler instead. A no-op when the trigger is missing or
 * disabled (composer-specific selector, so this only makes sense scoped to
 * a `ChatComposer` root).
 */
export function openDesignSystemPickerTrigger(container: HTMLElement | null): void {
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-testid="project-ds-picker-trigger"]',
  );
  if (!trigger || trigger.disabled) return;
  window.requestAnimationFrame(() => {
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    trigger.focus({ preventScroll: true });
  });
}
