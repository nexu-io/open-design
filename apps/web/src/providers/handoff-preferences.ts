// Browser-side bridge for the hand-off menu's remembered picks: the last
// editor launched and the last CLI framework selected. This lives in
// providers/ rather than a feature file because it touches
// `window.localStorage`; the slice reaches both through an injected port so
// its hooks stay DOM-free and unit-testable with a fake.
import type { HostEditorId } from '@open-design/contracts';

const PREFERRED_EDITOR_KEY = 'open-design:preferred-editor';
const PREFERRED_FRAMEWORK_KEY = 'open-design:handoff-framework';

/** Framework ids the picker offers; kept here only to validate a stored value
 * (the slice's `rules.ts`/`constants.ts` own the canonical list). */
const KNOWN_FRAMEWORK_IDS = ['react', 'vue', 'svelte', 'solid', 'next', 'vanilla'] as const;
const DEFAULT_FRAMEWORK_ID = 'react';

export function readPreferredEditor(): HostEditorId | null {
  try {
    const v = window.localStorage.getItem(PREFERRED_EDITOR_KEY);
    return (v as HostEditorId) || null;
  } catch {
    return null;
  }
}

export function writePreferredEditor(id: HostEditorId): void {
  try {
    window.localStorage.setItem(PREFERRED_EDITOR_KEY, id);
  } catch {
    // ignore — quota or sandboxed
  }
}

export function readPreferredFramework(): string {
  if (typeof window === 'undefined') return DEFAULT_FRAMEWORK_ID;
  try {
    const stored = window.localStorage.getItem(PREFERRED_FRAMEWORK_KEY);
    if (stored && (KNOWN_FRAMEWORK_IDS as readonly string[]).includes(stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_FRAMEWORK_ID;
}

export function writePreferredFramework(id: string): void {
  try {
    window.localStorage.setItem(PREFERRED_FRAMEWORK_KEY, id);
  } catch {
    // ignore — quota or sandboxed
  }
}
